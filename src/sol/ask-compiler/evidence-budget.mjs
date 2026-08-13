/**
 * LCIM V2 SOL evidence budget application (Sprint 06).
 *
 * Applies the evidence budget to an evidence list at compile time,
 * deterministically:
 *
 * - fits => returned unchanged;
 * - FAIL_CLOSED overflow => SolAskError BUDGET_EXHAUSTED (oversized
 *   ambiguous packets are rejected, never silently broadened);
 * - TRUNCATE_SUMMARIZE overflow => keep items in authored order within
 *   the budget RESERVING the marker slot from the start; evidence that is
 *   `decisionCritical` OR referenced by a decision-bearing rule
 *   (`protectedRefs` — pass/fail refs, prior/delta evidence refs,
 *   failure/finding/adjacent evidence refs) is NEVER dropped — if
 *   required decision evidence cannot fit, fail closed even under
 *   TRUNCATE_SUMMARIZE (SOL-S06-004); append exactly one truncation
 *   marker (`lcim.budget.truncation-marker`) as the LAST item, which is
 *   itself counted against the budget (a truncation that cannot be
 *   recorded also fails closed).
 *
 * The truncation marker is NOT substantive evidence: it belongs to no
 * resolvable ordinary evidence-ref set and may never satisfy an evidence
 * reference (enforced in validate.mjs).
 *
 * The same application is used for asks (their own budget) and responses
 * (the ask's budget). See src/sol/contracts/evidence.mjs for the
 * deterministic byte accounting.
 */

import { SolAskError } from '../contracts/errors.mjs';
import {
  assertEvidenceBudget,
  evidenceByteLength,
  TRUNCATION_MARKER_REF,
  TRUNCATION_MARKER_KIND,
  TRUNCATION_MARKER_BYTES,
  EVIDENCE_ITEM_OVERHEAD_BYTES,
} from '../contracts/evidence.mjs';
import { deepCloneJson } from '../../contracts/deep-freeze.mjs';

/**
 * Apply the evidence budget to an evidence list.
 * @param {Array<{ref: string, content: string, decisionCritical?: boolean, kind?: string}>} evidence
 * @param {{maxItems: number, maxBytes: number, onOverflow: 'FAIL_CLOSED'|'TRUNCATE_SUMMARIZE'}} budget
 * @param {{ protectedRefs?: Set<string>|string[] }} [opts] - evidence refs
 *   referenced by decision-bearing rules; protected evidence is never
 *   truncated (fail closed when it cannot fit).
 * @returns {{evidence: Array, truncated: boolean, summary: object|null}} cloned,
 *   budget-fitted evidence (marker appended when truncated)
 * @throws {SolAskError} BUDGET_EXHAUSTED when the budget cannot hold the
 *   required decision evidence
 */
export function applyEvidenceBudget(evidence, budget, opts = {}) {
  assertEvidenceBudget(budget);
  const items = Array.isArray(evidence) ? deepCloneJson(evidence) : [];
  const protectedRefs = new Set(opts.protectedRefs ?? []);
  const measured = evidenceByteLength(items);

  if (measured.items <= budget.maxItems && measured.bytes <= budget.maxBytes) {
    return { evidence: items, truncated: false, summary: null };
  }

  if (budget.onOverflow === 'FAIL_CLOSED') {
    throw new SolAskError(
      `evidence (${measured.items} items, ${measured.bytes} bytes) exceeds the budget (${budget.maxItems} items, ${budget.maxBytes} bytes) and onOverflow is FAIL_CLOSED; oversized ambiguous packets are rejected, never silently broadened`,
      'BUDGET_EXHAUSTED',
      { budget, actual: { items: measured.items, bytes: measured.bytes } },
    );
  }

  // TRUNCATE_SUMMARIZE: the truncation marker is itself counted against
  // the budget, so the item/byte budget for real evidence is reduced by
  // the marker reservation up front.
  const itemBudget = {
    maxItems: budget.maxItems - 1,
    maxBytes: budget.maxBytes - TRUNCATION_MARKER_BYTES,
  };
  if (itemBudget.maxItems < 1 || itemBudget.maxBytes < 1) {
    throw new SolAskError(
      `evidence budget (${budget.maxItems} items, ${budget.maxBytes} bytes) cannot hold the truncation marker plus at least one evidence item; fail closed rather than silently broadening the packet`,
      'BUDGET_EXHAUSTED',
      { budget },
    );
  }

  const kept = [];
  let keptBytes = 0;
  let dropped = 0;
  for (const item of items) {
    const size = evidenceItemBytes(item);
    const fits = kept.length + 1 <= itemBudget.maxItems && keptBytes + size <= itemBudget.maxBytes;
    if (fits) {
      kept.push(item);
      keptBytes += size;
    } else {
      if (item.decisionCritical === true || protectedRefs.has(item.ref)) {
        throw new SolAskError(
          `required decision evidence '${item.ref}' cannot fit within the budget (${budget.maxItems} items, ${budget.maxBytes} bytes) even under TRUNCATE_SUMMARIZE; decision-critical and decision-referenced evidence is never dropped — fail closed instead of broadening the packet`,
          'BUDGET_EXHAUSTED',
          { budget, evidenceRef: item.ref },
        );
      }
      dropped += 1;
    }
  }

  const marker = {
    ref: TRUNCATION_MARKER_REF,
    kind: TRUNCATION_MARKER_KIND,
    content: `truncated: kept ${kept.length} of ${items.length} evidence items (${keptBytes} of ${measured.bytes} bytes); dropped items were non-decision-critical and are summarized, never broadened`,
  };
  const totalBytes = keptBytes + TRUNCATION_MARKER_BYTES;
  if (kept.length + 1 > budget.maxItems || totalBytes > budget.maxBytes) {
    throw new SolAskError(
      `evidence budget (${budget.maxItems} items, ${budget.maxBytes} bytes) cannot even record the truncation marker; fail closed rather than silently broadening the packet`,
      'BUDGET_EXHAUSTED',
      { budget, actual: { items: kept.length + 1, bytes: totalBytes } },
    );
  }

  const fitted = [...kept, marker];
  return {
    evidence: fitted,
    truncated: true,
    summary: {
      kept: kept.length,
      total: items.length,
      dropped,
      keptBytes,
      totalBytes: measured.bytes,
      markerRef: TRUNCATION_MARKER_REF,
    },
  };
}

/** Deterministic byte cost of one evidence item (ref + content + overhead). */
function evidenceItemBytes(item) {
  return (
    Buffer.byteLength(item?.ref ?? '', 'utf8') +
    Buffer.byteLength(item?.content ?? '', 'utf8') +
    EVIDENCE_ITEM_OVERHEAD_BYTES
  );
}
