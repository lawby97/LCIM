/**
 * LCIM V2 worker contract (Sprint 02).
 *
 * Defines what a worker may communicate. The machine-readable contract is
 * `schemas/worker-result.v2.schema.json`; this module is the code-side
 * mirror (names, version, allowed fields, forbidden controller-owned /
 * legacy V1 fields) and the authoritative source for the schema's location.
 *
 * Contract rules (see docs/worker-contract.md):
 * - Worker statuses are strictly `WORKER_STATUS` (shared Sprint-00
 *   vocabulary). `PATCH_READY` is not a worker status; workers never
 *   authoritatively emit it.
 * - The response payload is model-owned communication ONLY: workUnitId
 *   echo, bounded summary, acceptance claims with evidence refs, remaining
 *   issues, review risks, uncertainty. No envelope (schemaName /
 *   schemaVersion are controller-stamped), no controller dispositions.
 * - Objective evidence is controller-owned: changed-file lists, line
 *   counts, patch hashes, base/HEAD claims, test-log paths, test exit
 *   status, secret-scan results, integration status must never appear in a
 *   worker response.
 * - `evidence` (string or array) is the legacy V1 field; V2 replaces it
 *   with `acceptanceClaims[].evidenceRefs` (array of strings).
 */

import { WORKER_STATUS } from '../shared/enums.mjs';

/** Schema identity of the worker-result transport contract. */
export const WORKER_RESULT_SCHEMA_NAME = 'lcim.worker-result';
export const WORKER_RESULT_SCHEMA_VERSION = '2.0.0';
export const WORKER_RESULT_SCHEMA_FILE = 'worker-result.v2.schema.json';

/** Top-level fields a worker may own. Must equal the schema's property keys. */
export const WORKER_OWNED_FIELDS = Object.freeze([
  'workUnitId',
  'workerStatus',
  'summary',
  'acceptanceClaims',
  'remainingIssues',
  'reviewRisks',
  'uncertainty',
]);

/** Fields an acceptanceClaims item may own. Must equal the schema's item property keys. */
export const ACCEPTANCE_CLAIM_OWNED_FIELDS = Object.freeze(['claim', 'evidenceRefs']);

/**
 * Fields a worker must NEVER report, with the reason each is
 * controller-owned or legacy. Used by `listObjectiveEvidenceViolations()`
 * for precise diagnostics; the schema's `additionalProperties: false` is
 * the authoritative rejection.
 */
export const WORKER_FORBIDDEN_FIELDS = Object.freeze({
  changedFiles: 'changed-file lists are controller-owned evidence (Sprint 03)',
  lineCount: 'line counts are controller-owned evidence (Sprint 03)',
  patchHash: 'patch hashes are controller-owned evidence (Sprint 03)',
  patchReady: 'PATCH_READY is not a worker status; workers never claim patch readiness',
  baseSha: 'base claims are controller-owned (Sprint 03)',
  headSha: 'HEAD claims are controller-owned (Sprint 03)',
  expectedBaseSha: 'base claims are controller-owned (Sprint 03)',
  testLogPath: 'test-log paths are controller-owned evidence (Sprint 03)',
  testExitStatus: 'test exit status is controller-owned evidence (Sprint 03)',
  exitStatus: 'process exit status is controller-owned evidence',
  exitCode: 'process exit code is controller-owned evidence',
  secretScan: 'secret-scan results are controller-owned evidence (Sprint 03)',
  integrationStatus: 'integration status is controller-owned',
  disposition: 'controller dispositions are never reported by workers',
  schemaName: 'envelope metadata is controller-stamped, not model-reported',
  schemaVersion: 'envelope metadata is controller-stamped, not model-reported',
  lcimVersion: 'LCIM version is controller-owned',
  lcimCommit: 'LCIM commit is controller-owned',
  configDigest: 'config digest is controller-owned',
  patchObserved: 'patch observation is a controller state, never a worker field',
  controllerValidated: 'controller validation is a controller state, never a worker field',
  evidence: 'legacy V1 evidence field (string or array) is replaced by acceptanceClaims[].evidenceRefs',
});

/** @param {string} name */
export function isWorkerOwnedField(name) {
  return WORKER_OWNED_FIELDS.includes(name);
}

/** @param {string} name */
export function isForbiddenField(name) {
  return Object.hasOwn(WORKER_FORBIDDEN_FIELDS, name);
}

/**
 * Scan a parsed worker result for controller-owned / legacy V1 fields.
 * Returns a list of `{ field, reason }` violations; empty when the payload
 * contains only model-owned fields. Never repairs anything — it only
 * reports, so a semantically wrong response can never be made to pass.
 *
 * @param {unknown} result
 * @returns {Array<{field: string, reason: string}>}
 */
export function listObjectiveEvidenceViolations(result) {
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    return [];
  }
  const violations = [];
  for (const key of Object.keys(result)) {
    if (isForbiddenField(key)) {
      violations.push({ field: key, reason: WORKER_FORBIDDEN_FIELDS[key] });
    }
  }
  // Legacy V1 `evidence` inside acceptanceClaims items (string or array).
  if (Array.isArray(result.acceptanceClaims)) {
    for (const [i, claim] of result.acceptanceClaims.entries()) {
      if (claim !== null && typeof claim === 'object' && Object.hasOwn(claim, 'evidence')) {
        violations.push({
          field: `acceptanceClaims[${i}].evidence`,
          reason: WORKER_FORBIDDEN_FIELDS.evidence,
        });
      }
    }
  }
  return violations;
}

/** Worker statuses are the only statuses a worker may report. */
export { WORKER_STATUS };
