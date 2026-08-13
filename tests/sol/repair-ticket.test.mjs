/**
 * Sprint 06 unit tests: deterministic SOL failure → repair ticket.
 *
 * Acceptance criteria covered here:
 * - DIAGNOSE output (CAUSE_IDENTIFIED) yields ONE worker-ready repair
 *   ticket compiled into the Sprint-04 repair/acceptance contract schema;
 * - the conversion is deterministic and content-bound: identical
 *   conversions compile to identical repair contracts and conversion
 *   records; materially different conversion payloads never share a
 *   repair identity (SOL-S06-010);
 * - the conversion INDEPENDENTLY revalidates the complete chain
 *   SOURCE -> ASK -> RESPONSE -> REPAIR and fails closed on any break
 *   (SOL-S06-009): excess mustChange, missing mustNotChange,
 *   SOL-authored authority prose, contradicting test expectations;
 * - authority-bearing acceptance semantics are source-derived: the
 *   repair's objective/violation/requiredBehavior come from the source
 *   requirement, never from SOL prose;
 * - failures never produce a ticket (CAUSE_UNRESOLVED, non-DIAGNOSE,
 *   unbounded scopes).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { compileRepairTicket } from '../../src/sol/ask-compiler/repair-ticket.mjs';
import { compileSolAsk } from '../../src/sol/ask-compiler/compiler.mjs';
import { compileSolResponse } from '../../src/sol/ask-compiler/response.mjs';
import { validateRepairTicket } from '../../src/sol/contracts/validate.mjs';
import { SolRepairTicketError } from '../../src/sol/contracts/errors.mjs';
import { isValidRepairId, REPAIR_ID_PATTERN } from '../../src/contracts/repair.mjs';
import { compileSemanticContract } from '../../src/contracts/compiler.mjs';
import { renderAcceptanceContract } from '../../src/contracts/render.mjs';
import {
  readSolFixture,
  rawResponseFromFixture,
  compileProviderContract,
  providerFactoryEffectId,
  buildDiagnoseAsk,
  NOW,
} from './helpers.mjs';
import { readFixture, rawInputFromFixture } from '../helpers/semantic-fixture.mjs';

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

function diagnosePair() {
  const { ask, source } = buildDiagnoseAsk();
  return { ask, source, response: causeIdentifiedResponse(ask, source) };
}

test('DIAGNOSE CAUSE_IDENTIFIED compiles into one worker-ready repair ticket (Sprint-04 schema)', () => {
  const { ask, source, response } = diagnosePair();
  const { repairContract, ticket } = compileRepairTicket({ ask, response, sources: [source] });

  // the repair contract is the Sprint-04 worker-ready acceptance contract
  assert.equal(repairContract.schemaName, 'lcim.acceptance-contract');
  assert.equal(repairContract.schemaVersion, '2.0.0');
  assert.equal(repairContract.contractKey, source.contractKey);
  assert.equal(repairContract.sourceSemanticDigest, source.semanticDigest);
  assert.ok(isValidRepairId(repairContract.repairId));
  assert.deepEqual(repairContract.rejectedAcceptanceRefs, [providerFactoryEffectId(source)]);
  assert.ok(Object.isFrozen(repairContract));
  // worker-ready shape with SOURCE-DERIVED acceptance semantics (SOL-S06-009)
  assert.equal(repairContract.requiredBehavior, PROVIDER_FACTORY_REQUIREMENT);
  assert.ok(repairContract.objective.includes('restore acceptance criterion'));
  assert.ok(repairContract.violation.includes(PROVIDER_FACTORY_REQUIREMENT));
  assert.ok(repairContract.mustChange.length >= 1);
  assert.ok(repairContract.mustNotChange.length >= 1);
  assert.ok(repairContract.acceptanceTests.length >= 1);
  assert.ok(repairContract.verification.length >= 1);
  // every source negative side-effect is carried with its own test
  assert.equal(repairContract.negativeSideEffects.length, source.negativeSideEffects.length);
  // the diagnosed criterion's exact test is keyed by its sideEffectId and
  // pins the source scope/count exactly
  const criterion = providerFactoryEffectId(source);
  const criterionTest = repairContract.acceptanceTests.find(
    (t) => t.negativeSideEffectId === criterion,
  );
  assert.ok(criterionTest, 'criterion test must be keyed by its sideEffectId');
  assert.equal(criterionTest.negativeSideEffectScope, 'provider_factory');
  assert.equal(criterionTest.expectedSideEffectCount, 0);
  assert.equal(criterionTest.expectation, PROVIDER_FACTORY_REQUIREMENT);
  // deterministic conversion record
  assert.equal(ticket.schemaName, 'lcim.repair-ticket');
  assert.equal(ticket.ticketId, repairContract.repairId);
  assert.equal(ticket.sourceAskId, ask.askId);
  assert.equal(ticket.sourceResponseId, response.responseId);
  assert.equal(ticket.repairId, repairContract.repairId);
  assert.match(ticket.conversionDigest, /^[0-9a-f]{64}$/);
  assert.equal(validateRepairTicket(ticket, { ask, response }).valid, true);
  // the repair contract renders (Sprint-04 renderer)
  const rendered = renderAcceptanceContract(repairContract);
  assert.ok(rendered.includes(repairContract.repairId));
  assert.ok(rendered.includes('REPAIR TARGETS'));
});

test('the conversion is deterministic: identical inputs compile to identical tickets', () => {
  const { ask, source, response } = diagnosePair();

  const first = compileRepairTicket({ ask, response, sources: [source] });
  const second = compileRepairTicket({ ask, response, sources: [source] });

  assert.deepEqual(first.repairContract, second.repairContract);
  assert.deepEqual(first.ticket, second.ticket);
  assert.equal(first.ticket.conversionDigest, second.ticket.conversionDigest);
  assert.equal(first.repairContract.repairId, second.repairContract.repairId);
  assert.match(first.repairContract.repairId, REPAIR_ID_PATTERN);
  // different exchange => different repair instance
  const otherResponse = causeIdentifiedResponse(ask, source, {
    decisionSummary: 'a different but equally valid summary of the same cause',
  });
  const other = compileRepairTicket({ ask, response: otherResponse, sources: [source] });
  assert.notEqual(first.repairContract.repairId, other.repairContract.repairId);
});

test('only DIAGNOSE CAUSE_IDENTIFIED failure responses compile into a ticket', () => {
  const { ask, source, response } = diagnosePair();

  const contractCheckAsk = compileSolAsk(
    {
      callType: 'SOL_CONTRACT_CHECK',
      singleDecisionQuestion: 'Is the exact field-name casing of the approval decision contract sufficiently specified?',
      whyNeeded: 'contract check',
      contractRefs: [
        { contractKey: source.contractKey, semanticDigest: source.semanticDigest },
      ],
      establishedFacts: [],
      evidence: [{ ref: 'ev.1', content: 'x', decisionCritical: true }],
      passCondition: 'p',
      failCondition: 'f',
      allowedScope: ['semantics only'],
      outOfScope: ['edits'],
      contractCheck: { amendmentsOnly: true, expectedVerdicts: ['SUFFICIENTLY_SPECIFIED', 'AMENDMENTS_REQUIRED'] },
    },
    { compiledAt: NOW, sources: [source] },
  );
  assert.throws(
    () => compileRepairTicket({ ask: contractCheckAsk, response, sources: [source] }),
    (err) => err instanceof SolRepairTicketError && err.code === 'NOT_DIAGNOSE_CAUSE_IDENTIFIED',
  );

  const unresolved = compileSolResponse(
    {
      ...rawResponseFromFixture(readSolFixture('valid-response-diagnose-cause-identified.json')),
      askId: ask.askId,
      verdict: 'CAUSE_UNRESOLVED',
      decisionSummary: 'cause could not be identified from the bounded evidence',
      findings: undefined,
      failure: undefined,
    },
    { compiledAt: NOW, ask, sources: [source] },
  );
  assert.throws(
    () => compileRepairTicket({ ask, response: unresolved, sources: [source] }),
    (err) => err instanceof SolRepairTicketError && err.code === 'NOT_DIAGNOSE_CAUSE_IDENTIFIED',
  );
});

test('a response that does not bind to the ask compiles into no ticket', () => {
  const { source } = diagnosePair();
  const otherAsk = compileSolAsk(
    {
      callType: 'SOL_DIAGNOSE',
      singleDecisionQuestion: 'Why does the provider_factory negative side-effect criterion fail before the authorization failure is handled?',
      whyNeeded: 'a different ask',
      contractRefs: [
        {
          contractKey: source.contractKey,
          semanticDigest: source.semanticDigest,
          requirementRefs: [providerFactoryEffectId(source)],
        },
      ],
      establishedFacts: [],
      evidence: [{ ref: 'ev.counter.provider_factory', content: 'counter reported 1', decisionCritical: true }],
      passCondition: 'root cause identified',
      failCondition: 'root cause not identifiable',
      allowedScope: ['the provider_factory criterion only'],
      outOfScope: ['edits'],
      diagnose: {
        acceptanceCriterionRef: providerFactoryEffectId(source),
        criterionRequirement: PROVIDER_FACTORY_REQUIREMENT,
      },
    },
    { compiledAt: NOW, sources: [source] },
  );
  const response = causeIdentifiedResponse(otherAsk, source);
  const { ask } = buildDiagnoseAsk();
  assert.throws(
    () => compileRepairTicket({ ask, response, sources: [source] }),
    (err) => err instanceof SolRepairTicketError && err.code === 'TICKET_ASK_RESPONSE_MISMATCH',
  );
});

test('a non-authoritative source compiles into no ticket', () => {
  const { ask, response } = diagnosePair();
  const reviewRequired = compileSemanticContract(
    {
      ...rawInputFromFixture(readFixture('bl020-provider-construction-before-authz.json')),
      riskClass: 'FINANCIAL',
      unresolvedSemantics: [
        { question: 'exact rounding rule for settlement amounts', riskClass: 'FINANCIAL' },
      ],
    },
    { compiledAt: NOW },
  );
  assert.equal(reviewRequired.compileStatus, 'CONTRACT_REVIEW_REQUIRED');
  assert.throws(
    () => compileRepairTicket({ ask, response, sources: [reviewRequired] }),
    (err) => err instanceof SolRepairTicketError && err.code === 'SOURCE_NOT_AUTHORITATIVE',
  );
});

test('a malformed/tampered source compiles into no ticket', () => {
  const { ask, response } = diagnosePair();
  const tampered = { ...SOURCE, semanticDigest: 'a'.repeat(64) };
  assert.throws(
    () => compileRepairTicket({ ask, response, sources: [tampered] }),
    (err) => err instanceof SolRepairTicketError && err.code === 'TICKET_CHAIN_INVALID',
  );
});

test('an ask bound to a different source compiles into no ticket', () => {
  const { ask, response } = diagnosePair();
  const otherContract = compileSemanticContract(
    rawInputFromFixture(readFixture('bl020-decision-evidence-membership-digests.json')),
    { compiledAt: NOW },
  );
  assert.throws(
    () => compileRepairTicket({ ask, response, sources: [otherContract] }),
    (err) => err instanceof SolRepairTicketError && err.code === 'TICKET_CHAIN_INVALID',
  );
});

test('SOL-S06-009: the conversion revalidates the chain and rejects tampered responses', () => {
  const { ask, source } = diagnosePair();

  // excess same-scope mustChange targets => fail closed at conversion
  const excess = causeIdentifiedResponse(ask, source);
  const excessRaw = {
    ...excess,
    failure: {
      ...excess.failure,
      repair: {
        ...excess.failure.repair,
        mustChange: [
          ...excess.failure.repair.mustChange,
          { target: 'provider_factory', change: 'also move teardown' },
        ],
      },
    },
  };
  assert.throws(
    () => compileRepairTicket({ ask, response: excessRaw, sources: [source] }),
    (err) => err instanceof SolRepairTicketError && err.code === 'TICKET_CHAIN_INVALID',
  );

  // empty mustNotChange => fail closed at conversion
  const noPreserve = {
    ...excess,
    failure: {
      ...excess.failure,
      repair: { ...excess.failure.repair, mustNotChange: [] },
    },
  };
  assert.throws(
    () => compileRepairTicket({ ask, response: noPreserve, sources: [source] }),
    (err) => err instanceof SolRepairTicketError && err.code === 'TICKET_CHAIN_INVALID',
  );

  // SOL-authored authority prose (objective/violation/requiredBehavior)
  // can no longer exist in the response schema: smuggling it is a schema
  // violation => fail closed at conversion
  const smuggledAuthority = {
    ...excess,
    failure: {
      ...excess.failure,
      repair: {
        ...excess.failure.repair,
        requiredBehavior: 'rewrite the authorization flow to allow one provider construction',
      },
    },
  };
  assert.throws(
    () => compileRepairTicket({ ask, response: smuggledAuthority, sources: [source] }),
    (err) => err instanceof SolRepairTicketError && err.code === 'TICKET_CHAIN_INVALID',
  );

  // test expectation contradicting the source requirement => fail closed
  const contradictingTests = {
    ...excess,
    failure: {
      ...excess.failure,
      repair: {
        ...excess.failure.repair,
        exactTests: [
          {
            name: 't',
            expectation: 'provider factory invocations may reach 1 before authorization is handled',
            acceptanceCriterionRef: providerFactoryEffectId(source),
          },
        ],
      },
    },
  };
  assert.throws(
    () => compileRepairTicket({ ask, response: contradictingTests, sources: [source] }),
    (err) => err instanceof SolRepairTicketError && err.code === 'TICKET_CHAIN_INVALID',
  );
});

test('the compiled ticket carries findingRefs when the response has a finding', () => {
  const { ask, source, response } = diagnosePair();
  const { repairContract } = compileRepairTicket({ ask, response, sources: [source] });
  assert.ok(Array.isArray(repairContract.findingRefs));
  assert.equal(repairContract.findingRefs.length, 1);
  assert.match(repairContract.findingRefs[0], /^lcim_finding_[0-9a-f]{32}$/);
});

test('SOL-S06-010: repair identity is content-bound', () => {
  const { ask, source } = diagnosePair();
  const response = causeIdentifiedResponse(ask, source);
  const conversion = compileRepairTicket({ ask, response, sources: [source] });

  // A: identical semantic conversion twice => identical repairId + conversionDigest
  const again = compileRepairTicket({ ask, response, sources: [source] });
  assert.equal(conversion.ticket.repairId, again.ticket.repairId);
  assert.equal(conversion.ticket.conversionDigest, again.ticket.conversionDigest);

  // B: same askId/responseId but materially altered repair content =>
  // different content-bound repair id
  const altered = {
    ...response,
    failure: {
      ...response.failure,
      repair: {
        ...response.failure.repair,
        mustChange: [
          { target: 'provider_factory', change: 'move construction after the authorization check AND gate it' },
        ],
      },
    },
  };
  const alteredConversion = compileRepairTicket({ ask, response: altered, sources: [source] });
  assert.notEqual(conversion.ticket.repairId, alteredConversion.ticket.repairId);
  assert.notEqual(conversion.ticket.conversionDigest, alteredConversion.ticket.conversionDigest);

  // C: changed source semantic digest => different conversion identity
  const otherContract = compileSemanticContract(
    {
      ...rawInputFromFixture(readFixture('bl020-provider-construction-before-authz.json')),
      riskClass: 'FINANCIAL',
    },
    { compiledAt: NOW },
  );
  assert.equal(otherContract.compileStatus, 'COMPILED');
  // source digest is content-bound: a changed source is a different identity
  assert.notEqual(otherContract.semanticDigest, source.semanticDigest);
  // the ask bound to the original source cannot convert against the new one
  assert.throws(
    () => compileRepairTicket({ ask, response, sources: [otherContract] }),
    (err) => err instanceof SolRepairTicketError && err.code === 'TICKET_CHAIN_INVALID',
  );
});

test('the valid repair-ticket fixture validates', () => {
  const result = validateRepairTicket(readSolFixture('valid-repair-ticket.json'));
  assert.equal(result.valid, true);
});
