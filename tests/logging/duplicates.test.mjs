/**
 * Sprint 01 duplicate-lifecycle tests: every duplicate/invalid lifecycle
 * transition fails closed at the writer, never touching the ledger file.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeRunStore, generateId, invocationParams } from '../helpers/logging-fixture.mjs';
import { EVENTS_FILE } from '../../src/logging/ledger.mjs';
import { LedgerIntegrityError, LedgerFinalizedError } from '../../src/logging/errors.mjs';

const T0 = '2025-01-01T00:00:00.000Z';
const T1 = '2025-01-01T00:00:01.000Z';
const T2 = '2025-01-01T00:00:02.000Z';

async function lineCount(store) {
  const raw = fs.readFileSync(path.join(store.runDir, EVENTS_FILE), 'utf8');
  return raw.trim() === '' ? 0 : raw.trim().split('\n').length;
}

test('duplicate START fails closed', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await assert.rejects(
    store._appendInvocationEvent({ kind: 'START', invocationId: inv.invocationId, workUnitId: wu, occurredAt: T1, provider: 'deepseek', model: 'deepseek-flash', role: 'WORKER', reasoningEffort: 'xhigh' }),
    /duplicate START/,
  );
  // the ledger must be untouched
  const events = await store.readEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].invocationId, inv.invocationId);
});

test('COMPLETION without START fails closed', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const ghost = generateId('invocation');
  await assert.rejects(store._appendInvocationEvent({ kind: 'COMPLETION', invocationId: ghost, outcome: 'SUCCESS', occurredAt: T0 }), /without START/);
  assert.equal(await lineCount(store), 0);
});

test('duplicate COMPLETION fails closed', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await assert.rejects(inv.complete({ outcome: 'SUCCESS', occurredAt: T2 }), /expected STARTED/);
  assert.equal(await lineCount(store), 2);
});

test('ASSESSMENT without COMPLETION fails closed', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await assert.rejects(inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T1 }), /expected COMPLETED/);
  assert.equal(await lineCount(store), 1);
});

test('duplicate ASSESSMENT fails closed', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });
  await assert.rejects(inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 }), /expected COMPLETED/);
  assert.equal(await lineCount(store), 3);
});

test('reconciliation on an ASSESSED invocation fails closed', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });
  await assert.rejects(
    store.reconcileInvocation({ invocationId: inv.invocationId, reason: 'CRASH_AFTER_START' }),
    /only STARTED\/COMPLETED/,
  );
  assert.equal(await lineCount(store), 3);
});

test('reconciliation on an already-reconciled invocation fails closed', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await store.reconcileInvocation({ invocationId: inv.invocationId, reason: 'CRASH_AFTER_START', occurredAt: T1 });
  await assert.rejects(
    store.reconcileInvocation({ invocationId: inv.invocationId, reason: 'CRASH_AFTER_START', occurredAt: T2 }),
    /only STARTED\/COMPLETED/,
  );
  assert.equal(await lineCount(store), 2);
});

test('invalid reconciliation parameters fail closed as ConfigError', async (t) => {
  const { store } = await makeRunStore(t);
  const { ConfigError } = await import('../../src/shared/errors.mjs');
  await assert.rejects(
    store.reconcileInvocation({ invocationId: 'bogus', reason: 'CRASH_AFTER_START' }),
    ConfigError,
  );
  await assert.rejects(
    store.reconcileInvocation({ invocationId: generateId('invocation'), reason: 'NOT_A_REASON' }),
    ConfigError,
  );
});

test('events after abort() are refused (LedgerFinalizedError)', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await store.abort({ note: 'controller stop' });
  await assert.rejects(store.startInvocation({ ...invocationParams(wu) }), LedgerFinalizedError);
  await assert.rejects(store.reconcileInvocation({ invocationId: generateId('invocation'), reason: 'CRASH_AFTER_START' }), LedgerFinalizedError);
  await assert.rejects(store.finalize(), LedgerFinalizedError);
  await assert.rejects(store.abort(), LedgerFinalizedError);
  await assert.rejects(store.abort({ note: 'x'.repeat(501) }), LedgerFinalizedError);
  // bounded note validation happens on writable stores
  const fresh = await makeRunStore(t);
  const { ConfigError } = await import('../../src/shared/errors.mjs');
  await assert.rejects(fresh.store.abort({ note: 'x'.repeat(501) }), ConfigError);
  await assert.rejects(fresh.store.abort({ note: '' }), ConfigError);
});
