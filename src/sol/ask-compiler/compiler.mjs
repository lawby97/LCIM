/**
 * LCIM V2 SOL ask compiler (Sprint 06).
 *
 * Compiles a structured SOL decision request into a `lcim.sol-ask`
 * document. The compiled ask is the bounded decision contract handed to
 * SOL: call ID/type, exactly ONE `singleDecisionQuestion`, why-needed,
 * authoritative contract bindings (EVERY contractRef and requirementRef
 * resolves to supplied validated Sprint-04 source documents — no
 * source-free authoritative references), established facts, ONE closed
 * retained evidence universe (evidence — the single budgeted pool that
 * also absorbs DIAGNOSE prior evidence and RECHECK delta evidence),
 * explicit pass/fail conditions, allowed scope, out-of-scope, required
 * response shape, repair constraints, and an evidence budget.
 *
 * The compiler:
 *
 * - preflights the request (generic asks, edit requests, multiple or
 *   clause-separated independent questions, bundled concerns,
 *   cross-call-type question domains) and FAILS CLOSED with `SolAskError`
 *   (SOL_ASK_INVALID);
 * - REQUIRES validated Sprint-04 sources (opts.sources); the source set
 *   is validated with the Sprint-04 validator (never repaired/mutated)
 *   and every contractRef binds by (contractKey, semanticDigest) while
 *   every requirementRef resolves to a source negative side-effect item;
 *   CONTRACT_CHECK may bind COMPILED or CONTRACT_REVIEW_REQUIRED sources
 *   (review does not confer implementation authority);
 *   implementation-facing calls (DIAGNOSE/FINAL_REVIEW/RECHECK) require
 *   implementation-authoritative COMPILED sources;
 * - normalizes ALL evidence-bearing input (top-level evidence, DIAGNOSE
 *   priorEvidence, RECHECK deltaEvidence) into ONE canonical pool with
 *   unique refs, applies the single evidence budget deterministically
 *   (see evidence-budget.mjs), and stores block-level refs
 *   (priorEvidenceRefs / deltaEvidenceRefs) that resolve into the pool;
 *   decision-referenced evidence (pass/fail refs, prior/delta refs) is
 *   protected from truncation — required decision evidence that cannot
 *   fit fails closed (SOL-S06-003/004);
 * - for SOL_RECHECK requires the validated prior ask+response
 *   (opts.prior), freezes exact prior-finding provenance
 *   (priorAskId, priorResponseId, priorFindingRef, priorFindingDigest),
 *   restricts the evidence universe to delta evidence only, and binds
 *   neighboring invariants to a closed authoritative set
 *   (SOL-S06-008);
 * - rejects caller-supplied derived fields (askId, compiledAt, schema
 *   fields) — the compiler owns the instance identity;
 * - validates the result with `validateSolAsk` (sources + prior) and
 *   fails closed;
 * - returns a DEEPLY immutable document (deep clone + deep freeze), so a
 *   validated ask can never be altered into an unbounded request.
 */

import { ConfigError } from '../../shared/errors.mjs';
import { SolAskError } from '../contracts/errors.mjs';
import { assertSolCallType, solTypeBlockFor } from '../contracts/call-types.mjs';
import { generateSolAskId } from '../contracts/ids.mjs';
import { SOL_SCHEMA_VERSION } from '../contracts/registry.mjs';
import { validateSolAsk, validateSourceSet } from '../contracts/validate.mjs';
import {
  DEFAULT_EVIDENCE_BUDGET,
  assertEvidenceBudget,
  TRUNCATION_MARKER_REF,
} from '../contracts/evidence.mjs';
import { applyEvidenceBudget } from './evidence-budget.mjs';
import { preflightSolRequest, SOL_PREFLIGHT_CODES } from './preflight.mjs';
import {
  SOL_RESPONSE_SHAPES,
  SOL_REPAIR_CONSTRAINTS,
} from '../contracts/call-types.mjs';
import { validateSolResponse } from '../contracts/validate.mjs';
import { canonicalizeJson, sha256Hex } from '../../contracts/digest.mjs';
import { deepCloneJson, deepFreezeJson } from '../../contracts/deep-freeze.mjs';

/** Fields the compiler derives; never valid caller-supplied ask fields. */
const DERIVED_ASK_FIELDS = ['schemaName', 'schemaVersion', 'askId', 'compiledAt'];

/** Max sources bound to one ask (mirrors contractRefs maxItems). */
export const MAX_BOUND_SOURCES = 8;

/** Evidence ref reserved for the compiler-owned truncation marker. */
const RESERVED_EVIDENCE_REFS = [TRUNCATION_MARKER_REF];

function assertPlainObject(value, what) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigError(`${what} must be a plain object`);
  }
}

function assertString(value, what) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ConfigError(`${what} must be a non-empty string`);
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Compile a SOL ask from explicit structured input.
 *
 * @param {object} input - structured ask source:
 *   callType, singleDecisionQuestion, whyNeeded, contractRefs (with
 *   semanticDigest), establishedFacts, evidence, passCondition,
 *   failCondition, allowedScope, outOfScope, plus the per-type block
 *   matching the call type (contractCheck | diagnose | finalReview |
 *   recheck). DIAGNOSE prior evidence is supplied as
 *   diagnose.priorEvidence (items; the compiler normalizes them into the
 *   pool and stores priorEvidenceRefs); RECHECK delta evidence as
 *   recheck.deltaEvidence (items; normalized into the pool as the only
 *   evidence universe). Optional: passEvidenceRefs/failEvidenceRefs,
 *   requiredResponseShape, repairConstraints, evidenceBudget (defaults
 *   are derived per call type; verdict vocabularies are type-locked).
 *   Must NOT carry a caller-supplied askId, compiledAt, or schema fields.
 * @param {{ compiledAt?: string, sources: Array<object>, prior?: {ask: object, response: object} }} [opts] -
 *   compiledAt override for deterministic tests; sources: validated
 *   Sprint-04 semantic contract documents (REQUIRED — every contractRef
 *   and requirementRef must resolve to them); prior: validated prior
 *   compiled ask+response for SOL_RECHECK provenance (REQUIRED for
 *   RECHECK).
 * @returns {Readonly<object>} deeply frozen, stamped, validated lcim.sol-ask
 * @throws {ConfigError} malformed input
 * @throws {SolAskError} preflight rejection (SOL_ASK_INVALID),
 *   evidence-budget exhaustion (BUDGET_EXHAUSTED), or validation failure
 */
export function compileSolAsk(input, opts = {}) {
  assertPlainObject(input, 'SOL ask input');
  for (const field of DERIVED_ASK_FIELDS) {
    if (field in input) {
      throw new ConfigError(
        `input must not carry '${field}'; the ask compiler derives it (askId/compiledAt are instance identity)`,
      );
    }
  }

  assertSolCallType(input.callType);
  assertString(input.singleDecisionQuestion, 'input.singleDecisionQuestion');
  assertString(input.whyNeeded, 'input.whyNeeded');
  assertString(input.passCondition, 'input.passCondition');
  assertString(input.failCondition, 'input.failCondition');

  // --- preflight: one primary decision question, no generic/edit asks ------
  const preflight = preflightSolRequest({
    decisionQuestion: input.singleDecisionQuestion,
    whyNeeded: input.whyNeeded,
    allowedScope: input.allowedScope,
    callType: input.callType,
  });
  if (!preflight.valid) {
    throw new SolAskError(
      `SOL ask preflight rejected (${preflight.rejection.code}): ${preflight.rejection.reason}`,
      'SOL_ASK_INVALID',
      preflight.rejection,
    );
  }

  // --- exactly one per-type block matching the call type --------------------
  const expectedBlock = solTypeBlockFor(input.callType);
  const present = ['contractCheck', 'diagnose', 'finalReview', 'recheck'].filter(
    (b) => input[b] !== undefined,
  );
  if (present.length === 0) {
    throw new ConfigError(`input must carry the '${expectedBlock}' block for call type '${input.callType}'`);
  }
  if (present.length > 1) {
    throw new ConfigError(`input carries ${present.length} per-type blocks (${present.join(', ')}); one primary decision question, one call type, one block`);
  }
  if (present[0] !== expectedBlock) {
    throw new ConfigError(`call type '${input.callType}' requires the '${expectedBlock}' block, got '${present[0]}'`);
  }

  // --- validated Sprint-04 sources are REQUIRED (SOL-S06-002) ---------------
  const sourceResult = validateSourceSet(opts.sources);
  if (!sourceResult.valid) {
    throw new SolAskError(
      `SOL ask sources rejected: ${sourceResult.errors.map((e) => `${e.path}: [${e.code}] ${e.message}`).join('; ')}`,
      'SOL_ASK_INVALID',
      { errors: sourceResult.errors },
    );
  }
  const sources = sourceResult.bound;

  // --- RECHECK requires prior ask+response provenance (SOL-S06-008) ---------
  let recheckBlock = input.recheck;
  if (input.callType === 'SOL_RECHECK') {
    if (!isPlainObject(opts.prior) || !isPlainObject(opts.prior.ask) || !isPlainObject(opts.prior.response)) {
      throw new ConfigError('compileSolAsk(SOL_RECHECK) requires opts.prior = { ask, response } (the validated prior compiled ask and response the prior finding comes from)');
    }
    const priorAsk = opts.prior.ask;
    const priorResponse = opts.prior.response;
    // (1) the prior ask must ITSELF be a valid compiled SOL ask — a partial
    // invented prior ask carrying only plausible askId/callType/checklist
    // fields is not a compiled ask (SOL-S06-FINAL-001). Validated with the
    // same Sprint-06 machinery (no sources/prior opts: the immediate chain
    // is all the controller supplies, and a prior ask that is itself a
    // RECHECK ask cannot recurse).
    const priorAskCheck = validateSolAsk(priorAsk);
    if (!priorAskCheck.valid) {
      throw new SolAskError(
        `SOL RECHECK prior chain rejected: the prior ask is not a valid compiled SOL ask (${priorAskCheck.errors[0]?.message ?? 'invalid'}); an invented partial prior ask can never anchor a RECHECK chain`,
        'PRIOR_CHAIN_INVALID',
        { errors: priorAskCheck.errors },
      );
    }
    // (2) the prior response must bind to that validated prior ask
    const priorChain = validateSolResponse(priorResponse, { ask: priorAsk });
    if (!priorChain.valid) {
      throw new SolAskError(
        `SOL RECHECK prior chain rejected: the prior response does not bind to its prior ask (${priorChain.errors[0]?.message ?? 'invalid'})`,
        'PRIOR_CHAIN_INVALID',
        { errors: priorChain.errors },
      );
    }
    const finding = (priorResponse.findings ?? []).find((f) => f?.findingId === input.recheck?.priorFindingRef);
    if (finding === undefined) {
      throw new SolAskError(
        `SOL RECHECK prior finding '${input.recheck?.priorFindingRef}' does not resolve to an actual finding of the prior response; invented or swapped prior findings are rejected`,
        'PRIOR_FINDING_UNKNOWN',
        { priorFindingRef: input.recheck?.priorFindingRef },
      );
    }
    const priorFindingDigest = sha256Hex(JSON.stringify(canonicalizeJson(finding)));
    recheckBlock = {
      ...input.recheck,
      priorAskId: priorAsk.askId,
      priorResponseId: priorResponse.responseId,
      priorFindingDigest,
    };
  }

  // --- ONE closed retained evidence universe (SOL-S06-003) ------------------
  // All evidence-bearing input (top-level evidence, DIAGNOSE prior
  // evidence, RECHECK delta evidence) is normalized into the single pool
  // with unique refs; the blocks carry refs into the pool.
  const blockEvidence = input.callType === 'SOL_DIAGNOSE'
    ? input.diagnose?.priorEvidence ?? []
    : input.callType === 'SOL_RECHECK'
      ? input.recheck?.deltaEvidence ?? []
      : [];

  if (input.callType === 'SOL_DIAGNOSE' && input.diagnose?.priorEvidence !== undefined && !Array.isArray(input.diagnose.priorEvidence)) {
    throw new ConfigError('diagnose.priorEvidence must be an array of evidence items (normalized into the ask evidence universe)');
  }
  if (input.callType === 'SOL_RECHECK') {
    if (!Array.isArray(input.recheck?.deltaEvidence) || input.recheck.deltaEvidence.length === 0) {
      throw new ConfigError('recheck.deltaEvidence must be a non-empty array of evidence items (the only SOL-visible evidence for RECHECK)');
    }
  }

  const poolInput = [...(input.evidence ?? []), ...blockEvidence];

  if (input.callType === 'SOL_RECHECK' && (input.evidence ?? []).length > 0) {
    throw new SolAskError(
      'SOL RECHECK is delta-only: top-level evidence input is rejected; the SOL-visible evidence universe must be exactly the retained delta evidence',
      'RECHECK_NONDELTA_EVIDENCE',
    );
  }

  // caller evidence is allowed but never carries compiler-owned refs
  for (const [i, item] of poolInput.entries()) {
    if (RESERVED_EVIDENCE_REFS.includes(item?.ref)) {
      throw new ConfigError(`evidence[${i}] uses reserved ref '${item.ref}'; the truncation marker is compiler-owned`);
    }
  }

  // unique refs across the pool
  const seenRefs = new Set();
  for (const [i, item] of poolInput.entries()) {
    if (typeof item?.ref !== 'string' || item.ref.length === 0) {
      throw new ConfigError(`evidence[${i}] must carry a non-empty ref`);
    }
    if (seenRefs.has(item.ref)) {
      throw new ConfigError(`duplicate evidence ref '${item.ref}' across the evidence universe; refs must be unique`);
    }
    seenRefs.add(item.ref);
  }

  // decision-referenced evidence is protected from truncation (SOL-S06-004)
  const protectedRefs = new Set([
    ...(input.passEvidenceRefs ?? []),
    ...(input.failEvidenceRefs ?? []),
    ...(input.callType === 'SOL_DIAGNOSE' ? (input.diagnose?.priorEvidence ?? []).map((e) => e?.ref) : []),
    ...(input.callType === 'SOL_RECHECK' ? (input.recheck?.deltaEvidence ?? []).map((e) => e?.ref) : []),
  ]);

  const evidenceBudget = input.evidenceBudget ?? DEFAULT_EVIDENCE_BUDGET;
  assertEvidenceBudget(evidenceBudget);
  const budgeted = applyEvidenceBudget(poolInput, evidenceBudget, { protectedRefs });

  // --- defaulted per-type contracts ------------------------------------------
  const requiredResponseShape =
    input.requiredResponseShape ?? SOL_RESPONSE_SHAPES[input.callType];
  const repairConstraints = input.repairConstraints ?? SOL_REPAIR_CONSTRAINTS;

  // per-type block: normalize call-specific evidence into refs
  let perTypeBlock = input[expectedBlock];
  if (input.callType === 'SOL_DIAGNOSE') {
    const { priorEvidence: _items, ...rest } = input.diagnose;
    perTypeBlock = {
      ...rest,
      ...((input.diagnose.priorEvidence ?? []).length > 0
        ? { priorEvidenceRefs: input.diagnose.priorEvidence.map((e) => e.ref) }
        : {}),
    };
  } else if (input.callType === 'SOL_RECHECK') {
    const { deltaEvidence: _items, ...rest } = recheckBlock;
    perTypeBlock = {
      ...rest,
      deltaEvidenceRefs: input.recheck.deltaEvidence.map((e) => e.ref),
    };
  }

  const compiledAt = opts.compiledAt ?? new Date().toISOString();
  const askId = generateSolAskId();

  const draft = {
    schemaName: 'lcim.sol-ask',
    schemaVersion: SOL_SCHEMA_VERSION,
    askId,
    callType: input.callType,
    singleDecisionQuestion: input.singleDecisionQuestion,
    whyNeeded: input.whyNeeded,
    contractRefs: input.contractRefs,
    establishedFacts: input.establishedFacts ?? [],
    evidence: budgeted.evidence,
    passCondition: input.passCondition,
    failCondition: input.failCondition,
    ...(input.passEvidenceRefs !== undefined ? { passEvidenceRefs: input.passEvidenceRefs } : {}),
    ...(input.failEvidenceRefs !== undefined ? { failEvidenceRefs: input.failEvidenceRefs } : {}),
    allowedScope: input.allowedScope,
    outOfScope: input.outOfScope,
    requiredResponseShape,
    repairConstraints,
    evidenceBudget,
    [expectedBlock]: perTypeBlock,
    compiledAt,
  };

  const result = validateSolAsk(draft, { sources, prior: opts.prior });
  if (!result.valid) {
    throw new SolAskError(
      `SOL ask failed validation: ${result.errors
        .map((e) => `${e.path || '(root)'}: [${e.code}] ${e.message}`)
        .join('; ')}`,
      'SOL_ASK_INVALID',
      { errors: result.errors },
    );
  }

  // Deep clone (never freeze caller-owned input) + deep freeze [SOL-S04-001].
  const compiled = deepCloneJson(draft);
  return deepFreezeJson(compiled);
}

export { SOL_PREFLIGHT_CODES };
