/** Plain-text renderers for the manual SOL Pro clipboard boundary. */

import { renderSolAsk } from '../ask-compiler/render.mjs';
import { ProHandoffError } from './errors.mjs';

export const PRO_DIRECTIVE_START = 'LCIM_SOL_PRO_DIRECTIVE_V1';
export const PRO_DIRECTIVE_END = 'END_LCIM_SOL_PRO_DIRECTIVE_V1';

function line(label, value) {
  return `${label}: ${value}`;
}

export function contractBindingText(ask) {
  return [...(ask.contractRefs ?? [])]
    .map((ref) => `${ref.contractKey}@${ref.semanticDigest}`)
    .sort()
    .join(';');
}

function contextLines(context, fallbackTask) {
  const lines = [line('TASK', context.task ?? fallbackTask)];
  if (context.previousAttempt !== undefined) lines.push(line('PREVIOUS_ATTEMPT', context.previousAttempt));
  if (context.controllerRejection !== undefined) lines.push(line('CONTROLLER_REJECTION', context.controllerRejection));
  return lines;
}

function directiveHeader(record, exchange, ask) {
  return [
    line('ESCALATION_ID', record.escalationId),
    line('RESPONSE_BINDING_ID', exchange.responseBindingId),
    line('FINDING_ID', record.findingId),
    line('ASK_ID', ask.askId),
    line('CONTRACT_BINDINGS', contractBindingText(ask)),
    line('CALL_TYPE', ask.callType),
  ];
}

/** The exact line-oriented response grammar. It intentionally carries no packet syntax. */
export function renderDirectiveInstructions(record, exchange, ask) {
  const common = [
    '',
    'Return only this plain-text directive. Keep every value on one line. Do not add prose before or after it.',
    'Use the exact identifiers shown below. A local parser will reject any different identifier or malformed field.',
    PRO_DIRECTIVE_START,
    ...directiveHeader(record, exchange, ask),
    'VERDICT: [one allowed verdict]',
    'DECISION_SUMMARY: [one bounded decision summary]',
  ];

  switch (ask.callType) {
    case 'SOL_DIAGNOSE':
      common.push(
        'For CAUSE_IDENTIFIED include each field below; for CAUSE_UNRESOLVED include none of them.',
        'FINDING: CRITICAL|[one-line finding summary]|[comma-separated bounded evidence refs]',
        'ROOT_CAUSE: [one bounded root cause]',
        'FAILURE_EVIDENCE_REFS: [comma-separated bounded evidence refs]',
        'MUST_CHANGE: [one smallest safe implementation change]',
        'MUST_NOT_CHANGE: [target]|[reason]',
        'EXACT_TEST: [test name]|[command or -]',
        'VERIFY: [method]|[expectation]',
        'FALSIFICATION: [what would disprove the root cause]',
      );
      break;
    case 'SOL_CONTRACT_CHECK':
      common.push(
        'For AMENDMENTS_REQUIRED include one or more AMENDMENT lines; for SUFFICIENTLY_SPECIFIED include none.',
        'AMENDMENT: [contract key]|[target]|[current text]|[exact replacement]|[reason]',
      );
      break;
    case 'SOL_FINAL_REVIEW':
      common.push(
        'For FAIL include one FINDING line; for PASS include none. An ADJACENT line is allowed only with FAIL.',
        'FINDING: [INFO|WARNING|CRITICAL]|[locked invariant ref]|[one-line summary]|[comma-separated bounded evidence refs]',
        'ADJACENT: [one-line summary]|[comma-separated bounded evidence refs]|[locked requirement ref]',
      );
      break;
    case 'SOL_RECHECK':
      common.push(
        'For NOT_RESOLVED include one FINDING line; for RESOLVED include none.',
        'FINDING: [INFO|WARNING|CRITICAL]|[prior finding or bound neighbor ref]|[one-line summary]|[comma-separated delta evidence refs]',
      );
      break;
    default:
      throw new ProHandoffError('cannot render an unknown SOL call type', 'PRO_RENDER_INVALID');
  }
  common.push(PRO_DIRECTIVE_END);
  return common.join('\n');
}

/** Initial clipboard text contains the complete Sprint-06 bounded ask once. */
export function renderInitialEscalation(record, exchange, ask) {
  const body = renderSolAsk(ask);
  return [
    'LCIM SOL Pro manual text escalation — initial exchange',
    'This is bounded plain text for a manual paste. It does not decide any controller disposition or execute a repair.',
    ...directiveHeader(record, exchange, ask),
    ...contextLines(record.context, ask.whyNeeded),
    '',
    body,
    renderDirectiveInstructions(record, exchange, ask),
  ].join('\n');
}

/**
 * Follow-up clipboard text is DELTA ONLY. It deliberately does not call the
 * full Sprint-06 renderer again, so no first-exchange evidence or transcript
 * can be copied a second time.
 */
export function renderDeltaFollowUp(record, exchange, ask) {
  const delta = ask.evidence ?? [];
  if (ask.callType !== 'SOL_RECHECK') {
    throw new ProHandoffError('a manual SOL Pro follow-up must be a SOL_RECHECK ask', 'PRO_FOLLOW_UP_INVALID');
  }
  const evidenceLines = delta.map((item) => `- [${item.ref}]${item.kind ? ` ${item.kind}` : ''}: ${item.content}`);
  return [
    'LCIM SOL Pro manual text escalation — follow-up (DELTA ONLY)',
    'Use this in the same conversation when possible. Do not rely on prior chat state; the compact bindings below are authoritative for this exchange.',
    ...directiveHeader(record, exchange, ask),
    line('PRIOR_ASK_ID', ask.recheck.priorAskId),
    line('PRIOR_RESPONSE_ID', ask.recheck.priorResponseId),
    line('PRIOR_FINDING_DIGEST', ask.recheck.priorFindingDigest),
    // The follow-up task is DERIVED from the compiled RECHECK ask — no
    // caller-supplied free-form context is ever rendered (SOL-S07-003).
    line('TASK', ask.singleDecisionQuestion),
    '',
    'ONE PRIMARY DECISION QUESTION',
    ask.singleDecisionQuestion,
    '',
    'LOCKED MINIMAL CONTRACT CONTEXT',
    `- contract bindings: ${contractBindingText(ask)}`,
    `- prior finding: ${ask.recheck.priorFindingRef}`,
    `- neighboring locked requirements: ${ask.recheck.neighboringInvariants.join(', ')}`,
    `- pass condition: ${ask.passCondition}`,
    `- fail condition: ${ask.failCondition}`,
    '',
    'NEW OR CHANGED EVIDENCE ONLY',
    ...evidenceLines,
    '',
    `Allowed verdicts: ${ask.requiredResponseShape.verdicts.join(', ')}`,
    renderDirectiveInstructions(record, exchange, ask),
  ].join('\n');
}
