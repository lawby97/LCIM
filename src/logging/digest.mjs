/**
 * LCIM V2 Sprint 01 canonical serialization + digest helpers.
 *
 * The integrity chain of events.v2.jsonl is defined over the CANONICAL JSON
 * of each event: keys sorted, no insignificant whitespace, undefined
 * properties omitted. Any two implementations that compute event digests
 * must agree on canonicalJson() — the reader/validator recomputes digests
 * and any divergence is a rewrite/tamper signal.
 */

import { createHash } from 'node:crypto';

/** sha256 hex digest of a utf8 string. */
export function sha256Hex(data) {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Canonical JSON serialization: object keys sorted lexicographically,
 * undefined-valued properties omitted, no whitespace. Arrays and scalars
 * serialize like JSON.stringify (JSON.stringify(undefined) is guarded to
 * 'null' so a programming error can never poison a digest silently).
 */
export function canonicalJson(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}
