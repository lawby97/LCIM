/**
 * LCIM V2 SOL evidence budget primitives (Sprint 06).
 *
 * Pure, deterministic budget helpers shared by the ask/response compilers
 * (which apply the budget) and the validators (which verify a compiled
 * document still respects it). The decision evidence rules:
 *
 * - every compiled ask/response carries an evidence budget
 *   `{ maxItems, maxBytes, onOverflow }` with
 *   onOverflow ∈ { FAIL_CLOSED, TRUNCATE_SUMMARIZE };
 * - FAIL_CLOSED: an over-budget packet is rejected, never silently
 *   broadened (oversized ambiguous packets fail closed);
 * - TRUNCATE_SUMMARIZE: deterministic truncation keeps evidence in
 *   authored order while the budget fits and appends exactly one
 *   `lcim.budget.truncation-marker` as the LAST item; `decisionCritical`
 *   evidence is NEVER dropped — if required decision evidence cannot fit,
 *   compilation fails closed (BUDGET_EXHAUSTED) even under
 *   TRUNCATE_SUMMARIZE;
 * - the truncation marker is itself counted against the budget, so a
 *   truncation that cannot be recorded also fails closed.
 *
 * Byte accounting is deterministic: each evidence item costs
 * `byteLength(ref) + byteLength(content) + 32` fixed JSON-structure
 * overhead. The engine subset has no minimum keyword, so budget
 * magnitudes are validated here (positive integers).
 */

import { ConfigError } from '../../shared/errors.mjs';

/** Reserved evidence ref for the deterministic truncation marker. */
export const TRUNCATION_MARKER_REF = 'lcim.budget.truncation-marker';

/** Evidence kind carried by the truncation marker. */
export const TRUNCATION_MARKER_KIND = 'other';

/** Per-item fixed JSON-structure overhead included in byte accounting. */
export const EVIDENCE_ITEM_OVERHEAD_BYTES = 32;

/** Fixed deterministic allowance for the truncation marker itself. */
export const TRUNCATION_MARKER_BYTES = 200;

/** Overflow modes. */
export const EVIDENCE_BUDGET_OVERFLOW_MODES = Object.freeze(['FAIL_CLOSED', 'TRUNCATE_SUMMARIZE']);

/** Default evidence budget applied when a caller supplies none. */
export const DEFAULT_EVIDENCE_BUDGET = Object.freeze({
  maxItems: 16,
  maxBytes: 8192,
  onOverflow: 'FAIL_CLOSED',
});

/** @param {{ref: string, content: string}} item */
export function evidenceItemBytes(item) {
  return (
    Buffer.byteLength(item?.ref ?? '', 'utf8') +
    Buffer.byteLength(item?.content ?? '', 'utf8') +
    EVIDENCE_ITEM_OVERHEAD_BYTES
  );
}

/**
 * Deterministic byte accounting for an evidence list.
 * @param {Array<{ref: string, content: string}>} evidence
 * @returns {{items: number, bytes: number, itemBytes: number[]}}
 */
export function evidenceByteLength(evidence) {
  const arr = Array.isArray(evidence) ? evidence : [];
  const itemBytes = arr.map(evidenceItemBytes);
  return {
    items: arr.length,
    bytes: itemBytes.reduce((a, b) => a + b, 0),
    itemBytes,
  };
}

/**
 * Fail-closed shape guard for an evidence budget. Budget magnitudes must
 * be positive integers (the schema cannot express minimum).
 * @param {object} budget
 */
export function assertEvidenceBudget(budget) {
  if (budget === null || typeof budget !== 'object' || Array.isArray(budget)) {
    throw new ConfigError('evidence budget must be a plain object');
  }
  for (const key of ['maxItems', 'maxBytes']) {
    if (typeof budget[key] !== 'number' || !Number.isInteger(budget[key]) || budget[key] < 1) {
      throw new ConfigError(
        `evidence budget ${key} must be a positive integer, got ${JSON.stringify(budget[key])}`,
      );
    }
  }
  if (!EVIDENCE_BUDGET_OVERFLOW_MODES.includes(budget.onOverflow)) {
    throw new ConfigError(
      `evidence budget onOverflow must be one of ${EVIDENCE_BUDGET_OVERFLOW_MODES.join(', ')}, got ${JSON.stringify(budget.onOverflow)}`,
    );
  }
}

/** @param {object} budget */
export function isValidTruncationMarker(item) {
  return (
    item !== null &&
    typeof item === 'object' &&
    !Array.isArray(item) &&
    item.ref === TRUNCATION_MARKER_REF &&
    item.kind === TRUNCATION_MARKER_KIND
  );
}
