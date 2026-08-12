/**
 * Sprint 00 unit tests: shared error taxonomy.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LcimError,
  ConfigError,
  SchemaValidationError,
  SchemaEngineError,
  TransportParseError,
  PublicSafetyError,
  RuntimePathError,
  errorPayload,
} from '../../src/shared/errors.mjs';
import { toErrorRecord, validateCommonRecord } from '../../src/shared/schema-registry.mjs';

test('error classes carry stable codes and are LcimError instances', () => {
  const cases = [
    [new ConfigError('cfg'), 'CONFIG_INVALID'],
    [new SchemaValidationError('schema'), 'SCHEMA_VALIDATION_FAILED'],
    [new SchemaEngineError('engine'), 'SCHEMA_ENGINE_UNSUPPORTED'],
    [new TransportParseError('transport'), 'TRANSPORT_PARSE_FAILED'],
    [new PublicSafetyError('safety'), 'PUBLIC_SAFETY_VIOLATION'],
    [new RuntimePathError('path'), 'RUNTIME_PATH_INVALID'],
    [new LcimError('base'), 'LCIM_ERROR'],
  ];
  for (const [err, code] of cases) {
    assert.ok(err instanceof LcimError);
    assert.equal(err.code, code);
    assert.equal(err.message.length > 0, true);
    assert.equal(err.name, err.constructor.name);
  }
});

test('errorPayload produces the public-safe payload shape', () => {
  const err = new ConfigError('unknown id kind: nope', { kind: 'nope' });
  assert.deepEqual(errorPayload(err), {
    code: 'CONFIG_INVALID',
    message: 'unknown id kind: nope',
    details: { kind: 'nope' },
  });
  const plain = errorPayload(new Error('boom'));
  assert.deepEqual(plain, { code: 'LCIM_UNEXPECTED', message: 'boom' });
});

test('toErrorRecord stamps and validates against lcim.common.error', () => {
  const record = toErrorRecord(new RuntimePathError('not a git repo'));
  assert.equal(record.schemaName, 'lcim.common.error');
  assert.equal(record.schemaVersion, '2.0.0');
  assert.equal(record.code, 'RUNTIME_PATH_INVALID');
  assert.equal(record.message, 'not a git repo');
  // round-trip through the schema
  const result = validateCommonRecord('lcim.common.error', record);
  assert.deepEqual(result.errors, []);
});
