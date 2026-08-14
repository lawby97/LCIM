/** Sprint-07 focused tests: response binding, repair conversion, delta-only follow-up. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryClipboardAdapter } from '../../src/sol/pro-handoff/pbcopy.mjs';
import { compileProviderContract } from '../sol/helpers.mjs';
import {
  createProFollowUp,
  ingestPastedProResponse,
  proCopy,
} from '../../src/sol/pro-handoff/service.mjs';
import {
  captureOutput,
  COPIED_AT,
  makeDiagnoseDirective,
  makeDiagnoseInput,
  makeEscalation,
  makeRecheckInput,
  NOW,
  RECORDED_AT,
} from './helpers.mjs';

async function copiedInitial(t) {
  const fixture = await makeEscalation(t);
  const clipboard = new MemoryClipboardAdapter();
  await proCopy({
    cwd: fixture.repo.root,
    store: fixture.store,
    escalationId: fixture.record.escalationId,
    clipboard,
    output: captureOutput(),
    compiledAt: NOW,
    copiedAt: COPIED_AT,
  });
  const record = await fixture.store.load(fixture.record.escalationId);
  return { ...fixture, record, exchange: record.exchanges[0], clipboard };
}

test('a correctly bound pasted SOL Pro directive converts only through the existing repair-ticket authority', async (t) => {
  const fixture = await copiedInitial(t);
  const result = await ingestPastedProResponse({
    cwd: fixture.repo.root,
    store: fixture.store,
    escalationId: fixture.record.escalationId,
    text: makeDiagnoseDirective(fixture),
    compiledAt: NOW,
    recordedAt: RECORDED_AT,
  });

  assert.equal(result.authority, 'REQUIRES_CONTROLLER_VALIDATION');
  assert.equal(result.response.schemaName, 'lcim.sol-response');
  assert.equal(result.repairTicket.schemaName, 'lcim.repair-ticket');
  assert.equal(result.repairContract.schemaName, 'lcim.acceptance-contract');
  assert.equal(result.repairTicket.sourceAskId, fixture.exchange.compiledAsk.askId);
  assert.equal(result.repairTicket.sourceResponseId, result.response.responseId);
  assert.equal('controllerDisposition' in result, false);

  const persisted = await fixture.store.load(fixture.record.escalationId);
  assert.equal(persisted.exchanges[0].canonicalResponse.responseId, result.response.responseId);
  assert.equal(persisted.exchanges[0].repairTicket.ticketId, result.repairTicket.ticketId);
});

test('wrong response-binding, escalation, and finding identifiers fail closed', async (t) => {
  const cases = [
    ['RESPONSE_BINDING_ID', `lcim_sol_pro_resp_${'c'.repeat(32)}`],
    ['ESCALATION_ID', `lcim_sol_pro_esc_${'d'.repeat(32)}`],
    ['FINDING_ID', `lcim_finding_${'e'.repeat(32)}`],
  ];
  for (const [field, replacement] of cases) {
    await t.test(field, async (subtest) => {
      const fixture = await copiedInitial(subtest);
      const text = makeDiagnoseDirective(fixture).replace(
        new RegExp(`^${field}: .+$`, 'm'),
        `${field}: ${replacement}`,
      );
      await assert.rejects(
        ingestPastedProResponse({
          cwd: fixture.repo.root,
          store: fixture.store,
          escalationId: fixture.record.escalationId,
          text,
          compiledAt: NOW,
        }),
        (err) => err?.code === 'PRO_IDENTITY_MISMATCH',
      );
      const after = await fixture.store.load(fixture.record.escalationId);
      assert.equal(after.exchanges[0].canonicalResponse, null);
    });
  }
});

test('malformed pasted-back text fails closed and creates no repair artifact', async (t) => {
  const fixture = await copiedInitial(t);
  await assert.rejects(
    ingestPastedProResponse({
      cwd: fixture.repo.root,
      store: fixture.store,
      escalationId: fixture.record.escalationId,
      text: 'This is not an LCIM response directive.',
      compiledAt: NOW,
    }),
    (err) => err?.code === 'PRO_RESPONSE_MALFORMED',
  );
  const after = await fixture.store.load(fixture.record.escalationId);
  assert.equal(after.exchanges[0].canonicalResponse, null);
  assert.equal(after.exchanges[0].repairTicket, null);
});

test('a malformed pasted-back directive cannot add extra diagnose findings', async (t) => {
  const fixture = await copiedInitial(t);
  const text = makeDiagnoseDirective(fixture).replace(
    'ROOT_CAUSE:',
    'FINDING: CRITICAL|a second unauthorized finding|ev.counter.provider_factory\nROOT_CAUSE:',
  );
  await assert.rejects(
    ingestPastedProResponse({
      cwd: fixture.repo.root,
      store: fixture.store,
      escalationId: fixture.record.escalationId,
      text,
      compiledAt: NOW,
    }),
    (err) => err?.code === 'PRO_RESPONSE_MALFORMED',
  );
});

test('same-conversation follow-up retains stable bindings and renders delta-only evidence', async (t) => {
  const fixture = await copiedInitial(t);
  await ingestPastedProResponse({
    cwd: fixture.repo.root,
    store: fixture.store,
    escalationId: fixture.record.escalationId,
    text: makeDiagnoseDirective(fixture),
    compiledAt: NOW,
    recordedAt: RECORDED_AT,
  });

  const followUp = await createProFollowUp({
    cwd: fixture.repo.root,
    store: fixture.store,
    escalationId: fixture.record.escalationId,
    askInput: makeRecheckInput(fixture.source),
    compiledAt: NOW,
  });
  const clipboard = new MemoryClipboardAdapter();
  const result = await proCopy({
    cwd: fixture.repo.root,
    store: fixture.store,
    escalationId: fixture.record.escalationId,
    exchangeSequence: followUp.exchange.sequence,
    clipboard,
    output: captureOutput(),
    compiledAt: NOW,
    copiedAt: COPIED_AT,
  });

  assert.equal(result.exchangeSequence, 2);
  assert.match(result.text, /follow-up \(DELTA ONLY\)/);
  assert.match(result.text, /NEW OR CHANGED EVIDENCE ONLY/);
  assert.match(result.text, /DELTA_EVIDENCE/);
  // The follow-up task is DERIVED from the compiled RECHECK ask, never from
  // caller-supplied context (SOL-S07-003).
  assert.match(result.text, /TASK: Is the prior provider_factory finding resolved by the new delta evidence\?/);
  assert.doesNotMatch(result.text, /INITIAL_EVIDENCE/);
  assert.doesNotMatch(result.text, /The controller rejected the candidate after one provider factory construction/);
  assert.doesNotMatch(result.text, /The controller needs one bounded recheck after the smallest local repair/);
  assert.doesNotMatch(result.text, /Recheck only the new provider counter result after the local repair/);
  assert.match(result.text, new RegExp(fixture.record.escalationId));
  assert.match(result.text, new RegExp(fixture.record.findingId));
  assert.match(result.text, /PRIOR_ASK_ID/);
  assert.match(result.text, /PRIOR_RESPONSE_ID/);

  const persisted = await fixture.store.load(fixture.record.escalationId);
  assert.equal(persisted.exchanges.length, 2);
  assert.equal(persisted.exchanges[1].kind, 'FOLLOW_UP');
  assert.equal(persisted.exchanges[1].canonicalResponse, null);
});

test('SOL-S07-003: follow-up context can never replay first-exchange evidence', async (t) => {
  const marker = 'INITIAL_EVIDENCE_DO_NOT_REPLAY';
  const source = fixtureSource();
  const input = makeDiagnoseInput(source, {
    evidence: [{
      ref: 'ev.counter.provider_factory',
      kind: 'test_result',
      content: `${marker}: instrumented counter reported provider_factory count 1 before the gate`,
      decisionCritical: true,
    }],
  });
  const fixture = await makeEscalation(t, { askInput: input, sources: [source] });
  const clipboard = new MemoryClipboardAdapter();
  await proCopy({
    cwd: fixture.repo.root,
    store: fixture.store,
    escalationId: fixture.record.escalationId,
    clipboard,
    output: captureOutput(),
    compiledAt: NOW,
    copiedAt: COPIED_AT,
  });
  const afterCopy = await fixture.store.load(fixture.record.escalationId);
  await ingestPastedProResponse({
    cwd: fixture.repo.root,
    store: fixture.store,
    escalationId: fixture.record.escalationId,
    text: makeDiagnoseDirective({ record: afterCopy, exchange: afterCopy.exchanges[0] }),
    compiledAt: NOW,
    recordedAt: RECORDED_AT,
  });

  // 1. Placing the prior evidence text into follow-up context is rejected
  //    before any clipboard write (follow-ups accept no supplemental context).
  await assert.rejects(
    createProFollowUp({
      cwd: fixture.repo.root,
      store: fixture.store,
      escalationId: fixture.record.escalationId,
      askInput: makeRecheckInput(source),
      context: { task: `replay the prior packet: ${marker}` },
      compiledAt: NOW,
    }),
    (err) => err?.code === 'CONFIG_INVALID',
  );

  // 2. A valid delta-only follow-up never renders the first-exchange marker.
  const followUp = await createProFollowUp({
    cwd: fixture.repo.root,
    store: fixture.store,
    escalationId: fixture.record.escalationId,
    askInput: makeRecheckInput(source),
    compiledAt: NOW,
  });
  const followClipboard = new MemoryClipboardAdapter();
  const result = await proCopy({
    cwd: fixture.repo.root,
    store: fixture.store,
    escalationId: fixture.record.escalationId,
    exchangeSequence: followUp.exchange.sequence,
    clipboard: followClipboard,
    output: captureOutput(),
    compiledAt: NOW,
    copiedAt: COPIED_AT,
  });
  assert.doesNotMatch(result.text, new RegExp(marker));
  assert.match(result.text, /DELTA_EVIDENCE/);
});

function fixtureSource() {
  return compileProviderContract();
}

test('follow-up rejects first-exchange attempt or controller-rejection context', async (t) => {
  const fixture = await copiedInitial(t);
  await ingestPastedProResponse({
    cwd: fixture.repo.root,
    store: fixture.store,
    escalationId: fixture.record.escalationId,
    text: makeDiagnoseDirective(fixture),
    compiledAt: NOW,
    recordedAt: RECORDED_AT,
  });
  await assert.rejects(
    createProFollowUp({
      cwd: fixture.repo.root,
      store: fixture.store,
      escalationId: fixture.record.escalationId,
      askInput: makeRecheckInput(fixture.source),
      context: { previousAttempt: 'first packet attempt must not be repeated' },
      compiledAt: NOW,
    }),
    (err) => err?.code === 'CONFIG_INVALID',
  );
});

test('follow-up rejects an attempt to resend first-exchange evidence', async (t) => {
  const fixture = await copiedInitial(t);
  await ingestPastedProResponse({
    cwd: fixture.repo.root,
    store: fixture.store,
    escalationId: fixture.record.escalationId,
    text: makeDiagnoseDirective(fixture),
    compiledAt: NOW,
    recordedAt: RECORDED_AT,
  });
  const input = makeRecheckInput(fixture.source, {
    evidence: [{ ref: 'ev.old', content: 'INITIAL_EVIDENCE copied again' }],
  });
  await assert.rejects(
    createProFollowUp({
      cwd: fixture.repo.root,
      store: fixture.store,
      escalationId: fixture.record.escalationId,
      askInput: input,
      compiledAt: NOW,
    }),
    (err) => err?.code === 'PRO_FOLLOW_UP_NOT_DELTA',
  );
});
