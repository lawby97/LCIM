/**
 * SOL-S03-006 regression tests: IDENTITY-BOUND WORKTREE OWNERSHIP.
 *
 * Cleanup is bound to the CONTROLLER-RETAINED worktreeId and must prove it
 * matches the canonical registered path, workUnitId, expected/base SHA,
 * current Git linked-worktree administrative identity, current registry
 * lifecycle, and (when dirty) matching persisted evidence. Registry events
 * are strictly schema/transition validated; malformed or impossible events
 * fail closed. Path-only cleanup is never accepted.
 *
 * A forged CREATED event referencing a foreign linked worktree cannot make
 * that path appear LCIM-owned: the cleanup refuses (here: the foreign
 * worktree's administrative identity does not match the forged base), the
 * foreign worktree remains intact, and no `git worktree remove --force`
 * ever runs against it.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git } from '../helpers/git-fixture.mjs';
import { makeWorkerFixture, makeWorkUnitId } from '../helpers/git-safety-fixture.mjs';
import { createIsolatedWorktree, removeIsolatedWorktree } from '../../src/git/worktree.mjs';
import { loadWorktreeEvents, recordWorktreeEvent, generateWorktreeId, resolveWorktreeRegistryFile } from '../../src/git/worktree-registry.mjs';
import { WorktreeSafetyError } from '../../src/git/errors.mjs';

test('S03-006: forged CREATED event referencing a foreign linked worktree -> cleanup refuses, foreign worktree intact, no remove --force', async (t) => {
  const { repoDir, baseSha } = await makeWorkerFixture(t);

  // A FOREIGN linked worktree on its own branch (never created by LCIM)
  const foreignRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s03-foreign-'));
  t.after(() => {
    try {
      git(repoDir, ['worktree', 'remove', '--force', foreign]);
    } catch {
      /* best effort */
    }
    fs.rmSync(foreignRoot, { recursive: true, force: true });
  });
  const foreign = path.join(foreignRoot, 'foreign-wt');
  git(repoDir, ['worktree', 'add', '-b', 'foreign-branch', foreign]);
  fs.writeFileSync(path.join(foreign, 'user-file.txt'), 'precious user work\n');
  git(foreign, ['add', 'user-file.txt']);
  git(foreign, ['commit', '-m', 'foreign work']); // foreign HEAD != baseSha now

  // FORGE: a syntactically plausible CREATED event claiming LCIM created it
  // at baseSha (the ORIGINAL base — the foreign worktree now sits on a
  // later commit, so the claimed admin identity does not hold)
  const forgedId = generateWorktreeId();
  recordWorktreeEvent({
    repoDir,
    worktreeId: forgedId,
    workUnitId: makeWorkUnitId(),
    worktreePath: foreign,
    baseSha,
    event: 'CREATED',
  });

  // cleanup using the stale/forged information must refuse
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: forgedId, worktreeDir: foreign }),
    (err) =>
      err instanceof WorktreeSafetyError &&
      /HEAD .* does not match the registered base/.test(err.message),
  );
  // foreign worktree remains intact — no `git worktree remove --force` ran
  assert.ok(fs.existsSync(foreign));
  assert.ok(fs.existsSync(path.join(foreign, 'user-file.txt')));
  assert.equal(fs.readFileSync(path.join(foreign, 'user-file.txt'), 'utf8'), 'precious user work\n');
  const list = git(repoDir, ['worktree', 'list', '--porcelain']);
  assert.ok(list.includes(foreign), 'foreign worktree still registered');
  assert.ok(git(repoDir, ['for-each-ref', '--format=%(refname)']).includes('refs/heads/foreign-branch'));
});

test('S03-006: forged CREATED event referencing a foreign DETACHED worktree at a mismatched commit -> refuse', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const foreignRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s03-foreign-'));
  t.after(() => {
    try {
      git(repoDir, ['worktree', 'remove', '--force', foreign]);
    } catch {
      /* best effort */
    }
    fs.rmSync(foreignRoot, { recursive: true, force: true });
  });
  const foreign = path.join(foreignRoot, 'foreign-detached');
  // foreign worktree detached at a commit that is NOT the claimed base
  fs.writeFileSync(path.join(repoDir, 'extra.txt'), 'x\n');
  git(repoDir, ['add', 'extra.txt']);
  git(repoDir, ['commit', '-m', 'advance']);
  const laterSha = git(repoDir, ['rev-parse', 'HEAD']).trim();
  git(repoDir, ['worktree', 'add', '--detach', foreign, laterSha]);

  const forgedId = generateWorktreeId();
  recordWorktreeEvent({ repoDir, worktreeId: forgedId, workUnitId: makeWorkUnitId(), worktreePath: foreign, baseSha, event: 'CREATED' });
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: forgedId, worktreeDir: foreign }),
    (err) => err instanceof WorktreeSafetyError && /does not match the registered base/.test(err.message),
  );
  assert.ok(fs.existsSync(foreign));
});

test('S03-006: path-only cleanup (no worktreeId) is refused', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = createIsolatedWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeDir: ctx.worktreeDir }),
    (err) => err instanceof WorktreeSafetyError && /controller-retained worktreeId/.test(err.message),
  );
  // cleanup with the correct id still works (identity-bound)
  assert.equal(removeIsolatedWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir }).removed, true);
});

test('S03-006: cleanup refuses when the supplied path does not match the registered path for the id', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const a = createIsolatedWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  const b = createIsolatedWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  // A's id with B's path: refuse (path must equal the canonical registered path)
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: a.worktreeId, worktreeDir: b.worktreeDir }),
    (err) => err instanceof WorktreeSafetyError && /does not match the registered path/.test(err.message),
  );
  assert.ok(fs.existsSync(b.worktreeDir));
  removeIsolatedWorktree({ repoDir, worktreeId: a.worktreeId, worktreeDir: a.worktreeDir });
  removeIsolatedWorktree({ repoDir, worktreeId: b.worktreeId, worktreeDir: b.worktreeDir });
});

test('S03-006: malformed registry events fail closed (unknown fields, bad shapes, impossible transitions)', async (t) => {
  const { repoDir, baseSha } = await makeWorkerFixture(t);
  const file = resolveWorktreeRegistryFile(repoDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const base = {
    worktreeId: generateWorktreeId(),
    workUnitId: makeWorkUnitId(),
    worktreePath: '/tmp/whatever-wt',
    baseSha,
    event: 'CREATED',
    at: new Date().toISOString(),
  };

  const cases = [
    ['unknown field', { ...base, sneaky: true }],
    ['bad worktreeId', { ...base, worktreeId: 'not-an-id' }],
    ['bad workUnitId', { ...base, workUnitId: 'nope' }],
    ['bad event', { ...base, event: 'DELETED' }],
    ['relative path', { ...base, worktreePath: 'relative/path' }],
    ['bad baseSha', { ...base, baseSha: 'short' }],
    ['bad timestamp', { ...base, at: 'yesterday' }],
    ['bad evidenceRefs', { ...base, event: 'REMOVED', evidenceRefs: [42] }],
  ];
  for (const [label, line] of cases) {
    fs.appendFileSync(file, `${JSON.stringify(line)}\n`);
    assert.throws(
      () => loadWorktreeEvents(repoDir),
      (err) => err instanceof WorktreeSafetyError && /malformed|invalid/.test(err.message),
      `malformed event must fail closed: ${label}`,
    );
    fs.truncateSync(file, 0); // reset registry for the next case
  }

  // impossible transition: CREATED twice for the same id
  const id = generateWorktreeId();
  fs.appendFileSync(file, `${JSON.stringify({ ...base, worktreeId: id })}\n`);
  fs.appendFileSync(file, `${JSON.stringify({ ...base, worktreeId: id })}\n`);
  assert.throws(
    () => loadWorktreeEvents(repoDir),
    (err) => err instanceof WorktreeSafetyError && /impossible worktree registry transition/.test(err.message),
  );
  fs.truncateSync(file, 0);

  // impossible transition: REMOVED without CREATED
  fs.appendFileSync(file, `${JSON.stringify({ ...base, event: 'REMOVED' })}\n`);
  assert.throws(
    () => loadWorktreeEvents(repoDir),
    (err) => err instanceof WorktreeSafetyError && /impossible worktree registry transition/.test(err.message),
  );
});

test('S03-006: worker-style registry write cannot claim a foreign path as its own evidence of ownership', async (t) => {
  // The registry is controller-owned; a forged-but-valid event is still
  // insufficient on its own: cleanup additionally requires the CURRENT git
  // administrative identity to match the registered base, and (when dirty)
  // matching persisted evidence. Verify the full refusal chain for a forged
  // event whose claimed base MATCHES the foreign worktree HEAD but which has
  // no evidence chain: a dirty foreign worktree must still be refused.
  const { repoDir, baseSha } = await makeWorkerFixture(t);
  const foreignRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s03-foreign-'));
  t.after(() => {
    try {
      git(repoDir, ['worktree', 'remove', '--force', foreign]);
    } catch {
      /* best effort */
    }
    fs.rmSync(foreignRoot, { recursive: true, force: true });
  });
  const foreign = path.join(foreignRoot, 'foreign-dirty');
  git(repoDir, ['worktree', 'add', '--detach', foreign, baseSha]); // HEAD == claimed base
  fs.writeFileSync(path.join(foreign, 'dirty-user-work.txt'), 'user bytes\n'); // dirty

  const forgedId = generateWorktreeId();
  recordWorktreeEvent({ repoDir, worktreeId: forgedId, workUnitId: makeWorkUnitId(), worktreePath: foreign, baseSha, event: 'CREATED' });
  // dirty + no verified matching evidence -> refuse (arbitrary refs fail)
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: forgedId, worktreeDir: foreign, evidenceRefs: ['x'] }),
    (err) => /outside the canonical LCIM evidence store/.test(err.message),
  );
  assert.ok(fs.existsSync(path.join(foreign, 'dirty-user-work.txt')));
  // still intact, and a later cleanup without evidence also refuses
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: forgedId, worktreeDir: foreign }),
    (err) => err instanceof WorktreeSafetyError && /persist patch evidence before cleanup/.test(err.message),
  );
});
