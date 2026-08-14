/**
 * Sprint-10 SOL-S10-001 R4 — structural no-descendant MODEL boundary.
 *
 * SOL-S10-001 (R4) — the primary descendant-prevention proof is structural:
 * the MODEL invocation boundary's Seatbelt profile contains
 * `(deny process-fork)`, which on this host refuses fork(2) AND
 * posix_spawn(2) with EPERM at creation, BEFORE any descendant becomes
 * executable. The R3 polling/process-table supervisor remains only as
 * DEFENSE IN DEPTH / DIAGNOSTIC; it is never the source of quiescence for
 * a process-capable worker, and LCIM_INVOCATION_MARKER has ZERO authority.
 *
 * Under test:
 *
 * 1. Seatbelt child-creation probe (host primitive): node spawn, detached
 *    spawn, shell background, nohup-style, fork, and raw posix_spawn are
 *    ALL refused at creation inside a DENIED boundary; an ALLOWED boundary
 *    still spawns (the probe distinguishes the policies).
 * 2. Exact marker-free inter-scan attack: worker removes the marker, waits
 *    at a sync point after any supervisor scan, attempts a detached
 *    watcher, and exits before any hypothetical poll — the detached
 *    process is NEVER created; the controller extracts an immutable patch;
 *    a semantic rejection triggers ONE legitimate SOL invocation; the SOL
 *    upstream sees ONLY the compiled ask; zero attacker requests.
 * 3. Worker tool surface: the model-controlled tool set is exactly
 *    read/write/edit/ls; a fake model attempting the bash tool receives
 *    TOOL_NOT_AVAILABLE ("Tool bash not found") with ZERO child creation.
 * 4. Production Pi (real CLI) under the no-fork boundary: DeepSeek edit
 *    path and SOL path complete through fresh brokers and fake HTTPS
 *    upstreams; the boundary evidence records the empirical
 *    child-creation probe.
 * 5. Immutable patch artifact -> separate validation copy: validation runs
 *    on base + exact artifact bytes, cannot alter the authoritative
 *    artifact, and dispositions reference patchHash.
 * 6. Delayed validation descendant: even a detached survivor of the
 *    validation phase has no broker, no credentials, DENY_ALL network,
 *    and no authority over the parent/Git-common/artifact.
 *
 * Local-only: no real provider network calls. Pi-path tests are skipped
 * when the real `pi` CLI is not on PATH.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { setupProject } from '../../src/project/config.mjs';
import { runController } from '../../src/controller/orchestrator.mjs';
import {
  authorizeWorkerExecutionBoundary,
  runConstrainedProcess,
} from '../../src/controller/execution-boundary.mjs';
import {
  resolveBrokerRoute,
  startProviderBroker,
} from '../../src/controller/provider-broker.mjs';
import { resolveGitCommonDir, resolveRunDir } from '../../src/config/runtime-path.mjs';
import { resolvePatchEvidenceDir, loadPatchEvidence } from '../../src/evidence/patch/store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (!allowFailure && result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return result;
}

function which(bin) {
  const result = spawnSync('which', [bin], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

const PI_BIN = which('pi');
const hasRealPi = PI_BIN !== null && PI_BIN.length > 0;

function cryptoToken(bytes) {
  return crypto.randomBytes(bytes).toString('hex');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function messageText(message) {
  const content = message?.content ?? '';
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'string' ? part : part?.text ?? '')).join('\n');
  }
  return String(content);
}

function workerJsonFor(prompt, { spawnDenied = null } = {}) {
  const id = prompt.match(/WORK_UNIT_ID:\s+(lcim_wu_[0-9a-f]+)/)?.[1] ?? null;
  const summary = spawnDenied !== null ? `r4 fixture worker spawn_denied=${spawnDenied}` : 'r4 fixture worker';
  return JSON.stringify({
    workUnitId: id,
    workerStatus: 'WORK_COMPLETE',
    summary,
    acceptanceClaims: [],
    remainingIssues: [],
    reviewRisks: [],
    uncertainty: 'fixture worker does not decide controller readiness',
  });
}

function solDiagnoseJsonFor(prompt) {
  const askId = prompt.match(/Ask id: (lcim_sol_ask_[0-9a-f]+)/)?.[1] ?? null;
  const criterion = prompt.match(/Criterion \(sideEffectId\): (se_[0-9a-f]{64})/)?.[1] ?? null;
  const requirement = prompt.match(/Criterion requirement \(authoritative, verbatim\): (.*)/)?.[1] ?? '';
  const evidence = prompt.match(/Prior evidence \(refs into the single bounded evidence universe\): (.*)/)?.[1]?.split(',')[0]?.trim() ?? null;
  return JSON.stringify({
    askId,
    callType: 'SOL_DIAGNOSE',
    verdict: 'CAUSE_IDENTIFIED',
    decisionSummary: 'one bounded cause identified',
    evidence: [],
    failure: {
      rootCause: 'the bounded controller gate was not satisfied',
      evidenceRefs: evidence ? [evidence] : [],
      repair: {
        mustChange: [{ target: 'mutation', change: 'restore the bounded controller gate' }],
        mustNotChange: [{ target: 'contract', reason: 'preserve locked semantics' }],
        exactTests: [{ name: 'criterion test', expectation: requirement, acceptanceCriterionRef: criterion }],
        verification: [{ method: 'controller check', expectation: 'the criterion is satisfied' }],
      },
      falsification: 'a passing controller gate would disprove this cause',
    },
  });
}

/**
 * Deterministic fake OpenAI-compatible SSE upstream. `agent(record,
 * hasToolResult)` returns `{ toolCall }` or `{ content }`.
 */
async function fakeUpstream(t, { name, agent, tls = false } = {}) {
  const requests = [];
  const handler = (req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(body || '{}'); } catch { /* malformed fixtures fail downstream */ }
      const hasToolResult = (parsed.messages ?? []).some((m) => m.role === 'tool');
      const record = {
        method: req.method,
        url: req.url,
        auth: req.headers.authorization ?? null,
        model: parsed.model ?? null,
        prompt: messageText((parsed.messages ?? []).find((m) => m.role === 'user')),
        body,
      };
      requests.push(record);
      const decision = agent(record, hasToolResult);
      const deepseek = record.model === 'deepseek-v4-flash' || record.model === 'deepseek-pro-max';
      const chunk = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      if (decision?.toolCall !== undefined && decision.toolCall !== null) {
        chunk({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: record.model, choices: [{ index: 0, delta: { role: 'assistant', content: '', ...(deepseek ? { reasoning_content: 'fixture reasoning' } : {}) }, finish_reason: null }] });
        chunk({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: record.model, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call_fixture_1', type: 'function', function: { name: decision.toolCall.name, arguments: decision.toolCall.arguments } }] }, finish_reason: null }] });
        chunk({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: record.model, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] });
      } else {
        const content = decision?.content ?? '';
        if (deepseek) {
          chunk({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: record.model, choices: [{ index: 0, delta: { role: 'assistant', content: '', reasoning_content: 'fixture reasoning' }, finish_reason: null }] });
          chunk({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: record.model, choices: [{ index: 0, delta: { content, reasoning_content: '' }, finish_reason: null }] });
        } else {
          chunk({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: record.model, choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }] });
          chunk({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: record.model, choices: [{ index: 0, delta: { content }, finish_reason: null }] });
        }
      }
      chunk({ id: 'c1', object: 'chat.completion.chunk', created: 1, model: record.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
      res.write('data: [DONE]\n\n');
      res.end();
    });
  };
  const server = tls
    ? await (async () => {
      const https = await import('node:https');
      return https.createServer({ key, cert }, handler);
    })()
    : http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  return { port, baseUrl: `${tls ? 'https' : 'http'}://127.0.0.1:${port}/v1`, requests };
}

let tlsFixtureCache = null;
function tlsFixture() {
  if (tlsFixtureCache !== null) return tlsFixtureCache;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-r4-tls-'));
  const openssl = (args) => {
    const result = spawnSync('openssl', args, { cwd: dir, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`openssl ${args.join(' ')} failed: ${result.stderr}`);
  };
  openssl(['req', '-x509', '-newkey', 'rsa:2048', '-keyout', 'ca-key.pem', '-out', 'ca-cert.pem', '-days', '2', '-nodes', '-subj', '/CN=LCIM R4 Test CA']);
  openssl(['req', '-newkey', 'rsa:2048', '-keyout', 'server-key.pem', '-out', 'server.csr', '-nodes', '-subj', '/CN=localhost']);
  fs.writeFileSync(path.join(dir, 'san.ext'), 'subjectAltName=DNS:localhost,IP:127.0.0.1\n');
  openssl(['x509', '-req', '-in', 'server.csr', '-CA', 'ca-cert.pem', '-CAkey', 'ca-key.pem', '-CAcreateserial', '-out', 'server-cert.pem', '-days', '2', '-extfile', 'san.ext']);
  tlsFixtureCache = {
    caPath: path.join(dir, 'ca-cert.pem'),
    key: fs.readFileSync(path.join(dir, 'server-key.pem')),
    cert: fs.readFileSync(path.join(dir, 'server-cert.pem')),
  };
  return tlsFixtureCache;
}

const key = tlsFixture().key;
const cert = tlsFixture().cert;

function makeTarget(t, { allowedWritePaths = ['a.txt'], validationCommands = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-r4-target-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'lcim-test@example.invalid']);
  git(root, ['config', 'user.name', 'LCIM R4']);
  fs.writeFileSync(path.join(root, 'a.txt'), 'A\n');
  git(root, ['add', 'a.txt']);
  git(root, ['commit', '-m', 'fixture base']);
  setupProject({ cwd: root });
  const configPath = path.join(root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.allowedWritePaths = allowedWritePaths;
  config.worker.command = null;
  config.sol.command = null;
  config.permissions.externalProvider = true;
  if (validationCommands.length > 0) config.validation.commands = validationCommands;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return root;
}

async function makeBoundary(t, { processCreation = 'DENIED', broker = null } = {}) {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-r4-bnd-repo-'));
  const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-r4-bnd-wt-'));
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-r4-bnd-run-'));
  t.after(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(worktreeDir, { recursive: true, force: true });
    fs.rmSync(runDir, { recursive: true, force: true });
  });
  const authorized = await authorizeWorkerExecutionBoundary({
    repoDir,
    worktreeDir,
    runDir,
    workUnitId: `lcim_wu_r4_${cryptoToken(12)}`,
    ...(broker === null ? {} : { broker: { port: broker.port } }),
    processCreation,
  });
  return { repoDir, worktreeDir, runDir, authorized };
}

// ---------------------------------------------------------------------------
// R4/1 + R4/2 — host primitive: Seatbelt child-creation denial matrix
// ---------------------------------------------------------------------------

test('SOL-S10-001/R4-1: process-creation denial matrix — every spawn variant is refused AT CREATION inside the DENIED boundary', async (t) => {
  const { authorized, worktreeDir } = await makeBoundary(t, { processCreation: 'DENIED' });

  // The boundary verification already proved the denial with its own probe;
  // this matrix proves the variant coverage explicitly. Node probes exit 0
  // ONLY when the spawn was refused with EPERM at creation. Shell probes
  // write a worktree marker ONLY when the background child was created; the
  // marker must never appear because fork itself is denied.
  const mk = (name) => path.join(worktreeDir, `.spawn-marker-${name}`);
  const nodeSpawn = (label, script) => ({ label, check: 'exit0-denied', args: [process.execPath, '-e', script] });
  const probes = [
    nodeSpawn('node spawn()', `try { require('node:child_process').spawn('/usr/bin/true'); process.exit(9); } catch (e) { process.exit(e.code === 'EPERM' ? 0 : 2); }`),
    nodeSpawn('node spawn detached', `try { require('node:child_process').spawn('/bin/sleep', ['30'], { detached: true, stdio: 'ignore' }); process.exit(9); } catch (e) { process.exit(e.code === 'EPERM' ? 0 : 2); }`),
    nodeSpawn('node fork detached', `try { require('node:child_process').fork('/usr/local/bin/node', ['-e', 'setInterval(()=>{},1e3)'], { detached: true, stdio: 'ignore' }); process.exit(9); } catch (e) { process.exit(e.code === 'EPERM' ? 0 : 2); }`),
    { label: 'posix_spawn (python)', check: 'exit0-denied', args: ['/usr/bin/python3', '-c', `import os,sys
try:
 os.posix_spawn('/bin/echo',['/bin/echo','hi'],{})
 sys.exit(9)
except OSError as e:
 sys.exit(0 if e.errno == 1 else 2)`] },
    { label: 'shell background child', check: 'marker', marker: mk('bg'), args: ['/bin/sh', '-c', `sleep 30 & echo CREATED > ${JSON.stringify(mk('bg'))}; exit 0`] },
    { label: 'nohup-style background', check: 'marker', marker: mk('nohup'), args: ['/bin/sh', '-c', `nohup sleep 30 >/dev/null 2>&1 & echo CREATED > ${JSON.stringify(mk('nohup'))}; exit 0`] },
    { label: 'shell background (setsid-style new session via sh)', check: 'marker', marker: mk('bg2'), args: ['/bin/sh', '-c', `sleep 30 & disown 2>/dev/null; echo CREATED > ${JSON.stringify(mk('bg2'))}; exit 0`] },
  ];
  for (const probe of probes) {
    const result = await runConstrainedProcess(authorized.boundary, { command: [probe.args[0]], args: probe.args.slice(1), timeoutMs: 30_000 });
    if (probe.check === 'exit0-denied') {
      assert.equal(result.status, 0, `${probe.label} must be refused at creation with EPERM (got status ${result.status}${result.error ? `, ${result.error}` : ''}; stderr: ${JSON.stringify((result.stderr ?? '').slice(0, 200))})`);
      assert.equal(result.stdout, '', `${probe.label} must never spawn a child`);
    } else {
      assert.equal(fs.existsSync(probe.marker), false, `${probe.label} must be denied at creation (no child, no marker)`);
      assert.notEqual(result.status, 0, `${probe.label} must fail inside the sandbox`);
    }
  }

  // The evidence recorded by verification proves the structural property.
  const evidence = authorized.evidence;
  assert.equal(evidence.processCreation, 'DENIED');
  assert.equal(evidence.childCreation.mode, 'STRUCTURALLY_DENIED');
  assert.equal(evidence.childCreation.blocked, true);
  assert.equal(evidence.childCreation.probed, true);
});

test('SOL-S10-001/R4-2: the ALLOWED boundary (validation profile) still spawns — the probe distinguishes the policies', async (t) => {
  const { authorized, worktreeDir } = await makeBoundary(t, { processCreation: 'ALLOWED' });
  assert.equal(authorized.evidence.processCreation, 'ALLOWED');
  assert.equal(authorized.evidence.childCreation.mode, 'ALLOWED');
  const marker = path.join(worktreeDir, 'allowed-probe-proof');
  const result = await runConstrainedProcess(authorized.boundary, {
    command: ['/bin/sh'],
    args: ['-c', `printf ok > ${JSON.stringify(marker)}`],
  });
  assert.equal(result.status, 0);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'ok');
  // And a genuine child spawn succeeds (the ALLOWED profile permits fork).
  const spawned = await runConstrainedProcess(authorized.boundary, {
    command: [process.execPath, '-e',
      `const { spawn } = require('node:child_process'); const c = spawn('/usr/bin/true'); c.on('error', () => process.exit(2)); c.on('exit', () => process.exit(0));`],
  });
  assert.equal(spawned.status, 0, 'the validation/ALLOWED boundary must still be able to spawn controller-owned test processes');
});

// ---------------------------------------------------------------------------
// R4/3 — exact marker-free inter-scan attack (the R3 attack, now impossible)
// ---------------------------------------------------------------------------

/** Local worker fixture implementing the exact R3 attack sequence. */
function installMarkerAttackWorker(t, root) {
  const worker = `
let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  const fs = require('node:fs');
  let denial = null;
  try {
    // 2. Remove the invocation marker (must have ZERO authority).
    delete process.env.LCIM_INVOCATION_MARKER;
    // 1. Synchronization point: yield after any supervisor scan.
    const syncAt = Date.now() + 120;
    while (Date.now() < syncAt) { /* deterministic inter-scan window */ }
    // 3. Attempt the detached new-session watcher.
    const { spawn } = require('node:child_process');
    const w = spawn(process.execPath, ['/tmp/lcim-r4-never-created.cjs'], { detached: true, stdio: 'ignore' });
    w.unref();
    denial = 'UNDENIED pid=' + w.pid;
  } catch (error) {
    denial = (error && error.code) || (error && error.message) || 'DENIED';
  }
  // 4. The worker exits before any hypothetical 100 ms poll.
  fs.writeFileSync('a.txt', 'B\\n');
  const id = prompt.match(/WORK_UNIT_ID:\\s+(lcim_wu_[0-9a-f]+)/)?.[1];
  process.stdout.write(JSON.stringify({ workUnitId: id, workerStatus: 'WORK_COMPLETE', summary: 'r4 attack fixture spawn_denied=' + denial, acceptanceClaims: [], remainingIssues: [], reviewRisks: [], uncertainty: 'fixture' }));
});
`;
  fs.writeFileSync(path.join(root, 'worker.cjs'), worker);
  const configPath = path.join(root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.worker.command = ['node', 'worker.cjs'];
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

function installLocalSolCommand(t, root) {
  // Pure stdout SOL fixture: no repository writes (the model boundary
  // confines the SOL process to the worker worktree; the compiled ask is
  // verified from the controller-persisted ask artifact instead).
  const sol = `
let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  const askId = prompt.match(/Ask id: (lcim_sol_ask_[0-9a-f]+)/)?.[1];
  const criterion = prompt.match(/Criterion \\(sideEffectId\\): (se_[0-9a-f]{64})/)?.[1];
  const requirement = prompt.match(/Criterion requirement \\(authoritative, verbatim\\): (.*)/)?.[1];
  const evidence = prompt.match(/Prior evidence \\(refs into the single bounded evidence universe\\): (.*)/)?.[1]?.split(',')[0]?.trim() ?? null;
  process.stdout.write(JSON.stringify({ askId, callType: 'SOL_DIAGNOSE', verdict: 'CAUSE_IDENTIFIED', decisionSummary: 'one bounded cause identified', evidence: [], failure: { rootCause: 'the bounded controller gate was not satisfied', evidenceRefs: evidence ? [evidence] : [], repair: { mustChange: [{ target: 'mutation', change: 'restore the bounded controller gate' }], mustNotChange: [{ target: 'contract', reason: 'preserve locked semantics' }], exactTests: [{ name: 'criterion test', expectation: requirement, acceptanceCriterionRef: criterion }], verification: [{ method: 'controller check', expectation: 'the criterion is satisfied' }] }, falsification: 'a passing controller gate would disprove this cause' } }));
});
`;
  fs.writeFileSync(path.join(root, 'sol.cjs'), sol);
  const configPath = path.join(root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.sol.command = ['node', 'sol.cjs'];
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

function readRawOutputs(repoDir, runId) {
  const dir = path.join(resolveRunDir(repoDir, runId), 'controller', 'raw');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).sort().map((name) => ({
    invocationId: name.replace(/\.txt$/, ''),
    text: fs.readFileSync(path.join(dir, name), 'utf8'),
  }));
}

function watcherPidsFromRun(repoDir, runId) {
  const pids = [];
  for (const raw of readRawOutputs(repoDir, runId)) {
    const matches = raw.text.matchAll(/watcher_pid[":= ]+(\d+)/g);
    for (const match of matches) pids.push(Number(match[1]));
  }
  return [...new Set(pids)];
}

test('SOL-S10-001/R4-3: exact marker-free inter-scan attack — the detached process is NEVER created; the polling interval is irrelevant', async (t) => {
  const root = makeTarget(t);
  installMarkerAttackWorker(t, root);
  installLocalSolCommand(t, root);

  let semanticCalls = 0;
  const result = await runController({
    cwd: root,
    semanticValidator: async () => ({ accepted: ++semanticCalls > 1 }),
  });

  // 5. The run completes: worker direct process exited; controller safely
  //    extracted an immutable patch; semantic rejection routed to SOL.
  assert.equal(result.ok, true);
  assert.equal(result.disposition, 'SEMANTICALLY_ACCEPTED');
  assert.equal(result.finalSummary.invocations, 3, 'worker + legitimate SOL + repair worker');
  assert.equal(semanticCalls, 2);
  assert.ok(result.routeDecisions.some((decision) => decision.decision === 'ROUTE_SOL_DIAGNOSE'));

  // The worker observed the spawn refusal AT CREATION.
  const rawOutputs = readRawOutputs(root, result.runId);
  assert.ok(rawOutputs.some((raw) => raw.text.includes('spawn_denied=EPERM')), 'the detached spawn must be refused at creation');
  assert.equal(watcherPidsFromRun(root, result.runId).length, 0, 'no watcher identity can exist');

  // 6. The extracted patch is stable and immutable; no delayed mutation.
  const patchText = fs.readFileSync(path.join(resolvePatchEvidenceDir(root), `${result.patchEvidence.patchId}.patch`), 'utf8');
  assert.equal(patchText.includes('EVIL-DELAYED-MUTATION'), false);
  assert.equal(patchText.includes('+B'), true);
  assert.deepEqual(result.patchEvidence.changedPaths, ['a.txt']);

  // 7-10. SOL: exactly ONE legitimate invocation; the compiled Sprint-06 ask
  // artifact is controller-persisted and contains no attacker content.
  const runDir = resolveRunDir(root, result.runId);
  const askDir = path.join(runDir, 'controller', 'sol', 'asks');
  const askFiles = fs.existsSync(askDir) ? fs.readdirSync(askDir) : [];
  assert.equal(askFiles.length, 1, 'exactly one compiled SOL ask artifact');
  const askArtifact = JSON.parse(fs.readFileSync(path.join(askDir, askFiles[0]), 'utf8'));
  assert.match(askArtifact.askId, /^lcim_sol_ask_/);
  assert.equal(askArtifact.callType, 'SOL_DIAGNOSE');
  assert.equal(JSON.stringify(askArtifact).includes('GENERIC SOL'), false, 'the compiled ask contains zero attacker content');
  const events = fs.readFileSync(path.join(runDir, 'events.v2.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const solStarts = events.filter((event) => event.kind === 'START' && event.role === 'SOL');
  assert.equal(solStarts.length, 1, 'exactly one SOL invocation');

  // Every invocation's process-lifetime evidence: structural primary proof.
  assert.equal(result.processLifetimeEvidencePaths.length, 3);
  for (const file of result.processLifetimeEvidencePaths) {
    const pl = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(pl.quiescenceVerified, true);
    assert.equal(pl.childCreationStructurallyDenied, true);
    assert.equal(pl.primaryProof, 'CHILD_CREATION_STRUCTURALLY_DENIED');
    assert.equal(pl.supervisorRole, 'DEFENSE_IN_DEPTH');
  }
  // Boundary evidence: structural no-descendant with the empirical probe.
  for (const file of result.boundaryEvidencePaths) {
    const boundary = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(boundary.processCreation, 'DENIED');
    assert.equal(boundary.childCreation.mode, 'STRUCTURALLY_DENIED');
    assert.equal(boundary.childCreation.blocked, true);
  }
});

// ---------------------------------------------------------------------------
// R4/4 — environment marker has ZERO authority + no watcher can exist
// ---------------------------------------------------------------------------

test('SOL-S10-001/R4-4: LCIM_INVOCATION_MARKER has ZERO authority — removal succeeds and the detached spawn is still denied; no watcher exists', async (t) => {
  const { authorized, worktreeDir } = await makeBoundary(t, { processCreation: 'DENIED' });
  const pidFile = path.join(worktreeDir, '.watcher.pid');
  const worker = `
const fs = require('node:fs');
let result;
try {
  delete process.env.LCIM_INVOCATION_MARKER;
  result = 'marker_removed=' + (process.env.LCIM_INVOCATION_MARKER === undefined ? 'yes' : 'no');
  const { spawn } = require('node:child_process');
  const w = spawn(process.execPath, ['/usr/bin/true'], { detached: true, stdio: 'ignore' });
  w.unref();
  fs.writeFileSync(${JSON.stringify(pidFile)}, String(w.pid));
  result += ' UNDENIED';
} catch (error) {
  result += ' spawn=' + ((error && error.code) || 'DENIED');
}
console.log(result);
process.exit(0);
`;
  const result = await runConstrainedProcess(authorized.boundary, {
    command: [process.execPath, '-e', worker],
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /marker_removed=yes/, 'marker removal succeeds');
  assert.match(result.stdout, /spawn=EPERM/, 'the detached spawn is refused at creation');
  assert.equal(fs.existsSync(pidFile), false, 'no watcher pid file can exist (no watcher was created)');
  // No supervisor/watcher exists: nothing to discover or terminate.
  assert.equal(result.processCompleted, true);
});

// ---------------------------------------------------------------------------
// R4/5 — worker tool surface: shell/process tool is UNAVAILABLE with ZERO
// child creation (production Pi path)
// ---------------------------------------------------------------------------

function deepseekAgentToolSurface({ attemptBashOnFirst = true } = {}) {
  let sessions = 0;
  return (record, hasToolResult) => {
    let messages = [];
    try {
      messages = JSON.parse(record.body).messages ?? [];
    } catch {
      // malformed fixtures fail downstream
    }
    const toolResults = messages.filter((m) => m.role === 'tool');
    if (!hasToolResult) {
      sessions += 1;
      if (attemptBashOnFirst && sessions === 1) {
        return { toolCall: { name: 'bash', arguments: JSON.stringify({ command: 'printf "B\\n" > a.txt' }) } };
      }
      return { toolCall: { name: 'write', arguments: JSON.stringify({ path: 'a.txt', content: 'B\n' }) } };
    }
    const lastTool = toolResults[toolResults.length - 1];
    const lastToolText = String(lastTool?.content ?? '');
    if (/not found|not available|unavailable|unknown tool/i.test(lastToolText)) {
      return { toolCall: { name: 'write', arguments: JSON.stringify({ path: 'a.txt', content: 'B\n' }) } };
    }
    return { content: workerJsonFor(record.prompt) };
  };
}

function solAgent(record) {
  return { content: solDiagnoseJsonFor(record.prompt) };
}

test('SOL-S10-001/R4-5: production Pi DeepSeek path under the no-fork boundary — bash tool attempt is TOOL_NOT_AVAILABLE with ZERO child creation; write tool produces the patch', { skip: hasRealPi ? false : 'real pi CLI not on PATH' }, async (t) => {
  withCredentialEnv(t, 'DEEPSEEK_API_KEY', 's10-r4-deepseek-key-0123456789abcdef');
  const deepseek = await fakeUpstream(t, { name: 'r4-deepseek', agent: deepseekAgentToolSurface() });
  const root = makeTarget(t);
  const configPath = path.join(root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.endpoints['deepseek-v4-flash'] = { baseUrl: deepseek.baseUrl, kind: 'external' };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const result = await runController({ cwd: root });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.disposition, 'SEMANTICALLY_ACCEPTED');
  assert.deepEqual(result.patchEvidence.changedPaths, ['a.txt']);

  // The model-controlled invocation requested the shell tool; pi rejected it
  // as unavailable. ZERO child creation happened (structural + tool list).
  const toolRejected = deepseek.requests.some((request) => request.body.includes('Tool bash not found'));
  assert.equal(toolRejected, true, 'the bash tool call must be rejected as unavailable');
  assert.equal(deepseek.requests.some((request) => request.body.includes('Successfully wrote')), true, 'the in-process write tool produced the patch');

  const boundary = JSON.parse(fs.readFileSync(result.boundaryEvidencePath, 'utf8'));
  assert.equal(boundary.processCreation, 'DENIED');
  assert.equal(boundary.childCreation.mode, 'STRUCTURALLY_DENIED');
  assert.equal(boundary.childCreation.blocked, true);
  assert.equal(boundary.network.mode, 'BROKER_ONLY');
  assert.equal(boundary.network.brokerReachable, true);
  assert.equal(boundary.network.otherLoopbackBlocked, true);
  const brokerEvidence = JSON.parse(fs.readFileSync(result.brokerEvidencePath, 'utf8'));
  assert.equal(brokerEvidence.invocationsRegistered, 1);
  assert.equal(brokerEvidence.invocationsRevoked, 1);
  const pl = JSON.parse(fs.readFileSync(result.processLifetimeEvidencePaths[0], 'utf8'));
  assert.equal(pl.primaryProof, 'CHILD_CREATION_STRUCTURALLY_DENIED');
  assert.equal(pl.quiescenceVerified, true);
});

test('SOL-S10-001/R4-6: production Pi SOL path under the no-fork boundary — DeepSeek worker -> legitimate SOL via fresh broker and HTTPS fake upstream', { skip: hasRealPi ? false : 'real pi CLI not on PATH' }, async (t) => {
  withCredentialEnv(t, 'DEEPSEEK_API_KEY', 's10-r4-deepseek-key-0123456789abcdef');
  withCredentialEnv(t, 'OPENAI_API_KEY', 's10-r4-sol-key-0123456789abcdef');
  const previousCa = process.env.LCIM_BROKER_CA_FILE;
  process.env.LCIM_BROKER_CA_FILE = tlsFixture().caPath;
  t.after(() => {
    if (previousCa === undefined) delete process.env.LCIM_BROKER_CA_FILE;
    else process.env.LCIM_BROKER_CA_FILE = previousCa;
  });
  const deepseek = await fakeUpstream(t, { name: 'r4-deepseek-https', agent: deepseekAgentToolSurface(), tls: true });
  const sol = await fakeUpstream(t, { name: 'r4-sol-https', agent: solAgent, tls: true });
  const root = makeTarget(t);
  const configPath = path.join(root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.endpoints['deepseek-v4-flash'] = { baseUrl: deepseek.baseUrl, kind: 'external' };
  config.endpoints['sol-xhigh'] = { baseUrl: sol.baseUrl, kind: 'external' };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  let semanticCalls = 0;
  const result = await runController({
    cwd: root,
    semanticValidator: async () => ({ accepted: ++semanticCalls > 1 }),
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.finalSummary.invocations, 3, 'deepseek worker + SOL + deepseek repair');

  // SOL upstream: exactly the legitimate compiled ask, zero attacker calls.
  assert.equal(sol.requests.length, 1);
  assert.equal(sol.requests[0].model, 'sol-xhigh');
  assert.match(sol.requests[0].prompt, /Ask id: lcim_sol_ask_/);
  assert.equal(sol.requests[0].prompt.includes('GENERIC SOL'), false);
  assert.equal(sol.requests[0].auth, 'Bearer s10-r4-sol-key-0123456789abcdef', 'TLS/credential transport preserved');

  // Every invocation: fresh broker, structural boundary, verified quiescence.
  assert.equal(result.brokerEvidencePaths.length, 3);
  const ports = result.brokerEvidencePaths.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')).port);
  assert.equal(new Set(ports).size, 3, 'fresh broker endpoint per invocation');
  const boundaries = result.boundaryEvidencePaths.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
  assert.ok(boundaries.every((b) => b.processCreation === 'DENIED' && b.childCreation.mode === 'STRUCTURALLY_DENIED' && b.childCreation.blocked === true));
  for (const file of result.processLifetimeEvidencePaths) {
    const pl = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(pl.primaryProof, 'CHILD_CREATION_STRUCTURALLY_DENIED');
    assert.equal(pl.quiescenceVerified, true);
  }
});

// ---------------------------------------------------------------------------
// R4/7 — immutable patch artifact -> separate disposable validation copy
// ---------------------------------------------------------------------------

/**
 * Worker fixture: writes a.txt AND a validate.cjs (a validation script that
 * ships inside the patch, so it exists in the base+patch validation copy).
 * The validation script verifies the copy contents and attempts a write
 * outside the copy (must be denied) and a copy-local write (allowed).
 */
function installValidationWorker(t, root) {
  const worker = `
let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  const fs = require('node:fs');
  fs.writeFileSync('a.txt', 'B\\n');
  fs.writeFileSync('validate.cjs', \`const fs = require('node:fs');
const path = require('node:path');
const out = [];
// The validation copy contains exactly base + patch.
out.push('a=' + fs.readFileSync('a.txt', 'utf8').trim());
out.push('validate_self=' + fs.readFileSync('validate.cjs', 'utf8').length + 'bytes');
// Validation may modify ITS OWN disposable copy only.
fs.writeFileSync('validation-note.txt', 'validated\\\\n');
out.push('note=written');
// A write outside the copy (the disposable copy root) must be denied.
try {
  fs.writeFileSync(path.join('..', 'outside-copy-probe'), 'x');
  out.push('outside=ALLOWED');
} catch (e) {
  out.push('outside=' + (e.code || 'DENIED'));
}
// The authoritative patch artifact lives in the Git-common evidence store;
// any attempt to reach it is denied by the validation boundary.
try {
  fs.writeFileSync(path.join(process.env.HOME || '/nonexistent', 'home-probe'), 'x');
  out.push('home=ALLOWED');
} catch (e) {
  out.push('home=' + (e.code || 'DENIED'));
}
console.log(out.join('|'));
\`);
  const id = prompt.match(/WORK_UNIT_ID:\\s+(lcim_wu_[0-9a-f]+)/)?.[1];
  process.stdout.write(JSON.stringify({ workUnitId: id, workerStatus: 'WORK_COMPLETE', summary: 'r4 validation fixture worker', acceptanceClaims: [], remainingIssues: [], reviewRisks: [], uncertainty: 'fixture' }));
});
`;
  fs.writeFileSync(path.join(root, 'worker.cjs'), worker);
  const configPath = path.join(root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.worker.command = ['node', 'worker.cjs'];
  config.validation.commands = [['node', 'validate.cjs']];
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

test('SOL-S10-001/R4-7: validation runs on a separate disposable copy of base+artifact; the authoritative patch and hash remain unchanged; disposition references patchHash', async (t) => {
  const root = makeTarget(t, { allowedWritePaths: ['a.txt', 'validate.cjs'] });
  installValidationWorker(t, root);

  const result = await runController({ cwd: root });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.disposition, 'SEMANTICALLY_ACCEPTED');

  // 1-2. Worker produced patch P; controller computed hash H.
  const patchId = result.patchEvidence.patchId;
  const patchHash = result.patchEvidence.patchHash;
  const evidenceDir = resolvePatchEvidenceDir(root);
  const artifactPath = path.join(evidenceDir, `${patchId}.patch`);
  const artifactBytes = fs.readFileSync(artifactPath, 'utf8');
  assert.equal(crypto.createHash('sha256').update(artifactBytes).digest('hex'), patchHash, 'H binds the exact artifact bytes');

  // 3-4. Validation evidence: the copy was constructed from base + P and the
  // validation script ran inside it (its own-file writes allowed; foreign
  // writes denied).
  assert.equal(result.validationEvidencePaths.length, 1, 'validation evidence is persisted per invocation');
  const validation = JSON.parse(fs.readFileSync(result.validationEvidencePaths[0], 'utf8'));
  assert.equal(validation.patchId, patchId);
  assert.equal(validation.patchHash, patchHash);
  assert.deepEqual(validation.changedPaths, ['a.txt', 'validate.cjs']);
  assert.equal(validation.applied, true, 'the exact artifact bytes were applied to the copy');
  assert.equal(validation.processCreation, 'ALLOWED', 'validation uses its own process-capable boundary');
  assert.equal(validation.network.mode, 'DENY_ALL', 'validation has no network egress and no broker');
  assert.equal(validation.copyRemoved, true, 'the disposable validation copy is removed after validation');
  assert.ok(validation.results.length >= 1);
  assert.equal(validation.results[0].outcome, 'PASS', 'the validation command passed on the base+patch copy');
  assert.match(validation.results[0].stdoutTail, /a=B/, 'the validation copy contains the applied patch');
  assert.match(validation.results[0].stdoutTail, /outside=EACCES|outside=EPERM/, 'writes outside the validation copy are denied');
  assert.match(validation.results[0].stdoutTail, /home=EACCES|home=EPERM/, 'the validation safe home is not writable as an escape surface');

  // 5. Authoritative persisted P and H remain unchanged (the validation
  //    script attempted foreign writes; all were denied).
  const afterBytes = fs.readFileSync(artifactPath, 'utf8');
  assert.equal(afterBytes, artifactBytes, 'the authoritative patch artifact is byte-identical after validation');
  const loaded = loadPatchEvidence(root, result.patchEvidence.evidenceId);
  assert.equal(loaded.record.patchHash, patchHash, 'the persisted record still binds H');

  // 6. The controller disposition references H.
  const dispositions = fs.readFileSync(path.join(resolveRunDir(root, result.runId), 'controller', 'dispositions.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.ok(dispositions.length >= 2, 'PATCH_VALID + SEMANTICALLY_ACCEPTED dispositions');
  const refs = dispositions.flatMap((d) => d.evidenceRefs ?? []);
  assert.ok(refs.some((ref) => ref.includes('validation-evidence:')), 'the disposition references the validation evidence');
  assert.equal(result.candidate.patchHash, patchHash, 'the candidate disposition references H');

  // Validation evidence must never become a second candidate-edit phase: the
  // validation results approve/reject the artifact only.
  assert.equal(result.patchEvidence.changedPaths.includes('validation-note.txt'), false, 'validation writes never enter the candidate');
});

test('SOL-S10-001/R4-8: a failing validation command rejects the immutable artifact without altering it', async (t) => {
  const root = makeTarget(t, { allowedWritePaths: ['a.txt'] });
  // Worker: writes a.txt only.
  const worker = `
let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  require('node:fs').writeFileSync('a.txt', 'B\\n');
  const id = prompt.match(/WORK_UNIT_ID:\\s+(lcim_wu_[0-9a-f]+)/)?.[1];
  process.stdout.write(JSON.stringify({ workUnitId: id, workerStatus: 'WORK_COMPLETE', summary: 'r4 worker', acceptanceClaims: [], remainingIssues: [], reviewRisks: [], uncertainty: 'fixture' }));
});
`;
  fs.writeFileSync(path.join(root, 'worker.cjs'), worker);
  fs.writeFileSync(path.join(root, 'fail-validate.cjs'), 'process.exit(7);\n');
  const configPath = path.join(root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.worker.command = ['node', 'worker.cjs'];
  config.validation.commands = [['node', 'fail-validate.cjs']];
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const result = await runController({ cwd: root });
  assert.equal(result.ok, false);
  assert.equal(result.disposition, 'REJECTED');
  // The frozen artifact is still persisted (evidence-backed rejection), and
  // the validation failure is the recorded cause.
  assert.ok(result.patchEvidence, 'the artifact exists even when validation fails');
  const validation = JSON.parse(fs.readFileSync(result.validationEvidencePaths[0], 'utf8'));
  assert.equal(validation.results[0].outcome, 'FAIL');
  assert.equal(validation.patchHash, result.patchEvidence.patchHash);
  // The artifact is byte-stable.
  const artifactPath = path.join(resolvePatchEvidenceDir(root), `${result.patchEvidence.patchId}.patch`);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(artifactPath, 'utf8')).digest('hex'), result.patchEvidence.patchHash);
});

// ---------------------------------------------------------------------------
// R4/9 — delayed validation descendant isolation
// ---------------------------------------------------------------------------

test('SOL-S10-001/R4-9: a detached validation descendant is confined to the validation disposable surface and has no authority anywhere else', async (t) => {
  const root = makeTarget(t, { allowedWritePaths: ['a.txt'] });
  const worker = `
let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  require('node:fs').writeFileSync('a.txt', 'B\\n');
  const id = prompt.match(/WORK_UNIT_ID:\\s+(lcim_wu_[0-9a-f]+)/)?.[1];
  process.stdout.write(JSON.stringify({ workUnitId: id, workerStatus: 'WORK_COMPLETE', summary: 'r4 worker', acceptanceClaims: [], remainingIssues: [], reviewRisks: [], uncertainty: 'fixture' }));
});
`;
  fs.writeFileSync(path.join(root, 'worker.cjs'), worker);

  // Validation command: launches a DETACHED background descendant that
  // survives the validation command exit, waits for its first observations
  // (written to a COPY-LOCAL log — the only writable surface), reports them
  // on stdout, then exits 0. The descendant inherits the same VALIDATION
  // sandbox profile: no broker, no credentials, DENY_ALL network, writes
  // confined to the copy.
  const gitCommonRunsProbe = path.join(resolveGitCommonDir(root), 'lcim', 'runs', 'lcim_run_r4_probe', 'descendant-probe');
  const parentDirProbe = path.join(path.dirname(root), 'lcim-r4-descendant-parent-probe');
  // Ensure the probe parents exist so any write reaches the sandbox deny
  // (EPERM/EACCES at the policy layer) rather than failing on a missing dir.
  fs.mkdirSync(path.dirname(gitCommonRunsProbe), { recursive: true });
  fs.writeFileSync(path.join(root, 'spawn-descendant.cjs'), `
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const log = path.join(process.cwd(), '.descendant-log.txt');
const script = \`
const fs = require('node:fs');
const path = require('node:path');
const log = ${JSON.stringify('<LOG>')};
const record = (label, outcome) => { try { fs.appendFileSync(log, label + '=' + outcome + '\\\\n'); } catch {} };
const targets = {
  parentRepo: ${JSON.stringify(parentDirProbe)},
  gitCommonRuns: ${JSON.stringify(gitCommonRunsProbe)},
  home: path.join(process.env.HOME || '/nonexistent', 'descendant-probe'),
  scratch: path.join(process.cwd(), 'descendant-write.txt'),
};
for (const [label, target] of Object.entries(targets)) {
  try { fs.writeFileSync(target, 'x'); record(label, 'ALLOWED'); } catch (e) { record(label, e.code || 'DENIED'); }
}
record('broker_env', (process.env.PI_CODING_AGENT_DIR || 'absent'));
record('cred_keys', Object.keys(process.env).filter((k) => /(API|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i.test(k)).join(','));
let tick = 0;
setInterval(() => { try { fs.appendFileSync(log, 'tick' + (++tick) + '\\\\n'); } catch {} }, 100);
setTimeout(() => process.exit(0), 12000);
\`.replace('<LOG>', log);
const child = spawn(process.execPath, ['-e', script], { detached: true, stdio: 'ignore' });
child.unref();
// Wait for the descendant's first observations (copy-local only), report
// them as evidence, and exit — the descendant keeps running.
const deadline = Date.now() + 2500;
(function poll() {
  let lines = [];
  try {
    lines = fs.readFileSync(log, 'utf8').trim().split('\\n').filter(Boolean);
  } catch {}
  if (Date.now() > deadline) {
    console.log('DESCENDANT_PID=' + child.pid);
    console.log(lines.join('\\n'));
    process.exit(0);
  }
  setTimeout(poll, 100);
})();
`);
  const configPath = path.join(root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.worker.command = ['node', 'worker.cjs'];
  config.validation.commands = [['node', 'spawn-descendant.cjs']];
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const result = await runController({ cwd: root });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.disposition, 'SEMANTICALLY_ACCEPTED');

  // The validation evidence carries the descendant's confinement log.
  assert.equal(result.validationEvidencePaths.length, 1);
  const validation = JSON.parse(fs.readFileSync(result.validationEvidencePaths[0], 'utf8'));
  assert.equal(validation.results[0].outcome, 'PASS');
  const stdoutTail = validation.results[0].stdoutTail;
  assert.match(stdoutTail, /DESCENDANT_PID=\d+/, 'the descendant identity is recorded as evidence');
  const descendantPid = Number(stdoutTail.match(/DESCENDANT_PID=(\d+)/)?.[1]);
  assert.ok(Number.isSafeInteger(descendantPid) && descendantPid > 1);
  assert.match(stdoutTail, /parentRepo=EACCES|parentRepo=EPERM/, 'the descendant cannot write the parent/main repo');
  assert.match(stdoutTail, /gitCommonRuns=EACCES|gitCommonRuns=EPERM/, 'the descendant cannot reach Git-common runtime');
  assert.match(stdoutTail, /home=EACCES|home=EPERM/, 'the descendant cannot write outside the validation surface');
  assert.match(stdoutTail, /broker_env=absent/, 'the descendant has NO provider broker/config');
  assert.match(stdoutTail, /^cred_keys=$/m, 'the descendant has NO provider credentials');
  assert.match(stdoutTail, /tick\d+/, 'the detached descendant kept running (heartbeats) while the validation phase finished');

  // The descendant SURVIVES the validation command exit and the disposable
  // copy removal (its 12-second window) — process-lifetime observation is
  // not the authority. Even while it is alive, it cannot touch the
  // candidate: the copy is removed and its only writable surface is gone.
  assert.equal(isAlive(descendantPid), true, 'the detached descendant outlives the validation phase');
  assert.equal(result.patchEvidence.changedPaths.includes('descendant-write.txt'), false, 'the descendant write never enters the candidate');

  // The authoritative artifact is byte-identical.
  const artifactPath = path.join(resolvePatchEvidenceDir(root), `${result.patchEvidence.patchId}.patch`);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(artifactPath, 'utf8')).digest('hex'), result.patchEvidence.patchHash);

  // The controller disposition completed while the descendant was still
  // alive and references the frozen hash.
  assert.equal(result.candidate.patchHash, result.patchEvidence.patchHash);
  // Test hygiene: terminate the confined descendant (security does not
  // depend on it).
  try { process.kill(descendantPid, 'SIGKILL'); } catch { /* already gone */ }
});

test('SOL-S10-001/R4-10: fresh broker per invocation + HTTPS + TLS verification + invocation binding preserved under the no-descendant boundary', { skip: hasRealPi ? false : 'real pi CLI not on PATH' }, async (t) => {
  withCredentialEnv(t, 'DEEPSEEK_API_KEY', 's10-r4-deepseek-key-0123456789abcdef');
  const previous = process.env.LCIM_BROKER_CA_FILE;
  process.env.LCIM_BROKER_CA_FILE = tlsFixture().caPath;
  t.after(() => {
    if (previous === undefined) delete process.env.LCIM_BROKER_CA_FILE;
    else process.env.LCIM_BROKER_CA_FILE = previous;
  });
  const deepseek = await fakeUpstream(t, { name: 'r4-deepseek-https', agent: deepseekAgentToolSurface(), tls: true });
  const root = makeTarget(t);
  const configPath = path.join(root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.endpoints['deepseek-v4-flash'] = { baseUrl: deepseek.baseUrl, kind: 'external' };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const result = await runController({ cwd: root });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.ok(deepseek.requests.every((request) => request.auth === 'Bearer s10-r4-deepseek-key-0123456789abcdef'), 'HTTPS + credential transport preserved');
  assert.ok(deepseek.requests.every((request) => request.url === '/v1/chat/completions'));
  const brokerEvidence = JSON.parse(fs.readFileSync(result.brokerEvidencePath, 'utf8'));
  assert.equal(brokerEvidence.invocationsRegistered, 1);
  assert.equal(brokerEvidence.invocationsRevoked, 1);
  assert.equal(brokerEvidence.tlsCa.file, tlsFixture().caPath, 'the controller-owned CA bundle is bound');
  assert.ok(brokerEvidence.port > 0);
  assert.ok(deepseek.requests.some((request) => request.body.includes('Tool bash not found')), 'the shell tool remained unavailable on the production path');

  // Repository push remains blocked under the structural boundary (git can
  // no longer even be spawned inside the model boundary).
  const boundary = JSON.parse(fs.readFileSync(result.boundaryEvidencePath, 'utf8'));
  assert.equal(boundary.network.mode, 'BROKER_ONLY');
  assert.equal(boundary.network.brokerReachable, true);
  assert.equal(boundary.network.otherLoopbackBlocked, true);
});
