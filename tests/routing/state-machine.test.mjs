/**
 * Sprint 05 tests: escalation state machine — full transition matrix,
 * invalid transitions fail closed, terminal states are absorbing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nextState,
  ESCALATION_STATE,
  ESCALATION_EVENT,
  TERMINAL_STATES,
  TRANSITIONS,
  isTerminalState,
} from '../../src/routing/state.mjs';
import { RouteStateError } from '../../src/routing/errors.mjs';

test('transition table covers every state and every defined transition', () => {
  const expected = {
    ROUTING_READY: {
      TASK_READY: 'AWAITING_IMPLEMENTATION',
      CONTRACT_REVIEW_REQUIRED: 'AWAITING_SOL_CONTRACT_CHECK',
      STUCK: 'STOPPED_STUCK',
      BUDGET_EXHAUSTED: 'STOPPED_BUDGET',
      CAPABILITY_GAP: 'FAILED_NO_SUBSTITUTE',
      PROVIDER_UNAVAILABLE: 'FAILED_NO_SUBSTITUTE',
    },
    AWAITING_IMPLEMENTATION: {
      RESULT_ACCEPTED: 'UNIT_COMPLETE',
      RESULT_ACCEPTED_HIGH_RISK: 'AWAITING_SOL_FINAL_REVIEW',
      FAILURE_FIRST_CREDIBLE: 'AWAITING_REPAIR',
      SEMANTIC_REJECTION: 'AWAITING_SOL_DIAGNOSE',
      SOL_FINDING_SURVIVED_REPAIR: 'AWAITING_SOL_RECHECK',
      STUCK: 'STOPPED_STUCK',
      BUDGET_EXHAUSTED: 'STOPPED_BUDGET',
      CAPABILITY_GAP: 'FAILED_NO_SUBSTITUTE',
      PROVIDER_UNAVAILABLE: 'FAILED_NO_SUBSTITUTE',
    },
    AWAITING_REPAIR: {
      RESULT_ACCEPTED: 'UNIT_COMPLETE',
      RESULT_ACCEPTED_HIGH_RISK: 'AWAITING_SOL_FINAL_REVIEW',
      SEMANTIC_REJECTION: 'AWAITING_SOL_DIAGNOSE',
      SOL_FINDING_SURVIVED_REPAIR: 'AWAITING_SOL_RECHECK',
      STUCK: 'STOPPED_STUCK',
      BUDGET_EXHAUSTED: 'STOPPED_BUDGET',
      CAPABILITY_GAP: 'FAILED_NO_SUBSTITUTE',
      PROVIDER_UNAVAILABLE: 'FAILED_NO_SUBSTITUTE',
    },
    AWAITING_SOL_CONTRACT_CHECK: {
      SOL_CHECK_RESOLVED: 'AWAITING_IMPLEMENTATION',
      CONTRACT_REVIEW_REQUIRED: 'AWAITING_SOL_CONTRACT_CHECK',
      PRO_MAX_JUSTIFIED: 'AWAITING_PRO_MAX',
      STUCK: 'STOPPED_STUCK',
      BUDGET_EXHAUSTED: 'STOPPED_BUDGET',
      CAPABILITY_GAP: 'FAILED_NO_SUBSTITUTE',
      PROVIDER_UNAVAILABLE: 'FAILED_NO_SUBSTITUTE',
    },
    AWAITING_SOL_DIAGNOSE: {
      SOL_DIAGNOSIS_READY: 'AWAITING_IMPLEMENTATION',
      PRO_MAX_JUSTIFIED: 'AWAITING_PRO_MAX',
      STUCK: 'STOPPED_STUCK',
      BUDGET_EXHAUSTED: 'STOPPED_BUDGET',
      CAPABILITY_GAP: 'FAILED_NO_SUBSTITUTE',
      PROVIDER_UNAVAILABLE: 'FAILED_NO_SUBSTITUTE',
    },
    AWAITING_SOL_FINAL_REVIEW: {
      SOL_REVIEW_PASSED: 'UNIT_COMPLETE',
      FAILURE_FIRST_CREDIBLE: 'AWAITING_REPAIR',
      PRO_MAX_JUSTIFIED: 'AWAITING_PRO_MAX',
      STUCK: 'STOPPED_STUCK',
      BUDGET_EXHAUSTED: 'STOPPED_BUDGET',
      CAPABILITY_GAP: 'FAILED_NO_SUBSTITUTE',
      PROVIDER_UNAVAILABLE: 'FAILED_NO_SUBSTITUTE',
    },
    AWAITING_SOL_RECHECK: {
      SOL_REVIEW_PASSED: 'UNIT_COMPLETE',
      RESULT_ACCEPTED_HIGH_RISK: 'AWAITING_SOL_FINAL_REVIEW',
      PRO_MAX_JUSTIFIED: 'AWAITING_PRO_MAX',
      STUCK: 'STOPPED_STUCK',
      BUDGET_EXHAUSTED: 'STOPPED_BUDGET',
      CAPABILITY_GAP: 'FAILED_NO_SUBSTITUTE',
      PROVIDER_UNAVAILABLE: 'FAILED_NO_SUBSTITUTE',
    },
    AWAITING_PRO_MAX: {
      RESULT_ACCEPTED: 'UNIT_COMPLETE',
      RESULT_ACCEPTED_HIGH_RISK: 'AWAITING_SOL_FINAL_REVIEW',
      SEMANTIC_REJECTION: 'AWAITING_SOL_DIAGNOSE',
      SOL_FINDING_SURVIVED_REPAIR: 'AWAITING_SOL_RECHECK',
      STUCK: 'STOPPED_STUCK',
      BUDGET_EXHAUSTED: 'STOPPED_BUDGET',
      CAPABILITY_GAP: 'FAILED_NO_SUBSTITUTE',
      PROVIDER_UNAVAILABLE: 'FAILED_NO_SUBSTITUTE',
    },
    UNIT_COMPLETE: {},
    STOPPED_STUCK: {},
    STOPPED_BUDGET: {},
    FAILED_NO_SUBSTITUTE: {},
  };

  for (const state of ESCALATION_STATE) {
    const table = TRANSITIONS[state];
    assert.ok(table, `missing transition table for ${state}`);
    for (const [event, next] of Object.entries(expected[state])) {
      assert.equal(nextState(state, event), next, `${state} --${event}--> ${next}`);
    }
  }
});

test('every defined transition targets a valid state', () => {
  for (const state of Object.keys(TRANSITIONS)) {
    for (const next of Object.values(TRANSITIONS[state])) {
      assert.ok(ESCALATION_STATE.includes(next), `bad next state ${next} from ${state}`);
    }
  }
});

test('invalid (state, event) pairs throw RouteStateError — never silently defaulted', () => {
  const invalid = [
    ['ROUTING_READY', 'RESULT_ACCEPTED'],
    ['ROUTING_READY', 'SOL_REVIEW_PASSED'],
    ['AWAITING_IMPLEMENTATION', 'SOL_CHECK_RESOLVED'],
    ['AWAITING_REPAIR', 'FAILURE_FIRST_CREDIBLE'], // repair budget: exactly one bounded repair
    ['AWAITING_SOL_CONTRACT_CHECK', 'TASK_READY'],
    ['AWAITING_SOL_DIAGNOSE', 'RESULT_ACCEPTED'],
    ['AWAITING_SOL_RECHECK', 'FAILURE_FIRST_CREDIBLE'],
    ['AWAITING_SOL_FINAL_REVIEW', 'SEMANTIC_REJECTION'],
    ['AWAITING_PRO_MAX', 'FAILURE_FIRST_CREDIBLE'], // no Flash repair below Pro MAX
  ];
  for (const [state, event] of invalid) {
    assert.throws(() => nextState(state, event), RouteStateError, `${state} --${event}--> should throw`);
  }
});

test('terminal states absorb every event', () => {
  for (const state of TERMINAL_STATES) {
    assert.equal(isTerminalState(state), true);
    for (const event of ESCALATION_EVENT) {
      assert.throws(() => nextState(state, event), RouteStateError, `${state} --${event}--> should throw`);
    }
  }
});

test('unknown state or event fails closed', () => {
  assert.throws(() => nextState('NOPE', 'TASK_READY'), RouteStateError);
  assert.throws(() => nextState('ROUTING_READY', 'NOPE'), RouteStateError);
});

test('the key escalation semantics hold', () => {
  // semantic rejection escalates without an equivalent retry
  assert.equal(nextState('AWAITING_IMPLEMENTATION', 'SEMANTIC_REJECTION'), 'AWAITING_SOL_DIAGNOSE');
  // one bounded repair, then same-AC failure is STUCK
  assert.equal(nextState('AWAITING_IMPLEMENTATION', 'FAILURE_FIRST_CREDIBLE'), 'AWAITING_REPAIR');
  assert.equal(nextState('AWAITING_REPAIR', 'STUCK'), 'STOPPED_STUCK');
  // SOL finding survives one repair -> recheck; survives recheck -> STUCK
  assert.equal(nextState('AWAITING_REPAIR', 'SOL_FINDING_SURVIVED_REPAIR'), 'AWAITING_SOL_RECHECK');
  assert.equal(nextState('AWAITING_SOL_RECHECK', 'STUCK'), 'STOPPED_STUCK');
  // SOL recheck passing completes the unit
  assert.equal(nextState('AWAITING_SOL_RECHECK', 'SOL_REVIEW_PASSED'), 'UNIT_COMPLETE');
});
