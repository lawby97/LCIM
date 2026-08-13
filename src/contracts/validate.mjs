/**
 * LCIM V2 semantic/acceptance contract validation (Sprint 04).
 *
 * Two layers, mirroring the Sprint-00 shared-record discipline:
 *
 * 1. JSON-schema validation via the shared Sprint-00 engine
 *    (`validateAgainstSchema`, failure-closed keyword subset).
 * 2. Conditional semantic rules that the schema subset cannot express,
 *    enforced here so callers cannot bypass them:
 *
 * Semantic-contract rules (`validateSemanticContract`):
 * - duplicate concept names are errors (a concept is a unique authoritative
 *   unit);
 * - duplicate source-object keys are errors (a concept referencing the key
 *   could not know which source object supplies authority; never pick a
 *   winner — reject the ambiguity) [SOL-S04-005];
 * - distinctConcepts must reference existing, distinct concepts (unknown or
 *   self-references are errors);
 * - two concepts declared `must_not_conflate` that share a digest/identity
 *   meaning cannot be represented unambiguously -> error;
 * - overlapping authoritative field names across concepts -> error (the
 *   same exact field cannot be authoritative for two concepts);
 * - allowedTransitions may only reference states in the concept's lifecycle
 *   (contradictory lifecycles -> error);
 * - compileStatus must equal the status recomputed from unresolvedSemantics
 *   (high-risk unresolved semantics can never hide under COMPILED);
 * - expectedCount must be an integer >= 0 (engine subset has no minimum);
 * - negative side-effect requirements carry a deterministic content-bound
 *   `sideEffectId`: duplicate identities and identities that do not match
 *   the spec content are errors [SOL-S04-004];
 * - semanticDigest must equal the digest recomputed from the authority-
 *   bearing content (caller-supplied digests cannot be authoritative)
 *   [SOL-S04-003];
 * - missing digest/identity meaning on digest/identity concepts, missing
 *   source-of-truth reference, and overlapping forbidden alternatives are
 *   surfaced as warnings (never silently dropped).
 *
 * Acceptance-contract rules (`validateAcceptanceContract`):
 * - expectedCount / expectedSideEffectCount must be integers >= 0;
 * - when a source semantic contract is supplied it must FIRST be
 *   AUTHORITATIVE — the same predicate the repair builder enforces
 *   (complete, schema-valid, semantically valid, COMPILED, digest-valid);
 *   a CONTRACT_REVIEW_REQUIRED, malformed, or otherwise non-authoritative
 *   source fails closed before any key/digest/carry relationship is
 *   trusted [SOL-S04-R2-001];
 * - rejectedAcceptanceRefs must be unique and (with a source) resolve to
 *   source negative side-effect acceptance items [SOL-S04-002];
 * - mustChange targets must stay inside the repair scope derived from the
 *   rejected acceptance items [SOL-S04-002];
 * - when the source semantic contract is supplied: contractKey AND
 *   sourceSemanticDigest must bind to the exact source semantic content
 *   (not merely contractKey) [SOL-S04-003];
 * - every source negative side-effect spec must be carried EXACTLY
 *   (sideEffectId, gate, scope, requirement, expectedCount, evidenceKind)
 *   and must have its own independently traceable acceptance-test entry
 *   keyed by sideEffectId — two side effects never collapse onto one
 *   acceptance item because gate::scope matches [SOL-S04-004];
 * - carried negativeSideEffects must be unique per sideEffectId (an exact
 *   duplicate is still ambiguous and must fail; no first/last-wins) and
 *   each source side effect must be referenced by EXACTLY ONE acceptance
 *   test — duplicate test references, identical or conflicting, fail
 *   closed [SOL-S04-R2-002];
 * - frozenSemantics must carry the source's preserved requirements exactly
 *   (unrelated accepted requirements, low-risk unresolved items,
 *   distinctConcepts / must-not-conflate, non-rejected side effects)
 *   [SOL-S04-002].
 */

import { isDeepStrictEqual } from 'node:util';
import { validateAgainstSchema } from '../shared/schema/validate.mjs';
import { loadContractSchema } from './registry.mjs';
import { computeCompileStatus } from './status.mjs';
import { computeSemanticDigest } from './digest.mjs';
import {
  SIDE_EFFECT_SCOPES,
  isValidSideEffectId,
  sideEffectIdForSpec,
} from '../risk/side-effects.mjs';

/** Warning codes emitted by semantic-contract validation. */
export const SEMANTIC_WARNING_CODES = Object.freeze([
  'MISSING_DIGEST_MEANING',
  'MISSING_IDENTITY_MEANING',
  'MISSING_SOURCE_OF_TRUTH',
  'FORBIDDEN_ALTERNATIVE_OVERLAP',
]);

/** Error codes emitted by semantic-contract validation beyond the schema engine. */
export const SEMANTIC_ERROR_CODES = Object.freeze([
  'DUPLICATE_CONCEPT',
  'DUPLICATE_SOURCE_KEY',
  'DUPLICATE_SIDE_EFFECT_ID',
  'SIDE_EFFECT_ID_MISMATCH',
  'DIGEST_MISMATCH',
  'UNKNOWN_DISTINCT_REF',
  'SELF_DISTINCT_PAIR',
  'AMBIGUOUS_MEANING',
  'FIELD_NAME_OVERLAP',
  'UNKNOWN_SOURCE_OBJECT',
  'INVALID_TRANSITION_STATE',
  'STATUS_MISMATCH',
  'INVALID_SIDE_EFFECT_COUNT',
]);

/** Error codes emitted by acceptance-contract validation beyond the schema engine. */
export const ACCEPTANCE_ERROR_CODES = Object.freeze([
  'INVALID_SIDE_EFFECT_COUNT',
  'CONTRACT_KEY_MISMATCH',
  'SOURCE_DIGEST_INVALID',
  'SOURCE_DIGEST_MISMATCH',
  'SOURCE_NOT_AUTHORITATIVE',
  'DUPLICATE_REJECTED_REF',
  'UNKNOWN_REJECTED_REF',
  'UNBOUNDED_MUST_CHANGE',
  'SIDE_EFFECT_NOT_CARRIED',
  'SIDE_EFFECT_CARRY_MISMATCH',
  'SIDE_EFFECT_NOT_FROM_SOURCE',
  'DUPLICATE_CARRIED_SIDE_EFFECT',
  'SIDE_EFFECT_TEST_MISSING',
  'SIDE_EFFECT_TEST_MISMATCH',
  'DUPLICATE_SIDE_EFFECT_TEST',
  'FROZEN_REQUIREMENT_MISMATCH',
]);

/**
 * Validate a compiled semantic contract.
 * @returns {{ valid: boolean, errors: Array<{path: string, message: string}>, warnings: Array<{code: string, message: string, path?: string}> }}
 */
export function validateSemanticContract(doc) {
  const result = validateAgainstSchema(doc, loadContractSchema('lcim.semantic-contract'));
  const errors = [...result.errors];
  const warnings = [];

  if (result.valid && isPlainObject(doc)) {
    applySemanticRules(doc, errors, warnings);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Why a contract is not authoritative, or null when it is.
 *
 * A contract is authoritative ONLY when it is a complete, schema-valid,
 * semantically valid document whose recomputed compileStatus is COMPILED,
 * whose semanticDigest is internally valid, and which carries no
 * high-risk unresolved semantics. A caller-supplied compileStatus alone
 * never establishes authority. This function never mutates/repairs the
 * input; invalid objects are simply not authoritative.
 *
 * Defined here (next to the validation logic it uses) so the cross-document
 * acceptance validator can enforce the SAME authority predicate without an
 * import cycle; compiler.mjs re-exports it unchanged [SOL-S04-001,
 * SOL-S04-R2-001].
 * @param {object} contract
 * @returns {string|null} failure reason, or null when authoritative
 */
export function authorityFailureReason(contract) {
  if (contract === null || typeof contract !== 'object' || Array.isArray(contract)) {
    return 'not a semantic contract object';
  }
  let result;
  try {
    result = validateSemanticContract(contract);
  } catch {
    return 'semantic contract could not be validated';
  }
  if (!result.valid) {
    return `validation failed: ${result.errors[0]?.message ?? 'unknown error'}`;
  }
  if (contract.compileStatus !== 'COMPILED') {
    return `compileStatus is '${contract.compileStatus}', not COMPILED`;
  }
  return null;
}

/**
 * True when a compiled contract is safe to hand to a worker as
 * authoritative: a complete valid semantic contract whose computed
 * compile status is COMPILED (no high-risk unresolved semantics) and whose
 * semantic content identity is internally valid. Review-required or
 * malformed contracts must never be silently treated as settled.
 * @param {object} contract
 */
export function isAuthoritative(contract) {
  return authorityFailureReason(contract) === null;
}

function applySemanticRules(doc, errors, warnings) {
  const concepts = doc.concepts ?? [];
  const byName = new Map();
  const seenNames = new Set();

  // --- source-object key uniqueness (SOL-S04-005) -------------------------
  // Duplicate keys are rejected BEFORE concept source references are
  // resolved: a concept referencing the key could not know which source
  // object supplies authority. Never inspect external repositories, never
  // silently choose first/last, never merge conflicting duplicates.
  const sourceKeys = new Set();
  for (const [i, s] of (doc.sourceObjects ?? []).entries()) {
    if (sourceKeys.has(s.key)) {
      errors.push({
        path: `sourceObjects[${i}].key`,
        message: `DUPLICATE_SOURCE_KEY: duplicate source object key '${s.key}' — a concept referencing it cannot know which source object supplies authority; reject the ambiguity, never pick a winner`,
      });
    } else {
      sourceKeys.add(s.key);
    }
  }

  // --- concept identity rules -------------------------------------------
  for (const [i, c] of concepts.entries()) {
    const at = `concepts[${i}]`;
    if (seenNames.has(c.name)) {
      errors.push({ path: `${at}.name`, message: `DUPLICATE_CONCEPT: duplicate concept name '${c.name}'` });
    } else {
      seenNames.add(c.name);
      byName.set(c.name, { index: i, concept: c });
    }

    if (c.kind === 'digest' && !c.digestMeaning) {
      warnings.push({
        code: 'MISSING_DIGEST_MEANING',
        message: `digest concept '${c.name}' declares no digestMeaning; its distinctness cannot be verified`,
        path: `${at}.digestMeaning`,
      });
    }
    if (c.kind === 'identity' && !c.identityMeaning) {
      warnings.push({
        code: 'MISSING_IDENTITY_MEANING',
        message: `identity concept '${c.name}' declares no identityMeaning; its binding cannot be verified`,
        path: `${at}.identityMeaning`,
      });
    }
    if (c.sourceObjectKey === undefined) {
      warnings.push({
        code: 'MISSING_SOURCE_OF_TRUTH',
        message: `concept '${c.name}' references no source object; authoritative origin is unverifiable`,
        path: `${at}.sourceObjectKey`,
      });
    } else if (!sourceKeys.has(c.sourceObjectKey)) {
      errors.push({
        path: `${at}.sourceObjectKey`,
        message: `UNKNOWN_SOURCE_OBJECT: concept '${c.name}' references unknown source object '${c.sourceObjectKey}'`,
      });
    }

    // lifecycle transitions may only reference declared states
    if (Array.isArray(c.lifecycle) && c.lifecycle.length > 0) {
      const states = new Set(c.lifecycle);
      for (const [j, t] of (c.allowedTransitions ?? []).entries()) {
        if (!states.has(t.from) || !states.has(t.to)) {
          errors.push({
            path: `${at}.allowedTransitions[${j}]`,
            message: `INVALID_TRANSITION_STATE: transition ${t.from} -> ${t.to} references a state not declared in lifecycle (contradictory lifecycle)`,
          });
        }
      }
    }
  }

  // --- authoritative field-name uniqueness ------------------------------
  const fieldOwner = new Map();
  for (const [i, c] of concepts.entries()) {
    for (const f of c.authoritativeFieldNames ?? []) {
      if (fieldOwner.has(f) && fieldOwner.get(f) !== c.name) {
        errors.push({
          path: `concepts[${i}].authoritativeFieldNames`,
          message: `FIELD_NAME_OVERLAP: field '${f}' is authoritative for both '${fieldOwner.get(f)}' and '${c.name}'`,
        });
      } else if (!fieldOwner.has(f)) {
        fieldOwner.set(f, c.name);
      }
    }
  }

  // --- forbidden-alternative overlap (warning) ---------------------------
  const altOwner = new Map();
  for (const [i, c] of concepts.entries()) {
    for (const a of c.forbiddenAlternatives ?? []) {
      if (altOwner.has(a) && altOwner.get(a) !== c.name) {
        warnings.push({
          code: 'FORBIDDEN_ALTERNATIVE_OVERLAP',
          message: `forbidden alternative '${a}' is claimed by both '${altOwner.get(a)}' and '${c.name}'`,
          path: `concepts[${i}].forbiddenAlternatives`,
        });
      } else if (!altOwner.has(a)) {
        altOwner.set(a, c.name);
      }
    }
  }

  // --- distinctConcepts rules --------------------------------------------
  for (const [i, d] of (doc.distinctConcepts ?? []).entries()) {
    const at = `distinctConcepts[${i}]`;
    for (const ref of [d.conceptA, d.conceptB, ...(d.alsoDistinctFrom ?? [])]) {
      if (!byName.has(ref)) {
        errors.push({ path: `${at}`, message: `UNKNOWN_DISTINCT_REF: distinctConcepts references unknown concept '${ref}'` });
      }
    }
    if (d.conceptA === d.conceptB) {
      errors.push({ path: `${at}`, message: `SELF_DISTINCT_PAIR: distinctConcepts pair must name two different concepts ('${d.conceptA}' === '${d.conceptB}')` });
    }
    for (const ref of d.alsoDistinctFrom ?? []) {
      if (ref === d.conceptA || ref === d.conceptB) {
        errors.push({ path: `${at}.alsoDistinctFrom`, message: `SELF_DISTINCT_PAIR: '${ref}' repeats a pair member` });
      }
    }
    if (byName.has(d.conceptA) && byName.has(d.conceptB)) {
      const a = byName.get(d.conceptA).concept;
      const b = byName.get(d.conceptB).concept;
      const aMeanings = [a.digestMeaning, a.identityMeaning].filter(Boolean);
      const bMeanings = [b.digestMeaning, b.identityMeaning].filter(Boolean);
      const shared = aMeanings.filter((m) => bMeanings.includes(m));
      if (shared.length > 0) {
        errors.push({
          path: `${at}`,
          message: `AMBIGUOUS_MEANING: concepts '${d.conceptA}' and '${d.conceptB}' share meaning '${shared[0]}' and cannot be represented unambiguously despite must_not_conflate`,
        });
      }
    }
  }

  // --- compile status consistency (high-risk unresolved semantics) --------
  const recomputed = computeCompileStatus(doc.unresolvedSemantics ?? []);
  if (doc.compileStatus !== recomputed) {
    errors.push({
      path: 'compileStatus',
      message: `STATUS_MISMATCH: compileStatus '${doc.compileStatus}' contradicts unresolvedSemantics (recomputed '${recomputed}'); high-risk unresolved semantics must surface as CONTRACT_REVIEW_REQUIRED`,
    });
  }

  // --- negative side-effect counts ----------------------------------------
  for (const [i, s] of (doc.negativeSideEffects ?? []).entries()) {
    if (!Number.isInteger(s.expectedCount) || s.expectedCount < 0) {
      errors.push({
        path: `negativeSideEffects[${i}].expectedCount`,
        message: `INVALID_SIDE_EFFECT_COUNT: expectedCount must be an integer >= 0, got ${JSON.stringify(s.expectedCount)}`,
      });
    }
  }

  // --- negative side-effect identity (SOL-S04-004) ------------------------
  // Identities are deterministic and content-bound: duplicates are
  // rejected, and a carried identity that does not match the spec content
  // is tampering and fails closed.
  const seenSideEffectIds = new Set();
  for (const [i, s] of (doc.negativeSideEffects ?? []).entries()) {
    if (typeof s.sideEffectId !== 'string' || !isValidSideEffectId(s.sideEffectId)) {
      // schema pattern already reports this; do not double-report
      continue;
    }
    if (seenSideEffectIds.has(s.sideEffectId)) {
      errors.push({
        path: `negativeSideEffects[${i}].sideEffectId`,
        message: `DUPLICATE_SIDE_EFFECT_ID: side-effect identity '${s.sideEffectId}' is used by more than one requirement; two distinct requirements may never share an identity`,
      });
      continue;
    }
    seenSideEffectIds.add(s.sideEffectId);
    const derived = sideEffectIdForSpec(s);
    if (derived !== s.sideEffectId) {
      errors.push({
        path: `negativeSideEffects[${i}].sideEffectId`,
        message: `SIDE_EFFECT_ID_MISMATCH: sideEffectId '${s.sideEffectId}' does not match the deterministic identity derived from the spec content ('${derived}'); the requirement's identity must be content-bound`,
      });
    }
  }

  // --- semantic digest verification (SOL-S04-003) -------------------------
  if (typeof doc.semanticDigest === 'string') {
    const derived = computeSemanticDigest(doc);
    if (derived !== doc.semanticDigest) {
      errors.push({
        path: 'semanticDigest',
        message: `DIGEST_MISMATCH: semanticDigest '${doc.semanticDigest}' does not match the digest recomputed from the authority-bearing content ('${derived}'); a caller-supplied digest can never be authoritative`,
      });
    }
  }
}

/**
 * Validate a worker-ready repair/acceptance contract.
 * @param {object} doc - the repair contract to validate
 * @param {{ semanticContract?: object }} [opts] - source semantic contract
 *   for cross-document rules. When supplied it must be AUTHORITATIVE
 *   (same predicate as buildRepairContract: complete, schema-valid,
 *   semantically valid, COMPILED, digest-valid); a non-authoritative
 *   source fails closed before the digest binding, rejected references,
 *   bounded mustChange, exact side-effect carry, and frozen requirement
 *   carry rules are applied.
 * @returns {{ valid: boolean, errors: Array<{path: string, message: string}>, warnings: Array<{code: string, message: string, path?: string}> }}
 */
export function validateAcceptanceContract(doc, opts = {}) {
  const result = validateAgainstSchema(doc, loadContractSchema('lcim.acceptance-contract'));
  const errors = [...result.errors];
  const warnings = [];

  if (result.valid && isPlainObject(doc)) {
    applyAcceptanceRules(doc, opts.semanticContract, errors);
  }

  return { valid: errors.length === 0, errors, warnings };
}

function applyAcceptanceRules(doc, semanticContract, errors) {
  for (const [i, s] of (doc.negativeSideEffects ?? []).entries()) {
    if (!Number.isInteger(s.expectedCount) || s.expectedCount < 0) {
      errors.push({
        path: `negativeSideEffects[${i}].expectedCount`,
        message: `INVALID_SIDE_EFFECT_COUNT: expectedCount must be an integer >= 0, got ${JSON.stringify(s.expectedCount)}`,
      });
    }
  }
  for (const [i, t] of (doc.acceptanceTests ?? []).entries()) {
    if (t.expectedSideEffectCount !== undefined && (!Number.isInteger(t.expectedSideEffectCount) || t.expectedSideEffectCount < 0)) {
      errors.push({
        path: `acceptanceTests[${i}].expectedSideEffectCount`,
        message: `INVALID_SIDE_EFFECT_COUNT: expectedSideEffectCount must be an integer >= 0, got ${JSON.stringify(t.expectedSideEffectCount)}`,
      });
    }
  }

  // Rejected acceptance references must be unique (source-independent).
  const seenRejected = new Set();
  for (const [i, ref] of (doc.rejectedAcceptanceRefs ?? []).entries()) {
    if (seenRejected.has(ref)) {
      errors.push({
        path: `rejectedAcceptanceRefs[${i}]`,
        message: `DUPLICATE_REJECTED_REF: rejected acceptance reference '${ref}' is repeated; each rejected item must be referenced exactly once`,
      });
    }
    seenRejected.add(ref);
  }

  if (semanticContract === undefined) return;

  // --- source authority (SOL-S04-R2-001) ----------------------------------
  // Cross-document rules bind to an AUTHORITATIVE compiled semantic
  // contract. The same predicate buildRepairContract enforces gates the
  // direct validator path too: a caller may never bypass the builder's
  // authority requirement by hand-constructing a repair document and
  // passing a schema/digest-valid but CONTRACT_REVIEW_REQUIRED, malformed,
  // or otherwise non-authoritative source. Fail closed FIRST — before any
  // contractKey/digest/carry relationship is trusted.
  const sourceAuthorityReason = authorityFailureReason(semanticContract);
  if (sourceAuthorityReason !== null) {
    errors.push({
      path: 'sourceSemanticDigest',
      message: `SOURCE_NOT_AUTHORITATIVE: the source semantic contract is not an authoritative compiled semantic contract (${sourceAuthorityReason}); cross-document acceptance validation requires the same validated COMPILED source with an internally valid digest that buildRepairContract enforces`,
    });
    // Non-authoritative sources fail closed. Object-shaped sources still
    // run the binding checks below so a digest-forged source is also
    // reported as SOURCE_DIGEST_INVALID; non-object sources stop here —
    // nothing further can be trusted on them.
    if (!isPlainObject(semanticContract)) return;
  }

  if (semanticContract.contractKey !== doc.contractKey) {
    errors.push({
      path: 'contractKey',
      message: `CONTRACT_KEY_MISMATCH: repair contractKey '${doc.contractKey}' does not match source semantic contract '${semanticContract.contractKey}'`,
    });
  }

  // --- source semantic digest binding (SOL-S04-003) -----------------------
  // The repair binds to the exact authority-bearing content, not merely to
  // contractKey. The source's own digest must be internally valid and the
  // repair's sourceSemanticDigest must match it exactly.
  let sourceDigest = null;
  try {
    sourceDigest = computeSemanticDigest(semanticContract);
  } catch {
    sourceDigest = null;
  }
  if (
    semanticContract === null ||
    typeof semanticContract !== 'object' ||
    typeof semanticContract.semanticDigest !== 'string' ||
    sourceDigest !== semanticContract.semanticDigest
  ) {
    errors.push({
      path: 'sourceSemanticDigest',
      message: `SOURCE_DIGEST_INVALID: the source semantic contract's semanticDigest is not internally valid; repairs must bind to exact semantic content`,
    });
  } else if (doc.sourceSemanticDigest !== semanticContract.semanticDigest) {
    errors.push({
      path: 'sourceSemanticDigest',
      message: `SOURCE_DIGEST_MISMATCH: repair sourceSemanticDigest '${doc.sourceSemanticDigest}' does not bind to source semantic contract '${semanticContract.contractKey}' (digest '${semanticContract.semanticDigest}')`,
    });
  }

  const sourceSideEffects = semanticContract.negativeSideEffects ?? [];
  const sourceById = new Map();
  for (const s of sourceSideEffects) {
    sourceById.set(s.sideEffectId, s);
  }

  // --- rejected acceptance references resolve to source items (SOL-S04-002)
  for (const ref of seenRejected) {
    if (!sourceById.has(ref)) {
      errors.push({
        path: 'rejectedAcceptanceRefs',
        message: `UNKNOWN_REJECTED_REF: rejected acceptance reference '${ref}' does not resolve to a negative side-effect acceptance item of the source semantic contract`,
      });
    }
  }

  // --- bounded repair scope (SOL-S04-002) ---------------------------------
  // mustChange may only target the repair scope derived from the rejected
  // acceptance items (the side-effect scopes those items guard). The caller
  // may never expand mustChange beyond what the failed requirements
  // authorize. This is semantic repair scope, not Sprint-03 file scope.
  const rejectedScopes = new Set();
  for (const ref of seenRejected) {
    const spec = sourceById.get(ref);
    if (spec !== undefined) rejectedScopes.add(spec.scope);
  }
  for (const [i, m] of (doc.mustChange ?? []).entries()) {
    if (!rejectedScopes.has(m.target)) {
      errors.push({
        path: `mustChange[${i}].target`,
        message: `UNBOUNDED_MUST_CHANGE: target '${m.target}' is outside the repair scope derived from the rejected acceptance items (allowed scopes: ${[...rejectedScopes].join(', ') || '<none>'})`,
      });
    }
  }

  // --- exact negative side-effect carry (SOL-S04-004, R2-002) -------------
  // Uniqueness FIRST: duplicate carried records with the same sideEffectId
  // are ambiguous and must fail — no first/last-wins, and an exact
  // duplicate is still a duplicate. The lookup is built only after
  // cardinality is proven, never via last-entry-wins Map.set().
  const carriedById = new Map();
  for (const [i, s] of (doc.negativeSideEffects ?? []).entries()) {
    if (typeof s?.sideEffectId !== 'string' || !isValidSideEffectId(s.sideEffectId)) {
      continue; // schema pattern already reports this; do not double-report
    }
    if (carriedById.has(s.sideEffectId)) {
      errors.push({
        path: `negativeSideEffects[${i}].sideEffectId`,
        message: `DUPLICATE_CARRIED_SIDE_EFFECT: side-effect identity '${s.sideEffectId}' is carried more than once in the repair contract; exactly one carried record per source side-effect identity is required — a duplicate, even an exact copy, is ambiguous and must fail`,
      });
      continue;
    }
    carriedById.set(s.sideEffectId, s);
  }
  for (const s of sourceSideEffects) {
    const carried = carriedById.get(s.sideEffectId);
    if (carried === undefined) {
      errors.push({
        path: 'negativeSideEffects',
        message: `SIDE_EFFECT_NOT_CARRIED: source negative side-effect '${s.sideEffectId}' (${s.gate}::${s.scope}) is not carried into the repair contract (negative side-effect expectations are first-class acceptance criteria)`,
      });
      continue;
    }
    if (
      carried.gate !== s.gate ||
      carried.scope !== s.scope ||
      carried.requirement !== s.requirement ||
      carried.expectedCount !== s.expectedCount ||
      (carried.evidenceKind ?? null) !== (s.evidenceKind ?? null)
    ) {
      errors.push({
        path: 'negativeSideEffects',
        message: `SIDE_EFFECT_CARRY_MISMATCH: carried side-effect '${s.sideEffectId}' does not preserve the exact source spec (gate, scope, requirement, expectedCount, evidenceKind must be identical); no field may silently change in transit`,
      });
    }
  }
  for (const [i, s] of (doc.negativeSideEffects ?? []).entries()) {
    if (!sourceById.has(s.sideEffectId)) {
      errors.push({
        path: `negativeSideEffects[${i}].sideEffectId`,
        message: `SIDE_EFFECT_NOT_FROM_SOURCE: carried side-effect '${s.sideEffectId}' does not exist in the source semantic contract`,
      });
    }
  }

  // --- independent acceptance tests (SOL-S04-004, R2-002) -----------------
  // Each negative side-effect requirement gets its own acceptance-test
  // entry keyed by sideEffectId; two requirements can never collapse onto
  // one acceptance item merely because gate::scope matches. Cardinality is
  // unambiguous: exactly ONE test may reference each negativeSideEffectId.
  // Zero references, more than one reference, identical duplicates, and
  // conflicting duplicates all fail closed — .find() is never used as a
  // cardinality check.
  const testRefCount = new Map();
  for (const t of doc.acceptanceTests ?? []) {
    if (typeof t?.negativeSideEffectId !== 'string' || !isValidSideEffectId(t.negativeSideEffectId)) {
      continue; // schema pattern already reports this; do not double-report
    }
    testRefCount.set(t.negativeSideEffectId, (testRefCount.get(t.negativeSideEffectId) ?? 0) + 1);
  }
  for (const s of sourceSideEffects) {
    const referenceCount = testRefCount.get(s.sideEffectId) ?? 0;
    if (referenceCount === 0) {
      errors.push({
        path: 'acceptanceTests',
        message: `SIDE_EFFECT_TEST_MISSING: negative side-effect '${s.sideEffectId}' (${s.gate}::${s.scope}) lacks its own acceptance-test entry (negativeSideEffectId) pinning expectedSideEffectCount ${s.expectedCount}`,
      });
      continue;
    }
    if (referenceCount > 1) {
      errors.push({
        path: 'acceptanceTests',
        message: `DUPLICATE_SIDE_EFFECT_TEST: negative side-effect '${s.sideEffectId}' (${s.gate}::${s.scope}) is referenced by ${referenceCount} acceptance-test entries; exactly one test may reference each negativeSideEffectId — duplicate references, even identical ones, are ambiguous and must fail`,
      });
      continue;
    }
    const entry = (doc.acceptanceTests ?? []).find((t) => t.negativeSideEffectId === s.sideEffectId);
    if (entry.negativeSideEffectScope !== s.scope || entry.expectedSideEffectCount !== s.expectedCount) {
      errors.push({
        path: 'acceptanceTests',
        message: `SIDE_EFFECT_TEST_MISMATCH: acceptance test for '${s.sideEffectId}' pins scope/count that do not match the source spec (expected ${s.scope}=${s.expectedCount})`,
      });
    }
  }

  // --- frozen requirements exact carry (SOL-S04-002) ----------------------
  const frozen = doc.frozenSemantics;
  if (frozen === undefined || !isPlainObject(frozen)) return;
  const expectedFrozenSideEffects = sourceSideEffects.filter((s) => !seenRejected.has(s.sideEffectId));
  const frozenChecks = [
    ['sourceObjects', frozen.sourceObjects ?? [], semanticContract.sourceObjects ?? []],
    ['concepts', frozen.concepts ?? [], semanticContract.concepts ?? []],
    ['distinctConcepts', frozen.distinctConcepts ?? [], semanticContract.distinctConcepts ?? []],
    ['negativeSideEffects', frozen.negativeSideEffects ?? [], expectedFrozenSideEffects],
    ['factsEstablished', frozen.factsEstablished ?? [], semanticContract.factsEstablished ?? []],
    ['unresolvedSemantics', frozen.unresolvedSemantics ?? [], semanticContract.unresolvedSemantics ?? []],
  ];
  for (const [field, carried, expected] of frozenChecks) {
    if (!isDeepStrictEqual(carried, expected)) {
      errors.push({
        path: `frozenSemantics.${field}`,
        message: `FROZEN_REQUIREMENT_MISMATCH: frozenSemantics.${field} does not preserve the source semantics exactly; frozen requirements are constraints, not editable redesign targets`,
      });
    }
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export { SIDE_EFFECT_SCOPES };
