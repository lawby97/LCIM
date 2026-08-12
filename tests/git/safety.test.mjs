/**
 * Sprint 03 tests: worker-safety detection surface.
 *
 * Required coverage: worker commit/push/merge/destructive commands are
 * blocked/detected according to the existing safety model — via HEAD
 * movement, ref snapshots, reflog entries, config snapshots, remote
 * advertisement changes, and parent-worktree preservation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { git } from '../helpers/git-fixture.mjs';
import { commitToParent, makeBareRemote, makeWorkerFixture, makeWorkUnitId, workerGit } from '../helpers/git-safety-fixture.mjs';
import { prepareWorkerWorktree } from '../../src/git/pipeline.mjs';
import { checkWorkerSafety } from '../../src/validation/git/safety.mjs';
import { WorktreeSafetyError, BaseMismatchError } from '../../src/git/errors.mjs';
import { validateBaseAtCheckpoint } from '../../src/validation/git/base.mjs';

test('clean worker exit passes every safety check', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  // worker edits a file only (no git history operations)
  fs.writeFileSync(path.join(ctx.worktreeDir, 'a.txt'), 'worker edit\n');
  const result = checkWorkerSafety({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, snapshot: ctx });
  assert.equal(result.ok, true);
  assert.equal(result.details.parentPreserved, true);
  assert.equal(result.details.reflogEntriesAdded.length, 0);
});

test('worker-created commit is detected (HEAD moved + reflog evidence)', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  workerGit(ctx.worktreeDir, ['commit', '--allow-empty', '-m', 'worker commit']);
  // base checkpoint fails first (HEAD moved)
  assert.throws(
    () => validateBaseAtCheckpoint({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, checkpoint: 'POST_EXIT' }),
    BaseMismatchError,
  );
  assert.throws(
    () => checkWorkerSafety({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, snapshot: ctx }),
    WorktreeSafetyError,
  );
});

test('worker commit hidden by reset is still detected via reflog', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  workerGit(ctx.worktreeDir, ['commit', '--allow-empty', '-m', 'worker commit']);
  workerGit(ctx.worktreeDir, ['reset', '--hard', baseSha]);
  // HEAD is back on base...
  assert.equal(workerGit(ctx.worktreeDir, ['rev-parse', 'HEAD']).trim(), baseSha);
  // ...but the reflog still records commit + reset (destructive op detection)
  assert.throws(
    () => checkWorkerSafety({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, snapshot: ctx }),
    (err) => err instanceof WorktreeSafetyError && /forbidden git operations/.test(err.message),
  );
});

test('worker-created branch ref is detected even when HEAD is restored', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  workerGit(ctx.worktreeDir, ['commit', '--allow-empty', '-m', 'worker commit']);
  workerGit(ctx.worktreeDir, ['branch', 'worker-secret-branch']);
  workerGit(ctx.worktreeDir, ['reset', '--hard', baseSha]);
  assert.throws(
    () => checkWorkerSafety({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, snapshot: ctx }),
    (err) => err instanceof WorktreeSafetyError && /refs/.test(err.message),
  );
});

test('worker merge is detected (HEAD moves and/or reflog records merge)', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  // create a side branch in the shared repo (controller-like), then worker merges it
  workerGit(ctx.worktreeDir, ['commit', '--allow-empty', '-m', 'side work']);
  workerGit(ctx.worktreeDir, ['branch', 'side']);
  workerGit(ctx.worktreeDir, ['reset', '--hard', baseSha]);
  workerGit(ctx.worktreeDir, ['merge', '--no-edit', 'side']);
  assert.throws(
    () => checkWorkerSafety({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, snapshot: ctx }),
    WorktreeSafetyError,
  );
});

test('worker remote addition is detected via config snapshot (push preparation)', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  workerGit(ctx.worktreeDir, ['remote', 'add', 'origin', '/tmp/not-a-real-remote']);
  assert.throws(
    () => checkWorkerSafety({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, snapshot: ctx }),
    (err) => err instanceof WorktreeSafetyError && /configuration/.test(err.message),
  );
});

test('worker push to an existing remote is detected via advertised refs', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const { remote, name } = makeBareRemote(t);
  git(repoDir, ['remote', 'add', name, remote]);
  git(repoDir, ['push', '-q', name, `HEAD:refs/heads/main`]);
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  // worker pushes a new branch to the remote (no local commit needed)
  workerGit(ctx.worktreeDir, ['push', '-q', name, `HEAD:refs/heads/worker-exfil`]);
  assert.throws(
    () => checkWorkerSafety({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, snapshot: ctx }),
    // push creates a local remote-tracking ref (refs check) AND changes the
    // remote advertisement (remote check) — either detection is correct
    (err) => err instanceof WorktreeSafetyError && /refs|pushed to a remote/.test(err.message),
  );
});

test('parent dirty state is preserved and identical after the worker run', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  fs.writeFileSync(path.join(repoDir, 'a.txt'), 'parent local edit\n');
  fs.writeFileSync(path.join(repoDir, 'parent-untracked.txt'), 'untracked\n');
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  // worker runs, then parent must be byte-identical
  fs.writeFileSync(path.join(ctx.worktreeDir, 'a.txt'), 'worker edit\n');
  fs.writeFileSync(path.join(ctx.worktreeDir, 'new.txt'), 'new\n');
  checkWorkerSafety({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, snapshot: ctx });
  const porcelain = git(repoDir, ['status', '--porcelain']).split('\n').filter(Boolean).sort();
  assert.deepEqual(porcelain, [' M a.txt', '?? parent-untracked.txt']);
  assert.equal(git(repoDir, ['rev-parse', 'HEAD']).trim(), baseSha);
});

test('worker changing the parent HEAD or dirty state is detected', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);

  // scenario A: parent dirty state changes during the run (no ref change)
  const ctxA = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  fs.writeFileSync(path.join(repoDir, 'touched-parent.txt'), 'external write\n');
  assert.throws(
    () => checkWorkerSafety({ repoDir, worktreeDir: ctxA.worktreeDir, expectedBaseSha: baseSha, snapshot: ctxA }),
    (err) => err instanceof WorktreeSafetyError && /dirty state|refs/.test(err.message),
  );

  // scenario B: parent HEAD advances during the run (refs move first)
  const ctxB = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  commitToParent(repoDir, 'touched.txt', 'x\n');
  assert.throws(
    () => checkWorkerSafety({ repoDir, worktreeDir: ctxB.worktreeDir, expectedBaseSha: baseSha, snapshot: ctxB }),
    (err) => err instanceof WorktreeSafetyError && /refs|parent worktree HEAD/.test(err.message),
  );
});

test('missing snapshot fails closed (defense against caller error)', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  assert.throws(
    () => checkWorkerSafety({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, snapshot: null }),
    WorktreeSafetyError,
  );
});
