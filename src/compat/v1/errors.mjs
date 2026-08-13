/**
 * LCIM V2 Sprint 09 V1-compatibility error taxonomy (Sprint 09 owned).
 *
 * These classes extend the shared LcimError base (src/shared/errors.mjs)
 * and produce public-safe payloads via the shared errorPayload() shape
 * (lcim.common.error schema). Codes are uppercase so they can be recorded
 * by callers without transformation.
 *
 * Public-safety rule: error messages and details NEVER embed raw V1
 * evidence content (raw response text, full event bodies, model output).
 * Only bounded identifiers (seq, workUnitId, eventKind, v1Version, line
 * numbers, reason codes) may appear.
 */

import { LcimError } from '../../shared/errors.mjs';

/** Base class for every V1-compatibility failure. */
export class V1CompatError extends LcimError {
  constructor(message, details = null) {
    super(message, 'V1_COMPAT_INVALID', details);
  }
}

/**
 * The input is a legacy V1 variant that this reader does NOT support
 * (unsupported v1Version, unknown event kinds, unmarked ledger-like data,
 * unknown worker status vocabulary). Always fail closed — the reader never
 * "best-effort" interprets an unknown legacy format as a supported V1
 * version.
 */
export class UnsupportedV1VersionError extends V1CompatError {
  constructor(message, details = null) {
    super(message, details);
    this.code = 'V1_UNSUPPORTED_VERSION';
  }
}

/**
 * The historical V1 integrity chain is broken (tampered event, altered
 * digest, non-chaining prevDigest, non-monotonic seq). Detected
 * deterministically at read time. The reader NEVER repairs, rewrites, or
 * re-hashes the source — it only reports the broken chain.
 */
export class V1ChainIntegrityError extends V1CompatError {
  constructor(message, details = null) {
    super(message, details);
    this.code = 'V1_HASH_CHAIN_BROKEN';
  }
}
