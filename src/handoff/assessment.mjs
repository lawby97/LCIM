/**
 * LCIM V2 worker-handoff assessment (Sprint 02).
 *
 * Combines response-presence, process-completion observation, parsing,
 * schema validation, raw-response preservation, and the state separation
 * guarantee into one immutable assessment record.
 *
 * Guarantees:
 * - A malformed or missing handoff NEVER marks the underlying isolated
 *   patch nonexistent: `patchPreserved` is always true, `patchObserved`
 *   stays null until the controller explicitly records an observation
 *   (Sprint 03 owns the evidence), and this module never touches the
 *   worktree.
 * - No controller disposition is ever derived here: `controllerValidated`
 *   stays null; `workerStatus` is recorded verbatim only when the payload
 *   is schema-valid.
 * - `responseReceived` is transport evidence only; `modelProcessCompleted`
 *   is an explicit controller/provider observation (null/unknown until
 *   supplied) and is NEVER derived from response presence or absence.
 * - The raw response is preserved byte-exact under the runtime root and
 *   only *referenced* by reports (`rawResponseRef`); report summaries
 *   never embed raw content.
 */

import { ConfigError } from '../shared/errors.mjs';
import { isValidId } from '../shared/ids.mjs';
import { parseWorkerResponse } from './parse.mjs';
import { validateWorkerResult } from './validate.mjs';
import { preserveRawResponse } from './preserve.mjs';
import { TRANSPORT_DEFECT } from './states.mjs';
import { WORKER_RESULT_SCHEMA_VERSION } from '../workers/contract.mjs';

/**
 * Assess one worker handoff.
 *
 * @param {object} input
 * @param {string} input.workUnitId - lcim_wu_ id the worker was asked to echo.
 * @param {string|null|undefined} input.rawResponse - exact final response text.
 *   Non-empty content is TRANSPORT EVIDENCE only (sets `responseReceived`);
 *   it is never used to infer provider/model process completion, and its
 *   absence never synthesizes workerStatus, failure, patch absence, or
 *   controller rejection.
 * @param {boolean|null|undefined} [input.modelProcessCompleted] - explicit
 *   CONTROLLER-OWNED observation of objective model/provider process
 *   completion. `true`/`false` when the controller observed the fact;
 *   `null` or omitted when unknown. Never derived from rawResponse; any
 *   non-boolean supplied value fails closed with ConfigError. Sprint 01 /
 *   later provider/controller layers supply the objective fact.
 * @param {string|null} [input.runtimeRoot] - runtime root for raw-response
 *   preservation (canonically `<git-common-dir>/lcim`); null skips
 *   preservation.
 * @returns {Readonly<Assessment>} frozen assessment record.
 */
export function assessHandoff({ workUnitId, rawResponse, runtimeRoot = null, modelProcessCompleted = null }) {
  if (!isValidId('work-unit', workUnitId)) {
    throw new ConfigError(`assessHandoff requires a valid work-unit id, got ${JSON.stringify(workUnitId)}`);
  }
  if (modelProcessCompleted !== null && typeof modelProcessCompleted !== 'boolean') {
    throw new ConfigError(
      `assessHandoff modelProcessCompleted must be an explicit boolean controller observation or null/undefined (unknown), got ${JSON.stringify(modelProcessCompleted)}`,
    );
  }

  const hasHandoff = typeof rawResponse === 'string' && rawResponse.trim() !== '';

  const assessment = {
    workUnitId,
    schemaVersion: WORKER_RESULT_SCHEMA_VERSION,
    states: {
      // Transport evidence only: non-empty response content was received.
      // NEVER an inference about the provider/model process.
      responseReceived: hasHandoff,
      // Objective controller/provider observation; unknown (null) until
      // explicitly supplied. Never derived from rawResponse.
      modelProcessCompleted: modelProcessCompleted ?? null,
      responseParsed: false,
      responseSchemaValid: false,
      // Never derived from transport validity; only the controller may set
      // it via recordPatchObservation (Sprint 03 provides the evidence).
      patchObserved: null,
      // Never set by this sprint's code; Sprint 03+ decides dispositions.
      controllerValidated: null,
    },
    parse: {
      state: hasHandoff ? 'PARSE_FAILED' : 'NO_RESPONSE',
      normalization: null,
      error: null,
    },
    schema: { state: 'NOT_VALIDATED', errors: [] },
    transportDefect: null,
    // This assessment never erased or invalidated worktree/patch evidence.
    patchPreserved: true,
    workerStatus: null,
    workerResult: null,
    rawPreserved: false,
    rawResponseRef: null,
  };

  if (!hasHandoff) {
    return freezeAssessment(assessment);
  }

  if (runtimeRoot) {
    try {
      assessment.rawResponseRef = preserveRawResponse(runtimeRoot, workUnitId, rawResponse).ref;
      assessment.rawPreserved = true;
    } catch {
      // Preservation is best-effort local debugging aid; parse/validation
      // proceed independently. The assessment records that raw was not
      // preserved.
      assessment.rawPreserved = false;
    }
  }

  let parsed;
  try {
    parsed = parseWorkerResponse(rawResponse);
  } catch (err) {
    assessment.parse = {
      state: 'PARSE_FAILED',
      normalization: null,
      error: {
        code: 'TRANSPORT_MALFORMED',
        message: err instanceof Error ? err.message : String(err),
      },
    };
    assessment.transportDefect = TRANSPORT_DEFECT.TRANSPORT_MALFORMED;
    return freezeAssessment(assessment);
  }

  assessment.parse = {
    state: 'PARSED',
    normalization: parsed.normalization,
    extraction: {
      method: parsed.extraction.method,
      startLine: parsed.extraction.startLine ?? null,
      endLine: parsed.extraction.endLine ?? null,
      start: parsed.extraction.start ?? null,
      end: parsed.extraction.end ?? null,
    },
    error: null,
  };
  assessment.states.responseParsed = true;

  const validation = validateWorkerResult(parsed.value);
  if (!validation.ok) {
    assessment.schema = { state: 'INVALID', errors: validation.errors };
    assessment.transportDefect = TRANSPORT_DEFECT.SCHEMA_MISMATCH;
    return freezeAssessment(assessment);
  }

  assessment.schema = { state: 'VALID', errors: [] };
  assessment.states.responseSchemaValid = true;
  assessment.workerStatus = parsed.value.workerStatus;
  assessment.workerResult = Object.freeze(parsed.value);
  return freezeAssessment(assessment);
}

/**
 * Controller-only transition: record whether patch evidence was observed.
 * Pure — returns a new frozen assessment. This is the ONLY way the patch
 * state advances; it is never derived from parse/schema results, so an
 * invalid/missing handoff cannot mark a patch nonexistent.
 *
 * @param {Readonly<Assessment>} assessment
 * @param {boolean} observed - true when the controller observed
 *   worktree/patch evidence (Sprint 03 provides the evidence facts).
 */
export function recordPatchObservation(assessment, observed) {
  return freezeAssessment({
    ...assessment,
    states: { ...assessment.states, patchObserved: observed },
  });
}

/**
 * Public-safe report summary: references the preserved raw response
 * (`rawResponseRef`) but never embeds raw content, never embeds patch
 * content, and never claims a controller disposition.
 */
export function summarizeForReport(assessment) {
  return Object.freeze({
    workUnitId: assessment.workUnitId,
    schemaVersion: assessment.schemaVersion,
    states: Object.freeze({ ...assessment.states }),
    parseState: assessment.parse.state,
    normalization: assessment.parse.normalization,
    schemaState: assessment.schema.state,
    transportDefect: assessment.transportDefect,
    workerStatus: assessment.workerStatus,
    acceptanceClaimCount: assessment.workerResult
      ? (assessment.workerResult.acceptanceClaims ?? []).length
      : 0,
    remainingIssueCount: assessment.workerResult
      ? (assessment.workerResult.remainingIssues ?? []).length
      : 0,
    rawPreserved: assessment.rawPreserved,
    rawResponseRef: assessment.rawResponseRef,
  });
}

function freezeAssessment(assessment) {
  return Object.freeze({
    ...assessment,
    states: Object.freeze({ ...assessment.states }),
    parse: Object.freeze({ ...assessment.parse }),
    schema: Object.freeze({ ...assessment.schema, errors: Object.freeze([...assessment.schema.errors]) }),
  });
}
