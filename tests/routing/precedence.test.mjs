/**
 * Sprint 05 tests: policy precedence matrix (SOL-S05-001).
 *
 * Hard controller facts must never be bypassed by earlier
 * acceptance/escalation branches. These are the exact reachable
 * contradictions the review required to be reordered or guarded:
 *
 * 1. surviving finding + resultAccepted   => STOP_STUCK
 * 2. due recheck + resultAccepted         => ROUTE_SOL_RECHECK
 * 3. semantic rejection + resultAccepted  => ROUTE_SOL_DIAGNOSE
 * 4. same-AC STUCK + valid Pro escalation => STOP_STUCK
 * 5. forged final-review proof outside the valid review flow => cannot complete
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRoute } from '../../src/routing/policy.mjs';
import { RoutingError, RouteStateError } from '../../src/routing/errors.mjs';
import { createBudgetTracker } from '../../src/routing/budget.mjs';
import { makeCtx } from '../helpers/routing-fixture.mjs';
import { compileSemanticContract } from '../../src/contracts/compiler.mjs';

const NOW = '2025-01-01T00:00:00.000Z';
const FINDING = 'lcim_finding_33333333333333333333333333333333';

test('surviving finding + resultAccepted => STOP_STUCK (stuck beats completion)', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_RECHECK',
      resultAccepted: true,
      solFindings: [{ findingId: FINDING, status: 'OPEN', repairCycles: 1, rechecks: 1 }],
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'STOP_STUCK');
  assert.equal(decision.reasonCode, 'SOL_FINDING_SURVIVES_ONE_REPAIR');
  assert.equal(decision.nextState, 'STOPPED_STUCK');
});

test('due recheck + resultAccepted => ROUTE_SOL_RECHECK (recheck beats completion)', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_REPAIR',
      resultAccepted: true,
      solFindings: [{ findingId: FINDING, status: 'OPEN', repairCycles: 1, rechecks: 0 }],
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_RECHECK');
  assert.equal(decision.reasonCode, 'SOL_RECHECK_AFTER_REPAIR');
  assert.equal(decision.nextState, 'AWAITING_SOL_RECHECK');
});

test('semantic rejection + resultAccepted => ROUTE_SOL_DIAGNOSE (escalation beats completion)', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_IMPLEMENTATION',
      resultAccepted: true,
      latestRejection: { rejectionCode: 'SEMANTIC_CONFLATION', reason: 'conflated digests' },
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_DIAGNOSE');
  assert.equal(decision.nextState, 'AWAITING_SOL_DIAGNOSE');
});

test('same-AC STUCK + valid Pro escalation => STOP_STUCK (stuck beats escalation)', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_REPAIR',
      failureHistory: [
        { rejectedAcceptanceRefs: ['ac-1'], credibleHypothesis: true },
        { rejectedAcceptanceRefs: ['ac-1'], credibleHypothesis: true },
      ],
      repairsDispatched: 1,
      escalation: { model: 'deepseek-pro-max', basis: 'SOL_DIRECTED_REPAIR', detail: 'SOL directed difficult repair' },
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'STOP_STUCK');
  assert.equal(decision.reasonCode, 'SAME_AC_FAILED_AFTER_REPAIR');
  assert.equal(decision.nextState, 'STOPPED_STUCK');
});

test('forged PASSED review proof outside the review flow cannot complete a high-risk unit', () => {
  const contract = compileSemanticContract(
    {
      contractKey: 'fin.forge',
      title: 'Forged review proof',
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
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_IMPLEMENTATION', // never entered the SOL-review flow
      resultAccepted: true,
      solReview: { verdict: 'PASSED' }, // forged outcome: no review-state proof
      semanticContract: contract,
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_FINAL_REVIEW');
  assert.equal(decision.nextState, 'AWAITING_SOL_FINAL_REVIEW');
});

test('resultAccepted inside the review flow without an outcome fails closed', () => {
  assert.throws(
    () =>
      decideRoute(
        makeCtx({ state: 'AWAITING_SOL_FINAL_REVIEW', resultAccepted: true, decidedAt: NOW }),
      ),
    RoutingError,
  );
});

test('resultAccepted contradicting a FINDING verdict fails closed', () => {
  assert.throws(
    () =>
      decideRoute(
        makeCtx({
          state: 'AWAITING_SOL_FINAL_REVIEW',
          resultAccepted: true,
          solReview: { verdict: 'FINDING', findingIds: [FINDING] },
          decidedAt: NOW,
        }),
      ),
    RoutingError,
  );
});

test('budget still outranks everything', () => {
  const budget = createBudgetTracker({ unitCalls: 1, runCalls: 1 });
  budget.consume();
  const decision = decideRoute(
    makeCtx({
      budget,
      state: 'AWAITING_IMPLEMENTATION',
      resultAccepted: true,
      latestRejection: { rejectionCode: 'SEMANTIC_CONFLATION', reason: 'x' },
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'STOP_BUDGET');
});

test('terminal states still absorb every decision attempt', () => {
  assert.throws(
    () => decideRoute(makeCtx({ state: 'UNIT_COMPLETE', resultAccepted: true })),
    RouteStateError,
  );
});
