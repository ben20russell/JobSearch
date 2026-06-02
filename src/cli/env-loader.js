import fs from 'node:fs/promises';

export async function loadEnvLocalFile({ filePath, env = process.env } = {}) {
  if (!filePath) {
    console.log('[env-loader] no env file path provided');
    return env;
  }

  try {
    const content = await fs.readFile(filePath, 'utf8');
    const nextEnv = applyEnvContent(content, env);

    for (const [key, value] of Object.entries(nextEnv)) {
      if (env[key] == null && value != null) {
        env[key] = value;
      }
    }

    console.log('[env-loader] loaded env file', { filePath });
    return env;
  } catch (error) {
    console.log('[env-loader] env file not loaded', {
      filePath,
      message: error.message,
    });
    return env;
  }
}

export function applyEnvContent(content, baseEnv = process.env) {
  const nextEnv = { ...baseEnv };
  const lines = String(content || '').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const firstEquals = line.indexOf('=');
    if (firstEquals <= 0) continue;

    const key = line.slice(0, firstEquals).trim();
    if (!key) continue;

    let value = line.slice(firstEquals + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (nextEnv[key] == null) {
      nextEnv[key] = value;
    }
  }

  return nextEnv;
}
