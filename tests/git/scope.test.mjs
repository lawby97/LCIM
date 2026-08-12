/**
 * Sprint 03 tests: write-scope rule and must-change rule.
 *
 * Required coverage: valid subset-of-allowed paths succeeds; any path
 * outside the allowed set fails closed; missing required must_change_path
 * fails; scope paths are normalized and unsafe forms fail closed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { checkWriteScope, checkMustChange, validateScope, normalizeScopePath } from '../../src/validation/git/scope.mjs';
import { PathSafetyError, ScopeViolationError } from '../../src/git/errors.mjs';

test('path normalization: trailing slashes stripped, unsafe forms fail closed', () => {
  assert.equal(normalizeScopePath('src/'), 'src');
  assert.equal(normalizeScopePath('./src/foo.mjs'), 'src/foo.mjs');
  assert.equal(normalizeScopePath('a/../b.txt'), 'b.txt');
  assert.throws(() => normalizeScopePath(''), PathSafetyError);
  assert.throws(() => normalizeScopePath('/abs/path'), PathSafetyError);
  assert.throws(() => normalizeScopePath('../escape'), PathSafetyError);
  assert.throws(() => normalizeScopePath('..'), PathSafetyError);
  assert.throws(() => normalizeScopePath('a\\b'), PathSafetyError);
  assert.throws(() => normalizeScopePath('.'), PathSafetyError);
  assert.throws(() => normalizeScopePath(null), PathSafetyError);
});

test('valid subset-of-allowed paths succeeds', () => {
  const changedPaths = ['a.txt'];
  const allowedWritePaths = ['a.txt', 'dir/b.txt', 'c.txt'];
  assert.deepEqual(checkWriteScope({ changedPaths, allowedWritePaths }), { ok: true, outOfScope: [] });
  assert.deepEqual(
    validateScope({ changedPaths: ['a.txt', 'dir/b.txt'], allowedWritePaths: ['a.txt', 'dir/b.txt', 'c.txt'] }),
    { ok: true, outOfScope: [], missing: [] },
  );
});

test('exact allowed set succeeds (no requirement that every allowed path changes)', () => {
  const allowedWritePaths = ['a.txt', 'dir/b.txt'];
  // worker changed only a.txt — allowed, even though dir/b.txt is untouched
  assert.deepEqual(checkWriteScope({ changedPaths: ['a.txt'], allowedWritePaths }), { ok: true, outOfScope: [] });
  // empty change set is trivially within scope
  assert.deepEqual(checkWriteScope({ changedPaths: [], allowedWritePaths }), { ok: true, outOfScope: [] });
});

test('any path outside the allowed set fails closed', () => {
  const allowedWritePaths = ['a.txt', 'dir/b.txt'];
  assert.throws(
    () => checkWriteScope({ changedPaths: ['a.txt', 'outside.txt'], allowedWritePaths }),
    (err) =>
      err instanceof ScopeViolationError &&
      err.details.outOfScope.length === 1 &&
      err.details.outOfScope[0] === 'outside.txt',
  );
  // normalized comparison: 'dir/b.txt/' equals 'dir/b.txt' and stays allowed
  assert.deepEqual(checkWriteScope({ changedPaths: ['dir/b.txt/'], allowedWritePaths: ['dir/b.txt'] }), {
    ok: true,
    outOfScope: [],
  });
  // empty allowed set: any change is out of scope
  assert.throws(() => checkWriteScope({ changedPaths: ['a.txt'], allowedWritePaths: [] }), ScopeViolationError);
});

test('missing required must_change_path fails (checked separately from scope)', () => {
  const changedPaths = ['a.txt', 'dir/b.txt'];
  const allowedWritePaths = ['a.txt', 'dir/b.txt', 'c.txt'];
  // scope fine, but the required path did not change
  assert.throws(
    () => checkMustChange({ changedPaths, mustChangePaths: ['c.txt'] }),
    (err) => err instanceof ScopeViolationError && err.details.missing.length === 1 && err.details.missing[0] === 'c.txt',
  );
  // satisfied
  assert.deepEqual(checkMustChange({ changedPaths, mustChangePaths: ['a.txt'] }), { ok: true, missing: [] });
  // empty must-change list trivially passes
  assert.deepEqual(checkMustChange({ changedPaths, mustChangePaths: [] }), { ok: true, missing: [] });
  // combined validation enforces both rules
  assert.deepEqual(validateScope({ changedPaths, allowedWritePaths, mustChangePaths: ['dir/b.txt'] }), {
    ok: true,
    outOfScope: [],
    missing: [],
  });
  assert.throws(
    () => validateScope({ changedPaths, allowedWritePaths, mustChangePaths: ['never.txt'] }),
    ScopeViolationError,
  );
});

test('write scope is checked before must-change (primary rule first)', () => {
  assert.throws(
    () =>
      validateScope({
        changedPaths: ['a.txt', 'forbidden.txt'],
        allowedWritePaths: ['a.txt'],
        mustChangePaths: ['a.txt'],
      }),
    (err) => err instanceof ScopeViolationError && err.details.outOfScope.length === 1,
  );
});

test('changed paths in unsafe form fail closed', () => {
  assert.throws(() => checkWriteScope({ changedPaths: ['../escape'], allowedWritePaths: ['../escape'] }), PathSafetyError);
  assert.throws(() => checkWriteScope({ changedPaths: ['ok.txt'], allowedWritePaths: ['/abs'] }), PathSafetyError);
  assert.throws(() => checkMustChange({ changedPaths: ['ok.txt'], mustChangePaths: [42] }), PathSafetyError);
});
