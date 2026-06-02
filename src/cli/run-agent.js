import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AzureOpenAILeadClient } from '../agent/azure-openai-lead-client.js';
import { mapModelLeadsToRows } from '../agent/azure-leads.js';
import { fromCsv, mergeRowsByKey, toCsv } from '../agent/pipeline.js';
import { loadEnvLocalFile } from './env-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const outputPath = path.join(projectRoot, 'data', 'agency_leads.csv');

async function run() {
  console.log('[agent] starting lead discovery pipeline');

  const envFilePath = path.join(projectRoot, '.env.local');
  await loadEnvLocalFile({ filePath: envFilePath });

  const client = new AzureOpenAILeadClient({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
  });

  const modelNotes = process.env.LEAD_SEARCH_NOTES || '';

  const companies = await client.findMarketingAgencyLeads({ modelNotes });

  const incomingRows = mapModelLeadsToRows(companies);
  console.log('[agent] built lead rows', {
    companiesFromModel: companies.length,
    incomingRows: incomingRows.length,
  });

  let existingRows = [];
  try {
    const previousCsv = await fs.readFile(outputPath, 'utf8');
    existingRows = fromCsv(previousCsv);
    console.log('[agent] loaded existing CSV rows', { existingRows: existingRows.length });
  } catch (error) {
    console.log('[agent] no existing CSV found, creating new file', { message: error.message });
  }

  const merged = mergeRowsByKey(existingRows, incomingRows);
  const csv = toCsv(merged);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, csv, 'utf8');

  console.log('[agent] pipeline complete', {
    outputPath,
    totalRows: merged.length,
    addedOrUpdated: incomingRows.length,
  });
}

run().catch((error) => {
  console.error('[agent] failed', error);
  process.exitCode = 1;
});
