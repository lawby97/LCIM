/**
 * Sprint 05 tests: SOL outcome flows through the state machine (SOL-S05-005).
 *
 * Deterministic controller-owned SOL outcome facts make every SOL state
 * usable — no Sprint-06 prompt text, no Sprint-10 orchestration, no manual
 * state teleporting. Flows covered:
 *
 * - contract check -> resolved validated COMPILED contract -> implementation
 * - diagnose -> resolved diagnosis -> bounded implementation
 * - final review finding -> one bounded repair -> SOL recheck
 * - surviving finding after repair + recheck -> STUCK
 * - final review PASS -> complete
 * - no extra call after terminal completion
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRoute } from '../../src/routing/policy.mjs';
import { RoutingError, RouteStateError } from '../../src/routing/errors.mjs';
import { makeCtx } from '../helpers/routing-fixture.mjs';
import { compileSemanticContract } from '../../src/contracts/compiler.mjs';

const NOW = '2025-01-01T00:00:00.000Z';
const FINDING = 'lcim_finding_33333333333333333333333333333333';

function highRiskContract() {
  return compileSemanticContract(
    {
      contractKey: 'fin.flow',
      title: 'Final review flow',
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

function resolvedContract() {
  return compileSemanticContract(
    {
      contractKey: 'fin.resolved',
      title: 'Resolved contract',
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

test('contract check -> resolved validated COMPILED contract -> implementation', () => {
  const budget = makeCtx().budget;
  // step 1: unresolved high-risk contract routes to SOL contract check
  const check = decideRoute(makeCtx({ contractReviewRequired: true, budget, decidedAt: NOW }));
  assert.equal(check.decision, 'ROUTE_SOL_CONTRACT_CHECK');
  assert.equal(check.nextState, 'AWAITING_SOL_CONTRACT_CHECK');
  // step 2: controller supplies the resolved validated contract
  const proceed = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_CONTRACT_CHECK',
      semanticContract: resolvedContract(),
      budget,
      decidedAt: NOW,
    }),
  );
  assert.equal(proceed.decision, 'ROUTE_IMPLEMENT_FLASH');
  assert.equal(proceed.targetRole, 'IMPLEMENT');
  assert.equal(proceed.targetModel, 'deepseek-v4-flash');
  assert.equal(proceed.nextState, 'AWAITING_IMPLEMENTATION');
  assert.ok(proceed.evidenceRefs.some((r) => r === 'contract-check:resolved'));
});

test('contract check outcome still unresolved stays in contract check (re-check)', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_CONTRACT_CHECK',
      semanticContract: compileSemanticContract(
        {
          contractKey: 'fin.still',
          title: 'Still unresolved',
          riskClass: 'FINANCIAL',
          sourceObjects: [{ key: 'src', kind: 'fixture', ref: 'x', authority: 'unit test' }],
          concepts: [{ name: 'amount', kind: 'field', authoritativeFieldNames: ['amount'], ownership: 'unit test', sourceObjectKey: 'src' }],
          distinctConcepts: [],
          negativeSideEffects: [],
          factsEstablished: [],
          unresolvedSemantics: [{ question: 'still unresolved', riskClass: 'FINANCIAL' }],
        },
        { compiledAt: NOW },
      ),
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_CONTRACT_CHECK');
  assert.equal(decision.nextState, 'AWAITING_SOL_CONTRACT_CHECK');
});

test('contract check state without a resolved outcome fails closed', () => {
  assert.throws(
    () => decideRoute(makeCtx({ state: 'AWAITING_SOL_CONTRACT_CHECK', decidedAt: NOW })),
    RoutingError,
  );
});

test('diagnose -> resolved diagnosis -> bounded implementation', () => {
  const budget = makeCtx().budget;
  const diagnose = decideRoute(
    makeCtx({
      state: 'AWAITING_IMPLEMENTATION',
      latestRejection: { rejectionCode: 'UNRESOLVED_SEMANTICS', reason: 'x' },
      budget,
      decidedAt: NOW,
    }),
  );
  assert.equal(diagnose.decision, 'ROUTE_SOL_DIAGNOSE');
  assert.equal(diagnose.nextState, 'AWAITING_SOL_DIAGNOSE');
  const proceed = decideRoute(
    makeCtx({ state: 'AWAITING_SOL_DIAGNOSE', solDiagnosis: { status: 'RESOLVED' }, budget, decidedAt: NOW }),
  );
  assert.equal(proceed.decision, 'ROUTE_IMPLEMENT_FLASH');
  assert.equal(proceed.targetRole, 'IMPLEMENT');
  assert.equal(proceed.nextState, 'AWAITING_IMPLEMENTATION');
  assert.ok(proceed.evidenceRefs.some((r) => r === 'diagnosis:resolved'));
});

test('diagnose state without a resolved outcome fails closed', () => {
  assert.throws(
    () => decideRoute(makeCtx({ state: 'AWAITING_SOL_DIAGNOSE', decidedAt: NOW })),
    RoutingError,
  );
});

test('final review finding -> one bounded repair -> SOL recheck', () => {
  const budget = makeCtx().budget;
  // accepted high-risk result -> final review
  const review = decideRoute(
    makeCtx({
      state: 'AWAITING_IMPLEMENTATION',
      resultAccepted: true,
      semanticContract: highRiskContract(),
      budget,
      decidedAt: NOW,
    }),
  );
  assert.equal(review.decision, 'ROUTE_SOL_FINAL_REVIEW');
  assert.equal(review.nextState, 'AWAITING_SOL_FINAL_REVIEW');
  // final review returns a localized actionable finding -> one bounded repair
  const repair = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_FINAL_REVIEW',
      solReview: { verdict: 'FINDING', findingIds: [FINDING] },
      solFindings: [{ findingId: FINDING, status: 'OPEN', repairCycles: 0, rechecks: 0 }],
      budget,
      decidedAt: NOW,
    }),
  );
  assert.equal(repair.decision, 'ROUTE_IMPLEMENT_FLASH');
  assert.equal(repair.targetRole, 'REPAIR');
  assert.equal(repair.reasonCode, 'REPAIR_TARGETED_FIRST');
  assert.equal(repair.nextState, 'AWAITING_REPAIR');
  // repair done, finding still open -> SOL recheck
  const recheck = decideRoute(
    makeCtx({
      state: 'AWAITING_REPAIR',
      solFindings: [{ findingId: FINDING, status: 'OPEN', repairCycles: 1, rechecks: 0 }],
      budget,
      decidedAt: NOW,
    }),
  );
  assert.equal(recheck.decision, 'ROUTE_SOL_RECHECK');
  assert.equal(recheck.nextState, 'AWAITING_SOL_RECHECK');
});

test('surviving finding after repair + recheck becomes STUCK', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_RECHECK',
      solFindings: [{ findingId: FINDING, status: 'OPEN', repairCycles: 1, rechecks: 1 }],
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'STOP_STUCK');
  assert.equal(decision.reasonCode, 'SOL_FINDING_SURVIVES_ONE_REPAIR');
  assert.equal(decision.nextState, 'STOPPED_STUCK');
});

test('recheck verdict FINDING also stops STUCK (survived this recheck)', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_RECHECK',
      solReview: { verdict: 'FINDING', findingIds: [FINDING] },
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'STOP_STUCK');
  assert.equal(decision.reasonCode, 'SOL_FINDING_SURVIVES_ONE_REPAIR');
});

test('final review PASS -> complete, and no extra call after terminal completion', () => {
  const budget = makeCtx().budget;
  const passed = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_FINAL_REVIEW',
      solReview: { verdict: 'PASSED' },
      budget,
      decidedAt: NOW,
    }),
  );
  assert.equal(passed.decision, 'ROUTE_COMPLETE');
  assert.equal(passed.nextState, 'UNIT_COMPLETE');
  const callsBefore = budget.snapshot();
  // terminal completion: no further decision is possible (no extra call)
  assert.throws(
    () => decideRoute(makeCtx({ state: 'UNIT_COMPLETE', budget, decidedAt: NOW })),
    RouteStateError,
  );
  assert.deepEqual(budget.snapshot(), callsBefore);
});

test('recheck PASS -> complete', () => {
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

test('an invalid solReview verdict fails closed', () => {
  assert.throws(
    () => decideRoute(makeCtx({ state: 'AWAITING_SOL_FINAL_REVIEW', solReview: { verdict: 'MAYBE' } })),
    RoutingError,
  );
});
