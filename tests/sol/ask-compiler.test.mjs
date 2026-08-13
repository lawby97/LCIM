/**
 * Sprint 06 unit tests: SOL ask compiler.
 *
 * Acceptance criteria covered here:
 * - every valid ask has exactly one primary decision question and
 *   explicit pass/fail conditions;
 * - each call type compiles with its per-type block only;
 * - generic/multi-question/edit asks fail closed via compileSolAsk;
 * - verdict vocabularies are type-locked;
 * - validated Sprint-04 sources are required; every contractRef binds by
 *   (contractKey, semanticDigest) and every requirementRef resolves;
 * - DIAGNOSE criteria must be declared, digest-bound, and resolvable to a
 *   source acceptance item;
 * - FINAL_REVIEW uses named invariants with unique ids and declared
 *   locked requirements;
 * - RECHECK is delta-only around one prior finding with frozen
 *   provenance;
 * - compiled asks are stamped, deeply frozen, and render deterministically.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSolAsk } from '../../src/sol/ask-compiler/compiler.mjs';
import { renderSolAsk } from '../../src/sol/ask-compiler/render.mjs';
import { validateSolAsk } from '../../src/sol/contracts/validate.mjs';
import { SolAskError } from '../../src/sol/contracts/errors.mjs';
import { isValidSolAskId } from '../../src/sol/contracts/ids.mjs';
import { ConfigError } from '../../src/shared/errors.mjs';
import {
  readSolFixture,
  rawAskFromFixture,
  bindAskRefs,
  compileProviderContract,
  providerFactoryEffectId,
  networkEffectId,
  buildPriorFinalReview,
  PRIOR_FINDING_ID,
  NOW,
} from './helpers.mjs';

const SOURCE = compileProviderContract();

function baseAsk(overrides = {}) {
  return {
    callType: 'SOL_CONTRACT_CHECK',
    singleDecisionQuestion: 'Is the exact field-name casing of the approval decision contract sufficiently specified?',
    whyNeeded: 'BL-020 approval field casing must be pinned exactly before workers start.',
    contractRefs: [
      {
        contractKey: SOURCE.contractKey,
        semanticDigest: SOURCE.semanticDigest,
        requirementRefs: [providerFactoryEffectId(SOURCE)],
      },
    ],
    establishedFacts: [{ fact: 'the contract is authoritative', evidence: 'compiled semantic contract' }],
    evidence: [{ ref: 'ev.1', kind: 'requirement', content: 'exact casing is authority-bearing', decisionCritical: true }],
    passCondition: 'exact semantics are complete and unambiguous',
    failCondition: 'any authoritative field name/casing is under-specified',
    allowedScope: ['exact semantics of the referenced contract only'],
    outOfScope: ['implementation', 'code edits', 'general review'],
    contractCheck: { amendmentsOnly: true, expectedVerdicts: ['SUFFICIENTLY_SPECIFIED', 'AMENDMENTS_REQUIRED'] },
    ...overrides,
  };
}

/** baseAsk without the contractCheck block (for DIAGNOSE/FINAL_REVIEW/RECHECK inputs). */
function baseAskWithoutCheck(overrides = {}) {
  const { contractCheck: _block, ...rest } = baseAsk(overrides);
  return rest;
}

const SOURCES = [SOURCE];

test('every valid ask has exactly one primary decision question and explicit pass/fail', () => {
  const ask = compileSolAsk(baseAsk(), { compiledAt: NOW, sources: SOURCES });
  assert.equal(ask.schemaName, 'lcim.sol-ask');
  assert.equal(ask.schemaVersion, '2.0.0');
  assert.equal((ask.singleDecisionQuestion.match(/\?/g) ?? []).length, 1);
  assert.ok(ask.passCondition.length > 0);
  assert.ok(ask.failCondition.length > 0);
  assert.ok(Object.isFrozen(ask));
  assert.ok(Object.isFrozen(ask.evidence));
  assert.ok(Object.isFrozen(ask.contractRefs));
});

test('compiled ask carries the full decision contract (call id/type, contracts, facts, scope, shape, constraints, budget)', () => {
  const ask = compileSolAsk(baseAsk(), { compiledAt: NOW, sources: SOURCES });
  assert.ok(isValidSolAskId(ask.askId));
  assert.equal(ask.callType, 'SOL_CONTRACT_CHECK');
  assert.equal(ask.whyNeeded.length > 0, true);
  assert.ok(ask.contractRefs.length >= 1);
  assert.ok(ask.contractRefs[0].requirementRefs.length >= 1);
  assert.ok(Array.isArray(ask.establishedFacts));
  assert.ok(Array.isArray(ask.evidence));
  assert.ok(ask.allowedScope.length >= 1);
  assert.ok(ask.outOfScope.length >= 1);
  assert.deepEqual(ask.requiredResponseShape.verdicts, ['SUFFICIENTLY_SPECIFIED', 'AMENDMENTS_REQUIRED']);
  assert.equal(ask.repairConstraints.boundedToRejectedAcceptance, true);
  assert.equal(ask.evidenceBudget.onOverflow, 'FAIL_CLOSED');
  assert.equal(ask.compiledAt, NOW);
});

test('all four call types compile with their per-type block', () => {
  const prior = buildPriorFinalReview();
  const cases = [
    ['SOL_CONTRACT_CHECK', 'contractCheck', baseAsk()],
    ['SOL_DIAGNOSE', 'diagnose', {
      ...baseAskWithoutCheck({ callType: 'SOL_DIAGNOSE' }),
      singleDecisionQuestion: 'Why does the provider_factory negative side-effect criterion fail before the authorization failure is handled?',
      diagnose: {
        acceptanceCriterionRef: providerFactoryEffectId(SOURCE),
        criterionRequirement: 'provider factory invocations remain zero before an authorization failure is handled',
      },
    }],
    ['SOL_FINAL_REVIEW', 'finalReview', {
      ...baseAskWithoutCheck({ callType: 'SOL_FINAL_REVIEW' }),
      singleDecisionQuestion: 'Do the named high-risk invariants of the provider authorization flow hold on the candidate?',
      finalReview: {
        invariantChecklist: [
          {
            invariantId: 'inv.provider_factory_zero',
            invariant: 'provider factory construction stays zero before an authorization failure is handled',
            lockedRequirementRef: providerFactoryEffectId(SOURCE),
          },
        ],
        maxAdjacentCriticalDefects: 1,
      },
    }],
    ['SOL_RECHECK', 'recheck', {
      ...baseAskWithoutCheck({ callType: 'SOL_RECHECK' }),
      singleDecisionQuestion: 'Is the prior provider_factory finding resolved by the delta evidence?',
      evidence: [],
      contractRefs: [
        {
          contractKey: SOURCE.contractKey,
          semanticDigest: SOURCE.semanticDigest,
          requirementRefs: [providerFactoryEffectId(SOURCE), networkEffectId(SOURCE)],
        },
      ],
      recheck: {
        priorFindingRef: PRIOR_FINDING_ID,
        deltaEvidence: [{ ref: 'ev.delta', content: 'counter reports 0 before the gate' }],
        neighboringInvariants: [networkEffectId(SOURCE)],
        mustNotReopen: true,
      },
    }],
  ];
  for (const [callType, block, input] of cases) {
    const ask = compileSolAsk(input, { compiledAt: NOW, sources: SOURCES, prior });
    assert.equal(ask.callType, callType);
    assert.ok(ask[block] !== undefined, `${callType} must carry ${block}`);
    assert.equal((ask.singleDecisionQuestion.match(/\?/g) ?? []).length, 1);
    assert.equal(validateSolAsk(ask, { sources: SOURCES, prior }).valid, true, callType);
  }
});

test('cross-type blocks are rejected (one primary question, one call type, one block)', () => {
  const cross = baseAsk({ diagnose: { acceptanceCriterionRef: 'se_' + 'a'.repeat(64), criterionRequirement: 'x' } });
  assert.throws(() => compileSolAsk(cross, { compiledAt: NOW, sources: SOURCES }), ConfigError);
});

test('a missing per-type block fails closed', () => {
  const { contractCheck, ...withoutBlock } = baseAsk();
  assert.throws(() => compileSolAsk(withoutBlock, { compiledAt: NOW, sources: SOURCES }), ConfigError);
});

test('verdict vocabularies are type-locked and cannot be redefined', () => {
  assert.throws(
    () =>
      compileSolAsk(
        baseAsk({
          requiredResponseShape: { verdicts: ['PASS', 'FAIL'], fields: ['verdict'] },
        }),
        { compiledAt: NOW, sources: SOURCES },
      ),
    (err) => err instanceof SolAskError && hasCode(err, 'RESPONSE_SHAPE_MISMATCH'),
  );
  // without a caller shape, the type-locked default is applied
  const ask = compileSolAsk(baseAsk(), { compiledAt: NOW, sources: SOURCES });
  assert.deepEqual(ask.requiredResponseShape.verdicts, ['SUFFICIENTLY_SPECIFIED', 'AMENDMENTS_REQUIRED']);
});

test('generic asks fail closed at compile time with SolAskError', () => {
  assert.throws(
    () => compileSolAsk(baseAsk({ singleDecisionQuestion: 'review this' }), { compiledAt: NOW, sources: SOURCES }),
    (err) => err instanceof SolAskError && err.code === 'SOL_ASK_INVALID',
  );
  assert.throws(
    () => compileSolAsk(baseAsk({ whyNeeded: 'please look for bugs everywhere' }), { compiledAt: NOW, sources: SOURCES }),
    SolAskError,
  );
});

test('edit requests fail closed at compile time', () => {
  assert.throws(
    () =>
      compileSolAsk(
        baseAsk({ singleDecisionQuestion: 'Why does the criterion fail and edit the file to fix it?' }),
        { compiledAt: NOW, sources: SOURCES },
      ),
    (err) => err instanceof SolAskError && err.code === 'SOL_ASK_INVALID',
  );
});

test('compiler rejects caller-supplied derived fields (askId, compiledAt, schema fields)', () => {
  assert.throws(() => compileSolAsk({ ...baseAsk(), askId: 'lcim_sol_ask_' + 'a'.repeat(32) }), ConfigError);
  assert.throws(() => compileSolAsk({ ...baseAsk(), compiledAt: NOW }), ConfigError);
  assert.throws(() => compileSolAsk({ ...baseAsk(), schemaName: 'lcim.sol-ask' }), ConfigError);
});

test('sources are required: no source-free authoritative references', () => {
  assert.throws(
    () => compileSolAsk(baseAsk(), { compiledAt: NOW }),
    (err) => err instanceof SolAskError && hasCode(err, 'SOURCE_INVALID'),
  );
});

test('DIAGNOSE criterion must be declared among contractRefs requirementRefs', () => {
  const diagnose = {
    ...baseAskWithoutCheck({ callType: 'SOL_DIAGNOSE' }),
    singleDecisionQuestion: 'Why does the provider_factory negative side-effect criterion fail before the authorization failure is handled?',
    diagnose: {
      acceptanceCriterionRef: providerFactoryEffectId(SOURCE),
      criterionRequirement: 'provider factory invocations remain zero before an authorization failure is handled',
    },
  };
  assert.equal(compileSolAsk(diagnose, { compiledAt: NOW, sources: SOURCES }).callType, 'SOL_DIAGNOSE');

  const undeclared = {
    ...diagnose,
    contractRefs: [{ contractKey: SOURCE.contractKey, semanticDigest: SOURCE.semanticDigest, requirementRefs: [] }],
  };
  assert.throws(
    () => compileSolAsk(undeclared, { compiledAt: NOW, sources: SOURCES }),
    (err) => err instanceof SolAskError && hasCode(err, 'CRITERION_NOT_DECLARED'),
  );
});

test('DIAGNOSE with a source contract binds by digest and resolves the criterion', () => {
  const criterion = providerFactoryEffectId(SOURCE);
  const build = (refs, question) =>
    baseAskWithoutCheck({
      callType: 'SOL_DIAGNOSE',
      singleDecisionQuestion: question,
      contractRefs: refs,
      diagnose: {
        acceptanceCriterionRef: criterion,
        criterionRequirement: 'provider factory invocations remain zero before an authorization failure is handled',
      },
    });

  // digest binding required: an invented pattern-valid digest never binds
  assert.throws(
    () => compileSolAsk(build([{ contractKey: SOURCE.contractKey, semanticDigest: 'a'.repeat(64) }], 'Why does the provider_factory criterion fail?'), { compiledAt: NOW, sources: SOURCES }),
    (err) => err instanceof SolAskError && hasCode(err, 'CONTRACT_REF_UNBOUND'),
  );

  const bound = build(
    [{ contractKey: SOURCE.contractKey, semanticDigest: SOURCE.semanticDigest, requirementRefs: [criterion] }],
    'Why does the provider_factory criterion fail?',
  );
  assert.equal(compileSolAsk(bound, { compiledAt: NOW, sources: SOURCES }).callType, 'SOL_DIAGNOSE');

  // unknown criterion fails closed
  const unknownCriterion = {
    ...bound,
    diagnose: {
      acceptanceCriterionRef: 'se_' + 'b'.repeat(64),
      criterionRequirement: 'provider factory invocations remain zero before an authorization failure is handled',
    },
    contractRefs: [
      { contractKey: SOURCE.contractKey, semanticDigest: SOURCE.semanticDigest, requirementRefs: ['se_' + 'b'.repeat(64)] },
    ],
  };
  assert.throws(
    () => compileSolAsk(unknownCriterion, { compiledAt: NOW, sources: SOURCES }),
    (err) => err instanceof SolAskError && hasCode(err, 'CRITERION_UNKNOWN_TO_SOURCE'),
  );

  // criterion requirement must quote the source verbatim
  const wrongText = {
    ...bound,
    diagnose: {
      acceptanceCriterionRef: criterion,
      criterionRequirement: 'a different paraphrase of the requirement',
    },
  };
  assert.throws(
    () => compileSolAsk(wrongText, { compiledAt: NOW, sources: SOURCES }),
    (err) => err instanceof SolAskError && hasCode(err, 'CRITERION_REQUIREMENT_MISMATCH'),
  );
});

test('FINAL_REVIEW uses named invariants with unique ids (no open-ended review)', () => {
  const dup = baseAskWithoutCheck({
    callType: 'SOL_FINAL_REVIEW',
    singleDecisionQuestion: 'Do the named high-risk invariants of the provider authorization flow hold on the candidate?',
    finalReview: {
      invariantChecklist: [
        {
          invariantId: 'inv.provider_factory_zero',
          invariant: 'provider factory construction stays zero before an authorization failure is handled',
          lockedRequirementRef: providerFactoryEffectId(SOURCE),
        },
        {
          invariantId: 'inv.provider_factory_zero',
          invariant: 'duplicate id',
          lockedRequirementRef: 'se_' + 'c'.repeat(64),
        },
      ],
      maxAdjacentCriticalDefects: 1,
    },
  });
  assert.throws(
    () => compileSolAsk(dup, { compiledAt: NOW, sources: SOURCES }),
    (err) => err instanceof SolAskError && hasCode(err, 'DUPLICATE_INVARIANT_ID'),
  );
});

test('RECHECK requires delta evidence, provenance, and mustNotReopen', () => {
  const prior = buildPriorFinalReview();
  const input = () => ({
    ...baseAskWithoutCheck({ callType: 'SOL_RECHECK' }),
    singleDecisionQuestion: 'Is the prior provider_factory finding resolved by the delta evidence?',
    evidence: [],
    contractRefs: [
      {
        contractKey: SOURCE.contractKey,
        semanticDigest: SOURCE.semanticDigest,
        requirementRefs: [providerFactoryEffectId(SOURCE), networkEffectId(SOURCE)],
      },
    ],
    recheck: {
      priorFindingRef: PRIOR_FINDING_ID,
      deltaEvidence: [{ ref: 'ev.delta', content: 'counter reports 0 before the gate' }],
      neighboringInvariants: [networkEffectId(SOURCE)],
      mustNotReopen: true,
    },
  });
  const ask = compileSolAsk(input(), { compiledAt: NOW, sources: SOURCES, prior });
  assert.equal(ask.recheck.mustNotReopen, true);
  assert.equal(ask.recheck.priorAskId, prior.ask.askId);
  assert.equal(ask.recheck.priorResponseId, prior.response.responseId);
  assert.match(ask.recheck.priorFindingDigest, /^[0-9a-f]{64}$/);
  assert.deepEqual(ask.recheck.deltaEvidenceRefs, ['ev.delta']);

  // missing delta evidence fails closed
  assert.throws(
    () =>
      compileSolAsk(
        {
          ...input(),
          recheck: {
            priorFindingRef: PRIOR_FINDING_ID,
            neighboringInvariants: ['inv.network_zero'],
            mustNotReopen: true,
          },
        },
        { compiledAt: NOW, sources: SOURCES, prior },
      ),
    ConfigError,
  );
});

test('renderSolAsk is deterministic, bounded, and carries the decision contract', () => {
  const ask = compileSolAsk(
    baseAskWithoutCheck({
      callType: 'SOL_FINAL_REVIEW',
      singleDecisionQuestion: 'Do the named high-risk invariants of the provider authorization flow hold on the candidate?',
      finalReview: {
        invariantChecklist: [
          {
            invariantId: 'inv.provider_factory_zero',
            invariant: 'provider factory construction stays zero before an authorization failure is handled',
            lockedRequirementRef: providerFactoryEffectId(SOURCE),
          },
        ],
        maxAdjacentCriticalDefects: 1,
      },
    }),
    { compiledAt: NOW, sources: SOURCES },
  );
  const rendered = renderSolAsk(ask);
  assert.ok(rendered.includes(ask.singleDecisionQuestion));
  assert.ok(rendered.includes(ask.passCondition));
  assert.ok(rendered.includes(ask.failCondition));
  assert.ok(rendered.includes('inv.provider_factory_zero'));
  assert.ok(rendered.includes('Out of scope'));
  assert.ok(rendered.includes('SOL_FINAL_REVIEW'));
  assert.ok(rendered.length < 32768);
  // deterministic
  assert.equal(renderSolAsk(ask), rendered);
  assert.equal(renderSolAsk(ask), renderSolAsk(ask));
});

test('compiled-ask fixtures validate (all four call types)', () => {
  const fixtures = [
    'valid-ask-contract-check.json',
    'valid-ask-diagnose.json',
    'valid-ask-final-review.json',
    'valid-ask-recheck.json',
  ];
  for (const name of fixtures) {
    const result = validateSolAsk(readSolFixture(name));
    assert.equal(result.valid, true, name);
  }
});

test('an ask without explicit pass/fail conditions is invalid', () => {
  const result = validateSolAsk(readSolFixture('invalid-ask-missing-pass-fail.json'));
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.message.includes('passCondition')));
  assert.ok(result.errors.some((e) => e.message.includes('failCondition')));
});

test('compiled-ask fixtures compile when bound to real sources', () => {
  const prior = buildPriorFinalReview();
  const diagnose = compileSolAsk(
    bindAskRefs(rawAskFromFixture(readSolFixture('valid-ask-diagnose.json')), SOURCE),
    { compiledAt: NOW, sources: SOURCES },
  );
  assert.equal(diagnose.callType, 'SOL_DIAGNOSE');
  assert.deepEqual(diagnose.diagnose.priorEvidenceRefs, ['ev.prior.run']);

  const contractCheck = compileSolAsk(
    bindAskRefs(rawAskFromFixture(readSolFixture('valid-ask-contract-check.json')), SOURCE),
    { compiledAt: NOW, sources: SOURCES },
  );
  assert.equal(contractCheck.callType, 'SOL_CONTRACT_CHECK');

  const finalReview = compileSolAsk(
    bindAskRefs(rawAskFromFixture(readSolFixture('valid-ask-final-review.json')), SOURCE),
    { compiledAt: NOW, sources: SOURCES },
  );
  assert.equal(finalReview.callType, 'SOL_FINAL_REVIEW');

  const recheck = compileSolAsk(
    {
      ...rawAskFromFixture(readSolFixture('valid-ask-recheck.json')),
      evidence: [],
      contractRefs: [
        {
          contractKey: SOURCE.contractKey,
          semanticDigest: SOURCE.semanticDigest,
          requirementRefs: [providerFactoryEffectId(SOURCE), networkEffectId(SOURCE)],
        },
      ],
      recheck: {
        priorFindingRef: PRIOR_FINDING_ID,
        deltaEvidence: [{ ref: 'ev.delta.counter', content: 'delta run reports provider_factory count 0 before the gate' }],
        neighboringInvariants: [networkEffectId(SOURCE)],
        mustNotReopen: true,
      },
    },
    { compiledAt: NOW, sources: SOURCES, prior },
  );
  assert.equal(recheck.callType, 'SOL_RECHECK');
  assert.deepEqual(recheck.evidence.map((e) => e.ref), ['ev.delta.counter']);
});

/** True when the error carries the given code (top-level or in details.errors). */
function hasCode(err, code) {
  return err?.code === code || (err?.details?.errors ?? []).some((e) => e.code === code);
}
