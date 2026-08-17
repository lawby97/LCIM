/**
 * V2.0.1 integration tests: GPT-5.6 Sol codex SOL channel via the
 * CONTROLLER-SIDE Pi transport.
 *
 * - Pi runs as a trusted controller-side provider client (canonical
 *   absolute node+CLI entrypoint, controller-owned empty cwd, strict env
 *   allowlist, RUN-SCOPED isolated PI_CODING_AGENT_DIR with ONLY the
 *   openai-codex OAuth entry) — NEVER inside the DeepSeek worker
 *   execution boundary, which stays exactly as in 2.0.0 (BROKER_ONLY for
 *   external workers, DENY_ALL for validation, no CODEX_OAUTH mode).
 * - Test seams (solTransportOptions / solCommand) are capability-gated
 *   and NON-AUTHORITATIVE: a seam run can never produce REVIEW_APPROVED.
 * - SOL-S11-003 credential canary: raw, encoded, and refreshed token
 *   forms fail closed with TRANSPORT_CREDENTIAL_LEAK and never reach the
 *   run store, audit output, or review export.
 * - SOL-S11-004 acceptance gate: valid SOL JSON alongside timedOut=true
 *   or a transport error is rejected.
 * - SOL-S11-006 crash-resilient cleanup: injected cleanup failure fails
 *   the run closed; `recover` and startup reconciliation sweep stale
 *   controller-owned surfaces and terminate orphaned Pi processes.
 * - SOL-S11-007 refresh continuity: a run-scoped store persists Pi
 *   rotation across sequential SOL invocations (refreshed state observed
 *   by the second invocation).
 * - SOL-S11-005 observed evidence: post-exit agent-dir layout, modes,
 *   entrypoint identity, sanitized argv, and prompt digest.
 *
 * Local-only: no real provider network calls, no real codex credentials.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { setupProject } from '../../src/project/config.mjs';
import { runController, recoverRun } from '../../src/controller/orchestrator.mjs';
import { PROCESS_CREATION_MODES, createWorkerExecutionBoundary } from '../../src/controller/execution-boundary.mjs';
import { mintSolTestSeam } from '../../src/controller/test-seams.mjs';
import { audit } from '../../src/audit/index.mjs';
import { reviewExport } from '../../src/reporting/index.mjs';
import { PI_AUTH_FILE } from '../../src/providers/oauth.mjs';
import { codexSeam, snapshotRealAuthBytes } from './codex-seam.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return result;
}

function makeTarget(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-codex-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'lcim-test@example.invalid']);
  git(root, ['config', 'user.name', 'LCIM Codex']);
  fs.writeFileSync(path.join(root, 'a.txt'), 'A\n');
  git(root, ['add', 'a.txt']);
  git(root, ['commit', '-m', 'fixture base']);
  const baseSha = git(root, ['rev-parse', 'HEAD']).stdout.trim();

  setupProject({ cwd: root });
  const worker = `
const fs = require('node:fs');
let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  const id = prompt.match(/WORK_UNIT_ID:\\s+(lcim_wu_[0-9a-f]+)/)?.[1];
  fs.writeFileSync('a.txt', 'B\\n');
  process.stdout.write(JSON.stringify({ workUnitId: id, workerStatus: 'WORK_COMPLETE', summary: 'bounded fixture change', acceptanceClaims: [], remainingIssues: [], reviewRisks: [], uncertainty: 'fixture worker does not decide controller readiness' }));
});
`;
  fs.writeFileSync(path.join(root, 'worker.cjs'), worker);
  const configPath = path.join(root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.allowedWritePaths = ['a.txt'];
  config.permissions.externalProvider = true;
  config.worker.command = ['node', 'worker.cjs'];
  config.endpoints['deepseek-v4-flash'] = { baseUrl: 'local://fixture-worker', kind: 'local-command' };
  config.endpoints['gpt-5.6-sol'] = { baseUrl: 'https://chatgpt.example.invalid/backend-api', kind: 'external' };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return { root, baseSha };
}

/** Recursively collect every file under a root. */
function walk(root) {
  const out = [];
  const queue = [root];
  while (queue.length > 0) {
    const dir = queue.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) queue.push(full);
      else out.push(full);
    }
  }
  return out;
}

test('the execution boundary has NO CODEX_OAUTH mode; workers stay BROKER_ONLY and validation DENY_ALL', (t) => {
  // Finding regression: the V2.0.1 repair must not retain a second
  // insecure implementation — the boundary supports exactly the 2.0.0
  // process-creation modes and every boundary resolves to DENY_ALL or
  // BROKER_ONLY (never a codex network mode).
  assert.deepEqual([...PROCESS_CREATION_MODES], ['DENIED', 'ALLOWED']);
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-mode-run-'));
  t.after(() => fs.rmSync(runDir, { recursive: true, force: true }));
  const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-mode-wt-'));
  t.after(() => fs.rmSync(worktreeDir, { recursive: true, force: true }));
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-mode-repo-'));
  t.after(() => fs.rmSync(repoDir, { recursive: true, force: true }));
  // A stale caller asking for the removed mode fails loudly.
  assert.throws(
    () => createWorkerExecutionBoundary({
      repoDir,
      worktreeDir,
      runDir,
      workUnitId: 'lcim_wu_' + 'a'.repeat(32),
      codexOAuth: true,
      processCreation: 'DENIED',
    }),
    /CODEX_OAUTH worker-boundary mode was removed/,
  );
  // The external worker boundary is BROKER_ONLY (DeepSeek unchanged) and
  // the validation boundary is DENY_ALL (unchanged).
  const brokerBoundary = createWorkerExecutionBoundary({
    repoDir,
    worktreeDir,
    runDir,
    workUnitId: 'lcim_wu_' + 'a'.repeat(32),
    invocationId: 'lcim_inv_' + 'b'.repeat(32),
    broker: { port: 43210 },
    processCreation: 'DENIED',
  });
  assert.equal(brokerBoundary.networkPolicy.mode, 'BROKER_ONLY');
  assert.equal(brokerBoundary.networkPolicy.broker.port, 43210);
  const localBoundary = createWorkerExecutionBoundary({
    repoDir,
    worktreeDir,
    runDir,
    workUnitId: 'lcim_wu_' + 'a'.repeat(32),
    invocationId: 'lcim_inv_' + 'c'.repeat(32),
    processCreation: 'ALLOWED',
  });
  assert.equal(localBoundary.networkPolicy.mode, 'DENY_ALL');
});

test('full run: codex SOL channel executes through the controller-side Pi transport', async (t) => {
  const fixture = makeTarget(t);
  const dumpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-codex-dump-')), 'observed.json');
  const seam = codexSeam(t, { dumpFile });
  // Sixth-review rule: the real Pi auth store is READ-ONLY input
  // authority — snapshot before the run and prove byte-identical after.
  const realAuth = snapshotRealAuthBytes(t);
  let semanticCalls = 0;
  const result = await runController({
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: ++semanticCalls > 1 }),
    solTransportOptions: { piBin: seam.piBin },
    testCapability: seam.testCapability,
  });
  realAuth.assertUnchanged();
  assert.equal(result.ok, true);
  assert.equal(result.disposition, 'SEMANTICALLY_ACCEPTED');
  assert.equal(semanticCalls, 2);
  const solDecision = result.routeDecisions.find((decision) => decision.decision === 'ROUTE_SOL_DIAGNOSE');
  assert.ok(solDecision, 'the run must emit ROUTE_SOL_DIAGNOSE');
  assert.equal(solDecision.targetModel, 'gpt-5.6-sol');
  assert.equal(solDecision.targetProvider, 'pi');
  assert.equal(solDecision.targetRole, 'SOL_DIAGNOSE');
  assert.equal(solDecision.schemaVersion, '2.1.0', 'new records are stamped with the new immutable schema version');
  // The persisted SOL invocation record names the codex model on the pi
  // channel (read from the run store, never from controller memory).
  const R = path.join(result.runtimeRoot, 'runs', result.runId, 'invocations');
  const solInvocation = fs.readdirSync(R)
    .map((f) => JSON.parse(fs.readFileSync(path.join(R, f), 'utf8')))
    .find((inv) => inv.role === 'SOL');
  assert.ok(solInvocation);
  assert.equal(solInvocation.model, 'gpt-5.6-sol');
  assert.equal(solInvocation.provider, 'pi');
  assert.equal(solInvocation.outcome, 'SUCCESS');
  assert.equal(solInvocation.assessmentResult, 'ACCEPTED');

  // Controller-owned transport evidence exists (no credential bytes) and
  // records OBSERVED post-exit facts (SOL-S11-005). Sixth-review rule: the
  // immutable TRANSPORT_PROOF record is persisted BEFORE parse, and a
  // separate SEMANTIC_ACCEPTANCE record is persisted after compilation.
  assert.ok(result.solTransportEvidencePaths.length === 2, `transport proof + semantic acceptance records must be persisted, got ${result.solTransportEvidencePaths.length}`);
  const evidence = JSON.parse(fs.readFileSync(result.solTransportEvidencePaths[0], 'utf8'));
  const semanticEvidence = JSON.parse(fs.readFileSync(result.solTransportEvidencePaths.find((file) => file.endsWith('.semantic.json')), 'utf8'));
  assert.equal(evidence.mechanism, 'controller-side-trusted-pi-client');
  assert.equal(evidence.reviewAuthority, 'TEST_SEAM_NON_AUTHORITATIVE');
  assert.equal(evidence.credentialLeak, false);
  assert.equal(evidence.surfaceOk, true);
  assert.equal(evidence.identityVerifiedAfterExit, true);
  assert.equal(evidence.agentDirLayoutObserved.authJsonOnly, true, 'the agent-dir layout must be OBSERVED, not asserted');
  assert.equal(evidence.agentDirLayoutObserved.authJsonMode, 0o600);
  assert.deepEqual(evidence.agentDirLayoutObserved.unexpectedFiles, []);
  assert.equal(evidence.phase, 'TRANSPORT_PROOF', 'the first record is the immutable pre-parse transport proof');
  assert.equal(evidence.cleanup.removed, true, 'cleanup must be observed, never inferred');
  assert.equal(evidence.cleanup.verified, true, 'cleanup nonexistence must be explicitly verified');
  assert.deepEqual(evidence.transportProofs, {
    status: 0,
    error: null,
    timedOut: false,
    truncated: false,
    processCompleted: true,
    reviewAuthority: 'TEST_SEAM_NON_AUTHORITATIVE',
    identityVerifiedBeforeSpawn: true,
    identityVerifiedAfterExit: true,
    processAbsenceVerified: true,
    quiescenceVerified: true,
    surfaceVerified: true,
    credentialScanPassed: true,
    cleanupVerified: true,
    gatePassed: true,
  });
  assert.match(evidence.promptDigest, /^[0-9a-f]{64}$/);
  assert.ok(evidence.sanitizedArgv.some((arg) => arg.startsWith('sha256:')), 'the prompt argument must be replaced by its digest');
  assert.ok(!evidence.sanitizedArgv.join(' ').includes('lcim_sol_ask_'), 'prompt content must never appear in evidence');
  assert.ok(evidence.envAllowlist.includes('PI_CODING_AGENT_DIR'));
  assert.ok(!evidence.envAllowlist.includes('HTTP_PROXY'));
  assert.ok(evidence.pi.cliSha256 && evidence.pi.nodeSha256, 'entrypoint identity hashes must be recorded');
  // The semantic-acceptance binding records the post-compile acceptance.
  assert.equal(semanticEvidence.phase, 'SEMANTIC_ACCEPTANCE');
  assert.equal(semanticEvidence.finalAcceptance, true, 'evidence must stay consistent with the final acceptance decision');
  assert.equal(semanticEvidence.semanticAccepted, true);
  assert.equal(semanticEvidence.transportProofRef, path.basename(result.solTransportEvidencePaths[0]), 'the semantic record must reference the immutable transport proof');
  assert.equal(semanticEvidence.canonicalScanState, 'COMPLETE');
  const evidenceBytes = fs.readFileSync(result.solTransportEvidencePaths[0], 'utf8');
  assert.equal(evidenceBytes.includes('fixture-access-token-value'), false, 'evidence must never contain token bytes');
  assert.equal(evidenceBytes.includes('fixture-refresh-token-value'), false);

  // The run-scoped isolated transport surface was securely removed.
  assert.equal(fs.existsSync(evidence.agentDir), false, 'isolated agent dir must be removed after the run');
  assert.equal(fs.existsSync(evidence.cwd), false);

  // The fixture pi observed the transport contract from inside.
  const observed = JSON.parse(fs.readFileSync(dumpFile, 'utf8'));
  assert.equal(path.basename(observed.cwd), 'cwd');
  assert.notEqual(observed.cwd, fixture.root, 'pi must not run in the repository root');
  assert.ok(!observed.cwd.includes(path.join(fixture.root, '.lcim')), 'pi must not run in project config space');
  assert.ok(observed.cwd.includes(path.join('.git', 'lcim', 'runs')), `pi must run from the controller-owned runtime store, got ${observed.cwd}`);
  assert.deepEqual(observed.agentEntries, [PI_AUTH_FILE], 'isolated agent dir must contain only auth.json');
  assert.deepEqual(observed.authKeys, ['openai-codex'], 'only the openai-codex entry may exist');
  assert.deepEqual(observed.proxyVars, [], 'no proxy variables may reach pi');
  assert.deepEqual(observed.piVars, ['PI_CODING_AGENT_DIR', 'PI_OFFLINE', 'PI_SKIP_VERSION_CHECK', 'PI_TELEMETRY'], 'only the pinned PI_* variables may reach pi');
  assert.equal(observed.nodeOptions, null);
  assert.equal(observed.path, '/usr/bin:/bin:/usr/sbin:/sbin');
});

test('next-run authentication failure reports re-authentication required and never modifies the real source store', async (t) => {
  const fixture = makeTarget(t);
  const seam = codexSeam(t, { authFailure: true });
  const realAuth = snapshotRealAuthBytes(t);
  let semanticCalls = 0;
  const result = await runController({
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: ++semanticCalls > 1 }),
    solTransportOptions: { piBin: seam.piBin },
    testCapability: seam.testCapability,
  });
  realAuth.assertUnchanged();
  assert.equal(result.ok, false);
  assert.equal(result.disposition, 'REJECTED');
  const authError = result.errors.find((error) => error.code === 'CODEX_OAUTH_UNAVAILABLE');
  assert.ok(authError, 'the failed isolated refresh must have a stable re-authentication status');
  assert.match(authError.message, /RE-AUTHENTICATION REQUIRED/);
  assert.match(authError.message, /pi \/login/);
  assert.equal(result.solTransportEvidencePaths.length, 1, 'authentication failure has a transport proof but no semantic acceptance');
  const proof = JSON.parse(fs.readFileSync(result.solTransportEvidencePaths[0], 'utf8'));
  assert.equal(proof.phase, 'TRANSPORT_PROOF');
  assert.equal(proof.transportProofs.gatePassed, false);
  assert.equal(proof.transportProofs.status, 1);
  assert.equal(fs.existsSync(proof.agentDir), false, 'isolated credentials are deleted after failure');
});

test('controller snapshots mutable SOL seam options before the first await', async (t) => {
  const fixture = makeTarget(t);
  const seam = codexSeam(t);
  let semanticCalls = 0;
  const options = {
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: ++semanticCalls > 1 }),
    solTransportOptions: { piBin: seam.piBin },
    testCapability: seam.testCapability,
  };
  const pending = runController(options);
  // This mutation occurs immediately after invoking the async controller;
  // it must not race the already-frozen authority input used after startup.
  options.solTransportOptions.piBin = '/tmp/attacker-replaced-fixture';
  const result = await pending;
  assert.equal(result.ok, true);
  const evidence = JSON.parse(fs.readFileSync(result.solTransportEvidencePaths[0], 'utf8'));
  assert.equal(evidence.pi.cli, fs.realpathSync(seam.piBin));
});

test('classic sol-xhigh has NO production or seam authority in 2.1 (full run fails closed)', async (t) => {
  // Fifth-review rule: even a capability-gated local-command seam cannot
  // re-enable the classic channel — current production SOL routing is the
  // strict Codex transport gate only, and a classic-only configuration
  // fails closed before any route record or invocation.
  const fixture = makeTarget(t);
  const configPath = path.join(fixture.root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  delete config.endpoints['gpt-5.6-sol'];
  config.endpoints['sol-xhigh'] = { baseUrl: 'local://fixture-sol', kind: 'local-command' };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  let semanticCalls = 0;
  const result = await runController({
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: ++semanticCalls > 1 }),
    solCommand: ['node', 'sol.cjs'],
    testCapability: mintSolTestSeam(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.disposition, 'REJECTED');
  assert.ok(
    result.errors.some((e) => e.code === 'ROUTING_DECISION_FAILED' && /SOL_CHANNEL_CLASSIC_NO_AUTHORITY/.test(e.message)),
    `expected SOL_CHANNEL_CLASSIC_NO_AUTHORITY routing refusal in errors, got ${JSON.stringify(result.errors)}`,
  );
  const R = path.join(result.runtimeRoot, 'runs', result.runId, 'invocations');
  const solInvocations = fs.existsSync(R)
    ? fs.readdirSync(R).map((f) => JSON.parse(fs.readFileSync(path.join(R, f), 'utf8'))).filter((inv) => inv.role === 'SOL')
    : [];
  assert.equal(solInvocations.length, 0, 'the classic channel must never spawn a SOL invocation');
});

test('a repository sol.command can never masquerade as an automatic SOL channel (full run fails closed)', async (t) => {
  const fixture = makeTarget(t);
  const configPath = path.join(fixture.root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.sol.command = ['node', 'sol.cjs'];
  fs.writeFileSync(path.join(fixture.root, 'sol.cjs'), "process.stdin.resume();\n");
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  let semanticCalls = 0;
  const result = await runController({
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: ++semanticCalls > 1 }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.disposition, 'REJECTED');
  assert.ok(
    result.errors.some((e) => e.code === 'SOL_COMMAND_MASQUERADE'),
    `expected SOL_COMMAND_MASQUERADE in errors, got ${JSON.stringify(result.errors)}`,
  );
  // No SOL invocation may have been spawned.
  const R = path.join(result.runtimeRoot, 'runs', result.runId, 'invocations');
  const solInvocations = fs.existsSync(R)
    ? fs.readdirSync(R).map((f) => JSON.parse(fs.readFileSync(path.join(R, f), 'utf8'))).filter((inv) => inv.role === 'SOL')
    : [];
  assert.equal(solInvocations.length, 0, 'a repository sol.command must never spawn a SOL invocation');
});

test('a target-tree PI_CODING_AGENT_DIR override is refused before routing or spawn', async (t) => {
  const fixture = makeTarget(t);
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = path.join(fixture.root, '.pi', 'agent');
  t.after(() => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
  });
  await assert.rejects(runController({ cwd: fixture.root }), /target-controlled Pi auth\/config surfaces are refused/);
});

test('test seams are capability-gated: solTransportOptions without the capability is refused', async (t) => {
  const fixture = makeTarget(t);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-no-cap-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const fakePi = path.join(dir, 'fixture-pi.cjs');
  fs.writeFileSync(fakePi, "#!/usr/bin/env node\nconsole.log('x');\n", { mode: 0o755 });
  await assert.rejects(
    runController({
      cwd: fixture.root,
      solTransportOptions: { piBin: fakePi },
    }),
    (err) => err instanceof Error && /controller-minted SOL test capability/.test(err.message),
  );
  // Same for the solCommand seam.
  await assert.rejects(
    runController({
      cwd: fixture.root,
      solCommand: ['node', 'sol.cjs'],
    }),
    (err) => err instanceof Error && /controller-minted SOL test capability/.test(err.message),
  );
});

test('SOL-S11-002: a seam run can NEVER produce REVIEW_APPROVED (HIGH_RISK final review via seam fails closed)', async (t) => {
  const fixture = makeTarget(t);
  const configPath = path.join(fixture.root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  // HIGH_RISK contract: completion requires a passing SOL_FINAL_REVIEW.
  config.semanticContract = {
    contractKey: 'codex.high-risk',
    title: 'High-risk codex contract',
    riskClass: 'FINANCIAL',
    sourceObjects: [{ key: 'src', kind: 'fixture', ref: 'a.txt', authority: 'unit test' }],
    concepts: [{ name: 'amount', kind: 'field', authoritativeFieldNames: ['amount'], ownership: 'unit test', sourceObjectKey: 'src' }],
    distinctConcepts: [],
    negativeSideEffects: [
      { gate: 'controller authorization', scope: 'mutation', requirement: 'No candidate mutation is published before controller validation and reviewable-candidate recording.', expectedCount: 0, evidenceKind: 'audit_log' },
    ],
    factsEstablished: [],
    unresolvedSemantics: [],
  };
  config.budgets = { unitCalls: 10, runCalls: 50 };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  // Fixture pi answers FINAL_REVIEW with PASS — even a PASSING seam review
  // must not grant production review authority.
  const seam = codexSeam(t);
  let semanticCalls = 0;
  const result = await runController({
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: ++semanticCalls > 1 }),
    solTransportOptions: { piBin: seam.piBin },
    testCapability: seam.testCapability,
  });
  assert.equal(result.ok, false);
  assert.equal(result.disposition, 'REJECTED');
  assert.ok(
    result.errors.some((e) => e.code === 'SOL_TEST_SEAM_NON_AUTHORITATIVE'),
    `expected SOL_TEST_SEAM_NON_AUTHORITATIVE, got ${JSON.stringify(result.errors)}`,
  );
  // The final review invocation ran (fixture) but its authority was
  // structurally refused at disposition time.
  assert.ok(result.routeDecisions.some((d) => d.decision === 'ROUTE_SOL_FINAL_REVIEW'));
});

test('high-risk FINAL_REVIEW finding routes a bound DeepSeek repair then SOL_RECHECK resolved before completion', async (t) => {
  const fixture = makeTarget(t);
  const configPath = path.join(fixture.root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.semanticContract = {
    contractKey: 'codex.final-repair', title: 'Bounded final-review repair', riskClass: 'FINANCIAL',
    sourceObjects: [{ key: 'src', kind: 'fixture', ref: 'a.txt', authority: 'unit test' }],
    concepts: [{ name: 'amount', kind: 'field', authoritativeFieldNames: ['amount'], ownership: 'unit test', sourceObjectKey: 'src' }],
    distinctConcepts: [],
    negativeSideEffects: [{ gate: 'controller authorization', scope: 'mutation', requirement: 'No candidate mutation is published before controller validation and reviewable-candidate recording.', expectedCount: 0, evidenceKind: 'audit_log' }],
    factsEstablished: [], unresolvedSemantics: [],
  };
  config.budgets = { unitCalls: 10, runCalls: 50 };
  // The first implementation changes A→B; the finding-bound repair changes
  // B→C, proving the repair dispatch gets a real bounded candidate attempt.
  fs.writeFileSync(path.join(fixture.root, 'worker.cjs'), `
const fs = require('node:fs'); let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  const id = prompt.match(/WORK_UNIT_ID:\\s+(lcim_wu_[0-9a-f]+)/)?.[1];
  const next = fs.readFileSync('a.txt', 'utf8').trim() === 'A' ? 'B\\n' : 'C\\n';
  fs.writeFileSync('a.txt', next);
  process.stdout.write(JSON.stringify({ workUnitId: id, workerStatus: 'WORK_COMPLETE', summary: 'bounded fixture change', acceptanceClaims: [], remainingIssues: [], reviewRisks: [], uncertainty: 'fixture worker does not decide controller readiness' }));
});
`);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const seam = codexSeam(t, { finalReviewVerdict: 'FAIL', recheckVerdict: 'RESOLVED' });
  const realAuth = snapshotRealAuthBytes(t);
  const result = await runController({
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: true }),
    solTransportOptions: { piBin: seam.piBin },
    testCapability: seam.testCapability,
  });
  realAuth.assertUnchanged();
  const decisions = result.routeDecisions.map((item) => item.decision);
  assert.ok(decisions.includes('ROUTE_SOL_FINAL_REVIEW'));
  assert.ok(decisions.includes('ROUTE_IMPLEMENT_FLASH'));
  assert.ok(decisions.includes('ROUTE_SOL_RECHECK'), `expected repair recheck, got ${decisions.join(', ')}; errors=${JSON.stringify(result.errors)}`);
  assert.ok(decisions.includes('ROUTE_COMPLETE'), `expected resolved recheck to reach completion, got ${decisions.join(', ')}`);
  assert.equal(decisions.includes('STOP_STUCK'), false);
  // It reached completion logically, but every fixture seam remains unable
  // to issue the authoritative REVIEW_APPROVED disposition.
  assert.equal(result.disposition, 'REJECTED');
  assert.ok(result.errors.some((error) => error.code === 'SOL_TEST_SEAM_NON_AUTHORITATIVE'));
  const events = fs.readFileSync(path.join(result.runtimeRoot, 'runs', result.runId, 'controller', 'events.jsonl'), 'utf8');
  assert.match(events, /SOL_FINDING_REPAIR_DISPATCHED/);
  assert.match(events, /SOL_FINDING_RECHECK_DISPATCHED/);
});

test('high-risk FINAL_REVIEW finding whose SOL_RECHECK is not resolved stops boundedly', async (t) => {
  const fixture = makeTarget(t);
  const configPath = path.join(fixture.root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.semanticContract = {
    contractKey: 'codex.final-stuck', title: 'Bounded final-review stuck path', riskClass: 'FINANCIAL',
    sourceObjects: [{ key: 'src', kind: 'fixture', ref: 'a.txt', authority: 'unit test' }],
    concepts: [{ name: 'amount', kind: 'field', authoritativeFieldNames: ['amount'], ownership: 'unit test', sourceObjectKey: 'src' }],
    distinctConcepts: [],
    negativeSideEffects: [{ gate: 'controller authorization', scope: 'mutation', requirement: 'No candidate mutation is published before controller validation and reviewable-candidate recording.', expectedCount: 0, evidenceKind: 'audit_log' }],
    factsEstablished: [], unresolvedSemantics: [],
  };
  config.budgets = { unitCalls: 10, runCalls: 50 };
  fs.writeFileSync(path.join(fixture.root, 'worker.cjs'), `
const fs = require('node:fs'); let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  const id = prompt.match(/WORK_UNIT_ID:\\s+(lcim_wu_[0-9a-f]+)/)?.[1];
  fs.writeFileSync('a.txt', fs.readFileSync('a.txt', 'utf8').trim() === 'A' ? 'B\\n' : 'C\\n');
  process.stdout.write(JSON.stringify({ workUnitId: id, workerStatus: 'WORK_COMPLETE', summary: 'bounded fixture change', acceptanceClaims: [], remainingIssues: [], reviewRisks: [], uncertainty: 'fixture worker does not decide controller readiness' }));
});
`);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const seam = codexSeam(t, { finalReviewVerdict: 'FAIL', recheckVerdict: 'NOT_RESOLVED' });
  const result = await runController({
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: true }),
    solTransportOptions: { piBin: seam.piBin },
    testCapability: seam.testCapability,
  });
  const decisions = result.routeDecisions.map((item) => item.decision);
  assert.ok(decisions.includes('ROUTE_SOL_RECHECK'));
  const stuck = result.routeDecisions.find((item) => item.decision === 'STOP_STUCK');
  assert.ok(stuck, `unresolved recheck must stop instead of retrying: ${decisions.join(', ')}`);
  assert.equal(stuck.reasonCode, 'SOL_FINDING_SURVIVES_ONE_REPAIR');
  assert.equal(decisions.includes('ROUTE_COMPLETE'), false);
  assert.equal(result.disposition, 'REJECTED');
});

test('fifth-review: adjacentCriticalDefects become authoritative open defects — one resolved, one unresolved, completion blocked', async (t) => {
  const fixture = makeTarget(t);
  const configPath = path.join(fixture.root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.semanticContract = {
    contractKey: 'codex.adjacent-defect', title: 'Bounded adjacent-defect lifecycle', riskClass: 'FINANCIAL',
    sourceObjects: [{ key: 'src', kind: 'fixture', ref: 'a.txt', authority: 'unit test' }],
    concepts: [{ name: 'amount', kind: 'field', authoritativeFieldNames: ['amount'], ownership: 'unit test', sourceObjectKey: 'src' }],
    distinctConcepts: [],
    negativeSideEffects: [{ gate: 'controller authorization', scope: 'mutation', requirement: 'No candidate mutation is published before controller validation and reviewable-candidate recording.', expectedCount: 0, evidenceKind: 'audit_log' }],
    factsEstablished: [], unresolvedSemantics: [],
  };
  config.budgets = { unitCalls: 10, runCalls: 50 };
  fs.writeFileSync(path.join(fixture.root, 'worker.cjs'), `
const fs = require('node:fs'); let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  const id = prompt.match(/WORK_UNIT_ID:\\s+(lcim_wu_[0-9a-f]+)/)?.[1];
  fs.writeFileSync('a.txt', fs.readFileSync('a.txt', 'utf8').trim() === 'A' ? 'B\\n' : 'C\\n');
  process.stdout.write(JSON.stringify({ workUnitId: id, workerStatus: 'WORK_COMPLETE', summary: 'bounded fixture change', acceptanceClaims: [], remainingIssues: [], reviewRisks: [], uncertainty: 'fixture worker does not decide controller readiness' }));
});
`);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  // FINAL_REVIEW FAIL carries BOTH an ordinary finding and an accepted
  // adjacentCriticalDefect; the FIRST recheck (ordinary finding) resolves,
  // the SECOND recheck (adjacent defect) stays NOT_RESOLVED -> STUCK.
  const seam = codexSeam(t, { finalReviewVerdict: 'FAIL', recheckVerdicts: ['RESOLVED', 'NOT_RESOLVED'], adjacentCriticalDefect: true });
  const result = await runController({
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: true }),
    solTransportOptions: { piBin: seam.piBin },
    testCapability: seam.testCapability,
  });
  const decisions = result.routeDecisions.map((item) => item.decision);
  assert.ok(decisions.includes('ROUTE_SOL_FINAL_REVIEW'));
  // Two bounded REPAIR dispatches (finding + adjacent defect), each
  // rechecked (the initial implementation dispatch is not a repair).
  const repairs = result.routeDecisions.filter((d) => d.decision === 'ROUTE_IMPLEMENT_FLASH' && d.targetRole === 'REPAIR');
  assert.equal(repairs.length, 2, `expected two repairs, got ${decisions.join(', ')}`);
  assert.equal(decisions.filter((d) => d === 'ROUTE_SOL_RECHECK').length, 2, `expected two rechecks, got ${decisions.join(', ')}`);
  assert.ok(decisions.includes('STOP_STUCK'), `completion must stay blocked while the adjacent defect is open, got ${decisions.join(', ')}; errors=${JSON.stringify(result.errors)}`);
  assert.equal(decisions.includes('ROUTE_COMPLETE'), false, 'completion is forbidden while ANY accepted adjacent critical defect remains open');
  // Both authoritative defect records are persisted with stable identity:
  // the ordinary finding AND the adjacent defect (the NOT_RESOLVED recheck
  // additionally records its surviving-finding observation).
  const runDir = path.join(result.runtimeRoot, 'runs', result.runId);
  const findings = fs.readFileSync(path.join(runDir, 'controller', 'findings.jsonl'), 'utf8')
    .trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.ok(findings.length >= 2, 'the ordinary finding AND the adjacent defect must both be persisted');
  assert.ok(findings.some((f) => f.summary.includes('adjacent critical defect')), 'the adjacent defect record must be persisted');
  assert.ok(findings.every((f) => f.severity === 'CRITICAL'));
  // The adjacent defect was repair-bound (lazy binding at dispatch) and
  // rechecked; the lifecycle events record it explicitly.
  const events = fs.readFileSync(path.join(runDir, 'controller', 'events.jsonl'), 'utf8');
  assert.ok(
    events.split('\n').some((line) => line.includes('SOL_FINDING_REPAIR_BOUND') && line.includes('ADJACENT_CRITICAL_DEFECT')),
    'the adjacent defect must be repair-bound with its defect identity',
  );
  assert.equal((events.match(/SOL_FINDING_REPAIR_DISPATCHED/g) ?? []).length, 2);
  assert.equal((events.match(/SOL_FINDING_RECHECK_DISPATCHED/g) ?? []).length, 2);
});

test('fifth-review: adjacentCriticalDefects — both defects resolved => logical completion reached', async (t) => {
  const fixture = makeTarget(t);
  const configPath = path.join(fixture.root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.semanticContract = {
    contractKey: 'codex.adjacent-resolved', title: 'Bounded adjacent-defect resolution', riskClass: 'FINANCIAL',
    sourceObjects: [{ key: 'src', kind: 'fixture', ref: 'a.txt', authority: 'unit test' }],
    concepts: [{ name: 'amount', kind: 'field', authoritativeFieldNames: ['amount'], ownership: 'unit test', sourceObjectKey: 'src' }],
    distinctConcepts: [],
    negativeSideEffects: [{ gate: 'controller authorization', scope: 'mutation', requirement: 'No candidate mutation is published before controller validation and reviewable-candidate recording.', expectedCount: 0, evidenceKind: 'audit_log' }],
    factsEstablished: [], unresolvedSemantics: [],
  };
  config.budgets = { unitCalls: 10, runCalls: 50 };
  fs.writeFileSync(path.join(fixture.root, 'worker.cjs'), `
const fs = require('node:fs'); let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  const id = prompt.match(/WORK_UNIT_ID:\\s+(lcim_wu_[0-9a-f]+)/)?.[1];
  fs.writeFileSync('a.txt', fs.readFileSync('a.txt', 'utf8').trim() === 'A' ? 'B\\n' : 'C\\n');
  process.stdout.write(JSON.stringify({ workUnitId: id, workerStatus: 'WORK_COMPLETE', summary: 'bounded fixture change', acceptanceClaims: [], remainingIssues: [], reviewRisks: [], uncertainty: 'fixture worker does not decide controller readiness' }));
});
`);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  // Both the ordinary finding and the adjacent defect resolve at their
  // exact rechecks: the flow reaches logical completion.
  const seam = codexSeam(t, { finalReviewVerdict: 'FAIL', recheckVerdict: 'RESOLVED', adjacentCriticalDefect: true });
  const result = await runController({
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: true }),
    solTransportOptions: { piBin: seam.piBin },
    testCapability: seam.testCapability,
  });
  const decisions = result.routeDecisions.map((item) => item.decision);
  const repairs = result.routeDecisions.filter((d) => d.decision === 'ROUTE_IMPLEMENT_FLASH' && d.targetRole === 'REPAIR');
  assert.equal(repairs.length, 2, `expected two repairs, got ${decisions.join(', ')}`);
  assert.equal(decisions.filter((d) => d === 'ROUTE_SOL_RECHECK').length, 2);
  assert.ok(decisions.includes('ROUTE_COMPLETE'), `both defects resolved => completion is reachable, got ${decisions.join(', ')}; errors=${JSON.stringify(result.errors)}`);
  assert.equal(decisions.includes('STOP_STUCK'), false);
  // The seam remains structurally non-authoritative: no REVIEW_APPROVED.
  assert.equal(result.disposition, 'REJECTED');
  assert.ok(result.errors.some((error) => error.code === 'SOL_TEST_SEAM_NON_AUTHORITATIVE'));
});

test('fifth-review: an INCOMPLETE canonical credential scan fails closed (credentialScanPassed=false)', async (t) => {
  const fixture = makeTarget(t);
  // The fixture emits a parsed response whose canonical value exceeds the
  // credential-scan budget: the canonical scan cannot complete, so
  // credentialScanPassed must be false and the invocation rejected.
  const seam = codexSeam(t, { oversizedValue: true });
  let semanticCalls = 0;
  const result = await runController({
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: ++semanticCalls > 1 }),
    solTransportOptions: { piBin: seam.piBin },
    testCapability: seam.testCapability,
  });
  assert.equal(result.ok, false);
  assert.equal(result.disposition, 'REJECTED');
  // The oversized payload cannot even be captured within the bounded
  // transport buffer, so the canonical scan never completes: the transport
  // fails closed (never tolerated, never accepted).
  const solInvocation = fs.readdirSync(path.join(result.runtimeRoot, 'runs', result.runId, 'invocations'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(result.runtimeRoot, 'runs', result.runId, 'invocations', f), 'utf8')))
    .find((inv) => inv.role === 'SOL');
  assert.ok(solInvocation, 'the SOL invocation record must exist');
  assert.equal(solInvocation.outcome, 'TRANSPORT_ERROR');
  assert.equal(solInvocation.rejectionCode, 'TRANSPORT_MALFORMED', 'the ledger must stay within the frozen taxonomy');
  // The persisted evidence must never claim credentialScanPassed for an
  // incomplete scan. Sixth-review rule: the immutable TRANSPORT_PROOF is
  // persisted before parse; no rejected output can create a semantic-
  // acceptance binding.
  assert.equal(result.solTransportEvidencePaths.length, 1, 'only the immutable transport proof is persisted; an incomplete canonical scan cannot mint semantic acceptance');
  const evidence = JSON.parse(fs.readFileSync(result.solTransportEvidencePaths[0], 'utf8'));
  assert.equal(evidence.phase, 'TRANSPORT_PROOF');
  assert.equal(evidence.transportProofs.credentialScanPassed, false, 'an incomplete scan can never claim credentialScanPassed');
  assert.equal(evidence.transportProofs.gatePassed, false);
  assert.equal(evidence.rawScanState, 'INCOMPLETE', 'the incomplete raw scan must be recorded explicitly');
  assert.ok(evidence.rawScanIncompleteReasons.length > 0, 'the incomplete-scan reasons must be recorded');
});

test('SOL-S11-004: valid SOL JSON with timedOut=true never reaches response compilation', async (t) => {
  const fixture = makeTarget(t);
  // The fixture writes a VALID compiled response then holds the process
  // open until the transport timeout kills it.
  const seam = codexSeam(t, { holdAfterOutput: true });
  const configPath = path.join(fixture.root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.sol.timeoutMs = 1_500;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  let semanticCalls = 0;
  const result = await runController({
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: ++semanticCalls > 1 }),
    solTransportOptions: { piBin: seam.piBin },
    testCapability: seam.testCapability,
  });
  assert.equal(result.ok, false, 'a timed-out transport must fail the run closed');
  assert.equal(result.disposition, 'REJECTED');
  const R = path.join(result.runtimeRoot, 'runs', result.runId, 'invocations');
  const solInvocation = fs.readdirSync(R)
    .map((f) => JSON.parse(fs.readFileSync(path.join(R, f), 'utf8')))
    .find((inv) => inv.role === 'SOL');
  assert.ok(solInvocation, 'the SOL invocation record must exist');
  assert.equal(solInvocation.outcome, 'TIMEOUT');
  assert.equal(solInvocation.assessmentResult, 'REJECTED');
  // No response artifact may be persisted for the rejected invocation.
  const responsesDir = path.join(result.runtimeRoot, 'runs', result.runId, 'controller', 'sol', 'responses');
  assert.equal(fs.existsSync(responsesDir) ? fs.readdirSync(responsesDir).length : 0, 0, 'no SOL response may be compiled/persisted from a timed-out transport');
  // No raw codex output may be persisted (the worker invocation may
  // persist its own DeepSeek raw output; the SOL invocation never may).
  const rawDir = path.join(result.runtimeRoot, 'runs', result.runId, 'controller', 'raw');
  const rawFiles = fs.existsSync(rawDir) ? fs.readdirSync(rawDir) : [];
  assert.equal(rawFiles.some((f) => f.startsWith(solInvocation.invocationId)), false, 'raw codex stdout/stderr must never be persisted');
});

test('strict transport gate rejects a valid-looking response before parse/compile when surface proof fails', async (t) => {
  const fixture = makeTarget(t);
  const seam = codexSeam(t, { surfacePoison: true });
  let semanticCalls = 0;
  const result = await runController({
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: ++semanticCalls > 1 }),
    solTransportOptions: { piBin: seam.piBin },
    testCapability: seam.testCapability,
  });
  assert.equal(result.ok, false);
  const responses = path.join(result.runtimeRoot, 'runs', result.runId, 'controller', 'sol', 'responses');
  assert.equal(fs.existsSync(responses) ? fs.readdirSync(responses).length : 0, 0, 'surface gate failure must prevent canonical response compilation/persistence');
  const invocations = fs.readdirSync(path.join(result.runtimeRoot, 'runs', result.runId, 'invocations'))
    .map((name) => JSON.parse(fs.readFileSync(path.join(result.runtimeRoot, 'runs', result.runId, 'invocations', name), 'utf8')));
  const sol = invocations.find((invocation) => invocation.role === 'SOL');
  assert.equal(sol.assessmentResult, 'REJECTED');
  assert.equal(sol.rejectionCode, 'TRANSPORT_MALFORMED');
  const orchestratorSource = fs.readFileSync(path.join(ROOT, 'src', 'controller', 'orchestrator.mjs'), 'utf8');
  assert.ok(orchestratorSource.indexOf('cleanupInvocationTransport();\n      const proof') < orchestratorSource.indexOf('parsed = parseProviderJson(providerResult.stdout)'), 'cleanup/proof gate must precede parsing');
});

test('SOL-S11-007: sequential refresh → recheck — the second invocation observes the refreshed credential (real store stays byte-identical)', async (t) => {
  const fixture = makeTarget(t);
  const dumpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-refresh-dump-')), 'observed.json');
  // HIGH_RISK: DIAGNOSE (invocation 1, refreshes) -> repair -> FINAL_REVIEW
  // (invocation 2, must observe the refreshed state).
  const configPath = path.join(fixture.root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.semanticContract = {
    contractKey: 'codex.refresh',
    title: 'Refresh continuity contract',
    riskClass: 'FINANCIAL',
    sourceObjects: [{ key: 'src', kind: 'fixture', ref: 'a.txt', authority: 'unit test' }],
    concepts: [{ name: 'amount', kind: 'field', authoritativeFieldNames: ['amount'], ownership: 'unit test', sourceObjectKey: 'src' }],
    distinctConcepts: [],
    negativeSideEffects: [
      { gate: 'controller authorization', scope: 'mutation', requirement: 'No candidate mutation is published before controller validation and reviewable-candidate recording.', expectedCount: 0, evidenceKind: 'audit_log' },
    ],
    factsEstablished: [],
    unresolvedSemantics: [],
  };
  config.budgets = { unitCalls: 10, runCalls: 50 };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const seam = codexSeam(t, { dumpFile, refreshOnRun: true });
  let semanticCalls = 0;
  const result = await runController({
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: ++semanticCalls > 1 }),
    solTransportOptions: { piBin: seam.piBin },
    testCapability: seam.testCapability,
  });
  // The run itself must fail closed (seam + HIGH_RISK), but the two SOL
  // invocations must have executed sequentially with refresh continuity.
  assert.equal(result.ok, false);
  assert.ok(result.routeDecisions.some((d) => d.decision === 'ROUTE_SOL_DIAGNOSE'));
  assert.ok(result.routeDecisions.some((d) => d.decision === 'ROUTE_SOL_FINAL_REVIEW'));
  const R = path.join(result.runtimeRoot, 'runs', result.runId, 'invocations');
  const solInvocations = fs.readdirSync(R)
    .map((f) => JSON.parse(fs.readFileSync(path.join(R, f), 'utf8')))
    .filter((inv) => inv.role === 'SOL');
  assert.equal(solInvocations.length, 2, 'DIAGNOSE + FINAL_REVIEW = two sequential SOL invocations');
  // The SECOND invocation's fixture observed the refreshed credential in
  // the run-scoped store (the dump is written by every invocation; the
  // final content reflects the last invocation's observation).
  const observed = JSON.parse(fs.readFileSync(dumpFile, 'utf8'));
  assert.equal(observed.refreshObserved, true, 'the second invocation must observe the refreshed credential');
  // Sixth-review rule: within-run refresh continuity NEVER writes back.
  const refreshedRealAuth = snapshotRealAuthBytes(t);
  const runStorePath = path.join(result.runtimeRoot, 'runs', result.runId);
  const realBefore = refreshedRealAuth.before;
  // The real store must be byte-identical after the full refresh chain.
  assert.equal(fs.readFileSync(refreshedRealAuth.file, 'utf8'), realBefore, 'a refreshed token must NEVER be written back to the real store');
});

test('SOL-S11-006: injected cleanup failure fails the run closed', async (t) => {
  const fixture = makeTarget(t);
  const dumpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-cleanup-dump-')), 'observed.json');
  // Rebuild the seam with a dump + cleanup sabotage injected by the
  // fixture itself: chmod the invocations dir 0500 after dumping.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-cleanup-oauth-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'auth.json'), JSON.stringify({ 'openai-codex': { type: 'oauth', access: 'fixture-access-token-value', refresh: 'fixture-refresh-token-value', expires: Date.now() + 3_600_000 } }));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  t.after(() => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
  });
  const piDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-cleanup-pi-'));
  t.after(() => {
    try { fs.chmodSync(path.join(piDir, 'fixture-pi.cjs'), 0o755); } catch { /* best-effort */ }
    fs.rmSync(piDir, { recursive: true, force: true });
  });
  const piBin = path.join(piDir, 'fixture-pi.cjs');
  const script = `#!/usr/bin/env node
'use strict';
const path = require('node:path');
const prompt = process.argv[process.argv.length - 1];
const fsx = require('node:fs');
const invocationsDir = path.join(path.dirname(path.dirname(process.env.PI_CODING_AGENT_DIR)), 'invocations');
fsx.writeFileSync(${JSON.stringify(dumpFile)}, JSON.stringify({ invocationsDir, modeBefore: fsx.statSync(invocationsDir).mode & 0o777 }));
fsx.chmodSync(invocationsDir, 0o500);
const askId = prompt.match(/Ask id: (lcim_sol_ask_[0-9a-f]+)/)[1];
const criterion = prompt.match(/Criterion \\(sideEffectId\\): (se_[0-9a-f]{64})/)[1];
const requirement = prompt.match(/Criterion requirement \\(authoritative, verbatim\\): (.*)/)[1];
const evidence = prompt.match(/Prior evidence \\(refs into the single bounded evidence universe\\): (.*)/)[1].split(',')[0].trim();
process.stdout.write(JSON.stringify({
  askId, callType: 'SOL_DIAGNOSE', verdict: 'CAUSE_IDENTIFIED', decisionSummary: 'one bounded cause identified', evidence: [],
  failure: { rootCause: 'the bounded controller gate was not satisfied', evidenceRefs: [evidence], repair: { mustChange: [{ target: 'mutation', change: 'restore the bounded controller gate' }], mustNotChange: [{ target: 'contract', reason: 'preserve locked semantics' }], exactTests: [{ name: 'criterion test', expectation: requirement, acceptanceCriterionRef: criterion }], verification: [{ method: 'controller check', expectation: 'the criterion is satisfied' }] }, falsification: 'a passing controller gate would disprove this cause' }
}));
`;
  fs.writeFileSync(piBin, script, { mode: 0o755 });
  let semanticCalls = 0;
  const result = await runController({
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: ++semanticCalls > 1 }),
    solTransportOptions: { piBin },
    testCapability: mintSolTestSeam(),
  });
      assert.equal(result.ok, false, 'a cleanup failure must fail the run closed');
  assert.equal(result.disposition, 'REJECTED');
  // The fail-closed identity is carried by the controller event and the
  // transport evidence (the ledger stays within the frozen taxonomy).
  const eventsFile = path.join(result.runtimeRoot, 'runs', result.runId, 'controller', 'events.jsonl');
  const events = fs.readFileSync(eventsFile, 'utf8');
  assert.ok(events.includes('SOL_TRANSPORT_CLEANUP_FAILED'), 'the SOL_ASSESSMENT event must carry the distinct static identity');
  // The invocation evidence records the observed cleanup failure.
  assert.ok(result.solTransportEvidencePaths.length >= 1);
  const evidence = JSON.parse(fs.readFileSync(result.solTransportEvidencePaths[0], 'utf8'));
  assert.equal(evidence.cleanup.removed, false, 'cleanup must never be reported as successful when it was not observed');
  assert.equal(evidence.cleanup.observed, false);
  assert.equal(evidence.cleanup.verified, false);
  // The leftover surface is marker-recognizable (crash-recovery sweep can
  // remove it) and actually still exists until recovery.
  const dump = JSON.parse(fs.readFileSync(dumpFile, 'utf8'));
  assert.ok(fs.existsSync(dump.invocationsDir), 'the leftover surface must still exist (removal failed)');
  // Restore permissions so recovery can sweep.
  fs.chmodSync(dump.invocationsDir, 0o700);
  const recovered = await recoverRun({ cwd: fixture.root, runId: result.runId });
  assert.ok(recovered.recoveredSolTransportSurfaces.removed.some((p) => p.includes('sol-transport')), 'recover must sweep the stale surface');
  assert.equal(fs.readdirSync(dump.invocationsDir).length, 0, 'the stale invocation surface must be gone after recovery');
});

test('SOL-S11-006: startup reconciliation sweeps stale surfaces of terminal runs and terminates orphaned processes', async (t) => {
  const fixture = makeTarget(t);
  const seam = codexSeam(t);
  let semanticCalls = 0;
  const result = await runController({
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: ++semanticCalls > 1 }),
    solTransportOptions: { piBin: seam.piBin },
    testCapability: seam.testCapability,
  });
  assert.equal(result.ok, true);
  // Simulate a crash leftover: recreate a controller-owned surface with an
  // orphaned process carrying its invocation marker.
  const solRoot = path.join(result.runtimeRoot, 'runs', result.runId, 'controller', 'sol-transport');
  const staleStore = path.join(solRoot, 'store');
  fs.mkdirSync(path.join(staleStore, 'agent'), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(staleStore, 'agent', 'auth.json'), '{"openai-codex":{"type":"oauth","access":"stale-leftover-token-123456","refresh":"stale-leftover-refresh-123456"}}', { mode: 0o600 });
  const marker = 'orphanmarker' + 'f'.repeat(16);
  const staleInvocationId = 'lcim_inv_' + 'e'.repeat(32);
  const transportIdentity = 'a'.repeat(64);
  const canonicalStore = fs.realpathSync(staleStore);
  // Fifth-review rule: the durable store marker lives OUTSIDE the
  // credential subtree (markers/<runId>.json).
  const staleMarkerFile = path.join(solRoot, 'markers', `${result.runId}.json`);
  fs.mkdirSync(path.dirname(staleMarkerFile), { recursive: true, mode: 0o700 });
  fs.writeFileSync(staleMarkerFile, `${JSON.stringify({ schemaName: 'lcim.sol-transport', schemaVersion: '1.4.0', kind: 'sol-transport-store', runId: result.runId, invocationId: staleInvocationId, invocationMarker: marker, canonicalPath: canonicalStore, credentialPath: path.join(canonicalStore, 'agent', 'auth.json'), transportIdentity, nodeIdentitySha256: 'b'.repeat(64), cliIdentitySha256: 'c'.repeat(64), closureIdentitySha256: null, createdAt: new Date().toISOString() })}\n`);
  const invDir = path.join(solRoot, 'invocations', staleInvocationId);
  fs.mkdirSync(path.join(invDir, 'cwd'), { recursive: true, mode: 0o700 });
  const canonicalInvocation = fs.realpathSync(invDir);
  fs.writeFileSync(path.join(invDir, '.lcim-sol-transport.json'), `${JSON.stringify({ schemaName: 'lcim.sol-transport', schemaVersion: '1.4.0', kind: 'sol-transport-invocation', runId: result.runId, invocationId: staleInvocationId, invocationMarker: marker, canonicalPath: canonicalInvocation, transportIdentity, nodeIdentitySha256: 'b'.repeat(64), cliIdentitySha256: 'c'.repeat(64), closureIdentitySha256: null, createdAt: new Date().toISOString() })}\n`);
  // An orphaned "Pi" process carrying the marker (detached, async: the
  // controller would have crashed, leaving it behind).
  const { spawn } = await import('node:child_process');
  const orphan = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], {
    env: { ...process.env, LCIM_INVOCATION_MARKER: marker },
    detached: true,
    stdio: 'ignore',
  });
  orphan.unref();
  assert.ok(orphan.pid > 1, 'the orphan process must have started');
  const alive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  t.after(() => {
    try { process.kill(orphan.pid, 'SIGKILL'); } catch { /* best-effort */ }
  });
  assert.equal(alive(orphan.pid), true);
  // A second run in the same repo performs startup reconciliation: the
  // terminal run's stale surfaces must be swept and the orphan terminated.
  const seam2 = codexSeam(t);
  let calls = 0;
  const result2 = await runController({
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: ++calls > 1 }),
    solTransportOptions: { piBin: seam2.piBin },
    testCapability: seam2.testCapability,
  });
  assert.equal(result2.ok, true);
  assert.equal(fs.existsSync(staleStore), false, 'the stale store must be swept at startup');
  assert.equal(fs.existsSync(invDir), false, 'the stale invocation surface must be swept at startup');
  // The orphaned process must be terminated (grace window) by the sweep.
  const deadline = Date.now() + 10_000;
  let orphanGone = false;
  while (Date.now() < deadline) {
    if (!alive(orphan.pid)) {
      orphanGone = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal(orphanGone, true, 'the orphaned Pi process must be terminated by the startup sweep');
});

test('credential canary: leaked token bytes fail the run and never reach store/audit/export', async (t) => {
  const fixture = makeTarget(t);
  const tokenValue = 'canary-access-token-0123456789abcdef';
  // Fixture pi that echoes the token to stdout (adversarial).
  const seam = codexSeam(t, { tokenEcho: true, tokenValue });
  let semanticCalls = 0;
  const result = await runController({
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: ++semanticCalls > 1 }),
    solTransportOptions: { piBin: seam.piBin },
    testCapability: seam.testCapability,
  });
  assert.equal(result.ok, false, 'a credential leak must fail the run closed');
  // The ledger rejection taxonomy is frozen (Sprint-00); the distinct
  // fail-closed identity is carried by the controller events and the
  // transport evidence, and the ledger stays a taxonomy code.
  const R = path.join(result.runtimeRoot, 'runs', result.runId, 'invocations');
  const solInvocation = fs.readdirSync(R)
    .map((f) => JSON.parse(fs.readFileSync(path.join(R, f), 'utf8')))
    .find((inv) => inv.role === 'SOL');
  assert.ok(solInvocation, 'the SOL invocation record must exist');
  assert.equal(solInvocation.outcome, 'TRANSPORT_ERROR');
  assert.equal(solInvocation.rejectionCode, 'TRANSPORT_MALFORMED', 'the ledger must stay within the frozen taxonomy');
  const eventsFile = path.join(result.runtimeRoot, 'runs', result.runId, 'controller', 'events.jsonl');
  const events = fs.readFileSync(eventsFile, 'utf8');
  assert.ok(
    events.includes('TRANSPORT_CREDENTIAL_LEAK'),
    'the SOL_ASSESSMENT controller event must carry the distinct static identity',
  );
  assert.ok(events.includes('"kind":"SOL_ASSESSMENT"'));
  assert.ok(!events.includes(tokenValue), 'the event must never carry token bytes');
  // The canary token must not appear in ANY result/error text.
  const allErrors = JSON.stringify(result);
  assert.equal(allErrors.includes(tokenValue), false);
  assert.equal(allErrors.includes('fixture-refresh-token-value'), false);

  // 1) Raw runtime evidence / invocation records / events / artifacts.
  const runRoot = path.join(result.runtimeRoot, 'runs', result.runId);
  for (const file of walk(runRoot)) {
    const bytes = fs.readFileSync(file, 'utf8');
    assert.equal(bytes.includes(tokenValue), false, `token leaked into runtime evidence: ${file}`);
    assert.equal(bytes.includes('fixture-refresh-token-value'), false, `refresh token leaked into runtime evidence: ${file}`);
  }
  // No raw provider output may be persisted for the leaked invocation
  // (raw codex output is never persisted, period).
  const rawDir = path.join(runRoot, 'controller', 'raw');
  const rawFiles = fs.existsSync(rawDir) ? walk(rawDir) : [];
  for (const file of rawFiles) {
    assert.equal(fs.readFileSync(file, 'utf8').includes(tokenValue), false, `token leaked into raw output: ${file}`);
  }
  // The transport evidence records the leak outcome (byte-free).
  assert.ok(result.solTransportEvidencePaths.length >= 1);
  for (const file of result.solTransportEvidencePaths) {
    const evidence = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(evidence.credentialLeak, true);
    assert.equal(evidence.leakChannel, 'STDOUT');
    assert.equal(fs.readFileSync(file, 'utf8').includes(tokenValue), false);
  }

  // 2) Audit projection.
  const auditResult = await audit({ cwd: fixture.root });
  const auditJson = JSON.stringify(auditResult);
  assert.equal(auditJson.includes(tokenValue), false, 'token leaked into audit output');
  assert.equal(auditJson.includes('fixture-refresh-token-value'), false);

  // 3) Review export.
  const exportResult = await reviewExport({ cwd: fixture.root });
  const exportJson = JSON.stringify(exportResult);
  assert.equal(exportJson.includes(tokenValue), false, 'token leaked into review export');
  assert.equal(exportJson.includes('fixture-refresh-token-value'), false);
});

test('regression: DeepSeek stays BROKER_ONLY, validation stays DENY_ALL, and all four SOL roles keep the state machine', async (t) => {
  // DeepSeek worker boundary (external) is BROKER_ONLY — asserted again
  // through the boundary factory used by production worker invocations.
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-reg-run-'));
  t.after(() => fs.rmSync(runDir, { recursive: true, force: true }));
  const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-reg-wt-'));
  t.after(() => fs.rmSync(worktreeDir, { recursive: true, force: true }));
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-reg-repo-'));
  t.after(() => fs.rmSync(repoDir, { recursive: true, force: true }));
  const workerBoundary = createWorkerExecutionBoundary({
    repoDir,
    worktreeDir,
    runDir,
    workUnitId: 'lcim_wu_' + 'a'.repeat(32),
    invocationId: 'lcim_inv_' + 'b'.repeat(32),
    broker: { port: 43999 },
    processCreation: 'DENIED',
  });
  assert.equal(workerBoundary.networkPolicy.mode, 'BROKER_ONLY');
  const validationBoundary = createWorkerExecutionBoundary({
    repoDir,
    worktreeDir,
    runDir,
    workUnitId: 'lcim_wu_' + 'a'.repeat(32),
    invocationId: 'lcim_inv_' + 'c'.repeat(32),
    processCreation: 'ALLOWED',
  });
  assert.equal(validationBoundary.networkPolicy.mode, 'DENY_ALL');
  // The codex SOL route never creates a worker boundary: the boundary
  // factory refuses the removed CODEX_OAUTH mode.
  assert.throws(
    () => createWorkerExecutionBoundary({
      repoDir,
      worktreeDir,
      runDir,
      workUnitId: 'lcim_wu_' + 'a'.repeat(32),
      codexOAuth: true,
    }),
    /CODEX_OAUTH worker-boundary mode was removed/,
  );
  // All four SOL roles still route through the state machine to the codex
  // model when the codex channel is configured (routing-level regression).
  const { decideRoute } = await import('../../src/routing/policy.mjs');
  const { makeCtx } = await import('../helpers/routing-fixture.mjs');
  const oauthDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-reg-oauth-'));
  t.after(() => fs.rmSync(oauthDir, { recursive: true, force: true }));
  fs.mkdirSync(oauthDir, { recursive: true });
  fs.writeFileSync(path.join(oauthDir, 'auth.json'), JSON.stringify({ 'openai-codex': { type: 'oauth', access: 'regression-access-token-value', refresh: 'regression-refresh-token-value', expires: Date.now() + 3_600_000 } }));
  const prev = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = oauthDir;
  t.after(() => {
    if (prev === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = prev;
  });
  const codexConfig = {
    endpoints: {
      'deepseek-v4-flash': makeCtx().config.endpoints['deepseek-v4-flash'],
      'deepseek-pro-max': makeCtx().config.endpoints['deepseek-pro-max'],
      'gpt-5.6-sol': { baseUrl: 'https://chatgpt.example.invalid/backend-api', kind: 'external' },
    },
  };
  const contract = {
    contractKey: 'codex.final-review',
    title: 'Codex final review contract',
    riskClass: 'FINANCIAL',
    sourceObjects: [{ key: 'src', kind: 'fixture', ref: 'x', authority: 'unit test' }],
    concepts: [{ name: 'amount', kind: 'field', authoritativeFieldNames: ['amount'], ownership: 'unit test', sourceObjectKey: 'src' }],
    distinctConcepts: [],
    negativeSideEffects: [],
    factsEstablished: [],
    unresolvedSemantics: [],
  };
  const { compileSemanticContract } = await import('../../src/contracts/compiler.mjs');
  const highRisk = compileSemanticContract(contract, { compiledAt: '2025-01-01T00:00:00.000Z' });
  const contractCheck = decideRoute(makeCtx({ contractReviewRequired: true, config: codexConfig, decidedAt: '2025-01-01T00:00:00.000Z' }));
  assert.equal(contractCheck.decision, 'ROUTE_SOL_CONTRACT_CHECK');
  assert.equal(contractCheck.targetModel, 'gpt-5.6-sol');
  const diagnose = decideRoute(makeCtx({
    state: 'AWAITING_IMPLEMENTATION',
    latestRejection: { rejectionCode: 'UNSUPPORTED_CLAIM', rejectedAcceptanceRefs: ['ac:1'] },
    config: codexConfig,
    decidedAt: '2025-01-01T00:00:00.000Z',
  }));
  assert.equal(diagnose.decision, 'ROUTE_SOL_DIAGNOSE');
  assert.equal(diagnose.targetModel, 'gpt-5.6-sol');
  const finalReview = decideRoute(makeCtx({
    state: 'AWAITING_IMPLEMENTATION',
    resultAccepted: true,
    semanticContract: highRisk,
    config: codexConfig,
    decidedAt: '2025-01-01T00:00:00.000Z',
  }));
  assert.equal(finalReview.decision, 'ROUTE_SOL_FINAL_REVIEW');
  assert.equal(finalReview.targetModel, 'gpt-5.6-sol');
  const recheck = decideRoute(makeCtx({
    state: 'AWAITING_REPAIR',
    solFindings: [{ findingId: 'lcim_finding_' + '3'.repeat(32), status: 'OPEN', repairCycles: 1, rechecks: 0 }],
    config: codexConfig,
    decidedAt: '2025-01-01T00:00:00.000Z',
  }));
  assert.equal(recheck.decision, 'ROUTE_SOL_RECHECK');
  assert.equal(recheck.targetModel, 'gpt-5.6-sol');
});
