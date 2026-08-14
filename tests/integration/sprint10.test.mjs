import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

import { setupProject } from '../../src/project/config.mjs';
import { runController } from '../../src/controller/orchestrator.mjs';
import { readControllerState } from '../../src/controller/state.mjs';
import { createWorkerExecutionBoundary, authorizeWorkerExecutionBoundary, runConstrainedProcess } from '../../src/controller/execution-boundary.mjs';
import { createIsolatedWorktree } from '../../src/git/worktree.mjs';
import { inspectWorkerExit, prepareWorkerWorktree, cleanupWorkerWorktree } from '../../src/git/pipeline.mjs';
import { generateId } from '../../src/shared/ids.mjs';
import { resolveGitCommonDir } from '../../src/config/runtime-path.mjs';
import { RunStore } from '../../src/runtime/run-store.mjs';
import { recoverRun } from '../../src/controller/orchestrator.mjs';

function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return result;
}

function makeTarget(t, { dirty = false, mode = 'normal', withRemote = false, credential = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s10-target-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'lcim-test@example.invalid']);
  git(root, ['config', 'user.name', 'LCIM Sprint 10']);
  fs.writeFileSync(path.join(root, 'a.txt'), 'A\n');
  git(root, ['add', 'a.txt']);
  git(root, ['commit', '-m', 'fixture base']);
  const baseSha = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  if (dirty) fs.writeFileSync(path.join(root, 'a.txt'), 'A-dirty\n');

  setupProject({ cwd: root });
  const worker = `
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  const parent = process.argv[2];
  const action = process.argv[3] || 'normal';
  const extra = process.argv[4];
  const id = prompt.match(/WORK_UNIT_ID:\\s+(lcim_wu_[0-9a-f]+)/)?.[1];
  fs.writeFileSync('a.txt', 'B\\n');
  const attempt = (fn) => { try { fn(); } catch (_) {} };
  if (action === 'parent') attempt(() => fs.writeFileSync(path.join(parent, 'a.txt'), 'B\\n'));
  if (action === 'sibling') attempt(() => fs.writeFileSync(path.join(path.dirname(parent), 'lcim-s10-foreign-write'), 'B'));
  if (action === 'common') {
    // Derive the Git-common directory WITHOUT spawning git: the linked
    // worktree's .git file points at <main>/.git/worktrees/<id>, so the
    // common dir is two levels up. (The no-descendant boundary denies any
    // child process, including git.)
    const gitdir = fs.readFileSync(path.join(process.cwd(), '.git'), 'utf8').trim().replace(/^gitdir:\s*/, '');
    const common = path.dirname(path.dirname(path.resolve(process.cwd(), gitdir)));
    attempt(() => fs.writeFileSync(path.join(common, 'lcim', 'runs', 'lcim-s10-forbidden'), 'B'));
    attempt(() => fs.writeFileSync(path.join(common, 'lcim', 'worktrees', 'lcim-s10-forbidden'), 'B'));
    attempt(() => fs.writeFileSync(path.join(common, 'lcim', 'evidence', 'lcim-s10-forbidden'), 'B'));
  }
  if (action === 'credential') attempt(() => { fs.readFileSync(extra, 'utf8'); fs.writeFileSync('credential-read.txt', 'unexpected'); });
  if (action === 'push') attempt(() => { cp.spawnSync('git', ['push', 'origin', 'HEAD:refs/lcim-safety-test/custom'], { stdio: 'ignore' }); });
  if (action === 'malformed') process.stdout.write('not-json');
  else process.stdout.write(JSON.stringify({ workUnitId: id, workerStatus: 'WORK_COMPLETE', summary: 'bounded fixture change', acceptanceClaims: [], remainingIssues: [], reviewRisks: [], uncertainty: 'fixture worker does not decide controller readiness' }));
});
`;
  fs.writeFileSync(path.join(root, 'worker.cjs'), worker);
  const configPath = path.join(root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.allowedWritePaths = ['a.txt'];
  config.worker.command = ['node', 'worker.cjs'];
  config.worker.args = [root, mode];
  config.endpoints['deepseek-v4-flash'] = { baseUrl: 'local://fixture-worker', kind: 'local-command' };
  let remote = null;
  if (withRemote) {
    remote = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s10-remote-'));
    t.after(() => fs.rmSync(remote, { recursive: true, force: true }));
    git(remote, ['init', '--bare', '-b', 'main']);
    git(root, ['remote', 'add', 'origin', 'file:///definitely-unreachable-lcim-s10']);
    git(root, ['config', '--add', 'remote.origin.pushurl', remote]);
  }
  let credentialPath = null;
  if (credential) {
    credentialPath = path.join(root, 'fixture-git-credential');
    fs.writeFileSync(credentialPath, 'non-secret-fixture-content');
    config.worker.args.push(credentialPath);
  }
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return { root, baseSha, remote, credentialPath };
}

function runtimeFile(result, ...parts) {
  return path.join(result.runtimeRoot, 'runs', result.runId, ...parts);
}

test('linked target worktree runs independently while sharing only the Git-common runtime store', async (t) => {
  const primary = makeTarget(t, { mode: 'normal' });
  git(primary.root, ['add', '.lcim', 'worker.cjs']);
  git(primary.root, ['commit', '-m', 'fixture project config']);
  const linked = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s10-linked-'));
  t.after(() => {
    git(primary.root, ['worktree', 'remove', '--force', linked], { allowFailure: true });
    fs.rmSync(linked, { recursive: true, force: true });
  });
  git(primary.root, ['worktree', 'add', '--detach', linked, 'HEAD']);
  const result = await runController({ cwd: linked });
  assert.equal(result.ok, true);
  assert.equal(result.disposition, 'SEMANTICALLY_ACCEPTED');
  assert.equal(fs.readFileSync(path.join(linked, 'a.txt'), 'utf8'), 'A\n');
  assert.equal(fs.readFileSync(path.join(primary.root, 'a.txt'), 'utf8'), 'A\n');
  assert.equal(result.runtimeRoot, path.join(resolveGitCommonDir(primary.root), 'lcim'));
  assert.match(result.runtimeRoot, /[\\/]\.git[\\/]lcim$/);
});

test('incomplete invocation recovery appends reconciliation evidence and finalizes the run', async (t) => {
  const fixture = makeTarget(t, { mode: 'normal' });
  const store = await RunStore.create({ cwd: fixture.root, targetBaseSha: fixture.baseSha, configDigest: 'a'.repeat(64) });
  const workUnitId = generateId('work-unit');
  await store.startInvocation({
    workUnitId,
    provider: 'pi',
    model: 'deepseek-v4-flash',
    role: 'WORKER',
    reasoningEffort: 'XHIGH',
  });
  const recovered = await recoverRun({ cwd: fixture.root, runId: store.runId });
  assert.equal(recovered.lifecycleState, 'COMPLETED');
  assert.equal(recovered.reconciled.length, 1);
  assert.equal(recovered.finalSummary.incompleteInvocationIds.length, 0);
});

test('successful candidate uses two independent target fixtures and preserves runtime locality', async (t) => {
  const first = makeTarget(t, { dirty: true });
  const second = makeTarget(t, { mode: 'normal' });
  const a = await runController({ cwd: first.root });
  const b = await runController({ cwd: second.root });
  for (const [fixture, result] of [[first, a], [second, b]]) {
    assert.equal(result.ok, true);
    assert.equal(result.disposition, 'SEMANTICALLY_ACCEPTED');
    assert.deepEqual(result.patchEvidence.changedPaths, ['a.txt']);
    assert.equal(result.handoff.states.responseSchemaValid, true);
    assert.equal(result.cleanup.removed, true);
    assert.equal(fs.readFileSync(path.join(fixture.root, 'a.txt'), 'utf8'), fixture === first ? 'A-dirty\n' : 'A\n');
    assert.match(result.runtimeRoot, /\.git[\\/]lcim$/);
    assert.equal(git(fixture.root, ['ls-files']).stdout.includes('lcim/runs/'), false);
    const boundary = JSON.parse(fs.readFileSync(result.boundaryEvidencePath, 'utf8'));
    assert.equal(boundary.structural, true);
    assert.equal(boundary.network.blocked, true);
    assert.equal(boundary.probes.profileCompiled, true);
    assert.ok(boundary.probes.deniedWrites.every((probe) => probe.blocked === true));
    assert.equal(boundary.boundaryConfiguration.selfWidening.blocked, true);
  }
});

test('external-provider permission denial fails closed before any provider invocation', async (t) => {
  const fixture = makeTarget(t, { mode: 'normal' });
  const configPath = path.join(fixture.root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.worker.command = null;
  config.endpoints['deepseek-v4-flash'] = { baseUrl: 'https://provider.example.invalid/v4', kind: 'external' };
  config.permissions.externalProvider = false;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const result = await runController({ cwd: fixture.root });
  assert.equal(result.ok, false);
  assert.equal(result.finalSummary.invocations, 0);
  assert.ok(result.errors.some((error) => error.code === 'PROVIDER_PERMISSION_DENIED'));
  assert.equal(fs.readFileSync(path.join(fixture.root, 'a.txt'), 'utf8'), 'A\n');
});

test('malformed worker transport preserves useful controller patch evidence without accepting the worker claim', async (t) => {
  const fixture = makeTarget(t, { mode: 'malformed' });
  const result = await runController({ cwd: fixture.root });
  assert.equal(result.ok, false);
  assert.equal(result.rejectionCode, 'TRANSPORT_MALFORMED');
  assert.deepEqual(result.patchEvidence.changedPaths, ['a.txt']);
  assert.equal(result.handoff.states.patchObserved, true);
  assert.equal(result.handoff.transportDefect, 'TRANSPORT_MALFORMED');
  assert.equal(fs.readFileSync(path.join(fixture.root, 'a.txt'), 'utf8'), 'A\n');
  assert.equal(result.cleanup.removed, true);
});

test('semantic rejection routes through the compiled SOL diagnosis and a bounded repair', async (t) => {
  const fixture = makeTarget(t, { mode: 'normal' });
  const solScript = `
let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  const askId = prompt.match(/Ask id: (lcim_sol_ask_[0-9a-f]+)/)[1];
  const criterion = prompt.match(/Criterion \\(sideEffectId\\): (se_[0-9a-f]{64})/)[1];
  const requirement = prompt.match(/Criterion requirement \\(authoritative, verbatim\\): (.*)/)[1];
  const evidence = prompt.match(/Prior evidence \\(refs into the single bounded evidence universe\\): (.*)/)[1].split(',')[0].trim();
  process.stdout.write(JSON.stringify({
    askId,
    callType: 'SOL_DIAGNOSE',
    verdict: 'CAUSE_IDENTIFIED',
    decisionSummary: 'one bounded cause identified',
    evidence: [],
    failure: {
      rootCause: 'the bounded controller gate was not satisfied',
      evidenceRefs: [evidence],
      repair: {
        mustChange: [{ target: 'mutation', change: 'restore the bounded controller gate' }],
        mustNotChange: [{ target: 'contract', reason: 'preserve locked semantics' }],
        exactTests: [{ name: 'criterion test', expectation: requirement, acceptanceCriterionRef: criterion }],
        verification: [{ method: 'controller check', expectation: 'the criterion is satisfied' }]
      },
      falsification: 'a passing controller gate would disprove this cause'
    }
  }));
});
`;
  fs.writeFileSync(path.join(fixture.root, 'sol.cjs'), solScript);
  const configPath = path.join(fixture.root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.sol.command = ['node', 'sol.cjs'];
  config.endpoints['sol-xhigh'] = { baseUrl: 'local://fixture-sol', kind: 'local-command' };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  let semanticCalls = 0;
  const result = await runController({
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: ++semanticCalls > 1 }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.disposition, 'SEMANTICALLY_ACCEPTED');
  assert.equal(semanticCalls, 2);
  assert.ok(result.routeDecisions.some((decision) => decision.decision === 'ROUTE_SOL_DIAGNOSE'));
  assert.equal(result.finalSummary.invocations, 3);
  assert.equal(result.finalSummary.starts, 3);
  assert.equal(result.finalSummary.completions, 3);
  assert.equal(result.finalSummary.assessments, 3);
});

test('parent, sibling, foreign, and Git-common runtime writes are prevented structurally', async (t) => {
  for (const mode of ['parent', 'sibling', 'common']) {
    const fixture = makeTarget(t, { mode });
    const result = await runController({ cwd: fixture.root });
    assert.equal(result.ok, true, mode);
    assert.equal(fs.readFileSync(path.join(fixture.root, 'a.txt'), 'utf8'), 'A\n');
    assert.equal(fs.existsSync(path.join(path.dirname(fixture.root), 'lcim-s10-foreign-write')), false);
    const common = resolveGitCommonDir(fixture.root);
    assert.equal(fs.existsSync(path.join(common, 'lcim', 'runs', 'lcim-s10-forbidden')), false);
    assert.equal(fs.existsSync(path.join(common, 'lcim', 'worktrees', 'lcim-s10-forbidden')), false);
    assert.equal(fs.existsSync(path.join(common, 'lcim', 'evidence', 'lcim-s10-forbidden')), false);
  }
});

test('credential material is not readable and the verified boundary records isolation', async (t) => {
  const fixture = makeTarget(t, { mode: 'credential', credential: true });
  const result = await runController({ cwd: fixture.root, credentialProbePaths: [fixture.credentialPath] });
  assert.equal(result.ok, true);
  const boundary = JSON.parse(fs.readFileSync(result.boundaryEvidencePath, 'utf8'));
  assert.ok(boundary.credentialIsolation.checkedPaths.includes(fs.realpathSync(fixture.credentialPath)));
  assert.equal(boundary.credentialIsolation.mode, 'environment-stripped-and-filesystem-denied');
  assert.equal(fs.existsSync(path.join(fixture.root, 'credential-read.txt')), false);
});

test('local push attempt is blocked, custom remote ref is absent, and Sprint-03 remote detection remains active', async (t) => {
  const fixture = makeTarget(t, { mode: 'push', withRemote: true });
  const result = await runController({ cwd: fixture.root });
  assert.equal(result.ok, false);
  assert.equal(result.rejectionCode, 'SCOPE_VIOLATION');
  assert.ok(result.patchEvidence);
  const ref = git(fixture.remote, ['show-ref', 'refs/lcim-safety-test/custom'], { allowFailure: true });
  assert.notEqual(ref.status, 0);
  const state = readControllerState(runtimeFile(result));
  const workerEvent = state.events.find((event) => event.kind === 'WORKER_ASSESSMENT');
  assert.equal(workerEvent.safety.ok, false);
  assert.equal(workerEvent.safety.code, 'SCOPE_VIOLATION');
  const boundary = JSON.parse(fs.readFileSync(result.boundaryEvidencePath, 'utf8'));
  assert.equal(boundary.network.mode, 'DENY_ALL');
  assert.equal(boundary.network.blocked, true);
});

test('Sprint-03 content-digest defense fails closed if a parent dirty byte changes despite identical porcelain', async (t) => {
  const fixture = makeTarget(t, { dirty: true });
  const worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s10-defense-'));
  t.after(() => fs.rmSync(worktreeRoot, { recursive: true, force: true }));
  const workUnitId = generateId('work-unit');
  const worktree = prepareWorkerWorktree({ repoDir: fixture.root, worktreeRoot, expectedBaseSha: fixture.baseSha, workUnitId });
  fs.writeFileSync(path.join(fixture.root, 'a.txt'), 'A-dirty-but-changed\n');
  assert.throws(
    () => inspectWorkerExit({ repoDir: fixture.root, worktreeDir: worktree.worktreeDir, expectedBaseSha: fixture.baseSha, snapshot: worktree }),
    /contents changed|digest/i,
  );
  cleanupWorkerWorktree({ repoDir: fixture.root, worktreeId: worktree.worktreeId, worktreeDir: worktree.worktreeDir, evidenceRefs: [] });
});

test('unavailable structural boundary fails closed before worker execution', async (t) => {
  const fixture = makeTarget(t, { mode: 'normal' });
  const result = await runController({ cwd: fixture.root, sandboxExecutable: '/definitely/not-a-seatbelt-sandbox' });
  assert.equal(result.ok, false);
  // R3: the invocation ledger records the attempted-but-never-spawned
  // invocation with an explicit CRASH_AFTER_START reconciliation (no
  // provider process ever ran; the boundary authorization precedes spawn).
  assert.equal(result.finalSummary.invocations, 1);
  assert.equal(result.finalSummary.starts, 1);
  assert.equal(result.finalSummary.completions, 0);
  assert.equal(result.finalSummary.reconciliations, 1);
  assert.equal(fs.readFileSync(path.join(fixture.root, 'a.txt'), 'utf8'), 'A\n');
  assert.ok(result.errors.some((error) => error.code === 'EXECUTION_BOUNDARY_FAILED'));
});

test('direct boundary API rejects caller claims and only runs after objective verification', async (t) => {
  const fixture = makeTarget(t, { mode: 'normal' });
  const worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s10-api-'));
  t.after(() => fs.rmSync(worktreeRoot, { recursive: true, force: true }));
  const runDir = path.join(resolveGitCommonDir(fixture.root), 'lcim', 'boundary-api-test');
  fs.mkdirSync(runDir, { recursive: true });
  const worktree = createIsolatedWorktree({ repoDir: fixture.root, worktreeRoot, expectedBaseSha: fixture.baseSha, workUnitId: generateId('work-unit') });
  const boundary = createWorkerExecutionBoundary({ repoDir: fixture.root, worktreeDir: worktree.worktreeDir, runDir, workUnitId: worktree.workUnitId });
  assert.throws(() => runConstrainedProcess({ ...boundary, sandboxed: true }, { command: ['/bin/true'] }), /verified|boundary/i);
  fs.rmSync(boundary.profilePath, { force: true });
  const authorized = await authorizeWorkerExecutionBoundary({ repoDir: fixture.root, worktreeDir: worktree.worktreeDir, runDir, workUnitId: worktree.workUnitId });
  const process = await runConstrainedProcess(authorized.boundary, { command: ['/bin/sh'], args: ['-c', 'printf ok > api-boundary-proof'] });
  assert.equal(process.status, 0);
  assert.equal(fs.readFileSync(path.join(worktree.worktreeDir, 'api-boundary-proof'), 'utf8'), 'ok');
  fs.rmSync(path.join(worktree.worktreeDir, 'api-boundary-proof'), { force: true });
  cleanupWorkerWorktree({ repoDir: fixture.root, worktreeId: worktree.worktreeId, worktreeDir: worktree.worktreeDir, evidenceRefs: [] });
});
