import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AzureOpenAILeadClient } from '../agent/azure-openai-lead-client.js';
import { mapModelLeadsToRows } from '../agent/azure-leads.js';
import { validateRowsEmailAccuracy } from '../agent/email-checks.js';
import { applyAgencyExclusions, loadAgencyExclusions } from '../agent/exclusions.js';
import { createGoogleSheetsStore } from '../agent/google-sheets.js';
import { mergeRowsByKey } from '../agent/pipeline.js';
import { loadEnvLocalFile } from './env-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

async function run() {
  console.log('[agent] starting lead discovery pipeline');

  const envFilePath = path.join(projectRoot, '.env.local');
  await loadEnvLocalFile({ filePath: envFilePath, overrideExisting: true });

  const client = new AzureOpenAILeadClient({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
  });

  const modelNotes = process.env.LEAD_SEARCH_NOTES || '';
  const exclusionPath = process.env.EXCLUDED_AGENCIES_PATH || path.join(projectRoot, 'data', 'provided_agencies.csv');
  const exclusions = await loadAgencyExclusions(exclusionPath);
  console.log('[agent] loaded exclusions', {
    exclusionPath,
    excludedDomains: exclusions.domains.size,
    excludedNames: exclusions.names.size,
  });

  const sheetsStore = await createGoogleSheetsStore(process.env);
  console.log('[agent] using google sheet destination', {
    spreadsheetId: sheetsStore.spreadsheetId,
    tabName: sheetsStore.tabName,
  });

  const companies = await client.findMarketingAgencyLeads({ modelNotes });

  const incomingRows = mapModelLeadsToRows(companies);
  console.log('[agent] built lead rows', {
    companiesFromModel: companies.length,
    incomingRows: incomingRows.length,
  });

  const emailValidation = await validateRowsEmailAccuracy(incomingRows, {
    requireSmtp: parseBooleanEnv(process.env.EMAIL_REQUIRE_SMTP, true),
    timeoutMs: parsePositiveIntEnv(process.env.EMAIL_SMTP_TIMEOUT_MS, 7000),
    maxMxHosts: parsePositiveIntEnv(process.env.EMAIL_MAX_MX_HOSTS, 3),
    heloHost: String(process.env.EMAIL_SMTP_HELO_HOST || 'localhost'),
    mailFrom: String(process.env.EMAIL_SMTP_MAIL_FROM || 'verify@localhost'),
  });
  const validatedIncomingRows = emailValidation.validRows;
  console.log('[agent] email checks complete', {
    incomingRows: incomingRows.length,
    validatedIncomingRows: validatedIncomingRows.length,
    rejectedRows: emailValidation.rejectedRows.length,
    failuresByReason: emailValidation.summary.failuresByReason,
  });
  if (emailValidation.rejectedRows.length > 0) {
    console.log('[agent] rejected rows sample', {
      sample: emailValidation.rejectedRows.slice(0, 5).map((item) => ({
        agency_name: item?.row?.agency_name || '',
        contact_name: item?.row?.contact_name || '',
        contact_email: item?.row?.contact_email || '',
        reason: item?.reason || '',
      })),
    });
  }

  const existingRows = await sheetsStore.readRows();

  const merged = mergeRowsByKey(existingRows, validatedIncomingRows);
  const { filteredRows, removedCount } = applyAgencyExclusions(merged, exclusions);
  await sheetsStore.writeRows(filteredRows);

  console.log('[agent] pipeline complete', {
    spreadsheetId: sheetsStore.spreadsheetId,
    tabName: sheetsStore.tabName,
    totalRows: filteredRows.length,
    removedByExclusionList: removedCount,
    addedOrUpdated: validatedIncomingRows.length,
  });
}

function parseBooleanEnv(value, defaultValue) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parsePositiveIntEnv(value, defaultValue) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return parsed;
}

run().catch((error) => {
  console.error('[agent] failed', error);
  process.exitCode = 1;
});
