/**
 * Sprint 03 tests: base-SHA validation at all four checkpoints and the
 * serial candidate-base policy.
 *
 * Required coverage: wrong/stale base fails at EVERY specified checkpoint
 * (PRE_SPAWN, POST_EXIT, PRE_EXTRACT, PRE_INTEGRATION), and accepted unit N
 * yields the only allowed base for dependent unit N+1.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { git } from '../helpers/git-fixture.mjs';
import { commitToParent, makeWorkerFixture, makeWorkUnitId, workerGit } from '../helpers/git-safety-fixture.mjs';
import { validateBaseAtCheckpoint, BASE_CHECKPOINTS, nextSerialBase } from '../../src/validation/git/base.mjs';
import { prepareWorkerWorktree } from '../../src/git/pipeline.mjs';
import { BaseMismatchError } from '../../src/git/errors.mjs';
import { ConfigError } from '../../src/shared/errors.mjs';

test('checkpoint vocabulary and argument validation', async (t) => {
  const { repoDir, baseSha } = await makeWorkerFixture(t);
  assert.deepEqual(BASE_CHECKPOINTS, ['PRE_SPAWN', 'POST_EXIT', 'PRE_EXTRACT', 'PRE_INTEGRATION']);
  assert.throws(() => validateBaseAtCheckpoint({ repoDir, expectedBaseSha: baseSha, checkpoint: 'LATER' }), ConfigError);
  assert.throws(() => validateBaseAtCheckpoint({ repoDir, expectedBaseSha: 'short', checkpoint: 'PRE_SPAWN' }), /40-hex/);
});

test('PRE_SPAWN: expected base must be an existing commit; canonical full sha required', async (t) => {
  const { repoDir, baseSha } = await makeWorkerFixture(t);
  assert.equal(validateBaseAtCheckpoint({ repoDir, expectedBaseSha: baseSha, checkpoint: 'PRE_SPAWN' }).ok, true);
  // nonexistent sha
  assert.throws(
    () => validateBaseAtCheckpoint({ repoDir, expectedBaseSha: 'f'.repeat(40), checkpoint: 'PRE_SPAWN' }),
    BaseMismatchError,
  );
});

test('serial bases: accepted unit N head is the ONLY allowed base for unit N+1 (PRE_SPAWN)', async (t) => {
  const { repoDir, baseSha } = await makeWorkerFixture(t);
  // unit N is accepted: its head H becomes the only allowed base for N+1
  const acceptedHead = commitToParent(repoDir, 'unit-n.txt', 'unit n work\n', 'accept unit N');
  assert.equal(nextSerialBase(null), null);
  assert.equal(nextSerialBase({ headSha: acceptedHead }), acceptedHead);
  assert.throws(() => nextSerialBase({ headSha: 'nope' }), /40-hex/);

  // stale base (the ORIGINAL base, not the accepted head) fails at PRE_SPAWN
  assert.throws(
    () =>
      validateBaseAtCheckpoint({
        repoDir,
        expectedBaseSha: baseSha,
        checkpoint: 'PRE_SPAWN',
        serialBaseSha: acceptedHead,
      }),
    (err) => err instanceof BaseMismatchError && /serial base violation/.test(err.message),
  );
  // the accepted head passes
  assert.equal(
    validateBaseAtCheckpoint({ repoDir, expectedBaseSha: acceptedHead, checkpoint: 'PRE_SPAWN', serialBaseSha: acceptedHead }).ok,
    true,
  );
  // serial base itself must be a well-formed sha
  assert.throws(
    () => validateBaseAtCheckpoint({ repoDir, expectedBaseSha: acceptedHead, checkpoint: 'PRE_SPAWN', serialBaseSha: 'x' }),
    /40-hex/,
  );
});

test('POST_EXIT: worker-created commit moves HEAD and fails closed', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = prepareWorkerWorktree({
    repoDir,
    worktreeRoot,
    expectedBaseSha: baseSha,
    workUnitId: makeWorkUnitId(),
  });
  assert.equal(
    validateBaseAtCheckpoint({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, checkpoint: 'POST_EXIT' }).ok,
    true,
  );
  workerGit(ctx.worktreeDir, ['commit', '--allow-empty', '-m', 'worker commit']);
  assert.throws(
    () => validateBaseAtCheckpoint({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, checkpoint: 'POST_EXIT' }),
    (err) => err instanceof BaseMismatchError && /ahead=1/.test(err.message),
  );
});

test('PRE_EXTRACT: stale/moved worktree HEAD fails immediately before extraction', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = prepareWorkerWorktree({
    repoDir,
    worktreeRoot,
    expectedBaseSha: baseSha,
    workUnitId: makeWorkUnitId(),
  });
  assert.equal(
    validateBaseAtCheckpoint({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, checkpoint: 'PRE_EXTRACT' }).ok,
    true,
  );
  // worker moves the worktree HEAD off the base
  workerGit(ctx.worktreeDir, ['commit', '--allow-empty', '-m', 'worker commit']);
  assert.throws(
    () => validateBaseAtCheckpoint({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, checkpoint: 'PRE_EXTRACT' }),
    BaseMismatchError,
  );
});

test('PRE_INTEGRATION: parent (integration target) must sit on the expected serial base', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = prepareWorkerWorktree({
    repoDir,
    worktreeRoot,
    expectedBaseSha: baseSha,
    workUnitId: makeWorkUnitId(),
  });
  assert.equal(
    validateBaseAtCheckpoint({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, checkpoint: 'PRE_INTEGRATION' }).ok,
    true,
  );
  // parent advanced past the base before handoff (stale integration target)
  commitToParent(repoDir, 'other.txt', 'unrelated\n', 'advance parent');
  assert.throws(
    () => validateBaseAtCheckpoint({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, checkpoint: 'PRE_INTEGRATION' }),
    (err) => err instanceof BaseMismatchError && /integration target HEAD/.test(err.message),
  );
  // worktree moved also fails PRE_INTEGRATION
  workerGit(ctx.worktreeDir, ['commit', '--allow-empty', '-m', 'worker commit']);
  assert.throws(
    () => validateBaseAtCheckpoint({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, checkpoint: 'PRE_INTEGRATION' }),
    BaseMismatchError,
  );
});

test('wrong/stale base fails at EVERY specified checkpoint', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const expected = baseSha; // what the work unit requires
  const wrong = 'f'.repeat(40);

  // 1. PRE_SPAWN — wrong base is not a commit in the repo
  assert.throws(() => validateBaseAtCheckpoint({ repoDir, expectedBaseSha: wrong, checkpoint: 'PRE_SPAWN' }), BaseMismatchError);

  // 2-4. spawn a worktree on the expected base, then corrupt each checkpoint
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: expected, workUnitId: makeWorkUnitId() });

  // POST_EXIT — worker commit moves the worktree HEAD
  workerGit(ctx.worktreeDir, ['commit', '--allow-empty', '-m', 'stale']);
  assert.throws(
    () => validateBaseAtCheckpoint({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: expected, checkpoint: 'POST_EXIT' }),
    BaseMismatchError,
  );

  // PRE_EXTRACT — worktree HEAD still not on the expected base
  assert.throws(
    () => validateBaseAtCheckpoint({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: expected, checkpoint: 'PRE_EXTRACT' }),
    BaseMismatchError,
  );

  // PRE_INTEGRATION — both the stale worktree and the (moved) parent fail
  assert.throws(
    () => validateBaseAtCheckpoint({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: expected, checkpoint: 'PRE_INTEGRATION' }),
    BaseMismatchError,
  );
  // restore the worktree to the base; parent has advanced -> still fails
  workerGit(ctx.worktreeDir, ['reset', '--hard', expected]);
  commitToParent(repoDir, 'extra.txt', 'x\n');
  assert.throws(
    () => validateBaseAtCheckpoint({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: expected, checkpoint: 'PRE_INTEGRATION' }),
    (err) => err instanceof BaseMismatchError && /integration target HEAD/.test(err.message),
  );
});

test('parent worktree is preserved by preparation (dirty parent untouched)', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  // dirty the parent BEFORE spawning: modified tracked file + untracked file
  fs.writeFileSync(path.join(repoDir, 'a.txt'), 'parent-local-edit\n');
  fs.writeFileSync(path.join(repoDir, 'untracked-parent.txt'), 'parent untracked\n');
  const before = git(repoDir, ['status', '--porcelain']).split('\n').filter(Boolean).sort();
  assert.ok(before.length >= 2);

  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });

  // parent dirty state byte-identical after spawn
  const after = git(repoDir, ['status', '--porcelain']).split('\n').filter(Boolean).sort();
  assert.deepEqual(after, before);
  assert.equal(ctx.parentSnapshot.headSha, baseSha);
  // the worker worktree does not see the parent's dirty edits (clean base checkout)
  assert.equal(workerGit(ctx.worktreeDir, ['status', '--porcelain']), '');
});
