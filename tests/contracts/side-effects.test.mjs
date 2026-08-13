/**
 * Sprint 04 SOL-S04-004 regression tests: negative side effects must have
 * unique identity and exact carry.
 *
 * - every negative side-effect requirement has a deterministic
 *   content-bound sideEffectId (never gate::scope, never array index);
 * - duplicate identities fail; two requirements sharing gate::scope stay
 *   independently identified;
 * - acceptance/repair representations preserve the exact source fields
 *   (identity, gate, scope, requirement, expectedCount, evidenceKind) —
 *   tampering any field fails closed;
 * - each requirement gets its own independently traceable acceptance test;
 * - repairs carry the exact side-effect specification.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileSemanticContract,
  isAuthoritative,
} from '../../src/contracts/compiler.mjs';
import { validateSemanticContract, validateAcceptanceContract } from '../../src/contracts/validate.mjs';
import { buildRepairContract } from '../../src/contracts/repair.mjs';
import { computeSemanticDigest } from '../../src/contracts/digest.mjs';
import { sideEffectIdForSpec, SIDE_EFFECT_ID_PATTERN } from '../../src/risk/side-effects.mjs';
import { readFixture, rawInputFromFixture } from '../helpers/semantic-fixture.mjs';

const NOW = '2025-01-01T00:00:00.000Z';

const GATE_EFFECTS = [
  {
    gate: 'authorization failure',
    scope: 'provider_factory',
    requirement: 'provider factory invocations remain zero before an authorization failure is handled',
    expectedCount: 0,
    evidenceKind: 'instrumented_counter',
  },
  {
    gate: 'authorization failure',
    scope: 'network',
    requirement: 'outbound network requests remain zero before an authorization failure is handled',
    expectedCount: 0,
    evidenceKind: 'audit_log',
  },
];

function minimalSource(overrides = {}) {
  return {
    contractKey: 'side-effect.test',
    title: 'Side-effect identity test',
    riskClass: 'AUTHORIZATION_SECURITY_PROVIDER',
    sourceObjects: [
      { key: 'src', kind: 'fixture', ref: 'test input', authority: 'unit test' },
    ],
    concepts: [
      {
        name: 'gate',
        kind: 'gate',
        authoritativeFieldNames: ['gate_passed'],
        ownership: 'unit test',
        sourceObjectKey: 'src',
      },
    ],
    distinctConcepts: [],
    negativeSideEffects: GATE_EFFECTS,
    factsEstablished: [],
    unresolvedSemantics: [],
    ...overrides,
  };
}

function compileProvider() {
  return compileSemanticContract(
    rawInputFromFixture(readFixture('bl020-provider-construction-before-authz.json')),
    { compiledAt: NOW },
  );
}

function repairFor(semantic, { targetScope = 'provider_factory' } = {}) {
  const rejected = semantic.negativeSideEffects.find((s) => s.scope === targetScope);
  return buildRepairContract({
    semanticContract: semantic,
    rejectedAcceptanceRefs: [rejected.sideEffectId],
    objective: 'fix the leak',
    violation: 'side effect leaked before the gate',
    requiredBehavior: 'count stays zero before the gate',
    mustChange: [{ target: targetScope, change: 'move the side effect after the gate' }],
    verification: [{ method: 'run negative test', expectation: 'passes' }],
    createdAt: NOW,
  });
}

test('SOL-S04-004: sideEffectId is deterministic, content-bound, and unique per requirement', () => {
  const contract = compileSemanticContract(minimalSource(), { compiledAt: NOW });
  const ids = contract.negativeSideEffects.map((s) => s.sideEffectId);
  for (const id of ids) assert.match(id, SIDE_EFFECT_ID_PATTERN);
  assert.equal(new Set(ids).size, ids.length);
  // deterministic: recompiling identical content yields identical ids
  const again = compileSemanticContract(minimalSource(), { compiledAt: NOW });
  assert.deepEqual(
    again.negativeSideEffects.map((s) => s.sideEffectId),
    ids,
  );
  // content-bound: a different requirement gets a different id even with
  // identical gate::scope
  const gs = GATE_EFFECTS[0];
  const a = sideEffectIdForSpec(gs);
  const b = sideEffectIdForSpec({ ...gs, requirement: 'a different requirement text' });
  assert.notEqual(a, b);
});

test('SOL-S04-004: duplicate sideEffectId => fail', () => {
  // two identical requirements derive the same content-bound identity
  const dup = minimalSource({
    negativeSideEffects: [GATE_EFFECTS[0], { ...GATE_EFFECTS[0] }],
  });
  assert.throws(() => compileSemanticContract(dup, { compiledAt: NOW })); // ContractCompileError
  // document-level validation reports DUPLICATE_SIDE_EFFECT_ID
  const doc = compileSemanticContract(minimalSource(), { compiledAt: NOW });
  const forged = JSON.parse(JSON.stringify(doc));
  forged.negativeSideEffects.push({ ...forged.negativeSideEffects[0] });
  forged.semanticDigest = computeSemanticDigest(forged);
  const res = validateSemanticContract(forged);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.message.includes('DUPLICATE_SIDE_EFFECT_ID')));
});

test('SOL-S04-004: two side effects sharing gate::scope stay independently identified', () => {
  const shared = minimalSource({
    negativeSideEffects: [
      { gate: 'g', scope: 'network', requirement: 'zero outbound calls', expectedCount: 0, evidenceKind: 'audit_log' },
      { gate: 'g', scope: 'network', requirement: 'zero DNS lookups', expectedCount: 0, evidenceKind: 'audit_log' },
    ],
  });
  const contract = compileSemanticContract(shared, { compiledAt: NOW });
  const ids = contract.negativeSideEffects.map((s) => s.sideEffectId);
  assert.equal(new Set(ids).size, 2, 'same gate::scope, distinct requirements => distinct identities');
  const repair = repairFor(contract, { targetScope: 'network' });
  // two independent acceptance tests, one per identity
  const guards = repair.acceptanceTests.filter((t) => t.negativeSideEffectId !== undefined);
  assert.equal(guards.length, 2);
  assert.equal(new Set(guards.map((t) => t.negativeSideEffectId)).size, 2);
  for (const s of contract.negativeSideEffects) {
    assert.ok(guards.some((t) => t.negativeSideEffectId === s.sideEffectId));
  }
});

test('SOL-S04-004: tampering any carried field fails closed', () => {
  const semantic = compileProvider();
  const repair = repairFor(semantic);
  assert.deepEqual(validateAcceptanceContract(repair, { semanticContract: semantic }).errors, []);

  const sourceSpec = semantic.negativeSideEffects.find((s) => s.scope === 'provider_factory');
  const cases = [
    ['requirement', { requirement: 'tampered requirement' }],
    ['expectedCount', { expectedCount: 7 }],
    ['evidenceKind', { evidenceKind: 'transaction_count' }],
    ['gate', { gate: 'tampered gate' }],
    ['scope', { scope: 'mutation' }],
    ['sideEffectId', { sideEffectId: 'se_' + 'c'.repeat(64) }],
  ];
  for (const [label, patch] of cases) {
    const tampered = JSON.parse(JSON.stringify(repair));
    const carried = tampered.negativeSideEffects.find(
      (s) => s.sideEffectId === sourceSpec.sideEffectId,
    );
    assert.ok(carried, label);
    Object.assign(carried, patch);
    const res = validateAcceptanceContract(tampered, { semanticContract: semantic });
    assert.equal(res.valid, false, `${label} tamper must fail closed`);
    assert.ok(
      res.errors.some((e) => e.message.includes('SIDE_EFFECT_CARRY_MISMATCH') || e.message.includes('SIDE_EFFECT_NOT_FROM_SOURCE')),
      `${label} expected carry mismatch, got: ${JSON.stringify(res.errors)}`,
    );
  }
});

test('SOL-S04-004: dropped carry and missing acceptance test fail closed', () => {
  const semantic = compileProvider();
  const repair = repairFor(semantic);
  // drop a carried spec entirely
  const dropped = JSON.parse(JSON.stringify(repair));
  dropped.negativeSideEffects = dropped.negativeSideEffects.filter(
    (s) => s.scope !== 'network',
  );
  const res1 = validateAcceptanceContract(dropped, { semanticContract: semantic });
  assert.equal(res1.valid, false);
  assert.ok(res1.errors.some((e) => e.message.includes('SIDE_EFFECT_NOT_CARRIED')));

  // remove an acceptance-test entry without dropping the carry
  const noTest = JSON.parse(JSON.stringify(repair));
  const networkId = semantic.negativeSideEffects.find((s) => s.scope === 'network').sideEffectId;
  noTest.acceptanceTests = noTest.acceptanceTests.filter(
    (t) => t.negativeSideEffectId !== networkId,
  );
  const res2 = validateAcceptanceContract(noTest, { semanticContract: semantic });
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some((e) => e.message.includes('SIDE_EFFECT_TEST_MISSING')));

  // acceptance test with wrong pinned count fails closed
  const wrongPin = JSON.parse(JSON.stringify(repair));
  const networkTest = wrongPin.acceptanceTests.find((t) => t.negativeSideEffectId === networkId);
  networkTest.expectedSideEffectCount = 3;
  const res3 = validateAcceptanceContract(wrongPin, { semanticContract: semantic });
  assert.equal(res3.valid, false);
  assert.ok(res3.errors.some((e) => e.message.includes('SIDE_EFFECT_TEST_MISMATCH')));
});

test('SOL-S04-004: repair preserves the exact side-effect specification (including rejected targets)', () => {
  const semantic = compileProvider();
  const repair = repairFor(semantic);
  // the full source spec set is carried exactly, rejected target included
  assert.equal(repair.negativeSideEffects.length, semantic.negativeSideEffects.length);
  for (const s of semantic.negativeSideEffects) {
    const carried = repair.negativeSideEffects.find((c) => c.sideEffectId === s.sideEffectId);
    assert.ok(carried, s.sideEffectId);
    assert.equal(carried.gate, s.gate);
    assert.equal(carried.scope, s.scope);
    assert.equal(carried.requirement, s.requirement);
    assert.equal(carried.expectedCount, s.expectedCount);
    assert.equal(carried.evidenceKind, s.evidenceKind);
  }
  // the rejected target's requirement stays authoritative (worker repairs
  // implementation, never the requirement)
  const rejectedId = repair.rejectedAcceptanceRefs[0];
  const target = repair.negativeSideEffects.find((s) => s.sideEffectId === rejectedId);
  assert.equal(target.requirement, semantic.negativeSideEffects.find((s) => s.sideEffectId === rejectedId).requirement);
  // non-rejected specs are frozen in frozenSemantics
  for (const s of semantic.negativeSideEffects) {
    if (s.sideEffectId === rejectedId) continue;
    assert.ok(
      repair.frozenSemantics.negativeSideEffects.some((f) => f.sideEffectId === s.sideEffectId),
      `frozen carry missing ${s.sideEffectId}`,
    );
  }
  assert.ok(
    !repair.frozenSemantics.negativeSideEffects.some((f) => f.sideEffectId === rejectedId),
    'rejected target must not appear in the frozen section',
  );
});

test('SOL-S04-004: every acceptance item traces uniquely back to a source sideEffectId', () => {
  const semantic = compileProvider();
  const repair = repairFor(semantic);
  const sourceIds = new Set(semantic.negativeSideEffects.map((s) => s.sideEffectId));
  const guardIds = repair.acceptanceTests
    .filter((t) => t.negativeSideEffectId !== undefined)
    .map((t) => t.negativeSideEffectId);
  assert.equal(new Set(guardIds).size, guardIds.length, 'guard test ids are unique');
  for (const id of guardIds) {
    assert.ok(sourceIds.has(id), `guard test ${id} must trace to a source side-effect`);
  }
  assert.equal(guardIds.length, sourceIds.size, 'one acceptance item per requirement');
  // gate::scope alone never identifies an item: distinct ids with the same
  // gate::scope are allowed and traced by id
  const provider = semantic.negativeSideEffects.find((s) => s.scope === 'provider_factory');
  assert.ok(repair.acceptanceTests.some((t) => t.negativeSideEffectId === provider.sideEffectId));
});

test('SOL-S04-004: semantic document with a tampered sideEffectId fails validation', () => {
  const semantic = compileProvider();
  const forged = JSON.parse(JSON.stringify(semantic));
  const spec = forged.negativeSideEffects[0];
  spec.sideEffectId = 'se_' + 'e'.repeat(64); // does not match derived content id
  const res = validateSemanticContract(forged);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.message.includes('SIDE_EFFECT_ID_MISMATCH')));
  assert.equal(isAuthoritative(forged), false);
});
