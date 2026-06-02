import { inferAgencyType } from './agency-types.js';

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
];

export const CSV_HEADERS = [
  'agency_name',
  'agency_type',
  'company_domain',
  'employee_count',
  'company_city',
  'company_state',
  'contact_name',
  'contact_title',
  'contact_seniority',
  'contact_email',
  'linkedin_url',
  'source',
  'last_verified_at',
  'notes',
];

function inTargetSize(employeeCount) {
  return Number.isFinite(employeeCount) && employeeCount >= 25 && employeeCount <= 150;
}

function isDecisionMaker(person) {
  const title = String(person?.title || '').toLowerCase();
  const seniority = String(person?.seniority || '').toLowerCase();
  if (!title && !seniority) return false;

  return DECISION_KEYWORDS.some((keyword) => title.includes(keyword) || seniority.includes(keyword));
}

function getDomain(websiteUrl = '') {
  try {
    const u = new URL(websiteUrl);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function buildLeadRows({ agencies, peopleByAgencyId, today = new Date().toISOString().slice(0, 10) }) {
  const rows = [];

  for (const agency of agencies || []) {
    const employeeCount = Number(agency.employee_count);
    if (!inTargetSize(employeeCount)) continue;

    const candidates = peopleByAgencyId?.[agency.id] || [];
    for (const person of candidates) {
      if (!isDecisionMaker(person)) continue;
      if (!person.email) continue;

      rows.push({
        agency_name: agency.name || '',
        agency_type: inferAgencyType({
          agencyName: agency.name,
          companyDomain: getDomain(agency.website_url),
        }) || '',
        company_domain: getDomain(agency.website_url),
        employee_count: employeeCount,
        company_city: agency.city || '',
        company_state: agency.state || '',
        contact_name: person.full_name || '',
        contact_title: person.title || '',
        contact_seniority: person.seniority || '',
        contact_email: String(person.email || '').toLowerCase(),
        linkedin_url: person.linkedin_url || '',
        source: person.source || 'apollo',
        last_verified_at: today,
        notes: '',
      });
    }
  }

  return rows;
}

function makeKey(row) {
  return `${String(row.company_domain || '').toLowerCase()}::${String(row.contact_email || '').toLowerCase()}`;
}

export function mergeRowsByKey(existingRows, incomingRows) {
  const map = new Map();
  for (const row of existingRows || []) {
    map.set(makeKey(row), row);
  }
  for (const row of incomingRows || []) {
    map.set(makeKey(row), row);
  }
  return Array.from(map.values()).sort((a, b) => {
    const domainCmp = String(a.company_domain).localeCompare(String(b.company_domain));
    if (domainCmp !== 0) return domainCmp;
    return String(a.contact_email).localeCompare(String(b.contact_email));
  });
}

function escapeCsv(value) {
  const raw = value == null ? '' : String(value);
  if (raw.includes('"') || raw.includes(',') || raw.includes('\n')) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
}

export function toCsv(rows) {
  const lines = [CSV_HEADERS.join(',')];

  for (const row of rows || []) {
    const line = CSV_HEADERS.map((header) => escapeCsv(row[header])).join(',');
    lines.push(line);
  }

  return `${lines.join('\n')}\n`;
}

export function fromCsv(csv) {
  if (!csv || !csv.trim()) return [];
  const [headerLine, ...dataLines] = csv.trim().split(/\r?\n/);
  const headers = parseCsvLine(headerLine);

  return dataLines
    .filter(Boolean)
    .map((line) => {
      const cols = parseCsvLine(line);
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = cols[idx] || '';
      });
      return row;
    });
}

function parseCsvLine(line) {
  const out = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      out.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  out.push(current);
  return out;
}
