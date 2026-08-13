/**
 * LCIM V2 Sprint 08 audit service (`audit --last N` API).
 *
 * Reads/validates canonical Sprint-01 run stores, derives sanitized local
 * audit projections, reconciles them against independent canonical state,
 * and writes only below <runtimeRoot>/audit/**. Sprint 10 owns CLI wiring.
 */

import { ConfigError } from '../shared/errors.mjs';
import { assertNoTrackedFilesUnder } from '../config/runtime-path.mjs';
import { buildProjections } from './project.mjs';
import { computeMetrics, collectUnknownFacts, auditIdentity } from './metrics.mjs';
import { buildReconciliation } from './reconcile.mjs';
import { auditDirName, writeProjections } from './serialize.mjs';
import { prepareOutputDir, preflightOutputDir } from './output-path.mjs';
import { sanitizeAuditError, sanitizeRunRef, sanitizeRuntimeRef, sanitizeVersion } from './sanitize.mjs';
import { assertLastParam, discoverRunDirs, loadRunStore, selectRuns, resolveAuditRuntimeRoot } from './runs.mjs';

export const AUDIT_SCHEMA_NAME = 'lcim.audit.final';
export const AUDIT_SCHEMA_VERSION = '1.0.0';

/** Validate optional provider/model token pricing. */
export function assertPricing(pricing) {
  if (pricing === null || pricing === undefined) return null;
  if (typeof pricing !== 'object' || Array.isArray(pricing)) {
    throw new ConfigError('pricing must be an object { provider: { model: { inputPerMillion, outputPerMillion } } }');
  }
  for (const [provider, models] of Object.entries(pricing)) {
    if (models === null || typeof models !== 'object' || Array.isArray(models)) {
      throw new ConfigError(`pricing for provider ${JSON.stringify(provider)} must be a model -> rate object`);
    }
    for (const [model, rate] of Object.entries(models)) {
      if (rate === null || typeof rate !== 'object' || Array.isArray(rate)) {
        throw new ConfigError(`pricing.${provider}.${model} must be an object with own input/output rates`);
      }
      for (const field of ['inputPerMillion', 'outputPerMillion']) {
        const value = rate[field];
        if (!Object.hasOwn(rate, field) || typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
          throw new ConfigError(`pricing.${provider}.${model}.${field} must be an own non-negative finite number`);
        }
      }
    }
  }
  return pricing;
}

/** Per-run final.json summary: schema-constrained identities/hashes/counts only. */
function perRunSummary(lr, { invocations, workUnits, reviews }) {
  const count = (lines) => lines.filter((line) => line.runId === lr.runId).length;
  return {
    runId: lr.runId,
    lifecycleState: lr.run?.lifecycleState ?? null,
    lcimVersion: lr.run?.lcimVersion === null || lr.run?.lcimVersion === undefined ? null : sanitizeVersion(lr.run.lcimVersion),
    lcimCommit: lr.run?.lcimCommit ?? null,
    targetBaseSha: lr.run?.targetBaseSha ?? null,
    configDigest: lr.run?.configDigest ?? null,
    createdAt: lr.run?.createdAt ?? null,
    finalizedAt: lr.run?.finalizedAt ?? null,
    abortedAt: lr.run?.abortedAt ?? null,
    ledger: lr.summary,
    projections: {
      invocations: count(invocations),
      workUnits: count(workUnits),
      reviews: count(reviews),
    },
  };
}

function selectionErrorForInvalidRun(lr, error) {
  if (error?.detailDigest !== undefined) {
    return {
      runId: sanitizeRunRef(lr.runId),
      code: error.code ?? 'INVALID_CANONICAL_RUN',
      detailDigest: error.detailDigest,
    };
  }
  return sanitizeAuditError({ runId: lr.runId, path: error?.path, message: error?.message });
}

/**
 * Run a local audit.
 *
 * Explicit outDir may name only a descendant of <runtimeRoot>/audit/**;
 * relative paths are rooted there, absolute/traversal/symlink escapes and
 * canonical run directories are rejected before projection writes.
 */
export async function audit({ cwd = process.cwd(), last = null, pricing = null, outDir = null } = {}) {
  const lastN = assertLastParam(last);
  const pricingTable = assertPricing(pricing);
  const runtimeRoot = resolveAuditRuntimeRoot(cwd);

  // No-write destination preflight prevents dangerous explicit paths from
  // ever receiving even a partial projection.
  preflightOutputDir({ runtimeRoot, namespace: 'audit', outDir });

  const loaded = discoverRunDirs(runtimeRoot).map(loadRunStore);
  const { selected, outOfWindow, invalid } = selectRuns(loaded, lastN);
  const projections = buildProjections(selected, pricingTable);
  const metrics = computeMetrics({ ...projections, loadedRuns: selected });
  const reconciliation = buildReconciliation({ loadedRuns: selected, ...projections, metrics });
  const unknownFacts = collectUnknownFacts({ metrics });

  const selection = {
    last: lastN,
    runtimeRef: sanitizeRuntimeRef(runtimeRoot),
    includedRunIds: selected.map((lr) => lr.runId),
    outOfWindowRunIds: outOfWindow.map((lr) => lr.runId),
    invalidRunIds: invalid.map((lr) => sanitizeRunRef(lr.runId)),
    errors: [
      ...outOfWindow.map((lr) => ({ runId: lr.runId, code: 'OUTSIDE_LAST_N_WINDOW' })),
      ...invalid.flatMap((lr) => lr.errors.map((error) => selectionErrorForInvalidRun(lr, error))),
    ],
  };

  const result = {
    schemaName: AUDIT_SCHEMA_NAME,
    schemaVersion: AUDIT_SCHEMA_VERSION,
    // An export wall-clock is not canonical evidence. Keep the field
    // explicit but unavailable so final.json and REVIEW.md remain byte-
    // deterministic for identical selected canonical history.
    generatedAt: null,
    lcim: auditIdentity(),
    selection,
    runs: selected.map((lr) => perRunSummary(lr, projections)),
    projections: {
      invocations: projections.invocations.length,
      workUnits: projections.workUnits.length,
      reviews: projections.reviews.length,
      usage: projections.usage.length,
    },
    metrics,
    reconciliation,
    unknownFacts,
  };

  const dir = prepareOutputDir({
    runtimeRoot,
    namespace: 'audit',
    outDir,
    defaultName: auditDirName(lastN, selection.includedRunIds),
  });
  assertNoTrackedFilesUnder(dir, cwd);
  const files = writeProjections(dir, { ...projections, result });
  return { result, outDir: dir, files, projections };
}

export { buildProjections, buildInvocationLines, buildWorkUnitLines, buildReviewLines, buildUsageLines } from './project.mjs';
export { computeMetrics, collectUnknownFacts, countBy } from './metrics.mjs';
export { buildReconciliation } from './reconcile.mjs';
export { stampReviewSummary, validateReviewSummary, loadReviewSummarySchema, REVIEW_SUMMARY_SCHEMA } from './schemas.mjs';
export { assertLastParam, discoverRunDirs, loadRunStore, selectRuns, resolveAuditRuntimeRoot } from './runs.mjs';
export { prepareOutputDir, preflightOutputDir } from './output-path.mjs';
export { AuditError } from './errors.mjs';
