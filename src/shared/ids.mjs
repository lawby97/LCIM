/**
 * LCIM V2 shared ID formats (Sprint 00).
 *
 * IDs are controller-generated: a stable kind prefix plus 16 random bytes in
 * hex. The string patterns are duplicated inside the shared JSON schemas
 * (schemas/common/*.v2.schema.json) and must stay in sync — the schema
 * registry test enforces this by validating generated IDs against the schemas.
 */

import { randomBytes } from 'node:crypto';
import { ConfigError } from './errors.mjs';

export const ID_KINDS = Object.freeze(['run', 'invocation', 'work-unit', 'finding']);

export const ID_PREFIXES = Object.freeze({
  run: 'lcim_run_',
  invocation: 'lcim_inv_',
  'work-unit': 'lcim_wu_',
  finding: 'lcim_finding_',
});

export const ID_PATTERNS = Object.freeze({
  run: /^lcim_run_[0-9a-f]{32}$/,
  invocation: /^lcim_inv_[0-9a-f]{32}$/,
  'work-unit': /^lcim_wu_[0-9a-f]{32}$/,
  finding: /^lcim_finding_[0-9a-f]{32}$/,
});

/** String patterns for embedding in JSON schemas. */
export const ID_PATTERN_SOURCES = Object.freeze({
  run: '^lcim_run_[0-9a-f]{32}$',
  invocation: '^lcim_inv_[0-9a-f]{32}$',
  'work-unit': '^lcim_wu_[0-9a-f]{32}$',
  finding: '^lcim_finding_[0-9a-f]{32}$',
});

/**
 * Generate a new ID of the given kind.
 * @param {'run'|'invocation'|'work-unit'|'finding'} kind
 */
export function generateId(kind) {
  if (!(kind in ID_PREFIXES)) {
    throw new ConfigError(`unknown id kind: ${kind} (expected one of ${ID_KINDS.join(', ')})`);
  }
  return ID_PREFIXES[kind] + randomBytes(16).toString('hex');
}

/** @param {'run'|'invocation'|'work-unit'|'finding'} kind */
export function isValidId(kind, value) {
  if (!(kind in ID_PATTERNS)) return false;
  return typeof value === 'string' && ID_PATTERNS[kind].test(value);
}
