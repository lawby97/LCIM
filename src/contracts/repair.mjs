/**
 * LCIM V2 worker-ready repair/acceptance contract builder (Sprint 04).
 *
 * A repair contract is compiled FROM a validated, AUTHORITATIVE semantic
 * contract plus an explicit violation statement. It is the bounded,
 * worker-ready ticket a worker consumes: objective, violation, required
 * behavior, must_change, must_not_change, acceptance tests (with
 * first-class negative side-effect expectations carried from the source
 * contract), and verification.
 *
 * Authority and bounds (SOL-S04-002):
 * - the source must satisfy `isAuthoritative()`: complete, schema-valid,
 *   semantically valid, COMPILED, digest-internally-valid. Malformed,
 *   CONTRACT_REVIEW_REQUIRED, or non-COMPILED sources are rejected;
 * - the repair explicitly names which acceptance items were rejected
 *   (`rejectedAcceptanceRefs`, source `sideEffectId`s) — at least one is
 *   required, each must resolve to a source item, and duplicates fail;
 * - `mustChange` targets are bounded to the repair scope derived from the
 *   rejected acceptance items (their side-effect scopes). The caller may
 *   never expand mustChange beyond what the failed requirements authorize;
 * - frozen semantics (source objects, concepts, distinctConcepts /
 *   must_not_conflate, non-rejected negative side effects, established
 *   facts, low-risk unresolved items) are carried verbatim in
 *   `frozenSemantics` as constraints — never editable redesign targets;
 * - the repair binds to the exact source content via
 *   `sourceSemanticDigest` (never merely contractKey) [SOL-S04-003];
 * - every source negative side-effect requirement is carried EXACTLY with
 *   its deterministic `sideEffectId` and gets its own acceptance-test
 *   entry keyed by that id [SOL-S04-004].
 *
 * `repairId` follows the shared LCIM ID convention (`lcim_repair_<32hex>`);
 * the pattern is generated and validated here (sprint-owned) so the frozen
 * Sprint-00 `src/shared/ids.mjs` needs no change.
 */

import { randomBytes } from 'node:crypto';
import { ConfigError } from '../shared/errors.mjs';
import { isValidId } from '../shared/ids.mjs';
import { RepairContractError } from './errors.mjs';
import { CONTRACT_SCHEMA_VERSION } from './registry.mjs';
import { validateAcceptanceContract } from './validate.mjs';
import { isAuthoritative, authorityFailureReason } from './compiler.mjs';
import { SIDE_EFFECT_ID_PATTERN } from '../risk/side-effects.mjs';
import { deepCloneJson, deepFreezeJson } from './deep-freeze.mjs';

export const REPAIR_ID_PREFIX = 'lcim_repair_';
export const REPAIR_ID_PATTERN = /^lcim_repair_[0-9a-f]{32}$/;

/** @returns {string} new repair id: lcim_repair_<32 hex> */
export function generateRepairId() {
  return REPAIR_ID_PREFIX + randomBytes(16).toString('hex');
}

/** @param {string} id */
export function isValidRepairId(id) {
  return typeof id === 'string' && REPAIR_ID_PATTERN.test(id);
}

function assertPlainObject(value, what) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigError(`${what} must be a plain object`);
  }
}

function assertString(value, what) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ConfigError(`${what} must be a non-empty string`);
  }
}

/**
 * Build a worker-ready repair contract from an authoritative semantic contract.
 *
 * @param {object} input - {
 *   semanticContract: AUTHORITATIVE lcim.semantic-contract document
 *     (isAuthoritative must hold; CONTRACT_REVIEW_REQUIRED, malformed,
 *     non-COMPILED, or digest-invalid sources are rejected),
 *   rejectedAcceptanceRefs: string[] — sideEffectIds of the acceptance
 *     items that failed/rejected (>= 1, unique, resolvable to source),
 *   objective, violation, requiredBehavior: strings,
 *   mustChange: [{target, change}] — target MUST be the side-effect scope
 *     of a rejected acceptance item (bounded repair scope),
 *   mustNotChange?: [{target, reason}],
 *   acceptanceTests?: [{name, command?, expectation,
 *     negativeSideEffectId?, negativeSideEffectScope?,
 *     expectedSideEffectCount?}] (side-effect tests are keyed by
 *     negativeSideEffectId, never by gate::scope alone),
 *   verification: [{method, expectation}],
 *   findingRefs?: string[] (valid lcim_finding_* ids),
 *   createdAt?: ISO-8601 string
 * }
 * @returns {Readonly<object>} deeply frozen, stamped, validated acceptance contract
 * @throws {ConfigError} malformed input
 * @throws {RepairContractError} source not authoritative / cross-document
 *   inconsistency (fail closed)
 */
export function buildRepairContract(input) {
  assertPlainObject(input, 'repair contract input');

  // --- source authority (SOL-S04-002 A) ------------------------------------
  const semantic = input.semanticContract;
  assertPlainObject(semantic, 'input.semanticContract');
  if (semantic.schemaName !== 'lcim.semantic-contract') {
    throw new ConfigError(
      `input.semanticContract must be a compiled lcim.semantic-contract document, got '${semantic.schemaName ?? '<missing schemaName>'}'`,
    );
  }
  if (!isAuthoritative(semantic)) {
    throw new RepairContractError(
      `input.semanticContract is not an authoritative compiled semantic contract (${authorityFailureReason(semantic)}); repairs require a validated COMPILED source whose semantic digest is internally valid`,
    );
  }

  // --- explicit rejected acceptance references (SOL-S04-002 B) -------------
  assertArrayOf(input.rejectedAcceptanceRefs, 'input.rejectedAcceptanceRefs', (r, at) => {
    if (typeof r !== 'string' || !SIDE_EFFECT_ID_PATTERN.test(r)) {
      throw new ConfigError(`${at} must be a sideEffectId matching ${SIDE_EFFECT_ID_PATTERN}`);
    }
  });
  if (input.rejectedAcceptanceRefs.length === 0) {
    throw new ConfigError(
      'input.rejectedAcceptanceRefs must name at least one rejected acceptance item; a repair with zero rejected references is not defined by the Sprint-04 specification',
    );
  }
  const rejectedRefs = [];
  const seenRefs = new Set();
  for (const r of input.rejectedAcceptanceRefs) {
    if (seenRefs.has(r)) {
      throw new ConfigError(`input.rejectedAcceptanceRefs duplicates rejected reference '${r}'`);
    }
    seenRefs.add(r);
    rejectedRefs.push(r);
  }

  const sourceSideEffects = semantic.negativeSideEffects ?? [];
  const sourceById = new Map(sourceSideEffects.map((s) => [s.sideEffectId, s]));
  for (const ref of rejectedRefs) {
    if (!sourceById.has(ref)) {
      throw new RepairContractError(
        `rejected acceptance reference '${ref}' does not resolve to a negative side-effect acceptance item of source semantic contract '${semantic.contractKey}'`,
      );
    }
  }

  // --- bounded repair scope (SOL-S04-002 C) --------------------------------
  // The editable scope is derived from the rejected acceptance items: the
  // side-effect scopes those items guard. mustChange may not expand beyond
  // it. This is semantic repair scope, not Sprint-03 file scope.
  const rejectedSet = new Set(rejectedRefs);
  const allowedScopes = new Set(
    [...rejectedSet].map((id) => sourceById.get(id).scope).filter(Boolean),
  );

  assertString(input.objective, 'input.objective');
  assertString(input.violation, 'input.violation');
  assertString(input.requiredBehavior, 'input.requiredBehavior');
  assertArrayOf(input.mustChange, 'input.mustChange', (m, at) => {
    assertPlainObject(m, at);
    assertString(m.target, `${at}.target`);
    assertString(m.change, `${at}.change`);
  });
  for (const [i, m] of input.mustChange.entries()) {
    if (!allowedScopes.has(m.target)) {
      throw new RepairContractError(
        `mustChange[${i}].target '${m.target}' is outside the repair scope derived from the rejected acceptance items (allowed scopes: ${[...allowedScopes].join(', ')}); the caller may not expand mustChange beyond what the failed requirements authorize`,
      );
    }
  }
  assertArrayOf(input.mustNotChange ?? [], 'input.mustNotChange', (m, at) => {
    assertPlainObject(m, at);
    assertString(m.target, `${at}.target`);
    assertString(m.reason, `${at}.reason`);
  });
  assertArrayOf(input.verification, 'input.verification', (v, at) => {
    assertPlainObject(v, at);
    assertString(v.method, `${at}.method`);
    assertString(v.expectation, `${at}.expectation`);
  });
  assertArrayOf(input.acceptanceTests ?? [], 'input.acceptanceTests', (t, at) => {
    assertPlainObject(t, at);
    assertString(t.name, `${at}.name`);
    assertString(t.expectation, `${at}.expectation`);
  });
  for (const [i, f] of (input.findingRefs ?? []).entries()) {
    if (typeof f !== 'string' || !isValidId('finding', f)) {
      throw new ConfigError(`input.findingRefs[${i}] must be a valid lcim_finding_* id`);
    }
  }

  // --- user acceptance tests: side effects are keyed by identity -----------
  // gate::scope alone never identifies a requirement (SOL-S04-004); a user
  // test referencing a side effect must carry its negativeSideEffectId and
  // pin the exact source scope/count or fail closed.
  const userTests = input.acceptanceTests ?? [];
  for (const [i, t] of userTests.entries()) {
    const hasId = t.negativeSideEffectId !== undefined;
    const hasLegacyRef =
      t.negativeSideEffectRef !== undefined || t.negativeSideEffectScope !== undefined;
    if (hasLegacyRef && !hasId) {
      throw new ConfigError(
        `input.acceptanceTests[${i}] references a negative side effect without negativeSideEffectId; side effects are identified by their deterministic sideEffectId, never by gate::scope alone`,
      );
    }
    if (hasId) {
      if (!SIDE_EFFECT_ID_PATTERN.test(t.negativeSideEffectId)) {
        throw new ConfigError(`input.acceptanceTests[${i}].negativeSideEffectId must match ${SIDE_EFFECT_ID_PATTERN}`);
      }
      const spec = sourceById.get(t.negativeSideEffectId);
      if (spec === undefined) {
        throw new ConfigError(`input.acceptanceTests[${i}].negativeSideEffectId references unknown side effect '${t.negativeSideEffectId}'`);
      }
      if (t.negativeSideEffectScope !== spec.scope || t.expectedSideEffectCount !== spec.expectedCount) {
        throw new RepairContractError(
          `acceptance test for side-effect '${spec.sideEffectId}' conflicts with the source semantic contract (expected scope=${spec.scope}, count=${spec.expectedCount})`,
        );
      }
    }
  }

  // --- first-class negative side-effect carry (SOL-S04-004) ----------------
  // Every source spec is carried EXACTLY (identity, gate, scope,
  // requirement, expectedCount, evidenceKind), and each gets its own
  // independently traceable acceptance-test entry keyed by sideEffectId.
  const carried = deepCloneJson(sourceSideEffects);
  const tests = [...userTests];
  for (const s of carried) {
    const existing = tests.find((t) => t.negativeSideEffectId === s.sideEffectId);
    if (existing === undefined) {
      tests.push({
        name: `side-effect guard: ${s.scope} stays ${s.expectedCount} before ${s.gate} (${s.sideEffectId})`,
        expectation: s.requirement,
        negativeSideEffectId: s.sideEffectId,
        negativeSideEffectRef: `${s.gate}::${s.scope}`,
        negativeSideEffectScope: s.scope,
        expectedSideEffectCount: s.expectedCount,
      });
    }
  }

  // --- frozen semantics (SOL-S04-002 D) -------------------------------------
  // Constraints, not redesign targets: everything the source declares that
  // is not itself a rejected acceptance item is carried verbatim.
  const frozenSemantics = {
    sourceObjects: deepCloneJson(semantic.sourceObjects ?? []),
    concepts: deepCloneJson(semantic.concepts ?? []),
    distinctConcepts: deepCloneJson(semantic.distinctConcepts ?? []),
    negativeSideEffects: deepCloneJson(
      sourceSideEffects.filter((s) => !rejectedSet.has(s.sideEffectId)),
    ),
    factsEstablished: deepCloneJson(semantic.factsEstablished ?? []),
    unresolvedSemantics: deepCloneJson(semantic.unresolvedSemantics ?? []),
  };

  const createdAt = input.createdAt ?? new Date().toISOString();
  const repairId = input.repairId ?? generateRepairId();

  const doc = {
    schemaName: 'lcim.acceptance-contract',
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    repairId,
    contractKey: semantic.contractKey,
    sourceSemanticDigest: semantic.semanticDigest,
    rejectedAcceptanceRefs: [...rejectedRefs],
    objective: input.objective,
    violation: input.violation,
    requiredBehavior: input.requiredBehavior,
    mustChange: input.mustChange,
    mustNotChange: input.mustNotChange ?? [],
    acceptanceTests: tests,
    negativeSideEffects: carried,
    frozenSemantics,
    verification: input.verification,
    ...(input.findingRefs !== undefined ? { findingRefs: input.findingRefs } : {}),
    ...(semantic.riskClass !== undefined ? { riskClass: semantic.riskClass } : {}),
    createdAt,
  };

  const result = validateAcceptanceContract(doc, { semanticContract: semantic });
  if (!result.valid) {
    throw new RepairContractError(
      `repair contract for '${semantic.contractKey}' failed validation: ${result.errors
        .map((e) => `${e.path || '(root)'}: ${e.message}`)
        .join('; ')}`,
      { repairId, contractKey: semantic.contractKey, errors: result.errors },
    );
  }

  // Deep clone (never freeze caller-owned input) + deep freeze [SOL-S04-001].
  return deepFreezeJson(deepCloneJson(doc));
}

function assertArrayOf(value, what, check) {
  if (!Array.isArray(value)) {
    throw new ConfigError(`${what} must be an array`);
  }
  for (const [i, item] of value.entries()) {
    check(item, `${what}[${i}]`);
  }
}
