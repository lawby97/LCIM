/**
 * SOL-S03-R3-001 regression tests: A MISSING CHECKOUT DIRECTORY MUST NOT
 * BYPASS THE OWNERSHIP PROOF.
 *
 * The exact exploit: a FOREIGN linked worktree (no genuine LCIM ownership
 * marker) whose checkout directory has vanished, claimed by a structurally
 * valid forged registry CREATED event. The old missing-directory path
 * trusted registry data and ran `git worktree prune` with no marker
 * validation at all — a forged registry event alone authorized destructive
 * repository-administrative cleanup (removal of the foreign Git
 * registration + REMOVED + success report).
 *
 * Fixed behavior: the per-worktree Git admin directory is derived from
 * REPOSITORY-OWNED Git metadata (`git worktree list --porcelain` plus
 * enumeration of <common>/worktrees/*, cross-checked through git-written
 * commondir/gitdir/HEAD files — never a registry/worker/caller-supplied
 * path), and the genuine controller-created ownership marker must exist
 * inside that exact derived admin directory and bind to every registered
 * identity BEFORE any prune/removal/REMOVED. Unverifiable ownership fails
 * closed: the foreign registration, admin metadata, and registry bytes all
 * stay untouched. A genuine LCIM worktree with a vanished checkout
 * directory is still recoverable (marker verifiable through git metadata
 * -> scoped removal + REMOVED).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git } from '../helpers/git-fixture.mjs';
import { makeWorkerFixture, makeWorkUnitId } from '../helpers/git-safety-fixture.mjs';
import { createIsolatedWorktree, removeIsolatedWorktree } from '../../src/git/worktree.mjs';
import {
  generateWorktreeId,
  loadWorktreeEvents,
  recordWorktreeEvent,
  resolveWorktreeRegistryFile,
} from '../../src/git/worktree-registry.mjs';
import { OWNERSHIP_MARKER_FILE, resolveWorktreeGitAdminDir } from '../../src/git/worktree-ownership.mjs';
import { WorktreeSafetyError } from '../../src/git/errors.mjs';

/**
 * Canonical (git-realpath) spelling of a possibly-vanished worktree path:
 * git realpaths worktree paths at `git worktree add` time, so the parent
 * is realpath'd and the (missing) basename re-appended.
 */
function canonicalSpelling(p) {
  return path.join(fs.realpathSync(path.dirname(p)), path.basename(p));
}

/** Registered worktree paths from git's own metadata (porcelain). */
function registeredPaths(repoDir) {
  return git(repoDir, ['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length).trim());
}

test('SOL-S03-R3-001: MISSING checkout + FOREIGN registration + FORGED registry -> refuses; registration, admin dir, and registry bytes untouched', async (t) => {
  const { repoDir, baseSha } = await makeWorkerFixture(t);

  // 1-2. A FOREIGN detached linked worktree at the claimed base, NOT
  //      created by LCIM.
  const foreignRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s03-r3-'));
  t.after(() => fs.rmSync(foreignRoot, { recursive: true, force: true }));
  const foreign = path.join(foreignRoot, 'foreign-stale');
  git(repoDir, ['worktree', 'add', '--detach', foreign, baseSha]);
  assert.equal(git(foreign, ['rev-parse', 'HEAD']).trim(), baseSha, 'foreign HEAD equals the claimed base');

  // 3. It has no genuine LCIM ownership marker in its per-worktree Git
  //    admin directory.
  const adminDir = resolveWorktreeGitAdminDir({ worktreeDir: foreign, repoDir });
  assert.ok(!fs.existsSync(path.join(adminDir, OWNERSHIP_MARKER_FILE)), 'foreign worktree has no LCIM ownership marker');

  // 4. A structurally valid forged registry CREATED event claiming that
  //    foreign path, with a plausible random marker identity.
  const forgedId = generateWorktreeId();
  recordWorktreeEvent({
    repoDir,
    worktreeId: forgedId,
    workUnitId: makeWorkUnitId(),
    worktreePath: foreign,
    baseSha,
    event: 'CREATED',
    markerId: `lcim_mk_${'f'.repeat(32)}`,
  });

  // 5. The foreign checkout directory vanishes WITHOUT first removing its
  //    Git worktree administrative registration.
  fs.rmSync(foreign, { recursive: true, force: true });
  assert.ok(!fs.existsSync(foreign), 'foreign checkout directory is absent');

  // 6. Git administrative metadata still represents a stale/prune-eligible
  //    registration, and the per-worktree admin dir survives.
  const canonicalForeign = canonicalSpelling(foreign);
  const porcelain = git(repoDir, ['worktree', 'list', '--porcelain']);
  assert.ok(registeredPaths(repoDir).includes(canonicalForeign), 'stale foreign registration still present');
  assert.ok(/prunable gitdir file points to non-existent location/.test(porcelain), 'registration is prune-eligible');
  assert.ok(fs.existsSync(adminDir), 'per-worktree admin dir still present');

  // 7. Capture registry bytes + Git worktree registration state.
  const registryBefore = fs.readFileSync(resolveWorktreeRegistryFile(repoDir));
  const porcelainBefore = porcelain;

  // The missing-directory path must NOT trust registry record / worktreeId
  // / path / base / Git registration alone: no genuine marker inside the
  // repository-derived admin directory -> refuse (fail closed).
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: forgedId, worktreeDir: foreign }),
    (err) => err instanceof WorktreeSafetyError && /ownership marker/.test(err.message),
  );

  // No prune/removal ran: the foreign Git registration, admin dir, and
  // porcelain state remain exactly as captured.
  assert.ok(registeredPaths(repoDir).includes(canonicalForeign), 'foreign Git administrative registration remains');
  assert.equal(
    git(repoDir, ['worktree', 'list', '--porcelain']),
    porcelainBefore,
    'Git worktree registration state unchanged',
  );
  assert.ok(fs.existsSync(adminDir), 'foreign per-worktree admin dir remains');

  // No REMOVED event; registry bytes are byte-for-byte unchanged.
  const events = loadWorktreeEvents(repoDir);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'CREATED');
  assert.equal(events[0].worktreeId, forgedId);
  assert.deepEqual(
    fs.readFileSync(resolveWorktreeRegistryFile(repoDir)),
    registryBefore,
    'registry bytes byte-for-byte unchanged',
  );
});

test('SOL-S03-R3-001: genuine LCIM worktree with missing checkout directory is verified through repository-owned Git metadata and cleaned up (scoped removal, REMOVED appended)', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = createIsolatedWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });

  // Genuine worktree-specific marker exists in the exact per-worktree admin dir.
  const adminDir = resolveWorktreeGitAdminDir({ worktreeDir: ctx.worktreeDir, repoDir });
  assert.ok(fs.existsSync(path.join(adminDir, OWNERSHIP_MARKER_FILE)), 'genuine marker present');

  // Checkout directory vanishes while linked-worktree Git admin metadata
  // and the marker are preserved.
  fs.rmSync(ctx.worktreeDir, { recursive: true, force: true });
  assert.ok(!fs.existsSync(ctx.worktreeDir), 'checkout directory absent');
  assert.ok(git(repoDir, ['worktree', 'list', '--porcelain']).includes('prunable'), 'stale registration is prune-eligible');

  // The controller derives the admin dir from repository-owned Git
  // metadata, verifies the genuine marker inside it, performs the scoped
  // removal of the exact verified registration, and appends REMOVED.
  const result = removeIsolatedWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir });
  assert.equal(result.removed, true);
  assert.equal(result.pruned, true);
  const events = loadWorktreeEvents(repoDir);
  assert.deepEqual(events.map((e) => e.event), ['CREATED', 'REMOVED']);
  assert.equal(events[1].pruned, true);
  assert.equal(events[1].markerId, ctx.markerId);
  assert.ok(!git(repoDir, ['worktree', 'list', '--porcelain']).includes('prunable'), 'stale registration removed');
  assert.ok(!fs.existsSync(adminDir), 'per-worktree admin dir removed with the registration');
});

test('SOL-S03-R3-001: missing checkout + genuine registry lifecycle + MISSING marker -> fails closed (no removal, no REMOVED, registry bytes unchanged)', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = createIsolatedWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  const adminDir = resolveWorktreeGitAdminDir({ worktreeDir: ctx.worktreeDir, repoDir });

  // The genuine marker is removed from the admin dir (e.g. tampering or
  // partial cleanup), then the checkout directory vanishes.
  fs.rmSync(path.join(adminDir, OWNERSHIP_MARKER_FILE));
  fs.rmSync(ctx.worktreeDir, { recursive: true, force: true });

  const registryBefore = fs.readFileSync(resolveWorktreeRegistryFile(repoDir));
  const porcelainBefore = git(repoDir, ['worktree', 'list', '--porcelain']);

  // Ownership cannot be proven -> cleanup MUST fail closed.
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir }),
    (err) => err instanceof WorktreeSafetyError && /ownership marker/.test(err.message),
  );
  assert.equal(loadWorktreeEvents(repoDir).filter((e) => e.event === 'REMOVED').length, 0, 'no REMOVED appended');
  assert.deepEqual(
    fs.readFileSync(resolveWorktreeRegistryFile(repoDir)),
    registryBefore,
    'registry bytes byte-for-byte unchanged',
  );
  assert.ok(
    registeredPaths(repoDir).includes(canonicalSpelling(ctx.worktreeDir)),
    'stale registration remains (nothing was pruned)',
  );
  assert.equal(
    git(repoDir, ['worktree', 'list', '--porcelain']),
    porcelainBefore,
    'Git worktree registration state unchanged',
  );
});
