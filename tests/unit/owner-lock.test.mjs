/** Sixth-review owner-verified append-only cross-process lock tests. */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import { LOCK_DIR_NAME, LOCK_QUEUE_FILE, withRunDirLock } from '../../src/logging/io.mjs';

function makeRunDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-owner-lock-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function queueFile(runDir) {
  const dir = path.join(runDir, LOCK_DIR_NAME);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return path.join(dir, LOCK_QUEUE_FILE);
}

function currentStartEpoch(pid = process.pid) {
  const result = spawnSync('/bin/ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' });
  const parsed = Date.parse(String(result.stdout ?? '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function record(type, { pid = process.pid, nonce, processStartedAt = currentStartEpoch(pid) } = {}) {
  return {
    version: 1,
    type,
    pid,
    nonce,
    processStartedAt,
    recordedAt: new Date().toISOString(),
  };
}

function append(runDir, value) {
  fs.appendFileSync(queueFile(runDir), `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function records(runDir) {
  return fs.readFileSync(queueFile(runDir), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

const DEAD_NONCE = 'd'.repeat(32);
const LIVE_NONCE = 'a'.repeat(32);

test('a verifiably dead predecessor is ignored without deleting shared lock state', async (t) => {
  const runDir = makeRunDir(t);
  append(runDir, record('ACQUIRE', { pid: 999_999_999, nonce: DEAD_NONCE, processStartedAt: 1 }));
  let ran = false;
  await withRunDirLock(runDir, () => { ran = true; }, { timeoutMs: 2_000 });
  assert.equal(ran, true);
  const queue = records(runDir);
  assert.equal(queue[0].nonce, DEAD_NONCE, 'stale records remain immutable; they are never unlinked/replaced');
  assert.equal(queue.at(-1).type, 'RELEASE');
});

test('a pid-reused predecessor is ignored by exact process-start identity', async (t) => {
  const runDir = makeRunDir(t);
  const start = currentStartEpoch();
  assert.ok(start !== null);
  append(runDir, record('ACQUIRE', { nonce: DEAD_NONCE, processStartedAt: start - 3_600_000 }));
  await withRunDirLock(runDir, () => {}, { timeoutMs: 2_000 });
  assert.equal(records(runDir).filter((item) => item.type === 'ACQUIRE').length, 2);
});

test('a live predecessor is never stolen; timeout releases only the contender ticket', async (t) => {
  const runDir = makeRunDir(t);
  append(runDir, record('ACQUIRE', { nonce: LIVE_NONCE }));
  await assert.rejects(
    withRunDirLock(runDir, () => { throw new Error('must not enter'); }, { timeoutMs: 200, retryMs: 20 }),
    /timed out waiting for run store lock/,
  );
  const queue = records(runDir);
  assert.equal(queue[0].nonce, LIVE_NONCE);
  const contender = queue.find((item) => item.type === 'ACQUIRE' && item.nonce !== LIVE_NONCE);
  assert.ok(contender);
  assert.ok(queue.some((item) => item.type === 'RELEASE' && item.nonce === contender.nonce), 'timed-out contender releases its own ticket');
  assert.equal(queue.some((item) => item.type === 'RELEASE' && item.nonce === LIVE_NONCE), false, 'it cannot release the live predecessor');
});

test('malformed or torn owner queue state is UNKNOWN and fails closed', async (t) => {
  for (const body of ['{"version":1', '{"version":9,"type":"ACQUIRE"}\n']) {
    const runDir = makeRunDir(t);
    fs.writeFileSync(queueFile(runDir), body, { mode: 0o600 });
    await assert.rejects(withRunDirLock(runDir, () => {}), /UNKNOWN|invalid owner record/);
  }
});

test('a delayed stale-owner RELEASE cannot remove or bypass a live successor', async (t) => {
  const runDir = makeRunDir(t);
  append(runDir, record('ACQUIRE', { pid: 999_999_999, nonce: DEAD_NONCE, processStartedAt: 1 }));
  let releaseFirst;
  let firstEntered = false;
  const first = withRunDirLock(runDir, async () => {
    firstEntered = true;
    await new Promise((resolve) => { releaseFirst = resolve; });
  });
  while (!firstEntered) await new Promise((resolve) => setTimeout(resolve, 5));
  // Simulate the old owner finally appending its own release after the
  // successor entered. It can affect only its nonce and deletes nothing.
  append(runDir, record('RELEASE', { pid: 999_999_999, nonce: DEAD_NONCE, processStartedAt: 1 }));
  let secondEntered = false;
  const second = withRunDirLock(runDir, () => { secondEntered = true; });
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(secondEntered, false, 'the current successor remains protected');
  releaseFirst();
  await Promise.all([first, second]);
  assert.equal(secondEntered, true);
});

test('same-process concurrent acquisitions serialize', async (t) => {
  const runDir = makeRunDir(t);
  const order = [];
  await Promise.all([
    withRunDirLock(runDir, async () => {
      order.push('a-begin');
      await new Promise((resolve) => setTimeout(resolve, 60));
      order.push('a-end');
    }),
    withRunDirLock(runDir, () => { order.push('b'); }),
  ]);
  assert.deepEqual(order, ['a-begin', 'a-end', 'b']);
});

function waitForLine(child, expected) {
  return new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${expected}: ${text}`)), 5_000);
    child.stdout.on('data', (chunk) => {
      text += chunk;
      if (text.includes(expected)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (!text.includes(expected)) reject(new Error(`child exited ${code}: ${text}`));
    });
  });
}

test('independent processes serialize and a dead process owner is recoverable', async (t) => {
  const runDir = makeRunDir(t);
  const ioUrl = pathToFileURL(path.resolve('src/logging/io.mjs')).href;
  const childFile = path.join(runDir, 'lock-child.mjs');
  fs.writeFileSync(childFile, `
    import { withRunDirLock } from ${JSON.stringify(ioUrl)};
    const runDir = process.argv[2];
    await withRunDirLock(runDir, async () => {
      process.stdout.write('ENTERED\\n');
      await new Promise((resolve) => process.stdin.once('data', resolve));
    }, { timeoutMs: 5000 });
  `);
  const first = spawn(process.execPath, [childFile, runDir], { stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { try { first.kill('SIGKILL'); } catch {} });
  await waitForLine(first, 'ENTERED');
  const second = spawn(process.execPath, [childFile, runDir], { stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { try { second.kill('SIGKILL'); } catch {} });
  let secondOutput = '';
  second.stdout.on('data', (chunk) => { secondOutput += chunk; });
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(secondOutput.includes('ENTERED'), false, 'second process cannot overlap the live owner');
  first.stdin.end('release\n');
  await waitForLine(second, 'ENTERED');
  second.stdin.end('release\n');
  const waitForExit = (child) => child.exitCode !== null
    ? Promise.resolve(child.exitCode)
    : new Promise((resolve) => child.once('exit', resolve));
  await Promise.all([waitForExit(first), waitForExit(second)]);
  assert.ok(records(runDir).filter((item) => item.type === 'ACQUIRE').length >= 2);
});
