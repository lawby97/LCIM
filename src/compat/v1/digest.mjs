/**
 * LCIM V2 Sprint 09 canonical serialization + digest helpers for the
 * SUPPORTED V1 compatibility variant.
 *
 * The supported V1 ledger variant's integrity chain is defined over the
 * CANONICAL JSON of each event: keys sorted, no insignificant whitespace,
 * undefined properties omitted — the same convention the V2 ledger uses
 * (src/logging/digest.mjs), defined here independently so the V1 reader
 * never depends on V2 runtime code. Any divergence between the recorded
 * historical digest and a recomputed digest is a tamper/rewrite signal:
 * the reader reports it deterministically and NEVER writes a corrected
 * hash back into the source.
 */

import { createHash } from 'node:crypto';

/** Genesis digest for seq 1: 64 zero hex chars (same value as V2's convention). */
export const V1_GENESIS_DIGEST = '0'.repeat(64);

/** sha256 hex digest of a utf8 string. */
export function sha256Hex(data) {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

/**
 * Canonical JSON serialization: object keys sorted lexicographically,
 * undefined-valued properties omitted, no whitespace. Arrays and scalars
 * serialize like JSON.stringify.
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
