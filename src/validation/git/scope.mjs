/**
 * Sprint 03 write-scope validation.
 *
 * Controller-owned rule:
 *
 *   observed_changed_paths ⊆ allowed_write_paths
 *
 * `must_change_paths` is OPTIONAL and checked separately: every listed path
 * must appear among the observed changed paths.
 *
 * Scope paths are repository-relative posix paths. Fail closed on any
 * unsafe form: absolute paths, `..` escapes, empty strings, backslashes
 * (git always emits `/`), or `"."`. Both sides of the rule are normalized
 * before comparison, so `src/` and `src` are the same path.
 *
 * The work-unit schema (`lcim.common.work-unit`) already requires
 * `allowedWritePaths` (minItems 1); this module enforces the *rule*, not the
 * schema. Note: the rule is exact set inclusion after normalization —
 * allowing a directory `src/` does NOT allow `src/a.mjs`; a controller that
 * wants directory scope must list every path (or rely on a later sprint's
 * policy refinement via an interface-change request).
 */

import path from 'node:path';
import { PathSafetyError, ScopeViolationError } from '../../git/errors.mjs';

/**
 * Normalize and validate one repository-relative scope path.
 * Throws PathSafetyError for unsafe forms; returns the normalized posix path.
 */
export function normalizeScopePath(p) {
  if (typeof p !== 'string' || p.length === 0) {
    throw new PathSafetyError('scope paths must be non-empty strings', { path: p });
  }
  if (p.includes('\\')) {
    throw new PathSafetyError('scope paths must use forward slashes, got backslash', { path: p });
  }
  if (path.posix.isAbsolute(p)) {
    throw new PathSafetyError('scope paths must be relative to the repository root', { path: p });
  }
  const normalized = path.posix.normalize(p).replace(/\/+$/, '');
  if (normalized === '.' || normalized === '') {
    throw new PathSafetyError('scope path must not be "." or empty', { path: p });
  }
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new PathSafetyError('scope path must not escape the repository root', { path: p });
  }
  return normalized;
}

function normalizeAll(values, label) {
  if (!Array.isArray(values)) {
    throw new PathSafetyError(`${label} must be an array of relative paths`, { label });
  }
  return values.map((v) => normalizeScopePath(v));
}

/**
 * Write-scope rule: observed_changed_paths ⊆ allowed_write_paths.
 * Throws ScopeViolationError listing every out-of-scope path.
 */
export function checkWriteScope({ changedPaths, allowedWritePaths }) {
  const changed = normalizeAll(changedPaths, 'changedPaths');
  const allowed = new Set(normalizeAll(allowedWritePaths, 'allowedWritePaths'));
  const outOfScope = changed.filter((p) => !allowed.has(p));
  if (outOfScope.length > 0) {
    throw new ScopeViolationError(
      `observed changed paths are outside the allowed write scope: ${outOfScope.join(', ')}`,
      { outOfScope, allowedWritePaths: [...allowed].sort() },
    );
  }
  return { ok: true, outOfScope: [] };
}

/**
 * Optional must-change rule: every mustChangePath must appear among the
 * observed changed paths. Throws ScopeViolationError listing missing paths.
 */
export function checkMustChange({ changedPaths, mustChangePaths }) {
  const changed = new Set(normalizeAll(changedPaths, 'changedPaths'));
  const missing = normalizeAll(mustChangePaths, 'mustChangePaths').filter((p) => !changed.has(p));
  if (missing.length > 0) {
    throw new ScopeViolationError(
      `required must-change paths are unchanged: ${missing.join(', ')}`,
      { missing },
    );
  }
  return { ok: true, missing: [] };
}

/**
 * Combined scope validation: write-scope rule first (primary), then the
 * optional must-change rule. Throws on the first violated rule.
 */
export function validateScope({ changedPaths, allowedWritePaths, mustChangePaths = [] }) {
  checkWriteScope({ changedPaths, allowedWritePaths });
  checkMustChange({ changedPaths, mustChangePaths });
  return { ok: true, outOfScope: [], missing: [] };
}
