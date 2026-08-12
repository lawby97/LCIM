/**
 * Sprint 03 git facts (controller-owned).
 *
 * Low-level deterministic git queries. Policy/validation lives in
 * `src/validation/git/**`; this module only answers objective questions:
 * "what is HEAD?", "is this commit present?", "how far ahead/behind?".
 */

import { runGit } from './exec.mjs';
import { GitOperationError } from './errors.mjs';

export const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;

/** Assert a value is a full 40-hex commit sha; throws GitOperationError otherwise. */
export function assertFullSha(value, label = 'sha') {
  if (typeof value !== 'string' || !FULL_SHA_PATTERN.test(value)) {
    throw new GitOperationError(`${label} must be a 40-hex commit sha, got ${JSON.stringify(value)}`);
  }
  return value;
}

/** Resolve the current HEAD sha of a work tree. */
export function resolveHeadSha(cwd) {
  return runGit(cwd, ['rev-parse', 'HEAD']).stdout.trim();
}

/**
 * Resolve a revision to its full commit sha (`rev^{commit}`). Throws
 * GitOperationError when the revision does not name a commit.
 */
export function resolveCommitSha(cwd, rev) {
  assertFullSha(rev);
  return runGit(cwd, ['rev-parse', '--verify', `${rev}^{commit}`]).stdout.trim();
}

/** True when `rev` names an existing commit in the repository at `cwd`. */
export function commitExists(cwd, rev) {
  try {
    resolveCommitSha(cwd, rev);
    return true;
  } catch (err) {
    if (err instanceof GitOperationError) return false;
    throw err;
  }
}

/**
 * Symmetric commit distance between `baseSha` and HEAD:
 *   ahead  = commits reachable from HEAD but not from baseSha (worker commits)
 *   behind = commits reachable from baseSha but not from HEAD (resets/rewinds)
 */
export function aheadBehind(cwd, baseSha) {
  assertFullSha(baseSha);
  const out = runGit(cwd, ['rev-list', '--left-right', '--count', `${baseSha}...HEAD`]).stdout.trim();
  const parts = out.split(/\s+/).map(Number);
  if (parts.length !== 2 || parts.some((n) => !Number.isInteger(n))) {
    throw new GitOperationError(`cannot compute ahead/behind at ${cwd}: unexpected output ${JSON.stringify(out)}`);
  }
  return { behind: parts[0], ahead: parts[1] };
}

/** True when the work tree is clean (`git status --porcelain` empty). */
export function isWorktreeClean(cwd) {
  return runGit(cwd, ['status', '--porcelain']).stdout.length === 0;
}
