/**
 * SOL-S03-003 regression tests: PARENT / FOREIGN WORKTREE WRITE SAFETY.
 *
 * Two layers are required:
 *
 * A. PREVENTION — an actual controller-owned worker execution boundary that
 *    blocks writes to the parent/sibling worktrees. LCIM V2 Sprint 03 does
 *    NOT contain such a boundary (no worker runner/sandbox exists in this
 *    sprint; it is requested in ICR-2026-001 and consumed by Sprint 10).
 *    These tests therefore do NOT claim the write is blocked — the
 *    prevention acceptance proof is BLOCKED, not faked.
 *
 * B. DETECTION (defense in depth, implemented in Sprint 03) — the parent
 *    snapshot now carries cryptographic content digests of dirty tracked
 *    files, staged changes, and untracked user files. A byte change that
 *    leaves the porcelain shape identical is still detected and fails
 *    closed. Only digests + path/type metadata are stored — never raw user
 *    contents.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { git } from '../helpers/git-fixture.mjs';
import { makeWorkerFixture, makeWorkUnitId } from '../helpers/git-safety-fixture.mjs';
import { prepareWorkerWorktree } from '../../src/git/pipeline.mjs';
import { checkWorkerSafety } from '../../src/validation/git/safety.mjs';
import { snapshotParentState, parentContentDigest } from '../../src/git/state.mjs';
import { WorktreeSafetyError } from '../../src/git/errors.mjs';

test('S03-003: parent snapshot stores digests, NEVER raw user contents', async (t) => {
  const { repoDir, baseSha } = await makeWorkerFixture(t);
  fs.writeFileSync(path.join(repoDir, 'a.txt'), 'secret-parent-content\n');
  fs.writeFileSync(path.join(repoDir, 'untracked-secret.txt'), 'untracked user bytes\n');
  const snapshot = snapshotParentState(repoDir);
  assert.equal(snapshot.headSha, baseSha);
  assert.ok(Array.isArray(snapshot.contentDigest));
  const serialized = JSON.stringify(snapshot.contentDigest);
  assert.ok(!serialized.includes('secret-parent-content'), 'raw content must never be stored');
  assert.ok(!serialized.includes('untracked user bytes'), 'raw content must never be stored');
  const aEntry = snapshot.contentDigest.find((e) => e.path === 'a.txt' && e.layer === 'worktree');
  const uEntry = snapshot.contentDigest.find((e) => e.path === 'untracked-secret.txt' && e.layer === 'untracked');
  assert.ok(aEntry && /^[0-9a-f]{64}$/.test(aEntry.digest), 'expected a sha256 digest entry');
  assert.ok(uEntry && /^[0-9a-f]{64}$/.test(uEntry.digest), 'expected a sha256 digest entry');
});

test('S03-003: byte change with IDENTICAL porcelain shape is detected and fails closed', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  // dirty parent BEFORE spawn: tracked file modified with known bytes A
  fs.writeFileSync(path.join(repoDir, 'a.txt'), 'AAAA\n');
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  const porcelainLines = () => git(repoDir, ['status', '--porcelain']).split('\n').filter(Boolean).sort();
  assert.deepEqual(porcelainLines(), [' M a.txt']);

  // SIMULATED boundary bypass: parent bytes replaced with B while the
  // porcelain shape stays identical (" M a.txt"). Sprint 03 has no
  // execution boundary to block this write (see ICR-2026-001); the
  // detection layer must catch it.
  fs.writeFileSync(path.join(repoDir, 'a.txt'), 'BBBB\n');
  assert.deepEqual(porcelainLines(), [' M a.txt'], 'porcelain shape unchanged');

  assert.throws(
    () => checkWorkerSafety({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, snapshot: ctx }),
    (err) => err instanceof WorktreeSafetyError && /content digests differ/.test(err.message),
  );
  // identical porcelain + identical bytes still passes (no false positive)
  fs.writeFileSync(path.join(repoDir, 'a.txt'), 'AAAA\n');
  const ok = checkWorkerSafety({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, snapshot: ctx });
  assert.equal(ok.ok, true);
});

test('S03-003: untracked parent file byte change is detected', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  fs.writeFileSync(path.join(repoDir, 'user-notes.txt'), 'version one\n');
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  const porcelainLines = () => git(repoDir, ['status', '--porcelain']).split('\n').filter(Boolean).sort();
  assert.deepEqual(porcelainLines(), ['?? user-notes.txt']);
  // same porcelain (still untracked), different bytes
  fs.writeFileSync(path.join(repoDir, 'user-notes.txt'), 'version two\n');
  assert.deepEqual(porcelainLines(), ['?? user-notes.txt']);
  assert.throws(
    () => checkWorkerSafety({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, snapshot: ctx }),
    (err) => err instanceof WorktreeSafetyError && /content digests differ/.test(err.message),
  );
});

test('S03-003: staged (index) change is captured via blob digest and detected', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  // stage a change in the parent (index differs from HEAD)
  fs.writeFileSync(path.join(repoDir, 'a.txt'), 'staged bytes\n');
  git(repoDir, ['add', 'a.txt']);
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  const porcelainLines = () => git(repoDir, ['status', '--porcelain']).split('\n').filter(Boolean).sort();
  assert.deepEqual(porcelainLines(), ['M  a.txt']);

  // the staged blob is REPLACED by a different staged blob; porcelain stays "M  a.txt"
  fs.writeFileSync(path.join(repoDir, 'a.txt'), 're-staged bytes\n');
  git(repoDir, ['add', 'a.txt']);
  assert.deepEqual(porcelainLines(), ['M  a.txt'], 'porcelain shape unchanged');
  assert.throws(
    () => checkWorkerSafety({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, snapshot: ctx }),
    (err) => err instanceof WorktreeSafetyError && /content digests differ/.test(err.message),
  );
});

test('S03-003: parentContentDigest covers dirty tracked + staged + untracked layers', async (t) => {
  const { repoDir } = await makeWorkerFixture(t);
  fs.writeFileSync(path.join(repoDir, 'a.txt'), 'dirty\n');
  fs.writeFileSync(path.join(repoDir, 'staged.txt'), 'staged\n');
  git(repoDir, ['add', 'staged.txt']);
  fs.writeFileSync(path.join(repoDir, 'new-untracked.txt'), 'untracked\n');
  const digest = parentContentDigest(repoDir);
  const paths = digest.map((e) => `${e.layer}:${e.path}`).sort();
  assert.ok(paths.includes('worktree:a.txt'));
  assert.ok(paths.includes('index:staged.txt'));
  assert.ok(paths.includes('untracked:new-untracked.txt'));
  // deletion in the worktree layer is represented with a null digest
  fs.unlinkSync(path.join(repoDir, 'a.txt'));
  const after = parentContentDigest(repoDir);
  const deleted = after.find((e) => e.path === 'a.txt' && e.layer === 'worktree');
  assert.equal(deleted.digest, null);
});
