/**
 * LCIM V2 deterministic routing public API (Sprint 05).
 *
 * Single entry point for the routing subsystem: vocabularies, state
 * machine, budgets, STUCK criteria, exact provider/model discovery, the
 * route-decision schema registry, and the deterministic routing policy.
 */

export { ROUTE_DECISION, ROUTE_REASON_CODE, STUCK_REASON_CODES, ESCALATION_BASIS, PRO_MAX_BASES, FLASH_MAX_BASES, SOL_FINDING_ORIGIN, isStuckReasonCode, isValidEscalationBasis, isValidSolFindingOrigin, IMPLEMENTATION_DECISIONS, SOL_DECISIONS, STOP_DECISIONS } from './reasons.mjs';
export { RoutingError, RouteStateError, ProviderDiscoveryError, BudgetExhaustedError } from './errors.mjs';
export { ROUTE_ID_PREFIX, ROUTE_ID_PATTERN, generateRouteDecisionId, isValidRouteDecisionId } from './ids.mjs';
export { createBudgetTracker } from './budget.mjs';
export {
  ESCALATION_STATE,
  TERMINAL_STATES,
  ESCALATION_EVENT,
  TRANSITIONS,
  nextState,
  isTerminalState,
} from './state.mjs';
export { STUCK_CRITERIA, evaluateStuckCriteria } from './stuck.mjs';
export {
  REASONING_LEVELS,
  MIN_REASONING_LEVEL,
  IMPLEMENT_ROLES,
  SOL_ROLES,
  PROVIDERS,
  MODEL_SPECS,
  DEFAULT_IMPLEMENTATION_LADDER,
  DISABLED_DEFAULT_MODELS,
  isDefaultLadderModel,
  isDisabledDefaultModel,
} from '../providers/capabilities/metadata.mjs';
export {
  discoverModel,
  resolveImplementationModel,
  assertNoDowngrade,
  capabilityEqual,
  discoverSolRoute,
} from '../providers/capabilities/discovery.mjs';
export {
  ROUTE_SCHEMA_MANIFEST,
  ROUTE_SCHEMA_VERSION,
  loadRouteSchema,
  routeSchemaNames,
  validateRouteDecision,
  stampRouteDecision,
} from './registry.mjs';
export { decideRoute, SEMANTIC_REJECTION_CODES } from './policy.mjs';
