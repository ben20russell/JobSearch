import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { applyAgencyExclusions, loadAgencyExclusions } from '../src/agent/exclusions.js';

test('loadAgencyExclusions reads domains and agency names from csv', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agency-exclusions-'));
  const filePath = path.join(dir, 'provided_agencies.csv');

  await fs.writeFile(
    filePath,
    'company_domain,agency_name\nwww.Example.com,\n, Acme Creative \n',
    'utf8'
  );

  const exclusions = await loadAgencyExclusions(filePath);
  assert.equal(exclusions.domains.has('example.com'), true);
  assert.equal(exclusions.names.has('acme creative'), true);
});

test('applyAgencyExclusions removes rows matching excluded domain or name', () => {
  const rows = [
    { agency_name: 'Acme Creative', company_domain: 'acmecreative.com' },
    { agency_name: 'Northstar Marketing', company_domain: 'northstar.example' },
    { agency_name: 'Launch Lab', company_domain: 'example.com' },
  ];

  const exclusions = {
    domains: new Set(['example.com']),
    names: new Set(['acme creative']),
  };

  const result = applyAgencyExclusions(rows, exclusions);
  assert.equal(result.filteredRows.length, 1);
  assert.equal(result.filteredRows[0].agency_name, 'Northstar Marketing');
  assert.equal(result.removedCount, 2);
});

test('loadAgencyExclusions ignores header-only csv', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agency-exclusions-header-'));
  const filePath = path.join(dir, 'provided_agencies.csv');

  await fs.writeFile(filePath, 'company_domain,agency_name\n', 'utf8');

  const exclusions = await loadAgencyExclusions(filePath);
  assert.equal(exclusions.domains.size, 0);
  assert.equal(exclusions.names.size, 0);
});
