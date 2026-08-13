/**
 * LCIM V2 controller-owned STUCK criteria (Sprint 05).
 *
 * The eight mandated STUCK criteria, evaluated deterministically from
 * structured evidence. Two criteria are DERIVED from objective history:
 * - SAME_AC_FAILED_AFTER_REPAIR — one targeted repair was already
 *   dispatched and the same acceptance reference fails again (a ref that
 *   appears in two or more failures);
 * - SOL_FINDING_SURVIVES_ONE_REPAIR — an open SOL finding has already been
 *   through one repair AND one recheck and is still open.
 *
 * The remaining criteria consume explicit structured controller
 * observations (the controller builds them from objective evidence —
 * worker results, patch/AC analysis, capability records). Evaluation is a
 * pure, deterministic function: same evidence in, same triggers out.
 *
 * When a criterion fires, the routing policy stops the unit STUCK with the
 * criterion's reason code. STUCK is a hard stop: it never silently retries
 * and never downgrades.
 */

import { STUCK_REASON_CODES } from './reasons.mjs';

/** Controller-owned STUCK criteria (order is the evaluation order). */
export const STUCK_CRITERIA = Object.freeze([
  {
    code: 'SAME_AC_FAILED_AFTER_REPAIR',
    description:
      'the same acceptance criterion fails after one targeted repair (derived from failure history)',
  },
  {
    code: 'SUBSTANTIVE_SEMANTIC_CONTRADICTION',
    description:
      'the model result substantively contradicts established facts in the semantic contract',
  },
  {
    code: 'MODEL_ATTEMPTS_CONTRACT_CHANGE',
    description: 'the model tries to change the contract instead of implementing against it',
  },
  {
    code: 'CONFLATES_DISTINCT_CONCEPTS',
    description:
      'the model conflates explicitly distinct concepts (must_not_conflate pairs)',
  },
  {
    code: 'NO_FALSIFIABLE_EXPLANATION',
    description: 'the model cannot form a falsifiable explanation for its claim or failure',
  },
  {
    code: 'SCOPE_BROADENS_WITHOUT_EVIDENCE',
    description: 'the work scope broadens without new evidence',
  },
  {
    code: 'SOL_FINDING_SURVIVES_ONE_REPAIR',
    description:
      'a SOL finding survives one targeted repair and its recheck (derived from SOL finding history)',
  },
  {
    code: 'PROVIDER_LACKS_CAPABILITY',
    description: 'the provider/model lacks the required capability (no silent substitution)',
  },
]);

function latestFailureHistory(ctx) {
  return Array.isArray(ctx.failureHistory) ? ctx.failureHistory : [];
}

/** A ref shared by two or more failures means the same AC failed again after a repair. */
function deriveSameAcFailedAfterRepair(ctx) {
  const history = latestFailureHistory(ctx);
  if (history.length < 2) return false;
  const seen = new Map();
  for (const failure of history) {
    const refs = Array.isArray(failure?.rejectedAcceptanceRefs) ? failure.rejectedAcceptanceRefs : [];
    for (const ref of refs) {
      seen.set(ref, (seen.get(ref) ?? 0) + 1);
    }
  }
  return [...seen.values()].some((count) => count >= 2);
}

/** An open SOL finding that already went through one repair and one recheck survived it. */
function deriveSolFindingSurvivedOneRepair(ctx) {
  const findings = Array.isArray(ctx.solFindings) ? ctx.solFindings : [];
  return findings.some(
    (f) => f?.status === 'OPEN' && Number.isInteger(f.repairCycles) && f.repairCycles >= 1 && Number.isInteger(f.rechecks) && f.rechecks >= 1,
  );
}

/**
 * Evaluate the controller-owned STUCK criteria against structured context.
 *
 * @param {object} ctx - { failureHistory, solFindings, stuckEvidence }
 *   stuckEvidence is a plain object of boolean controller observations:
 *   semanticContradiction, contractChangeAttempt, conflation,
 *   lacksFalsifiableExplanation, scopeBroadenedWithoutEvidence,
 *   providerLacksCapability.
 * @returns {string[]} triggered STUCK reason codes, in STUCK_CRITERIA order.
 */
export function evaluateStuckCriteria(ctx) {
  const evidence = ctx?.stuckEvidence ?? {};
  const observations = [
    evidence.semanticContradiction === true,
    evidence.contractChangeAttempt === true,
    evidence.conflation === true,
    evidence.lacksFalsifiableExplanation === true,
    evidence.scopeBroadenedWithoutEvidence === true,
    evidence.providerLacksCapability === true,
  ];
  const derived = [
    deriveSameAcFailedAfterRepair(ctx),
    deriveSolFindingSurvivedOneRepair(ctx),
  ];
  const flags = [derived[0], ...observations.slice(0, 5), derived[1], observations[5]];
  return STUCK_CRITERIA.filter((c, i) => flags[i] === true).map((c) => c.code);
}
