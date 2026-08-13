/**
 * LCIM V2 Sprint 09 V1 work-unit handoff interpretation (Sprint 09 owned).
 *
 * Interprets a historical V1 worker handoff / final-response text
 * READ-ONLY, keeping separate (V1 handoff semantics):
 *
 *   - transport parseability   (`parseable`)
 *   - historical V1 schema validity (`historicallySchemaValid`, against
 *     the supported v1.0 handoff schema `lcim.v1.handoff`)
 *   - worker claim/status      (`workerClaim`, verbatim V1 status — may be
 *     PATCH_READY, a WORKER claim that is NEVER promoted to a V2
 *     controller disposition)
 *   - V2 schema cross-check    (`v2WorkerSchemaValid`, a read-only
 *     syntactic cross-check against the Sprint-02 worker-result schema —
 *     never an acceptance fact; provenance stays V1_COMPAT)
 *
 * Transport grammar: the established strict-parse-first grammar with
 * recorded syntactic normalization only (strict JSON, one JSON code fence,
 * or one uniquely identifiable prose-wrapped JSON object) — the same
 * grammar Sprint 02 reviewed for worker responses, reused read-only.
 *
 * A parseable-but-V1-schema-invalid handoff is `parseable: true`,
 * `historicallySchemaValid: false` (SCHEMA_MISMATCH) — it is NEVER
 * declared V2-valid and NEVER treated as "no patch" or "failed
 * implementation". An unparseable/missing response is a transport defect
 * (TRANSPORT_MALFORMED) or unavailable evidence — never an inference
 * about patch usefulness.
 *
 * Public-safety: this module never embeds raw response text in errors or
 * summaries and never writes anything.
 */

import { parseWorkerResponse } from '../../handoff/parse.mjs';
import { validateWorkerResult } from '../../handoff/validate.mjs';
import { WORKER_STATUS } from '../../shared/enums.mjs';
import { UNKNOWN_V1, validateCompatRecord } from './schemas.mjs';
import { V1_STATUS_VOCABULARY } from './version.mjs';

/**
 * Interpret one V1 work-unit handoff / final-response text.
 *
 * @param {unknown} text - the exact raw V1 response text (string). Any
 *   other value (or empty text) means NO response evidence is available:
 *   every claim becomes UNKNOWN_V1 and parseable is false — absence of
 *   response evidence never becomes a failure or a zero.
 * @returns {Readonly<{
 *   parseable: boolean,
 *   normalization: 'none'|'fence'|'prose-wrapped'|null,
 *   extraction: object|null,
 *   value: object|null,
 *   historicallySchemaValid: boolean|'UNKNOWN_V1',
 *   schemaErrors: Array<{path,message}>,
 *   v2WorkerSchemaValid: boolean|'UNKNOWN_V1',
 *   defect: 'TRANSPORT_MALFORMED'|'SCHEMA_MISMATCH'|'NONE'|'UNKNOWN_V1',
 *   workerClaim: Readonly<object>,
 * }>} frozen interpretation.
 */
export function parseV1Handoff(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return freezeHandoff({
      parseable: false,
      normalization: null,
      extraction: null,
      value: null,
      historicallySchemaValid: UNKNOWN_V1,
      schemaErrors: [],
      v2WorkerSchemaValid: UNKNOWN_V1,
      defect: UNKNOWN_V1,
      workerClaim: unknownClaim(),
      reason: 'no-response-text',
    });
  }

  let parsed;
  try {
    parsed = parseWorkerResponse(text);
  } catch (err) {
    return freezeHandoff({
      parseable: false,
      normalization: null,
      extraction: null,
      value: null,
      historicallySchemaValid: UNKNOWN_V1,
      schemaErrors: [],
      v2WorkerSchemaValid: UNKNOWN_V1,
      defect: 'TRANSPORT_MALFORMED',
      workerClaim: unknownClaim(),
      reason: err?.details?.reason ?? 'transport-malformed',
    });
  }

  if (parsed.value === null || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
    return freezeHandoff({
      parseable: false,
      normalization: parsed.normalization,
      extraction: parsed.extraction,
      value: null,
      historicallySchemaValid: UNKNOWN_V1,
      schemaErrors: [],
      v2WorkerSchemaValid: UNKNOWN_V1,
      defect: 'TRANSPORT_MALFORMED',
      workerClaim: unknownClaim(),
      reason: 'payload-is-not-an-object',
    });
  }

  const v1 = validateCompatRecord('lcim.v1.handoff', parsed.value);
  // Read-only cross-check against the V2 worker-result schema. This is a
  // syntactic check only; it never makes the fact a native V2 fact and it
  // never promotes the worker claim to a controller disposition.
  const v2 = validateWorkerResult(parsed.value);

  return freezeHandoff({
    parseable: true,
    normalization: parsed.normalization,
    extraction: parsed.extraction,
    value: parsed.value,
    historicallySchemaValid: v1.valid,
    schemaErrors: v1.errors,
    v2WorkerSchemaValid: v2.ok,
    defect: v1.valid ? 'NONE' : 'SCHEMA_MISMATCH',
    workerClaim: extractWorkerClaim(parsed.value),
  });
}

/**
 * Extract the WORKER-CLAIM facts from a parsed V1 handoff payload.
 *
 * Every value here is a historical worker claim, never a controller fact:
 * `status` is recorded verbatim (including PATCH_READY); `v2WorkerStatus`
 * is the V2 vocabulary equivalent ONLY when the V1 status is one of the
 * four V2 worker statuses (V2 WORKER_STATUS ⊂ V1 vocabulary); PATCH_READY
 * and unknown statuses have NO V2 worker-status equivalent -> UNKNOWN_V1.
 *
 * KNOWN_ZERO vs UNKNOWN_V1 (see docs/v2-migration.md):
 * - evidenceRefCount is KNOWN (possibly 0) ONLY when the worker explicitly
 *   provided an evidence field: an explicitly present empty evidence list
 *   is a KNOWN_ZERO claim; UNKNOWN_V1 when evidence is omitted entirely
 *   (omission establishes no count) or not countable (null/wrong-typed).
 * - changedFileCount is KNOWN (possibly 0) when the worker actually
 *   provided the list; UNKNOWN_V1 when the list is absent.
 * - testLogPath/testExitStatus are UNKNOWN_V1 when null/absent: a missing
 *   log reference is unavailable evidence, never "no tests" / "failed".
 */
export function extractWorkerClaim(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return unknownClaim();
  }
  return Object.freeze({
    status: typeof value.workerStatus === 'string' ? value.workerStatus : UNKNOWN_V1,
    statusInV1Vocabulary:
      typeof value.workerStatus === 'string' ? V1_STATUS_VOCABULARY.includes(value.workerStatus) : UNKNOWN_V1,
    v2WorkerStatus:
      typeof value.workerStatus === 'string' && WORKER_STATUS.includes(value.workerStatus)
        ? value.workerStatus
        : UNKNOWN_V1,
    summary: typeof value.summary === 'string' && value.summary.length > 0 ? value.summary : UNKNOWN_V1,
    testLogPath:
      typeof value.testLogPath === 'string' && value.testLogPath.length > 0 ? value.testLogPath : UNKNOWN_V1,
    testExitStatus: Number.isInteger(value.testExitStatus) ? value.testExitStatus : UNKNOWN_V1,
    changedFileCount: Array.isArray(value.changedFiles) ? value.changedFiles.length : UNKNOWN_V1,
    patchHashClaim:
      typeof value.patchHash === 'string' && value.patchHash.length > 0 ? value.patchHash : UNKNOWN_V1,
    evidenceRefCount: countEvidenceRefs(value),
  });
}

/**
 * Count worker-provided evidence references (legacy `evidence` string or
 * array, plus per-claim `evidenceRefs`/legacy `evidence`).
 *
 * KNOWN_ZERO vs UNKNOWN_V1:
 * - Omission establishes NO count: when no explicit evidence field is
 *   present anywhere (evidence omitted entirely and no claim-level
 *   evidence fields), the count is UNKNOWN_V1 — absence of evidence is
 *   never a zero.
 * - An explicitly present countable field establishes a KNOWN count: an
 *   explicit empty evidence list is a KNOWN_ZERO claim (0); a non-empty
 *   list/string contributes its deterministic count.
 * - A present-but-null or wrong-typed evidence field makes the count
 *   UNKNOWN_V1 — malformed/unavailable evidence must never silently
 *   become zero.
 */
function countEvidenceRefs(value) {
  let count = 0;
  let sawExplicit = false;
  let uncountable = false;
  const addCountable = (v, present) => {
    if (!present) return; // omitted: establishes no count
    sawExplicit = true;
    if (typeof v === 'string') {
      if (v.length > 0) count += 1;
    } else if (Array.isArray(v)) {
      count += v.length;
    } else {
      uncountable = true; // null or wrong-typed: unavailable/malformed
    }
  };
  addCountable(value.evidence, Object.hasOwn(value, 'evidence'));
  if (value.acceptanceClaims !== undefined && !Array.isArray(value.acceptanceClaims)) {
    uncountable = true; // present but malformed claim list
  } else if (Array.isArray(value.acceptanceClaims)) {
    for (const claim of value.acceptanceClaims) {
      if (claim === null || typeof claim !== 'object') {
        uncountable = true;
        continue;
      }
      addCountable(claim.evidenceRefs, Object.hasOwn(claim, 'evidenceRefs'));
      addCountable(claim.evidence, Object.hasOwn(claim, 'evidence'));
    }
  }
  if (uncountable) return UNKNOWN_V1;
  return sawExplicit ? count : UNKNOWN_V1;
}

/** The all-unknown worker claim used when no payload is available. */
export function unknownClaim() {
  return Object.freeze({
    status: UNKNOWN_V1,
    statusInV1Vocabulary: UNKNOWN_V1,
    v2WorkerStatus: UNKNOWN_V1,
    summary: UNKNOWN_V1,
    testLogPath: UNKNOWN_V1,
    testExitStatus: UNKNOWN_V1,
    changedFileCount: UNKNOWN_V1,
    patchHashClaim: UNKNOWN_V1,
    evidenceRefCount: UNKNOWN_V1,
  });
}

function freezeHandoff(handoff) {
  return Object.freeze({
    ...handoff,
    extraction: handoff.extraction === null || handoff.extraction === undefined ? null : Object.freeze({ ...handoff.extraction }),
    value: handoff.value === null || handoff.value === undefined ? null : Object.freeze(handoff.value),
    schemaErrors: Object.freeze([...(handoff.schemaErrors ?? [])]),
    workerClaim: Object.freeze({ ...handoff.workerClaim }),
  });
}
