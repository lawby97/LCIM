/**
 * SOL-S06-009 regression: REPAIR CONVERSION MUST REVALIDATE AUTHORITY.
 *
 * compileRepairTicket() independently revalidates the complete chain
 * SOURCE -> COMPILED ASK -> COMPILED RESPONSE -> REPAIR CONVERSION and
 * fails closed before returning any repair artifact. SOL-authored prose
 * can never redefine authority-bearing acceptance semantics: the repair's
 * objective/violation/requiredBehavior are source-derived, criterion
 * exact-test expectations must equal the source requirement verbatim,
 * mustChange stays within the criterion scope and the ask's target bound,
 * mustNotChange is preserved, and negative side effects stay first-class.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { compileRepairTicket } from '../../src/sol/ask-compiler/repair-ticket.mjs';
import { compileSolResponse } from '../../src/sol/ask-compiler/response.mjs';
import { SolRepairTicketError } from '../../src/sol/contracts/errors.mjs';
import { compileSolAsk } from '../../src/sol/ask-compiler/compiler.mjs';
import { compileSemanticContract } from '../../src/contracts/compiler.mjs';
import { readFixture, rawInputFromFixture } from '../helpers/semantic-fixture.mjs';
import {
  readSolFixture,
  rawResponseFromFixture,
  compileProviderContract,
  buildDiagnoseAsk,
  providerFactoryEffectId,
  NOW,
} from './helpers.mjs';

const SOURCE = compileProviderContract();
const PROVIDER_FACTORY_REQUIREMENT =
  'provider factory invocations remain zero before an authorization failure is handled';

function causeIdentifiedResponse(ask, source = SOURCE, overrides = {}) {
  return compileSolResponse(
    {
      ...rawResponseFromFixture(readSolFixture('valid-response-diagnose-cause-identified.json')),
      askId: ask.askId,
      ...overrides,
    },
    { compiledAt: NOW, ask, sources: [source] },
  );
}

test('regression: previously reachable chain breaks now compile into NO ticket', () => {
  const { ask, source } = buildDiagnoseAsk();
  const base = causeIdentifiedResponse(ask, source);

  const noTicket = (response) =>
    assert.throws(
      () => compileRepairTicket({ ask, response, sources: [source] }),
      (err) => err instanceof SolRepairTicketError && err.code === 'TICKET_CHAIN_INVALID',
    );

  // same-scope duplicate/excess mustChange
  noTicket({
    ...base,
    failure: {
      ...base.failure,
      repair: {
        ...base.failure.repair,
        mustChange: [
          ...base.failure.repair.mustChange,
          { target: 'provider_factory', change: 'duplicate same-scope target' },
        ],
      },
    },
  });

  // empty/violated mustNotChange
  noTicket({
    ...base,
    failure: {
      ...base.failure,
      repair: { ...base.failure.repair, mustNotChange: [] },
    },
  });

  // requiredBehavior contradicting the source (SOL-authored authority prose
  // cannot exist in the response schema at all)
  noTicket({
    ...base,
    failure: {
      ...base.failure,
      repair: {
        ...base.failure.repair,
        requiredBehavior: 'rewrite the authorization flow to allow one provider construction',
      },
    },
  });

  // test expectations contradicting the source requirement
  noTicket({
    ...base,
    failure: {
      ...base.failure,
      repair: {
        ...base.failure.repair,
        exactTests: [
          {
            name: 't',
            expectation: 'provider factory invocations may reach 1 before authorization is handled',
            acceptanceCriterionRef: providerFactoryEffectId(source),
          },
        ],
      },
    },
  });
});

test('compliant DIAGNOSE response yields one bounded worker-ready Sprint-04 repair artifact with source-derived authority', () => {
  const { ask, source, response } = (() => {
    const { ask: a, source: s } = buildDiagnoseAsk();
    return { ask: a, source: s, response: causeIdentifiedResponse(a, s) };
  })();
  const { repairContract } = compileRepairTicket({ ask, response, sources: [source] });

  // authority-bearing acceptance semantics come from the source, not SOL
  assert.equal(repairContract.requiredBehavior, PROVIDER_FACTORY_REQUIREMENT);
  assert.ok(repairContract.objective.includes('restore acceptance criterion'));
  assert.ok(repairContract.violation.includes(PROVIDER_FACTORY_REQUIREMENT));
  // source acceptance semantics preserved: every negative side effect
  // carried exactly with its deterministic identity + own acceptance test
  assert.equal(repairContract.negativeSideEffects.length, source.negativeSideEffects.length);
  for (const s of source.negativeSideEffects) {
    const carried = repairContract.negativeSideEffects.find((c) => c.sideEffectId === s.sideEffectId);
    assert.ok(carried, `side effect ${s.sideEffectId} carried`);
    assert.equal(carried.gate, s.gate);
    assert.equal(carried.scope, s.scope);
    assert.equal(carried.requirement, s.requirement);
    assert.equal(carried.expectedCount, s.expectedCount);
    const test = repairContract.acceptanceTests.find((t) => t.negativeSideEffectId === s.sideEffectId);
    assert.ok(test, `side effect ${s.sideEffectId} has its own acceptance test`);
  }
  // frozen requirements preserved
  assert.ok(repairContract.frozenSemantics !== undefined);
  assert.deepEqual(repairContract.frozenSemantics.concepts, source.concepts);
  // bounded: mustChange inside the diagnosed criterion scope only
  assert.deepEqual(repairContract.mustChange.map((m) => m.target), ['provider_factory']);
  // SOL verification hints retained, SOL test prose excluded from authority
  assert.ok(repairContract.verification.length >= 1);
});

test('a response that was never checked against the real ask cannot convert', () => {
  const { ask, source } = buildDiagnoseAsk();
  const { ask: otherAsk } = buildDiagnoseAsk();
  const response = causeIdentifiedResponse(otherAsk, source);
  assert.throws(
    () => compileRepairTicket({ ask, response, sources: [source] }),
    (err) => err instanceof SolRepairTicketError && err.code === 'TICKET_ASK_RESPONSE_MISMATCH',
  );
});

// ============================================================================
// R2 — SOL-S06-009: REPAIR SOURCE SELECTION IS DERIVED FROM THE EXACT ASK
// BINDING, NEVER FROM SOURCE-ARRAY ORDER
// ============================================================================


/** A second authoritative source with identical side effects but a different content identity. */
function sourceVariant() {
  return compileSemanticContract(
    {
      ...rawInputFromFixture(readFixture('bl020-provider-construction-before-authz.json')),
      factsEstablished: [
        { fact: 'a variant established fact changes the content identity', evidence: 'R2 regression' },
      ],
    },
    { compiledAt: NOW },
  );
}

const SOURCE_B = sourceVariant();

/** DIAGNOSE ask bound to exactly ONE of the two colliding sources. */
function askBoundTo(boundSource, both = false) {
  const criterion = providerFactoryEffectId(boundSource);
  return compileSolAsk(
    {
      callType: 'SOL_DIAGNOSE',
      singleDecisionQuestion: 'Why does the provider_factory negative side-effect criterion fail before the authorization failure is handled?',
      whyNeeded: 'source selection regression',
      contractRefs: both
        ? [
            {
              contractKey: SOURCE.contractKey,
              semanticDigest: SOURCE.semanticDigest,
              requirementRefs: [criterion],
            },
            {
              contractKey: SOURCE_B.contractKey,
              semanticDigest: SOURCE_B.semanticDigest,
              requirementRefs: [criterion],
            },
          ]
        : [
            {
              contractKey: boundSource.contractKey,
              semanticDigest: boundSource.semanticDigest,
              requirementRefs: [criterion],
            },
          ],
      establishedFacts: [],
      evidence: [{ ref: 'ev.counter', content: 'counter reported 1', decisionCritical: true }],
      passCondition: 'root cause identified',
      failCondition: 'root cause not identifiable',
      allowedScope: ['the provider_factory criterion only'],
      outOfScope: ['edits'],
      diagnose: {
        acceptanceCriterionRef: criterion,
        criterionRequirement: boundSource.negativeSideEffects.find((s) => s.sideEffectId === criterion).requirement,
      },
    },
    { compiledAt: NOW, sources: both ? [SOURCE, SOURCE_B] : [boundSource] },
  );
}

function responseFor(ask) {
  return compileSolResponse(
    {
      askId: ask.askId,
      callType: 'SOL_DIAGNOSE',
      verdict: 'CAUSE_IDENTIFIED',
      decisionSummary: 'root cause identified',
      evidence: [{ ref: 'ev.counter', content: 'counter reported 1' }],
      failure: {
        rootCause: 'preamble construction',
        evidenceRefs: ['ev.counter'],
        falsification: 'f',
        repair: {
          mustChange: [{ target: 'provider_factory', change: 'move construction' }],
          mustNotChange: [{ target: 'authorization store', reason: 'authoritative' }],
          exactTests: [
            {
              name: 'provider_factory stays zero before authorization failure',
              expectation: ask.diagnose.criterionRequirement,
              acceptanceCriterionRef: ask.diagnose.acceptanceCriterionRef,
            },
          ],
          verification: [{ method: 'm', expectation: 'e' }],
        },
      },
    },
    { compiledAt: NOW, ask, sources: [SOURCE, SOURCE_B] },
  );
}

test('R2-A: ask binds only B; sources passed [A, B] => ticket source is B (never the first array match)', () => {
  assert.notEqual(SOURCE_B.semanticDigest, SOURCE.semanticDigest);
  const ask = askBoundTo(SOURCE_B);
  const response = responseFor(ask);
  const { ticket, repairContract } = compileRepairTicket({ ask, response, sources: [SOURCE, SOURCE_B] });
  assert.equal(ticket.sourceSemanticDigest, SOURCE_B.semanticDigest);
  assert.equal(repairContract.sourceSemanticDigest, SOURCE_B.semanticDigest);
  assert.equal(repairContract.contractKey, SOURCE_B.contractKey);
  // the repair contract's frozen semantics come from B, not from the
  // first array element A
  assert.deepEqual(repairContract.frozenSemantics.factsEstablished, SOURCE_B.factsEstablished);
});

test('R2-B: same inputs with sources passed [B, A] => identical ticket authority/identity', () => {
  const ask = askBoundTo(SOURCE_B);
  const response = responseFor(ask);
  const forward = compileRepairTicket({ ask, response, sources: [SOURCE, SOURCE_B] });
  const reversed = compileRepairTicket({ ask, response, sources: [SOURCE_B, SOURCE] });
  assert.equal(reversed.ticket.sourceSemanticDigest, SOURCE_B.semanticDigest);
  assert.deepEqual(reversed.ticket, forward.ticket);
  assert.deepEqual(reversed.repairContract, forward.repairContract);
});

test('R2-C: ask binds only A => A selected', () => {
  const ask = askBoundTo(SOURCE);
  const response = responseFor(ask);
  const { ticket, repairContract } = compileRepairTicket({ ask, response, sources: [SOURCE, SOURCE_B] });
  assert.equal(ticket.sourceSemanticDigest, SOURCE.semanticDigest);
  assert.equal(repairContract.sourceSemanticDigest, SOURCE.semanticDigest);
});

test('R2-D: no ask contractRef contains the criterion => no ticket / fail closed', () => {
  const ask = askBoundTo(SOURCE);
  const response = responseFor(ask);
  const unboundAsk = {
    ...ask,
    contractRefs: [
      { contractKey: SOURCE.contractKey, semanticDigest: SOURCE.semanticDigest, requirementRefs: [] },
    ],
  };
  assert.throws(
    () => compileRepairTicket({ ask: unboundAsk, response, sources: [SOURCE, SOURCE_B] }),
    (err) => err instanceof SolRepairTicketError && err.code === 'TICKET_CHAIN_INVALID',
  );
});

test('R2-E: two ask contractRefs both claiming the criterion => ambiguous => fail closed', () => {
  const ask = askBoundTo(SOURCE, true);
  const response = responseFor(ask);
  assert.throws(
    () => compileRepairTicket({ ask, response, sources: [SOURCE, SOURCE_B] }),
    (err) => err instanceof SolRepairTicketError && err.code === 'AMBIGUOUS_CRITERION_BINDING',
  );
});

test('R2-F: ask contractRef points to B digest but supplied B content/digest mismatches => fail closed', () => {
  const ask = askBoundTo(SOURCE_B);
  const response = responseFor(ask);
  const tamperedB = { ...SOURCE_B, semanticDigest: 'a'.repeat(64) };
  assert.throws(
    () => compileRepairTicket({ ask, response, sources: [SOURCE, tamperedB] }),
    (err) => err instanceof SolRepairTicketError && err.code === 'TICKET_CHAIN_INVALID',
  );
});

test('R2-G: selecting B vs A changes the content-bound conversion identity', () => {
  const askB = askBoundTo(SOURCE_B);
  const responseB = responseFor(askB);
  const ticketB = compileRepairTicket({ ask: askB, response: responseB, sources: [SOURCE, SOURCE_B] });
  const askA = askBoundTo(SOURCE);
  const responseA = responseFor(askA);
  const ticketA = compileRepairTicket({ ask: askA, response: responseA, sources: [SOURCE, SOURCE_B] });
  // A and B differ in factsEstablished, so their frozen semantics differ
  // and the source-bound identity must differ
  assert.notEqual(ticketB.ticket.conversionDigest, ticketA.ticket.conversionDigest);
  assert.notEqual(ticketB.ticket.repairId, ticketA.ticket.repairId);
});
