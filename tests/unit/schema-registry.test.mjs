/**
 * Sprint 00 unit tests: schema registry, validation engine, fixtures,
 * code/schema lockstep (enums, required fields, manifest/files).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SCHEMA_MANIFEST,
  SCHEMA_VERSION,
  getSchemaVersion,
  loadSchema,
  schemaNames,
  stampRecord,
  validateCommonRecord,
  toErrorRecord,
} from '../../src/shared/schema-registry.mjs';
import { validateAgainstSchema } from '../../src/shared/schema/validate.mjs';
import { SchemaEngineError, SchemaValidationError } from '../../src/shared/errors.mjs';
import { ENUM_REGISTRY, CONTROLLER_DISPOSITION } from '../../src/shared/enums.mjs';
import { REQUIRED_FIELDS } from '../../src/shared/interfaces.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCHEMA_DIR = path.join(ROOT, 'schemas', 'common');
const FIXTURE_DIR = path.join(ROOT, 'tests', 'fixtures', 'records');

function fixtureNameToSchema(base) {
  // longest-kind-first so 'work-unit-bad-paths' maps to 'lcim.common.work-unit',
  // not 'lcim.common.work'
  const kinds = schemaNames()
    .map((n) => n.replace('lcim.common.', ''))
    .sort((a, b) => b.length - a.length);
  for (const kind of kinds) {
    if (base === kind || base.startsWith(`${kind}-`)) return `lcim.common.${kind}`;
  }
  throw new Error(`cannot map fixture base to a schema: ${base}`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

test('manifest and schema directory are in lockstep', () => {
  const files = fs.readdirSync(SCHEMA_DIR).filter((f) => f.endsWith('.v2.schema.json')).sort();
  const manifestFiles = Object.values(SCHEMA_MANIFEST).map((m) => m.file).sort();
  assert.deepEqual(files, manifestFiles);
  for (const name of schemaNames()) {
    assert.ok(fs.existsSync(path.join(SCHEMA_DIR, SCHEMA_MANIFEST[name].file)));
  }
});

test('every schema has an $id and a schemaName property matching its registry name', () => {
  for (const name of schemaNames()) {
    const schema = loadSchema(name);
    assert.equal(typeof schema.$id, 'string');
    assert.ok(schema.$id.startsWith('https://lcim.local/schemas/common/'));
    const schemaNameProp = schema.properties.schemaName;
    if (name === 'lcim.common.envelope') {
      // the envelope accepts any registered name (enum), not a single const
      assert.equal(schemaNameProp.enum.includes(name), true);
    } else {
      assert.equal(schemaNameProp.const, name, name);
    }
    // schemaVersion is locked to exactly 2.0.0 (const) — fail-closed version
    // handling: a record claiming any other version cannot validate.
    assert.equal(schema.properties.schemaVersion.const, '2.0.0', `${name} schemaVersion`);
  }
});

test('every registered common schema rejects a wrong schemaVersion (9.9.9)', () => {
  for (const name of schemaNames()) {
    const validFile = fs
      .readdirSync(FIXTURE_DIR)
      .find((f) => f.startsWith('valid-') && fixtureNameToSchema(f.replace(/^valid-/, '').replace(/\.json$/, '')) === name);
    assert.ok(validFile, `no valid fixture for ${name}`);
    const mutated = JSON.parse(JSON.stringify(readJson(path.join(FIXTURE_DIR, validFile))));
    mutated.schemaVersion = '9.9.9';
    const result = validateCommonRecord(name, mutated);
    assert.equal(result.valid, false, `${name} with schemaVersion 9.9.9 must fail`);
    assert.ok(
      result.errors.some((e) => e.path === 'schemaVersion'),
      `${name} expected a schemaVersion error, got: ${JSON.stringify(result.errors)}`,
    );
  }
});

test('manifest versions are all 2.0.0 and consistent with SCHEMA_VERSION', () => {
  for (const name of schemaNames()) {
    assert.equal(getSchemaVersion(name), SCHEMA_VERSION);
    assert.equal(SCHEMA_MANIFEST[name].version, '2.0.0');
  }
});

test('REQUIRED_FIELDS matches each schema required array', () => {
  assert.deepEqual(Object.keys(REQUIRED_FIELDS).sort(), schemaNames().sort());
  for (const name of schemaNames()) {
    const schema = loadSchema(name);
    assert.deepEqual(schema.required.sort(), REQUIRED_FIELDS[name].slice().sort(), name);
  }
});

test('schema inline enums match src/shared/enums.mjs (no drift)', () => {
  // schema property -> ENUM_REGISTRY key
  const recordEnumProps = {
    'lcim.common.run': { prop: 'lifecycleState', key: 'runStatus' },
    'lcim.common.invocation': { prop: 'workerStatus', key: 'workerStatus' },
    'lcim.common.work-unit': { prop: 'status', key: 'workUnitStatus' },
    'lcim.common.disposition': { prop: 'disposition', key: 'controllerDisposition' },
    'lcim.common.review-finding': { prop: 'severity', key: 'reviewFindingSeverity' },
    'lcim.common.rejection': { prop: 'rejectionCode', key: 'rejectionCode' },
  };
  for (const [name, { prop, key }] of Object.entries(recordEnumProps)) {
    const schema = loadSchema(name);
    assert.deepEqual(schema.properties[prop].enum, [...ENUM_REGISTRY[key]], `${name}.${prop}`);
  }
  // enums registry snapshot fixture must equal the code registry exactly
  const enumsFixture = readJson(path.join(FIXTURE_DIR, 'valid-enums.json'));
  for (const [prop, values] of Object.entries(ENUM_REGISTRY)) {
    assert.deepEqual(enumsFixture[prop], [...values], `enums snapshot ${prop}`);
  }
  const enumsSchema = loadSchema('lcim.common.enums');
  for (const prop of Object.keys(ENUM_REGISTRY)) {
    assert.equal(enumsSchema.properties[prop].type, 'array');
    assert.equal(enumsSchema.properties[prop].minItems, 1);
  }
  // disposition reasonCode enum must equal rejectionCode
  const disposition = loadSchema('lcim.common.disposition');
  const rejection = loadSchema('lcim.common.rejection');
  assert.deepEqual(disposition.properties.reasonCode.enum, rejection.properties.rejectionCode.enum);
});

test('every valid fixture validates against its schema', () => {
  const validFiles = fs.readdirSync(FIXTURE_DIR).filter((f) => f.startsWith('valid-')).sort();
  assert.ok(validFiles.length >= 8);
  for (const file of validFiles) {
    const name = fixtureNameToSchema(file.replace(/^valid-/, '').replace(/\.json$/, ''));
    const instance = readJson(path.join(FIXTURE_DIR, file));
    const result = validateCommonRecord(name, instance);
    assert.deepEqual(result.errors, [], `${file} should be valid`);
  }
});

test('every invalid fixture fails validation', () => {
  const invalidFiles = fs.readdirSync(FIXTURE_DIR).filter((f) => f.startsWith('invalid-')).sort();
  assert.ok(invalidFiles.length >= 6);
  for (const file of invalidFiles) {
    const base = file.replace(/^invalid-/, '').replace(/\.json$/, '');
    const name = fixtureNameToSchema(base);
    const instance = readJson(path.join(FIXTURE_DIR, file));
    const result = validateCommonRecord(name, instance);
    assert.equal(result.valid, false, `${file} should be invalid`);
    assert.ok(result.errors.length >= 1);
  }
});

test('PATCH_READY is rejected as a worker status by the invocation schema', () => {
  const fixture = readJson(path.join(FIXTURE_DIR, 'invalid-invocation-bad-worker-status.json'));
  const result = validateCommonRecord('lcim.common.invocation', fixture);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.path === 'workerStatus'),
    `expected a workerStatus enum error, got: ${JSON.stringify(result.errors)}`,
  );
});

test('invocation record without workerStatus validates (absence = no valid worker status received)', () => {
  const fixture = readJson(path.join(FIXTURE_DIR, 'valid-invocation-no-worker-status.json'));
  assert.equal('workerStatus' in fixture, false);
  const result = validateCommonRecord('lcim.common.invocation', fixture);
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
  // stampRecord path agrees: workerStatus is optional in the authoritative flow
  const stamped = stampRecord('lcim.common.invocation', {
    invocationId: 'lcim_inv_0123456789abcdef0123456789abcdef',
    runId: 'lcim_run_0123456789abcdef0123456789abcdef',
    workUnitId: 'lcim_wu_0123456789abcdef0123456789abcdef',
    createdAt: '2025-01-01T00:00:00.000Z',
  });
  assert.equal('workerStatus' in stamped, false);
  assert.equal(stamped.schemaName, 'lcim.common.invocation');
  assert.equal(stamped.schemaVersion, '2.0.0');
});

test('invocation record with WORK_COMPLETE validates (workerStatus stays a valid worker vocabulary)', () => {
  const fixture = readJson(path.join(FIXTURE_DIR, 'valid-invocation.json'));
  assert.equal(fixture.workerStatus, 'WORK_COMPLETE');
  const result = validateCommonRecord('lcim.common.invocation', fixture);
  assert.deepEqual(result.errors, []);
});

test('no controller disposition validates as workerStatus in the invocation schema', () => {
  const base = readJson(path.join(FIXTURE_DIR, 'valid-invocation.json'));
  assert.ok(CONTROLLER_DISPOSITION.length >= 1);
  for (const disposition of CONTROLLER_DISPOSITION) {
    const mutated = { ...base, workerStatus: disposition };
    const result = validateCommonRecord('lcim.common.invocation', mutated);
    assert.equal(result.valid, false, `workerStatus must reject controller disposition ${disposition}`);
    assert.ok(
      result.errors.some((e) => e.path === 'workerStatus'),
      `expected a workerStatus enum error for ${disposition}, got: ${JSON.stringify(result.errors)}`,
    );
  }
});

test('a worker status is rejected as a controller disposition by the disposition schema', () => {
  const fixture = readJson(path.join(FIXTURE_DIR, 'invalid-disposition-worker-status.json'));
  const result = validateCommonRecord('lcim.common.disposition', fixture);
  assert.equal(result.valid, false);
});

test('disposition semantic rule: REJECTED requires a valid reasonCode (enforced in validateCommonRecord)', () => {
  const base = {
    schemaName: 'lcim.common.disposition',
    schemaVersion: '2.0.0',
    workUnitId: 'lcim_wu_0123456789abcdef0123456789abcdef',
    decidedAt: '2025-01-01T00:00:01.000Z',
    evidenceRefs: [],
  };

  // 1. REJECTED without reasonCode => invalid
  const noReason = validateCommonRecord('lcim.common.disposition', { ...base, disposition: 'REJECTED' });
  assert.equal(noReason.valid, false);
  assert.ok(
    noReason.errors.some((e) => e.path === 'reasonCode'),
    `expected a reasonCode error, got: ${JSON.stringify(noReason.errors)}`,
  );

  // 2. REJECTED with a valid rejection-taxonomy reasonCode => valid
  const withReason = validateCommonRecord('lcim.common.disposition', {
    ...base,
    disposition: 'REJECTED',
    reasonCode: 'WRONG_BASE',
  });
  assert.deepEqual(withReason.errors, []);

  // 3. REJECTED with an invalid reasonCode => invalid (schema taxonomy enum)
  const badReason = validateCommonRecord('lcim.common.disposition', {
    ...base,
    disposition: 'REJECTED',
    reasonCode: 'NOT_A_REJECTION_CODE',
  });
  assert.equal(badReason.valid, false);
  assert.ok(
    badReason.errors.some((e) => e.path === 'reasonCode'),
    `expected a reasonCode enum error, got: ${JSON.stringify(badReason.errors)}`,
  );

  // 4. PATCH_VALID without reasonCode => valid (positive dispositions never require it)
  const positive = validateCommonRecord('lcim.common.disposition', { ...base, disposition: 'PATCH_VALID' });
  assert.deepEqual(positive.errors, []);

  // the authoritative stampRecord path fails closed the same way
  assert.throws(
    () =>
      stampRecord('lcim.common.disposition', {
        workUnitId: 'lcim_wu_0123456789abcdef0123456789abcdef',
        disposition: 'REJECTED',
        decidedAt: '2025-01-01T00:00:01.000Z',
        evidenceRefs: [],
      }),
    SchemaValidationError,
  );
  const stamped = stampRecord('lcim.common.disposition', {
    workUnitId: 'lcim_wu_0123456789abcdef0123456789abcdef',
    disposition: 'REJECTED',
    reasonCode: 'SCOPE_VIOLATION',
    decidedAt: '2025-01-01T00:00:01.000Z',
    evidenceRefs: [],
  });
  assert.equal(stamped.disposition, 'REJECTED');
  assert.equal(stamped.reasonCode, 'SCOPE_VIOLATION');
});

test('stampRecord stamps name/version, validates, and freezes', () => {
  const record = stampRecord('lcim.common.rejection', {
    workUnitId: 'lcim_wu_0123456789abcdef0123456789abcdef',
    rejectionCode: 'WRONG_BASE',
    reason: 'candidate built on a stale base',
    evidenceRefs: [],
    rejectedAt: '2025-01-01T00:00:03.000Z',
  });
  assert.equal(record.schemaName, 'lcim.common.rejection');
  assert.equal(record.schemaVersion, '2.0.0');
  assert.ok(Object.isFrozen(record));
  // caller cannot mislabel: stampRecord always overrides schemaName/schemaVersion
  const forced = stampRecord('lcim.common.rejection', {
    schemaName: 'lcim.common.run',
    schemaVersion: '9.9.9',
    workUnitId: 'lcim_wu_0123456789abcdef0123456789abcdef',
    rejectionCode: 'WRONG_BASE',
    reason: 'x',
    evidenceRefs: [],
    rejectedAt: '2025-01-01T00:00:03.000Z',
  });
  assert.equal(forced.schemaName, 'lcim.common.rejection');
  assert.equal(forced.schemaVersion, '2.0.0');
  // invalid data fails
  assert.throws(
    () =>
      stampRecord('lcim.common.rejection', {
        workUnitId: 'not-an-id',
        rejectionCode: 'WRONG_BASE',
        reason: 'x',
        evidenceRefs: [],
        rejectedAt: '2025-01-01T00:00:03.000Z',
      }),
    SchemaValidationError,
  );
  assert.throws(() => stampRecord('lcim.common.bogus', {}), /unknown schema name/);
});

test('toErrorRecord produces a schema-valid error record', () => {
  const record = toErrorRecord(new Error('boom'));
  const result = validateCommonRecord('lcim.common.error', record);
  assert.deepEqual(result.errors, []);
  assert.equal(record.code, 'LCIM_UNEXPECTED');
});

test('engine fails closed on unsupported JSON-schema keywords', () => {
  assert.throws(
    () =>
      validateAgainstSchema(
        { a: 1 },
        { type: 'object', properties: { a: { $ref: '#/$defs/x' } } },
      ),
    SchemaEngineError,
  );
  assert.throws(
    () =>
      validateAgainstSchema(
        1,
        { oneOf: [{ type: 'string' }, { type: 'number' }] },
      ),
    SchemaEngineError,
  );
  assert.throws(
    () => validateAgainstSchema('x', { type: 'string', format: 'date-time' }),
    SchemaEngineError,
  );
});

test('validator enforces type/enum/pattern/required/additionalProperties basics', () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['a'],
    properties: {
      a: { type: 'string', pattern: '^x' },
      b: { enum: ['Y', 'N'] },
    },
  };
  assert.deepEqual(validateAgainstSchema({ a: 'xyz', b: 'Y' }, schema).errors, []);
  assert.ok(validateAgainstSchema({ b: 'Y' }, schema).errors.length > 0); // missing a
  assert.ok(validateAgainstSchema({ a: 'abc' }, schema).errors.length > 0); // pattern
  assert.ok(validateAgainstSchema({ a: 'xyz', c: 1 }, schema).errors.length > 0); // additional
  assert.ok(validateAgainstSchema({ a: 'xyz', b: 'Z' }, schema).errors.length > 0); // enum
});
