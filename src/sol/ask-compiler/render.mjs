/**
 * LCIM V2 SOL ask renderer (Sprint 06).
 *
 * Renders a compiled `lcim.sol-ask` document into the bounded, promptable
 * text SOL actually receives, using the sprint-owned templates under
 * `prompts/sol/<call-type>.md` (one template per call type). Rendering is
 * deterministic: the same compiled ask always renders to the same text.
 * The render is public-safe — only the compiled ask's own fields appear,
 * never credentials, transcripts, or business-repository excerpts.
 *
 * RENDERING IS ALL-OR-NOTHING (SOL-S06-005): a valid compiled decision
 * contract is never substring/sliced. If the complete rendered ask
 * exceeds the supported hard rendered-packet limit
 * (`SOL_RENDER_MAX_BYTES`), rendering FAILS CLOSED with a structured
 * SolAskError (RENDER_LIMIT_EXCEEDED) instead of returning a partially
 * truncated prompt. No authority-bearing contract field is ever silently
 * summarized; evidence summarization is governed only by the explicit
 * evidence-budget contract (the ask's evidence universe is rendered
 * exactly once, in full).
 *
 * Transport (actually sending the text to ChatGPT SOL Pro) is Sprint 07's
 * territory; this renderer only proves a compiled ask is complete and
 * promptable.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError } from '../../shared/errors.mjs';
import { SolAskError } from '../contracts/errors.mjs';
import { solTypeBlockFor } from '../contracts/call-types.mjs';

/**
 * Hard cap on the COMPLETE rendered ask packet. A valid compiled ask whose
 * full render exceeds this limit fails closed (RENDER_LIMIT_EXCEEDED) —
 * rendering never slices the decision contract.
 */
export const SOL_RENDER_MAX_BYTES = 32768;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = path.resolve(HERE, '../../../prompts/sol');

const TEMPLATE_FILES = Object.freeze({
  SOL_CONTRACT_CHECK: 'contract-check.md',
  SOL_DIAGNOSE: 'diagnose.md',
  SOL_FINAL_REVIEW: 'final-review.md',
  SOL_RECHECK: 'recheck.md',
});

const templateCache = new Map();

/** @param {string} callType */
function loadTemplate(callType) {
  if (templateCache.has(callType)) return templateCache.get(callType);
  const file = path.join(TEMPLATE_DIR, TEMPLATE_FILES[callType]);
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    throw new ConfigError(`cannot load SOL ask template for '${callType}' from ${file}: ${err.message}`);
  }
  templateCache.set(callType, text);
  return text;
}

function renderContractRefs(refs) {
  const buf = [];
  for (const ref of refs ?? []) {
    const parts = [`- ${ref.contractKey}`];
    if (ref.semanticDigest) parts.push(`digest=${ref.semanticDigest}`);
    if (ref.requirementRefs?.length) parts.push(`requirements=[${ref.requirementRefs.join(', ')}]`);
    buf.push(parts.join('  '));
  }
  return buf.join('\n');
}

/** The ONE evidence universe is rendered exactly once, in full. */
function renderEvidence(items) {
  const buf = [];
  for (const item of items ?? []) {
    const parts = [
      `- [${item.ref}]${item.kind ? ` ${item.kind}` : ''}: ${item.content}`,
    ];
    if (item.decisionCritical === true) parts.push('(DECISION-CRITICAL)');
    buf.push(parts.join(' '));
  }
  return buf.join('\n');
}

function renderFacts(facts) {
  return (facts ?? []).map((f) => `- ${f.fact} (evidence: ${f.evidence})`).join('\n');
}

/** Build the deterministic token map for a compiled ask. */
function buildTokens(ask) {
  const block = ask[solTypeBlockFor(ask.callType)];
  return {
    CALL_TYPE: ask.callType,
    ASK_ID: ask.askId,
    SINGLE_DECISION_QUESTION: ask.singleDecisionQuestion,
    WHY_NEEDED: ask.whyNeeded,
    CONTRACT_REFS: renderContractRefs(ask.contractRefs),
    ESTABLISHED_FACTS: renderFacts(ask.establishedFacts),
    EVIDENCE: renderEvidence(ask.evidence),
    PASS_CONDITION: ask.passCondition,
    FAIL_CONDITION: ask.failCondition,
    PASS_EVIDENCE_REFS: (ask.passEvidenceRefs ?? []).join(', '),
    FAIL_EVIDENCE_REFS: (ask.failEvidenceRefs ?? []).join(', '),
    ALLOWED_SCOPE: (ask.allowedScope ?? []).join(', '),
    OUT_OF_SCOPE: (ask.outOfScope ?? []).join(', '),
    RESPONSE_SHAPE: `verdicts=[${ask.requiredResponseShape.verdicts.join(', ')}]; fields=[${ask.requiredResponseShape.fields.join(', ')}]`,
    REPAIR_CONSTRAINTS: `maxMustChangeTargets=${ask.repairConstraints.maxMustChangeTargets}; mustNotChangeRequired=${ask.repairConstraints.mustNotChangeRequired}; boundedToRejectedAcceptance=${ask.repairConstraints.boundedToRejectedAcceptance}`,
    EVIDENCE_BUDGET: `maxItems=${ask.evidenceBudget.maxItems}; maxBytes=${ask.evidenceBudget.maxBytes}; onOverflow=${ask.evidenceBudget.onOverflow}`,
    // per-type block values
    CRITERION_REF: block?.acceptanceCriterionRef ?? '',
    CRITERION_REQUIREMENT: block?.criterionRequirement ?? '',
    PRIOR_EVIDENCE_REFS: (block?.priorEvidenceRefs ?? []).join(', '),
    PRIOR_FINDING_REF: block?.priorFindingRef ?? '',
    PRIOR_ASK_ID: block?.priorAskId ?? '',
    PRIOR_RESPONSE_ID: block?.priorResponseId ?? '',
    PRIOR_FINDING_DIGEST: block?.priorFindingDigest ?? '',
    DELTA_EVIDENCE_REFS: (block?.deltaEvidenceRefs ?? []).join(', '),
    NEIGHBORING_INVARIANTS: (block?.neighboringInvariants ?? []).join(', '),
    INVARIANT_CHECKLIST: (block?.invariantChecklist ?? [])
      .map((inv) => `- ${inv.invariantId}: ${inv.invariant} (locked: ${inv.lockedRequirementRef})`)
      .join('\n'),
    MAX_ADJACENT_CRITICAL: String(block?.maxAdjacentCriticalDefects ?? ''),
  };
}

/**
 * Render a compiled SOL ask as bounded, deterministic prompt text.
 * All-or-nothing: never returns a partially truncated prompt.
 * @param {object} ask - validated lcim.sol-ask document
 * @returns {string} the COMPLETE rendered decision contract
 * @throws {SolAskError} RENDER_LIMIT_EXCEEDED when the complete render
 *   exceeds SOL_RENDER_MAX_BYTES (fail closed, never slice)
 */
export function renderSolAsk(ask) {
  if (ask === null || typeof ask !== 'object' || typeof ask.callType !== 'string') {
    throw new ConfigError('renderSolAsk requires a compiled lcim.sol-ask document');
  }
  let text = loadTemplate(ask.callType);
  const tokens = buildTokens(ask);
  for (const [key, value] of Object.entries(tokens)) {
    text = text.split(`{{${key}}}`).join(String(value));
  }

  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > SOL_RENDER_MAX_BYTES) {
    throw new SolAskError(
      `rendered SOL ask '${ask.askId}' requires ${bytes} bytes, exceeding the supported hard rendered-packet limit of ${SOL_RENDER_MAX_BYTES} bytes; rendering is all-or-nothing and never slices a valid compiled decision contract — enlarge the ask's bounded inputs or reduce the evidence universe`,
      'RENDER_LIMIT_EXCEEDED',
      { askId: ask.askId, renderedBytes: bytes, maxBytes: SOL_RENDER_MAX_BYTES },
    );
  }
  return text;
}
