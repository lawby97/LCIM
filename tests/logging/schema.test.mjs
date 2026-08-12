/**
 * Sprint 01 schema tests: sprint-owned record families
 * (lcim.event / lcim.invocation / lcim.run).
 *
 * Covers: manifest/file lockstep, code/schema enum lockstep, engine
 * compatibility of the new schemas, valid/invalid fixtures, and the
 * conditional semantic rule (REJECTED assessment requires rejectionCode).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SPRINT_SCHEMA_MANIFEST,
  SPRINT_SCHEMA_VERSION,
  getSprintSchemaVersion,
  loadSprintSchema,
  sprintSchemaNames,
  stampSprintRecord,
  validateEventInstance,
  validateSprintRecord,
} from '../../src/logging/schemas.mjs';
import { validateAgainstSchema } from '../../src/shared/schema/validate.mjs';
import { SchemaValidationError } from '../../src/shared/errors.mjs';
import {
  INVOCATION_ASSESSMENT,
  INVOCATION_OUTCOME,
  INVOCATION_ROLE,
  INVOCATION_STATUS,
  RECONCILIATION_REASON,
} from '../../src/logging/enums.mjs';
import { INVOCATION_EVENT_KIND, REJECTION_CODE, RUN_STATUS } from '../../src/shared/enums.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE_DIR = path.join(ROOT, 'tests', 'fixtures', 'logging');
const SCENARIO_DIR = path.join(FIXTURE_DIR, 'scenario');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function fixtureNameToSchema(base) {
  const kinds = sprintSchemaNames()
    .map((n) => n.replace('lcim.', ''))
    .sort((a, b) => b.length - a.length);
  for (const kind of kinds) {
    if (base === kind || base.startsWith(`${kind}-`)) return `lcim.${kind}`;
  }
  throw new Error(`cannot map fixture base to a sprint schema: ${base}`);
}

test('sprint schema manifest files exist and are engine-compatible', () => {
  for (const name of sprintSchemaNames()) {
    const file = path.join(ROOT, 'schemas', SPRINT_SCHEMA_MANIFEST[name].file);
    assert.ok(fs.existsSync(file), `missing schema file ${file}`);
    const schema = loadSprintSchema(name);
    assert.equal(schema.properties.schemaName.const, name, name);
    assert.equal(schema.properties.schemaVersion.const, SPRINT_SCHEMA_VERSION, name);
    assert.equal(getSprintSchemaVersion(name), SPRINT_SCHEMA_VERSION);
    // The Sprint-00 engine must accept the schema definition itself
    // (assertSupportedSchema runs on every validation call).
    validateAgainstSchema({}, schema);
  }
  // all three owned files live in schemas/ (not schemas/common/)
  for (const name of sprintSchemaNames()) {
    const file = path.join(ROOT, 'schemas', SPRINT_SCHEMA_MANIFEST[name].file);
    assert.ok(!file.includes(`${path.sep}common${path.sep}`), `${name} must not live in schemas/common/`);
  }
});

test('sprint schema enums match the code vocabularies (no drift)', () => {
  const event = loadSprintSchema('lcim.event');
  const invocation = loadSprintSchema('lcim.invocation');
  const run = loadSprintSchema('lcim.run');
  assert.deepEqual(event.properties.kind.enum, [...INVOCATION_EVENT_KIND]);
  assert.deepEqual(event.properties.role.enum, [...INVOCATION_ROLE]);
  assert.deepEqual(event.properties.outcome.enum, [...INVOCATION_OUTCOME]);
  assert.deepEqual(event.properties.assessmentResult.enum, [...INVOCATION_ASSESSMENT]);
  assert.deepEqual(event.properties.reconciliationReason.enum, [...RECONCILIATION_REASON]);
  assert.deepEqual(event.properties.rejectionCode.enum, [...REJECTION_CODE]);
  assert.deepEqual(invocation.properties.status.enum, [...INVOCATION_STATUS]);
  assert.deepEqual(invocation.properties.role.enum, [...INVOCATION_ROLE]);
  assert.deepEqual(invocation.properties.assessmentResult.enum, [...INVOCATION_ASSESSMENT]);
  assert.deepEqual(run.properties.lifecycleState.enum, [...RUN_STATUS]);
});

test('every valid sprint fixture validates against its schema', () => {
  const validFiles = fs.readdirSync(FIXTURE_DIR).filter((f) => f.startsWith('valid-')).sort();
  assert.ok(validFiles.length >= 7);
  for (const file of validFiles) {
    const name = fixtureNameToSchema(file.replace(/^valid-/, '').replace(/\.json$/, ''));
    const instance = readJson(path.join(FIXTURE_DIR, file));
    const result = validateSprintRecord(name, instance);
    assert.deepEqual(result.errors, [], `${file} should be valid`);
  }
});

test('every invalid sprint fixture fails validation with a relevant error', () => {
  const invalidFiles = fs.readdirSync(FIXTURE_DIR).filter((f) => f.startsWith('invalid-')).sort();
  assert.ok(invalidFiles.length >= 8);
  const expectedPath = {
    'invalid-event-start-missing-role.json': 'role',
    'invalid-event-bad-role.json': 'role',
    'invalid-event-rejected-no-code.json': 'rejectionCode',
    'invalid-event-bad-seq.json': 'seq',
    'invalid-event-extra-field.json': '(root)',
    'invalid-invocation-bad-status.json': 'status',
    'invalid-invocation-rejected-no-code.json': 'rejectionCode',
    'invalid-run-bad-state.json': 'lifecycleState',
    'invalid-run-bad-digest.json': 'ledgerDigest',
  };
  for (const file of invalidFiles) {
    const base = file.replace(/^invalid-/, '').replace(/\.json$/, '');
    const name = fixtureNameToSchema(base);
    const instance = readJson(path.join(FIXTURE_DIR, file));
    // event fixtures go through the full per-event validation (kind rules)
    const result = name === 'lcim.event' ? validateEventInstance(instance) : validateSprintRecord(name, instance);
    assert.equal(result.valid, false, `${file} should be invalid`);
    assert.ok(result.errors.length >= 1, `${file} should produce errors`);
    const expected = expectedPath[file];
    if (expected !== undefined) {
      assert.ok(
        result.errors.some(
          (e) => e.path === expected || (expected === '(root)' && e.path === '') || e.path.endsWith(`.${expected}`),
        ),
        `${file} expected an error at '${expected}', got: ${JSON.stringify(result.errors)}`,
      );
    }
  }
});

test('START events require provider/model/role/reasoningEffort (kind rule)', () => {
  const base = readJson(path.join(FIXTURE_DIR, 'valid-event-start.json'));
  for (const field of ['provider', 'model', 'role', 'reasoningEffort']) {
    const mutated = JSON.parse(JSON.stringify(base));
    delete mutated[field];
    const result = validateEventInstance(mutated);
    assert.equal(result.valid, false, `START without ${field} must fail`);
    assert.ok(result.errors.some((e) => e.path === field), `expected ${field} error`);
  }
});

test('COMPLETION requires outcome; usage tokens must be non-negative integers', () => {
  const base = readJson(path.join(FIXTURE_DIR, 'valid-event-completion.json'));
  const noOutcome = { ...base, outcome: undefined };
  const r1 = validateEventInstance(noOutcome);
  assert.equal(r1.valid, false);
  assert.ok(r1.errors.some((e) => e.path === 'outcome'));

  const negative = { ...base, usage: { inputTokens: -1, outputTokens: 1, totalTokens: 0 } };
  const r2 = validateEventInstance(negative);
  assert.equal(r2.valid, false);
  assert.ok(r2.errors.some((e) => e.path === 'usage.inputTokens'));

  const fractional = { ...base, usage: { inputTokens: 1.5, outputTokens: 1, totalTokens: 2 } };
  assert.equal(validateEventInstance(fractional).valid, false);
});

test('RECONCILIATION requires reconciliationReason (kind rule)', () => {
  const base = readJson(path.join(FIXTURE_DIR, 'valid-event-reconciliation.json'));
  const mutated = { ...base, reconciliationReason: undefined };
  const result = validateEventInstance(mutated);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.path === 'reconciliationReason'));
});

test('ASSESSMENT rejected without rejectionCode fails closed (conditional rule, both families)', () => {
  // event family
  const event = readJson(path.join(FIXTURE_DIR, 'valid-event-assessment.json'));
  const rejectedEvent = { ...event, assessmentResult: 'REJECTED' };
  const r1 = validateSprintRecord('lcim.event', rejectedEvent);
  assert.equal(r1.valid, false);
  assert.ok(r1.errors.some((e) => e.path === 'rejectionCode'));
  // with a valid rejection code it passes
  const acceptedEvent = { ...event, assessmentResult: 'REJECTED', rejectionCode: 'TRANSPORT_MALFORMED' };
  assert.deepEqual(validateSprintRecord('lcim.event', acceptedEvent).errors, []);

  // invocation family
  const invocation = readJson(path.join(FIXTURE_DIR, 'valid-invocation-assessed.json'));
  const rejected = { ...invocation, assessmentResult: 'REJECTED' };
  const r2 = validateSprintRecord('lcim.invocation', rejected);
  assert.equal(r2.valid, false);
  assert.ok(r2.errors.some((e) => e.path === 'rejectionCode'));
});

test('stampSprintRecord stamps, validates, and freezes sprint records', () => {
  const record = stampSprintRecord('lcim.invocation', {
    invocationId: 'lcim_inv_11111111111111111111111111111111',
    runId: 'lcim_run_0123456789abcdef0123456789abcdef',
    workUnitId: 'lcim_wu_0123456789abcdef0123456789abcdef',
    status: 'STARTED',
    provider: 'deepseek',
    model: 'deepseek-flash',
    role: 'WORKER',
    reasoningEffort: 'xhigh',
    startedAt: '2025-01-01T00:00:00.000Z',
    completedAt: null,
    assessedAt: null,
    reconciledAt: null,
  });
  assert.equal(record.schemaName, 'lcim.invocation');
  assert.equal(record.schemaVersion, '1.0.0');
  assert.ok(Object.isFrozen(record));
  assert.throws(
    () =>
      stampSprintRecord('lcim.invocation', {
        invocationId: 'not-an-id',
        runId: 'lcim_run_0123456789abcdef0123456789abcdef',
        workUnitId: 'lcim_wu_0123456789abcdef0123456789abcdef',
        status: 'STARTED',
        provider: 'p',
        model: 'm',
        role: 'WORKER',
        reasoningEffort: 'xhigh',
        startedAt: '2025-01-01T00:00:00.000Z',
        completedAt: null,
        assessedAt: null,
        reconciledAt: null,
      }),
    SchemaValidationError,
  );
  assert.throws(() => stampSprintRecord('lcim.bogus', {}), /unknown sprint schema name/);
});

test('scenario fixture: successful run has exactly 1 START / 1 COMPLETION / 1 ASSESSMENT', async () => {
  const { validateLedger } = await import('../../src/logging/ledger.mjs');
  const events = readJson(path.join(SCENARIO_DIR, 'successful-run.events.json'));
  assert.equal(events.length, 3);
  assert.deepEqual(
    events.map((e) => e.kind),
    ['START', 'COMPLETION', 'ASSESSMENT'],
  );
  assert.equal(events[0].seq, 1);
  assert.equal(events[1].seq, 2);
  assert.equal(events[2].seq, 3);
  const validation = validateLedger(events);
  assert.deepEqual(validation.errors, [], 'scenario chain must validate');
  assert.equal(validation.summary.starts, 1);
  assert.equal(validation.summary.completions, 1);
  assert.equal(validation.summary.assessments, 1);
  assert.equal(validation.summary.incompleteInvocationIds.length, 0);
});

test('scenario fixture: orphaned run (START + RECONCILIATION) validates and closes the invocation', async () => {
  const { validateLedger } = await import('../../src/logging/ledger.mjs');
  const events = readJson(path.join(SCENARIO_DIR, 'orphaned-run.events.json'));
  assert.equal(events.length, 2);
  const validation = validateLedger(events);
  assert.deepEqual(validation.errors, [], 'orphaned scenario chain must validate');
  const state = validation.states.get(events[0].invocationId);
  assert.equal(state.status, 'ORPHANED');
  assert.equal(state.reconciliationReason, 'CRASH_AFTER_START');
  assert.equal(validation.summary.reconciliations, 1);
});

test('scenario fixture: genesis chaining is explicit (prevDigest = 64 zeros)', async () => {
  const events = readJson(path.join(SCENARIO_DIR, 'successful-run.events.json'));
  assert.equal(events[0].prevDigest, '0'.repeat(64));
  assert.equal(events[1].prevDigest, events[0].digest);
  assert.equal(events[2].prevDigest, events[1].digest);
});
