/**
 * Sprint 01 stale-session regression tests (SOL-S01-001).
 *
 * The ON-DISK run.json lifecycleState is authoritative for every mutation.
 * A RunStore opened while a run was OPEN must not be able to append,
 * finalize, or abort after ANOTHER session (same store directory, linked
 * worktree, or other process) made the run terminal: every stale mutation
 * must fail closed with LedgerFinalizedError while holding the run lock
 * and performing ZERO writes (run.json, events.v2.jsonl, and invocation
 * projections stay byte-identical; the terminal record and its ledger
 * anchor stay intact; validation still succeeds).
 *
 * Legitimate multi-session OPEN-run use (interleaved appends through the
 * shared lock) must keep working.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeRunStore, generateId, invocationParams } from '../helpers/logging-fixture.mjs';
import { RunStore } from '../../src/runtime/run-store.mjs';
import { EVENTS_FILE } from '../../src/logging/ledger.mjs';
import { RUN_JSON, validateRunStore } from '../../src/logging/reader.mjs';
import { LedgerFinalizedError } from '../../src/logging/errors.mjs';

const T0 = '2025-01-01T00:00:00.000Z';
const T1 = '2025-01-01T00:00:01.000Z';
const T2 = '2025-01-01T00:00:02.000Z';

/** Run a complete invocation lifecycle: START, COMPLETION, ASSESSMENT. */
async function completeLifecycle(store, workUnitId) {
  const inv = await store.startInvocation({ ...invocationParams(workUnitId), occurredAt: T0 });
  await inv.complete({
    outcome: 'SUCCESS',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    occurredAt: T1,
  });
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });
  return inv;
}

/**
 * Assert that a rejected stale mutation changed zero bytes: run.json and
 * events.v2.jsonl are byte-identical, no invocation projection appeared,
 * the terminal lifecycle state is unchanged, and the store still
 * validates. Returns the current on-disk run record.
 */
function assertStoreBytesIntact(runDir, runJsonBefore, eventsBefore, invocationsBefore, lifecycleState) {
  assert.equal(
    fs.readFileSync(path.join(runDir, RUN_JSON), 'utf8'),
    runJsonBefore,
    'run.json must be byte-identical after a rejected stale mutation',
  );
  assert.equal(
    fs.readFileSync(path.join(runDir, EVENTS_FILE), 'utf8'),
    eventsBefore,
    'events.v2.jsonl must be byte-identical after a rejected stale mutation',
  );
  assert.deepEqual(
    fs.readdirSync(path.join(runDir, 'invocations')).sort(),
    invocationsBefore,
    'no invocation projections may be created by a rejected stale mutation',
  );
  const result = validateRunStore(runDir);
  assert.equal(result.valid, true, `store must stay valid after a rejected stale mutation: ${JSON.stringify(result.errors)}`);
  const record = JSON.parse(fs.readFileSync(path.join(runDir, RUN_JSON), 'utf8'));
  assert.equal(record.lifecycleState, lifecycleState);
  return record;
}

test('stale session cannot append/finalize/abort after another session FINALIZED the run (SOL-S01-001)', async (t) => {
  const { repo, store: a } = await makeRunStore(t);
  const b = await RunStore.open({ cwd: repo.root, runId: a.runId });

  // both sessions opened the run while OPEN
  assert.equal(a.finalState, null);
  assert.equal(b.finalState, null);

  const inv = await completeLifecycle(a, generateId('work-unit'));
  const finalized = await a.finalize();
  assert.equal(finalized.lifecycleState, 'COMPLETED');

  const runDir = a.runDir;
  const runJsonBefore = fs.readFileSync(path.join(runDir, RUN_JSON), 'utf8');
  const eventsBefore = fs.readFileSync(path.join(runDir, EVENTS_FILE), 'utf8');
  const invocationsBefore = fs.readdirSync(path.join(runDir, 'invocations')).sort();
  const anchorBefore = JSON.parse(runJsonBefore).finalSummary;
  assert.deepEqual(anchorBefore, finalized.finalSummary);

  // B still believes the run is OPEN from its stale in-memory state —
  // that stale state must never authorize a write
  assert.equal(b.finalState, null, 'stale session B must still have stale in-memory state (regression precondition)');

  const staleMutations = [
    ['append (start)', () => b.startInvocation({ ...invocationParams(generateId('work-unit')), occurredAt: T0 })],
    ['append (reconciliation)', () => b.reconcileInvocation({ invocationId: inv.invocationId, reason: 'CRASH_AFTER_START', occurredAt: T0 })],
    ['finalize', () => b.finalize()],
    ['abort', () => b.abort({ note: 'stale abort' })],
  ];
  for (const [name, attempt] of staleMutations) {
    await assert.rejects(attempt(), LedgerFinalizedError, `${name} must fail closed with LedgerFinalizedError`);
    const record = assertStoreBytesIntact(runDir, runJsonBefore, eventsBefore, invocationsBefore, 'COMPLETED');
    assert.deepEqual(record.finalSummary, anchorBefore, `${name} must not alter the finalized ledger anchor`);
    assert.notEqual(record.finalizedAt, null);
  }

  // B still cannot read-validate its way into writing; its own view stays valid
  assert.equal(b.finalState, null);
  const bValidation = await b.validate();
  assert.equal(bValidation.valid, true, JSON.stringify(bValidation.errors));
});

test('stale session cannot append/finalize/abort after another session ABORTED the run (SOL-S01-001)', async (t) => {
  const { repo, store: a } = await makeRunStore(t);
  const b = await RunStore.open({ cwd: repo.root, runId: a.runId });

  assert.equal(a.finalState, null);
  assert.equal(b.finalState, null);

  const inv = await completeLifecycle(a, generateId('work-unit'));
  const aborted = await a.abort({ note: 'controller stop' });
  assert.equal(aborted.lifecycleState, 'ABORTED');

  const runDir = a.runDir;
  const runJsonBefore = fs.readFileSync(path.join(runDir, RUN_JSON), 'utf8');
  const eventsBefore = fs.readFileSync(path.join(runDir, EVENTS_FILE), 'utf8');
  const invocationsBefore = fs.readdirSync(path.join(runDir, 'invocations')).sort();
  const recordBefore = JSON.parse(runJsonBefore);
  assert.equal(recordBefore.lifecycleState, 'ABORTED');
  assert.equal(recordBefore.abortNote, 'controller stop');

  assert.equal(b.finalState, null, 'stale session B must still have stale in-memory state (regression precondition)');

  const staleMutations = [
    ['append (start)', () => b.startInvocation({ ...invocationParams(generateId('work-unit')), occurredAt: T0 })],
    ['append (reconciliation)', () => b.reconcileInvocation({ invocationId: inv.invocationId, reason: 'CRASH_AFTER_COMPLETION', occurredAt: T0 })],
    ['finalize', () => b.finalize()],
    ['abort', () => b.abort({ note: 'stale abort' })],
  ];
  for (const [name, attempt] of staleMutations) {
    await assert.rejects(attempt(), LedgerFinalizedError, `${name} must fail closed with LedgerFinalizedError`);
    const record = assertStoreBytesIntact(runDir, runJsonBefore, eventsBefore, invocationsBefore, 'ABORTED');
    assert.equal(record.abortNote, 'controller stop', `${name} must not alter terminal abort metadata`);
    assert.equal(record.finalSummary, null, `${name} must not replace terminal metadata with a final summary`);
    assert.notEqual(record.abortedAt, null);
  }

  assert.equal(b.finalState, null);
  const bValidation = await b.validate();
  assert.equal(bValidation.valid, true, JSON.stringify(bValidation.errors));
});

test('two sessions on one OPEN run may still interleave appends and finalize (SOL-S01-001 regression guard)', async (t) => {
  const { repo, store: a } = await makeRunStore(t);
  const b = await RunStore.open({ cwd: repo.root, runId: a.runId });

  // while the authoritative on-disk run is OPEN, both sessions serialize
  // valid appends through the shared run lock; each append re-reads
  // run.json (still OPEN) and proceeds
  const wu = generateId('work-unit');
  const a1 = await a.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  const b1 = await b.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await a1.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await b1.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await a1.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });
  await b1.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });

  const eventsA = await a.readEvents();
  const eventsB = await b.readEvents();
  assert.equal(eventsA.length, 6);
  assert.equal(eventsB.length, 6);
  assert.deepEqual(eventsA, eventsB);
  assert.deepEqual(
    eventsA.map((e) => e.seq),
    [1, 2, 3, 4, 5, 6],
  );

  const finalized = await a.finalize();
  assert.equal(finalized.lifecycleState, 'COMPLETED');
  const result = validateRunStore(a.runDir);
  assert.equal(result.valid, true, JSON.stringify(result.errors));

  // b (opened while OPEN, now stale) fails closed afterwards
  await assert.rejects(b.startInvocation({ ...invocationParams(wu), occurredAt: T2 }), LedgerFinalizedError);
});
