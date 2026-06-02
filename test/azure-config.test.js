import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAndValidateAzureEndpoint } from '../src/agent/azure-openai-lead-client.js';

test('normalizeAndValidateAzureEndpoint accepts resource-style openai hostname', () => {
  const endpoint = normalizeAndValidateAzureEndpoint('https://jobleads.openai.azure.com/');
  assert.deepEqual(endpoint, {
    kind: 'resource',
    endpoint: 'https://jobleads.openai.azure.com/',
  });
});

test('normalizeAndValidateAzureEndpoint accepts resource-style cognitiveservices hostname', () => {
  const endpoint = normalizeAndValidateAzureEndpoint('https://jobleads.cognitiveservices.azure.com');
  assert.deepEqual(endpoint, {
    kind: 'resource',
    endpoint: 'https://jobleads.cognitiveservices.azure.com/',
  });
});

test('normalizeAndValidateAzureEndpoint accepts services.ai project endpoint', () => {
  const endpoint = normalizeAndValidateAzureEndpoint(
    'https://ff-agent-resource.services.ai.azure.com/api/projects/ff-agent/openai/v1'
  );
  assert.deepEqual(endpoint, {
    kind: 'foundry_project',
    endpoint: 'https://ff-agent-resource.services.ai.azure.com/api/projects/ff-agent/openai/v1/',
  });
});

test('normalizeAndValidateAzureEndpoint rejects malformed services.ai endpoint path', () => {
  assert.throws(() => normalizeAndValidateAzureEndpoint('https://ff-agent-resource.services.ai.azure.com/openai/v1'), /must end with/);
});

test('normalizeAndValidateAzureEndpoint rejects non-Azure hostname', () => {
  assert.throws(
    () => normalizeAndValidateAzureEndpoint('https://example.com/'),
    /must be an Azure OpenAI resource base URL/,
  );
});
