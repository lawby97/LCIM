/**
 * Sprint 00 unit tests: shared enums and state separation.
 *
 * Acceptance hook: shared lifecycle states explicitly separate worker status
 * from controller disposition (V2 principle 5; V1 failure class C1).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORKER_STATUS,
  CONTROLLER_DISPOSITION,
  CONTROLLER_ONLY_DISPOSITIONS,
  RUN_STATUS,
  INVOCATION_EVENT_KIND,
  WORK_UNIT_STATUS,
  REVIEW_FINDING_SEVERITY,
  REJECTION_CODE,
  ENUM_REGISTRY,
  isValidEnum,
  assertEnum,
} from '../../src/shared/enums.mjs';
import { ConfigError } from '../../src/shared/errors.mjs';

test('every enum is a non-empty list of unique uppercase identifiers', () => {
  for (const [name, values] of Object.entries(ENUM_REGISTRY)) {
    assert.ok(values.length >= 1, `${name} is empty`);
    assert.equal(new Set(values).size, values.length, `${name} has duplicates`);
    for (const v of values) {
      assert.match(v, /^[A-Z][A-Z0-9_]*$/, `${name} value ${v}`);
    }
  }
});

test('worker status vocabulary never contains PATCH_READY', () => {
  assert.equal(WORKER_STATUS.includes('PATCH_READY'), false);
  assert.deepEqual(WORKER_STATUS, ['WORK_COMPLETE', 'BLOCKED', 'FAILED', 'NO_CHANGE']);
});

test('worker status is disjoint from controller dispositions', () => {
  const worker = new Set(WORKER_STATUS);
  for (const d of CONTROLLER_DISPOSITION) {
    assert.equal(worker.has(d), false, `worker status contains controller disposition ${d}`);
  }
  for (const w of WORKER_STATUS) {
    assert.equal(CONTROLLER_DISPOSITION.includes(w), false, `controller disposition contains worker status ${w}`);
  }
});

test('controller-only dispositions are a subset of controller disposition', () => {
  for (const d of CONTROLLER_ONLY_DISPOSITIONS) {
    assert.equal(CONTROLLER_DISPOSITION.includes(d), true);
  }
  assert.deepEqual(CONTROLLER_ONLY_DISPOSITIONS, [
    'PATCH_VALID',
    'SEMANTICALLY_ACCEPTED',
    'CANDIDATE_INTEGRATED',
    'REVIEW_APPROVED',
  ]);
});

test('run status includes the incomplete-ledger state required by Sprint 01', () => {
  assert.equal(RUN_STATUS.includes('INCOMPLETE_LEDGER'), true);
});

test('invocation event kinds cover the canonical lifecycle plus reconciliation', () => {
  for (const kind of ['START', 'COMPLETION', 'ASSESSMENT']) {
    assert.equal(INVOCATION_EVENT_KIND.includes(kind), true);
  }
  assert.equal(INVOCATION_EVENT_KIND.includes('RECONCILIATION'), true);
});

test('rejection taxonomy covers every V1 failure class', () => {
  const code = new Set(REJECTION_CODE);
  // C1 worker self-report not authoritative
  assert.equal(code.has('UNSUPPORTED_CLAIM'), true);
  // C2 schema/transport mismatch
  assert.equal(code.has('TRANSPORT_MALFORMED'), true);
  assert.equal(code.has('SCHEMA_MISMATCH'), true);
  // C3 useful patch despite malformed handoff (transport is not patch validity)
  assert.equal(code.has('TRANSPORT_MALFORMED'), true);
  // C4 wrong-base candidates
  assert.equal(code.has('WRONG_BASE'), true);
  // C5 semantic contract conflation
  assert.equal(code.has('SEMANTIC_CONFLATION'), true);
  assert.equal(code.has('UNRESOLVED_SEMANTICS'), true);
  // C6 incomplete ledger
  assert.equal(code.has('INCOMPLETE_LEDGER'), true);
  // C7 generic SOL review too broad
  assert.equal(code.has('SOL_ASK_INVALID'), true);
});

test('isValidEnum/assertEnum behave', () => {
  assert.equal(isValidEnum('workerStatus', 'BLOCKED'), true);
  assert.equal(isValidEnum('workerStatus', 'PATCH_READY'), false);
  assert.equal(isValidEnum('controllerDisposition', 'PATCH_VALID'), true);
  assert.equal(isValidEnum('controllerDisposition', 'WORK_COMPLETE'), false);
  assert.equal(isValidEnum('bogus', 'X'), false);
  assert.doesNotThrow(() => assertEnum('rejectionCode', 'WRONG_BASE'));
  assert.throws(() => assertEnum('rejectionCode', 'NOPE'), ConfigError);
});
