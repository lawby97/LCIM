/**
 * Sprint 01 linked-worktree tests: linked worktrees share ONE Git-common
 * run store. A run created from the main worktree is opened, appended to,
 * and finalized from a linked worktree (and vice versa), with the chain
 * staying valid across sessions.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLinkedWorktree } from '../helpers/git-fixture.mjs';
import { TEST_CONFIG_DIGEST, TEST_TARGET_SHA, generateId, invocationParams } from '../helpers/logging-fixture.mjs';
import { RunStore } from '../../src/runtime/run-store.mjs';
import { resolveRunDir, resolveRuntimeRoot } from '../../src/config/runtime-path.mjs';
import { validateLedger } from '../../src/logging/ledger.mjs';
import { validateRunStore } from '../../src/logging/reader.mjs';

const T0 = '2025-01-01T00:00:00.000Z';
const T1 = '2025-01-01T00:00:01.000Z';
const T2 = '2025-01-01T00:00:02.000Z';

test('linked worktrees share one run store: create in main, append/finalize in linked', async (t) => {
  const { root, linked } = await makeLinkedWorktree(t);
  assert.equal(resolveRuntimeRoot(linked), resolveRuntimeRoot(root));

  // create the run from the MAIN worktree
  const mainStore = await RunStore.create({
    cwd: root,
    targetBaseSha: TEST_TARGET_SHA,
    configDigest: TEST_CONFIG_DIGEST,
  });
  const runId = mainStore.runId;
  assert.equal(resolveRunDir(linked, runId), resolveRunDir(root, runId));
  const wu = generateId('work-unit');
  const inv = await mainStore.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });

  // the LINKED worktree sees the same store and continues the ledger
  const linkedStore = await RunStore.open({ cwd: linked, runId });
  const events = await linkedStore.readEvents();
  assert.equal(events.length, 2);
  const inv2 = await linkedStore.startInvocation({ ...invocationParams(wu), occurredAt: T1 });
  await linkedStore.reconcileInvocation({
    invocationId: inv.invocationId,
    reason: 'CRASH_AFTER_COMPLETION',
    replacementInvocationId: inv2.invocationId,
    occurredAt: T2,
  });
  await inv2.complete({ outcome: 'SUCCESS', occurredAt: T2 });
  await inv2.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });

  // main worktree sees all 6 events with a valid chain
  const mainEvents = await mainStore.readEvents();
  assert.equal(mainEvents.length, 6);
  assert.deepEqual(validateLedger(mainEvents).errors, []);

  const finalized = await linkedStore.finalize();
  assert.equal(finalized.lifecycleState, 'COMPLETED');
  assert.deepEqual(finalized.finalSummary.incompleteInvocationIds, []);

  const reopened = await RunStore.open({ cwd: root, runId });
  assert.equal(reopened.record.lifecycleState, 'COMPLETED');
  const result = await reopened.validate();
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('two open sessions interleave appends without corrupting the chain', async (t) => {
  const { root, linked } = await makeLinkedWorktree(t);
  const storeA = await RunStore.create({
    cwd: root,
    targetBaseSha: TEST_TARGET_SHA,
    configDigest: TEST_CONFIG_DIGEST,
  });
  const storeB = await RunStore.open({ cwd: linked, runId: storeA.runId });

  const wu = generateId('work-unit');
  const a1 = await storeA.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  const b1 = await storeB.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await a1.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await b1.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await a1.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });
  await b1.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });

  const eventsA = await storeA.readEvents();
  const eventsB = await storeB.readEvents();
  assert.equal(eventsA.length, 6);
  assert.equal(eventsB.length, 6);
  assert.deepEqual(eventsA, eventsB);
  assert.deepEqual(
    eventsA.map((e) => e.seq),
    [1, 2, 3, 4, 5, 6],
  );
  const validation = validateLedger(eventsA);
  assert.deepEqual(validation.errors, [], JSON.stringify(validation.errors));

  const finalized = await storeB.finalize();
  assert.equal(finalized.lifecycleState, 'COMPLETED');
  const result = validateRunStore(storeA.runDir);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('two separate run stores coexist in one shared Git-common store', async (t) => {
  const { root, linked } = await makeLinkedWorktree(t);
  const a = await RunStore.create({ cwd: root, targetBaseSha: TEST_TARGET_SHA, configDigest: TEST_CONFIG_DIGEST });
  const b = await RunStore.create({ cwd: linked, targetBaseSha: TEST_TARGET_SHA, configDigest: TEST_CONFIG_DIGEST });
  assert.notEqual(a.runId, b.runId);
  const wu = generateId('work-unit');
  const invA = await a.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await invA.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await invA.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });
  await a.finalize();
  // b is untouched by a's activity
  assert.equal((await b.readEvents()).length, 0);
});

test('a run-store directory without run.json fails closed on open', async (t) => {
  const { root, linked } = await makeLinkedWorktree(t);
  const store = await RunStore.create({ cwd: root, targetBaseSha: TEST_TARGET_SHA, configDigest: TEST_CONFIG_DIGEST });
  const { resolveRunDir } = await import('../../src/config/runtime-path.mjs');
  const { RunStoreError } = await import('../../src/logging/errors.mjs');
  const runDir = resolveRunDir(linked, store.runId);
  const { readFileSync, rmSync, writeFileSync } = await import('node:fs');
  const { RUN_JSON } = await import('../../src/logging/reader.mjs');
  const { join } = await import('node:path');
  const backup = `${runDir}.bak`;
  writeFileSync(backup, readFileSync(join(runDir, RUN_JSON)));
  rmSync(join(runDir, RUN_JSON));
  await assert.rejects(RunStore.open({ cwd: root, runId: store.runId }), /missing run\.json/);
  // restore so the fixture cleanup is clean
  writeFileSync(join(runDir, RUN_JSON), backup);
  const { rmSync: rm } = await import('node:fs');
  rm(backup);
});

test('runtime evidence written through linked worktrees stays untracked', async (t) => {
  const { root, linked } = await makeLinkedWorktree(t);
  const store = await RunStore.create({
    cwd: root,
    targetBaseSha: TEST_TARGET_SHA,
    configDigest: TEST_CONFIG_DIGEST,
  });
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });
  await store.finalize();

  const { git } = await import('../helpers/git-fixture.mjs');
  assert.equal(git(root, ['status', '--porcelain']), '');
  assert.equal(git(linked, ['status', '--porcelain']), '');
  assert.equal(git(root, ['ls-files']).trim(), 'file.txt');
});
