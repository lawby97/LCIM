/**
 * SOL-S06-005 regression: RENDER MUST NEVER SLICE THE DECISION CONTRACT.
 *
 * renderSolAsk() is all-or-nothing: a valid compiled decision contract is
 * never substring/sliced. If the COMPLETE rendered ask exceeds the
 * supported hard rendered-packet limit (SOL_RENDER_MAX_BYTES), rendering
 * fails closed with a structured Sprint-06 error (RENDER_LIMIT_EXCEEDED).
 * Evidence summarization remains governed only by the explicit
 * evidence-budget contract.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSolAsk } from '../../src/sol/ask-compiler/compiler.mjs';
import { renderSolAsk, SOL_RENDER_MAX_BYTES } from '../../src/sol/ask-compiler/render.mjs';
import { SolAskError } from '../../src/sol/contracts/errors.mjs';
import { compileProviderContract, NOW } from './helpers.mjs';

const SOURCE = compileProviderContract();
const SOURCES = [SOURCE];

function baseAsk(overrides = {}) {
  return {
    callType: 'SOL_CONTRACT_CHECK',
    singleDecisionQuestion: 'Is the exact field-name casing of the approval decision contract sufficiently specified?',
    whyNeeded: 'render regression',
    contractRefs: [{ contractKey: SOURCE.contractKey, semanticDigest: SOURCE.semanticDigest }],
    establishedFacts: [],
    evidence: [{ ref: 'ev.1', content: 'x', decisionCritical: true }],
    passCondition: 'exact semantics are complete and unambiguous',
    failCondition: 'any authoritative field name/casing is under-specified',
    allowedScope: ['exact semantics of the referenced contract only'],
    outOfScope: ['implementation', 'code edits', 'general review'],
    contractCheck: { amendmentsOnly: true, expectedVerdicts: ['SUFFICIENTLY_SPECIFIED', 'AMENDMENTS_REQUIRED'] },
    ...overrides,
  };
}

test('a large-but-valid ask renders IN FULL (would have been sliced at the old 12k cut)', () => {
  // ~20 KB of evidence within a declared 24 KB budget: schema-valid,
  // budget-valid, and far beyond the old 12 000-char slice.
  const evidence = Array.from({ length: 10 }, (_, i) => ({
    ref: `ev.big.${i}`,
    content: '你'.repeat(500), // 1500 bytes each
  }));
  const ask = compileSolAsk(
    baseAsk({
      evidence,
      evidenceBudget: { maxItems: 16, maxBytes: 24000, onOverflow: 'FAIL_CLOSED' },
    }),
    { compiledAt: NOW, sources: SOURCES },
  );
  const rendered = renderSolAsk(ask);
  assert.ok(Buffer.byteLength(rendered, 'utf8') > 12000, 'render exceeds the old 12k slice point');
  // the full decision contract is present: question, pass/fail, scope,
  // response shape, and ALL retained evidence
  assert.ok(rendered.includes(ask.singleDecisionQuestion));
  assert.ok(rendered.includes(ask.passCondition));
  assert.ok(rendered.includes(ask.failCondition));
  assert.ok(rendered.includes(ask.allowedScope[0]));
  assert.ok(rendered.includes('verdicts=[SUFFICIENTLY_SPECIFIED, AMENDMENTS_REQUIRED]'));
  for (const item of evidence) {
    assert.ok(rendered.includes(`[${item.ref}]`), item.ref);
  }
  // never partially truncated: no slice marker, complete tail present
  assert.ok(!rendered.includes('... [truncated'));
  assert.ok(rendered.includes('maxItems=16; maxBytes=24000; onOverflow=FAIL_CLOSED'));
});

test('a valid ask whose COMPLETE render exceeds the hard limit fails closed (never slices)', () => {
  const evidence = Array.from({ length: 16 }, (_, i) => ({
    ref: `ev.huge.${i}`,
    content: '你'.repeat(2000), // 6000 bytes each => ~96 KB pool
  }));
  const ask = compileSolAsk(
    baseAsk({
      evidence,
      evidenceBudget: { maxItems: 16, maxBytes: 100000, onOverflow: 'FAIL_CLOSED' },
    }),
    { compiledAt: NOW, sources: SOURCES },
  );
  // the retained evidence universe alone (~96 KB) exceeds the rendered-packet
  // limit, so the complete render cannot fit: fail closed, never slice.
  assert.ok(evidenceByteLengthOf(ask) > SOL_RENDER_MAX_BYTES);
  assert.throws(
    () => renderSolAsk(ask),
    (err) => err instanceof SolAskError && err.code === 'RENDER_LIMIT_EXCEEDED',
  );
});

test('rendering is deterministic and never returns a partial prompt', () => {
  const ask = compileSolAsk(baseAsk(), { compiledAt: NOW, sources: SOURCES });
  const first = renderSolAsk(ask);
  assert.equal(renderSolAsk(ask), first);
  assert.ok(!first.includes('{{'));
  assert.ok(!first.includes('truncated:'));
});

/** Byte cost of the retained evidence universe (deterministic accounting). */
function evidenceByteLengthOf(ask) {
  return ask.evidence.reduce(
    (sum, item) => sum + Buffer.byteLength(item.ref, 'utf8') + Buffer.byteLength(item.content, 'utf8') + 32,
    0,
  );
}
