import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDepartment } from '../src/agent/department.js';

test('resolveDepartment marks strategy roles from title keywords', () => {
  assert.equal(resolveDepartment({ contactTitle: 'Chief Strategy Officer' }), 'Strategy');
  assert.equal(resolveDepartment({ contactTitle: 'Head of Brand Partnerships' }), 'Strategy');
  assert.equal(resolveDepartment({ contactTitle: 'Director of Stratgy and Ops' }), 'Strategy');
});

test('resolveDepartment defaults to executive for non-strategy titles', () => {
  assert.equal(resolveDepartment({ contactTitle: 'Founder & CEO' }), 'Executive');
  assert.equal(resolveDepartment({ contactTitle: 'President' }), 'Executive');
  assert.equal(resolveDepartment({ contactTitle: '' }), 'Executive');
});

test('resolveDepartment respects explicit department when present', () => {
  assert.equal(resolveDepartment({ department: 'Strategy', contactTitle: 'Founder & CEO' }), 'Strategy');
  assert.equal(resolveDepartment({ department: 'Executive', contactTitle: 'Head of Strategy' }), 'Executive');
});
