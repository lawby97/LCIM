/**
 * Sprint 04 SOL-S04-R2-001 tests: cross-document acceptance validation must
 * require an AUTHORITATIVE semantic source.
 *
 * The repair builder (`buildRepairContract`) already requires
 * `isAuthoritative()`. These tests prove the DIRECT validator path cannot
 * bypass the builder's authority gate: `validateAcceptanceContract(doc,
 * { semanticContract })` must reject a source that is schema/digest-valid
 * but CONTRACT_REVIEW_REQUIRED, schema-invalid, semantically invalid, or
 * malformed — even when contractKey, sourceSemanticDigest, carried side
 * effects, and acceptance tests all match — and must accept a genuinely
 * authoritative source.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSemanticContract } from '../../src/contracts/compiler.mjs';
import {
  validateAcceptanceContract,
  validateSemanticContract,
} from '../../src/contracts/validate.mjs';
import { computeSemanticDigest } from '../../src/contracts/digest.mjs';
import { readFixture, rawInputFromFixture } from '../helpers/semantic-fixture.mjs';

const NOW = '2025-01-01T00:00:00.000Z';

function compileProvider() {
  return compileSemanticContract(
    rawInputFromFixture(readFixture('bl020-provider-construction-before-authz.json')),
    { compiledAt: NOW },
  );
}

/**
 * Manually constructed acceptance/repair document bound to `source`
 * (schema-valid; contractKey, sourceSemanticDigest, frozen semantics,
 * carried side effects, and acceptance tests all match the source).
 */
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

test('SOL-S04-R2-001: CONTRACT_REVIEW_REQUIRED source is rejected by the direct validator', () => {
  const authoritative = compileProvider();
  // a valid semantic contract with unresolved HIGH-RISK semantics, its own
  // correct recomputed digest, and CONTRACT_REVIEW_REQUIRED status
  const reviewRequired = JSON.parse(JSON.stringify(authoritative));
  reviewRequired.unresolvedSemantics = [
    ...authoritative.unresolvedSemantics,
    { question: 'revocation delay', riskClass: 'AUTHORIZATION_SECURITY_PROVIDER' },
  ];
  reviewRequired.semanticDigest = computeSemanticDigest(reviewRequired);
  reviewRequired.compileStatus = 'CONTRACT_REVIEW_REQUIRED';
  // the source itself is schema-valid, semantically valid, digest-valid
  const sourceCheck = validateSemanticContract(reviewRequired);
  assert.equal(sourceCheck.valid, true, JSON.stringify(sourceCheck.errors));

  // repair document binds exactly: contractKey, digest, frozen semantics,
  // carried side effects, acceptance tests
  const doc = acceptanceDocFor(reviewRequired);
  assert.equal(doc.contractKey, reviewRequired.contractKey);
  assert.equal(doc.sourceSemanticDigest, reviewRequired.semanticDigest);

  const result = validateAcceptanceContract(doc, { semanticContract: reviewRequired });
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.message.includes('SOURCE_NOT_AUTHORITATIVE')),
    JSON.stringify(result.errors),
  );
  // digest/key/carry agreement alone never saves a non-authoritative source
  assert.equal(result.errors.length, 1);
});

test('SOL-S04-R2-001: schema-invalid source is rejected even with a recomputed digest', () => {
  const authoritative = compileProvider();
  const schemaInvalid = JSON.parse(JSON.stringify(authoritative));
  schemaInvalid.riskClass = 'MEDIUM'; // not in the schema enum
  schemaInvalid.semanticDigest = computeSemanticDigest(schemaInvalid);

  const doc = acceptanceDocFor(schemaInvalid);
  assert.equal(doc.sourceSemanticDigest, schemaInvalid.semanticDigest);

  const result = validateAcceptanceContract(doc, { semanticContract: schemaInvalid });
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.message.includes('SOURCE_NOT_AUTHORITATIVE')),
    JSON.stringify(result.errors),
  );
});

test('SOL-S04-R2-001: semantically invalid source (duplicate concept) is rejected even with a recomputed digest', () => {
  const authoritative = compileProvider();
  const semanticInvalid = JSON.parse(JSON.stringify(authoritative));
  semanticInvalid.concepts.push({ ...authoritative.concepts[0] }); // duplicate concept name
  semanticInvalid.semanticDigest = computeSemanticDigest(semanticInvalid);

  const doc = acceptanceDocFor(semanticInvalid);
  assert.equal(doc.sourceSemanticDigest, semanticInvalid.semanticDigest);

  const result = validateAcceptanceContract(doc, { semanticContract: semanticInvalid });
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => e.message.includes('SOURCE_NOT_AUTHORITATIVE')),
    JSON.stringify(result.errors),
  );
});

test('SOL-S04-R2-001: malformed / status-only sources fail closed (never throw)', () => {
  const authoritative = compileProvider();
  const doc = acceptanceDocFor(authoritative);
  // status-only object
  const statusOnly = { compileStatus: 'COMPILED' };
  const res1 = validateAcceptanceContract(doc, { semanticContract: statusOnly });
  assert.equal(res1.valid, false);
  assert.ok(res1.errors.some((e) => e.message.includes('SOURCE_NOT_AUTHORITATIVE')));
  // null source
  const res2 = validateAcceptanceContract(doc, { semanticContract: null });
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some((e) => e.message.includes('SOURCE_NOT_AUTHORITATIVE')));
});

test('SOL-S04-R2-001: valid authoritative source + valid acceptance contract => VALID', () => {
  const authoritative = compileProvider();
  assert.equal(authoritative.compileStatus, 'COMPILED');
  const doc = acceptanceDocFor(authoritative);
  const result = validateAcceptanceContract(doc, { semanticContract: authoritative });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.deepEqual(result.errors, []);
});
