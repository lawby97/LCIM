/**
 * SOL-S06-007 regression: FINAL_REVIEW ADJACENT DEFECT MUST BE REAL,
 * BOUNDED, AND LOCKED.
 *
 * The at-most-one adjacent critical exception remains, but an accepted
 * adjacent defect must mechanically resolve: (1) evidence to retained
 * NON-MARKER bounded evidence, (2) lockedRequirementRef to an actual
 * declared bound source requirement, (3) call to a FAIL verdict,
 * (4) count <= 1. Free-form text is never proof of either. The
 * prohibited unbounded cleanup/refactoring scan applies to ALL
 * text-bearing response fields, including the adjacent summary.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSolResponse } from '../../src/sol/ask-compiler/response.mjs';
import { compileSolAsk } from '../../src/sol/ask-compiler/compiler.mjs';
import { compileRepairTicket } from '../../src/sol/ask-compiler/repair-ticket.mjs';
import { compileSemanticContract } from '../../src/contracts/compiler.mjs';
import { SolResponseError, SolRepairTicketError } from '../../src/sol/contracts/errors.mjs';
import { TRUNCATION_MARKER_REF } from '../../src/sol/contracts/evidence.mjs';
import {
  compileProviderContract,
  buildPriorFinalReview,
  buildDiagnoseAsk,
  networkEffectId,
  providerFactoryEffectId,
  NOW,
} from './helpers.mjs';
import { readFixture, rawInputFromFixture } from '../helpers/semantic-fixture.mjs';

const SOURCE = compileProviderContract();
const SOURCES = [SOURCE];
const PRIOR = buildPriorFinalReview();
const ASK = PRIOR.ask;
const PROVIDER_FACTORY_REQUIREMENT =
  'provider factory invocations remain zero before an authorization failure is handled';

/** A compiled DIAGNOSE ask (provider_factory criterion) for response tests. */
const ASK2 = compileSolAsk(
  {
    callType: 'SOL_DIAGNOSE',
    singleDecisionQuestion: 'Why does the provider_factory negative side-effect criterion fail before the authorization failure is handled?',
    whyNeeded: 'response scan regression',
    contractRefs: [
      {
        contractKey: SOURCE.contractKey,
        semanticDigest: SOURCE.semanticDigest,
        requirementRefs: [providerFactoryEffectId(SOURCE)],
      },
    ],
    establishedFacts: [],
    evidence: [{ ref: 'ev.counter', content: 'counter reported 1', decisionCritical: true }],
    passCondition: 'root cause identified with resolving evidence',
    failCondition: 'root cause not identifiable from bounded evidence',
    allowedScope: ['the provider_factory criterion only'],
    outOfScope: ['other criteria', 'edits'],
    diagnose: {
      acceptanceCriterionRef: providerFactoryEffectId(SOURCE),
      criterionRequirement: PROVIDER_FACTORY_REQUIREMENT,
    },
  },
  { compiledAt: NOW, sources: SOURCES },
);

function failResponseWithAdjacent(adjacent, extra = {}) {
  return compileSolResponse(
    {
      askId: ASK.askId,
      callType: 'SOL_FINAL_REVIEW',
      verdict: 'FAIL',
      decisionSummary: 'invariant failed plus adjacent critical defect',
      evidence: [{ ref: 'ev.candidate.tests', content: 'negative side-effect tests ran' }],
      findings: [
        {
          findingId: 'lcim_finding_' + 'c'.repeat(32),
          severity: 'CRITICAL',
          invariantRef: 'inv.provider_factory_zero',
          summary: 'provider factory count was 1 before the gate',
          evidenceRefs: ['ev.candidate.tests'],
        },
      ],
      adjacentCriticalDefects: adjacent,
      ...extra,
    },
    { compiledAt: NOW, ask: ASK, sources: SOURCES },
  );
}

function hasCode(err, code) {
  return err?.code === code || (err?.details?.errors ?? []).some((e) => e.code === code);
}

test('reject: made-up lockedRequirementRef', () => {
  assert.throws(
    () =>
      failResponseWithAdjacent([
        {
          summary: 'credentials logged on the failure path',
          evidenceRefs: ['ev.candidate.tests'],
          lockedRequirementRef: 'se_' + 'e'.repeat(64),
        },
      ]),
    (err) => err instanceof SolResponseError && hasCode(err, 'ADJACENT_REQUIREMENT_UNBOUND'),
  );
});

test('reject: nonresolving evidence', () => {
  assert.throws(
    () =>
      failResponseWithAdjacent([
        {
          summary: 'credentials logged on the failure path',
          evidenceRefs: ['ev.ref.that.does.not.exist'],
          lockedRequirementRef: networkEffectId(SOURCE),
        },
      ]),
    (err) => err instanceof SolResponseError && hasCode(err, 'ADJACENT_EVIDENCE_UNRESOLVED'),
  );
});

test('reject: truncation-marker evidence', () => {
  assert.throws(
    () =>
      failResponseWithAdjacent([
        {
          summary: 'credentials logged on the failure path',
          evidenceRefs: [TRUNCATION_MARKER_REF],
          lockedRequirementRef: networkEffectId(SOURCE),
        },
      ]),
    (err) => err instanceof SolResponseError && hasCode(err, 'EVIDENCE_REF_MARKER'),
  );
});

test('reject: generic cleanup/refactoring smuggled into the adjacent summary', () => {
  assert.throws(
    () =>
      failResponseWithAdjacent([
        {
          summary: 'credentials logged on the failure path; perform general cleanup and refactoring of the module as a follow-up',
          evidenceRefs: ['ev.candidate.tests'],
          lockedRequirementRef: networkEffectId(SOURCE),
        },
      ]),
    (err) => err instanceof SolResponseError && hasCode(err, 'UNBOUNDED_RECOMMENDATION'),
  );
});

test('reject: adjacent defect under PASS (not FAIL)', () => {
  assert.throws(
    () =>
      compileSolResponse(
        {
          askId: ASK.askId,
          callType: 'SOL_FINAL_REVIEW',
          verdict: 'PASS',
          decisionSummary: 'all invariants held',
          evidence: [{ ref: 'ev.candidate.tests', content: 'negative side-effect tests ran' }],
          adjacentCriticalDefects: [
            {
              summary: 'credentials logged on the failure path',
              evidenceRefs: ['ev.candidate.tests'],
              lockedRequirementRef: networkEffectId(SOURCE),
            },
          ],
        },
        { compiledAt: NOW, ask: ASK, sources: SOURCES },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'FINAL_REVIEW_ADJACENT_WITHOUT_FAIL'),
  );
});

test('accept: one legitimate adjacent CRITICAL defect whose evidence and locked requirement resolve', () => {
  const response = failResponseWithAdjacent([
    {
      summary: 'credentials logged on the authorization failure path outside the checklist',
      evidenceRefs: ['ev.candidate.tests'],
      lockedRequirementRef: networkEffectId(SOURCE),
    },
  ]);
  assert.equal(response.adjacentCriticalDefects.length, 1);
  assert.equal(response.verdict, 'FAIL');
  assert.deepEqual(response.adjacentCriticalDefects[0].evidenceRefs, ['ev.candidate.tests']);
  assert.equal(response.adjacentCriticalDefects[0].lockedRequirementRef, networkEffectId(SOURCE));
});

// ============================================================================
// R2 — SOL-S06-007: UNBOUNDED RECOMMENDATION SCAN COVERS ALL MODEL-AUTHORED TEXT
// ============================================================================

test('R2-A: FINAL_REVIEW FAIL with a legitimate adjacent defect citing response evidence containing a cleanup recommendation => reject', () => {
  assert.throws(
    () =>
      failResponseWithAdjacent([
        {
          summary: 'credentials logged on the failure path',
          evidenceRefs: ['ev.rec'],
          lockedRequirementRef: networkEffectId(SOURCE),
        },
      ], {
        evidence: [
          { ref: 'ev.rec', content: 'recommend general cleanup and refactoring of unrelated modules' },
        ],
      }),
    (err) => err instanceof SolResponseError && hasCode(err, 'UNBOUNDED_RECOMMENDATION'),
  );
});

test('R2-B: cleanup/refactor recommendation in DIAGNOSE evidence content => reject', () => {
  assert.throws(
    () =>
      compileSolResponse(
        {
          askId: ASK2.askId,
          callType: 'SOL_DIAGNOSE',
          verdict: 'CAUSE_IDENTIFIED',
          decisionSummary: 'root cause identified',
          evidence: [
            { ref: 'ev.counter', content: 'counter reported 1' },
            { ref: 'ev.smuggled', content: 'recommend general cleanup and refactoring of unrelated modules' },
          ],
          failure: {
            rootCause: 'preamble construction',
            evidenceRefs: ['ev.counter'],
            falsification: 'f',
            repair: {
              mustChange: [{ target: 'provider_factory', change: 'move construction' }],
              mustNotChange: [{ target: 'authorization store', reason: 'authoritative' }],
              exactTests: [
                {
                  name: 't',
                  expectation: PROVIDER_FACTORY_REQUIREMENT,
                  acceptanceCriterionRef: providerFactoryEffectId(SOURCE),
                },
              ],
              verification: [{ method: 'm', expectation: 'e' }],
            },
          },
        },
        { compiledAt: NOW, ask: ASK2, sources: SOURCES },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'UNBOUNDED_RECOMMENDATION'),
  );
});

test('R2-C: prohibited recommendation in another currently-unscanned model-authored field (verification expectation) => reject', () => {
  assert.throws(
    () =>
      compileSolResponse(
        {
          askId: ASK2.askId,
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
                  name: 't',
                  expectation: PROVIDER_FACTORY_REQUIREMENT,
                  acceptanceCriterionRef: providerFactoryEffectId(SOURCE),
                },
              ],
              verification: [
                { method: 'run tests', expectation: 'suggest refactoring the provider module afterwards' },
              ],
            },
          },
        },
        { compiledAt: NOW, ask: ASK2, sources: SOURCES },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'UNBOUNDED_RECOMMENDATION'),
  );
});

test('R2-D: normal bounded factual evidence content passes', () => {
  const response = compileSolResponse(
    {
      askId: ASK2.askId,
      callType: 'SOL_DIAGNOSE',
      verdict: 'CAUSE_IDENTIFIED',
      decisionSummary: 'root cause identified',
      evidence: [
        { ref: 'ev.counter', content: 'instrumented counter reported provider_factory count 1 before the gate' },
      ],
      failure: {
        rootCause: 'preamble construction',
        evidenceRefs: ['ev.counter'],
        falsification: 'a run with construction after authorization would disprove it',
        repair: {
          mustChange: [{ target: 'provider_factory', change: 'move construction after the authorization check' }],
          mustNotChange: [{ target: 'authorization store', reason: 'authoritative and out of scope' }],
          exactTests: [
            {
              name: 'provider_factory stays zero before authorization failure',
              expectation: PROVIDER_FACTORY_REQUIREMENT,
              acceptanceCriterionRef: providerFactoryEffectId(SOURCE),
            },
          ],
          verification: [{ method: 'run negative side-effect test', expectation: 'all assertions pass' }],
        },
      },
    },
    { compiledAt: NOW, ask: ASK2, sources: SOURCES },
  );
  assert.equal(response.verdict, 'CAUSE_IDENTIFIED');
});

test('R2-E: source-authoritative requirement text containing "cleanup" is never rejected as model recommendation output', () => {
  // a source whose requirement innocently contains recommendation-shaped
  // vocabulary; the criterion-bound exact-test expectation equals that
  // source text verbatim and must NOT be scanned as model-authored output
  const raw = rawInputFromFixture(readFixture('bl020-provider-construction-before-authz.json'));
  raw.negativeSideEffects = raw.negativeSideEffects.map((s) =>
    s.scope === 'provider_factory'
      ? { ...s, requirement: 'provider factory invocations remain zero; never perform cleanup of the provider queue before an authorization failure is handled' }
      : s,
  );
  const variantSource = compileSemanticContract(raw, { compiledAt: NOW });
  const variantCriterion = providerFactoryEffectId(variantSource);
  const variantRequirement = variantSource.negativeSideEffects.find((s) => s.sideEffectId === variantCriterion).requirement;
  const variantAsk = compileSolAsk(
    {
      callType: 'SOL_DIAGNOSE',
      singleDecisionQuestion: 'Why does the provider_factory negative side-effect criterion fail before the authorization failure is handled?',
      whyNeeded: 'source-text exclusion regression',
      contractRefs: [
        {
          contractKey: variantSource.contractKey,
          semanticDigest: variantSource.semanticDigest,
          requirementRefs: [variantCriterion],
        },
      ],
      establishedFacts: [],
      evidence: [{ ref: 'ev.counter', content: 'counter reported 1', decisionCritical: true }],
      passCondition: 'root cause identified',
      failCondition: 'root cause not identifiable',
      allowedScope: ['the provider_factory criterion only'],
      outOfScope: ['edits'],
      diagnose: {
        acceptanceCriterionRef: variantCriterion,
        criterionRequirement: variantRequirement,
      },
    },
    { compiledAt: NOW, sources: [variantSource] },
  );
  const response = compileSolResponse(
    {
      askId: variantAsk.askId,
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
              expectation: variantRequirement,
              acceptanceCriterionRef: variantCriterion,
            },
          ],
          verification: [{ method: 'm', expectation: 'e' }],
        },
      },
    },
    { compiledAt: NOW, ask: variantAsk, sources: [variantSource] },
  );
  assert.equal(response.verdict, 'CAUSE_IDENTIFIED');
});

// ============================================================================
// R3 — SOL-S06-007: exactTests[].command IS MODEL-AUTHORED TEXT AND IS SCANNED
// ============================================================================

/** DIAGNOSE response builder with a controllable exact-test command. */
function diagnoseResponseWithCommand(command) {
  return compileSolResponse(
    {
      askId: ASK2.askId,
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
              command,
              expectation: PROVIDER_FACTORY_REQUIREMENT,
              acceptanceCriterionRef: providerFactoryEffectId(SOURCE),
            },
          ],
          verification: [{ method: 'm', expectation: 'e' }],
        },
      },
    },
    { compiledAt: NOW, ask: ASK2, sources: SOURCES },
  );
}

test('R3-A: exactTests[].command smuggling a cleanup recommendation => compileSolResponse rejects', () => {
  assert.throws(
    () => diagnoseResponseWithCommand('npm test # recommend general cleanup and refactoring of unrelated modules'),
    (err) => err instanceof SolResponseError && hasCode(err, 'UNBOUNDED_RECOMMENDATION'),
  );
});

test('R3-B: a plain executable command is valid', () => {
  const response = diagnoseResponseWithCommand('node --test tests/unit/example.test.mjs');
  assert.equal(response.verdict, 'CAUSE_IDENTIFIED');
  assert.equal(response.failure.repair.exactTests[0].command, 'node --test tests/unit/example.test.mjs');
});

test('R3-C: another command variant with a cleanup/refactor recommendation => reject', () => {
  assert.throws(
    () => diagnoseResponseWithCommand('run lint # consider refactoring the provider module afterwards'),
    (err) => err instanceof SolResponseError && hasCode(err, 'UNBOUNDED_RECOMMENDATION'),
  );
  assert.throws(
    () => diagnoseResponseWithCommand('npx test -- --coverage # perform cleanup of the test helpers'),
    (err) => err instanceof SolResponseError && hasCode(err, 'UNBOUNDED_RECOMMENDATION'),
  );
});

test('R3-D: source-verbatim criterion expectation containing innocent "cleanup" wording => still allowed', () => {
  const raw = rawInputFromFixture(readFixture('bl020-provider-construction-before-authz.json'));
  raw.negativeSideEffects = raw.negativeSideEffects.map((s) =>
    s.scope === 'provider_factory'
      ? { ...s, requirement: 'provider factory invocations remain zero; cleanup of the provider queue stays zero before an authorization failure is handled' }
      : s,
  );
  const variantSource = compileSemanticContract(raw, { compiledAt: NOW });
  const variantCriterion = providerFactoryEffectId(variantSource);
  const variantRequirement = variantSource.negativeSideEffects.find((s) => s.sideEffectId === variantCriterion).requirement;
  const variantAsk = compileSolAsk(
    {
      callType: 'SOL_DIAGNOSE',
      singleDecisionQuestion: 'Why does the provider_factory negative side-effect criterion fail before the authorization failure is handled?',
      whyNeeded: 'source-verbatim expectation regression',
      contractRefs: [
        {
          contractKey: variantSource.contractKey,
          semanticDigest: variantSource.semanticDigest,
          requirementRefs: [variantCriterion],
        },
      ],
      establishedFacts: [],
      evidence: [{ ref: 'ev.counter', content: 'counter reported 1', decisionCritical: true }],
      passCondition: 'root cause identified',
      failCondition: 'root cause not identifiable',
      allowedScope: ['the provider_factory criterion only'],
      outOfScope: ['edits'],
      diagnose: {
        acceptanceCriterionRef: variantCriterion,
        criterionRequirement: variantRequirement,
      },
    },
    { compiledAt: NOW, sources: [variantSource] },
  );
  const response = compileSolResponse(
    {
      askId: variantAsk.askId,
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
              command: 'node --test tests/unit/example.test.mjs',
              expectation: variantRequirement,
              acceptanceCriterionRef: variantCriterion,
            },
          ],
          verification: [{ method: 'm', expectation: 'e' }],
        },
      },
    },
    { compiledAt: NOW, ask: variantAsk, sources: [variantSource] },
  );
  assert.equal(response.verdict, 'CAUSE_IDENTIFIED');
});

test('R3-E: a rejected command can never reach compileRepairTicket (no worker-ready artifact)', () => {
  const { ask } = buildDiagnoseAsk();
  const base = compileSolResponse(
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
              expectation: PROVIDER_FACTORY_REQUIREMENT,
              acceptanceCriterionRef: providerFactoryEffectId(SOURCE),
            },
          ],
          verification: [{ method: 'm', expectation: 'e' }],
        },
      },
    },
    { compiledAt: NOW, ask, sources: SOURCES },
  );
  // hand-tampered doc injecting the prohibited command: even bypassing the
  // response compiler, the repair conversion's independent revalidation
  // (SOL-S06-009 chain) rejects it — no worker-ready artifact is produced
  const smuggled = {
    ...base,
    failure: {
      ...base.failure,
      repair: {
        ...base.failure.repair,
        exactTests: [
          {
            ...base.failure.repair.exactTests[0],
            command: 'npm test # recommend general cleanup and refactoring of unrelated modules',
          },
        ],
      },
    },
  };
  assert.throws(
    () => compileRepairTicket({ ask, response: smuggled, sources: [SOURCE] }),
    (err) => err instanceof SolRepairTicketError && err.code === 'TICKET_CHAIN_INVALID',
  );
});
