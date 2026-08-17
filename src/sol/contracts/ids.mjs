/**
 * LCIM V2 SOL id formats (Sprint 06).
 *
 * Sprint-owned id conventions for compiled SOL asks and responses,
 * following the same shape as the Sprint-00 shared ids (`lcim_<kind>_` +
 * 16 random bytes in hex) and the Sprint-04 repair ids. The frozen
 * Sprint-00 `src/shared/ids.mjs` is not touched; these patterns are
 * generated and validated here (sprint-owned) and inlined in the SOL
 * JSON schemas (`schemas/sol-ask.v2.schema.json`,
 * `schemas/sol-response.v2.schema.json`).
 */

import { createHash, randomBytes } from 'node:crypto';
import { canonicalizeJson } from '../../contracts/digest.mjs';

/** Compiled SOL ask id: lcim_sol_ask_<32 hex>. */
export const SOL_ASK_ID_PREFIX = 'lcim_sol_ask_';
export const SOL_ASK_ID_PATTERN = /^lcim_sol_ask_[0-9a-f]{32}$/;
export const SOL_ASK_ID_PATTERN_SOURCE = '^lcim_sol_ask_[0-9a-f]{32}$';

/** Compiled SOL response id: lcim_sol_resp_<32 hex>. */
export const SOL_RESPONSE_ID_PREFIX = 'lcim_sol_resp_';
export const SOL_RESPONSE_ID_PATTERN = /^lcim_sol_resp_[0-9a-f]{32}$/;
export const SOL_RESPONSE_ID_PATTERN_SOURCE = '^lcim_sol_resp_[0-9a-f]{32}$';

/** @returns {string} new ask id: lcim_sol_ask_<32 hex> */
export function generateSolAskId() {
  return SOL_ASK_ID_PREFIX + randomBytes(16).toString('hex');
}

/** @returns {string} new response id: lcim_sol_resp_<32 hex> */
export function generateSolResponseId() {
  return SOL_RESPONSE_ID_PREFIX + randomBytes(16).toString('hex');
}

/** @param {string} id */
export function isValidSolAskId(id) {
  return typeof id === 'string' && SOL_ASK_ID_PATTERN.test(id);
}

/**
 * Deterministic controller identity for an accepted adjacentCriticalDefect
 * (fifth-review rule): the same response object always maps to the same
 * `lcim_finding_<32 hex>` identity, so the controller-persisted defect
 * record and the RECHECK ask's prior-finding resolution agree without any
 * caller-supplied mapping. Stable identity + evidence binding + locked
 * requirement binding make the defect an authoritative open record.
 *
 * @param {object} defect - the adjacentCriticalDefects[] item
 *   ({ summary, evidenceRefs, lockedRequirementRef })
 * @returns {string} lcim_finding_<32 hex>
 */
export function adjacentDefectFindingId(defect) {
  if (defect === null || typeof defect !== 'object' || Array.isArray(defect)) {
    throw new TypeError('adjacentDefectFindingId requires the defect object');
  }
  return `lcim_finding_${createHash('sha256').update(JSON.stringify(canonicalizeJson(defect))).digest('hex').slice(0, 32)}`;
}

/** @param {string} id */
export function isValidSolResponseId(id) {
  return typeof id === 'string' && SOL_RESPONSE_ID_PATTERN.test(id);
}
