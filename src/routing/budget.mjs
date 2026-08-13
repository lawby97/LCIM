/**
 * LCIM V2 hard call budgets (Sprint 05).
 *
 * Controller-owned per-run / per-unit call budgets. Fail closed:
 * - `available()` is consulted by the routing policy BEFORE any decision:
 *   an exhausted budget yields `STOP_BUDGET` (reason `BUDGET_EXHAUSTED`),
 *   never a silent implementation route;
 * - `consume()` is the belt-and-braces hard gate for dispatch layers: any
 *   consumption past a limit throws `BudgetExhaustedError`; consumption is
 *   atomic (both counters move together or neither does).
 *
 * The per-unit counter is reset when a new work unit starts
 * (`resetUnit()`); the per-run counter persists for the whole run, so a
 * run-wide cap can never be silently exceeded by many small units.
 */

import { ConfigError } from '../shared/errors.mjs';
import { BudgetExhaustedError } from './errors.mjs';

function assertNonNegativeInteger(value, what) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ConfigError(`${what} must be a non-negative integer, got ${JSON.stringify(value)}`);
  }
}

/**
 * @param {{ unitCalls: number, runCalls: number }} limits - hard caps.
 * @returns {{
 *   available(): boolean,
 *   isExhausted(): boolean,
 *   consume(): void,
 *   resetUnit(): void,
 *   snapshot(): Readonly<{unitCallsConsumed:number, unitCallsLimit:number, runCallsConsumed:number, runCallsLimit:number}>,
 * }}
 */
export function createBudgetTracker({ unitCalls, runCalls }) {
  assertNonNegativeInteger(unitCalls, 'unitCalls');
  assertNonNegativeInteger(runCalls, 'runCalls');

  const state = { unitCallsConsumed: 0, runCallsConsumed: 0 };

  function available() {
    return state.unitCallsConsumed < unitCalls && state.runCallsConsumed < runCalls;
  }

  function snapshot() {
    return Object.freeze({
      unitCallsConsumed: state.unitCallsConsumed,
      unitCallsLimit: unitCalls,
      runCallsConsumed: state.runCallsConsumed,
      runCallsLimit: runCalls,
    });
  }

  return {
    available,
    isExhausted: () => !available(),
    consume() {
      if (!available()) {
        throw new BudgetExhaustedError(
          'call budget exhausted: refusing to overrun a hard budget',
          snapshot(),
        );
      }
      state.unitCallsConsumed += 1;
      state.runCallsConsumed += 1;
    },
    resetUnit() {
      state.unitCallsConsumed = 0;
    },
    snapshot,
  };
}
