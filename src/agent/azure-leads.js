import { inferAgencyType, normalizeAgencyType } from './agency-types.js';

const DECISION_KEYWORDS = [
  'chief',
  'ceo',
  'founder',
  'owner',
  'partner',
  'vp',
  'vice president',
  'head',
  'director',
  'managing director',
  'strategy',
  'principal',
  'president',
];

function inTargetSize(employeeCount) {
  return Number.isFinite(employeeCount) && employeeCount >= 25 && employeeCount <= 150;
}

function isDecisionMaker(contact) {
  const title = String(contact?.contact_title || '').toLowerCase();
  const seniority = String(contact?.contact_seniority || '').toLowerCase();
  return DECISION_KEYWORDS.some((keyword) => title.includes(keyword) || seniority.includes(keyword));
}

export function mapModelLeadsToRows(candidates, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const rows = [];

  for (const company of candidates || []) {
    const employeeCount = Number(company?.employee_count || 0);
    if (!inTargetSize(employeeCount)) continue;
    const rawAgencyType = String(company?.agency_type || '').trim();
    const normalizedAgencyType = normalizeAgencyType(rawAgencyType);
    if (rawAgencyType && !normalizedAgencyType) continue;

    const agencyType = inferAgencyType({
      agencyType: normalizedAgencyType,
      agencyName: company?.agency_name,
      companyDomain: company?.company_domain,
    });
    if (!agencyType) continue;

    for (const contact of company?.contacts || []) {
      if (!contact?.contact_email) continue;
      if (!isDecisionMaker(contact)) continue;

      rows.push({
        agency_name: company?.agency_name || '',
        agency_type: agencyType,
        company_domain: String(company?.company_domain || '').toLowerCase(),
        employee_count: employeeCount,
        company_city: company?.company_city || '',
        company_state: company?.company_state || '',
        contact_name: contact?.contact_name || '',
        contact_title: contact?.contact_title || '',
        contact_seniority: contact?.contact_seniority || '',
        contact_email: String(contact?.contact_email || '').toLowerCase(),
        linkedin_url: contact?.linkedin_url || '',
        source: 'azure-openai-model',
        last_verified_at: today,
        notes: '',
      });
    }
  }

  return rows;
}
