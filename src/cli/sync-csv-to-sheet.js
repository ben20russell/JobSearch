import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGoogleSheetsStore } from '../agent/google-sheets.js';
import { fromCsv } from '../agent/pipeline.js';
import { loadEnvLocalFile } from './env-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const defaultCsvPath = path.join(projectRoot, 'data', 'agency_leads.csv');

async function run() {
  console.log('[sync] starting csv -> google sheet sync');

  const envFilePath = path.join(projectRoot, '.env.local');
  await loadEnvLocalFile({ filePath: envFilePath, overrideExisting: true });

  const sheetsStore = await createGoogleSheetsStore(process.env);

  const csvPath = process.env.LEADS_CSV_PATH || defaultCsvPath;
  console.log('[sync] reading csv source', { csvPath });

  const csv = await fs.readFile(csvPath, 'utf8');
  const rows = fromCsv(csv);

  console.log('[sync] parsed csv rows', { rows: rows.length });

  await sheetsStore.writeRows(rows);

  console.log('[sync] complete', {
    spreadsheetId: sheetsStore.spreadsheetId,
    tabName: sheetsStore.tabName,
    rowsSynced: rows.length,
  });
}

run().catch((error) => {
  console.error('[sync] failed', error);
  process.exitCode = 1;
});
