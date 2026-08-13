/**
 * Sprint 04 unit tests: semantic contract compiler.
 *
 * Acceptance criteria covered here:
 * - compiler represents and validates exact authoritative contracts;
 * - high-risk unresolved semantics are surfaced as review-required;
 * - unresolved authoritative semantics are never silently filled.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileSemanticContract,
  isAuthoritative,
  authorityFailureReason,
  reviewRequiredReason,
} from '../../src/contracts/compiler.mjs';
import { computeCompileStatus } from '../../src/contracts/status.mjs';
import { ContractCompileError } from '../../src/contracts/errors.mjs';
import { ConfigError } from '../../src/shared/errors.mjs';
import { readFixture, rawInputFromFixture } from '../helpers/semantic-fixture.mjs';

const NOW = '2025-01-01T00:00:00.000Z';

function minimalSource(overrides = {}) {
  return {
    contractKey: 'test.contract',
    title: 'Test contract',
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
    negativeSideEffects: [],
    factsEstablished: [],
    unresolvedSemantics: [],
    ...overrides,
  };
}

test('compiles a valid contract into a frozen, stamped, validated document', () => {
  const contract = compileSemanticContract(minimalSource(), { compiledAt: NOW });
  assert.equal(contract.schemaName, 'lcim.semantic-contract');
  assert.equal(contract.schemaVersion, '2.0.0');
  assert.equal(contract.compileStatus, 'COMPILED');
  assert.equal(contract.compiledAt, NOW);
  assert.ok(Object.isFrozen(contract));
  // exact authoritative names are preserved byte-for-byte
  assert.equal(contract.concepts[0].authoritativeFieldNames[0], 'ticker_value');
});

test('compile status: high-risk unresolved semantics => CONTRACT_REVIEW_REQUIRED', () => {
  const source = minimalSource({
    riskClass: 'FINANCIAL',
    unresolvedSemantics: [
      {
        question: 'exact rounding rule for settlement amounts',
        riskClass: 'FINANCIAL',
        impact: 'wrong rounding changes money movement',
      },
    ],
  });
  const contract = compileSemanticContract(source, { compiledAt: NOW });
  assert.equal(contract.compileStatus, 'CONTRACT_REVIEW_REQUIRED');
  assert.equal(isAuthoritative(contract), false);
  assert.equal(
    reviewRequiredReason(contract.unresolvedSemantics),
    'unresolved semantics in high-risk class(es): FINANCIAL',
  );
  // the unresolved question is preserved verbatim — never filled or answered
  assert.equal(contract.unresolvedSemantics[0].question, 'exact rounding rule for settlement amounts');
  assert.equal('answer' in contract.unresolvedSemantics[0], false);
});

test('compile status: low-risk unresolved semantics => COMPILED (safe low-risk omission)', () => {
  const source = minimalSource({
    unresolvedSemantics: [
      {
        question: 'exact maximum length of display_name',
        riskClass: 'LOW_RISK',
        impact: 'cosmetic',
      },
    ],
  });
  const contract = compileSemanticContract(source, { compiledAt: NOW });
  assert.equal(contract.compileStatus, 'COMPILED');
  assert.equal(isAuthoritative(contract), true);
  assert.equal(reviewRequiredReason(contract.unresolvedSemantics), null);
  assert.equal(contract.unresolvedSemantics.length, 1); // recorded, not dropped
});

test('compile status: high-risk contract with fully established facts is COMPILED and authoritative', () => {
  const source = minimalSource({
    riskClass: 'AUTHORIZATION_SECURITY_PROVIDER',
    factsEstablished: [
      { fact: 'authorization is persisted state', evidence: 'authz schema' },
    ],
  });
  const contract = compileSemanticContract(source, { compiledAt: NOW });
  assert.equal(contract.compileStatus, 'COMPILED');
  assert.equal(isAuthoritative(contract), true);
});

test('computeCompileStatus is pure and monotone in risk class', () => {
  assert.equal(computeCompileStatus([]), 'COMPILED');
  assert.equal(
    computeCompileStatus([{ riskClass: 'LOW_RISK' }, { riskClass: 'IDENTITY' }]),
    'CONTRACT_REVIEW_REQUIRED',
  );
  assert.equal(
    computeCompileStatus([{ riskClass: 'LOW_RISK' }, { riskClass: 'MIGRATION' }]),
    'CONTRACT_REVIEW_REQUIRED',
  );
  assert.equal(computeCompileStatus([{ riskClass: 'LOW_RISK' }]), 'COMPILED');
});

test('compiler never silently fills unresolved semantics (invented answers rejected)', () => {
  const source = minimalSource({
    riskClass: 'MIGRATION',
    unresolvedSemantics: [
      {
        question: 'exact backfill window',
        riskClass: 'MIGRATION',
        answer: 'assume 90 days',
      },
    ],
  });
  assert.throws(() => compileSemanticContract(source, { compiledAt: NOW }), ConfigError);
});

test('compiler fails closed on invalid risk classes and malformed inputs', () => {
  assert.throws(() => compileSemanticContract(minimalSource({ riskClass: 'MEDIUM' })), ConfigError);
  assert.throws(() => compileSemanticContract(null), ConfigError);
  assert.throws(() => compileSemanticContract({}), ConfigError);
  assert.throws(
    () => compileSemanticContract(minimalSource({ concepts: [{ name: 'x' }] })),
    ConfigError,
  );
  assert.throws(
    () =>
      compileSemanticContract(
        minimalSource({
          negativeSideEffects: [
            { gate: 'g', scope: 'network', requirement: 'x', expectedCount: -1 },
          ],
        }),
      ),
    ConfigError, // assertSideEffectSpec fails closed before validation
  );
});

test('compiler fails closed with ContractCompileError on semantic validation errors', () => {
  // duplicate concept names
  const dup = minimalSource({
    concepts: [
      { name: 'ticker', kind: 'ticker', authoritativeFieldNames: ['a'], ownership: 't' },
      { name: 'ticker', kind: 'ticker', authoritativeFieldNames: ['b'], ownership: 't' },
    ],
  });
  assert.throws(() => compileSemanticContract(dup, { compiledAt: NOW }), ContractCompileError);

  // ambiguous digests (identical meaning under must_not_conflate)
  const ambiguous = minimalSource({
    riskClass: 'IDENTITY',
    concepts: [
      {
        name: 'decisionDigest',
        kind: 'digest',
        authoritativeFieldNames: ['decision_digest'],
        digestMeaning: 'sha256 over the decision record',
        ownership: 't',
      },
      {
        name: 'evidenceDigest',
        kind: 'digest',
        authoritativeFieldNames: ['evidence_digest'],
        digestMeaning: 'sha256 over the decision record',
        ownership: 't',
      },
    ],
    distinctConcepts: [
      {
        conceptA: 'decisionDigest',
        conceptB: 'evidenceDigest',
        mustNotConflate: 'distinct digests',
        severity: 'CRITICAL',
      },
    ],
  });
  assert.throws(() => compileSemanticContract(ambiguous, { compiledAt: NOW }), ContractCompileError);
});

test('compiler attaches computed warnings to the document (missing source of truth, digest meaning)', () => {
  const source = minimalSource({
    concepts: [
      {
        name: 'payloadDigest',
        kind: 'digest',
        authoritativeFieldNames: ['payload_digest'],
        ownership: 'unit test',
        // no digestMeaning, no sourceObjectKey => two warnings
      },
    ],
  });
  const contract = compileSemanticContract(source, { compiledAt: NOW });
  assert.equal(contract.compileStatus, 'COMPILED');
  const codes = contract.compileWarnings.map((w) => w.code).sort();
  assert.ok(codes.includes('MISSING_DIGEST_MEANING'));
  assert.ok(codes.includes('MISSING_SOURCE_OF_TRUTH'));
});

test('compiler refuses inputs that omit required source objects', () => {
  const noSources = minimalSource({ sourceObjects: [] });
  // empty sourceObjects fails closed (schema minItems) at validation
  assert.throws(
    () => compileSemanticContract(noSources, { compiledAt: NOW }),
    ContractCompileError,
  );
  // missing field arrays entirely fail closed at input shaping
  assert.throws(() => compileSemanticContract(minimalSource({ concepts: undefined })), ConfigError);
});

test('BL-020 fixtures compile to valid, stamped documents', () => {
  const names = [
    'bl020-approval-field-casing.json',
    'bl020-decision-evidence-membership-digests.json',
    'bl020-source-current-ticker-binding.json',
    'bl020-serial-date-time-format.json',
    'bl020-provider-construction-before-authz.json',
  ];
  for (const name of names) {
    const contract = compileSemanticContract(rawInputFromFixture(readFixture(name)), { compiledAt: NOW });
    assert.equal(contract.schemaName, 'lcim.semantic-contract', name);
    assert.equal(contract.compileStatus, 'COMPILED', name);
    assert.equal(isAuthoritative(contract), true, name);
  }
});

test('compiler derives semanticDigest and sideEffectId; caller-supplied values are rejected', () => {
  const source = minimalSource();
  assert.match(compileSemanticContract(source, { compiledAt: NOW }).semanticDigest, /^[0-9a-f]{64}$/);
  assert.throws(() => compileSemanticContract({ ...source, semanticDigest: 'a'.repeat(64) }), ConfigError);
  assert.throws(
    () =>
      compileSemanticContract(
        minimalSource({
          negativeSideEffects: [
            {
              gate: 'g',
              scope: 'network',
              requirement: 'x',
              expectedCount: 0,
              sideEffectId: 'se_' + 'a'.repeat(64),
            },
          ],
        }),
      ),
    ConfigError,
  );
  // side effects get deterministic content-bound identities
  const withEffects = compileSemanticContract(
    minimalSource({
      negativeSideEffects: [{ gate: 'g', scope: 'network', requirement: 'x', expectedCount: 0 }],
    }),
    { compiledAt: NOW },
  );
  assert.match(withEffects.negativeSideEffects[0].sideEffectId, /^se_[0-9a-f]{64}$/);
});
