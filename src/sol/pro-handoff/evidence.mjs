/** Bounded text-evidence guards for the manual SOL Pro boundary. */

import { ProHandoffError } from './errors.mjs';

export const MAX_PRO_EVIDENCE_EXCERPT_CHARACTERS = 1_600;
export const MAX_PRO_EVIDENCE_LINES = 40;
export const MAX_PRO_EVIDENCE_ITEMS = 8;
export const MAX_PRO_LOG_SUMMARY_LINES = 12;
export const MAX_PRO_DIFF_HUNKS = 2;

const FILE_REFERENCE = /(?:\bfile:\/{2,3}\S+|@[A-Za-z0-9._-]+\.(?:log|json|jsonl|zip|patch|diff|txt|md)\b)/i;
const BARE_ARTIFACT_PATH = /(?:^|\s)(?:\.?\.?\/)?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\.(?:log|json|jsonl|zip|patch|diff)(?=$|\s|[,:;)\]])/i;
const RAW_PACKET = /(?:^|[\s,{])"schemaName"\s*:\s*"lcim\./i;
const TRANSCRIPT_LABEL = /^\s*(?:user|assistant|system|developer)\s*:/gim;
const LOG_LINE = /^\s*(?:\d{4}-\d{2}-\d{2}[T ]|\[[A-Z][A-Z0-9_. -]{1,30}\])/;
const PATH_LIST_LINE = /^\s*(?:(?:[A-Za-z0-9._-]+\/){2,}[A-Za-z0-9._-]+)/gm;

function fail(message, code) {
  throw new ProHandoffError(message, code);
}

function evidenceItems(askInput) {
  const items = [];
  if (Array.isArray(askInput?.evidence)) items.push(...askInput.evidence);
  if (Array.isArray(askInput?.diagnose?.priorEvidence)) items.push(...askInput.diagnose.priorEvidence);
  if (Array.isArray(askInput?.recheck?.deltaEvidence)) items.push(...askInput.recheck.deltaEvidence);
  return items;
}

function looksLikeRawJsonPacket(content) {
  const trimmed = content.trim();
  if (!/^(?:\{|\[)/.test(trimmed)) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return RAW_PACKET.test(trimmed);
  }
}

function reject(message, code) {
  fail(`SOL Pro copy refused before clipboard write: ${message}`, code);
}

/**
 * ONE centralized outbound-excerpt safety policy. Every string that can
 * reach the online/clipboard text — evidence items AND supplemental context
 * fields — passes through this same fail-closed policy.
 * @param {string} content - the bounded excerpt under test
 * @param {{ kind?: string }} [opts]
 * @throws {ProHandoffError} on prohibited/oversized content
 */
export function assertProExcerptSafe(content, { kind } = {}) {
  if (typeof content !== 'string') {
    reject('local text must be a bounded excerpt.', 'PRO_EVIDENCE_INVALID');
  }
  const lines = content.split('\n');
  if (FILE_REFERENCE.test(content) || BARE_ARTIFACT_PATH.test(content)) {
    reject('replace a local file reference with its minimal text excerpt before retrying.', 'PRO_EVIDENCE_FILE_REFERENCE');
  }
  if (RAW_PACKET.test(content) || looksLikeRawJsonPacket(content)) {
    reject('replace a raw local packet with the minimum decision-relevant excerpt before retrying.', 'PRO_EVIDENCE_RAW_PACKET');
  }
  if ((content.match(TRANSCRIPT_LABEL) ?? []).length >= 2 || /\b(?:full|raw)\s+transcript\b/i.test(content)) {
    reject('replace a transcript with one minimal failure or test excerpt before retrying.', 'PRO_EVIDENCE_TRANSCRIPT');
  }
  if (content.length > MAX_PRO_EVIDENCE_EXCERPT_CHARACTERS || lines.length > MAX_PRO_EVIDENCE_LINES) {
    reject('reduce the local text to a minimal excerpt before retrying.', 'PRO_EVIDENCE_OVERSIZED');
  }
  const diffHeaders = (content.match(/^diff --git /gm) ?? []).length;
  const diffHunks = (content.match(/^@@ /gm) ?? []).length;
  if (diffHeaders > 1 || (diffHeaders === 1 && diffHunks > MAX_PRO_DIFF_HUNKS)) {
    reject('reduce the local diff to one minimal decision-relevant excerpt before retrying.', 'PRO_EVIDENCE_FULL_DIFF');
  }
  const logLines = lines.filter((line) => LOG_LINE.test(line)).length;
  if ((kind === 'log_summary' && lines.length > MAX_PRO_LOG_SUMMARY_LINES) || logLines > MAX_PRO_LOG_SUMMARY_LINES) {
    reject('replace a full log with a minimal failure or test summary before retrying.', 'PRO_EVIDENCE_FULL_LOG');
  }
  if ((content.match(PATH_LIST_LINE) ?? []).length > MAX_PRO_LOG_SUMMARY_LINES) {
    reject('replace a repository file listing with one minimal code excerpt before retrying.', 'PRO_EVIDENCE_REPOSITORY_DUMP');
  }
  return true;
}

/**
 * Supplemental context fields (task / previousAttempt / controllerRejection)
 * must satisfy the SAME outbound safety policy as evidence, because they are
 * rendered into the clipboard payload.
 */
export function assertProContextSafe(context) {
  if (context === null || typeof context !== 'object' || Array.isArray(context)) return true;
  for (const key of ['task', 'previousAttempt', 'controllerRejection']) {
    const value = context[key];
    if (typeof value === 'string' && value.length > 0) {
      assertProExcerptSafe(value);
    }
  }
  return true;
}

/**
 * Ensure an operator supplied text excerpts rather than a local artifact or
 * unbounded dump. The Sprint-06 compiler separately owns evidence semantics
 * and its full byte budget; this boundary only narrows what may be copied.
 */
export function assertProEvidenceIsTextual(askInput) {
  const items = evidenceItems(askInput);
  if (items.length > MAX_PRO_EVIDENCE_ITEMS) {
    reject('reduce local evidence to no more than eight decision-relevant excerpts before retrying.', 'PRO_EVIDENCE_REPOSITORY_DUMP');
  }
  for (const item of items) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      reject('local evidence must be a bounded text excerpt.', 'PRO_EVIDENCE_INVALID');
    }
    if (typeof item.content !== 'string') {
      reject('local evidence must be a bounded text excerpt.', 'PRO_EVIDENCE_INVALID');
    }
    assertProExcerptSafe(item.content, { kind: item.kind });
  }
  return true;
}

/** A recheck must never carry an old evidence pool outside its declared delta. */
export function assertDeltaOnlyInput(askInput) {
  if (askInput?.callType !== 'SOL_RECHECK') {
    fail('SOL Pro follow-up must use the bounded SOL_RECHECK decision contract.', 'PRO_FOLLOW_UP_INVALID');
  }
  if (Array.isArray(askInput?.evidence) && askInput.evidence.length > 0) {
    fail('SOL Pro follow-up refused: retain only new or changed delta evidence locally.', 'PRO_FOLLOW_UP_NOT_DELTA');
  }
  if (!Array.isArray(askInput?.recheck?.deltaEvidence) || askInput.recheck.deltaEvidence.length === 0) {
    fail('SOL Pro follow-up refused: provide at least one new or changed delta evidence excerpt locally.', 'PRO_FOLLOW_UP_NOT_DELTA');
  }
  assertProEvidenceIsTextual(askInput);
  return true;
}
