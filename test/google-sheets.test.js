import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GOOGLE_SHEET_ID,
  extractSpreadsheetId,
  fromSheetValues,
  readRowsFromGoogleSheet,
  toGmailComposeHyperlink,
  toSheetValues,
  writeRowsToGoogleSheet,
} from '../src/agent/google-sheets.js';

const SAMPLE_ROWS = [
  {
    agency_name: 'Northstar Marketing',
    agency_type: 'integrated_marketing_agency',
    company_domain: 'northstar.example',
    employee_count: 48,
    company_city: 'Austin',
    company_state: 'TX',
    contact_name: 'Casey Lee',
    contact_title: 'Founder & CEO',
    contact_seniority: 'founder',
    contact_email: 'casey@northstar.example',
    linkedin_url: 'https://linkedin.com/in/casey',
    source: 'apollo',
    last_verified_at: '2026-06-02',
    notes: '',
  },
];

test('extractSpreadsheetId handles Google Sheets URL and raw id', () => {
  const idFromUrl = extractSpreadsheetId('https://docs.google.com/spreadsheets/d/1N4XsyA4IICyEFxlSH-m3uoePU8EMDBywQVauMz9wNQE/edit?usp=sharing');
  assert.equal(idFromUrl, DEFAULT_GOOGLE_SHEET_ID);
  assert.equal(extractSpreadsheetId(DEFAULT_GOOGLE_SHEET_ID), DEFAULT_GOOGLE_SHEET_ID);
});

test('toSheetValues and fromSheetValues round-trip rows', () => {
  const values = toSheetValues(SAMPLE_ROWS);
  assert.equal(values.length, 2);
  assert.equal(values[1][0], 'Northstar Marketing');
  assert.equal(
    values[1][9],
    '=HYPERLINK("https://mail.google.com/mail/?view=cm&fs=1&to=casey@northstar.example","casey@northstar.example")'
  );

  const roundTrip = fromSheetValues(values);
  assert.equal(roundTrip.length, 1);
  assert.equal(roundTrip[0].company_domain, 'northstar.example');
  assert.equal(
    roundTrip[0].contact_email,
    '=HYPERLINK("https://mail.google.com/mail/?view=cm&fs=1&to=casey@northstar.example","casey@northstar.example")'
  );
});

test('toGmailComposeHyperlink normalizes nested formula input', () => {
  const nested = '=HYPERLINK("https://mail.google.com/mail/?view=cm&fs=1&to==HYPERLINK(""https://mail.google.com/mail/?view=cm&fs=1&to=casey@northstar.example"",""casey@northstar.example"")","=HYPERLINK(""https://mail.google.com/mail/?view=cm&fs=1&to=casey@northstar.example"",""casey@northstar.example"")")';
  const formula = toGmailComposeHyperlink(nested);
  assert.equal(
    formula,
    '=HYPERLINK("https://mail.google.com/mail/?view=cm&fs=1&to=casey@northstar.example","casey@northstar.example")'
  );
});

test('readRowsFromGoogleSheet reads range and maps values', async () => {
  const calls = [];
  const sheets = {
    spreadsheets: {
      values: {
        get: async (args) => {
          calls.push(args);
          return { data: { values: toSheetValues(SAMPLE_ROWS) } };
        },
      },
    },
  };

  const rows = await readRowsFromGoogleSheet({ sheets, spreadsheetId: DEFAULT_GOOGLE_SHEET_ID, tabName: 'Sheet1' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].range, 'Sheet1!A1:N');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].agency_name, 'Northstar Marketing');
});

test('writeRowsToGoogleSheet clears then writes values', async () => {
  const calls = [];
  const sheets = {
    spreadsheets: {
      values: {
        clear: async (args) => {
          calls.push({ type: 'clear', args });
        },
        update: async (args) => {
          calls.push({ type: 'update', args });
        },
      },
    },
  };

  await writeRowsToGoogleSheet({ sheets, spreadsheetId: DEFAULT_GOOGLE_SHEET_ID, tabName: 'Sheet1', rows: SAMPLE_ROWS });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].type, 'clear');
  assert.equal(calls[0].args.range, 'Sheet1!A:Z');
  assert.equal(calls[1].type, 'update');
  assert.equal(calls[1].args.range, 'Sheet1!A1');
  assert.equal(calls[1].args.valueInputOption, 'USER_ENTERED');
  assert.equal(calls[1].args.requestBody.values.length, 2);
});
