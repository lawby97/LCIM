/**
 * Sprint 05 test helpers: routing fixtures.
 *
 * Builds deterministic routing contexts and discovery configs. Endpoints
 * use example.invalid domains — never real services, no credentials.
 *
 * Fifth-review rule: CURRENT (2.1) production SOL routing is CODEX-ONLY —
 * the default fixture config therefore configures the `gpt-5.6-sol` codex
 * endpoint, and every routing context carries a shared fixture Pi OAuth
 * environment (PI_CODING_AGENT_DIR with a valid openai-codex entry) so the
 * controller-owned OAuth availability fact passes. The classic `sol-xhigh`
 * endpoint remains exported ONLY for immutable 2.0 historical-semantics
 * tests (schema validation of old records / discovery primitives).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createBudgetTracker } from '../../src/routing/budget.mjs';
import { CODEX_OAUTH_PROVIDER, PI_AUTH_FILE } from '../../src/providers/oauth.mjs';

export const WU_ID = 'lcim_wu_' + '0'.repeat(32);
export const RUN_ID = 'lcim_run_' + '1'.repeat(32);

export const FLASH_ENDPOINT = Object.freeze({ baseUrl: 'https://pi.example.invalid/v4-flash' });
export const PRO_MAX_ENDPOINT = Object.freeze({ baseUrl: 'https://pi.example.invalid/pro-max' });
export const TERRA_ENDPOINT = Object.freeze({ baseUrl: 'https://pi.example.invalid/terra' });
export const LUNA_ENDPOINT = Object.freeze({ baseUrl: 'https://pi.example.invalid/luna' });
export const SOL_ENDPOINT = Object.freeze({ baseUrl: 'https://sol.example.invalid/xhigh' });
/** The ONLY automatic SOL channel in current 2.1 routing: gpt-5.6-sol on provider 'pi'. */
export const CODEX_ENDPOINT = Object.freeze({ baseUrl: 'https://chatgpt.example.invalid/backend-api', kind: 'external' });

let sharedOAuthDir = null;

/**
 * A shared fixture Pi OAuth environment (valid openai-codex entry) so
 * every routing context can pass the controller-owned
 * assertCodexOAuthAvailable gate without per-test process.env mutation.
 */
export function codexOAuthEnvironment() {
  if (sharedOAuthDir === null) {
    sharedOAuthDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-routing-oauth-'));
    fs.mkdirSync(sharedOAuthDir, { recursive: true });
    fs.writeFileSync(
      path.join(sharedOAuthDir, PI_AUTH_FILE),
      JSON.stringify({
        [CODEX_OAUTH_PROVIDER]: {
          type: 'oauth',
          access: 'fixture-access-token-value',
          refresh: 'fixture-refresh-token-value',
          expires: Date.now() + 3_600_000,
          accountId: 'fixture-account',
        },
      }),
    );
    process.on('exit', () => {
      try { fs.rmSync(sharedOAuthDir, { recursive: true, force: true }); } catch { /* best effort */ }
    });
  }
  return { PI_CODING_AGENT_DIR: sharedOAuthDir };
}

/** Default discovery config: flash + pro-max + codex gpt-5.6-sol endpoints only (no Terra/Luna). */
export function defaultConfig(overrides = {}) {
  return {
    endpoints: {
      'deepseek-v4-flash': FLASH_ENDPOINT,
      'deepseek-pro-max': PRO_MAX_ENDPOINT,
      'gpt-5.6-sol': CODEX_ENDPOINT,
    },
    ...overrides,
  };
}

/** Deterministic routing context with sane defaults. */
export function makeCtx(overrides = {}) {
  return {
    workUnitId: WU_ID,
    runId: RUN_ID,
    state: 'ROUTING_READY',
    semanticContract: null,
    contractReviewRequired: undefined,
    resultAccepted: false,
    solReview: undefined,
    solDiagnosis: undefined,
    failureHistory: [],
    repairsDispatched: 0,
    latestRejection: null,
    solFindings: [],
    stuckEvidence: {},
    escalation: null,
    budget: createBudgetTracker({ unitCalls: 10, runCalls: 50 }),
    config: defaultConfig(),
    environment: codexOAuthEnvironment(),
    evidenceRefs: [],
    ...overrides,
  };
}

/** A schema-valid base route-decision record for schema tests. */
export function validDecision(overrides = {}) {
  return {
    schemaName: 'lcim.route-decision',
    schemaVersion: '2.0.0',
    decisionId: 'lcim_route_' + 'a'.repeat(32),
    workUnitId: WU_ID,
    runId: RUN_ID,
    decision: 'ROUTE_IMPLEMENT_FLASH',
    reasonCode: 'NORMAL_BOUNDED_TASK',
    state: 'ROUTING_READY',
    nextState: 'AWAITING_IMPLEMENTATION',
    decidedAt: '2025-01-01T00:00:00.000Z',
    budget: { runCallsConsumed: 0, runCallsLimit: 50, unitCallsConsumed: 0, unitCallsLimit: 10 },
    evidenceRefs: ['invocation:lcim_inv_22222222222222222222222222222222'],
    targetProvider: 'pi',
    targetModel: 'deepseek-v4-flash',
    targetRole: 'IMPLEMENT',
    reasoningLevel: 'XHIGH',
    ...overrides,
  };
}
