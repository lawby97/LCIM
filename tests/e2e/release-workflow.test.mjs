import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolvePatchEvidenceDir } from '../../src/evidence/patch/store.mjs';
import { resolveGitCommonDir, resolveRuntimeRoot } from '../../src/config/runtime-path.mjs';
import { readControllerState } from '../../src/controller/state.mjs';

import {
  assertInvocationLifecycle,
  assertRuntimeIsTargetLocal,
  cli,
  git,
  makeTarget,
  sha256,
} from '../fault-injection/helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BIN = path.join(ROOT, 'bin', 'lcim.mjs');

function parseCli(result) {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function configureAndCommit(target, projectKey) {
  const setup = cli(BIN, target.root, ['setup', '--force']);
  const setupResult = parseCli(setup);
  assert.equal(setupResult.written.length, 5);
  const config = JSON.parse(fs.readFileSync(target.configPath, 'utf8'));
  config.projectKey = projectKey;
  config.allowedWritePaths = ['a.txt'];
  config.worker.command = ['node', path.basename(target.workerFile)];
  config.worker.args = ['normal', target.root];
  config.endpoints['deepseek-v4-flash'] = { baseUrl: 'local://s11-e2e-worker', kind: 'local-command' };
  fs.writeFileSync(target.configPath, `${JSON.stringify(config, null, 2)}\n`);
  git(target.root, ['add', '.lcim', path.basename(target.workerFile)]);
  git(target.root, ['commit', '-m', `configure ${projectKey} fixture`]);
}

test('E2E CLI workflow: linked worktree candidate, immutable evidence, status, audit, review-export, and recovery', async (t) => {
  let linked = null;
  const target = makeTarget(t, { mode: 'normal', commitProject: false, projectKey: 's11-e2e-a' });
  t.after(() => {
    if (linked !== null) {
      git(target.root, ['worktree', 'remove', '--force', linked], { allowFailure: true });
      fs.rmSync(linked, { recursive: true, force: true });
    }
  });
  configureAndCommit(target, 's11-e2e-a');
  linked = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s11-linked-'));
  git(target.root, ['worktree', 'add', '--detach', linked, 'HEAD']);

  const run = parseCli(cli(BIN, linked, ['run']));
  assert.equal(run.ok, true, JSON.stringify(run));
  assert.equal(run.disposition, 'SEMANTICALLY_ACCEPTED');
  assert.equal(run.candidate.status, 'REVIEWABLE_CANDIDATE');
  assert.equal(run.candidate.autoPublished, false);
  assertRuntimeIsTargetLocal(run, linked);
  assert.equal(run.targetBaseSha, git(linked, ['rev-parse', 'HEAD']).stdout.trim());
  assert.equal(fs.readFileSync(path.join(target.root, 'a.txt'), 'utf8'), 'A\n');
  assert.equal(fs.readFileSync(path.join(linked, 'a.txt'), 'utf8'), 'A\n');

  const artifactPath = path.join(resolvePatchEvidenceDir(linked), `${run.candidate.patchId}.patch`);
  const artifactBefore = fs.readFileSync(artifactPath);
  assert.equal(sha256(artifactBefore), run.candidate.patchHash);
  assert.deepEqual(run.candidate.changedPaths, ['a.txt']);
  assertInvocationLifecycle(linked, run.runId);

  const state = readControllerState(path.join(run.runtimeRoot, 'runs', run.runId));
  assert.ok(state.routes.some((route) => route.decision === 'ROUTE_IMPLEMENT_FLASH'));
  assert.ok(state.dispositions.some((record) => record.disposition === 'PATCH_VALID'));
  assert.ok(state.dispositions.some((record) => record.disposition === 'SEMANTICALLY_ACCEPTED'));

  const status = parseCli(cli(BIN, linked, ['status']));
  assert.equal(status.project.projectKey, 's11-e2e-a');
  assert.equal(status.runs.length, 1);
  assert.equal(status.runs[0].candidates[0].autoPublished, false);

  const audit = parseCli(cli(BIN, linked, ['audit', '--last', '1']));
  assert.equal(audit.result.reconciliation.ok, true);
  assert.deepEqual(audit.result.reconciliation.projections, { invocations: 1, workUnits: 1, reviews: 0, usage: 1 });
  assert.equal(audit.result.metrics.calls.total, 1);
  assert.equal(fs.existsSync(audit.outDir), true);

  const review = parseCli(cli(BIN, linked, ['review-export', '--last', '1']));
  assert.equal(fs.existsSync(path.join(review.dir, 'REVIEW.md')), true);
  assert.equal(review.result.reconciliation.ok, true);
  assert.deepEqual(fs.readFileSync(artifactPath), artifactBefore, 'audit/review cannot mutate immutable patch bytes');

  const recovered = parseCli(cli(BIN, linked, ['recover', run.runId]));
  assert.equal(recovered.lifecycleState, 'COMPLETED');
  assert.deepEqual(recovered.reconciled, []);
  assertInvocationLifecycle(linked, run.runId);
  assert.equal(fs.existsSync(path.join(linked, 'lcim')), false);
  assert.equal(git(target.root, ['status', '--porcelain']).stdout.includes('a.txt'), false);
});

test('E2E controller fixture: SOL diagnosis and repair preserve objective evidence and lifecycle accounting', async (t) => {
  const target = makeTarget(t, { mode: 'normal', projectKey: 's11-e2e-sol' });
  const sol = path.join(target.root, 's11-sol.cjs');
  fs.writeFileSync(sol, `
let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  const askId = prompt.match(/Ask id: (lcim_sol_ask_[0-9a-f]+)/)?.[1];
  const criterion = prompt.match(/Criterion \\(sideEffectId\\): (se_[0-9a-f]{64})/)?.[1];
  const requirement = prompt.match(/Criterion requirement \\(authoritative, verbatim\\): (.*)/)?.[1] || '';
  const evidence = prompt.match(/Prior evidence \\(refs into the single bounded evidence universe\\): (.*)/)?.[1]?.split(',')[0]?.trim() || 'controller:rejection';
  process.stdout.write(JSON.stringify({ askId, callType: 'SOL_DIAGNOSE', verdict: 'CAUSE_IDENTIFIED', decisionSummary: 'one bounded diagnosis', evidence: [], failure: { rootCause: 'the bounded criterion failed', evidenceRefs: [evidence], repair: { mustChange: [{ target: 'mutation', change: 'restore the criterion' }], mustNotChange: [{ target: 'contract', reason: 'preserve the contract' }], exactTests: [{ name: 'criterion', expectation: requirement, acceptanceCriterionRef: criterion }], verification: [{ method: 'controller check', expectation: 'criterion passes' }] }, falsification: 'a passing criterion disproves this diagnosis' } }));
});
`, { mode: 0o600 });
  const config = JSON.parse(fs.readFileSync(target.configPath, 'utf8'));
  config.sol.command = ['node', path.basename(sol)];
  config.endpoints['sol-xhigh'] = { baseUrl: 'local://s11-e2e-sol', kind: 'local-command' };
  fs.writeFileSync(target.configPath, `${JSON.stringify(config, null, 2)}\n`);

  let semanticCalls = 0;
  const result = await (await import('../../src/controller/orchestrator.mjs')).runController({
    cwd: target.root,
    semanticValidator: async () => ({ accepted: ++semanticCalls > 1 }),
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.disposition, 'SEMANTICALLY_ACCEPTED');
  assert.equal(result.finalSummary.invocations, 3);
  assert.deepEqual(
    [result.finalSummary.starts, result.finalSummary.completions, result.finalSummary.assessments, result.finalSummary.reconciliations],
    [3, 3, 3, 0],
  );
  assert.ok(result.routeDecisions.some((route) => route.decision === 'ROUTE_SOL_DIAGNOSE'));
  assert.equal(result.patchEvidence.patchHash, result.candidate.patchHash);
  assertInvocationLifecycle(target.root, result.runId);
  const state = readControllerState(path.join(result.runtimeRoot, 'runs', result.runId));
  assert.equal(state.candidates.length, 1);
  assert.equal(state.candidates[0].publication, 'REVIEWABLE_ONLY');
  assert.equal(fs.existsSync(path.join(target.root, 'a.txt')), true);
});

test('E2E audit truth fixture: known lifecycle counts and UNKNOWN facts reconcile exactly', async (t) => {
  const { buildAuditFixture } = await import('../helpers/audit-fixture.mjs');
  const { audit } = await import('../../src/audit/index.mjs');
  const { repo } = await buildAuditFixture(t);
  const { result } = await audit({ cwd: repo.root });
  assert.equal(result.reconciliation.ok, true);
  assert.deepEqual(result.reconciliation.ledger, {
    events: 54,
    invocations: 19,
    starts: 19,
    completions: 17,
    assessments: 17,
    reconciliations: 1,
  });
  assert.deepEqual(result.reconciliation.projections, { invocations: 19, workUnits: 11, reviews: 6, usage: 19 });
  assert.equal(result.metrics.calls.total, 19);
  assert.equal(result.metrics.escalation.solCalls, 5);
  assert.equal(result.metrics.usage.tokens.availability, 'UNKNOWN');
  assert.equal(result.metrics.usage.cost.availability, 'UNKNOWN');
  assert.equal(result.metrics.solFindings.survivedFirstRepair, null);
  assert.ok(result.unknownFacts.some((fact) => fact.fact === 'SOL findings/rechecks/survival/severity'));
  assert.ok(result.reconciliation.checks.every((check) => check.ok));
});
