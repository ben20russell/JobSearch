import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateRowsEmailAccuracy } from '../agent/email-checks.js';
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

  const emailValidation = await validateRowsEmailAccuracy(filteredRows, {
    requireSmtp: parseBooleanEnv(process.env.EMAIL_REQUIRE_SMTP, true),
    timeoutMs: parsePositiveIntEnv(process.env.EMAIL_SMTP_TIMEOUT_MS, 7000),
    maxMxHosts: parsePositiveIntEnv(process.env.EMAIL_MAX_MX_HOSTS, 3),
    heloHost: String(process.env.EMAIL_SMTP_HELO_HOST || 'localhost'),
    mailFrom: String(process.env.EMAIL_SMTP_MAIL_FROM || 'verify@localhost'),
  });
  const validatedRows = mergeRowsByKey([], emailValidation.validRows);

  console.log('[sync] parsed csv rows', { rows: rows.length });
  console.log('[sync] loaded existing sheet rows', { existingRows: existingRows.length });
  console.log('[sync] merged rows by key', { mergedRows: mergedRows.length });
  console.log('[sync] exclusion filter applied', {
    exclusionPath,
    removedByExclusionList: removedCount,
    rowsAfterFilter: filteredRows.length,
  });
  console.log('[sync] email checks complete', {
    rowsBeforeEmailChecks: filteredRows.length,
    rowsAfterEmailChecks: validatedRows.length,
    rejectedRows: emailValidation.rejectedRows.length,
    failuresByReason: emailValidation.summary.failuresByReason,
  });
  if (emailValidation.rejectedRows.length > 0) {
    console.log('[sync] rejected rows sample', {
      sample: emailValidation.rejectedRows.slice(0, 5).map((item) => ({
        agency_name: item?.row?.agency_name || '',
        contact_name: item?.row?.contact_name || '',
        contact_email: item?.row?.contact_email || '',
        reason: item?.reason || '',
      })),
    });
  }

  await sheetsStore.writeRows(validatedRows);

  console.log('[sync] complete', {
    spreadsheetId: sheetsStore.spreadsheetId,
    tabName: sheetsStore.tabName,
    rowsSynced: validatedRows.length,
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

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  run().catch((error) => {
    console.error('[sync] failed', error);
    process.exitCode = 1;
  });
}
