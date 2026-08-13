/**
 * Sprint 06 unit tests: SOL response compiler and validator.
 *
 * Acceptance criteria covered here:
 * - compileSolResponse REQUIRES the actual compiled ask (SOL-S06-006);
 * - verdict vocabularies are per-call-type and type-locked;
 * - CONTRACT_CHECK returns exact amendments (or no amendment);
 * - DIAGNOSE failure output is complete, evidence-resolving, and bounded
 *   to the diagnosed criterion (source-derived exact-test expectations);
 * - FINAL_REVIEW uses named invariants instead of open-ended review and
 *   allows at most one adjacent critical defect (evidence-resolving +
 *   locked-requirement-resolving);
 * - RECHECK is delta-only around the prior finding and bound neighbors;
 * - bounded review output never carries generic cleanup/refactoring
 *   recommendations in ANY text-bearing field;
 * - response evidence respects the ask's evidence budget and all
 *   decision-bearing refs resolve to retained NON-MARKER evidence.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSolResponse } from '../../src/sol/ask-compiler/response.mjs';
import { compileSolAsk } from '../../src/sol/ask-compiler/compiler.mjs';
import { validateSolResponse } from '../../src/sol/contracts/validate.mjs';
import { SolResponseError } from '../../src/sol/contracts/errors.mjs';
import { ConfigError } from '../../src/shared/errors.mjs';
import {
  readSolFixture,
  rawAskFromFixture,
  bindAskRefs,
  compileProviderContract,
  providerFactoryEffectId,
  networkEffectId,
  NOW,
} from './helpers.mjs';

const SOURCE = compileProviderContract();
const SOURCES = [SOURCE];
const PROVIDER_FACTORY_REQUIREMENT =
  'provider factory invocations remain zero before an authorization failure is handled';

const CONTRACT_CHECK_ASK = compileSolAsk(bindAskRefs(rawAskFromFixture(readSolFixture('valid-ask-contract-check.json')), SOURCE), {
  compiledAt: NOW,
  sources: SOURCES,
});
const DIAGNOSE_ASK = compileSolAsk(bindAskRefs(rawAskFromFixture(readSolFixture('valid-ask-diagnose.json')), SOURCE), {
  compiledAt: NOW,
  sources: SOURCES,
});
const FINAL_REVIEW_ASK = compileSolAsk(bindAskRefs(rawAskFromFixture(readSolFixture('valid-ask-final-review.json')), SOURCE), {
  compiledAt: NOW,
  sources: SOURCES,
});

function responseInput(ask, overrides = {}) {
  return {
    askId: ask.askId,
    callType: ask.callType,
    verdict: 'SUFFICIENTLY_SPECIFIED',
    decisionSummary: 'the exact semantics are complete and unambiguous',
    evidence: [{ ref: 'ev.contract.digest', kind: 'requirement', content: 'digest binds exact content' }],
    ...overrides,
  };
}

test('compileSolResponse requires the actual compiled ask (SOL-S06-006)', () => {
  assert.throws(
    () => compileSolResponse(responseInput(CONTRACT_CHECK_ASK), { compiledAt: NOW }),
    (err) => err instanceof SolResponseError && err.code === 'ASK_REQUIRED',
  );
  // a pattern-valid askId is not the ask
  assert.throws(
    () =>
      compileSolResponse(responseInput(CONTRACT_CHECK_ASK), {
        compiledAt: NOW,
        ask: { askId: 'lcim_sol_ask_' + 'f'.repeat(32), callType: 'SOL_CONTRACT_CHECK' },
      }),
    (err) => err instanceof SolResponseError && err.code === 'ASK_REQUIRED',
  );
});

test('CONTRACT_CHECK: SUFFICIENTLY_SPECIFIED carries no amendment; AMENDMENTS_REQUIRED must', () => {
  const ok = compileSolResponse(responseInput(CONTRACT_CHECK_ASK), { compiledAt: NOW, ask: CONTRACT_CHECK_ASK, sources: SOURCES });
  assert.equal(ok.verdict, 'SUFFICIENTLY_SPECIFIED');
  assert.equal(ok.amendment, undefined);
  assert.ok(isFrozenDeep(ok));

  const withAmendment = compileSolResponse(
    responseInput(CONTRACT_CHECK_ASK, {
      verdict: 'AMENDMENTS_REQUIRED',
      amendment: {
        exactAmendments: [
          {
            contractKey: SOURCE.contractKey,
            target: 'concepts[approval].authoritativeFieldNames',
            current: 'casing unspecified',
            exactAmendment: "authoritativeFieldNames must be exactly ['approvalId', 'approvalStatus']",
            reason: 'BL-020 approval field casing must be byte-exact',
          },
        ],
      },
    }),
    { compiledAt: NOW, ask: CONTRACT_CHECK_ASK, sources: SOURCES },
  );
  assert.equal(withAmendment.amendment.exactAmendments.length, 1);
  assert.equal(withAmendment.amendment.exactAmendments[0].contractKey, SOURCE.contractKey);

  // pairing violations fail closed
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(CONTRACT_CHECK_ASK, {
          verdict: 'SUFFICIENTLY_SPECIFIED',
          amendment: { exactAmendments: [] },
        }),
        { compiledAt: NOW, ask: CONTRACT_CHECK_ASK },
      ),
    SolResponseError,
  );
  assert.throws(
    () => compileSolResponse(responseInput(CONTRACT_CHECK_ASK, { verdict: 'AMENDMENTS_REQUIRED' }), {
      compiledAt: NOW,
      ask: CONTRACT_CHECK_ASK,
    }),
    SolResponseError,
  );
});

test('CONTRACT_CHECK: amendments must reference a contractRef of the ask', () => {
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(CONTRACT_CHECK_ASK, {
          verdict: 'AMENDMENTS_REQUIRED',
          amendment: {
            exactAmendments: [
              {
                contractKey: 'some.other.contract',
                target: 'x',
                current: 'y',
                exactAmendment: 'z',
                reason: 'r',
              },
            ],
          },
        }),
        { compiledAt: NOW, ask: CONTRACT_CHECK_ASK },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'AMENDMENT_CONTRACT_UNKNOWN'),
  );
});

test('DIAGNOSE: CAUSE_IDENTIFIED requires the complete failure block; CAUSE_UNRESOLVED forbids it', () => {
  const failure = {
    rootCause: 'provider construction happens in the handler preamble',
    evidenceRefs: ['ev.counter.provider_factory'],
    falsification: 'a run with construction after authorization would disprove it',
    repair: {
      mustChange: [
        { target: 'provider_factory', change: 'move construction after the authorization check' },
      ],
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
  };
  const ok = compileSolResponse(
    responseInput(DIAGNOSE_ASK, {
      verdict: 'CAUSE_IDENTIFIED',
      decisionSummary: 'root cause identified',
      evidence: [
        { ref: 'ev.counter.provider_factory', kind: 'test_result', content: 'counter reported 1', decisionCritical: true },
        { ref: 'ev.log.authorization', kind: 'log_summary', content: 'authorization handled late' },
      ],
      failure,
    }),
    { compiledAt: NOW, ask: DIAGNOSE_ASK, sources: SOURCES },
  );
  assert.equal(ok.verdict, 'CAUSE_IDENTIFIED');
  assert.ok(ok.failure.repair.mustChange.length >= 1);

  assert.throws(
    () =>
      compileSolResponse(
        responseInput(DIAGNOSE_ASK, { verdict: 'CAUSE_IDENTIFIED', decisionSummary: 'no failure given' }),
        { compiledAt: NOW, ask: DIAGNOSE_ASK },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'DIAGNOSE_FAILURE_MISMATCH'),
  );
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(DIAGNOSE_ASK, { verdict: 'CAUSE_UNRESOLVED', decisionSummary: 'unresolved', failure }),
        { compiledAt: NOW, ask: DIAGNOSE_ASK },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'DIAGNOSE_FAILURE_MISMATCH'),
  );
});

test('DIAGNOSE: evidence refs must resolve to bounded NON-MARKER evidence', () => {
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(DIAGNOSE_ASK, {
          verdict: 'CAUSE_IDENTIFIED',
          decisionSummary: 'root cause identified',
          evidence: [{ ref: 'ev.counter.provider_factory', content: 'counter reported 1' }],
          failure: {
            rootCause: 'preamble construction',
            evidenceRefs: ['ev.ref.that.does.not.exist'],
            falsification: 'falsification statement',
            repair: {
              mustChange: [{ target: 'provider_factory', change: 'move construction' }],
              mustNotChange: [{ target: 'authorization store', reason: 'authoritative' }],
              exactTests: [{ name: 't', expectation: PROVIDER_FACTORY_REQUIREMENT, acceptanceCriterionRef: providerFactoryEffectId(SOURCE) }],
              verification: [{ method: 'm', expectation: 'e' }],
            },
          },
        }),
        { compiledAt: NOW, ask: DIAGNOSE_ASK },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'FAILURE_EVIDENCE_UNRESOLVED'),
  );
});

test('DIAGNOSE: the smallest safe repair stays inside the criterion scope and target count', () => {
  const failureFor = (mustChange, extra = {}) => ({
    rootCause: 'preamble construction',
    evidenceRefs: ['ev.counter.provider_factory'],
    falsification: 'falsification statement',
    repair: {
      mustChange,
      mustNotChange: [{ target: 'authorization store', reason: 'authoritative' }],
      exactTests: [{ name: 't', expectation: PROVIDER_FACTORY_REQUIREMENT, acceptanceCriterionRef: providerFactoryEffectId(SOURCE) }],
      verification: [{ method: 'm', expectation: 'e' }],
      ...extra,
    },
  });
  const input = (failure) =>
    responseInput(DIAGNOSE_ASK, {
      verdict: 'CAUSE_IDENTIFIED',
      decisionSummary: 'root cause identified',
      evidence: [{ ref: 'ev.counter.provider_factory', content: 'counter reported 1' }],
      failure,
    });

  // expanding into another side-effect scope fails closed
  assert.throws(
    () =>
      compileSolResponse(input(failureFor([{ target: 'database', change: 'move construction' }])), {
        compiledAt: NOW,
        ask: DIAGNOSE_ASK,
        sources: SOURCES,
      }),
    (err) => err instanceof SolResponseError && hasCode(err, 'FAILURE_SCOPE_UNBOUNDED'),
  );

  // two targets exceed the ask's maxMustChangeTargets (1)
  assert.throws(
    () =>
      compileSolResponse(
        input(
          failureFor([
            { target: 'provider_factory', change: 'move construction' },
            { target: 'provider_factory', change: 'also move teardown' },
          ]),
        ),
        { compiledAt: NOW, ask: DIAGNOSE_ASK, sources: SOURCES },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'FAILURE_TARGET_COUNT_EXCEEDED'),
  );

  // the ask requires at least one mustNotChange target
  const noPreserve = failureFor([{ target: 'provider_factory', change: 'move construction' }], { mustNotChange: [] });
  assert.throws(
    () =>
      compileSolResponse(input(noPreserve), {
        compiledAt: NOW,
        ask: DIAGNOSE_ASK,
        sources: SOURCES,
      }),
    (err) => err instanceof SolResponseError && hasCode(err, 'FAILURE_MUST_NOT_CHANGE_MISSING'),
  );

  // an exact test for a different criterion fails closed
  const otherCriterionFailure = failureFor([{ target: 'provider_factory', change: 'move construction' }]);
  otherCriterionFailure.repair.exactTests = [
    {
      name: 't',
      expectation: PROVIDER_FACTORY_REQUIREMENT,
      acceptanceCriterionRef: 'se_' + 'd'.repeat(64),
    },
  ];
  assert.throws(
    () =>
      compileSolResponse(input(otherCriterionFailure), {
        compiledAt: NOW,
        ask: DIAGNOSE_ASK,
        sources: SOURCES,
      }),
    (err) => err instanceof SolResponseError && hasCode(err, 'TEST_CRITERION_UNKNOWN'),
  );

  // a criterion-bound exact test with SOL-authored contradicting expectation fails
  const contradicting = failureFor([{ target: 'provider_factory', change: 'move construction' }]);
  contradicting.repair.exactTests = [
    {
      name: 't',
      expectation: 'provider factory invocations may reach 1 before authorization is handled',
      acceptanceCriterionRef: providerFactoryEffectId(SOURCE),
    },
  ];
  assert.throws(
    () =>
      compileSolResponse(input(contradicting), {
        compiledAt: NOW,
        ask: DIAGNOSE_ASK,
        sources: SOURCES,
      }),
    (err) => err instanceof SolResponseError && hasCode(err, 'TEST_EXPECTATION_MISMATCH'),
  );
});

test('FINAL_REVIEW: PASS carries no findings; FAIL names checklist invariants with a CRITICAL basis', () => {
  const pass = compileSolResponse(
    responseInput(FINAL_REVIEW_ASK, { verdict: 'PASS', decisionSummary: 'all invariants held' }),
    { compiledAt: NOW, ask: FINAL_REVIEW_ASK },
  );
  assert.equal(pass.verdict, 'PASS');
  assert.equal(pass.findings, undefined);

  const fail = compileSolResponse(
    responseInput(FINAL_REVIEW_ASK, {
      verdict: 'FAIL',
      decisionSummary: 'inv.provider_factory_zero failed',
      findings: [
        {
          findingId: 'lcim_finding_' + 'c'.repeat(32),
          severity: 'CRITICAL',
          invariantRef: 'inv.provider_factory_zero',
          summary: 'provider factory count was 1 before the gate',
          evidenceRefs: ['ev.candidate.tests'],
        },
      ],
      evidence: [{ ref: 'ev.candidate.tests', content: 'negative side-effect tests ran' }],
    }),
    { compiledAt: NOW, ask: FINAL_REVIEW_ASK },
  );
  assert.equal(fail.findings[0].invariantRef, 'inv.provider_factory_zero');

  // PASS with findings / FAIL without findings / FAIL without a CRITICAL basis
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(FINAL_REVIEW_ASK, {
          verdict: 'PASS',
          decisionSummary: 'p',
          findings: [
            {
              findingId: 'lcim_finding_' + 'e'.repeat(32),
              severity: 'WARNING',
              invariantRef: 'inv.provider_factory_zero',
              summary: 's',
              evidenceRefs: ['ev.candidate.tests'],
            },
          ],
        }),
        { compiledAt: NOW, ask: FINAL_REVIEW_ASK },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'FINAL_REVIEW_PASS_WITH_FINDINGS'),
  );
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(FINAL_REVIEW_ASK, { verdict: 'FAIL', decisionSummary: 'f' }),
        { compiledAt: NOW, ask: FINAL_REVIEW_ASK },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'FINAL_REVIEW_FAIL_WITHOUT_FINDINGS'),
  );
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(FINAL_REVIEW_ASK, {
          verdict: 'FAIL',
          decisionSummary: 'f',
          findings: [
            {
              findingId: 'lcim_finding_' + 'f'.repeat(32),
              severity: 'WARNING',
              invariantRef: 'inv.provider_factory_zero',
              summary: 's',
              evidenceRefs: ['ev.candidate.tests'],
            },
          ],
        }),
        { compiledAt: NOW, ask: FINAL_REVIEW_ASK },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'FINAL_REVIEW_FAIL_WITHOUT_CRITICAL'),
  );
});

test('FINAL_REVIEW: findings reference named checklist invariants and resolving evidence only', () => {
  // unknown invariant
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(FINAL_REVIEW_ASK, {
          verdict: 'FAIL',
          decisionSummary: 'f',
          findings: [
            {
              findingId: 'lcim_finding_' + 'a'.repeat(32),
              severity: 'CRITICAL',
              invariantRef: 'inv.not_on_the_checklist',
              summary: 's',
              evidenceRefs: ['ev.candidate.tests'],
            },
          ],
        }),
        { compiledAt: NOW, ask: FINAL_REVIEW_ASK },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'FINAL_REVIEW_UNKNOWN_INVARIANT'),
  );
  // unknown evidence ref
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(FINAL_REVIEW_ASK, {
          verdict: 'FAIL',
          decisionSummary: 'f',
          findings: [
            {
              findingId: 'lcim_finding_' + 'b'.repeat(32),
              severity: 'CRITICAL',
              invariantRef: 'inv.provider_factory_zero',
              summary: 's',
              evidenceRefs: ['ev.ref.that.does.not.exist'],
            },
          ],
        }),
        { compiledAt: NOW, ask: FINAL_REVIEW_ASK },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'FINDING_EVIDENCE_UNRESOLVED'),
  );
});

test('FINAL_REVIEW: at most one adjacent critical defect, only under FAIL, evidence + locked requirement resolve', () => {
  const adjacent = [
    {
      summary: 'credentials logged on the failure path',
      evidenceRefs: ['ev.candidate.tests'],
      lockedRequirementRef: networkEffectId(SOURCE),
    },
  ];
  const ok = compileSolResponse(
    responseInput(FINAL_REVIEW_ASK, {
      verdict: 'FAIL',
      decisionSummary: 'invariant failed plus one adjacent critical defect',
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
    }),
    { compiledAt: NOW, ask: FINAL_REVIEW_ASK },
  );
  assert.equal(ok.adjacentCriticalDefects.length, 1);
  assert.ok(ok.adjacentCriticalDefects[0].evidenceRefs.length >= 1);

  // adjacent defect under PASS fails closed
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(FINAL_REVIEW_ASK, {
          verdict: 'PASS',
          decisionSummary: 'p',
          adjacentCriticalDefects: adjacent,
        }),
        { compiledAt: NOW, ask: FINAL_REVIEW_ASK },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'FINAL_REVIEW_ADJACENT_WITHOUT_FAIL'),
  );
  // two adjacent defects fail closed (schema maxItems 1)
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(FINAL_REVIEW_ASK, {
          verdict: 'FAIL',
          decisionSummary: 'f',
          findings: [
            {
              findingId: 'lcim_finding_' + 'c'.repeat(32),
              severity: 'CRITICAL',
              invariantRef: 'inv.provider_factory_zero',
              summary: 's',
              evidenceRefs: ['ev.candidate.tests'],
            },
          ],
          adjacentCriticalDefects: [adjacent[0], adjacent[0]],
        }),
        { compiledAt: NOW, ask: FINAL_REVIEW_ASK },
      ),
    SolResponseError,
  );
  // made-up locked requirement ref fails closed
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(FINAL_REVIEW_ASK, {
          verdict: 'FAIL',
          decisionSummary: 'f',
          evidence: [{ ref: 'ev.candidate.tests', content: 'negative side-effect tests ran' }],
          findings: [
            {
              findingId: 'lcim_finding_' + 'd'.repeat(32),
              severity: 'CRITICAL',
              invariantRef: 'inv.provider_factory_zero',
              summary: 's',
              evidenceRefs: ['ev.candidate.tests'],
            },
          ],
          adjacentCriticalDefects: [
            { summary: 'made up', evidenceRefs: ['ev.candidate.tests'], lockedRequirementRef: 'se_' + 'e'.repeat(64) },
          ],
        }),
        { compiledAt: NOW, ask: FINAL_REVIEW_ASK },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'ADJACENT_REQUIREMENT_UNBOUND'),
  );
});

test('verdicts are type-locked: an unknown verdict fails closed', () => {
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(CONTRACT_CHECK_ASK, { verdict: 'REVIEWED', decisionSummary: 's' }),
        { compiledAt: NOW, ask: CONTRACT_CHECK_ASK },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'VERDICT_NOT_IN_VOCABULARY'),
  );
});

test('responses bind to their compiled ask (askId, callType)', () => {
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(CONTRACT_CHECK_ASK, { askId: 'lcim_sol_ask_' + 'f'.repeat(32) }),
        { compiledAt: NOW, ask: CONTRACT_CHECK_ASK },
      ),
    (err) => err instanceof SolResponseError && err.code === 'ASK_ID_MISMATCH',
  );
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(CONTRACT_CHECK_ASK, { callType: 'SOL_DIAGNOSE', verdict: 'CAUSE_IDENTIFIED' }),
        { compiledAt: NOW, ask: CONTRACT_CHECK_ASK },
      ),
    (err) => err instanceof SolResponseError && err.code === 'CALL_TYPE_MISMATCH',
  );
});

test('bounded review output never carries generic cleanup/refactoring recommendations', () => {
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(FINAL_REVIEW_ASK, {
          verdict: 'PASS',
          decisionSummary: 'all invariants held; consider a general cleanup of the module',
        }),
        { compiledAt: NOW, ask: FINAL_REVIEW_ASK },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'UNBOUNDED_RECOMMENDATION'),
  );
  // smuggled into an adjacent summary
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(FINAL_REVIEW_ASK, {
          verdict: 'FAIL',
          decisionSummary: 'f',
          evidence: [{ ref: 'ev.candidate.tests', content: 'negative side-effect tests ran' }],
          findings: [
            {
              findingId: 'lcim_finding_' + 'a'.repeat(32),
              severity: 'CRITICAL',
              invariantRef: 'inv.provider_factory_zero',
              summary: 's',
              evidenceRefs: ['ev.candidate.tests'],
            },
          ],
          adjacentCriticalDefects: [
            {
              summary: 'perform general cleanup and refactoring of the module as a follow-up',
              evidenceRefs: ['ev.candidate.tests'],
              lockedRequirementRef: networkEffectId(SOURCE),
            },
          ],
        }),
        { compiledAt: NOW, ask: FINAL_REVIEW_ASK },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'UNBOUNDED_RECOMMENDATION'),
  );
  // smuggled into DIAGNOSE root cause prose
  assert.throws(
    () =>
      compileSolResponse(
        responseInput(DIAGNOSE_ASK, {
          verdict: 'CAUSE_IDENTIFIED',
          decisionSummary: 'root cause identified',
          evidence: [{ ref: 'ev.counter.provider_factory', content: 'counter reported 1' }],
          failure: {
            rootCause: 'preamble construction; consider a cosmetic cleanup of the handler',
            evidenceRefs: ['ev.counter.provider_factory'],
            falsification: 'f',
            repair: {
              mustChange: [{ target: 'provider_factory', change: 'move construction' }],
              mustNotChange: [{ target: 'authorization store', reason: 'authoritative' }],
              exactTests: [{ name: 't', expectation: PROVIDER_FACTORY_REQUIREMENT, acceptanceCriterionRef: providerFactoryEffectId(SOURCE) }],
              verification: [{ method: 'm', expectation: 'e' }],
            },
          },
        }),
        { compiledAt: NOW, ask: DIAGNOSE_ASK },
      ),
    (err) => err instanceof SolResponseError && hasCode(err, 'UNBOUNDED_RECOMMENDATION'),
  );
});

test('response evidence is bounded by the ask budget', () => {
  const heavy = [{ ref: 'ev.huge', content: 'z'.repeat(9000), decisionCritical: true }];
  assert.throws(
    () =>
      compileSolResponse(responseInput(CONTRACT_CHECK_ASK, { evidence: heavy }), {
        compiledAt: NOW,
        ask: CONTRACT_CHECK_ASK,
      }),
    (err) => err instanceof SolResponseError && hasCode(err, 'BUDGET_EXHAUSTED'),
  );
  // a hand-tampered compiled response that outgrows the ask budget is invalid
  const fixture = readSolFixture('valid-response-contract-check-sufficient.json');
  const tampered = {
    ...fixture,
    evidence: [
      { ref: 'ev.smuggled.a', content: '你'.repeat(2000) },
      { ref: 'ev.smuggled.b', content: '你'.repeat(2000) },
      { ref: 'ev.smuggled.c', content: '你'.repeat(2000) },
    ],
  };
  const result = validateSolResponse(tampered, { ask: CONTRACT_CHECK_ASK });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === 'RESPONSE_EVIDENCE_BUDGET_EXCEEDED'));
});

test('response fixtures validate; unknown-verdict fixture fails', () => {
  const valid = [
    'valid-response-contract-check-amendments.json',
    'valid-response-contract-check-sufficient.json',
    'valid-response-diagnose-cause-identified.json',
    'valid-response-final-review-pass.json',
    'valid-response-final-review-fail.json',
    'valid-response-recheck-resolved.json',
  ];
  for (const name of valid) {
    const result = validateSolResponse(readSolFixture(name));
    assert.equal(result.valid, true, name);
  }
  const invalid = validateSolResponse(readSolFixture('invalid-response-unknown-verdict.json'));
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((e) => e.code === 'VERDICT_NOT_IN_VOCABULARY'));
});

test('compiler rejects caller-supplied derived response fields', () => {
  assert.throws(
    () => compileSolResponse({ ...responseInput(CONTRACT_CHECK_ASK), responseId: 'lcim_sol_resp_' + 'a'.repeat(32) }, { compiledAt: NOW, ask: CONTRACT_CHECK_ASK }),
    ConfigError,
  );
  assert.throws(
    () => compileSolResponse({ ...responseInput(CONTRACT_CHECK_ASK), compiledAt: NOW }, { compiledAt: NOW, ask: CONTRACT_CHECK_ASK }),
    ConfigError,
  );
});

/** True when the error carries the given code (top-level or in details.errors). */
function hasCode(err, code) {
  return err?.code === code || (err?.details?.errors ?? []).some((e) => e.code === code);
}

function isFrozenDeep(value) {
  if (Array.isArray(value)) {
    return Object.isFrozen(value) && value.every(isFrozenDeep);
  }
  if (value !== null && typeof value === 'object') {
    return Object.isFrozen(value) && Object.values(value).every(isFrozenDeep);
  }
  return true;
}
