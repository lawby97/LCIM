/**
 * Sprint 04 SOL-S04-001 regression tests: authoritative readiness must be
 * validated and immutable.
 *
 * - isAuthoritative() is true ONLY for a complete, schema-valid,
 *   semantically valid, COMPILED contract whose digest is internally
 *   valid; a caller-supplied compileStatus alone never establishes
 *   authority;
 * - compiled output is deeply immutable: nested concepts, unresolved
 *   semantics, negative side effects, source objects, distinct concepts,
 *   and acceptance-derived data cannot be mutated after validation;
 * - post-validation mutation can never create a
 *   COMPILED + unresolved HIGH-RISK contradiction.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileSemanticContract,
  isAuthoritative,
  authorityFailureReason,
} from '../../src/contracts/compiler.mjs';
import { readFixture, rawInputFromFixture } from '../helpers/semantic-fixture.mjs';
import { computeSemanticDigest } from '../../src/contracts/digest.mjs';

const NOW = '2025-01-01T00:00:00.000Z';

function minimalSource(overrides = {}) {
  return {
    contractKey: 'authority.test',
    title: 'Authority test contract',
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
    factsEstablished: [],
    unresolvedSemantics: [],
    ...overrides,
  };
}

test('SOL-S04-001: isAuthoritative({ compileStatus: "COMPILED" }) => false', () => {
  assert.equal(isAuthoritative({ compileStatus: 'COMPILED' }), false);
  assert.ok(authorityFailureReason({ compileStatus: 'COMPILED' }) !== null);
});

test('SOL-S04-001: malformed COMPILED-looking objects are never authoritative', () => {
  // incomplete document
  assert.equal(isAuthoritative({ compileStatus: 'COMPILED', contractKey: 'x' }), false);
  // schema-invalid content
  assert.equal(
    isAuthoritative({ ...minimalSource(), compileStatus: 'COMPILED', riskClass: 'MEDIUM' }),
    false,
  );
  // semantically invalid (duplicate concept names), correctly digest-stamped
  const valid = compileSemanticContract(minimalSource(), { compiledAt: NOW });
  const dup = JSON.parse(JSON.stringify(valid));
  dup.concepts = [
    { ...valid.concepts[0] },
    { ...valid.concepts[0], name: 'ticker' },
  ];
  dup.semanticDigest = computeSemanticDigest(dup);
  assert.equal(dup.compileStatus, 'COMPILED'); // status alone looks fine
  assert.equal(isAuthoritative(dup), false);
  // a forged copy whose semanticDigest no longer matches its content
  const forged = JSON.parse(JSON.stringify(valid));
  forged.semanticDigest = '0'.repeat(64);
  assert.equal(isAuthoritative(forged), false);
  assert.ok(authorityFailureReason(forged).includes('DIGEST_MISMATCH'));
  // a forged status-only copy of a valid contract
  const forgedStatus = JSON.parse(JSON.stringify(valid));
  forgedStatus.compileStatus = 'CONTRACT_REVIEW_REQUIRED';
  forgedStatus.unresolvedSemantics = [];
  assert.equal(isAuthoritative(forgedStatus), false); // status mismatch with recomputed status
});

test('SOL-S04-001: valid authoritative compiled contract => true', () => {
  const contract = compileSemanticContract(minimalSource(), { compiledAt: NOW });
  assert.equal(contract.compileStatus, 'COMPILED');
  assert.equal(isAuthoritative(contract), true);
  assert.equal(authorityFailureReason(contract), null);
});

test('SOL-S04-001: valid CONTRACT_REVIEW_REQUIRED contract => false', () => {
  const contract = compileSemanticContract(
    minimalSource({
      riskClass: 'IDENTITY',
      unresolvedSemantics: [
        { question: 'unresolved identity binding', riskClass: 'IDENTITY' },
      ],
    }),
    { compiledAt: NOW },
  );
  assert.equal(contract.compileStatus, 'CONTRACT_REVIEW_REQUIRED');
  assert.equal(isAuthoritative(contract), false);
});

test('SOL-S04-001: nested mutation against a compiled concept fails / has no effect', () => {
  const contract = compileSemanticContract(minimalSource(), { compiledAt: NOW });
  const concept = contract.concepts[0];
  assert.ok(Object.isFrozen(concept));
  assert.ok(Object.isFrozen(concept.authoritativeFieldNames));
  assert.throws(() => concept.authoritativeFieldNames.push('tampered_field'), TypeError);
  assert.throws(() => concept.authoritativeFieldNames.pop(), TypeError);
  assert.throws(() => {
    concept.authoritativeFieldNames[0] = 'tampered_field';
  }, TypeError);
  assert.deepEqual(concept.authoritativeFieldNames, ['ticker_value']);
});

test('SOL-S04-001: nested mutation against the unresolved list fails / has no effect', () => {
  const contract = compileSemanticContract(
    minimalSource({
      unresolvedSemantics: [
        { question: 'max length', riskClass: 'LOW_RISK', impact: 'cosmetic' },
      ],
    }),
    { compiledAt: NOW },
  );
  assert.ok(Object.isFrozen(contract.unresolvedSemantics));
  assert.ok(Object.isFrozen(contract.unresolvedSemantics[0]));
  assert.throws(
    () =>
      contract.unresolvedSemantics.push({
        question: 'injected high-risk question',
        riskClass: 'IDENTITY',
      }),
    TypeError,
  );
  assert.throws(() => {
    contract.unresolvedSemantics[0].question = 'tampered';
  }, TypeError);
  assert.equal(contract.unresolvedSemantics[0].question, 'max length');
  assert.equal(contract.unresolvedSemantics.length, 1);
});

test('SOL-S04-001: nested mutation against a negative side effect fails / has no effect', () => {
  const contract = compileSemanticContract(minimalSource(), { compiledAt: NOW });
  const effect = contract.negativeSideEffects[0];
  assert.ok(Object.isFrozen(effect));
  assert.throws(() => {
    effect.expectedCount = 5;
  }, TypeError);
  assert.throws(() => {
    effect.requirement = 'tampered';
  }, TypeError);
  assert.throws(() => {
    effect.gate = 'tampered gate';
  }, TypeError);
  assert.equal(effect.expectedCount, 0);
  assert.equal(effect.requirement, 'outbound network requests remain zero');
  // source objects and distinct concepts are frozen too
  assert.ok(Object.isFrozen(contract.sourceObjects[0]));
  assert.ok(Object.isFrozen(contract.distinctConcepts));
});

test('SOL-S04-001: post-validation nested mutation cannot create COMPILED + unresolved HIGH-RISK contradiction', () => {
  const contract = compileSemanticContract(minimalSource(), { compiledAt: NOW });
  assert.equal(isAuthoritative(contract), true);
  // direct mutation attempts are impossible (deeply frozen)
  assert.throws(
    () =>
      contract.unresolvedSemantics.push({
        question: 'injected',
        riskClass: 'AUTHORIZATION_SECURITY_PROVIDER',
      }),
    TypeError,
  );
  // even a shallow-copied tampered lookalike fails closed
  const lookalike = { ...contract };
  lookalike.unresolvedSemantics = [
    ...contract.unresolvedSemantics,
    { question: 'injected', riskClass: 'FINANCIAL' },
  ];
  assert.equal(isAuthoritative(lookalike), false);
  assert.ok(authorityFailureReason(lookalike).includes('STATUS_MISMATCH'));
});

test('SOL-S04-001: compiled output is deeply immutable (every nested node frozen)', () => {
  const contract = compileSemanticContract(
    rawInputFromFixture(readFixture('bl020-provider-construction-before-authz.json')),
    { compiledAt: NOW },
  );
  const walk = (value, at) => {
    if (Array.isArray(value)) {
      assert.ok(Object.isFrozen(value), `${at} array must be frozen`);
      value.forEach((v, i) => walk(v, `${at}[${i}]`));
    } else if (value !== null && typeof value === 'object') {
      assert.ok(Object.isFrozen(value), `${at} object must be frozen`);
      for (const [k, v] of Object.entries(value)) walk(v, `${at}.${k}`);
    }
  };
  walk(contract, 'contract');
  // caller-owned input is NOT frozen by compilation
  const input = minimalSource();
  assert.ok(!Object.isFrozen(input));
  assert.ok(!Object.isFrozen(input.concepts));
  assert.ok(!Object.isFrozen(input.negativeSideEffects));
});

test('SOL-S04-001: authority never mutates or repairs invalid input', () => {
  const malformed = { compileStatus: 'COMPILED' };
  assert.equal(isAuthoritative(malformed), false);
  assert.deepEqual(malformed, { compileStatus: 'COMPILED' }); // untouched
  const withSideEffects = minimalSource({
    negativeSideEffects: [
      { gate: 'g', scope: 'network', requirement: 'x', expectedCount: 0 },
    ],
  });
  assert.equal(isAuthoritative(withSideEffects), false); // raw input is not a compiled doc
  assert.equal(withSideEffects.negativeSideEffects[0].sideEffectId, undefined); // untouched
});
