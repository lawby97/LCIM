/**
 * SOL-S06-008 regression: RECHECK MUST BIND THE EXACT PRIOR FINDING AND
 * ONLY DELTA SCOPE.
 *
 * A compiled RECHECK carries trusted provenance: the controller supplies
 * the validated prior compiled ask + prior compiled response; the
 * priorFindingRef resolves to an actual finding of that bound response;
 * the exact prior finding content is frozen (priorFindingDigest); the
 * prior response binds to its prior ask. Neighboring invariants resolve
 * to a closed authoritative set (prior FINAL_REVIEW invariant ids and/or
 * declared bound source requirement ids). RECHECK evidence is delta-only:
 * the SOL-visible evidence universe is exactly the retained delta
 * evidence; RECHECK responses may cite only prior finding / bound
 * neighbors / retained delta evidence. (S10 orchestration is NOT
 * implemented — this is the S06 data/validation contract only.)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSolAsk } from '../../src/sol/ask-compiler/compiler.mjs';
import { compileSolResponse } from '../../src/sol/ask-compiler/response.mjs';
import { SolAskError, SolResponseError } from '../../src/sol/contracts/errors.mjs';
import { TRUNCATION_MARKER_REF } from '../../src/sol/contracts/evidence.mjs';
import {
  compileProviderContract,
  buildPriorFinalReview,
  providerFactoryEffectId,
  networkEffectId,
  PRIOR_FINDING_ID,
  NOW,
} from './helpers.mjs';

const SOURCE = compileProviderContract();
const SOURCES = [SOURCE];

function recheckInput(overrides = {}) {
  return {
    callType: 'SOL_RECHECK',
    singleDecisionQuestion: 'Is the prior provider_factory finding resolved by the delta evidence?',
    whyNeeded: 'recheck provenance regression',
    contractRefs: [
      {
        contractKey: SOURCE.contractKey,
        semanticDigest: SOURCE.semanticDigest,
        requirementRefs: [providerFactoryEffectId(SOURCE), networkEffectId(SOURCE)],
      },
    ],
    establishedFacts: [],
    evidence: [],
    passCondition: 'the delta evidence closes the prior finding',
    failCondition: 'the prior finding (or a named neighbor) still fails on the delta evidence',
    allowedScope: ['the prior finding and its named neighboring invariants only'],
    outOfScope: ['reopening the entire task', 'new findings', 'code edits'],
    recheck: {
      priorFindingRef: PRIOR_FINDING_ID,
      deltaEvidence: [{ ref: 'ev.delta', content: 'delta run reports provider_factory count 0 before the gate' }],
      neighboringInvariants: [networkEffectId(SOURCE)],
      mustNotReopen: true,
    },
    ...overrides,
  };
}

function hasCode(err, code) {
  return err?.code === code || (err?.details?.errors ?? []).some((e) => e.code === code);
}

test('A: invented priorFindingRef => reject', () => {
  const prior = buildPriorFinalReview({ findingId: 'lcim_finding_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' });
  assert.throws(
    () => compileSolAsk(recheckInput(), { compiledAt: NOW, sources: SOURCES, prior }),
    (err) => err instanceof SolAskError && hasCode(err, 'PRIOR_FINDING_UNKNOWN'),
  );
});

test('B: swapped finding from another prior response => reject', () => {
  const prior = buildPriorFinalReview({ findingId: 'lcim_finding_cccccccccccccccccccccccccccccccc' });
  // the input demands PRIOR_FINDING_ID but the prior response carries a
  // different finding => the ref cannot resolve to an actual finding
  assert.throws(
    () => compileSolAsk(recheckInput(), { compiledAt: NOW, sources: SOURCES, prior }),
    (err) => err instanceof SolAskError && hasCode(err, 'PRIOR_FINDING_UNKNOWN'),
  );
});

test('C: prior response not bound to prior ask => reject', () => {
  const prior = buildPriorFinalReview();
  const unbound = {
    ...prior.response,
    askId: 'lcim_sol_ask_' + 'f'.repeat(32),
  };
  assert.throws(
    () => compileSolAsk(recheckInput(), { compiledAt: NOW, sources: SOURCES, prior: { ask: prior.ask, response: unbound } }),
    (err) => err instanceof SolAskError && hasCode(err, 'PRIOR_CHAIN_INVALID'),
  );
});

test('D: arbitrary neighbor => reject', () => {
  const prior = buildPriorFinalReview();
  assert.throws(
    () =>
      compileSolAsk(
        recheckInput({ recheck: { ...recheckInput().recheck, neighboringInvariants: ['inv.some_arbitrary_string'] } }),
        { compiledAt: NOW, sources: SOURCES, prior },
      ),
    (err) => err instanceof SolAskError && hasCode(err, 'NEIGHBOR_UNBOUND'),
  );
});

test('E: unrelated top-level/full-task evidence => rejected (delta-only universe)', () => {
  const prior = buildPriorFinalReview();
  assert.throws(
    () =>
      compileSolAsk(
        recheckInput({
          evidence: [{ ref: 'ev.full.task', content: 'unrelated full-task evidence' }],
        }),
        { compiledAt: NOW, sources: SOURCES, prior },
      ),
    (err) => err instanceof SolAskError && hasCode(err, 'RECHECK_NONDELTA_EVIDENCE'),
  );
});

test('E2: the compiled RECHECK evidence universe is exactly the retained delta evidence', () => {
  const prior = buildPriorFinalReview();
  const ask = compileSolAsk(recheckInput(), { compiledAt: NOW, sources: SOURCES, prior });
  assert.deepEqual(ask.evidence.map((e) => e.ref), ['ev.delta']);
  assert.deepEqual(ask.recheck.deltaEvidenceRefs, ['ev.delta']);
});

test('F: response finding supported by non-delta evidence => reject', () => {
  const prior = buildPriorFinalReview();
  const ask = compileSolAsk(recheckInput(), { compiledAt: NOW, sources: SOURCES, prior });
  assert.throws(
    () =>
      compileSolResponse(
        {
          askId: ask.askId,
          callType: 'SOL_RECHECK',
          verdict: 'NOT_RESOLVED',
          decisionSummary: 'prior finding still fails',
          evidence: [{ ref: 'ev.delta', content: 'delta run reports count 1' }],
          findings: [
            {
              findingId: 'lcim_finding_' + 'a'.repeat(32),
              severity: 'CRITICAL',
              invariantRef: PRIOR_FINDING_ID,
              summary: 'prior finding still fails',
              evidenceRefs: ['ev.nondelta'],
            },
          ],
        },
        { compiledAt: NOW, ask, sources: SOURCES },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'RECHECK_EVIDENCE_UNRESOLVED'),
  );
});

test('G: legitimate exact prior finding + bound neighbor + delta evidence => pass', () => {
  const prior = buildPriorFinalReview();
  const ask = compileSolAsk(recheckInput(), { compiledAt: NOW, sources: SOURCES, prior });
  // frozen provenance
  assert.equal(ask.recheck.priorFindingRef, PRIOR_FINDING_ID);
  assert.equal(ask.recheck.priorAskId, prior.ask.askId);
  assert.equal(ask.recheck.priorResponseId, prior.response.responseId);
  assert.match(ask.recheck.priorFindingDigest, /^[0-9a-f]{64}$/);
  // neighbors resolve to declared bound source requirement IDs
  const ask2 = compileSolAsk(
    recheckInput({ recheck: { ...recheckInput().recheck, neighboringInvariants: [providerFactoryEffectId(SOURCE), networkEffectId(SOURCE)] } }),
    { compiledAt: NOW, sources: SOURCES, prior },
  );
  assert.deepEqual(ask2.recheck.neighboringInvariants, [providerFactoryEffectId(SOURCE), networkEffectId(SOURCE)]);

  const resolved = compileSolResponse(
    {
      askId: ask.askId,
      callType: 'SOL_RECHECK',
      verdict: 'RESOLVED',
      decisionSummary: 'the prior finding is closed by the delta evidence',
      evidence: [],
    },
    { compiledAt: NOW, ask, sources: SOURCES },
  );
  assert.equal(resolved.verdict, 'RESOLVED');

  const notResolved = compileSolResponse(
    {
      askId: ask.askId,
      callType: 'SOL_RECHECK',
      verdict: 'NOT_RESOLVED',
      decisionSummary: 'the prior finding still fails on the delta evidence',
      evidence: [],
      findings: [
        {
          findingId: 'lcim_finding_' + 'b'.repeat(32),
          severity: 'CRITICAL',
          invariantRef: PRIOR_FINDING_ID,
          summary: 'prior provider_factory finding still fails on delta evidence',
          evidenceRefs: ['ev.delta'],
        },
      ],
    },
    { compiledAt: NOW, ask, sources: SOURCES },
  );
  assert.equal(notResolved.findings[0].invariantRef, PRIOR_FINDING_ID);
});

// ============================================================================
// R2 — SOL-S06-008: RECHECK RESPONSE EVIDENCE CANNOT ESCAPE / MUTATE DELTA
// ============================================================================

function deltaAsk() {
  const prior = buildPriorFinalReview();
  const ask = compileSolAsk(recheckInput(), { compiledAt: NOW, sources: SOURCES, prior });
  return { prior, ask };
}

test('R2-A: RECHECK response introducing a new unrelated evidence ref => reject', () => {
  const { ask } = deltaAsk();
  assert.throws(
    () =>
      compileSolResponse(
        {
          askId: ask.askId,
          callType: 'SOL_RECHECK',
          verdict: 'RESOLVED',
          decisionSummary: 'prior finding closed',
          evidence: [{ ref: 'ev.full-task', content: 'unrelated full-task evidence' }],
        },
        { compiledAt: NOW, ask, sources: SOURCES },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'RECHECK_RESPONSE_EVIDENCE_FORBIDDEN'),
  );
});

test('R2-B: response reuses ev.delta with CHANGED content => reject', () => {
  const { ask } = deltaAsk();
  assert.throws(
    () =>
      compileSolResponse(
        {
          askId: ask.askId,
          callType: 'SOL_RECHECK',
          verdict: 'NOT_RESOLVED',
          decisionSummary: 'prior finding still fails',
          evidence: [{ ref: 'ev.delta', content: 'delta run reports provider_factory count is one' }],
          findings: [
            {
              findingId: 'lcim_finding_' + 'a'.repeat(32),
              severity: 'CRITICAL',
              invariantRef: PRIOR_FINDING_ID,
              summary: 'prior finding still fails',
              evidenceRefs: ['ev.delta'],
            },
          ],
        },
        { compiledAt: NOW, ask, sources: SOURCES },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'RECHECK_RESPONSE_EVIDENCE_FORBIDDEN'),
  );
});

test('R2-C: response reuses same ref/content but changes another authority-bearing evidence field => reject', () => {
  const { ask } = deltaAsk();
  assert.throws(
    () =>
      compileSolResponse(
        {
          askId: ask.askId,
          callType: 'SOL_RECHECK',
          verdict: 'RESOLVED',
          decisionSummary: 'prior finding closed',
          evidence: [
            { ref: 'ev.delta', content: 'delta run reports provider_factory count 0 before the gate', kind: 'log_summary' },
          ],
        },
        { compiledAt: NOW, ask, sources: SOURCES },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'RECHECK_RESPONSE_EVIDENCE_FORBIDDEN'),
  );
});

test('R2-D: finding references retained ask delta evidence directly => pass', () => {
  const { ask } = deltaAsk();
  const response = compileSolResponse(
    {
      askId: ask.askId,
      callType: 'SOL_RECHECK',
      verdict: 'NOT_RESOLVED',
      decisionSummary: 'prior finding still fails on the delta evidence',
      evidence: [],
      findings: [
        {
          findingId: 'lcim_finding_' + 'b'.repeat(32),
          severity: 'CRITICAL',
          invariantRef: PRIOR_FINDING_ID,
          summary: 'prior provider_factory finding still fails on delta evidence',
          evidenceRefs: ['ev.delta'],
        },
      ],
    },
    { compiledAt: NOW, ask, sources: SOURCES },
  );
  assert.deepEqual(response.findings[0].evidenceRefs, ['ev.delta']);
  assert.deepEqual(response.evidence, []);
});

test('R2-E: RESOLVED response with unrelated response evidence => reject even without findings', () => {
  const { ask } = deltaAsk();
  assert.throws(
    () =>
      compileSolResponse(
        {
          askId: ask.askId,
          callType: 'SOL_RECHECK',
          verdict: 'RESOLVED',
          decisionSummary: 'prior finding closed',
          evidence: [{ ref: 'ev.unrelated', content: 'unrelated observation' }],
        },
        { compiledAt: NOW, ask, sources: SOURCES },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'RECHECK_RESPONSE_EVIDENCE_FORBIDDEN'),
  );
});

test('R2-F: NOT_RESOLVED response whose finding cites only exact retained delta evidence => pass', () => {
  const { ask } = deltaAsk();
  const response = compileSolResponse(
    {
      askId: ask.askId,
      callType: 'SOL_RECHECK',
      verdict: 'NOT_RESOLVED',
      decisionSummary: 'prior finding still fails on the delta evidence',
      evidence: [],
      findings: [
        {
          findingId: 'lcim_finding_' + 'c'.repeat(32),
          severity: 'CRITICAL',
          invariantRef: PRIOR_FINDING_ID,
          summary: 'prior finding still fails',
          evidenceRefs: ['ev.delta'],
        },
      ],
    },
    { compiledAt: NOW, ask, sources: SOURCES },
  );
  assert.equal(response.verdict, 'NOT_RESOLVED');
  assert.deepEqual(response.findings[0].evidenceRefs, ['ev.delta']);
});

test('R2-G: truncation marker remains non-citable in RECHECK findings', () => {
  const { ask } = deltaAsk();
  assert.throws(
    () =>
      compileSolResponse(
        {
          askId: ask.askId,
          callType: 'SOL_RECHECK',
          verdict: 'NOT_RESOLVED',
          decisionSummary: 'prior finding still fails',
          evidence: [],
          findings: [
            {
              findingId: 'lcim_finding_' + 'd'.repeat(32),
              severity: 'CRITICAL',
              invariantRef: PRIOR_FINDING_ID,
              summary: 'prior finding still fails',
              evidenceRefs: [TRUNCATION_MARKER_REF],
            },
          ],
        },
        { compiledAt: NOW, ask, sources: SOURCES },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'EVIDENCE_REF_MARKER'),
  );
});
