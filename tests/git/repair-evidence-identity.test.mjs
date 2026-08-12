/**
 * SOL-S03-002 regression tests: IMMUTABLE CONTEXTUAL PATCH EVIDENCE.
 *
 * Identity separation:
 *   A. CONTENT identity    patchId/patchHash — content-addressed patch
 *                          artifact; identical bytes share one artifact.
 *   B. OBSERVATION identity evidenceId — unique per contextual record;
 *                          two work units with identical patch bytes get
 *                          distinct immutable record references.
 *
 * Records are immutable (exclusive writes; never truncated/overwritten),
 * concurrent publication cannot damage either record, and a content-addressed
 * artifact is only reused after its bytes/hash are verified.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { makeWorkerFixture, makeWorkUnitId } from '../helpers/git-safety-fixture.mjs';
import { prepareWorkerWorktree } from '../../src/git/pipeline.mjs';
import { collectPatchEvidence } from '../../src/evidence/patch/collector.mjs';
import { persistPatchEvidence, loadPatchEvidence, resolvePatchEvidenceDir } from '../../src/evidence/patch/store.mjs';
import { EvidenceError } from '../../src/git/errors.mjs';

async function makeNoChangeObservation(t, fixture) {
  const { repoDir, worktreeRoot, baseSha } = fixture;
  const workUnitId = makeWorkUnitId();
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId });
  const { record, patchText } = collectPatchEvidence({
    worktreeDir: ctx.worktreeDir,
    expectedBaseSha: baseSha,
    workUnitId,
    worktreeId: ctx.worktreeId,
  });
  const persisted = persistPatchEvidence({ repoDir, record, patchText });
  return { repoDir, workUnitId, worktreeId: ctx.worktreeId, ...persisted };
}

test('S03-002-1/2/3: two work units with identical (no-change) patches share CONTENT identity but get DISTINCT evidence records', async (t) => {
  const fixture = await makeWorkerFixture(t);
  const a = await makeNoChangeObservation(t, fixture);
  const b = await makeNoChangeObservation(t, fixture);

  // identical no-change patch bytes -> identical content identity
  assert.equal(a.record.patchHash, b.record.patchHash);
  assert.equal(a.record.patchId, b.record.patchId);
  // ...and ONE shared content-addressed artifact file
  assert.equal(a.patchPath, b.patchPath);
  assert.equal(fs.readFileSync(a.patchPath).length, 0);

  // ...but distinct contextual observation identities and record files
  assert.notEqual(a.evidenceId, b.evidenceId);
  assert.notEqual(a.recordPath, b.recordPath);

  // both records remain loadable and each carries its own work unit metadata
  const loadedA = loadPatchEvidence(a.repoDir, a.evidenceId);
  const loadedB = loadPatchEvidence(b.repoDir, b.evidenceId);
  assert.equal(loadedA.record.workUnitId, a.workUnitId);
  assert.equal(loadedB.record.workUnitId, b.workUnitId);
  assert.notEqual(a.workUnitId, b.workUnitId);
  assert.equal(loadedA.record.worktreeId, a.worktreeId);
  assert.equal(loadedB.record.worktreeId, b.worktreeId);
});

test('S03-002-4/5: record A keeps work unit A metadata, record B keeps work unit B metadata', async (t) => {
  const fixture = await makeWorkerFixture(t);
  const a = await makeNoChangeObservation(t, fixture);
  const b = await makeNoChangeObservation(t, fixture);
  assert.equal(loadPatchEvidence(a.repoDir, a.evidenceId).record.workUnitId, a.workUnitId);
  assert.equal(loadPatchEvidence(b.repoDir, b.evidenceId).record.workUnitId, b.workUnitId);
  // cross-check: neither record is contaminated by the other observation
  assert.notEqual(loadPatchEvidence(a.repoDir, a.evidenceId).record.evidenceId, b.evidenceId);
});

test('S03-002-6: concurrent publication cannot truncate or overwrite either record', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const mkObs = () => {
    const workUnitId = makeWorkUnitId();
    const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId });
    const { record, patchText } = collectPatchEvidence({
      worktreeDir: ctx.worktreeDir,
      expectedBaseSha: baseSha,
      workUnitId,
      worktreeId: ctx.worktreeId,
    });
    return { repoDir, workUnitId, worktreeId: ctx.worktreeId, record, patchText };
  };
  const a = mkObs();
  const b = mkObs();
  // identical patch bytes (both no-change) published "concurrently"
  const [pa, pb] = await Promise.all([
    Promise.resolve().then(() => persistPatchEvidence({ repoDir, record: a.record, patchText: a.patchText })),
    Promise.resolve().then(() => persistPatchEvidence({ repoDir, record: b.record, patchText: b.patchText })),
  ]);
  assert.notEqual(pa.evidenceId, pb.evidenceId);
  assert.equal(pa.patchPath, pb.patchPath); // shared artifact
  const loadedA = loadPatchEvidence(repoDir, pa.evidenceId);
  const loadedB = loadPatchEvidence(repoDir, pb.evidenceId);
  assert.equal(loadedA.record.workUnitId, a.workUnitId);
  assert.equal(loadedB.record.workUnitId, b.workUnitId);
  assert.equal(loadedA.record.patchHash, loadedB.record.patchHash);
  // the shared artifact is intact and hashes correctly
  assert.equal(
    createHash('sha256').update(fs.readFileSync(pa.patchPath)).digest('hex'),
    a.record.patchHash,
  );
});

test('S03-002: publishing the same evidenceId twice fails closed (records are immutable)', async (t) => {
  const fixture = await makeWorkerFixture(t);
  const a = await makeNoChangeObservation(t, fixture);
  assert.throws(
    () => persistPatchEvidence({ repoDir: a.repoDir, record: a.record, patchText: Buffer.alloc(0) }),
    (err) => err instanceof EvidenceError && /immutable and must never be overwritten/.test(err.message),
  );
  // original record untouched
  const loaded = loadPatchEvidence(a.repoDir, a.evidenceId);
  assert.equal(loaded.record.evidenceId, a.evidenceId);
});

test('S03-002-7: artifact hash is verified before reuse; tampered artifact fails closed', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const workUnitIdA = makeWorkUnitId();
  const ctxA = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: workUnitIdA });
  fs.writeFileSync(path.join(ctxA.worktreeDir, 'a.txt'), 'same content\n');
  const obsA = collectPatchEvidence({ worktreeDir: ctxA.worktreeDir, expectedBaseSha: baseSha, workUnitId: workUnitIdA, worktreeId: ctxA.worktreeId });
  const persistedA = persistPatchEvidence({ repoDir, record: obsA.record, patchText: obsA.patchText });

  // tamper the content-addressed artifact in place
  fs.appendFileSync(persistedA.patchPath, Buffer.from('TAMPERED'));

  // a second work unit producing the same patch bytes must NOT reuse the
  // corrupted artifact — fail closed
  const workUnitIdB = makeWorkUnitId();
  const ctxB = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: workUnitIdB });
  fs.writeFileSync(path.join(ctxB.worktreeDir, 'a.txt'), 'same content\n');
  const obsB = collectPatchEvidence({ worktreeDir: ctxB.worktreeDir, expectedBaseSha: baseSha, workUnitId: workUnitIdB, worktreeId: ctxB.worktreeId });
  assert.equal(obsB.record.patchId, obsA.record.patchId, 'same bytes -> same content identity');
  assert.throws(
    () => persistPatchEvidence({ repoDir, record: obsB.record, patchText: obsB.patchText }),
    (err) => err instanceof EvidenceError && /does not match patchHash/.test(err.message),
  );
});

test('S03-002: persist fails closed when supplied patch bytes do not hash to record.patchHash', async (t) => {
  const fixture = await makeWorkerFixture(t);
  const a = await makeNoChangeObservation(t, fixture);
  assert.throws(
    () => persistPatchEvidence({ repoDir: a.repoDir, record: a.record, patchText: Buffer.from('different bytes') }),
    (err) => err instanceof EvidenceError && /do not hash to record.patchHash/.test(err.message),
  );
});

test('S03-002: evidence store layout separates contextual records from content artifacts', async (t) => {
  const fixture = await makeWorkerFixture(t);
  const a = await makeNoChangeObservation(t, fixture);
  const dir = resolvePatchEvidenceDir(a.repoDir);
  assert.ok(fs.existsSync(path.join(dir, `${a.evidenceId}.json`)));
  assert.ok(fs.existsSync(path.join(dir, `${a.record.patchId}.patch`)));
  // loading by patchId (content identity) is NOT accepted as a record identity
  assert.throws(() => loadPatchEvidence(a.repoDir, a.record.patchId), EvidenceError);
});
