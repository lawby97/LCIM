/**
 * LCIM V2 shared enums (Sprint 00).
 *
 * These are the canonical, frozen state vocabularies. The same values are
 * snapshotted in `schemas/common/common-enums.v2.schema.json` and inline in
 * each record schema; tests enforce that code and schemas cannot drift.
 *
 * State separation (locked V2 principle 5):
 * - WORKER_STATUS is the only vocabulary a worker may report (Sprint 02).
 *   It must NEVER contain `PATCH_READY` or any controller disposition.
 * - CONTROLLER_DISPOSITION is decided only by the controller. The four
 *   controller-only dispositions are listed in CONTROLLER_ONLY_DISPOSITIONS.
 */

import { ConfigError } from './errors.mjs';

/** Model-owned worker report status (Sprint 02 owns the worker contract). */
export const WORKER_STATUS = Object.freeze(['WORK_COMPLETE', 'BLOCKED', 'FAILED', 'NO_CHANGE']);

/** Controller-owned disposition of a work unit / candidate patch. */
export const CONTROLLER_DISPOSITION = Object.freeze([
  'PATCH_VALID',
  'SEMANTICALLY_ACCEPTED',
  'CANDIDATE_INTEGRATED',
  'REVIEW_APPROVED',
  'REJECTED',
  'REVIEW_REQUIRED',
]);

/** Dispositions only the controller may decide (never reported by a worker). */
export const CONTROLLER_ONLY_DISPOSITIONS = Object.freeze([
  'PATCH_VALID',
  'SEMANTICALLY_ACCEPTED',
  'CANDIDATE_INTEGRATED',
  'REVIEW_APPROVED',
]);

/** Run lifecycle state (Sprint 01 owns the run store; this is the shared vocabulary). */
export const RUN_STATUS = Object.freeze(['OPEN', 'COMPLETED', 'INCOMPLETE_LEDGER', 'ABORTED']);

/** Canonical invocation lifecycle event kinds (Sprint 01 owns the ledger). */
export const INVOCATION_EVENT_KIND = Object.freeze([
  'START',
  'COMPLETION',
  'ASSESSMENT',
  'RECONCILIATION',
]);

/** Controller-side work-unit lifecycle. */
export const WORK_UNIT_STATUS = Object.freeze([
  'CREATED',
  'IN_PROGRESS',
  'BLOCKED',
  'COMPLETED',
  'FAILED',
]);

/** Review finding severity (Sprint 06/08 own the ask compiler and audit). */
export const REVIEW_FINDING_SEVERITY = Object.freeze(['INFO', 'WARNING', 'CRITICAL']);

/**
 * Rejection taxonomy: controller-owned reasons a work unit/result/ask was
 * rejected. Each entry maps to a V1 failure class (see docs/v1-characterization.md).
 */
export const REJECTION_CODE = Object.freeze([
  'TRANSPORT_MALFORMED',
  'SCHEMA_MISMATCH',
  'SEMANTIC_CONFLATION',
  'WRONG_BASE',
  'SCOPE_VIOLATION',
  'UNRESOLVED_SEMANTICS',
  'UNSUPPORTED_CLAIM',
  'INCOMPLETE_LEDGER',
  'BUDGET_EXHAUSTED',
  'SECRET_DENIED_PATH',
  'SOL_ASK_INVALID',
]);

/** Registry used by schema tests to keep code and schemas in lockstep. */
export const ENUM_REGISTRY = Object.freeze({
  workerStatus: WORKER_STATUS,
  controllerDisposition: CONTROLLER_DISPOSITION,
  runStatus: RUN_STATUS,
  invocationEventKind: INVOCATION_EVENT_KIND,
  workUnitStatus: WORK_UNIT_STATUS,
  reviewFindingSeverity: REVIEW_FINDING_SEVERITY,
  rejectionCode: REJECTION_CODE,
});

export function isValidEnum(kind, value) {
  const values = ENUM_REGISTRY[kind];
  return values !== undefined && values.includes(value);
}

export function assertEnum(kind, value) {
  if (!isValidEnum(kind, value)) {
    throw new ConfigError(
      `invalid ${kind}: ${JSON.stringify(value)} (expected one of ${ENUM_REGISTRY[kind]?.join(', ') ?? '<unknown>'})`,
    );
  }
}
