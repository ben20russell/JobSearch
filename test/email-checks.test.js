import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkEmailFormat,
  checkMailboxWorking,
  checkPersonCompanyMatch,
  normalizeCompanyDomain,
  normalizeEmailAddress,
  validateRowsEmailAccuracy,
} from '../src/agent/email-checks.js';

test('normalizeEmailAddress extracts and normalizes plain and formula values', () => {
  assert.equal(normalizeEmailAddress('ALEX.DOE@VALID.EXAMPLE'), 'alex.doe@valid.example');
  assert.equal(
    normalizeEmailAddress('=HYPERLINK("https://mail.google.com/mail/?view=cm&fs=1&to=alex.doe@valid.example","alex.doe@valid.example")'),
    'alex.doe@valid.example'
  );
  assert.equal(normalizeEmailAddress('not-an-email'), '');
});

test('checkEmailFormat enforces valid email syntax', () => {
  assert.equal(checkEmailFormat('alex.doe@valid.example').passed, true);
  assert.equal(checkEmailFormat('alex.doe@valid').passed, false);
  assert.equal(checkEmailFormat('alex..doe@valid.example').passed, false);
});

test('checkPersonCompanyMatch validates company domain and contact-name alignment', () => {
  const pass = checkPersonCompanyMatch({
    contactName: 'Alex Doe',
    companyDomain: 'www.valid.example',
    email: 'alex.doe@valid.example',
  });
  assert.equal(pass.passed, true);
  assert.equal(normalizeCompanyDomain('https://www.valid.example/about'), 'valid.example');

  const domainMismatch = checkPersonCompanyMatch({
    contactName: 'Alex Doe',
    companyDomain: 'valid.example',
    email: 'alex.doe@other.example',
  });
  assert.equal(domainMismatch.passed, false);
  assert.equal(domainMismatch.reason, 'company_domain_mismatch');

  const personMismatch = checkPersonCompanyMatch({
    contactName: 'Alex Doe',
    companyDomain: 'valid.example',
    email: 'info@valid.example',
  });
  assert.equal(personMismatch.passed, false);
  assert.equal(personMismatch.reason, 'name_email_mismatch');
});

test('checkMailboxWorking uses MX lookup and SMTP probe', async () => {
  const mailboxPass = await checkMailboxWorking('alex.doe@valid.example', {
    resolveMxRecords: async (domain) => {
      if (domain !== 'valid.example') return [];
      return [{ exchange: 'mx1.valid.example', priority: 10 }];
    },
    smtpProbe: async ({ host, email }) => {
      assert.equal(host, 'mx1.valid.example');
      assert.equal(email, 'alex.doe@valid.example');
      return { accepted: true, code: 250, message: 'ok' };
    },
  });
  assert.equal(mailboxPass.passed, true);

  const mailboxFail = await checkMailboxWorking('alex.doe@invalid.example', {
    resolveMxRecords: async () => [],
    smtpProbe: async () => ({ accepted: false, code: 550, message: 'rejected' }),
  });
  assert.equal(mailboxFail.passed, false);
  assert.equal(mailboxFail.reason, 'missing_mx_records');
});

test('validateRowsEmailAccuracy keeps only rows that pass all three checks', async () => {
  const rows = [
    {
      agency_name: 'Valid Agency',
      company_domain: 'valid.example',
      contact_name: 'Alex Doe',
      contact_email: 'ALEX.DOE@VALID.EXAMPLE',
    },
    {
      agency_name: 'Invalid Format',
      company_domain: 'valid.example',
      contact_name: 'Pat Doe',
      contact_email: 'pat.doe@valid',
    },
    {
      agency_name: 'Bad Mailbox',
      company_domain: 'valid.example',
      contact_name: 'Taylor Doe',
      contact_email: 'taylor.doe@valid.example',
    },
    {
      agency_name: 'Bad Match',
      company_domain: 'valid.example',
      contact_name: 'Morgan Doe',
      contact_email: 'sales@valid.example',
    },
  ];

  const result = await validateRowsEmailAccuracy(rows, {
    resolveMxRecords: async () => [{ exchange: 'mx1.valid.example', priority: 10 }],
    smtpProbe: async ({ email }) => {
      if (email === 'alex.doe@valid.example') return { accepted: true, code: 250, message: 'ok' };
      return { accepted: false, code: 550, message: 'rejected' };
    },
  });

  assert.equal(result.validRows.length, 1);
  assert.equal(result.validRows[0].contact_email, 'alex.doe@valid.example');
  assert.equal(result.rejectedRows.length, 3);
  assert.equal(result.summary.totalRows, 4);
  assert.equal(result.summary.passedRows, 1);
  assert.equal(result.summary.failedRows, 3);
  assert.equal(result.summary.failuresByReason.invalid_email_format, 1);
  assert.equal(result.summary.failuresByReason.mailbox_not_accepting_messages, 1);
  assert.equal(result.summary.failuresByReason.name_email_mismatch, 1);
});
