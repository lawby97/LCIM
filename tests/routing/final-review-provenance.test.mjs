/**
 * Sprint 05 tests: HIGH_RISK final-review provenance (SOL-S05-001).
 *
 * A SOL recheck is a distinct role that may originate from diagnose or
 * ordinary repair paths. For HIGH_RISK work a generic recheck PASS can
 * never prove the mandatory SOL FINAL_REVIEW occurred: completion from
 * AWAITING_SOL_RECHECK requires controller-owned provenance (the recheck
 * references finding(s) whose records carry origin FINAL_REVIEW).
 *
 * CASE A — diagnose-origin recheck PASS -> ROUTE_SOL_FINAL_REVIEW (not
 *          ROUTE_COMPLETE), then final-review PASS -> ROUTE_COMPLETE.
 * CASE B — final-review-origin recheck PASS (provenance) -> ROUTE_COMPLETE.
 * CASE C — forged/missing/invalid provenance cannot complete.
 * CASE D — surviving final-review finding -> STOP_STUCK (preserved).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRoute } from '../../src/routing/policy.mjs';
import { SOL_FINDING_ORIGIN, isValidSolFindingOrigin } from '../../src/routing/reasons.mjs';
import { makeCtx } from '../helpers/routing-fixture.mjs';
import { compileSemanticContract } from '../../src/contracts/compiler.mjs';

const NOW = '2025-01-01T00:00:00.000Z';
const FINAL_FINDING = 'lcim_finding_33333333333333333333333333333333';
const DIAG_FINDING = 'lcim_finding_44444444444444444444444444444444';

function highRiskContract() {
  return compileSemanticContract(
    {
      contractKey: 'fin.provenance',
      title: 'Final review provenance',
      riskClass: 'FINANCIAL',
      sourceObjects: [{ key: 'src', kind: 'fixture', ref: 'x', authority: 'unit test' }],
      concepts: [{ name: 'amount', kind: 'field', authoritativeFieldNames: ['amount'], ownership: 'unit test', sourceObjectKey: 'src' }],
      distinctConcepts: [],
      negativeSideEffects: [],
      factsEstablished: [],
      unresolvedSemantics: [],
    },
    { compiledAt: NOW },
  );
}

function finding(id, origin, { status = 'OPEN', repairCycles = 0, rechecks = 0 } = {}) {
  return { findingId: id, origin, status, repairCycles, rechecks };
}

test('SOL_FINDING_ORIGIN is the closed controller-owned provenance vocabulary', () => {
  assert.deepEqual(SOL_FINDING_ORIGIN, ['FINAL_REVIEW', 'DIAGNOSE']);
  assert.equal(isValidSolFindingOrigin('FINAL_REVIEW'), true);
  assert.equal(isValidSolFindingOrigin('DIAGNOSE'), true);
  assert.equal(isValidSolFindingOrigin('WORKER_CLAIM'), false);
});

test('CASE A: diagnose-origin recheck PASS routes to SOL FINAL_REVIEW before completion', () => {
  const budget = makeCtx().budget;
  const contract = highRiskContract();

  // HIGH_RISK implementation -> semantic rejection -> SOL diagnose
  const diagnose = decideRoute(
    makeCtx({
      state: 'AWAITING_IMPLEMENTATION',
      semanticContract: contract,
      latestRejection: { rejectionCode: 'SEMANTIC_CONFLATION', reason: 'conflated concepts' },
      budget,
      decidedAt: NOW,
    }),
  );
  assert.equal(diagnose.decision, 'ROUTE_SOL_DIAGNOSE');
  assert.equal(diagnose.nextState, 'AWAITING_SOL_DIAGNOSE');

  // diagnosis resolved -> bounded implementation
  const implement = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_DIAGNOSE',
      semanticContract: contract,
      solDiagnosis: { status: 'RESOLVED' },
      budget,
      decidedAt: NOW,
    }),
  );
  assert.equal(implement.decision, 'ROUTE_IMPLEMENT_FLASH');
  assert.equal(implement.nextState, 'AWAITING_IMPLEMENTATION');

  // implementation done; the diagnosis finding still needs its recheck
  const recheck = decideRoute(
    makeCtx({
      state: 'AWAITING_IMPLEMENTATION',
      semanticContract: contract,
      solFindings: [finding(DIAG_FINDING, 'DIAGNOSE', { repairCycles: 1, rechecks: 0 })],
      budget,
      decidedAt: NOW,
    }),
  );
  assert.equal(recheck.decision, 'ROUTE_SOL_RECHECK');
  assert.equal(recheck.nextState, 'AWAITING_SOL_RECHECK');

  // recheck PASSED, but provenance says DIAGNOSE: final review is still mandatory
  const afterRecheck = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_RECHECK',
      semanticContract: contract,
      solReview: { verdict: 'PASSED', findingIds: [DIAG_FINDING] },
      solFindings: [finding(DIAG_FINDING, 'DIAGNOSE', { status: 'RESOLVED', repairCycles: 1, rechecks: 1 })],
      budget,
      decidedAt: NOW,
    }),
  );
  assert.equal(afterRecheck.decision, 'ROUTE_SOL_FINAL_REVIEW');
  assert.notEqual(afterRecheck.decision, 'ROUTE_COMPLETE');
  assert.equal(afterRecheck.nextState, 'AWAITING_SOL_FINAL_REVIEW');
  assert.ok(afterRecheck.evidenceRefs.some((r) => r === 'review:recheck-passed-without-final-review'));

  // then the mandatory SOL FINAL_REVIEW passes -> complete
  const complete = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_FINAL_REVIEW',
      semanticContract: contract,
      solReview: { verdict: 'PASSED' },
      budget,
      decidedAt: NOW,
    }),
  );
  assert.equal(complete.decision, 'ROUTE_COMPLETE');
  assert.equal(complete.nextState, 'UNIT_COMPLETE');
});

test('CASE A variant: diagnose-origin recheck PASS with resultAccepted also routes to final review', () => {
  const contract = highRiskContract();
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_RECHECK',
      semanticContract: contract,
      resultAccepted: true,
      solReview: { verdict: 'PASSED', findingIds: [DIAG_FINDING] },
      solFindings: [finding(DIAG_FINDING, 'DIAGNOSE', { status: 'RESOLVED', repairCycles: 1, rechecks: 1 })],
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_FINAL_REVIEW');
  assert.equal(decision.nextState, 'AWAITING_SOL_FINAL_REVIEW');
});

test('CASE B: final-review-origin recheck PASS (provenance) completes', () => {
  const budget = makeCtx().budget;
  const contract = highRiskContract();

  // accepted HIGH_RISK result -> SOL FINAL_REVIEW
  const review = decideRoute(
    makeCtx({
      state: 'AWAITING_IMPLEMENTATION',
      semanticContract: contract,
      resultAccepted: true,
      budget,
      decidedAt: NOW,
    }),
  );
  assert.equal(review.decision, 'ROUTE_SOL_FINAL_REVIEW');
  assert.equal(review.nextState, 'AWAITING_SOL_FINAL_REVIEW');

  // FINAL_REVIEW produced a localized actionable finding -> one bounded repair
  const repair = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_FINAL_REVIEW',
      semanticContract: contract,
      solReview: { verdict: 'FINDING', findingIds: [FINAL_FINDING] },
      solFindings: [finding(FINAL_FINDING, 'FINAL_REVIEW')],
      budget,
      decidedAt: NOW,
    }),
  );
  assert.equal(repair.decision, 'ROUTE_IMPLEMENT_FLASH');
  assert.equal(repair.targetRole, 'REPAIR');
  assert.equal(repair.nextState, 'AWAITING_REPAIR');

  // repair done -> SOL recheck tied to the final-review finding
  const recheck = decideRoute(
    makeCtx({
      state: 'AWAITING_REPAIR',
      semanticContract: contract,
      solFindings: [finding(FINAL_FINDING, 'FINAL_REVIEW', { repairCycles: 1, rechecks: 0 })],
      budget,
      decidedAt: NOW,
    }),
  );
  assert.equal(recheck.decision, 'ROUTE_SOL_RECHECK');
  assert.equal(recheck.nextState, 'AWAITING_SOL_RECHECK');

  // recheck PASS with final-review provenance -> complete
  const complete = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_RECHECK',
      semanticContract: contract,
      solReview: { verdict: 'PASSED', findingIds: [FINAL_FINDING] },
      solFindings: [finding(FINAL_FINDING, 'FINAL_REVIEW', { status: 'RESOLVED', repairCycles: 1, rechecks: 1 })],
      budget,
      decidedAt: NOW,
    }),
  );
  assert.equal(complete.decision, 'ROUTE_COMPLETE');
  assert.equal(complete.nextState, 'UNIT_COMPLETE');
});

test('CASE C: recheck PASS without findingIds cannot complete HIGH_RISK work', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_RECHECK',
      semanticContract: highRiskContract(),
      solReview: { verdict: 'PASSED' }, // no provenance at all
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_FINAL_REVIEW');
  assert.notEqual(decision.decision, 'ROUTE_COMPLETE');
});

test('CASE C: recheck PASS referencing an unknown finding cannot complete', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_RECHECK',
      semanticContract: highRiskContract(),
      solReview: { verdict: 'PASSED', findingIds: ['lcim_finding_99999999999999999999999999999999'] },
      solFindings: [],
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_FINAL_REVIEW');
});

test('CASE C: recheck PASS referencing a finding without origin cannot complete', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_RECHECK',
      semanticContract: highRiskContract(),
      solReview: { verdict: 'PASSED', findingIds: [DIAG_FINDING] },
      solFindings: [{ findingId: DIAG_FINDING, status: 'RESOLVED', repairCycles: 1, rechecks: 1 }], // no origin field
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_FINAL_REVIEW');
});

test('CASE C: a forged FINAL_REVIEW verdict with DIAGNOSE-origin finding cannot complete', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_RECHECK',
      semanticContract: highRiskContract(),
      solReview: { verdict: 'PASSED', findingIds: [DIAG_FINDING] },
      solFindings: [finding(DIAG_FINDING, 'DIAGNOSE', { status: 'RESOLVED', repairCycles: 1, rechecks: 1 })],
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_FINAL_REVIEW');
});

test('CASE D: surviving final-review finding after repair + recheck stops STUCK', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_RECHECK',
      semanticContract: highRiskContract(),
      solFindings: [finding(FINAL_FINDING, 'FINAL_REVIEW', { repairCycles: 1, rechecks: 1 })], // still OPEN
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'STOP_STUCK');
  assert.equal(decision.reasonCode, 'SOL_FINDING_SURVIVES_ONE_REPAIR');
  assert.equal(decision.nextState, 'STOPPED_STUCK');
});

test('recheck PASS on LOW_RISK work completes without final-review provenance', () => {
  // LOW_RISK units have no mandatory final review: generic recheck PASS completes.
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_RECHECK',
      solReview: { verdict: 'PASSED' },
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_COMPLETE');
  assert.equal(decision.nextState, 'UNIT_COMPLETE');
});

test('final review PASS still completes directly from AWAITING_SOL_FINAL_REVIEW', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_FINAL_REVIEW',
      semanticContract: highRiskContract(),
      solReview: { verdict: 'PASSED' },
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_COMPLETE');
});
