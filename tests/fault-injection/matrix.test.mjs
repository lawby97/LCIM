import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { runController, recoverRun } from '../../src/controller/orchestrator.mjs';
import { setupProject, loadProjectConfig } from '../../src/project/config.mjs';
import { prepareWorkerWorktree, cleanupWorkerWorktree } from '../../src/git/pipeline.mjs';
import { BaseMismatchError } from '../../src/git/errors.mjs';
import { resolveGitCommonDir } from '../../src/config/runtime-path.mjs';
import { RunStore } from '../../src/runtime/run-store.mjs';
import { LedgerWriteError } from '../../src/logging/errors.mjs';
import { generateId } from '../../src/shared/ids.mjs';

import {
  assertInvocationLifecycle,
  git,
  makeTarget,
} from './helpers.mjs';

function runtimePath(result, ...parts) {
  return path.join(result.runtimeRoot, 'runs', result.runId, ...parts);
}

function controllerEvents(result) {
  const file = runtimePath(result, 'controller', 'events.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

test('fault matrix: provider crash preserves a useful patch but rejects the transport', async (t) => {
  const target = makeTarget(t, { mode: 'crash' });
  const result = await runController({ cwd: target.root });
  assert.equal(result.ok, false);
  assert.equal(result.rejectionCode, 'TRANSPORT_MALFORMED');
  assert.deepEqual(result.patchEvidence.changedPaths, ['a.txt']);
  assert.equal(result.handoff.states.patchObserved, true);
  assert.equal(fs.readFileSync(path.join(target.root, 'a.txt'), 'utf8'), 'A\n');
  assertInvocationLifecycle(target.root, result.runId);
});

test('fault matrix: model timeout preserves patch evidence and fails closed', async (t) => {
  const target = makeTarget(t, { mode: 'timeout', workerTimeoutMs: 250 });
  const result = await runController({ cwd: target.root });
  assert.equal(result.ok, false);
  assert.equal(result.rejectionCode, 'TRANSPORT_MALFORMED');
  assert.deepEqual(result.patchEvidence.changedPaths, ['a.txt']);
  assert.equal(result.handoff.states.patchObserved, true);
  assert.equal(result.finalSummary.invocations, 1);
  assertInvocationLifecycle(target.root, result.runId);
});

test('fault matrix: malformed model output never erases useful patch evidence', async (t) => {
  const target = makeTarget(t, { mode: 'malformed' });
  const result = await runController({ cwd: target.root });
  assert.equal(result.ok, false);
  if (result.rejectionCode !== 'TRANSPORT_MALFORMED') throw new Error(`MALFORMED_RESULT ${JSON.stringify({ disposition: result.disposition, rejectionCode: result.rejectionCode, handoff: result.handoff, errors: result.errors, summary: result.finalSummary })}`);
  assert.deepEqual(result.patchEvidence.changedPaths, ['a.txt']);
  assert.equal(result.handoff.transportDefect, 'TRANSPORT_MALFORMED');
  assertInvocationLifecycle(target.root, result.runId);
});

test('fault matrix: parsed schema failure is distinct from malformed transport and preserves patch', async (t) => {
  const target = makeTarget(t, { mode: 'schema' });
  const result = await runController({ cwd: target.root });
  assert.equal(result.ok, false);
  assert.equal(result.rejectionCode, 'SCHEMA_MISMATCH');
  assert.deepEqual(result.patchEvidence.changedPaths, ['a.txt']);
  assert.equal(result.handoff.states.patchObserved, true);
  assertInvocationLifecycle(target.root, result.runId);
});

test('fault matrix: write-scope violation persists objective evidence before rejection', async (t) => {
  const target = makeTarget(t, { mode: 'scope', allowedWritePaths: ['a.txt'] });
  const result = await runController({ cwd: target.root });
  assert.equal(result.ok, false);
  assert.equal(result.rejectionCode, 'SCOPE_VIOLATION');
  assert.deepEqual(result.patchEvidence.changedPaths, ['a.txt', 'forbidden.txt']);
  assert.equal(result.candidate, null);
  assert.equal(fs.readFileSync(path.join(target.root, 'a.txt'), 'utf8'), 'A\n');
  assertInvocationLifecycle(target.root, result.runId);
});

test('fault matrix: secret-shaped candidate material is rejected without losing patch evidence', async (t) => {
  const target = makeTarget(t, { mode: 'secret' });
  const result = await runController({ cwd: target.root });
  assert.equal(result.ok, false);
  assert.equal(result.rejectionCode, 'SECRET_DENIED_PATH');
  assert.ok(result.patchEvidence);
  assert.deepEqual(result.patchEvidence.changedPaths, ['a.txt']);
  assert.equal(result.candidate, null);
  assertInvocationLifecycle(target.root, result.runId);
});

test('fault matrix: semantic rejection uses one bounded SOL diagnosis and one repair', async (t) => {
  const target = makeTarget(t, { mode: 'normal' });
  const sol = path.join(target.root, 's11-sol.cjs');
  fs.writeFileSync(sol, `
let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  const askId = prompt.match(/Ask id: (lcim_sol_ask_[0-9a-f]+)/)?.[1];
  const criterion = prompt.match(/Criterion \\(sideEffectId\\): (se_[0-9a-f]{64})/)?.[1];
  const requirement = prompt.match(/Criterion requirement \\(authoritative, verbatim\\): (.*)/)?.[1] || '';
  const evidence = prompt.match(/Prior evidence \\(refs into the single bounded evidence universe\\): (.*)/)?.[1]?.split(',')[0]?.trim() || 'controller:rejection';
  process.stdout.write(JSON.stringify({ askId, callType: 'SOL_DIAGNOSE', verdict: 'CAUSE_IDENTIFIED', decisionSummary: 'one bounded cause identified', evidence: [], failure: { rootCause: 'the bounded criterion was not satisfied', evidenceRefs: [evidence], repair: { mustChange: [{ target: 'mutation', change: 'restore the bounded criterion' }], mustNotChange: [{ target: 'contract', reason: 'preserve locked semantics' }], exactTests: [{ name: 'criterion', expectation: requirement, acceptanceCriterionRef: criterion }], verification: [{ method: 'controller check', expectation: 'criterion passes' }] }, falsification: 'a passing criterion disproves this cause' } }));
});
`, { mode: 0o600 });
  const config = JSON.parse(fs.readFileSync(target.configPath, 'utf8'));
  // Fifth-review rule: the only automatic SOL channel is the strict Codex
  // transport gate (gpt-5.6-sol on provider pi); the fixture Pi runs
  // through the capability-gated controller-internal test seam.
  config.endpoints['gpt-5.6-sol'] = { baseUrl: 'https://chatgpt.example.invalid/backend-api', kind: 'external' };
  config.permissions.externalProvider = true;
  fs.writeFileSync(target.configPath, `${JSON.stringify(config, null, 2)}\n`);
  let semanticCalls = 0;
  const { mintSolTestSeam } = await import('../../src/controller/test-seams.mjs');
  const { withCodexOAuthStore, writeCodexFixturePi } = await import('../integration/codex-seam.mjs');
  // Sixth-review rule: tests never depend on the machine's REAL Pi auth
  // store; a fixture OAuth store stands in for the read-only source.
  withCodexOAuthStore(t);
  const result = await runController({
    cwd: target.root,
    semanticValidator: async () => ({ accepted: ++semanticCalls > 1 }),
    solTransportOptions: { piBin: writeCodexFixturePi(t) },
    testCapability: mintSolTestSeam(),
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.finalSummary.invocations, 3);
  assert.equal(result.finalSummary.starts, 3);
  assert.ok(result.routeDecisions.some((route) => route.decision === 'ROUTE_SOL_DIAGNOSE'));
  assertInvocationLifecycle(target.root, result.runId);
});

test('fault matrix: unavailable structural boundary performs zero provider side effects and reconciles START', async (t) => {
  const target = makeTarget(t, { mode: 'normal' });
  const result = await runController({ cwd: target.root, sandboxExecutable: '/not/a/real/sandbox-exec' });
  assert.equal(result.ok, false);
  assert.equal(result.candidate, null);
  assert.equal(result.finalSummary.invocations, 1);
  assert.equal(result.finalSummary.completions, 0);
  assert.equal(result.finalSummary.assessments, 0);
  assert.equal(result.finalSummary.reconciliations, 1);
  assert.equal(result.errors.some((error) => error.code === 'EXECUTION_BOUNDARY_FAILED'), true);
  assert.equal(fs.readFileSync(path.join(target.root, 'a.txt'), 'utf8'), 'A\n');
  assertInvocationLifecycle(target.root, result.runId);
});

test('fault matrix: provider permission denial is a zero-side-effect authorization gate', async (t) => {
  const target = makeTarget(t, { mode: 'normal' });
  const config = JSON.parse(fs.readFileSync(target.configPath, 'utf8'));
  config.worker.command = null;
  config.endpoints['deepseek-v4-flash'] = { baseUrl: 'https://provider.invalid/v4', kind: 'external' };
  config.permissions.externalProvider = false;
  fs.writeFileSync(target.configPath, `${JSON.stringify(config, null, 2)}\n`);
  const result = await runController({ cwd: target.root });
  assert.equal(result.ok, false);
  assert.equal(result.finalSummary.invocations, 0);
  assert.equal(result.errors.some((error) => error.code === 'PROVIDER_PERMISSION_DENIED'), true);
  assert.equal(fs.readFileSync(path.join(target.root, 'a.txt'), 'utf8'), 'A\n');
  assert.equal(fs.existsSync(path.join(target.root, 'S11_FOREIGN_WRITE')), false);
  const events = controllerEvents(result);
  assert.equal(events.some((event) => event.kind === 'EXECUTION_BOUNDARY_VERIFIED'), false);
});

test('fault matrix: missing exact provider endpoint fails closed before worktree/provider execution', async (t) => {
  const target = makeTarget(t, { mode: 'normal' });
  const config = JSON.parse(fs.readFileSync(target.configPath, 'utf8'));
  config.worker.command = null;
  delete config.endpoints['deepseek-v4-flash'];
  config.permissions.externalProvider = true;
  fs.writeFileSync(target.configPath, `${JSON.stringify(config, null, 2)}\n`);
  const result = await runController({ cwd: target.root });
  assert.equal(result.ok, false);
  assert.equal(result.finalSummary.invocations, 0);
  assert.equal(result.candidate, null);
  assert.equal(fs.readFileSync(path.join(target.root, 'a.txt'), 'utf8'), 'A\n');
});

test('fault matrix: wrong expected base is refused before isolated worker creation', async (t) => {
  const target = makeTarget(t, { mode: 'normal' });
  const worktreeRoot = fs.mkdtempSync(path.join(path.dirname(target.root), 's11-wrong-base-'));
  t.after(() => fs.rmSync(worktreeRoot, { recursive: true, force: true }));
  const workUnitId = generateId('work-unit');
  assert.throws(
    () => prepareWorkerWorktree({
      repoDir: target.root,
      worktreeRoot,
      expectedBaseSha: 'f'.repeat(40),
      workUnitId,
    }),
    (error) => error instanceof BaseMismatchError && /PRE_SPAWN|base/i.test(error.message),
  );
  assert.equal(fs.readdirSync(worktreeRoot).length, 0);
  assert.equal(fs.readFileSync(path.join(target.root, 'a.txt'), 'utf8'), 'A\n');
});

test('fault matrix: controller crash after START is reconciled, never fabricated as assessed', async (t) => {
  const target = makeTarget(t, { mode: 'normal' });
  const store = await RunStore.create({ cwd: target.root, targetBaseSha: target.baseSha, configDigest: '1'.repeat(64) });
  const workUnitId = generateId('work-unit');
  await store.startInvocation({ workUnitId, provider: 'pi', model: 'deepseek-v4-flash', role: 'WORKER', reasoningEffort: 'XHIGH' });
  const recovered = await recoverRun({ cwd: target.root, runId: store.runId });
  assert.equal(recovered.reconciled.length, 1);
  assert.equal(recovered.lifecycleState, 'COMPLETED');
  assert.equal(recovered.finalSummary.assessments, 0);
  const lifecycle = assertInvocationLifecycle(target.root, store.runId);
  assert.equal(lifecycle.summary.reconciliations, 1);
});

test('fault matrix: controller crash after COMPLETION is reconciled without an invented assessment', async (t) => {
  const target = makeTarget(t, { mode: 'normal' });
  const store = await RunStore.create({ cwd: target.root, targetBaseSha: target.baseSha, configDigest: '2'.repeat(64) });
  const workUnitId = generateId('work-unit');
  const invocation = await store.startInvocation({ workUnitId, provider: 'pi', model: 'deepseek-v4-flash', role: 'WORKER', reasoningEffort: 'XHIGH' });
  await invocation.complete({ outcome: 'FAILURE', errorCode: 'PROVIDER_EXECUTION_FAILED' });
  const recovered = await recoverRun({ cwd: target.root, runId: store.runId });
  assert.equal(recovered.reconciled.length, 1);
  assert.equal(recovered.finalSummary.completions, 1);
  assert.equal(recovered.finalSummary.assessments, 0);
  const lifecycle = assertInvocationLifecycle(target.root, store.runId);
  const state = [...lifecycle.states.values()][0];
  assert.equal(state.status, 'ORPHANED');
  assert.equal(state.reconciliationReason, 'CRASH_AFTER_COMPLETION');
});

test('fault matrix: ledger writer failure fails closed and cannot invoke a provider', async (t) => {
  const target = makeTarget(t, { mode: 'normal' });
  const store = await RunStore.create({ cwd: target.root, targetBaseSha: target.baseSha, configDigest: '3'.repeat(64) });
  const ledgerFile = path.join(store.runDir, 'events.v2.jsonl');
  const originalMode = fs.statSync(ledgerFile).mode & 0o777;
  fs.chmodSync(ledgerFile, 0o400);
  try {
    await assert.rejects(
      store.startInvocation({ workUnitId: generateId('work-unit'), provider: 'pi', model: 'deepseek-v4-flash', role: 'WORKER', reasoningEffort: 'XHIGH' }),
      (error) => error instanceof LedgerWriteError || /append|write|permission|read-only/i.test(error.message),
    );
    assert.equal(fs.readFileSync(path.join(target.root, 'a.txt'), 'utf8'), 'A\n');
    assert.equal(fs.readFileSync(ledgerFile, 'utf8'), '');
  } finally {
    fs.chmodSync(ledgerFile, originalMode);
  }
});

test('fault matrix: SOL finding surviving one repair reaches bounded STUCK rather than another repair', async () => {
  const { decideRoute } = await import('../../src/routing/policy.mjs');
  const { createBudgetTracker } = await import('../../src/routing/budget.mjs');
  const ctx = {
    workUnitId: 'lcim_wu_' + 'a'.repeat(32),
    runId: 'lcim_run_' + 'b'.repeat(32),
    state: 'AWAITING_SOL_RECHECK',
    semanticContract: null,
    resultAccepted: true,
    latestRejection: null,
    failureHistory: [],
    repairsDispatched: 1,
    solDiagnosis: null,
    solReview: { verdict: 'FINDING', findingIds: ['lcim_finding_' + 'c'.repeat(32)] },
    solFindings: [{ findingId: 'lcim_finding_' + 'c'.repeat(32), status: 'OPEN', repairCycles: 1, rechecks: 1, origin: 'FINAL_REVIEW' }],
    stuckEvidence: {},
    evidenceRefs: [],
    budget: createBudgetTracker({ unitCalls: 4, runCalls: 8 }),
    config: { endpoints: { 'deepseek-v4-flash': { baseUrl: 'https://worker.invalid' }, 'sol-xhigh': { baseUrl: 'https://sol.invalid' } } },
  };
  const decision = decideRoute(ctx);
  assert.equal(decision.decision, 'STOP_STUCK');
  assert.equal(decision.reasonCode, 'SOL_FINDING_SURVIVES_ONE_REPAIR');
  assert.equal(decision.nextState, 'STOPPED_STUCK');
});

test('fault matrix: immutable patch identity remains controller-derived after validation', async (t) => {
  const target = makeTarget(t, {
    mode: 'normal',
    validationCommands: [['node', '-e', "require('node:fs').writeFileSync('validation-only.txt','x')"]],
    allowedWritePaths: ['a.txt'],
  });
  const result = await runController({ cwd: target.root });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const artifact = path.join(resolveGitCommonDir(target.root), 'lcim', 'evidence', 'patch', `${result.patchEvidence.patchId}.patch`);
  const before = fs.readFileSync(artifact);
  assert.equal(crypto.createHash('sha256').update(before).digest('hex'), result.patchEvidence.patchHash);
  assert.equal(result.patchEvidence.changedPaths.includes('validation-only.txt'), false);
  const after = fs.readFileSync(artifact);
  assert.deepEqual(after, before);
  assertInvocationLifecycle(target.root, result.runId);
});
