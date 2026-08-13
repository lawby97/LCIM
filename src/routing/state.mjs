/**
 * LCIM V2 escalation state machine (Sprint 05).
 *
 * The controller-owned, deterministic escalation state machine for a work
 * unit's routing lifecycle. Every transition is explicit; an undefined
 * (state, event) pair throws `RouteStateError` — routing NEVER silently
 * defaults an unknown transition.
 *
 * States:
 * - ROUTING_READY — unit entered routing, no dispatch yet.
 * - AWAITING_IMPLEMENTATION — worker dispatched on the default bounded
 *   ladder (DeepSeek V4 Flash xhigh through Pi).
 * - AWAITING_REPAIR — the single bounded targeted repair is dispatched.
 * - AWAITING_SOL_CONTRACT_CHECK / AWAITING_SOL_DIAGNOSE /
 *   AWAITING_SOL_FINAL_REVIEW / AWAITING_SOL_RECHECK — SOL xhigh role
 *   states (ask compilation is Sprint 06; the routing contract pins the
 *   roles and transitions only).
 * - AWAITING_PRO_MAX — DeepSeek Pro MAX escalation (escalation-only rung,
 *   always with a machine-readable justification).
 * - UNIT_COMPLETE / STOPPED_STUCK / STOPPED_BUDGET / FAILED_NO_SUBSTITUTE —
 *   terminal states; no further transitions.
 *
 * Semantics encoded here:
 * - semantic rejection escalates immediately to SOL diagnose (no
 *   equivalent DeepSeek repeats);
 * - a first localized failure with a credible hypothesis yields exactly
 *   one bounded Flash repair (AWAITING_REPAIR); the repair result either
 *   completes the unit, escalates a surviving SOL finding to recheck, or
 *   stops STUCK on the same-AC-after-repair criterion;
 * - an open SOL finding that survives one repair goes to SOL recheck;
 *   if it still survives the recheck the unit stops STUCK;
 * - budget exhaustion and discovery failures stop/fail closed from every
 *   non-terminal state.
 */

import { RouteStateError } from './errors.mjs';

export const ESCALATION_STATE = Object.freeze([
  'ROUTING_READY',
  'AWAITING_IMPLEMENTATION',
  'AWAITING_REPAIR',
  'AWAITING_SOL_CONTRACT_CHECK',
  'AWAITING_SOL_DIAGNOSE',
  'AWAITING_SOL_FINAL_REVIEW',
  'AWAITING_SOL_RECHECK',
  'AWAITING_PRO_MAX',
  'UNIT_COMPLETE',
  'STOPPED_STUCK',
  'STOPPED_BUDGET',
  'FAILED_NO_SUBSTITUTE',
]);

export const TERMINAL_STATES = Object.freeze([
  'UNIT_COMPLETE',
  'STOPPED_STUCK',
  'STOPPED_BUDGET',
  'FAILED_NO_SUBSTITUTE',
]);

export const ESCALATION_EVENT = Object.freeze([
  'TASK_READY',
  'CONTRACT_REVIEW_REQUIRED',
  'RESULT_ACCEPTED',
  'RESULT_ACCEPTED_HIGH_RISK',
  'FAILURE_FIRST_CREDIBLE',
  'SEMANTIC_REJECTION',
  'SOL_FINDING_SURVIVED_REPAIR',
  'SOL_CHECK_RESOLVED',
  'SOL_DIAGNOSIS_READY',
  'SOL_REVIEW_PASSED',
  'PRO_MAX_JUSTIFIED',
  'STUCK',
  'BUDGET_EXHAUSTED',
  'CAPABILITY_GAP',
  'PROVIDER_UNAVAILABLE',
]);

/** Deterministic transition table: state -> event -> next state. */
export const TRANSITIONS = Object.freeze({
  ROUTING_READY: Object.freeze({
    TASK_READY: 'AWAITING_IMPLEMENTATION',
    CONTRACT_REVIEW_REQUIRED: 'AWAITING_SOL_CONTRACT_CHECK',
    STUCK: 'STOPPED_STUCK',
    BUDGET_EXHAUSTED: 'STOPPED_BUDGET',
    CAPABILITY_GAP: 'FAILED_NO_SUBSTITUTE',
    PROVIDER_UNAVAILABLE: 'FAILED_NO_SUBSTITUTE',
  }),
  AWAITING_IMPLEMENTATION: Object.freeze({
    RESULT_ACCEPTED: 'UNIT_COMPLETE',
    RESULT_ACCEPTED_HIGH_RISK: 'AWAITING_SOL_FINAL_REVIEW',
    FAILURE_FIRST_CREDIBLE: 'AWAITING_REPAIR',
    SEMANTIC_REJECTION: 'AWAITING_SOL_DIAGNOSE',
    SOL_FINDING_SURVIVED_REPAIR: 'AWAITING_SOL_RECHECK', // diagnose/repair-origin finding after implementation
    STUCK: 'STOPPED_STUCK',
    BUDGET_EXHAUSTED: 'STOPPED_BUDGET',
    CAPABILITY_GAP: 'FAILED_NO_SUBSTITUTE',
    PROVIDER_UNAVAILABLE: 'FAILED_NO_SUBSTITUTE',
  }),
  AWAITING_REPAIR: Object.freeze({
    RESULT_ACCEPTED: 'UNIT_COMPLETE',
    RESULT_ACCEPTED_HIGH_RISK: 'AWAITING_SOL_FINAL_REVIEW',
    SEMANTIC_REJECTION: 'AWAITING_SOL_DIAGNOSE',
    SOL_FINDING_SURVIVED_REPAIR: 'AWAITING_SOL_RECHECK',
    STUCK: 'STOPPED_STUCK',
    BUDGET_EXHAUSTED: 'STOPPED_BUDGET',
    CAPABILITY_GAP: 'FAILED_NO_SUBSTITUTE',
    PROVIDER_UNAVAILABLE: 'FAILED_NO_SUBSTITUTE',
  }),
  AWAITING_SOL_CONTRACT_CHECK: Object.freeze({
    SOL_CHECK_RESOLVED: 'AWAITING_IMPLEMENTATION',
    CONTRACT_REVIEW_REQUIRED: 'AWAITING_SOL_CONTRACT_CHECK', // resolved outcome still review-required: re-check
    PRO_MAX_JUSTIFIED: 'AWAITING_PRO_MAX',
    STUCK: 'STOPPED_STUCK',
    BUDGET_EXHAUSTED: 'STOPPED_BUDGET',
    CAPABILITY_GAP: 'FAILED_NO_SUBSTITUTE',
    PROVIDER_UNAVAILABLE: 'FAILED_NO_SUBSTITUTE',
  }),
  AWAITING_SOL_DIAGNOSE: Object.freeze({
    SOL_DIAGNOSIS_READY: 'AWAITING_IMPLEMENTATION',
    PRO_MAX_JUSTIFIED: 'AWAITING_PRO_MAX',
    STUCK: 'STOPPED_STUCK',
    BUDGET_EXHAUSTED: 'STOPPED_BUDGET',
    CAPABILITY_GAP: 'FAILED_NO_SUBSTITUTE',
    PROVIDER_UNAVAILABLE: 'FAILED_NO_SUBSTITUTE',
  }),
  AWAITING_SOL_FINAL_REVIEW: Object.freeze({
    SOL_REVIEW_PASSED: 'UNIT_COMPLETE',
    FAILURE_FIRST_CREDIBLE: 'AWAITING_REPAIR', // localized actionable finding -> one bounded repair
    PRO_MAX_JUSTIFIED: 'AWAITING_PRO_MAX',
    STUCK: 'STOPPED_STUCK',
    BUDGET_EXHAUSTED: 'STOPPED_BUDGET',
    CAPABILITY_GAP: 'FAILED_NO_SUBSTITUTE',
    PROVIDER_UNAVAILABLE: 'FAILED_NO_SUBSTITUTE',
  }),
  AWAITING_SOL_RECHECK: Object.freeze({
    SOL_REVIEW_PASSED: 'UNIT_COMPLETE',
    RESULT_ACCEPTED_HIGH_RISK: 'AWAITING_SOL_FINAL_REVIEW', // recheck passed but HIGH_RISK final review not yet proven
    PRO_MAX_JUSTIFIED: 'AWAITING_PRO_MAX',
    STUCK: 'STOPPED_STUCK',
    BUDGET_EXHAUSTED: 'STOPPED_BUDGET',
    CAPABILITY_GAP: 'FAILED_NO_SUBSTITUTE',
    PROVIDER_UNAVAILABLE: 'FAILED_NO_SUBSTITUTE',
  }),
  AWAITING_PRO_MAX: Object.freeze({
    RESULT_ACCEPTED: 'UNIT_COMPLETE',
    RESULT_ACCEPTED_HIGH_RISK: 'AWAITING_SOL_FINAL_REVIEW',
    SEMANTIC_REJECTION: 'AWAITING_SOL_DIAGNOSE',
    SOL_FINDING_SURVIVED_REPAIR: 'AWAITING_SOL_RECHECK',
    STUCK: 'STOPPED_STUCK',
    BUDGET_EXHAUSTED: 'STOPPED_BUDGET',
    CAPABILITY_GAP: 'FAILED_NO_SUBSTITUTE',
    PROVIDER_UNAVAILABLE: 'FAILED_NO_SUBSTITUTE',
  }),
  // Terminal states: no transitions.
  UNIT_COMPLETE: Object.freeze({}),
  STOPPED_STUCK: Object.freeze({}),
  STOPPED_BUDGET: Object.freeze({}),
  FAILED_NO_SUBSTITUTE: Object.freeze({}),
});

/** @param {string} state */
export function isTerminalState(state) {
  return TERMINAL_STATES.includes(state);
}

/**
 * Deterministic transition. Throws RouteStateError when the pair is
 * undefined (fail closed — never a silent default).
 *
 * @param {string} state - current ESCALATION_STATE
 * @param {string} event - ESCALATION_EVENT
 * @returns {string} next ESCALATION_STATE
 */
export function nextState(state, event) {
  const table = TRANSITIONS[state];
  if (table === undefined) {
    throw new RouteStateError(`unknown escalation state: ${JSON.stringify(state)}`, { state, event });
  }
  const next = table[event];
  if (next === undefined) {
    throw new RouteStateError(
      `undefined transition ${state} --${event}--> ? (fail closed: routing never silently defaults)`,
      { state, event },
    );
  }
  return next;
}
