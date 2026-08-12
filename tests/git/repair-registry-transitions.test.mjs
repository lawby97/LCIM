/**
 * SOL-S03-FINAL-002 regression tests: REGISTRY VALIDATES THE TENTATIVE
 * TRANSITION BEFORE APPEND.
 *
 * recordWorktreeEvent() must validate the COMPLETE tentative lifecycle
 * (strictly validated existing events + the proposed event) under the
 * registry lock BEFORE any byte is written. An invalid transition —
 * duplicate CREATED, REMOVED for an unknown id, duplicate REMOVED, or any
 * post-REMOVED event — throws with the registry bytes EXACTLY unchanged
 * (fail before write; never append-then-rollback).
 *
 * Every mutation here goes through recordWorktreeEvent() itself — never
 * direct file mutation — and every rejection case asserts byte-for-byte
 * registry stability plus a still-valid registry afterwards.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeWorkerFixture, makeWorkUnitId } from '../helpers/git-safety-fixture.mjs';
import {
  generateWorktreeId,
  loadWorktreeEvents,
  recordWorktreeEvent,
  resolveWorktreeRegistryFile,
} from '../../src/git/worktree-registry.mjs';
import { WorktreeSafetyError } from '../../src/git/errors.mjs';

function readRegistryBytes(repoDir) {
  const file = resolveWorktreeRegistryFile(repoDir);
  return fs.readFileSync(file);
}

test('SOL-S03-FINAL-002: duplicate CREATED for the same worktreeId is refused before any byte is appended', async (t) => {
  const { repoDir, baseSha } = await makeWorkerFixture(t);
  const id = generateWorktreeId();
  const target = `/tmp/lcim-final002-dup-${id}`;

  // Establish a valid registry via the API itself.
  const first = recordWorktreeEvent({ repoDir, worktreeId: id, workUnitId: makeWorkUnitId(), worktreePath: target, baseSha, event: 'CREATED' });
  assert.equal(first.event, 'CREATED');
  const before = readRegistryBytes(repoDir);

  assert.throws(
    () => recordWorktreeEvent({ repoDir, worktreeId: id, workUnitId: makeWorkUnitId(), worktreePath: target, baseSha, event: 'CREATED' }),
    (err) => err instanceof WorktreeSafetyError && /impossible worktree registry transition/.test(err.message),
    'a second CREATED for the same id is an impossible transition',
  );
  assert.deepEqual(readRegistryBytes(repoDir), before, 'registry bytes must be exactly unchanged');
  const events = loadWorktreeEvents(repoDir);
  assert.equal(events.length, 1);
  assert.equal(events[0].worktreeId, id);
  assert.equal(events[0].event, 'CREATED');
});

test('SOL-S03-FINAL-002: REMOVED for an unknown worktreeId is refused before any byte is appended', async (t) => {
  const { repoDir, baseSha } = await makeWorkerFixture(t);
  const knownId = generateWorktreeId();
  recordWorktreeEvent({ repoDir, worktreeId: knownId, workUnitId: makeWorkUnitId(), worktreePath: `/tmp/lcim-final002-known-${knownId}`, baseSha, event: 'CREATED' });
  const before = readRegistryBytes(repoDir);

  assert.throws(
    () => recordWorktreeEvent({ repoDir, worktreeId: generateWorktreeId(), workUnitId: makeWorkUnitId(), worktreePath: '/tmp/lcim-final002-unknown', baseSha, event: 'REMOVED' }),
    (err) => err instanceof WorktreeSafetyError && /impossible worktree registry transition/.test(err.message),
    'REMOVED without a preceding CREATED is impossible',
  );
  assert.deepEqual(readRegistryBytes(repoDir), before, 'registry bytes must be exactly unchanged');
  const events = loadWorktreeEvents(repoDir);
  assert.equal(events.length, 1);
  assert.equal(events[0].worktreeId, knownId);
});

test('SOL-S03-FINAL-002: duplicate REMOVED is refused before any byte is appended', async (t) => {
  const { repoDir, baseSha } = await makeWorkerFixture(t);
  const id = generateWorktreeId();
  const target = `/tmp/lcim-final002-dup-removed-${id}`;
  recordWorktreeEvent({ repoDir, worktreeId: id, workUnitId: makeWorkUnitId(), worktreePath: target, baseSha, event: 'CREATED' });
  recordWorktreeEvent({ repoDir, worktreeId: id, workUnitId: makeWorkUnitId(), worktreePath: target, baseSha, event: 'REMOVED' });
  const before = readRegistryBytes(repoDir);

  assert.throws(
    () => recordWorktreeEvent({ repoDir, worktreeId: id, workUnitId: makeWorkUnitId(), worktreePath: target, baseSha, event: 'REMOVED' }),
    (err) => err instanceof WorktreeSafetyError && /impossible worktree registry transition/.test(err.message),
    'a lifecycle can be REMOVED at most once',
  );
  assert.deepEqual(readRegistryBytes(repoDir), before, 'registry bytes must be exactly unchanged');
  const events = loadWorktreeEvents(repoDir);
  assert.deepEqual(events.map((e) => e.event), ['CREATED', 'REMOVED']);
});

test('SOL-S03-FINAL-002: CREATED after REMOVED for the same identity is refused before any byte is appended', async (t) => {
  const { repoDir, baseSha } = await makeWorkerFixture(t);
  const id = generateWorktreeId();
  const target = `/tmp/lcim-final002-reuse-${id}`;
  recordWorktreeEvent({ repoDir, worktreeId: id, workUnitId: makeWorkUnitId(), worktreePath: target, baseSha, event: 'CREATED' });
  recordWorktreeEvent({ repoDir, worktreeId: id, workUnitId: makeWorkUnitId(), worktreePath: target, baseSha, event: 'REMOVED' });
  const before = readRegistryBytes(repoDir);

  assert.throws(
    () => recordWorktreeEvent({ repoDir, worktreeId: id, workUnitId: makeWorkUnitId(), worktreePath: target, baseSha, event: 'CREATED' }),
    (err) => err instanceof WorktreeSafetyError && /impossible worktree registry transition/.test(err.message),
    'worktree ids are never reused — CREATED after REMOVED is impossible',
  );
  assert.deepEqual(readRegistryBytes(repoDir), before, 'registry bytes must be exactly unchanged');
  const events = loadWorktreeEvents(repoDir);
  assert.deepEqual(events.map((e) => e.event), ['CREATED', 'REMOVED']);
});

test('SOL-S03-FINAL-002: a valid CREATED -> REMOVED lifecycle still succeeds', async (t) => {
  const { repoDir, baseSha } = await makeWorkerFixture(t);
  const id = generateWorktreeId();
  const target = `/tmp/lcim-final002-valid-${id}`;
  const created = recordWorktreeEvent({ repoDir, worktreeId: id, workUnitId: makeWorkUnitId(), worktreePath: target, baseSha, event: 'CREATED' });
  assert.equal(created.event, 'CREATED');
  const removed = recordWorktreeEvent({ repoDir, worktreeId: id, workUnitId: makeWorkUnitId(), worktreePath: target, baseSha, event: 'REMOVED' });
  assert.equal(removed.event, 'REMOVED');
  const events = loadWorktreeEvents(repoDir); // still strictly valid
  assert.deepEqual(events.map((e) => e.event), ['CREATED', 'REMOVED']);
});

test('SOL-S03-FINAL-002: independent lifecycles for different worktreeIds interleave and stay transition-valid', async (t) => {
  const { repoDir, baseSha } = await makeWorkerFixture(t);
  const a = generateWorktreeId();
  const b = generateWorktreeId();
  recordWorktreeEvent({ repoDir, worktreeId: a, workUnitId: makeWorkUnitId(), worktreePath: `/tmp/lcim-final002-a-${a}`, baseSha, event: 'CREATED' });
  recordWorktreeEvent({ repoDir, worktreeId: b, workUnitId: makeWorkUnitId(), worktreePath: `/tmp/lcim-final002-b-${b}`, baseSha, event: 'CREATED' });
  recordWorktreeEvent({ repoDir, worktreeId: a, workUnitId: makeWorkUnitId(), worktreePath: `/tmp/lcim-final002-a-${a}`, baseSha, event: 'REMOVED' });
  recordWorktreeEvent({ repoDir, worktreeId: b, workUnitId: makeWorkUnitId(), worktreePath: `/tmp/lcim-final002-b-${b}`, baseSha, event: 'REMOVED' });

  const events = loadWorktreeEvents(repoDir); // line-intact + transition-valid
  assert.equal(events.length, 4);
  const byId = new Map();
  for (const e of events) {
    byId.set(e.worktreeId, [...(byId.get(e.worktreeId) ?? []), e.event]);
  }
  assert.deepEqual(byId.get(a), ['CREATED', 'REMOVED']);
  assert.deepEqual(byId.get(b), ['CREATED', 'REMOVED']);
});
