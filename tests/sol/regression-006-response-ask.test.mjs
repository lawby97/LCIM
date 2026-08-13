/**
 * SOL-S06-006 regression: RESPONSE COMPILATION MUST REQUIRE THE ACTUAL ASK.
 *
 * compileSolResponse() must require the actual compiled ask document:
 * bind exact askId + callType, apply the exact verdict vocabulary and
 * call-specific block rules, resolve every finding/evidence/invariant/ref
 * against that ask, and reject any response for the wrong/missing ask.
 * Schema-only validation stays a separate lower-level path for fixtures.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSolResponse } from '../../src/sol/ask-compiler/response.mjs';
import { compileSolAsk } from '../../src/sol/ask-compiler/compiler.mjs';
import { SolResponseError } from '../../src/sol/contracts/errors.mjs';
import { validateSolResponse } from '../../src/sol/contracts/validate.mjs';
import {
  compileProviderContract,
  buildPriorFinalReview,
  providerFactoryEffectId,
  NOW,
} from './helpers.mjs';

const SOURCE = compileProviderContract();
const SOURCES = [SOURCE];
const PRIOR = buildPriorFinalReview();
const FINAL_REVIEW_ASK = PRIOR.ask;

function responseInput(ask, overrides = {}) {
  return {
    askId: ask.askId,
    callType: ask.callType,
    verdict: 'PASS',
    decisionSummary: 'all invariants held',
    evidence: [{ ref: 'ev.candidate.tests', content: 'negative side-effect tests ran' }],
    ...overrides,
  };
}

function hasCode(err, code) {
  return err?.code === code || (err?.details?.errors ?? []).some((e) => e.code === code);
}

test('A: compileSolResponse without the ask fails', () => {
  assert.throws(
    () => compileSolResponse(responseInput(FINAL_REVIEW_ASK), { compiledAt: NOW }),
    (err) => err instanceof SolResponseError && err.code === 'ASK_REQUIRED',
  );
});

test('B: wrong ask fails (pattern-valid askId is not the ask)', () => {
  const other = compileSolAsk(
    {
      callType: 'SOL_FINAL_REVIEW',
      singleDecisionQuestion: 'Do the named high-risk invariants of the provider authorization flow hold on the candidate?',
      whyNeeded: 'another ask',
      contractRefs: [
        {
          contractKey: SOURCE.contractKey,
          semanticDigest: SOURCE.semanticDigest,
          requirementRefs: [providerFactoryEffectId(SOURCE)],
        },
      ],
      establishedFacts: [],
      evidence: [{ ref: 'ev.candidate.tests', content: 'x', decisionCritical: true }],
      passCondition: 'every named invariant holds',
      failCondition: 'any named invariant fails',
      allowedScope: ['checklist only'],
      outOfScope: ['edits'],
      finalReview: {
        invariantChecklist: [
          {
            invariantId: 'inv.provider_factory_zero',
            invariant: 'provider factory construction stays zero before an authorization failure is handled',
            lockedRequirementRef: providerFactoryEffectId(SOURCE),
          },
        ],
        maxAdjacentCriticalDefects: 1,
      },
    },
    { compiledAt: NOW, sources: SOURCES },
  );
  assert.throws(
    () => compileSolResponse({ ...responseInput(FINAL_REVIEW_ASK), askId: other.askId }, {
      compiledAt: NOW,
      ask: FINAL_REVIEW_ASK,
    }),
    (err) => err instanceof SolResponseError && err.code === 'ASK_ID_MISMATCH',
  );
});

test('C: wrong call type fails', () => {
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(FINAL_REVIEW_ASK, { callType: 'SOL_DIAGNOSE', verdict: 'CAUSE_IDENTIFIED' }),
        { compiledAt: NOW, ask: FINAL_REVIEW_ASK },
      ),
    (err) => err instanceof SolResponseError && err.code === 'CALL_TYPE_MISMATCH',
  );
});

test('D: FINAL_REVIEW finding with an unknown evidence ref fails', () => {
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(FINAL_REVIEW_ASK, {
          verdict: 'FAIL',
          decisionSummary: 'invariant failed',
          findings: [
            {
              findingId: 'lcim_finding_' + 'a'.repeat(32),
              severity: 'CRITICAL',
              invariantRef: 'inv.provider_factory_zero',
              summary: 'provider factory count was 1 before the gate',
              evidenceRefs: ['ev.ref.that.does.not.exist'],
            },
          ],
        }),
        { compiledAt: NOW, ask: FINAL_REVIEW_ASK, sources: SOURCES },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'FINDING_EVIDENCE_UNRESOLVED'),
  );
});

test('E: cross-call-type block fails', () => {
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(FINAL_REVIEW_ASK, {
          failure: {
            rootCause: 'x',
            evidenceRefs: ['ev.candidate.tests'],
            falsification: 'f',
            repair: {
              mustChange: [{ target: 'provider_factory', change: 'c' }],
              mustNotChange: [{ target: 't', reason: 'r' }],
              exactTests: [{ name: 'n', expectation: 'e' }],
              verification: [{ method: 'm', expectation: 'e' }],
            },
          },
        }),
        { compiledAt: NOW, ask: FINAL_REVIEW_ASK },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'TYPE_BLOCK_MISMATCH'),
  );
});

test('F: a correctly bound response passes', () => {
  const response = compileSolResponse(
    responseInput(FINAL_REVIEW_ASK),
    { compiledAt: NOW, ask: FINAL_REVIEW_ASK, sources: SOURCES },
  );
  assert.equal(response.askId, FINAL_REVIEW_ASK.askId);
  assert.equal(response.callType, 'SOL_FINAL_REVIEW');
  assert.equal(validateSolResponse(response, { ask: FINAL_REVIEW_ASK, sources: SOURCES }).valid, true);
});
