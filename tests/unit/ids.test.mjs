/**
 * Sprint 00 unit tests: shared ID formats.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ID_KINDS,
  ID_PATTERN_SOURCES,
  generateId,
  isValidId,
} from '../../src/shared/ids.mjs';
import { ConfigError } from '../../src/shared/errors.mjs';

test('generated IDs match their kind patterns', () => {
  for (const kind of ID_KINDS) {
    const id = generateId(kind);
    assert.equal(isValidId(kind, id), true, `${kind}: ${id}`);
    assert.match(id, new RegExp(ID_PATTERN_SOURCES[kind]));
  }
});

test('generated IDs are unique and sufficiently random', () => {
  const seen = new Set();
  for (let i = 0; i < 100; i += 1) {
    const id = generateId('run');
    assert.equal(seen.has(id), false);
    seen.add(id);
  }
});

test('isValidId rejects wrong kind, wrong prefix, wrong length, and non-strings', () => {
  const runId = generateId('run');
  assert.equal(isValidId('invocation', runId), false);
  assert.equal(isValidId('run', 'lcim_inv_0123456789abcdef0123456789abcdef'), false);
  assert.equal(isValidId('run', 'lcim_run_0123456789abcdef0123456789abc'), false); // 31 hex
  assert.equal(isValidId('run', 'lcim_run_0123456789abcdef0123456789abcdeZ'), false); // non-hex
  assert.equal(isValidId('run', null), false);
  assert.equal(isValidId('run', 42), false);
  assert.equal(isValidId('bogus', runId), false);
});

test('generateId throws ConfigError for unknown kinds', () => {
  assert.throws(() => generateId('bogus'), ConfigError);
  assert.throws(() => generateId(undefined), ConfigError);
});
