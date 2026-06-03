import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRowsForSync } from '../src/cli/sync-csv-to-sheet.js';

test('buildRowsForSync preserves existing rows while upserting csv updates', () => {
  const existingRows = [
    {
      agency_name: 'Alpha Agency',
      agency_type: 'creative_agency',
      'client deliverble': 'Creative campaign concepts and production-ready marketing assets.',
      company_domain: 'alpha.example',
      contact_email: 'owner@alpha.example',
      notes: 'from-sheet',
    },
    {
      agency_name: 'Legacy Agency',
      agency_type: 'pr_agency',
      'client deliverble': 'PR strategy, media outreach, and reputation management programs.',
      company_domain: 'legacy.example',
      contact_email: 'ceo@legacy.example',
      notes: 'legacy',
    },
  ];

  const csvRows = [
    {
      agency_name: 'Alpha Agency',
      agency_type: 'creative_agency',
      'client deliverble': 'Creative campaign concepts and production-ready marketing assets.',
      company_domain: 'alpha.example',
      contact_email: 'owner@alpha.example',
      notes: 'from-csv-update',
    },
    {
      agency_name: 'Beta Agency',
      agency_type: 'integrated_marketing_agency',
      'client deliverble': 'Integrated strategy plus multi-channel campaign execution.',
      company_domain: 'beta.example',
      contact_email: 'founder@beta.example',
      notes: '',
    },
  ];

  const exclusions = {
    domains: new Set(),
    names: new Set(),
  };

  const { filteredRows, removedCount } = buildRowsForSync({ existingRows, csvRows, exclusions });

  assert.equal(filteredRows.length, 3);
  assert.equal(removedCount, 0);
  assert.equal(
    filteredRows.find((row) => row.company_domain === 'alpha.example' && row.contact_email === 'owner@alpha.example')
      ?.notes,
    'from-csv-update'
  );
  assert.ok(
    filteredRows.find((row) => row.company_domain === 'legacy.example' && row.contact_email === 'ceo@legacy.example')
  );
  assert.ok(
    filteredRows.find((row) => row.company_domain === 'beta.example' && row.contact_email === 'founder@beta.example')
  );
});

test('buildRowsForSync applies exclusions after merge', () => {
  const existingRows = [
    {
      agency_name: 'Blocked Agency',
      company_domain: 'blocked.example',
      contact_email: 'owner@blocked.example',
    },
  ];
  const csvRows = [];
  const exclusions = {
    domains: new Set(['blocked.example']),
    names: new Set(),
  };

  const { filteredRows, removedCount } = buildRowsForSync({ existingRows, csvRows, exclusions });

  assert.equal(filteredRows.length, 0);
  assert.equal(removedCount, 1);
});
