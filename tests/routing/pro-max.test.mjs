/**
 * Sprint 05 tests: DeepSeek Pro MAX is escalation-only and every Pro MAX
 * usage carries a machine-readable justification.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRoute } from '../../src/routing/policy.mjs';
import { RoutingError } from '../../src/routing/errors.mjs';
import { makeCtx, defaultConfig } from '../helpers/routing-fixture.mjs';

const NOW = '2025-01-01T00:00:00.000Z';

function escalate(basis, detail = 'machine-readable bounded reason') {
  return { model: 'deepseek-pro-max', basis, detail };
}

for (const basis of ['SOL_DIRECTED_REPAIR', 'CONFIRMED_CAPABILITY_FAILURE', 'CONTRACT_LOCKED_DIFFICULT_TASK']) {
  test(`Pro MAX escalation with basis ${basis} carries a machine-readable justification`, () => {
    const decision = decideRoute(
      makeCtx({ state: 'AWAITING_SOL_DIAGNOSE', escalation: escalate(basis), decidedAt: NOW }),
    );
    assert.equal(decision.decision, 'ROUTE_IMPLEMENT_PRO_MAX');
    assert.equal(decision.reasonCode, 'PRO_MAX_ESCALATION');
    assert.equal(decision.targetModel, 'deepseek-pro-max');
    assert.equal(decision.reasoningLevel, 'MAX');
    assert.equal(decision.nextState, 'AWAITING_PRO_MAX');
    assert.deepEqual(decision.escalationJustification, { basis, detail: 'machine-readable bounded reason' });
  });
}

test('Pro MAX is never chosen without an explicit escalation request', () => {
  const decision = decideRoute(makeCtx({ decidedAt: NOW }));
  assert.equal(decision.decision, 'ROUTE_IMPLEMENT_FLASH');
  assert.equal(decision.targetModel, 'deepseek-v4-flash');
  // also with failures and rejections present but no escalation
  const failing = decideRoute(
    makeCtx({
      state: 'AWAITING_IMPLEMENTATION',
      failureHistory: [{ rejectedAcceptanceRefs: ['ac-1'], credibleHypothesis: true }],
      decidedAt: NOW,
    }),
  );
  assert.notEqual(failing.decision, 'ROUTE_IMPLEMENT_PRO_MAX');
});

test('an invalid escalation basis is a hard routing error, never a silent default', () => {
  assert.throws(
    () => decideRoute(makeCtx({ escalation: escalate('I_FELT_LIKE_IT') })),
    RoutingError,
  );
});

test('Flash MAX accepts only CONTRACT_LOCKED_DIFFICULT_TASK', () => {
  const ok = decideRoute(
    makeCtx({ escalation: { model: 'deepseek-v4-flash', basis: 'CONTRACT_LOCKED_DIFFICULT_TASK', detail: 'contract-locked difficult' }, decidedAt: NOW }),
  );
  assert.equal(ok.decision, 'ROUTE_IMPLEMENT_FLASH_MAX');
  assert.equal(ok.reasoningLevel, 'MAX');
  assert.equal(ok.targetModel, 'deepseek-v4-flash');
  assert.deepEqual(ok.escalationJustification.basis, 'CONTRACT_LOCKED_DIFFICULT_TASK');

  assert.throws(
    () => decideRoute(makeCtx({ escalation: { model: 'deepseek-v4-flash', basis: 'SOL_DIRECTED_REPAIR', detail: 'x' } })),
    RoutingError,
  );
});

test('Pro MAX escalation fails closed when the model is not discovered', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_DIAGNOSE',
      escalation: escalate('SOL_DIRECTED_REPAIR'),
      config: { endpoints: { 'deepseek-v4-flash': defaultConfig().endpoints['deepseek-v4-flash'] } },
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'FAIL_NO_SUBSTITUTE');
  assert.equal(decision.reasonCode, 'PROVIDER_UNAVAILABLE');
  assert.equal(decision.nextState, 'FAILED_NO_SUBSTITUTE');
});

test('escalation with missing detail is a hard routing error', () => {
  assert.throws(
    () => decideRoute(makeCtx({ escalation: { model: 'deepseek-pro-max', basis: 'SOL_DIRECTED_REPAIR', detail: '' } })),
    RoutingError,
  );
});
