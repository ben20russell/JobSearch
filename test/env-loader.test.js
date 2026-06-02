import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEnvContent } from '../src/cli/env-loader.js';

test('applyEnvContent loads .env values and preserves pre-existing env vars', () => {
  const initialEnv = {
    KEEP_ME: 'original',
  };

  const content = [
    '# comment',
    'AZURE_OPENAI_ENDPOINT=https://example.openai.azure.com/',
    'AZURE_OPENAI_DEPLOYMENT_NAME="my-deployment"',
    'KEEP_ME=should-not-overwrite',
  ].join('\n');

  const nextEnv = applyEnvContent(content, initialEnv);

  assert.equal(nextEnv.AZURE_OPENAI_ENDPOINT, 'https://example.openai.azure.com/');
  assert.equal(nextEnv.AZURE_OPENAI_DEPLOYMENT_NAME, 'my-deployment');
  assert.equal(nextEnv.KEEP_ME, 'original');
});

test('applyEnvContent can override existing env vars when configured', () => {
  const initialEnv = {
    AZURE_OPENAI_ENDPOINT: 'https://old.services.ai.azure.com/api/projects/old/openai/v1',
  };

  const content = 'AZURE_OPENAI_ENDPOINT=https://jobleads.cognitiveservices.azure.com/';
  const nextEnv = applyEnvContent(content, initialEnv, { overrideExisting: true });

  assert.equal(nextEnv.AZURE_OPENAI_ENDPOINT, 'https://jobleads.cognitiveservices.azure.com/');
});
