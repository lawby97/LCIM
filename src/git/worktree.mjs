/**
 * Sprint 03 isolated worker worktree lifecycle.
 *
 * - `createIsolatedWorktree` spawns a DETACHED worktree rooted at exactly
 *   `expectedBaseSha` (validated before spawn), writes a controller-created
 *   ownership marker into THE LINKED WORKTREE'S OWN Git admin directory
 *   (SOL-S03-FINAL-001), records it in the LCIM-owned registry under a
 *   fresh controller-generated worktreeId, and returns controller-owned
 *   snapshots (refs, reflog, config, remotes, parent state) used to prove
 *   the worker never touched the parent or the repository's
 *   refs/configuration.
 * - `removeIsolatedWorktree` removes ONLY worktrees LCIM created and
 *   registered, keyed by the CONTROLLER-RETAINED worktreeId (never by path
 *   alone), never the main/parent worktree and never a user worktree; a
 *   dirty worker worktree cannot be removed until matching persisted patch
 *   evidence was verified (evidence refs must resolve to validated
 *   contextual records bound to this worktreeId/workUnitId/baseSha with a
 *   hash-verified patch artifact). Before git removal, the registry
 *   lifecycle AND the independent controller-created ownership marker in
 *   the exact per-worktree Git admin directory must AGREE on every
 *   identity (worktreeId, workUnitId, base, canonical path, marker
 *   identity) — forged registry data alone can never manufacture LCIM
 *   ownership of a foreign worktree.
 *
 * Physical paths are unique by construction: the default worktree name is
 * derived from the controller-owned worktreeId, and a path that still has an
 * open (CREATED, not yet REMOVED) registry lifecycle can never be reused by
 * a different identity. Stale ownership therefore cannot authorize removal
 * of a replacement worktree.
 *
 * Prohibited by construction (V1 safety boundaries): the worker worktree is
 * detached (no branch), lives OUTSIDE the parent working tree, and LCIM
 * never commits, pushes, merges, resets, or cleans on behalf of a worker.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ConfigError } from '../shared/errors.mjs';
import { isValidId } from '../shared/ids.mjs';
import { isPathWithin } from '../config/runtime-path.mjs';
import { runGit } from './exec.mjs';
import { assertFullSha, isWorktreeClean, resolveHeadSha } from './base.mjs';
import {
  normalizePath,
  snapshotConfig,
  snapshotParentState,
  snapshotReflog,
  snapshotRefs,
  snapshotRemotes,
} from './state.mjs';
import {
  activeWorktreeRecords,
  assertWorktreePathNotClaimed,
  findCreatedWorktree,
  generateWorktreeId,
  recordWorktreeEvent,
} from './worktree-registry.mjs';
import {
  createWorktreeOwnershipMarker,
  isValidOwnershipMarkerId,
  verifyWorktreeOwnershipMarker,
  verifyWorktreeOwnershipMarkerFromGitMetadata,
} from './worktree-ownership.mjs';
import { resolveEvidenceRef } from '../evidence/patch/store.mjs';
import { WorktreeSafetyError } from './errors.mjs';
import { validateBaseAtCheckpoint } from '../validation/git/base.mjs';

const WORKTREE_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * Create an isolated detached worker worktree rooted at expectedBaseSha.
 *
 * @param {object} args
 * @param {string} args.repoDir - parent/main worktree directory (integration target)
 * @param {string} args.worktreeRoot - disposable root directory for LCIM worktrees
 * @param {string} args.expectedBaseSha - 40-hex base the worktree must sit on
 * @param {string} args.workUnitId - owning work unit (lcim_wu_<32hex>)
 * @param {string} [args.worktreeName] - directory name override (default is
 *        derived from the fresh controller-owned worktreeId, so identities
 *        never intentionally reuse paths)
 * @param {string} [args.serialBaseSha] - PRE_SPAWN serial-base policy: when
 *        provided, expectedBaseSha must equal the accepted head of the
 *        predecessor unit (accepted unit N yields the only allowed base for N+1)
 * @returns {object} context: worktreeDir, worktreeId, workUnitId, baseSha,
 *        headSha, markerId, markerPath and the controller-owned snapshots
 *        for post-exit verification
 */
export function createIsolatedWorktree({
  repoDir,
  worktreeRoot,
  expectedBaseSha,
  workUnitId,
  worktreeName,
  serialBaseSha,
}) {
  assertFullSha(expectedBaseSha, 'expectedBaseSha');
  if (!isValidId('work-unit', workUnitId)) {
    throw new ConfigError(`invalid work unit id: ${JSON.stringify(workUnitId)}`);
  }
  if (worktreeName !== undefined && !WORKTREE_NAME_PATTERN.test(worktreeName)) {
    throw new ConfigError(
      `invalid worktreeName ${JSON.stringify(worktreeName)} (allowed: ${WORKTREE_NAME_PATTERN})`,
      { worktreeName },
    );
  }

  // Checkpoint 1: validate base BEFORE spawn.
  validateBaseAtCheckpoint({ repoDir, expectedBaseSha, checkpoint: 'PRE_SPAWN', serialBaseSha });

  // Controller-owned identity FIRST: the physical path derives from it.
  const worktreeId = generateWorktreeId();
  const name = worktreeName ?? `lcim-wt-${worktreeId.replace(/^lcim_wt_/, '')}`;
  const rootAbs = path.resolve(worktreeRoot);
  fs.mkdirSync(rootAbs, { recursive: true });
  // realpath the root so all comparisons share one canonical prefix
  // (e.g. /var -> /private/var on macOS) and git's own porcelain output
  const rootReal = fs.realpathSync(rootAbs);
  const target = path.resolve(rootReal, name);
  if (!isPathWithin(rootReal, target)) {
    throw new WorktreeSafetyError(`worktree target escapes the disposable worktree root: ${target}`, {
      worktreeRoot: rootReal,
      target,
    });
  }
  const parentTop = normalizePath(runGit(repoDir, ['rev-parse', '--show-toplevel']).stdout.trim());
  if (isPathWithin(parentTop, target)) {
    throw new WorktreeSafetyError(
      'refusing to create a worker worktree inside the parent work tree: the worker must never share the parent working directory',
      { parentTop, target },
    );
  }
  if (fs.existsSync(target)) {
    throw new WorktreeSafetyError(`worktree path already exists: ${target}`, { target });
  }
  // Registry claim: a path with an open LCIM lifecycle is never reused by a
  // different identity (stale ownership must never touch a replacement).
  assertWorktreePathNotClaimed(repoDir, target);

  runGit(repoDir, ['worktree', 'add', '--detach', target, expectedBaseSha]);

  // Post-create verification: the worktree must sit exactly on the base.
  const headSha = resolveHeadSha(target);
  if (headSha !== expectedBaseSha) {
    throw new WorktreeSafetyError(
      `created worker worktree HEAD ${headSha} does not equal expected base ${expectedBaseSha}`,
      { expectedBaseSha, headSha, worktreeDir: target },
    );
  }

  // Controller-created ownership marker (SOL-S03-FINAL-001): written into
  // THIS linked worktree's OWN Git admin directory (resolved through git,
  // never a caller path, never the checked-out tree, never a tracked file,
  // never the common Git directory). The registry CREATED event references
  // the marker identity, but registry data alone can never synthesize the
  // marker inside a foreign worktree's gitdir.
  const { markerId, markerPath } = createWorktreeOwnershipMarker({
    worktreeDir: target,
    repoDir,
    worktreeId,
    workUnitId,
    baseSha: expectedBaseSha,
  });

  recordWorktreeEvent({
    repoDir,
    worktreeId,
    workUnitId,
    worktreePath: target,
    baseSha: expectedBaseSha,
    event: 'CREATED',
    markerId,
  });

  // Controller-owned baselines; everything AFTER creation, BEFORE the worker.
  return {
    worktreeDir: target,
    worktreeId,
    workUnitId,
    baseSha: expectedBaseSha,
    headSha,
    markerId,
    markerPath,
    refsSnapshot: snapshotRefs(repoDir),
    reflogSnapshot: snapshotReflog(target),
    configSnapshot: snapshotConfig(repoDir),
    remotesSnapshot: snapshotRemotes(repoDir),
    parentSnapshot: snapshotParentState(repoDir),
  };
}

/**
 * Verify persisted patch evidence refs against a worktree's registry
 * identity (SOL-S03-005). Every ref must resolve to a validated contextual
 * record under the canonical Git-common LCIM evidence store whose:
 *   - evidenceId/record + patch artifact hash chain validates,
 *   - worktreeId equals the controller-retained worktreeId,
 *   - workUnitId matches the registry record,
 *   - baseSha matches the registry record (expected base).
 * Arbitrary strings, missing/foreign/mismatched evidence all fail closed.
 */
function verifyDirtyCleanupEvidence({ repoDir, worktreeId, registryRecord, evidenceRefs }) {
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) {
    throw new WorktreeSafetyError(
      'worker worktree has uncommitted changes; persist patch evidence before cleanup',
      { worktreeDir: registryRecord.worktreePath, baseSha: registryRecord.baseSha },
    );
  }
  const verified = [];
  for (const ref of evidenceRefs) {
    const resolved = resolveEvidenceRef(repoDir, ref);
    if (resolved.record.worktreeId !== worktreeId) {
      throw new WorktreeSafetyError(
        `evidence ${resolved.evidenceId} belongs to worktree ${resolved.record.worktreeId}, not ${worktreeId}; refusing dirty cleanup`,
        { evidenceId: resolved.evidenceId, evidenceWorktreeId: resolved.record.worktreeId, worktreeId },
      );
    }
    if (resolved.record.workUnitId !== registryRecord.workUnitId) {
      throw new WorktreeSafetyError(
        `evidence ${resolved.evidenceId} belongs to work unit ${resolved.record.workUnitId}, not ${registryRecord.workUnitId}; refusing dirty cleanup`,
        { evidenceId: resolved.evidenceId, evidenceWorkUnitId: resolved.record.workUnitId, workUnitId: registryRecord.workUnitId },
      );
    }
    if (resolved.record.baseSha !== registryRecord.baseSha) {
      throw new WorktreeSafetyError(
        `evidence ${resolved.evidenceId} was collected at base ${resolved.record.baseSha}, not the registered base ${registryRecord.baseSha}; refusing dirty cleanup`,
        { evidenceId: resolved.evidenceId, evidenceBaseSha: resolved.record.baseSha, baseSha: registryRecord.baseSha },
      );
    }
    verified.push(resolved);
  }
  return verified;
}

/**
 * Remove an LCIM-created disposable worktree. Fail-closed guarantees:
 * - the controller-retained worktreeId is REQUIRED; cleanup is identity-
 *   bound, never path-based (a path alone is never accepted);
 * - the id must have an open (CREATED, not yet REMOVED) registry lifecycle;
 * - the provided path (if any) must equal the canonical registered path;
 * - the main/parent worktree is never removed;
 * - no OTHER active registry record may claim the same path (stale
 *   ownership never removes a replacement);
 * - the path must still be registered with git and its HEAD must equal the
 *   registered base (current Git linked-worktree administrative identity);
 * - a dirty worktree (uncommitted worker changes) requires verified
 *   matching persisted evidence (see verifyDirtyCleanupEvidence);
 * - the controller-created ownership marker must exist inside the exact
 *   per-worktree Git admin directory and bind to every registered identity
 *   (worktreeId, workUnitId, base, canonical path, marker identity) — the
 *   independent proof that LCIM itself created this worktree
 *   (SOL-S03-FINAL-001);
 * - a worktree whose directory is already gone (SOL-S03-R3-001) is
 *   cleaned up ONLY after the exact per-worktree Git admin directory was
 *   derived from REPOSITORY-OWNED Git metadata and the genuine ownership
 *   marker was found inside it and bound to every registered identity —
 *   a missing directory never bypasses the ownership proof; when
 *   ownership cannot be proven, cleanup fails closed (no prune, no
 *   removal, no REMOVED, registry untouched);
 */
export function removeIsolatedWorktree({ repoDir, worktreeId, worktreeDir, evidenceRefs = [] }) {
  if (worktreeId === undefined || worktreeId === null) {
    throw new WorktreeSafetyError(
      'cleanup requires the controller-retained worktreeId; path-only cleanup is refused (worktree ownership is identity-bound)',
      { worktreeDir },
    );
  }
  const record = findCreatedWorktree(repoDir, worktreeId);
  if (!record) {
    throw new WorktreeSafetyError(
      `refusing to remove: worktreeId ${worktreeId} has no active (CREATED) LCIM registry record`,
      { worktreeId },
    );
  }
  const registeredPath = normalizePath(record.worktreePath);
  if (worktreeDir !== undefined && worktreeDir !== null) {
    if (normalizePath(worktreeDir) !== registeredPath) {
      throw new WorktreeSafetyError(
        `worktree path ${worktreeDir} does not match the registered path ${record.worktreePath} for worktreeId ${worktreeId}; refusing removal`,
        { worktreeDir, registeredPath: record.worktreePath, worktreeId },
      );
    }
  }
  worktreeDir = record.worktreePath;

  const mainTop = normalizePath(runGit(repoDir, ['rev-parse', '--show-toplevel']).stdout.trim());
  if (normalizePath(worktreeDir) === mainTop) {
    throw new WorktreeSafetyError('refusing to remove the main/parent worktree', { worktreeDir });
  }

  // Path contention: another active identity claiming the same path means a
  // stale lifecycle would remove a replacement — always refuse.
  const contenders = activeWorktreeRecords(repoDir).filter(
    (r) => r.worktreeId !== worktreeId && normalizePath(r.worktreePath) === registeredPath,
  );
  if (contenders.length > 0) {
    throw new WorktreeSafetyError(
      `worktree path ${registeredPath} is also claimed by active worktree ${contenders.map((c) => c.worktreeId).join(', ')}; stale ownership must never remove a replacement — refusing`,
      { worktreePath: registeredPath, worktreeId, contenders: contenders.map((c) => c.worktreeId) },
    );
  }

  if (!fs.existsSync(worktreeDir)) {
    // Directory already gone: the Git registration is stale (prune-eligible)
    // and a missing directory cannot contain uncommitted user work — but the
    // registry record, path, Git registration, and HEAD can ALL be
    // manufactured by a forged CREATED event. Genuine LCIM ownership MUST be
    // proven before ANY destructive Git cleanup or REMOVED append
    // (SOL-S03-R3-001): the exact per-worktree Git admin directory is
    // derived from REPOSITORY-OWNED Git metadata (porcelain registration +
    // <common>/worktrees/* enumeration, cross-checked via git-written
    // commondir/gitdir/HEAD files — never a registry-, worker-, or
    // caller-supplied path), and the controller-created ownership marker
    // must exist inside it and bind to every registered identity. If
    // ownership cannot be proven, cleanup FAILS CLOSED: no prune, no
    // removal, no REMOVED, no registry mutation.
    if (typeof record.markerId !== 'string' || !isValidOwnershipMarkerId(record.markerId)) {
      throw new WorktreeSafetyError(
        `refusing to remove: registry record for worktreeId ${worktreeId} carries no valid controller-created ownership marker identity; registry data alone never establishes LCIM ownership`,
        { worktreeId, worktreeDir },
      );
    }
    const verified = verifyWorktreeOwnershipMarkerFromGitMetadata({
      repoDir,
      worktreePath: worktreeDir,
      worktreeId,
      workUnitId: record.workUnitId,
      baseSha: record.baseSha,
      registeredPath: record.worktreePath,
      markerId: record.markerId,
    });
    // Scoped removal of the EXACT verified registration — never a global
    // `git worktree prune` that could also prune sibling registrations
    // (foreign or otherwise). `git worktree remove --force` removes the
    // stale administrative metadata of the vanished checkout directory
    // (ownership verified above).
    runGit(repoDir, ['worktree', 'remove', '--force', verified.canonicalPath]);
    recordWorktreeEvent({
      repoDir,
      worktreeId: record.worktreeId,
      workUnitId: record.workUnitId,
      worktreePath: worktreeDir,
      baseSha: record.baseSha,
      event: 'REMOVED',
      evidenceRefs,
      pruned: true,
      markerId: record.markerId,
    });
    return { removed: true, pruned: true, worktreeId: record.worktreeId };
  }

  // Still registered with git (current administrative identity)?
  const list = runGit(repoDir, ['worktree', 'list', '--porcelain']).stdout;
  const registeredPaths = list
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => normalizePath(line.slice('worktree '.length)));
  if (!registeredPaths.includes(normalizePath(worktreeDir))) {
    throw new WorktreeSafetyError(`worktree ${worktreeDir} is not registered with git; refusing to remove`, {
      worktreeDir,
    });
  }

  // Administrative identity must match the registered lifecycle: the
  // worktree HEAD must equal the registered base.
  const currentHead = resolveHeadSha(worktreeDir);
  if (currentHead !== record.baseSha) {
    throw new WorktreeSafetyError(
      `worktree ${worktreeDir} HEAD ${currentHead} does not match the registered base ${record.baseSha}; refusing removal`,
      { worktreeDir, currentHead, baseSha: record.baseSha },
    );
  }

  // Uncommitted worker changes are evidence: never destroy them before
  // matching persisted evidence was verified (identity-bound, not just
  // "any non-empty evidenceRefs").
  if (!isWorktreeClean(worktreeDir)) {
    verifyDirtyCleanupEvidence({ repoDir, worktreeId, registryRecord: record, evidenceRefs });
  }

  // GENUINE LCIM OWNERSHIP MARKER (SOL-S03-FINAL-001) — the final
  // independent ownership proof. The registry lifecycle, git registration,
  // canonical path, and matching detached HEAD/base can ALL be manufactured
  // from forged registry data; the controller-created marker inside THIS
  // exact worktree's per-worktree Git admin directory cannot. Registry
  // lifecycle and marker must AGREE on every identity before any
  // `git worktree remove` is invoked.
  if (typeof record.markerId !== 'string' || !isValidOwnershipMarkerId(record.markerId)) {
    throw new WorktreeSafetyError(
      `refusing to remove: registry record for worktreeId ${worktreeId} carries no valid controller-created ownership marker identity; registry data alone never establishes LCIM ownership`,
      { worktreeId, worktreeDir },
    );
  }
  verifyWorktreeOwnershipMarker({
    worktreeDir,
    repoDir,
    worktreeId,
    workUnitId: record.workUnitId,
    baseSha: record.baseSha,
    registeredPath: record.worktreePath,
    markerId: record.markerId,
  });

  runGit(repoDir, ['worktree', 'remove', '--force', worktreeDir]);
  recordWorktreeEvent({
    repoDir,
    worktreeId: record.worktreeId,
    workUnitId: record.workUnitId,
    worktreePath: worktreeDir,
    baseSha: record.baseSha,
    event: 'REMOVED',
    evidenceRefs,
    markerId: record.markerId,
  });
  return { removed: true, pruned: false, worktreeId: record.worktreeId };
}
