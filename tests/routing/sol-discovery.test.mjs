/**
 * Sprint 05 tests: exact SOL discovery (SOL-S05-003).
 *
 * Every automatic ROUTE_SOL_* decision must first resolve exact sol-xhigh
 * availability/capability (provider sol, model sol-xhigh, XHIGH, role).
 * Missing endpoint => FAIL_NO_SUBSTITUTE (fail closed, no silent
 * substitute, no downgrade). Positive tests configure SOL explicitly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRoute } from '../../src/routing/policy.mjs';
import { discoverSolRoute } from '../../src/providers/capabilities/discovery.mjs';
import { ProviderDiscoveryError } from '../../src/routing/errors.mjs';
import { makeCtx, SOL_ENDPOINT } from '../helpers/routing-fixture.mjs';
import { compileSemanticContract } from '../../src/contracts/compiler.mjs';

const NOW = '2025-01-01T00:00:00.000Z';
const FINDING = 'lcim_finding_33333333333333333333333333333333';

const HIGH_RISK_CONTRACT = compileSemanticContract(
  {
    contractKey: 'fin.sol',
    title: 'SOL discovery contract',
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

/** Config without any sol-xhigh endpoint. */
function configWithoutSol() {
  return {
    endpoints: {
      'deepseek-v4-flash': makeCtx().config.endpoints['deepseek-v4-flash'],
      'deepseek-pro-max': makeCtx().config.endpoints['deepseek-pro-max'],
    },
  };
}

test('discoverSolRoute requires the exact role capability on sol-xhigh', () => {
  const spec = discoverSolRoute('SOL_CONTRACT_CHECK', makeCtx().config);
  assert.equal(spec.modelKey, 'sol-xhigh');
  assert.equal(spec.provider, 'sol');
  assert.equal(spec.role, 'SOL_CONTRACT_CHECK');
  assert.ok(spec.supportedReasoning.includes('XHIGH'));
  for (const role of ['SOL_CONTRACT_CHECK', 'SOL_DIAGNOSE', 'SOL_FINAL_REVIEW', 'SOL_RECHECK']) {
    assert.equal(discoverSolRoute(role, makeCtx().config).role, role);
  }
  assert.throws(() => discoverSolRoute('SOL_WHATEVER', makeCtx().config), ProviderDiscoveryError);
});

test('discoverSolRoute fails closed when sol-xhigh has no configured endpoint', () => {
  assert.throws(() => discoverSolRoute('SOL_DIAGNOSE', configWithoutSol()), ProviderDiscoveryError);
});

test('SOL contract check: missing sol endpoint => FAIL_NO_SUBSTITUTE', () => {
  const decision = decideRoute(
    makeCtx({ contractReviewRequired: true, config: configWithoutSol(), decidedAt: NOW }),
  );
  assert.equal(decision.decision, 'FAIL_NO_SUBSTITUTE');
  assert.equal(decision.reasonCode, 'PROVIDER_UNAVAILABLE');
  assert.equal(decision.nextState, 'FAILED_NO_SUBSTITUTE');
});

test('SOL contract check: exact sol-xhigh endpoint configured => route succeeds', () => {
  const decision = decideRoute(makeCtx({ contractReviewRequired: true, decidedAt: NOW }));
  assert.equal(decision.decision, 'ROUTE_SOL_CONTRACT_CHECK');
  assert.equal(decision.targetModel, 'sol-xhigh');
  assert.equal(decision.targetProvider, 'sol');
  assert.equal(decision.targetRole, 'SOL_CONTRACT_CHECK');
});

test('SOL diagnose: missing sol endpoint => FAIL_NO_SUBSTITUTE', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_IMPLEMENTATION',
      latestRejection: { rejectionCode: 'SEMANTIC_CONFLATION', reason: 'x' },
      config: configWithoutSol(),
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'FAIL_NO_SUBSTITUTE');
  assert.equal(decision.nextState, 'FAILED_NO_SUBSTITUTE');
});

test('SOL diagnose: exact sol-xhigh endpoint configured => route succeeds', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_IMPLEMENTATION',
      latestRejection: { rejectionCode: 'SEMANTIC_CONFLATION', reason: 'x' },
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_DIAGNOSE');
  assert.equal(decision.targetRole, 'SOL_DIAGNOSE');
});

test('SOL recheck: missing sol endpoint => FAIL_NO_SUBSTITUTE', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_REPAIR',
      solFindings: [{ findingId: FINDING, status: 'OPEN', repairCycles: 1, rechecks: 0 }],
      config: configWithoutSol(),
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'FAIL_NO_SUBSTITUTE');
  assert.equal(decision.nextState, 'FAILED_NO_SUBSTITUTE');
});

test('SOL recheck: exact sol-xhigh endpoint configured => route succeeds', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_REPAIR',
      solFindings: [{ findingId: FINDING, status: 'OPEN', repairCycles: 1, rechecks: 0 }],
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_RECHECK');
  assert.equal(decision.targetRole, 'SOL_RECHECK');
});

test('SOL final review: missing sol endpoint => FAIL_NO_SUBSTITUTE', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_IMPLEMENTATION',
      resultAccepted: true,
      semanticContract: HIGH_RISK_CONTRACT,
      config: configWithoutSol(),
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'FAIL_NO_SUBSTITUTE');
  assert.equal(decision.nextState, 'FAILED_NO_SUBSTITUTE');
});

test('SOL final review: exact sol-xhigh endpoint configured => route succeeds', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_IMPLEMENTATION',
      resultAccepted: true,
      semanticContract: HIGH_RISK_CONTRACT,
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_FINAL_REVIEW');
  assert.equal(decision.targetRole, 'SOL_FINAL_REVIEW');
});

test('a SOL route never silently substitutes another model', () => {
  // Even a fully configured implementation ladder cannot satisfy a SOL role.
  const decision = decideRoute(
    makeCtx({
      contractReviewRequired: true,
      config: {
        endpoints: {
          'deepseek-v4-flash': makeCtx().config.endpoints['deepseek-v4-flash'],
          'sol-xhigh': SOL_ENDPOINT,
        },
      },
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_CONTRACT_CHECK');
  assert.equal(decision.targetModel, 'sol-xhigh');
});
