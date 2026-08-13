/**
 * LCIM V2 semantic contract compiler (Sprint 04).
 *
 * Compiles exact worker semantics from EXPLICIT STRUCTURED INPUTS only —
 * never by inspecting business repositories. The compiler:
 *
 * - normalizes and stamps the document (`lcim.semantic-contract` 2.0.0);
 * - derives a deterministic content-bound `sideEffectId` for every
 *   negative side-effect requirement [SOL-S04-004];
 * - computes `semanticDigest`, the deterministic content identity of ALL
 *   authority-bearing semantic content [SOL-S04-003];
 * - computes compileStatus from unresolvedSemantics: any entry in a
 *   HIGH_RISK_CLASS => `CONTRACT_REVIEW_REQUIRED` (never invents facts);
 * - refuses inputs that try to silently fill unresolved semantics (an
 *   unresolved question carrying an invented answer is a ConfigError);
 * - validates the result with `validateSemanticContract` and fails closed
 *   on any error, attaching computed warnings to the frozen document;
 * - returns a DEEPLY immutable document (deep clone + deep freeze), so a
 *   validated COMPILED object can never be altered into a semantically
 *   inconsistent state after validation [SOL-S04-001].
 *
 * `compileWarnings` on the document is populated from validation warnings
 * so downstream routing/SOL consumers can see them without re-validating.
 */

import { ConfigError } from '../shared/errors.mjs';
import { ContractCompileError } from './errors.mjs';
import { CONTRACT_SCHEMA_VERSION } from './registry.mjs';
import { computeCompileStatus, reviewRequiredReason } from './status.mjs';
import { assertRiskClass } from '../risk/classes.mjs';
import { assertSideEffectSpec, sideEffectIdForSpec } from '../risk/side-effects.mjs';
import {
  validateSemanticContract,
  authorityFailureReason,
  isAuthoritative,
} from './validate.mjs';
import { computeSemanticDigest } from './digest.mjs';
import { deepCloneJson, deepFreezeJson } from './deep-freeze.mjs';

/** Fields that would silently fill an unresolved semantics entry. */
const INVENTED_ANSWER_FIELDS = ['answer', 'resolvedValue', 'resolved', 'decision', 'conclusion'];

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

function assertArrayOf(value, what, check) {
  if (!Array.isArray(value)) {
    throw new ConfigError(`${what} must be an array`);
  }
  for (const [i, item] of value.entries()) {
    check(item, `${what}[${i}]`);
  }
}

/**
 * Compile a semantic contract from explicit structured input.
 *
 * @param {object} input - structured contract source:
 *   contractKey, title, riskClass, sourceObjects, concepts,
 *   distinctConcepts, negativeSideEffects, factsEstablished,
 *   unresolvedSemantics (see docs/v2-semantic-contract.md for the shape).
 *   Must NOT carry a caller-supplied semanticDigest or sideEffectId — both
 *   are derived deterministically by the compiler.
 * @param {{ compiledAt?: string }} [opts]
 * @returns {Readonly<object>} deeply frozen, stamped, validated semantic contract
 * @throws {ConfigError} malformed/inventive input
 * @throws {ContractCompileError} validation errors (fail closed)
 */
export function compileSemanticContract(input, opts = {}) {
  assertPlainObject(input, 'semantic contract input');
  if ('semanticDigest' in input) {
    throw new ConfigError(
      "input must not carry 'semanticDigest'; the compiler derives the authoritative content digest from the semantic content",
    );
  }
  assertString(input.contractKey, 'input.contractKey');
  assertString(input.title, 'input.title');
  assertRiskClass(input.riskClass);

  assertArrayOf(input.sourceObjects, 'input.sourceObjects', (s, at) => {
    assertPlainObject(s, at);
    assertString(s.key, `${at}.key`);
    assertString(s.ref, `${at}.ref`);
    assertString(s.authority, `${at}.authority`);
  });
  assertArrayOf(input.concepts, 'input.concepts', (c, at) => {
    assertPlainObject(c, at);
    assertString(c.name, `${at}.name`);
    assertString(c.ownership, `${at}.ownership`);
    assertArrayOf(c.authoritativeFieldNames, `${at}.authoritativeFieldNames`, (f, fAt) =>
      assertString(f, fAt),
    );
  });
  assertArrayOf(input.distinctConcepts, 'input.distinctConcepts', (d, at) => {
    assertPlainObject(d, at);
    assertString(d.conceptA, `${at}.conceptA`);
    assertString(d.conceptB, `${at}.conceptB`);
    assertString(d.mustNotConflate, `${at}.mustNotConflate`);
  });
  assertArrayOf(input.negativeSideEffects, 'input.negativeSideEffects', (s, at) => {
    assertPlainObject(s, at);
    assertSideEffectSpec(s); // also rejects caller-supplied sideEffectId
  });
  assertArrayOf(input.factsEstablished, 'input.factsEstablished', (f, at) => {
    assertPlainObject(f, at);
    assertString(f.fact, `${at}.fact`);
    assertString(f.evidence, `${at}.evidence`);
  });
  assertArrayOf(input.unresolvedSemantics, 'input.unresolvedSemantics', (u, at) => {
    assertPlainObject(u, at);
    assertString(u.question, `${at}.question`);
    assertRiskClass(u.riskClass);
    for (const field of INVENTED_ANSWER_FIELDS) {
      if (field in u) {
        throw new ConfigError(
          `${at} carries an invented answer field '${field}': unresolved semantics must stay unresolved; establish facts in factsEstablished or surface CONTRACT_REVIEW_REQUIRED`,
        );
      }
    }
  });

  const compiledAt = opts.compiledAt ?? new Date().toISOString();
  const compileStatus = computeCompileStatus(input.unresolvedSemantics);

  // Deterministic content-bound side-effect identities [SOL-S04-004].
  const negativeSideEffects = input.negativeSideEffects.map((s) => ({
    ...s,
    sideEffectId: sideEffectIdForSpec(s),
  }));

  const draft = {
    schemaName: 'lcim.semantic-contract',
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    contractKey: input.contractKey,
    title: input.title,
    compileStatus,
    riskClass: input.riskClass,
    compiledAt,
    sourceObjects: input.sourceObjects,
    concepts: input.concepts,
    distinctConcepts: input.distinctConcepts,
    negativeSideEffects,
    factsEstablished: input.factsEstablished,
    unresolvedSemantics: input.unresolvedSemantics,
  };

  // Deterministic content identity [SOL-S04-003]. Derived from the draft's
  // authority-bearing content BEFORE the digest field is stamped, so the
  // digest never depends on itself.
  const stamped = { ...draft, semanticDigest: computeSemanticDigest(draft) };

  const result = validateSemanticContract(stamped);
  if (!result.valid) {
    throw new ContractCompileError(
      `semantic contract '${input.contractKey}' failed validation: ${result.errors
        .map((e) => `${e.path || '(root)'}: ${e.message}`)
        .join('; ')}`,
      { contractKey: input.contractKey, errors: result.errors },
    );
  }

  // Deep clone (never freeze caller-owned input) + deep freeze (every
  // nested array/object becomes immutable) [SOL-S04-001].
  const compiled = deepCloneJson({
    ...stamped,
    ...(result.warnings.length > 0 ? { compileWarnings: result.warnings } : {}),
  });
  return deepFreezeJson(compiled);
}

// --- authority predicate (SOL-S04-001) ------------------------------------
// `authorityFailureReason` / `isAuthoritative` are defined in validate.mjs
// next to the validation logic they use, so the cross-document acceptance
// validator enforces the SAME authority definition without an import
// cycle. They are re-exported unchanged from here to keep this module's
// public API stable (buildRepairContract and the test suites import them
// via compiler.mjs). [SOL-S04-R2-001]

export { authorityFailureReason, isAuthoritative, reviewRequiredReason };
