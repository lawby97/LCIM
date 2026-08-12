/**
 * Sprint 03 controller-owned patch evidence collector.
 *
 * Computes every objective patch fact from git — never from worker claims:
 *
 * - changed paths (tracked modifications + untracked files),
 * - additions / deletions (git name-status),
 * - the canonical patch artifact (`git diff --full-index --binary
 *   --no-renames <baseSha>`, byte-exact),
 * - patchHash = sha256 hex over the canonical patch bytes,
 * - patchId   = `lcim_patch_` + first 32 hex chars of patchHash,
 * - `git diff --check` result (whitespace errors as evidence, not a throw),
 * - baseSha + worktreeHead (must both equal expectedBaseSha: PRE_EXTRACT).
 *
 * Untracked files are registered with `git add -N` (intent-to-add) so the
 * canonical patch covers ALL observed changed paths, not only tracked ones.
 * The intent-to-add mutates only the disposable worker worktree index.
 *
 * Determinism switches: --no-renames, --no-ext-diff, --no-textconv,
 * -c core.quotepath=false. A binary file diff is captured verbatim.
 */

import { createHash } from 'node:crypto';
import { ConfigError } from '../../shared/errors.mjs';
import { runGit, runGitBuffer } from '../../git/exec.mjs';
import { assertFullSha, resolveHeadSha } from '../../git/base.mjs';
import { BaseMismatchError } from '../../git/errors.mjs';
import { isValidWorktreeId } from '../../git/worktree-registry.mjs';
import { attachValidationResults } from './hooks.mjs';
import { stampPatchEvidence } from './schema.mjs';
import { generateEvidenceId } from './store.mjs';

/**
 * Collect the controller-owned patch evidence for a worker worktree.
 *
 * @param {object} args
 * @param {string} args.worktreeDir - worker worktree directory
 * @param {string} args.expectedBaseSha - base the worktree was rooted at
 * @param {string} args.workUnitId - owning work unit id
 * @param {string} args.worktreeId - controller-retained worktree identity
 *        the evidence is collected from (binds the observation to the exact
 *        disposable worktree; cleanup verifies this binding)
 * @param {Array} [args.validationResults] - Sprint 04 hook results to attach
 * @returns {{ record: object, patchText: Buffer }}
 */
export function collectPatchEvidence({ worktreeDir, expectedBaseSha, workUnitId, worktreeId, validationResults }) {
  assertFullSha(expectedBaseSha, 'expectedBaseSha');
  if (typeof workUnitId !== 'string' || !/^lcim_wu_[0-9a-f]{32}$/.test(workUnitId)) {
    throw new ConfigError(`invalid work unit id: ${JSON.stringify(workUnitId)}`);
  }
  if (!isValidWorktreeId(worktreeId)) {
    throw new ConfigError(`invalid worktree id: ${JSON.stringify(worktreeId)}`);
  }

  // Checkpoint: base must hold IMMEDIATELY before extraction.
  const worktreeHead = resolveHeadSha(worktreeDir);
  if (worktreeHead !== expectedBaseSha) {
    throw new BaseMismatchError(
      `PRE_EXTRACT: worker worktree HEAD ${worktreeHead} does not equal expected base ${expectedBaseSha}; refusing to collect evidence`,
      { checkpoint: 'PRE_EXTRACT', expectedBaseSha, worktreeHead },
    );
  }

  // Register untracked files (intent-to-add) so the canonical patch covers
  // every observed changed path. The index is disposable (worker worktree).
  const untracked = runGit(worktreeDir, ['ls-files', '--others', '--exclude-standard', '-z']).stdout
    .split('\0')
    .filter(Boolean);
  if (untracked.length > 0) {
    runGit(worktreeDir, ['add', '-N', '--', ...untracked]);
  }

  // Changed paths / additions / deletions (deterministic: no renames).
  const nameStatus = runGit(worktreeDir, ['diff', '--name-status', '-z', '--no-renames', expectedBaseSha]).stdout;
  const entries = parseNameStatus(nameStatus);

  const changedSet = new Set();
  const additionsSet = new Set();
  const deletionsSet = new Set();
  for (const entry of entries) {
    changedSet.add(entry.path);
    if (entry.oldPath !== undefined) changedSet.add(entry.oldPath);
    if (entry.status === 'A' || entry.status === 'C') {
      additionsSet.add(entry.path);
    } else if (entry.status === 'D') {
      deletionsSet.add(entry.path);
    }
    if (entry.status === 'R' && entry.oldPath !== undefined) {
      additionsSet.add(entry.path);
      deletionsSet.add(entry.oldPath);
    }
  }
  const changedPaths = [...changedSet].sort();
  const additions = [...additionsSet].sort();
  const deletions = [...deletionsSet].sort();

  // Canonical patch artifact (byte-exact, binary-safe, deterministic).
  const patchBuffer = runGitBuffer(worktreeDir, [
    '-c',
    'core.quotepath=false',
    'diff',
    '--no-ext-diff',
    '--no-textconv',
    '--full-index',
    '--binary',
    '--no-renames',
    expectedBaseSha,
  ]).stdout;

  const diffCheck = runGit(worktreeDir, ['diff', '--check', expectedBaseSha], { allowNonZero: true });

  // `git diff --check` prints whitespace diagnostics to STDOUT (exit 2 on
  // this git) — collect the union of both streams so the evidence is
  // complete regardless of git version.
  const checkLines = [...diffCheck.stdout.split('\n'), ...diffCheck.stderr.split('\n')]
    .map((line) => line.trimEnd())
    .filter(Boolean);

  const patchHash = createHash('sha256').update(patchBuffer).digest('hex');
  const patchId = `lcim_patch_${patchHash.slice(0, 32)}`;

  let record = stampPatchEvidence({
    evidenceId: generateEvidenceId(),
    patchId,
    workUnitId,
    worktreeId,
    baseSha: expectedBaseSha,
    worktreeHead,
    changedPaths,
    additions,
    deletions,
    patchHash,
    diffCheck: {
      clean: diffCheck.status === 0,
      errors: checkLines,
    },
    createdAt: new Date().toISOString(),
  });

  if (validationResults !== undefined && validationResults !== null && validationResults.length > 0) {
    record = attachValidationResults(record, validationResults);
  }

  return { record, patchText: patchBuffer };
}

/**
 * Parse `git diff --name-status -z --no-renames <base>` output.
 * NUL-separated: `<status>[<score>]\0<path>\0` (or `\0<old>\0<new>\0`
 * for R/C, which --no-renames disables — kept for robustness).
 */
function parseNameStatus(out) {
  const parts = out.split('\0');
  const entries = [];
  let i = 0;
  while (i < parts.length) {
    const statusField = parts[i];
    i += 1;
    if (statusField === undefined || statusField.length === 0) break;
    const status = statusField[0];
    if (status === 'R' || status === 'C') {
      const oldPath = parts[i];
      const newPath = parts[i + 1];
      i += 2;
      if (oldPath === undefined || newPath === undefined) break;
      entries.push({ status, path: newPath, oldPath });
    } else {
      const p = parts[i];
      i += 1;
      if (p === undefined || p.length === 0) break;
      entries.push({ status, path: p });
    }
  }
  return entries;
}
