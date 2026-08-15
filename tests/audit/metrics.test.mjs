/** Sprint 08 focused tests: workflow metrics and canonical reconciliation. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { audit } from '../../src/audit/index.mjs';
import { buildAuditFixture } from '../helpers/audit-fixture.mjs';

const PRICING = {
  deepseek: {
    'deepseek-flash': { inputPerMillion: 0.28, outputPerMillion: 0.42 },
    'deepseek-pro-max': { inputPerMillion: 2, outputPerMillion: 8 },
  },
  chatgpt: { 'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 } },
};

test('required metrics reconcile to the canonical multi-run fixture without inferred facts', async (t) => {
  const { repo } = await buildAuditFixture(t);
  const { result } = await audit({ cwd: repo.root });
  const m = result.metrics;

  assert.equal(m.lcim.version, '2.0.0');
  assert.match(m.lcim.commit, /^[0-9a-f]{40}$/);
  assert.equal(m.lcim.availability, true);
  assert.equal(m.lcim.versions.length, 1);

  assert.equal(m.calls.total, 19);
  assert.deepEqual(m.calls.byProvider, { chatgpt: 1, deepseek: 18 });
  assert.deepEqual(m.calls.byModel, { 'deepseek-flash': 17, 'deepseek-pro-max': 1, 'gpt-4o': 1 });
  assert.deepEqual(m.calls.byRole, { SOL: 5, SOL_PRO: 1, WORKER: 13 });
  assert.deepEqual(m.calls.byReasoning, { MAX: 2, xhigh: 17 });

  assert.deepEqual(m.workUnits, { total: 11, accepted: 7, rejected: 2, reconciled: 1, incomplete: 1, unknown: 0 });
  assert.equal(m.acceptance.firstPassAccepted, 6);
  assert.equal(m.acceptance.firstPassRejected, 3);
  assert.equal(m.acceptance.firstPassUnknown, 2);
  assert.equal(m.acceptance.firstPassKnownCount, 9);
  assert.equal(m.acceptance.firstPassAcceptedRate, 6 / 9);
  assert.equal(m.acceptance.repairAccepted, 1);
  assert.equal(m.acceptance.repairAcceptedRate, 1 / 7);
  assert.equal(m.callsPerAcceptedWorkUnit.value, 19 / 7);

  assert.equal(m.rejections.total, 5);
  assert.deepEqual(m.rejections.byCode, {
    SEMANTIC_CONFLATION: 2,
    SCOPE_VIOLATION: 1,
    UNRESOLVED_SEMANTICS: 1,
    WRONG_BASE: 1,
  });
  assert.equal(m.rejections.semantic.total, 3);
  assert.equal(m.rejections.wrongBase.total, 1);
  assert.equal(m.rejections.scopeViolations.total, 1);
  assert.equal(m.transport.outcomeFailures.total, 1);
  assert.equal(m.transport.transportSchemaRejections.total, 1);
  assert.equal(m.transport.usefulPatchDespiteTransportFailure, 1);

  assert.equal(m.escalation.solCalls, 5);
  assert.equal(m.escalation.solProCalls, 1);
  assert.equal(m.escalation.proModelCalls, 1);
  assert.equal(m.escalation.totalEscalated, 7);

  assert.equal(m.usage.tokens.availability, 'UNKNOWN');
  assert.equal(m.usage.tokens.reason, 'MISSING_USAGE');
  assert.equal(m.usage.tokens.totalTokens, null);
  assert.deepEqual(
    {
      knownInputTokenSubtotal: m.usage.tokens.knownInputTokenSubtotal,
      knownOutputTokenSubtotal: m.usage.tokens.knownOutputTokenSubtotal,
      knownTotalTokenSubtotal: m.usage.tokens.knownTotalTokenSubtotal,
      knownUsageCallCount: m.usage.tokens.knownUsageCallCount,
      totalCallCount: m.usage.tokens.totalCallCount,
    },
    { knownInputTokenSubtotal: 760, knownOutputTokenSubtotal: 920, knownTotalTokenSubtotal: 1680, knownUsageCallCount: 16, totalCallCount: 19 },
  );
  assert.equal(m.usage.availableCalls, 16);
  assert.equal(m.usage.unavailableCalls, 3);
  assert.equal(m.usage.rejectedWaste.calls, 5);
  assert.equal(m.usage.rejectedWaste.tokens.value, 450);
  assert.equal(m.usage.nonRejectedNonAccepted.calls, 2);
  assert.deepEqual(m.usage.nonRejectedNonAccepted.byCategory, { ORPHANED: 1, UNASSESSED: 1 });

  // SOL-S08-007: zero is not fabricated where canonical linkage is absent.
  assert.equal(m.solFindings.availability, 'UNKNOWN');
  assert.equal(m.solFindings.reason, 'NO_CANONICAL_FINDING_LINKAGE');
  assert.equal(m.solFindings.findings, null);
  assert.equal(m.solFindings.survivedFirstRepair, null);

  assert.deepEqual(m.ledger.runs, { total: 9, completed: 8, incompleteLedger: 1, aborted: 0, open: 0 });
  assert.deepEqual(m.ledger.orphans, { orphaned: 1, superseded: 0 });
  assert.equal(m.ledger.normalizationCount.value, 'UNKNOWN');

  const facts = result.unknownFacts.map((fact) => fact.fact);
  for (const expected of ['model-reported work status', 'semantic acceptance', 'final integration disposition (CANDIDATE_INTEGRATED / REVIEW_APPROVED)', 'normalization count', 'SOL findings/rechecks/survival/severity', 'aggregate tokens/cost']) {
    assert.ok(facts.includes(expected));
  }
});

test('partial usage makes aggregate total cost UNKNOWN while retaining only a labeled known subtotal', async (t) => {
  const { repo } = await buildAuditFixture(t);
  const { result, projections } = await audit({ cwd: repo.root, pricing: PRICING });
  const cost = result.metrics.usage.cost;
  assert.equal(cost.availability, 'UNKNOWN');
  assert.equal(cost.available, false);
  assert.equal(cost.usd, null);
  assert.equal(cost.reason, 'MISSING_USAGE');
  assert.equal(cost.knownUsageCallCount, 16);
  assert.equal(cost.pricedCallCount, 16);
  assert.equal(cost.totalCallCount, 19);
  assert.ok(cost.knownCostSubtotal > 0);
  assert.equal(result.metrics.usage.rejectedWaste.cost.availability, 'COMPUTED');
  assert.ok(result.metrics.usage.rejectedWaste.cost.usd > 0);
  assert.equal(projections.usage.filter((line) => line.costAvailability === 'COMPUTED').length, 16);
});

test('reconciliation compares canonical lifecycle identity sets and counts', async (t) => {
  const { repo } = await buildAuditFixture(t);
  const { result } = await audit({ cwd: repo.root });
  const r = result.reconciliation;
  assert.equal(r.ok, true);
  assert.deepEqual(r.mismatches, []);
  assert.deepEqual(r.ledger, {
    events: 54,
    invocations: 19,
    starts: 19,
    completions: 17,
    assessments: 17,
    reconciliations: 1,
  });
  assert.deepEqual(r.projections, { invocations: 19, workUnits: 11, reviews: 6, usage: 19 });
  assert.ok(r.checks.length >= 12);
  assert.ok(r.checks.every((check) => check.ok));
});

test('per-run summaries expose only canonical identity/hash/count facts', async (t) => {
  const { repo, runs } = await buildAuditFixture(t);
  const { result } = await audit({ cwd: repo.root });
  assert.equal(result.runs.length, 9);
  const ids = new Set(runs.map((run) => run.runId));
  for (const run of result.runs) {
    assert.ok(ids.has(run.runId));
    assert.match(run.targetBaseSha, /^[0-9a-f]{40}$/);
    assert.match(run.configDigest, /^[0-9a-f]{64}$/);
    assert.equal(run.lcimVersion, '2.0.0');
    assert.equal(run.projections.invocations, run.ledger.invocations);
  }
});
