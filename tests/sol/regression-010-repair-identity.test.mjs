/**
 * SOL-S06-010 regression: REPAIR IDENTITY MUST BE CONTENT-BOUND.
 *
 * repairId is derived from the canonical authority-bearing conversion
 * payload (conversionDigest), which includes: sourceSemanticDigest, bound
 * ask identity/type/criterion, response content digest, derived
 * source-based acceptance semantics, normalized bounded repair content
 * (mustChange/mustNotChange/criterion-bound exact tests/verification),
 * and relevant finding refs. Timestamps/randomness never enter the
 * identity: identical conversions are idempotent; materially different
 * conversion payloads never share a repair identity.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { compileRepairTicket } from '../../src/sol/ask-compiler/repair-ticket.mjs';
import { compileSolResponse } from '../../src/sol/ask-compiler/response.mjs';
import { compileSolAsk } from '../../src/sol/ask-compiler/compiler.mjs';
import { compileSemanticContract } from '../../src/contracts/compiler.mjs';
import { SolRepairTicketError } from '../../src/sol/contracts/errors.mjs';
import {
  readSolFixture,
  rawResponseFromFixture,
  compileProviderContract,
  buildDiagnoseAsk,
  providerFactoryEffectId,
  NOW,
} from './helpers.mjs';
import { readFixture, rawInputFromFixture } from '../helpers/semantic-fixture.mjs';

const SOURCE = compileProviderContract();
function causeIdentifiedResponse(ask, source = SOURCE) {
  return compileSolResponse(
    {
      ...rawResponseFromFixture(readSolFixture('valid-response-diagnose-cause-identified.json')),
      askId: ask.askId,
    },
    { compiledAt: NOW, ask, sources: [source] },
  );
}

test('A: identical semantic conversion twice => identical repairId and conversionDigest', () => {
  const { ask, source } = buildDiagnoseAsk();
  const response = causeIdentifiedResponse(ask, source);
  const first = compileRepairTicket({ ask, response, sources: [source] });
  const second = compileRepairTicket({ ask, response, sources: [source] });
  assert.equal(first.ticket.repairId, second.ticket.repairId);
  assert.equal(first.ticket.conversionDigest, second.ticket.conversionDigest);
  assert.equal(first.repairContract.repairId, second.repairContract.repairId);
});

test('B: same askId/responseId but materially altered repair content => different content-bound repair id', () => {
  const { ask, source } = buildDiagnoseAsk();
  const response = causeIdentifiedResponse(ask, source);
  const original = compileRepairTicket({ ask, response, sources: [source] });

  const altered = {
    ...response,
    failure: {
      ...response.failure,
      repair: {
        ...response.failure.repair,
        mustChange: [
          { target: 'provider_factory', change: 'move construction after the authorization check and gate it' },
        ],
      },
    },
  };
  const alteredConversion = compileRepairTicket({ ask, response: altered, sources: [source] });
  assert.notEqual(original.ticket.repairId, alteredConversion.ticket.repairId);
  assert.notEqual(original.ticket.conversionDigest, alteredConversion.ticket.conversionDigest);
});

test('C: changed source semantic digest => different conversion identity / reject mismatch', () => {
  const { ask, response } = (() => {
    const { ask: a, source: s } = buildDiagnoseAsk();
    return { ask: a, source: s, response: causeIdentifiedResponse(a, s) };
  })();
  const original = compileRepairTicket({ ask, response, sources: [SOURCE] });

  const variant = compileSemanticContract(
    {
      ...rawInputFromFixture(readFixture('bl020-provider-construction-before-authz.json')),
      riskClass: 'FINANCIAL',
    },
    { compiledAt: NOW },
  );
  assert.equal(variant.compileStatus, 'COMPILED');
  assert.notEqual(variant.semanticDigest, SOURCE.semanticDigest);

  // a complete recompiled chain against the changed source has a different
  // content-bound identity
  const variantAsk = compileSolAskFor(variant);
  const variantResponse = causeIdentifiedResponse(variantAsk, variant);
  const variantConversion = compileRepairTicket({ ask: variantAsk, response: variantResponse, sources: [variant] });
  assert.notEqual(original.ticket.repairId, variantConversion.ticket.repairId);
  assert.notEqual(original.ticket.conversionDigest, variantConversion.ticket.conversionDigest);

  // mixing the original ask with the changed source is a chain mismatch => reject
  assert.throws(
    () => compileRepairTicket({ ask, response, sources: [variant] }),
    (err) => err instanceof SolRepairTicketError && err.code === 'TICKET_CHAIN_INVALID',
  );
});

test('D: changed mustChange => different conversion identity', () => {
  const { ask, source } = buildDiagnoseAsk();
  const response = causeIdentifiedResponse(ask, source);
  const original = compileRepairTicket({ ask, response, sources: [source] });
  const changed = {
    ...response,
    failure: {
      ...response.failure,
      repair: {
        ...response.failure.repair,
        mustChange: [
          { target: 'provider_factory', change: 'a different implementation-local change description' },
        ],
      },
    },
  };
  const changedConversion = compileRepairTicket({ ask, response: changed, sources: [source] });
  assert.notEqual(original.ticket.conversionDigest, changedConversion.ticket.conversionDigest);
  assert.notEqual(original.ticket.repairId, changedConversion.ticket.repairId);
});

test('E: changed authority-bearing source acceptance semantics => different conversion identity', () => {
  const { ask, source } = buildDiagnoseAsk();
  const response = causeIdentifiedResponse(ask, source);
  const original = compileRepairTicket({ ask, response, sources: [source] });

  // a source whose provider_factory requirement text changed
  const changedSourceRaw = rawInputFromFixture(readFixture('bl020-provider-construction-before-authz.json'));
  changedSourceRaw.negativeSideEffects = changedSourceRaw.negativeSideEffects.map((s) =>
    s.scope === 'provider_factory'
      ? { ...s, requirement: 'provider factory construction count remains zero before any authorization failure is handled' }
      : s,
  );
  const changedSource = compileSemanticContract(changedSourceRaw, { compiledAt: NOW });
  assert.equal(changedSource.compileStatus, 'COMPILED');
  assert.notEqual(changedSource.semanticDigest, source.semanticDigest);

  const changedAsk = compileSolAskFor(changedSource);
  const newCriterion = providerFactoryEffectId(changedSource);
  const newRequirement = changedSource.negativeSideEffects.find((s) => s.sideEffectId === newCriterion).requirement;
  const changedResponse = compileSolResponse(
    {
      ...rawResponseFromFixture(readSolFixture('valid-response-diagnose-cause-identified.json')),
      askId: changedAsk.askId,
      findings: [
        {
          findingId: 'lcim_finding_' + 'b'.repeat(32),
          severity: 'CRITICAL',
          invariantRef: newCriterion,
          summary: 'provider construction precedes persisted authorization handling',
          evidenceRefs: ['ev.counter.provider_factory'],
        },
      ],
      failure: {
        ...rawResponseFromFixture(readSolFixture('valid-response-diagnose-cause-identified.json')).failure,
        repair: {
          ...rawResponseFromFixture(readSolFixture('valid-response-diagnose-cause-identified.json')).failure.repair,
          exactTests: [
            {
              name: 'provider_factory stays zero before authorization failure',
              expectation: newRequirement,
              acceptanceCriterionRef: newCriterion,
            },
          ],
        },
      },
    },
    { compiledAt: NOW, ask: changedAsk, sources: [changedSource] },
  );
  const changedConversion = compileRepairTicket({ ask: changedAsk, response: changedResponse, sources: [changedSource] });
  assert.notEqual(original.ticket.conversionDigest, changedConversion.ticket.conversionDigest);
  assert.notEqual(original.ticket.repairId, changedConversion.ticket.repairId);
  // the source-derived required behavior differs accordingly
  assert.equal(changedConversion.repairContract.requiredBehavior, changedSource.negativeSideEffects.find((s) => s.scope === 'provider_factory').requirement);
});

/** Build a source-bound DIAGNOSE ask for the given source (provider_factory criterion). */
function compileSolAskFor(source) {
  const criterion = providerFactoryEffectId(source);
  return buildDiagnoseAskFor(source, criterion);
}

function buildDiagnoseAskFor(source, criterion) {
  const spec = source.negativeSideEffects.find((s) => s.sideEffectId === criterion);
  return compileSolAsk(
    {
      callType: 'SOL_DIAGNOSE',
      singleDecisionQuestion: 'Why does the provider_factory negative side-effect criterion fail before the authorization failure is handled?',
      whyNeeded: 'content-bound identity regression',
      contractRefs: [
        {
          contractKey: source.contractKey,
          semanticDigest: source.semanticDigest,
          requirementRefs: [criterion],
        },
      ],
      establishedFacts: [],
      evidence: [
        { ref: 'ev.counter.provider_factory', content: 'counter reported 1', decisionCritical: true },
      ],
      passCondition: 'root cause identified with resolving evidence',
      failCondition: 'root cause not identifiable from bounded evidence',
      allowedScope: ['the provider_factory criterion only'],
      outOfScope: ['other criteria', 'edits'],
      diagnose: {
        acceptanceCriterionRef: criterion,
        criterionRequirement: spec.requirement,
      },
    },
    { compiledAt: NOW, sources: [source] },
  );
}
