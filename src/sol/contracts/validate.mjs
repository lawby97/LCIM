/**
 * LCIM V2 SOL contract validation (Sprint 06).
 *
 * Three layers, mirroring the Sprint-04 discipline:
 *
 * 1. JSON-schema validation via the shared Sprint-00 engine
 *    (`validateAgainstSchema`, failure-closed keyword subset).
 * 2. Conditional semantic rules that the schema subset cannot express,
 *    enforced here so callers cannot bypass them.
 * 3. Optional cross-document rules when validated Sprint-04 source
 *    semantic contracts (`opts.sources`), the compiled ask (`opts.ask`),
 *    or the prior ask/response provenance (`opts.prior`) are supplied.
 *
 * SOL ask rules (`validateSolAsk`):
 * - the compiled ask's evidence (its ONE retained evidence universe) must
 *   fit its own evidence budget (EVIDENCE_BUDGET_EXCEEDED) and any
 *   truncation marker must be the last item and only under
 *   TRUNCATE_SUMMARIZE (INVALID_TRUNCATION_MARKER); the marker is never
 *   evidence — it can never be referenced (EVIDENCE_REF_MARKER);
 * - every decision-bearing evidence ref (passEvidenceRefs,
 *   failEvidenceRefs, diagnose.priorEvidenceRefs,
 *   recheck.deltaEvidenceRefs) must resolve to a retained NON-MARKER
 *   pool item (EVIDENCE_REF_UNRESOLVED);
 * - RECHECK: the evidence universe is delta-only — every pool item must
 *   be referenced by recheck.deltaEvidenceRefs and unrelated top-level
 *   evidence is rejected (RECHECK_NONDELTA_EVIDENCE);
 * - exactly one per-type block (contractCheck/diagnose/finalReview/recheck)
 *   matching the call type (TYPE_BLOCK_MISMATCH, CROSS_TYPE_BLOCKS);
 * - requiredResponseShape.verdicts must equal the call type's verdict
 *   vocabulary exactly — verdicts are type-locked, never caller-chosen
 *   (RESPONSE_SHAPE_MISMATCH);
 * - DIAGNOSE: the acceptanceCriterionRef must be declared among the
 *   contractRefs requirementRefs (CRITERION_NOT_DECLARED);
 * - FINAL_REVIEW invariant checklist names are unique
 *   (DUPLICATE_INVARIANT_ID) and each lockedRequirementRef must be a
 *   declared requirementRef (INVARIANT_REQUIREMENT_UNBOUND);
 * - with sources: EVERY contractRef binds by (contractKey +
 *   semanticDigest) to a validated source — never contractKey alone,
 *   never invented digests (CONTRACT_REF_UNBOUND); EVERY requirementRef
 *   resolves to a negative side-effect item of its bound source
 *   (REQUIREMENT_REF_UNBOUND); each source is validated with the
 *   Sprint-04 validator (SOURCE_INVALID) and never repaired;
 * - authority distinction: SOL_CONTRACT_CHECK may bind COMPILED or
 *   CONTRACT_REVIEW_REQUIRED sources (review of review-required input is
 *   its job, and review does not confer implementation authority);
 *   implementation-facing calls (SOL_DIAGNOSE, SOL_FINAL_REVIEW,
 *   SOL_RECHECK) require implementation-authoritative (COMPILED) bound
 *   sources (SOURCE_NOT_IMPLEMENTATION_AUTHORITATIVE);
 * - RECHECK: the prior ASK must itself be a valid compiled SOL ask,
 *   then the prior finding must resolve to an actual finding of the
 *   bound prior response (whose response binds to that validated prior
 *   ask), and the frozen priorFindingDigest must match
 *   (PRIOR_FINDING_UNKNOWN, PRIOR_CHAIN_INVALID,
 *   PRIOR_FINDING_DIGEST_MISMATCH); an invented partial prior ask never
 *   anchors a chain, and a prior ask that is itself a RECHECK ask does
 *   not recurse (its own provenance is not re-validated here); neighboring
 *   invariants resolve to a closed authoritative set: declared
 *   requirementRefs of the ask and/or named invariants of the prior
 *   FINAL_REVIEW ask (NEIGHBOR_UNBOUND);
 * - budget magnitudes and repair-constraint counts are positive integers
 *   (INVALID_EVIDENCE_BUDGET, INVALID_REPAIR_CONSTRAINTS).
 *
 * SOL response rules (`validateSolResponse`):
 * - verdict must be in the call type's vocabulary
 *   (VERDICT_NOT_IN_VOCABULARY);
 * - with the compiled ask: askId and callType must bind (ASK_ID_MISMATCH,
 *   CALL_TYPE_MISMATCH);
 * - amendment only under CONTRACT_CHECK, failure only under DIAGNOSE,
 *   adjacentCriticalDefects only under FINAL_REVIEW (TYPE_BLOCK_MISMATCH,
 *   FINDINGS_NOT_ALLOWED);
 * - CONTRACT_CHECK: verdict/amendment pairing
 *   (CONTRACT_CHECK_AMENDMENT_MISMATCH) and amendments must reference a
 *   contractRef of the ask (AMENDMENT_CONTRACT_UNKNOWN);
 * - DIAGNOSE: CAUSE_IDENTIFIED requires the complete failure block,
 *   CAUSE_UNRESOLVED forbids it (DIAGNOSE_FAILURE_MISMATCH); evidence
 *   refs must resolve to retained NON-MARKER evidence
 *   (FAILURE_EVIDENCE_UNRESOLVED, EVIDENCE_REF_MARKER); with a source
 *   the repair mustChange targets stay inside the diagnosed criterion's
 *   side-effect scope (FAILURE_SCOPE_UNBOUNDED) and stay within the
 *   ask's maxMustChangeTargets (FAILURE_TARGET_COUNT_EXCEEDED), and
 *   mustNotChange is required when the ask demands it
 *   (FAILURE_MUST_NOT_CHANGE_MISSING); exact tests may reference only
 *   the diagnosed criterion (TEST_CRITERION_UNKNOWN) and a
 *   criterion-bound exact test's expectation must equal the source
 *   requirement verbatim (TEST_EXPECTATION_MISMATCH); at most one
 *   finding scoped to the criterion (DIAGNOSE_FINDING_SCOPE);
 * - FINAL_REVIEW: PASS carries no findings, FAIL carries at least one
 *   finding with a CRITICAL basis (FINAL_REVIEW_PASS_WITH_FINDINGS,
 *   FINAL_REVIEW_FAIL_WITHOUT_FINDINGS,
 *   FINAL_REVIEW_FAIL_WITHOUT_CRITICAL); findings reference named
 *   checklist invariants only (FINAL_REVIEW_UNKNOWN_INVARIANT) and their
 *   evidence refs resolve to retained non-marker evidence
 *   (FINDING_EVIDENCE_UNRESOLVED); the at-most-one adjacent critical
 *   defect appears only under FAIL, its evidence refs resolve to
 *   retained non-marker evidence (ADJACENT_EVIDENCE_UNRESOLVED), and its
 *   lockedRequirementRef resolves to a declared bound requirement of the
 *   ask (ADJACENT_REQUIREMENT_UNBOUND) —
 *   (FINAL_REVIEW_ADJACENT_WITHOUT_FAIL);
 * - RECHECK: RESOLVED carries no findings, NOT_RESOLVED carries at least
 *   one (RECHECK_RESOLVED_WITH_FINDINGS,
 *   RECHECK_UNRESOLVED_WITHOUT_FINDINGS); findings may reference only
 *   the prior finding or explicitly bound neighboring invariants — never
 *   reopen the entire task (RECHECK_REOPEN) — and their evidence refs
 *   resolve within the retained delta evidence universe only
 *   (RECHECK_EVIDENCE_UNRESOLVED);
 * - no generic cleanup/refactoring recommendations in ANY response
 *   text-bearing field — decision summary, findings, adjacent summaries,
 *   failure/root-cause/repair prose, exact-test/verification prose,
 *   amendments (UNBOUNDED_RECOMMENDATION);
 * - response evidence fits the ask's evidence budget (or the default)
 *   (RESPONSE_EVIDENCE_BUDGET_EXCEEDED).
 *
 * Repair-ticket rules (`validateRepairTicket`):
 * - ticketId must equal the compiled repairId (TICKET_ID_MISMATCH);
 * - with the source ask/response: binding rules (TICKET_SOURCE_MISMATCH).
 */

import { validateAgainstSchema } from '../../shared/schema/validate.mjs';
import { loadSolSchema } from './registry.mjs';
import {
  SOL_CALL_TYPES,
  SOL_VERDICTS,
  solTypeBlockFor,
  MAX_ADJACENT_CRITICAL_DEFECTS,
} from './call-types.mjs';
import { adjacentDefectFindingId, isValidSolAskId, isValidSolResponseId } from './ids.mjs';
import {
  evidenceByteLength,
  isValidTruncationMarker,
  TRUNCATION_MARKER_REF,
  DEFAULT_EVIDENCE_BUDGET,
  EVIDENCE_BUDGET_OVERFLOW_MODES,
} from './evidence.mjs';
import {
  validateSemanticContract,
  isAuthoritative,
} from '../../contracts/validate.mjs';
import { canonicalizeJson, sha256Hex } from '../../contracts/digest.mjs';

/** Error codes emitted by SOL ask validation beyond the schema engine. */
export const SOL_ASK_ERROR_CODES = Object.freeze([
  'EVIDENCE_BUDGET_EXCEEDED',
  'INVALID_TRUNCATION_MARKER',
  'INVALID_EVIDENCE_BUDGET',
  'EVIDENCE_REF_UNRESOLVED',
  'EVIDENCE_REF_MARKER',
  'CONDITION_EVIDENCE_REF_UNDECLARED',
  'RECHECK_NONDELTA_EVIDENCE',
  'TYPE_BLOCK_MISMATCH',
  'CROSS_TYPE_BLOCKS',
  'RESPONSE_SHAPE_MISMATCH',
  'CRITERION_NOT_DECLARED',
  'CRITERION_UNKNOWN_TO_SOURCE',
  'CRITERION_REQUIREMENT_MISMATCH',
  'CONTRACT_REF_UNBOUND',
  'REQUIREMENT_REF_UNBOUND',
  'SOURCE_INVALID',
  'SOURCE_NOT_IMPLEMENTATION_AUTHORITATIVE',
  'INVARIANT_REQUIREMENT_UNBOUND',
  'NEIGHBOR_UNBOUND',
  'PRIOR_FINDING_UNKNOWN',
  'PRIOR_CHAIN_INVALID',
  'PRIOR_FINDING_DIGEST_MISMATCH',
  'DUPLICATE_INVARIANT_ID',
  'INVALID_REPAIR_CONSTRAINTS',
]);

/** Error codes emitted by SOL response validation beyond the schema engine. */
export const SOL_RESPONSE_ERROR_CODES = Object.freeze([
  'VERDICT_NOT_IN_VOCABULARY',
  'ASK_ID_MISMATCH',
  'CALL_TYPE_MISMATCH',
  'TYPE_BLOCK_MISMATCH',
  'FINDINGS_NOT_ALLOWED',
  'CONTRACT_CHECK_AMENDMENT_MISMATCH',
  'AMENDMENT_CONTRACT_UNKNOWN',
  'DIAGNOSE_FAILURE_MISMATCH',
  'FAILURE_EVIDENCE_UNRESOLVED',
  'EVIDENCE_REF_MARKER',
  'FAILURE_SCOPE_UNBOUNDED',
  'FAILURE_TARGET_COUNT_EXCEEDED',
  'FAILURE_MUST_NOT_CHANGE_MISSING',
  'TEST_CRITERION_UNKNOWN',
  'TEST_EXPECTATION_MISMATCH',
  'DIAGNOSE_FINDING_SCOPE',
  'FINAL_REVIEW_PASS_WITH_FINDINGS',
  'FINAL_REVIEW_FAIL_WITHOUT_FINDINGS',
  'FINAL_REVIEW_FAIL_WITHOUT_CRITICAL',
  'FINAL_REVIEW_UNKNOWN_INVARIANT',
  'FINDING_EVIDENCE_UNRESOLVED',
  'ADJACENT_EVIDENCE_UNRESOLVED',
  'ADJACENT_REQUIREMENT_UNBOUND',
  'FINAL_REVIEW_ADJACENT_WITHOUT_FAIL',
  'RECHECK_RESOLVED_WITH_FINDINGS',
  'RECHECK_UNRESOLVED_WITHOUT_FINDINGS',
  'RECHECK_REOPEN',
  'RECHECK_EVIDENCE_UNRESOLVED',
  'RECHECK_RESPONSE_EVIDENCE_FORBIDDEN',
  'UNBOUNDED_RECOMMENDATION',
  'RESPONSE_EVIDENCE_BUDGET_EXCEEDED',
]);

/** Error codes emitted by repair-ticket validation beyond the schema engine. */
export const SOL_TICKET_ERROR_CODES = Object.freeze([
  'TICKET_ID_MISMATCH',
  'TICKET_SOURCE_MISMATCH',
]);

/** Generic cleanup/refactoring recommendation phrasing in bounded output. */
const UNBOUNDED_RECOMMENDATION_PATTERNS = [
  /\b(recommend|suggest|consider)\b[^.]{0,80}\b(cleanup|refactoring|code\s+style|cosmetic)\b/i,
  /\b(cleanup|refactoring|code\s+style)\b[^.]{0,80}\b(recommend|suggest|consider)\b/i,
  /\b(perform|do|carry\s+out|execute)\b[^.]{0,60}\b(cleanup|refactoring)\b/i,
  /\b(general|generic|broad|open-ended)\s+(cleanup|refactoring)\b/i,
];

/**
 * Syntactic evidence-ref token shape: `ev.` + dotted identifier. Only
 * tokens of this shape (or an EXACT pool evidence ref) trigger the
 * condition-dependency closure rule — arbitrary prose is never parsed
 * for meaning (SOL-S06-004).
 */
const EVIDENCE_REF_TOKEN_PATTERN = /\bev\.[A-Za-z0-9][A-Za-z0-9._-]*\b/g;

/** Escape a ref for use inside a RegExp word-boundary match. */
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Collect the evidence-ref tokens a condition textually references:
 * every `ev.*`-shaped token plus every exact (escaped) pool ref that
 * appears word-bounded in the prose. This is syntactic token closure,
 * not natural-language dependency discovery (SOL-S06-004).
 * @param {string} text condition prose
 * @param {string[]} poolRefs refs of the retained evidence universe
 * @returns {Set<string>}
 */
function conditionMentionedEvidenceRefs(text, poolRefs) {
  const mentioned = new Set();
  if (typeof text !== 'string') return mentioned;
  for (const m of text.matchAll(EVIDENCE_REF_TOKEN_PATTERN)) {
    mentioned.add(m[0]);
  }
  for (const ref of poolRefs) {
    if (new RegExp(`\\b${escapeRegExp(ref)}\\b`).test(text)) mentioned.add(ref);
  }
  return mentioned;
}

/** Implementation-facing call types: implementation authority required. */
const IMPLEMENTATION_FACING_CALL_TYPES = Object.freeze([
  'SOL_DIAGNOSE',
  'SOL_FINAL_REVIEW',
  'SOL_RECHECK',
]);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function push(errors, path, code, message) {
  errors.push({ path, code, message });
}

/** True when an evidence ref is the reserved truncation marker ref. */
function isMarkerRef(ref) {
  return ref === TRUNCATION_MARKER_REF;
}

/**
 * Resolvable evidence refs of a document: refs of its evidence pool that
 * are NOT the truncation marker (the marker is never substantive
 * evidence, SOL-S06-004).
 * @param {object} doc - ask or response document
 * @returns {Set<string>}
 */
export function resolvableEvidenceRefs(doc) {
  const refs = new Set();
  for (const item of doc?.evidence ?? []) {
    if (isPlainObject(item) && typeof item.ref === 'string' && !isMarkerRef(item.ref)) {
      refs.add(item.ref);
    }
  }
  return refs;
}

/**
 * Validate a set of supplied Sprint-04 semantic sources with the
 * reviewed Sprint-04 validator. Sources are NEVER repaired or mutated;
 * validation distinguishes schema/content validity (both COMPILED and
 * CONTRACT_REVIEW_REQUIRED documents validate) from implementation
 * authority (COMPILED only).
 *
 * @param {Array<object>} sources
 * @returns {{ valid: boolean, errors: Array<{path, code, message}>, bound: Array<object> }}
 *   `bound` carries the validated sources (with warnings attached) in
 *   order, only when all are valid.
 */
export function validateSourceSet(sources) {
  const errors = [];
  const bound = [];
  if (!Array.isArray(sources) || sources.length === 0) {
    push(errors, 'sources', 'SOURCE_INVALID', 'at least one validated Sprint-04 semantic source must be supplied; no source-free authoritative references are allowed');
    return { valid: false, errors, bound: [] };
  }
  if (sources.length > 8) {
    push(errors, 'sources', 'SOURCE_INVALID', `at most 8 sources may be bound to one ask, got ${sources.length}`);
    return { valid: false, errors, bound: [] };
  }
  for (const [i, source] of sources.entries()) {
    if (!isPlainObject(source)) {
      push(errors, `sources[${i}]`, 'SOURCE_INVALID', 'each source must be a plain object (compiled lcim.semantic-contract document)');
      continue;
    }
    let result;
    try {
      result = validateSemanticContract(source);
    } catch (err) {
      push(errors, `sources[${i}]`, 'SOURCE_INVALID', `source could not be validated with the Sprint-04 validator: ${err.message}`);
      continue;
    }
    if (!result.valid) {
      push(
        errors,
        `sources[${i}]`,
        'SOURCE_INVALID',
        `source '${source.contractKey ?? '<missing contractKey>'}' failed Sprint-04 validation (${result.errors[0]?.message ?? 'unknown error'})`,
      );
      continue;
    }
    bound.push(source);
  }
  return { valid: errors.length === 0, errors, bound };
}

/** @param {object} source — validated lcim.semantic-contract document */
export function isImplementationAuthoritative(source) {
  return isAuthoritative(source);
}

/** @param {object} source — validated lcim.semantic-contract document */
export function sourceCompileStatus(source) {
  return source?.compileStatus;
}

/**
 * Find the source spec (negative side-effect item) for a criterion ref.
 * @param {Array<object>} sources validated sources
 * @param {string} criterion sideEffectId
 * @returns {{source: object, spec: object}|undefined}
 */
export function findCriterionSpec(sources, criterion) {
  for (const source of sources ?? []) {
    const spec = (source.negativeSideEffects ?? []).find((s) => s.sideEffectId === criterion);
    if (spec !== undefined) return { source, spec };
  }
  return undefined;
}

/**
 * Validate a compiled SOL ask.
 * @param {object} doc - compiled lcim.sol-ask document
 * @param {{ sources?: Array<object>, prior?: {ask: object, response: object} }} [opts]
 *   - sources: validated Sprint-04 semantic contract documents. When
 *     supplied, EVERY contractRef must bind by (contractKey,
 *     semanticDigest) and EVERY requirementRef must resolve; authority
 *     is distinguished per call type. Without sources only intrinsic
 *     rules run (static-fixture path; the ask compiler itself always
 *     supplies sources).
 *   - prior: {ask, response} provenance for SOL_RECHECK — the validated
 *     prior compiled ask and response the prior finding comes from.
 * @returns {{ valid: boolean, errors: Array<{path, message, code?}>, warnings: Array }}
 */
export function validateSolAsk(doc, opts = {}) {
  const result = validateAgainstSchema(doc, loadSolSchema('lcim.sol-ask'));
  const errors = [...result.errors];
  const warnings = [];
  if (result.valid && isPlainObject(doc)) {
    applyAskRules(doc, opts.sources, opts.prior, errors);
  }
  return { valid: errors.length === 0, errors, warnings };
}

function applyAskRules(doc, sources, prior, errors) {
  const budget = isPlainObject(doc.evidenceBudget) ? doc.evidenceBudget : null;

  // --- budget magnitudes (engine subset has no minimum) -------------------
  if (budget !== null) {
    for (const key of ['maxItems', 'maxBytes']) {
      if (typeof budget[key] !== 'number' || !Number.isInteger(budget[key]) || budget[key] < 1) {
        push(
          errors,
          `evidenceBudget.${key}`,
          'INVALID_EVIDENCE_BUDGET',
          `evidence budget ${key} must be a positive integer, got ${JSON.stringify(budget[key])}`,
        );
      }
    }
    if (!EVIDENCE_BUDGET_OVERFLOW_MODES.includes(budget.onOverflow)) {
      push(
        errors,
        'evidenceBudget.onOverflow',
        'INVALID_EVIDENCE_BUDGET',
        `evidence budget onOverflow must be one of ${EVIDENCE_BUDGET_OVERFLOW_MODES.join(', ')}`,
      );
    }
  }

  // --- compiled evidence fits its own budget (fail closed) -----------------
  // `evidence` is the ONE closed retained evidence universe: call-specific
  // decision evidence (diagnose prior evidence, recheck delta evidence)
  // is normalized into it at compile time, so the budget covers ALL
  // evidence SOL can use (SOL-S06-003).
  const measured = evidenceByteLength(doc.evidence);
  if (budget !== null && (measured.items > budget.maxItems || measured.bytes > budget.maxBytes)) {
    push(
      errors,
      'evidence',
      'EVIDENCE_BUDGET_EXCEEDED',
      `evidence universe (${measured.items} items, ${measured.bytes} bytes) exceeds the compiled ask's evidence budget (${budget.maxItems} items, ${budget.maxBytes} bytes); oversized ambiguous packets are rejected, never silently broadened`,
    );
  }

  // --- truncation marker rules --------------------------------------------
  const evidence = Array.isArray(doc.evidence) ? doc.evidence : [];
  for (const [i, item] of evidence.entries()) {
    if (item?.ref === TRUNCATION_MARKER_REF) {
      if (!isValidTruncationMarker(item)) {
        push(errors, `evidence[${i}]`, 'INVALID_TRUNCATION_MARKER', `evidence item '${TRUNCATION_MARKER_REF}' must be a well-formed truncation marker`);
      } else if (budget?.onOverflow !== 'TRUNCATE_SUMMARIZE') {
        push(errors, `evidence[${i}]`, 'INVALID_TRUNCATION_MARKER', `truncation marker is only allowed when evidenceBudget.onOverflow is TRUNCATE_SUMMARIZE`);
      } else if (i !== evidence.length - 1) {
        push(errors, `evidence[${i}]`, 'INVALID_TRUNCATION_MARKER', 'truncation marker must be the last evidence item');
      }
    }
  }

  // --- decision-bearing evidence refs resolve to retained NON-MARKER pool items
  const poolRefs = [...resolvableEvidenceRefs(doc)];
  const refFields = [
    ['passEvidenceRefs', doc.passEvidenceRefs],
    ['failEvidenceRefs', doc.failEvidenceRefs],
    ['diagnose.priorEvidenceRefs', doc.diagnose?.priorEvidenceRefs],
    ['recheck.deltaEvidenceRefs', doc.recheck?.deltaEvidenceRefs],
  ];
  for (const [field, refs] of refFields) {
    for (const [i, ref] of (refs ?? []).entries()) {
      if (isMarkerRef(ref)) {
        push(errors, `${field}[${i}]`, 'EVIDENCE_REF_MARKER', `'${TRUNCATION_MARKER_REF}' is a truncation marker, not substantive evidence; it can never be cited as decision evidence`);
      } else if (!poolRefs.includes(ref)) {
        push(errors, `${field}[${i}]`, 'EVIDENCE_REF_UNRESOLVED', `evidence ref '${ref}' does not resolve to a retained NON-MARKER item of the ask's evidence universe`);
      }
    }
  }

  // --- condition evidence dependencies are structured and mechanically closed
  // (SOL-S06-004): if passCondition/failCondition prose names an
  // evidence-ref token (`ev.*` shape or an exact pool ref), that token
  // MUST also appear in the corresponding structured dependency list;
  // otherwise the condition could silently depend on dropped evidence.
  // The reserved truncation-marker ref is NEVER admissible in condition
  // prose: it is metadata signaling omission, not substantive evidence,
  // and must never influence pass/fail semantics — this holds against
  // the authored condition text independently of whether any truncation
  // actually occurred (SOL-S06-004 R3).
  const conditions = [
    ['passCondition', doc.passCondition, doc.passEvidenceRefs ?? []],
    ['failCondition', doc.failCondition, doc.failEvidenceRefs ?? []],
  ];
  for (const [field, text, declared] of conditions) {
    if (typeof text === 'string' && text.includes(TRUNCATION_MARKER_REF)) {
      push(errors, field, 'EVIDENCE_REF_MARKER', `condition prose references '${TRUNCATION_MARKER_REF}'; the truncation marker is metadata signaling omission, not substantive evidence — it must never be declared, cited, or textually relied upon as decision evidence, even when no truncation occurred`);
    }
    const declaredSet = new Set(declared);
    for (const token of conditionMentionedEvidenceRefs(text, poolRefs)) {
      if (!declaredSet.has(token)) {
        push(errors, field, 'CONDITION_EVIDENCE_REF_UNDECLARED', `condition mentions evidence ref '${token}' which is not declared in the corresponding structured dependency list (${field === 'passCondition' ? 'passEvidenceRefs' : 'failEvidenceRefs'}); condition evidence dependencies must be structured and mechanically closed — a decision condition may never depend on evidence that can be silently dropped`);
      }
    }
  }

  // --- RECHECK: the evidence universe is delta-only ------------------------
  if (doc.callType === 'SOL_RECHECK') {
    const deltaRefs = new Set(doc.recheck?.deltaEvidenceRefs ?? []);
    for (const [i, item] of evidence.entries()) {
      if (item?.ref === TRUNCATION_MARKER_REF) continue; // marker is not evidence
      if (!deltaRefs.has(item?.ref)) {
        push(errors, `evidence[${i}].ref`, 'RECHECK_NONDELTA_EVIDENCE', `RECHECK's SOL-visible evidence universe must be exactly its retained delta evidence; pool item '${item?.ref}' is not referenced by recheck.deltaEvidenceRefs`);
      }
    }
  }

  // --- per-type block: exactly one, matching the call type -----------------
  const blocks = ['contractCheck', 'diagnose', 'finalReview', 'recheck'].filter(
    (b) => doc[b] !== undefined,
  );
  const expected = solTypeBlockFor(doc.callType);
  if (blocks.length === 0) {
    push(errors, 'callType', 'TYPE_BLOCK_MISMATCH', `call type '${doc.callType}' requires the '${expected}' block`);
  } else if (blocks.length > 1) {
    push(errors, 'callType', 'CROSS_TYPE_BLOCKS', `a compiled ask carries exactly one per-type block; found ${blocks.join(', ')} (one primary decision question, one call type)`);
  } else if (blocks[0] !== expected) {
    push(errors, `callType`, 'TYPE_BLOCK_MISMATCH', `call type '${doc.callType}' requires the '${expected}' block, got '${blocks[0]}'`);
  }

  // --- verdict vocabulary is type-locked -----------------------------------
  const shape = isPlainObject(doc.requiredResponseShape) ? doc.requiredResponseShape : null;
  const canonical = SOL_VERDICTS[doc.callType] ?? [];
  if (shape !== null && Array.isArray(shape.verdicts)) {
    const sameLength = shape.verdicts.length === canonical.length;
    const sameValues = shape.verdicts.every((v, i) => v === canonical[i]);
    if (!sameLength || !sameValues) {
      push(
        errors,
        'requiredResponseShape.verdicts',
        'RESPONSE_SHAPE_MISMATCH',
        `call type '${doc.callType}' locks its verdict vocabulary to [${canonical.join(', ')}]; the compiled ask must not redefine it`,
      );
    }
  }

  // --- repair constraints ---------------------------------------------------
  const constraints = isPlainObject(doc.repairConstraints) ? doc.repairConstraints : null;
  if (
    constraints !== null &&
    (typeof constraints.maxMustChangeTargets !== 'number' ||
      !Number.isInteger(constraints.maxMustChangeTargets) ||
      constraints.maxMustChangeTargets < 1)
  ) {
    push(
      errors,
      'repairConstraints.maxMustChangeTargets',
      'INVALID_REPAIR_CONSTRAINTS',
      'repairConstraints.maxMustChangeTargets must be a positive integer',
    );
  }

  // --- DIAGNOSE: the criterion must be declared among contract refs --------
  const diagnose = isPlainObject(doc.diagnose) ? doc.diagnose : null;
  if (doc.callType === 'SOL_DIAGNOSE' && diagnose !== null) {
    const declared = declaredRequirementRefs(doc);
    if (!declared.has(diagnose.acceptanceCriterionRef)) {
      push(
        errors,
        'diagnose.acceptanceCriterionRef',
        'CRITERION_NOT_DECLARED',
        `DIAGNOSE criterion '${diagnose.acceptanceCriterionRef}' is not declared among contractRefs[].requirementRefs; the ask must name the authoritative requirement it asks about`,
      );
    }
  }

  // --- FINAL_REVIEW: named invariant checklist is unique and bound ----------
  const finalReview = isPlainObject(doc.finalReview) ? doc.finalReview : null;
  if (doc.callType === 'SOL_FINAL_REVIEW' && finalReview !== null) {
    const seen = new Set();
    for (const [i, inv] of (finalReview.invariantChecklist ?? []).entries()) {
      if (seen.has(inv?.invariantId)) {
        push(errors, `finalReview.invariantChecklist[${i}].invariantId`, 'DUPLICATE_INVARIANT_ID', `invariant id '${inv.invariantId}' is used more than once; the checklist names each high-risk invariant exactly once`);
      }
      seen.add(inv?.invariantId);
    }
  }

  // --- cross-document rules with validated Sprint-04 sources (SOL-S06-002) --
  if (sources !== undefined) {
    applySourceBindingRules(doc, sources, prior, errors);
  }

  // --- RECHECK prior-finding provenance (SOL-S06-008) -----------------------
  if (doc.callType === 'SOL_RECHECK' && prior !== undefined) {
    applyPriorProvenanceRules(doc, prior, errors);
  }
}

/** Union of every requirementRef declared in the ask's contractRefs. */
function declaredRequirementRefs(doc) {
  const declared = new Set();
  for (const ref of Array.isArray(doc.contractRefs) ? doc.contractRefs : []) {
    for (const r of ref?.requirementRefs ?? []) declared.add(r);
  }
  return declared;
}

function applySourceBindingRules(doc, sources, prior, errors) {
  const sourceResult = validateSourceSet(sources);
  if (!sourceResult.valid) {
    for (const e of sourceResult.errors) errors.push(e);
    return;
  }
  const boundSources = sourceResult.bound;

  // --- EVERY contractRef binds by (contractKey + semanticDigest) -----------
  const byKeyAndDigest = new Map();
  for (const source of boundSources) {
    byKeyAndDigest.set(`${source.contractKey}\u0000${source.semanticDigest}`, source);
  }
  for (const [i, ref] of (doc.contractRefs ?? []).entries()) {
    if (typeof ref?.semanticDigest !== 'string' || typeof ref?.contractKey !== 'string') {
      push(errors, `contractRefs[${i}]`, 'CONTRACT_REF_UNBOUND', `contractRef '${ref?.contractKey ?? '<no key>'}' carries no (contractKey, semanticDigest) binding; no source-free authoritative references are allowed`);
      continue;
    }
    const source = byKeyAndDigest.get(`${ref.contractKey}\u0000${ref.semanticDigest}`);
    if (source === undefined) {
      push(errors, `contractRefs[${i}]`, 'CONTRACT_REF_UNBOUND', `contractRef '${ref.contractKey}' (digest '${ref.semanticDigest}') does not bind to any supplied validated Sprint-04 source; invented keys/digests are rejected`);
      continue;
    }
    // --- EVERY requirementRef resolves to a source negative side-effect ----
    for (const [j, r] of (ref.requirementRefs ?? []).entries()) {
      const spec = (source.negativeSideEffects ?? []).find((s) => s.sideEffectId === r);
      if (spec === undefined) {
        push(errors, `contractRefs[${i}].requirementRefs[${j}]`, 'REQUIREMENT_REF_UNBOUND', `requirementRef '${r}' does not resolve to a negative side-effect acceptance item of source '${source.contractKey}'`);
      }
    }
  }

  // --- authority distinction (SOL-S06-002) ----------------------------------
  // CONTRACT_CHECK may review valid COMPILED or CONTRACT_REVIEW_REQUIRED
  // sources — review does not confer implementation authority.
  // Implementation-facing calls require implementation-authoritative
  // (valid + COMPILED) bound sources.
  if (IMPLEMENTATION_FACING_CALL_TYPES.includes(doc.callType)) {
    for (const [i, ref] of (doc.contractRefs ?? []).entries()) {
      if (typeof ref?.contractKey !== 'string' || typeof ref?.semanticDigest !== 'string') continue;
      const source = byKeyAndDigest.get(`${ref.contractKey}\u0000${ref.semanticDigest}`);
      if (source === undefined) continue; // already reported as unbound
      if (source.compileStatus !== 'COMPILED') {
        push(
          errors,
          `contractRefs[${i}]`,
          'SOURCE_NOT_IMPLEMENTATION_AUTHORITATIVE',
          `call type '${doc.callType}' is implementation-facing and requires implementation-authoritative sources; source '${source.contractKey}' is '${source.compileStatus}' — review of review-required input is CONTRACT_CHECK's job and never confers implementation authority`,
        );
      }
    }
  }

  // --- FINAL_REVIEW: locked requirement refs are declared bound requirements
  if (doc.callType === 'SOL_FINAL_REVIEW' && isPlainObject(doc.finalReview)) {
    const declared = declaredRequirementRefs(doc);
    for (const [i, inv] of (doc.finalReview.invariantChecklist ?? []).entries()) {
      if (!declared.has(inv?.lockedRequirementRef)) {
        push(errors, `finalReview.invariantChecklist[${i}].lockedRequirementRef`, 'INVARIANT_REQUIREMENT_UNBOUND', `invariant '${inv?.invariantId}' locks requirement '${inv?.lockedRequirementRef}' which is not a declared requirementRef of the ask; locked requirements must resolve to validated bound source requirements`);
      }
    }
  }

  // --- RECHECK: neighboring invariants resolve to a closed authoritative set
  // (declared requirementRefs of the ask = bound source requirement IDs).
  // The set is ask-internal so revalidation is self-contained; the prior
  // finding provenance (frozen in the ask) never re-opens the neighbor set.
  if (doc.callType === 'SOL_RECHECK' && isPlainObject(doc.recheck)) {
    const closed = declaredRequirementRefs(doc);
    for (const [i, neighbor] of (doc.recheck.neighboringInvariants ?? []).entries()) {
      if (!closed.has(neighbor)) {
        push(errors, `recheck.neighboringInvariants[${i}]`, 'NEIGHBOR_UNBOUND', `neighboring invariant '${neighbor}' is not a declared requirementRef of the ask; arbitrary caller strings are not neighbors — neighbors resolve to bound source requirement IDs`);
      }
    }
  }

  // --- DIAGNOSE criterion resolution against the bound source --------------
  if (doc.callType === 'SOL_DIAGNOSE' && isPlainObject(doc.diagnose)) {
    const criterion = doc.diagnose.acceptanceCriterionRef;
    const found = findCriterionSpec(boundSources, criterion);
    if (found === undefined) {
      push(errors, 'diagnose.acceptanceCriterionRef', 'CRITERION_UNKNOWN_TO_SOURCE', `DIAGNOSE criterion '${criterion}' does not resolve to a negative side-effect acceptance item of any bound source`);
    } else if (doc.diagnose.criterionRequirement !== found.spec.requirement) {
      push(errors, 'diagnose.criterionRequirement', 'CRITERION_REQUIREMENT_MISMATCH', `DIAGNOSE criterionRequirement does not match the source requirement exactly (source: '${found.spec.requirement}'); the ask must quote the authoritative requirement verbatim`);
    }
  }
}

function applyPriorProvenanceRules(doc, prior, errors) {
  const priorAsk = prior?.ask;
  const priorResponse = prior?.response;
  if (!isPlainObject(priorAsk) || !isPlainObject(priorResponse)) {
    push(errors, 'recheck.priorFindingRef', 'PRIOR_CHAIN_INVALID', 'RECHECK requires the validated prior compiled ask and prior compiled response');
    return;
  }
  // (1) the prior ask must ITSELF be a valid compiled SOL ask
  // (SOL-S06-FINAL-001). A partial invented prior ask that carries only
  // enough plausible fields (pattern-valid askId, matching callType,
  // FINAL_REVIEW checklist structure) to feed later provenance use is not
  // a compiled ask and fails the exact-prior-chain requirement closed.
  // Validated with the same Sprint-06 machinery as an actual compiled ask
  // (no sources/prior opts: the immediate chain is all the controller
  // supplies, and a prior ask that is itself a RECHECK ask cannot recurse
  // — its own provenance is not re-validated here, so validation depth is
  // bounded at one prior link).
  const priorAskCheck = validateSolAsk(priorAsk);
  if (!priorAskCheck.valid) {
    push(errors, 'recheck.priorAskId', 'PRIOR_CHAIN_INVALID', `the prior ask is not a valid compiled SOL ask (${priorAskCheck.errors[0]?.message ?? 'invalid'}); an invented partial prior ask can never anchor a RECHECK chain`);
    return;
  }
  // (2) the prior response itself must bind to that validated prior ask
  const priorChain = validateSolResponse(priorResponse, { ask: priorAsk });
  if (!priorChain.valid) {
    push(errors, 'recheck.priorFindingRef', 'PRIOR_CHAIN_INVALID', `the prior response does not bind to its prior ask (${priorChain.errors[0]?.message ?? 'invalid'})`);
    return;
  }
  // (3) the referenced prior finding must actually belong to that chain:
  // frozen provenance ids bind, the finding resolves to a real finding of
  // the bound prior response, and the frozen digest matches its content.
  if (doc.recheck?.priorAskId !== priorAsk.askId || doc.recheck?.priorResponseId !== priorResponse.responseId) {
    push(errors, 'recheck.priorAskId', 'PRIOR_CHAIN_INVALID', `frozen provenance (${doc.recheck?.priorAskId}, ${doc.recheck?.priorResponseId}) does not bind to the supplied prior ask/response (${priorAsk.askId}, ${priorResponse.responseId})`);
  }
  const findings = Array.isArray(priorResponse.findings) ? priorResponse.findings : [];
  let finding = findings.find((f) => f?.findingId === doc.recheck?.priorFindingRef);
  if (finding === undefined) {
    // Fifth-review rule: an accepted adjacentCriticalDefect is an
    // authoritative defect record with a deterministic controller
    // identity; the exact RECHECK of that defect resolves through the
    // same deterministic identity.
    const adjacent = Array.isArray(priorResponse.adjacentCriticalDefects)
      ? priorResponse.adjacentCriticalDefects.find((d) => adjacentDefectFindingId(d) === doc.recheck?.priorFindingRef)
      : undefined;
    if (adjacent !== undefined) finding = adjacent;
  }
  if (finding === undefined) {
    push(errors, 'recheck.priorFindingRef', 'PRIOR_FINDING_UNKNOWN', `prior finding '${doc.recheck?.priorFindingRef}' does not resolve to an actual finding (or accepted adjacent critical defect) of the bound prior response; invented or swapped finding refs are rejected`);
    return;
  }
  const derivedDigest = sha256Hex(JSON.stringify(canonicalizeJson(finding)));
  if (doc.recheck?.priorFindingDigest !== derivedDigest) {
    push(errors, 'recheck.priorFindingDigest', 'PRIOR_FINDING_DIGEST_MISMATCH', `frozen priorFindingDigest '${doc.recheck?.priorFindingDigest}' does not match the content digest of the resolved prior finding ('${derivedDigest}')`);
  }
}

/**
 * Validate a compiled SOL response.
 * @param {object} doc - compiled lcim.sol-response document
 * @param {{ ask?: object, sources?: Array<object> }} [opts] - the
 *   compiled ask (for askId/callType/scope/budget/ref binding; the
 *   response compiler requires it, this lower-level path keeps it
 *   optional for static fixtures) and validated sources (for DIAGNOSE
 *   repair-scope rules).
 * @returns {{ valid: boolean, errors: Array<{path, message, code?}>, warnings: Array }}
 */
export function validateSolResponse(doc, opts = {}) {
  const result = validateAgainstSchema(doc, loadSolSchema('lcim.sol-response'));
  const errors = [...result.errors];
  const warnings = [];
  if (result.valid && isPlainObject(doc)) {
    applyResponseRules(doc, opts.ask, opts.sources, errors);
  }
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * ONE deterministic structural collector for ALL model-authored free-text
 * fields of a response (SOL-S06-007). The unbounded-recommendation scan
 * applies to every collected field — response evidence content, finding
 * summaries, adjacent summaries, amendments, DIAGNOSE prose, repair
 * prose, exact-test name/command/expectation (commands are model-authored
 * text and are never trusted merely because they look executable;
 * source-verbatim criterion-bound expectations are excluded),
 * verification, falsification.
 *
 * Deliberately NOT collected (never scanned): schema metadata,
 * controller-generated IDs, enum values, evidence refs, and
 * source-authoritative text that the response merely references
 * verbatim (criterion-bound exact-test expectations equal the source
 * requirement by contract and are excluded).
 */
function collectModelAuthoredText(doc) {
  const parts = [];
  const add = (v) => {
    if (typeof v === 'string' && v.length > 0) parts.push(v);
  };
  add(doc.decisionSummary);
  // response evidence content is model-authored output
  for (const item of doc.evidence ?? []) add(item?.content);
  for (const f of doc.findings ?? []) add(f?.summary);
  for (const a of doc.adjacentCriticalDefects ?? []) add(a?.summary);
  for (const am of doc.amendment?.exactAmendments ?? []) {
    add(am?.current);
    add(am?.exactAmendment);
    add(am?.reason);
  }
  add(doc.failure?.rootCause);
  add(doc.failure?.falsification);
  for (const m of doc.failure?.repair?.mustChange ?? []) add(m?.change);
  for (const m of doc.failure?.repair?.mustNotChange ?? []) add(m?.reason);
  for (const t of doc.failure?.repair?.exactTests ?? []) {
    add(t?.name);
    // command is model-authored text, not trusted just because it looks
    // executable (SOL-S06-007 R3)
    add(t?.command);
    // criterion-bound expectations are source-verbatim (equal the source
    // requirement by contract): source-authoritative text, not model
    // recommendation output — never scanned
    if (t?.acceptanceCriterionRef === undefined) add(t?.expectation);
  }
  for (const v of doc.failure?.repair?.verification ?? []) {
    add(v?.method);
    add(v?.expectation);
  }
  return parts.join(' ');
}

function applyResponseRules(doc, ask, sources, errors) {
  // --- verdict vocabulary ---------------------------------------------------
  const canonical = SOL_VERDICTS[doc.callType] ?? [];
  if (!canonical.includes(doc.verdict)) {
    push(
      errors,
      'verdict',
      'VERDICT_NOT_IN_VOCABULARY',
      `verdict '${doc.verdict}' is not in the verdict vocabulary of call type '${doc.callType}' ([${canonical.join(', ')}])`,
    );
  }

  // --- ask binding -----------------------------------------------------------
  if (ask !== undefined) {
    if (!isPlainObject(ask)) {
      push(errors, 'askId', 'ASK_ID_MISMATCH', 'the supplied ask must be a compiled lcim.sol-ask document');
      return;
    }
    if (ask.askId !== doc.askId) {
      push(errors, 'askId', 'ASK_ID_MISMATCH', `response askId '${doc.askId}' does not bind to supplied ask '${ask.askId}'`);
    }
    if (ask.callType !== doc.callType) {
      push(errors, 'callType', 'CALL_TYPE_MISMATCH', `response callType '${doc.callType}' does not match the ask's '${ask.callType}'`);
    }
  }

  // --- per-type block pairing -------------------------------------------------
  if (doc.amendment !== undefined && doc.callType !== 'SOL_CONTRACT_CHECK') {
    push(errors, 'amendment', 'TYPE_BLOCK_MISMATCH', 'amendment is only allowed in SOL_CONTRACT_CHECK responses');
  }
  if (doc.failure !== undefined && doc.callType !== 'SOL_DIAGNOSE') {
    push(errors, 'failure', 'TYPE_BLOCK_MISMATCH', 'failure is only allowed in SOL_DIAGNOSE responses');
  }
  if (doc.adjacentCriticalDefects !== undefined && doc.callType !== 'SOL_FINAL_REVIEW') {
    push(errors, 'adjacentCriticalDefects', 'TYPE_BLOCK_MISMATCH', 'adjacentCriticalDefects is only allowed in SOL_FINAL_REVIEW responses');
  }
  if (doc.callType === 'SOL_CONTRACT_CHECK' && (doc.findings ?? []).length > 0) {
    push(errors, 'findings', 'FINDINGS_NOT_ALLOWED', 'SOL_CONTRACT_CHECK responses carry no findings; they decide exact-semantics sufficiency and return exact amendments');
  }

  // --- bounded evidence budget (ask's budget, or the default) ----------------
  const budget = isPlainObject(ask?.evidenceBudget) ? ask.evidenceBudget : DEFAULT_EVIDENCE_BUDGET;
  const measured = evidenceByteLength(doc.evidence);
  if (measured.items > budget.maxItems || measured.bytes > budget.maxBytes) {
    push(
      errors,
      'evidence',
      'RESPONSE_EVIDENCE_BUDGET_EXCEEDED',
      `response evidence (${measured.items} items, ${measured.bytes} bytes) exceeds the evidence budget (${budget.maxItems} items, ${budget.maxBytes} bytes); response evidence is bounded by the ask's budget`,
    );
  }
  const evidence = Array.isArray(doc.evidence) ? doc.evidence : [];
  for (const [i, item] of evidence.entries()) {
    if (item?.ref === TRUNCATION_MARKER_REF) {
      if (!isValidTruncationMarker(item)) {
        push(errors, `evidence[${i}]`, 'INVALID_TRUNCATION_MARKER', `evidence item '${TRUNCATION_MARKER_REF}' must be a well-formed truncation marker`);
      } else if (i !== evidence.length - 1) {
        push(errors, `evidence[${i}]`, 'INVALID_TRUNCATION_MARKER', 'truncation marker must be the last evidence item');
      }
    }
  }

  // --- no generic cleanup/refactoring recommendations in ANY bounded output --
  for (const re of UNBOUNDED_RECOMMENDATION_PATTERNS) {
    if (re.test(collectModelAuthoredText(doc))) {
      push(
        errors,
        'decisionSummary',
        'UNBOUNDED_RECOMMENDATION',
        `bounded SOL review output must not carry generic cleanup/refactoring recommendations in any text-bearing field (matched '${re.source}'); SOL decides the bounded question, it does not recommend open-ended cleanup`,
      );
      break;
    }
  }

  // --- CONTRACT_CHECK ---------------------------------------------------------
  if (doc.callType === 'SOL_CONTRACT_CHECK') {
    if (doc.verdict === 'SUFFICIENTLY_SPECIFIED' && doc.amendment !== undefined) {
      push(errors, 'amendment', 'CONTRACT_CHECK_AMENDMENT_MISMATCH', 'SUFFICIENTLY_SPECIFIED responses carry no amendment; exact semantics are sufficiently specified');
    }
    if (doc.verdict === 'AMENDMENTS_REQUIRED' && doc.amendment === undefined) {
      push(errors, 'amendment', 'CONTRACT_CHECK_AMENDMENT_MISMATCH', 'AMENDMENTS_REQUIRED responses must carry amendment.exactAmendments (exact amendments, not a general review)');
    }
    if (isPlainObject(doc.amendment) && ask !== undefined) {
      const askKeys = new Set((ask.contractRefs ?? []).map((r) => r?.contractKey));
      for (const [i, a] of (doc.amendment.exactAmendments ?? []).entries()) {
        if (!askKeys.has(a?.contractKey)) {
          push(errors, `amendment.exactAmendments[${i}].contractKey`, 'AMENDMENT_CONTRACT_UNKNOWN', `amendment targets contract '${a?.contractKey}' which is not among the ask's contractRefs`);
        }
      }
    }
  }

  // --- DIAGNOSE -----------------------------------------------------------------
  if (doc.callType === 'SOL_DIAGNOSE') {
    const hasFailure = doc.failure !== undefined;
    if (doc.verdict === 'CAUSE_IDENTIFIED' && !hasFailure) {
      push(errors, 'failure', 'DIAGNOSE_FAILURE_MISMATCH', 'CAUSE_IDENTIFIED responses must carry the complete failure block (root cause, evidence, smallest safe repair, exact tests, falsification)');
    }
    if (doc.verdict === 'CAUSE_UNRESOLVED' && hasFailure) {
      push(errors, 'failure', 'DIAGNOSE_FAILURE_MISMATCH', 'CAUSE_UNRESOLVED responses must not carry a failure block; an unresolved cause compiles into no repair ticket');
    }
    if ((doc.findings ?? []).length > 1) {
      push(errors, 'findings', 'DIAGNOSE_FINDING_SCOPE', 'a DIAGNOSE response carries at most one finding (the diagnosed criterion)');
    }
    if (ask !== undefined && (doc.findings ?? []).length === 1 && doc.findings[0]?.invariantRef !== ask.diagnose?.acceptanceCriterionRef) {
      push(errors, 'findings[0].invariantRef', 'DIAGNOSE_FINDING_SCOPE', `a DIAGNOSE finding must reference the diagnosed criterion '${ask.diagnose?.acceptanceCriterionRef}', got '${doc.findings[0]?.invariantRef}'`);
    }

    if (hasFailure) {
      // evidence refs must resolve to retained NON-MARKER bounded evidence
      const knownRefs = new Set([
        ...resolvableEvidenceRefs(doc),
        ...(ask !== undefined ? resolvableEvidenceRefs(ask) : []),
      ]);
      for (const [i, ref] of (doc.failure.evidenceRefs ?? []).entries()) {
        if (isMarkerRef(ref)) {
          push(errors, `failure.evidenceRefs[${i}]`, 'EVIDENCE_REF_MARKER', `'${TRUNCATION_MARKER_REF}' is a truncation marker, not substantive evidence; it can never satisfy a failure evidence reference`);
        } else if (!knownRefs.has(ref)) {
          push(errors, `failure.evidenceRefs[${i}]`, 'FAILURE_EVIDENCE_UNRESOLVED', `failure evidence ref '${ref}' does not resolve to any retained NON-MARKER evidence item of the ask or the response`);
        }
      }
      // exact tests may reference only the diagnosed criterion, and a
      // criterion-bound test's expectation must equal the source requirement
      if (ask !== undefined) {
        const criterion = ask.diagnose?.acceptanceCriterionRef;
        for (const [i, t] of (doc.failure.repair.exactTests ?? []).entries()) {
          if (t?.acceptanceCriterionRef !== undefined && t.acceptanceCriterionRef !== criterion) {
            push(errors, `failure.repair.exactTests[${i}].acceptanceCriterionRef`, 'TEST_CRITERION_UNKNOWN', `exact test references criterion '${t.acceptanceCriterionRef}' which is not the diagnosed criterion '${criterion}'; DIAGNOSE returns exact tests for one criterion only`);
          }
        }
        // target count bound
        const maxTargets = ask.repairConstraints?.maxMustChangeTargets;
        if (Number.isInteger(maxTargets) && (doc.failure.repair.mustChange ?? []).length > maxTargets) {
          push(errors, 'failure.repair.mustChange', 'FAILURE_TARGET_COUNT_EXCEEDED', `repair mustChange has ${doc.failure.repair.mustChange.length} targets; the ask bounds the smallest safe repair to ${maxTargets}`);
        }
        // must-not-change bound
        if (ask.repairConstraints?.mustNotChangeRequired === true && (doc.failure.repair.mustNotChange ?? []).length === 0) {
          push(errors, 'failure.repair.mustNotChange', 'FAILURE_MUST_NOT_CHANGE_MISSING', 'the ask requires at least one mustNotChange target; the smallest safe repair must name what it preserves');
        }
      }
      // repair scope bound from the bound source(s)
      if (ask !== undefined && sources !== undefined) {
        const found = findCriterionSpec(sources, ask.diagnose?.acceptanceCriterionRef);
        if (found !== undefined) {
          const scope = found.spec.scope;
          for (const [i, m] of (doc.failure.repair.mustChange ?? []).entries()) {
            if (m?.target !== scope) {
              push(errors, `failure.repair.mustChange[${i}].target`, 'FAILURE_SCOPE_UNBOUNDED', `mustChange target '${m?.target}' is outside the diagnosed criterion's side-effect scope '${scope}'; the smallest safe repair never expands beyond the failing requirement`);
            }
          }
          // criterion-bound exact tests pin the source expectation verbatim
          for (const [i, t] of (doc.failure.repair.exactTests ?? []).entries()) {
            if (t?.acceptanceCriterionRef === ask.diagnose?.acceptanceCriterionRef && t.expectation !== found.spec.requirement) {
              push(errors, `failure.repair.exactTests[${i}].expectation`, 'TEST_EXPECTATION_MISMATCH', `criterion-bound exact test expectation must equal the source requirement verbatim ('${found.spec.requirement}'); SOL-authored expectations never redefine authoritative acceptance semantics`);
            }
          }
        }
      }
    }
  }

  // --- FINAL_REVIEW ---------------------------------------------------------------
  if (doc.callType === 'SOL_FINAL_REVIEW') {
    const findings = doc.findings ?? [];
    const adjacent = doc.adjacentCriticalDefects ?? [];
    if (doc.verdict === 'PASS' && findings.length > 0) {
      push(errors, 'findings', 'FINAL_REVIEW_PASS_WITH_FINDINGS', 'a PASS final review carries no findings; every named invariant held');
    }
    if (doc.verdict === 'FAIL' && findings.length === 0) {
      push(errors, 'findings', 'FINAL_REVIEW_FAIL_WITHOUT_FINDINGS', 'a FAIL final review must name at least one failing checklist invariant');
    }
    if (doc.verdict === 'FAIL' && !findings.some((f) => f?.severity === 'CRITICAL') && adjacent.length === 0) {
      push(errors, 'findings', 'FINAL_REVIEW_FAIL_WITHOUT_CRITICAL', 'a FAIL final review requires a CRITICAL basis: a failing high-risk checklist invariant or a directly evidenced adjacent critical defect');
    }
    if (doc.verdict === 'PASS' && adjacent.length > 0) {
      push(errors, 'adjacentCriticalDefects', 'FINAL_REVIEW_ADJACENT_WITHOUT_FAIL', 'an adjacent critical defect is only admissible under a FAIL verdict (directly evidenced and violating a locked requirement)');
    }
    if (adjacent.length > MAX_ADJACENT_CRITICAL_DEFECTS) {
      push(errors, 'adjacentCriticalDefects', 'FINAL_REVIEW_ADJACENT_WITHOUT_FAIL', `at most ${MAX_ADJACENT_CRITICAL_DEFECTS} adjacent critical defect outside the checklist is allowed`);
    }
    if (ask !== undefined && isPlainObject(ask.finalReview)) {
      const checklistIds = new Set(
        (ask.finalReview.invariantChecklist ?? []).map((inv) => inv?.invariantId),
      );
      for (const [i, f] of findings.entries()) {
        if (!checklistIds.has(f?.invariantRef)) {
          push(errors, `findings[${i}].invariantRef`, 'FINAL_REVIEW_UNKNOWN_INVARIANT', `finding references invariant '${f?.invariantRef}' which is not in the ask's named invariant checklist; final review is checklist-bound, never open-ended`);
        }
      }
    }
    // finding evidence refs resolve to retained NON-MARKER evidence
    const knownRefs = new Set([
      ...resolvableEvidenceRefs(doc),
      ...(ask !== undefined ? resolvableEvidenceRefs(ask) : []),
    ]);
    for (const [i, f] of findings.entries()) {
      for (const [j, ref] of (f?.evidenceRefs ?? []).entries()) {
        if (isMarkerRef(ref)) {
          push(errors, `findings[${i}].evidenceRefs[${j}]`, 'EVIDENCE_REF_MARKER', `'${TRUNCATION_MARKER_REF}' is a truncation marker, not substantive evidence; it can never satisfy a finding evidence reference`);
        } else if (!knownRefs.has(ref)) {
          push(errors, `findings[${i}].evidenceRefs[${j}]`, 'FINDING_EVIDENCE_UNRESOLVED', `finding evidence ref '${ref}' does not resolve to a retained NON-MARKER evidence item of the ask or the response`);
        }
      }
    }
    // adjacent critical defect: real, bounded, and locked (SOL-S06-007)
    for (const [i, a] of adjacent.entries()) {
      for (const [j, ref] of (a?.evidenceRefs ?? []).entries()) {
        if (isMarkerRef(ref)) {
          push(errors, `adjacentCriticalDefects[${i}].evidenceRefs[${j}]`, 'EVIDENCE_REF_MARKER', `'${TRUNCATION_MARKER_REF}' is a truncation marker, not substantive evidence; it can never satisfy adjacent-critical evidence`);
        } else if (!knownRefs.has(ref)) {
          push(errors, `adjacentCriticalDefects[${i}].evidenceRefs[${j}]`, 'ADJACENT_EVIDENCE_UNRESOLVED', `adjacent critical defect evidence ref '${ref}' does not resolve to a retained NON-MARKER evidence item of the ask or the response`);
        }
      }
      if (ask !== undefined && !declaredRequirementRefs(ask).has(a?.lockedRequirementRef)) {
        push(errors, `adjacentCriticalDefects[${i}].lockedRequirementRef`, 'ADJACENT_REQUIREMENT_UNBOUND', `adjacent critical defect locks requirement '${a?.lockedRequirementRef}' which is not a declared bound requirement of the ask; made-up locked requirement refs are rejected`);
      }
    }
  }

  // --- RECHECK --------------------------------------------------------------------
  if (doc.callType === 'SOL_RECHECK') {
    // The authoritative SOL-visible evidence universe for RECHECK is the
    // compiled ask's retained delta evidence (SOL-S06-008). The response
    // must not expand or mutate that universe: independent response
    // evidence duplication is prohibited entirely — response.evidence
    // must be empty, and findings cite ask delta evidence directly.
    if ((doc.evidence ?? []).length > 0) {
      push(errors, 'evidence', 'RECHECK_RESPONSE_EVIDENCE_FORBIDDEN', 'a SOL_RECHECK response must not carry its own evidence; the SOL-visible evidence universe is the compiled ask\'s retained delta evidence — response evidence cannot expand or mutate the delta universe');
    }
    const findings = doc.findings ?? [];
    if (doc.verdict === 'RESOLVED' && findings.length > 0) {
      push(errors, 'findings', 'RECHECK_RESOLVED_WITH_FINDINGS', 'a RESOLVED recheck carries no findings; the prior finding is closed');
    }
    if (doc.verdict === 'NOT_RESOLVED' && findings.length === 0) {
      push(errors, 'findings', 'RECHECK_UNRESOLVED_WITHOUT_FINDINGS', 'a NOT_RESOLVED recheck must name the prior finding (or a bound neighboring invariant) that still fails');
    }
    if (ask !== undefined && isPlainObject(ask.recheck)) {
      const allowed = new Set([
        ask.recheck.priorFindingRef,
        ...(ask.recheck.neighboringInvariants ?? []),
      ]);
      for (const [i, f] of findings.entries()) {
        if (!allowed.has(f?.invariantRef)) {
          push(errors, `findings[${i}].invariantRef`, 'RECHECK_REOPEN', `recheck finding references '${f?.invariantRef}' which is neither the prior finding '${ask.recheck.priorFindingRef}' nor a bound neighboring invariant; RECHECK is delta-only and never reopens the entire task`);
        }
        // RECHECK findings are supported by retained delta evidence only
        const deltaRefs = new Set(resolvableEvidenceRefs(ask));
        for (const [j, ref] of (f?.evidenceRefs ?? []).entries()) {
          if (isMarkerRef(ref)) {
            push(errors, `findings[${i}].evidenceRefs[${j}]`, 'EVIDENCE_REF_MARKER', `'${TRUNCATION_MARKER_REF}' is a truncation marker, not substantive evidence`);
          } else if (!deltaRefs.has(ref)) {
            push(errors, `findings[${i}].evidenceRefs[${j}]`, 'RECHECK_EVIDENCE_UNRESOLVED', `recheck finding evidence ref '${ref}' does not resolve within the retained delta evidence universe; RECHECK findings may not be supported by unrelated full-task evidence`);
          }
        }
      }
    }
  }
}

/**
 * Resolve the repair source from the EXACT ASK BINDING, never from
 * source-array order (SOL-S06-009):
 *
 * 1. the DIAGNOSE criterionRef comes from the compiled ask;
 * 2. the UNIQUE contractRef whose requirementRefs contains the criterion
 *    is found — zero claiming refs or more than one (ambiguous) fail
 *    closed;
 * 3. that exact contractRef is resolved by (contractKey, semanticDigest)
 *    against the supplied validated sources;
 * 4. ONLY that exact source is used as the repair source; other supplied
 *    sources are ignored even if they contain an identical criterion.
 *
 * @param {object} ask compiled lcim.sol-ask (SOL_DIAGNOSE)
 * @param {Array<object>} boundSources validated Sprint-04 sources
 * @returns {{ binding: object, source: object, spec: object, criterion: string }
 *           | { error: string }} - `error` is one of
 *           CRITERION_BINDING_MISSING | AMBIGUOUS_CRITERION_BINDING |
 *           SOURCE_BINDING_MISSING | CRITERION_UNKNOWN_TO_SOURCE
 */
export function resolveCriterionBinding(ask, boundSources) {
  const criterion = ask?.diagnose?.acceptanceCriterionRef;
  if (typeof criterion !== 'string') return { error: 'CRITERION_BINDING_MISSING' };
  const claiming = (ask?.contractRefs ?? []).filter((ref) =>
    (ref?.requirementRefs ?? []).includes(criterion),
  );
  if (claiming.length === 0) return { error: 'CRITERION_BINDING_MISSING' };
  if (claiming.length > 1) return { error: 'AMBIGUOUS_CRITERION_BINDING' };
  const binding = claiming[0];
  const source = (boundSources ?? []).find(
    (s) => s.contractKey === binding.contractKey && s.semanticDigest === binding.semanticDigest,
  );
  if (source === undefined) return { error: 'SOURCE_BINDING_MISSING' };
  const spec = (source.negativeSideEffects ?? []).find((s) => s.sideEffectId === criterion);
  if (spec === undefined) return { error: 'CRITERION_UNKNOWN_TO_SOURCE' };
  return { binding, source, spec, criterion };
}

/**
 * Validate a deterministic repair-ticket conversion record.
 * @param {object} doc - compiled lcim.repair-ticket document
 * @param {{ ask?: object, response?: object }} [opts] - source ask/response
 *   for binding rules.
 * @returns {{ valid: boolean, errors: Array<{path, message, code?}>, warnings: Array }}
 */
export function validateRepairTicket(doc, opts = {}) {
  const result = validateAgainstSchema(doc, loadSolSchema('lcim.repair-ticket'));
  const errors = [...result.errors];
  const warnings = [];
  if (result.valid && isPlainObject(doc)) {
    if (doc.ticketId !== doc.repairId) {
      push(errors, 'ticketId', 'TICKET_ID_MISMATCH', `ticketId '${doc.ticketId}' must equal the compiled repairId '${doc.repairId}'; a repair ticket is the record of exactly one compiled repair`);
    }
    if (opts.ask !== undefined || opts.response !== undefined) {
      const ask = opts.ask;
      const response = opts.response;
      const askOk = ask !== undefined && isPlainObject(ask) && ask.askId === doc.sourceAskId;
      const responseOk =
        response !== undefined && isPlainObject(response) && response.responseId === doc.sourceResponseId;
      if (!askOk || !responseOk) {
        push(errors, 'sourceAskId', 'TICKET_SOURCE_MISMATCH', 'ticket sourceAskId/sourceResponseId must bind to the supplied ask and response');
      }
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

export {
  SOL_CALL_TYPES,
  MAX_ADJACENT_CRITICAL_DEFECTS,
  isValidSolAskId,
  isValidSolResponseId,
};
