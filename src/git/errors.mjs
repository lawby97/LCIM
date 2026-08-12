/**
 * Sprint 03 error taxonomy (git/worktree/base/scope/evidence).
 *
 * These classes extend the shared `LcimError` base (Sprint 00) so they flow
 * through the shared `errorPayload()`/`toErrorRecord()` machinery, but they
 * are Sprint-03-owned: the shared `src/shared/errors.mjs` file is untouched.
 *
 * Codes are distinct from the shared rejection taxonomy on purpose:
 * REJECTION_CODE is the controller's disposition vocabulary (Sprint 00),
 * while these codes describe the deterministic git-safety violation that
 * *justifies* a rejection. A controller maps e.g. `BASE_MISMATCH` ->
 * rejection `WRONG_BASE`, `SCOPE_VIOLATION` -> rejection `SCOPE_VIOLATION`.
 */

import { LcimError } from '../shared/errors.mjs';

/** A git command failed (non-zero exit or spawn failure). */
export class GitOperationError extends LcimError {
  constructor(message, details = null) {
    super(message, 'GIT_OPERATION_FAILED', details);
  }
}

/** Expected base SHA does not match the observed state at a checkpoint. */
export class BaseMismatchError extends LcimError {
  constructor(message, details = null) {
    super(message, 'BASE_MISMATCH', details);
  }
}

/** observed_changed_paths ⊄ allowed_write_paths or must-change missing. */
export class ScopeViolationError extends LcimError {
  constructor(message, details = null) {
    super(message, 'SCOPE_VIOLATION', details);
  }
}

/** A path string cannot be used as a scope/evidence path (unsafe form). */
export class PathSafetyError extends LcimError {
  constructor(message, details = null) {
    super(message, 'PATH_SAFETY_VIOLATION', details);
  }
}

/** Worktree isolation/cleanup/prohibition violation. */
export class WorktreeSafetyError extends LcimError {
  constructor(message, details = null) {
    super(message, 'WORKTREE_SAFETY_VIOLATION', details);
  }
}

/** Patch evidence could not be produced/stamped/stored or failed validation. */
export class EvidenceError extends LcimError {
  constructor(message, details = null) {
    super(message, 'EVIDENCE_INVALID', details);
  }
}
