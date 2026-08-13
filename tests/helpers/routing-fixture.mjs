/**
 * Sprint 05 test helpers: routing fixtures.
 *
 * Builds deterministic routing contexts and discovery configs. Endpoints
 * use example.invalid domains — never real services, no credentials.
 */

import { createBudgetTracker } from '../../src/routing/budget.mjs';

export const WU_ID = 'lcim_wu_' + '0'.repeat(32);
export const RUN_ID = 'lcim_run_' + '1'.repeat(32);

export const FLASH_ENDPOINT = Object.freeze({ baseUrl: 'https://pi.example.invalid/v4-flash' });
export const PRO_MAX_ENDPOINT = Object.freeze({ baseUrl: 'https://pi.example.invalid/pro-max' });
export const TERRA_ENDPOINT = Object.freeze({ baseUrl: 'https://pi.example.invalid/terra' });
export const LUNA_ENDPOINT = Object.freeze({ baseUrl: 'https://pi.example.invalid/luna' });
export const SOL_ENDPOINT = Object.freeze({ baseUrl: 'https://sol.example.invalid/xhigh' });

/** Default discovery config: flash + pro-max + sol-xhigh endpoints only (no Terra/Luna). */
export function defaultConfig(overrides = {}) {
  return {
    endpoints: {
      'deepseek-v4-flash': FLASH_ENDPOINT,
      'deepseek-pro-max': PRO_MAX_ENDPOINT,
      'sol-xhigh': SOL_ENDPOINT,
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
