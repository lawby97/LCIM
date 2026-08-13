/**
 * Sprint 05 tests: Sprint-04 semantic authority in routing (SOL-S05-004).
 *
 * When a semanticContract is supplied it MUST be validated with the
 * Sprint-04 validator; compileStatus/riskClass are derived only from the
 * validated document. Malformed/semantically-invalid contracts fail
 * closed; a caller-supplied contractReviewRequired flag is authoritative
 * only when no contract is supplied, and contradicts are rejected.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { decideRoute } from '../../src/routing/policy.mjs';
import { RoutingError } from '../../src/routing/errors.mjs';
import { makeCtx } from '../helpers/routing-fixture.mjs';
import { compileSemanticContract } from '../../src/contracts/compiler.mjs';

const NOW = '2025-01-01T00:00:00.000Z';

function compiledContract(overrides = {}) {
  return compileSemanticContract(
    {
      contractKey: 'authority.test',
      title: 'Authority test',
      riskClass: 'LOW_RISK',
      sourceObjects: [{ key: 'src', kind: 'fixture', ref: 'x', authority: 'unit test' }],
      concepts: [{ name: 'ticker', kind: 'ticker', authoritativeFieldNames: ['ticker_value'], ownership: 'unit test', sourceObjectKey: 'src' }],
      distinctConcepts: [],
      negativeSideEffects: [],
      factsEstablished: [],
      unresolvedSemantics: [],
      ...overrides,
    },
    { compiledAt: NOW },
  );
}

function reviewRequiredContract() {
  return compiledContract({
    contractKey: 'authority.review',
    riskClass: 'FINANCIAL',
    unresolvedSemantics: [{ question: 'Which source is authoritative?', riskClass: 'FINANCIAL' }],
  });
}

test('valid CONTRACT_REVIEW_REQUIRED contract routes to SOL contract check', () => {
  const contract = reviewRequiredContract();
  assert.equal(contract.compileStatus, 'CONTRACT_REVIEW_REQUIRED');
  const decision = decideRoute(makeCtx({ semanticContract: contract, decidedAt: NOW }));
  assert.equal(decision.decision, 'ROUTE_SOL_CONTRACT_CHECK');
  assert.equal(decision.reasonCode, 'UNRESOLVED_HIGH_RISK_CONTRACT');
});

test('valid COMPILED contract follows normal risk policy', () => {
  const decision = decideRoute(makeCtx({ semanticContract: compiledContract(), decidedAt: NOW }));
  assert.equal(decision.decision, 'ROUTE_IMPLEMENT_FLASH');
  assert.equal(decision.targetModel, 'deepseek-v4-flash');
});

test('forged COMPILED + HIGH_RISK unresolved fails closed (Sprint-04 validation)', () => {
  const forged = JSON.parse(JSON.stringify(compiledContract()));
  forged.unresolvedSemantics = [{ question: 'unresolved high-risk', riskClass: 'FINANCIAL' }];
  forged.compileStatus = 'COMPILED'; // forged claim; recomputed status is CONTRACT_REVIEW_REQUIRED
  // content also changed, so semanticDigest is stale: Sprint-04 validation must reject
  assert.throws(() => decideRoute(makeCtx({ semanticContract: forged, decidedAt: NOW })), RoutingError);
});

test('forged riskClass (content/digest mismatch) fails closed', () => {
  const forged = JSON.parse(JSON.stringify(compiledContract()));
  forged.riskClass = 'FINANCIAL'; // shallow caller copy; digest no longer matches content
  assert.throws(() => decideRoute(makeCtx({ semanticContract: forged, decidedAt: NOW })), RoutingError);
});

test('malformed supplied contract fails closed', () => {
  for (const malformed of [
    { contractKey: 'x' },
    { schemaName: 'lcim.semantic-contract', schemaVersion: '2.0.0' },
    'not-a-contract',
    42,
  ]) {
    assert.throws(
      () => decideRoute(makeCtx({ semanticContract: malformed, decidedAt: NOW })),
      RoutingError,
      `expected RoutingError for ${JSON.stringify(malformed)}`,
    );
  }
});

test('valid COMPILED contract + conflicting contractReviewRequired=true fails closed', () => {
  assert.throws(
    () => decideRoute(makeCtx({ semanticContract: compiledContract(), contractReviewRequired: true, decidedAt: NOW })),
    RoutingError,
  );
});

test('valid CONTRACT_REVIEW_REQUIRED contract + conflicting contractReviewRequired=false fails closed', () => {
  assert.throws(
    () => decideRoute(makeCtx({ semanticContract: reviewRequiredContract(), contractReviewRequired: false, decidedAt: NOW })),
    RoutingError,
  );
});

test('consistent explicit flag with a contract is accepted', () => {
  const compiled = decideRoute(
    makeCtx({ semanticContract: compiledContract(), contractReviewRequired: false, decidedAt: NOW }),
  );
  assert.equal(compiled.decision, 'ROUTE_IMPLEMENT_FLASH');
  const review = decideRoute(
    makeCtx({ semanticContract: reviewRequiredContract(), contractReviewRequired: true, decidedAt: NOW }),
  );
  assert.equal(review.decision, 'ROUTE_SOL_CONTRACT_CHECK');
});

test('no semanticContract + explicit contractReviewRequired remains supported', () => {
  const decision = decideRoute(makeCtx({ contractReviewRequired: true, decidedAt: NOW }));
  assert.equal(decision.decision, 'ROUTE_SOL_CONTRACT_CHECK');
  assert.equal(decision.reasonCode, 'UNRESOLVED_HIGH_RISK_CONTRACT');
});

test('the supplied contract is never mutated or repaired', () => {
  const contract = compiledContract();
  const snapshot = JSON.stringify(contract);
  decideRoute(makeCtx({ semanticContract: contract, decidedAt: NOW }));
  assert.equal(JSON.stringify(contract), snapshot);
});
