/**
 * Sprint 02 tests: worker contract and worker-result schema.
 *
 * Acceptance hooks:
 * - Worker cannot claim PATCH_READY in the V2 schema.
 * - Objective evidence fields from V1 are absent from the worker schema.
 * - Legacy `evidence` (string/array) and null log-path patterns are
 *   schema-invalid (SCHEMA_MISMATCH, not silently repaired).
 * - The payload is model-owned communication only; envelope metadata is
 *   controller-stamped.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadWorkerResultSchema,
  validateWorkerResult,
  assertWorkerResult,
} from '../../src/handoff/validate.mjs';
import {
  WORKER_RESULT_SCHEMA_NAME,
  WORKER_RESULT_SCHEMA_VERSION,
  WORKER_OWNED_FIELDS,
  ACCEPTANCE_CLAIM_OWNED_FIELDS,
  WORKER_FORBIDDEN_FIELDS,
  listObjectiveEvidenceViolations,
  isWorkerOwnedField,
} from '../../src/workers/contract.mjs';
import { SchemaValidationError } from '../../src/shared/errors.mjs';
import { WORKER_STATUS } from '../../src/shared/enums.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HANDOFF_FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'handoffs');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(HANDOFF_FIXTURES, file), 'utf8'));
}

test('worker-result schema loads through the shared engine (schema definition is supported)', () => {
  const schema = loadWorkerResultSchema();
  assert.equal(schema.$id, 'https://lcim.local/schemas/worker-result.v2.schema.json');
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
});

test('schema property keys equal the code-side WORKER_OWNED_FIELDS allow-list', () => {
  const schema = loadWorkerResultSchema();
  assert.deepEqual(Object.keys(schema.properties).sort(), [...WORKER_OWNED_FIELDS].sort());
  const claimItem = schema.properties.acceptanceClaims.items;
  assert.deepEqual(Object.keys(claimItem.properties).sort(), [...ACCEPTANCE_CLAIM_OWNED_FIELDS].sort());
  for (const field of WORKER_OWNED_FIELDS) {
    assert.equal(isWorkerOwnedField(field), true);
  }
});

test('worker cannot claim PATCH_READY in the V2 schema', () => {
  // 1. The vocabulary has no PATCH_READY.
  assert.equal(WORKER_STATUS.includes('PATCH_READY'), false);
  // 2. The schema text never mentions PATCH_READY (not even as an allowed value).
  const schemaText = fs.readFileSync(path.join(ROOT, 'schemas', 'worker-result.v2.schema.json'), 'utf8');
  assert.equal(schemaText.includes('PATCH_READY'), false);
  // 3. A payload claiming PATCH_READY fails validation.
  const fixture = readJson('invalid-worker-result-patch-ready.json');
  const result = validateWorkerResult(fixture);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.path === 'workerStatus'),
    `expected a workerStatus enum error, got: ${JSON.stringify(result.errors)}`,
  );
  assert.throws(() => assertWorkerResult(fixture), SchemaValidationError);
});

test('controller dispositions are never valid worker statuses', () => {
  const base = readJson('valid-worker-result.json');
  for (const disposition of ['PATCH_VALID', 'SEMANTICALLY_ACCEPTED', 'CANDIDATE_INTEGRATED', 'REVIEW_APPROVED', 'REJECTED', 'REVIEW_REQUIRED']) {
    const result = validateWorkerResult({ ...base, workerStatus: disposition });
    assert.equal(result.ok, false, `workerStatus must reject ${disposition}`);
    assert.ok(
      result.errors.some((e) => e.path === 'workerStatus'),
      `expected a workerStatus enum error for ${disposition}: ${JSON.stringify(result.errors)}`,
    );
  }
});

test('objective evidence fields from V1 are absent from the worker schema', () => {
  const schemaText = fs.readFileSync(path.join(ROOT, 'schemas', 'worker-result.v2.schema.json'), 'utf8');
  const schema = loadWorkerResultSchema();
  for (const field of Object.keys(WORKER_FORBIDDEN_FIELDS)) {
    assert.equal(field in schema.properties, false, `schema must not define ${field}`);
    assert.equal(schemaText.includes(`"${field}"`), false, `schema text must not mention ${field}`);
  }
});

test('a payload smuggling V1 objective evidence is schema-invalid with precise diagnostics', () => {
  const fixture = readJson('invalid-worker-result-objective-evidence.json');
  const result = validateWorkerResult(fixture);
  assert.equal(result.ok, false);
  const violations = listObjectiveEvidenceViolations(fixture);
  const fields = violations.map((v) => v.field);
  for (const field of ['changedFiles', 'lineCount', 'patchHash', 'baseSha', 'headSha', 'testLogPath', 'testExitStatus', 'secretScan', 'integrationStatus']) {
    assert.ok(fields.includes(field), `expected a violation for ${field}, got ${fields}`);
  }
});

test('legacy V1 evidence (string and array) remains schema-invalid (SCHEMA_MISMATCH, never repaired)', () => {
  const stringCase = readJson('invalid-worker-result-legacy-evidence.json');
  const stringResult = validateWorkerResult(stringCase);
  assert.equal(stringResult.ok, false);
  assert.ok(
    stringResult.errors.some((e) => e.path === 'evidence'),
    `expected an evidence error, got: ${JSON.stringify(stringResult.errors)}`,
  );

  const arrayCase = readJson('invalid-worker-result-evidence-array-claim.json');
  const arrayResult = validateWorkerResult(arrayCase);
  assert.equal(arrayResult.ok, false);
  // the claim item carries legacy evidence and misses evidenceRefs
  assert.ok(
    arrayResult.errors.some((e) => e.path.startsWith('acceptanceClaims[0]')),
    `expected claim-level errors, got: ${JSON.stringify(arrayResult.errors)}`,
  );
});

test('V1 null log path is schema-invalid (additional property)', () => {
  const fixture = readJson('invalid-worker-result-null-log-path.json');
  const result = validateWorkerResult(fixture);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.path === 'testLogPath'),
    `expected a testLogPath error, got: ${JSON.stringify(result.errors)}`,
  );
});

test('envelope metadata is controller-stamped: schemaName/schemaVersion are invalid in the payload', () => {
  const fixture = readJson('invalid-worker-result-envelope.json');
  const result = validateWorkerResult(fixture);
  assert.equal(result.ok, false);
  const violations = listObjectiveEvidenceViolations(fixture).map((v) => v.field);
  assert.ok(violations.includes('schemaName'));
  assert.ok(violations.includes('schemaVersion'));
});

test('valid worker result validates and freezes via assertWorkerResult', () => {
  const fixture = readJson('valid-worker-result.json');
  const result = validateWorkerResult(fixture);
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  const frozen = assertWorkerResult(fixture);
  assert.ok(Object.isFrozen(frozen));
  assert.equal(frozen.workerStatus, 'WORK_COMPLETE');
  // every allowed status validates
  for (const status of WORKER_STATUS) {
    const r = validateWorkerResult({ ...fixture, workerStatus: status });
    assert.equal(r.ok, true, `${status} must validate`);
  }
});

test('required fields and id pattern are enforced', () => {
  const missingSummary = readJson('invalid-worker-result-missing-summary.json');
  const missing = validateWorkerResult(missingSummary);
  assert.equal(missing.ok, false);
  // the shared engine reports missing required properties at the root path
  assert.ok(
    missing.errors.some((e) => e.path === '' || e.message.includes("'summary'")),
    JSON.stringify(missing.errors),
  );

  const badId = readJson('invalid-worker-result-bad-id.json');
  const bad = validateWorkerResult(badId);
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.path === 'workUnitId'), JSON.stringify(bad.errors));

  // non-object payloads fail (type object)
  assert.equal(validateWorkerResult([1, 2]).ok, false);
  assert.equal(validateWorkerResult('not an object').ok, false);
  assert.equal(validateWorkerResult(null).ok, false);
});

test('contract identity constants are stable', () => {
  assert.equal(WORKER_RESULT_SCHEMA_NAME, 'lcim.worker-result');
  assert.equal(WORKER_RESULT_SCHEMA_VERSION, '2.0.0');
  assert.equal(WORKER_FORBIDDEN_FIELDS.patchReady.includes('PATCH_READY'), true);
});
