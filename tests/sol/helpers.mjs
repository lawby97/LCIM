/**
 * Sprint 06 test helpers: SOL fixtures and shared builders.
 *
 * Fixtures under tests/fixtures/sol/ are written in COMPILED document
 * shape (they carry schemaName/schemaVersion/askId or responseId and
 * compiledAt). The compilers consume RAW structured input only and fail
 * closed on caller-supplied derived fields (askId, responseId,
 * compiledAt, schema fields; evidence is budgeted by the compiler), so
 * tests that compile a fixture convert it first.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSemanticContract } from '../../src/contracts/compiler.mjs';
import { compileSolAsk } from '../../src/sol/ask-compiler/compiler.mjs';
import { compileSolResponse } from '../../src/sol/ask-compiler/response.mjs';
import { readFixture, rawInputFromFixture } from '../helpers/semantic-fixture.mjs';

export const SOL_FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'sol',
);

export const NOW = '2025-01-01T00:00:00.000Z';

/** @param {string} name fixture file name */
export function readSolFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(SOL_FIXTURE_DIR, name), 'utf8'));
}

/** Compiled-document fields the ask compiler derives; never valid raw input. */
const DERIVED_ASK_FIELDS = ['schemaName', 'schemaVersion', 'askId', 'compiledAt'];

/** Compiled-document fields the response compiler derives; never valid raw input. */
const DERIVED_RESPONSE_FIELDS = ['schemaName', 'schemaVersion', 'responseId', 'compiledAt'];

/**
 * Convert a compiled-shaped ask fixture into raw compiler input:
 * derived fields are dropped; evidence passes through (the compiler
 * re-budgets it deterministically). Fixture contractRefs carry
 * placeholder digests — use bindAskRefs() to bind them to a real source
 * before compiling.
 * @param {object} doc fixture document
 * @returns {object} raw input for compileSolAsk
 */
export function rawAskFromFixture(doc) {
  const input = {};
  for (const [key, value] of Object.entries(doc)) {
    if (DERIVED_ASK_FIELDS.includes(key)) continue;
    input[key] = value;
  }
  return input;
}

/**
 * Convert a compiled-shaped response fixture into raw compiler input.
 * @param {object} doc fixture document
 * @returns {object} raw input for compileSolResponse
 */
export function rawResponseFromFixture(doc) {
  const input = {};
  for (const [key, value] of Object.entries(doc)) {
    if (DERIVED_RESPONSE_FIELDS.includes(key)) continue;
    input[key] = value;
  }
  return input;
}

/**
 * Bind an ask's contractRefs to a real compiled source (replacing
 * placeholder digests) so it can be compiled with `sources: [source]`.
 * @param {object} raw raw ask input
 * @param {object} source compiled lcim.semantic-contract document
 * @returns {object} raw input with source-bound contractRefs
 */
export function bindAskRefs(raw, source) {
  return {
    ...raw,
    contractRefs: (raw.contractRefs ?? []).map((ref) => ({
      ...ref,
      semanticDigest: source.semanticDigest,
    })),
  };
}

/** Compile the authoritative Sprint-04 provider contract used across SOL tests. */
export function compileProviderContract() {
  return compileSemanticContract(
    rawInputFromFixture(readFixture('bl020-provider-construction-before-authz.json')),
    { compiledAt: NOW },
  );
}

/** sideEffectId of the provider_factory spec in the provider contract. */
export function providerFactoryEffectId(semantic) {
  return semantic.negativeSideEffects.find((s) => s.scope === 'provider_factory').sideEffectId;
}

/** sideEffectId of the network spec in the provider contract. */
export function networkEffectId(semantic) {
  return semantic.negativeSideEffects.find((s) => s.scope === 'network').sideEffectId;
}

/** sideEffectId of the mutation spec in the provider contract. */
export function mutationEffectId(semantic) {
  return semantic.negativeSideEffects.find((s) => s.scope === 'mutation').sideEffectId;
}

/** A deterministic, stable prior finding id used across provenance tests. */
export const PRIOR_FINDING_ID = 'lcim_finding_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

/**
 * Build a validated prior FINAL_REVIEW ask + FAIL response carrying the
 * deterministic PRIOR_FINDING_ID finding. Used as RECHECK provenance.
 * @param {object} [opts] - { findingId?, findingInvariant? }
 * @returns {{ ask: Readonly<object>, response: Readonly<object>, source: Readonly<object> }}
 */
export function buildPriorFinalReview(opts = {}) {
  const source = compileProviderContract();
  const findingId = opts.findingId ?? PRIOR_FINDING_ID;
  const findingInvariant = opts.findingInvariant ?? 'inv.provider_factory_zero';
  const priorAsk = compileSolAsk(
    {
      callType: 'SOL_FINAL_REVIEW',
      singleDecisionQuestion: 'Do the named high-risk invariants of the provider authorization flow hold on the candidate?',
      whyNeeded: 'candidate review before repair',
      contractRefs: [
        {
          contractKey: source.contractKey,
          semanticDigest: source.semanticDigest,
          requirementRefs: [providerFactoryEffectId(source), networkEffectId(source)],
        },
      ],
      establishedFacts: [
        { fact: 'authorization failure must terminate the flow with zero side effects', evidence: 'source semantic contract' },
      ],
      evidence: [
        {
          ref: 'ev.candidate.tests',
          kind: 'test_result',
          content: 'negative side-effect tests ran against the candidate',
          decisionCritical: true,
        },
      ],
      passCondition: 'every named invariant holds with supporting evidence',
      failCondition: 'any named invariant fails, or one directly evidenced adjacent critical defect violates a locked requirement',
      allowedScope: ['the named high-risk invariant checklist only'],
      outOfScope: ['open-ended bug hunting', 'code edits', 'cleanup', 'style'],
      finalReview: {
        invariantChecklist: [
          {
            invariantId: 'inv.provider_factory_zero',
            invariant: 'provider factory construction stays zero before an authorization failure is handled',
            lockedRequirementRef: providerFactoryEffectId(source),
          },
          {
            invariantId: 'inv.network_zero',
            invariant: 'outbound network requests stay zero before an authorization failure is handled',
            lockedRequirementRef: networkEffectId(source),
          },
        ],
        maxAdjacentCriticalDefects: 1,
      },
    },
    { compiledAt: NOW, sources: [source] },
  );
  const priorResponse = compileSolResponse(
    {
      askId: priorAsk.askId,
      callType: 'SOL_FINAL_REVIEW',
      verdict: 'FAIL',
      decisionSummary: `inv.${findingInvariant.split('.').pop()} failed on the candidate`,
      evidence: [
        {
          ref: 'ev.candidate.tests',
          kind: 'test_result',
          content: 'negative side-effect tests ran against the candidate',
          decisionCritical: true,
        },
      ],
      findings: [
        {
          findingId,
          severity: 'CRITICAL',
          invariantRef: findingInvariant,
          summary: `invariant '${findingInvariant}' failed on the candidate`,
          evidenceRefs: ['ev.candidate.tests'],
        },
      ],
    },
    { compiledAt: NOW, ask: priorAsk, sources: [source] },
  );
  return { ask: priorAsk, response: priorResponse, source };
}

/**
 * Build a compiled SOL_DIAGNOSE ask against the provider contract,
 * source-bound (criterion = provider_factory side effect).
 * @param {object} [opts]
 * @returns {{ ask: Readonly<object>, source: Readonly<object> }}
 */
export function buildDiagnoseAsk(opts = {}) {
  const source = compileProviderContract();
  const criterion = opts.criterion ?? providerFactoryEffectId(source);
  const criterionRequirement =
    opts.criterionRequirement ??
    source.negativeSideEffects.find((s) => s.sideEffectId === criterion)?.requirement;
  const ask = compileSolAsk(
    {
      callType: 'SOL_DIAGNOSE',
      singleDecisionQuestion: opts.question ??
        'Why does the provider_factory negative side-effect criterion fail before the authorization failure is handled?',
      whyNeeded: opts.whyNeeded ?? 'The acceptance run observed a provider factory construction before the persisted authorization check.',
      contractRefs: [
        {
          contractKey: source.contractKey,
          semanticDigest: source.semanticDigest,
          requirementRefs: [criterion],
        },
      ],
      establishedFacts: [{ fact: 'authorization is persisted state', evidence: 'authz schema' }],
      evidence: opts.evidence ?? [
        {
          ref: 'ev.counter.provider_factory',
          kind: 'test_result',
          content: 'instrumented counter reported provider_factory count 1 before the gate',
          decisionCritical: true,
        },
      ],
      passCondition: 'a single root cause is identified with resolving evidence and a falsification statement',
      failCondition: 'the root cause cannot be identified from the bounded evidence',
      allowedScope: ['the provider_factory acceptance criterion only'],
      outOfScope: ['other acceptance criteria', 'code edits', 'general review'],
      diagnose: {
        acceptanceCriterionRef: criterion,
        criterionRequirement,
        ...(opts.priorEvidence !== undefined ? { priorEvidence: opts.priorEvidence } : {}),
      },
      ...(opts.passEvidenceRefs !== undefined ? { passEvidenceRefs: opts.passEvidenceRefs } : {}),
      ...(opts.failEvidenceRefs !== undefined ? { failEvidenceRefs: opts.failEvidenceRefs } : {}),
      ...(opts.evidenceBudget !== undefined ? { evidenceBudget: opts.evidenceBudget } : {}),
    },
    { compiledAt: NOW, sources: [source] },
  );
  return { ask, source };
}
