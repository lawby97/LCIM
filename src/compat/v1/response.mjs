/**
 * LCIM V2 Sprint 09 available V1 final-response evidence (Sprint 09 owned).
 *
 * A V1 final-response evidence artifact is the exact final response text a
 * V1 worker produced for a work unit. Sprint 09 interprets ONLY what the
 * evidence actually establishes:
 *
 *   - text available and parseable  -> claims extracted (worker claims,
 *     provenance V1_COMPAT);
 *   - text available but unparseable -> parseable false, TRANSPORT_MALFORMED
 *     defect, all claims UNKNOWN_V1 (never inferred);
 *   - text unavailable (only a reference, or nothing) -> every fact
 *     UNKNOWN_V1. Absence of response evidence is NOT evidence of
 *     failure, timeout, or absence of work.
 *
 * This module is strictly read-only and never embeds raw response text.
 */

import { UNKNOWN_V1 } from './schemas.mjs';
import { parseV1Handoff, unknownClaim } from './handoff.mjs';

/**
 * Interpret available V1 final-response evidence.
 *
 * @param {unknown} text - exact raw final-response text; anything that is
 *   not a non-empty string means no response evidence is available.
 * @returns {Readonly<{
 *   evidenceKind: 'final-response',
 *   evidenceAvailable: boolean,
 *   parseable: boolean|'UNKNOWN_V1',
 *   normalization: string|null,
 *   historicallySchemaValid: boolean|'UNKNOWN_V1',
 *   v2WorkerSchemaValid: boolean|'UNKNOWN_V1',
 *   defect: string,
 *   workerClaim: Readonly<object>,
 * }>} frozen interpretation.
 */
export function interpretV1FinalResponse(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return Object.freeze({
      evidenceKind: 'final-response',
      evidenceAvailable: false,
      parseable: UNKNOWN_V1,
      normalization: null,
      historicallySchemaValid: UNKNOWN_V1,
      v2WorkerSchemaValid: UNKNOWN_V1,
      defect: UNKNOWN_V1,
      workerClaim: unknownClaim(),
    });
  }
  const parsed = parseV1Handoff(text);
  return Object.freeze({
    evidenceKind: 'final-response',
    evidenceAvailable: true,
    ...parsed,
  });
}
