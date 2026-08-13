/**
 * Sprint 06 unit tests: SOL ask preflight.
 *
 * Acceptance criteria covered here:
 * - generic SOL asks fail preflight (`review this`, `look for bugs`,
 *   `diagnose everything`, ...);
 * - prompts with multiple independent primary questions fail preflight;
 * - architecture/implementation/testing/cleanup are never bundled into
 *   one decision question;
 * - SOL is never asked to edit files;
 * - every valid ask has exactly one primary decision question.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  preflightSolRequest,
  detectGenericAsk,
  detectMultipleQuestions,
  detectEditRequest,
  isSingleQuestion,
} from '../../src/sol/ask-compiler/preflight.mjs';

function preflight(decisionQuestion, whyNeeded = '', allowedScope = []) {
  return preflightSolRequest({ decisionQuestion, whyNeeded, allowedScope });
}

test('generic SOL asks fail preflight', () => {
  const genericAsks = [
    'review this',
    'look for bugs',
    'diagnose everything',
    'review the whole repo',
    'review the entire codebase',
    'find all bugs',
    'are there any issues?',
    'is there any other problems?',
    'give an overall quality assessment',
    'do a general review',
  ];
  for (const ask of genericAsks) {
    const result = preflight(ask);
    assert.equal(result.valid, false, `expected '${ask}' to fail preflight`);
    assert.equal(result.rejection.code, 'GENERIC_ASK', ask);
  }
});

test('generic phrasing inside the why-needed context also fails preflight', () => {
  const result = preflight(
    'Is the digest binding exact?',
    'I would like you to look for bugs in the candidate',
  );
  assert.equal(result.valid, false);
  assert.equal(result.rejection.code, 'GENERIC_ASK');
});

test('multiple independent primary questions fail preflight', () => {
  const multi = [
    'Is the digest correct? Should we also change the ticker binding?',
    'Is the field name exact and whether the lifecycle is complete?',
    'Is the digest correct and is the field name exact?',
    'Is the contract COMPILED and is its digest internally valid?',
    'whether the migration window is safe and whether the backfill is exact?',
  ];
  for (const ask of multi) {
    const result = preflight(ask);
    assert.equal(result.valid, false, `expected multi-question ask to fail: '${ask}'`);
    assert.equal(result.rejection.code, 'MULTIPLE_QUESTIONS', ask);
  }
});

test('a question with no question mark is not a primary decision question', () => {
  const result = preflight('Decide the digest meaning');
  assert.equal(result.valid, false);
  assert.equal(result.rejection.code, 'MULTIPLE_QUESTIONS');
});

test('architecture, implementation, testing, and cleanup never bundle into one question', () => {
  const result = preflight(
    'Is the architecture sound, the implementation correct, the testing complete, and the cleanup needed?',
  );
  assert.equal(result.valid, false);
  assert.equal(result.rejection.code, 'BUNDLED_CONCERNS');
});

test('SOL is never asked to edit files', () => {
  const editAsks = [
    'Why does the criterion fail and edit the file to fix it?',
    'Should we apply the patch to the repository?',
    'Should we implement the fix for the criterion?',
    'Please make the changes to the code',
    'Change the implementation to satisfy the criterion',
    'Apply the patch to satisfy the criterion?',
  ];
  for (const ask of editAsks) {
    const result = preflight(ask);
    assert.equal(result.valid, false, `expected edit request to fail: '${ask}'`);
    assert.equal(result.rejection.code, 'EDIT_REQUEST', ask);
  }
});

test('a single bounded primary decision question passes preflight', () => {
  const valid = [
    'Is the exact field-name casing of the approval decision contract sufficiently specified?',
    'Why does the provider_factory negative side-effect criterion fail before the authorization failure is handled?',
    'Do the named high-risk invariants of the provider authorization flow hold on the candidate?',
    'Is the prior provider_factory finding resolved by the delta evidence?',
  ];
  for (const ask of valid) {
    const result = preflight(ask);
    assert.equal(result.valid, true, `expected single question to pass: '${ask}'`);
  }
});

test('preflight returns a structured rejection with code, reason, and matched pattern', () => {
  const result = preflight('review this');
  assert.equal(result.valid, false);
  assert.match(result.rejection.reason, /generic SOL ask rejected/);
  assert.equal(typeof result.rejection.matched, 'string');
  assert.ok(result.rejection.matched.length > 0);
});

test('detectors are pure text predicates', () => {
  assert.equal(detectGenericAsk('please look at the flow'), null);
  assert.ok(detectGenericAsk('please look for bugs'));
  assert.equal(detectMultipleQuestions('Is the digest exact?'), null);
  assert.ok(detectMultipleQuestions('Is X exact? Is Y exact?'));
  assert.equal(detectEditRequest('Why does the criterion fail?'), null);
  assert.ok(detectEditRequest('edit the file to fix it'));
  assert.equal(isSingleQuestion('Is the digest exact?'), true);
  assert.equal(isSingleQuestion('Is X? Is Y?'), false);
});
