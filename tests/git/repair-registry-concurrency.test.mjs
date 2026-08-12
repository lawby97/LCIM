/**
 * SOL-S03-007 regression tests: REGISTRY CONCURRENCY / PATH REUSE.
 *
 * FAULT TEST: Controller A creates worktree path P with worktreeId A,
 * removes the Git worktree, then crashes before recording REMOVED.
 * Controller B later reuses... — with id-derived unique physical paths and
 * the one-active-record-per-path claim, B CANNOT reuse A's path in an
 * unsafe way, stale cleanup for A never touches B, and the registry stays
 * coherent. After SOL-S03-R3-001, stale cleanup for A FAILS CLOSED when
 * the git-level removal already destroyed the registration and the
 * ownership marker (registry data alone never authorizes REMOVED); A's
 * lifecycle stays open/quarantined until manual recovery.
 *
 * CONCURRENT TEST: two controller processes create/remove separate
 * same-base worktrees concurrently — distinct worktreeIds, distinct owned
 * paths, neither can remove the other's worktree, and the append-only
 * registry remains parseable and transition-valid.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { git } from '../helpers/git-fixture.mjs';
import { makeWorkerFixture, makeWorkUnitId } from '../helpers/git-safety-fixture.mjs';
import { createIsolatedWorktree, removeIsolatedWorktree } from '../../src/git/worktree.mjs';
import { loadWorktreeEvents, recordWorktreeEvent, generateWorktreeId } from '../../src/git/worktree-registry.mjs';
import { WorktreeSafetyError } from '../../src/git/errors.mjs';

test('S03-007 FAULT: crash-before-REMOVED stale ownership never removes a replacement worktree', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const workUnitA = makeWorkUnitId();
  const workUnitB = makeWorkUnitId();

  // 1. Controller A creates worktree A (id-derived unique path)
  const a = createIsolatedWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: workUnitA });

  // 2. A's Git worktree is removed (git-level), but A crashes BEFORE
  //    recording REMOVED: the registry lifecycle stays open.
  git(repoDir, ['worktree', 'remove', '--force', a.worktreeDir]);
  assert.ok(!fs.existsSync(a.worktreeDir));

  // 3. Controller B creates its own worktree: distinct identity, distinct
  //    physical path (derived from the id — never A's path).
  const b = createIsolatedWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: workUnitB });
  assert.notEqual(b.worktreeId, a.worktreeId);
  assert.notEqual(b.worktreeDir, a.worktreeDir, 'B must never inherit A\'s path');

  // 4/5. B cannot reuse A's identity/path in an unsafe way: an explicit
  //      name reuse attempt is refused by the active-path claim.
  assert.throws(
    () =>
      createIsolatedWorktree({
        repoDir,
        worktreeRoot,
        expectedBaseSha: baseSha,
        workUnitId: workUnitB,
        worktreeName: path.basename(a.worktreeDir),
      }),
    (err) => err instanceof WorktreeSafetyError && /already claimed by active LCIM worktree record/.test(err.message),
  );

  // 6. Stale cleanup for A FAILS CLOSED (SOL-S03-R3-001): the git-level
  //    removal already deleted the per-worktree admin directory and with it
  //    the genuine ownership marker, so genuine LCIM ownership can no
  //    longer be proven through repository-owned Git metadata. Registry
  //    data alone must never authorize a REMOVED event — A's lifecycle
  //    stays open (path quarantined); B is intact.
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: a.worktreeId }),
    (err) => err instanceof WorktreeSafetyError && /not registered with git/.test(err.message),
  );
  assert.ok(fs.existsSync(b.worktreeDir), 'B must remain intact');
  assert.ok(git(repoDir, ['worktree', 'list', '--porcelain']).includes(b.worktreeDir));

  // 7. Stale path-based cleanup for A pointed at B's path is refused (A's
  //    lifecycle is still open, so the path-binding check fires).
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: a.worktreeId, worktreeDir: b.worktreeDir }),
    (err) => err instanceof WorktreeSafetyError && /does not match the registered path/.test(err.message),
  );

  // 8. Registry remains coherent and transition-valid: A's lifecycle is
  //    still open (quarantined — nothing can forge a REMOVED for it),
  //    B's is open.
  const events = loadWorktreeEvents(repoDir);
  const byId = new Map();
  for (const e of events) {
    byId.set(e.worktreeId, [...(byId.get(e.worktreeId) ?? []), e.event]);
  }
  assert.deepEqual(byId.get(a.worktreeId), ['CREATED']);
  assert.deepEqual(byId.get(b.worktreeId), ['CREATED']);

  // finish: B removes its own worktree cleanly
  assert.equal(removeIsolatedWorktree({ repoDir, worktreeId: b.worktreeId, worktreeDir: b.worktreeDir }).removed, true);
});

test('S03-007 FAULT: stale cleanup cannot remove a replacement even when paths would otherwise align', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const a = createIsolatedWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  // simulate git removal + crash (registry CREATED still open)
  git(repoDir, ['worktree', 'remove', '--force', a.worktreeDir]);

  // B uses a DIFFERENT default id-derived path; verify a registry with two
  // active records on the same path is impossible to construct via the API
  // and that findCreatedWorktree is identity-bound.
  const { findCreatedWorktree } = await import('../../src/git/worktree-registry.mjs');
  const record = findCreatedWorktree(repoDir, a.worktreeId);
  assert.equal(record.worktreeId, a.worktreeId);
  assert.equal(record.event, 'CREATED');
  // unknown id -> null (never path-based resolution)
  assert.equal(findCreatedWorktree(repoDir, generateWorktreeId()), null);
  // cleanup with a path but NO id is refused before any filesystem action
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeDir: a.worktreeDir }),
    (err) => err instanceof WorktreeSafetyError && /controller-retained worktreeId/.test(err.message),
  );
  // stale cleanup FAILS CLOSED (SOL-S03-R3-001): the git-level removal
  // already destroyed the registration and the marker, so genuine LCIM
  // ownership can no longer be proven through repository-owned Git
  // metadata — registry data alone never authorizes a REMOVED event
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: a.worktreeId }),
    (err) => err instanceof WorktreeSafetyError && /not registered with git/.test(err.message),
  );
});

test('S03-007 FAULT: one-active-record-per-path is enforced at CREATED time', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const a = createIsolatedWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  // a SECOND record claiming the same path under a different id must fail
  assert.throws(
    () =>
      recordWorktreeEvent({
        repoDir,
        worktreeId: generateWorktreeId(),
        workUnitId: makeWorkUnitId(),
        worktreePath: a.worktreeDir,
        baseSha,
        event: 'CREATED',
      }),
    (err) => err instanceof WorktreeSafetyError && /already claimed by active LCIM worktree record/.test(err.message),
  );
  // cleanup of A releases the claim; only then may the path be reused
  removeIsolatedWorktree({ repoDir, worktreeId: a.worktreeId, worktreeDir: a.worktreeDir });
  const b = createIsolatedWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId(), worktreeName: path.basename(a.worktreeDir) });
  assert.notEqual(b.worktreeId, a.worktreeId);
  removeIsolatedWorktree({ repoDir, worktreeId: b.worktreeId, worktreeDir: b.worktreeDir });
});

// ---- concurrent controller processes ----

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CHILD_SCRIPT = path.join(HERE, '..', 'helpers', 'registry-concurrency-child.mjs');

function runChild(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CHILD_SCRIPT, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`child exited ${code}: ${stderr}`));
      else resolve(JSON.parse(stdout.trim().split('\n').pop()));
    });
  });
}

test('S03-007 CONCURRENT: two controller processes create/remove separate same-base worktrees', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);

  // Phase 1: both controllers CREATE concurrently (no removal yet)
  const [a, b] = await Promise.all([
    runChild(['create', repoDir, worktreeRoot, baseSha, makeWorkUnitId()]),
    runChild(['create', repoDir, worktreeRoot, baseSha, makeWorkUnitId()]),
  ]);
  assert.notEqual(a.worktreeId, b.worktreeId, 'distinct worktreeIds');
  assert.notEqual(a.worktreeDir, b.worktreeDir, 'distinct owned paths');
  assert.ok(fs.existsSync(a.worktreeDir) && fs.existsSync(b.worktreeDir));

  // Neither controller can remove the OTHER's worktree (id/path binding)
  for (const [mine, theirs] of [[a, b], [b, a]]) {
    assert.throws(
      () => removeIsolatedWorktree({ repoDir, worktreeId: mine.worktreeId, worktreeDir: theirs.worktreeDir }),
      (err) => err instanceof WorktreeSafetyError && /does not match the registered path/.test(err.message),
    );
    assert.ok(fs.existsSync(theirs.worktreeDir), 'the other worktree must remain intact');
  }

  // Phase 2: each controller removes its OWN worktree concurrently
  const [ra, rb] = await Promise.all([
    runChild(['remove', repoDir, worktreeRoot, baseSha, makeWorkUnitId(), a.worktreeId]),
    runChild(['remove', repoDir, worktreeRoot, baseSha, makeWorkUnitId(), b.worktreeId]),
  ]);
  assert.equal(ra.removed, true);
  assert.equal(rb.removed, true);
  assert.ok(!fs.existsSync(a.worktreeDir) && !fs.existsSync(b.worktreeDir));

  // Registry remains append-only, parseable, and transition-valid
  const events = loadWorktreeEvents(repoDir);
  const byId = new Map();
  for (const e of events) {
    byId.set(e.worktreeId, [...(byId.get(e.worktreeId) ?? []), e.event]);
  }
  assert.deepEqual(byId.get(a.worktreeId), ['CREATED', 'REMOVED']);
  assert.deepEqual(byId.get(b.worktreeId), ['CREATED', 'REMOVED']);
});

test('S03-007 CONCURRENT: registry appends from two processes stay line-intact and transition-valid', async (t) => {
  const { repoDir, baseSha } = await makeWorkerFixture(t);
  const n = 12;
  const [x, y] = await Promise.all([
    runChild(['burst', repoDir, '/tmp', baseSha, makeWorkUnitId(), String(n), 'x']),
    runChild(['burst', repoDir, '/tmp', baseSha, makeWorkUnitId(), String(n), 'y']),
  ]);
  assert.equal(x.written, n);
  assert.equal(y.written, n);
  const events = loadWorktreeEvents(repoDir); // strict parse + transition validation
  assert.equal(events.length, 2 * n);
  assert.equal(new Set(events.map((e) => e.worktreeId)).size, 2 * n, 'all ids distinct');
});
