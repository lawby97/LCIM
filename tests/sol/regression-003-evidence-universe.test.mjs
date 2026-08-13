/**
 * SOL-S06-003 regression: ONE TOTAL EVIDENCE BUDGET.
 *
 * Call-specific decision evidence (RECHECK deltaEvidence, DIAGNOSE
 * priorEvidence) is normalized into the ask's ONE closed retained
 * evidence universe (the top-level `evidence` pool) and counted against
 * the SAME evidence budget; it is retained or the ask fails closed. For
 * every successful compiled ask the measured retained evidence stays
 * within the declared budget, and the rendered prompt shows the pool
 * exactly once.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSolAsk } from '../../src/sol/ask-compiler/compiler.mjs';
import { renderSolAsk } from '../../src/sol/ask-compiler/render.mjs';
import { validateSolAsk } from '../../src/sol/contracts/validate.mjs';
import { SolAskError } from '../../src/sol/contracts/errors.mjs';
import { evidenceByteLength } from '../../src/sol/contracts/evidence.mjs';
import {
  compileProviderContract,
  buildPriorFinalReview,
  buildDiagnoseAsk,
  providerFactoryEffectId,
  networkEffectId,
  PRIOR_FINDING_ID,
  NOW,
} from './helpers.mjs';

const SOURCE = compileProviderContract();
const SOURCES = [SOURCE];

function hasCode(err, code) {
  return err?.code === code || (err?.details?.errors ?? []).some((e) => e.code === code);
}

test('RECHECK: top-level evidence empty, tiny budget, 1000-byte delta evidence => BUDGET_EXHAUSTED', () => {
  const prior = buildPriorFinalReview();
  const input = {
    callType: 'SOL_RECHECK',
    singleDecisionQuestion: 'Is the prior provider_factory finding resolved by the delta evidence?',
    whyNeeded: 'delta budget regression',
    contractRefs: [
      { contractKey: SOURCE.contractKey, semanticDigest: SOURCE.semanticDigest },
    ],
    // neighbors are declared requirement refs of this ask
    establishedFacts: [],
    evidence: [],
    passCondition: 'delta evidence closes the prior finding',
    failCondition: 'the prior finding still fails on the delta evidence',
    allowedScope: ['the prior finding and its named neighbors only'],
    outOfScope: ['reopening the task', 'edits'],
    evidenceBudget: { maxItems: 1, maxBytes: 1, onOverflow: 'FAIL_CLOSED' },
    recheck: {
      priorFindingRef: PRIOR_FINDING_ID,
      deltaEvidence: [{ ref: 'ev.delta', content: 'z'.repeat(1000) }],
      neighboringInvariants: [networkEffectId(SOURCE)],
      mustNotReopen: true,
    },
  };
  assert.throws(
    () => compileSolAsk(input, { compiledAt: NOW, sources: SOURCES, prior }),
    (err) => err instanceof SolAskError && err.code === 'BUDGET_EXHAUSTED',
  );
});

test('DIAGNOSE: oversized priorEvidence => BUDGET_EXHAUSTED (single budget covers it)', () => {
  assert.throws(
    () =>
      buildDiagnoseAsk({
        priorEvidence: [{ ref: 'ev.prior.big', content: 'z'.repeat(1000) }],
        evidenceBudget: { maxItems: 1, maxBytes: 64, onOverflow: 'FAIL_CLOSED' },
      }),
    (err) => err instanceof SolAskError && err.code === 'BUDGET_EXHAUSTED',
  );
});

test('DIAGNOSE: prior evidence is normalized into the ONE pool and counted', () => {
  const { ask } = buildDiagnoseAsk({
    priorEvidence: [{ ref: 'ev.prior.run', content: 'prior acceptance run failed the same criterion' }],
    evidenceBudget: { maxItems: 3, maxBytes: 2048, onOverflow: 'FAIL_CLOSED' },
  });
  const pool = ask.evidence.map((e) => e.ref).sort();
  assert.deepEqual(pool, ['ev.counter.provider_factory', 'ev.prior.run']);
  assert.deepEqual(ask.diagnose.priorEvidenceRefs, ['ev.prior.run']);
  // the pool fits the declared budget
  const measured = evidenceByteLength(ask.evidence);
  assert.ok(measured.items <= ask.evidenceBudget.maxItems);
  assert.ok(measured.bytes <= ask.evidenceBudget.maxBytes);
  assert.equal(validateSolAsk(ask, { sources: SOURCES }).valid, true);
});

test('for every successful compiled ask, retained evidence stays within the declared budget', () => {
  const { ask } = buildDiagnoseAsk({
    evidenceBudget: { maxItems: 2, maxBytes: 2048, onOverflow: 'TRUNCATE_SUMMARIZE' },
    evidence: [
      { ref: 'ev.counter.provider_factory', kind: 'test_result', content: 'counter reported 1', decisionCritical: true },
    ],
  });
  const measured = evidenceByteLength(ask.evidence);
  assert.ok(measured.items <= ask.evidenceBudget.maxItems, 'items within budget');
  assert.ok(measured.bytes <= ask.evidenceBudget.maxBytes, 'bytes within budget');
});

test('evidence is rendered exactly once, in full, from the single pool', () => {
  const { ask } = buildDiagnoseAsk({
    priorEvidence: [{ ref: 'ev.prior.run', content: 'prior acceptance run failed the same criterion' }],
  });
  const rendered = renderSolAsk(ask);
  for (const item of ask.evidence) {
    const needle = `[${item.ref}]`;
    const occurrences = rendered.split(needle).length - 1;
    assert.equal(occurrences, 1, `evidence '${item.ref}' must render exactly once`);
    assert.ok(rendered.includes(item.content), `evidence '${item.ref}' content must render in full`);
  }
});

test('no evidence may be silently omitted from rendering (truncation is budget-governed only)', () => {
  const { ask } = buildDiagnoseAsk({
    evidenceBudget: { maxItems: 2, maxBytes: 512, onOverflow: 'TRUNCATE_SUMMARIZE' },
    evidence: [
      { ref: 'ev.counter.provider_factory', kind: 'test_result', content: 'counter reported 1', decisionCritical: true },
      { ref: 'ev.extra', content: 'non-critical extra observation' },
    ],
  });
  const rendered = renderSolAsk(ask);
  // every retained pool item (including the marker) is rendered; nothing is sliced
  for (const item of ask.evidence) {
    assert.ok(rendered.includes(`[${item.ref}]`), item.ref);
  }
});
