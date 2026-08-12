/**
 * Sprint 03 git-safety controller pipeline.
 *
 * Composes the deterministic controller-owned responsibilities for one work
 * unit's git lifecycle. This is NOT the orchestrator and NOT routing/SOL:
 * no model output is parsed, no disposition is decided, nothing is committed
 * or integrated. The pipeline returns objective evidence and fails closed at
 * every boundary:
 *
 *   prepareWorkerWorktree()       PRE_SPAWN base validation + detached
 *                                 worktree creation + controller snapshots
 *   inspectWorkerExit()           POST_EXIT base validation + worker-safety
 *                                 detection (refs/reflog/config/remotes/
 *                                 parent preservation)
 *   collectAndPersistEvidence()   PRE_EXTRACT base validation + scope rule
 *                                 + patch evidence collection/persistence
 *                                 (evidence persists BEFORE a scope
 *                                 violation is raised, so the rejection
 *                                 itself is evidence-backed)
 *   validateIntegrationHandoff()  PRE_INTEGRATION base validation (parent
 *                                 HEAD + worktree HEAD == expected base)
 *   cleanupWorkerWorktree()       registry-verified removal AFTER evidence
 *                                 was persisted; never touches user work
 */

import { validateBaseAtCheckpoint } from '../validation/git/base.mjs';
import { checkWorkerSafety } from '../validation/git/safety.mjs';
import { validateScope } from '../validation/git/scope.mjs';
import { createIsolatedWorktree, removeIsolatedWorktree } from './worktree.mjs';
import { collectPatchEvidence } from '../evidence/patch/collector.mjs';
import { persistPatchEvidence } from '../evidence/patch/store.mjs';
import { ScopeViolationError } from './errors.mjs';

/**
 * PRE_SPAWN: validate the base and create the isolated detached worktree.
 * Returns the context (worktreeDir, snapshots) consumed by every later step.
 */
export function prepareWorkerWorktree(args) {
  return createIsolatedWorktree(args);
}

/**
 * POST_EXIT: validate the base and the worker-safety surface after the
 * worker exits. Throws BaseMismatchError / WorktreeSafetyError on the first
 * violation (fail closed).
 */
export function inspectWorkerExit({ repoDir, worktreeDir, expectedBaseSha, snapshot }) {
  validateBaseAtCheckpoint({ repoDir, worktreeDir, expectedBaseSha, checkpoint: 'POST_EXIT' });
  const safety = checkWorkerSafety({ repoDir, worktreeDir, expectedBaseSha, snapshot });
  return { baseOk: true, safety };
}

/**
 * PRE_EXTRACT: validate the base, collect controller-owned patch evidence,
 * enforce the write-scope rule (observed ⊆ allowed, plus optional
 * must-change), and persist the evidence BEFORE any scope violation is
 * raised. The returned record is stamped/frozen.
 *
 * allowedWritePaths is REQUIRED and controller-owned: omission, null, or a
 * non-array value fails closed (the evidence is still persisted first, so
 * the rejection is evidence-backed). Exact normalized path set inclusion
 * only — no prefix/glob/directory semantics.
 */
export function collectAndPersistEvidence({
  repoDir,
  worktreeDir,
  expectedBaseSha,
  workUnitId,
  worktreeId,
  allowedWritePaths,
  mustChangePaths = [],
  validationResults,
}) {
  validateBaseAtCheckpoint({ repoDir, worktreeDir, expectedBaseSha, checkpoint: 'PRE_EXTRACT' });
  const { record, patchText } = collectPatchEvidence({
    worktreeDir,
    expectedBaseSha,
    workUnitId,
    worktreeId,
    validationResults,
  });
  const { recordPath, patchPath, evidenceId } = persistPatchEvidence({ repoDir, record, patchText });

  let scope;
  try {
    if (!Array.isArray(allowedWritePaths)) {
      throw new ScopeViolationError(
        'allowedWritePaths is a required controller-owned array of repository-relative paths; cannot validate write scope without an allow-list (fail closed)',
        { allowedWritePaths },
      );
    }
    scope = validateScope({
      changedPaths: record.changedPaths,
      allowedWritePaths,
      mustChangePaths,
    });
  } catch (scopeViolation) {
    // Evidence was persisted FIRST; the controller rejects with the record
    // identity as the evidence ref. Fail closed.
    scopeViolation.details = {
      ...(scopeViolation.details ?? {}),
      recordPath,
      patchPath,
      patchId: record.patchId,
      evidenceId,
    };
    throw scopeViolation;
  }
  return { record, patchText, recordPath, patchPath, evidenceId, scope: scope ?? { ok: true } };
}

/**
 * PRE_INTEGRATION: both the integration target (parent) HEAD and the worker
 * worktree HEAD must equal the expected serial base.
 */
export function validateIntegrationHandoff({ repoDir, worktreeDir, expectedBaseSha }) {
  return validateBaseAtCheckpoint({ repoDir, worktreeDir, expectedBaseSha, checkpoint: 'PRE_INTEGRATION' });
}

/**
 * Registry-verified cleanup of the disposable worker worktree, after patch
 * evidence was persisted. The controller-retained worktreeId is REQUIRED
 * (cleanup is identity-bound; path-only cleanup is refused) — see
 * removeIsolatedWorktree for the fail-closed guards (LCIM-created only,
 * never the main worktree, never a dirty worktree without verified matching
 * persisted evidence).
 */
export function cleanupWorkerWorktree({ repoDir, worktreeId, worktreeDir, evidenceRefs = [] }) {
  return removeIsolatedWorktree({ repoDir, worktreeId, worktreeDir, evidenceRefs });
}
