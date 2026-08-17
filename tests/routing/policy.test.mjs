/**
 * Sprint 05 tests: deterministic routing policy — default bounded route,
 * result acceptance, final high-risk review, and fail-closed transitions.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRoute, SEMANTIC_REJECTION_CODES } from '../../src/routing/policy.mjs';
import { RouteStateError } from '../../src/routing/errors.mjs';
import { ConfigError } from '../../src/shared/errors.mjs';
import { makeCtx } from '../helpers/routing-fixture.mjs';
import { compileSemanticContract } from '../../src/contracts/compiler.mjs';

const NOW = '2025-01-01T00:00:00.000Z';

test('normal bounded task routes to DeepSeek V4 Flash xhigh through Pi', () => {
  const decision = decideRoute(makeCtx({ decidedAt: NOW }));
  assert.equal(decision.decision, 'ROUTE_IMPLEMENT_FLASH');
  assert.equal(decision.targetModel, 'deepseek-v4-flash');
  assert.equal(decision.targetProvider, 'pi');
  assert.equal(decision.reasoningLevel, 'XHIGH');
  assert.equal(decision.targetRole, 'IMPLEMENT');
  assert.equal(decision.reasonCode, 'NORMAL_BOUNDED_TASK');
  assert.equal(decision.state, 'ROUTING_READY');
  assert.equal(decision.nextState, 'AWAITING_IMPLEMENTATION');
  assert.equal(decision.schemaName, 'lcim.route-decision');
});

test('default reasoning level is never below XHIGH (no downgrade)', () => {
  const decision = decideRoute(makeCtx());
  assert.equal(decision.reasoningLevel, 'XHIGH');
  assert.ok(['XHIGH', 'MAX'].includes(decision.reasoningLevel));
});

test('an accepted result completes the unit with no further model calls', () => {
  const decision = decideRoute(
    makeCtx({ state: 'AWAITING_IMPLEMENTATION', resultAccepted: true, decidedAt: NOW }),
  );
  assert.equal(decision.decision, 'ROUTE_COMPLETE');
  assert.equal(decision.reasonCode, 'RESULT_ACCEPTED');
  assert.equal(decision.nextState, 'UNIT_COMPLETE');
  assert.equal(decision.targetModel, undefined);
});

test('an accepted result on a HIGH_RISK contract routes to SOL final review first', () => {
  const contract = compileSemanticContract(
    {
      contractKey: 'fin.payment',
      title: 'Payment flow',
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
    makeCtx({ state: 'AWAITING_IMPLEMENTATION', resultAccepted: true, semanticContract: contract, decidedAt: NOW }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_FINAL_REVIEW');
  assert.equal(decision.reasonCode, 'SOL_FINAL_REVIEW');
  assert.equal(decision.targetModel, 'gpt-5.6-sol');
  assert.equal(decision.targetRole, 'SOL_FINAL_REVIEW');
  assert.equal(decision.nextState, 'AWAITING_SOL_FINAL_REVIEW');
});

test('final review PASS completes the unit (outcome + review-state proof)', () => {
  const contract = compileSemanticContract(
    {
      contractKey: 'fin.payment2',
      title: 'Payment flow',
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
      state: 'AWAITING_SOL_FINAL_REVIEW',
      resultAccepted: true,
      solReview: { verdict: 'PASSED' },
      semanticContract: contract,
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_COMPLETE');
  assert.equal(decision.nextState, 'UNIT_COMPLETE');
});

test('a shallow PASSED outcome outside the SOL-review flow cannot complete a high-risk unit', () => {
  const contract = compileSemanticContract(
    {
      contractKey: 'fin.forged',
      title: 'Forged review',
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
      state: 'AWAITING_IMPLEMENTATION',
      resultAccepted: true,
      solReview: { verdict: 'PASSED' }, // forged: no review flow state proves it occurred
      semanticContract: contract,
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_FINAL_REVIEW');
  assert.notEqual(decision.decision, 'ROUTE_COMPLETE');
  assert.equal(decision.nextState, 'AWAITING_SOL_FINAL_REVIEW');
});

test('low-risk contract result completes directly', () => {
  const contract = compileSemanticContract(
    {
      contractKey: 'low.task',
      title: 'Low risk task',
      riskClass: 'LOW_RISK',
      sourceObjects: [{ key: 'src', kind: 'fixture', ref: 'x', authority: 'unit test' }],
      concepts: [{ name: 'flag', kind: 'field', authoritativeFieldNames: ['flag'], ownership: 'unit test', sourceObjectKey: 'src' }],
      distinctConcepts: [],
      negativeSideEffects: [],
      factsEstablished: [],
      unresolvedSemantics: [],
    },
    { compiledAt: NOW },
  );
  const decision = decideRoute(
    makeCtx({ state: 'AWAITING_REPAIR', resultAccepted: true, semanticContract: contract, decidedAt: NOW }),
  );
  assert.equal(decision.decision, 'ROUTE_COMPLETE');
});

test('routing refuses to decide from a terminal state (fail closed)', () => {
  for (const state of ['UNIT_COMPLETE', 'STOPPED_STUCK', 'STOPPED_BUDGET', 'FAILED_NO_SUBSTITUTE']) {
    assert.throws(() => decideRoute(makeCtx({ state })), RouteStateError);
  }
});

test('an undefined transition throws RouteStateError instead of silently defaulting', () => {
  // RESULT_ACCEPTED is not a defined transition from ROUTING_READY
  assert.throws(
    () => decideRoute(makeCtx({ state: 'ROUTING_READY', resultAccepted: true })),
    RouteStateError,
  );
});

test('semantic rejection codes are the locked escalation set', () => {
  assert.deepEqual([...SEMANTIC_REJECTION_CODES].sort(), [
    'SEMANTIC_CONFLATION',
    'UNRESOLVED_SEMANTICS',
    'UNSUPPORTED_CLAIM',
  ]);
});

test('decisions record evidence refs and decision ids', () => {
  const decision = decideRoute(makeCtx({ evidenceRefs: ['invocation:lcim_inv_22222222222222222222222222222222'] }));
  assert.ok(decision.evidenceRefs.includes('invocation:lcim_inv_22222222222222222222222222222222'));
  assert.match(decision.decisionId, /^lcim_route_[0-9a-f]{32}$/);
});

test('malformed context fails closed with a config error', () => {
  assert.throws(() => decideRoute(null), ConfigError);
  assert.throws(() => decideRoute({}), ConfigError);
  assert.throws(() => decideRoute(makeCtx({ budget: null })), ConfigError);
});
