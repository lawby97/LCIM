/**
 * LCIM V2 SOL contract errors (Sprint 06).
 *
 * Sprint-owned error classes for the SOL ask compiler family. They extend
 * the shared `LcimError` taxonomy (read-only use of the Sprint-00
 * contract); payloads are public-safe via `errorPayload()`. Codes reuse
 * the shared rejection taxonomy where one exists (`SOL_ASK_INVALID`,
 * `BUDGET_EXHAUSTED`) so controller dispositions stay consistent.
 */

import { LcimError } from '../../shared/errors.mjs';

/**
 * A SOL ask could not be compiled: generic phrasing, multiple independent
 * primary questions, bundled concerns, an edit request, malformed input,
 * or validation failure. Default code `SOL_ASK_INVALID` matches the shared
 * rejection taxonomy (REJECTION_CODE.SOL_ASK_INVALID).
 */
export class SolAskError extends LcimError {
  constructor(message, code = 'SOL_ASK_INVALID', details = null) {
    super(message, code, details);
  }
}

/** A SOL response is malformed or inconsistent with its compiled ask. */
export class SolResponseError extends LcimError {
  constructor(message, code = 'SOL_RESPONSE_INVALID', details = null) {
    super(message, code, details);
  }
}

/**
 * A SOL failure response could not be compiled deterministically into the
 * Sprint-04 repair/acceptance contract (or its conversion record).
 */
export class SolRepairTicketError extends LcimError {
  constructor(message, code = 'SOL_REPAIR_CONVERSION_FAILED', details = null) {
    super(message, code, details);
  }
}
