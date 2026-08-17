/**
 * LCIM V2 routing errors (Sprint 05).
 *
 * Sprint-owned error classes for the deterministic routing / escalation
 * state machine. They extend the shared `LcimError` taxonomy (read-only
 * use of the Sprint-00 contract); payloads are public-safe via
 * `errorPayload()`.
 *
 * Subclasses keep the `instanceof RoutingError` chain by calling the
 * two-argument `super(message, details)` and then pinning their own
 * `code` — `errorPayload()` reads `err.code` and `err.details`, so the
 * wire/persisted shape stays correct.
 */

import { LcimError } from '../shared/errors.mjs';

/** A route decision could not be produced (malformed context, invalid escalation). */
export class RoutingError extends LcimError {
  constructor(message, details = null) {
    super(message, 'ROUTING_DECISION_FAILED', details);
  }
}

/**
 * A state-machine transition (state, event) is not defined, or routing was
 * requested from a terminal state. Fail closed: an undefined transition is
 * never silently defaulted.
 */
export class RouteStateError extends RoutingError {
  constructor(message, details = null) {
    super(message, details);
    this.code = 'ROUTING_STATE_TRANSITION_INVALID';
  }
}

/** Exact provider/model discovery failed: unknown model, missing endpoint, or capability mismatch. */
export class ProviderDiscoveryError extends RoutingError {
  constructor(message, details = null) {
    super(message, details);
    this.code = 'PROVIDER_DISCOVERY_FAILED';
  }
}

/** A hard per-run/per-unit call budget is exhausted. Never silently overrun. */
export class BudgetExhaustedError extends RoutingError {
  constructor(message, details = null) {
    super(message, details);
    this.code = 'BUDGET_EXHAUSTED';
  }
}

/**
 * V2.0.1: a configured sol.command attempted to substitute the production
 * openai-codex / gpt-5.6-sol SOL channel (impersonation). Fail closed with
 * the distinct SOL_COMMAND_MASQUERADE identity — no route record is
 * produced and no provider process is spawned.
 */
export class SolCommandMasqueradeError extends RoutingError {
  constructor(message, details = null) {
    super(message, details);
    this.code = 'SOL_COMMAND_MASQUERADE';
  }
}
