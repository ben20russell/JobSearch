import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AzureOpenAILeadClient } from '../agent/azure-openai-lead-client.js';
import { mapModelLeadsToRows } from '../agent/azure-leads.js';
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

  const existingRows = await sheetsStore.readRows();

  const merged = mergeRowsByKey(existingRows, incomingRows);
  await sheetsStore.writeRows(merged);

  console.log('[agent] pipeline complete', {
    spreadsheetId: sheetsStore.spreadsheetId,
    tabName: sheetsStore.tabName,
    totalRows: merged.length,
    addedOrUpdated: incomingRows.length,
  });
}

run().catch((error) => {
  console.error('[agent] failed', error);
  process.exitCode = 1;
});
