import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  PROCESS_TABLE_EXECUTABLE,
  createProcessSupervisor,
  createPsProcessTable,
} from '../../src/controller/process-supervisor.mjs';

function supervisor(table, { marker = 'marker-' + 'a'.repeat(24) } = {}) {
  return createProcessSupervisor({
    invocationId: 'lcim_inv_process_hardening',
    workUnitId: 'lcim_wu_process_hardening',
    invocationMarker: marker,
    processTable: table,
    pollIntervalMs: 10,
    terminateGraceMs: 10,
    verifyGraceMs: 10,
  });
}

test('process supervisor pins an absolute canonical ps executable despite poisoned PATH', (t) => {
  assert.ok(path.isAbsolute(PROCESS_TABLE_EXECUTABLE));
  assert.equal(fs.realpathSync(PROCESS_TABLE_EXECUTABLE), PROCESS_TABLE_EXECUTABLE);
  const poison = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-poison-ps-'));
  t.after(() => fs.rmSync(poison, { recursive: true, force: true }));
  fs.writeFileSync(path.join(poison, 'ps'), '#!/bin/sh\necho poisoned\n', { mode: 0o755 });
  const previous = process.env.PATH;
  process.env.PATH = poison;
  try {
    const rows = createPsProcessTable().list();
    assert.ok(Array.isArray(rows));
    assert.ok(rows.every((row) => Number.isInteger(row.pid)));
  } finally {
    process.env.PATH = previous;
  }
  const source = fs.readFileSync(new URL('../../src/controller/process-supervisor.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /spawnSync\('ps'/);
});

test('process table read failure is not converted to an empty survivor set', async () => {
  const table = {
    list() { throw new Error('denied'); },
    listWithEnv() { return []; },
    kill() { return false; },
  };
  const sut = supervisor(table);
  sut.begin(42);
  const result = await sut.quiesce();
  assert.equal(result.quiescenceVerified, false);
  assert.equal(result.processTableReadable, false);
  assert.equal(result.processAbsenceVerified, false);
});

test('marker scan failure is not converted to no marker survivors', async () => {
  const table = {
    list() { return []; },
    listWithEnv() { throw new Error('ps -E denied'); },
    kill() { return false; },
  };
  const sut = supervisor(table);
  sut.begin(42);
  const result = await sut.quiesce();
  assert.equal(result.quiescenceVerified, false);
  assert.equal(result.markerScanVerified, false);
  assert.equal(result.markerAbsent, false);
});

test('a live root PID with no descendants is a survivor', async () => {
  const table = {
    list() { return [{ pid: 42, ppid: 1, pgid: 42, state: 'R' }]; },
    listWithEnv() { return []; },
    kill() { return false; },
  };
  const sut = supervisor(table);
  sut.begin(42);
  const result = await sut.quiesce();
  assert.equal(result.quiescenceVerified, false);
  assert.ok(result.remainingPids.includes(42));
  assert.equal(result.rootPidAbsent, false);
});

test('a retained descendant remains a survivor after its root exits', async () => {
  let rows = [
    { pid: 42, ppid: 1, pgid: 42, state: 'R' },
    { pid: 77, ppid: 42, pgid: 77, state: 'R' },
  ];
  const table = {
    list() { return rows; },
    listWithEnv() { return []; },
    kill() { return false; },
  };
  const sut = supervisor(table);
  sut.begin(42);
  rows = [{ pid: 77, ppid: 1, pgid: 77, state: 'R' }];
  const result = await sut.quiesce();
  assert.equal(result.quiescenceVerified, false);
  assert.ok(result.remainingPids.includes(77));
  assert.ok(result.trackedDescendants.some((entry) => entry.pid === 77));
});

test('SIGKILL absence-verification failure remains not proven', async () => {
  const signals = [];
  const table = {
    list() { return [{ pid: 42, ppid: 1, pgid: 42, state: 'R' }]; },
    listWithEnv() { return []; },
    kill(pid, signal) { signals.push([pid, signal]); return true; },
  };
  const sut = supervisor(table);
  sut.begin(42);
  const result = await sut.quiesce();
  assert.equal(result.quiescenceVerified, false);
  assert.ok(signals.some(([, signal]) => signal === 'SIGTERM'));
  assert.ok(signals.some(([, signal]) => signal === 'SIGKILL'));
  assert.ok(result.remainingPids.includes(42));
});
