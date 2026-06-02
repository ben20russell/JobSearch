import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLeadSearchTextFormat } from '../src/agent/azure-openai-lead-client.js';

test('buildLeadSearchTextFormat uses responses text format shape with top-level name', () => {
  const format = buildLeadSearchTextFormat();

  assert.equal(format.type, 'json_schema');
  assert.equal(format.name, 'lead_search_output');
  assert.ok(format.schema);
  assert.equal(format.json_schema, undefined);
});
