/**
 * LCIM V2 Sprint 08 local review exporter (`review-export --last N` API).
 *
 * Exports are strictly local beneath <runtimeRoot>/exports/**. REVIEW.md
 * and copied projections are sanitized by the audit boundary; no raw
 * transcript, source, secret, arbitrary summary, or path is copied.
 */

import path from 'node:path';
import { audit } from '../audit/index.mjs';
import { assertNoTrackedFilesUnder } from '../config/runtime-path.mjs';
import { prepareOutputDir, preflightOutputDir } from '../audit/output-path.mjs';
import { resolveAuditRuntimeRoot } from '../audit/runs.mjs';
import { writeProjections, writeTextAtomic } from '../audit/serialize.mjs';
import { renderReviewMarkdown } from './review-md.mjs';

export const EXPORT_PROJECTION_FILES = Object.freeze([
  'invocations.jsonl',
  'work-units.jsonl',
  'reviews.jsonl',
  'usage.jsonl',
  'final.json',
]);

/**
 * Run a local review export. Explicit outDir is a descendant selector under
 * <runtimeRoot>/exports/** only; it is preflighted before audit() so an
 * external/run-dir/symlink escape cannot cause any write.
 */
export async function reviewExport({ cwd = process.cwd(), last = null, pricing = null, outDir = null } = {}) {
  const runtimeRoot = resolveAuditRuntimeRoot(cwd);
  preflightOutputDir({ runtimeRoot, namespace: 'exports', outDir });

  const { result, outDir: auditDir, projections } = await audit({ cwd, last, pricing });
  const dir = prepareOutputDir({
    runtimeRoot,
    namespace: 'exports',
    outDir,
    defaultName: path.basename(auditDir),
  });
  assertNoTrackedFilesUnder(dir, cwd);

  const markdown = renderReviewMarkdown(result, {
    workUnits: projections.workUnits,
    reviews: projections.reviews,
  });
  writeTextAtomic(path.join(dir, 'REVIEW.md'), markdown);
  // Re-serialize the already sanitized in-memory facts rather than reading
  // any filesystem content back from the audit directory. Atomic rename also
  // replaces a pre-existing projection-file symlink rather than following it.
  writeProjections(dir, { ...projections, result });

  return { dir, files: ['REVIEW.md', ...EXPORT_PROJECTION_FILES], result };
}

export { renderReviewMarkdown, shortId } from './review-md.mjs';
