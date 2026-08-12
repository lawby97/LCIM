/**
 * Sprint 03 git-safety test fixtures.
 *
 * Builds disposable target repos under os.tmpdir() with an LCIM worktree
 * root, and simulates worker behavior with raw git commands inside the
 * worker worktree. Reuses the Sprint 00 fixture primitives (import-only;
 * tests/helpers/git-fixture.mjs is not modified).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeGitRepo, git, writeFixtureFile } from './git-fixture.mjs';
import { generateId } from '../../src/shared/ids.mjs';

/** Fresh work-unit id. */
export function makeWorkUnitId() {
  return generateId('work-unit');
}

/**
 * Fresh disposable target repo with a seed commit.
 * @returns {{ repoDir: string, worktreeRoot: string, baseSha: string }}
 */
export async function makeWorkerFixture(t, { seedFiles = { 'a.txt': 'alpha\n', 'dir/b.txt': 'beta\n' } } = {}) {
  const { root } = await makeGitRepo(t);
  for (const [rel, content] of Object.entries(seedFiles)) {
    writeFixtureFile(root, rel, content);
  }
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'fixture base']);
  const baseSha = git(root, ['rev-parse', 'HEAD']).trim();
  const worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s03-wt-root-'));
  t.after(() => fs.rmSync(worktreeRoot, { recursive: true, force: true }));
  return { repoDir: root, worktreeRoot, baseSha };
}

/** Run a worker git command inside the worker worktree. */
export function workerGit(worktreeDir, args, opts) {
  return git(worktreeDir, args, opts);
}

/** Advance the parent repo: write a file, commit, return the new HEAD. */
export function commitToParent(repoDir, rel, content, message = 'parent commit') {
  writeFixtureFile(repoDir, rel, content);
  git(repoDir, ['add', '-A']);
  git(repoDir, ['commit', '-m', message]);
  return git(repoDir, ['rev-parse', 'HEAD']).trim();
}

/** Fresh disposable bare remote for push-detection tests. */
export function makeBareRemote(t, name = 'origin') {
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s03-remote-'));
  t.after(() => fs.rmSync(remote, { recursive: true, force: true }));
  git(remote, ['init', '--bare', '-b', 'main']);
  return { remote, name };
}
