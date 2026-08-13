/**
 * LCIM V2 SOL response compiler (Sprint 06).
 *
 * Compiles a structured SOL decision result into a `lcim.sol-response`
 * document. The response is the bounded decision result counterpart of a
 * compiled ask.
 *
 * compileSolResponse() REQUIRES the actual compiled ask document
 * (opts.ask) — a pattern-valid askId alone is never enough (SOL-S06-006):
 *
 * - the ask is validated (intrinsic rules);
 * - responseId + askId bind the response to exactly that ask;
 * - askId AND callType must bind exactly;
 * - the verdict must be in the call type's type-locked vocabulary;
 * - per-type blocks are enforced (amendment only under CONTRACT_CHECK,
 *   failure only under DIAGNOSE, adjacentCriticalDefects only under
 *   FINAL_REVIEW, findings only where the type admits them);
 * - every finding/evidence/invariant/ref resolves against that ask
 *   (finding evidence refs, adjacent evidence refs, DIAGNOSE failure
 *   evidence refs, RECHECK delta-only refs);
 * - response evidence fits the ask's evidence budget (or the default)
 *   and follows the same deterministic truncation rules; evidence
 *   referenced by decision-bearing rules (failure/finding/adjacent
 *   refs) is protected from truncation — required decision evidence that
 *   cannot fit fails closed (SOL-S06-004);
 * - generic cleanup/refactoring recommendations are rejected in EVERY
 *   text-bearing field — bounded review output decides the bounded
 *   question only (SOL-S06-007);
 * - caller-supplied derived fields (responseId, compiledAt, schema
 *   fields) are rejected — the compiler owns instance identity;
 * - output is validated with `validateSolResponse` against the exact
 *   ask (+ sources for DIAGNOSE repair-scope rules) and deeply frozen.
 *
 * The lower-level `validateSolResponse(doc, opts)` remains available for
 * static fixtures; it is NOT equivalent to response compilation.
 */

import { ConfigError } from '../../shared/errors.mjs';
import { SolAskError, SolResponseError } from '../contracts/errors.mjs';
import { assertSolCallType } from '../contracts/call-types.mjs';
import { generateSolResponseId } from '../contracts/ids.mjs';
import { SOL_SCHEMA_VERSION } from '../contracts/registry.mjs';
import { validateSolAsk, validateSolResponse } from '../contracts/validate.mjs';
import {
  DEFAULT_EVIDENCE_BUDGET,
  assertEvidenceBudget,
  TRUNCATION_MARKER_REF,
} from '../contracts/evidence.mjs';
import { applyEvidenceBudget } from './evidence-budget.mjs';
import { deepCloneJson, deepFreezeJson } from '../../contracts/deep-freeze.mjs';

/** Fields the compiler derives; never valid caller-supplied response fields. */
const DERIVED_RESPONSE_FIELDS = ['schemaName', 'schemaVersion', 'responseId', 'compiledAt'];

/** Evidence ref reserved for the compiler-owned truncation marker. */
const RESERVED_EVIDENCE_REFS = [TRUNCATION_MARKER_REF];

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

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Evidence refs referenced by decision-bearing response rules. */
function decisionReferencedEvidenceRefs(input) {
  const refs = new Set();
  for (const ref of input.failure?.evidenceRefs ?? []) refs.add(ref);
  for (const f of input.findings ?? []) for (const ref of f?.evidenceRefs ?? []) refs.add(ref);
  for (const a of input.adjacentCriticalDefects ?? []) for (const ref of a?.evidenceRefs ?? []) refs.add(ref);
  return refs;
}

/**
 * Compile a SOL response from explicit structured input.
 *
 * @param {object} input - structured response source:
 *   askId (must bind to opts.ask), callType, verdict, decisionSummary,
 *   evidence, plus the per-type content matching the verdict (amendment |
 *   failure | findings | adjacentCriticalDefects). Must NOT carry a
 *   caller-supplied responseId, compiledAt, or schema fields.
 * @param {{ compiledAt?: string, ask: object, sources?: Array<object> }} opts -
 *   compiledAt override for deterministic tests; ask: the actual compiled
 *   ask (REQUIRED — every response binds to its real ask); sources:
 *   validated Sprint-04 sources (for DIAGNOSE repair-scope rules).
 * @returns {Readonly<object>} deeply frozen, stamped, validated lcim.sol-response
 * @throws {ConfigError} malformed input
 * @throws {SolResponseError} missing ask (ASK_REQUIRED), validation
 *   failure, or evidence-budget exhaustion (BUDGET_EXHAUSTED)
 */
export function compileSolResponse(input, opts = {}) {
  assertPlainObject(input, 'SOL response input');
  for (const field of DERIVED_RESPONSE_FIELDS) {
    if (field in input) {
      throw new ConfigError(
        `input must not carry '${field}'; the response compiler derives it (responseId/compiledAt are instance identity)`,
      );
    }
  }

  // --- the ACTUAL compiled ask is required (SOL-S06-006) --------------------
  const ask = opts.ask;
  if (!isPlainObject(ask)) {
    throw new SolResponseError(
      'compileSolResponse requires the actual compiled ask document (opts.ask); a pattern-valid askId alone can never bind a response to a real decision contract',
      'ASK_REQUIRED',
    );
  }
  const askValidation = validateSolAsk(ask, { sources: opts.sources });
  if (!askValidation.valid) {
    throw new SolResponseError(
      `the supplied ask is not a valid compiled ask: ${askValidation.errors[0]?.message ?? 'invalid'}`,
      'ASK_REQUIRED',
      { errors: askValidation.errors },
    );
  }

  assertString(input.askId, 'input.askId');
  if (ask.askId !== input.askId) {
    throw new SolResponseError(
      `response askId '${input.askId}' does not bind to the supplied ask '${ask.askId}'; a response compiles only for its real ask`,
      'ASK_ID_MISMATCH',
      { askId: ask.askId },
    );
  }
  assertSolCallType(input.callType);
  if (ask.callType !== input.callType) {
    throw new SolResponseError(
      `response callType '${input.callType}' does not match the ask's '${ask.callType}'`,
      'CALL_TYPE_MISMATCH',
      { callType: ask.callType },
    );
  }
  assertString(input.verdict, 'input.verdict');
  assertString(input.decisionSummary, 'input.decisionSummary');

  // --- caller evidence is allowed but never carries compiler-owned refs ------
  for (const [i, item] of (input.evidence ?? []).entries()) {
    if (RESERVED_EVIDENCE_REFS.includes(item?.ref)) {
      throw new ConfigError(
        `input.evidence[${i}] uses reserved ref '${item.ref}'; the truncation marker is compiler-owned`,
      );
    }
  }

  // --- evidence budget: the ask's budget; decision-referenced evidence is
  // protected from truncation (SOL-S06-004) -----------------------------------
  const budget = ask.evidenceBudget ?? DEFAULT_EVIDENCE_BUDGET;
  assertEvidenceBudget(budget);
  let budgeted;
  try {
    budgeted = applyEvidenceBudget(input.evidence ?? [], budget, {
      protectedRefs: decisionReferencedEvidenceRefs(input),
    });
  } catch (err) {
    if (err instanceof SolAskError) {
      // Response-path budget exhaustion is a response contract failure.
      throw new SolResponseError(err.message, err.code, err.details);
    }
    throw err;
  }

  const compiledAt = opts.compiledAt ?? new Date().toISOString();
  const responseId = generateSolResponseId();

  const draft = {
    schemaName: 'lcim.sol-response',
    schemaVersion: SOL_SCHEMA_VERSION,
    responseId,
    askId: input.askId,
    callType: input.callType,
    verdict: input.verdict,
    decisionSummary: input.decisionSummary,
    evidence: budgeted.evidence,
    ...(input.findings !== undefined ? { findings: input.findings } : {}),
    ...(input.amendment !== undefined ? { amendment: input.amendment } : {}),
    ...(input.failure !== undefined ? { failure: input.failure } : {}),
    ...(input.adjacentCriticalDefects !== undefined
      ? { adjacentCriticalDefects: input.adjacentCriticalDefects }
      : {}),
    compiledAt,
  };

  const result = validateSolResponse(draft, {
    ask,
    sources: opts.sources,
  });
  if (!result.valid) {
    throw new SolResponseError(
      `SOL response failed validation: ${result.errors
        .map((e) => `${e.path || '(root)'}: [${e.code}] ${e.message}`)
        .join('; ')}`,
      'SOL_RESPONSE_INVALID',
      { errors: result.errors },
    );
  }

  const compiled = deepCloneJson(draft);
  return deepFreezeJson(compiled);
}
