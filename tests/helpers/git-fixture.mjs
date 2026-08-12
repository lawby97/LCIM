/**
 * Git fixture helpers for Sprint 00 tests.
 * All fixtures are created under os.tmpdir() and cleaned up by the test.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** LCIM source tree root (this repo). */
const LCIM_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function git(cwd, args, opts = {}) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    ...opts,
  });
}

/** @returns {number} exit status of `git -C cwd check-ignore -q <file>` (0 = ignored). */
export function checkIgnored(cwd, file) {
  const r = spawnSync('git', ['-C', cwd, 'check-ignore', '-q', file], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return r.status;
}

/** Create a fresh git repo in a tmp dir. Registers cleanup on the test. */
export async function makeGitRepo(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s00-fixture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'lcim-test@example.invalid']);
  git(root, ['config', 'user.name', 'LCIM Sprint 00 Test']);
  return { root };
}

/**
 * Create a main repo with one commit plus a linked worktree.
 * @returns {{ root: string, linked: string }}
 */
export async function makeLinkedWorktree(t) {
  const repo = await makeGitRepo(t);
  fs.writeFileSync(path.join(repo.root, 'file.txt'), 'hello\n');
  git(repo.root, ['add', 'file.txt']);
  git(repo.root, ['commit', '-m', 'fixture base']);
  const linked = `${repo.root}-linked`;
  git(repo.root, ['worktree', 'add', '-b', 'fixture-linked', linked]);
  t.after(() => {
    try {
      git(repo.root, ['worktree', 'remove', '--force', linked]);
    } catch {
      try {
        fs.rmSync(linked, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  });
  return { root: repo.root, linked };
}

/**
 * Stage a standalone copy of the LCIM source subset needed by
 * src/config/version.mjs (src/, schemas/, VERSION, bin/) into a fresh tmp
 * dir, optionally committed as its own Git repository (the "LCIM fixture/
 * source repository"). Used to prove git-commit discovery is anchored to
 * the LCIM install root, independent of the caller's cwd.
 * @returns {{ root: string }} the staged copy root
 */
export async function stageLcimSource(t, { gitRepo = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s00-src-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const rel of ['src', 'schemas', 'VERSION', 'bin']) {
    fs.cpSync(path.join(LCIM_ROOT, rel), path.join(root, rel), { recursive: true });
  }
  if (gitRepo) {
    git(root, ['init', '-b', 'main']);
    git(root, ['config', 'user.email', 'lcim-test@example.invalid']);
    git(root, ['config', 'user.name', 'LCIM Sprint 00 Test']);
    git(root, ['add', '-A']);
    git(root, ['commit', '-m', 'lcim fixture source']);
  }
  return { root };
}

/** Write a file (creating parent dirs) inside a fixture repo. */
export function writeFixtureFile(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}
