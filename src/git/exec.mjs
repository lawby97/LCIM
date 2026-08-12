/**
 * Sprint 03 git process runner.
 *
 * Deterministic, fail-closed wrapper around `git` for controller-owned
 * evidence. Every command is executed with an explicit cwd, a bounded
 * timeout, and a bounded buffer; non-zero exits throw `GitOperationError`
 * unless `allowNonZero` is requested (e.g. `git diff --check`, whose exit
 * status is evidence, not a failure).
 */

import { spawnSync } from 'node:child_process';
import { GitOperationError } from './errors.mjs';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_BUFFER = 64 * 1024 * 1024;

/**
 * Run git with string output.
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
export function runGit(cwd, args, opts = {}) {
  const { allowNonZero = false, timeout = DEFAULT_TIMEOUT_MS } = opts;
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout,
    maxBuffer: MAX_BUFFER,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    throw new GitOperationError(`git ${args.join(' ')} failed: ${result.error.message}`, {
      cwd,
      args,
    });
  }
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  if (result.status !== 0 && !allowNonZero) {
    throw new GitOperationError(
      `git ${args[0]} failed with exit ${result.status}: ${stderr.trim() || '(no stderr)'}`,
      { cwd, args, exitCode: result.status },
    );
  }
  return { status: result.status, stdout, stderr };
}

/**
 * Run git with byte-exact output (used for the canonical patch artifact, so
 * the patch hash covers the exact bytes and binary diffs survive verbatim).
 * @returns {{ status: number, stdout: Buffer, stderr: Buffer }}
 */
export function runGitBuffer(cwd, args, opts = {}) {
  const { allowNonZero = false, timeout = DEFAULT_TIMEOUT_MS } = opts;
  const result = spawnSync('git', args, {
    cwd,
    encoding: null,
    timeout,
    maxBuffer: MAX_BUFFER,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    throw new GitOperationError(`git ${args.join(' ')} failed: ${result.error.message}`, {
      cwd,
      args,
    });
  }
  const stdout = result.stdout ?? Buffer.alloc(0);
  const stderr = result.stderr ?? Buffer.alloc(0);
  if (result.status !== 0 && !allowNonZero) {
    throw new GitOperationError(
      `git ${args[0]} failed with exit ${result.status}: ${stderr.toString('utf8').trim() || '(no stderr)'}`,
      { cwd, args, exitCode: result.status },
    );
  }
  return { status: result.status, stdout, stderr };
}
