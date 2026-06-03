import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { applyAgencyExclusions, loadAgencyExclusions } from '../agent/exclusions.js';
import { createGoogleSheetsStore } from '../agent/google-sheets.js';
import { fromCsv, mergeRowsByKey } from '../agent/pipeline.js';
import { loadEnvLocalFile } from './env-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const defaultCsvPath = path.join(projectRoot, 'data', 'agency_leads.csv');

export function buildRowsForSync({ existingRows, csvRows, exclusions }) {
  const mergedRows = mergeRowsByKey(existingRows || [], csvRows || []);
  const { filteredRows, removedCount } = applyAgencyExclusions(mergedRows, exclusions);

  return { mergedRows, filteredRows, removedCount };
}

export async function run() {
  console.log('[sync] starting csv -> google sheet sync');

  const envFilePath = path.join(projectRoot, '.env.local');
  await loadEnvLocalFile({ filePath: envFilePath, overrideExisting: true });

  const sheetsStore = await createGoogleSheetsStore(process.env);

  const csvPath = process.env.LEADS_CSV_PATH || defaultCsvPath;
  console.log('[sync] reading csv source', { csvPath });

  const csv = await fs.readFile(csvPath, 'utf8');
  const rows = fromCsv(csv);
  const exclusionPath = process.env.EXCLUDED_AGENCIES_PATH || path.join(projectRoot, 'data', 'provided_agencies.csv');
  const exclusions = await loadAgencyExclusions(exclusionPath);
  const existingRows = await sheetsStore.readRows();
  const { mergedRows, filteredRows, removedCount } = buildRowsForSync({
    existingRows,
    csvRows: rows,
    exclusions,
  });

  console.log('[sync] parsed csv rows', { rows: rows.length });
  console.log('[sync] loaded existing sheet rows', { existingRows: existingRows.length });
  console.log('[sync] merged rows by key', { mergedRows: mergedRows.length });
  console.log('[sync] exclusion filter applied', {
    exclusionPath,
    removedByExclusionList: removedCount,
    rowsAfterFilter: filteredRows.length,
  });

  await sheetsStore.writeRows(filteredRows);

  console.log('[sync] complete', {
    spreadsheetId: sheetsStore.spreadsheetId,
    tabName: sheetsStore.tabName,
    rowsSynced: filteredRows.length,
  });
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  run().catch((error) => {
    console.error('[sync] failed', error);
    process.exitCode = 1;
  });
}
