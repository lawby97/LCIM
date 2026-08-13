/**
 * Sprint 05 tests: exact provider/model discovery — fail rather than
 * silently substitute; Terra/Luna disabled from the default ladder.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  discoverModel,
  resolveImplementationModel,
  assertNoDowngrade,
  capabilityEqual,
} from '../../src/providers/capabilities/discovery.mjs';
import {
  DEFAULT_IMPLEMENTATION_LADDER,
  MODEL_SPECS,
  DISABLED_DEFAULT_MODELS,
  isDefaultLadderModel,
  isDisabledDefaultModel,
  MIN_REASONING_LEVEL,
  SOL_ROLES,
} from '../../src/providers/capabilities/metadata.mjs';
import { ProviderDiscoveryError } from '../../src/routing/errors.mjs';
import { decideRoute } from '../../src/routing/policy.mjs';
import { makeCtx, defaultConfig, FLASH_ENDPOINT, TERRA_ENDPOINT, LUNA_ENDPOINT, PRO_MAX_ENDPOINT, SOL_ENDPOINT } from '../helpers/routing-fixture.mjs';

const NOW = '2025-01-01T00:00:00.000Z';

test('Terra is NOT the architecture default and is absent from the default ladder', () => {
  assert.deepEqual(DEFAULT_IMPLEMENTATION_LADDER, ['deepseek-v4-flash']);
  assert.equal(isDefaultLadderModel('terra'), false);
  assert.equal(isDefaultLadderModel('luna'), false);
  assert.equal(isDefaultLadderModel('deepseek-v4-flash'), true);
  assert.ok(DISABLED_DEFAULT_MODELS.includes('terra'));
  assert.ok(DISABLED_DEFAULT_MODELS.includes('luna'));
  assert.equal(MODEL_SPECS.terra.disabledByDefault, true);
  assert.equal(MODEL_SPECS['deepseek-pro-max'].escalationOnly, true);
});

test('SOL roles are exactly the four xhigh roles', () => {
  assert.deepEqual(SOL_ROLES, ['SOL_CONTRACT_CHECK', 'SOL_DIAGNOSE', 'SOL_FINAL_REVIEW', 'SOL_RECHECK']);
});

test('exact discovery resolves a configured model with its endpoint', () => {
  const spec = discoverModel('deepseek-v4-flash', defaultConfig());
  assert.equal(spec.modelKey, 'deepseek-v4-flash');
  assert.equal(spec.provider, 'pi');
  assert.deepEqual(spec.endpoint, FLASH_ENDPOINT);
  assert.equal(spec.defaultReasoning, 'XHIGH');
});

test('unknown model key fails closed', () => {
  assert.throws(() => discoverModel('gpt-9000', defaultConfig()), ProviderDiscoveryError);
});

test('known model without a configured endpoint is NOT discovered', () => {
  assert.throws(() => discoverModel('deepseek-v4-flash', {}), ProviderDiscoveryError);
});

test('disabled-by-default models (Terra/Luna) need explicit enablement', () => {
  assert.throws(
    () => discoverModel('terra', { endpoints: { terra: TERRA_ENDPOINT } }),
    ProviderDiscoveryError,
  );
  const spec = discoverModel('terra', {
    endpoints: { terra: TERRA_ENDPOINT },
    enableOptionalFallbacks: ['terra'],
  });
  assert.equal(spec.modelKey, 'terra');
});

test('no silent substitution: policy fails with FAIL_NO_SUBSTITUTE when nothing is discovered', () => {
  const decision = decideRoute(makeCtx({ config: {}, decidedAt: NOW }));
  assert.equal(decision.decision, 'FAIL_NO_SUBSTITUTE');
  assert.equal(decision.reasonCode, 'PROVIDER_UNAVAILABLE');
  assert.equal(decision.nextState, 'FAILED_NO_SUBSTITUTE');
  assert.equal(decision.targetModel, undefined);
});

test('explicit exact substitute is allowed and recorded, never silent', () => {
  const resolved = resolveImplementationModel({
    endpoints: { terra: TERRA_ENDPOINT },
    enableOptionalFallbacks: ['terra'],
    exactSubstitutes: { 'deepseek-v4-flash': 'terra' },
  });
  assert.equal(resolved.spec.modelKey, 'terra');
  assert.equal(resolved.substituteOf, 'deepseek-v4-flash');
  assert.equal(resolved.substitutionKind, 'exact');

  const decision = decideRoute(
    makeCtx({
      config: {
        endpoints: { terra: TERRA_ENDPOINT },
        enableOptionalFallbacks: ['terra'],
        exactSubstitutes: { 'deepseek-v4-flash': 'terra' },
      },
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.decision, 'ROUTE_IMPLEMENT_FLASH');
  assert.equal(decision.targetModel, 'terra');
  assert.equal(decision.substituteOf, 'deepseek-v4-flash');
  assert.equal(decision.reasonCode, 'EXACT_SUBSTITUTE_CONFIGURED');
});

test('a capability-unequal exact substitute is refused', () => {
  // sol-xhigh has SOL roles, not IMPLEMENT/REPAIR: not capability-equal.
  assert.throws(
    () =>
      resolveImplementationModel({
        endpoints: { 'sol-xhigh': SOL_ENDPOINT },
        exactSubstitutes: { 'deepseek-v4-flash': 'sol-xhigh' },
      }),
    ProviderDiscoveryError,
  );
});

test('capabilityEqual compares roles and supported reasoning exactly', () => {
  assert.equal(capabilityEqual(MODEL_SPECS['deepseek-v4-flash'], MODEL_SPECS.terra), true);
  assert.equal(capabilityEqual(MODEL_SPECS['deepseek-v4-flash'], MODEL_SPECS['sol-xhigh']), false);
  assert.equal(capabilityEqual(MODEL_SPECS['deepseek-v4-flash'], undefined), false);
});

test('deepseek-pro-max is never capability-equal to Flash (escalation-only)', () => {
  assert.equal(MODEL_SPECS['deepseek-pro-max'].escalationOnly, true);
  assert.equal(capabilityEqual(MODEL_SPECS['deepseek-v4-flash'], MODEL_SPECS['deepseek-pro-max']), false);
});

test('Flash exact substitute -> Pro MAX fails closed', () => {
  const config = {
    endpoints: { 'deepseek-pro-max': PRO_MAX_ENDPOINT },
    exactSubstitutes: { 'deepseek-v4-flash': 'deepseek-pro-max' },
  };
  assert.throws(() => resolveImplementationModel(config), ProviderDiscoveryError);
  const decision = decideRoute(makeCtx({ config, decidedAt: NOW }));
  assert.equal(decision.decision, 'FAIL_NO_SUBSTITUTE');
  assert.equal(decision.reasonCode, 'CAPABILITY_GAP_NO_SUBSTITUTE');
  assert.equal(decision.nextState, 'FAILED_NO_SUBSTITUTE');
});

test('Flash optional fallback -> Pro MAX fails closed', () => {
  const config = {
    endpoints: { 'deepseek-pro-max': PRO_MAX_ENDPOINT },
    enableOptionalFallbacks: ['deepseek-pro-max'],
  };
  assert.throws(() => resolveImplementationModel(config), ProviderDiscoveryError);
  const decision = decideRoute(makeCtx({ config, decidedAt: NOW }));
  assert.equal(decision.decision, 'FAIL_NO_SUBSTITUTE');
  assert.equal(decision.reasonCode, 'PROVIDER_UNAVAILABLE');
});

test('optional capability fallback (Terra) works only when explicitly configured and is recorded', () => {
  const resolved = resolveImplementationModel({
    endpoints: { terra: TERRA_ENDPOINT },
    enableOptionalFallbacks: ['terra'],
  });
  assert.equal(resolved.spec.modelKey, 'terra');
  assert.equal(resolved.substitutionKind, 'fallback');

  const decision = decideRoute(
    makeCtx({
      config: { endpoints: { terra: TERRA_ENDPOINT }, enableOptionalFallbacks: ['terra'] },
      decidedAt: NOW,
    }),
  );
  assert.equal(decision.targetModel, 'terra');
  assert.equal(decision.reasonCode, 'CAPABILITY_FALLBACK_CONFIGURED');
  assert.equal(decision.substituteOf, 'deepseek-v4-flash');
});

test('multiple fallbacks try in configured order and fail closed when none work', () => {
  const resolved = resolveImplementationModel({
    endpoints: { terra: TERRA_ENDPOINT },
    enableOptionalFallbacks: ['terra', 'luna'],
  });
  assert.equal(resolved.spec.modelKey, 'terra');

  assert.throws(
    () => resolveImplementationModel({ endpoints: { luna: LUNA_ENDPOINT }, enableOptionalFallbacks: ['terra'] }),
    ProviderDiscoveryError,
  );
});

test('assertNoDowngrade enforces the XHIGH floor and supported reasoning', () => {
  assertNoDowngrade('deepseek-v4-flash', 'XHIGH', defaultConfig());
  assertNoDowngrade('deepseek-v4-flash', 'MAX', defaultConfig());
  assert.throws(() => assertNoDowngrade('deepseek-v4-flash', 'LOW', defaultConfig()), ProviderDiscoveryError);
  assert.throws(() => assertNoDowngrade('sol-xhigh', 'MAX', { endpoints: { 'sol-xhigh': SOL_ENDPOINT } }), ProviderDiscoveryError);
  assert.equal(MIN_REASONING_LEVEL, 'XHIGH');
});

test('default ladder resolution is exact and reports no substitution', () => {
  const resolved = resolveImplementationModel(defaultConfig());
  assert.equal(resolved.spec.modelKey, 'deepseek-v4-flash');
  assert.equal(resolved.substituteOf, null);
  assert.equal(resolved.substitutionKind, null);
  // pro-max is NOT on the default ladder: configuring only pro-max fails exact discovery
  assert.throws(
    () => resolveImplementationModel({ endpoints: { 'deepseek-pro-max': PRO_MAX_ENDPOINT } }),
    ProviderDiscoveryError,
  );
});

test('flash endpoint present but pro-max missing: normal route works, Pro MAX fails closed', () => {
  const config = { endpoints: { 'deepseek-v4-flash': FLASH_ENDPOINT } };
  const normal = decideRoute(makeCtx({ config, decidedAt: NOW }));
  assert.equal(normal.decision, 'ROUTE_IMPLEMENT_FLASH');

  const pro = decideRoute(
    makeCtx({
      config,
      escalation: { model: 'deepseek-pro-max', basis: 'SOL_DIRECTED_REPAIR', detail: 'x' },
      decidedAt: NOW,
    }),
  );
  assert.equal(pro.decision, 'FAIL_NO_SUBSTITUTE');
  assert.equal(pro.reasonCode, 'PROVIDER_UNAVAILABLE');
});
