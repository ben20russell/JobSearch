import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function main() {
  console.log('[build] starting verification build');
  await execFileAsync(process.execPath, ['scripts/lint.js']);
  await execFileAsync(process.execPath, ['--test']);
  console.log('[build] complete');
}

main().catch((error) => {
  console.error('[build] failed', error);
  process.exitCode = 1;
});
