/**
 * LCIM V2 contract errors (Sprint 04).
 *
 * Sprint-owned error classes for the semantic contract compiler family.
 * They extend the shared `LcimError` taxonomy (read-only use of the
 * Sprint-00 contract); payloads are public-safe via `errorPayload()`.
 */

import { LcimError } from '../shared/errors.mjs';

/** A semantic/acceptance contract failed compilation or validation. */
export class ContractCompileError extends LcimError {
  constructor(message, details = null) {
    super(message, 'CONTRACT_COMPILE_FAILED', details);
  }
}

/** A repair/acceptance contract is malformed or inconsistent with its source contract. */
export class RepairContractError extends LcimError {
  constructor(message, details = null) {
    super(message, 'REPAIR_CONTRACT_INVALID', details);
  }
}
