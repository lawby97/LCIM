/** Shared fixtures for Sprint-07 manual-boundary tests. */

import { createProEscalation } from '../../src/sol/pro-handoff/service.mjs';
import { ProEscalationStore } from '../../src/sol/pro-handoff/store.mjs';
import {
  compileProviderContract,
  networkEffectId,
  providerFactoryEffectId,
} from '../sol/helpers.mjs';
import { makeGitRepo } from '../helpers/git-fixture.mjs';

export const NOW = '2025-01-01T00:00:00.000Z';
export const COPIED_AT = '2025-01-01T00:01:00.000Z';
export const RECORDED_AT = '2025-01-01T00:02:00.000Z';
export const FINDING_ID = 'lcim_finding_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

export function makeDiagnoseInput(source, overrides = {}) {
  const criterion = providerFactoryEffectId(source);
  return {
    callType: 'SOL_DIAGNOSE',
    singleDecisionQuestion: 'Why does the provider_factory negative side-effect criterion fail before the authorization failure is handled?',
    whyNeeded: 'The controller rejected the candidate after one provider factory construction before the authorization gate.',
    contractRefs: [
      {
        contractKey: source.contractKey,
        semanticDigest: source.semanticDigest,
        requirementRefs: [criterion],
      },
    ],
    establishedFacts: [
      { fact: 'the authorization gate is a locked acceptance condition', evidence: 'controller rejection' },
    ],
    evidence: [
      {
        ref: 'ev.counter.provider_factory',
        kind: 'test_result',
        content: 'INITIAL_EVIDENCE: instrumented counter reported provider_factory count 1 before the authorization gate.',
        decisionCritical: true,
      },
    ],
    passCondition: 'one root cause is identified from the bounded evidence with a falsification statement',
    failCondition: 'the bounded evidence cannot identify one root cause',
    allowedScope: ['the provider_factory acceptance criterion only'],
    outOfScope: ['other acceptance criteria', 'code edits', 'general review'],
    diagnose: {
      acceptanceCriterionRef: criterion,
      criterionRequirement: source.negativeSideEffects.find((item) => item.sideEffectId === criterion).requirement,
    },
    ...overrides,
  };
}

export function makeRecheckInput(source, overrides = {}) {
  const criterion = providerFactoryEffectId(source);
  const neighbor = networkEffectId(source);
  return {
    callType: 'SOL_RECHECK',
    singleDecisionQuestion: 'Is the prior provider_factory finding resolved by the new delta evidence?',
    whyNeeded: 'The controller needs one bounded recheck after the smallest local repair.',
    contractRefs: [
      {
        contractKey: source.contractKey,
        semanticDigest: source.semanticDigest,
        requirementRefs: [criterion, neighbor],
      },
    ],
    establishedFacts: [{ fact: 'one local repair attempt was made', evidence: 'controller evidence' }],
    evidence: [],
    passCondition: 'the prior finding is resolved by the retained delta evidence',
    failCondition: 'the prior finding remains or a named neighbor fails in the retained delta evidence',
    allowedScope: ['the prior finding and one named neighboring invariant'],
    outOfScope: ['the first escalation packet', 'general review', 'code edits'],
    recheck: {
      priorFindingRef: FINDING_ID,
      deltaEvidence: [
        {
          ref: 'ev.delta.provider_factory',
          kind: 'test_result',
          content: 'DELTA_EVIDENCE: instrumented counter now reports provider_factory count 0 before the authorization gate.',
          decisionCritical: true,
        },
      ],
      neighboringInvariants: [neighbor],
      mustNotReopen: true,
    },
    ...overrides,
  };
}

export async function makeEscalation(t, options = {}) {
  const repo = await makeGitRepo(t);
  const source = compileProviderContract();
  const store = new ProEscalationStore({ cwd: repo.root });
  const record = await createProEscalation({
    cwd: repo.root,
    store,
    findingId: options.findingId ?? FINDING_ID,
    askInput: options.askInput ?? makeDiagnoseInput(source),
    sources: options.sources ?? [source],
    context: options.context ?? {
      task: 'Determine the smallest safe explanation for the rejected provider authorization candidate.',
      previousAttempt: 'One bounded candidate was rejected after the provider counter was nonzero.',
      controllerRejection: 'REJECTED: locked provider_factory acceptance condition failed.',
    },
    createdAt: NOW,
  });
  return { repo, source, store, record };
}

export function captureOutput() {
  let value = '';
  return {
    write(text) {
      value += text;
    },
    get text() {
      return value;
    },
  };
}

export function makeDiagnoseDirective({ record, exchange, ask = exchange?.compiledAsk, overrides = {} }) {
  const values = {
    ESCALATION_ID: record.escalationId,
    RESPONSE_BINDING_ID: exchange.responseBindingId,
    FINDING_ID: record.findingId,
    ASK_ID: ask.askId,
    CONTRACT_BINDINGS: ask.contractRefs.map((ref) => `${ref.contractKey}@${ref.semanticDigest}`).sort().join(';'),
    CALL_TYPE: ask.callType,
    VERDICT: 'CAUSE_IDENTIFIED',
    DECISION_SUMMARY: 'The provider factory is constructed before the authorization gate.',
  };
  Object.assign(values, overrides);
  return [
    'LCIM_SOL_PRO_DIRECTIVE_V1',
    `ESCALATION_ID: ${values.ESCALATION_ID}`,
    `RESPONSE_BINDING_ID: ${values.RESPONSE_BINDING_ID}`,
    `FINDING_ID: ${values.FINDING_ID}`,
    `ASK_ID: ${values.ASK_ID}`,
    `CONTRACT_BINDINGS: ${values.CONTRACT_BINDINGS}`,
    `CALL_TYPE: ${values.CALL_TYPE}`,
    `VERDICT: ${values.VERDICT}`,
    `DECISION_SUMMARY: ${values.DECISION_SUMMARY}`,
    'FINDING: CRITICAL|provider factory invariant fails before the gate|ev.counter.provider_factory',
    'ROOT_CAUSE: provider construction happens before authorization is checked.',
    'FAILURE_EVIDENCE_REFS: ev.counter.provider_factory',
    'MUST_CHANGE: move the authorization gate before provider construction.',
    'MUST_NOT_CHANGE: network|preserve the existing zero-network behavior before the gate.',
    'EXACT_TEST: provider factory remains zero before gate|-',
    'VERIFY: instrumented counter test|provider_factory count is zero before the gate.',
    'FALSIFICATION: a counter of zero before the gate would disprove this cause.',
    'END_LCIM_SOL_PRO_DIRECTIVE_V1',
  ].join('\n');
}
