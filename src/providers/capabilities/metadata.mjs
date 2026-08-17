/**
 * LCIM V2 provider/model capability metadata (Sprint 05).
 *
 * Sprint-owned canonical capability metadata for exact provider/model
 * discovery. This is METADATA ONLY — no credentials, no endpoints of any
 * real service (endpoints come from explicit per-run configuration), no
 * model transport.
 *
 * Locked policy encoded here:
 * - DeepSeek V4 Flash through Pi with reasoning `XHIGH` is the default
 *   bounded implementation route. `MAX` is used only when explicitly
 *   justified (never as a downgrade below XHIGH — XHIGH is the floor).
 * - DeepSeek Pro MAX is escalation-only (`escalationOnly: true`): every
 *   Pro MAX route carries a machine-readable justification with one of the
 *   three locked bases (see src/routing/reasons.mjs).
 * - Terra and Luna are DISABLED from the default ladder
 *   (`disabledByDefault: true`, `defaultLadder: false`). They may appear
 *   as an optional capability fallback only when explicitly configured
 *   (see discovery.mjs).
 * - SOL is a role-based decision engine (`sol-xhigh`) with exactly four
 *   roles: bounded contract check, bounded diagnose, final high-risk
 *   review, recheck. The ask compiler itself is Sprint 06; this module
 *   only pins the capability/role contract routing needs.
 * - V2.0.1: `gpt-5.6-sol` (GPT-5.6 Sol, provider channel `pi`, tier `sol`)
 *   carries the SAME four SOL roles and runs through Pi's native
 *   `openai-codex` provider using Pi's existing OAuth store — an
 *   explicitly configured alternative automatic SOL channel to the
 *   classic `sol-xhigh` (provider channel `sol`, OPENAI_API_KEY broker
 *   transport). It is never an implementation model and never a default
 *   ladder model.
 */

export const REASONING_LEVELS = Object.freeze(['XHIGH', 'MAX']);

/** The reasoning floor: no model route may go below XHIGH. */
export const MIN_REASONING_LEVEL = 'XHIGH';

/** Implementation roles a model may be dispatched for. */
export const IMPLEMENT_ROLES = Object.freeze(['IMPLEMENT', 'REPAIR']);

/** The four SOL xhigh roles (Sprint 06 owns ask compilation). */
export const SOL_ROLES = Object.freeze([
  'SOL_CONTRACT_CHECK',
  'SOL_DIAGNOSE',
  'SOL_FINAL_REVIEW',
  'SOL_RECHECK',
]);

/** Canonical provider channels. `sol-pro` is reserved for Sprint 07 (text-only ChatGPT SOL Pro); sprint-05 routing never targets it. */
export const PROVIDERS = Object.freeze(['pi', 'sol', 'sol-pro']);

/**
 * Canonical model registry. Keys are the exact model identities routing
 * may reference; every value is frozen metadata.
 */
export const MODEL_SPECS = Object.freeze({
  'deepseek-v4-flash': Object.freeze({
    provider: 'pi',
    family: 'deepseek',
    tier: 'flash',
    roles: IMPLEMENT_ROLES,
    supportedReasoning: Object.freeze(['XHIGH', 'MAX']),
    defaultReasoning: 'XHIGH',
    escalationOnly: false,
    defaultLadder: true,
    disabledByDefault: false,
  }),
  'deepseek-pro-max': Object.freeze({
    provider: 'pi',
    family: 'deepseek',
    tier: 'pro-max',
    roles: IMPLEMENT_ROLES,
    supportedReasoning: Object.freeze(['XHIGH', 'MAX']),
    defaultReasoning: 'MAX',
    escalationOnly: true,
    defaultLadder: false,
    disabledByDefault: false,
  }),
  'sol-xhigh': Object.freeze({
    provider: 'sol',
    family: 'sol',
    tier: 'xhigh',
    roles: SOL_ROLES,
    supportedReasoning: Object.freeze(['XHIGH']),
    defaultReasoning: 'XHIGH',
    escalationOnly: false,
    defaultLadder: false,
    disabledByDefault: false,
  }),
  // V2.0.1: GPT-5.6 Sol — the automatic SOL decision engine through Pi's
  // native `openai-codex` provider (Pi-managed OAuth in ~/.pi/agent, never
  // an LCIM-held credential). Channel 'pi' (the Pi CLI transport), tier
  // 'sol', the same four SOL roles, XHIGH reasoning floor only.
  'gpt-5.6-sol': Object.freeze({
    provider: 'pi',
    family: 'gpt',
    tier: 'sol',
    roles: SOL_ROLES,
    supportedReasoning: Object.freeze(['XHIGH']),
    defaultReasoning: 'XHIGH',
    escalationOnly: false,
    defaultLadder: false,
    disabledByDefault: false,
  }),
  terra: Object.freeze({
    provider: 'pi',
    family: 'terra',
    tier: 'terra',
    roles: IMPLEMENT_ROLES,
    supportedReasoning: Object.freeze(['XHIGH', 'MAX']),
    defaultReasoning: 'XHIGH',
    escalationOnly: false,
    defaultLadder: false,
    disabledByDefault: true,
  }),
  luna: Object.freeze({
    provider: 'pi',
    family: 'luna',
    tier: 'luna',
    roles: IMPLEMENT_ROLES,
    supportedReasoning: Object.freeze(['XHIGH', 'MAX']),
    defaultReasoning: 'XHIGH',
    escalationOnly: false,
    defaultLadder: false,
    disabledByDefault: true,
  }),
});

/**
 * The default bounded implementation ladder: DeepSeek V4 Flash only.
 * Terra and Luna are NOT on it (acceptance criterion: never reintroduce
 * Terra as architecture default).
 */
export const DEFAULT_IMPLEMENTATION_LADDER = Object.freeze(['deepseek-v4-flash']);

/** Models disabled from the default ladder; optional fallback only when configured. */
export const DISABLED_DEFAULT_MODELS = Object.freeze(['terra', 'luna']);

/**
 * V2.0.1 canonical model key for the GPT-5.6 Sol automatic SOL channel
 * (Pi native `openai-codex` provider, Pi-managed OAuth).
 */
export const CODEX_SOL_MODEL = 'gpt-5.6-sol';

/** The classic automatic SOL channel model key (provider channel 'sol'). */
export const CLASSIC_SOL_MODEL = 'sol-xhigh';

/** @param {string} modelKey */
export function isDefaultLadderModel(modelKey) {
  return DEFAULT_IMPLEMENTATION_LADDER.includes(modelKey);
}

/** @param {string} modelKey */
export function isDisabledDefaultModel(modelKey) {
  return DISABLED_DEFAULT_MODELS.includes(modelKey);
}
