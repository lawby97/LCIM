/**
 * Sprint 00 unit tests: runtime-path resolution.
 *
 * Acceptance hooks:
 * - runtime root resolves beneath the target repo Git common directory;
 * - linked worktrees share one Git-common run store;
 * - runtime state is never inside tracked space;
 * - non-repo / invalid inputs fail closed.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertNoTrackedFilesUnder,
  isPathWithin,
  resolveGitCommonDir,
  resolveRunDir,
  resolveRuntimeRoot,
} from '../../src/config/runtime-path.mjs';
import { generateId } from '../../src/shared/ids.mjs';
import { PublicSafetyError, RuntimePathError } from '../../src/shared/errors.mjs';
import { git, makeGitRepo, makeLinkedWorktree, writeFixtureFile } from '../helpers/git-fixture.mjs';

test('normal repo: common dir, runtime root, and run dir resolve correctly', async (t) => {
  const repo = await makeGitRepo(t);
  const common = resolveGitCommonDir(repo.root);
  assert.equal(common, fs.realpathSync(path.join(repo.root, '.git')));
  assert.ok(fs.statSync(common).isDirectory());

  const runtimeRoot = resolveRuntimeRoot(repo.root);
  assert.equal(runtimeRoot, path.join(common, 'lcim'));
  assert.ok(isPathWithin(common, runtimeRoot));

  const runId = generateId('run');
  const runDir = resolveRunDir(repo.root, runId);
  assert.equal(runDir, path.join(runtimeRoot, 'runs', runId));

  // runtime path never overlaps tracked space
  assert.equal(assertNoTrackedFilesUnder(runtimeRoot, repo.root), true);
});

test('runtime evidence written under the common dir is invisible to git status', async (t) => {
  const repo = await makeGitRepo(t);
  writeFixtureFile(repo.root, 'tracked.txt', 'tracked\n');
  git(repo.root, ['add', 'tracked.txt']);
  git(repo.root, ['commit', '-m', 'base']);
  const runId = generateId('run');
  const runDir = resolveRunDir(repo.root, runId);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'events.jsonl'), '{"seq":1}\n');
  fs.writeFileSync(path.join(runDir, 'transcript.jsonl'), 'raw\n');
  assert.equal(assertNoTrackedFilesUnder(resolveRuntimeRoot(repo.root), repo.root), true);
  assert.equal(git(repo.root, ['status', '--porcelain']), '');
  assert.equal(git(repo.root, ['ls-files']).trim(), 'tracked.txt');
});

test('linked worktrees share one Git-common run store', async (t) => {
  const { root, linked } = await makeLinkedWorktree(t);
  assert.notEqual(linked, root);
  assert.equal(resolveGitCommonDir(linked), resolveGitCommonDir(root));
  assert.equal(resolveRuntimeRoot(linked), resolveRuntimeRoot(root));
  const runId = generateId('run');
  assert.equal(resolveRunDir(linked, runId), resolveRunDir(root, runId));
  assert.equal(assertNoTrackedFilesUnder(resolveRuntimeRoot(linked), linked), true);
});

test('non-repo directory fails closed with RuntimePathError', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s00-norepo-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  assert.throws(() => resolveGitCommonDir(tmp), RuntimePathError);
  assert.throws(() => resolveRuntimeRoot(tmp), RuntimePathError);
});

test('invalid run ids fail closed', async (t) => {
  const repo = await makeGitRepo(t);
  assert.throws(() => resolveRunDir(repo.root, 'not-a-run-id'), RuntimePathError);
  assert.throws(() => resolveRunDir(repo.root, generateId('invocation')), RuntimePathError);
  assert.throws(() => resolveRunDir(repo.root, null), RuntimePathError);
});

test('isPathWithin handles equal, nested, sibling, and parent paths', () => {
  assert.equal(isPathWithin('/a/b', '/a/b'), true);
  assert.equal(isPathWithin('/a/b', '/a/b/c'), true);
  assert.equal(isPathWithin('/a', '/a/b/c'), true);
  assert.equal(isPathWithin('/a/b', '/a/bc'), false); // prefix sibling, not child
  assert.equal(isPathWithin('/a/b', '/a'), false); // parent is not within child
  assert.equal(isPathWithin('/a/b', '/c/d'), false);
});

test('assertNoTrackedFilesUnder throws PublicSafetyError when tracked files are inside dir', async (t) => {
  const repo = await makeGitRepo(t);
  writeFixtureFile(repo.root, 'sub/a.txt', 'x\n');
  git(repo.root, ['add', 'sub/a.txt']);
  git(repo.root, ['commit', '-m', 'add sub']);
  assert.throws(
    () => assertNoTrackedFilesUnder(path.join(repo.root, 'sub'), repo.root),
    PublicSafetyError,
  );
});
