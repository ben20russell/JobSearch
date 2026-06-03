import test from 'node:test';
import assert from 'node:assert/strict';
import { mapModelLeadsToRows } from '../src/agent/azure-leads.js';

test('mapModelLeadsToRows filters to 25-150 and decision-maker emails', () => {
  const candidates = [
    {
      agency_name: 'Valid Agency',
      agency_type: 'creative_agency',
      company_domain: 'valid.example',
      employee_count: 60,
      company_city: 'Austin',
      company_state: 'TX',
      contacts: [
        {
          contact_name: 'Alex Doe',
          contact_title: 'Founder & CEO',
          contact_seniority: 'founder',
          contact_email: 'ALEX@VALID.EXAMPLE',
          linkedin_url: 'https://linkedin.com/in/alex',
        },
        {
          contact_name: 'Jamie Roe',
          contact_title: 'Chief Strategy Officer',
          contact_seniority: 'chief',
          contact_email: 'jamie@valid.example',
          linkedin_url: 'https://linkedin.com/in/jamieroe',
        },
        {
          contact_name: 'Pat Doe',
          contact_title: 'Coordinator',
          contact_seniority: 'entry',
          contact_email: 'pat@valid.example',
          linkedin_url: '',
        },
      ],
    },
    {
      agency_name: 'Too Small Agency',
      agency_type: 'pr_agency',
      company_domain: 'small.example',
      employee_count: 10,
      contacts: [
        {
          contact_name: 'Sam Boss',
          contact_title: 'Founder',
          contact_seniority: 'founder',
          contact_email: 'sam@small.example',
        },
      ],
    },
    {
      agency_name: 'Wrong Type Agency',
      agency_type: 'media_buying_agency',
      company_domain: 'media.example',
      employee_count: 80,
      contacts: [
        {
          contact_name: 'Taylor Boss',
          contact_title: 'Founder',
          contact_seniority: 'founder',
          contact_email: 'taylor@media.example',
        },
      ],
    },
    {
      agency_name: 'Bluebird Marketing',
      agency_type: '',
      company_domain: 'bluebird.example',
      employee_count: 70,
      contacts: [
        {
          contact_name: 'Morgan Hill',
          contact_title: 'Managing Director',
          contact_seniority: 'director',
          contact_email: 'morgan@bluebird.example',
        },
      ],
    },
  ];

  const rows = mapModelLeadsToRows(candidates, { today: '2026-06-02' });

  assert.equal(rows.length, 3);
  assert.equal(rows[0].agency_name, 'Valid Agency');
  assert.equal(rows[0].agency_type, 'creative_agency');
  assert.equal(rows[0]['client deliverble'], 'Creative campaign concepts and production-ready marketing assets.');
  assert.equal(rows[0].Department, 'Executive');
  assert.equal(rows[0].contact_email, 'alex@valid.example');
  assert.equal(rows[0].last_verified_at, '2026-06-02');
  assert.equal(rows[1].agency_name, 'Valid Agency');
  assert.equal(rows[1].Department, 'Strategy');
  assert.equal(rows[1].contact_email, 'jamie@valid.example');
  assert.equal(rows[2].agency_name, 'Bluebird Marketing');
  assert.equal(rows[2].agency_type, 'integrated_marketing_agency');
  assert.equal(rows[2]['client deliverble'], 'Integrated strategy plus multi-channel campaign execution.');
  assert.equal(rows[2].Department, 'Executive');
});
