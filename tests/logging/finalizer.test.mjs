/**
 * Sprint 01 finalizer tests: cardinality detection, INCOMPLETE_LEDGER
 * marking with evidence preservation, assessment-writer failure recovery,
 * abort semantics, and refusal to finalize a corrupted store.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeRunStore, generateId, invocationParams } from '../helpers/logging-fixture.mjs';
import { EVENTS_FILE } from '../../src/logging/ledger.mjs';
import { RUN_JSON, validateRunStore } from '../../src/logging/reader.mjs';
import { LedgerIntegrityError } from '../../src/logging/errors.mjs';

const T0 = '2025-01-01T00:00:00.000Z';
const T1 = '2025-01-01T00:00:01.000Z';
const T2 = '2025-01-01T00:00:02.000Z';

test('finalizer detects a missing ASSESSMENT and marks INCOMPLETE_LEDGER while preserving patch evidence', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, occurredAt: T1 });

  // "patch evidence" = the ledger and the invocation record stay byte-identical
  const ledgerBefore = fs.readFileSync(path.join(store.runDir, EVENTS_FILE), 'utf8');
  const recordFile = path.join(store.runDir, 'invocations', `${inv.invocationId}.json`);
  const recordBefore = fs.readFileSync(recordFile, 'utf8');

  const finalized = await store.finalize();
  assert.equal(finalized.lifecycleState, 'INCOMPLETE_LEDGER');
  assert.deepEqual(finalized.finalSummary.incompleteInvocationIds, [inv.invocationId]);
  assert.equal(finalized.finalSummary.starts, 1);
  assert.equal(finalized.finalSummary.completions, 1);
  assert.equal(finalized.finalSummary.assessments, 0);

  assert.equal(fs.readFileSync(path.join(store.runDir, EVENTS_FILE), 'utf8'), ledgerBefore);
  assert.equal(fs.readFileSync(recordFile, 'utf8'), recordBefore);

  const runRecord = JSON.parse(fs.readFileSync(path.join(store.runDir, RUN_JSON), 'utf8'));
  assert.equal(runRecord.lifecycleState, 'INCOMPLETE_LEDGER');
  assert.equal(runRecord.finalSummary.ledgerDigest, finalized.finalSummary.ledgerDigest);

  const result = validateRunStore(store.runDir);
  assert.equal(result.valid, true, 'a consistently-documented INCOMPLETE_LEDGER run validates');
  assert.deepEqual(result.summary.incompleteInvocationIds, [inv.invocationId]);
});

test('assessment writer failure: invocation stays COMPLETED, finalize marks INCOMPLETE_LEDGER', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });

  // make the ledger unwritable (simulates an I/O failure during ASSESSMENT)
  const eventsPath = path.join(store.runDir, EVENTS_FILE);
  fs.chmodSync(eventsPath, 0o444);
  await assert.rejects(inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 }), /cannot append ledger line/);
  fs.chmodSync(eventsPath, 0o644);

  // the failed ASSESSMENT never touched the ledger
  const events = await store.readEvents();
  assert.equal(events.length, 2);
  const record = await store.getInvocationRecord(inv.invocationId);
  assert.equal(record.status, 'COMPLETED');

  // the finalizer detects the incomplete lifecycle; evidence is preserved
  const finalized = await store.finalize();
  assert.equal(finalized.lifecycleState, 'INCOMPLETE_LEDGER');
  assert.deepEqual(finalized.finalSummary.incompleteInvocationIds, [inv.invocationId]);
  assert.equal(finalized.finalSummary.completions, 1);
  assert.equal(fs.readFileSync(eventsPath, 'utf8').trim().split('\n').length, 2);
});

test('finalize refuses a ledger with an invalid sequence (fails closed, no state change)', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });

  // corrupt the middle event (breaks the chain)
  const eventsPath = path.join(store.runDir, EVENTS_FILE);
  const lines = fs.readFileSync(eventsPath, 'utf8').trim().split('\n');
  const tampered = JSON.parse(lines[1]);
  tampered.outcome = 'FAILURE';
  lines[1] = JSON.stringify(tampered);
  fs.writeFileSync(eventsPath, `${lines.join('\n')}\n`);

  await assert.rejects(store.finalize(), LedgerIntegrityError);
  // run record stays OPEN — finalization never partially applied
  const runRecord = JSON.parse(fs.readFileSync(path.join(store.runDir, RUN_JSON), 'utf8'));
  assert.equal(runRecord.lifecycleState, 'OPEN');
  assert.equal(runRecord.finalizedAt, null);
});

test('abort() with open invocations keeps the ledger readable and the store consistent', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await store.abort({ note: 'controller stop' });

  const events = await store.readEvents();
  assert.equal(events.length, 2);
  const result = await store.validate();
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  const record = JSON.parse(fs.readFileSync(path.join(store.runDir, RUN_JSON), 'utf8'));
  assert.equal(record.lifecycleState, 'ABORTED');
  assert.equal(record.abortNote, 'controller stop');
});

test('finalize is idempotent-refusing: a second call fails closed', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });
  await store.finalize();
  await assert.rejects(store.finalize(), /is COMPLETED/);
});
