/**
 * Sprint 05 tests: controller-owned STUCK criteria — derivation from
 * objective history, observed evidence, and policy STOP_STUCK routing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStuckCriteria, STUCK_CRITERIA } from '../../src/routing/stuck.mjs';
import { decideRoute } from '../../src/routing/policy.mjs';
import { RouteStateError } from '../../src/routing/errors.mjs';
import { makeCtx } from '../helpers/routing-fixture.mjs';

const NOW = '2025-01-01T00:00:00.000Z';

test('all eight mandated STUCK criteria are defined with codes', () => {
  assert.deepEqual(
    STUCK_CRITERIA.map((c) => c.code),
    [
      'SAME_AC_FAILED_AFTER_REPAIR',
      'SUBSTANTIVE_SEMANTIC_CONTRADICTION',
      'MODEL_ATTEMPTS_CONTRACT_CHANGE',
      'CONFLATES_DISTINCT_CONCEPTS',
      'NO_FALSIFIABLE_EXPLANATION',
      'SCOPE_BROADENS_WITHOUT_EVIDENCE',
      'SOL_FINDING_SURVIVES_ONE_REPAIR',
      'PROVIDER_LACKS_CAPABILITY',
    ],
  );
  assert.equal(STUCK_CRITERIA.length, 8);
});

test('SAME_AC_FAILED_AFTER_REPAIR is derived from failure history (same ref in >=2 failures)', () => {
  const ctx = {
    failureHistory: [
      { rejectedAcceptanceRefs: ['ac-1'], credibleHypothesis: true },
      { rejectedAcceptanceRefs: ['ac-1'], credibleHypothesis: true },
    ],
    solFindings: [],
    stuckEvidence: {},
  };
  assert.deepEqual(evaluateStuckCriteria(ctx), ['SAME_AC_FAILED_AFTER_REPAIR']);
});

test('distinct ACs across failures do not trigger the same-AC criterion', () => {
  const ctx = {
    failureHistory: [
      { rejectedAcceptanceRefs: ['ac-1'], credibleHypothesis: true },
      { rejectedAcceptanceRefs: ['ac-2'], credibleHypothesis: true },
    ],
    solFindings: [],
    stuckEvidence: {},
  };
  assert.deepEqual(evaluateStuckCriteria(ctx), []);
});

test('SOL_FINDING_SURVIVES_ONE_REPAIR is derived from open findings with repair + recheck', () => {
  const ctx = {
    failureHistory: [],
    solFindings: [{ findingId: 'lcim_finding_33333333333333333333333333333333', status: 'OPEN', repairCycles: 1, rechecks: 1 }],
    stuckEvidence: {},
  };
  assert.deepEqual(evaluateStuckCriteria(ctx), ['SOL_FINDING_SURVIVES_ONE_REPAIR']);
});

test('an open finding with one repair but no recheck is not yet STUCK (recheck is due)', () => {
  const ctx = {
    failureHistory: [],
    solFindings: [{ findingId: 'lcim_finding_33333333333333333333333333333333', status: 'OPEN', repairCycles: 1, rechecks: 0 }],
    stuckEvidence: {},
  };
  assert.deepEqual(evaluateStuckCriteria(ctx), []);
});

test('observed STUCK evidence maps to the exact criterion codes', () => {
  const cases = [
    [{ semanticContradiction: true }, ['SUBSTANTIVE_SEMANTIC_CONTRADICTION']],
    [{ contractChangeAttempt: true }, ['MODEL_ATTEMPTS_CONTRACT_CHANGE']],
    [{ conflation: true }, ['CONFLATES_DISTINCT_CONCEPTS']],
    [{ lacksFalsifiableExplanation: true }, ['NO_FALSIFIABLE_EXPLANATION']],
    [{ scopeBroadenedWithoutEvidence: true }, ['SCOPE_BROADENS_WITHOUT_EVIDENCE']],
    [{ providerLacksCapability: true }, ['PROVIDER_LACKS_CAPABILITY']],
  ];
  for (const [evidence, expected] of cases) {
    assert.deepEqual(
      evaluateStuckCriteria({ failureHistory: [], solFindings: [], stuckEvidence: evidence }),
      expected,
    );
  }
});

test('multiple criteria trigger together in definition order', () => {
  const ctx = {
    failureHistory: [
      { rejectedAcceptanceRefs: ['ac-1'], credibleHypothesis: true },
      { rejectedAcceptanceRefs: ['ac-1'], credibleHypothesis: true },
    ],
    solFindings: [],
    stuckEvidence: { semanticContradiction: true, scopeBroadenedWithoutEvidence: true },
  };
  assert.deepEqual(evaluateStuckCriteria(ctx), [
    'SAME_AC_FAILED_AFTER_REPAIR',
    'SUBSTANTIVE_SEMANTIC_CONTRADICTION',
    'SCOPE_BROADENS_WITHOUT_EVIDENCE',
  ]);
});

test('a healthy context triggers nothing', () => {
  assert.deepEqual(evaluateStuckCriteria({ failureHistory: [], solFindings: [], stuckEvidence: {} }), []);
});

test('policy stops STUCK for every observed criterion with its reason code', () => {
  const evidenceByCode = {
    SUBSTANTIVE_SEMANTIC_CONTRADICTION: { semanticContradiction: true },
    MODEL_ATTEMPTS_CONTRACT_CHANGE: { contractChangeAttempt: true },
    CONFLATES_DISTINCT_CONCEPTS: { conflation: true },
    NO_FALSIFIABLE_EXPLANATION: { lacksFalsifiableExplanation: true },
    SCOPE_BROADENS_WITHOUT_EVIDENCE: { scopeBroadenedWithoutEvidence: true },
    PROVIDER_LACKS_CAPABILITY: { providerLacksCapability: true },
  };
  for (const [code, evidence] of Object.entries(evidenceByCode)) {
    const decision = decideRoute(
      makeCtx({ state: 'AWAITING_IMPLEMENTATION', stuckEvidence: evidence, decidedAt: NOW }),
    );
    assert.equal(decision.decision, 'STOP_STUCK', code);
    assert.equal(decision.reasonCode, code, code);
    assert.equal(decision.nextState, 'STOPPED_STUCK', code);
  }
});

test('policy stops STUCK for derived same-AC and surviving-SOL-finding criteria', () => {
  const sameAc = decideRoute(
    makeCtx({
      state: 'AWAITING_REPAIR',
      failureHistory: [
        { rejectedAcceptanceRefs: ['ac-1'], credibleHypothesis: true },
        { rejectedAcceptanceRefs: ['ac-1'], credibleHypothesis: true },
      ],
      repairsDispatched: 1,
      decidedAt: NOW,
    }),
  );
  assert.equal(sameAc.reasonCode, 'SAME_AC_FAILED_AFTER_REPAIR');

  const solSurvived = decideRoute(
    makeCtx({
      state: 'AWAITING_SOL_RECHECK',
      solFindings: [{ findingId: 'lcim_finding_33333333333333333333333333333333', status: 'OPEN', repairCycles: 1, rechecks: 1 }],
      decidedAt: NOW,
    }),
  );
  assert.equal(solSurvived.reasonCode, 'SOL_FINDING_SURVIVES_ONE_REPAIR');
});

test('an open SOL finding needing recheck routes to SOL recheck instead of STUCK', () => {
  const decision = decideRoute(
    makeCtx({
      state: 'AWAITING_REPAIR',
      solFindings: [{ findingId: 'lcim_finding_33333333333333333333333333333333', status: 'OPEN', repairCycles: 1, rechecks: 0 }],
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_SOL_RECHECK');
  assert.equal(decision.reasonCode, 'SOL_RECHECK_AFTER_REPAIR');
  assert.equal(decision.nextState, 'AWAITING_SOL_RECHECK');
});
