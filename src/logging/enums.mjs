/**
 * LCIM V2 Sprint 01 logging vocabularies (ledger, run store, invocation
 * lifecycle).
 *
 * These enums are owned by Sprint 01 and live in the logging modules — they
 * do NOT extend the frozen shared ENUM_REGISTRY (src/shared/enums.mjs).
 * The ledger event kinds (START/COMPLETION/ASSESSMENT/RECONCILIATION) and
 * run lifecycle states are the shared Sprint-00 vocabularies; the enums
 * below are the Sprint-01 invocation-lifecycle and taxonomy vocabularies.
 * Schema tests keep code and schemas/event|invocation|run.v2.schema.json in
 * lockstep.
 *
 * State-separation notes:
 * - INVOCATION_STATUS is the ledger/projection lifecycle (STARTED,
 *   COMPLETED, ASSESSED, ORPHANED, SUPERSEDED). It is NOT WORKER_STATUS
 *   (model-reported) and NOT CONTROLLER_DISPOSITION (patch disposition).
 * - INVOCATION_ROLE describes the invoked model's role: implementation
 *   worker (Sprint 02), SOL decision (Sprint 06), or text-only ChatGPT SOL
 *   Pro (Sprint 07). The controller itself is never an invocation.
 * - INVOCATION_ASSESSMENT (ACCEPTED/REJECTED) is the controller's
 *   assessment of the invocation lifecycle, distinct from disposition
 *   vocabulary; REJECTED requires a REJECTION_CODE.
 */

/** Invocation lifecycle status derived from ledger events (projection). */
export const INVOCATION_STATUS = Object.freeze([
  'STARTED',
  'COMPLETED',
  'ASSESSED',
  'ORPHANED',
  'SUPERSEDED',
]);

/** Statuses that close an invocation lifecycle (finalize-able). */
export const FINAL_INVOCATION_STATUSES = Object.freeze(['ASSESSED', 'ORPHANED', 'SUPERSEDED']);

/** Role of the invoked model (never the controller). */
export const INVOCATION_ROLE = Object.freeze(['WORKER', 'SOL', 'SOL_PRO']);

/** Provider-call outcome recorded by the COMPLETION event. */
export const INVOCATION_OUTCOME = Object.freeze([
  'SUCCESS',
  'FAILURE',
  'TIMEOUT',
  'TRANSPORT_ERROR',
  'CANCELED',
]);

/** Controller assessment result recorded by the ASSESSMENT event. */
export const INVOCATION_ASSESSMENT = Object.freeze(['ACCEPTED', 'REJECTED']);

/** Why an invocation was reconciled/superseded (RECONCILIATION event). */
export const RECONCILIATION_REASON = Object.freeze([
  'CRASH_AFTER_START',
  'CRASH_AFTER_COMPLETION',
  'DUPLICATE_LIFECYCLE',
  'OTHER',
]);

/**
 * Genesis digest for the integrity chain: the first ledger event's
 * prevDigest is 64 zero hex chars (the chain has no prior event). Defined
 * here so the writer, reader, and validator agree on one constant.
 */
export const LEDGER_GENESIS_DIGEST = '0'.repeat(64);
