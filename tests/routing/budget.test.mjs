/**
 * Sprint 05 tests: hard per-run/per-unit call budgets — stop/fail states,
 * no silent budget overrun.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createBudgetTracker } from '../../src/routing/budget.mjs';
import { BudgetExhaustedError } from '../../src/routing/errors.mjs';
import { ConfigError } from '../../src/shared/errors.mjs';
import { decideRoute } from '../../src/routing/policy.mjs';
import { makeCtx } from '../helpers/routing-fixture.mjs';

const NOW = '2025-01-01T00:00:00.000Z';

test('an exhausted budget fails closed to STOP_BUDGET even for a normal task', () => {
  const budget = createBudgetTracker({ unitCalls: 1, runCalls: 1 });
  budget.consume();
  const decision = decideRoute(makeCtx({ budget, decidedAt: NOW }));
  assert.equal(decision.decision, 'STOP_BUDGET');
  assert.equal(decision.reasonCode, 'BUDGET_EXHAUSTED');
  assert.equal(decision.nextState, 'STOPPED_BUDGET');
});

test('no route is ever produced past a hard budget (no silent overrun)', () => {
  const budget = createBudgetTracker({ unitCalls: 0, runCalls: 0 });
  const decision = decideRoute(makeCtx({ budget, decidedAt: NOW }));
  assert.equal(decision.decision, 'STOP_BUDGET');
  assert.ok(!decision.decision.startsWith('ROUTE_'));
});

test('consume() past the limit throws BudgetExhaustedError (belt and braces)', () => {
  const budget = createBudgetTracker({ unitCalls: 1, runCalls: 5 });
  budget.consume();
  assert.throws(() => budget.consume(), BudgetExhaustedError);
});

test('consumption is atomic: a failed consume changes no counters', () => {
  const budget = createBudgetTracker({ unitCalls: 1, runCalls: 1 });
  budget.consume();
  const before = budget.snapshot();
  assert.throws(() => budget.consume(), BudgetExhaustedError);
  assert.deepEqual(budget.snapshot(), before);
});

test('per-unit limit and per-run limit are both enforced', () => {
  const budget = createBudgetTracker({ unitCalls: 2, runCalls: 3 });
  budget.consume();
  budget.consume(); // unit now exhausted (2/2), run at 2/3
  assert.equal(budget.available(), false);

  // new unit resets the unit counter but the run counter persists
  budget.resetUnit();
  assert.equal(budget.available(), true);
  budget.consume(); // run 3/3
  assert.equal(budget.available(), false);
  budget.resetUnit();
  assert.equal(budget.available(), false); // run cap still binds
});

test('route decisions record the budget snapshot for audit', () => {
  const budget = createBudgetTracker({ unitCalls: 4, runCalls: 10 });
  budget.consume();
  budget.consume();
  const decision = decideRoute(makeCtx({ budget, decidedAt: NOW }));
  assert.deepEqual(decision.budget, {
    unitCallsConsumed: 2,
    unitCallsLimit: 4,
    runCallsConsumed: 2,
    runCallsLimit: 10,
  });
});

test('a unit that exhausts its budget mid-flow stops, and run budget is shared across units', () => {
  const budget = createBudgetTracker({ unitCalls: 2, runCalls: 4 });

  // unit 1: two dispatches (simulated via consume), then routing fails closed
  budget.consume();
  budget.consume();
  let decision = decideRoute(makeCtx({ budget, decidedAt: NOW }));
  assert.equal(decision.decision, 'STOP_BUDGET');

  // unit 2 starts with a fresh unit counter but only 2 run calls remain
  budget.resetUnit();
  decision = decideRoute(makeCtx({ budget, decidedAt: NOW }));
  assert.equal(decision.decision, 'ROUTE_IMPLEMENT_FLASH');
  budget.consume();
  decision = decideRoute(makeCtx({ budget, decidedAt: NOW }));
  assert.equal(decision.decision, 'ROUTE_IMPLEMENT_FLASH');
  budget.consume();
  decision = decideRoute(makeCtx({ budget, decidedAt: NOW }));
  assert.equal(decision.decision, 'STOP_BUDGET');
  assert.equal(budget.snapshot().runCallsConsumed, 4);
});

test('invalid budget limits are configuration errors', () => {
  assert.throws(() => createBudgetTracker({ unitCalls: -1, runCalls: 5 }), ConfigError);
  assert.throws(() => createBudgetTracker({ unitCalls: 1.5, runCalls: 5 }), ConfigError);
  assert.throws(() => createBudgetTracker({ unitCalls: 1, runCalls: 'x' }), ConfigError);
});
