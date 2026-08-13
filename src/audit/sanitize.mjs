/**
 * LCIM V2 Sprint 08 normal-export sanitization boundary.
 *
 * Canonical ledger values are immutable forensic evidence and are NEVER
 * changed here. This module is used only while constructing audit/report
 * projections. It deliberately separates values that are structurally
 * public-safe (LCIM ids, fixed enums, hashes, ISO timestamps) from source
 * strings that are merely bounded by Sprint-01 schemas (provider/model/
 * reasoning, summaries, evidence refs, validator errors).
 *
 * Policy:
 * - arbitrary dimension strings are emitted only when on a small explicit
 *   public label allow-list; all other values become deterministic opaque
 *   labels (sha256 prefix), preserving grouping without exposing content;
 * - summaries are omitted (null) from normal exports;
 * - evidence refs pass only when they match an explicit hash/LCIM-id form;
 * - validation errors are reduced to a fixed code plus a digest, never raw
 *   path/message text;
 * - invalid directory names become opaque references, never raw paths.
 */

import { createHash } from 'node:crypto';
import { isValidId } from '../shared/ids.mjs';

const PUBLIC_DIMENSIONS = Object.freeze({
  provider: new Set(['deepseek', 'chatgpt']),
  model: new Set(['deepseek-flash', 'deepseek-pro-max', 'gpt-4o']),
  reasoning: new Set(['xhigh', 'MAX']),
});

const SAFE_EVIDENCE_REF = /^(?:[0-9a-f]{64}|lcim_(?:run|inv|wu|finding|ev|patch)_[0-9a-f]{32})$/;
const PUBLIC_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-(?:dev|rc)\.[0-9]+)?$/;

/** Stable lower-case sha256 digest of any value without retaining its text. */
export function safeDigest(value) {
  return createHash('sha256').update(String(value ?? '')).digest('hex');
}

/** Deterministic opaque label safe for normal JSON/Markdown output. */
export function opaqueLabel(kind, value) {
  return `${kind}_${safeDigest(value).slice(0, 16)}`;
}

/**
 * Emit a known public dimension label, or a deterministic opaque label for
 * every other (schema-valid but untrusted) string.
 */
export function sanitizeDimension(kind, value) {
  if (PUBLIC_DIMENSIONS[kind]?.has(value)) return value;
  return opaqueLabel(kind, value);
}

/** Summaries are arbitrary model/controller free text: never export them. */
export function sanitizeSummary() {
  return null;
}

/**
 * Sprint-01 permits broad alphanumeric prerelease text in lcimVersion.
 * Keep ordinary numeric/dev/rc versions readable; hash every other value.
 */
export function sanitizeVersion(value) {
  return typeof value === 'string' && PUBLIC_VERSION.test(value)
    ? value
    : opaqueLabel('version', value);
}

/**
 * Keep only evidence references whose whole value is a demonstrably
 * public-safe hash/LCIM identifier. Arbitrary refs are omitted, not hashed
 * into a source-derived textual example.
 */
export function sanitizeEvidenceRefs(refs) {
  if (!Array.isArray(refs)) return null;
  const safe = refs.filter((ref) => typeof ref === 'string' && SAFE_EVIDENCE_REF.test(ref));
  return safe.length > 0 ? safe : null;
}

/** Preserve a canonical run id, otherwise expose only an opaque reference. */
export function sanitizeRunRef(value) {
  return isValidId('run', value) ? value : opaqueLabel('invalid_run', value);
}

/** A safe opaque identifier for a local runtime path (never emit the path). */
export function sanitizeRuntimeRef(runtimeRoot) {
  return opaqueLabel('runtime', runtimeRoot);
}

/**
 * Reduce untrusted validator/read errors to a fixed public-safe form.
 * `detailDigest` permits deterministic correlation without exporting raw
 * target paths, parser text, mismatched source fields, or exception data.
 */
export function sanitizeAuditError({ runId, path, message, code } = {}) {
  return {
    runId: sanitizeRunRef(runId),
    code: code ?? 'INVALID_CANONICAL_RUN',
    detailDigest: safeDigest(`${path ?? ''}\u0000${message ?? ''}`),
  };
}
