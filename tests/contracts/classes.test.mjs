/**
 * Sprint 04 unit tests: risk-class and negative side-effect representation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HIGH_RISK_CLASSES,
  RISK_CLASSES,
  isHighRiskClass,
  isValidRiskClass,
  assertRiskClass,
} from '../../src/risk/classes.mjs';
import {
  SIDE_EFFECT_SCOPES,
  isValidSideEffectScope,
  assertSideEffectSpec,
} from '../../src/risk/side-effects.mjs';
import { ConfigError } from '../../src/shared/errors.mjs';

test('the six mandated high-risk classes exist with exact names', () => {
  assert.deepEqual(HIGH_RISK_CLASSES, [
    'AUTHORIZATION_SECURITY_PROVIDER',
    'MIGRATION',
    'IDENTITY',
    'FINANCIAL',
    'PRODUCTION_EXECUTION',
    'IRREVERSIBLE_LIFECYCLE_DATA',
  ]);
  for (const cls of HIGH_RISK_CLASSES) {
    assert.equal(isHighRiskClass(cls), true, cls);
    assert.equal(isValidRiskClass(cls), true, cls);
  }
});

test('LOW_RISK is the explicit non-high-risk class', () => {
  assert.equal(isHighRiskClass('LOW_RISK'), false);
  assert.equal(isValidRiskClass('LOW_RISK'), true);
  assert.deepEqual([...new Set(RISK_CLASSES)].length, RISK_CLASSES.length);
  assert.equal(RISK_CLASSES.includes('LOW_RISK'), true);
});

test('unknown risk classes are rejected (never defaulted)', () => {
  assert.equal(isValidRiskClass('MEDIUM_RISK'), false);
  assert.equal(isValidRiskClass(undefined), false);
  assert.throws(() => assertRiskClass('MEDIUM_RISK'), ConfigError);
  assert.throws(() => assertRiskClass(undefined), ConfigError);
});

test('negative side-effect scopes cover provider/network/db/lock/mutation', () => {
  assert.deepEqual(SIDE_EFFECT_SCOPES, [
    'provider_factory',
    'network',
    'database',
    'lock',
    'mutation',
  ]);
  for (const scope of SIDE_EFFECT_SCOPES) {
    assert.equal(isValidSideEffectScope(scope), true);
  }
  assert.equal(isValidSideEffectScope('filesystem'), false);
});

test('assertSideEffectSpec fails closed on malformed specs', () => {
  assertSideEffectSpec({
    gate: 'authorization failure',
    scope: 'provider_factory',
    requirement: 'zero provider factory invocations',
    expectedCount: 0,
  });
  assert.throws(
    () =>
      assertSideEffectSpec({
        gate: 'authorization failure',
        scope: 'provider_factory',
        requirement: 'x',
        expectedCount: -1,
      }),
    ConfigError,
  );
  assert.throws(
    () =>
      assertSideEffectSpec({
        gate: 'authorization failure',
        scope: 'provider_factory',
        requirement: 'x',
        expectedCount: 0.5,
      }),
    ConfigError,
  );
  assert.throws(
    () =>
      assertSideEffectSpec({
        gate: 'authorization failure',
        scope: 'not_a_scope',
        requirement: 'x',
        expectedCount: 0,
      }),
    ConfigError,
  );
  assert.throws(
    () =>
      assertSideEffectSpec({
        gate: 'authorization failure',
        scope: 'network',
        requirement: 'x',
        expectedCount: 0,
        evidenceKind: 'grep -r',
      }),
    ConfigError,
  );
  assert.throws(() => assertSideEffectSpec(null), ConfigError);
  assert.throws(() => assertSideEffectSpec({}), ConfigError);
});
