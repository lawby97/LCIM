/**
 * SOL-S06-004 regression: REFERENCED EVIDENCE CANNOT BE TRUNCATED /
 * MARKER IS NOT EVIDENCE.
 *
 * Evidence referenced by decision-bearing rules (pass/fail conditions,
 * prior/delta evidence, failure/root-cause, findings, adjacent critical)
 * is protected from truncation: if all required referenced evidence
 * cannot fit, compilation FAILS CLOSED. The truncation marker is not
 * substantive evidence: it belongs to no resolvable ordinary evidence-ref
 * set and can never satisfy a response evidence reference.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSolAsk } from '../../src/sol/ask-compiler/compiler.mjs';
import { compileSolResponse } from '../../src/sol/ask-compiler/response.mjs';
import { validateSolAsk, validateSolResponse } from '../../src/sol/contracts/validate.mjs';
import { SolAskError, SolResponseError } from '../../src/sol/contracts/errors.mjs';
import { TRUNCATION_MARKER_REF } from '../../src/sol/contracts/evidence.mjs';
import {
  compileProviderContract,
  buildPriorFinalReview,
  buildDiagnoseAsk,
  providerFactoryEffectId,
  networkEffectId,
  PRIOR_FINDING_ID,
  NOW,
} from './helpers.mjs';

const SOURCE = compileProviderContract();
const SOURCES = [SOURCE];
const PROVIDER_FACTORY_REQUIREMENT =
  'provider factory invocations remain zero before an authorization failure is handled';

function hasCode(err, code) {
  return err?.code === code || (err?.details?.errors ?? []).some((e) => e.code === code);
}

test('A: a pass/fail-referenced item that would otherwise be truncated is retained (never truncated)', () => {
  const ask = compileSolAsk(
    {
      callType: 'SOL_CONTRACT_CHECK',
      singleDecisionQuestion: 'Is the exact field-name casing of the approval decision contract sufficiently specified?',
      whyNeeded: 'protected evidence regression',
      contractRefs: [{ contractKey: SOURCE.contractKey, semanticDigest: SOURCE.semanticDigest }],
      establishedFacts: [],
      evidence: [
        { ref: 'ev.a', content: 'a' },
        { ref: 'ev.b', content: 'b' },
        { ref: 'ev.c', content: 'c' },
        { ref: 'ev.d', content: 'd' },
      ],
      passCondition: 'exact semantics are complete',
      failCondition: 'any authoritative field name is under-specified',
      failEvidenceRefs: ['ev.b'],
      allowedScope: ['semantics only'],
      outOfScope: ['edits'],
      evidenceBudget: { maxItems: 3, maxBytes: 8192, onOverflow: 'TRUNCATE_SUMMARIZE' },
      contractCheck: { amendmentsOnly: true, expectedVerdicts: ['SUFFICIENTLY_SPECIFIED', 'AMENDMENTS_REQUIRED'] },
    },
    { compiledAt: NOW, sources: SOURCES },
  );
  const refs = ask.evidence.map((e) => e.ref);
  // ev.b is protected: kept; non-referenced tail items were truncated with
  // the marker appended last
  assert.ok(refs.includes('ev.b'), 'referenced evidence must be retained');
  assert.equal(refs[refs.length - 1], TRUNCATION_MARKER_REF);
  assert.ok(refs.indexOf('ev.b') < refs.length - 1);
  assert.equal(validateSolAsk(ask, { sources: SOURCES }).valid, true);
});

test('A2: if referenced evidence cannot fit, fail closed rather than truncate it', () => {
  assert.throws(
    () =>
      compileSolAsk(
        {
          callType: 'SOL_CONTRACT_CHECK',
          singleDecisionQuestion: 'Is the exact field-name casing of the approval decision contract sufficiently specified?',
          whyNeeded: 'protected evidence fail-closed regression',
          contractRefs: [{ contractKey: SOURCE.contractKey, semanticDigest: SOURCE.semanticDigest }],
          establishedFacts: [],
          evidence: [
            { ref: 'ev.a', content: 'a' },
            { ref: 'ev.b', content: 'b' },
            { ref: 'ev.c', content: 'c' },
          ],
          passCondition: 'exact semantics are complete',
          failCondition: 'any authoritative field name is under-specified',
          failEvidenceRefs: ['ev.b'],
          allowedScope: ['semantics only'],
          outOfScope: ['edits'],
          evidenceBudget: { maxItems: 2, maxBytes: 8192, onOverflow: 'TRUNCATE_SUMMARIZE' },
          contractCheck: { amendmentsOnly: true, expectedVerdicts: ['SUFFICIENTLY_SPECIFIED', 'AMENDMENTS_REQUIRED'] },
        },
        { compiledAt: NOW, sources: SOURCES },
      ),
    (err) => err instanceof SolAskError && err.code === 'BUDGET_EXHAUSTED',
  );
});

test('B: DIAGNOSE failure citing the truncation marker => reject', () => {
  const { ask } = buildDiagnoseAsk();
  const response = compileSolResponse(
    {
      askId: ask.askId,
      callType: 'SOL_DIAGNOSE',
      verdict: 'CAUSE_IDENTIFIED',
      decisionSummary: 'root cause identified',
      evidence: [{ ref: 'ev.counter.provider_factory', content: 'counter reported 1' }],
      failure: {
        rootCause: 'preamble construction',
        evidenceRefs: ['ev.counter.provider_factory'],
        falsification: 'f',
        repair: {
          mustChange: [{ target: 'provider_factory', change: 'move construction' }],
          mustNotChange: [{ target: 'authorization store', reason: 'authoritative' }],
          exactTests: [
            { name: 't', expectation: PROVIDER_FACTORY_REQUIREMENT, acceptanceCriterionRef: providerFactoryEffectId(SOURCE) },
          ],
          verification: [{ method: 'm', expectation: 'e' }],
        },
      },
    },
    { compiledAt: NOW, ask, sources: SOURCES },
  );
  // a hand-tampered doc citing the marker fails closed (the marker is not
  // substantive evidence and never satisfies an evidence reference)
  const tampered = {
    ...response,
    failure: { ...response.failure, evidenceRefs: [TRUNCATION_MARKER_REF] },
  };
  const result = validateSolResponse(tampered, { ask, sources: SOURCES });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === 'EVIDENCE_REF_MARKER'));
});

test('C: FINAL_REVIEW finding citing the truncation marker => reject', () => {
  const prior = buildPriorFinalReview();
  const ask = prior.ask;
  const response = prior.response;
  const tampered = {
    ...response,
    findings: [
      {
        ...response.findings[0],
        evidenceRefs: [TRUNCATION_MARKER_REF],
      },
    ],
  };
  const result = validateSolResponse(tampered, { ask, sources: SOURCES });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === 'EVIDENCE_REF_MARKER'));
});

test('D: every accepted condition/finding/failure evidence ref resolves to retained NON-MARKER evidence', () => {
  // positive path: DIAGNOSE failure refs resolve to the retained pool
  const { ask } = buildDiagnoseAsk();
  const response = compileSolResponse(
    {
      askId: ask.askId,
      callType: 'SOL_DIAGNOSE',
      verdict: 'CAUSE_IDENTIFIED',
      decisionSummary: 'root cause identified',
      evidence: [{ ref: 'ev.counter.provider_factory', content: 'counter reported 1' }],
      failure: {
        rootCause: 'preamble construction',
        evidenceRefs: ['ev.counter.provider_factory'],
        falsification: 'f',
        repair: {
          mustChange: [{ target: 'provider_factory', change: 'move construction' }],
          mustNotChange: [{ target: 'authorization store', reason: 'authoritative' }],
          exactTests: [
            { name: 't', expectation: PROVIDER_FACTORY_REQUIREMENT, acceptanceCriterionRef: providerFactoryEffectId(SOURCE) },
          ],
          verification: [{ method: 'm', expectation: 'e' }],
        },
      },
    },
    { compiledAt: NOW, ask, sources: SOURCES },
  );
  assert.equal(validateSolResponse(response, { ask, sources: SOURCES }).valid, true);

  // ask-side: a passEvidenceRef that does not resolve fails closed
  assert.throws(
    () =>
      buildDiagnoseAsk({
        passEvidenceRefs: ['ev.ref.that.does.not.exist'],
      }),
    (err) => err instanceof SolAskError && hasCode(err, 'EVIDENCE_REF_UNRESOLVED'),
  );
});

test('RECHECK prior/delta refs are protected from truncation too', () => {
  const prior = buildPriorFinalReview();
  const ask = compileSolAsk(
    {
      callType: 'SOL_RECHECK',
      singleDecisionQuestion: 'Is the prior provider_factory finding resolved by the delta evidence?',
      whyNeeded: 'delta protection regression',
      contractRefs: [
        {
          contractKey: SOURCE.contractKey,
          semanticDigest: SOURCE.semanticDigest,
          requirementRefs: [providerFactoryEffectId(SOURCE), networkEffectId(SOURCE)],
        },
      ],
      establishedFacts: [],
      evidence: [],
      passCondition: 'delta evidence closes the prior finding',
      failCondition: 'the prior finding still fails on the delta evidence',
      allowedScope: ['prior finding and neighbors only'],
      outOfScope: ['reopening the task'],
      evidenceBudget: { maxItems: 4, maxBytes: 8192, onOverflow: 'TRUNCATE_SUMMARIZE' },
      recheck: {
        priorFindingRef: PRIOR_FINDING_ID,
        deltaEvidence: [
          { ref: 'ev.delta', content: 'counter reports 0 before the gate' },
          { ref: 'ev.delta2', content: 'second delta observation' },
          { ref: 'ev.delta3', content: 'third delta observation' },
        ],
        neighboringInvariants: [networkEffectId(SOURCE)],
        mustNotReopen: true,
      },
    },
    { compiledAt: NOW, sources: SOURCES, prior },
  );
  // ALL delta evidence is decision evidence: with a 3-item budget plus the
  // marker, truncation would have to drop protected delta items => the
  // compiler keeps everything (budget fits) and never truncates referenced
  // decision evidence.
  assert.equal(ask.evidence.length, 3);
  assert.equal(validateSolAsk(ask, { sources: SOURCES, prior }).valid, true);
});

// ============================================================================
// R2 — SOL-S06-004: CONDITION EVIDENCE DEPENDENCIES ARE STRUCTURED AND CLOSED
// ============================================================================

const TRUNCATE_3 = { maxItems: 3, maxBytes: 8192, onOverflow: 'TRUNCATE_SUMMARIZE' };

function conditionAsk(overrides = {}) {
  return {
    callType: 'SOL_CONTRACT_CHECK',
    singleDecisionQuestion: 'Is the exact field-name casing of the approval decision contract sufficiently specified?',
    whyNeeded: 'condition dependency closure regression',
    contractRefs: [{ contractKey: SOURCE.contractKey, semanticDigest: SOURCE.semanticDigest }],
    establishedFacts: [],
    evidence: [
      { ref: 'ev.a', content: 'a' },
      { ref: 'ev.b', content: 'b' },
      { ref: 'ev.c', content: 'c' },
    ],
    passCondition: 'exact semantics are complete and unambiguous',
    failCondition: 'Fail when ev.b demonstrates ambiguity',
    allowedScope: ['semantics only'],
    outOfScope: ['edits'],
    evidenceBudget: TRUNCATE_3,
    contractCheck: { amendmentsOnly: true, expectedVerdicts: ['SUFFICIENTLY_SPECIFIED', 'AMENDMENTS_REQUIRED'] },
    ...overrides,
  };
}

test('R2-A: condition prose naming ev.b without failEvidenceRefs => reject (original bypass)', () => {
  assert.throws(
    () => compileSolAsk(conditionAsk(), { compiledAt: NOW, sources: SOURCES }),
    (err) => err instanceof SolAskError && hasCode(err, 'CONDITION_EVIDENCE_REF_UNDECLARED'),
  );
});

test('R2-B: same condition with failEvidenceRefs ["ev.b"] => ev.b protected and retained', () => {
  const ask = compileSolAsk(
    conditionAsk({
      evidence: [
        { ref: 'ev.a', content: 'a' },
        { ref: 'ev.b', content: 'b' },
        { ref: 'ev.c', content: 'c' },
        { ref: 'ev.d', content: 'd' },
      ],
      failEvidenceRefs: ['ev.b'],
    }),
    { compiledAt: NOW, sources: SOURCES },
  );
  const refs = ask.evidence.map((e) => e.ref);
  assert.ok(refs.includes('ev.b'), 'declared condition evidence must be retained');
  assert.equal(refs[refs.length - 1], TRUNCATION_MARKER_REF, 'non-referenced tail truncated with marker last');
  assert.ok(refs.indexOf('ev.b') < refs.length - 1);
  assert.equal(validateSolAsk(ask, { sources: SOURCES }).valid, true);
});

test('R2-C: failEvidenceRefs ["ev.b"] with a budget that cannot fit ev.b => BUDGET_EXHAUSTED', () => {
  assert.throws(
    () =>
      compileSolAsk(
        conditionAsk({
          failEvidenceRefs: ['ev.b'],
          evidenceBudget: { maxItems: 2, maxBytes: 8192, onOverflow: 'TRUNCATE_SUMMARIZE' },
        }),
        { compiledAt: NOW, sources: SOURCES },
      ),
    (err) => err instanceof SolAskError && err.code === 'BUDGET_EXHAUSTED',
  );
});

test('R2-D: condition with no evidence-ref token and no condition refs => still valid', () => {
  const ask = compileSolAsk(
    conditionAsk({
      failCondition: 'any authoritative field name/casing is under-specified',
    }),
    { compiledAt: NOW, sources: SOURCES },
  );
  assert.equal(ask.failEvidenceRefs, undefined);
  assert.equal(validateSolAsk(ask, { sources: SOURCES }).valid, true);
});

test('R2-E: marker ID appearing in condition dependency refs => reject', () => {
  assert.throws(
    () =>
      compileSolAsk(
        conditionAsk({ failEvidenceRefs: [TRUNCATION_MARKER_REF] }),
        { compiledAt: NOW, sources: SOURCES },
      ),
    (err) => err instanceof SolAskError && hasCode(err, 'EVIDENCE_REF_MARKER'),
  );
});

test('R2-F: condition referring to ev.unknown => reject', () => {
  // token not declared
  assert.throws(
    () =>
      compileSolAsk(
        conditionAsk({ failCondition: 'Fail when ev.unknown demonstrates ambiguity' }),
        { compiledAt: NOW, sources: SOURCES },
      ),
    (err) => err instanceof SolAskError && hasCode(err, 'CONDITION_EVIDENCE_REF_UNDECLARED'),
  );
  // declared but unresolvable
  assert.throws(
    () =>
      compileSolAsk(
        conditionAsk({
          failCondition: 'Fail when ev.unknown demonstrates ambiguity',
          failEvidenceRefs: ['ev.unknown'],
        }),
        { compiledAt: NOW, sources: SOURCES },
      ),
    (err) => err instanceof SolAskError && hasCode(err, 'EVIDENCE_REF_UNRESOLVED'),
  );
});

// ============================================================================
// R3 — SOL-S06-004: RESERVED TRUNCATION MARKER IN CONDITION PROSE
// ============================================================================

test('R3-A: failCondition referencing lcim.budget.truncation-marker => reject (EVIDENCE_REF_MARKER)', () => {
  assert.throws(
    () =>
      compileSolAsk(
        conditionAsk({
          failCondition: 'Fail when lcim.budget.truncation-marker is present',
          evidenceBudget: { maxItems: 16, maxBytes: 8192, onOverflow: 'TRUNCATE_SUMMARIZE' },
        }),
        { compiledAt: NOW, sources: SOURCES },
      ),
    (err) => err instanceof SolAskError && hasCode(err, 'EVIDENCE_REF_MARKER'),
  );
});

test('R3-B: passCondition referencing the marker => reject (EVIDENCE_REF_MARKER)', () => {
  assert.throws(
    () =>
      compileSolAsk(
        conditionAsk({
          passCondition: 'Pass when lcim.budget.truncation-marker is absent',
          evidenceBudget: { maxItems: 16, maxBytes: 8192, onOverflow: 'TRUNCATE_SUMMARIZE' },
        }),
        { compiledAt: NOW, sources: SOURCES },
      ),
    (err) => err instanceof SolAskError && hasCode(err, 'EVIDENCE_REF_MARKER'),
  );
});

test('R3-C: marker in structured passEvidenceRefs/failEvidenceRefs => still reject', () => {
  assert.throws(
    () =>
      compileSolAsk(
        conditionAsk({
          failCondition: 'Fail when the evidence pool is truncated',
          failEvidenceRefs: [TRUNCATION_MARKER_REF],
        }),
        { compiledAt: NOW, sources: SOURCES },
      ),
    (err) => err instanceof SolAskError && hasCode(err, 'EVIDENCE_REF_MARKER'),
  );
  assert.throws(
    () =>
      compileSolAsk(
        conditionAsk({
          passCondition: 'Pass when the evidence pool is complete',
          passEvidenceRefs: [TRUNCATION_MARKER_REF],
        }),
        { compiledAt: NOW, sources: SOURCES },
      ),
    (err) => err instanceof SolAskError && hasCode(err, 'EVIDENCE_REF_MARKER'),
  );
});

test('R3-D: ordinary condition mentioning declared ev.b => still passes when declared and retained', () => {
  const ask = compileSolAsk(
    conditionAsk({
      evidence: [
        { ref: 'ev.a', content: 'a' },
        { ref: 'ev.b', content: 'b' },
        { ref: 'ev.c', content: 'c' },
        { ref: 'ev.d', content: 'd' },
      ],
      failCondition: 'Fail when ev.b demonstrates ambiguity',
      failEvidenceRefs: ['ev.b'],
    }),
    { compiledAt: NOW, sources: SOURCES },
  );
  const refs = ask.evidence.map((e) => e.ref);
  assert.ok(refs.includes('ev.b'), 'declared condition evidence must be retained');
  assert.equal(validateSolAsk(ask, { sources: SOURCES }).valid, true);
});

test('R3-E: prose using the word "truncation" but NOT the reserved marker ID => not falsely rejected', () => {
  const ask = compileSolAsk(
    conditionAsk({
      failCondition: 'Fail when truncation would omit decision-relevant evidence',
    }),
    { compiledAt: NOW, sources: SOURCES },
  );
  assert.equal(ask.failCondition, 'Fail when truncation would omit decision-relevant evidence');
  assert.equal(validateSolAsk(ask, { sources: SOURCES }).valid, true);
});
