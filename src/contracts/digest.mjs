/**
 * LCIM V2 deterministic semantic content identity (Sprint 04, SOL-S04-003).
 *
 * A semantic contract's `semanticDigest` is the controller/compiler-derived
 * content identity of ALL authority-bearing semantic content. It never
 * depends on timestamps, random ids, incidental renderer prose, object-key
 * insertion order, or any caller-supplied digest.
 *
 * Canonicalization rules (deterministic):
 *
 * - object keys are sorted recursively, so incidental JSON key insertion
 *   order cannot change the digest;
 * - set-like top-level collections (sourceObjects, concepts,
 *   distinctConcepts, negativeSideEffects, factsEstablished,
 *   unresolvedSemantics) are sorted by their canonical serialization,
 *   because the contract treats them as sets (unique source keys, unique
 *   concept names, unique side-effect identities, ...);
 * - scalar sub-lists (authoritativeFieldNames, authoritativeEnum,
 *   lifecycle, forbiddenAlternatives, requiredBy, alsoDistinctFrom) keep
 *   their authored order — the digest never silently reorders a collection
 *   whose ordering may be semantically meaningful.
 *
 * Authority-bearing fields included: contractKey (namespace/context),
 * riskClass, sourceObjects, concepts (names, identities, digest meanings,
 * decision/evidence semantics, lifecycle/transitions, forbidden
 * alternatives, failure behavior), distinctConcepts / must_not_conflate
 * relationships, negative side-effect specifications (with their
 * deterministic sideEffectId), factsEstablished, and unresolvedSemantics
 * (including risk class).
 *
 * Excluded (non-semantic incidental metadata): schemaName/schemaVersion
 * (envelope), title (prose), compileStatus (derived from
 * unresolvedSemantics), compiledAt (timestamp), compileWarnings (derived),
 * and semanticDigest itself.
 *
 * The digest is a sha256 hex string (64 chars), matching the repository's
 * existing digest convention (configDigest: "sha256 of effective config").
 */

import { createHash } from 'node:crypto';

/**
 * Recursively canonicalize a JSON-shaped value: plain-object keys are
 * sorted; array element order is preserved.
 * @param {*} value
 * @returns {*} canonical structure
 */
export function canonicalizeJson(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalizeJson(value[key]);
    }
    return out;
  }
  return value;
}

/** @param {string} text */
export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Top-level collections the contract treats as set-like (unique members). */
const SET_LIKE_ARRAYS = Object.freeze([
  'sourceObjects',
  'concepts',
  'distinctConcepts',
  'negativeSideEffects',
  'factsEstablished',
  'unresolvedSemantics',
]);

function canonicalSortKey(value) {
  return JSON.stringify(canonicalizeJson(value));
}

/**
 * Compute the deterministic semantic content digest of a semantic contract
 * document (compiled or pre-compiled). Tolerant of malformed documents:
 * missing/odd fields collapse deterministically, so verification always
 * fails closed against a forged digest instead of throwing.
 * @param {object} doc - semantic contract document
 * @returns {string} 64-char sha256 hex digest
 */
export function computeSemanticDigest(doc) {
  const payload = {
    contractKey: doc !== null && typeof doc === 'object' && !Array.isArray(doc) ? doc.contractKey ?? null : null,
    riskClass: doc !== null && typeof doc === 'object' && !Array.isArray(doc) ? doc.riskClass ?? null : null,
  };
  for (const field of SET_LIKE_ARRAYS) {
    const arr = doc !== null && typeof doc === 'object' ? doc[field] : undefined;
    payload[field] = Array.isArray(arr)
      ? [...arr].sort((a, b) => {
          const ka = canonicalSortKey(a);
          const kb = canonicalSortKey(b);
          return ka < kb ? -1 : ka > kb ? 1 : 0;
        })
      : [];
  }
  return sha256Hex(JSON.stringify(canonicalizeJson(payload)));
}
