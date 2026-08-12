/**
 * Sprint 03 tests: end-to-end controller pipeline for one work unit.
 *
 * Composes the four checkpoints + scope rule + evidence persistence +
 * registry-verified cleanup, mirroring the required acceptance scenarios:
 * valid subset-of-allowed paths succeeds; any path outside the allowed set
 * fails closed (evidence still persisted first); missing must_change_path
 * fails; the parent stays untouched; nothing is ever committed by LCIM.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { git } from '../helpers/git-fixture.mjs';
import { makeWorkerFixture, makeWorkUnitId } from '../helpers/git-safety-fixture.mjs';
import {
  prepareWorkerWorktree,
  inspectWorkerExit,
  collectAndPersistEvidence,
  validateIntegrationHandoff,
  cleanupWorkerWorktree,
} from '../../src/git/pipeline.mjs';
import { loadPatchEvidence } from '../../src/evidence/patch/store.mjs';
import { ScopeViolationError } from '../../src/git/errors.mjs';

test('happy path: subset-of-allowed changes → evidence → handoff → cleanup', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const workUnitId = makeWorkUnitId();
  const allowedWritePaths = ['a.txt', 'dir/b.txt', 'new-file.txt'];

  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId });
  // worker edits exactly one allowed file
  fs.writeFileSync(path.join(ctx.worktreeDir, 'a.txt'), 'worker made this change\n');

  const exit = inspectWorkerExit({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, snapshot: ctx });
  assert.equal(exit.baseOk, true);
  assert.equal(exit.safety.ok, true);

  const collected = collectAndPersistEvidence({
    repoDir,
    worktreeDir: ctx.worktreeDir,
    expectedBaseSha: baseSha,
    workUnitId,
    worktreeId: ctx.worktreeId,
    allowedWritePaths,
    mustChangePaths: ['a.txt'],
  });
  assert.deepEqual(collected.record.changedPaths, ['a.txt']);
  assert.equal(collected.scope.ok, true);

  const handoff = validateIntegrationHandoff({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha });
  assert.equal(handoff.ok, true);

  cleanupWorkerWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir, evidenceRefs: [collected.evidenceId] });
  assert.ok(!fs.existsSync(ctx.worktreeDir));
  // evidence survived cleanup and validates
  const loaded = loadPatchEvidence(repoDir, collected.evidenceId);
  assert.equal(loaded.record.patchHash, collected.record.patchHash);
  // parent untouched, still on the base, nothing committed by LCIM
  assert.equal(git(repoDir, ['rev-parse', 'HEAD']).trim(), baseSha);
  assert.equal(git(repoDir, ['log', '--oneline']).split('\n').filter(Boolean).length, 1);
});

test('forbidden path fails closed: evidence persisted, then scope violation raised', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const workUnitId = makeWorkUnitId();
  const allowedWritePaths = ['a.txt'];

  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId });
  // worker touches an allowed file AND a forbidden one
  fs.writeFileSync(path.join(ctx.worktreeDir, 'a.txt'), 'ok\n');
  fs.writeFileSync(path.join(ctx.worktreeDir, 'forbidden.txt'), 'out of scope\n');

  inspectWorkerExit({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, snapshot: ctx });

  let err = null;
  try {
    collectAndPersistEvidence({
      repoDir,
      worktreeDir: ctx.worktreeDir,
      expectedBaseSha: baseSha,
      workUnitId,
      worktreeId: ctx.worktreeId,
      allowedWritePaths,
    });
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof ScopeViolationError, `expected ScopeViolationError, got ${err}`);
  assert.deepEqual(err.details.outOfScope, ['forbidden.txt']);
  // evidence of the violation was persisted BEFORE the rejection (auditable)
  assert.ok(fs.existsSync(err.details.recordPath));
  const loaded = loadPatchEvidence(repoDir, err.details.evidenceId);
  assert.deepEqual(loaded.record.changedPaths, ['a.txt', 'forbidden.txt']);
  // cleanup still possible with the persisted evidence
  cleanupWorkerWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir, evidenceRefs: [err.details.evidenceId] });
});

test('missing must_change_path fails closed', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const workUnitId = makeWorkUnitId();
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId });
  fs.writeFileSync(path.join(ctx.worktreeDir, 'a.txt'), 'changed\n');

  assert.throws(
    () =>
      collectAndPersistEvidence({
        repoDir,
        worktreeDir: ctx.worktreeDir,
        expectedBaseSha: baseSha,
        workUnitId,
        worktreeId: ctx.worktreeId,
        allowedWritePaths: ['a.txt', 'required.txt'],
        mustChangePaths: ['required.txt'],
      }),
    (err) => err instanceof ScopeViolationError && err.details.missing.length === 1,
  );
});

test('validation hooks flow through the pipeline into the persisted record', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const workUnitId = makeWorkUnitId();
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId });
  fs.writeFileSync(path.join(ctx.worktreeDir, 'a.txt'), 'changed\n');

  const collected = collectAndPersistEvidence({
    repoDir,
    worktreeDir: ctx.worktreeDir,
    expectedBaseSha: baseSha,
    workUnitId,
    worktreeId: ctx.worktreeId,
    allowedWritePaths: ['a.txt'],
    validationResults: [{ kind: 'test', outcome: 'PASS', summary: 'fixture tests green' }],
  });
  assert.equal(collected.record.validationResults[0].outcome, 'PASS');
  const loaded = loadPatchEvidence(repoDir, collected.evidenceId);
  assert.equal(loaded.record.validationResults[0].summary, 'fixture tests green');
});

test('serial flow: unit N accepted head becomes the only base for unit N+1', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const allowed = ['a.txt'];

  // ---- unit N on the original base
  const unitN = makeWorkUnitId();
  const ctxN = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: unitN });
  fs.writeFileSync(path.join(ctxN.worktreeDir, 'a.txt'), 'unit N change\n');
  const evidenceN = collectAndPersistEvidence({
    repoDir,
    worktreeDir: ctxN.worktreeDir,
    expectedBaseSha: baseSha,
    workUnitId: unitN,
    worktreeId: ctxN.worktreeId,
    allowedWritePaths: allowed,
  });
  cleanupWorkerWorktree({ repoDir, worktreeId: ctxN.worktreeId, worktreeDir: ctxN.worktreeDir, evidenceRefs: [evidenceN.evidenceId] });

  // controller integrates unit N (integration is Sprint 10; the parent HEAD
  // advancing to the accepted head is the serial contract)
  fs.writeFileSync(path.join(repoDir, 'a.txt'), 'unit N change\n');
  git(repoDir, ['add', '-A']);
  git(repoDir, ['commit', '-m', 'integrate unit N']);
  const acceptedHead = git(repoDir, ['rev-parse', 'HEAD']).trim();

  // ---- unit N+1: stale base (original baseSha) fails at PRE_SPAWN via serial policy
  const unitN1 = makeWorkUnitId();
  assert.throws(
    () =>
      prepareWorkerWorktree({
        repoDir,
        worktreeRoot,
        expectedBaseSha: baseSha,
        workUnitId: unitN1,
        serialBaseSha: acceptedHead,
      }),
    (err) => err.name === 'BaseMismatchError' && /serial base violation/.test(err.message),
  );
  // the accepted head is the only allowed base
  const ctxN1 = prepareWorkerWorktree({
    repoDir,
    worktreeRoot,
    expectedBaseSha: acceptedHead,
    workUnitId: unitN1,
    serialBaseSha: acceptedHead,
  });
  assert.equal(ctxN1.baseSha, acceptedHead);
  fs.writeFileSync(path.join(ctxN1.worktreeDir, 'a.txt'), 'unit N+1 change\n');
  const evidenceN1 = collectAndPersistEvidence({
    repoDir,
    worktreeDir: ctxN1.worktreeDir,
    expectedBaseSha: acceptedHead,
    workUnitId: unitN1,
    worktreeId: ctxN1.worktreeId,
    allowedWritePaths: allowed,
  });
  assert.equal(evidenceN1.record.baseSha, acceptedHead);
  // PRE_INTEGRATION for unit N+1 requires the parent to sit exactly on acceptedHead
  const handoff = validateIntegrationHandoff({ repoDir, worktreeDir: ctxN1.worktreeDir, expectedBaseSha: acceptedHead });
  assert.equal(handoff.ok, true);
  cleanupWorkerWorktree({ repoDir, worktreeId: ctxN1.worktreeId, worktreeDir: ctxN1.worktreeDir, evidenceRefs: [evidenceN1.evidenceId] });
});
