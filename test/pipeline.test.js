import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLeadRows, mergeRowsByKey, toCsv } from '../src/agent/pipeline.js';

const agencies = [
  {
    id: 'a1',
    name: 'Northstar Marketing',
    website_url: 'https://northstar.example',
    employee_count: 48,
    city: 'Austin',
    state: 'TX',
  },
  {
    id: 'a2',
    name: 'Tiny Creative',
    website_url: 'https://tiny.example',
    employee_count: 12,
    city: 'Denver',
    state: 'CO',
  },
];

const people = {
  a1: [
    {
      full_name: 'Casey Lee',
      title: 'Founder & CEO',
      seniority: 'founder',
      email: 'casey@northstar.example',
      linkedin_url: 'https://linkedin.com/in/casey',
    },
    {
      full_name: 'Jordan Kim',
      title: 'Associate Strategist',
      seniority: 'entry',
      email: 'jordan@northstar.example',
      linkedin_url: 'https://linkedin.com/in/jordan',
    },
    {
      full_name: 'Morgan Diaz',
      title: 'Head of Strategy',
      seniority: 'director',
      email: 'morgan@northstar.example',
      linkedin_url: 'https://linkedin.com/in/morgandiaz',
    },
  ],
};

test('buildLeadRows keeps target agency size and decision makers', () => {
  const rows = buildLeadRows({ agencies, peopleByAgencyId: people });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].agency_name, 'Northstar Marketing');
  assert.equal(rows[0].agency_type, 'integrated_marketing_agency');
  assert.equal(rows[0]['client deliverble'], 'Integrated strategy plus multi-channel campaign execution.');
  assert.equal(rows[0].employee_count, 48);
  assert.equal(rows[0].contact_name, 'Casey Lee');
  assert.equal(rows[0].Department, 'Executive');
  assert.equal(rows[0].contact_title, 'Founder & CEO');
  assert.equal(rows[1].contact_name, 'Morgan Diaz');
  assert.equal(rows[1].Department, 'Strategy');
});

test('mergeRowsByKey upserts existing rows by agency + email', () => {
  const existing = [
    {
      agency_name: 'Northstar Marketing',
      company_domain: 'northstar.example',
      contact_email: 'casey@northstar.example',
      notes: 'old',
    },
  ];

  const incoming = [
    {
      agency_name: 'Northstar Marketing',
      company_domain: 'northstar.example',
      contact_email: 'casey@northstar.example',
      notes: 'new',
    },
    {
      agency_name: 'Northstar Marketing',
      company_domain: 'northstar.example',
      contact_email: 'cecilia@northstar.example',
      notes: 'new2',
    },
  ];

  const merged = mergeRowsByKey(existing, incoming);

  assert.equal(merged.length, 2);
  assert.equal(merged[0].notes, 'new');
});

test('toCsv serializes rows with stable headers', () => {
  const rows = [
    {
      agency_name: 'Northstar Marketing',
      agency_type: 'integrated_marketing_agency',
      company_domain: 'northstar.example',
      employee_count: 48,
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

  const csv = toCsv(rows);

  assert.match(csv, /agency_name,agency_type,client deliverble,company_domain,employee_count/);
  assert.match(csv, /Northstar Marketing/);
  assert.match(csv, /integrated_marketing_agency/);
  assert.match(csv, /Integrated strategy plus multi-channel campaign execution\./);
  assert.match(csv, /Executive/);
  assert.match(csv, /casey@northstar.example/);
});
