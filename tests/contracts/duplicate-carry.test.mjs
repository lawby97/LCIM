/**
 * Sprint 04 SOL-S04-R2-002 tests: duplicate carried side-effect records and
 * duplicate acceptance-test references must fail closed.
 *
 * A repair/acceptance document may carry each source side-effect identity
 * EXACTLY ONCE and reference it with EXACTLY ONE acceptance test. The
 * previous last-entry-wins Map.set() carry and first-match .find() test
 * lookup must never mask tampered duplicates, exact duplicates, or
 * duplicate test references — duplicate identity is itself invalid. Two
 * DISTINCT side effects may still share gate::scope when their
 * sideEffectIds differ; gate::scope is never restored as identity.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSemanticContract } from '../../src/contracts/compiler.mjs';
import { validateAcceptanceContract } from '../../src/contracts/validate.mjs';
import { readFixture, rawInputFromFixture } from '../helpers/semantic-fixture.mjs';

const NOW = '2025-01-01T00:00:00.000Z';

function compileProvider() {
  return compileSemanticContract(
    rawInputFromFixture(readFixture('bl020-provider-construction-before-authz.json')),
    { compiledAt: NOW },
  );
}

/** Manually constructed acceptance/repair document bound to `source`. */
function acceptanceDocFor(source, { rejectedId } = {}) {
  const effects = source.negativeSideEffects ?? [];
  const rejected = rejectedId ?? effects[0]?.sideEffectId;
  const rejectedScope = effects.find((s) => s.sideEffectId === rejected)?.scope ?? 'provider_factory';
  return {
    schemaName: 'lcim.acceptance-contract',
    schemaVersion: '2.0.0',
    repairId: 'lcim_repair_' + 'a'.repeat(32),
    contractKey: source.contractKey,
    sourceSemanticDigest: source.semanticDigest,
    rejectedAcceptanceRefs: [rejected],
    objective: 'ensure provider construction never precedes persisted authorization',
    violation: 'provider factory was constructed before the authorization failure was handled',
    requiredBehavior: 'authorization failure terminates the flow with zero side effects',
    mustChange: [
      { target: rejectedScope, change: 'move construction after the persisted authorization check' },
    ],
    mustNotChange: [],
    acceptanceTests: [
      ...effects.map((s) => ({
        name: `side-effect guard: ${s.sideEffectId}`,
        expectation: s.requirement,
        negativeSideEffectId: s.sideEffectId,
        negativeSideEffectScope: s.scope,
        expectedSideEffectCount: s.expectedCount,
      })),
      { name: 'authorization failure path returns the error', expectation: 'no provider is created' },
    ],
    negativeSideEffects: JSON.parse(JSON.stringify(effects)),
    frozenSemantics: {
      sourceObjects: JSON.parse(JSON.stringify(source.sourceObjects ?? [])),
      concepts: JSON.parse(JSON.stringify(source.concepts ?? [])),
      distinctConcepts: JSON.parse(JSON.stringify(source.distinctConcepts ?? [])),
      negativeSideEffects: JSON.parse(
        JSON.stringify(effects.filter((s) => s.sideEffectId !== rejected)),
      ),
      factsEstablished: JSON.parse(JSON.stringify(source.factsEstablished ?? [])),
      unresolvedSemantics: JSON.parse(JSON.stringify(source.unresolvedSemantics ?? [])),
    },
    verification: [{ method: 'run negative side-effect test', expectation: 'all expectedCount assertions pass' }],
    createdAt: NOW,
  };
}

test('R2-002-A: duplicate carry with a tampered first entry fails for every tampered field', () => {
  const source = compileProvider();
  const repair = acceptanceDocFor(source);
  const exact = repair.negativeSideEffects[0];
  const variants = [
    ['gate', { gate: 'tampered gate' }],
    ['scope', { scope: 'mutation' }],
    ['requirement', { requirement: 'tampered requirement' }],
    ['expectedCount', { expectedCount: 7 }],
    ['evidenceKind', { evidenceKind: 'transaction_count' }],
  ];
  for (const [label, patch] of variants) {
    const doc = JSON.parse(JSON.stringify(repair));
    // tampered duplicate FIRST, exact source copy LATER — the entry
    // Map.set() used to retain (last-entry-wins)
    doc.negativeSideEffects = [{ ...exact, ...patch }, exact];
    const result = validateAcceptanceContract(doc, { semanticContract: source });
    assert.equal(result.valid, false, `${label}: tampered duplicate must fail closed`);
    assert.ok(
      result.errors.some((e) => e.message.includes('DUPLICATE_CARRIED_SIDE_EFFECT')),
      `${label}: expected DUPLICATE_CARRIED_SIDE_EFFECT, got ${JSON.stringify(result.errors)}`,
    );
  }
});

test('R2-002-B: two exact duplicate carried entries still fail (no duplicate-but-identical exception)', () => {
  const source = compileProvider();
  const repair = acceptanceDocFor(source);
  const first = repair.negativeSideEffects[0];
  const doc = JSON.parse(JSON.stringify(repair));
  doc.negativeSideEffects = [first, JSON.parse(JSON.stringify(first))];
  const result = validateAcceptanceContract(doc, { semanticContract: source });
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.message.includes('DUPLICATE_CARRIED_SIDE_EFFECT')),
    JSON.stringify(result.errors),
  );
});

test('R2-002-C: two identical acceptance tests referencing one negativeSideEffectId fail', () => {
  const source = compileProvider();
  const repair = acceptanceDocFor(source);
  const doc = JSON.parse(JSON.stringify(repair));
  const id = doc.negativeSideEffects[0].sideEffectId;
  const guard = doc.acceptanceTests.find((t) => t.negativeSideEffectId === id);
  doc.acceptanceTests = [
    guard,
    JSON.parse(JSON.stringify(guard)),
    ...doc.acceptanceTests.filter((t) => t !== guard),
  ];
  const result = validateAcceptanceContract(doc, { semanticContract: source });
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.message.includes('DUPLICATE_SIDE_EFFECT_TEST')),
    JSON.stringify(result.errors),
  );
});

test('R2-002-D: two conflicting acceptance tests referencing one negativeSideEffectId fail', () => {
  const source = compileProvider();
  const repair = acceptanceDocFor(source);
  const doc = JSON.parse(JSON.stringify(repair));
  const id = doc.negativeSideEffects[0].sideEffectId;
  const guard = doc.acceptanceTests.find((t) => t.negativeSideEffectId === id);
  const conflicting = {
    ...JSON.parse(JSON.stringify(guard)),
    expectedSideEffectCount: 3, // conflicts with source expectedCount 0
  };
  doc.acceptanceTests = [
    guard,
    conflicting,
    ...doc.acceptanceTests.filter((t) => t !== guard),
  ];
  const result = validateAcceptanceContract(doc, { semanticContract: source });
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.message.includes('DUPLICATE_SIDE_EFFECT_TEST')),
    JSON.stringify(result.errors),
  );
});

test('R2-002-E: exactly one carried record and one test per sideEffectId => VALID', () => {
  const source = compileProvider();
  const doc = acceptanceDocFor(source);
  const result = validateAcceptanceContract(doc, { semanticContract: source });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual(result.errors, []);
});

test('R2-002-F: two distinct side effects sharing gate::scope stay valid with distinct ids', () => {
  const raw = rawInputFromFixture(readFixture('bl020-provider-construction-before-authz.json'));
  raw.negativeSideEffects = [
    {
      gate: 'gate failure',
      scope: 'network',
      requirement: 'zero outbound calls before the gate',
      expectedCount: 0,
      evidenceKind: 'audit_log',
    },
    {
      gate: 'gate failure',
      scope: 'network',
      requirement: 'zero DNS lookups before the gate',
      expectedCount: 0,
      evidenceKind: 'audit_log',
    },
  ];
  const source = compileSemanticContract(raw, { compiledAt: NOW });
  const ids = source.negativeSideEffects.map((s) => s.sideEffectId);
  assert.equal(new Set(ids).size, 2, 'distinct requirements => distinct deterministic ids');
  assert.equal(source.negativeSideEffects[0].gate, source.negativeSideEffects[1].gate);
  assert.equal(source.negativeSideEffects[0].scope, source.negativeSideEffects[1].scope);

  const doc = acceptanceDocFor(source, { rejectedId: ids[0] });
  const result = validateAcceptanceContract(doc, { semanticContract: source });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  // each identity carried exactly once and independently tested
  const guards = doc.acceptanceTests.filter((t) => t.negativeSideEffectId !== undefined);
  assert.equal(guards.length, 2);
  assert.equal(new Set(guards.map((t) => t.negativeSideEffectId)).size, 2);
});
