/**
 * LCIM V2 Sprint 08 deterministic, normal-export-safe projections.
 *
 * Canonical Sprint-01 events/records are immutable forensic evidence. This
 * module derives local audit projections only; it never mutates canonical
 * data and routes every normal-export value through the Sprint-08
 * sanitization boundary where needed.
 *
 * State separation:
 * - modelReportedStatus: UNKNOWN (Sprint-01 ledger deliberately never
 *   persists the Sprint-02 worker-status vocabulary);
 * - transportSchemaStatus: outcomes + transport/schema taxonomy;
 * - controllerValidation: controller ASSESSMENT facts (not semantic facts);
 * - semanticDisposition: explicit semantic rejection only; semantic
 *   acceptance is UNKNOWN because Sprint-01 has no independent fact for it;
 * - finalIntegration: UNKNOWN (Sprint 10 owns integration evidence).
 */

import { stampReviewSummary } from './schemas.mjs';
import {
  sanitizeDimension,
  sanitizeEvidenceRefs,
  sanitizeSummary,
} from './sanitize.mjs';
import { compareStartedStates, compareTimestampThenId } from './time.mjs';

/** Rejection codes that prove a semantic rejection fact. */
export const SEMANTIC_REJECTION_CODES = Object.freeze([
  'SEMANTIC_CONFLATION',
  'UNRESOLVED_SEMANTICS',
  'UNSUPPORTED_CLAIM',
]);

/** Rejection codes that mean transport/schema evidence failed. */
export const TRANSPORT_SCHEMA_CODES = Object.freeze([
  'TRANSPORT_MALFORMED',
  'SCHEMA_MISMATCH',
]);

/** Provider outcomes that are not a successful provider call. */
export const FAILED_OUTCOMES = Object.freeze(['FAILURE', 'TIMEOUT', 'TRANSPORT_ERROR', 'CANCELED']);

export function isSemanticRejectionCode(code) {
  return SEMANTIC_REJECTION_CODES.includes(code);
}

export function isTransportSchemaCode(code) {
  return TRANSPORT_SCHEMA_CODES.includes(code);
}

/**
 * Pro-model classifier for the public-safe model labels used by metrics.
 * Unknown raw model strings are opaque labels before metrics see them, so
 * they cannot leak text or be heuristically treated as Pro escalations.
 */
export function isProModel(model) {
  return model === 'deepseek-pro-max';
}

/** Deterministic per-invocation ordering: chronological START instant, ID tie-break. */
export function byStartedAt(a, b) {
  return compareStartedStates(a, b);
}

/** Latest known lifecycle timestamp of an invocation state. */
function lastEventTime(st) {
  return st.assessedAt ?? st.completedAt ?? st.reconciledAt ?? st.startedAt;
}

function byLatestEventTime(a, b) {
  return compareTimestampThenId(lastEventTime(a), a.invocationId, lastEventTime(b), b.invocationId);
}

function latest(states, comparator) {
  if (states.length === 0) return null;
  return [...states].sort(comparator)[states.length - 1];
}

/**
 * The normal-export invocation record. It retains the Sprint-01 family
 * shape where valid, but omits arbitrary model/controller free text
 * (summary, unsafe evidence refs, errorCode) and replaces schema-permitted
 * arbitrary dimensions with safe labels.
 */
export function invocationRecordFromState(st) {
  const safeRefs = sanitizeEvidenceRefs(st.evidenceRefs);
  const record = {
    schemaName: 'lcim.invocation',
    schemaVersion: '1.0.0',
    invocationId: st.invocationId,
    runId: st.runId,
    workUnitId: st.workUnitId,
    status: st.status,
    provider: sanitizeDimension('provider', st.provider),
    model: sanitizeDimension('model', st.model),
    role: st.role,
    reasoningEffort: sanitizeDimension('reasoning', st.reasoningEffort),
    startedAt: st.startedAt,
    completedAt: st.completedAt ?? null,
    assessedAt: st.assessedAt ?? null,
    reconciledAt: st.reconciledAt ?? null,
    outcome: st.outcome,
    usage: st.usage,
    rejectionCode: st.rejectionCode,
    assessmentResult: st.assessmentResult,
    reconciliationReason: st.reconciliationReason,
    supersededByInvocationId: st.supersededByInvocationId,
  };
  // summary is intentionally omitted: bounded is not public-safe.
  if (safeRefs !== null) record.evidenceRefs = safeRefs;
  return record;
}

/** All valid states of a loaded run, chronologically ordered. */
function orderedStates(loadedRun) {
  return [...loadedRun.states.values()].sort(byStartedAt);
}

/** invocations.jsonl: one sanitized normal-export record per invocation. */
export function buildInvocationLines(loadedRuns) {
  const lines = [];
  for (const lr of loadedRuns) {
    for (const st of orderedStates(lr)) lines.push(invocationRecordFromState(st));
  }
  lines.sort((a, b) => (a.runId !== b.runId ? (a.runId < b.runId ? -1 : 1) : a.invocationId < b.invocationId ? -1 : a.invocationId > b.invocationId ? 1 : 0));
  return lines;
}

/** Derive the transport/schema state of one work unit. */
export function deriveTransportSchemaStatus(invocations) {
  if (invocations.some((s) => s.rejectionCode === 'SCHEMA_MISMATCH')) return 'SCHEMA_MISMATCH';
  if (invocations.some((s) => s.rejectionCode === 'TRANSPORT_MALFORMED' || s.outcome === 'TRANSPORT_ERROR')) return 'TRANSPORT_FAILURE';
  if (invocations.some((s) => s.outcome !== undefined && FAILED_OUTCOMES.includes(s.outcome))) return 'CALL_FAILURE';
  if (invocations.length > 0 && invocations.every((s) => s.status === 'ASSESSED')) return 'OK';
  return 'UNKNOWN';
}

/**
 * Implementation status is WORKER-only. Accepted SOL/SOL_PRO reviews are
 * controller review facts, never implementation acceptance.
 */
export function deriveWorkUnitStatus(invocations) {
  const worker = [...invocations].filter((s) => s.role === 'WORKER').sort(byStartedAt);
  if (worker.length === 0) return 'UNKNOWN';
  if (worker.some((s) => s.assessmentResult === 'ACCEPTED')) return 'ACCEPTED';
  if (worker.some((s) => s.assessmentResult === 'REJECTED')) return 'REJECTED';
  if (worker.every((s) => s.status === 'ORPHANED' || s.status === 'SUPERSEDED')) return 'RECONCILED';
  if (worker.some((s) => s.status === 'STARTED' || s.status === 'COMPLETED')) return 'INCOMPLETE';
  return 'UNKNOWN';
}

/** True only for an explicit rejected WORKER -> later accepted WORKER sequence. */
export function deriveRepairAccepted(workerInvocations) {
  let rejectedSeen = false;
  for (const st of [...workerInvocations].sort(byStartedAt)) {
    if (st.assessmentResult === 'REJECTED') rejectedSeen = true;
    if (st.assessmentResult === 'ACCEPTED' && rejectedSeen) return true;
  }
  return false;
}

/**
 * First implementation disposition. `null` is authoritative UNKNOWN when
 * there is no WORKER invocation or the first WORKER call was unassessed.
 */
export function deriveFirstPassAccepted(workerInvocations) {
  const first = [...workerInvocations].sort(byStartedAt)[0] ?? null;
  if (first === null) return null;
  if (first.assessmentResult === 'ACCEPTED') return true;
  if (first.assessmentResult === 'REJECTED') return false;
  return null;
}

/** Controller validation summary across all invocation assessments. */
function deriveControllerValidation(invocations) {
  const values = new Set(invocations.map((s) => s.assessmentResult).filter((v) => v !== undefined));
  if (values.size === 0) return invocations.length > 0 ? 'NONE' : 'UNKNOWN';
  if (values.size === 1) return values.has('ACCEPTED') ? 'ACCEPTED' : 'REJECTED';
  return 'MIXED';
}

/** One work-units.jsonl line. */
export function buildWorkUnitLine(loadedRun, workUnitId, invocations) {
  const ordered = [...invocations].sort(byStartedAt);
  const worker = ordered.filter((s) => s.role === 'WORKER');
  const workerAccepted = worker.filter((s) => s.assessmentResult === 'ACCEPTED');
  const workerAssessed = worker.filter((s) => s.status === 'ASSESSED');
  const workerCoded = worker.filter((s) => s.rejectionCode !== undefined);
  const status = deriveWorkUnitStatus(worker);
  const firstPassAccepted = deriveFirstPassAccepted(worker);
  const repairAccepted = deriveRepairAccepted(worker);
  const latestWorkerAccepted = latest(workerAccepted, (a, b) => compareTimestampThenId(a.assessedAt, a.invocationId, b.assessedAt, b.invocationId));
  const latestWorkerAssessed = latest(workerAssessed, (a, b) => compareTimestampThenId(a.assessedAt, a.invocationId, b.assessedAt, b.invocationId));
  const latestWorkerCoded = latest(workerCoded, byLatestEventTime);

  // Sprint-01 has explicit semantic REJECTION taxonomy but no independent
  // semantic acceptance/disposition event. Never infer semantic ACCEPTED
  // from controller assessment ACCEPTED.
  const semanticDisposition = ordered.some(
    (s) => s.assessmentResult === 'REJECTED' && isSemanticRejectionCode(s.rejectionCode),
  )
    ? 'SEMANTIC_REJECTED'
    : 'UNKNOWN';

  return {
    schemaName: 'lcim.audit.work-unit',
    schemaVersion: '1.0.0',
    workUnitId,
    runId: loadedRun.runId,
    expectedBaseSha: loadedRun.run?.targetBaseSha ?? null,
    invocationCount: ordered.length,
    firstInvocationId: ordered[0]?.invocationId ?? null,
    acceptedInvocationId: latestWorkerAccepted?.invocationId ?? null,
    status,
    firstPassAccepted,
    repairAccepted,
    // Retained as an explicit compatibility alias for earlier S08 output.
    repairedAfterRejection: repairAccepted,
    lastAssessmentResult: latestWorkerAssessed?.assessmentResult ?? null,
    lastRejectionCode: latestWorkerCoded?.rejectionCode ?? null,
    firstStartedAt: ordered[0]?.startedAt ?? null,
    lastAssessedAt: latestWorkerAssessed?.assessedAt ?? null,
    states: {
      modelReportedStatus: 'UNKNOWN',
      transportSchemaStatus: deriveTransportSchemaStatus(ordered),
      controllerValidation: deriveControllerValidation(ordered),
      semanticDisposition,
      finalIntegration: 'UNKNOWN',
    },
  };
}

/** work-units.jsonl: one implementation-oriented line per run/work-unit. */
export function buildWorkUnitLines(loadedRuns) {
  const lines = [];
  for (const lr of loadedRuns) {
    const groups = new Map();
    for (const st of lr.states.values()) {
      if (!groups.has(st.workUnitId)) groups.set(st.workUnitId, []);
      groups.get(st.workUnitId).push(st);
    }
    for (const workUnitId of [...groups.keys()].sort()) {
      lines.push(buildWorkUnitLine(lr, workUnitId, groups.get(workUnitId)));
    }
  }
  return lines;
}

/**
 * reviews.jsonl: one sanitized line per SOL/SOL_PRO invocation.
 *
 * The Sprint-01 ledger does not identify findings, rechecks, repairs, or
 * finding resolution. Therefore all such fields are explicit null/unknown;
 * ordering and summary prose are never treated as authoritative linkage.
 */
export function buildReviewLines(loadedRuns) {
  const lines = [];
  for (const lr of loadedRuns) {
    const reviewStates = [...lr.states.values()]
      .filter((s) => s.role === 'SOL' || s.role === 'SOL_PRO')
      .sort(byStartedAt);
    for (const st of reviewStates) {
      lines.push(
        stampReviewSummary({
          reviewInvocationId: st.invocationId,
          runId: st.runId,
          workUnitId: st.workUnitId,
          role: st.role,
          provider: sanitizeDimension('provider', st.provider),
          model: sanitizeDimension('model', st.model),
          reasoningEffort: sanitizeDimension('reasoning', st.reasoningEffort),
          status: st.status,
          outcome: st.outcome ?? null,
          assessmentResult: st.assessmentResult ?? null,
          rejectionCode: st.rejectionCode ?? null,
          summary: sanitizeSummary(st.summary),
          evidenceRefs: sanitizeEvidenceRefs(st.evidenceRefs),
          startedAt: st.startedAt,
          assessedAt: st.assessedAt ?? null,
          findingDelivered: null,
          recheckOf: null,
          survivedRepair: null,
        }),
      );
    }
  }
  lines.sort((a, b) => byStartedAt(
    { startedAt: a.startedAt, invocationId: a.reviewInvocationId },
    { startedAt: b.startedAt, invocationId: b.reviewInvocationId },
  ));
  return lines;
}

/** Round a computed cost to 6 decimal places for deterministic output. */
export function roundCostUsd(value) {
  return Number(value.toFixed(6));
}

function ownPricingRate(pricing, provider, model) {
  if (pricing === null || typeof pricing !== 'object' || !Object.hasOwn(pricing, provider)) return undefined;
  const models = pricing[provider];
  if (models === null || typeof models !== 'object' || !Object.hasOwn(models, model)) return undefined;
  return models[model];
}

function nonAcceptedCategory(st) {
  if (st.assessmentResult === 'REJECTED') return 'REJECTED';
  if (st.assessmentResult === 'ACCEPTED') return null;
  if (st.status === 'ORPHANED' || st.status === 'SUPERSEDED') return 'ORPHANED';
  if (st.outcome !== undefined && FAILED_OUTCOMES.includes(st.outcome)) return 'FAILED_UNASSESSED';
  return 'UNASSESSED';
}

/**
 * usage.jsonl: one sanitized line per invocation.
 *
 * `rejectedWaste` is reserved strictly for explicit REJECTED assessments.
 * Orphaned, incomplete, and otherwise unassessed calls are visible through
 * `nonAcceptedCategory` but never mislabeled as rejected.
 */
export function buildUsageLines(loadedRuns, pricing = null) {
  const lines = [];
  for (const lr of loadedRuns) {
    for (const st of orderedStates(lr)) {
      const available = st.usage !== undefined && st.usage !== null;
      let costUsd = null;
      let costAvailability = 'UNKNOWN';
      if (available && pricing !== null) {
        const rate = ownPricingRate(pricing, st.provider, st.model);
        if (rate !== undefined) {
          costUsd = roundCostUsd(
            (st.usage.inputTokens / 1e6) * rate.inputPerMillion + (st.usage.outputTokens / 1e6) * rate.outputPerMillion,
          );
          costAvailability = 'COMPUTED';
        }
      }
      const rejectedWaste = st.assessmentResult === 'REJECTED';
      lines.push({
        schemaName: 'lcim.audit.usage',
        schemaVersion: '1.0.0',
        invocationId: st.invocationId,
        runId: st.runId,
        workUnitId: st.workUnitId,
        provider: sanitizeDimension('provider', st.provider),
        model: sanitizeDimension('model', st.model),
        role: st.role,
        status: st.status,
        assessmentResult: st.assessmentResult ?? null,
        rejectionCode: st.rejectionCode ?? null,
        usageAvailability: available ? 'AVAILABLE' : 'UNAVAILABLE',
        usage: available ? st.usage : null,
        costAvailability,
        costUsd,
        rejectedWaste,
        nonAcceptedCategory: nonAcceptedCategory(st),
        wasteTokens: rejectedWaste && available ? st.usage.totalTokens : null,
        wasteCostUsd: rejectedWaste && costUsd !== null ? costUsd : null,
      });
    }
  }
  lines.sort((a, b) => (a.runId !== b.runId ? (a.runId < b.runId ? -1 : 1) : a.invocationId < b.invocationId ? -1 : a.invocationId > b.invocationId ? 1 : 0));
  return lines;
}

/** All four projection families for selected, validated runs. */
export function buildProjections(loadedRuns, pricing = null) {
  return {
    invocations: buildInvocationLines(loadedRuns),
    workUnits: buildWorkUnitLines(loadedRuns),
    reviews: buildReviewLines(loadedRuns),
    usage: buildUsageLines(loadedRuns, pricing),
  };
}
