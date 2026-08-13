/**
 * Sprint 05 tests: the bounded repair policy.
 *
 * A first localized failure with a credible hypothesis gets AT MOST ONE
 * bounded Flash repair. The same acceptance criterion failing after that
 * repair stops the unit STUCK; nothing ever dispatches a second repair.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRoute } from '../../src/routing/policy.mjs';
import { makeCtx } from '../helpers/routing-fixture.mjs';

const NOW = '2025-01-01T00:00:00.000Z';

test('first localized failure with credible hypothesis -> exactly one bounded Flash repair', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_IMPLEMENTATION',
      failureHistory: [{ rejectedAcceptanceRefs: ['ac-1'], credibleHypothesis: true }],
      repairsDispatched: 0,
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_IMPLEMENT_FLASH');
  assert.equal(decision.reasonCode, 'REPAIR_TARGETED_FIRST');
  assert.equal(decision.targetRole, 'REPAIR');
  assert.equal(decision.targetModel, 'deepseek-v4-flash');
  assert.equal(decision.reasoningLevel, 'XHIGH');
  assert.equal(decision.nextState, 'AWAITING_REPAIR');
});

test('same acceptance criterion failing after the repair stops STUCK (no second repair)', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_REPAIR',
      failureHistory: [
        { rejectedAcceptanceRefs: ['ac-1'], credibleHypothesis: true },
        { rejectedAcceptanceRefs: ['ac-1'], credibleHypothesis: true },
      ],
      repairsDispatched: 1,
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'STOP_STUCK');
  assert.equal(decision.reasonCode, 'SAME_AC_FAILED_AFTER_REPAIR');
  assert.equal(decision.nextState, 'STOPPED_STUCK');
  assert.ok(decision.evidenceRefs.some((r) => r === 'stuck:SAME_AC_FAILED_AFTER_REPAIR'));
});

test('end-to-end: initial + at most one repair, then STUCK; implementation calls capped at 2', () => {
  const budget = makeCtx().budget;
  const calls = [];

  // call 1: initial dispatch
  let decision = decideRoute(makeCtx({ budget, decidedAt: NOW }));
  assert.equal(decision.decision, 'ROUTE_IMPLEMENT_FLASH');
  assert.equal(decision.targetRole, 'IMPLEMENT');
  budget.consume();
  calls.push(decision.targetRole);

  // failure ac-1 with a credible hypothesis
  decision = decideRoute(
    makeCtx({
      state: 'AWAITING_IMPLEMENTATION',
      failureHistory: [{ rejectedAcceptanceRefs: ['ac-1'], credibleHypothesis: true }],
      budget,
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_IMPLEMENT_FLASH');
  assert.equal(decision.targetRole, 'REPAIR');
  budget.consume();
  calls.push(decision.targetRole);

  // same AC fails again after the repair
  decision = decideRoute(
    makeCtx({
      state: 'AWAITING_REPAIR',
      failureHistory: [
        { rejectedAcceptanceRefs: ['ac-1'], credibleHypothesis: true },
        { rejectedAcceptanceRefs: ['ac-1'], credibleHypothesis: true },
      ],
      repairsDispatched: 1,
      budget,
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'STOP_STUCK');

  // no further implementation call was ever produced
  assert.deepEqual(calls, ['IMPLEMENT', 'REPAIR']);
  assert.equal(budget.snapshot().unitCallsConsumed, 2);
});

test('a failure without a credible hypothesis stops STUCK (no repair is wasted)', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_IMPLEMENTATION',
      failureHistory: [{ rejectedAcceptanceRefs: ['ac-1'], credibleHypothesis: false }],
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'STOP_STUCK');
  assert.equal(decision.reasonCode, 'NO_FALSIFIABLE_EXPLANATION');
});

test('a fresh acceptance criterion failing after a previous repair still gets its one bounded repair', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_IMPLEMENTATION',
      failureHistory: [
        { rejectedAcceptanceRefs: ['ac-1'], credibleHypothesis: true },
        { rejectedAcceptanceRefs: ['ac-2'], credibleHypothesis: true },
      ],
      repairsDispatched: 1,
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_IMPLEMENT_FLASH');
  assert.equal(decision.reasonCode, 'REPAIR_TARGETED_FIRST');
  assert.equal(decision.targetRole, 'REPAIR');
});

test('a credible failure after Pro MAX never downgrades to a Flash repair', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_PRO_MAX',
      failureHistory: [{ rejectedAcceptanceRefs: ['ac-9'], credibleHypothesis: true }],
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'STOP_STUCK');
  assert.equal(decision.reasonCode, 'REPAIR_LIMIT_REACHED');
});
