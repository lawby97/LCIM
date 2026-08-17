/**
 * Sprint 05 tests: semantic rejection escalates immediately to SOL — no
 * wasteful equivalent DeepSeek retries.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRoute } from '../../src/routing/policy.mjs';
import { RouteStateError } from '../../src/routing/errors.mjs';
import { makeCtx } from '../helpers/routing-fixture.mjs';

const NOW = '2025-01-01T00:00:00.000Z';

for (const rejectionCode of ['SEMANTIC_CONFLATION', 'UNRESOLVED_SEMANTICS', 'UNSUPPORTED_CLAIM']) {
  test(`semantic rejection ${rejectionCode} escalates immediately to SOL diagnose`, () => {
    const decision = decideRoute(
      makeCtx({
        state: 'AWAITING_IMPLEMENTATION',
        latestRejection: { rejectionCode, reason: 'test' },
        decidedAt: NOW,
      }),
    );
    assert.equal(decision.decision, 'ROUTE_SOL_DIAGNOSE');
    assert.equal(decision.reasonCode, 'SEMANTIC_REJECTION_ESCALATION');
    assert.equal(decision.targetModel, 'gpt-5.6-sol');
    assert.equal(decision.targetProvider, 'pi');
    assert.equal(decision.targetRole, 'SOL_DIAGNOSE');
    assert.equal(decision.nextState, 'AWAITING_SOL_DIAGNOSE');
    assert.ok(decision.evidenceRefs.some((r) => r === `rejection:${rejectionCode}`));
  });
}

test('semantic rejection consumes no implementation budget (no wasteful repeats)', () => {
  const budget = makeCtx().budget;
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_IMPLEMENTATION',
      latestRejection: { rejectionCode: 'SEMANTIC_CONFLATION', reason: 'conflated digest and identity' },
      budget,
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_DIAGNOSE');
  assert.equal(budget.snapshot().unitCallsConsumed, 0);
  assert.equal(budget.snapshot().runCallsConsumed, 0);
});

test('semantic rejection escalates even after a Pro MAX result (top rung still yields to SOL)', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_PRO_MAX',
      latestRejection: { rejectionCode: 'UNRESOLVED_SEMANTICS', reason: 'test' },
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_DIAGNOSE');
  assert.equal(decision.nextState, 'AWAITING_SOL_DIAGNOSE');
});

test('non-semantic rejection codes do not trigger the escalation path', () => {
  for (const rejectionCode of ['WRONG_BASE', 'SCOPE_VIOLATION', 'TRANSPORT_MALFORMED', 'BUDGET_EXHAUSTED']) {
    const decision = decideRoute(
      makeCtx({
        state: 'ROUTING_READY',
        latestRejection: { rejectionCode, reason: 'test' },
        decidedAt: NOW,
      }),
    );
    assert.notEqual(decision.decision, 'ROUTE_SOL_DIAGNOSE', rejectionCode);
  }
});

test('non-semantic rejection still takes the default bounded route', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'ROUTING_READY',
      latestRejection: { rejectionCode: 'WRONG_BASE', reason: 'test' },
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_IMPLEMENT_FLASH');
  assert.equal(decision.targetModel, 'deepseek-v4-flash');
});

test('a non-semantic rejection mid-flight with no other input fails closed (no re-dispatch)', () => {
  // In AWAITING_IMPLEMENTATION a non-semantic rejection is not a routing
  // event: re-dispatching would be a silent default, so the policy refuses.
  assert.throws(
    () =>
      decideRoute(
        makeCtx({
          state: 'AWAITING_IMPLEMENTATION',
          latestRejection: { rejectionCode: 'WRONG_BASE', reason: 'test' },
          decidedAt: NOW,
        }),
      ),
    RouteStateError,
  );
});
