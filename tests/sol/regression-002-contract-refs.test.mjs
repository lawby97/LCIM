/**
 * SOL-S06-002 regression: ALL CONTRACT REFS MUST BIND TO VALIDATED SOURCES.
 *
 * Every compiled ask must resolve EVERY contractRef and EVERY
 * requirementRef against supplied validated Sprint-04 source documents;
 * no source-free authoritative references. CONTRACT_CHECK may review
 * valid COMPILED or CONTRACT_REVIEW_REQUIRED sources (review does not
 * confer implementation authority); implementation-facing calls
 * (DIAGNOSE/FINAL_REVIEW/RECHECK) require implementation-authoritative
 * COMPILED sources. Sources are validated with the Sprint-04 validator,
 * never repaired/mutated, and never judged by isAuthoritative alone.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSolAsk } from '../../src/sol/ask-compiler/compiler.mjs';
import { SolAskError } from '../../src/sol/contracts/errors.mjs';
import { compileSemanticContract } from '../../src/contracts/compiler.mjs';
import {
  compileProviderContract,
  providerFactoryEffectId,
  networkEffectId,
  NOW,
} from './helpers.mjs';
import { readFixture, rawInputFromFixture } from '../helpers/semantic-fixture.mjs';

const SOURCE = compileProviderContract();
const SOURCES = [SOURCE];

/** A valid CONTRACT_REVIEW_REQUIRED source (schema-valid, not implementation-authoritative). */
function reviewRequiredSource() {
  return compileSemanticContract(
    {
      ...rawInputFromFixture(readFixture('bl020-provider-construction-before-authz.json')),
      riskClass: 'FINANCIAL',
      unresolvedSemantics: [
        { question: 'exact rounding rule for settlement amounts', riskClass: 'FINANCIAL' },
      ],
    },
    { compiledAt: NOW },
  );
}

function baseAsk(callType = 'SOL_CONTRACT_CHECK', contractRefs, extra = {}) {
  return {
    callType,
    singleDecisionQuestion:
      callType === 'SOL_CONTRACT_CHECK'
        ? 'Is the exact field-name casing of the approval decision contract sufficiently specified?'
        : 'Why does the provider_factory negative side-effect criterion fail before the authorization failure is handled?',
    whyNeeded: 'ref binding regression',
    contractRefs,
    establishedFacts: [],
    evidence: [{ ref: 'ev.1', content: 'x', decisionCritical: true }],
    passCondition: 'p',
    failCondition: 'f',
    allowedScope: ['scope'],
    outOfScope: ['out'],
    ...(callType === 'SOL_CONTRACT_CHECK'
      ? { contractCheck: { amendmentsOnly: true, expectedVerdicts: ['SUFFICIENTLY_SPECIFIED', 'AMENDMENTS_REQUIRED'] } }
      : {}),
    ...extra,
  };
}

function hasCode(err, code) {
  return err?.code === code || (err?.details?.errors ?? []).some((e) => e.code === code);
}

test('A: invented source-only refs => reject', () => {
  const invented = baseAsk('SOL_CONTRACT_CHECK', [
    {
      contractKey: 'invented.contract',
      semanticDigest: 'a'.repeat(64),
      requirementRefs: ['se_' + 'a'.repeat(64)],
    },
  ]);
  assert.throws(
    () => compileSolAsk(invented, { compiledAt: NOW, sources: SOURCES }),
    (err) => err instanceof SolAskError && hasCode(err, 'CONTRACT_REF_UNBOUND'),
  );
  // invented digest on a REAL contractKey also never binds
  const inventedDigest = baseAsk('SOL_CONTRACT_CHECK', [
    { contractKey: SOURCE.contractKey, semanticDigest: 'b'.repeat(64) },
  ]);
  assert.throws(
    () => compileSolAsk(inventedDigest, { compiledAt: NOW, sources: SOURCES }),
    (err) => err instanceof SolAskError && hasCode(err, 'CONTRACT_REF_UNBOUND'),
  );
});

test('B: one valid ref plus an invented additional ref => reject', () => {
  const mixed = baseAsk('SOL_CONTRACT_CHECK', [
    { contractKey: SOURCE.contractKey, semanticDigest: SOURCE.semanticDigest },
    { contractKey: 'invented.contract', semanticDigest: 'c'.repeat(64) },
  ]);
  assert.throws(
    () => compileSolAsk(mixed, { compiledAt: NOW, sources: SOURCES }),
    (err) => err instanceof SolAskError && hasCode(err, 'CONTRACT_REF_UNBOUND'),
  );
  // one valid requirementRef plus an invented requirementRef => reject
  const mixedRequirements = baseAsk('SOL_DIAGNOSE', [
    {
      contractKey: SOURCE.contractKey,
      semanticDigest: SOURCE.semanticDigest,
      requirementRefs: [providerFactoryEffectId(SOURCE), 'se_' + 'd'.repeat(64)],
    },
  ], {
    diagnose: {
      acceptanceCriterionRef: providerFactoryEffectId(SOURCE),
      criterionRequirement: 'provider factory invocations remain zero before an authorization failure is handled',
    },
  });
  assert.throws(
    () => compileSolAsk(mixedRequirements, { compiledAt: NOW, sources: SOURCES }),
    (err) => err instanceof SolAskError && hasCode(err, 'REQUIREMENT_REF_UNBOUND'),
  );
});

test('C: valid bound CONTRACT_REVIEW_REQUIRED source + CONTRACT_CHECK => compile', () => {
  const reviewRequired = reviewRequiredSource();
  const ask = compileSolAsk(
    baseAsk('SOL_CONTRACT_CHECK', [
      { contractKey: reviewRequired.contractKey, semanticDigest: reviewRequired.semanticDigest },
    ]),
    { compiledAt: NOW, sources: [reviewRequired] },
  );
  assert.equal(ask.callType, 'SOL_CONTRACT_CHECK');
});

test('D: same review-required source as implementation authority for DIAGNOSE => reject', () => {
  const reviewRequired = reviewRequiredSource();
  const diagnose = baseAsk('SOL_DIAGNOSE', [
    {
      contractKey: reviewRequired.contractKey,
      semanticDigest: reviewRequired.semanticDigest,
      requirementRefs: [providerFactoryEffectId(reviewRequired)],
    },
  ], {
    diagnose: {
      acceptanceCriterionRef: providerFactoryEffectId(reviewRequired),
      criterionRequirement: 'provider factory invocations remain zero before an authorization failure is handled',
    },
  });
  assert.throws(
    () => compileSolAsk(diagnose, { compiledAt: NOW, sources: [reviewRequired] }),
    (err) => err instanceof SolAskError && hasCode(err, 'SOURCE_NOT_IMPLEMENTATION_AUTHORITATIVE'),
  );
  // FINAL_REVIEW and RECHECK are implementation-facing too
  const finalReview = baseAsk('SOL_FINAL_REVIEW', [
    { contractKey: reviewRequired.contractKey, semanticDigest: reviewRequired.semanticDigest },
  ], {
    singleDecisionQuestion: 'Do the named high-risk invariants of the provider authorization flow hold on the candidate?',
    finalReview: {
      invariantChecklist: [
        {
          invariantId: 'inv.provider_factory_zero',
          invariant: 'provider factory construction stays zero before an authorization failure is handled',
          lockedRequirementRef: providerFactoryEffectId(reviewRequired),
        },
      ],
      maxAdjacentCriticalDefects: 1,
    },
  });
  assert.throws(
    () => compileSolAsk(finalReview, { compiledAt: NOW, sources: [reviewRequired] }),
    (err) => err instanceof SolAskError && hasCode(err, 'SOURCE_NOT_IMPLEMENTATION_AUTHORITATIVE'),
  );
});

test('E: malformed/tampered semantic source => reject', () => {
  const tampered = { ...SOURCE, semanticDigest: 'e'.repeat(64) };
  assert.throws(
    () => compileSolAsk(
      baseAsk('SOL_CONTRACT_CHECK', [
        { contractKey: SOURCE.contractKey, semanticDigest: SOURCE.semanticDigest },
      ]),
      { compiledAt: NOW, sources: [tampered] },
    ),
    (err) => err instanceof SolAskError && hasCode(err, 'SOURCE_INVALID'),
  );
  assert.throws(
    () => compileSolAsk(
      baseAsk('SOL_CONTRACT_CHECK', [
        { contractKey: SOURCE.contractKey, semanticDigest: SOURCE.semanticDigest },
      ]),
      { compiledAt: NOW, sources: [] },
    ),
    (err) => err instanceof SolAskError && hasCode(err, 'SOURCE_INVALID'),
  );
});

test('F: every requirementRef resolves to the correct supplied source', () => {
  // a second valid source with a DIFFERENT content identity and NO
  // negative side-effect items (decision/evidence digest contract)
  const second = compileSemanticContract(
    rawInputFromFixture(readFixture('bl020-decision-evidence-membership-digests.json')),
    { compiledAt: NOW },
  );
  assert.notEqual(second.semanticDigest, SOURCE.semanticDigest);
  assert.equal(second.negativeSideEffects.length, 0);

  // each requirementRef resolves inside ITS OWN bound source
  const ask = compileSolAsk(
    baseAsk('SOL_CONTRACT_CHECK', [
      { contractKey: SOURCE.contractKey, semanticDigest: SOURCE.semanticDigest, requirementRefs: [providerFactoryEffectId(SOURCE)] },
      { contractKey: second.contractKey, semanticDigest: second.semanticDigest },
    ]),
    { compiledAt: NOW, sources: [SOURCE, second] },
  );
  assert.equal(ask.contractRefs.length, 2);

  // a requirementRef that exists in the FIRST source but is declared under
  // the SECOND source's ref does not resolve => reject
  const misplaced = baseAsk('SOL_CONTRACT_CHECK', [
    { contractKey: second.contractKey, semanticDigest: second.semanticDigest, requirementRefs: [providerFactoryEffectId(SOURCE)] },
  ]);
  assert.throws(
    () => compileSolAsk(misplaced, { compiledAt: NOW, sources: [SOURCE, second] }),
    (err) => err instanceof SolAskError && hasCode(err, 'REQUIREMENT_REF_UNBOUND'),
  );
});
