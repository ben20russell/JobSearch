export const ALLOWED_AGENCY_TYPES = [
  'integrated_marketing_agency',
  'creative_agency',
  'pr_agency',
  'brand_agency',
  'brand_strategy_agency',
];

const AGENCY_TYPE_SET = new Set(ALLOWED_AGENCY_TYPES);

const AGENCY_TYPE_ALIASES = new Map([
  ['integrated_marketing', 'integrated_marketing_agency'],
  ['integrated_agency', 'integrated_marketing_agency'],
  ['creative', 'creative_agency'],
  ['pr', 'pr_agency'],
  ['public_relations', 'pr_agency'],
  ['public_relations_agency', 'pr_agency'],
  ['brand', 'brand_agency'],
  ['branding', 'brand_agency'],
  ['branding_agency', 'brand_agency'],
  ['brand_strategy', 'brand_strategy_agency'],
  ['brand_strategy_firm', 'brand_strategy_agency'],
  ['brand_strategy_consultancy', 'brand_strategy_agency'],
]);

export function normalizeAgencyType(rawValue) {
  const normalized = String(rawValue || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!normalized) return null;
  if (AGENCY_TYPE_SET.has(normalized)) return normalized;

  const withoutAgencySuffix = normalized.replace(/_agency$/, '');
  const withAgencySuffix = `${withoutAgencySuffix}_agency`;
  if (AGENCY_TYPE_SET.has(withAgencySuffix)) return withAgencySuffix;

  const alias = AGENCY_TYPE_ALIASES.get(normalized) || AGENCY_TYPE_ALIASES.get(withoutAgencySuffix);
  if (alias && AGENCY_TYPE_SET.has(alias)) return alias;

  return null;
}

const INFERENCE_RULES = [
  { type: 'brand_strategy_agency', patterns: ['brand strategy', 'brand strategist', 'brand consulting'] },
  { type: 'pr_agency', patterns: ['public relations', 'pr agency', 'communications', 'comms'] },
  { type: 'creative_agency', patterns: ['creative', 'design studio', 'studio', 'production'] },
  { type: 'brand_agency', patterns: ['branding', 'brand agency', 'brand identity'] },
  {
    type: 'integrated_marketing_agency',
    patterns: ['marketing', 'digital', 'growth', 'performance', 'integrated', 'full service', 'full-service'],
  },
];

export function inferAgencyType({ agencyType, agencyName, companyDomain } = {}) {
  const normalized = normalizeAgencyType(agencyType);
  if (normalized) return normalized;

  const searchable = [agencyName, companyDomain]
    .map((value) => String(value || '').toLowerCase().trim())
    .filter(Boolean)
    .join(' ');

  if (!searchable) return null;

  for (const rule of INFERENCE_RULES) {
    if (rule.patterns.some((pattern) => searchable.includes(pattern))) {
      return rule.type;
    }
  }

  // Most records in this workflow are marketing agencies; default to integrated.
  return 'integrated_marketing_agency';
}
