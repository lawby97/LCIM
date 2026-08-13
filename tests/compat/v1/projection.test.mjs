/**
 * Sprint 09 tests: V1 -> V2 compatibility projection semantics.
 *
 * Every projection carries provenance V1_COMPAT; every unavailable fact is
 * the reserved sentinel UNKNOWN_V1. Never emitted: V2 controller
 * dispositions, V2 worker status for PATCH_READY, usage/cost numbers,
 * "not integrated", "no findings", "failed implementation", patch
 * uselessness from a schema-invalid handoff, or zero activity from missing
 * later coverage.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readV1History, validateCompatRecord, UNKNOWN_V1, V1_COMPAT } from '../../../src/compat/v1/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'compat', 'v1');

function readRaw(rel) {
  return fs.readFileSync(path.join(FIXTURES, rel), 'utf8');
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

test('valid V1 lifecycle: complete, unambiguous, provenance V1_COMPAT', () => {
  const text = readRaw('ledger/valid-lifecycle.json');
  const { projection } = readV1History(text);
  assert.equal(projection.provenance, V1_COMPAT);
  assert.equal(projection.sourceKind, 'ledger');
  assert.equal(projection.sourceVersion, '1.0');
  assert.equal(projection.sourceByteCount, Buffer.byteLength(text, 'utf8'));
  assert.equal(projection.sourceDigest, sha256(text));
  assert.deepEqual(projection.ledger, { eventCount: 3, chainValid: true, workUnitCount: 1 });

  const [wu] = projection.workUnits;
  assert.equal(wu.workUnitId, 'wu-0001');
  assert.equal(wu.workUnitIdV2PatternCompatible, false); // free-form V1 id
  assert.equal(wu.assignment.present, true);
  assert.equal(wu.assignment.taskSummary, 'Implement the V1 compatibility reader and its tests.');
  assert.equal(wu.assignment.baseShaClaim, 'a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4'); // claim, not fact
  assert.equal(wu.handoff.present, true);
  assert.equal(wu.handoff.parseable, true);
  assert.equal(wu.handoff.normalization, 'none');
  assert.equal(wu.handoff.historicallySchemaValid, true);
  assert.equal(wu.handoff.defect, 'NONE');
  assert.equal(wu.handoff.workerClaim.status, 'WORK_COMPLETE');
  assert.equal(wu.handoff.workerClaim.evidenceRefCount, 1);
  assert.equal(wu.patch.usefulness, 'USEFUL'); // established by MANUAL_INTEGRATION action
  assert.equal(wu.patch.preserved, true);
  assert.equal(wu.controller.manualIntegrationObserved, true);
  assert.equal(wu.controller.v2Disposition, UNKNOWN_V1); // never a V2 disposition
  assert.equal(wu.coverage.laterLedgerCoverageKnown, true);
  assert.equal(wu.coverage.laterEventCount, 1);
  assert.equal(wu.coverage.incomplete, false);
  assert.equal(wu.coverage.laterInvocationRecords, UNKNOWN_V1);
  assert.equal(wu.usageCost.tokens, UNKNOWN_V1); // never 0 tokens
  assert.equal(wu.usageCost.cost, UNKNOWN_V1); // never $0
  assert.equal(wu.semanticReview.findings, UNKNOWN_V1); // never "no findings"
});

test('incomplete ledger: missing later coverage is incomplete/UNKNOWN_V1, never zero activity', () => {
  const { projection } = readV1History(readRaw('ledger/incomplete-ledger.txt'));
  const [wu2, wu3] = projection.workUnits;
  // wu-0002: ledger continued (wu-0003 events follow) but wu-0002 has no
  // later events -> visibly incomplete, NOT zero later activity.
  assert.equal(wu2.workUnitId, 'wu-0002');
  assert.equal(wu2.coverage.incomplete, true);
  assert.equal(wu2.coverage.laterLedgerCoverageKnown, false);
  assert.equal(wu2.coverage.laterEventCount, UNKNOWN_V1); // not 0
  assert.equal(wu2.controller.manualIntegrationObserved, UNKNOWN_V1); // not false / "not integrated"
  assert.equal(wu2.patch.usefulness, UNKNOWN_V1); // PATCH_READY claim alone proves nothing
  assert.equal(wu2.handoff.workerClaim.status, 'PATCH_READY');
  assert.equal(wu2.handoff.workerClaim.v2WorkerStatus, UNKNOWN_V1); // not promoted
  // wu-0003: complete
  assert.equal(wu3.coverage.incomplete, false);
  assert.equal(wu3.controller.manualIntegrationObserved, true);
  assert.equal(wu3.patch.usefulness, 'USEFUL');
});

test('schema-invalid handoff + manual integration: BL-020 distinction preserved', () => {
  const { projection } = readV1History(readRaw('ledger/schema-invalid-handoff-manual-integration.txt'));
  const [wu] = projection.workUnits;
  assert.equal(wu.handoff.parseable, true);
  assert.equal(wu.handoff.historicallySchemaValid, false); // NOT pretended V2-valid
  assert.equal(wu.handoff.v2WorkerSchemaValid, false);
  assert.equal(wu.handoff.defect, 'SCHEMA_MISMATCH');
  assert.equal(wu.handoff.workerClaim.status, 'DEFINITELY_READY');
  // schema-invalid handoff does NOT prove the patch was useless:
  assert.equal(wu.patch.usefulness, 'USEFUL'); // independent evidence: controller manually integrated
  assert.equal(wu.patch.preserved, true);
  assert.equal(wu.controller.manualIntegrationObserved, true);
  assert.ok(wu.patch.usefulnessEvidence.includes('manually integrated'));
});

test('schema-invalid handoff WITHOUT controller evidence: usefulness stays UNKNOWN_V1, not NOT_USEFUL', () => {
  const text = fs.readFileSync(path.join(FIXTURES, 'handoff', 'schema-invalid-status.txt'), 'utf8');
  const { projection } = readV1History(text);
  const [wu] = projection.workUnits;
  assert.equal(wu.handoff.parseable, true);
  assert.equal(wu.handoff.historicallySchemaValid, false);
  assert.equal(wu.patch.usefulness, UNKNOWN_V1);
  assert.equal(wu.patch.preserved, true);
  assert.equal(wu.controller.manualIntegrationObserved, UNKNOWN_V1);
});

test('REJECTION later action: recorded historically, never a V2 disposition, never proof of uselessness', () => {
  const { projection } = readV1History(readRaw('ledger/hash-chain.txt'));
  const [wu] = projection.workUnits;
  assert.equal(wu.controller.v1RejectionObserved, true);
  assert.equal(wu.controller.manualIntegrationObserved, UNKNOWN_V1);
  assert.equal(wu.controller.v2Disposition, UNKNOWN_V1);
  assert.equal(wu.patch.usefulness, UNKNOWN_V1); // rejection ≠ useless
  assert.equal(wu.coverage.incomplete, false); // the rejection IS later coverage
  assert.equal(wu.coverage.laterEventCount, 1);
});

test('missing later invocation records: history ends early, visibly incomplete', () => {
  const { projection } = readV1History(readRaw('ledger/missing-later-invocations.txt'));
  const [wu] = projection.workUnits;
  assert.equal(wu.coverage.incomplete, true);
  assert.equal(wu.coverage.laterLedgerCoverageKnown, false);
  assert.equal(wu.coverage.laterEventCount, UNKNOWN_V1);
  assert.equal(wu.coverage.laterInvocationRecords, UNKNOWN_V1);
  assert.equal(wu.handoff.workerClaim.testLogPath, UNKNOWN_V1); // null path in the handoff
});

test('response-ref-only handoff: response evidence unavailable -> facts UNKNOWN_V1, not malformed', () => {
  const { projection } = readV1History(readRaw('ledger/handoff-response-ref-only.txt'));
  const [wu] = projection.workUnits;
  assert.equal(wu.handoff.present, true);
  assert.equal(wu.handoff.parseable, UNKNOWN_V1);
  assert.equal(wu.handoff.historicallySchemaValid, UNKNOWN_V1);
  assert.equal(wu.handoff.defect, UNKNOWN_V1);
  assert.equal(wu.handoff.workerClaim.status, UNKNOWN_V1);
  assert.equal(wu.coverage.incomplete, true);
});

test('standalone handoff source: no ledger context, worker claims only', () => {
  const { projection } = readV1History(readRaw('handoff/patch-ready-handoff.txt'));
  assert.equal(projection.sourceKind, 'handoff');
  const [wu] = projection.workUnits;
  assert.equal(wu.workUnitId, 'lcim_wu_0123456789abcdef0123456789abcdef');
  assert.equal(wu.workUnitIdV2PatternCompatible, true);
  assert.equal(wu.assignment.present, false);
  assert.equal(wu.assignment.taskSummary, UNKNOWN_V1);
  assert.equal(wu.handoff.workerClaim.status, 'PATCH_READY');
  assert.equal(wu.handoff.workerClaim.v2WorkerStatus, UNKNOWN_V1);
  assert.equal(wu.patch.usefulness, UNKNOWN_V1); // worker claims never establish usefulness
  assert.equal(wu.controller.v2Disposition, UNKNOWN_V1);
  assert.equal(wu.coverage.incomplete, UNKNOWN_V1); // no ledger context
});

test('final-response source kind is recorded as response', () => {
  const { projection } = readV1History(readRaw('response/fenced-response.txt'), { kind: 'response' });
  assert.equal(projection.sourceKind, 'response');
  assert.equal(projection.workUnits[0].handoff.normalization, 'fence');
  assert.equal(projection.workUnits[0].handoff.workerClaim.evidenceRefCount, 2);
});

test('missing workUnitId: id and pattern compatibility are UNKNOWN_V1, never false', () => {
  const { projection } = readV1History(
    JSON.stringify({ workerStatus: 'PATCH_READY', summary: 'No work unit id recorded.' }),
  );
  const [wu] = projection.workUnits;
  assert.equal(wu.workUnitId, UNKNOWN_V1);
  // Unknown compatibility is never known incompatibility: the sentinel
  // must not be judged against the V2 regex.
  assert.equal(wu.workUnitIdV2PatternCompatible, UNKNOWN_V1);
});

test('wrong-typed workUnitId: unavailable -> UNKNOWN_V1 compatibility, not false', () => {
  const { projection } = readV1History(
    JSON.stringify({ workUnitId: 12345, workerStatus: 'WORK_COMPLETE', summary: 'Wrong-typed id.' }),
  );
  const [wu] = projection.workUnits;
  assert.equal(wu.workUnitId, UNKNOWN_V1);
  assert.equal(wu.workUnitIdV2PatternCompatible, UNKNOWN_V1);
});

test('concrete workUnitId: pattern compatibility is a boolean fact only', () => {
  const matching = readV1History(
    JSON.stringify({
      workUnitId: 'lcim_wu_0123456789abcdef0123456789abcdef',
      workerStatus: 'WORK_COMPLETE',
      summary: 'V2-shaped id.',
    }),
  );
  assert.equal(matching.projection.workUnits[0].workUnitId, 'lcim_wu_0123456789abcdef0123456789abcdef');
  assert.equal(matching.projection.workUnits[0].workUnitIdV2PatternCompatible, true);

  const nonMatching = readV1History(
    JSON.stringify({ workUnitId: 'wu-0001', workerStatus: 'WORK_COMPLETE', summary: 'Free-form id.' }),
  );
  assert.equal(nonMatching.projection.workUnits[0].workUnitId, 'wu-0001');
  assert.equal(nonMatching.projection.workUnits[0].workUnitIdV2PatternCompatible, false);
});

test('every supported fixture produces a schema-valid projection with the pinned UNKNOWN_V1 fields', () => {
  const supported = [
    'ledger/valid-lifecycle.json',
    'ledger/incomplete-ledger.txt',
    'ledger/hash-chain.txt',
    'ledger/schema-invalid-handoff-manual-integration.txt',
    'ledger/missing-later-invocations.txt',
    'ledger/handoff-response-ref-only.txt',
    'handoff/valid-v1-handoff.txt',
    'handoff/patch-ready-handoff.txt',
    'handoff/schema-invalid-status.txt',
    'handoff/schema-invalid-type.txt',
    'handoff/missing-test-log-path.txt',
    'handoff/legacy-evidence-array.txt',
    'handoff/empty-evidence-list.txt',
    'response/fenced-response.txt',
    'response/prose-wrapped-response.txt',
  ];
  for (const rel of supported) {
    const text = readRaw(rel);
    const { projection } = readV1History(text);
    const result = validateCompatRecord('lcim.v1.projection', projection);
    assert.equal(result.valid, true, `projection for ${rel} must be schema-valid: ${result.errors.map((e) => e.message).join('; ')}`);
    for (const wu of projection.workUnits) {
      assert.equal(wu.controller.v2Disposition, UNKNOWN_V1);
      assert.equal(wu.usageCost.tokens, UNKNOWN_V1);
      assert.equal(wu.usageCost.cost, UNKNOWN_V1);
      assert.equal(wu.semanticReview.findings, UNKNOWN_V1);
      assert.equal(wu.coverage.laterInvocationRecords, UNKNOWN_V1);
      assert.equal(wu.patch.preserved, true);
      assert.notEqual(wu.patch.usefulness, 'NOT_USEFUL'); // never emitted by v1.0 normalization
      // absence of integration evidence is never "not integrated"
      assert.ok(wu.controller.manualIntegrationObserved === true || wu.controller.manualIntegrationObserved === UNKNOWN_V1);
      assert.ok(wu.controller.v1RejectionObserved === true || wu.controller.v1RejectionObserved === UNKNOWN_V1);
    }
  }
});
