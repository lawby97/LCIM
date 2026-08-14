/**
 * Sprint-07 service: local evidence -> redacted bounded clipboard text ->
 * manually pasted directive -> existing Sprint-06 repair authority.
 */

import { ConfigError } from '../../shared/errors.mjs';
import { compileSolAsk } from '../ask-compiler/compiler.mjs';
import { compileSolResponse } from '../ask-compiler/response.mjs';
import { compileRepairTicket } from '../ask-compiler/repair-ticket.mjs';
import { validateSolAsk } from '../contracts/validate.mjs';
import { redactProText } from '../../redaction/pro-boundary.mjs';
import {
  assertDeltaOnlyInput,
  assertProContextSafe,
  assertProEvidenceIsTextual,
} from './evidence.mjs';
import { ProHandoffError, ProResponseError } from './errors.mjs';
import { parseProDirective } from './directive.mjs';
import { generateProResponseBindingId } from './ids.mjs';
import { MacosPbcopyAdapter } from './pbcopy.mjs';
import {
  contractBindingText,
  renderDeltaFollowUp,
  renderInitialEscalation,
} from './render.mjs';
import { normalizeFollowUpContext, ProEscalationStore } from './store.mjs';

/**
 * The Sprint-07 ABSOLUTE HARD MAXIMUM: exactly twelve thousand JavaScript
 * characters. It is not merely a default — no public option may exceed it
 * (SOL-S07-001).
 */
export const PRO_COPY_DEFAULT_MAX_CHARACTERS = 12_000;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertLimit(limit) {
  if (!Number.isInteger(limit) || limit < 1 || limit > PRO_COPY_DEFAULT_MAX_CHARACTERS) {
    throw new ConfigError(
      `SOL Pro clipboard character limit must be a positive integer no greater than the absolute maximum of ${PRO_COPY_DEFAULT_MAX_CHARACTERS} characters`,
    );
  }
}

function findExchange(record, sequence) {
  const selected = sequence ?? record.exchanges.at(-1)?.sequence;
  if (!Number.isInteger(selected) || selected < 1) {
    throw new ProHandoffError('local SOL Pro exchange selection is invalid', 'PRO_EXCHANGE_NOT_FOUND');
  }
  const exchange = record.exchanges.find((entry) => entry.sequence === selected);
  if (exchange === undefined) {
    throw new ProHandoffError('local SOL Pro exchange was not found', 'PRO_EXCHANGE_NOT_FOUND');
  }
  return exchange;
}

function priorFor(record, exchange) {
  if (exchange.kind === 'INITIAL') return undefined;
  const prior = record.exchanges.find((entry) => entry.sequence === exchange.sequence - 1);
  if (prior === undefined || prior.compiledAsk === null || prior.canonicalResponse === null) {
    throw new ProHandoffError(
      'SOL Pro follow-up refused: the prior local ask and parsed response must bind before a delta can be prepared.',
      'PRO_FOLLOW_UP_PRIOR_MISSING',
    );
  }
  return { ask: prior.compiledAsk, response: prior.canonicalResponse };
}

function compileOptions(record, exchange, compiledAt) {
  const prior = priorFor(record, exchange);
  return {
    ...(compiledAt === undefined ? {} : { compiledAt }),
    sources: record.sources,
    ...(prior === undefined ? {} : { prior }),
  };
}

function validateStoredAsk(record, exchange) {
  const ask = exchange.compiledAsk;
  if (ask === null || typeof ask !== 'object') return null;
  const validation = validateSolAsk(ask, compileOptions(record, exchange));
  if (!validation.valid) {
    throw new ProHandoffError(
      'local SOL Pro escalation record contains an ask that no longer binds to its authoritative local contract.',
      'PRO_ASK_BINDING_INVALID',
    );
  }
  return ask;
}

function compileExchange(record, exchange, compiledAt) {
  if (exchange.kind === 'FOLLOW_UP') {
    assertDeltaOnlyInput(exchange.askInput);
  } else {
    assertProEvidenceIsTextual(exchange.askInput);
  }
  const stored = validateStoredAsk(record, exchange);
  if (stored !== null) return stored;
  try {
    return compileSolAsk(exchange.askInput, compileOptions(record, exchange, compiledAt));
  } catch (err) {
    if (err instanceof ProHandoffError) throw err;
    // Compiler messages may name operator-supplied evidence. Keep the local
    // boundary error safe rather than reflecting that material to output.
    throw new ProHandoffError(
      'SOL Pro copy refused before clipboard write: the local bounded decision contract could not be compiled. Reduce or correct the local evidence and contract context, then retry.',
      'PRO_ASK_COMPILE_FAILED',
    );
  }
}

async function ensureCompiled({ store, escalationId, exchangeSequence, compiledAt }) {
  let selectedSequence;
  const updated = await store.update(escalationId, (record) => {
    const exchange = findExchange(record, exchangeSequence);
    selectedSequence = exchange.sequence;
    const ask = compileExchange(record, exchange, compiledAt);
    if (exchange.compiledAsk === null) exchange.compiledAsk = clone(ask);
    return record;
  });
  const exchange = findExchange(updated, selectedSequence);
  return { record: updated, exchange, ask: exchange.compiledAsk };
}

function assertOutboundText(text) {
  // A serialized LCIM document is never an online packet. The response
  // grammar and renderers are line-oriented text; this is a final fail-closed
  // check in case local evidence attempted to mimic a record.
  if (/(?:^|[\s,{])"schemaName"\s*:\s*"lcim\./i.test(text)) {
    throw new ProHandoffError(
      'SOL Pro copy refused before clipboard write: replace a raw local packet with a minimal text excerpt locally.',
      'PRO_TEXT_RAW_PACKET',
    );
  }
  // The dedicated redactor covers arbitrary absolute target paths and keeps
  // remote URL text intact. This final check does not rewrite text further.
  return text;
}

function enforceCharacterLimit(text, limit) {
  if (text.length > limit) {
    throw new ProHandoffError(
      `SOL Pro copy refused before clipboard write: the redacted bounded text is ${text.length} characters and exceeds the ${limit}-character limit. Reduce the local evidence or context locally; no text was copied.`,
      'PRO_TEXT_LIMIT_EXCEEDED',
      { characters: text.length, limit },
    );
  }
  return true;
}

function renderExchange(record, exchange, ask) {
  return exchange.kind === 'INITIAL'
    ? renderInitialEscalation(record, exchange, ask)
    : renderDeltaFollowUp(record, exchange, ask);
}

/**
 * Prepare (but do not write) the one bounded text value eligible for the
 * clipboard. This lets callers validate all local conditions before the only
 * side effect occurs.
 */
export async function prepareProCopyText({
  cwd = process.cwd(),
  escalationId,
  exchangeSequence,
  store = new ProEscalationStore({ cwd }),
  maxCharacters = PRO_COPY_DEFAULT_MAX_CHARACTERS,
  compiledAt,
} = {}) {
  assertLimit(maxCharacters);
  const { record, exchange, ask } = await ensureCompiled({
    store,
    escalationId,
    exchangeSequence,
    compiledAt,
  });
  // Final defense: stored supplemental context must satisfy the same
  // outbound safety policy as evidence, even if a runtime record was edited
  // after creation (SOL-S07-002).
  assertProContextSafe(record.context);
  assertProContextSafe(exchange.context);
  const redaction = redactProText(renderExchange(record, exchange, ask));
  const outboundText = assertOutboundText(redaction.text);
  enforceCharacterLimit(outboundText, maxCharacters);
  return Object.freeze({
    text: outboundText,
    characters: outboundText.length,
    escalationId: record.escalationId,
    findingId: record.findingId,
    exchangeSequence: exchange.sequence,
    askId: ask.askId,
    redactions: Object.freeze({
      secrets: redaction.redactedSecrets,
      localPaths: redaction.redactedPaths,
    }),
  });
}

export function manualProCopyInstructions() {
  return [
    'SOL Pro bounded text is now in the local clipboard.',
    'Manually paste only that text into the intended conversation.',
    'Do not provide local files or additional unredacted material.',
    'When a reply is available, paste only its LCIM_SOL_PRO_DIRECTIVE_V1 block into the local response path.',
    'LCIM has not sent a message or executed a repair.',
  ].join('\n');
}

/**
 * The public pro-copy operation. It writes exactly one already-validated text
 * value to a clipboard adapter and prints manual instructions. It performs no
 * provider invocation and no repair execution.
 */
export async function proCopy({
  cwd = process.cwd(),
  escalationId,
  exchangeSequence,
  store = new ProEscalationStore({ cwd }),
  clipboard = new MacosPbcopyAdapter(),
  output = process.stdout,
  maxCharacters = PRO_COPY_DEFAULT_MAX_CHARACTERS,
  compiledAt,
  copiedAt = new Date().toISOString(),
} = {}) {
  if (clipboard === null || typeof clipboard.writeText !== 'function') {
    throw new ConfigError('SOL Pro clipboard adapter must expose writeText(text)');
  }
  if (output === null || typeof output.write !== 'function') {
    throw new ConfigError('SOL Pro output must expose write(text)');
  }
  const prepared = await prepareProCopyText({
    cwd,
    escalationId,
    exchangeSequence,
    store,
    maxCharacters,
    compiledAt,
  });
  // Final absolute-cap defense immediately before the ONLY clipboard write
  // (SOL-S07-001): no public call path can place more than 12,000 characters
  // on the clipboard, and nothing is ever silently sliced.
  enforceCharacterLimit(prepared.text, PRO_COPY_DEFAULT_MAX_CHARACTERS);
  // This is intentionally the only boundary side effect. All compilation,
  // evidence checks, context checks, redaction, and length checks happen
  // above this line.
  clipboard.writeText(prepared.text);
  await store.update(escalationId, (record) => {
    const exchange = findExchange(record, prepared.exchangeSequence);
    exchange.copiedAt = copiedAt;
    return record;
  });
  const instructions = manualProCopyInstructions();
  output.write(`${instructions}\n`);
  return Object.freeze({ ...prepared, instructions });
}

/** Create an initial local-only escalation record; no text is copied yet. */
export async function createProEscalation({
  cwd = process.cwd(),
  findingId,
  askInput,
  sources,
  context = {},
  createdAt,
  store = new ProEscalationStore({ cwd }),
} = {}) {
  return store.create({
    findingId,
    askInput,
    sources,
    context,
    ...(createdAt === undefined ? {} : { createdAt }),
  });
}

/**
 * Add a same-conversation recheck exchange. The underlying Sprint-06
 * compiler remains the authority for delta/provenance validation.
 */
export async function createProFollowUp({
  cwd = process.cwd(),
  escalationId,
  askInput,
  context = {},
  compiledAt,
  store = new ProEscalationStore({ cwd }),
} = {}) {
  let newSequence;
  const updated = await store.update(escalationId, (record) => {
    const previous = record.exchanges.at(-1);
    if (previous === undefined || previous.compiledAsk === null || previous.canonicalResponse === null) {
      throw new ProHandoffError(
        'SOL Pro follow-up refused: first parse and bind the prior response locally before preparing a delta.',
        'PRO_FOLLOW_UP_PRIOR_MISSING',
      );
    }
    assertDeltaOnlyInput(askInput);
    if (askInput?.recheck?.priorFindingRef !== record.findingId) {
      throw new ProHandoffError(
        'SOL Pro follow-up refused: the delta must bind to this escalation’s stable finding identifier.',
        'PRO_FOLLOW_UP_IDENTITY_MISMATCH',
      );
    }
    let ask;
    try {
      ask = compileSolAsk(askInput, {
        ...(compiledAt === undefined ? {} : { compiledAt }),
        sources: record.sources,
        prior: { ask: previous.compiledAsk, response: previous.canonicalResponse },
      });
    } catch {
      throw new ProHandoffError(
        'SOL Pro follow-up refused: the local delta does not satisfy the Sprint-06 bounded recheck contract.',
        'PRO_FOLLOW_UP_INVALID',
      );
    }
    const initial = record.exchanges[0]?.compiledAsk;
    if (initial === null || initial === undefined || contractBindingText(ask) !== contractBindingText(initial)) {
      throw new ProHandoffError(
        'SOL Pro follow-up refused: a same-conversation delta must retain the initial locked contract bindings.',
        'PRO_FOLLOW_UP_CONTRACT_MISMATCH',
      );
    }
    if (
      ask.recheck.priorAskId !== previous.compiledAsk.askId ||
      ask.recheck.priorResponseId !== previous.canonicalResponse.responseId ||
      ask.recheck.priorFindingRef !== record.findingId
    ) {
      throw new ProHandoffError(
        'SOL Pro follow-up refused: the compiled delta does not bind to the immediately prior local exchange.',
        'PRO_FOLLOW_UP_IDENTITY_MISMATCH',
      );
    }
    newSequence = record.exchanges.length + 1;
    record.exchanges.push({
      sequence: newSequence,
      kind: 'FOLLOW_UP',
      responseBindingId: generateProResponseBindingId(),
      askInput: clone(askInput),
      context: normalizeFollowUpContext(context),
      compiledAsk: clone(ask),
      canonicalResponse: null,
      repairTicket: null,
      repairContract: null,
      copiedAt: null,
      responseRecordedAt: null,
    });
    return record;
  });
  return Object.freeze({
    record: updated,
    exchange: findExchange(updated, newSequence),
  });
}

/** Create, then copy, a delta-only same-conversation follow-up. */
export async function proCopyFollowUp(options = {}) {
  const { record, exchange } = await createProFollowUp(options);
  return proCopy({
    ...options,
    escalationId: record.escalationId,
    exchangeSequence: exchange.sequence,
  });
}

/**
 * Parse a manually pasted directive and, only after every identity/contract
 * bind succeeds, use the existing Sprint-06 response and repair compilers.
 */
export async function ingestPastedProResponse({
  cwd = process.cwd(),
  escalationId,
  exchangeSequence,
  text,
  store = new ProEscalationStore({ cwd }),
  compiledAt,
  recordedAt = new Date().toISOString(),
} = {}) {
  const record = await store.load(escalationId);
  const exchange = findExchange(record, exchangeSequence);
  if (exchange.copiedAt === null || exchange.compiledAsk === null) {
    throw new ProResponseError('Pasted SOL Pro directive was refused because this local exchange has not been prepared and copied.');
  }
  if (exchange.canonicalResponse !== null) {
    throw new ProResponseError('Pasted SOL Pro directive was refused because this local exchange already has a parsed response.', 'PRO_RESPONSE_ALREADY_RECORDED');
  }
  const ask = validateStoredAsk(record, exchange);
  const rawResponse = parseProDirective({ text, record, exchange, ask, sources: record.sources });
  let response;
  try {
    response = compileSolResponse(rawResponse, {
      ...(compiledAt === undefined ? {} : { compiledAt }),
      ask,
      sources: record.sources,
    });
  } catch {
    throw new ProResponseError();
  }

  let conversion = null;
  if (ask.callType === 'SOL_DIAGNOSE' && response.verdict === 'CAUSE_IDENTIFIED') {
    try {
      conversion = compileRepairTicket({ ask, response, sources: record.sources });
    } catch {
      throw new ProResponseError(
        'Pasted SOL Pro directive was refused because it does not bind to the existing Sprint-06/Sprint-04 repair authority.',
        'PRO_AUTHORITY_UNBOUND',
      );
    }
  }

  await store.update(escalationId, (current) => {
    const target = findExchange(current, exchange.sequence);
    if (target.canonicalResponse !== null) {
      throw new ProResponseError('Pasted SOL Pro directive was refused because this local exchange already has a parsed response.', 'PRO_RESPONSE_ALREADY_RECORDED');
    }
    target.canonicalResponse = clone(response);
    target.repairTicket = conversion === null ? null : clone(conversion.ticket);
    target.repairContract = conversion === null ? null : clone(conversion.repairContract);
    target.responseRecordedAt = recordedAt;
    return current;
  });

  return Object.freeze({
    response,
    repairTicket: conversion?.ticket ?? null,
    repairContract: conversion?.repairContract ?? null,
    authority: 'REQUIRES_CONTROLLER_VALIDATION',
  });
}

// Small aliases make the boundary discoverable without introducing a CLI
// command ahead of Sprint 10.
export const copyProText = proCopy;
export const parsePastedProResponse = ingestPastedProResponse;
export { enforceCharacterLimit };
