/**
 * LCIM V2 SOL call-type vocabulary (Sprint 06).
 *
 * SOL is a precise decision engine, not a generic reviewer. Every SOL call
 * is one of four call types; each type has exactly one primary decision
 * question, an explicit pass/fail condition, a per-type verdict
 * vocabulary, a required response shape, and exactly one per-type block in
 * the compiled ask.
 *
 * - SOL_CONTRACT_CHECK — asks ONLY whether the exact semantics of the
 *   referenced contract(s) are sufficiently specified; returns exact
 *   amendments when they are not. Never a general review.
 * - SOL_DIAGNOSE — asks why ONE specific acceptance criterion (a
 *   sideEffectId of the authoritative semantic contract) fails; returns
 *   root cause / evidence / smallest safe repair / must-change /
 *   must-not-change / exact tests / falsification, compiling
 *   deterministically into the Sprint-04 repair contract.
 * - SOL_FINAL_REVIEW — compiles a NAMED high-risk invariant checklist
 *   (named invariants instead of open-ended review). At most one adjacent
 *   critical defect outside the checklist is allowed, only when directly
 *   evidenced and violating a locked requirement.
 * - SOL_RECHECK — delta-only around ONE prior finding plus explicitly
 *   named neighboring invariants; never reopens the entire task.
 */

import { ConfigError } from '../../shared/errors.mjs';

/** The four SOL call types. */
export const SOL_CALL_TYPES = Object.freeze([
  'SOL_CONTRACT_CHECK',
  'SOL_DIAGNOSE',
  'SOL_FINAL_REVIEW',
  'SOL_RECHECK',
]);

/** Per-type verdict vocabulary a response must use. */
export const SOL_VERDICTS = Object.freeze({
  SOL_CONTRACT_CHECK: Object.freeze(['SUFFICIENTLY_SPECIFIED', 'AMENDMENTS_REQUIRED']),
  SOL_DIAGNOSE: Object.freeze(['CAUSE_IDENTIFIED', 'CAUSE_UNRESOLVED']),
  SOL_FINAL_REVIEW: Object.freeze(['PASS', 'FAIL']),
  SOL_RECHECK: Object.freeze(['RESOLVED', 'NOT_RESOLVED']),
});

/** Per-type default required response shape (verdicts + decision fields). */
export const SOL_RESPONSE_SHAPES = Object.freeze({
  SOL_CONTRACT_CHECK: Object.freeze({
    verdicts: Object.freeze(['SUFFICIENTLY_SPECIFIED', 'AMENDMENTS_REQUIRED']),
    fields: Object.freeze(['verdict', 'decisionSummary', 'amendment.exactAmendments']),
  }),
  SOL_DIAGNOSE: Object.freeze({
    verdicts: Object.freeze(['CAUSE_IDENTIFIED', 'CAUSE_UNRESOLVED']),
    fields: Object.freeze([
      'verdict',
      'decisionSummary',
      'failure.rootCause',
      'failure.evidenceRefs',
      'failure.repair',
      'failure.falsification',
    ]),
  }),
  SOL_FINAL_REVIEW: Object.freeze({
    verdicts: Object.freeze(['PASS', 'FAIL']),
    fields: Object.freeze(['verdict', 'decisionSummary', 'findings', 'adjacentCriticalDefects']),
  }),
  SOL_RECHECK: Object.freeze({
    verdicts: Object.freeze(['RESOLVED', 'NOT_RESOLVED']),
    fields: Object.freeze(['verdict', 'decisionSummary', 'findings']),
  }),
});

/** Default repair constraints for every compiled ask. */
export const SOL_REPAIR_CONSTRAINTS = Object.freeze({
  maxMustChangeTargets: 1,
  mustNotChangeRequired: true,
  boundedToRejectedAcceptance: true,
});

/**
 * The single per-type block key a compiled ask must carry for its call
 * type (and must NOT carry for any other type).
 */
export const SOL_CALL_TYPE_BLOCKS = Object.freeze({
  SOL_CONTRACT_CHECK: 'contractCheck',
  SOL_DIAGNOSE: 'diagnose',
  SOL_FINAL_REVIEW: 'finalReview',
  SOL_RECHECK: 'recheck',
});

/** FINAL_REVIEW allows at most one adjacent critical defect outside the checklist. */
export const MAX_ADJACENT_CRITICAL_DEFECTS = 1;

/** @param {string} callType */
export function isValidSolCallType(callType) {
  return SOL_CALL_TYPES.includes(callType);
}

/** @param {string} callType */
export function assertSolCallType(callType) {
  if (!isValidSolCallType(callType)) {
    throw new ConfigError(
      `invalid SOL call type: ${JSON.stringify(callType)} (expected one of ${SOL_CALL_TYPES.join(', ')})`,
    );
  }
}

/** @param {string} callType */
export function solVerdictsFor(callType) {
  assertSolCallType(callType);
  return SOL_VERDICTS[callType];
}

/** @param {string} callType */
export function solResponseShapeFor(callType) {
  assertSolCallType(callType);
  return SOL_RESPONSE_SHAPES[callType];
}

/** @param {string} callType */
export function solTypeBlockFor(callType) {
  assertSolCallType(callType);
  return SOL_CALL_TYPE_BLOCKS[callType];
}

/** @param {string} callType */
export function isValidSolVerdict(callType, verdict) {
  return SOL_VERDICTS[callType]?.includes(verdict) ?? false;
}
