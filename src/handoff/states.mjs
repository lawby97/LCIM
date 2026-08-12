/**
 * LCIM V2 handoff state separation (Sprint 02).
 *
 * A worker handoff has six SEPARATE states (V2 principle 3; V1 failure
 * classes C2/C3). They are deliberately independent: a defect in an early
 * state never erases evidence that later states would use.
 *
 *   1. RESPONSE_RECEIVED         — transport evidence: a non-empty raw
 *      response text was received. Absence of a response is NOT evidence
 *      of timeout/crash/provider error/orphan — those are objective
 *      controller/provider facts that Sprint 02 never infers from
 *      transport.
 *   2. MODEL_PROCESS_COMPLETED   — objective controller/provider
 *      observation, supplied explicitly to assessHandoff(); null
 *      (unknown) until supplied. NEVER derived from response presence or
 *      absence: a non-empty response is not proof the provider/model
 *      process completed, and an empty/missing response is not proof it
 *      failed, crashed, or timed out.
 *   3. RESPONSE_PARSED           — the raw text was parsed into a payload
 *      (strict, or one recorded syntactic normalization).
 *   4. RESPONSE_SCHEMA_VALID     — the parsed payload satisfies the
 *      worker-result schema (model-owned fields only).
 *   5. PATCH_OBSERVED            — controller observed worktree/patch
 *      evidence (Sprint 03 owns the evidence; Sprint 02 only guarantees
 *      the state is independent of transport validity). NEVER derived
 *      from parse/schema results; never auto-set.
 *   6. CONTROLLER_VALIDATED      — the controller decided a disposition
 *      (Sprint 03+; workers never reach this state).
 *
 * Patch evidence is never erased or marked nonexistent by a handoff
 * assessment: `patchPreserved` is always true for assessments produced by
 * this sprint's code, and `patchObserved` stays null (pending observation)
 * until the controller explicitly records it.
 */

/** The six separated handoff states. */
export const HANDOFF_STATE = Object.freeze({
  RESPONSE_RECEIVED: 'RESPONSE_RECEIVED',
  MODEL_PROCESS_COMPLETED: 'MODEL_PROCESS_COMPLETED',
  RESPONSE_PARSED: 'RESPONSE_PARSED',
  RESPONSE_SCHEMA_VALID: 'RESPONSE_SCHEMA_VALID',
  PATCH_OBSERVED: 'PATCH_OBSERVED',
  CONTROLLER_VALIDATED: 'CONTROLLER_VALIDATED',
});

/**
 * Transport defects (rejection-taxonomy codes the handoff layer may
 * produce). TRANSPORT_MALFORMED = could not parse; SCHEMA_MISMATCH =
 * parsed but schema-invalid. Both are recoverable evidence defects: they
 * never invalidate or erase worktree/patch evidence.
 */
export const TRANSPORT_DEFECT = Object.freeze({
  TRANSPORT_MALFORMED: 'TRANSPORT_MALFORMED',
  SCHEMA_MISMATCH: 'SCHEMA_MISMATCH',
});

/** Parse sub-states recorded on an assessment. */
export const PARSE_STATE = Object.freeze([
  'NO_RESPONSE',
  'PARSE_FAILED',
  'PARSED',
]);

/** Schema sub-states recorded on an assessment. */
export const SCHEMA_STATE = Object.freeze([
  'NOT_VALIDATED',
  'VALID',
  'INVALID',
]);
