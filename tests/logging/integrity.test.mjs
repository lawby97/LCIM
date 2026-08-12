/**
 * Sprint 01 integrity-chain tests: tampering with any historical event,
 * tail truncation (before and after finalization), torn tails, and
 * misordered sequences are all detected — the store fails closed and never
 * silently repairs.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeRunStore, generateId, invocationParams } from '../helpers/logging-fixture.mjs';
import { EVENTS_FILE, validateLedger } from '../../src/logging/ledger.mjs';
import { validateRunStore } from '../../src/logging/reader.mjs';
import { RunStore } from '../../src/runtime/run-store.mjs';
import { LedgerIntegrityError } from '../../src/logging/errors.mjs';

const T0 = '2025-01-01T00:00:00.000Z';
const T1 = '2025-01-01T00:00:01.000Z';
const T2 = '2025-01-01T00:00:02.000Z';

async function makeThreeEventRun(t) {
  const { repo, store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });
  return { repo, store, inv };
}

function readLines(store) {
  return fs.readFileSync(path.join(store.runDir, EVENTS_FILE), 'utf8').trim().split('\n');
}

test('rewriting a middle event breaks the chain: open and validator fail closed', async (t) => {
  const { repo, store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });

  // tamper: rewrite the COMPLETION line with a different model label
  const lines = readLines(store);
  const tampered = JSON.parse(lines[1]);
  tampered.outcome = 'FAILURE';
  lines[1] = JSON.stringify(tampered);
  fs.writeFileSync(path.join(store.runDir, EVENTS_FILE), `${lines.join('\n')}\n`);

  // validator detects the digest mismatch
  const result = validateRunStore(store.runDir);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.message.includes('digest mismatch')),
    `expected a digest mismatch error, got: ${JSON.stringify(result.errors)}`,
  );
  // open fails closed
  await assert.rejects(RunStore.open({ cwd: repo.root, runId: store.runId }), LedgerIntegrityError);
});

test('rewriting the FIRST event (genesis link) is detected', async (t) => {
  const { repo, store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });

  const lines = readLines(store);
  const tampered = JSON.parse(lines[0]);
  tampered.reasoningEffort = 'low'; // policy downgrade would be visible
  lines[0] = JSON.stringify(tampered);
  fs.writeFileSync(path.join(store.runDir, EVENTS_FILE), `${lines.join('\n')}\n`);

  const validation = validateLedger(lines.map((l) => JSON.parse(l)));
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((e) => e.message.includes('digest mismatch')));
  await assert.rejects(RunStore.open({ cwd: repo.root, runId: store.runId }), LedgerIntegrityError);
});

test('sequence tampering (gap/duplicate seq) is detected', async (t) => {
  const { repo, store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });

  const lines = readLines(store);
  const tampered = JSON.parse(lines[1]);
  tampered.seq = 99;
  lines[1] = JSON.stringify(tampered);
  fs.writeFileSync(path.join(store.runDir, EVENTS_FILE), `${lines.join('\n')}\n`);

  const validation = validateLedger(lines.map((l) => JSON.parse(l)));
  assert.equal(validation.valid, false);
  assert.ok(
    validation.errors.some((e) => e.message.includes('monotonic')),
    `expected a seq error, got: ${JSON.stringify(validation.errors)}`,
  );
  await assert.rejects(RunStore.open({ cwd: repo.root, runId: store.runId }), LedgerIntegrityError);
});

test('torn tail (crash during write) fails closed on open and on append', async (t) => {
  const { repo, store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  // simulate a crash mid-write: partial line without trailing newline
  fs.appendFileSync(path.join(store.runDir, EVENTS_FILE), '{"schemaName": "lcim.event", "kind": "ASSESS');
  await assert.rejects(RunStore.open({ cwd: repo.root, runId: store.runId }), /torn tail|parse errors/);
});

test('deleting the last event of a finalized run is detected by the anchor', async (t) => {
  const { repo, store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });
  await store.finalize();

  // truncate the ledger by one line
  const lines = readLines(store);
  lines.pop();
  fs.writeFileSync(path.join(store.runDir, EVENTS_FILE), `${lines.join('\n')}\n`);

  // the finalized run.json anchors the ledger end: both open and validator fail
  await assert.rejects(
    RunStore.open({ cwd: repo.root, runId: store.runId }),
    /does not match the finalized run anchor|validation failed/,
  );
  const result = validateRunStore(store.runDir);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.path.includes('ledgerDigest')),
    `expected an anchor error, got: ${JSON.stringify(result.errors)}`,
  );
});

test('mid-session shrink of the ledger file is detected on the next append', async (t) => {
  const { repo, store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  // another process (or tampering) truncates the file while the store is open
  fs.writeFileSync(path.join(store.runDir, EVENTS_FILE), '');
  await assert.rejects(inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 }), /ledger shrank|validation failed/);
});

test('projection tampering is detected by the validator', async (t) => {
  const { repo, store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });

  // rewrite the projection record with a wrong status
  const file = path.join(store.runDir, 'invocations', `${inv.invocationId}.json`);
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  record.status = 'STARTED';
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);

  const result = validateRunStore(store.runDir);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.path.includes('.status') && e.message.includes('projection mismatch')),
    `expected a projection mismatch, got: ${JSON.stringify(result.errors)}`,
  );
  // finalize refuses to accept a ledger whose projections disagree
  await assert.rejects(store.finalize(), /projections do not match/);
});

test('a missing projection record is reported by the validator', async (t) => {
  const { repo, store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });
  fs.rmSync(path.join(store.runDir, 'invocations', `${inv.invocationId}.json`));

  const result = validateRunStore(store.runDir);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.message.includes('missing projection record')));
  await assert.rejects(store.finalize(), /projections do not match/);
});
