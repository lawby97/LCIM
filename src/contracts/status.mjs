/**
 * LCIM V2 semantic contract compile status (Sprint 04).
 *
 * The compiler NEVER invents authoritative semantics. When unresolved
 * semantics remain, the contract carries them verbatim and the compile
 * status reflects whether the contract may be used:
 *
 * - `COMPILED` — every unresolved semantics entry is LOW_RISK (safe
 *   low-risk omission: recorded, never invented, does not block).
 * - `CONTRACT_REVIEW_REQUIRED` — at least one unresolved semantics entry
 *   is in a HIGH_RISK_CLASS. The contract is surfaced for review; it must
 *   never be handed to a worker as if authoritative. This is the contract-
 *   document counterpart of the shared `REVIEW_REQUIRED` disposition /
 *   `UNRESOLVED_SEMANTICS` rejection code (Sprint 00 vocabulary is not
 *   modified).
 */

import { HIGH_RISK_CLASSES, isHighRiskClass } from '../risk/classes.mjs';

export const CONTRACT_COMPILE_STATUS = Object.freeze(['COMPILED', 'CONTRACT_REVIEW_REQUIRED']);

/**
 * Compute the compile status for a list of unresolved-semantics entries.
 * High-risk unresolved semantics => CONTRACT_REVIEW_REQUIRED.
 * @param {Array<{riskClass: string}>} unresolvedSemantics
 * @returns {'COMPILED'|'CONTRACT_REVIEW_REQUIRED'}
 */
export function computeCompileStatus(unresolvedSemantics) {
  const entries = Array.isArray(unresolvedSemantics) ? unresolvedSemantics : [];
  const highRisk = entries.filter((u) => isHighRiskClass(u?.riskClass));
  return highRisk.length > 0 ? 'CONTRACT_REVIEW_REQUIRED' : 'COMPILED';
}

/** Human-readable reason for a review-required status (for renderers). */
export function reviewRequiredReason(unresolvedSemantics) {
  const highRisk = (Array.isArray(unresolvedSemantics) ? unresolvedSemantics : []).filter(
    (u) => isHighRiskClass(u?.riskClass),
  );
  if (highRisk.length === 0) return null;
  return `unresolved semantics in high-risk class(es): ${[...new Set(highRisk.map((u) => u.riskClass))].join(', ')}`;
}

export { HIGH_RISK_CLASSES };
