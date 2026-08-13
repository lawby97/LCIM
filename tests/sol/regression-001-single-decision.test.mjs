/**
 * SOL-S06-001 regression: SINGLE-DECISION SEMICOLON BYPASS.
 *
 * detectMultipleQuestions() must reject semicolon/newline/clause-separated
 * second interrogative or decision clauses while preserving the existing
 * multi-'?' and conjunction rejection, and must never scan unrelated
 * evidence/fact prose for '?' as though it were the primary question.
 * Call-type-specific question-shape validation rejects questions spanning
 * more than one call-type decision domain.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  preflightSolRequest,
  detectMultipleQuestions,
  detectCrossDomainQuestion,
  splitDecisionClauses,
  isSingleQuestion,
} from '../../src/sol/ask-compiler/preflight.mjs';
import { compileSolAsk } from '../../src/sol/ask-compiler/compiler.mjs';
import { compileProviderContract, NOW } from './helpers.mjs';

const SOURCE = compileProviderContract();
const SOURCES = [SOURCE];

function baseAsk(overrides = {}) {
  return {
    callType: 'SOL_CONTRACT_CHECK',
    singleDecisionQuestion: 'Is the exact field-name casing of the approval decision contract sufficiently specified?',
    whyNeeded: 'preflight regression',
    contractRefs: [{ contractKey: SOURCE.contractKey, semanticDigest: SOURCE.semanticDigest }],
    establishedFacts: [],
    evidence: [{ ref: 'ev.1', content: 'exact casing is authority-bearing', decisionCritical: true }],
    passCondition: 'p',
    failCondition: 'f',
    allowedScope: ['semantics only'],
    outOfScope: ['edits'],
    contractCheck: { amendmentsOnly: true, expectedVerdicts: ['SUFFICIENTLY_SPECIFIED', 'AMENDMENTS_REQUIRED'] },
    ...overrides,
  };
}

test('REJECT: semicolon-separated second decision clause (one ? only)', () => {
  const question = 'Is the digest binding exact; is the lifecycle complete?';
  assert.equal(isSingleQuestion(question), true, 'one ? passes the count check');
  const detected = detectMultipleQuestions(question);
  assert.ok(detected !== null, 'clause splitting must catch the second decision clause');
  assert.equal(detected.code, 'MULTIPLE_QUESTIONS');
  assert.equal(preflightSolRequest({ decisionQuestion: question }).valid, false);
  // clause splitting is observable
  assert.deepEqual(splitDecisionClauses(question), ['Is the digest binding exact', 'is the lifecycle complete?']);
});

test('REJECT: newline-separated second decision clause', () => {
  assert.equal(detectMultipleQuestions('Is the digest binding exact\nis the lifecycle complete?').code, 'MULTIPLE_QUESTIONS');
  assert.equal(detectMultipleQuestions('Is the digest binding exact\r\nshould the migration window shift?').code, 'MULTIPLE_QUESTIONS');
  assert.equal(detectMultipleQuestions('Is the digest binding exact; how is the lifecycle handled?').code, 'MULTIPLE_QUESTIONS');
});

test('REJECT: preserved multi-? and conjunction rejection', () => {
  assert.equal(detectMultipleQuestions('Is the digest correct? Is the lifecycle complete?').code, 'MULTIPLE_QUESTIONS');
  assert.equal(detectMultipleQuestions('Is the digest correct and whether the lifecycle is complete?').code, 'MULTIPLE_QUESTIONS');
  assert.equal(detectMultipleQuestions('Is the digest correct and is the lifecycle complete?').code, 'MULTIPLE_QUESTIONS');
});

test('ACCEPT: a single question whose appositive tail is not a decision clause', () => {
  const question = 'Is the digest binding exact; that is, derived from canonical content?';
  assert.equal(detectMultipleQuestions(question), null);
  assert.equal(preflightSolRequest({ decisionQuestion: question }).valid, true);
});

test('ACCEPT: a single bounded question while evidence/fact prose carries a benign ?', () => {
  // the '?' lives in evidence content, never in the primary question
  const ask = compileSolAsk(
    baseAsk({
      evidence: [
        { ref: 'ev.1', content: 'is the exact casing authority-bearing? yes', decisionCritical: true },
      ],
      establishedFacts: [{ fact: 'what does the contract pin? the casing', evidence: 'compiled contract' }],
    }),
    { compiledAt: NOW, sources: SOURCES },
  );
  assert.equal(ask.callType, 'SOL_CONTRACT_CHECK');
  assert.equal((ask.singleDecisionQuestion.match(/\?/g) ?? []).length, 1);
});

test('REJECT: a question spanning more than one call-type decision domain', () => {
  const crossDomain = 'Is the provider authorization semantics sufficiently specified for the named invariants to hold?';
  const detected = detectCrossDomainQuestion(crossDomain, 'SOL_FINAL_REVIEW');
  assert.ok(detected !== null);
  assert.equal(detected.code, 'CROSS_DOMAIN_QUESTION');
  assert.equal(
    preflightSolRequest({ decisionQuestion: crossDomain, callType: 'SOL_FINAL_REVIEW' }).valid,
    false,
  );
  // without a callType the domain guard does not fire (context-free preflight)
  assert.equal(preflightSolRequest({ decisionQuestion: crossDomain }).valid, true);
});

test('ACCEPT: single questions in each call-type domain', () => {
  const questions = {
    SOL_CONTRACT_CHECK: 'Is the exact field-name casing of the approval decision contract sufficiently specified?',
    SOL_DIAGNOSE: 'Why does the provider_factory negative side-effect criterion fail before the authorization failure is handled?',
    SOL_FINAL_REVIEW: 'Do the named high-risk invariants of the provider authorization flow hold on the candidate?',
    SOL_RECHECK: 'Is the prior provider_factory finding resolved by the delta evidence?',
  };
  for (const [callType, question] of Object.entries(questions)) {
    assert.equal(detectMultipleQuestions(question), null, callType);
    assert.equal(detectCrossDomainQuestion(question, callType), null, callType);
  }
});
