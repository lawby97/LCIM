/**
 * LCIM V2 runtime-path resolution (Sprint 00).
 *
 * Runtime logs/state must NEVER live in tracked source directories. The
 * canonical runtime root is `<git-common-dir>/lcim` — the Git common
 * directory is never part of the tracked working tree (it is `.git` itself,
 * or the shared `.git` of a linked-worktree group), and linked worktrees
 * share one runtime store (Sprint 01 requirement).
 *
 * Sprint 01 owns the run store layout under
 * `<git-common-dir>/lcim/runs/<run_id>/`; this module fixes the root and the
 * run-dir naming contract only.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PublicSafetyError, RuntimePathError } from '../shared/errors.mjs';
import { isValidId } from '../shared/ids.mjs';

/**
 * Resolve the Git common directory for a working directory using
 * `git rev-parse --git-common-dir` (handles relative output and linked
 * worktrees). Throws RuntimePathError when not inside a Git work tree.
 */
export function resolveGitCommonDir(cwd = process.cwd()) {
  let raw;
  try {
    raw = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (err) {
    throw new RuntimePathError(
      `not inside a Git work tree (git rev-parse --git-common-dir failed at ${cwd})`,
      { cause: err },
    );
  }
  if (!raw) {
    throw new RuntimePathError(`git rev-parse --git-common-dir returned an empty result at ${cwd}`);
  }
  const abs = path.resolve(cwd, raw);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new RuntimePathError(`resolved Git common dir does not exist: ${abs}`);
  }
  // Normalize symlinks (e.g. /var -> /private/var on macOS) so linked
  // worktrees and the main repo agree on one canonical common-dir path.
  return fs.realpathSync(abs);
}

/** Canonical runtime root: `<git-common-dir>/lcim`. Never tracked. */
export function resolveRuntimeRoot(cwd = process.cwd()) {
  return path.join(resolveGitCommonDir(cwd), 'lcim');
}

/** Run store directory: `<git-common-dir>/lcim/runs/<runId>`. */
export function resolveRunDir(cwd = process.cwd(), runId) {
  if (!isValidId('run', runId)) {
    throw new RuntimePathError(`invalid run id: ${JSON.stringify(runId)}`);
  }
  return path.join(resolveRuntimeRoot(cwd), 'runs', runId);
}

/** True when `child` is `parent` or nested beneath it (path-wise). */
export function isPathWithin(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Fail closed (PublicSafetyError) if any tracked file of the repo at `cwd`
 * lives under `dir`. Used to prove a runtime path is outside tracked space.
 */
export function assertNoTrackedFilesUnder(dir, cwd = process.cwd()) {
  let out;
  try {
    out = execFileSync('git', ['ls-files', '-z'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (err) {
    throw new RuntimePathError(`cannot list tracked files at ${cwd}: ${err.message}`);
  }
  const violations = out
    .split('\0')
    .filter(Boolean)
    .map((f) => path.resolve(cwd, f))
    .filter((f) => isPathWithin(dir, f));
  if (violations.length > 0) {
    throw new PublicSafetyError(`tracked files exist under runtime path ${dir}: ${violations.join(', ')}`);
  }
  return true;
}
