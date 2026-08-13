/**
 * LCIM V2 Sprint 09 V1 -> V2 compatibility normalization (Sprint 09 owned).
 *
 * Normalizes facts that can genuinely be established from V1 evidence into
 * a V2-compatible projection (`lcim.v1.projection`) carrying provenance
 * V1_COMPAT on every record. Everything unavailable or ambiguous becomes
 * the reserved sentinel UNKNOWN_V1. The projection NEVER emits:
 *
 *   - a V2 controller disposition (PATCH_VALID, SEMANTICALLY_ACCEPTED,
 *     CANDIDATE_INTEGRATED, REVIEW_APPROVED, REJECTED, REVIEW_REQUIRED) —
 *     `controller.v2Disposition` is pinned to UNKNOWN_V1 by schema;
 *   - a V2 worker status for PATCH_READY (no V2 equivalent exists);
 *   - usage/cost numbers (pinned to UNKNOWN_V1);
 *   - "not integrated" / "no findings" / "failed" from missing evidence;
 *   - patch uselessness from a schema-invalid handoff (patch usefulness is
 *     independent of handoff validity; only a recorded MANUAL_INTEGRATION
 *     controller action establishes USEFUL in the v1.0 variant);
 *   - zero activity from missing later ledger coverage.
 *
 * KNOWN_ZERO vs UNKNOWN_V1: an empty worker-provided list is a KNOWN_ZERO
 * claim (evidenceRefCount/changedFileCount when the list is present); a
 * missing/null log path, missing later events, missing integration
 * evidence, missing usage, or missing review records are UNKNOWN_V1.
 *
 * The source bytes are hashed (sha256) into `sourceDigest` so any later
 * mutation of the V1 evidence is detectable; the reader never writes
 * anything back.
 */

import { sha256Hex } from './digest.mjs';
import { UNKNOWN_V1, V1_COMPAT, stampCompatRecord } from './schemas.mjs';
import { SUPPORTED_V1_VERSION } from './version.mjs';
import { parseV1Handoff, unknownClaim } from './handoff.mjs';

/** V2 work-unit id pattern (shared IDs); used only as a syntactic match. */
const V2_WORK_UNIT_ID_PATTERN = /^lcim_wu_[0-9a-f]{32}$/;

/**
 * V2-pattern compatibility of a work-unit id. A concrete string id is a
 * boolean fact (pattern match => true, nonmatch => false). An unavailable
 * id is the reserved sentinel UNKNOWN_V1 and stays UNKNOWN_V1 — the
 * sentinel itself is NEVER evidence of incompatibility (unknown
 * compatibility is not known incompatibility).
 */
function v2PatternCompatibility(id) {
  return typeof id === 'string' && id !== UNKNOWN_V1 ? V2_WORK_UNIT_ID_PATTERN.test(id) : UNKNOWN_V1;
}

/**
 * Build the projection for a parsed V1 ledger.
 *
 * @param {object} parsed - result of parseV1Ledger().
 * @param {{sourceBytes: string}} input - exact source text.
 * @returns {Readonly<object>} frozen, schema-valid lcim.v1.projection.
 */
export function projectV1Ledger(parsed, { sourceBytes }) {
  const workUnits = parsed.workUnits.map(projectWorkUnitFromLedger);
  return stampCompatRecord('lcim.v1.projection', {
    provenance: V1_COMPAT,
    sourceKind: 'ledger',
    sourceVersion: SUPPORTED_V1_VERSION,
    sourceByteCount: Buffer.byteLength(sourceBytes, 'utf8'),
    sourceDigest: sha256Hex(sourceBytes),
    ledger: {
      eventCount: parsed.events.length,
      chainValid: parsed.chain.valid,
      workUnitCount: workUnits.length,
    },
    workUnits,
  });
}

/**
 * Build the projection for a standalone V1 handoff / final-response source.
 *
 * @param {object} parsed - result of parseV1Handoff() / interpretV1FinalResponse().
 * @param {{kind: 'handoff'|'response', sourceBytes: string}} input
 * @returns {Readonly<object>} frozen, schema-valid lcim.v1.projection.
 */
export function projectV1Payload(parsed, { kind, sourceBytes }) {
  const payload = parsed.value;
  const workUnitId =
    payload !== null && typeof payload === 'object' && !Array.isArray(payload) &&
    typeof payload.workUnitId === 'string' && payload.workUnitId.length > 0
      ? payload.workUnitId
      : UNKNOWN_V1;
  const workUnit = {
    workUnitId,
    workUnitIdV2PatternCompatible: v2PatternCompatibility(workUnitId),
    assignment: {
      present: false,
      taskSummary: UNKNOWN_V1,
      baseShaClaim: UNKNOWN_V1,
    },
    handoff: {
      present: true,
      parseable: parsed.parseable,
      normalization: parsed.normalization ?? UNKNOWN_V1,
      historicallySchemaValid: parsed.historicallySchemaValid,
      v2WorkerSchemaValid: parsed.v2WorkerSchemaValid,
      defect: parsed.defect,
      workerClaim: parsed.workerClaim,
    },
    // A standalone worker payload carries no ledger context: patch
    // usefulness, integration, and coverage are all UNKNOWN_V1. A worker
    // claim (even PATCH_READY) never establishes patch usefulness.
    patch: { usefulness: UNKNOWN_V1, usefulnessEvidence: UNKNOWN_V1, preserved: true },
    controller: {
      manualIntegrationObserved: UNKNOWN_V1,
      integrationNote: UNKNOWN_V1,
      v1RejectionObserved: UNKNOWN_V1,
      v2Disposition: UNKNOWN_V1,
    },
    coverage: {
      laterLedgerCoverageKnown: false,
      laterEventCount: UNKNOWN_V1,
      incomplete: UNKNOWN_V1,
      laterInvocationRecords: UNKNOWN_V1,
    },
    usageCost: { tokens: UNKNOWN_V1, cost: UNKNOWN_V1 },
    semanticReview: { findings: UNKNOWN_V1 },
  };
  return stampCompatRecord('lcim.v1.projection', {
    provenance: V1_COMPAT,
    sourceKind: kind,
    sourceVersion: SUPPORTED_V1_VERSION,
    sourceByteCount: Buffer.byteLength(sourceBytes, 'utf8'),
    sourceDigest: sha256Hex(sourceBytes),
    workUnits: [workUnit],
  });
}

/**
 * Project one work unit of a parsed V1 ledger.
 *
 * Facts established only from the events actually present:
 * - assignment facts come from the ASSIGNMENT event; a V1 baseSha claim is
 *   a CLAIM, never a V2 expectedBaseSha fact;
 * - handoff facts come from the HANDOFF event's response text (when
 *   available); a ref-only response leaves parseability and every claim
 *   UNKNOWN_V1;
 * - a MANUAL_INTEGRATION controller action establishes manual integration
 *   AND patch usefulness (USEFUL); a REJECTION action is recorded as a
 *   historical V1 rejection — never as a V2 REJECTED disposition and never
 *   as proof of uselessness;
 * - absent later events => laterLedgerCoverageKnown false, incomplete true,
 *   laterEventCount UNKNOWN_V1 — never zero activity.
 */
function projectWorkUnitFromLedger(wu) {
  const manualAction = wu.actions.find((a) => a.action?.actionKind === 'MANUAL_INTEGRATION') ?? null;
  const hasManual = manualAction !== null;
  const hasRejection = wu.actions.some((a) => a.action?.actionKind === 'REJECTION');
  const coverageKnown = wu.actions.length > 0;
  return {
    workUnitId: wu.workUnitId,
    workUnitIdV2PatternCompatible: v2PatternCompatibility(wu.workUnitId),
    assignment: {
      present: wu.assignment !== null,
      taskSummary:
        typeof wu.assignment?.assignment?.summary === 'string' && wu.assignment.assignment.summary.length > 0
          ? wu.assignment.assignment.summary
          : UNKNOWN_V1,
      baseShaClaim:
        typeof wu.assignment?.assignment?.baseShaClaim === 'string' && wu.assignment.assignment.baseShaClaim.length > 0
          ? wu.assignment.assignment.baseShaClaim
          : UNKNOWN_V1,
    },
    handoff: projectLedgerHandoff(wu),
    patch: {
      usefulness: hasManual ? 'USEFUL' : UNKNOWN_V1,
      usefulnessEvidence: hasManual
        ? typeof manualAction.action?.note === 'string' && manualAction.action.note.length > 0
          ? manualAction.action.note
          : `V1 ledger event seq ${manualAction.seq}: CONTROLLER_ACTION MANUAL_INTEGRATION`
        : UNKNOWN_V1,
      // The projection never erases the possibility of a useful patch:
      // a schema-invalid handoff proves nothing about the patch.
      preserved: true,
    },
    controller: {
      // NEVER false: absence of integration evidence is UNKNOWN_V1, not
      // "not integrated" (schema pins this to true|UNKNOWN_V1).
      manualIntegrationObserved: hasManual ? true : UNKNOWN_V1,
      integrationNote:
        hasManual && typeof manualAction.action?.note === 'string' && manualAction.action.note.length > 0
          ? manualAction.action.note
          : UNKNOWN_V1,
      v1RejectionObserved: hasRejection ? true : UNKNOWN_V1,
      v2Disposition: UNKNOWN_V1,
    },
    coverage: {
      laterLedgerCoverageKnown: coverageKnown,
      laterEventCount: coverageKnown ? wu.actions.length : UNKNOWN_V1,
      incomplete: coverageKnown ? false : true,
      // V1 kept no later invocation records (failure class C6): this fact
      // is never reconstructable from v1.0 evidence.
      laterInvocationRecords: UNKNOWN_V1,
    },
    usageCost: { tokens: UNKNOWN_V1, cost: UNKNOWN_V1 },
    semanticReview: { findings: UNKNOWN_V1 },
  };
}

/** Handoff facts for one ledger work unit. */
function projectLedgerHandoff(wu) {
  if (wu.handoff === null) {
    return {
      present: false,
      parseable: UNKNOWN_V1,
      normalization: UNKNOWN_V1,
      historicallySchemaValid: UNKNOWN_V1,
      v2WorkerSchemaValid: UNKNOWN_V1,
      defect: UNKNOWN_V1,
      workerClaim: unknownClaim(),
    };
  }
  const text = wu.handoff.response?.text;
  if (typeof text !== 'string' || text.trim() === '') {
    // Response reference only (or empty text): the response evidence is
    // not available. parseable stays UNKNOWN_V1 — unavailable evidence is
    // never called malformed.
    return {
      present: true,
      parseable: UNKNOWN_V1,
      normalization: UNKNOWN_V1,
      historicallySchemaValid: UNKNOWN_V1,
      v2WorkerSchemaValid: UNKNOWN_V1,
      defect: UNKNOWN_V1,
      workerClaim: unknownClaim(),
    };
  }
  const interpreted = parseV1Handoff(text);
  return {
    present: true,
    parseable: interpreted.parseable,
    normalization: interpreted.normalization ?? UNKNOWN_V1,
    historicallySchemaValid: interpreted.historicallySchemaValid,
    v2WorkerSchemaValid: interpreted.v2WorkerSchemaValid,
    defect: interpreted.defect,
    workerClaim: interpreted.workerClaim,
  };
}
