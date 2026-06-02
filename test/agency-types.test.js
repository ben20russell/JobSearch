import test from 'node:test';
import assert from 'node:assert/strict';
import { inferAgencyType, normalizeAgencyType } from '../src/agent/agency-types.js';

test('normalizeAgencyType maps aliases to allowed values', () => {
  assert.equal(normalizeAgencyType('Public Relations'), 'pr_agency');
  assert.equal(normalizeAgencyType('branding'), 'brand_agency');
});

test('inferAgencyType prefers explicit valid type', () => {
  const inferred = inferAgencyType({
    agencyType: 'creative_agency',
    agencyName: 'Any Name',
    companyDomain: 'any.example',
  });

  assert.equal(inferred, 'creative_agency');
});

test('inferAgencyType derives best guess from agency name/domain', () => {
  assert.equal(
    inferAgencyType({ agencyName: 'Brightline Public Relations', companyDomain: 'brightlinepr.com' }),
    'pr_agency'
  );
  assert.equal(
    inferAgencyType({ agencyName: 'Oak & Pine Brand Strategy', companyDomain: 'oakpine.com' }),
    'brand_strategy_agency'
  );
  assert.equal(
    inferAgencyType({ agencyName: 'Northstar Marketing', companyDomain: 'northstar.example' }),
    'integrated_marketing_agency'
  );
});
