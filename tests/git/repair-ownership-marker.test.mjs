/**
 * SOL-S03-FINAL-001 regression tests: GENUINE LCIM OWNERSHIP MARKER.
 *
 * Cleanup ownership must NOT come from the registry alone. A controller-
 * created, worktree-specific ownership marker lives inside the linked
 * worktree's OWN per-worktree Git admin directory; before any
 * `git worktree remove --force` is invoked, the registry lifecycle AND
 * the marker must agree on every identity (worktreeId, workUnitId, base,
 * canonical path, marker identity).
 *
 * The exact missed case is covered first: a clean FOREIGN detached worktree
 * at the SAME base SHA, claimed by a syntactically valid forged registry
 * CREATED event with plausible matching metadata — cleanup must refuse, the
 * foreign worktree must remain (directory, files, git registration), no
 * `git worktree remove --force` may run, and no REMOVED event may be
 * appended.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git } from '../helpers/git-fixture.mjs';
import { makeWorkerFixture, makeWorkUnitId } from '../helpers/git-safety-fixture.mjs';
import { createIsolatedWorktree, removeIsolatedWorktree } from '../../src/git/worktree.mjs';
import { loadWorktreeEvents, recordWorktreeEvent, generateWorktreeId } from '../../src/git/worktree-registry.mjs';
import {
  OWNERSHIP_MARKER_FILE,
  isValidOwnershipMarkerId,
  readWorktreeOwnershipMarker,
  resolveWorktreeGitAdminDir,
} from '../../src/git/worktree-ownership.mjs';
import { WorktreeSafetyError } from '../../src/git/errors.mjs';

test('SOL-S03-FINAL-001: forged CREATED for a FOREIGN clean detached same-base worktree -> cleanup refuses, worktree intact, no remove --force, no REMOVED', async (t) => {
  const { repoDir, baseSha } = await makeWorkerFixture(t);

  // 1. A FOREIGN clean detached worktree at exactly the claimed base SHA
  //    (created outside LCIM, never owned by any registry record).
  const foreignRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s03-final001-'));
  t.after(() => {
    try {
      git(repoDir, ['worktree', 'remove', '--force', foreign]);
    } catch {
      /* best effort */
    }
    fs.rmSync(foreignRoot, { recursive: true, force: true });
  });
  const foreign = path.join(foreignRoot, 'foreign-clean-detached');
  git(repoDir, ['worktree', 'add', '--detach', foreign, baseSha]);
  assert.equal(git(foreign, ['rev-parse', 'HEAD']).trim(), baseSha, 'foreign HEAD equals the claimed base');
  assert.equal(git(foreign, ['status', '--porcelain']), '', 'foreign worktree is clean');

  // 2. A syntactically valid forged registry CREATED event claiming that
  //    foreign path with plausible matching metadata — including a
  //    plausible random marker identity. The registry cannot be told apart
  //    from a genuine one; only the marker can.
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

  // 3. LCIM cleanup using the forged identity must REFUSE at the ownership
  //    marker (registry + path + git registration + HEAD all agree, but the
  //    marker does not exist inside the foreign worktree's gitdir).
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: forgedId, worktreeDir: foreign }),
    (err) => err instanceof WorktreeSafetyError && /ownership marker/.test(err.message),
  );

  // 4. No `git worktree remove --force` ran: directory, user files, and git
  //    registration all remain.
  assert.ok(fs.existsSync(foreign), 'foreign worktree directory remains');
  assert.ok(fs.existsSync(path.join(foreign, 'a.txt')), 'foreign checked-out files remain');
  const list = git(repoDir, ['worktree', 'list', '--porcelain']);
  assert.ok(list.includes(foreign), 'foreign worktree still registered with git');

  // 5. No REMOVED lifecycle event was appended.
  const events = loadWorktreeEvents(repoDir);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, 'CREATED');
  assert.equal(events[0].worktreeId, forgedId);
});

test('SOL-S03-FINAL-001: forged CREATED with NO marker identity is refused (registry data alone never establishes ownership)', async (t) => {
  const { repoDir, baseSha } = await makeWorkerFixture(t);
  const foreignRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s03-final001-'));
  t.after(() => {
    try {
      git(repoDir, ['worktree', 'remove', '--force', foreign]);
    } catch {
      /* best effort */
    }
    fs.rmSync(foreignRoot, { recursive: true, force: true });
  });
  const foreign = path.join(foreignRoot, 'foreign-same-base');
  git(repoDir, ['worktree', 'add', '--detach', foreign, baseSha]);

  const forgedId = generateWorktreeId();
  recordWorktreeEvent({
    repoDir,
    worktreeId: forgedId,
    workUnitId: makeWorkUnitId(),
    worktreePath: foreign,
    baseSha,
    event: 'CREATED',
    // no markerId — the record itself lacks the controller-created identity
  });
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: forgedId, worktreeDir: foreign }),
    (err) =>
      err instanceof WorktreeSafetyError &&
      /no valid controller-created ownership marker identity/.test(err.message),
  );
  assert.ok(fs.existsSync(foreign));
  assert.equal(loadWorktreeEvents(repoDir).filter((e) => e.event === 'REMOVED').length, 0);
});

test('SOL-S03-FINAL-001: genuine LCIM worktree carries a valid per-worktree ownership marker and cleans up normally', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = createIsolatedWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });

  // Controller-generated random marker identity, returned to the controller.
  assert.ok(isValidOwnershipMarkerId(ctx.markerId), `ctx.markerId is a valid marker identity: ${ctx.markerId}`);

  // The marker lives in THIS worktree's own per-worktree Git admin
  // directory — resolved through git — and never in the checked-out tree.
  const adminDir = resolveWorktreeGitAdminDir({ worktreeDir: ctx.worktreeDir, repoDir });
  const markerPath = path.join(adminDir, OWNERSHIP_MARKER_FILE);
  assert.ok(fs.existsSync(markerPath), 'marker exists inside the per-worktree Git admin directory');
  assert.ok(!fs.existsSync(path.join(ctx.worktreeDir, OWNERSHIP_MARKER_FILE)), 'marker is NOT in the checked-out tree');

  // Marker fields bind every identity.
  const { marker } = readWorktreeOwnershipMarker({ worktreeDir: ctx.worktreeDir, repoDir });
  assert.equal(marker.markerId, ctx.markerId);
  assert.equal(marker.worktreeId, ctx.worktreeId);
  assert.equal(marker.workUnitId, ctx.workUnitId);
  assert.equal(marker.baseSha, baseSha);
  assert.equal(path.resolve(marker.worktreePath), path.resolve(ctx.worktreeDir));

  // The registry CREATED event references the marker identity.
  const events = loadWorktreeEvents(repoDir);
  assert.equal(events.length, 1);
  assert.equal(events[0].markerId, ctx.markerId);

  // Normal clean cleanup succeeds and the REMOVED event keeps the identity.
  const result = removeIsolatedWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir });
  assert.equal(result.removed, true);
  assert.ok(!fs.existsSync(ctx.worktreeDir));
  const after = loadWorktreeEvents(repoDir);
  assert.deepEqual(after.map((e) => e.event), ['CREATED', 'REMOVED']);
  assert.equal(after[1].markerId, ctx.markerId);
});

test('SOL-S03-FINAL-001: cleanup refuses when the marker is missing — a marker planted in the common git dir is never accepted', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = createIsolatedWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  const adminDir = resolveWorktreeGitAdminDir({ worktreeDir: ctx.worktreeDir, repoDir });

  // Remove the genuine marker and plant a look-alike in the COMMON git dir.
  fs.rmSync(path.join(adminDir, OWNERSHIP_MARKER_FILE));
  const { resolveGitCommonDir } = await import('../../src/config/runtime-path.mjs');
  const commonDir = resolveGitCommonDir(repoDir);
  fs.writeFileSync(
    path.join(commonDir, OWNERSHIP_MARKER_FILE),
    `${JSON.stringify({ schemaName: 'lcim.worktree-ownership-marker', schemaVersion: '1.0.0', markerId: ctx.markerId, worktreeId: ctx.worktreeId, workUnitId: ctx.workUnitId, worktreePath: ctx.worktreeDir, baseSha, createdAt: new Date().toISOString() }, null, 2)}\n`,
  );
  t.after(() => fs.rmSync(path.join(commonDir, OWNERSHIP_MARKER_FILE), { force: true }));

  // The marker in the common dir is NOT the worktree-specific marker:
  // cleanup refuses and the worktree is untouched.
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir }),
    (err) => err instanceof WorktreeSafetyError && /ownership marker/.test(err.message),
  );
  assert.ok(fs.existsSync(ctx.worktreeDir), 'worktree remains');
  assert.equal(loadWorktreeEvents(repoDir).filter((e) => e.event === 'REMOVED').length, 0);
  // fixture hygiene: remove directly via git
  git(repoDir, ['worktree', 'remove', '--force', ctx.worktreeDir]);
});

test('SOL-S03-FINAL-001: a structurally valid marker bound to a DIFFERENT identity is refused', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = createIsolatedWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  const adminDir = resolveWorktreeGitAdminDir({ worktreeDir: ctx.worktreeDir, repoDir });
  const markerPath = path.join(adminDir, OWNERSHIP_MARKER_FILE);

  // Tamper with one binding while keeping the document structurally valid.
  const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  marker.workUnitId = makeWorkUnitId();
  fs.writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`);

  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir }),
    (err) => err instanceof WorktreeSafetyError && /does not bind to the registered lifecycle/.test(err.message),
  );
  assert.ok(fs.existsSync(ctx.worktreeDir), 'worktree remains');
  assert.equal(loadWorktreeEvents(repoDir).filter((e) => e.event === 'REMOVED').length, 0);
  git(repoDir, ['worktree', 'remove', '--force', ctx.worktreeDir]);
});

test('SOL-S03-FINAL-001: a malformed marker document fails closed', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = createIsolatedWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  const adminDir = resolveWorktreeGitAdminDir({ worktreeDir: ctx.worktreeDir, repoDir });
  fs.writeFileSync(path.join(adminDir, OWNERSHIP_MARKER_FILE), 'not json at all\n');
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir }),
    (err) => err instanceof WorktreeSafetyError && /ownership marker/.test(err.message),
  );
  assert.ok(fs.existsSync(ctx.worktreeDir));
  assert.equal(loadWorktreeEvents(repoDir).filter((e) => e.event === 'REMOVED').length, 0);
  git(repoDir, ['worktree', 'remove', '--force', ctx.worktreeDir]);
});
