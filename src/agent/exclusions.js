import fs from 'node:fs/promises';

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeDomain(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  const withoutScheme = raw.replace(/^https?:\/\//, '');
  const withoutPath = withoutScheme.split('/')[0];
  return withoutPath.replace(/^www\./, '');
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

function parseCsv(content) {
  const text = String(content || '').trim();
  if (!text) return [];

  const [headerLine, ...dataLines] = text.split(/\r?\n/);
  const headers = parseCsvLine(headerLine).map((h) => normalizeName(h));

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

export async function loadAgencyExclusions(filePath) {
  const exclusions = { domains: new Set(), names: new Set() };
  if (!filePath) return exclusions;

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const rows = parseCsv(content);

    if (rows.length === 0) {
      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        const normalizedLine = normalizeName(line);
        if (
          normalizedLine === 'company_domain,agency_name' ||
          normalizedLine === 'company_domain' ||
          normalizedLine === 'agency_name'
        ) {
          continue;
        }

        const domain = normalizeDomain(line);
        const name = normalizeName(line);
        if (domain.includes('.')) exclusions.domains.add(domain);
        if (name && !name.includes('@')) exclusions.names.add(name);
      }

      return exclusions;
    }

    for (const row of rows) {
      const domain = normalizeDomain(row.company_domain || row.domain || row.website || row.url);
      const name = normalizeName(row.agency_name || row.name || row.company);

      if (domain) exclusions.domains.add(domain);
      if (name) exclusions.names.add(name);
    }

    return exclusions;
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return exclusions;
    }
    throw error;
  }
}

export function applyAgencyExclusions(rows, exclusions) {
  const domains = exclusions?.domains || new Set();
  const names = exclusions?.names || new Set();

  const filteredRows = [];
  let removedCount = 0;

  for (const row of rows || []) {
    const rowDomain = normalizeDomain(row?.company_domain);
    const rowName = normalizeName(row?.agency_name);

    if ((rowDomain && domains.has(rowDomain)) || (rowName && names.has(rowName))) {
      removedCount += 1;
      continue;
    }

    filteredRows.push(row);
  }

  return { filteredRows, removedCount };
}
