const STRATEGY_KEYWORDS = ['strategy', 'stratgy', 'brand'];

function normalizeDepartment(rawValue) {
  const value = String(rawValue || '').trim().toLowerCase();
  if (!value) return '';
  if (value.includes('strategy')) return 'Strategy';
  if (value.includes('executive')) return 'Executive';
  return '';
}

function isStrategyTitle(contactTitle) {
  const normalizedTitle = String(contactTitle || '').trim().toLowerCase();
  if (!normalizedTitle) return false;
  return STRATEGY_KEYWORDS.some((keyword) => normalizedTitle.includes(keyword));
}

export function resolveDepartment({ department, contactTitle } = {}) {
  const explicitDepartment = normalizeDepartment(department);
  if (explicitDepartment) return explicitDepartment;
  return isStrategyTitle(contactTitle) ? 'Strategy' : 'Executive';
}
