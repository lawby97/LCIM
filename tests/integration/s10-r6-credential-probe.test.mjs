/**
 * Sprint-10 SOL-S10-001 R6 regressions — credential probe status-0-only
 * fail-closed semantics (the single remaining SOL-S10-001 finding).
 *
 * DEFECT: readProbeResult() derived `blocked = status !== 0` for the
 * credential read probe, so probe status 3 (credential material READABLE)
 * and status 2 (unexpected probe failure) were treated as blocked, and
 * verifyWorkerExecutionBoundary only rejected when `!evidence.blocked` —
 * readable credential material and ambiguous/unrelated probe failures could
 * therefore incorrectly authorize the boundary.
 *
 * REPAIR: credential isolation is proven ONLY when the credential-access
 * probe exits with EXACTLY status 0 (a real in-sandbox Seatbelt
 * EPERM/EACCES denial) with no outer spawn error, no signal termination,
 * no timeout, and no ambiguity. Status 3, status 2, any unknown status,
 * signal, timeout, and outer spawn/sandbox errors all fail closed BEFORE
 * the boundary may authorize, and BEFORE any candidate-controlled
 * validation child executes. EVERY credential target must independently
 * pass — "at least one blocked" is never enough.
 *
 * Test seam: LCIM_PROBE_SIMULATE_CRED_READ (inherited into the boundary
 * environment) deterministically produces FAILURE states only — READABLE
 * (3), UNEXPECTED (2), UNKNOWN (7), SIGNAL, TIMEOUT, OUTER_ERROR — with an
 * optional `=targetPath` scope for mixed multi-target regressions. There is
 * NO simulated 'BLOCKED'/'DENIED' value: the exact status-0 branch is
 * reachable only through the real in-sandbox Seatbelt EPERM/EACCES denial,
 * so the seam can never fabricate credential-isolation proof.
 *
 * SOL-S10-002 stays FROZEN as FIXED: the credential deny rules remain part
 * of the exact profile bytes already protected by the profile digest.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { setupProject } from '../../src/project/config.mjs';
import { runController } from '../../src/controller/orchestrator.mjs';
import {
  CREDENTIAL_READ_PROBE_OUTCOMES,
  CREDENTIAL_READ_PROBE_SCRIPT,
  classifyCredentialReadProbe,
  authorizeWorkerExecutionBoundary,
  createWorkerExecutionBoundary,
  verifyWorkerExecutionBoundary,
  runConstrainedProcess,
} from '../../src/controller/execution-boundary.mjs';
import { runValidationsOnCopy } from '../../src/controller/validation-runner.mjs';
import { generateId } from '../../src/shared/ids.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Unique sentinel placed ONLY in temporary credential fixtures. */
const SENTINEL = 'LCIM_R6_CREDENTIAL_SENTINEL_DO_NOT_LEAK_3B71';

const SEAM = 'LCIM_PROBE_SIMULATE_CRED_READ';

function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return result;
}

function cryptoToken(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function withCredentialEnv(t, name, value) {
  const previous = process.env[name];
  process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}

function makeDirs(t, prefix = 'lcim-r6-') {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}repo-`));
  const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}wt-`));
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}run-`));
  t.after(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(worktreeDir, { recursive: true, force: true });
    fs.rmSync(runDir, { recursive: true, force: true });
  });
  return { repoDir, worktreeDir, runDir };
}

/** Fake credential home with a real .pi/agent/auth.json surface. */
function makeCredentialHome(t, prefix = 'lcim-r6-home-') {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(tempHome, { recursive: true, force: true }));
  const piAgentDir = path.join(tempHome, '.pi', 'agent');
  const authFile = path.join(piAgentDir, 'auth.json');
  fs.mkdirSync(piAgentDir, { recursive: true });
  fs.writeFileSync(authFile, `${SENTINEL}\n`, { mode: 0o600 });
  return { tempHome, piAgentDir, authFile };
}

/** Target repo fixture with a local worker and a repo-local validation command list. */
function makeTarget(t, { validationCommands = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-r6-target-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'lcim-test@example.invalid']);
  git(root, ['config', 'user.name', 'LCIM R6']);
  fs.writeFileSync(path.join(root, 'a.txt'), 'A\n');
  git(root, ['add', 'a.txt']);
  git(root, ['commit', '-m', 'fixture base']);
  const worker = `
let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  require('node:fs').writeFileSync('a.txt', 'B\\n');
  const id = prompt.match(/WORK_UNIT_ID:\\s+(lcim_wu_[0-9a-f]+)/)?.[1];
  process.stdout.write(JSON.stringify({ workUnitId: id, workerStatus: 'WORK_COMPLETE', summary: 'r6 fixture worker', acceptanceClaims: [], remainingIssues: [], reviewRisks: [], uncertainty: 'fixture' }));
});
`;
  fs.writeFileSync(path.join(root, 'worker.cjs'), worker);
  setupProject({ cwd: root });
  const configPath = path.join(root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.allowedWritePaths = ['a.txt'];
  config.worker.command = ['node', 'worker.cjs'];
  config.endpoints['deepseek-v4-flash'] = { baseUrl: 'local://fixture-worker', kind: 'local-command' };
  if (validationCommands.length > 0) config.validation.commands = validationCommands;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const baseSha = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  return { root, baseSha };
}

/** Build a patch artifact for a direct runValidationsOnCopy call. */
function makePatch(repoDir, baseSha, changes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-r6-patchwt-'));
  git(repoDir, ['worktree', 'add', '--detach', dir, baseSha]);
  try {
    for (const [file, content] of Object.entries(changes)) {
      fs.writeFileSync(path.join(dir, file), content);
      if (!fs.existsSync(path.join(repoDir, file))) git(dir, ['add', '-N', file]);
    }
    return git(dir, ['diff']).stdout;
  } finally {
    git(repoDir, ['worktree', 'remove', '--force', dir]);
  }
}

/**
 * Shared negative assertion: verification must fail closed for the seam
 * value, with truthful evidence (blocked:false, explicit verification
 * state), and the boundary must never gain spawn authority.
 */
async function assertCredentialFailure(t, { seam, expectStatus = null, expectVerification, messagePattern, expectError = false, expectSignal = false }) {
  const { repoDir, worktreeDir, runDir } = makeDirs(t);
  const { tempHome } = makeCredentialHome(t);
  withCredentialEnv(t, SEAM, seam);
  const boundary = createWorkerExecutionBoundary({
    repoDir,
    worktreeDir,
    runDir,
    workUnitId: `lcim_wu_r6_${cryptoToken(8)}`,
    processCreation: 'ALLOWED',
    credentialHome: tempHome,
  });
  await assert.rejects(verifyWorkerExecutionBoundary(boundary), (error) => {
    assert.match(error.message, messagePattern);
    const evidence = error.details?.evidence;
    assert.ok(evidence, 'the fail-closed error must carry the probe evidence');
    if (expectStatus !== null) assert.equal(evidence.status, expectStatus);
    assert.equal(evidence.blocked, false, 'a failed/readable probe must never serialize blocked:true');
    assert.equal(evidence.verification, expectVerification);
    if (expectError) assert.ok(evidence.error !== null && evidence.error !== undefined, 'outer probe error must be recorded');
    if (expectSignal) assert.ok(evidence.signal !== null && evidence.signal !== undefined, 'signal termination must be recorded');
    return true;
  });
  // The production authorization entry fails closed too.
  await assert.rejects(
    authorizeWorkerExecutionBoundary({ repoDir, worktreeDir, runDir, workUnitId: `lcim_wu_r6_${cryptoToken(8)}`, processCreation: 'ALLOWED', credentialHome: tempHome }),
    messagePattern,
  );
  // No spawn capability was ever registered for the rejected boundary.
  await assert.rejects(async () => runConstrainedProcess(boundary, { command: ['/usr/bin/true'] }), /authorized/i);
}

// ---------------------------------------------------------------------------
// R6-1 — blocked credential path: real Seatbelt EPERM/EACCES => status 0
// ---------------------------------------------------------------------------

test('R6-1: real Seatbelt credential denial proves blocking with exact probe status 0 (model AND validation boundaries)', async (t) => {
  const { repoDir, worktreeDir, runDir } = makeDirs(t);
  const { tempHome, piAgentDir, authFile } = makeCredentialHome(t);

  for (const processCreation of ['ALLOWED', 'DENIED']) {
    const authorized = await authorizeWorkerExecutionBoundary({
      repoDir,
      worktreeDir,
      runDir,
      workUnitId: `lcim_wu_r6_${cryptoToken(8)}`,
      processCreation,
      credentialHome: tempHome,
    });
    const credentials = authorized.evidence.probes.credentials;
    assert.ok(credentials.length >= 2, 'the pi agent dir and its auth.json must both be probed');
    assert.ok(credentials.every((item) => item.status === 0), `every credential probe must exit exactly 0 (got ${credentials.map((item) => item.status).join(',')})`);
    assert.ok(credentials.every((item) => item.blocked === true), 'proven denials serialize blocked:true');
    assert.ok(credentials.every((item) => item.verification === CREDENTIAL_READ_PROBE_OUTCOMES.BLOCKED_PROVEN), 'every proven denial classifies ACCESS_DENIAL_PROVEN');
    assert.ok(credentials.every((item) => item.expectedBlocked === true));
    assert.ok(credentials.every((item) => typeof item.stderrDigest === 'string' && item.stderrDigest.length === 64));
    // No credential bytes may appear anywhere in the evidence.
    assert.equal(JSON.stringify(credentials).includes(SENTINEL), false, 'credential contents must never reach evidence');
    assert.ok(authorized.evidence.credentialIsolation.checkedPaths.includes(fs.realpathSync(piAgentDir)));
    assert.ok(authorized.evidence.credentialIsolation.checkedPaths.includes(fs.realpathSync(authFile)));
  }
});

// ---------------------------------------------------------------------------
// R6-2 — readable credential material (probe status 3)
// ---------------------------------------------------------------------------

test('R6-2: readable credential material (probe status 3) fails closed — boundary verification rejects', async (t) => {
  await assertCredentialFailure(t, {
    seam: 'READABLE',
    expectStatus: 3,
    expectVerification: CREDENTIAL_READ_PROBE_OUTCOMES.READABLE,
    messagePattern: /readable|status 0/i,
  });
});

test('R6-2V: readable credential material fails closed BEFORE candidate-controlled validation runs', async (t) => {
  const { tempHome } = makeCredentialHome(t);
  const marker = path.join(os.tmpdir(), `lcim-r6-marker-${cryptoToken(8)}`);
  t.after(() => fs.rmSync(marker, { force: true }));
  const target = makeTarget(t, {
    validationCommands: [['node', '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'EXECUTED')`]],
  });
  const repoDir = target.root;
  const baseSha = target.baseSha;
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-r6-run-'));
  t.after(() => fs.rmSync(runDir, { recursive: true, force: true }));
  const patchText = makePatch(repoDir, baseSha, { 'a.txt': 'B\n' });
  assert.ok(patchText.includes('B\n'), 'patch artifact changes a.txt');

  withCredentialEnv(t, SEAM, 'READABLE');
  const validation = await runValidationsOnCopy({
    projectConfig: { validation: { commands: [['node', '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'EXECUTED')`]] } },
    repoDir,
    runDir,
    workUnitId: generateId('work-unit'),
    invocationId: generateId('invocation'),
    expectedBaseSha: baseSha,
    patchText,
    patchRecord: { patchId: `lcim_patch_${cryptoToken(8)}`, patchHash: crypto.createHash('sha256').update(patchText).digest('hex'), changedPaths: ['a.txt'] },
    credentialHome: tempHome,
  });

  // The ONLY result record is the boundary-authorization failure; the
  // candidate validation command record is absent, so no candidate-
  // controlled validation child ever executed.
  assert.equal(validation.applied, true, 'the frozen artifact applied to the disposable copy');
  assert.equal(validation.results.length, 1, 'no candidate command may run when the credential probe is readable');
  assert.equal(validation.results[0].outcome, 'FAIL');
  assert.match(validation.results[0].summary, /credential|readable|status 0/i);
  assert.equal(validation.evidence.results.length, 1);
  assert.equal(validation.evidence.boundaryEvidenceRef, null, 'no boundary evidence is persisted for an unauthorized boundary');
  assert.equal(fs.existsSync(marker), false, 'the candidate-controlled validation command must never execute');
});

test('R6-2C: readable credential probe fails the full controller run closed before validation', async (t) => {
  const customDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-r6-custom-'));
  t.after(() => fs.rmSync(customDir, { recursive: true, force: true }));
  const authFile = path.join(customDir, 'auth.json');
  fs.writeFileSync(authFile, `${SENTINEL}\n`, { mode: 0o600 });
  withCredentialEnv(t, 'PI_CODING_AGENT_DIR', customDir);
  withCredentialEnv(t, SEAM, 'READABLE');
  const marker = path.join(os.tmpdir(), `lcim-r6-ctl-marker-${cryptoToken(8)}`);
  t.after(() => fs.rmSync(marker, { force: true }));
  const target = makeTarget(t, {
    validationCommands: [['node', '-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'EXECUTED')`]],
  });

  const result = await runController({ cwd: target.root });

  assert.equal(result.ok, false, 'a readable credential surface must fail the whole run');
  assert.equal(result.disposition, 'REJECTED');
  assert.equal(result.validationEvidencePaths.length, 0, 'validation must never start');
  assert.equal(fs.existsSync(marker), false, 'no candidate-controlled validation child may execute');
});

// ---------------------------------------------------------------------------
// R6-3 / R6-4 — unexpected and unknown probe statuses
// ---------------------------------------------------------------------------

test('R6-3: unexpected probe status 2 fails closed', async (t) => {
  await assertCredentialFailure(t, {
    seam: 'UNEXPECTED',
    expectStatus: 2,
    expectVerification: CREDENTIAL_READ_PROBE_OUTCOMES.NOT_PROVEN,
    messagePattern: /could not be objectively proven|status 0/i,
  });
});

test('R6-4: ambiguous/unknown nonzero probe status (7) fails closed', async (t) => {
  await assertCredentialFailure(t, {
    seam: 'UNKNOWN',
    expectStatus: 7,
    expectVerification: CREDENTIAL_READ_PROBE_OUTCOMES.NOT_PROVEN,
    messagePattern: /could not be objectively proven|status 0/i,
  });
});

// ---------------------------------------------------------------------------
// R6-5 / R6-6 / R6-7 — signal, timeout, outer spawn/sandbox error
// ---------------------------------------------------------------------------

test('R6-5: signal-terminated credential probe fails closed', async (t) => {
  await assertCredentialFailure(t, {
    seam: 'SIGNAL',
    expectVerification: CREDENTIAL_READ_PROBE_OUTCOMES.NOT_PROVEN,
    messagePattern: /could not be objectively proven|status 0/i,
    expectSignal: true,
  });
});

test('R6-6: credential probe timeout fails closed (no valid completed denial result)', async (t) => {
  await assertCredentialFailure(t, {
    seam: 'TIMEOUT',
    expectVerification: CREDENTIAL_READ_PROBE_OUTCOMES.NOT_PROVEN,
    messagePattern: /could not be objectively proven|status 0/i,
    expectError: true,
  });
});

test('R6-7: outer spawn/sandbox error fails closed (probe process cannot be started correctly)', async (t) => {
  await assertCredentialFailure(t, {
    seam: 'OUTER_ERROR',
    expectVerification: CREDENTIAL_READ_PROBE_OUTCOMES.NOT_PROVEN,
    messagePattern: /could not be objectively proven|status 0/i,
    expectError: true,
  });
});

// ---------------------------------------------------------------------------
// R6-8 — multi-target: every credential target must independently pass
// ---------------------------------------------------------------------------

test('R6-8: with two blocked targets and one readable target, overall credential isolation FAILS', async (t) => {
  const { repoDir, worktreeDir, runDir } = makeDirs(t);
  const { tempHome, piAgentDir, authFile } = makeCredentialHome(t);
  const credFile = path.join(os.tmpdir(), `lcim-r6-extra-${cryptoToken(8)}.txt`);
  fs.writeFileSync(credFile, `${SENTINEL}\n`, { mode: 0o600 });
  t.after(() => fs.rmSync(credFile, { force: true }));
  const realCredFile = fs.realpathSync(credFile);

  // Scope the READABLE simulation to exactly ONE of the three surfaces:
  // the two Pi agent surfaces (dir + auth.json) are denied by the REAL
  // Seatbelt profile and must still prove blocked (status 0); the extra
  // probe path reports status 3. Overall verification must FAIL — the
  // controller never uses "at least one blocked" semantics.
  withCredentialEnv(t, SEAM, `READABLE=${realCredFile}`);
  const boundary = createWorkerExecutionBoundary({
    repoDir,
    worktreeDir,
    runDir,
    workUnitId: `lcim_wu_r6_${cryptoToken(8)}`,
    processCreation: 'ALLOWED',
    credentialHome: tempHome,
    credentialProbePaths: [credFile],
  });
  assert.ok(boundary.credentialPaths.includes(fs.realpathSync(piAgentDir)), 'pi agent dir is a credential target');
  assert.ok(boundary.credentialPaths.includes(realCredFile), 'the caller-supplied probe path is a credential target');
  // auth.json is probed as the directory's named credential sub-target
  // (its realpath is a checked path, not a top-level credentialPath entry).
  void authFile;

  await assert.rejects(verifyWorkerExecutionBoundary(boundary), (error) => {
    assert.match(error.message, /readable|status 0/i);
    assert.equal(error.details?.target, realCredFile, 'the readable target is the extra probe path');
    assert.equal(error.details?.evidence?.status, 3);
    assert.equal(error.details?.evidence?.blocked, false);
    assert.equal(error.details?.evidence?.verification, CREDENTIAL_READ_PROBE_OUTCOMES.READABLE);
    return true;
  });
  await assert.rejects(
    authorizeWorkerExecutionBoundary({ repoDir, worktreeDir, runDir, workUnitId: `lcim_wu_r6_${cryptoToken(8)}`, processCreation: 'ALLOWED', credentialHome: tempHome, credentialProbePaths: [credFile] }),
    /readable|status 0/i,
  );
});

// ---------------------------------------------------------------------------
// R6-9 — pure classifier determinism + seam cannot fabricate status 0
// ---------------------------------------------------------------------------

test('R6-9: credential probe classification is deterministic and status-0-only', () => {
  const classify = classifyCredentialReadProbe;
  assert.equal(classify({ status: 0 }), CREDENTIAL_READ_PROBE_OUTCOMES.BLOCKED_PROVEN);
  assert.equal(classify({ status: 3 }), CREDENTIAL_READ_PROBE_OUTCOMES.READABLE);
  assert.equal(classify({ status: 2 }), CREDENTIAL_READ_PROBE_OUTCOMES.NOT_PROVEN);
  assert.equal(classify({ status: 7 }), CREDENTIAL_READ_PROBE_OUTCOMES.NOT_PROVEN);
  assert.equal(classify({ status: 1 }), CREDENTIAL_READ_PROBE_OUTCOMES.NOT_PROVEN);
  assert.equal(classify({ status: null }), CREDENTIAL_READ_PROBE_OUTCOMES.NOT_PROVEN);
  assert.equal(classify({ status: undefined }), CREDENTIAL_READ_PROBE_OUTCOMES.NOT_PROVEN);
  assert.equal(classify({}), CREDENTIAL_READ_PROBE_OUTCOMES.NOT_PROVEN);
  // Outer spawn/sandbox error.
  assert.equal(classify({ status: null, signal: null, error: 'spawnSync ... ENOENT' }), CREDENTIAL_READ_PROBE_OUTCOMES.NOT_PROVEN);
  // Signal termination.
  assert.equal(classify({ status: null, signal: 'SIGTERM', error: null }), CREDENTIAL_READ_PROBE_OUTCOMES.NOT_PROVEN);
  // Timeout (spawnSync surfaces ETIMEDOUT error + kill signal).
  assert.equal(classify({ status: null, signal: 'SIGTERM', error: 'spawnSync ... ETIMEDOUT' }), CREDENTIAL_READ_PROBE_OUTCOMES.NOT_PROVEN);
  // Even a status-0 probe with ANY outer defect must fail closed.
  assert.equal(classify({ status: 0, error: 'outer machinery failed' }), CREDENTIAL_READ_PROBE_OUTCOMES.NOT_PROVEN);
  assert.equal(classify({ status: 0, signal: 'SIGKILL' }), CREDENTIAL_READ_PROBE_OUTCOMES.NOT_PROVEN);
});

test('R6-9S: the regression seam can fabricate FAILURE states but never status 0; ENOENT is never proof', (t) => {
  const readableFile = path.join(os.tmpdir(), `lcim-r6-seam-${cryptoToken(8)}.txt`);
  fs.writeFileSync(readableFile, 'seam fixture\n', { mode: 0o600 });
  t.after(() => fs.rmSync(readableFile, { force: true }));
  const runProbe = (extraEnv, target = readableFile) => spawnSync(process.execPath, ['-e', CREDENTIAL_READ_PROBE_SCRIPT, target], {
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
    timeout: 15_000,
  });

  // Real probe semantics on a readable target: status 3.
  assert.equal(runProbe({}).status, 3, 'readable target => exit 3');
  // Attempts to SIMULATE blocking are refused: the seam falls through to
  // the real probe, which reports READABLE — status 0 is never fabricable.
  assert.equal(runProbe({ [SEAM]: 'BLOCKED' }).status, 3, 'seam cannot fabricate status 0 (BLOCKED)');
  assert.equal(runProbe({ [SEAM]: 'DENIED' }).status, 3, 'seam cannot fabricate status 0 (DENIED)');
  // Failure-state simulations are deterministic.
  assert.equal(runProbe({ [SEAM]: 'READABLE' }).status, 3, 'READABLE => exit 3');
  assert.equal(runProbe({ [SEAM]: 'UNEXPECTED' }).status, 2, 'UNEXPECTED => exit 2');
  assert.equal(runProbe({ [SEAM]: 'UNKNOWN' }).status, 7, 'UNKNOWN => exit 7');
  // A nonexistent target is an UNEXPECTED probe condition (exit 2), never
  // a proof of denial.
  assert.equal(runProbe({}, path.join(os.tmpdir(), `lcim-r6-absent-${cryptoToken(8)}`)).status, 2, 'ENOENT => exit 2, never denial proof');
});
