/**
 * SOL-S03-001 regression tests: MANDATORY write-scope validation.
 *
 * allowedWritePaths is a REQUIRED controller-owned array. Omitted, null,
 * and malformed values fail closed — a changed patch can never be handed
 * off without an allow-list decision. Evidence is always persisted BEFORE
 * the scope rejection so the rejection is evidence-backed.
 *
 * Exact normalized path set inclusion only (no prefix/glob/directory
 * semantics): strict subsets and exact sets pass; any path outside the
 * allow-list fails.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { makeWorkerFixture, makeWorkUnitId } from '../helpers/git-safety-fixture.mjs';
import { prepareWorkerWorktree, collectAndPersistEvidence } from '../../src/git/pipeline.mjs';
import { loadPatchEvidence } from '../../src/evidence/patch/store.mjs';
import { ScopeViolationError } from '../../src/git/errors.mjs';

async function makeChangedContext(t, { file = 'a.txt', content = 'changed\n' } = {}) {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const workUnitId = makeWorkUnitId();
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId });
  fs.writeFileSync(path.join(ctx.worktreeDir, file), content);
  return { repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, workUnitId, worktreeId: ctx.worktreeId };
}

test('S03-001-1: changed patch + OMITTED allowedWritePaths fails closed (no silent success)', async (t) => {
  const args = await makeChangedContext(t);
  let err = null;
  try {
    collectAndPersistEvidence({ ...args });
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof ScopeViolationError, `expected ScopeViolationError, got ${err}`);
  assert.match(err.message, /allowedWritePaths is a required controller-owned array/);
  assert.equal(err.details.allowedWritePaths, undefined);
});

test('S03-001-2: changed patch + null allowedWritePaths fails closed', async (t) => {
  const args = await makeChangedContext(t);
  let err = null;
  try {
    collectAndPersistEvidence({ ...args, allowedWritePaths: null });
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof ScopeViolationError);
  assert.equal(err.details.allowedWritePaths, null);
});

test('S03-001-3: malformed (non-array) allowedWritePaths fails closed', async (t) => {
  const args = await makeChangedContext(t);
  for (const malformed of ['a.txt', 42, { a: 'b' }, true]) {
    let err = null;
    try {
      collectAndPersistEvidence({ ...args, allowedWritePaths: malformed });
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof ScopeViolationError, `malformed ${JSON.stringify(malformed)} must fail closed`);
  }
});

test('S03-001-4: strict subset of allowed exact paths passes', async (t) => {
  const args = await makeChangedContext(t);
  const collected = collectAndPersistEvidence({
    ...args,
    allowedWritePaths: ['a.txt', 'dir/b.txt', 'unused.txt'],
  });
  assert.deepEqual(collected.record.changedPaths, ['a.txt']);
  assert.equal(collected.scope.ok, true);
});

test('S03-001-5: exact allowed set passes (permissions, not mandatory changes)', async (t) => {
  const args = await makeChangedContext(t);
  const collected = collectAndPersistEvidence({ ...args, allowedWritePaths: ['a.txt'] });
  assert.equal(collected.scope.ok, true);
});

test('S03-001-6: path outside the allow-list fails', async (t) => {
  const args = await makeChangedContext(t, { file: 'out.txt', content: 'nope\n' });
  let err = null;
  try {
    collectAndPersistEvidence({ ...args, allowedWritePaths: ['a.txt'] });
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof ScopeViolationError);
  assert.deepEqual(err.details.outOfScope, ['out.txt']);
});

test('S03-001-7: evidence remains persisted BEFORE the scope failure (all failure modes)', async (t) => {
  const args = await makeChangedContext(t, { file: 'out.txt', content: 'nope\n' });
  for (const allowedWritePaths of [undefined, null, ['a.txt']]) {
    let err = null;
    try {
      collectAndPersistEvidence({ ...args, allowedWritePaths });
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof ScopeViolationError);
    assert.ok(err.details.evidenceId, 'failure must carry the persisted evidence identity');
    assert.ok(fs.existsSync(err.details.recordPath), 'evidence record must exist before the rejection');
    const loaded = loadPatchEvidence(args.repoDir, err.details.evidenceId);
    assert.deepEqual(loaded.record.changedPaths, ['out.txt']);
    assert.equal(loaded.record.worktreeId, args.worktreeId);
    assert.equal(loaded.record.baseSha, args.expectedBaseSha);
  }
});
