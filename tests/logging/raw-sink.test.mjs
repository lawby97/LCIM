/**
 * Sprint 01 raw-sink tests: the optional compressed raw event/transcript
 * sink is local-only, best-effort, never committed, and never part of
 * store validation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { makeRunStore, generateId, invocationParams } from '../helpers/logging-fixture.mjs';
import { EVENTS_FILE } from '../../src/logging/ledger.mjs';

const T0 = '2025-01-01T00:00:00.000Z';
const T1 = '2025-01-01T00:00:01.000Z';
const T2 = '2025-01-01T00:00:02.000Z';

function rawFile(store) {
  return path.join(store.runDir, 'raw', 'raw.jsonl.gz');
}

test('enableRawSink mirrors every ledger line into a compressed local file', async (t) => {
  const { store } = await makeRunStore(t, { enableRawSink: true });
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });
  await store.finalize();

  // gzip stream is flushed by finalize; decompressed content equals the ledger
  const raw = fs.readFileSync(rawFile(store));
  const decompressed = zlib.gunzipSync(raw).toString('utf8');
  const ledger = fs.readFileSync(path.join(store.runDir, EVENTS_FILE), 'utf8');
  assert.equal(decompressed, ledger);
});

test('raw sink accepts extra transcript lines and stays out of validation', async (t) => {
  const { store } = await makeRunStore(t, { enableRawSink: true });
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await store.appendRaw('{"raw": "transcript line that is not part of the ledger"}');
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await store.appendRaw('{"raw": "another raw line"}');
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });

  const result = await store.validate();
  assert.equal(result.valid, true, 'raw lines must not affect store validation');

  // the gzip stream is flushed by store.close() (finalize would also do it)
  await store.close();
  const decompressed = zlib.gunzipSync(fs.readFileSync(rawFile(store))).toString('utf8');
  assert.match(decompressed, /transcript line that is not part of the ledger/);
  assert.match(decompressed, /another raw line/);
  assert.equal(decompressed.trim().split('\n').length, 5);
});

test('raw sink is disabled by default: no raw directory, appendRaw fails closed', async (t) => {
  const { store } = await makeRunStore(t);
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T1 });
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T2 });
  assert.equal(fs.existsSync(path.join(store.runDir, 'raw')), false);
  await assert.rejects(store.appendRaw('x'), /raw sink is not enabled/);
  await store.finalize();
});

test('raw sink is per-session and not resumed on reopen (best-effort contract)', async (t) => {
  const { repo, store } = await makeRunStore(t, { enableRawSink: true });
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  // "crash": the creating session disappears without finalize; a new session
  // opens the store. The raw sink is NOT resumed (gzip cannot be appended).
  const { RunStore } = await import('../../src/runtime/run-store.mjs');
  // the "crashed" session's process is gone: close its sink the way the OS
  // would at process death (flushes nothing, just releases the stream)
  await store.close();
  const reopened = await RunStore.open({ cwd: repo.root, runId: store.runId });
  await reopened.reconcileOrphans({ occurredAt: T1 });
  await assert.rejects(reopened.appendRaw('x'), /raw sink is not enabled/);
  const finalized = await reopened.finalize();
  assert.equal(finalized.lifecycleState, 'COMPLETED');
  // the ledger is authoritative and valid regardless of the torn raw file
  const result = await reopened.validate();
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});
