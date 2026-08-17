/**
 * LCIM V2 exact provider/model discovery (Sprint 05).
 *
 * Discovery is EXACT and FAIL-CLOSED (requirement: implement exact
 * provider/model discovery and fail rather than silently substitute):
 *
 * - `discoverModel(key, config)` resolves the canonical model spec ONLY
 *   when the model is known to the metadata registry AND an explicit
 *   endpoint is configured for it. Unknown model, missing endpoint, or a
 *   disabled-by-default model that was not explicitly enabled => throws
 *   `ProviderDiscoveryError`. Nothing is invented or guessed.
 * - Substitution is never silent. The ONLY two permitted substitution
 *   paths are explicit in configuration and are recorded on the route
 *   decision (`substituteOf` + `EXACT_SUBSTITUTE_CONFIGURED` /
 *   `CAPABILITY_FALLBACK_CONFIGURED`):
 *   1. `config.exactSubstitutes[modelKey]` — an explicit capability-equal
 *      replacement (same roles, same supported reasoning);
 *   2. `config.enableOptionalFallbacks` — Terra/Luna explicitly enabled
 *      for optional capability fallback.
 * - `resolveImplementationModel(config)` follows the default ladder
 *   (deepseek-v4-flash) and applies only those explicit substitution
 *   paths, in order: exact substitute first, then optional fallbacks.
 *   It reports `substitutionKind` ('exact' | 'fallback' | null) so the
 *   routing policy can record WHY the target changed (no silent
 *   substitution).
 * - `assertNoDowngrade(modelKey, reasoningLevel, config)` enforces the
 *   XHIGH floor and the model's supported-reasoning set.
 *
 * `config.endpoints` maps model key -> explicit endpoint descriptor
 * (e.g. `{ baseUrl }`). Endpoint content is configuration, never
 * credentials; credential handling is out of scope for this sprint.
 */

import { ConfigError } from '../../shared/errors.mjs';
import { ProviderDiscoveryError } from '../../routing/errors.mjs';
import {
  MODEL_SPECS,
  DEFAULT_IMPLEMENTATION_LADDER,
  MIN_REASONING_LEVEL,
  REASONING_LEVELS,
  SOL_ROLES,
  CODEX_SOL_MODEL,
  CLASSIC_SOL_MODEL,
} from './metadata.mjs';

function assertPlainConfig(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new ConfigError('discovery config must be a plain object');
  }
}

/**
 * Resolve the exact canonical spec for a model key.
 *
 * @param {string} modelKey - canonical model key (metadata registry)
 * @param {object} config - { endpoints: { [modelKey]: endpoint }, enableOptionalFallbacks?: string[] }
 * @returns {Readonly<object>} frozen spec + discovered endpoint
 * @throws {ProviderDiscoveryError} unknown model / missing endpoint / disabled-not-enabled
 */
export function discoverModel(modelKey, config = {}) {
  assertPlainConfig(config);
  const spec = MODEL_SPECS[modelKey];
  if (spec === undefined) {
    throw new ProviderDiscoveryError(
      `unknown model key ${JSON.stringify(modelKey)}: exact discovery only (no silent substitution)`,
      { modelKey },
    );
  }
  const endpoints = config.endpoints ?? {};
  const endpoint = endpoints[modelKey];
  if (endpoint === undefined || endpoint === null || typeof endpoint !== 'object') {
    throw new ProviderDiscoveryError(
      `model ${JSON.stringify(modelKey)} is not discovered: no explicit endpoint configured`,
      { modelKey, reason: 'ENDPOINT_NOT_CONFIGURED' },
    );
  }
  if (spec.disabledByDefault === true) {
    const enabled = Array.isArray(config.enableOptionalFallbacks)
      ? config.enableOptionalFallbacks
      : [];
    if (!enabled.includes(modelKey)) {
      throw new ProviderDiscoveryError(
        `model ${JSON.stringify(modelKey)} is disabled from the default ladder and not explicitly enabled in config.enableOptionalFallbacks`,
        { modelKey, reason: 'DISABLED_DEFAULT_MODEL' },
      );
    }
  }
  return Object.freeze({ ...spec, modelKey, endpoint: Object.freeze({ ...endpoint }) });
}

/**
 * Capability equality: same roles, same supported reasoning levels, and the
 * same escalation-only status. A deepseek-pro-max (escalationOnly: true) is
 * therefore NEVER capability-equal to Flash — capability equality alone can
 * never bypass the escalation-only routing policy.
 */
export function capabilityEqual(a, b) {
  if (a === undefined || b === undefined) return false;
  const aRoles = [...a.roles].sort();
  const bRoles = [...b.roles].sort();
  if (JSON.stringify(aRoles) !== JSON.stringify(bRoles)) return false;
  const aReasoning = [...a.supportedReasoning].sort();
  const bReasoning = [...b.supportedReasoning].sort();
  if (JSON.stringify(aReasoning) !== JSON.stringify(bReasoning)) return false;
  return a.escalationOnly === b.escalationOnly;
}

/**
 * Resolve the implementation model for the default ladder with ONLY the
 * explicitly configured substitution paths. Throws `ProviderDiscoveryError`
 * when nothing exact is discoverable — the caller must fail, never
 * silently substitute.
 *
 * @param {object} config - discovery config (endpoints, exactSubstitutes, enableOptionalFallbacks)
 * @returns {{ spec: Readonly<object>, substituteOf: string|null, substitutionKind: 'exact'|'fallback'|null }}
 *   substituteOf is non-null exactly when an explicit substitution path was used;
 *   substitutionKind names the path used ('exact' = config.exactSubstitutes,
 *   'fallback' = config.enableOptionalFallbacks, null = default ladder).
 */
export function resolveImplementationModel(config = {}) {
  assertPlainConfig(config);
  const target = DEFAULT_IMPLEMENTATION_LADDER[0];
  try {
    return { spec: discoverModel(target, config), substituteOf: null, substitutionKind: null };
  } catch (primaryError) {
    // Explicit exact substitute (capability-equal) first.
    const substitutes = config.exactSubstitutes ?? {};
    const subKey = substitutes[target];
    if (typeof subKey === 'string' && subKey !== target) {
      const subSpec = discoverModel(subKey, config); // may throw: propagate
      // Escalation-only models (deepseek-pro-max) can never be ordinary
      // substitutes: they may appear only on ROUTE_IMPLEMENT_PRO_MAX.
      if (subSpec.escalationOnly === true) {
        throw new ProviderDiscoveryError(
          `exact substitute ${JSON.stringify(subKey)} is escalation-only (deepseek-pro-max may appear only on ROUTE_IMPLEMENT_PRO_MAX): substitution refused`,
          { modelKey: target, substituteOf: subKey, reason: 'SUBSTITUTE_ESCALATION_ONLY' },
        );
      }
      const targetSpec = MODEL_SPECS[target];
      if (!capabilityEqual(targetSpec, subSpec)) {
        throw new ProviderDiscoveryError(
          `exact substitute ${JSON.stringify(subKey)} for ${JSON.stringify(target)} is not capability-equal (roles/reasoning/escalation differ): substitution is refused`,
          { modelKey: target, substituteOf: subKey, reason: 'SUBSTITUTE_NOT_CAPABILITY_EQUAL' },
        );
      }
      return { spec: subSpec, substituteOf: target, substitutionKind: 'exact' };
    }
    // Optional capability fallback (Terra/Luna only when explicitly enabled).
    const fallbacks = Array.isArray(config.enableOptionalFallbacks)
      ? config.enableOptionalFallbacks
      : [];
    for (const fallbackKey of fallbacks) {
      if (fallbackKey === target) continue;
      // Escalation-only models are never optional fallbacks.
      if (MODEL_SPECS[fallbackKey]?.escalationOnly === true) continue;
      try {
        const fallbackSpec = discoverModel(fallbackKey, config);
        return { spec: fallbackSpec, substituteOf: target, substitutionKind: 'fallback' };
      } catch {
        // try the next explicitly enabled fallback
      }
    }
    throw primaryError;
  }
}

function configuredEndpoint(config, modelKey) {
  const endpoint = config?.endpoints?.[modelKey];
  return endpoint === null || endpoint === undefined ? null : endpoint;
}

function assertSolRole(role) {
  if (!SOL_ROLES.includes(role)) {
    throw new ProviderDiscoveryError(
      `unknown SOL role ${JSON.stringify(role)} (supported: ${SOL_ROLES.join(', ')})`,
      { role, reason: 'SOL_ROLE_UNKNOWN' },
    );
  }
}

function assertSolSpec(spec, modelKey, role, expectedProvider) {
  if (spec.provider !== expectedProvider) {
    throw new ProviderDiscoveryError(
      `${modelKey} must resolve on provider ${JSON.stringify(expectedProvider)}, got ${JSON.stringify(spec.provider)}`,
      { modelKey, reason: 'SOL_PROVIDER_MISMATCH' },
    );
  }
  if (!spec.roles.includes(role)) {
    throw new ProviderDiscoveryError(
      `${modelKey} lacks capability for role ${role} (roles: ${spec.roles.join(', ')})`,
      { modelKey, role, reason: 'SOL_ROLE_UNAVAILABLE' },
    );
  }
  if (!spec.supportedReasoning.includes('XHIGH')) {
    throw new ProviderDiscoveryError(
      `${modelKey} must support XHIGH reasoning (no downgrade)`,
      { modelKey, reason: 'SOL_REASONING_UNAVAILABLE' },
    );
  }
}

/**
 * Exact classic SOL route discovery — retained ONLY as immutable 2.0.0
 * historical semantics for validating old 2.0 evidence records. It is
 * NEVER a current-production routing channel: 2.1 routing is Codex-only
 * (`resolveSolChannel` fails closed when the classic endpoint is
 * configured, so `decideRoute` can never reach this primitive).
 */
export function discoverSolRoute(role, config = {}) {
  assertSolRole(role);
  const spec = discoverModel(CLASSIC_SOL_MODEL, config);
  assertSolSpec(spec, CLASSIC_SOL_MODEL, role, 'sol');
  return Object.freeze({ ...spec, role });
}

/**
 * Exact GPT-5.6 Sol codex route discovery (V2.0.1): the automatic SOL
 * decision engine through Pi's native `openai-codex` provider. Exact and
 * FAIL-CLOSED like the classic route:
 *
 * - a configured endpoint for `gpt-5.6-sol` is required;
 * - provider channel must be 'pi' (the Pi CLI transport);
 * - model must be `gpt-5.6-sol`; XHIGH reasoning and the role are
 *   required;
 * - anything else throws `ProviderDiscoveryError` — the policy then fails
 *   closed (no silent substitute, no downgrade).
 *
 * The OAuth credential availability itself is a controller-owned runtime
 * fact checked separately by `assertCodexOAuthAvailable`
 * (src/providers/oauth.mjs) — never a discovery/config concern.
 *
 * @param {string} role - one of SOL_ROLES
 * @param {object} config - discovery config (must configure endpoint 'gpt-5.6-sol')
 * @returns {Readonly<object>} frozen spec + role
 */
export function discoverSolCodexRoute(role, config = {}) {
  assertSolRole(role);
  const spec = discoverModel(CODEX_SOL_MODEL, config);
  assertSolSpec(spec, CODEX_SOL_MODEL, role, 'pi');
  return Object.freeze({ ...spec, role });
}

/**
 * Deterministic SOL channel resolution (V2.0.1, fifth-review repair).
 * CURRENT production routing is CODEX-ONLY:
 *
 * - only `gpt-5.6-sol` endpoint configured -> 'codex' (provider 'pi');
 * - the classic `sol-xhigh` endpoint configured (alone or with codex)
 *   -> throws `ProviderDiscoveryError` (reason
 *   'SOL_CHANNEL_CLASSIC_NO_AUTHORITY') — the classic channel has no
 *   production SOL authority in 2.1; routing fails closed and the
 *   operator must remove the legacy endpoint;
 * - neither -> null (policy fails closed with PROVIDER_UNAVAILABLE).
 *
 * The classic route is retained ONLY as immutable 2.0.0 historical
 * semantics (`discoverSolRoute` below stays available for validating old
 * 2.0 records); it is never a current-production routing channel.
 *
 * @param {object} config - discovery config (endpoints map)
 * @returns {'codex'|null}
 */
export function resolveSolChannel(config = {}) {
  const classic = configuredEndpoint(config, CLASSIC_SOL_MODEL);
  const codex = configuredEndpoint(config, CODEX_SOL_MODEL);
  if (classic !== null) {
    throw new ProviderDiscoveryError(
      `endpoints.${CLASSIC_SOL_MODEL} has no production SOL authority in 2.1 (classic sol-xhigh cannot bypass the strict openai-codex transport gate); remove the legacy endpoint and configure endpoints.${CODEX_SOL_MODEL} instead — routing fails closed`,
      { reason: 'SOL_CHANNEL_CLASSIC_NO_AUTHORITY' },
    );
  }
  if (codex !== null) return 'codex';
  return null;
}

/**
 * Enforce the reasoning floor (XHIGH) and the model's supported set.
 *
 * @param {string} modelKey
 * @param {string} reasoningLevel - 'XHIGH' | 'MAX'
 * @param {object} config
 */
export function assertNoDowngrade(modelKey, reasoningLevel, config = {}) {
  if (!REASONING_LEVELS.includes(reasoningLevel)) {
    throw new ProviderDiscoveryError(
      `invalid reasoning level ${JSON.stringify(reasoningLevel)}: only ${REASONING_LEVELS.join(', ')} are supported; never below ${MIN_REASONING_LEVEL}`,
      { modelKey, reasoningLevel },
    );
  }
  const spec = discoverModel(modelKey, config);
  if (!spec.supportedReasoning.includes(reasoningLevel)) {
    throw new ProviderDiscoveryError(
      `model ${JSON.stringify(modelKey)} does not support reasoning level ${JSON.stringify(reasoningLevel)} (supported: ${spec.supportedReasoning.join(', ')})`,
      { modelKey, reasoningLevel, supported: spec.supportedReasoning },
    );
  }
  return Object.freeze({ modelKey, reasoningLevel, spec });
}
