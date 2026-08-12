/**
 * Sprint 03 tests: isolated detached worker worktree lifecycle.
 *
 * Covers: creation rooted at an explicit expected_base_sha, detached state,
 * same-base parallel worktrees, registry bookkeeping, and fail-closed
 * cleanup (LCIM-created only, never the main worktree, dirty worktree
 * requires persisted evidence, missing-dir prune).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git } from '../helpers/git-fixture.mjs';
import { makeWorkerFixture, makeWorkUnitId, workerGit } from '../helpers/git-safety-fixture.mjs';
import { createIsolatedWorktree, removeIsolatedWorktree } from '../../src/git/worktree.mjs';
import { loadWorktreeEvents } from '../../src/git/worktree-registry.mjs';
import { BaseMismatchError, WorktreeSafetyError } from '../../src/git/errors.mjs';
import { ConfigError } from '../../src/shared/errors.mjs';

test('createIsolatedWorktree spawns a detached worktree rooted at expectedBaseSha', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = createIsolatedWorktree({
    repoDir,
    worktreeRoot,
    expectedBaseSha: baseSha,
    workUnitId: makeWorkUnitId(),
  });
  assert.ok(fs.existsSync(ctx.worktreeDir));
  assert.equal(ctx.baseSha, baseSha);
  assert.equal(ctx.headSha, baseSha);
  // detached: no branch checked out
  assert.equal(workerGit(ctx.worktreeDir, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(), 'HEAD');
  // clean checkout of the base, nothing else
  assert.equal(workerGit(ctx.worktreeDir, ['status', '--porcelain']), '');
  // parent untouched
  assert.equal(git(repoDir, ['rev-parse', 'HEAD']).trim(), baseSha);
  assert.equal(git(repoDir, ['status', '--porcelain']), '');
  // registered in git + in the LCIM registry
  const list = git(repoDir, ['worktree', 'list', '--porcelain']);
  assert.ok(list.includes(ctx.worktreeDir));
  const events = loadWorktreeEvents(repoDir);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'CREATED');
  assert.equal(events[0].worktreeId, ctx.worktreeId);
  assert.equal(events[0].baseSha, baseSha);
});

test('PRE_SPAWN: unknown base sha fails closed before any worktree is created', async (t) => {
  const { repoDir, worktreeRoot } = await makeWorkerFixture(t);
  assert.throws(
    () =>
      createIsolatedWorktree({
        repoDir,
        worktreeRoot,
        expectedBaseSha: 'f'.repeat(40),
        workUnitId: makeWorkUnitId(),
      }),
    BaseMismatchError,
  );
  // no worktree was created, nothing registered
  assert.equal(loadWorktreeEvents(repoDir).length, 0);
});

test('invalid inputs fail closed (bad sha shape, bad work unit id, unsafe name)', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  assert.throws(
    () => createIsolatedWorktree({ repoDir, worktreeRoot, expectedBaseSha: 'abc', workUnitId: makeWorkUnitId() }),
    /40-hex/,
  );
  assert.throws(
    () => createIsolatedWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: 'nope' }),
    ConfigError,
  );
  assert.throws(
    () =>
      createIsolatedWorktree({
        repoDir,
        worktreeRoot,
        expectedBaseSha: baseSha,
        workUnitId: makeWorkUnitId(),
        worktreeName: '../evil',
      }),
    ConfigError,
  );
});

test('worker worktree must live OUTSIDE the parent work tree', async (t) => {
  const { repoDir, baseSha } = await makeWorkerFixture(t);
  assert.throws(
    () =>
      createIsolatedWorktree({
        repoDir,
        worktreeRoot: repoDir, // target would be INSIDE the parent work tree
        expectedBaseSha: baseSha,
        workUnitId: makeWorkUnitId(),
        worktreeName: 'sub',
      }),
    WorktreeSafetyError,
  );
  assert.ok(!fs.existsSync(path.join(repoDir, 'sub')));
});

test('same-base parallel worktrees coexist (no lock conflict)', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const a = createIsolatedWorktree({
    repoDir,
    worktreeRoot,
    expectedBaseSha: baseSha,
    workUnitId: makeWorkUnitId(),
    worktreeName: 'wt-a',
  });
  const b = createIsolatedWorktree({
    repoDir,
    worktreeRoot,
    expectedBaseSha: baseSha,
    workUnitId: makeWorkUnitId(),
    worktreeName: 'wt-b',
  });
  assert.notEqual(a.worktreeDir, b.worktreeDir);
  assert.equal(workerGit(a.worktreeDir, ['rev-parse', 'HEAD']).trim(), baseSha);
  assert.equal(workerGit(b.worktreeDir, ['rev-parse', 'HEAD']).trim(), baseSha);
  // both registered
  const list = git(repoDir, ['worktree', 'list', '--porcelain']);
  assert.ok(list.includes(a.worktreeDir) && list.includes(b.worktreeDir));
  // both removed cleanly afterwards (clean worktrees: no evidence needed)
  assert.equal(removeIsolatedWorktree({ repoDir, worktreeId: a.worktreeId, worktreeDir: a.worktreeDir }).removed, true);
  assert.equal(removeIsolatedWorktree({ repoDir, worktreeId: b.worktreeId, worktreeDir: b.worktreeDir }).removed, true);
});

test('cleanup refuses worktrees LCIM did not create (unknown worktreeId)', async (t) => {
  const { repoDir, baseSha } = await makeWorkerFixture(t);
  const foreignRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s03-foreign-'));
  t.after(() => fs.rmSync(foreignRoot, { recursive: true, force: true }));
  const foreign = path.join(foreignRoot, 'foreign-wt');
  git(repoDir, ['worktree', 'add', '--detach', foreign, baseSha]);
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeDir: foreign }),
    (err) => err instanceof WorktreeSafetyError && /controller-retained worktreeId/.test(err.message),
  );
  // a syntactically valid but unknown worktreeId is also refused
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: 'lcim_wt_' + 'a'.repeat(32), worktreeDir: foreign }),
    (err) => err instanceof WorktreeSafetyError && /no active \(CREATED\) LCIM registry record/.test(err.message),
  );
  // still registered and present — never destroyed
  assert.ok(fs.existsSync(foreign));
  // clean it up via git directly so the fixture repo is tidy
  git(repoDir, ['worktree', 'remove', '--force', foreign]);
});

test('cleanup refuses to remove the main/parent worktree', async (t) => {
  const { repoDir, baseSha } = await makeWorkerFixture(t);
  // forge a registry entry pointing at the parent so only the guard can stop it
  const { recordWorktreeEvent, generateWorktreeId } = await import('../../src/git/worktree-registry.mjs');
  const forgedId = generateWorktreeId();
  recordWorktreeEvent({
    repoDir,
    worktreeId: forgedId,
    workUnitId: makeWorkUnitId(),
    worktreePath: repoDir,
    baseSha,
    event: 'CREATED',
  });
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: forgedId, worktreeDir: repoDir, evidenceRefs: ['x'] }),
    (err) => err instanceof WorktreeSafetyError && /main\/parent worktree/.test(err.message),
  );
  assert.ok(fs.existsSync(repoDir));
});

test('dirty worker worktree cannot be cleaned up until verified matching evidence was persisted', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = createIsolatedWorktree({
    repoDir,
    worktreeRoot,
    expectedBaseSha: baseSha,
    workUnitId: makeWorkUnitId(),
    worktreeName: 'dirty-wt',
  });
  fs.writeFileSync(path.join(ctx.worktreeDir, 'leftover.txt'), 'worker scratch\n');

  // without evidence refs: refused
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir }),
    (err) => err instanceof WorktreeSafetyError && /persist patch evidence before cleanup/.test(err.message),
  );
  assert.ok(fs.existsSync(ctx.worktreeDir));

  // arbitrary strings are NOT evidence: refused
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir, evidenceRefs: ['x'] }),
    (err) => /outside the canonical LCIM evidence store/.test(err.message),
  );
  assert.ok(fs.existsSync(ctx.worktreeDir));

  // collect + persist REAL controller evidence bound to this worktree
  const { collectPatchEvidence } = await import('../../src/evidence/patch/collector.mjs');
  const { persistPatchEvidence } = await import('../../src/evidence/patch/store.mjs');
  const collected = collectPatchEvidence({
    worktreeDir: ctx.worktreeDir,
    expectedBaseSha: baseSha,
    workUnitId: ctx.workUnitId,
    worktreeId: ctx.worktreeId,
  });
  const { evidenceId } = persistPatchEvidence({ repoDir, record: collected.record, patchText: collected.patchText });

  // with verified matching evidence: removed, and registry shows CREATED then REMOVED
  const result = removeIsolatedWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir, evidenceRefs: [evidenceId] });
  assert.equal(result.removed, true);
  assert.ok(!fs.existsSync(ctx.worktreeDir));
  const events = loadWorktreeEvents(repoDir);
  assert.deepEqual(events.map((e) => e.event), ['CREATED', 'REMOVED']);
  assert.deepEqual(events[1].evidenceRefs, [evidenceId]);
  assert.ok(!git(repoDir, ['worktree', 'list', '--porcelain']).includes(ctx.worktreeDir));
});

test('cleanup prunes stale metadata when the LCIM worktree directory is already gone', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = createIsolatedWorktree({
    repoDir,
    worktreeRoot,
    expectedBaseSha: baseSha,
    workUnitId: makeWorkUnitId(),
    worktreeName: 'vanished-wt',
  });
  fs.rmSync(ctx.worktreeDir, { recursive: true, force: true });
  const result = removeIsolatedWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir });
  assert.equal(result.removed, true);
  assert.equal(result.pruned, true);
  const events = loadWorktreeEvents(repoDir);
  assert.deepEqual(events.map((e) => e.event), ['CREATED', 'REMOVED']);
});
