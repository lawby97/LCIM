/**
 * LCIM V2 route decision IDs (Sprint 05).
 *
 * `lcim_route_<32hex>` follows the shared LCIM ID convention; the pattern is
 * generated and validated here (sprint-owned) so the frozen Sprint-00
 * `src/shared/ids.mjs` needs no change (same approach as Sprint 04's
 * `lcim_repair_` IDs).
 */

import { randomBytes } from 'node:crypto';

export const ROUTE_ID_PREFIX = 'lcim_route_';
export const ROUTE_ID_PATTERN = /^lcim_route_[0-9a-f]{32}$/;

/** @returns {string} new route decision id: lcim_route_<32 hex> */
export function generateRouteDecisionId() {
  return ROUTE_ID_PREFIX + randomBytes(16).toString('hex');
}

/** @param {string} id */
export function isValidRouteDecisionId(id) {
  return typeof id === 'string' && ROUTE_ID_PATTERN.test(id);
}
