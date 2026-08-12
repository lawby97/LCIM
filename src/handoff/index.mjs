/**
 * LCIM V2 handoff public API (Sprint 02).
 *
 * Sprint 02 owns the simplified worker contract and the safe parsing /
 * transport-separation layer:
 * - `src/workers/contract.mjs` — model-owned vs controller-owned vocabulary.
 * - `src/handoff/parse.mjs` — strict parse first, then recorded syntactic
 *   normalization (fence / prose-wrapped) only.
 * - `src/handoff/validate.mjs` — schema validation (SCHEMA_MISMATCH) with
 *   objective-evidence diagnostics.
 * - `src/handoff/states.mjs` — the six separated handoff states.
 * - `src/handoff/preserve.mjs` — byte-exact raw-response preservation.
 * - `src/handoff/assessment.mjs` — combined immutable assessment with the
 *   "malformed handoff never erases patch evidence" guarantee.
 */

export { parseWorkerResponse, NORMALIZATION } from './parse.mjs';
export {
  validateWorkerResult,
  assertWorkerResult,
  loadWorkerResultSchema,
} from './validate.mjs';
export { HANDOFF_STATE, TRANSPORT_DEFECT, PARSE_STATE, SCHEMA_STATE } from './states.mjs';
export { preserveRawResponse, rawResponseRef, handoffDir } from './preserve.mjs';
export { assessHandoff, recordPatchObservation, summarizeForReport } from './assessment.mjs';
export {
  WORKER_RESULT_SCHEMA_NAME,
  WORKER_RESULT_SCHEMA_VERSION,
  WORKER_RESULT_SCHEMA_FILE,
  WORKER_OWNED_FIELDS,
  ACCEPTANCE_CLAIM_OWNED_FIELDS,
  WORKER_FORBIDDEN_FIELDS,
  isWorkerOwnedField,
  isForbiddenField,
  listObjectiveEvidenceViolations,
} from '../workers/contract.mjs';
export { WORKER_STATUS } from '../shared/enums.mjs';
