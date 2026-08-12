/**
 * LCIM V2 shared record interfaces (Sprint 00).
 *
 * The machine-readable contracts are the JSON schemas under
 * `schemas/common/*.v2.schema.json`, registered in `./schema-registry.mjs`.
 * This module documents those record shapes in code (JSDoc typedefs and the
 * required-field lists) and MUST NOT drift from the schemas:
 * `tests/unit/schema-registry.test.mjs` enforces that `REQUIRED_FIELDS`
 * matches each schema's `required` array.
 *
 * Every shared record carries `schemaName` + `schemaVersion` (envelope):
 * `stampRecord()` in the registry fills and validates them, so callers cannot
 * mislabel a record.
 */

/**
 * @typedef {object} EnvelopeRecord
 * @property {string} schemaName - one of the registered schema names
 * @property {string} schemaVersion - semver of the schema, e.g. "2.0.0"
 */

/**
 * @typedef {object} RunRecord
 * @property {'lcim.common.run'} schemaName
 * @property {string} schemaVersion
 * @property {string} runId - lcim_run_<32 hex>
 * @property {string} lifecycleState - RUN_STATUS
 * @property {string} lcimVersion - LCIM package/VERSION file version
 * @property {string|null} lcimCommit - LCIM repo HEAD sha (null when unavailable)
 * @property {string} targetBaseSha - target repo base sha (40 hex)
 * @property {string} configDigest - sha256 of effective config (64 hex)
 * @property {string} createdAt - ISO-8601 timestamp
 */

/**
 * @typedef {object} InvocationRecord
 * @property {'lcim.common.invocation'} schemaName
 * @property {string} schemaVersion - locked to exactly "2.0.0" (const)
 * @property {string} invocationId - lcim_inv_<32 hex>
 * @property {string} runId
 * @property {string} workUnitId - lcim_wu_<32 hex>
 * @property {string} [workerStatus] - WORKER_STATUS (model-owned vocabulary
 *   only). OPTIONAL: absence means "no valid worker status was received"
 *   (e.g. START/timeout/provider error/crash/orphan before any valid
 *   handoff). The controller must NEVER synthesize a worker status merely
 *   because execution failed, timed out, crashed, or produced an invalid
 *   handoff.
 * @property {string} createdAt - ISO-8601 timestamp
 */

/**
 * @typedef {object} WorkUnitRecord
 * @property {'lcim.common.work-unit'} schemaName
 * @property {string} schemaVersion
 * @property {string} workUnitId
 * @property {string} runId
 * @property {string} status - WORK_UNIT_STATUS
 * @property {string} expectedBaseSha - serial base requirement (Sprint 03)
 * @property {string[]} allowedWritePaths - write-scope allow-list (Sprint 03)
 * @property {string[]} [mustChangePaths] - optional must-change list (Sprint 03)
 * @property {string} createdAt - ISO-8601 timestamp
 */

/**
 * @typedef {object} DispositionRecord
 * @property {'lcim.common.disposition'} schemaName
 * @property {string} schemaVersion
 * @property {string} workUnitId
 * @property {string} disposition - CONTROLLER_DISPOSITION (controller-decided only)
 * @property {string} [reasonCode] - REJECTION_CODE; required when disposition is REJECTED
 * @property {string} decidedAt - ISO-8601 timestamp
 * @property {string[]} evidenceRefs - references to controller-owned evidence
 */

/**
 * @typedef {object} ReviewFindingRecord
 * @property {'lcim.common.review-finding'} schemaName
 * @property {string} schemaVersion
 * @property {string} findingId - lcim_finding_<32 hex>
 * @property {string} severity - REVIEW_FINDING_SEVERITY
 * @property {string} [invariantRef] - named invariant the finding targets (Sprint 06)
 * @property {string} summary - bounded, public-safe summary
 * @property {string[]} evidenceRefs
 * @property {string} createdAt - ISO-8601 timestamp
 */

/**
 * @typedef {object} RejectionRecord
 * @property {'lcim.common.rejection'} schemaName
 * @property {string} schemaVersion
 * @property {string} workUnitId
 * @property {string} rejectionCode - REJECTION_CODE
 * @property {string} reason - bounded, public-safe reason
 * @property {string[]} evidenceRefs
 * @property {string} rejectedAt - ISO-8601 timestamp
 */

/**
 * @typedef {object} ErrorRecord
 * @property {'lcim.common.error'} schemaName
 * @property {string} schemaVersion
 * @property {string} code - uppercase error code from ./errors.mjs
 * @property {string} message - public-safe message
 * @property {object} [details] - structured, public-safe details
 */

/** Required fields per schema name; must equal each schema's `required` array. */
export const REQUIRED_FIELDS = Object.freeze({
  'lcim.common.envelope': ['schemaName', 'schemaVersion'],
  'lcim.common.enums': [
    'schemaName',
    'schemaVersion',
    'workerStatus',
    'controllerDisposition',
    'runStatus',
    'invocationEventKind',
    'workUnitStatus',
    'reviewFindingSeverity',
    'rejectionCode',
  ],
  'lcim.common.run': [
    'schemaName',
    'schemaVersion',
    'runId',
    'lifecycleState',
    'lcimVersion',
    'lcimCommit',
    'targetBaseSha',
    'configDigest',
    'createdAt',
  ],
  'lcim.common.invocation': [
    'schemaName',
    'schemaVersion',
    'invocationId',
    'runId',
    'workUnitId',
    'createdAt',
  ],
  'lcim.common.work-unit': [
    'schemaName',
    'schemaVersion',
    'workUnitId',
    'runId',
    'status',
    'expectedBaseSha',
    'allowedWritePaths',
    'createdAt',
  ],
  'lcim.common.disposition': [
    'schemaName',
    'schemaVersion',
    'workUnitId',
    'disposition',
    'decidedAt',
    'evidenceRefs',
  ],
  'lcim.common.review-finding': [
    'schemaName',
    'schemaVersion',
    'findingId',
    'severity',
    'summary',
    'evidenceRefs',
    'createdAt',
  ],
  'lcim.common.rejection': [
    'schemaName',
    'schemaVersion',
    'workUnitId',
    'rejectionCode',
    'reason',
    'evidenceRefs',
    'rejectedAt',
  ],
  'lcim.common.error': ['schemaName', 'schemaVersion', 'code', 'message'],
});
