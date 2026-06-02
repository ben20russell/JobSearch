import OpenAI, { AzureOpenAI } from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { withRetry } from './retry.js';

const ContactSchema = z.object({
  contact_name: z.string().min(1),
  contact_title: z.string().min(1),
  contact_seniority: z.string().default(''),
  contact_email: z.string().email(),
  linkedin_url: z.string().optional().default(''),
});

const CompanySchema = z.object({
  agency_name: z.string().min(1),
  company_domain: z.string().min(1),
  employee_count: z.number().int().nonnegative(),
  company_city: z.string().default(''),
  company_state: z.string().default(''),
  contacts: z.array(ContactSchema).max(8),
});

const LeadSearchSchema = z.object({
  companies: z.array(CompanySchema),
});

export class AzureOpenAILeadClient {
  constructor({
    apiKey,
    endpoint,
    apiVersion,
    deployment,
    client,
  }) {
    if (!apiKey) throw new Error('Missing AZURE_OPENAI_API_KEY');
    if (!deployment) throw new Error('Missing AZURE_OPENAI_DEPLOYMENT_NAME');

    const endpointConfig = normalizeAndValidateAzureEndpoint(endpoint);
    if (!apiVersion) throw new Error('Missing AZURE_OPENAI_API_VERSION');
    this.deployment = deployment;

    if (client) {
      this.client = client;
    } else if (endpointConfig.kind === 'resource') {
      this.client = new AzureOpenAI({
        apiKey,
        endpoint: endpointConfig.endpoint,
        apiVersion,
      });
    } else {
      this.client = new OpenAI({
        apiKey,
        baseURL: endpointConfig.endpoint,
        defaultQuery: {
          'api-version': apiVersion,
        },
        defaultHeaders: {
          'api-key': apiKey,
        },
      });
    }

    console.log('[azure-openai] client initialized', {
      endpoint: endpointConfig.endpoint,
      endpointKind: endpointConfig.kind,
      apiVersion,
      deployment,
    });
  }

  async findMarketingAgencyLeads({ modelNotes = '' } = {}) {
    return withRetry(
      async () => {
        console.log('[azure-openai] requesting structured lead output', {
          hasModelNotes: Boolean(modelNotes),
        });

        const response = await this.client.responses.parse({
          model: this.deployment,
          input: buildPrompt({ modelNotes }),
          text: {
            format: zodResponseFormat(LeadSearchSchema, 'lead_search_output'),
          },
        });

        const parsed = response?.output_parsed;
        const companies = parsed?.companies || [];

        console.log('[azure-openai] received structured lead output', {
          companies: companies.length,
        });

        return companies;
      },
      { label: 'azure-openai:lead-search' }
    );
  }
}

export function normalizeAndValidateAzureEndpoint(rawEndpoint) {
  if (!rawEndpoint) {
    throw new Error('Missing AZURE_OPENAI_ENDPOINT');
  }

  let parsed;
  try {
    parsed = new URL(rawEndpoint);
  } catch {
    throw new Error('AZURE_OPENAI_ENDPOINT must be a valid URL.');
  }

  const hostname = parsed.hostname.toLowerCase();
  const pathname = parsed.pathname || '/';

  if (hostname.endsWith('.services.ai.azure.com')) {
    const normalizedPath = pathname.replace(/\/+$/, '');
    if (!/\/api\/projects\/[^/]+\/openai\/v1$/i.test(normalizedPath)) {
      throw new Error(
        'AZURE_OPENAI_ENDPOINT for services.ai.azure.com must end with /api/projects/<project>/openai/v1'
      );
    }
    return {
      kind: 'foundry_project',
      endpoint: `${parsed.origin}${normalizedPath}/`,
    };
  }

  const allowedHost =
    hostname.endsWith('.openai.azure.com') || hostname.endsWith('.cognitiveservices.azure.com');
  if (!allowedHost) {
    throw new Error(
      'AZURE_OPENAI_ENDPOINT must be an Azure OpenAI resource base URL ending in .openai.azure.com or .cognitiveservices.azure.com.'
    );
  }

  if (pathname !== '/' && pathname !== '') {
    throw new Error(
      'AZURE_OPENAI_ENDPOINT must be the base resource URL only (no path). Example: https://<resource>.openai.azure.com/'
    );
  }

  return {
    kind: 'resource',
    endpoint: `${parsed.origin}/`,
  };
}

function buildPrompt({ modelNotes }) {
  return [
    'You are a lead-research assistant.',
    'Find U.S.-based marketing agencies with estimated employee counts between 25 and 150.',
    'Return all unique agencies you can find.',
    'For each agency, provide 1-3 decision-makers with hiring authority, prioritizing: Founder, CEO, Owner, President, Managing Director, Chief Strategy Officer, Head/VP/Director of Strategy.',
    'Only include contacts when you are confident the email is valid business email.',
    'Do not include personal emails.',
    'Use best available public information.',
    'Return ONLY structured output that matches the schema.',
    modelNotes ? `Additional user notes: ${modelNotes}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
