import fs from 'node:fs/promises';
import { google } from 'googleapis';
import { CSV_HEADERS } from './pipeline.js';
import { resolveClientDeliverble } from './agency-types.js';
import { resolveDepartment } from './department.js';

export const DEFAULT_GOOGLE_SHEET_ID = '1N4XsyA4IICyEFxlSH-m3uoePU8EMDBywQVauMz9wNQE';
const DEFAULT_TAB_NAME = 'Sheet1';
const GOOGLE_SHEETS_SCOPE = ['https://www.googleapis.com/auth/spreadsheets'];
const CONTACT_EMAIL_HEADER = 'contact_email';
const CONTACT_NAME_HEADER = 'contact_name';
const AGENCY_NAME_HEADER = 'agency_name';
const CLIENT_DELIVERBLE_HEADER = 'client deliverble';
const DEPARTMENT_HEADER = 'Department';
const EMAIL_SUBJECT = 'Intro + Strategy Convo';

function escapeFormulaLiteral(value) {
  return String(value || '').replaceAll('"', '""');
}

function encodeGmailParam(value) {
  return encodeURIComponent(String(value || '')).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function extractEmailAddress(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return '';

  const plainEmailMatch = value.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  if (plainEmailMatch?.[1]) return plainEmailMatch[1].toLowerCase();

  const mailToMatch = value.match(/to=([^\s"&,)]+)/i);
  if (mailToMatch?.[1]) return decodeURIComponent(mailToMatch[1]).toLowerCase();

  const quotedEmailMatch = value.match(/"([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})"/i);
  if (quotedEmailMatch?.[1]) return quotedEmailMatch[1].toLowerCase();

  return '';
}

export function toGmailComposeHyperlink(email, { firstName = 'there', agencyName = 'your agency' } = {}) {
  const normalizedEmail = extractEmailAddress(email);
  if (!normalizedEmail) return '';

  const encodedEmail = encodeGmailParam(normalizedEmail);
  const encodedSubject = encodeGmailParam(EMAIL_SUBJECT);
  const encodedBody = encodeGmailParam(buildIntroEmailBody({ firstName, agencyName }));
  const escapedLabel = escapeFormulaLiteral(normalizedEmail);
  const composeUrl = `https://mail.google.com/mail/?view=cm&fs=1&tf=cm&to=${encodedEmail}&su=${encodedSubject}&body=${encodedBody}`;

  return `=HYPERLINK("${composeUrl}","${escapedLabel}")`;
}

function extractFirstName(fullName) {
  const normalized = String(fullName || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return 'there';
  const [firstName] = normalized.split(' ');
  return firstName || 'there';
}

function buildIntroEmailBody({ firstName = 'there', agencyName = 'your agency' } = {}) {
  return [
    `Hi ${firstName},`,
    '',
    `I've been following the strategy work coming out of ${agencyName} and wanted to start a conversation with you as I explore my next career move.`,
    '',
    "A little bit about me. For the last 16 years I've been building brands, executing campaigns and growing agencies. Most recently, I've been doing this with AI brands. I even built my own AI model to generate more structured, precise and faster audience research.",
    '',
    "Can we set up time to get to know each other better? I'd love to understand your strategy needs.",
    '',
    'Excited to hear your thoughts and connect!',
    'Ben',
    '',
  ].join('\n');
}

function columnNumberToLetter(columnNumber) {
  let current = Number(columnNumber);
  let output = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    output = String.fromCharCode(65 + remainder) + output;
    current = Math.floor((current - 1) / 26);
  }

  return output || 'A';
}

export function extractSpreadsheetId(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return '';

  if (!value.includes('docs.google.com/spreadsheets')) {
    return value;
  }

  const match = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] || '';
}

export function resolveGoogleSheetsConfig(env = process.env) {
  const spreadsheetInput = env.GOOGLE_SHEET_ID || env.GOOGLE_SHEETS_SPREADSHEET_ID || env.GOOGLE_SHEET_URL || DEFAULT_GOOGLE_SHEET_ID;
  const spreadsheetId = extractSpreadsheetId(spreadsheetInput);
  const tabName = String(env.GOOGLE_SHEET_TAB || env.GOOGLE_SHEETS_TAB_NAME || DEFAULT_TAB_NAME).trim();
  const serviceAccountEmail = String(env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim();
  const privateKey = String(env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const serviceAccountKeyFile = String(env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE || '').trim();

  if (!spreadsheetId) {
    throw new Error('Missing Google Sheets spreadsheet id. Set GOOGLE_SHEET_ID or GOOGLE_SHEET_URL.');
  }

  if (!tabName) {
    throw new Error('Missing Google Sheets tab name. Set GOOGLE_SHEET_TAB.');
  }

  return {
    spreadsheetId,
    tabName,
    serviceAccountEmail,
    privateKey,
    serviceAccountKeyFile,
  };
}

async function loadServiceAccountCredentials(config) {
  if (config.serviceAccountKeyFile) {
    console.log('[sheets] loading credentials from key file', {
      serviceAccountKeyFile: config.serviceAccountKeyFile,
    });

    const raw = await fs.readFile(config.serviceAccountKeyFile, 'utf8');
    const parsed = JSON.parse(raw);
    const clientEmail = String(parsed.client_email || '').trim();
    const privateKey = String(parsed.private_key || '');

    if (!clientEmail || !privateKey) {
      throw new Error('Google service account key file is missing client_email or private_key.');
    }

    return { clientEmail, privateKey };
  }

  if (config.serviceAccountEmail && config.privateKey) {
    console.log('[sheets] using credentials from env vars', {
      serviceAccountEmail: config.serviceAccountEmail,
    });

    return {
      clientEmail: config.serviceAccountEmail,
      privateKey: config.privateKey,
    };
  }

  throw new Error(
    'Missing Google credentials. Set GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY, or GOOGLE_SERVICE_ACCOUNT_KEY_FILE.'
  );
}

export async function createSheetsClient(config) {
  const credentials = await loadServiceAccountCredentials(config);

  const auth = new google.auth.JWT({
    email: credentials.clientEmail,
    key: credentials.privateKey,
    scopes: GOOGLE_SHEETS_SCOPE,
  });

  return google.sheets({ version: 'v4', auth });
}

export function toSheetValues(rows) {
  const lines = [CSV_HEADERS];

  for (const row of rows || []) {
    const firstName = extractFirstName(row?.[CONTACT_NAME_HEADER]);
    const agencyName = String(row?.[AGENCY_NAME_HEADER] || '').trim() || 'your agency';

    lines.push(
      CSV_HEADERS.map((header) => {
        if (header === CONTACT_EMAIL_HEADER) {
          return toGmailComposeHyperlink(row?.[header], {
            firstName,
            agencyName,
          });
        }

        if (header === CLIENT_DELIVERBLE_HEADER) {
          return resolveClientDeliverble({
            clientDeliverble: row?.[header],
            agencyType: row?.agency_type,
          });
        }

        if (header === DEPARTMENT_HEADER) {
          return resolveDepartment({
            department: row?.[header],
            contactTitle: row?.contact_title,
          });
        }

        return String(row?.[header] ?? '');
      })
    );
  }

  return lines;
}

export function fromSheetValues(values) {
  const table = Array.isArray(values) ? values : [];
  if (table.length <= 1) return [];

  const [headerRow, ...dataRows] = table;
  const headers = headerRow.map((h) => String(h || '').trim());

  return dataRows
    .filter((row) => Array.isArray(row) && row.some((cell) => String(cell || '').trim() !== ''))
    .map((row) => {
      const out = {};
      headers.forEach((header, idx) => {
        if (!header) return;
        out[header] = String(row[idx] ?? '');
      });
      return out;
    });
}

export async function readRowsFromGoogleSheet({ sheets, spreadsheetId, tabName }) {
  console.log('[sheets] reading rows', { spreadsheetId, tabName });

  const lastColumnLetter = columnNumberToLetter(CSV_HEADERS.length);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A1:${lastColumnLetter}`,
  });

  const values = response?.data?.values || [];
  const rows = fromSheetValues(values);

  console.log('[sheets] loaded existing rows', { rows: rows.length });
  return rows;
}

export async function writeRowsToGoogleSheet({ sheets, spreadsheetId, tabName, rows }) {
  const sortableRows = Array.isArray(rows) ? rows : [];
  const sortedRows = sortableRows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const leftCount = Number(left.row?.employee_count);
      const rightCount = Number(right.row?.employee_count);
      const leftValue = Number.isFinite(leftCount) ? leftCount : Number.NEGATIVE_INFINITY;
      const rightValue = Number.isFinite(rightCount) ? rightCount : Number.NEGATIVE_INFINITY;

      if (rightValue !== leftValue) return rightValue - leftValue;
      return left.index - right.index;
    })
    .map((entry) => entry.row);

  console.log('[sheets] writing rows', { spreadsheetId, tabName, rows: sortedRows.length });

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${tabName}!A:Z`,
  });

  const values = toSheetValues(sortedRows);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });

  console.log('[sheets] write complete', { rowsWritten: sortedRows.length });
}

export async function createGoogleSheetsStore(env = process.env) {
  const config = resolveGoogleSheetsConfig(env);
  const sheets = await createSheetsClient(config);

  return {
    spreadsheetId: config.spreadsheetId,
    tabName: config.tabName,
    readRows: () => readRowsFromGoogleSheet({ sheets, spreadsheetId: config.spreadsheetId, tabName: config.tabName }),
    writeRows: (rows) => writeRowsToGoogleSheet({ sheets, spreadsheetId: config.spreadsheetId, tabName: config.tabName, rows }),
  };
}
