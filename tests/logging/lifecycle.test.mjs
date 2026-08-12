/**
 * Sprint 01 lifecycle tests: canonical invocation lifecycle
 * (START -> COMPLETION -> ASSESSMENT), exactly 1/1/1 per invocation,
 * run metadata, finalizer, and the deterministic reader.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  makeRunStore,
  TEST_CONFIG_DIGEST,
  TEST_TARGET_SHA,
  generateId,
  invocationParams,
} from '../helpers/logging-fixture.mjs';
import { getVersionInfo } from '../../src/config/version.mjs';
import { EVENTS_FILE, validateLedger } from '../../src/logging/ledger.mjs';
import { readLedger, validateRunStore } from '../../src/logging/reader.mjs';
import { RUN_JSON, INVOCATIONS_DIR } from '../../src/logging/reader.mjs';
import { LedgerFinalizedError, LedgerIntegrityError } from '../../src/logging/errors.mjs';
import { ConfigError } from '../../src/shared/errors.mjs';

const T0 = '2025-01-01T00:00:00.000Z';
const T1 = '2025-01-01T00:00:01.000Z';
const T2 = '2025-01-01T00:00:02.000Z';

test('successful invocation: exactly 1 START / 1 COMPLETION / 1 ASSESSMENT, chain valid, finalize COMPLETED', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');

  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({
    outcome: 'SUCCESS',
    usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
    occurredAt: T1,
  });
  await inv.assess({ assessmentResult: 'ACCEPTED', summary: 'ledger lifecycle ok', occurredAt: T2 });

  // ledger file: exactly 3 lines, one per lifecycle kind, monotonic seq
  const eventsFile = fs.readFileSync(path.join(store.runDir, EVENTS_FILE), 'utf8');
  const lines = eventsFile.trim().split('\n');
  assert.equal(lines.length, 3);
  const events = lines.map((l) => JSON.parse(l));
  assert.deepEqual(events.map((e) => e.kind), ['START', 'COMPLETION', 'ASSESSMENT']);
  assert.deepEqual(events.map((e) => e.seq), [1, 2, 3]);
  assert.equal(events[0].prevDigest, '0'.repeat(64));
  assert.equal(events[1].prevDigest, events[0].digest);
  assert.equal(events[2].prevDigest, events[1].digest);

  // every event records provider/model/role/reasoning + taxonomy fields
  assert.equal(events[0].provider, 'deepseek');
  assert.equal(events[0].model, 'deepseek-flash');
  assert.equal(events[0].role, 'WORKER');
  assert.equal(events[0].reasoningEffort, 'xhigh');
  assert.equal(events[1].outcome, 'SUCCESS');
  assert.deepEqual(events[1].usage, { inputTokens: 10, outputTokens: 20, totalTokens: 30 });
  assert.equal(events[2].assessmentResult, 'ACCEPTED');

  const validation = validateLedger(events);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.summary.starts, 1);
  assert.equal(validation.summary.completions, 1);
  assert.equal(validation.summary.assessments, 1);
  assert.equal(validation.summary.incompleteInvocationIds.length, 0);

  // compact invocation record reflects the full lifecycle
  const record = await inv.record();
  assert.equal(record.status, 'ASSESSED');
  assert.equal(record.startedAt, T0);
  assert.equal(record.completedAt, T1);
  assert.equal(record.assessedAt, T2);
  assert.equal(record.outcome, 'SUCCESS');
  assert.equal(record.assessmentResult, 'ACCEPTED');
  assert.equal(record.workUnitId, wu);

  // finalizer: COMPLETED with a correct summary
  const finalized = await store.finalize();
  assert.equal(finalized.lifecycleState, 'COMPLETED');
  assert.equal(finalized.finalSummary.events, 3);
  assert.equal(finalized.finalSummary.lastSeq, 3);
  assert.equal(finalized.finalSummary.ledgerDigest, events[2].digest);
  assert.deepEqual(finalized.finalSummary.incompleteInvocationIds, []);

  const runRecord = JSON.parse(fs.readFileSync(path.join(store.runDir, RUN_JSON), 'utf8'));
  assert.equal(runRecord.lifecycleState, 'COMPLETED');
  assert.ok(runRecord.finalizedAt !== null);

  // full store validation passes; appends are refused after finalization
  const result = await store.validate();
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  await assert.rejects(
    store.startInvocation({ ...invocationParams(generateId('work-unit')) }),
    LedgerFinalizedError,
  );
});

test('two invocations in one run: both complete exactly 1/1/1 and interleave safely', async (t) => {
  const { store } = await makeRunStore(t);
  const wu1 = generateId('work-unit');
  const wu2 = generateId('work-unit');
  const a = await store.startInvocation({ ...invocationParams(wu1), occurredAt: T0 });
  const b = await store.startInvocation({ ...invocationParams(wu2), occurredAt: T0 });
  await a.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await b.complete({ outcome: 'FAILURE', errorCode: 'PROVIDER_ERROR', rejectionCode: 'TRANSPORT_MALFORMED', occurredAt: T1 });
  await a.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });
  await b.assess({ assessmentResult: 'REJECTED', rejectionCode: 'TRANSPORT_MALFORMED', occurredAt: T2 });

  const events = await store.readEvents();
  assert.equal(events.length, 6);
  const validation = validateLedger(events);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.summary.invocations, 2);
  assert.equal(validation.summary.starts, 2);
  assert.equal(validation.summary.completions, 2);
  assert.equal(validation.summary.assessments, 2);

  const finalized = await store.finalize();
  assert.equal(finalized.lifecycleState, 'COMPLETED');
  assert.deepEqual(finalized.finalSummary.incompleteInvocationIds, []);
  const result = await store.validate();
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('failure invocations record error/rejection taxonomy without secrets', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'TIMEOUT', occurredAt: T1 });
  await inv.assess({ assessmentResult: 'REJECTED', rejectionCode: 'BUDGET_EXHAUSTED', occurredAt: T2 });

  const events = await store.readEvents();
  assert.equal(events[1].outcome, 'TIMEOUT');
  assert.equal(events[2].assessmentResult, 'REJECTED');
  assert.equal(events[2].rejectionCode, 'BUDGET_EXHAUSTED');
  const record = await inv.record();
  assert.equal(record.status, 'ASSESSED');
  assert.equal(record.rejectionCode, 'BUDGET_EXHAUSTED');
  assert.deepEqual(validateLedger(events).errors, []);
  const finalized = await store.finalize();
  assert.equal(finalized.lifecycleState, 'COMPLETED');
});

test('run metadata records LCIM version/commit, target base, config digest, schema version', async (t) => {
  const { store } = await makeRunStore(t);
  const record = JSON.parse(fs.readFileSync(path.join(store.runDir, RUN_JSON), 'utf8'));
  const info = getVersionInfo();
  assert.equal(record.lcimVersion, info.version);
  assert.equal(record.lcimCommit, info.gitCommit);
  assert.equal(record.targetBaseSha, TEST_TARGET_SHA);
  assert.equal(record.configDigest, TEST_CONFIG_DIGEST);
  assert.equal(record.schemaName, 'lcim.run');
  assert.equal(record.schemaVersion, '1.0.0');
  assert.equal(record.storeVersion, '1');
  assert.equal(record.lifecycleState, 'OPEN');
  assert.match(record.createdAt, /^[0-9]{4}-[0-9]{2}-[0-9]{2}T/);
});

test('create fails closed on invalid targetBaseSha / configDigest', async (t) => {
  const { repo } = await makeRunStore(t);
  const { RunStore } = await import('../../src/runtime/run-store.mjs');
  await assert.rejects(
    RunStore.create({ cwd: repo.root, targetBaseSha: 'short', configDigest: TEST_CONFIG_DIGEST }),
    ConfigError,
  );
  await assert.rejects(
    RunStore.create({ cwd: repo.root, targetBaseSha: TEST_TARGET_SHA, configDigest: 'zz' }),
    ConfigError,
  );
});

test('open() rejects invalid run ids and unknown run stores', async (t) => {
  const { repo } = await makeRunStore(t);
  const { RunStore } = await import('../../src/runtime/run-store.mjs');
  await assert.rejects(RunStore.open({ cwd: repo.root, runId: 'nope' }), ConfigError);
  await assert.rejects(
    RunStore.open({ cwd: repo.root, runId: generateId('run') }),
    /does not exist/,
  );
});

test('deterministic reader: readLedger returns the same events every time', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });
  const first = readLedger(store.runDir);
  const second = readLedger(store.runDir);
  assert.deepEqual(first.errors, []);
  assert.deepEqual(first.events, second.events);
  assert.deepEqual(first.events, await store.readEvents());
});

test('validateRunStore on an OPEN run reports no errors and a live summary', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  const result = await store.validate();
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.summary.starts, 1);
  assert.equal(result.summary.completions, 1);
  assert.equal(result.summary.assessments, 0);
  assert.deepEqual(result.summary.incompleteInvocationIds, [inv.invocationId]);
  assert.equal(result.run.lifecycleState, 'OPEN');
});

test('reopening a finalized run store works and keeps refusing appends', async (t) => {
  const { repo, store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });
  await store.finalize();

  const { RunStore } = await import('../../src/runtime/run-store.mjs');
  const reopened = await RunStore.open({ cwd: repo.root, runId: store.runId });
  assert.equal(reopened.record.lifecycleState, 'COMPLETED');
  const events = await reopened.readEvents();
  assert.equal(events.length, 3);
  await assert.rejects(
    reopened.startInvocation({ ...invocationParams(generateId('work-unit')) }),
    LedgerFinalizedError,
  );
});

test('events file is append-only: historical lines are never rewritten by any API', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  const before = fs.readFileSync(path.join(store.runDir, EVENTS_FILE), 'utf8');
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });
  const after = fs.readFileSync(path.join(store.runDir, EVENTS_FILE), 'utf8');
  assert.ok(after.startsWith(before), 'historical lines must be preserved byte-for-byte');
  assert.equal((after.match(/\n/g) ?? []).length, 3);
});

test('ledger integrity errors surface with LedgerIntegrityError', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  // assess with an invalid rejection code -> fail closed
  await assert.rejects(inv.assess({ assessmentResult: 'REJECTED', rejectionCode: 'NOT_A_CODE' }), LedgerIntegrityError);
  const events = await store.readEvents();
  assert.equal(events.length, 2, 'failed append must not touch the ledger');
  assert.equal(validateLedger(events).errors.length, 0);
});
