/**
 * Sprint 02 tests: transport/patch state separation.
 *
 * Acceptance hooks:
 * - Model process completion, response parsed, response schema valid, patch
 *   observed, and controller validation are separate states.
 * - A malformed response never erases the worktree/patch evidence and never
 *   marks the underlying isolated patch nonexistent.
 * - A worker-says-success handoff is a claim, not a controller decision.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assessHandoff,
  recordPatchObservation,
  summarizeForReport,
} from '../../src/handoff/assessment.mjs';
import { TRANSPORT_DEFECT } from '../../src/handoff/states.mjs';
import { ConfigError } from '../../src/shared/errors.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'handoffs');
const WORK_UNIT = 'lcim_wu_0123456789abcdef0123456789abcdef';

function readRaw(file) {
  return fs.readFileSync(path.join(FIXTURES, file), 'utf8');
}

function makeTmpRuntime(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s02-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('valid handoff: six separated states with independent response/process/patch/controller slots', (t) => {
  const runtime = makeTmpRuntime(t);
  const assessment = assessHandoff({
    workUnitId: WORK_UNIT,
    rawResponse: readRaw('strict-json.txt'),
    runtimeRoot: runtime,
  });
  // transport evidence: response content was received
  assert.equal(assessment.states.responseReceived, true);
  // objective process completion: unknown (null) until the controller supplies it
  assert.equal(assessment.states.modelProcessCompleted, null);
  assert.equal(assessment.states.responseParsed, true);
  assert.equal(assessment.states.responseSchemaValid, true);
  // patch observation and controller validation are NOT derived from
  // transport validity — they stay null until the controller acts.
  assert.equal(assessment.states.patchObserved, null);
  assert.equal(assessment.states.controllerValidated, null);
  assert.equal(assessment.parse.state, 'PARSED');
  assert.equal(assessment.parse.normalization, 'none');
  assert.equal(assessment.schema.state, 'VALID');
  assert.equal(assessment.transportDefect, null);
  assert.equal(assessment.patchPreserved, true);
  assert.equal(assessment.workerStatus, 'WORK_COMPLETE');
  assert.ok(Object.isFrozen(assessment));
});

test('malformed handoff: TRANSPORT_MALFORMED, patch evidence untouched and never marked nonexistent', (t) => {
  const runtime = makeTmpRuntime(t);
  // Simulate the isolated worktree: real patch evidence on disk.
  const worktreeDir = makeTmpRuntime(t);
  const patchFile = path.join(worktreeDir, 'patch.diff');
  fs.writeFileSync(patchFile, '--- a/src/x.mjs\n+++ b/src/x.mjs\n');

  const assessment = assessHandoff({
    workUnitId: WORK_UNIT,
    rawResponse: readRaw('malformed.txt'),
    runtimeRoot: runtime,
  });

  // 1. transport defect recorded, worker status never synthesized
  assert.equal(assessment.states.responseReceived, true);
  assert.equal(assessment.states.modelProcessCompleted, null);
  assert.equal(assessment.states.responseParsed, false);
  assert.equal(assessment.states.responseSchemaValid, false);
  assert.equal(assessment.parse.state, 'PARSE_FAILED');
  assert.equal(assessment.transportDefect, TRANSPORT_DEFECT.TRANSPORT_MALFORMED);
  assert.equal(assessment.workerStatus, null);
  assert.equal(assessment.workerResult, null);

  // 2. the patch evidence still exists on disk (nothing erased)
  assert.equal(fs.existsSync(patchFile), true);
  assert.equal(fs.readFileSync(patchFile, 'utf8').includes('src/x.mjs'), true);

  // 3. the assessment contains no "patch absent/nonexistent" semantics
  assert.equal(assessment.patchPreserved, true);
  assert.equal(assessment.states.patchObserved, null);
  const serialized = JSON.stringify(assessment);
  assert.equal(serialized.includes('ABSENT'), false);
  assert.equal(serialized.includes('NONEXISTENT'), false);
  assert.equal(serialized.includes('ERASED'), false);
  assert.equal(serialized.includes('DELETED'), false);
});

test('missing handoff: no synthesized worker status or failure, patch never marked nonexistent', (t) => {
  const runtime = makeTmpRuntime(t);
  const worktreeDir = makeTmpRuntime(t);
  const patchFile = path.join(worktreeDir, 'work.diff');
  fs.writeFileSync(patchFile, 'patch evidence\n');

  for (const missing of [undefined, null, '', '   \n']) {
    const assessment = assessHandoff({ workUnitId: WORK_UNIT, rawResponse: missing, runtimeRoot: runtime });
    assert.equal(assessment.states.responseReceived, false, JSON.stringify(missing));
    // empty/missing response is NOT proof of process failure or non-completion
    assert.equal(assessment.states.modelProcessCompleted, null, JSON.stringify(missing));
    assert.equal(assessment.parse.state, 'NO_RESPONSE');
    assert.equal(assessment.states.responseParsed, false);
    assert.equal(assessment.states.responseSchemaValid, false);
    assert.equal(assessment.transportDefect, null);
    assert.equal(assessment.workerStatus, null);
    assert.equal(assessment.patchPreserved, true);
    assert.equal(assessment.states.patchObserved, null);
    assert.equal(assessment.states.controllerValidated, null);
  }
  // no timeout/crash/provider-failure/orphan semantics are ever synthesized
  const serialized = JSON.stringify(assessHandoff({ workUnitId: WORK_UNIT, rawResponse: undefined }));
  for (const word of ['FAILED', 'CRASH', 'TIMEOUT', 'ORPHAN', 'PATCH_VALID', 'REJECTED']) {
    assert.equal(serialized.includes(word), false, `must not synthesize ${word}`);
  }
  // worktree evidence intact after all assessments
  assert.equal(fs.existsSync(patchFile), true);
});

test('parsed-but-schema-invalid handoff is SCHEMA_MISMATCH, patch still preserved', (t) => {
  const runtime = makeTmpRuntime(t);
  const assessment = assessHandoff({
    workUnitId: WORK_UNIT,
    rawResponse: readRaw('legacy-evidence-string.txt'),
    runtimeRoot: runtime,
  });
  assert.equal(assessment.states.responseParsed, true);
  assert.equal(assessment.states.responseSchemaValid, false);
  assert.equal(assessment.schema.state, 'INVALID');
  assert.equal(assessment.transportDefect, TRANSPORT_DEFECT.SCHEMA_MISMATCH);
  assert.equal(assessment.workerStatus, null);
  assert.equal(assessment.patchPreserved, true);
  assert.equal(assessment.states.patchObserved, null);
  // same defect class for the V1 null-log-path pattern
  const nullLog = assessHandoff({ workUnitId: WORK_UNIT, rawResponse: readRaw('null-log-path.txt') });
  assert.equal(nullLog.transportDefect, TRANSPORT_DEFECT.SCHEMA_MISMATCH);
});

test('correct BLOCKED handoff validates and keeps its model-owned content', () => {
  const assessment = assessHandoff({ workUnitId: WORK_UNIT, rawResponse: readRaw('correct-blocked.txt') });
  assert.equal(assessment.states.responseSchemaValid, true);
  assert.equal(assessment.workerStatus, 'BLOCKED');
  assert.deepEqual(assessment.workerResult.remainingIssues, ['Wait for the approval gate before continuing.']);
  assert.equal(assessment.workerResult.uncertainty.includes('unclear'), true);
  assert.equal(assessment.transportDefect, null);
});

test('worker says success: claim recorded verbatim, but no controller decision is derived', () => {
  const assessment = assessHandoff({ workUnitId: WORK_UNIT, rawResponse: readRaw('worker-says-success.txt') });
  assert.equal(assessment.states.responseSchemaValid, true);
  assert.equal(assessment.workerStatus, 'WORK_COMPLETE');
  assert.equal(assessment.workerResult.acceptanceClaims[0].claim, 'Feature implemented');
  // The controller has not validated anything: no disposition-like field
  // exists anywhere in the assessment.
  assert.equal(assessment.states.controllerValidated, null);
  const serialized = JSON.stringify(assessment);
  for (const disposition of ['PATCH_VALID', 'SEMANTICALLY_ACCEPTED', 'CANDIDATE_INTEGRATED', 'REVIEW_APPROVED']) {
    assert.equal(serialized.includes(disposition), false, `worker assessment must not contain ${disposition}`);
  }
  assert.equal(serialized.includes('PATCH_READY'), false);
});

test('S02-001-A: non-empty response with no process fact — parsing/validation proceed, nothing synthesized', (t) => {
  const runtime = makeTmpRuntime(t);
  const assessment = assessHandoff({
    workUnitId: WORK_UNIT,
    rawResponse: readRaw('strict-json.txt'),
    runtimeRoot: runtime,
  });
  assert.equal(assessment.states.responseReceived, true);
  assert.equal(assessment.states.modelProcessCompleted, null);
  assert.equal(assessment.states.responseParsed, true);
  assert.equal(assessment.states.responseSchemaValid, true);
  assert.equal(assessment.parse.state, 'PARSED');
  assert.equal(assessment.schema.state, 'VALID');
  assert.equal(assessment.states.controllerValidated, null);
  assert.equal(assessment.states.patchObserved, null);
  // workerStatus comes only from the valid worker response, never derived
  assert.equal(assessment.workerStatus, 'WORK_COMPLETE');
  const serialized = JSON.stringify(assessment);
  for (const disposition of ['PATCH_VALID', 'SEMANTICALLY_ACCEPTED', 'CANDIDATE_INTEGRATED', 'REVIEW_APPROVED']) {
    assert.equal(serialized.includes(disposition), false);
  }
});

test('S02-001-C: empty response with explicit process-completed observation keeps all states separate', (t) => {
  const runtime = makeTmpRuntime(t);
  const assessment = assessHandoff({
    workUnitId: WORK_UNIT,
    rawResponse: '',
    modelProcessCompleted: true,
    runtimeRoot: runtime,
  });
  assert.equal(assessment.states.responseReceived, false);
  assert.equal(assessment.states.modelProcessCompleted, true);
  assert.equal(assessment.states.responseParsed, false);
  assert.equal(assessment.states.responseSchemaValid, false);
  assert.equal(assessment.parse.state, 'NO_RESPONSE');
  assert.equal(assessment.transportDefect, null);
  // no workerStatus is invented, patch state is untouched, no disposition
  assert.equal(assessment.workerStatus, null);
  assert.equal(assessment.workerResult, null);
  assert.equal(assessment.states.patchObserved, null);
  assert.equal(assessment.patchPreserved, true);
  assert.equal(assessment.states.controllerValidated, null);
});

test('S02-001-D: explicit process-completion false is preserved distinctly from unknown', () => {
  const withResponse = assessHandoff({
    workUnitId: WORK_UNIT,
    rawResponse: readRaw('strict-json.txt'),
    modelProcessCompleted: false,
  });
  assert.equal(withResponse.states.responseReceived, true);
  assert.equal(withResponse.states.modelProcessCompleted, false);
  assert.notEqual(withResponse.states.modelProcessCompleted, null);

  // raw response presence never alters the supplied fact
  const withoutResponse = assessHandoff({
    workUnitId: WORK_UNIT,
    rawResponse: undefined,
    modelProcessCompleted: false,
  });
  assert.equal(withoutResponse.states.responseReceived, false);
  assert.equal(withoutResponse.states.modelProcessCompleted, false);
  assert.notEqual(withoutResponse.states.modelProcessCompleted, null);
  assert.equal(withoutResponse.workerStatus, null);
});

test('S02-001: assessHandoff fails closed on a non-boolean process observation', () => {
  for (const bad of ['yes', 1, 0, {}, [], 'true']) {
    assert.throws(
      () => assessHandoff({ workUnitId: WORK_UNIT, rawResponse: '{}', modelProcessCompleted: bad }),
      (err) => err instanceof ConfigError && err.code === 'CONFIG_INVALID',
      `expected ConfigError for ${JSON.stringify(bad)}`,
    );
  }
  // null/undefined (unknown) are accepted
  const unknown = assessHandoff({ workUnitId: WORK_UNIT, rawResponse: undefined, modelProcessCompleted: undefined });
  assert.equal(unknown.states.modelProcessCompleted, null);
});

test('S02-002-E: ambiguous fence/outside-object transport keeps patch state independent', (t) => {
  const runtime = makeTmpRuntime(t);
  const assessment = assessHandoff({
    workUnitId: WORK_UNIT,
    rawResponse: readRaw('fence-plus-outside-after.txt'),
    runtimeRoot: runtime,
  });
  // ambiguous transport: rejected, no object selected
  assert.equal(assessment.transportDefect, TRANSPORT_DEFECT.TRANSPORT_MALFORMED);
  assert.equal(assessment.parse.state, 'PARSE_FAILED');
  assert.equal(assessment.states.responseParsed, false);
  assert.equal(assessment.states.responseSchemaValid, false);
  assert.equal(assessment.workerStatus, null);
  assert.equal(assessment.workerResult, null);
  // patch state is untouched and never marked nonexistent
  assert.equal(assessment.states.patchObserved, null);
  assert.equal(assessment.patchPreserved, true);
  assert.equal(assessment.states.controllerValidated, null);
  // an existing patch observation is never erased: the controller can
  // still record one after an ambiguous transport
  const observed = recordPatchObservation(assessment, true);
  assert.equal(observed.states.patchObserved, true);
  assert.equal(observed.transportDefect, TRANSPORT_DEFECT.TRANSPORT_MALFORMED);
});

test('recordPatchObservation is the only way the patch state advances, and it works even after a malformed handoff', () => {
  const malformed = assessHandoff({ workUnitId: WORK_UNIT, rawResponse: readRaw('malformed.txt') });
  // transport-invalid handoff: patch state is still pending observation
  assert.equal(malformed.states.patchObserved, null);
  // the controller later observes real worktree evidence (Sprint 03 facts)
  const observed = recordPatchObservation(malformed, true);
  assert.equal(observed.states.patchObserved, true);
  assert.equal(observed.states.responseParsed, false); // other states unchanged
  assert.equal(observed.transportDefect, TRANSPORT_DEFECT.TRANSPORT_MALFORMED);
  // pure: the original assessment is unchanged
  assert.equal(malformed.states.patchObserved, null);
});

test('summarizeForReport references the preserved raw response but never embeds it', (t) => {
  const runtime = makeTmpRuntime(t);
  const secretMarker = 'SUPER_SECRET_MARKER_xyz';
  const raw = `{"workUnitId":"${WORK_UNIT}","workerStatus":"FAILED","summary":"${secretMarker}"}`;
  const assessment = assessHandoff({ workUnitId: WORK_UNIT, rawResponse: raw, runtimeRoot: runtime });

  const report = summarizeForReport(assessment);
  assert.equal(report.workerStatus, 'FAILED');
  assert.equal(report.rawResponseRef, path.join(runtime, 'handoffs', WORK_UNIT, 'raw-response.txt'));
  assert.equal(fs.existsSync(report.rawResponseRef), true);
  assert.equal(fs.readFileSync(report.rawResponseRef, 'utf8'), raw);
  // the report references the raw file; it does not embed raw content
  assert.equal(JSON.stringify(report).includes(secretMarker), false);
  // no controller disposition in the report
  assert.equal('disposition' in report, false);
  assert.equal(report.states.controllerValidated, null);
});

test('assessHandoff rejects an invalid work-unit id (programming error)', () => {
  assert.throws(() => assessHandoff({ workUnitId: 'nope', rawResponse: '{}' }), ConfigError);
});
