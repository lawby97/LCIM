/**
 * Sprint-10 SOL-S10-001 R4 recheck regressions (R5 repair).
 *
 * DEFECT 1 — no-fork probe false-positive on non-EPERM errors: the
 * asynchronous spawn error path must NOT treat every child-creation failure
 * as structural denial. Structural no-fork authorization succeeds ONLY when
 * the attempted child creation is rejected with err.code === 'EPERM'
 * (synchronous throw or asynchronous ChildProcess 'error' event). Anything
 * else fails closed:
 *
 *   EPERM               -> STRUCTURALLY_DENIED
 *   anything else       -> NOT_PROVEN / authorization failure
 *   child spawns/execs  -> NOT_DENIED / authorization failure
 *   timeout/ambiguous   -> NOT_PROVEN / authorization failure
 *
 * DEFECT 2 — validation credential isolation: validation intentionally
 * allows process creation, so EVERY validation process AND EVERY validation
 * descendant must be structurally unable to read provider credential
 * material: no broker, no broker token, no provider credential environment
 * variables, no usable Pi auth config, DENY_ALL network, and structural
 * file-read denial of the credential locations (environment stripping alone
 * is never enough). This covers the default Pi agent directory
 * (~/.pi/agent), a custom PI_CODING_AGENT_DIR, and caller-supplied
 * credentialProbePaths — none may be dropped when switching from the MODEL
 * boundary to the VALIDATION boundary, and validation must not start until
 * its boundary has objectively verified the paths are unreadable.
 *
 * A unique sentinel (LCIM_R5_VALIDATION_SECRET_DO_NOT_LEAK_7A91) is placed
 * in temporary credential surfaces; it must appear in NONE of the persisted
 * validation/controller evidence.
 *
 * SOL-S10-002 stays FROZEN as FIXED: the added credential-deny paths are
 * part of the exact profile bytes already protected by the profile digest.
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
  CHILD_CREATION_PROBE_OUTCOMES,
  CHILD_CREATION_PROBE_SCRIPT,
  classifyChildCreationProbeOutcome,
  authorizeWorkerExecutionBoundary,
  createWorkerExecutionBoundary,
  verifyWorkerExecutionBoundary,
  runConstrainedProcess,
} from '../../src/controller/execution-boundary.mjs';
import { runValidationsOnCopy } from '../../src/controller/validation-runner.mjs';
import { resolveGitCommonDir, resolveRunDir } from '../../src/config/runtime-path.mjs';
import { generateId } from '../../src/shared/ids.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Unique sentinel placed ONLY in temporary credential fixtures. */
const SENTINEL = 'LCIM_R5_VALIDATION_SECRET_DO_NOT_LEAK_7A91';

function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return result;
}

function cryptoToken(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function isAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function withCredentialEnv(t, name, value) {
  const previous = process.env[name];
  process.env[name] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  });
}

function makeDirs(t, prefix = 'lcim-r5-') {
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

/** Target repo fixture with a local worker and a repo-local validation script. */
function makeTarget(t, { validationCommands = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-r5-target-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'lcim-test@example.invalid']);
  git(root, ['config', 'user.name', 'LCIM R5']);
  fs.writeFileSync(path.join(root, 'a.txt'), 'A\n');
  git(root, ['add', 'a.txt']);
  git(root, ['commit', '-m', 'fixture base']);
  const worker = `
let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  require('node:fs').writeFileSync('a.txt', 'B\\n');
  const id = prompt.match(/WORK_UNIT_ID:\\s+(lcim_wu_[0-9a-f]+)/)?.[1];
  process.stdout.write(JSON.stringify({ workUnitId: id, workerStatus: 'WORK_COMPLETE', summary: 'r5 fixture worker', acceptanceClaims: [], remainingIssues: [], reviewRisks: [], uncertainty: 'fixture' }));
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

function installValidateScript(root, script) {
  fs.writeFileSync(path.join(root, 'validate.cjs'), script);
}

/**
 * Build a patch artifact for a direct runValidationsOnCopy call: a temp
 * worktree at the base SHA, apply `changes`, `git diff` it.
 */
function makePatch(repoDir, baseSha, changes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-r5-patchwt-'));
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

function walkFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else out.push(file);
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}

/**
 * The sentinel must appear in NONE of the persisted evidence for a run:
 * validation stdout/stderr evidence, controller error records, process /
 * boundary evidence, audit-normalized runtime records, and project config.
 */
function assertSentinelAbsent(t, roots, sentinel) {
  const leaked = [];
  for (const root of roots) {
    for (const file of walkFiles(root)) {
      let content;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        continue; // unreadable/removed evidence cannot leak content
      }
      if (content.includes(sentinel)) leaked.push(file);
    }
  }
  assert.deepEqual(leaked, [], `sentinel leaked into persisted evidence: ${leaked.join(', ')}`);
}

function readAttemptScript(target) {
  return `const fs = require('node:fs'); try { fs.readFileSync(${JSON.stringify(target)}, 'utf8'); console.log('READABLE'); } catch (e) { console.log('code=' + (e.code || 'DENIED')); }`;
}

/** Resolve the persisted validation boundary evidence referenced by a validation evidence record. */
function validationBoundaryEvidence(root, runId, validationEvidence) {
  const ref = validationEvidence.boundaryEvidenceRef;
  assert.ok(typeof ref === 'string' && ref.startsWith('boundary:'), 'validation evidence references its boundary evidence');
  return JSON.parse(fs.readFileSync(path.join(resolveRunDir(root, runId), 'boundary', ref.slice('boundary:'.length)), 'utf8'));
}

// ---------------------------------------------------------------------------
// DEFECT 1 — no-fork probe: exact-EPERM-only classification
// ---------------------------------------------------------------------------

test('R5-1: no-fork probe classification is deterministic and exact-EPERM-only — EAGAIN/EMFILE/ENOENT rejected, seam cannot fabricate EPERM, real child creation rejected', () => {
  const runProbe = (extraEnv) => {
    const result = spawnSync(process.execPath, ['-e', CHILD_CREATION_PROBE_SCRIPT], {
      env: { ...process.env, ...extraEnv },
      encoding: 'utf8',
      timeout: 15_000,
    });
    return { status: result.status, error: result.error?.message ?? null };
  };

  // Async spawn failure with a non-EPERM code must NOT be structural proof.
  assert.equal(runProbe({ LCIM_PROBE_SIMULATE_ASYNC_ERROR: 'EAGAIN' }).status, 2, 'EAGAIN -> NOT_PROVEN (exit 2)');
  assert.equal(runProbe({ LCIM_PROBE_SIMULATE_ASYNC_ERROR: 'EMFILE' }).status, 2, 'EMFILE -> NOT_PROVEN (exit 2)');
  assert.equal(runProbe({ LCIM_PROBE_SIMULATE_ASYNC_ERROR: 'ENOENT' }).status, 2, 'ENOENT -> NOT_PROVEN (exit 2)');
  // The seam itself must never fabricate EPERM proof.
  assert.equal(runProbe({ LCIM_PROBE_SIMULATE_ASYNC_ERROR: 'EPERM' }).status, 2, 'simulated EPERM is refused inside the probe');
  // A real child creation outside the sandbox is NOT_DENIED (exit 1).
  assert.equal(runProbe({}).status, 1, 'actual child creation -> NOT_DENIED (exit 1)');

  const classify = classifyChildCreationProbeOutcome;
  assert.equal(classify({ status: 0 }), CHILD_CREATION_PROBE_OUTCOMES.DENIED_EPERM);
  assert.equal(classify({ status: 1 }), CHILD_CREATION_PROBE_OUTCOMES.SUCCEEDED);
  assert.equal(classify({ status: 2 }), CHILD_CREATION_PROBE_OUTCOMES.FAILED_OTHER);
  assert.equal(classify({ status: 3 }), CHILD_CREATION_PROBE_OUTCOMES.AMBIGUOUS);
  assert.equal(classify({ status: null, error: 'spawn EAGAIN' }), CHILD_CREATION_PROBE_OUTCOMES.AMBIGUOUS);
  assert.equal(classify({ status: null, signal: 'SIGKILL' }), CHILD_CREATION_PROBE_OUTCOMES.AMBIGUOUS);
  assert.equal(classify({ status: 0, error: 'outer machinery failed' }), CHILD_CREATION_PROBE_OUTCOMES.AMBIGUOUS);
});

test('R5-2: async EAGAIN probe failure inside a real DENIED boundary fails closed — no authorization, no spawn, no candidate', async (t) => {
  const { repoDir, worktreeDir, runDir } = makeDirs(t);
  withCredentialEnv(t, 'LCIM_PROBE_SIMULATE_ASYNC_ERROR', 'EAGAIN');

  const boundary = createWorkerExecutionBoundary({ repoDir, worktreeDir, runDir, workUnitId: `lcim_wu_r5_${cryptoToken(8)}`, processCreation: 'DENIED' });
  await assert.rejects(verifyWorkerExecutionBoundary(boundary), /exact-EPERM|structural denial/i, 'verification must refuse a non-EPERM probe outcome');
  await assert.rejects(
    authorizeWorkerExecutionBoundary({ repoDir, worktreeDir, runDir, workUnitId: `lcim_wu_r5_${cryptoToken(8)}`, processCreation: 'DENIED' }),
    /exact-EPERM|structural denial/i,
    'the production authorization entry must fail closed',
  );
  // No spawn capability was ever registered: no model provider child can spawn.
  await assert.rejects(async () => runConstrainedProcess(boundary, { command: ['/usr/bin/true'] }), /authorized/i, 'unverified boundary must never spawn');
});

test('R5-3: async EMFILE probe failure inside a real DENIED boundary fails closed — no authorization, no spawn, no candidate', async (t) => {
  const { repoDir, worktreeDir, runDir } = makeDirs(t);
  withCredentialEnv(t, 'LCIM_PROBE_SIMULATE_ASYNC_ERROR', 'EMFILE');

  const boundary = createWorkerExecutionBoundary({ repoDir, worktreeDir, runDir, workUnitId: `lcim_wu_r5_${cryptoToken(8)}`, processCreation: 'DENIED' });
  await assert.rejects(verifyWorkerExecutionBoundary(boundary), /exact-EPERM|structural denial/i);
  await assert.rejects(
    authorizeWorkerExecutionBoundary({ repoDir, worktreeDir, runDir, workUnitId: `lcim_wu_r5_${cryptoToken(8)}`, processCreation: 'DENIED' }),
    /exact-EPERM|structural denial/i,
  );
  await assert.rejects(async () => runConstrainedProcess(boundary, { command: ['/usr/bin/true'] }), /authorized/i);
});

test('R5-4: genuine Seatbelt (deny process-fork) EPERM still authorizes the DENIED boundary — async EPERM accepted as structural denial', async (t) => {
  delete process.env.LCIM_PROBE_SIMULATE_ASYNC_ERROR;
  const { repoDir, worktreeDir, runDir } = makeDirs(t);
  const authorized = await authorizeWorkerExecutionBoundary({ repoDir, worktreeDir, runDir, workUnitId: `lcim_wu_r5_${cryptoToken(8)}`, processCreation: 'DENIED' });
  assert.equal(authorized.evidence.processCreation, 'DENIED');
  assert.equal(authorized.evidence.childCreation.mode, 'STRUCTURALLY_DENIED');
  assert.equal(authorized.evidence.childCreation.blocked, true);
  assert.equal(authorized.evidence.childCreation.probed, true);
  assert.equal(authorized.evidence.childCreation.probeOutcome, CHILD_CREATION_PROBE_OUTCOMES.DENIED_EPERM);
  // A real spawn attempt inside the boundary is still refused at creation.
  const probe = await runConstrainedProcess(authorized.boundary, {
    command: [process.execPath, '-e', `try { require('node:child_process').spawn('/usr/bin/true'); process.exit(9); } catch (e) { process.exit(e.code === 'EPERM' ? 0 : 2); }`],
  });
  assert.equal(probe.status, 0, 'child creation inside the DENIED boundary must still be refused with EPERM');
});

// ---------------------------------------------------------------------------
// DEFECT 2 — validation credential isolation
// ---------------------------------------------------------------------------

test('R5-A: default Pi auth (~/.pi/agent/auth.json) is structurally unreadable by a validation process; sentinel stays out of evidence', async (t) => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-r5-home-'));
  t.after(() => fs.rmSync(tempHome, { recursive: true, force: true }));
  const piAgentDir = path.join(tempHome, '.pi', 'agent');
  const authFile = path.join(piAgentDir, 'auth.json');
  fs.mkdirSync(piAgentDir, { recursive: true });
  fs.writeFileSync(authFile, `${SENTINEL}\n`, { mode: 0o600 });

  const { repoDir, worktreeDir, runDir } = makeDirs(t);
  const authorized = await authorizeWorkerExecutionBoundary({
    repoDir,
    worktreeDir,
    runDir,
    workUnitId: `lcim_wu_r5_${cryptoToken(8)}`,
    processCreation: 'ALLOWED',
    credentialHome: tempHome,
  });
  const boundary = authorized.boundary;
  const canonicalPiAgent = fs.realpathSync(piAgentDir);
  assert.ok(boundary.credentialPaths.includes(canonicalPiAgent), 'the default pi agent dir is in the credential deny set');
  // The auth file is denied via the subtree; the verification objectively
  // probed the exact effective paths (directory AND auth.json).
  assert.ok(authorized.evidence.credentialIsolation.checkedPaths.includes(canonicalPiAgent));
  assert.ok(authorized.evidence.credentialIsolation.checkedPaths.includes(fs.realpathSync(authFile)));
  // The real default surface is denied unconditionally when it exists.
  const realPiAgent = path.join(os.homedir(), '.pi', 'agent');
  if (fs.existsSync(realPiAgent)) {
    assert.ok(boundary.credentialPaths.includes(fs.realpathSync(realPiAgent)), 'the real installed pi agent dir is always denied');
  }

  // Validation-shaped direct process read attempt: denied, secret never echoed.
  const result = await runConstrainedProcess(boundary, { command: [process.execPath, '-e', readAttemptScript(authFile)] });
  assert.match(result.stdout, /code=EPERM|code=EACCES/, `validation process must not read the pi auth file (got ${JSON.stringify(result.stdout)})`);
  assert.equal(result.stdout.includes(SENTINEL), false);
  assert.equal(result.stderr.includes(SENTINEL), false);
  // The env carries no Pi auth override either.
  assert.equal('PI_CODING_AGENT_DIR' in boundary.environment, false, 'PI_CODING_AGENT_DIR must be stripped from the boundary environment');
});

test('R5-B: detached validation descendant cannot read default Pi auth — no credential access, no broker, no parent/Git-common writes; sentinel stays out of evidence', async (t) => {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-r5-home-'));
  t.after(() => fs.rmSync(tempHome, { recursive: true, force: true }));
  const authFile = path.join(tempHome, '.pi', 'agent', 'auth.json');
  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  fs.writeFileSync(authFile, `${SENTINEL}\n`, { mode: 0o600 });

  const target = makeTarget(t);
  const repoDir = target.root;
  const baseSha = target.baseSha;
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-r5-run-'));
  t.after(() => fs.rmSync(runDir, { recursive: true, force: true }));
  const patchText = makePatch(repoDir, baseSha, { 'a.txt': 'B\n' });
  assert.ok(patchText.includes('B\n'), 'patch artifact changes a.txt');

  const parentProbe = path.join(path.dirname(repoDir), 'lcim-r5-descendant-parent-probe');
  const gitCommonProbe = path.join(runDir, 'lcim-r5-descendant-runtime-probe');
  const validateScript = `const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const AUTH = ${JSON.stringify(authFile)};
const PARENT = ${JSON.stringify(parentProbe)};
const GITCOMMON = ${JSON.stringify(gitCommonProbe)};
const log = path.join(process.cwd(), '.r5-descendant-log.txt');
const record = (label, value) => { try { fs.appendFileSync(log, label + '=' + value + '\\n'); } catch {} };
const attemptRead = (label, target) => { try { fs.readFileSync(target, 'utf8'); record(label, 'READABLE'); } catch (e) { record(label, e.code || 'DENIED'); } };
// 1. The DIRECT validation process attempts to read the credential.
attemptRead('direct', AUTH);
record('pi_dir', process.env.PI_CODING_AGENT_DIR || 'absent');
// 2. A DETACHED validation descendant attempts the same read; it inherits
//    the same sandbox profile (no broker, no credentials, DENY_ALL network,
//    writes confined to the disposable copy).
const childScript = \`
const fs = require('node:fs');
const path = require('node:path');
const AUTH = ${JSON.stringify(authFile)};
const PARENT = ${JSON.stringify(parentProbe)};
const GITCOMMON = ${JSON.stringify(gitCommonProbe)};
const log = ${JSON.stringify('<LOG>')};
const record = (label, value) => { try { fs.appendFileSync(log, label + '=' + value + '\\\\n'); } catch {} };
const attemptRead = (label, target) => { try { fs.readFileSync(target, 'utf8'); record(label, 'READABLE'); } catch (e) { record(label, e.code || 'DENIED'); } };
attemptRead('child_auth', AUTH);
record('child_pi_dir', process.env.PI_CODING_AGENT_DIR || 'absent');
record('child_cred_keys', Object.keys(process.env).filter((k) => /(API|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|PRIVATE.?KEY)/i.test(k)).join(','));
try { fs.writeFileSync(PARENT, 'x'); record('child_parent', 'ALLOWED'); } catch (e) { record('child_parent', e.code || 'DENIED'); }
try { fs.writeFileSync(GITCOMMON, 'x'); record('child_gitcommon', 'ALLOWED'); } catch (e) { record('child_gitcommon', e.code || 'DENIED'); }
try { fs.writeFileSync(path.join(process.env.HOME || '/nonexistent', 'r5-home-probe'), 'x'); record('child_home', 'ALLOWED'); } catch (e) { record('child_home', e.code || 'DENIED'); }
let tick = 0;
setInterval(() => { try { fs.appendFileSync(log, 'tick' + (++tick) + '\\\\n'); } catch {} }, 100);
setTimeout(() => process.exit(0), 8000);
\`.replace('<LOG>', log);
const child = spawn(process.execPath, ['-e', childScript], { detached: true, stdio: 'ignore' });
child.unref();
// Wait for the descendant's first observations (copy-local log only), report
// them as evidence, and exit — the descendant keeps running briefly.
const deadline = Date.now() + 2500;
(function poll() {
  let lines = [];
  try { lines = fs.readFileSync(log, 'utf8').trim().split('\\n').filter(Boolean); } catch {}
  if (Date.now() > deadline) {
    console.log('CHILD_PID=' + child.pid);
    console.log(lines.join('\\n'));
    process.exit(0);
  }
  setTimeout(poll, 100);
})();
`;
  installValidateScript(repoDir, validateScript);

  const validation = await runValidationsOnCopy({
    projectConfig: { validation: { commands: [['node', 'validate.cjs']] } },
    repoDir,
    runDir,
    workUnitId: generateId('work-unit'),
    invocationId: generateId('invocation'),
    expectedBaseSha: baseSha,
    patchText,
    patchRecord: { patchId: `lcim_patch_${cryptoToken(8)}`, patchHash: crypto.createHash('sha256').update(patchText).digest('hex'), changedPaths: ['a.txt'] },
    credentialHome: tempHome,
  });

  assert.equal(validation.applied, true);
  assert.equal(validation.results.length, 1);
  assert.equal(validation.results[0].outcome, 'PASS', validation.results[0].summary);
  const stdoutTail = validation.results[0].stdoutTail;
  assert.match(stdoutTail, /direct=EACCES|direct=EPERM/, 'the direct validation process cannot read the pi auth file');
  assert.match(stdoutTail, /child_auth=EACCES|child_auth=EPERM/, 'the detached validation descendant cannot read the pi auth file');
  assert.match(stdoutTail, /pi_dir=absent/, 'no Pi agent dir override reaches validation');
  assert.match(stdoutTail, /child_pi_dir=absent/, 'no Pi agent dir override reaches the descendant');
  assert.match(stdoutTail, /child_cred_keys=$/m, 'the descendant inherits NO credential environment keys');
  assert.match(stdoutTail, /child_parent=EACCES|child_parent=EPERM/, 'the descendant cannot write the parent directory');
  assert.match(stdoutTail, /child_gitcommon=EACCES|child_gitcommon=EPERM/, 'the descendant cannot write the run/Git-common store');
  assert.match(stdoutTail, /child_home=EACCES|child_home=EPERM/, 'the descendant cannot write outside the validation surface');
  assert.match(stdoutTail, /tick\d+/, 'the detached descendant survives the validation phase while remaining confined');
  assert.equal(stdoutTail.includes(SENTINEL), false);
  assert.equal(validation.results[0].stderrTail.includes(SENTINEL), false);
  const childPid = Number(stdoutTail.match(/CHILD_PID=(\d+)/)?.[1]);
  assert.ok(Number.isSafeInteger(childPid) && childPid > 1, 'a detached child identity was recorded');

  // Validation boundary evidence: broker NONE, network DENY_ALL, credentials
  // objectively probed (including the pi agent dir + auth.json).
  const boundaryEvidence = JSON.parse(fs.readFileSync(validation.boundaryEvidencePath, 'utf8'));
  assert.equal(boundaryEvidence.network.mode, 'DENY_ALL');
  assert.ok(boundaryEvidence.credentialIsolation.checkedPaths.includes(fs.realpathSync(authFile)));
  assert.deepEqual(validation.evidence.network, { mode: 'DENY_ALL', broker: null, providerCredentials: 'none' });

  // The sentinel must not appear in ANY persisted validation evidence.
  assertSentinelAbsent(t, [runDir, repoDir], SENTINEL);

  // Test hygiene: terminate the confined descendant (security does not depend on it).
  try { process.kill(childPid, 'SIGKILL'); } catch { /* already gone */ }
});

test('R5-C: custom PI_CODING_AGENT_DIR is stripped from the validation environment AND structurally unreadable; sentinel stays out of evidence', async (t) => {
  const customDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-r5-custom-'));
  t.after(() => fs.rmSync(customDir, { recursive: true, force: true }));
  const authFile = path.join(customDir, 'auth.json');
  fs.writeFileSync(authFile, `${SENTINEL}\n`, { mode: 0o600 });
  withCredentialEnv(t, 'PI_CODING_AGENT_DIR', customDir);

  const validateScript = `const fs = require('node:fs');
const out = [];
out.push('pi_dir=' + (process.env.PI_CODING_AGENT_DIR || 'absent'));
try { fs.readFileSync(${JSON.stringify(authFile)}, 'utf8'); out.push('read=READABLE'); } catch (e) { out.push('read=' + (e.code || 'DENIED')); }
console.log(out.join('|'));
`;
  const target = makeTarget(t, { validationCommands: [['node', 'validate.cjs']] });
  installValidateScript(target.root, validateScript);

  const result = await runController({ cwd: target.root });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.validationEvidencePaths.length, 1);

  const validation = JSON.parse(fs.readFileSync(result.validationEvidencePaths[0], 'utf8'));
  assert.equal(validation.results[0].outcome, 'PASS', validation.results[0].summary);
  assert.match(validation.results[0].stdoutTail, /pi_dir=absent/, 'validation must NOT inherit the custom PI_CODING_AGENT_DIR');
  assert.match(validation.results[0].stdoutTail, /read=EACCES|read=EPERM/, 'the custom PI_CODING_AGENT_DIR surface is structurally unreadable');

  // The validation boundary objectively probed the original custom directory.
  const vBoundary = validationBoundaryEvidence(target.root, result.runId, validation);
  assert.ok(vBoundary.credentialIsolation.checkedPaths.includes(fs.realpathSync(customDir)), 'custom agent dir is a checked credential path');
  assert.ok(vBoundary.credentialIsolation.checkedPaths.includes(fs.realpathSync(authFile)), 'custom auth.json is a checked credential path');
  assert.equal(vBoundary.network.mode, 'DENY_ALL');

  // Sentinel absent from every persisted record of the run.
  const runtimeRoot = path.join(resolveGitCommonDir(target.root), 'lcim');
  assertSentinelAbsent(t, [runtimeRoot, path.join(target.root, '.lcim')], SENTINEL);
});

test('R5-D: caller-supplied credentialProbePaths are denied for validation reads (not dropped at the MODEL -> VALIDATION boundary switch); sentinel stays out of evidence', async (t) => {
  const credFile = path.join(os.tmpdir(), `lcim-r5-probe-${cryptoToken(8)}.txt`);
  fs.writeFileSync(credFile, `${SENTINEL}\n`, { mode: 0o600 });
  t.after(() => fs.rmSync(credFile, { force: true }));

  const validateScript = `const fs = require('node:fs');
try { fs.readFileSync(${JSON.stringify(credFile)}, 'utf8'); console.log('read=READABLE'); } catch (e) { console.log('read=' + (e.code || 'DENIED')); }
`;
  const target = makeTarget(t, { validationCommands: [['node', 'validate.cjs']] });
  installValidateScript(target.root, validateScript);

  const result = await runController({ cwd: target.root, credentialProbePaths: [credFile] });
  assert.equal(result.ok, true, JSON.stringify(result.errors));

  const validation = JSON.parse(fs.readFileSync(result.validationEvidencePaths[0], 'utf8'));
  assert.equal(validation.results[0].outcome, 'PASS', validation.results[0].summary);
  assert.match(validation.results[0].stdoutTail, /read=EACCES|read=EPERM/, 'validation cannot read the caller-supplied credential path');

  // Both the MODEL boundary and the VALIDATION boundary deny it.
  const vBoundary = validationBoundaryEvidence(target.root, result.runId, validation);
  assert.ok(vBoundary.credentialIsolation.checkedPaths.includes(fs.realpathSync(credFile)), 'validation boundary checked the probe path');
  const mBoundary = JSON.parse(fs.readFileSync(result.boundaryEvidencePaths[0], 'utf8'));
  assert.ok(mBoundary.credentialIsolation.checkedPaths.includes(fs.realpathSync(credFile)), 'model boundary checked the probe path');

  const runtimeRoot = path.join(resolveGitCommonDir(target.root), 'lcim');
  assertSentinelAbsent(t, [runtimeRoot, path.join(target.root, '.lcim')], SENTINEL);
});

test('R5-E: provider credential environment variables are stripped from validation (OPENAI_API_KEY, DEEPSEEK_API_KEY, ANTHROPIC_API_KEY)', async (t) => {
  withCredentialEnv(t, 'OPENAI_API_KEY', 'r5-e-openai-key-0123456789abcdef');
  withCredentialEnv(t, 'DEEPSEEK_API_KEY', 'r5-e-deepseek-key-0123456789abcdef');
  withCredentialEnv(t, 'ANTHROPIC_API_KEY', 'r5-e-anthropic-key-0123456789abcdef');

  const validateScript = `const out = [];
for (const key of ['OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'ANTHROPIC_API_KEY', 'PI_CODING_AGENT_DIR']) {
  out.push(key + '=' + (process.env[key] === undefined ? 'absent' : 'present'));
}
out.push('cred_keys=' + Object.keys(process.env).filter((k) => /(API|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|PRIVATE.?KEY)/i.test(k)).sort().join(','));
console.log(out.join('|'));
`;
  const target = makeTarget(t, { validationCommands: [['node', 'validate.cjs']] });
  installValidateScript(target.root, validateScript);

  const result = await runController({ cwd: target.root });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const validation = JSON.parse(fs.readFileSync(result.validationEvidencePaths[0], 'utf8'));
  assert.equal(validation.results[0].outcome, 'PASS');
  const stdoutTail = validation.results[0].stdoutTail;
  assert.match(stdoutTail, /OPENAI_API_KEY=absent/);
  assert.match(stdoutTail, /DEEPSEEK_API_KEY=absent/);
  assert.match(stdoutTail, /ANTHROPIC_API_KEY=absent/);
  assert.match(stdoutTail, /PI_CODING_AGENT_DIR=absent/);
  assert.match(stdoutTail, /cred_keys=$/m, 'no credential-shaped environment key reaches validation');

  // The fake provider values must never reach any persisted record either.
  const runtimeRoot = path.join(resolveGitCommonDir(target.root), 'lcim');
  const leaked = [];
  for (const root of [runtimeRoot, path.join(target.root, '.lcim')]) {
    for (const file of walkFiles(root)) {
      let content;
      try { content = fs.readFileSync(file, 'utf8'); } catch { continue; }
      for (const value of ['r5-e-openai-key-0123456789abcdef', 'r5-e-deepseek-key-0123456789abcdef', 'r5-e-anthropic-key-0123456789abcdef']) {
        if (content.includes(value)) leaked.push(`${file} (${value})`);
      }
    }
  }
  assert.deepEqual(leaked, [], `provider credential values leaked into persisted evidence: ${leaked.join(', ')}`);
});

test('R5-F: validation boundary remains broker NONE + network DENY_ALL with process creation ALLOWED', async (t) => {
  const target = makeTarget(t);
  const repoDir = target.root;
  const baseSha = target.baseSha;
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-r5-run-'));
  t.after(() => fs.rmSync(runDir, { recursive: true, force: true }));
  const patchText = makePatch(repoDir, baseSha, { 'a.txt': 'B\n' });

  const validation = await runValidationsOnCopy({
    projectConfig: { validation: { commands: [['/bin/sh', '-c', 'exit 0']] } },
    repoDir,
    runDir,
    workUnitId: generateId('work-unit'),
    invocationId: generateId('invocation'),
    expectedBaseSha: baseSha,
    patchText,
    patchRecord: { patchId: `lcim_patch_${cryptoToken(8)}`, patchHash: crypto.createHash('sha256').update(patchText).digest('hex'), changedPaths: ['a.txt'] },
  });

  assert.equal(validation.applied, true);
  assert.equal(validation.results[0].outcome, 'PASS');
  assert.deepEqual(validation.evidence.network, { mode: 'DENY_ALL', broker: null, providerCredentials: 'none' });
  assert.equal(validation.evidence.credentialIsolation, 'environment-stripped-and-filesystem-denied');
  assert.equal(validation.evidence.processCreation, 'ALLOWED');
  const boundaryEvidence = JSON.parse(fs.readFileSync(validation.boundaryEvidencePath, 'utf8'));
  assert.equal(boundaryEvidence.network.mode, 'DENY_ALL');
  assert.equal(boundaryEvidence.processCreation, 'ALLOWED');
});
