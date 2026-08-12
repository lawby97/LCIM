/**
 * Sprint 01 crash/orphan reconciliation tests.
 *
 * Crashes at each lifecycle point must produce recoverable/orphan states
 * WITHOUT deleting evidence:
 * - crash after START  -> reopen, reconcileOrphans -> ORPHANED
 * - crash after COMPLETION -> reopen, reconcile -> SUPERSEDED (with a
 *   replacement invocation)
 * - finalize without reconciliation -> INCOMPLETE_LEDGER, evidence intact
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeRunStore, generateId, invocationParams } from '../helpers/logging-fixture.mjs';
import { EVENTS_FILE } from '../../src/logging/ledger.mjs';
import { INVOCATIONS_DIR, RUN_JSON, validateRunStore } from '../../src/logging/reader.mjs';
import { RunStore } from '../../src/runtime/run-store.mjs';

const T0 = '2025-01-01T00:00:00.000Z';
const T1 = '2025-01-01T00:00:01.000Z';
const T2 = '2025-01-01T00:00:02.000Z';

test('crash after START: reopen, reconcile, finalize COMPLETED with evidence preserved', async (t) => {
  const { repo, store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  // simulate crash: no COMPLETION; a new session opens the store
  const reopened = await RunStore.open({ cwd: repo.root, runId: store.runId });

  const events = await reopened.reconcileOrphans({ occurredAt: T1 });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, 'RECONCILIATION');
  assert.equal(events[0].reconciliationReason, 'CRASH_AFTER_START');
  assert.equal(events[0].invocationId, inv.invocationId);

  // evidence preserved: 2 lines (START + RECONCILIATION), chain intact
  const lines = fs.readFileSync(path.join(store.runDir, EVENTS_FILE), 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  const record = await reopened.getInvocationRecord(inv.invocationId);
  assert.equal(record.status, 'ORPHANED');
  assert.equal(record.reconciledAt, T1);
  assert.equal(record.reconciliationReason, 'CRASH_AFTER_START');

  const finalized = await reopened.finalize();
  assert.equal(finalized.lifecycleState, 'COMPLETED');
  assert.deepEqual(finalized.finalSummary.incompleteInvocationIds, []);
  assert.equal(finalized.finalSummary.reconciliations, 1);

  const result = await reopened.validate();
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('crash after COMPLETION: supersede with a replacement, finalize COMPLETED', async (t) => {
  const { repo, store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const crashed = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await crashed.complete({ outcome: 'TIMEOUT', occurredAt: T1 });
  // crash; new session starts a replacement invocation then supersedes
  const reopened = await RunStore.open({ cwd: repo.root, runId: store.runId });
  const replacement = await reopened.startInvocation({ ...invocationParams(wu), occurredAt: T1 });
  await reopened.reconcileInvocation({
    invocationId: crashed.invocationId,
    reason: 'CRASH_AFTER_COMPLETION',
    replacementInvocationId: replacement.invocationId,
    occurredAt: T2,
  });
  await replacement.complete({ outcome: 'SUCCESS', occurredAt: T2 });
  await replacement.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });

  const crashedRecord = await reopened.getInvocationRecord(crashed.invocationId);
  assert.equal(crashedRecord.status, 'SUPERSEDED');
  assert.equal(crashedRecord.supersededByInvocationId, replacement.invocationId);
  assert.equal(crashedRecord.reconciliationReason, 'CRASH_AFTER_COMPLETION');
  const replacementRecord = await reopened.getInvocationRecord(replacement.invocationId);
  assert.equal(replacementRecord.status, 'ASSESSED');

  const finalized = await reopened.finalize();
  assert.equal(finalized.lifecycleState, 'COMPLETED');
  assert.equal(finalized.finalSummary.events, 6);
  assert.equal(finalized.finalSummary.reconciliations, 1);
  const result = await reopened.validate();
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('finalize without reconciliation detects the incomplete lifecycle and marks INCOMPLETE_LEDGER', async (t) => {
  const { repo, store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  const eventsBefore = fs.readFileSync(path.join(store.runDir, EVENTS_FILE), 'utf8');
  const recordBefore = fs.readFileSync(path.join(store.runDir, INVOCATIONS_DIR, `${inv.invocationId}.json`), 'utf8');

  const reopened = await RunStore.open({ cwd: repo.root, runId: store.runId });
  const finalized = await reopened.finalize();
  assert.equal(finalized.lifecycleState, 'INCOMPLETE_LEDGER');
  assert.deepEqual(finalized.finalSummary.incompleteInvocationIds, [inv.invocationId]);

  // evidence is preserved: ledger and invocation record untouched
  assert.equal(fs.readFileSync(path.join(store.runDir, EVENTS_FILE), 'utf8'), eventsBefore);
  assert.equal(
    fs.readFileSync(path.join(store.runDir, INVOCATIONS_DIR, `${inv.invocationId}.json`), 'utf8'),
    recordBefore,
  );
  const runRecord = JSON.parse(fs.readFileSync(path.join(store.runDir, RUN_JSON), 'utf8'));
  assert.equal(runRecord.lifecycleState, 'INCOMPLETE_LEDGER');
  assert.deepEqual(runRecord.finalSummary.incompleteInvocationIds, [inv.invocationId]);

  // the store is internally consistent: validator reports the incompleteness
  // in the summary, not as an integrity error
  const result = await reopened.validate();
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual(result.summary.incompleteInvocationIds, [inv.invocationId]);
});

test('crash after COMPLETION without reconciliation: INCOMPLETE_LEDGER lists the invocation', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  const finalized = await store.finalize();
  assert.equal(finalized.lifecycleState, 'INCOMPLETE_LEDGER');
  assert.deepEqual(finalized.finalSummary.incompleteInvocationIds, [inv.invocationId]);
  assert.equal(finalized.finalSummary.completions, 1);
  assert.equal(finalized.finalSummary.assessments, 0);
});

test('reconciliation requires an existing START and a STARTED/COMPLETED state', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const unknown = generateId('invocation');
  await assert.rejects(
    store.reconcileInvocation({ invocationId: unknown, reason: 'CRASH_AFTER_START' }),
    /unknown invocation/,
  );
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });
  // an ASSESSED invocation can never be reconciled
  await assert.rejects(
    store.reconcileInvocation({ invocationId: inv.invocationId, reason: 'CRASH_AFTER_START' }),
    /only STARTED\/COMPLETED/,
  );
  // replacement must differ from the superseded invocation and must exist
  const started = await store.startInvocation({ ...invocationParams(wu), occurredAt: T2 });
  await assert.rejects(
    store.reconcileInvocation({ invocationId: started.invocationId, reason: 'CRASH_AFTER_START', replacementInvocationId: started.invocationId }),
    /must differ/,
  );
});

test('reconciliation supersession requires the replacement to have started first', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const crashed = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  const replacementId = generateId('invocation');
  await assert.rejects(
    store.reconcileInvocation({
      invocationId: crashed.invocationId,
      reason: 'CRASH_AFTER_START',
      replacementInvocationId: replacementId,
    }),
    /has no START/,
  );
  const replacement = await store.startInvocation({ ...invocationParams(wu), occurredAt: T1 });
  await store.reconcileInvocation({
    invocationId: crashed.invocationId,
    reason: 'CRASH_AFTER_START',
    replacementInvocationId: replacement.invocationId,
    occurredAt: T2,
  });
  const record = await store.getInvocationRecord(crashed.invocationId);
  assert.equal(record.status, 'SUPERSEDED');
});

test('duplicate-in-file lifecycle events are detected on open (fail closed)', async (t) => {
  const { repo, store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  // tamper: append a properly-chained duplicate START manually
  const { canonicalJson, sha256Hex } = await import('../../src/logging/digest.mjs');
  const events = await store.readEvents();
  const dup = {
    schemaName: 'lcim.event',
    schemaVersion: '1.0.0',
    runId: store.runId,
    seq: 3,
    kind: 'START',
    invocationId: inv.invocationId,
    workUnitId: wu,
    occurredAt: T2,
    prevDigest: events[1].digest,
    provider: 'deepseek',
    model: 'deepseek-flash',
    role: 'WORKER',
    reasoningEffort: 'xhigh',
  };
  dup.digest = sha256Hex(canonicalJson(dup));
  fs.appendFileSync(path.join(store.runDir, EVENTS_FILE), `${canonicalJson(dup)}\n`);

  await assert.rejects(
    RunStore.open({ cwd: repo.root, runId: store.runId }),
    /duplicate START/,
  );
});
