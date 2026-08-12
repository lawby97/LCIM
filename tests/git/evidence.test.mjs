/**
 * Sprint 03 tests: controller-owned patch evidence.
 *
 * Required coverage: patch hash and changed paths are controller-derived;
 * binary diffs are captured verbatim; no-change patches produce valid
 * records; diff --check failures are recorded as evidence; the
 * patch-evidence schema fails closed on invalid records; the Sprint 04
 * validation hook interface attaches test/secret-scan results.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { git } from '../helpers/git-fixture.mjs';
import { makeWorkerFixture, makeWorkUnitId, workerGit } from '../helpers/git-safety-fixture.mjs';
import { collectPatchEvidence } from '../../src/evidence/patch/collector.mjs';
import { stampPatchEvidence, validatePatchEvidence, loadPatchEvidenceSchema } from '../../src/evidence/patch/schema.mjs';
import { attachValidationResults, VALIDATION_HOOK_KIND, VALIDATION_HOOK_OUTCOME } from '../../src/evidence/patch/hooks.mjs';
import { persistPatchEvidence, loadPatchEvidence, resolvePatchEvidenceDir } from '../../src/evidence/patch/store.mjs';
import { removeIsolatedWorktree } from '../../src/git/worktree.mjs';
import { EvidenceError, BaseMismatchError } from '../../src/git/errors.mjs';
import { prepareWorkerWorktree } from '../../src/git/pipeline.mjs';

test('patch hash and changed paths are controller-derived (modification + addition + deletion)', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  const wu = ctx.workUnitId;

  fs.writeFileSync(path.join(ctx.worktreeDir, 'a.txt'), 'alpha edited\n');
  fs.writeFileSync(path.join(ctx.worktreeDir, 'dir/b.txt'), 'beta edited\n');
  fs.writeFileSync(path.join(ctx.worktreeDir, 'new-file.txt'), 'brand new\n');
  fs.unlinkSync(path.join(ctx.worktreeDir, 'dir/b.txt'));

  const { record, patchText } = collectPatchEvidence({ worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, workUnitId: wu, worktreeId: ctx.worktreeId });

  // changed paths / additions / deletions
  assert.deepEqual(record.changedPaths, ['a.txt', 'dir/b.txt', 'new-file.txt']);
  assert.deepEqual(record.additions, ['new-file.txt']);
  assert.deepEqual(record.deletions, ['dir/b.txt']);
  assert.equal(record.baseSha, baseSha);
  assert.equal(record.worktreeHead, baseSha);
  assert.equal(record.diffCheck.clean, true);
  assert.deepEqual(record.diffCheck.errors, []);

  // patch hash = sha256 of the canonical `git diff --full-index --binary --no-renames` bytes
  const expectedDiff = workerGit(ctx.worktreeDir, ['-c', 'core.quotepath=false', 'diff', '--full-index', '--binary', '--no-renames', baseSha]);
  assert.equal(record.patchHash, createHash('sha256').update(expectedDiff).digest('hex'));
  assert.equal(Buffer.compare(patchText, Buffer.from(expectedDiff)), 0);
  // patch artifact identity derives from the hash
  assert.equal(record.patchId, `lcim_patch_${record.patchHash.slice(0, 32)}`);
});

test('patch hash is deterministic for identical state and changes with content', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  fs.writeFileSync(path.join(ctx.worktreeDir, 'a.txt'), 'v1\n');
  const first = collectPatchEvidence({ worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, workUnitId: ctx.workUnitId, worktreeId: ctx.worktreeId });
  const second = collectPatchEvidence({ worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, workUnitId: ctx.workUnitId, worktreeId: ctx.worktreeId });
  assert.equal(first.record.patchHash, second.record.patchHash);
  assert.equal(first.record.patchId, second.record.patchId);
  assert.notEqual(first.record.evidenceId, second.record.evidenceId, 'every observation gets its own contextual identity');
  fs.writeFileSync(path.join(ctx.worktreeDir, 'a.txt'), 'v2\n');
  const third = collectPatchEvidence({ worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, workUnitId: ctx.workUnitId, worktreeId: ctx.worktreeId });
  assert.notEqual(third.record.patchHash, first.record.patchHash);
});

test('binary file diff is captured verbatim and round-trips through git apply', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  const binary = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x0a, 0x00, 0x1b, 0x80, 0x81]);
  fs.writeFileSync(path.join(ctx.worktreeDir, 'blob.bin'), binary);
  const { record, patchText } = collectPatchEvidence({ worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, workUnitId: ctx.workUnitId, worktreeId: ctx.worktreeId });
  assert.deepEqual(record.changedPaths, ['blob.bin']);
  assert.deepEqual(record.additions, ['blob.bin']);
  assert.equal(record.diffCheck.clean, true);
  // the patch artifact is a GIT binary patch (payloads are zlib-compressed in
  // the artifact, so byte-exactness is proven by round-tripping through apply)
  assert.ok(patchText.toString('latin1').includes('GIT binary patch'), 'expected a binary patch artifact');
  // hash covers the exact patch bytes
  assert.equal(record.patchHash, createHash('sha256').update(patchText).digest('hex'));

  // round-trip: apply the patch onto a pristine checkout of the base
  const probe = path.join(worktreeRoot, 'probe-apply');
  git(repoDir, ['worktree', 'add', '--detach', probe, baseSha]);
  t.after(() => {
    try {
      git(repoDir, ['worktree', 'remove', '--force', probe]);
    } catch {
      /* best effort */
    }
  });
  const patchFile = path.join(worktreeRoot, 'blob.patch');
  fs.writeFileSync(patchFile, patchText);
  git(probe, ['apply', patchFile]);
  const applied = fs.readFileSync(path.join(probe, 'blob.bin'));
  assert.equal(Buffer.compare(applied, binary), 0, 'binary content must survive the patch round-trip');
});

test('no-change worktree yields a valid empty evidence record', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  const { record, patchText } = collectPatchEvidence({ worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, workUnitId: ctx.workUnitId, worktreeId: ctx.worktreeId });
  assert.deepEqual(record.changedPaths, []);
  assert.deepEqual(record.additions, []);
  assert.deepEqual(record.deletions, []);
  assert.equal(record.diffCheck.clean, true);
  assert.equal(patchText.length, 0);
  assert.equal(record.patchHash, createHash('sha256').update('').digest('hex'));
  const result = validatePatchEvidence(record);
  assert.equal(result.valid, true);
});

test('diff --check failure is recorded as evidence (not thrown, not accepted silently)', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  fs.writeFileSync(path.join(ctx.worktreeDir, 'ws.txt'), 'good line\ntrailing space \n');
  const { record } = collectPatchEvidence({ worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, workUnitId: ctx.workUnitId, worktreeId: ctx.worktreeId });
  assert.equal(record.diffCheck.clean, false);
  assert.ok(record.diffCheck.errors.some((e) => e.includes('trailing whitespace')));
  // record is still schema-valid evidence
  assert.equal(validatePatchEvidence(record).valid, true);
});

test('collector fails closed when the worktree HEAD is not the expected base (PRE_EXTRACT)', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  workerGit(ctx.worktreeDir, ['commit', '--allow-empty', '-m', 'worker commit']);
  assert.throws(
    () => collectPatchEvidence({ worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, workUnitId: ctx.workUnitId, worktreeId: ctx.worktreeId }),
    BaseMismatchError,
  );
});

test('schema: patchId must derive from patchHash and invalid records fail closed', async (t) => {
  const schema = loadPatchEvidenceSchema();
  assert.equal(schema.properties.schemaName.const, 'lcim.patch-evidence');
  assert.equal(schema.properties.schemaVersion.const, '2.0.0');

  const base = {
    evidenceId: 'lcim_ev_' + 'd'.repeat(32),
    patchId: 'lcim_patch_' + 'a'.repeat(32),
    workUnitId: 'lcim_wu_' + 'b'.repeat(32),
    worktreeId: 'lcim_wt_' + 'e'.repeat(32),
    baseSha: 'c'.repeat(40),
    worktreeHead: 'c'.repeat(40),
    changedPaths: [],
    additions: [],
    deletions: [],
    patchHash: 'a'.repeat(64),
    diffCheck: { clean: true, errors: [] },
    createdAt: '2025-01-01T00:00:00.000Z',
  };
  // consistent patchId <-> patchHash passes
  const good = stampPatchEvidence(base);
  assert.equal(good.schemaName, 'lcim.patch-evidence');
  assert.equal(good.schemaVersion, '2.0.0');
  assert.ok(Object.isFrozen(good));
  assert.deepEqual(validatePatchEvidence(good).errors, []);

  // inconsistent patchId fails
  assert.throws(
    () => stampPatchEvidence({ ...base, patchId: 'lcim_patch_' + 'f'.repeat(32) }),
    (err) => err instanceof EvidenceError && /does not derive/.test(err.message),
  );
  // bad sha shapes fail
  assert.throws(() => stampPatchEvidence({ ...base, baseSha: 'zzz' }), EvidenceError);
  assert.throws(() => stampPatchEvidence({ ...base, worktreeHead: 'short' }), EvidenceError);
  // bad identity shapes fail
  assert.throws(() => stampPatchEvidence({ ...base, evidenceId: 'not-an-id' }), EvidenceError);
  assert.throws(() => stampPatchEvidence({ ...base, worktreeId: 'not-an-id' }), EvidenceError);
  // extra fields fail (additionalProperties false)
  assert.throws(() => stampPatchEvidence({ ...base, sneaky: true }), EvidenceError);
  // missing required fields fail
  const { patchId, ...withoutId } = base;
  assert.throws(() => stampPatchEvidence(withoutId), EvidenceError);
  // diffCheck shape is enforced
  assert.throws(() => stampPatchEvidence({ ...base, diffCheck: { clean: 'yes' } }), EvidenceError);
  // caller cannot mislabel schemaName/schemaVersion
  const stamped = stampPatchEvidence({ ...base, schemaName: 'lcim.common.run', schemaVersion: '9.9.9' });
  assert.equal(stamped.schemaName, 'lcim.patch-evidence');
  assert.equal(stamped.schemaVersion, '2.0.0');
});

test('validation hook interface: test/secret-scan results attach; bad input fails closed', async (t) => {
  assert.deepEqual(VALIDATION_HOOK_KIND, ['test', 'secret-scan']);
  assert.deepEqual(VALIDATION_HOOK_OUTCOME, ['PASS', 'FAIL', 'NOT_RUN']);

  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  fs.writeFileSync(path.join(ctx.worktreeDir, 'a.txt'), 'edited\n');

  // attach at collection time
  const { record } = collectPatchEvidence({
    worktreeDir: ctx.worktreeDir,
    expectedBaseSha: baseSha,
    workUnitId: ctx.workUnitId,
    worktreeId: ctx.worktreeId,
    validationResults: [
      { kind: 'test', outcome: 'PASS', summary: 'tests passed' },
      { kind: 'secret-scan', outcome: 'NOT_RUN', summary: 'compiler not implemented yet' },
    ],
  });
  assert.equal(record.validationResults.length, 2);
  assert.deepEqual(validatePatchEvidence(record).errors, []);
  assert.equal(record.schemaName, 'lcim.patch-evidence');

  // attach after the fact
  const extended = attachValidationResults(record, [
    { kind: 'secret-scan', outcome: 'FAIL', summary: 'denied path found', evidenceRef: 'evidence/ref/1' },
  ]);
  assert.equal(extended.validationResults[0].kind, 'secret-scan');
  assert.equal(extended.validationResults[0].outcome, 'FAIL');

  // unknown kind / outcome / empty summary fail closed
  assert.throws(() => attachValidationResults(record, [{ kind: 'lint', outcome: 'PASS', summary: 'x' }]), EvidenceError);
  assert.throws(() => attachValidationResults(record, [{ kind: 'test', outcome: 'YES', summary: 'x' }]), EvidenceError);
  assert.throws(() => attachValidationResults(record, [{ kind: 'test', outcome: 'PASS', summary: '' }]), EvidenceError);
  assert.throws(() => attachValidationResults(record, 'not-an-array'), EvidenceError);
});

test('evidence persists under git-common-dir, survives worktree cleanup, and round-trips', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  fs.writeFileSync(path.join(ctx.worktreeDir, 'a.txt'), 'persist me\n');

  const collected = await collectPatchEvidence({ worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, workUnitId: ctx.workUnitId, worktreeId: ctx.worktreeId });
  const { recordPath, patchPath, evidenceId } = persistPatchEvidence({
    repoDir,
    record: collected.record,
    patchText: collected.patchText,
  });
  const record = collected.record;
  const patchText = collected.patchText;

  const dir = resolvePatchEvidenceDir(repoDir);
  assert.ok(recordPath.startsWith(dir));
  assert.ok(patchPath.startsWith(dir));
  assert.ok(recordPath.endsWith(`${evidenceId}.json`), 'contextual record path is evidenceId-keyed');
  assert.ok(patchPath.endsWith(`${record.patchId}.patch`), 'patch artifact path is content-addressed');
  assert.ok(fs.existsSync(recordPath));
  assert.ok(fs.existsSync(patchPath));

  // no tracked file may ever live under the evidence store (fail-closed guard)
  const tracked = git(repoDir, ['ls-files']).split('\n').filter(Boolean);
  for (const f of tracked) {
    assert.ok(!path.join(repoDir, f).startsWith(dir), `tracked file under evidence store: ${f}`);
  }

  // cleanup the worktree; evidence must survive
  removeIsolatedWorktree({ repoDir, worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir, evidenceRefs: [evidenceId] });
  assert.ok(!fs.existsSync(ctx.worktreeDir));
  assert.ok(fs.existsSync(recordPath));

  // round-trip by contextual identity
  const loaded = loadPatchEvidence(repoDir, evidenceId);
  assert.equal(loaded.record.evidenceId, evidenceId);
  assert.equal(loaded.record.patchHash, record.patchHash);
  assert.equal(Buffer.compare(loaded.patchText, patchText), 0);
  assert.deepEqual(validatePatchEvidence(loaded.record).errors, []);
});
