/**
 * V2.0.1 fifth-review tests: GPT-5.6 Sol codex SOL channel — exact
 * discovery, channel resolution, and the routing policy flows.
 *
 * The codex channel (endpoint `gpt-5.6-sol`, provider 'pi', Pi native
 * openai-codex OAuth) is the ONLY automatic SOL channel in current 2.1
 * production routing, and every route is exactly
 * openai-codex / gpt-5.6-sol / XHIGH. The classic `sol-xhigh` channel has
 * NO production authority: configuring it fails closed with
 * SOL_CHANNEL_CLASSIC_NO_AUTHORITY (it remains only as immutable 2.0.0
 * historical semantics). The OAuth availability fact is controller-owned
 * and fails closed with CODEX_OAUTH_UNAVAILABLE before any codex route.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decideRoute } from '../../src/routing/policy.mjs';
import {
  discoverSolCodexRoute,
  discoverSolRoute,
  resolveSolChannel,
} from '../../src/providers/capabilities/discovery.mjs';
import { ProviderDiscoveryError } from '../../src/routing/errors.mjs';
import { makeCtx } from '../helpers/routing-fixture.mjs';
import { CODEX_OAUTH_PROVIDER, PI_AUTH_FILE } from '../../src/providers/oauth.mjs';
import { compileSemanticContract } from '../../src/contracts/compiler.mjs';

const NOW = '2025-01-01T00:00:00.000Z';
const FINDING = 'lcim_finding_33333333333333333333333333333333';

/** A HIGH_RISK_CLASS contract for the mandatory final-review flow. */
function highRiskContract() {
  return compileSemanticContract(
    {
      contractKey: 'codex.final-review',
      title: 'Codex final review contract',
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

/** Config with ONLY the codex SOL channel configured. */
function codexConfig() {
  return {
    endpoints: {
      'deepseek-v4-flash': makeCtx().config.endpoints['deepseek-v4-flash'],
      'deepseek-pro-max': makeCtx().config.endpoints['deepseek-pro-max'],
      'gpt-5.6-sol': { baseUrl: 'https://chatgpt.example.invalid/backend-api', kind: 'external' },
    },
  };
}

/** A config that still carries the legacy classic endpoint (no 2.1 authority). */
function classicConfig() {
  return {
    endpoints: {
      ...codexConfig().endpoints,
      'sol-xhigh': { baseUrl: 'https://sol.example.invalid/xhigh' },
    },
  };
}

test('discoverSolCodexRoute requires the exact role capability on gpt-5.6-sol', () => {
  const spec = discoverSolCodexRoute('SOL_DIAGNOSE', codexConfig());
  assert.equal(spec.modelKey, 'gpt-5.6-sol');
  assert.equal(spec.provider, 'pi');
  assert.equal(spec.role, 'SOL_DIAGNOSE');
  assert.ok(spec.supportedReasoning.includes('XHIGH'));
  for (const role of ['SOL_CONTRACT_CHECK', 'SOL_DIAGNOSE', 'SOL_FINAL_REVIEW', 'SOL_RECHECK']) {
    assert.equal(discoverSolCodexRoute(role, codexConfig()).role, role);
  }
  assert.throws(() => discoverSolCodexRoute('SOL_WHATEVER', codexConfig()), ProviderDiscoveryError);
});

test('discoverSolCodexRoute fails closed without the endpoint and never substitutes', () => {
  assert.throws(() => discoverSolCodexRoute('SOL_DIAGNOSE', { endpoints: { 'deepseek-v4-flash': makeCtx().config.endpoints['deepseek-v4-flash'] } }), ProviderDiscoveryError);
  assert.throws(() => discoverSolCodexRoute('SOL_DIAGNOSE', {}), ProviderDiscoveryError);
});

test('resolveSolChannel is exact: codex only, classic has no 2.1 authority, neither is null', () => {
  assert.equal(resolveSolChannel(codexConfig()), 'codex');
  assert.equal(resolveSolChannel(makeCtx().config), 'codex');
  assert.equal(resolveSolChannel({ endpoints: {} }), null);
  // The classic endpoint — alone or alongside codex — fails closed with
  // SOL_CHANNEL_CLASSIC_NO_AUTHORITY (no silent classic routing).
  assert.throws(
    () => resolveSolChannel(classicConfig()),
    (err) => err instanceof ProviderDiscoveryError && err.details?.reason === 'SOL_CHANNEL_CLASSIC_NO_AUTHORITY',
  );
});

test('the classic sol-xhigh route primitive stays immutable 2.0 historical semantics only', () => {
  const spec = discoverSolRoute('SOL_FINAL_REVIEW', { endpoints: { 'sol-xhigh': { baseUrl: 'https://sol.example.invalid/xhigh' } } });
  assert.equal(spec.modelKey, 'sol-xhigh');
  assert.equal(spec.provider, 'sol');
  // But it can never be REACHED by current routing: a classic-only config
  // fails closed before any route record is produced.
  assert.throws(
    () => decideRoute(makeCtx({ contractReviewRequired: true, config: { endpoints: { 'sol-xhigh': { baseUrl: 'https://sol.example.invalid/xhigh' } } }, decidedAt: NOW })),
    (err) => err.code === 'ROUTING_DECISION_FAILED' && err.details?.reason === 'SOL_CHANNEL_CLASSIC_NO_AUTHORITY',
  );
});

test('codex SOL contract check routes to gpt-5.6-sol on provider pi at XHIGH when OAuth is available', () => {
  const decision = decideRoute(makeCtx({ contractReviewRequired: true, config: codexConfig(), decidedAt: NOW }));
  assert.equal(decision.decision, 'ROUTE_SOL_CONTRACT_CHECK');
  assert.equal(decision.targetModel, 'gpt-5.6-sol');
  assert.equal(decision.targetProvider, 'pi');
  assert.equal(decision.targetRole, 'SOL_CONTRACT_CHECK');
  assert.equal(decision.reasoningLevel, 'XHIGH');
  assert.equal(decision.nextState, 'AWAITING_SOL_CONTRACT_CHECK');
});

test('codex SOL diagnose routes to gpt-5.6-sol at XHIGH when OAuth is available', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_IMPLEMENTATION',
      resultAccepted: false,
      latestRejection: { rejectionCode: 'UNSUPPORTED_CLAIM', rejectedAcceptanceRefs: ['ac:1'] },
      config: codexConfig(),
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_DIAGNOSE');
  assert.equal(decision.targetModel, 'gpt-5.6-sol');
  assert.equal(decision.targetProvider, 'pi');
  assert.equal(decision.targetRole, 'SOL_DIAGNOSE');
});

test('codex SOL final review routes to gpt-5.6-sol at XHIGH when OAuth is available', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_IMPLEMENTATION',
      resultAccepted: true,
      semanticContract: highRiskContract(),
      config: codexConfig(),
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_FINAL_REVIEW');
  assert.equal(decision.targetModel, 'gpt-5.6-sol');
  assert.equal(decision.targetProvider, 'pi');
  assert.equal(decision.targetRole, 'SOL_FINAL_REVIEW');
});

test('codex SOL recheck routes to gpt-5.6-sol at XHIGH when OAuth is available', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_REPAIR',
      solFindings: [{ findingId: FINDING, status: 'OPEN', repairCycles: 1, rechecks: 0 }],
      config: codexConfig(),
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_RECHECK');
  assert.equal(decision.targetModel, 'gpt-5.6-sol');
  assert.equal(decision.targetProvider, 'pi');
  assert.equal(decision.targetRole, 'SOL_RECHECK');
});

test('codex SOL routes fail closed with CODEX_OAUTH_UNAVAILABLE when Pi has no OAuth store', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-routing-no-oauth-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const decision = decideRoute(makeCtx({
    contractReviewRequired: true,
    config: codexConfig(),
    decidedAt: NOW,
    environment: { PI_CODING_AGENT_DIR: dir },
  }));
  assert.equal(decision.decision, 'FAIL_NO_SUBSTITUTE');
  assert.equal(decision.reasonCode, 'CODEX_OAUTH_UNAVAILABLE');
  assert.equal(decision.nextState, 'FAILED_NO_SUBSTITUTE');
});

test('codex SOL route with no configured channel fails closed as PROVIDER_UNAVAILABLE', () => {
  const decision = decideRoute(
    makeCtx({ contractReviewRequired: true, config: { endpoints: { 'deepseek-v4-flash': makeCtx().config.endpoints['deepseek-v4-flash'] } }, decidedAt: NOW }),
  );
  assert.equal(decision.decision, 'FAIL_NO_SUBSTITUTE');
  assert.equal(decision.reasonCode, 'PROVIDER_UNAVAILABLE');
});

test('a legacy classic endpoint alongside codex fails closed (classic has no 2.1 authority)', () => {
  assert.throws(
    () => decideRoute(makeCtx({ contractReviewRequired: true, config: classicConfig(), decidedAt: NOW })),
    (err) => err.code === 'ROUTING_DECISION_FAILED' && err.details?.reason === 'SOL_CHANNEL_CLASSIC_NO_AUTHORITY',
  );
});

test('a configured sol.command can never masquerade as an automatic SOL channel (routing fails closed)', () => {
  const masqueradeConfig = {
    ...codexConfig(),
    sol: { command: ['node', 'repo-owned-sol.cjs'], args: [], timeoutMs: 120_000 },
  };
  // A repository-controlled sol.command must NOT produce a production
  // openai-codex / gpt-5.6-sol review: no route record is produced.
  assert.throws(
    () => decideRoute(makeCtx({ contractReviewRequired: true, config: masqueradeConfig, decidedAt: NOW })),
    (err) => err.code === 'SOL_COMMAND_MASQUERADE' && err.details?.reason === 'SOL_COMMAND_MASQUERADE',
  );
  // SOL-S11-002: local-command SOL authority is REMOVED from production
  // routing for the codex channel even through a seam-marked config path.
  assert.throws(
    () => decideRoute(makeCtx({ contractReviewRequired: true, config: { ...makeCtx().config, sol: { command: ['node', 'fixture-sol.cjs'], args: [], timeoutMs: 120_000 } }, decidedAt: NOW })),
    (err) => err.code === 'SOL_COMMAND_MASQUERADE' && err.details?.reason === 'SOL_COMMAND_MASQUERADE',
  );
  // With no sol.command the codex channel routes through the strict gate.
  const codex = decideRoute(makeCtx({ contractReviewRequired: true, config: codexConfig(), decidedAt: NOW }));
  assert.equal(codex.decision, 'ROUTE_SOL_CONTRACT_CHECK');
  assert.equal(codex.targetModel, 'gpt-5.6-sol');
  assert.equal(codex.targetProvider, 'pi');
  assert.equal(codex.reasoningLevel, 'XHIGH');
});
