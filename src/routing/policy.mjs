/**
 * LCIM V2 deterministic routing policy (Sprint 05).
 *
 * `decideRoute(ctx)` is the controller-owned, deterministic routing
 * decision: ordinary work never spends SOL tokens deciding what model to
 * use, while semantic rejection escalates promptly instead of wasting
 * equivalent retries. It returns a frozen, validated `lcim.route-decision`
 * record (reason code + budgets for audit).
 *
 * Precedence (hard controller facts are never bypassed by earlier
 * acceptance/escalation branches; where a combination is contradictory the
 * policy FAILS CLOSED instead of defaulting):
 *   1. exhausted budget                          -> STOP_BUDGET
 *   2. validated CONTRACT_REVIEW_REQUIRED        -> ROUTE_SOL_CONTRACT_CHECK
 *   3. hard STUCK                                -> STOP_STUCK
 *   4. required SOL recheck (finding after one
 *      repair, no recheck yet)                   -> ROUTE_SOL_RECHECK
 *   5. semantic rejection                        -> ROUTE_SOL_DIAGNOSE
 *   6. required HIGH_RISK final review           -> ROUTE_SOL_FINAL_REVIEW
 *      (accepted high-risk result whose final review is not PROVEN by
 *      state in the SOL-review flow + a PASSED solReview outcome)
 *   7. explicit escalation (Pro MAX / Flash MAX) -> ROUTE_IMPLEMENT_*
 *   8. SOL outcome states (review verdicts,
 *      resolved contract check / diagnosis)      -> complete / bounded
 *      repair / implementation (SOL-S05-005)
 *   9. failure handling: first credible failure  -> one bounded Flash
 *      repair; Pro MAX failure or no falsifiable
 *      hypothesis                                 -> STOP_STUCK
 *  10. default bounded route                     -> ROUTE_IMPLEMENT_FLASH
 *      (DeepSeek V4 Flash xhigh through Pi)
 *
 * Semantic-contract authority (SOL-S05-004): when a semanticContract is
 * supplied it is ALWAYS validated with the Sprint-04 validator
 * (`validateSemanticContract`) and compileStatus/riskClass are derived only
 * from the validated document — never from shallow caller copies. A
 * malformed/semantically-invalid contract fails closed (RoutingError). A
 * caller-supplied `contractReviewRequired` may act as the explicit
 * controller fact ONLY when no semanticContract is supplied; with a
 * contract, a contradictory flag fails closed.
 *
 * SOL discovery (SOL-S05-003): every automatic ROUTE_SOL_* decision first
 * resolves exact sol-xhigh availability/capability via `discoverSolRoute`
 * (provider sol, model sol-xhigh, XHIGH, role). Unavailable/invalid fails
 * closed with FAIL_NO_SUBSTITUTE — never a silent substitute, never a
 * downgrade.
 *
 * Implementation discovery is exact (src/providers/capabilities/discovery.mjs):
 * a missing endpoint/model yields FAIL_NO_SUBSTITUTE, never a silent
 * substitute; escalation-only models (deepseek-pro-max) can never appear as
 * ordinary exact substitutes or optional fallbacks (SOL-S05-002).
 *
 * Every returned decision is stamped against
 * `schemas/route-decision.v2.schema.json` and its conditional rules; the
 * state machine transition (state -> nextState) is validated via
 * nextState() and an undefined transition throws RouteStateError
 * (fail closed).
 */

import { isHighRiskClass } from '../risk/classes.mjs';
import { ConfigError } from '../shared/errors.mjs';
import { RoutingError, RouteStateError, ProviderDiscoveryError, SolCommandMasqueradeError } from './errors.mjs';
import { generateRouteDecisionId } from './ids.mjs';
import { nextState, isTerminalState } from './state.mjs';
import { evaluateStuckCriteria } from './stuck.mjs';
import { PRO_MAX_BASES, isValidEscalationBasis } from './reasons.mjs';
import { stampRouteDecision } from './registry.mjs';
import {
  resolveImplementationModel,
  assertNoDowngrade,
  discoverSolRoute,
  discoverSolCodexRoute,
  resolveSolChannel,
} from '../providers/capabilities/discovery.mjs';
import { CODEX_SOL_MODEL, CLASSIC_SOL_MODEL } from '../providers/capabilities/metadata.mjs';
import { assertCodexOAuthAvailable } from '../providers/oauth.mjs';
import { isSolFixtureRoutingConfig } from '../controller/test-seams.mjs';
import { validateSemanticContract } from '../contracts/validate.mjs';
import { computeCompileStatus } from '../contracts/status.mjs';

/**
 * Rejection codes that are SEMANTIC: they escalate immediately to SOL
 * diagnose instead of equivalent DeepSeek retries (requirement: semantic
 * rejection may escalate immediately).
 */
export const SEMANTIC_REJECTION_CODES = Object.freeze([
  'SEMANTIC_CONFLATION',
  'UNRESOLVED_SEMANTICS',
  'UNSUPPORTED_CLAIM',
]);

/** SOL role targets for route decisions (2.1: the strict Codex transport gate only). */
const SOL_TARGETS = Object.freeze({
  'ROUTE_SOL_CONTRACT_CHECK': { model: CODEX_SOL_MODEL, role: 'SOL_CONTRACT_CHECK', provider: 'pi' },
  'ROUTE_SOL_DIAGNOSE': { model: CODEX_SOL_MODEL, role: 'SOL_DIAGNOSE', provider: 'pi' },
  'ROUTE_SOL_FINAL_REVIEW': { model: CODEX_SOL_MODEL, role: 'SOL_FINAL_REVIEW', provider: 'pi' },
  'ROUTE_SOL_RECHECK': { model: CODEX_SOL_MODEL, role: 'SOL_RECHECK', provider: 'pi' },
});

/** States in which the SOL final-review/recheck outcome is the only decision input. */
const SOL_REVIEW_STATES = Object.freeze(['AWAITING_SOL_FINAL_REVIEW', 'AWAITING_SOL_RECHECK']);

function assertCtx(ctx) {
  if (ctx === null || typeof ctx !== 'object' || Array.isArray(ctx)) {
    throw new ConfigError('decideRoute requires a plain context object');
  }
  if (typeof ctx.workUnitId !== 'string' || ctx.workUnitId.length === 0) {
    throw new ConfigError('decideRoute requires a non-empty workUnitId');
  }
  if (typeof ctx.state !== 'string' || ctx.state.length === 0) {
    throw new ConfigError('decideRoute requires a state (ESCALATION_STATE)');
  }
  if (ctx.budget === null || typeof ctx.budget !== 'object' || typeof ctx.budget.snapshot !== 'function') {
    throw new ConfigError('decideRoute requires a budget tracker (createBudgetTracker)');
  }
}

/**
 * Validate a supplied semantic contract with the Sprint-04 validator and
 * derive routing facts ONLY from the validated document (SOL-S05-004).
 * Never mutates or repairs the document. Throws RoutingError when the
 * supplied contract is malformed/semantically invalid or when an explicit
 * contractReviewRequired flag contradicts the validated content.
 *
 * @returns {{ contract: object|null, reviewRequired: boolean, highRisk: boolean }}
 */
function resolveContractFacts(ctx) {
  const hasContract = ctx.semanticContract !== null && ctx.semanticContract !== undefined;
  if (!hasContract) {
    return {
      contract: null,
      reviewRequired: ctx.contractReviewRequired === true,
      highRisk: false,
    };
  }
  const result = validateSemanticContract(ctx.semanticContract);
  if (!result.valid) {
    throw new RoutingError(
      `supplied semantic contract failed Sprint-04 validation: ${result.errors
        .map((e) => `${e.path || '(root)'}: ${e.message}`)
        .join('; ')}`,
      {
        contractKey: ctx.semanticContract.contractKey ?? null,
        errors: result.errors,
      },
    );
  }
  const doc = ctx.semanticContract; // validated; never mutated or repaired
  // Derive status from validated content only — never a shallow caller copy
  // of compileStatus/riskClass.
  const reviewRequired =
    computeCompileStatus(doc.unresolvedSemantics ?? []) === 'CONTRACT_REVIEW_REQUIRED';
  if (ctx.contractReviewRequired !== undefined && ctx.contractReviewRequired !== reviewRequired) {
    throw new RoutingError(
      `contractReviewRequired=${String(ctx.contractReviewRequired)} contradicts the validated semantic contract '${doc.contractKey}' (status derived from validated content: ${reviewRequired ? 'CONTRACT_REVIEW_REQUIRED' : 'COMPILED'})`,
      {
        contractKey: doc.contractKey,
        contractReviewRequired: ctx.contractReviewRequired,
        derivedStatus: reviewRequired ? 'CONTRACT_REVIEW_REQUIRED' : 'COMPILED',
      },
    );
  }
  return { contract: doc, reviewRequired, highRisk: isHighRiskClass(doc.riskClass) };
}

function contractCauseRefs(ctx) {
  const refs = [];
  if (ctx.semanticContract?.contractKey) refs.push(`contract:${ctx.semanticContract.contractKey}`);
  return refs;
}

function isOpenFindingRecheckDue(ctx) {
  const findings = Array.isArray(ctx.solFindings) ? ctx.solFindings : [];
  const selected = typeof ctx.activeFindingId === 'string'
    ? findings.find((finding) => finding?.findingId === ctx.activeFindingId)
    : null;
  const candidates = selected === undefined || selected === null ? findings : [selected];
  return candidates.find(
    (f) =>
      f?.status === 'OPEN' &&
      Number.isInteger(f.repairCycles) &&
      f.repairCycles >= 1 &&
      Number.isInteger(f.rechecks) &&
      f.rechecks === 0,
  );
}

function openAuthoritativeFindings(ctx) {
  return (Array.isArray(ctx.solFindings) ? ctx.solFindings : [])
    .filter((finding) => finding?.status === 'OPEN');
}

function failNoSubstituteDecision(ctx, err) {
  const reason = err instanceof ProviderDiscoveryError ? (err.details?.reason ?? null) : null;
  if (reason === 'ENDPOINT_NOT_CONFIGURED' || reason === 'CODEX_OAUTH_UNAVAILABLE') {
    return emit(ctx, {
      decision: 'FAIL_NO_SUBSTITUTE',
      reasonCode: reason === 'CODEX_OAUTH_UNAVAILABLE' ? 'CODEX_OAUTH_UNAVAILABLE' : 'PROVIDER_UNAVAILABLE',
      event: 'PROVIDER_UNAVAILABLE',
      causeRefs: [
        ...(reason === 'CODEX_OAUTH_UNAVAILABLE'
          ? ['discovery:codex-oauth-unavailable']
          : ['discovery:endpoint-not-configured']),
      ],
    });
  }
  return emit(ctx, {
    decision: 'FAIL_NO_SUBSTITUTE',
    reasonCode: 'CAPABILITY_GAP_NO_SUBSTITUTE',
    event: 'CAPABILITY_GAP',
    causeRefs: ['discovery:no-exact-match'],
  });
}

/**
 * Emit a decision: build, stamp, validate, freeze.
 * Applies the state-machine transition and fails closed on an undefined
 * transition via nextState().
 */
function emit(ctx, { decision, reasonCode, event, target = null, justification = null, causeRefs = [] }) {
  const next = nextState(ctx.state, event); // throws RouteStateError on invalid transition
  const record = {
    decisionId: ctx.decisionId ?? generateRouteDecisionId(),
    workUnitId: ctx.workUnitId,
    decision,
    reasonCode,
    state: ctx.state,
    nextState: next,
    decidedAt: ctx.decidedAt ?? new Date().toISOString(),
    budget: ctx.budget.snapshot(),
    evidenceRefs: [...(Array.isArray(ctx.evidenceRefs) ? ctx.evidenceRefs : []), ...causeRefs],
  };
  if (typeof ctx.runId === 'string' && ctx.runId.length > 0) record.runId = ctx.runId;
  if (target !== null) {
    record.targetProvider = target.provider;
    record.targetModel = target.model;
    record.targetRole = target.role;
    if (target.reasoning !== undefined) record.reasoningLevel = target.reasoning;
    if (target.substituteOf !== undefined && target.substituteOf !== null) {
      record.substituteOf = target.substituteOf;
    }
  }
  if (justification !== null) record.escalationJustification = justification;
  return stampRouteDecision(record);
}

/**
 * SOL route emission (2.1, fifth-review repair): the ONLY authoritative
 * automatic SOL channel is the strict Codex transport gate — gpt-5.6-sol
 * on provider 'pi' (Pi native openai-codex OAuth) at XHIGH. The classic
 * sol-xhigh execution branch has NO production authority: configuring the
 * legacy endpoint fails closed with an explicit routing error (no route
 * record is produced), never a silent classic route. A configured
 * `sol.command` can never masquerade as the codex channel: production
 * gpt-5.6-sol review authority belongs exclusively to the controller-side
 * Pi transport (fixtures use the explicit controller-owned transport
 * seam), so the codex channel with a sol.command configured fails closed
 * at routing.
 */
function emitSol(ctx, decision, reasonCode, event, causeRefs) {
  // SOL-S11-002: local-command SOL authority is REMOVED from production
  // routing. A repository-configured sol.command can never grant SOL
  // decision authority. The only way a local command may serve a SOL role
  // is the capability-gated controller-internal test seam
  // (`runController({ solCommand, testCapability })`), which the
  // orchestrator marks non-authoritative (it can never produce
  // REVIEW_APPROVED) and marks its controller-created routing object in a
  // module-private WeakSet. Project JSON cannot carry or forge that object
  // identity, so a repository can never mint local SOL authority.
  const localSolCommand = ctx.config?.sol?.command ?? null;
  const seamAuthorized = isSolFixtureRoutingConfig(ctx.config);
  if (localSolCommand !== null && !seamAuthorized) {
    throw new SolCommandMasqueradeError(
      'a configured sol.command cannot masquerade as an automatic SOL review channel (repository-configured/local sol.command has no SOL decision authority; production semantic review requires the controller-side Pi openai-codex transport) — routing fails closed',
      { reason: 'SOL_COMMAND_MASQUERADE' },
    );
  }
  const role = SOL_TARGETS[decision].role;
  let channel;
  try {
    channel = resolveSolChannel(ctx.config ?? {});
  } catch (err) {
    if (err instanceof ProviderDiscoveryError && err.details?.reason === 'SOL_CHANNEL_CLASSIC_NO_AUTHORITY') {
      // A legacy classic-only/classic-including configuration is a
      // controller config error, never a capability gap: fail closed with
      // an explicit RoutingError (no route record is produced). The
      // classic sol-xhigh channel has no production authority in 2.1 and
      // can never bypass the strict Codex transport gate.
      throw new RoutingError(
        `the classic sol-xhigh channel has no production SOL authority in 2.1 (only the strict openai-codex / gpt-5.6-sol / XHIGH transport gate routes automatic SOL); remove endpoints.${CLASSIC_SOL_MODEL} and configure endpoints.${CODEX_SOL_MODEL} — routing fails closed`,
        { reason: 'SOL_CHANNEL_CLASSIC_NO_AUTHORITY' },
      );
    }
    if (err instanceof ProviderDiscoveryError) return failNoSubstituteDecision(ctx, err);
    throw err;
  }
  if (channel === null) {
    return emit(ctx, {
      decision: 'FAIL_NO_SUBSTITUTE',
      reasonCode: 'PROVIDER_UNAVAILABLE',
      event: 'PROVIDER_UNAVAILABLE',
      causeRefs: ['discovery:endpoint-not-configured'],
    });
  }
  if (channel === 'codex' && ctx.config?.sol?.command !== null && ctx.config?.sol?.command !== undefined) {
    // A repository/CLI sol.command can never impersonate the production
    // openai-codex / gpt-5.6-sol review channel. This branch is normally
    // unreachable (the seam-authorized local command above is refused on
    // the codex channel); it remains as defense in depth.
    throw new SolCommandMasqueradeError(
      'a configured sol.command cannot masquerade as the gpt-5.6-sol codex SOL channel (production review authority requires the controller-side Pi openai-codex transport); remove sol.command or the codex endpoint — routing fails closed',
      { reason: 'SOL_COMMAND_MASQUERADE' },
    );
  }
  let target;
  try {
    discoverSolCodexRoute(role, ctx.config ?? {});
    assertCodexOAuthAvailable({ env: ctx.environment });
    // Exactly the strict Codex transport gate: openai-codex / gpt-5.6-sol
    // / XHIGH — every 2.1 SOL role (CONTRACT_CHECK, DIAGNOSE,
    // FINAL_REVIEW, RECHECK) goes through the same gate.
    target = { model: CODEX_SOL_MODEL, role, provider: 'pi', reasoning: 'XHIGH' };
  } catch (err) {
    if (err instanceof ProviderDiscoveryError) return failNoSubstituteDecision(ctx, err);
    throw err;
  }
  return emit(ctx, { decision, reasonCode, event, target, causeRefs });
}

/**
 * Implementation route emission: exact discovery of the default-ladder
 * model (with only the explicitly configured substitution paths), then
 * emit. Discovery failure fails closed with FAIL_NO_SUBSTITUTE.
 */
function implementationRoute(ctx, { role, reasonCode, event, causeRefs = [] }) {
  let resolved;
  try {
    resolved = resolveImplementationModel(ctx.config ?? {});
  } catch (err) {
    if (err instanceof ProviderDiscoveryError) return failNoSubstituteDecision(ctx, err);
    throw err;
  }
  const substitutionReason =
    resolved.substitutionKind === 'exact'
      ? 'EXACT_SUBSTITUTE_CONFIGURED'
      : resolved.substitutionKind === 'fallback'
        ? 'CAPABILITY_FALLBACK_CONFIGURED'
        : reasonCode;
  return emit(ctx, {
    decision: 'ROUTE_IMPLEMENT_FLASH',
    reasonCode: substitutionReason,
    event,
    target: {
      model: resolved.spec.modelKey,
      role,
      provider: 'pi',
      reasoning: 'XHIGH',
      substituteOf: resolved.substituteOf,
    },
    causeRefs: resolved.substituteOf !== null ? [`substitute:${resolved.substituteOf}`] : causeRefs,
  });
}

function findingRefs(review) {
  const ids = Array.isArray(review?.findingIds) ? review.findingIds : [];
  return ids.length > 0 ? ids.map((id) => `finding:${id}`) : ['finding:unspecified'];
}

/**
 * SOL-S05-001 provenance: does a recheck PASS reference finding(s) whose
 * controller-owned records prove they came from a prior mandatory SOL
 * FINAL_REVIEW? Missing findingIds, unknown finding ids, or findings whose
 * origin is not FINAL_REVIEW (diagnose, ordinary repair, invalid) never
 * prove final-review satisfaction.
 */
function recheckHasFinalReviewProvenance(ctx, review) {
  const ids = Array.isArray(review?.findingIds) ? review.findingIds : [];
  if (ids.length === 0) return false;
  const findings = Array.isArray(ctx.solFindings) ? ctx.solFindings : [];
  return ids.every((id) => {
    const finding = findings.find(
      (f) => f !== null && typeof f === 'object' && f.findingId === id,
    );
    return finding !== undefined && finding.origin === 'FINAL_REVIEW';
  });
}

/**
 * A PASSED solReview outcome in a SOL review state.
 *
 * - AWAITING_SOL_FINAL_REVIEW: this IS the mandatory final review passing;
 *   complete.
 * - AWAITING_SOL_RECHECK: a recheck is a distinct role that may originate
 *   from diagnose or ordinary repair. For HIGH_RISK work a generic recheck
 *   PASS cannot prove the mandatory SOL FINAL_REVIEW occurred: without
 *   final-review provenance the unit routes to ROUTE_SOL_FINAL_REVIEW. With
 *   provenance (recheck of a FINAL_REVIEW finding) it completes — but ONLY
 *   once every authoritative defect is closed (fifth-review rule):
 *   - an open defect that survived its recheck (rechecks >= 1) is STUCK
 *     and blocks completion;
 *   - an open defect that was never repaired yet (repairCycles === 0)
 *     routes to the next bounded repair (one defect at a time);
 *   - completion/REVIEW_APPROVED is forbidden while ANY accepted adjacent
 *     critical defect (or ordinary finding) remains open.
 */
function handleReviewPassed(ctx, facts, review) {
  const open = openAuthoritativeFindings(ctx);
  if (open.length > 0) {
    if (ctx.state === 'AWAITING_SOL_FINAL_REVIEW') {
      throw new RoutingError(
        `a passing final review cannot leave authoritative defects open (${open.map((finding) => finding.findingId).join(', ')}); the response contract forbids PASS with findings`,
        { findingIds: open.map((finding) => finding.findingId) },
      );
    }
    // AWAITING_SOL_RECHECK: the active finding just passed its recheck.
    const survived = open.find((finding) => Number.isInteger(finding.rechecks) && finding.rechecks >= 1);
    if (survived !== undefined) {
      // An authoritative defect that survived one repair AND its recheck
      // is controller-owned STUCK; completion stays blocked.
      return emit(ctx, {
        decision: 'STOP_STUCK',
        reasonCode: 'SOL_FINDING_SURVIVES_ONE_REPAIR',
        event: 'STUCK',
        causeRefs: [`finding:${survived.findingId}`, 'review:finding-survived-recheck'],
      });
    }
    // Remaining open defects were never repaired: route the next bounded
    // repair (one defect at a time). Completion remains blocked until
    // every authoritative defect is explicitly resolved or STUCK.
    return implementationRoute(ctx, {
      role: 'REPAIR',
      reasonCode: 'REPAIR_TARGETED_FIRST',
      event: 'FAILURE_FIRST_CREDIBLE',
      causeRefs: [...open.map((finding) => `finding:${finding.findingId}`), 'review:next-open-defect-repair'],
    });
  }
  if (ctx.state === 'AWAITING_SOL_FINAL_REVIEW') {
    return emit(ctx, {
      decision: 'ROUTE_COMPLETE',
      reasonCode: 'RESULT_ACCEPTED',
      event: 'SOL_REVIEW_PASSED',
      causeRefs: ['review:passed'],
    });
  }
  if (facts.highRisk && !recheckHasFinalReviewProvenance(ctx, review)) {
    return emitSol(
      ctx,
      'ROUTE_SOL_FINAL_REVIEW',
      'SOL_FINAL_REVIEW',
      'RESULT_ACCEPTED_HIGH_RISK',
      [...contractCauseRefs(ctx), 'review:recheck-passed-without-final-review'],
    );
  }
  return emit(ctx, {
    decision: 'ROUTE_COMPLETE',
    reasonCode: 'RESULT_ACCEPTED',
    event: 'SOL_REVIEW_PASSED',
    causeRefs: ['review:passed'],
  });
}

/**
 * Deterministic route decision for a work unit.
 *
 * @param {object} ctx - {
 *   workUnitId, runId?, state, decidedAt?, decisionId?,
 *   semanticContract?, contractReviewRequired?,
 *   resultAccepted?, solReview?, solDiagnosis?,
 *   failureHistory?, latestRejection?, solFindings?,
 *   stuckEvidence?, escalation?, budget, config?, evidenceRefs?
 * }
 * @returns {Readonly<object>} frozen, validated lcim.route-decision record
 * @throws {RouteStateError} undefined state transition (fail closed)
 * @throws {RoutingError} malformed/contradictory context, invalid escalation,
 *   or a supplied semantic contract that fails Sprint-04 validation
 */
export function decideRoute(ctx) {
  assertCtx(ctx);
  if (isTerminalState(ctx.state)) {
    throw new RouteStateError(
      `routing is already in terminal state ${ctx.state}: no further decisions are valid`,
      { state: ctx.state },
    );
  }

  // 1. Hard budget: fail closed before anything else.
  if (ctx.budget.isExhausted()) {
    return emit(ctx, {
      decision: 'STOP_BUDGET',
      reasonCode: 'BUDGET_EXHAUSTED',
      event: 'BUDGET_EXHAUSTED',
      causeRefs: ['budget:exhausted'],
    });
  }

  // Sprint-04 authority: validate the supplied contract and derive routing
  // facts from validated content only (SOL-S05-004).
  const facts = resolveContractFacts(ctx);

  // 2. Validated CONTRACT_REVIEW_REQUIRED: SOL contract check, never implementation.
  if (facts.reviewRequired) {
    return emitSol(
      ctx,
      'ROUTE_SOL_CONTRACT_CHECK',
      'UNRESOLVED_HIGH_RISK_CONTRACT',
      'CONTRACT_REVIEW_REQUIRED',
      contractCauseRefs(ctx),
    );
  }

  // 3. Hard controller-owned STUCK criteria: never bypassed by acceptance or
  //    escalation branches.
  const stuckCodes = evaluateStuckCriteria(ctx);
  if (stuckCodes.length > 0) {
    return emit(ctx, {
      decision: 'STOP_STUCK',
      reasonCode: stuckCodes[0],
      event: 'STUCK',
      causeRefs: stuckCodes.map((code) => `stuck:${code}`),
    });
  }

  // 4. Required SOL recheck: an open finding after one repair, no recheck yet.
  const recheckDue = isOpenFindingRecheckDue(ctx);
  if (recheckDue !== undefined) {
    return emitSol(
      ctx,
      'ROUTE_SOL_RECHECK',
      'SOL_RECHECK_AFTER_REPAIR',
      'SOL_FINDING_SURVIVED_REPAIR',
      [`finding:${recheckDue.findingId}`, 'finding:repair-done'],
    );
  }

  // 5. Semantic rejection: escalate immediately, no equivalent repeats.
  const rejection = ctx.latestRejection;
  if (rejection !== null && rejection !== undefined && SEMANTIC_REJECTION_CODES.includes(rejection.rejectionCode)) {
    return emitSol(
      ctx,
      'ROUTE_SOL_DIAGNOSE',
      'SEMANTIC_REJECTION_ESCALATION',
      'SEMANTIC_REJECTION',
      [`rejection:${rejection.rejectionCode}`],
    );
  }

  // 6. Accepted result. HIGH_RISK completion requires PROOF that the final
  //    review actually occurred and passed: state in the SOL-review flow AND
  //    a PASSED solReview outcome. A shallow flag outside that flow can never
  //    complete a high-risk unit. Review states are owned by the solReview
  //    outcome (also step 8); a stale resultAccepted contradicting a FINDING
  //    verdict fails closed.
  if (ctx.resultAccepted === true) {
    if (SOL_REVIEW_STATES.includes(ctx.state)) {
      const review = ctx.solReview;
      if (review === null || review === undefined) {
        throw new RoutingError(
          `resultAccepted=true while in ${ctx.state} without a controller-owned solReview outcome: contradictory (final review cannot be proven without its outcome)`,
          { state: ctx.state },
        );
      }
      if (review.verdict === 'PASSED') {
        // HIGH_RISK completion from a recheck PASS requires final-review
        // provenance (SOL-S05-001); a generic recheck routes to final review.
        return handleReviewPassed(ctx, facts, review);
      }
      throw new RoutingError(
        `resultAccepted=true contradicts solReview verdict ${JSON.stringify(review.verdict)} in ${ctx.state} (a finding verdict is handled by the review flow, not by completion)`,
        { state: ctx.state, verdict: review.verdict },
      );
    }
    if (facts.highRisk) {
      return emitSol(
        ctx,
        'ROUTE_SOL_FINAL_REVIEW',
        'SOL_FINAL_REVIEW',
        'RESULT_ACCEPTED_HIGH_RISK',
        [...contractCauseRefs(ctx), 'review:high-risk-final'],
      );
    }
    return emit(ctx, {
      decision: 'ROUTE_COMPLETE',
      reasonCode: 'RESULT_ACCEPTED',
      event: 'RESULT_ACCEPTED',
      causeRefs: [],
    });
  }

  // 7. Explicit escalation requests (Pro MAX / Flash MAX), always justified.
  if (ctx.escalation !== null && ctx.escalation !== undefined) {
    const esc = ctx.escalation;
    if (!isValidEscalationBasis(esc.basis) || typeof esc.detail !== 'string' || esc.detail.length === 0) {
      throw new RoutingError(
        `invalid escalation request: basis must be one of ${PRO_MAX_BASES.join(', ')} with a non-empty detail`,
        { basis: esc.basis },
      );
    }
    if (esc.model === 'deepseek-pro-max') {
      if (!PRO_MAX_BASES.includes(esc.basis)) {
        throw new RoutingError(
          `invalid Pro MAX escalation basis ${JSON.stringify(esc.basis)} (allowed: ${PRO_MAX_BASES.join(', ')})`,
          { basis: esc.basis },
        );
      }
      try {
        assertNoDowngrade('deepseek-pro-max', 'MAX', ctx.config ?? {});
      } catch (err) {
        if (err instanceof ProviderDiscoveryError) return failNoSubstituteDecision(ctx, err);
        throw err;
      }
      return emit(ctx, {
        decision: 'ROUTE_IMPLEMENT_PRO_MAX',
        reasonCode: 'PRO_MAX_ESCALATION',
        event: 'PRO_MAX_JUSTIFIED',
        target: { model: 'deepseek-pro-max', role: 'IMPLEMENT', provider: 'pi', reasoning: 'MAX' },
        justification: { basis: esc.basis, detail: esc.detail },
        causeRefs: [`escalation:${esc.basis}`],
      });
    }
    if (esc.model === 'deepseek-v4-flash' && esc.basis === 'CONTRACT_LOCKED_DIFFICULT_TASK') {
      try {
        assertNoDowngrade('deepseek-v4-flash', 'MAX', ctx.config ?? {});
      } catch (err) {
        if (err instanceof ProviderDiscoveryError) return failNoSubstituteDecision(ctx, err);
        throw err;
      }
      return emit(ctx, {
        decision: 'ROUTE_IMPLEMENT_FLASH_MAX',
        reasonCode: 'MAX_JUSTIFIED',
        event: 'TASK_READY',
        target: { model: 'deepseek-v4-flash', role: 'IMPLEMENT', provider: 'pi', reasoning: 'MAX' },
        justification: { basis: esc.basis, detail: esc.detail },
        causeRefs: ['escalation:contract-locked-difficult'],
      });
    }
    throw new RoutingError(
      `invalid escalation request: model ${JSON.stringify(esc.model)} with basis ${JSON.stringify(esc.basis)} (Flash MAX accepts only CONTRACT_LOCKED_DIFFICULT_TASK; everything else must use deepseek-pro-max)`,
      { model: esc.model, basis: esc.basis },
    );
  }

  // 8. SOL outcome states — deterministic controller-owned outcome facts
  //    (SOL-S05-005). Missing outcomes fail closed; outcomes are never
  //    teleported, they transition through the state machine.
  if (SOL_REVIEW_STATES.includes(ctx.state)) {
    const review = ctx.solReview;
    if (review === null || review === undefined || review.verdict === undefined) {
      throw new RoutingError(
        `state ${ctx.state} requires a controller-owned solReview outcome ({ verdict: 'PASSED' | 'FINDING', findingIds? }); none supplied`,
        { state: ctx.state },
      );
    }
    if (review.verdict === 'PASSED') {
      // HIGH_RISK completion from a recheck PASS requires final-review
      // provenance (SOL-S05-001); a generic recheck routes to final review.
      return handleReviewPassed(ctx, facts, review);
    }
    if (review.verdict === 'FINDING') {
      if (ctx.state === 'AWAITING_SOL_FINAL_REVIEW') {
        // Localized actionable finding from the final review: exactly one
        // bounded Flash repair (FAILURE_FIRST_CREDIBLE -> AWAITING_REPAIR).
        return implementationRoute(ctx, {
          role: 'REPAIR',
          reasonCode: 'REPAIR_TARGETED_FIRST',
          event: 'FAILURE_FIRST_CREDIBLE',
          causeRefs: [...findingRefs(review), 'review:finding-bounded-repair'],
        });
      }
      // AWAITING_SOL_RECHECK: the finding survived one repair AND this
      // recheck -> controller-owned STUCK.
      return emit(ctx, {
        decision: 'STOP_STUCK',
        reasonCode: 'SOL_FINDING_SURVIVES_ONE_REPAIR',
        event: 'STUCK',
        causeRefs: [...findingRefs(review), 'review:finding-survived-recheck'],
      });
    }
    throw new RoutingError(`invalid solReview verdict ${JSON.stringify(review.verdict)} (allowed: PASSED | FINDING)`, {
      verdict: review.verdict,
    });
  }

  if (ctx.state === 'AWAITING_SOL_CONTRACT_CHECK') {
    if (facts.contract !== null && !facts.reviewRequired) {
      // Controller supplied the resolved validated COMPILED contract:
      // SOL_CHECK_RESOLVED -> implementation may proceed.
      return implementationRoute(ctx, {
        role: 'IMPLEMENT',
        reasonCode: 'NORMAL_BOUNDED_TASK',
        event: 'SOL_CHECK_RESOLVED',
        causeRefs: ['contract-check:resolved'],
      });
    }
    throw new RoutingError(
      `state AWAITING_SOL_CONTRACT_CHECK requires the controller-owned resolved contract outcome (a validated COMPILED semantic contract); supplied: ${facts.contract === null ? 'none' : 'still CONTRACT_REVIEW_REQUIRED'}`,
      { state: ctx.state },
    );
  }

  if (ctx.state === 'AWAITING_SOL_DIAGNOSE') {
    const diagnosis = ctx.solDiagnosis;
    if (diagnosis !== null && diagnosis !== undefined && diagnosis.status === 'RESOLVED') {
      // Diagnosis resolved the semantic problem: SOL_DIAGNOSIS_READY ->
      // bounded implementation may proceed.
      return implementationRoute(ctx, {
        role: 'IMPLEMENT',
        reasonCode: 'NORMAL_BOUNDED_TASK',
        event: 'SOL_DIAGNOSIS_READY',
        causeRefs: ['diagnosis:resolved'],
      });
    }
    throw new RoutingError(
      `state AWAITING_SOL_DIAGNOSE requires a controller-owned solDiagnosis outcome ({ status: 'RESOLVED' }); none supplied`,
      { state: ctx.state },
    );
  }

  // 9. Failure handling.
  const failureHistory = Array.isArray(ctx.failureHistory) ? ctx.failureHistory : [];
  const latestFailure = failureHistory.length > 0 ? failureHistory[failureHistory.length - 1] : null;
  if (latestFailure !== null) {
    if (ctx.state === 'AWAITING_IMPLEMENTATION' && latestFailure.credibleHypothesis === true) {
      // First localized failure with a credible hypothesis: exactly one
      // bounded Flash repair.
      return implementationRoute(ctx, {
        role: 'REPAIR',
        reasonCode: 'REPAIR_TARGETED_FIRST',
        event: 'FAILURE_FIRST_CREDIBLE',
        causeRefs: ['failure:first-credible'],
      });
    }
    if (ctx.state === 'AWAITING_PRO_MAX' && latestFailure.credibleHypothesis === true) {
      // A Flash repair below Pro MAX would be a downgrade: bounded window exhausted.
      return emit(ctx, {
        decision: 'STOP_STUCK',
        reasonCode: 'REPAIR_LIMIT_REACHED',
        event: 'STUCK',
        causeRefs: ['repair-limit:pro-max-reached'],
      });
    }
    if (latestFailure.credibleHypothesis !== true) {
      return emit(ctx, {
        decision: 'STOP_STUCK',
        reasonCode: 'NO_FALSIFIABLE_EXPLANATION',
        event: 'STUCK',
        causeRefs: ['failure:no-falsifiable-explanation'],
      });
    }
  }

  // 10. Default bounded route: DeepSeek V4 Flash xhigh through Pi.
  return implementationRoute(ctx, {
    role: 'IMPLEMENT',
    reasonCode: 'NORMAL_BOUNDED_TASK',
    event: 'TASK_READY',
    causeRefs: [],
  });
}
