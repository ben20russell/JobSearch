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
    Department: 'Executive',
    contact_email: 'casey@northstar.example',
    linkedin_url: 'https://linkedin.com/in/casey',
    source: 'apollo',
    last_verified_at: '2026-06-02',
    notes: '',
  },
];

function extractComposeUrl(formula) {
  const match = String(formula || '').match(/^=HYPERLINK\("([^"]+)","([^"]+)"\)$/);
  assert.ok(match, 'expected a valid HYPERLINK formula');
  return { url: match[1], label: match[2] };
}

function extractComposeBody(composeUrl) {
  const parsed = new URL(composeUrl);
  return String(parsed.searchParams.get('body') || '');
}

test('extractSpreadsheetId handles Google Sheets URL and raw id', () => {
  const idFromUrl = extractSpreadsheetId('https://docs.google.com/spreadsheets/d/1N4XsyA4IICyEFxlSH-m3uoePU8EMDBywQVauMz9wNQE/edit?usp=sharing');
  assert.equal(idFromUrl, DEFAULT_GOOGLE_SHEET_ID);
  assert.equal(extractSpreadsheetId(DEFAULT_GOOGLE_SHEET_ID), DEFAULT_GOOGLE_SHEET_ID);
});

test('toSheetValues and fromSheetValues round-trip rows', () => {
  const values = toSheetValues(SAMPLE_ROWS);
  assert.equal(values.length, 2);
  assert.equal(values[1][0], 'Northstar Marketing');
  assert.equal(values[1][2], 'Integrated strategy plus multi-channel campaign execution.');
  const compose = extractComposeUrl(values[1][10]);
  const body = extractComposeBody(compose.url);
  assert.equal(compose.label, 'casey@northstar.example');
  assert.ok(compose.url.includes('to=casey%40northstar.example'));
  assert.ok(compose.url.includes('su=Intro%20%2B%20Strategy%20Convo'));
  assert.ok(compose.url.includes('tf=cm'));
  assert.ok(compose.url.includes('tmpl=20260603'));
  assert.ok(compose.url.includes('%27'));
  assert.ok(body.includes('Hi Casey,'));
  assert.ok(body.includes("I've been following the strategy work coming out of Northstar Marketing"));
  assert.ok(body.includes("For the last 16 years I've been building brands, executing campaigns and growing agencies."));
  assert.ok(body.includes("I even built my own AI model to generate more structured, precise and faster audience research."));
  assert.ok(body.includes("I'd love to understand your strategy needs."));
  assert.ok(body.includes('Excited to hear your thoughts and connect!'));
  assert.ok(body.includes('\nBen'));
  assert.ok(body.endsWith('Ben\n'));

  const roundTrip = fromSheetValues(values);
  assert.equal(roundTrip.length, 1);
  assert.equal(roundTrip[0].company_domain, 'northstar.example');
  assert.equal(roundTrip[0].contact_email, values[1][10]);
});

test('toGmailComposeHyperlink normalizes nested formula input', () => {
  const nested = '=HYPERLINK("https://mail.google.com/mail/?view=cm&fs=1&to==HYPERLINK(""https://mail.google.com/mail/?view=cm&fs=1&to=casey@northstar.example"",""casey@northstar.example"")","=HYPERLINK(""https://mail.google.com/mail/?view=cm&fs=1&to=casey@northstar.example"",""casey@northstar.example"")")';
  const formula = toGmailComposeHyperlink(nested);
  const compose = extractComposeUrl(formula);
  const body = extractComposeBody(compose.url);
  assert.equal(compose.label, 'casey@northstar.example');
  assert.ok(compose.url.includes('to=casey%40northstar.example'));
  assert.ok(body.includes('Hi there,'));
});

test('toGmailComposeHyperlink falls back to defaults when name and agency are missing', () => {
  const formula = toGmailComposeHyperlink('casey@northstar.example');
  const compose = extractComposeUrl(formula);
  const body = extractComposeBody(compose.url);
  assert.equal(compose.label, 'casey@northstar.example');
  assert.ok(compose.url.includes('su=Intro%20%2B%20Strategy%20Convo'));
  assert.ok(body.includes('Hi there,'));
  assert.ok(body.includes('coming out of your agency'));
  assert.ok(body.includes('Excited to hear your thoughts and connect!'));
  assert.ok(body.endsWith('Ben\n'));
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
  assert.equal(calls[0].range, 'Sheet1!A1:O');
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

test('writeRowsToGoogleSheet defaults to sorting by employee_count descending', async () => {
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

  const unsortedRows = [
    { ...SAMPLE_ROWS[0], agency_name: 'Small Co', employee_count: 25, contact_email: 'small@example.com' },
    { ...SAMPLE_ROWS[0], agency_name: 'Large Co', employee_count: 150, contact_email: 'large@example.com' },
    { ...SAMPLE_ROWS[0], agency_name: 'Mid Co', employee_count: 80, contact_email: 'mid@example.com' },
  ];

  await writeRowsToGoogleSheet({ sheets, spreadsheetId: DEFAULT_GOOGLE_SHEET_ID, tabName: 'Sheet1', rows: unsortedRows });

  const values = calls[1].args.requestBody.values;
  assert.equal(values[1][0], 'Large Co');
  assert.equal(values[2][0], 'Mid Co');
  assert.equal(values[3][0], 'Small Co');
});
