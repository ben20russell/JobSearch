import dns from 'node:dns/promises';
import net from 'node:net';
import { z } from 'zod';

const EMAIL_EXTRACT_REGEX = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;
const EMAIL_FORMAT_REGEX = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/i;
const EMAIL_SCHEMA = z.string().email();
const ROLE_LOCAL_PARTS = new Set([
  'admin',
  'billing',
  'careers',
  'contact',
  'hello',
  'help',
  'hr',
  'info',
  'jobs',
  'marketing',
  'office',
  'press',
  'sales',
  'support',
  'team',
]);

function escapeForRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeCompanyDomain(rawDomain) {
  const raw = String(rawDomain || '').trim().toLowerCase();
  if (!raw) return '';

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(withProtocol);
    return parsed.hostname.replace(/^www\./, '').replace(/\.$/, '').toLowerCase();
  } catch {
    return raw.replace(/^www\./, '').replace(/\/.*$/, '').replace(/\.$/, '');
  }
}

export function normalizeEmailAddress(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return '';

  const plainEmailMatch = value.match(EMAIL_EXTRACT_REGEX);
  if (plainEmailMatch?.[1]) return plainEmailMatch[1].toLowerCase();

  const mailToMatch = value.match(/to=([^\s"&,)]+)/i);
  if (mailToMatch?.[1]) {
    try {
      return decodeURIComponent(mailToMatch[1]).toLowerCase();
    } catch {
      return String(mailToMatch[1]).toLowerCase();
    }
  }

  return '';
}

function splitEmailAddress(email) {
  const [localPart = '', domain = ''] = String(email || '').toLowerCase().split('@');
  return { localPart, domain };
}

export function checkEmailFormat(rawEmail) {
  const normalizedEmail = normalizeEmailAddress(rawEmail);
  if (!normalizedEmail) {
    return { passed: false, reason: 'invalid_email_format', normalizedEmail: '' };
  }

  const { localPart, domain } = splitEmailAddress(normalizedEmail);
  if (!localPart || !domain) {
    return { passed: false, reason: 'invalid_email_format', normalizedEmail };
  }

  if (normalizedEmail.length > 254 || localPart.length > 64) {
    return { passed: false, reason: 'invalid_email_format', normalizedEmail };
  }

  if (localPart.includes('..') || localPart.startsWith('.') || localPart.endsWith('.')) {
    return { passed: false, reason: 'invalid_email_format', normalizedEmail };
  }

  if (!EMAIL_FORMAT_REGEX.test(normalizedEmail)) {
    return { passed: false, reason: 'invalid_email_format', normalizedEmail };
  }

  if (!EMAIL_SCHEMA.safeParse(normalizedEmail).success) {
    return { passed: false, reason: 'invalid_email_format', normalizedEmail };
  }

  return { passed: true, normalizedEmail };
}

function buildNamePatterns(contactName) {
  const tokens = String(contactName || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((token) => token.length >= 2);

  if (!tokens.length) return { tokens: [], patterns: [] };
  if (tokens.length === 1) return { tokens, patterns: [tokens[0]] };

  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  const firstInitial = first[0];
  const lastInitial = last[0];
  const patterns = [
    `${first}${last}`,
    `${last}${first}`,
    `${firstInitial}${last}`,
    `${first}${lastInitial}`,
    `${last}${firstInitial}`,
    `${firstInitial}${lastInitial}`,
    `${first}.${last}`,
    `${first}_${last}`,
    `${first}-${last}`,
    `${first}`,
    `${last}`,
  ];

  return { tokens, patterns };
}

function doesLocalPartMatchName(localPart, contactName) {
  const cleanedLocal = String(localPart || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!cleanedLocal) return false;
  if (ROLE_LOCAL_PARTS.has(cleanedLocal)) return false;

  const { tokens, patterns } = buildNamePatterns(contactName);
  if (!tokens.length) return false;

  const cleanedPatterns = patterns.map((pattern) => String(pattern || '').replace(/[^a-z0-9]/g, ''));
  if (cleanedPatterns.includes(cleanedLocal)) return true;

  if (tokens.length >= 2) {
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    if (cleanedLocal.includes(first) && cleanedLocal.includes(last)) return true;
    if (cleanedLocal.startsWith(first[0]) && cleanedLocal.includes(last)) return true;
    if (cleanedLocal.endsWith(last[0]) && cleanedLocal.includes(first)) return true;
  }

  return tokens.some((token) => cleanedLocal.includes(token));
}

export function checkPersonCompanyMatch({ contactName, companyDomain, email }) {
  const normalizedDomain = normalizeCompanyDomain(companyDomain);
  const normalizedEmail = normalizeEmailAddress(email);
  const { localPart, domain: emailDomain } = splitEmailAddress(normalizedEmail);

  if (!normalizedEmail) {
    return { passed: false, reason: 'invalid_email_format', normalizedDomain, normalizedEmail };
  }

  if (!normalizedDomain) {
    return { passed: false, reason: 'missing_company_domain', normalizedDomain, normalizedEmail };
  }

  if (emailDomain !== normalizedDomain) {
    return {
      passed: false,
      reason: 'company_domain_mismatch',
      normalizedDomain,
      normalizedEmail,
      emailDomain,
    };
  }

  if (!doesLocalPartMatchName(localPart, contactName)) {
    return { passed: false, reason: 'name_email_mismatch', normalizedDomain, normalizedEmail };
  }

  return { passed: true, normalizedDomain, normalizedEmail, emailDomain };
}

export async function resolveMxRecords(domain) {
  const records = await dns.resolveMx(domain);
  return Array.isArray(records) ? records : [];
}

function createSocketResponseReader({ socket, timeoutMs }) {
  let buffer = '';
  const pending = [];
  const lines = [];

  function flushLines() {
    while (pending.length > 0 && lines.length > 0) {
      const resolve = pending.shift();
      const line = lines.shift();
      resolve(line);
    }
  }

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let newlineIndex = buffer.indexOf('\n');

    while (newlineIndex >= 0) {
      const rawLine = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      lines.push(rawLine.replace(/\r$/, ''));
      newlineIndex = buffer.indexOf('\n');
    }

    flushLines();
  });

  async function readLine() {
    if (lines.length > 0) return lines.shift();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = pending.indexOf(onLine);
        if (index >= 0) pending.splice(index, 1);
        reject(new Error('Timed out waiting for SMTP response line.'));
      }, timeoutMs);

      function onLine(line) {
        clearTimeout(timer);
        resolve(line);
      }

      pending.push(onLine);
    });
  }

  async function readResponse() {
    const firstLine = await readLine();
    const firstMatch = firstLine.match(/^(\d{3})([ -])(.*)$/);
    if (!firstMatch) {
      return { code: 0, message: firstLine };
    }

    const code = Number(firstMatch[1]);
    let separator = firstMatch[2];
    let message = firstMatch[3];

    while (separator === '-') {
      const nextLine = await readLine();
      const nextMatch = nextLine.match(/^(\d{3})([ -])(.*)$/);
      if (!nextMatch) {
        message = `${message} ${nextLine}`.trim();
        separator = ' ';
        continue;
      }

      message = `${message} ${nextMatch[3]}`.trim();
      separator = nextMatch[2];
    }

    return { code, message };
  }

  return { readResponse };
}

async function smtpCommand(socket, reader, command) {
  socket.write(`${command}\r\n`);
  return reader.readResponse();
}

export async function smtpRcptProbe({
  host,
  email,
  timeoutMs = 7000,
  heloHost = 'localhost',
  mailFrom = 'verify@localhost',
  logger = console,
}) {
  logger.log('[email-checks] smtp probe start', { host, email, timeoutMs });

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port: 25 });
    socket.setTimeout(timeoutMs);

    const reader = createSocketResponseReader({ socket, timeoutMs });

    let settled = false;
    const settleResolve = (value) => {
      if (settled) return;
      settled = true;
      socket.end();
      resolve(value);
    };
    const settleReject = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };

    socket.on('timeout', () => {
      settleReject(new Error(`SMTP probe timed out for host ${host}.`));
    });

    socket.on('error', (error) => {
      settleReject(error);
    });

    socket.on('connect', async () => {
      try {
        const greeting = await reader.readResponse();
        if (greeting.code < 200 || greeting.code >= 400) {
          settleResolve({ accepted: false, code: greeting.code, message: greeting.message });
          return;
        }

        const helo = await smtpCommand(socket, reader, `HELO ${heloHost}`);
        if (helo.code < 200 || helo.code >= 400) {
          settleResolve({ accepted: false, code: helo.code, message: helo.message });
          return;
        }

        const mailFromResponse = await smtpCommand(socket, reader, `MAIL FROM:<${mailFrom}>`);
        if (mailFromResponse.code < 200 || mailFromResponse.code >= 400) {
          settleResolve({
            accepted: false,
            code: mailFromResponse.code,
            message: mailFromResponse.message,
          });
          return;
        }

        const rcpt = await smtpCommand(socket, reader, `RCPT TO:<${email}>`);
        await smtpCommand(socket, reader, 'QUIT').catch(() => {});
        const accepted = rcpt.code === 250 || rcpt.code === 251 || rcpt.code === 252;

        settleResolve({ accepted, code: rcpt.code, message: rcpt.message });
      } catch (error) {
        settleReject(error);
      }
    });
  });
}

export async function checkMailboxWorking(email, options = {}) {
  const {
    resolveMxRecords: resolveMx = resolveMxRecords,
    smtpProbe = smtpRcptProbe,
    maxMxHosts = 3,
    timeoutMs = 7000,
    requireSmtp = true,
    heloHost = 'localhost',
    mailFrom = 'verify@localhost',
    logger = console,
  } = options;

  const normalizedEmail = normalizeEmailAddress(email);
  const { domain } = splitEmailAddress(normalizedEmail);
  if (!normalizedEmail || !domain) {
    return { passed: false, reason: 'invalid_email_format', normalizedEmail };
  }

  logger.log('[email-checks] mailbox check start', {
    email: normalizedEmail,
    domain,
    requireSmtp,
    maxMxHosts,
  });

  let mxRecords = [];
  try {
    mxRecords = await resolveMx(domain);
  } catch (error) {
    logger.log('[email-checks] mx lookup failed', {
      email: normalizedEmail,
      domain,
      message: error?.message,
    });
    return { passed: false, reason: 'mx_lookup_failed', normalizedEmail, domain };
  }

  if (!mxRecords.length) {
    logger.log('[email-checks] missing mx records', {
      email: normalizedEmail,
      domain,
    });
    return { passed: false, reason: 'missing_mx_records', normalizedEmail, domain };
  }

  const mxHosts = [...mxRecords]
    .sort((a, b) => Number(a.priority || 0) - Number(b.priority || 0))
    .map((record) => String(record.exchange || '').replace(/\.$/, '').toLowerCase())
    .filter(Boolean);

  if (!requireSmtp) {
    logger.log('[email-checks] mailbox passed on mx records only', {
      email: normalizedEmail,
      domain,
      mxHosts: mxHosts.slice(0, maxMxHosts),
    });
    return {
      passed: true,
      normalizedEmail,
      domain,
      mxHost: mxHosts[0] || '',
      checkMode: 'mx_only',
    };
  }

  let sawExplicitRejection = false;
  let lastFailure = '';

  for (const host of mxHosts.slice(0, maxMxHosts)) {
    try {
      logger.log('[email-checks] smtp probe attempt', {
        email: normalizedEmail,
        host,
      });

      const probeResult = await smtpProbe({
        host,
        email: normalizedEmail,
        timeoutMs,
        heloHost,
        mailFrom,
        logger,
      });

      if (probeResult?.accepted) {
        logger.log('[email-checks] mailbox accepted by smtp', {
          email: normalizedEmail,
          host,
          code: probeResult?.code,
        });
        return {
          passed: true,
          normalizedEmail,
          domain,
          mxHost: host,
          smtpCode: probeResult?.code,
          smtpMessage: probeResult?.message || '',
          checkMode: 'mx_and_smtp',
        };
      }

      const code = Number(probeResult?.code || 0);
      if (code >= 500) sawExplicitRejection = true;
      lastFailure = probeResult?.message || `smtp code ${code}`;
      logger.log('[email-checks] mailbox rejected by smtp', {
        email: normalizedEmail,
        host,
        code,
        message: lastFailure,
      });
    } catch (error) {
      lastFailure = error?.message || 'smtp probe failed';
      logger.log('[email-checks] smtp probe error', {
        email: normalizedEmail,
        host,
        message: lastFailure,
      });
    }
  }

  if (sawExplicitRejection) {
    return {
      passed: false,
      reason: 'mailbox_not_accepting_messages',
      normalizedEmail,
      domain,
      details: lastFailure,
    };
  }

  return {
    passed: false,
    reason: 'smtp_probe_failed',
    normalizedEmail,
    domain,
    details: lastFailure,
  };
}

function incrementReasonCounter(counter, reason) {
  const key = String(reason || 'unknown_error');
  counter[key] = Number(counter[key] || 0) + 1;
}

export async function validateRowsEmailAccuracy(rows, options = {}) {
  const {
    resolveMxRecords: resolveMx = resolveMxRecords,
    smtpProbe = smtpRcptProbe,
    maxMxHosts = 3,
    timeoutMs = 7000,
    requireSmtp = true,
    heloHost = 'localhost',
    mailFrom = 'verify@localhost',
    logger = console,
  } = options;

  const list = Array.isArray(rows) ? rows : [];
  logger.log('[email-checks] starting row validation', {
    rows: list.length,
    requireSmtp,
    timeoutMs,
    maxMxHosts,
  });

  const validRows = [];
  const rejectedRows = [];
  const failuresByReason = {};
  const mailboxCache = new Map();

  for (const row of list) {
    const rowEmail = row?.contact_email;
    const formatCheck = checkEmailFormat(rowEmail);
    if (!formatCheck.passed) {
      incrementReasonCounter(failuresByReason, formatCheck.reason);
      rejectedRows.push({
        row,
        reason: formatCheck.reason,
        checks: { formatCheck, personCompanyCheck: null, mailboxCheck: null },
      });
      logger.log('[email-checks] rejected row on format check', {
        agency: row?.agency_name || '',
        contactName: row?.contact_name || '',
        contactEmail: row?.contact_email || '',
        reason: formatCheck.reason,
      });
      continue;
    }

    const personCompanyCheck = checkPersonCompanyMatch({
      contactName: row?.contact_name,
      companyDomain: row?.company_domain,
      email: formatCheck.normalizedEmail,
    });
    if (!personCompanyCheck.passed) {
      incrementReasonCounter(failuresByReason, personCompanyCheck.reason);
      rejectedRows.push({
        row,
        reason: personCompanyCheck.reason,
        checks: { formatCheck, personCompanyCheck, mailboxCheck: null },
      });
      logger.log('[email-checks] rejected row on person/company check', {
        agency: row?.agency_name || '',
        contactName: row?.contact_name || '',
        contactEmail: formatCheck.normalizedEmail,
        companyDomain: row?.company_domain || '',
        reason: personCompanyCheck.reason,
      });
      continue;
    }

    const mailboxKey = formatCheck.normalizedEmail;
    let mailboxCheck = mailboxCache.get(mailboxKey);
    if (!mailboxCheck) {
      mailboxCheck = await checkMailboxWorking(formatCheck.normalizedEmail, {
        resolveMxRecords: resolveMx,
        smtpProbe,
        maxMxHosts,
        timeoutMs,
        requireSmtp,
        heloHost,
        mailFrom,
        logger,
      });
      mailboxCache.set(mailboxKey, mailboxCheck);
    }

    if (!mailboxCheck.passed) {
      incrementReasonCounter(failuresByReason, mailboxCheck.reason);
      rejectedRows.push({
        row,
        reason: mailboxCheck.reason,
        checks: { formatCheck, personCompanyCheck, mailboxCheck },
      });
      logger.log('[email-checks] rejected row on mailbox check', {
        agency: row?.agency_name || '',
        contactName: row?.contact_name || '',
        contactEmail: formatCheck.normalizedEmail,
        reason: mailboxCheck.reason,
      });
      continue;
    }

    validRows.push({
      ...row,
      contact_email: formatCheck.normalizedEmail,
      company_domain: personCompanyCheck.normalizedDomain,
    });
    logger.log('[email-checks] accepted row', {
      agency: row?.agency_name || '',
      contactName: row?.contact_name || '',
      contactEmail: formatCheck.normalizedEmail,
      companyDomain: personCompanyCheck.normalizedDomain,
    });
  }

  const summary = {
    totalRows: list.length,
    passedRows: validRows.length,
    failedRows: rejectedRows.length,
    failuresByReason,
  };

  logger.log('[email-checks] row validation complete', summary);

  return { validRows, rejectedRows, summary };
}

export function buildContactNamePattern(contactName) {
  const { patterns } = buildNamePatterns(contactName);
  if (!patterns.length) return '';
  const escapedPatterns = patterns.map((pattern) => escapeForRegex(pattern));
  return `(?:${escapedPatterns.join('|')})`;
}
