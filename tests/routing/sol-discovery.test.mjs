/**
 * Fifth-review tests: exact SOL discovery and routing (SOL-S05-003).
 *
 * CURRENT (2.1) production SOL routing is CODEX-ONLY: every automatic
 * ROUTE_SOL_* decision resolves the exact gpt-5.6-sol capability (provider
 * 'pi', XHIGH, role) and the controller-owned openai-codex OAuth gate.
 * Missing endpoint => FAIL_NO_SUBSTITUTE (fail closed, no silent
 * substitute, no downgrade). The classic `sol-xhigh` channel has NO
 * production authority in 2.1 — configuring it fails closed with
 * SOL_CHANNEL_CLASSIC_NO_AUTHORITY; `discoverSolRoute` remains available
 * only as immutable 2.0 historical semantics.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decideRoute } from '../../src/routing/policy.mjs';
import { discoverSolRoute, resolveSolChannel } from '../../src/providers/capabilities/discovery.mjs';
import { ProviderDiscoveryError } from '../../src/routing/errors.mjs';
import { makeCtx, SOL_ENDPOINT, CODEX_ENDPOINT } from '../helpers/routing-fixture.mjs';
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

/** Config without any SOL channel endpoint. */
function configWithoutSol() {
  return {
    endpoints: {
      'deepseek-v4-flash': makeCtx().config.endpoints['deepseek-v4-flash'],
      'deepseek-pro-max': makeCtx().config.endpoints['deepseek-pro-max'],
    },
  };
}

/** Immutable 2.0 historical-semantics classic config (never current-production routable). */
function classicConfig() {
  return {
    endpoints: {
      'deepseek-v4-flash': makeCtx().config.endpoints['deepseek-v4-flash'],
      'deepseek-pro-max': makeCtx().config.endpoints['deepseek-pro-max'],
      'sol-xhigh': SOL_ENDPOINT,
    },
  };
}

test('discoverSolRoute remains the immutable 2.0 historical primitive (classic sol-xhigh semantics)', () => {
  const spec = discoverSolRoute('SOL_CONTRACT_CHECK', classicConfig());
  assert.equal(spec.modelKey, 'sol-xhigh');
  assert.equal(spec.provider, 'sol');
  assert.equal(spec.role, 'SOL_CONTRACT_CHECK');
  assert.ok(spec.supportedReasoning.includes('XHIGH'));
  for (const role of ['SOL_CONTRACT_CHECK', 'SOL_DIAGNOSE', 'SOL_FINAL_REVIEW', 'SOL_RECHECK']) {
    assert.equal(discoverSolRoute(role, classicConfig()).role, role);
  }
  assert.throws(() => discoverSolRoute('SOL_WHATEVER', classicConfig()), ProviderDiscoveryError);
});

test('discoverSolRoute fails closed when sol-xhigh has no configured endpoint', () => {
  assert.throws(() => discoverSolRoute('SOL_DIAGNOSE', configWithoutSol()), ProviderDiscoveryError);
});

test('resolveSolChannel: a classic sol-xhigh endpoint has NO production authority in 2.1 (fails closed)', () => {
  assert.throws(
    () => resolveSolChannel(classicConfig()),
    (err) => err instanceof ProviderDiscoveryError && err.details?.reason === 'SOL_CHANNEL_CLASSIC_NO_AUTHORITY',
  );
  assert.throws(
    () => resolveSolChannel({ endpoints: { ...classicConfig().endpoints, 'gpt-5.6-sol': CODEX_ENDPOINT } }),
    (err) => err instanceof ProviderDiscoveryError && err.details?.reason === 'SOL_CHANNEL_CLASSIC_NO_AUTHORITY',
  );
  assert.equal(resolveSolChannel(makeCtx().config), 'codex');
  assert.equal(resolveSolChannel({ endpoints: {} }), null);
});

test('a classic-only configuration fails closed at routing (no route record, no classic authority)', () => {
  assert.throws(
    () => decideRoute(makeCtx({ contractReviewRequired: true, config: classicConfig(), decidedAt: NOW })),
    (err) => err.code === 'ROUTING_DECISION_FAILED' && err.details?.reason === 'SOL_CHANNEL_CLASSIC_NO_AUTHORITY',
  );
});

test('every current 2.1 SOL route is EXACTLY the strict Codex gate: gpt-5.6-sol / pi / XHIGH', () => {
  const cases = [
    { name: 'contract check', ctx: makeCtx({ contractReviewRequired: true, decidedAt: NOW }), decision: 'ROUTE_SOL_CONTRACT_CHECK', role: 'SOL_CONTRACT_CHECK' },
    {
      name: 'diagnose',
      ctx: makeCtx({ state: 'AWAITING_IMPLEMENTATION', latestRejection: { rejectionCode: 'SEMANTIC_CONFLATION', reason: 'x' }, decidedAt: NOW }),
      decision: 'ROUTE_SOL_DIAGNOSE', role: 'SOL_DIAGNOSE',
    },
    {
      name: 'final review',
      ctx: makeCtx({ state: 'AWAITING_IMPLEMENTATION', resultAccepted: true, semanticContract: HIGH_RISK_CONTRACT, decidedAt: NOW }),
      decision: 'ROUTE_SOL_FINAL_REVIEW', role: 'SOL_FINAL_REVIEW',
    },
    {
      name: 'recheck',
      ctx: makeCtx({ state: 'AWAITING_REPAIR', solFindings: [{ findingId: FINDING, status: 'OPEN', repairCycles: 1, rechecks: 0 }], decidedAt: NOW }),
      decision: 'ROUTE_SOL_RECHECK', role: 'SOL_RECHECK',
    },
  ];
  for (const { name, ctx, decision, role } of cases) {
    const route = decideRoute(ctx);
    assert.equal(route.decision, decision, name);
    assert.equal(route.targetModel, 'gpt-5.6-sol', name);
    assert.equal(route.targetProvider, 'pi', name);
    assert.equal(route.targetRole, role, name);
    assert.equal(route.reasoningLevel, 'XHIGH', name);
    assert.equal(route.schemaVersion, '2.1.0', name);
  }
});

test('SOL contract check: missing SOL endpoint => FAIL_NO_SUBSTITUTE', () => {
  const decision = decideRoute(
    makeCtx({ contractReviewRequired: true, config: configWithoutSol(), decidedAt: NOW }),
  );
  assert.equal(decision.decision, 'FAIL_NO_SUBSTITUTE');
  assert.equal(decision.reasonCode, 'PROVIDER_UNAVAILABLE');
  assert.equal(decision.nextState, 'FAILED_NO_SUBSTITUTE');
});

test('SOL diagnose: missing SOL endpoint => FAIL_NO_SUBSTITUTE', () => {
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

test('SOL recheck: missing SOL endpoint => FAIL_NO_SUBSTITUTE', () => {
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

test('SOL final review: missing SOL endpoint => FAIL_NO_SUBSTITUTE', () => {
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

test('a SOL route never silently substitutes another model', () => {
  // Even a fully configured implementation ladder cannot satisfy a SOL role.
  const decision = decideRoute(
    makeCtx({
      contractReviewRequired: true,
      config: {
        endpoints: {
          'deepseek-v4-flash': makeCtx().config.endpoints['deepseek-v4-flash'],
          'gpt-5.6-sol': CODEX_ENDPOINT,
        },
      },
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_CONTRACT_CHECK');
  assert.equal(decision.targetModel, 'gpt-5.6-sol');
  assert.equal(decision.targetProvider, 'pi');
});

test('codex SOL routes fail closed with CODEX_OAUTH_UNAVAILABLE when Pi has no OAuth store', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-routing-no-oauth-'));
  const decision = decideRoute(
    makeCtx({ contractReviewRequired: true, decidedAt: NOW, environment: { PI_CODING_AGENT_DIR: empty } }),
  );
  assert.equal(decision.decision, 'FAIL_NO_SUBSTITUTE');
  assert.equal(decision.reasonCode, 'CODEX_OAUTH_UNAVAILABLE');
  assert.equal(decision.nextState, 'FAILED_NO_SUBSTITUTE');
});
