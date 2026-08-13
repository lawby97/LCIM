/**
 * LCIM V2 negative side-effect representation (Sprint 04).
 *
 * For high-risk gates the semantic contract compiles negative side-effect
 * requirements: side-effect scopes whose counts MUST remain zero before a
 * gate (e.g. an authorization failure). This module defines the scope
 * vocabulary and a fail-closed guard for side-effect specs. The spec shape
 * is inlined in `schemas/semantic-contract.v2.schema.json` and
 * `schemas/acceptance-contract.v2.schema.json`; tests enforce lockstep.
 *
 * Scope names (why each matters):
 * - `provider_factory` — provider/API client construction (spawns external
 *   capability; constructing before authorization leaks capability).
 * - `network` — outbound network/HTTP requests.
 * - `database` — DB connections/transactions.
 * - `lock` — lock acquisitions (advisory/mutex/lease).
 * - `mutation` — writes/mutations to persisted state.
 */

import { ConfigError } from '../shared/errors.mjs';
import { canonicalizeJson, sha256Hex } from '../contracts/digest.mjs';

/** Side-effect scopes a negative side-effect requirement may name. */
export const SIDE_EFFECT_SCOPES = Object.freeze([
  'provider_factory',
  'network',
  'database',
  'lock',
  'mutation',
]);

/** Deterministic side-effect identity prefix and pattern (SOL-S04-004). */
export const SIDE_EFFECT_ID_PREFIX = 'se_';

export const SIDE_EFFECT_ID_PATTERN = /^se_[0-9a-f]{64}$/;

/** @param {string} id */
export function isValidSideEffectId(id) {
  return typeof id === 'string' && SIDE_EFFECT_ID_PATTERN.test(id);
}

/**
 * Deterministic content-bound identity for a negative side-effect
 * requirement: `se_` + sha256 over the canonical serialization of the
 * spec (gate, scope, requirement, expectedCount, evidenceKind).
 *
 * The identity is derived, never caller-chosen, never array-index-based:
 * two distinct requirements cannot share an identity, and two identical
 * requirements collapse to the same identity and are rejected as
 * duplicates by validation. Any carried `sideEffectId` on the spec is
 * ignored during derivation (the content is the identity).
 * @param {{gate: string, scope: string, requirement: string, expectedCount: number, evidenceKind?: string}} spec
 * @returns {string}
 */
export function sideEffectIdForSpec(spec) {
  const { sideEffectId: _ignored, ...content } = spec ?? {};
  return SIDE_EFFECT_ID_PREFIX + sha256Hex(JSON.stringify(canonicalizeJson(content)));
}

/** Optional evidence kinds for observing a side-effect count. */
export const SIDE_EFFECT_EVIDENCE_KINDS = Object.freeze([
  'instrumented_counter',
  'audit_log',
  'transaction_count',
  'lock_acquire_count',
]);

/** @param {string} scope */
export function isValidSideEffectScope(scope) {
  return SIDE_EFFECT_SCOPES.includes(scope);
}

/** @param {string} kind */
export function isValidSideEffectEvidenceKind(kind) {
  return SIDE_EFFECT_EVIDENCE_KINDS.includes(kind);
}

/**
 * Fail-closed shape guard for a single side-effect spec:
 *   { gate, scope, requirement, expectedCount, evidenceKind? }
 * `expectedCount` must be an integer >= 0 (the schema enforces the integer
 * type; this guard closes the "negative or fractional expected count" gap
 * the Sprint-00 engine subset cannot express with minimum/maximum).
 */
export function assertSideEffectSpec(spec) {
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new ConfigError('side-effect spec must be a plain object');
  }
  if (typeof spec.gate !== 'string' || spec.gate.length === 0) {
    throw new ConfigError('side-effect spec requires a non-empty "gate"');
  }
  if (!isValidSideEffectScope(spec.scope)) {
    throw new ConfigError(
      `invalid side-effect scope: ${JSON.stringify(spec.scope)} (expected one of ${SIDE_EFFECT_SCOPES.join(', ')})`,
    );
  }
  if (typeof spec.requirement !== 'string' || spec.requirement.length === 0) {
    throw new ConfigError('side-effect spec requires a non-empty "requirement"');
  }
  if (
    typeof spec.expectedCount !== 'number' ||
    !Number.isInteger(spec.expectedCount) ||
    spec.expectedCount < 0
  ) {
    throw new ConfigError(`side-effect spec expectedCount must be an integer >= 0, got ${JSON.stringify(spec.expectedCount)}`);
  }
  if (spec.evidenceKind !== undefined && !isValidSideEffectEvidenceKind(spec.evidenceKind)) {
    throw new ConfigError(
      `invalid side-effect evidenceKind: ${JSON.stringify(spec.evidenceKind)} (expected one of ${SIDE_EFFECT_EVIDENCE_KINDS.join(', ')})`,
    );
  }
  if (spec.sideEffectId !== undefined) {
    throw new ConfigError(
      'side-effect spec must not carry a caller-supplied sideEffectId; the deterministic identity is derived by the compiler',
    );
  }
}
