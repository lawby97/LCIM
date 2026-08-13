/**
 * LCIM V2 route decision vocabularies (Sprint 05).
 *
 * Sprint-owned controller vocabulary for deterministic routing. The same
 * values are inlined in `schemas/route-decision.v2.schema.json`; the schema
 * test enforces code/schema lockstep.
 *
 * - `ROUTE_DECISION` — what the controller does next for the work unit.
 * - `ROUTE_REASON_CODE` — the machine-readable reason recorded on every
 *   decision (audit requirement). STUCK criteria carry their own codes.
 * - `ESCALATION_BASIS` — the three locked justifications for MAX / Pro MAX
 *   escalation (DeepSeek policy): SOL-directed difficult repair, confirmed
 *   model-capability failure, or contract-locked unusually difficult
 *   implementation with an explicit recorded reason.
 */

/** Controller decisions emitted by the deterministic routing policy. */
export const ROUTE_DECISION = Object.freeze([
  'ROUTE_IMPLEMENT_FLASH',
  'ROUTE_IMPLEMENT_FLASH_MAX',
  'ROUTE_IMPLEMENT_PRO_MAX',
  'ROUTE_SOL_CONTRACT_CHECK',
  'ROUTE_SOL_DIAGNOSE',
  'ROUTE_SOL_FINAL_REVIEW',
  'ROUTE_SOL_RECHECK',
  'ROUTE_COMPLETE',
  'STOP_STUCK',
  'STOP_BUDGET',
  'FAIL_NO_SUBSTITUTE',
]);

/** Implementation decisions that dispatch a model (consume a budget call). */
export const IMPLEMENTATION_DECISIONS = Object.freeze([
  'ROUTE_IMPLEMENT_FLASH',
  'ROUTE_IMPLEMENT_FLASH_MAX',
  'ROUTE_IMPLEMENT_PRO_MAX',
]);

/** SOL role decisions (the ask compiler is Sprint 06; routing only pins roles). */
export const SOL_DECISIONS = Object.freeze([
  'ROUTE_SOL_CONTRACT_CHECK',
  'ROUTE_SOL_DIAGNOSE',
  'ROUTE_SOL_FINAL_REVIEW',
  'ROUTE_SOL_RECHECK',
]);

/** Terminal (stop/fail) decisions. */
export const STOP_DECISIONS = Object.freeze([
  'ROUTE_COMPLETE',
  'STOP_STUCK',
  'STOP_BUDGET',
  'FAIL_NO_SUBSTITUTE',
]);

/**
 * Machine-readable route reason codes. STUCK criteria codes are the
 * controller-owned STUCK criteria from the sprint (plus the bounded-repair
 * enforcement guard REPAIR_LIMIT_REACHED).
 */
export const ROUTE_REASON_CODE = Object.freeze([
  'NORMAL_BOUNDED_TASK',
  'RESULT_ACCEPTED',
  'REPAIR_TARGETED_FIRST',
  'MAX_JUSTIFIED',
  'PRO_MAX_ESCALATION',
  'SEMANTIC_REJECTION_ESCALATION',
  'UNRESOLVED_HIGH_RISK_CONTRACT',
  'SOL_RECHECK_AFTER_REPAIR',
  'SOL_FINAL_REVIEW',
  'EXACT_SUBSTITUTE_CONFIGURED',
  'CAPABILITY_FALLBACK_CONFIGURED',
  'CAPABILITY_GAP_NO_SUBSTITUTE',
  'PROVIDER_UNAVAILABLE',
  'BUDGET_EXHAUSTED',
  'SAME_AC_FAILED_AFTER_REPAIR',
  'SUBSTANTIVE_SEMANTIC_CONTRADICTION',
  'MODEL_ATTEMPTS_CONTRACT_CHANGE',
  'CONFLATES_DISTINCT_CONCEPTS',
  'NO_FALSIFIABLE_EXPLANATION',
  'SCOPE_BROADENS_WITHOUT_EVIDENCE',
  'SOL_FINDING_SURVIVES_ONE_REPAIR',
  'PROVIDER_LACKS_CAPABILITY',
  'REPAIR_LIMIT_REACHED',
]);

/** Reason codes that mean the controller-owned STUCK criteria fired. */
export const STUCK_REASON_CODES = Object.freeze([
  'SAME_AC_FAILED_AFTER_REPAIR',
  'SUBSTANTIVE_SEMANTIC_CONTRADICTION',
  'MODEL_ATTEMPTS_CONTRACT_CHANGE',
  'CONFLATES_DISTINCT_CONCEPTS',
  'NO_FALSIFIABLE_EXPLANATION',
  'SCOPE_BROADENS_WITHOUT_EVIDENCE',
  'SOL_FINDING_SURVIVES_ONE_REPAIR',
  'PROVIDER_LACKS_CAPABILITY',
  'REPAIR_LIMIT_REACHED',
]);

/** @param {string} code */
export function isStuckReasonCode(code) {
  return STUCK_REASON_CODES.includes(code);
}

/**
 * The three locked escalation justifications (machine-readable). Any MAX or
 * Pro MAX route must carry one of these as `escalationJustification.basis`.
 */
export const ESCALATION_BASIS = Object.freeze([
  'SOL_DIRECTED_REPAIR',
  'CONFIRMED_CAPABILITY_FAILURE',
  'CONTRACT_LOCKED_DIFFICULT_TASK',
]);

/** Bases permitted for DeepSeek Pro MAX (escalation-only rung). */
export const PRO_MAX_BASES = Object.freeze([
  'SOL_DIRECTED_REPAIR',
  'CONFIRMED_CAPABILITY_FAILURE',
  'CONTRACT_LOCKED_DIFFICULT_TASK',
]);

/** Bases permitted for Flash MAX (same ladder, higher reasoning, justified). */
export const FLASH_MAX_BASES = Object.freeze(['CONTRACT_LOCKED_DIFFICULT_TASK']);

/** @param {string} basis */
export function isValidEscalationBasis(basis) {
  return ESCALATION_BASIS.includes(basis);
}

/**
 * Controller-owned origin of a SOL finding (provenance, SOL-S05-001).
 *
 * A SOL recheck is a distinct role that may originate from diagnose or
 * ordinary repair paths as well as from the mandatory HIGH_RISK SOL
 * FINAL_REVIEW. HIGH_RISK completion from a recheck PASS therefore requires
 * explicit controller-owned provenance that the recheck is rechecking a
 * finding produced by a prior FINAL_REVIEW. Finding records in
 * `ctx.solFindings` carry `origin`; anything other than 'FINAL_REVIEW'
 * (or a missing/invalid origin) can never prove final-review satisfaction.
 */
export const SOL_FINDING_ORIGIN = Object.freeze(['FINAL_REVIEW', 'DIAGNOSE']);

/** @param {string} origin */
export function isValidSolFindingOrigin(origin) {
  return SOL_FINDING_ORIGIN.includes(origin);
}
