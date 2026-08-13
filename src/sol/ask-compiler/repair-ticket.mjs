/**
 * LCIM V2 SOL failure → repair-ticket compiler (Sprint 06).
 *
 * Compiles a SOL_DIAGNOSE failure response (verdict CAUSE_IDENTIFIED)
 * DETERMINISTICALLY into the Sprint-04 worker-ready repair contract
 * (`lcim.acceptance-contract` via `buildRepairContract` from
 * `src/contracts/repair.mjs`) plus its conversion record
 * (`lcim.repair-ticket`).
 *
 * FROZEN POLICY (SOL-S06): only SOL_DIAGNOSE + CAUSE_IDENTIFIED may
 * compile directly into the worker-ready Sprint-04 repair artifact.
 * CONTRACT_CHECK amendments, FINAL_REVIEW findings, and RECHECK findings
 * never convert directly — they require another bounded diagnose/decision
 * flow first.
 *
 * REVALIDATION (SOL-S06-009): compileRepairTicket() never trusts that
 * callers previously invoked validators. Before returning any repair
 * artifact it independently revalidates the complete chain:
 *
 *   SOURCE -> COMPILED ASK -> COMPILED RESPONSE -> REPAIR CONVERSION
 *
 * 1. every supplied source is validated with the Sprint-04 validator
 *    (never repaired/mutated) and must be implementation-authoritative
 *    (COMPILED) where Sprint-04 requires it;
 * 2. the ask is validated against the sources (all contractRefs and
 *    requirementRefs bound, criterion identity/digest binding);
 * 3. the response is validated against that exact ask/source (verdict,
 *    repair constraints: maxMustChangeTargets, mustNotChangeRequired,
 *    evidence refs, exact-test binding);
 * 4. the repaired scope never widens beyond the diagnosed criterion's
 *    side-effect scope;
 * 5. authority-bearing acceptance semantics are SOURCE-DERIVED: the
 *    repair's objective/violation/requiredBehavior are derived from the
 *    source requirement text, never from SOL prose; SOL may supply root
 *    cause, smallest bounded implementation repair, implementation-local
 *    mustChange/mustNotChange within permitted scope, and
 *    falsification/verification — it never rewrites the authoritative
 *    acceptance contract. Only criterion-bound exact tests (expectation
 *    verified verbatim against the source requirement) are retained and
 *    keyed by the deterministic sideEffectId; other SOL exact tests are
 *    implementation verification hints and are excluded from the
 *    authoritative repair contract;
 * 6. frozen requirements and negative side effects are preserved by the
 *    Sprint-04 builder.
 *
 * CONTENT-BOUND IDENTITY (SOL-S06-010): the canonical authority-bearing
 * conversion payload (sourceSemanticDigest, bound ask identity/type/
 * criterion, derived acceptance semantics, normalized bounded repair
 * content: mustChange/mustNotChange/criterion-bound exact tests/
 * verification, relevant finding refs) is hashed deterministically; the
 * conversionDigest is that hash and repairId is derived from it
 * (`lcim_repair_` + first 32 hex). Timestamps/randomness never enter the
 * content identity: identical conversions are idempotent; materially
 * different conversion payloads can never share a repair identity.
 */

import { ConfigError } from '../../shared/errors.mjs';
import { SolRepairTicketError } from '../contracts/errors.mjs';
import { SOL_SCHEMA_VERSION } from '../contracts/registry.mjs';
import {
  validateRepairTicket,
  validateSolAsk,
  validateSolResponse,
  validateSourceSet,
  isImplementationAuthoritative,
  resolveCriterionBinding,
} from '../contracts/validate.mjs';
import { buildRepairContract, isValidRepairId, REPAIR_ID_PATTERN } from '../../contracts/repair.mjs';
import { canonicalizeJson, sha256Hex } from '../../contracts/digest.mjs';
import { deepCloneJson, deepFreezeJson } from '../../contracts/deep-freeze.mjs';

/** Repair id prefix, shared with the Sprint-04 repair contract. */
export const REPAIR_ID_PREFIX = 'lcim_repair_';

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Fail closed with a structured conversion error carrying the chain errors. */
function chainError(message, errors) {
  return new SolRepairTicketError(
    message,
    'TICKET_CHAIN_INVALID',
    { errors },
  );
}

/**
 * Compile a SOL DIAGNOSE failure response into a worker-ready repair
 * ticket deterministically.
 *
 * @param {object} input - { ask, response, sources }
 * @returns {{ repairContract: Readonly<object>, ticket: Readonly<object> }}
 *   deeply frozen lcim.acceptance-contract + lcim.repair-ticket
 * @throws {ConfigError} malformed input
 * @throws {SolRepairTicketError} the chain fails to revalidate or the
 *   conversion fails closed
 */
export function compileRepairTicket({ ask, response, sources }) {
  if (!isPlainObject(ask) || !isPlainObject(response)) {
    throw new ConfigError('compileRepairTicket requires the compiled SOL ask and compiled SOL response');
  }

  // --- decision identity: only a DIAGNOSE CAUSE_IDENTIFIED failure --------
  if (ask.callType !== 'SOL_DIAGNOSE' || response.callType !== 'SOL_DIAGNOSE') {
    throw new SolRepairTicketError(
      'a repair ticket compiles only from SOL_DIAGNOSE asks and responses (frozen policy: no direct conversion of CONTRACT_CHECK/FINAL_REVIEW/RECHECK output)',
      'NOT_DIAGNOSE_CAUSE_IDENTIFIED',
      { askCallType: ask.callType, responseCallType: response.callType },
    );
  }
  if (response.askId !== ask.askId) {
    throw new SolRepairTicketError(
      `response '${response.responseId}' does not bind to ask '${ask.askId}'`,
      'TICKET_ASK_RESPONSE_MISMATCH',
      { askId: ask.askId, responseId: response.responseId },
    );
  }
  if (response.verdict !== 'CAUSE_IDENTIFIED' || response.failure === undefined) {
    throw new SolRepairTicketError(
      `response verdict '${response.verdict}' compiles into no repair ticket; only CAUSE_IDENTIFIED failure responses do`,
      'NOT_DIAGNOSE_CAUSE_IDENTIFIED',
      { verdict: response.verdict },
    );
  }

  // --- 1. source validation + implementation authority (SOL-S06-009) --------
  const sourceResult = validateSourceSet(sources);
  if (!sourceResult.valid) {
    throw chainError('repair conversion rejected the source chain: supplied sources are not valid Sprint-04 semantic contracts', sourceResult.errors);
  }
  const boundSources = sourceResult.bound;
  for (const source of boundSources) {
    if (!isImplementationAuthoritative(source)) {
      throw new SolRepairTicketError(
        `source '${source.contractKey}' is '${source.compileStatus}', not implementation-authoritative; Sprint-04 repairs require a validated COMPILED source with an internally valid digest`,
        'SOURCE_NOT_AUTHORITATIVE',
        { contractKey: source.contractKey, compileStatus: source.compileStatus },
      );
    }
  }

  // --- 2. ask revalidation against the sources ------------------------------
  const askValidation = validateSolAsk(ask, { sources: boundSources });
  if (!askValidation.valid) {
    throw chainError('repair conversion rejected the ask chain: the ask does not validate against the sources', askValidation.errors);
  }

  // --- 3. response revalidation against the exact ask/source ----------------
  const responseValidation = validateSolResponse(response, { ask, sources: boundSources });
  if (!responseValidation.valid) {
    throw chainError('repair conversion rejected the response chain: the response does not validate against the ask/source', responseValidation.errors);
  }

  // --- criterion identity/digest binding (SOL-S06-009.6) ---------------------
  // The ask revalidation above already proves: every contractRef binds by
  // (contractKey, semanticDigest) and the criterion is a declared,
  // source-resolved requirementRef.
  const criterion = ask.diagnose?.acceptanceCriterionRef;

  // --- repair source is derived from the EXACT ASK BINDING, never from
  // source-array order (SOL-S06-009): the UNIQUE contractRef claiming the
  // criterion is resolved by (contractKey, semanticDigest) against the
  // supplied sources; other supplied sources are ignored even if they
  // contain an identical side-effect/criterion.
  const resolved = resolveCriterionBinding(ask, boundSources);
  if (resolved.error !== undefined) {
    throw new SolRepairTicketError(
      `repair source selection failed: ${resolved.error} — the repair source must be derived from the exact ask binding (unique claiming contractRef resolved by contractKey+semanticDigest), never from source-array order`,
      resolved.error,
      { criterion },
    );
  }
  const source = resolved.source;
  const spec = resolved.spec;

  // --- 7. bounded smallest safe repair (rechecked; never widened) -------------
  const repair = response.failure.repair;
  for (const [i, m] of (repair.mustChange ?? []).entries()) {
    if (m?.target !== spec.scope) {
      throw new SolRepairTicketError(
        `repair mustChange[${i}].target '${m?.target}' is outside the diagnosed criterion's side-effect scope '${spec.scope}'; the smallest safe repair never expands beyond the failing requirement`,
        'TICKET_SCOPE_UNBOUNDED',
        { target: m?.target, scope: spec.scope },
      );
    }
  }

  // --- 5. source-derived acceptance semantics (SOL-S06-009.10) ----------------
  // SOL never authors authority-bearing required behavior/objective/
  // violation; they are derived deterministically from the source
  // requirement. Only criterion-bound exact tests (expectation verified
  // verbatim against the source requirement by response validation) are
  // retained, keyed by the deterministic sideEffectId and pinning the
  // source scope/count exactly. Unbound SOL exact tests are implementation
  // verification hints and are excluded from the authoritative contract.
  const objective = `restore acceptance criterion '${criterion}' (${spec.requirement})`;
  const violation = `acceptance criterion '${criterion}' violated: ${spec.requirement}`;
  const requiredBehavior = spec.requirement;

  const acceptanceTests = [];
  for (const t of repair.exactTests ?? []) {
    if (t?.acceptanceCriterionRef === criterion) {
      acceptanceTests.push({
        name: t.name,
        ...(t.command !== undefined ? { command: t.command } : {}),
        expectation: spec.requirement,
        negativeSideEffectId: spec.sideEffectId,
        negativeSideEffectScope: spec.scope,
        expectedSideEffectCount: spec.expectedCount,
      });
    }
    // other exact tests are non-authoritative hints: excluded
  }

  const findingRefs =
    Array.isArray(response.findings) && response.findings.length === 1
      ? [response.findings[0].findingId]
      : undefined;

  const createdAt = response.compiledAt;

  // --- 9/10. canonical authority-bearing conversion payload ------------------
  // Content identity includes every material conversion authority; it
  // never includes timestamps or randomness (SOL-S06-010). The response
  // content digest (excluding instance metadata) guarantees that two
  // same-ID responses with materially different content never share a
  // repair identity.
  const { schemaName: _n, schemaVersion: _v, responseId: _rid, compiledAt: _c, ...responseContent } = response;
  const responseContentDigest = sha256Hex(JSON.stringify(canonicalizeJson(responseContent)));
  const conversionPayload = {
    schemaFamily: 'lcim.repair-ticket',
    askId: ask.askId,
    callType: ask.callType,
    criterion,
    contractKey: source.contractKey,
    sourceSemanticDigest: source.semanticDigest,
    responseContentDigest,
    objective,
    violation,
    requiredBehavior,
    mustChange: repair.mustChange,
    mustNotChange: repair.mustNotChange ?? [],
    acceptanceTests,
    verification: repair.verification,
    ...(findingRefs !== undefined ? { findingRefs } : {}),
  };
  const conversionDigest = sha256Hex(JSON.stringify(canonicalizeJson(conversionPayload)));

  // repairId is derived from the canonical content identity (SOL-S06-010):
  // `lcim_repair_` + first 16 bytes (32 hex) of the conversion digest.
  const repairId = REPAIR_ID_PREFIX + conversionDigest.slice(0, 32);
  if (!isValidRepairId(repairId)) {
    throw new SolRepairTicketError('derived repairId is malformed', 'TICKET_ID_MISMATCH', { repairId });
  }

  const repairContract = buildRepairContract({
    semanticContract: source,
    rejectedAcceptanceRefs: [criterion],
    objective,
    violation,
    requiredBehavior,
    mustChange: repair.mustChange,
    mustNotChange: repair.mustNotChange ?? [],
    acceptanceTests,
    verification: repair.verification,
    ...(findingRefs !== undefined ? { findingRefs } : {}),
    repairId,
    createdAt,
  });

  // --- deterministic conversion record ---------------------------------------
  const ticket = {
    schemaName: 'lcim.repair-ticket',
    schemaVersion: SOL_SCHEMA_VERSION,
    ticketId: repairId,
    sourceAskId: ask.askId,
    sourceResponseId: response.responseId,
    callType: 'SOL_DIAGNOSE',
    repairId,
    contractKey: source.contractKey,
    sourceSemanticDigest: source.semanticDigest,
    rejectedAcceptanceRefs: [criterion],
    conversionDigest,
    compiledAt: createdAt,
  };

  const ticketResult = validateRepairTicket(ticket, { ask, response });
  if (!ticketResult.valid) {
    throw new SolRepairTicketError(
      `repair ticket failed validation: ${ticketResult.errors
        .map((e) => `${e.path || '(root)'}: ${e.message}`)
        .join('; ')}`,
      'SOL_REPAIR_CONVERSION_FAILED',
      { errors: ticketResult.errors },
    );
  }

  return {
    repairContract,
    ticket: deepFreezeJson(deepCloneJson(ticket)),
  };
}

export { REPAIR_ID_PATTERN };
