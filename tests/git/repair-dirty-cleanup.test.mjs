/**
 * SOL-S03-005 regression tests: EVIDENCE-BOUND DIRTY CLEANUP.
 *
 * A dirty disposable worktree may only be removed after REQUIRED
 * controller evidence references have been resolved and verified:
 *   - each ref must resolve under the canonical Git-common LCIM evidence
 *     store (arbitrary strings / nonexistent / foreign paths fail closed),
 *   - the contextual record must validate and self-identify,
 *   - the referenced patch artifact must exist with a matching hash,
 *   - the evidence must bind to the EXACT worktreeId, workUnitId, and
 *     expected/base SHA.
 * Evidence for another work unit, another worktree, or a different base
 * fails closed. Valid matching evidence permits cleanup, and the evidence
 * survives cleanup.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { makeWorkerFixture, makeWorkUnitId } from '../helpers/git-safety-fixture.mjs';
import { createIsolatedWorktree, removeIsolatedWorktree } from '../../src/git/worktree.mjs';
import { collectPatchEvidence } from '../../src/evidence/patch/collector.mjs';
import { persistPatchEvidence, loadPatchEvidence, resolvePatchEvidenceDir, generateEvidenceId } from '../../src/evidence/patch/store.mjs';
import { stampPatchEvidence } from '../../src/evidence/patch/schema.mjs';
import { WorktreeSafetyError, EvidenceError } from '../../src/git/errors.mjs';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Create a worktree dirtied with an untracked file. */
async function makeDirtyWorktree(t) {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const workUnitId = makeWorkUnitId();
  const ctx = createIsolatedWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId });
  fs.writeFileSync(path.join(ctx.worktreeDir, 'leftover.txt'), 'worker scratch\n');
  return { repoDir, baseSha, workUnitId, ctx };
}

/** Persist a controller-shaped evidence record for an arbitrary (possibly crafted) binding. */
function persistCraftedEvidence({ repoDir, worktreeId, workUnitId, baseSha }) {
  const patchText = Buffer.from(`crafted artifact for ${workUnitId}`);
  const patchHash = sha256(patchText);
  const record = stampPatchEvidence({
    evidenceId: generateEvidenceId(),
    patchId: `lcim_patch_${patchHash.slice(0, 32)}`,
    workUnitId,
    worktreeId,
    baseSha,
    worktreeHead: baseSha,
    changedPaths: ['leftover.txt'],
    additions: ['leftover.txt'],
    deletions: [],
    patchHash,
    diffCheck: { clean: true, errors: [] },
    createdAt: new Date().toISOString(),
  });
  return persistPatchEvidence({ repoDir, record, patchText });
}

test('S03-005: ["x"] => refuse', async (t) => {
  const { repoDir, ctx } = await makeDirtyWorktree(t);
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir, evidenceRefs: ['x'] }),
    (err) => /outside the canonical LCIM evidence store/.test(err.message),
  );
  assert.ok(fs.existsSync(ctx.worktreeDir));
});

test('S03-005: nonexistent evidence path => refuse', async (t) => {
  const { repoDir, ctx } = await makeDirtyWorktree(t);
  const dir = resolvePatchEvidenceDir(repoDir);
  const missing = path.join(dir, `lcim_ev_${'f'.repeat(32)}.json`);
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir, evidenceRefs: [missing] }),
    (err) => err instanceof EvidenceError && /evidence record does not exist/.test(err.message),
  );
  assert.ok(fs.existsSync(ctx.worktreeDir));
});

test('S03-005: foreign/outside path => refuse', async (t) => {
  const { repoDir, ctx } = await makeDirtyWorktree(t);
  const foreign = path.join(path.dirname(resolvePatchEvidenceDir(repoDir)), 'outside.json');
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir, evidenceRefs: [foreign] }),
    (err) => /outside the canonical LCIM evidence store/.test(err.message),
  );
  assert.ok(fs.existsSync(ctx.worktreeDir));
});

test('S03-005: evidence for another worktree => refuse', async (t) => {
  const { repoDir, ctx } = await makeDirtyWorktree(t);
  const other = await makeDirtyWorktree(t); // different worktree, same base
  const persisted = persistCraftedEvidence({
    repoDir,
    worktreeId: other.ctx.worktreeId,
    workUnitId: other.workUnitId,
    baseSha: other.baseSha,
  });
  // cleanup worktree A using evidence bound to worktree B
  assert.throws(
    () =>
      removeIsolatedWorktree({
        repoDir,
        worktreeId: ctx.worktreeId,
        worktreeDir: ctx.worktreeDir,
        evidenceRefs: [persisted.evidenceId],
      }),
    (err) => err instanceof WorktreeSafetyError && /belongs to worktree/.test(err.message),
  );
  assert.ok(fs.existsSync(ctx.worktreeDir));
});

test('S03-005: evidence for another work unit => refuse', async (t) => {
  const { repoDir, baseSha, workUnitId, ctx } = await makeDirtyWorktree(t);
  const otherUnit = makeWorkUnitId();
  const persisted = persistCraftedEvidence({ repoDir, worktreeId: ctx.worktreeId, workUnitId: otherUnit, baseSha });
  assert.notEqual(otherUnit, workUnitId);
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir, evidenceRefs: [persisted.evidenceId] }),
    (err) => err instanceof WorktreeSafetyError && /belongs to work unit/.test(err.message),
  );
  assert.ok(fs.existsSync(ctx.worktreeDir));
});

test('S03-005: wrong base => refuse', async (t) => {
  const { repoDir, baseSha, workUnitId, ctx } = await makeDirtyWorktree(t);
  const wrongBase = 'c'.repeat(40);
  assert.notEqual(wrongBase, baseSha);
  const persisted = persistCraftedEvidence({ repoDir, worktreeId: ctx.worktreeId, workUnitId, baseSha: wrongBase });
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir, evidenceRefs: [persisted.evidenceId] }),
    (err) => err instanceof WorktreeSafetyError && /not the registered base/.test(err.message),
  );
  assert.ok(fs.existsSync(ctx.worktreeDir));
});

test('S03-005: patch artifact hash mismatch => refuse', async (t) => {
  const { repoDir, baseSha, workUnitId, ctx } = await makeDirtyWorktree(t);
  const persisted = persistCraftedEvidence({ repoDir, worktreeId: ctx.worktreeId, workUnitId, baseSha });
  // tamper the content-addressed artifact so the hash no longer matches
  fs.appendFileSync(persisted.patchPath, Buffer.from('TAMPER'));
  assert.throws(
    () => removeIsolatedWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir, evidenceRefs: [persisted.evidenceId] }),
    (err) => err instanceof EvidenceError && /does not hash to record.patchHash/.test(err.message),
  );
  assert.ok(fs.existsSync(ctx.worktreeDir));
});

test('S03-005: valid matching persisted evidence => cleanup allowed; evidence remains after cleanup', async (t) => {
  const { repoDir, baseSha, workUnitId, ctx } = await makeDirtyWorktree(t);
  const collected = collectPatchEvidence({
    worktreeDir: ctx.worktreeDir,
    expectedBaseSha: baseSha,
    workUnitId,
    worktreeId: ctx.worktreeId,
  });
  const persisted = persistPatchEvidence({ repoDir, record: collected.record, patchText: collected.patchText });

  const result = removeIsolatedWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir, evidenceRefs: [persisted.evidenceId] });
  assert.equal(result.removed, true);
  assert.ok(!fs.existsSync(ctx.worktreeDir));
  // evidence survives cleanup, loads, and still binds correctly
  const loaded = loadPatchEvidence(repoDir, persisted.evidenceId);
  assert.equal(loaded.record.worktreeId, ctx.worktreeId);
  assert.equal(loaded.record.workUnitId, workUnitId);
  assert.equal(loaded.record.baseSha, baseSha);
  assert.deepEqual(loaded.record.changedPaths, ['leftover.txt']);
});
