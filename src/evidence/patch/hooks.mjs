/**
 * Sprint 03 validation-result hooks (test/secret validation interface).
 *
 * Sprint 04 owns the semantic contract compiler; Sprint 03 provides the
 * interface its results plug into. Each hook result is a bounded, public-safe
 * record that attaches to the patch-evidence record's `validationResults`
 * array:
 *
 *   { kind: 'test' | 'secret-scan', outcome: 'PASS' | 'FAIL' | 'NOT_RUN',
 *     summary: string, evidenceRef?: string }
 *
 * `NOT_RUN` is a first-class outcome: the hook interface exists but the
 * compiler did not run (or could not run) — never synthesize PASS/FAIL for
 * a hook that was not executed.
 */

import { EvidenceError } from '../../git/errors.mjs';
import { stampPatchEvidence } from './schema.mjs';

export const VALIDATION_HOOK_KIND = Object.freeze(['test', 'secret-scan']);
export const VALIDATION_HOOK_OUTCOME = Object.freeze(['PASS', 'FAIL', 'NOT_RUN']);

/**
 * Attach validation hook results to a patch-evidence record.
 * Returns a NEW stamped record; the input record is never mutated.
 * Throws EvidenceError for unknown kinds/outcomes or malformed entries.
 *
 * @param {object} record - stamped patch-evidence record
 * @param {Array<{kind: string, outcome: string, summary: string, evidenceRef?: string}>} results
 */
export function attachValidationResults(record, results) {
  if (record === null || typeof record !== 'object' || record.schemaName !== 'lcim.patch-evidence') {
    throw new EvidenceError('attachValidationResults() requires a stamped patch-evidence record');
  }
  if (!Array.isArray(results)) {
    throw new EvidenceError('validation hook results must be an array');
  }
  for (const [i, r] of results.entries()) {
    if (r === null || typeof r !== 'object' || Array.isArray(r)) {
      throw new EvidenceError(`validation hook result ${i} must be an object`);
    }
    if (!VALIDATION_HOOK_KIND.includes(r.kind)) {
      throw new EvidenceError(
        `validation hook result ${i} has unknown kind ${JSON.stringify(r.kind)} (expected one of ${VALIDATION_HOOK_KIND.join(', ')})`,
        { index: i, kind: r.kind },
      );
    }
    if (!VALIDATION_HOOK_OUTCOME.includes(r.outcome)) {
      throw new EvidenceError(
        `validation hook result ${i} has unknown outcome ${JSON.stringify(r.outcome)} (expected one of ${VALIDATION_HOOK_OUTCOME.join(', ')})`,
        { index: i, outcome: r.outcome },
      );
    }
    if (typeof r.summary !== 'string' || r.summary.length === 0) {
      throw new EvidenceError(`validation hook result ${i} needs a non-empty summary`);
    }
    if (r.evidenceRef !== undefined && (typeof r.evidenceRef !== 'string' || r.evidenceRef.length === 0)) {
      throw new EvidenceError(`validation hook result ${i} has an invalid evidenceRef`);
    }
  }
  return stampPatchEvidence({ ...record, validationResults: results });
}
