/**
 * Sprint 04 SOL-S04-003 regression tests: deterministic semantic content
 * identity.
 *
 * - identical canonical semantics compile to the same semanticDigest;
 * - incidental JSON key insertion order never changes the digest;
 * - changing ANY authority-bearing category changes the digest;
 * - two different contracts sharing one contractKey get different digests;
 * - acceptance/repair contracts bind to sourceSemanticDigest (wrong digest
 *   fails closed);
 * - BL-020: altering decision/evidence/membership semantics changes the
 *   digest (semantic identity, not prose comparison).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileSemanticContract,
  isAuthoritative,
} from '../../src/contracts/compiler.mjs';
import { computeSemanticDigest, canonicalizeJson } from '../../src/contracts/digest.mjs';
import { validateAcceptanceContract } from '../../src/contracts/validate.mjs';
import { buildRepairContract } from '../../src/contracts/repair.mjs';
import { readFixture, rawInputFromFixture } from '../helpers/semantic-fixture.mjs';

const NOW = '2025-01-01T00:00:00.000Z';

function minimalSource(overrides = {}) {
  return {
    contractKey: 'digest.test',
    title: 'Digest test contract',
    riskClass: 'LOW_RISK',
    sourceObjects: [
      { key: 'src', kind: 'fixture', ref: 'test input', authority: 'unit test' },
    ],
    concepts: [
      {
        name: 'ticker',
        kind: 'ticker',
        authoritativeFieldNames: ['ticker_value'],
        ownership: 'unit test',
        sourceObjectKey: 'src',
      },
    ],
    distinctConcepts: [],
    negativeSideEffects: [
      {
        gate: 'gate failure',
        scope: 'network',
        requirement: 'outbound network requests remain zero',
        expectedCount: 0,
        evidenceKind: 'audit_log',
      },
    ],
    factsEstablished: [
      { fact: 'the ticker field is ticker_value', evidence: 'src' },
    ],
    unresolvedSemantics: [],
    ...overrides,
  };
}

function compileWith(overrides, compiledAt = NOW) {
  return compileSemanticContract(minimalSource(overrides), { compiledAt });
}

function reorderKeysDeep(value) {
  if (Array.isArray(value)) return value.map(reorderKeysDeep);
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value);
    // reverse insertion order deterministically
    const out = {};
    for (const key of [...keys].reverse()) out[key] = reorderKeysDeep(value[key]);
    return out;
  }
  return value;
}

test('SOL-S04-003 A: identical semantics compile twice to the same semanticDigest', () => {
  const a = compileSemanticContract(minimalSource(), { compiledAt: '2025-01-01T00:00:00.000Z' });
  const b = compileSemanticContract(minimalSource(), { compiledAt: '2026-06-06T06:06:06.000Z' });
  assert.notEqual(a.compiledAt, b.compiledAt); // timestamps differ...
  assert.equal(a.semanticDigest, b.semanticDigest); // ...the digest never depends on them
});

test('SOL-S04-003 B: object-key insertion order differences yield the same digest', () => {
  const original = minimalSource();
  const reordered = reorderKeysDeep(original);
  const a = compileSemanticContract(original, { compiledAt: NOW });
  const b = compileSemanticContract(reordered, { compiledAt: NOW });
  assert.equal(a.semanticDigest, b.semanticDigest);
  // the canonicalizer itself is key-order independent
  assert.equal(
    JSON.stringify(canonicalizeJson({ b: 1, a: { d: 2, c: 3 } })),
    JSON.stringify(canonicalizeJson({ a: { c: 3, d: 2 }, b: 1 })),
  );
});

test('SOL-S04-003 B: set-like collection order does not change the digest', () => {
  const original = minimalSource({
    concepts: [
      {
        name: 'tickerA',
        kind: 'ticker',
        authoritativeFieldNames: ['ticker_a'],
        ownership: 't',
        sourceObjectKey: 'src',
      },
      {
        name: 'tickerB',
        kind: 'ticker',
        authoritativeFieldNames: ['ticker_b'],
        ownership: 't',
        sourceObjectKey: 'src',
      },
    ],
    distinctConcepts: [
      {
        conceptA: 'tickerA',
        conceptB: 'tickerB',
        mustNotConflate: 'distinct ticker bindings',
        severity: 'CRITICAL',
      },
    ],
  });
  const swapped = {
    ...original,
    concepts: [original.concepts[1], original.concepts[0]],
  };
  const a = compileSemanticContract(original, { compiledAt: NOW });
  const b = compileSemanticContract(swapped, { compiledAt: NOW });
  assert.equal(a.semanticDigest, b.semanticDigest);
});

test('SOL-S04-003 C: changing each authority-bearing category changes the digest', () => {
  const base = computeSemanticDigest(compileWith({}));
  const cases = [
    ['concept meaning', { concepts: [{ name: 'ticker', kind: 'ticker', authoritativeFieldNames: ['ticker_value'], ownership: 'unit test', sourceObjectKey: 'src', digestMeaning: 'changed meaning' }] }],
    ['source/current ticker binding', { sourceObjects: [{ key: 'src', kind: 'fixture', ref: 'other ref', authority: 'unit test' }] }],
    ['source binding (sourceObjectKey)', {
      sourceObjects: [{ key: 'other', kind: 'fixture', ref: 'test input', authority: 'unit test' }],
      concepts: [{ name: 'ticker', kind: 'ticker', authoritativeFieldNames: ['ticker_value'], ownership: 'unit test', sourceObjectKey: 'other' }],
    }],
    ['decision concept', { concepts: [ { name: 'decision', kind: 'record', authoritativeFieldNames: ['decision_id'], ownership: 't', sourceObjectKey: 'src' } ] }],
    ['evidence concept', { concepts: [ { name: 'evidence', kind: 'record', authoritativeFieldNames: ['evidence_id'], ownership: 't', sourceObjectKey: 'src' } ] }],
    ['evidence membership', { factsEstablished: [{ fact: 'evidence belongs to decision', evidence: 'src' }] }],
    ['lifecycle semantics', { concepts: [{ name: 'state', kind: 'field', authoritativeFieldNames: ['state'], ownership: 't', lifecycle: ['OPEN', 'CLOSED'], allowedTransitions: [{ from: 'OPEN', to: 'CLOSED' }], sourceObjectKey: 'src' }] }],
    ['unresolved risk/value', { unresolvedSemantics: [{ question: 'exact value', riskClass: 'LOW_RISK', impact: 'x' }] }],
    ['distinct relationship', {
      concepts: [
        { name: 'tickerA', kind: 'ticker', authoritativeFieldNames: ['ticker_a'], ownership: 't', sourceObjectKey: 'src' },
        { name: 'tickerB', kind: 'ticker', authoritativeFieldNames: ['ticker_b'], ownership: 't', sourceObjectKey: 'src' },
      ],
      distinctConcepts: [{ conceptA: 'tickerA', conceptB: 'tickerB', mustNotConflate: 'CHANGED distinct relationship', severity: 'CRITICAL' }],
    }],
    ['side-effect requirement', { negativeSideEffects: [{ gate: 'gate failure', scope: 'network', requirement: 'CHANGED requirement text', expectedCount: 0, evidenceKind: 'audit_log' }] }],
    ['side-effect count', { negativeSideEffects: [{ gate: 'gate failure', scope: 'network', requirement: 'outbound network requests remain zero', expectedCount: 1, evidenceKind: 'audit_log' }] }],
    ['side-effect evidence expectation', { negativeSideEffects: [{ gate: 'gate failure', scope: 'network', requirement: 'outbound network requests remain zero', expectedCount: 0, evidenceKind: 'instrumented_counter' }] }],
  ];
  for (const [label, overrides] of cases) {
    const digest = computeSemanticDigest(compileWith(overrides));
    assert.notEqual(digest, base, `${label} must change the digest`);
  }
});

test('SOL-S04-003 D: two different contracts with the same contractKey get different digests', () => {
  const a = compileWith({ title: 'contract one' });
  const b = compileWith({ title: 'contract two', concepts: [{ name: 'other', kind: 'field', authoritativeFieldNames: ['other_f'], ownership: 't', sourceObjectKey: 'src' }] });
  assert.equal(a.contractKey, b.contractKey);
  assert.notEqual(a.semanticDigest, b.semanticDigest);
});

test('SOL-S04-003 E: acceptance/repair with the wrong sourceSemanticDigest fails closed', () => {
  const semantic = compileWith({});
  const effectId = semantic.negativeSideEffects[0].sideEffectId;
  const repair = buildRepairContract({
    semanticContract: semantic,
    rejectedAcceptanceRefs: [effectId],
    objective: 'fix',
    violation: 'network side effect leaked',
    requiredBehavior: 'count stays zero',
    mustChange: [{ target: 'network', change: 'move network call after the gate' }],
    verification: [{ method: 'test', expectation: 'passes' }],
    createdAt: NOW,
  });
  assert.equal(repair.sourceSemanticDigest, semantic.semanticDigest);
  assert.deepEqual(validateAcceptanceContract(repair, { semanticContract: semantic }).errors, []);

  // wrong digest on the repair document
  const wrongDigest = { ...repair, sourceSemanticDigest: 'f'.repeat(64) };
  const res = validateAcceptanceContract(wrongDigest, { semanticContract: semantic });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.message.includes('SOURCE_DIGEST_MISMATCH')));

  // repair bound to a different contract with the same key
  const other = compileWith({ concepts: [{ name: 'other', kind: 'field', authoritativeFieldNames: ['other_f'], ownership: 't', sourceObjectKey: 'src' }] });
  const res2 = validateAcceptanceContract(repair, { semanticContract: other });
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some((e) => e.message.includes('SOURCE_DIGEST_MISMATCH')));

  // a forged source whose digest field does not match its content
  const forged = JSON.parse(JSON.stringify(semantic));
  forged.semanticDigest = '0'.repeat(64);
  const res3 = validateAcceptanceContract(repair, { semanticContract: forged });
  assert.equal(res3.valid, false);
  assert.ok(res3.errors.some((e) => e.message.includes('SOURCE_DIGEST_INVALID')));
});

test('SOL-S04-003 F: BL-020 decision/evidence/membership semantic changes alter semanticDigest', () => {
  const fixture = readFixture('bl020-decision-evidence-membership-digests.json');
  const base = compileSemanticContract(rawInputFromFixture(fixture), { compiledAt: NOW });
  const baseDigest = base.semanticDigest;
  assert.match(baseDigest, /^[0-9a-f]{64}$/);
  // recompiling identical raw content reproduces the identical digest
  const again = compileSemanticContract(rawInputFromFixture(fixture), { compiledAt: NOW });
  assert.equal(again.semanticDigest, baseDigest);

  const decisionDigest = base.concepts.find((c) => c.name === 'decisionDigest');
  const evidenceDigest = base.concepts.find((c) => c.name === 'evidenceDigest');
  const membershipDigest = base.concepts.find((c) => c.name === 'membershipDigest');
  assert.ok(decisionDigest && evidenceDigest && membershipDigest);

  const variants = [
    ['decision digest meaning', { concepts: base.concepts.map((c) => (c.name === 'decisionDigest' ? { ...c, digestMeaning: 'sha256 over a DIFFERENT payload' } : c)) }],
    ['decision digest field', { concepts: base.concepts.map((c) => (c.name === 'decisionDigest' ? { ...c, authoritativeFieldNames: ['decision_digest_alt'] } : c)) }],
    ['evidence digest meaning', { concepts: base.concepts.map((c) => (c.name === 'evidenceDigest' ? { ...c, digestMeaning: 'sha256 over a DIFFERENT payload' } : c)) }],
    ['evidence digest field', { concepts: base.concepts.map((c) => (c.name === 'evidenceDigest' ? { ...c, authoritativeFieldNames: ['evidence_digest_alt'] } : c)) }],
    ['membership digest meaning', { concepts: base.concepts.map((c) => (c.name === 'membershipDigest' ? { ...c, digestMeaning: 'sha256 over a DIFFERENT payload' } : c)) }],
    ['membership forbidden alternative', { concepts: base.concepts.map((c) => (c.name === 'membershipDigest' ? { ...c, forbiddenAlternatives: [...c.forbiddenAlternatives, 'memberDigestAlt'] } : c)) }],
    ['decision/evidence membership distinct pair', { distinctConcepts: base.distinctConcepts.filter((d) => !(d.conceptA === 'decisionDigest' && d.conceptB === 'evidenceDigest')) }],
    ['distinct mustNotConflate text', { distinctConcepts: base.distinctConcepts.map((d) => (d.conceptA === 'decisionDigest' && d.conceptB === 'evidenceDigest' ? { ...d, mustNotConflate: 'CHANGED: never interchangeable' } : d)) }],
  ];
  for (const [label, overrides] of variants) {
    const variant = compileSemanticContract(rawInputFromFixture({ ...fixture, ...overrides }), { compiledAt: NOW });
    assert.notEqual(variant.semanticDigest, baseDigest, `${label} must alter semanticDigest`);
  }
});

test('SOL-S04-003: semanticDigest proves identity, not prose', () => {
  // two contracts with identical prose but different authority-bearing
  // content must not share a digest
  const a = compileWith({});
  const b = compileWith({ concepts: [{ name: 'ticker', kind: 'ticker', authoritativeFieldNames: ['ticker_value'], ownership: 'unit test', sourceObjectKey: 'src', notes: 'identical-looking prose' }] });
  assert.notEqual(a.semanticDigest, b.semanticDigest);
  assert.ok(isAuthoritative(a));
  assert.ok(isAuthoritative(b));
});
