/**
 * LCIM V2 Sprint 01 logging error taxonomy (Sprint 01 owned).
 *
 * These classes extend the shared LcimError base (src/shared/errors.mjs)
 * and produce public-safe payloads via the shared errorPayload() shape
 * (lcim.common.error schema). Codes are uppercase so they can be recorded
 * in ledger events (errorCode field) without transformation.
 */

import { LcimError } from '../shared/errors.mjs';

/** Base class for all ledger/run-store failures. */
export class LedgerError extends LcimError {
  constructor(message, details = null) {
    super(message, 'LEDGER_ERROR', details);
  }
}

/**
 * A ledger invariant was violated: broken integrity chain, rewritten event,
 * torn tail, invalid lifecycle transition (duplicate START, COMPLETION
 * without START, ...), projection/ledger mismatch, or ledger-end anchor
 * mismatch. Always fail closed — never silently repair.
 */
export class LedgerIntegrityError extends LedgerError {
  constructor(message, details = null) {
    super(message, 'LEDGER_INTEGRITY_VIOLATION', details);
  }
}

/** An append was attempted on a run whose ledger is final (finalized/aborted). */
export class LedgerFinalizedError extends LedgerError {
  constructor(message, details = null) {
    super(message, 'LEDGER_FINALIZED', details);
  }
}

/** The ledger file itself could not be written (I/O failure). */
export class LedgerWriteError extends LedgerError {
  constructor(message, details = null) {
    super(message, 'LEDGER_WRITE_FAILED', details);
  }
}

/** The run store is missing, unreadable, invalid, or already exists. */
export class RunStoreError extends LedgerError {
  constructor(message, details = null) {
    super(message, 'RUN_STORE_INVALID', details);
  }
}

/** The optional compressed raw sink failed. Raw data is best-effort only. */
export class RawSinkError extends LedgerError {
  constructor(message, details = null) {
    super(message, 'RAW_SINK_FAILED', details);
  }
}
