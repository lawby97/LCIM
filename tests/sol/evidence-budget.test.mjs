/**
 * Sprint 06 unit tests: evidence budgets.
 *
 * Acceptance criteria covered here:
 * - evidence budgets fail closed when required decision evidence cannot
 *   fit;
 * - FAIL_CLOSED rejects oversized ambiguous packets (never silently
 *   broadened);
 * - TRUNCATE_SUMMARIZE truncates deterministically with a last-item
 *   marker and never drops decision-critical evidence;
 * - compiled documents that outgrow their budget are invalid.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEvidenceBudget } from '../../src/sol/ask-compiler/evidence-budget.mjs';
import { compileSolAsk } from '../../src/sol/ask-compiler/compiler.mjs';
import { validateSolAsk, validateSolResponse } from '../../src/sol/contracts/validate.mjs';
import { SolAskError } from '../../src/sol/contracts/errors.mjs';
import { ConfigError } from '../../src/shared/errors.mjs';
import {
  evidenceByteLength,
  TRUNCATION_MARKER_REF,
  DEFAULT_EVIDENCE_BUDGET,
} from '../../src/sol/contracts/evidence.mjs';
import { readSolFixture, compileProviderContract, NOW } from './helpers.mjs';

const SOURCE = compileProviderContract();
const SOURCES = [SOURCE];

function items(n, content = 'x', refPrefix = 'ev') {
  return Array.from({ length: n }, (_, i) => ({
    ref: `${refPrefix}.${i}`,
    kind: 'observation',
    content: content.repeat(i + 1),
  }));
}

test('evidence that fits the budget passes through unchanged', () => {
  const evidence = items(3, 'ab');
  const result = applyEvidenceBudget(evidence, DEFAULT_EVIDENCE_BUDGET);
  assert.equal(result.truncated, false);
  assert.equal(result.summary, null);
  assert.deepEqual(result.evidence, evidence);
  // input is cloned, never mutated
  assert.notEqual(result.evidence, evidence);
});

test('FAIL_CLOSED rejects an oversized ambiguous packet', () => {
  const evidence = items(30, 'a', 'ev.big'); // 30 items > 16 maxItems
  assert.throws(
    () => applyEvidenceBudget(evidence, { ...DEFAULT_EVIDENCE_BUDGET, onOverflow: 'FAIL_CLOSED' }),
    (err) => err instanceof SolAskError && err.code === 'BUDGET_EXHAUSTED',
  );
  // byte overflow alone also fails closed
  const heavy = [{ ref: 'ev.heavy', content: 'z'.repeat(9000) }];
  assert.throws(
    () => applyEvidenceBudget(heavy, { ...DEFAULT_EVIDENCE_BUDGET, onOverflow: 'FAIL_CLOSED' }),
    (err) => err instanceof SolAskError && err.code === 'BUDGET_EXHAUSTED',
  );
});

test('TRUNCATE_SUMMARIZE keeps items in order, appends the marker last, and is deterministic', () => {
  const evidence = items(20, 'ab', 'ev.trunc');
  const first = applyEvidenceBudget(evidence, { ...DEFAULT_EVIDENCE_BUDGET, onOverflow: 'TRUNCATE_SUMMARIZE' });
  const second = applyEvidenceBudget(evidence, { ...DEFAULT_EVIDENCE_BUDGET, onOverflow: 'TRUNCATE_SUMMARIZE' });

  assert.equal(first.truncated, true);
  assert.deepEqual(first, second, 'truncation must be deterministic');
  const fitted = first.evidence;
  const marker = fitted[fitted.length - 1];
  assert.equal(marker.ref, TRUNCATION_MARKER_REF);
  assert.match(marker.content, /^truncated: kept \d+ of 20 evidence items/);
  // authored order preserved before the marker
  for (let i = 0; i < fitted.length - 1; i += 1) {
    assert.equal(fitted[i].ref, `ev.trunc.${i}`);
  }
  // the fitted packet respects the budget (marker included)
  const measured = evidenceByteLength(fitted);
  assert.ok(measured.items <= DEFAULT_EVIDENCE_BUDGET.maxItems);
  assert.ok(measured.bytes <= DEFAULT_EVIDENCE_BUDGET.maxBytes);
  assert.equal(measured.items, DEFAULT_EVIDENCE_BUDGET.maxItems); // marker slot reserved
});

test('decision-critical evidence that cannot fit fails closed even under TRUNCATE_SUMMARIZE', () => {
  const evidence = [
    { ref: 'ev.critical.a', content: 'c'.repeat(120), decisionCritical: true },
    { ref: 'ev.critical.b', content: 'c'.repeat(120), decisionCritical: true },
  ];
  const tiny = { maxItems: 2, maxBytes: 300, onOverflow: 'TRUNCATE_SUMMARIZE' };
  // 2 items x ~168 bytes > 300 bytes => truncation needed; the first
  // decision-critical item cannot fit the marker-reserved item budget.
  assert.throws(
    () => applyEvidenceBudget(evidence, tiny),
    (err) => err instanceof SolAskError && err.code === 'BUDGET_EXHAUSTED',
  );
});

test('a single oversized item fails closed under TRUNCATE_SUMMARIZE', () => {
  const evidence = [{ ref: 'ev.huge', content: 'z'.repeat(9000), decisionCritical: true }];
  assert.throws(
    () => applyEvidenceBudget(evidence, { ...DEFAULT_EVIDENCE_BUDGET, onOverflow: 'TRUNCATE_SUMMARIZE' }),
    (err) => err instanceof SolAskError && err.code === 'BUDGET_EXHAUSTED',
  );
});

test('a budget that cannot hold the marker plus one item fails closed', () => {
  const evidence = items(2, 'a');
  assert.throws(
    () => applyEvidenceBudget(evidence, { maxItems: 1, maxBytes: 8192, onOverflow: 'TRUNCATE_SUMMARIZE' }),
    (err) => err instanceof SolAskError && err.code === 'BUDGET_EXHAUSTED',
  );
});

test('compileSolAsk applies the budget: FAIL_CLOSED rejects, TRUNCATE_SUMMARIZE records', () => {
  const heavy = { ref: 'ev.heavy', content: 'z'.repeat(2000), decisionCritical: true };
  const base = {
    callType: 'SOL_CONTRACT_CHECK',
    singleDecisionQuestion: 'Is the exact field-name casing of the approval decision contract sufficiently specified?',
    whyNeeded: 'budget test',
    contractRefs: [{ contractKey: SOURCE.contractKey, semanticDigest: SOURCE.semanticDigest }],
    establishedFacts: [],
    passCondition: 'p',
    failCondition: 'f',
    allowedScope: ['scope'],
    outOfScope: ['out'],
    contractCheck: { amendmentsOnly: true, expectedVerdicts: ['SUFFICIENTLY_SPECIFIED', 'AMENDMENTS_REQUIRED'] },
  };

  // FAIL_CLOSED: the oversized packet is rejected, never broadened
  assert.throws(
    () =>
      compileSolAsk(
        {
          ...base,
          evidence: [heavy],
          evidenceBudget: { maxItems: 1, maxBytes: 64, onOverflow: 'FAIL_CLOSED' },
        },
        { compiledAt: NOW, sources: SOURCES },
      ),
    (err) => err instanceof SolAskError && err.code === 'BUDGET_EXHAUSTED',
  );

  // TRUNCATE_SUMMARIZE: decision-critical evidence that cannot fit still fails closed
  assert.throws(
    () =>
      compileSolAsk(
        {
          ...base,
          evidence: [heavy, { ref: 'ev.light', content: 'ok' }],
          evidenceBudget: { maxItems: 8, maxBytes: 512, onOverflow: 'TRUNCATE_SUMMARIZE' },
        },
        { compiledAt: NOW, sources: SOURCES },
      ),
    (err) => err instanceof SolAskError && err.code === 'BUDGET_EXHAUSTED',
  );

  // TRUNCATE_SUMMARIZE: non-critical overflow keeps order + appends the marker
  const small = { maxItems: 2, maxBytes: 512, onOverflow: 'TRUNCATE_SUMMARIZE' };
  const ask = compileSolAsk(
    {
      ...base,
      evidenceBudget: small,
      evidence: [
        { ref: 'ev.a', content: 'a' },
        { ref: 'ev.b', content: 'b' },
        { ref: 'ev.c', content: 'c' },
      ],
    },
    { compiledAt: NOW, sources: SOURCES },
  );
  assert.equal(ask.evidence.length, 2);
  assert.equal(ask.evidence[0].ref, 'ev.a');
  assert.equal(ask.evidence.at(-1).ref, TRUNCATION_MARKER_REF);
  assert.equal(validateSolAsk(ask).valid, true, 'the compiled ask still fits its own budget');

  // all-critical evidence cannot be truncated: fail closed
  assert.throws(
    () =>
      compileSolAsk(
        {
          ...base,
          evidenceBudget: small,
          evidence: [
            { ref: 'ev.a', content: 'a', decisionCritical: true },
            { ref: 'ev.b', content: 'b', decisionCritical: true },
            { ref: 'ev.c', content: 'c', decisionCritical: true },
          ],
        },
        { compiledAt: NOW, sources: SOURCES },
      ),
    (err) => err instanceof SolAskError && err.code === 'BUDGET_EXHAUSTED',
  );
});

test('a compiled ask whose evidence outgrows its budget is invalid (fail closed on tampering)', () => {
  const fixture = readSolFixture('valid-ask-contract-check.json');
  const tampered = {
    ...fixture,
    // 3 x 2000 multibyte chars ~ 18 KB: schema-valid (maxLength 2000) but
    // far beyond the 8192-byte budget
    evidence: [
      ...fixture.evidence,
      { ref: 'ev.smuggled.a', content: '你'.repeat(2000) },
      { ref: 'ev.smuggled.b', content: '你'.repeat(2000) },
      { ref: 'ev.smuggled.c', content: '你'.repeat(2000) },
    ],
  };
  const result = validateSolAsk(tampered);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === 'EVIDENCE_BUDGET_EXCEEDED'));
});

test('truncation marker rules: last item only, TRUNCATE_SUMMARIZE only', () => {
  const fixture = readSolFixture('valid-ask-contract-check.json');
  const marker = {
    ref: TRUNCATION_MARKER_REF,
    kind: 'other',
    content: 'truncated: kept 0 of 0 evidence items (0 of 0 bytes)',
  };
  // marker not last
  const notLast = {
    ...fixture,
    evidence: [marker, { ref: 'ev.after', content: 'x' }],
    evidenceBudget: { ...fixture.evidenceBudget, onOverflow: 'TRUNCATE_SUMMARIZE' },
  };
  const notLastResult = validateSolAsk(notLast);
  assert.equal(notLastResult.valid, false);
  assert.ok(notLastResult.errors.some((e) => e.code === 'INVALID_TRUNCATION_MARKER'));
  // marker under FAIL_CLOSED
  const failClosed = { ...fixture, evidence: [marker] };
  const failClosedResult = validateSolAsk(failClosed);
  assert.equal(failClosedResult.valid, false);
  assert.ok(failClosedResult.errors.some((e) => e.code === 'INVALID_TRUNCATION_MARKER'));
});

test('malformed budgets fail closed', () => {
  assert.throws(() => applyEvidenceBudget([], { maxItems: 0, maxBytes: 10, onOverflow: 'FAIL_CLOSED' }), ConfigError);
  assert.throws(() => applyEvidenceBudget([], { maxItems: 1.5, maxBytes: 10, onOverflow: 'FAIL_CLOSED' }), ConfigError);
  assert.throws(() => applyEvidenceBudget([], { maxItems: 1, maxBytes: 10, onOverflow: 'SHRINK' }), ConfigError);
});
