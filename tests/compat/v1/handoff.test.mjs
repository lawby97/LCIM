/**
 * Sprint 09 tests: V1 work-unit handoff interpretation.
 *
 * Keeps separate: transport parseability, historical V1 schema validity,
 * worker claim/status (PATCH_READY stays a worker claim), and the V2
 * worker-schema cross-check (read-only; never an acceptance fact).
 * Parseable-but-schema-invalid handoffs are explicitly non-V2-valid and
 * never erase patch evidence. Missing/null fields are UNKNOWN_V1, never
 * invented paths or "failed" verdicts.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseV1Handoff, readV1History, V1CompatError, UNKNOWN_V1 } from '../../../src/compat/v1/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'compat', 'v1');

function readRaw(rel) {
  return fs.readFileSync(path.join(FIXTURES, rel), 'utf8');
}

test('valid V1 handoff: parseable, historically V1-schema-valid, NOT V2-valid (legacy evidence field)', () => {
  const h = parseV1Handoff(readRaw('handoff/valid-v1-handoff.txt'));
  assert.equal(h.parseable, true);
  assert.equal(h.normalization, 'none');
  assert.equal(h.historicallySchemaValid, true);
  assert.equal(h.v2WorkerSchemaValid, false); // legacy `evidence` field is V2-forbidden
  assert.equal(h.defect, 'NONE');
  assert.equal(h.workerClaim.status, 'WORK_COMPLETE');
  assert.equal(h.workerClaim.v2WorkerStatus, 'WORK_COMPLETE'); // V2 vocab ⊂ V1 vocab
  assert.equal(h.workerClaim.evidenceRefCount, 1); // legacy string evidence -> 1 ref
});

test('PATCH_READY is a historical WORKER claim: verbatim, no V2 worker status, no promotion', () => {
  const h = parseV1Handoff(readRaw('handoff/patch-ready-handoff.txt'));
  assert.equal(h.parseable, true);
  assert.equal(h.historicallySchemaValid, true); // PATCH_READY is in the V1 vocabulary
  assert.equal(h.v2WorkerSchemaValid, false); // PATCH_READY is not a V2 worker status
  assert.equal(h.workerClaim.status, 'PATCH_READY');
  assert.equal(h.workerClaim.statusInV1Vocabulary, true);
  assert.equal(h.workerClaim.v2WorkerStatus, UNKNOWN_V1); // no V2 equivalent exists
});

test('evidence omitted entirely: evidenceRefCount is UNKNOWN_V1, never a zero', () => {
  const h = parseV1Handoff(readRaw('handoff/patch-ready-handoff.txt'));
  assert.equal(h.parseable, true);
  assert.equal(h.historicallySchemaValid, true);
  assert.equal(h.workerClaim.status, 'PATCH_READY');
  // The handoff omits evidence and all claim-level evidence fields:
  // omission establishes NO count — absence of evidence is never 0.
  assert.equal(h.workerClaim.evidenceRefCount, UNKNOWN_V1);
});

test('explicit empty evidence list: evidenceRefCount is KNOWN zero', () => {
  const h = parseV1Handoff(readRaw('handoff/empty-evidence-list.txt'));
  assert.equal(h.parseable, true);
  assert.equal(h.historicallySchemaValid, true);
  assert.equal(h.workerClaim.evidenceRefCount, 0); // explicit empty collection -> known 0
});

test('claim-level explicit empty evidence refs: known zero; omitted claim-level fields stay UNKNOWN_V1', () => {
  const h = parseV1Handoff(
    JSON.stringify({
      workUnitId: 'lcim_wu_0123456789abcdef0123456789abcdef',
      workerStatus: 'WORK_COMPLETE',
      summary: 'Claim with an explicit empty evidence refs list.',
      acceptanceClaims: [{ claim: 'c1', evidenceRefs: [] }, { claim: 'c2' }],
    }),
  );
  assert.equal(h.historicallySchemaValid, true);
  // c1's explicit empty list is a KNOWN_ZERO claim; c2 omits evidence
  // fields (establishes nothing) — the explicit count still wins.
  assert.equal(h.workerClaim.evidenceRefCount, 0);
});

test('present-but-null evidence is unavailable: evidenceRefCount is UNKNOWN_V1, never a zero', () => {
  const h = parseV1Handoff(
    JSON.stringify({
      workUnitId: 'lcim_wu_0123456789abcdef0123456789abcdef',
      workerStatus: 'WORK_COMPLETE',
      summary: 'Null evidence field.',
      evidence: null,
    }),
  );
  assert.equal(h.parseable, true);
  assert.equal(h.historicallySchemaValid, false); // evidence must be string|array
  // malformed/unavailable evidence must not silently become zero
  assert.equal(h.workerClaim.evidenceRefCount, UNKNOWN_V1);
});

test('schema-invalid status: parseable = true, historicallySchemaValid = false', () => {
  const h = parseV1Handoff(readRaw('handoff/schema-invalid-status.txt'));
  assert.equal(h.parseable, true);
  assert.equal(h.historicallySchemaValid, false);
  assert.equal(h.v2WorkerSchemaValid, false);
  assert.equal(h.defect, 'SCHEMA_MISMATCH');
  assert.equal(h.workerClaim.status, 'DEFINITELY_READY'); // verbatim claim
  assert.equal(h.workerClaim.statusInV1Vocabulary, false);
  assert.equal(h.workerClaim.v2WorkerStatus, UNKNOWN_V1);
  assert.equal(h.workerClaim.patchHashClaim, '0123456789abcdef0123456789abcdef01234567');
  assert.ok(h.schemaErrors.some((e) => e.path === 'workerStatus'));
});

test('schema-invalid type: wrong-typed legacy field fails the V1 schema', () => {
  const h = parseV1Handoff(readRaw('handoff/schema-invalid-type.txt'));
  assert.equal(h.parseable, true);
  assert.equal(h.historicallySchemaValid, false);
  assert.equal(h.defect, 'SCHEMA_MISMATCH');
  assert.ok(h.schemaErrors.some((e) => e.path === 'lineCount'));
});

test('missing test log path: unavailable facts are UNKNOWN_V1, never invented or "failed"', () => {
  const h = parseV1Handoff(readRaw('handoff/missing-test-log-path.txt'));
  assert.equal(h.parseable, true);
  assert.equal(h.historicallySchemaValid, true); // null testLogPath is allowed by the V1 variant
  assert.equal(h.workerClaim.testLogPath, UNKNOWN_V1);
  assert.equal(h.workerClaim.testExitStatus, UNKNOWN_V1);
});

test('legacy evidence array + objective-evidence claims: counted, kept as claims', () => {
  const h = parseV1Handoff(readRaw('handoff/legacy-evidence-array.txt'));
  assert.equal(h.historicallySchemaValid, true);
  assert.equal(h.v2WorkerSchemaValid, false);
  assert.equal(h.workerClaim.evidenceRefCount, 3); // 2 legacy + 1 claim-level
  assert.equal(h.workerClaim.changedFileCount, 1); // KNOWN_ZERO rule: present list is countable
  assert.equal(h.workerClaim.summary, 'V1 handoff with an evidence array and objective-evidence claims.');
});

test('fenced final response: normalization fence, claims extracted', () => {
  const h = parseV1Handoff(readRaw('response/fenced-response.txt'));
  assert.equal(h.parseable, true);
  assert.equal(h.normalization, 'fence');
  assert.equal(h.historicallySchemaValid, true);
  assert.equal(h.workerClaim.status, 'WORK_COMPLETE');
  assert.equal(h.workerClaim.evidenceRefCount, 2);
});

test('prose-wrapped final response: normalization prose-wrapped, claims extracted', () => {
  const h = parseV1Handoff(readRaw('response/prose-wrapped-response.txt'));
  assert.equal(h.parseable, true);
  assert.equal(h.normalization, 'prose-wrapped');
  assert.equal(h.historicallySchemaValid, true);
  assert.equal(h.workerClaim.status, 'BLOCKED');
  assert.equal(h.workerClaim.v2WorkerStatus, 'BLOCKED');
});

test('malformed response text: transport defect, all claims UNKNOWN_V1, never inferred', () => {
  const h = parseV1Handoff(readRaw('response/malformed-response.txt'));
  assert.equal(h.parseable, false);
  assert.equal(h.defect, 'TRANSPORT_MALFORMED');
  assert.equal(h.historicallySchemaValid, UNKNOWN_V1);
  assert.equal(h.v2WorkerSchemaValid, UNKNOWN_V1);
  assert.equal(h.workerClaim.status, UNKNOWN_V1);
  assert.equal(h.workerClaim.summary, UNKNOWN_V1);
  assert.equal(h.workerClaim.evidenceRefCount, UNKNOWN_V1);
});

test('empty/missing response evidence: defect is UNKNOWN_V1 (absence is not malformed)', () => {
  const h = parseV1Handoff('');
  assert.equal(h.parseable, false);
  assert.equal(h.defect, UNKNOWN_V1);
  assert.equal(h.workerClaim.status, UNKNOWN_V1);
  const h2 = parseV1Handoff(null);
  assert.equal(h2.parseable, false);
  assert.equal(h2.workerClaim.testLogPath, UNKNOWN_V1);
});

test('a schema-invalid handoff never erases the patch: preserved invariant holds via projection', () => {
  const h = parseV1Handoff(readRaw('handoff/schema-invalid-status.txt'));
  assert.equal(h.parseable, true);
  assert.equal(h.historicallySchemaValid, false);
  // No "no patch" / "failed implementation" representation exists on the
  // interpretation: the only patch facts live on the projection and are
  // tested in projection.test.mjs (patch.preserved === true always).
  assert.ok(!('patch' in h));
});

test('unknown workerStatus with no V1 context is rejected by the reader path', () => {
  assert.throws(
    () => readV1History('{"workerStatus":"SUMMONED"}'),
    (err) => err instanceof V1CompatError,
  );
});
