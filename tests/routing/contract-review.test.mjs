/**
 * Sprint 05 tests: unresolved high-risk contracts route to SOL contract
 * check, never to implementation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRoute } from '../../src/routing/policy.mjs';
import { compileSemanticContract } from '../../src/contracts/compiler.mjs';
import { makeCtx } from '../helpers/routing-fixture.mjs';

const NOW = '2025-01-01T00:00:00.000Z';

function contractWithUnresolved(riskClass, unresolvedRiskClass) {
  return compileSemanticContract(
    {
      contractKey: 'route.contract',
      title: 'Routing test contract',
      riskClass,
      sourceObjects: [{ key: 'src', kind: 'fixture', ref: 'x', authority: 'unit test' }],
      concepts: [{ name: 'ticker', kind: 'ticker', authoritativeFieldNames: ['ticker_value'], ownership: 'unit test', sourceObjectKey: 'src' }],
      distinctConcepts: [],
      negativeSideEffects: [],
      factsEstablished: [],
      unresolvedSemantics: [{ question: 'Which source is authoritative for ticker_value?', riskClass: unresolvedRiskClass }],
    },
    { compiledAt: NOW },
  );
}

test('CONTRACT_REVIEW_REQUIRED (high-risk unresolved) routes to SOL contract check, not implementation', () => {
  const contract = contractWithUnresolved('FINANCIAL', 'FINANCIAL');
  assert.equal(contract.compileStatus, 'CONTRACT_REVIEW_REQUIRED');
  const decision = decideRoute(makeCtx({ semanticContract: contract, decidedAt: NOW }));
  assert.equal(decision.decision, 'ROUTE_SOL_CONTRACT_CHECK');
  assert.equal(decision.reasonCode, 'UNRESOLVED_HIGH_RISK_CONTRACT');
  assert.equal(decision.targetModel, 'gpt-5.6-sol');
  assert.equal(decision.targetRole, 'SOL_CONTRACT_CHECK');
  assert.equal(decision.targetProvider, 'pi');
  assert.equal(decision.reasoningLevel, 'XHIGH');
  assert.equal(decision.nextState, 'AWAITING_SOL_CONTRACT_CHECK');
  assert.ok(decision.evidenceRefs.some((r) => r.startsWith('contract:route.contract')));
});

test('a review-required contract never produces an implementation route', () => {
  const contract = contractWithUnresolved('IDENTITY', 'IDENTITY');
  const decision = decideRoute(makeCtx({ semanticContract: contract, decidedAt: NOW }));
  assert.equal(decision.decision, 'ROUTE_SOL_CONTRACT_CHECK');
  assert.notEqual(decision.decision, 'ROUTE_IMPLEMENT_FLASH');
});

test('explicit contractReviewRequired flag works without a compiled contract', () => {
  const decision = decideRoute(makeCtx({ contractReviewRequired: true, decidedAt: NOW }));
  assert.equal(decision.decision, 'ROUTE_SOL_CONTRACT_CHECK');
  assert.equal(decision.nextState, 'AWAITING_SOL_CONTRACT_CHECK');
});

test('COMPILED contract with only low-risk unresolved semantics routes to implementation', () => {
  const contract = contractWithUnresolved('LOW_RISK', 'LOW_RISK');
  assert.equal(contract.compileStatus, 'COMPILED');
  const decision = decideRoute(makeCtx({ semanticContract: contract, decidedAt: NOW }));
  assert.equal(decision.decision, 'ROUTE_IMPLEMENT_FLASH');
  assert.equal(decision.targetModel, 'deepseek-v4-flash');
  assert.equal(decision.reasoningLevel, 'XHIGH');
});

test('no contract at all still takes the default bounded route', () => {
  const decision = decideRoute(makeCtx({ decidedAt: NOW }));
  assert.equal(decision.decision, 'ROUTE_IMPLEMENT_FLASH');
  assert.equal(decision.reasonCode, 'NORMAL_BOUNDED_TASK');
});
