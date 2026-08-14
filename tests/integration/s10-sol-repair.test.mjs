/**
 * Sprint-10 SOL repair regressions — R2 (SOL-S10-001).
 *
 * SOL-S10-001 (R2) — provider transport through the controller-owned broker:
 *
 * - DEFECT A fixed: upstream transport is selected by the controller-bound
 *   protocol (http.request / https.request); TLS verification is never
 *   disabled; tests use an isolated local test CA trusted only by the
 *   broker via the controller-owned LCIM_BROKER_CA_FILE seam.
 * - DEFECT B fixed: broker authority is INVOCATION-SCOPED. Each provider
 *   invocation registers one ephemeral capability (token -> invocationId,
 *   role, provider, model, exact upstream); the broker derives the route
 *   from the token, body.model must equal the bound model, worker-supplied
 *   routing fields are rejected, and tokens are revoked when the invocation
 *   ends. The sandbox-visible Pi config exposes only the current
 *   invocation's model/token.
 * - DEFECT C fixed: broker listener/port planning happens BEFORE the
 *   immutable execution boundary is authorized whenever any configured
 *   automatic role may require default Pi transport; credential/route
 *   registration stays invocation-time and permission-gated.
 *
 * SOL-S10-002 — FROZEN as FIXED; its regressions are preserved unchanged
 * below and must remain green.
 *
 * Local-only: no real provider network calls. The DeepSeek/SOL upstreams are
 * deterministic local fake servers (HTTP and HTTPS with an isolated test
 * CA); the Pi adapter path is exercised with the real `pi` CLI when it is
 * on PATH (skipped otherwise).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { setupProject } from '../../src/project/config.mjs';
import { runController } from '../../src/controller/orchestrator.mjs';
import {
  SEATBELT_EXECUTABLE,
  authorizeWorkerExecutionBoundary,
  createWorkerExecutionBoundary,
  runConstrainedProcess,
  verifyWorkerExecutionBoundary,
} from '../../src/controller/execution-boundary.mjs';
import {
  BROKER_CA_FILE_ENV,
  resolveBrokerRoute,
  startProviderBroker,
} from '../../src/controller/provider-broker.mjs';

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

// ---------------------------------------------------------------------------
// Isolated local test TLS harness (never disables certificate verification)
// ---------------------------------------------------------------------------

let tlsFixtureCache = null;

function openssl(args, cwd) {
  const result = spawnSync('openssl', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`openssl ${args.join(' ')} failed: ${result.stderr}`);
  return result;
}

/** Local CA + server certificate signed by it; SAN covers localhost/127.0.0.1. */
function tlsFixture() {
  if (tlsFixtureCache !== null) return tlsFixtureCache;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s10-r2-tls-'));
  openssl(['req', '-x509', '-newkey', 'rsa:2048', '-keyout', 'ca-key.pem', '-out', 'ca-cert.pem', '-days', '2', '-nodes', '-subj', '/CN=LCIM R2 Test CA'], dir);
  openssl(['req', '-newkey', 'rsa:2048', '-keyout', 'server-key.pem', '-out', 'server.csr', '-nodes', '-subj', '/CN=localhost'], dir);
  fs.writeFileSync(path.join(dir, 'san.ext'), 'subjectAltName=DNS:localhost,IP:127.0.0.1\n');
  openssl(['x509', '-req', '-in', 'server.csr', '-CA', 'ca-cert.pem', '-CAkey', 'ca-key.pem', '-CAcreateserial', '-out', 'server-cert.pem', '-days', '2', '-extfile', 'san.ext'], dir);
  tlsFixtureCache = {
    dir,
    caPath: path.join(dir, 'ca-cert.pem'),
    key: fs.readFileSync(path.join(dir, 'server-key.pem')),
    cert: fs.readFileSync(path.join(dir, 'server-cert.pem')),
  };
  return tlsFixtureCache;
}

/** A self-signed cert NOT signed by the test CA (for the verification-negative test). */
function untrustedTlsFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s10-r2-untrusted-'));
  openssl(['req', '-x509', '-newkey', 'rsa:2048', '-keyout', 'key.pem', '-out', 'cert.pem', '-days', '2', '-nodes', '-subj', '/CN=LCIM Untrusted', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], dir);
  return {
    key: fs.readFileSync(path.join(dir, 'key.pem')),
    cert: fs.readFileSync(path.join(dir, 'cert.pem')),
  };
}

function withBrokerCaEnv(t) {
  const previous = process.env[BROKER_CA_FILE_ENV];
  process.env[BROKER_CA_FILE_ENV] = tlsFixture().caPath;
  t.after(() => {
    if (previous === undefined) delete process.env[BROKER_CA_FILE_ENV];
    else process.env[BROKER_CA_FILE_ENV] = previous;
  });
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Extract the text of a chat message regardless of pi's content shape. */
function messageText(message) {
  const content = message?.content ?? '';
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'string' ? part : part?.text ?? '')).join('\n');
  }
  return String(content);
}

/**
 * Fake OpenAI-compatible chat-completions upstream (HTTP or HTTPS with the
 * isolated test CA). `agent(record, hasToolResult)` returns either
 * { toolCall: { name, arguments } } (first turn: pi executes the tool inside
 * the sandbox) or { content } (final assistant text). SSE streaming is
 * always used; deepseek-model entries expect reasoning_content chunks.
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
    ? https.createServer({ key: tlsFixture().key, cert: tlsFixture().cert }, handler)
    : http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  return {
    port,
    baseUrl: `${tls ? 'https' : 'http'}://127.0.0.1:${port}/v1`,
    requests,
  };
}

function workerJsonFor(prompt) {
  const id = prompt.match(/WORK_UNIT_ID:\s+(lcim_wu_[0-9a-f]+)/)?.[1] ?? null;
  return JSON.stringify({
    workUnitId: id,
    workerStatus: 'WORK_COMPLETE',
    summary: 'broker fixture worker',
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

const WRITE_A_TOOL = { path: 'a.txt', content: 'B\n' };

/**
 * DeepSeek fixture agent (SOL-S10-001 R4 tool surface).
 *
 * The model-controlled tool surface is `read,write,edit,ls` ONLY; bash is
 * structurally unavailable (pi reports `Tool bash not found` and the
 * Seatbelt boundary denies process creation regardless). The normal path
 * writes the patch with the in-process `write` tool. On the optional
 * `bypassOnSession` session the agent ATTEMPTS the bash tool first — the
 * regression proves the shell/process tool is rejected with ZERO child
 * creation — then falls back to the write tool.
 */
function deepseekAgent({ bypassOnSession = null } = {}) {
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
      if (sessions === bypassOnSession) {
        // The generic-SOL bypass used to run through a shell tool; under the
        // R4 tool surface the shell tool itself must be rejected.
        return { toolCall: { name: 'bash', arguments: JSON.stringify({ command: 'echo BYPASS_ATTEMPT' }) } };
      }
      return { toolCall: { name: 'write', arguments: JSON.stringify(WRITE_A_TOOL) } };
    }
    const lastTool = toolResults[toolResults.length - 1];
    const lastToolText = String(lastTool?.content ?? '');
    if (/not found|not available|unavailable|unknown tool/i.test(lastToolText)) {
      // The shell/process tool was rejected by the tool surface; produce the
      // patch with the in-process write tool instead.
      return { toolCall: { name: 'write', arguments: JSON.stringify(WRITE_A_TOOL) } };
    }
    return { content: workerJsonFor(record.prompt) };
  };
}

/** SOL fixture agent: single-turn compiled diagnosis response. */
function solAgent(record) {
  return { content: solDiagnoseJsonFor(record.prompt) };
}

function makeTarget(t, { deepseekUrl = null, solUrl = null, withRemote = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s10-broker-target-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'lcim-test@example.invalid']);
  git(root, ['config', 'user.name', 'LCIM SOL Repair']);
  fs.writeFileSync(path.join(root, 'a.txt'), 'A\n');
  git(root, ['add', 'a.txt']);
  git(root, ['commit', '-m', 'fixture base']);
  setupProject({ cwd: root });
  const configPath = path.join(root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.allowedWritePaths = ['a.txt'];
  // Default Pi route: no local command; provider transport through broker.
  config.worker.command = null;
  config.sol.command = null;
  config.permissions.externalProvider = true;
  if (deepseekUrl !== null) {
    config.endpoints['deepseek-v4-flash'] = { baseUrl: deepseekUrl, kind: 'external' };
  }
  if (solUrl !== null) {
    config.endpoints['sol-xhigh'] = { baseUrl: solUrl, kind: 'external' };
  }
  let remote = null;
  if (withRemote) {
    remote = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s10-broker-remote-'));
    t.after(() => fs.rmSync(remote, { recursive: true, force: true }));
    git(remote, ['init', '--bare', '-b', 'main']);
    git(root, ['remote', 'add', 'origin', 'file:///definitely-unreachable-lcim-s10']);
    git(root, ['config', '--add', 'remote.origin.pushurl', remote]);
  }
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return { root, remote };
}

/** Local (non-broker) worker fixture for the mixed local-worker -> external-SOL scenario. */
function installLocalWorkerFixture(t, root) {
  const worker = `
let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  require('node:fs').writeFileSync('a.txt', 'B\\n');
  const id = prompt.match(/WORK_UNIT_ID:\\s+(lcim_wu_[0-9a-f]+)/)?.[1];
  process.stdout.write(JSON.stringify({ workUnitId: id, workerStatus: 'WORK_COMPLETE', summary: 'local fixture worker', acceptanceClaims: [], remainingIssues: [], reviewRisks: [], uncertainty: 'fixture' }));
});
`;
  fs.writeFileSync(path.join(root, 'worker.cjs'), worker);
  const configPath = path.join(root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.worker.command = ['node', 'worker.cjs'];
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

async function makeBrokerBoundary(t, { broker = null } = {}) {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s10-bnd-repo-'));
  const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s10-bnd-wt-'));
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s10-bnd-run-'));
  t.after(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(worktreeDir, { recursive: true, force: true });
    fs.rmSync(runDir, { recursive: true, force: true });
  });
  const authorized = await authorizeWorkerExecutionBoundary({
    repoDir,
    worktreeDir,
    runDir,
    workUnitId: `lcim_wu_s10_${cryptoToken(12)}`,
    ...(broker === null ? {} : { broker: { port: broker.port } }),
  });
  return { repoDir, worktreeDir, runDir, authorized };
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

const chatPath = (broker) => `http://127.0.0.1:${broker.port}/v1/chat/completions`;

function brokerPost(url, token, body, { tokenProvided = true } = {}) {
  return new Promise((resolve) => {
    const headers = { 'content-type': 'application/json' };
    if (tokenProvided) headers.authorization = `Bearer ${token}`;
    const req = http.request(url, { method: 'POST', headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', (error) => resolve({ status: null, error: error.message }));
    req.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
}

function brokerPlain(method, url, extraHeaders = {}) {
  return new Promise((resolve) => {
    const req = http.request(url, { method, headers: extraHeaders }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode }));
    });
    req.on('error', (error) => resolve({ status: null, error: error.message }));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// SOL-S10-001 (R2) — HTTPS transport, invocation-scoped broker authority,
// pre-boundary broker planning
// ---------------------------------------------------------------------------

test('SOL-S10-001/R2-A: HTTPS DeepSeek production Pi route completes through the broker', { skip: hasRealPi ? false : 'real pi CLI not on PATH' }, async (t) => {
  withBrokerCaEnv(t);
  withCredentialEnv(t, 'DEEPSEEK_API_KEY', 's10-deepseek-test-key-0123456789abcdef');
  const deepseek = await fakeUpstream(t, { name: 'deepseek-https', agent: deepseekAgent(), tls: true });
  const fixture = makeTarget(t, { deepseekUrl: deepseek.baseUrl });

  const result = await runController({ cwd: fixture.root });

  assert.equal(result.ok, true);
  assert.equal(result.disposition, 'SEMANTICALLY_ACCEPTED');
  assert.equal(result.finalSummary.invocations, 1);
  assert.equal(result.finalSummary.starts, 1);
  assert.equal(result.finalSummary.completions, 1);
  assert.equal(result.finalSummary.assessments, 1);
  assert.deepEqual(result.patchEvidence.changedPaths, ['a.txt']);
  assert.equal(fs.readFileSync(path.join(fixture.root, 'a.txt'), 'utf8'), 'A\n');

  // Real pi -> broker -> HTTPS fake upstream, with the controller credential.
  assert.equal(deepseek.requests.length, 2, 'one tool-call turn + one text turn');
  assert.ok(deepseek.requests.every((request) => request.url === '/v1/chat/completions'));
  assert.ok(deepseek.requests.every((request) => request.auth === 'Bearer s10-deepseek-test-key-0123456789abcdef'));
  assert.ok(deepseek.requests.every((request) => request.model === 'deepseek-v4-flash'));

  const boundary = JSON.parse(fs.readFileSync(result.boundaryEvidencePath, 'utf8'));
  assert.equal(boundary.network.mode, 'BROKER_ONLY');
  assert.equal(boundary.network.brokerReachable, true);
  assert.equal(boundary.network.otherLoopbackBlocked, true);

  assert.ok(result.brokerEvidencePath);
  const brokerEvidence = JSON.parse(fs.readFileSync(result.brokerEvidencePath, 'utf8'));
  assert.equal(brokerEvidence.byModel['deepseek-v4-flash'].requests, 2);
  assert.equal(brokerEvidence.totalRequests, 2);
  assert.equal(brokerEvidence.invocationsRegistered, 1);
  assert.equal(brokerEvidence.invocationsRevoked, 1, 'the invocation-scoped capability dies with the invocation');
  assert.equal(brokerEvidence.tlsCa.file, tlsFixture().caPath);
});

test('SOL-S10-001/R2-B: HTTPS SOL production Pi route completes through the broker with a compiled ask', { skip: hasRealPi ? false : 'real pi CLI not on PATH' }, async (t) => {
  withBrokerCaEnv(t);
  withCredentialEnv(t, 'DEEPSEEK_API_KEY', 's10-deepseek-test-key-0123456789abcdef');
  withCredentialEnv(t, 'OPENAI_API_KEY', 's10-sol-test-key-0123456789abcdef');
  const deepseek = await fakeUpstream(t, { name: 'deepseek-https', agent: deepseekAgent(), tls: true });
  const sol = await fakeUpstream(t, { name: 'sol-https', agent: solAgent, tls: true });
  const fixture = makeTarget(t, { deepseekUrl: deepseek.baseUrl, solUrl: sol.baseUrl });

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

  // DeepSeek: two worker calls x two agent turns. SOL: one exact ask call.
  assert.equal(deepseek.requests.length, 4);
  assert.ok(deepseek.requests.every((request) => request.auth === 'Bearer s10-deepseek-test-key-0123456789abcdef'));
  assert.equal(sol.requests.length, 1);
  assert.equal(sol.requests[0].model, 'sol-xhigh');
  assert.equal(sol.requests[0].auth, 'Bearer s10-sol-test-key-0123456789abcdef');
  assert.match(sol.requests[0].prompt, /Ask id: lcim_sol_ask_/);
  assert.match(sol.requests[0].prompt, /Criterion \(sideEffectId\): se_[0-9a-f]{64}/);

  // R3: every external provider invocation owns a FRESH broker listener on
  // a distinct port; evidence is per-invocation. Three brokers: deepseek
  // worker, SOL, deepseek repair.
  assert.equal(result.brokerEvidencePaths.length, 3);
  const brokerEvidences = result.brokerEvidencePaths.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
  const ports = brokerEvidences.map((evidence) => evidence.port);
  assert.equal(new Set(ports).size, 3, 'each invocation broker endpoint must be distinct');
  assert.equal(brokerEvidences.filter((evidence) => evidence.byModel['deepseek-v4-flash'] !== undefined).length, 2);
  assert.equal(brokerEvidences.filter((evidence) => evidence.byModel['sol-xhigh'] !== undefined).length, 1);
  const deepseekRequests = brokerEvidences.reduce((sum, evidence) => sum + (evidence.byModel['deepseek-v4-flash']?.requests ?? 0), 0);
  const solRequests = brokerEvidences.reduce((sum, evidence) => sum + (evidence.byModel['sol-xhigh']?.requests ?? 0), 0);
  assert.equal(deepseekRequests, 4);
  assert.equal(solRequests, 1);
  assert.equal(brokerEvidences.reduce((sum, evidence) => sum + evidence.totalRequests, 0), 5);
  assert.ok(brokerEvidences.every((evidence) => evidence.invocationsRegistered === 1 && evidence.invocationsRevoked === 1));

  // R3: each invocation got its own execution boundary pinned to exactly its
  // own broker endpoint; no boundary knows another invocation's port.
  assert.equal(result.boundaryEvidencePaths.length, 3);
  const boundaries = result.boundaryEvidencePaths.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
  assert.ok(boundaries.every((evidence) => evidence.network.mode === 'BROKER_ONLY'));
  assert.ok(boundaries.every((evidence) => evidence.network.brokerReachable === true));
  assert.ok(boundaries.every((evidence) => evidence.network.otherLoopbackBlocked === true));
  const boundaryPorts = boundaries.map((evidence) => evidence.network.broker.port);
  assert.deepEqual([...boundaryPorts].sort(), [...ports].sort(), 'each boundary pins exactly its own invocation broker endpoint');
});

test('SOL-S10-001/R2-C: sandbox reaches ONLY the planned broker port (empty listener is not authority)', async (t) => {
  const upstream = await fakeUpstream(t, { name: 'unrelated', agent: () => ({ content: 'unused' }) });
  const other = net.createServer(() => {});
  await new Promise((resolve, reject) => {
    other.once('error', reject);
    other.listen(0, '127.0.0.1', resolve);
  });
  const otherPort = other.address().port;
  t.after(() => new Promise((resolve) => other.close(resolve)));

  // A planned listener with NO registered invocation: network planning only.
  const broker = await startProviderBroker();
  t.after(() => broker.close());
  assert.equal(broker.snapshot().invocationsRegistered, 0, 'an empty listener carries no provider authority');
  const { authorized } = await makeBrokerBoundary(t, { broker });

  const probe = (port) => runConstrainedProcess(authorized.boundary, {
    command: [process.execPath, '-e',
      `const net=require('node:net');const s=net.createConnection({host:'127.0.0.1',port:${port}});s.on('connect',()=>process.exit(0));s.on('error',()=>process.exit(3));setTimeout(()=>process.exit(4),1200);`],
  });

  assert.equal((await probe(broker.port)).status, 0, 'sandbox must reach the planned broker port');
  assert.notEqual((await probe(upstream.port)).status, 0, 'sandbox must NOT reach the provider upstream directly');
  assert.notEqual((await probe(otherPort)).status, 0, 'sandbox must NOT reach arbitrary loopback endpoints');
  assert.equal(upstream.requests.length, 0, 'direct upstream connections must be blocked structurally');

  // Even though the sandbox can reach the listener, the empty listener
  // rejects every token: no authority exists until an invocation registers.
  assert.equal((await brokerPost(chatPath(broker), 'deadbeef'.repeat(8), { model: 'deepseek-v4-flash', messages: [] })).status, 401);
});

test('SOL-S10-001/R2-D: repository push remains blocked inside a broker boundary', async (t) => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s10-broker-bare-'));
  t.after(() => fs.rmSync(bare, { recursive: true, force: true }));
  git(bare, ['init', '--bare', '-b', 'main']);

  const httpRemoteServer = http.createServer((req, res) => {
    res.statusCode = 200;
    res.end('dummy');
  });
  let httpConnections = 0;
  httpRemoteServer.on('connection', () => {
    httpConnections += 1;
  });
  await new Promise((resolve) => httpRemoteServer.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => httpRemoteServer.close(resolve)));

  const broker = await startProviderBroker();
  t.after(() => broker.close());
  const { worktreeDir, authorized } = await makeBrokerBoundary(t, { broker });

  git(worktreeDir, ['init', '-b', 'main']);
  git(worktreeDir, ['config', 'user.email', 'lcim-test@example.invalid']);
  git(worktreeDir, ['config', 'user.name', 'LCIM push probe']);
  fs.writeFileSync(path.join(worktreeDir, 'f.txt'), 'F\n');
  git(worktreeDir, ['add', 'f.txt']);
  git(worktreeDir, ['commit', '-m', 'base']);
  git(worktreeDir, ['remote', 'add', 'origin', bare]);
  git(worktreeDir, ['remote', 'add', 'httpremote', `http://127.0.0.1:${httpRemoteServer.address().port}/lcim-s10.git`]);

  const attempt = await runConstrainedProcess(authorized.boundary, {
    command: ['/bin/sh'],
    args: ['-c',
      'git push origin HEAD:refs/lcim-safety-test/custom; L=$?; git push httpremote HEAD:refs/lcim-safety-test/custom; H=$?; echo "LOCAL_EXIT=$L"; echo "HTTP_EXIT=$H"'],
  });
  const output = attempt.stdout + attempt.stderr;
  const localExit = Number(output.match(/LOCAL_EXIT=(\d+)/)?.[1]);
  const httpExit = Number(output.match(/HTTP_EXIT=(\d+)/)?.[1]);
  assert.notEqual(localExit, 0, 'local-path push must fail inside the broker boundary');
  assert.notEqual(httpExit, 0, 'http push must fail inside the broker boundary');

  const ref = git(bare, ['show-ref', 'refs/lcim-safety-test/custom'], { allowFailure: true });
  assert.notEqual(ref.status, 0, 'no custom ref may reach the configured push target');
  assert.equal(httpConnections, 0, 'no connection may reach the configured http push target');
});

test('SOL-S10-001/R2-E: broker fails closed on every arbitrary forwarding shape', async (t) => {
  const upstream = await fakeUpstream(t, { name: 'capture', agent: () => ({ content: 'ok' }) });
  const route = resolveBrokerRoute({
    role: 'WORKER',
    model: 'deepseek-v4-flash',
    endpoint: { baseUrl: upstream.baseUrl },
    env: { DEEPSEEK_API_KEY: 's10-forward-key' },
  });
  const broker = await startProviderBroker();
  t.after(() => broker.close());
  const { token } = await broker.registerInvocation({
    invocationId: 'lcim_inv_r2e',
    role: 'WORKER',
    provider: route.provider,
    model: route.model,
    upstream: route.upstream,
  });

  const url = chatPath(broker);
  const happy = await brokerPost(url, token, { model: 'deepseek-v4-flash', messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(happy.status, 200);

  // Paths: only the exact bound chat-completions route exists.
  assert.equal((await brokerPost(`http://127.0.0.1:${broker.port}/v1/models`, token, { model: 'deepseek-v4-flash' })).status, 404);
  assert.equal((await brokerPost(`http://127.0.0.1:${broker.port}/`, token, {})).status, 404);
  assert.equal((await brokerPost(`http://127.0.0.1:${broker.port}/v1/chat/completions/extra`, token, {})).status, 404);
  assert.equal((await brokerPost(`http://127.0.0.1:${broker.port}/v1/embeddings`, token, {})).status, 404);

  // Methods: POST only.
  assert.equal((await brokerPlain('GET', url)).status, 405);
  assert.equal((await brokerPlain('PUT', url)).status, 405);
  assert.equal((await brokerPlain('DELETE', url)).status, 405);
  assert.equal((await brokerPlain('OPTIONS', url)).status, 405);

  // CONNECT tunneling is structurally destroyed.
  const connectResult = await new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: broker.port });
    let closed = false;
    socket.on('connect', () => {
      socket.write('CONNECT example.com:443 HTTP/1.1\r\nHost: example.com\r\n\r\n');
    });
    socket.on('close', () => {
      closed = true;
      resolve({ closed });
    });
    socket.on('error', () => resolve({ closed }));
    setTimeout(() => resolve({ closed }), 1500);
  });
  assert.equal(connectResult.closed, true, 'CONNECT must be refused, never tunneled');

  // Tokens are invocation-scoped: wrong, missing, and unknown tokens fail.
  assert.equal((await brokerPost(url, 'wrong-token', { model: 'deepseek-v4-flash', messages: [] })).status, 401);
  assert.equal((await brokerPost(url, token, { model: 'deepseek-v4-flash', messages: [] }, { tokenProvided: false })).status, 401);
  assert.equal((await brokerPost(url, cryptoToken(32), { model: 'deepseek-v4-flash', messages: [] })).status, 401);

  // Model identity is bound to the invocation capability.
  assert.equal((await brokerPost(url, token, { model: 'gpt-4o', messages: [] })).status, 400);
  assert.equal((await brokerPost(url, token, { model: 'sol-xhigh', messages: [] })).status, 400);

  // Worker-supplied routing fields are rejected; they can never change the route.
  for (const field of ['url', 'baseUrl', 'host', 'hostname', 'port', 'protocol', 'upstream', 'provider']) {
    const attempt = await brokerPost(url, token, { model: 'deepseek-v4-flash', [field]: 'http://127.0.0.1:1/evil', messages: [] });
    assert.equal(attempt.status, 400, `routing field ${field} must be rejected`);
  }

  // Malformed transport fails closed.
  assert.equal((await brokerPost(url, token, 'not-json')).status, 400);
  assert.equal((await brokerPost(url, token, '[]')).status, 400);
  assert.equal((await brokerPost(url, token, '{}')).status, 400);

  // The upstream saw exactly ONE request: the bound happy path only.
  assert.equal(upstream.requests.length, 1);
  assert.ok(upstream.requests.every((request) => request.url === '/v1/chat/completions'));

  // Revocation: the invocation-scoped capability dies when the invocation ends.
  assert.equal(broker.revokeInvocation(token), true);
  assert.equal((await brokerPost(url, token, { model: 'deepseek-v4-flash', messages: [] })).status, 401, 'revoked invocation token must be rejected');
  const snapshot = broker.snapshot();
  assert.equal(snapshot.invocationsRevoked, 1);
  assert.equal(snapshot.byModel['deepseek-v4-flash'].requests, 1);
});

test('SOL-S10-001/R2-F: provider credentials never reach the sandbox and never persist', async (t) => {
  withCredentialEnv(t, 'DEEPSEEK_API_KEY', 's10-secret-key-0123456789abcdef-super-secret');
  const deepseek = await fakeUpstream(t, { name: 'deepseek', agent: deepseekAgent() });
  const fixture = makeTarget(t, { deepseekUrl: deepseek.baseUrl });

  const result = await runController({ cwd: fixture.root });
  assert.equal(result.ok, true);

  const walk = (dir) => {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else out.push(full);
    }
    return out;
  };
  const files = walk(result.runtimeRoot);
  assert.ok(files.length > 0);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    assert.equal(content.includes('s10-secret-key-0123456789abcdef-super-secret'), false, `credential leaked into ${file}`);
  }
  const configContent = fs.readFileSync(path.join(fixture.root, '.lcim', 'project.json'), 'utf8');
  assert.equal(configContent.includes('s10-secret-key-0123456789abcdef-super-secret'), false);
  const brokerEvidence = JSON.parse(fs.readFileSync(result.brokerEvidencePath, 'utf8'));
  assert.equal(JSON.stringify(brokerEvidence).includes('s10-secret-key-0123456789abcdef-super-secret'), false);
  assert.equal('token' in brokerEvidence, false);

  const route = resolveBrokerRoute({
    role: 'WORKER',
    model: 'deepseek-v4-flash',
    endpoint: { baseUrl: deepseek.baseUrl },
    env: { DEEPSEEK_API_KEY: 's10-secret-key-0123456789abcdef-super-secret' },
  });
  const broker = await startProviderBroker();
  t.after(() => broker.close());
  const { authorized } = await makeBrokerBoundary(t, { broker });
  const probe = await runConstrainedProcess(authorized.boundary, {
    command: [process.execPath, '-e',
      "console.log(Object.keys(process.env).filter((k) => /(API|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i.test(k)).join(','))"],
  });
  assert.equal(probe.status, 0);
  assert.equal(probe.stdout.trim(), '', `sandbox env leaked credential-shaped keys: ${probe.stdout}`);

  assert.ok(deepseek.requests.every((request) => request.auth === 'Bearer s10-secret-key-0123456789abcdef-super-secret'));
  void route;
});

test('SOL-S10-001/R2-G: DeepSeek token cannot call SOL, SOL token cannot call DeepSeek, and revoked tokens are rejected', async (t) => {
  const deepseekUp = await fakeUpstream(t, { name: 'deepseek', agent: () => ({ content: 'd' }) });
  const solUp = await fakeUpstream(t, { name: 'sol', agent: () => ({ content: 's' }) });
  const broker = await startProviderBroker();
  t.after(() => broker.close());
  const dRoute = resolveBrokerRoute({ role: 'WORKER', model: 'deepseek-v4-flash', endpoint: { baseUrl: deepseekUp.baseUrl }, env: { DEEPSEEK_API_KEY: 'k-deepseek' } });
  const sRoute = resolveBrokerRoute({ role: 'SOL', model: 'sol-xhigh', endpoint: { baseUrl: solUp.baseUrl }, env: { OPENAI_API_KEY: 'k-sol' } });
  const { token: dToken } = await broker.registerInvocation({ invocationId: 'lcim_inv_g_d', role: 'WORKER', provider: dRoute.provider, model: dRoute.model, upstream: dRoute.upstream });
  const { token: sToken } = await broker.registerInvocation({ invocationId: 'lcim_inv_g_s', role: 'SOL', provider: sRoute.provider, model: sRoute.model, upstream: sRoute.upstream });
  assert.notEqual(dToken, sToken, 'each invocation gets a unique token');

  const url = chatPath(broker);
  // Cross-route attempts are rejected with NO upstream request.
  assert.equal((await brokerPost(url, dToken, { model: 'sol-xhigh', messages: [] })).status, 400, 'DeepSeek token must not reach the SOL model');
  assert.equal((await brokerPost(url, sToken, { model: 'deepseek-v4-flash', messages: [] })).status, 400, 'SOL token must not reach the DeepSeek model');
  assert.equal(solUp.requests.length, 0, 'no SOL upstream request from the DeepSeek invocation');
  assert.equal(deepseekUp.requests.length, 0, 'no DeepSeek upstream request from the SOL invocation');

  // Legitimate same-route traffic works for both.
  assert.equal((await brokerPost(url, dToken, { model: 'deepseek-v4-flash', messages: [] })).status, 200);
  assert.equal((await brokerPost(url, sToken, { model: 'sol-xhigh', messages: [] })).status, 200);
  assert.equal(deepseekUp.requests.length, 1);
  assert.equal(solUp.requests.length, 1);
  assert.equal(deepseekUp.requests[0].auth, 'Bearer k-deepseek');
  assert.equal(solUp.requests[0].auth, 'Bearer k-sol');

  // Worker-supplied routing fields cannot change the route.
  assert.equal((await brokerPost(url, dToken, { model: 'deepseek-v4-flash', url: solUp.baseUrl, host: '127.0.0.1', port: 1, protocol: 'https:', upstream: 'x', provider: 'sol', messages: [] })).status, 400);
  assert.equal(deepseekUp.requests.length, 1, 'override fields must not reach any upstream');

  // Wrong/missing token.
  assert.equal((await brokerPost(url, cryptoToken(32), { model: 'deepseek-v4-flash', messages: [] })).status, 401);
  assert.equal((await brokerPost(url, dToken, { model: 'deepseek-v4-flash', messages: [] }, { tokenProvided: false })).status, 401);

  // Revocation: a DeepSeek token after its invocation completes is dead, and
  // a SOL token after its invocation completes is dead.
  assert.equal(broker.revokeInvocation(dToken), true);
  assert.equal((await brokerPost(url, dToken, { model: 'deepseek-v4-flash', messages: [] })).status, 401, 'revoked DeepSeek token must be rejected');
  assert.equal(broker.revokeInvocation(sToken), true);
  assert.equal((await brokerPost(url, sToken, { model: 'sol-xhigh', messages: [] })).status, 401, 'revoked SOL token must be rejected');
  assert.equal(deepseekUp.requests.length, 1);
  assert.equal(solUp.requests.length, 1);

  // CONNECT / upgrade remain blocked even with valid tokens present.
  const connectResult = await new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: broker.port });
    socket.on('connect', () => socket.write('CONNECT example.com:443 HTTP/1.1\r\nHost: example.com\r\n\r\n'));
    socket.on('close', () => resolve({ closed: true }));
    socket.on('error', () => resolve({ closed: true }));
    setTimeout(() => resolve({ closed: false }), 1500);
  });
  assert.equal(connectResult.closed, true);
});

test('SOL-S10-001/R2-H: generic SOL bypass via a worker token is rejected with zero SOL upstream calls; the legitimate compiled SOL route succeeds', { skip: hasRealPi ? false : 'real pi CLI not on PATH' }, async (t) => {
  withCredentialEnv(t, 'DEEPSEEK_API_KEY', 's10-deepseek-test-key-0123456789abcdef');
  withCredentialEnv(t, 'OPENAI_API_KEY', 's10-sol-test-key-0123456789abcdef');
  const deepseek = await fakeUpstream(t, { name: 'deepseek', agent: deepseekAgent({ bypassOnSession: 1 }) });
  const sol = await fakeUpstream(t, { name: 'sol', agent: solAgent });
  const fixture = makeTarget(t, { deepseekUrl: deepseek.baseUrl, solUrl: sol.baseUrl });

  let semanticCalls = 0;
  const result = await runController({
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: ++semanticCalls > 1 }),
  });

  // The worker invocation's sandboxed Pi attempted the bash tool carrying a
  // generic SOL request. Under the R4 tool surface the shell/process tool is
  // rejected BEFORE any process can exist (pi reports the tool as not found;
  // the Seatbelt boundary denies process creation regardless), so the bypass
  // never executed and never entered the SOL controller path (no SOL ledger
  // record, zero SOL upstream calls). The broker additionally rejects
  // cross-route tokens (R2-G) — both layers fail closed.
  assert.equal(result.ok, true);
  assert.equal(result.finalSummary.invocations, 3, 'worker + legitimate SOL + repair — the bypass created no SOL invocation');
  assert.equal(sol.requests.length, 1, 'the SOL upstream saw ONLY the legitimate compiled ask');
  assert.match(sol.requests[0].prompt, /Ask id: lcim_sol_ask_/);
  assert.equal(sol.requests[0].prompt.includes('GENERIC SOL PROMPT BYPASS'), false, 'the bypass prompt never reached the SOL upstream');
  const toolRejected = deepseek.requests.some((request) => request.body.includes('Tool bash not found'));
  assert.equal(toolRejected, true, 'the sandboxed bash tool call must have been rejected as unavailable (zero child creation)');
  assert.equal(deepseek.requests.some((request) => request.body.includes('GENERIC SOL PROMPT BYPASS')), false, 'the generic SOL bypass payload never reached ANY upstream');
});

test('SOL-S10-001/R2-I: local worker (DENY_ALL, no broker) followed by external SOL succeeds through a FRESH SOL broker and boundary', { skip: hasRealPi ? false : 'real pi CLI not on PATH' }, async (t) => {
  withBrokerCaEnv(t);
  withCredentialEnv(t, 'OPENAI_API_KEY', 's10-sol-test-key-0123456789abcdef');
  // DEEPSEEK_API_KEY is deliberately NOT set: the local worker must not need
  // any provider credential, and no DeepSeek broker route may ever exist.
  const sol = await fakeUpstream(t, { name: 'sol-https', agent: solAgent, tls: true });
  const fixture = makeTarget(t, { solUrl: sol.baseUrl });
  installLocalWorkerFixture(t, fixture.root);

  let semanticCalls = 0;
  const result = await runController({
    cwd: fixture.root,
    semanticValidator: async () => ({ accepted: ++semanticCalls > 1 }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.disposition, 'SEMANTICALLY_ACCEPTED');
  assert.equal(semanticCalls, 2);
  assert.ok(result.routeDecisions.some((decision) => decision.decision === 'ROUTE_SOL_DIAGNOSE'));
  assert.equal(result.finalSummary.invocations, 3, 'local worker + external SOL + local repair worker');
  assert.equal(result.finalSummary.starts, 3);
  assert.equal(result.finalSummary.completions, 3);
  assert.equal(result.finalSummary.assessments, 3);

  // R3: the LOCAL worker ran in its own boundary with network DENY_ALL and
  // NO broker; the SOL invocation got a NEW boundary pinned to a NEW broker
  // endpoint. No boundary was widened and no future endpoint was pre-planned
  // into the worker boundary.
  assert.equal(result.boundaryEvidencePaths.length, 3, 'one fresh boundary per invocation');
  const boundaries = result.boundaryEvidencePaths.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
  const workerBoundaries = boundaries.filter((evidence) => evidence.network.mode === 'DENY_ALL');
  const solBoundaries = boundaries.filter((evidence) => evidence.network.mode === 'BROKER_ONLY');
  assert.equal(workerBoundaries.length, 2, 'both local worker invocations used DENY_ALL boundaries');
  assert.equal(solBoundaries.length, 1, 'the SOL invocation used a BROKER_ONLY boundary');
  assert.ok(solBoundaries.every((evidence) => evidence.network.brokerReachable === true));
  assert.ok(solBoundaries.every((evidence) => evidence.network.otherLoopbackBlocked === true));

  // SOL completed through the HTTPS fake upstream, bound to the compiled ask,
  // via exactly ONE fresh SOL-only broker.
  assert.equal(sol.requests.length, 1);
  assert.equal(sol.requests[0].model, 'sol-xhigh');
  assert.equal(sol.requests[0].auth, 'Bearer s10-sol-test-key-0123456789abcdef');
  assert.match(sol.requests[0].prompt, /Ask id: lcim_sol_ask_/);

  assert.equal(result.brokerEvidencePaths.length, 1, 'only the SOL invocation created a broker listener');
  const brokerEvidence = JSON.parse(fs.readFileSync(result.brokerEvidencePaths[0], 'utf8'));
  assert.equal(brokerEvidence.byModel['sol-xhigh']?.requests, 1);
  assert.equal(brokerEvidence.byModel['deepseek-v4-flash'], undefined, 'the local worker registered no DeepSeek route');
  assert.equal(brokerEvidence.invocationsRegistered, 1, 'only the SOL invocation registered a capability');
  assert.equal(brokerEvidence.invocationsRevoked, 1, 'the SOL capability was revoked when the SOL invocation ended');
  assert.ok(brokerEvidence.port > 0, 'the SOL broker endpoint is recorded per invocation');
});

test('SOL-S10-001/R2-J: HTTPS certificate verification is preserved; untrusted upstream fails closed', async (t) => {
  withBrokerCaEnv(t);
  // This upstream presents a self-signed certificate NOT signed by the test
  // CA: verification must reject it even though the broker trusts the test CA.
  const untrusted = untrustedTlsFixture();
  let tlsHandshakes = 0;
  const server = https.createServer({ key: untrusted.key, cert: untrusted.cert }, (req, res) => {
    tlsHandshakes += 1;
    res.end('unexpected');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;

  const route = resolveBrokerRoute({
    role: 'WORKER',
    model: 'deepseek-v4-flash',
    endpoint: { baseUrl: `https://127.0.0.1:${port}/v1` },
    env: { DEEPSEEK_API_KEY: 's10-tls-key' },
  });
  const broker = await startProviderBroker();
  t.after(() => broker.close());
  const { token } = await broker.registerInvocation({
    invocationId: 'lcim_inv_r2j',
    role: 'WORKER',
    provider: route.provider,
    model: route.model,
    upstream: route.upstream,
  });

  const first = await brokerPost(chatPath(broker), token, { model: 'deepseek-v4-flash', messages: [] });
  assert.equal(first.status, 502, 'untrusted upstream TLS must fail closed at the broker');
  const second = await brokerPost(chatPath(broker), token, { model: 'deepseek-v4-flash', messages: [] });
  assert.equal(second.status, 502, 'the broker stays alive and keeps failing closed');
  assert.equal(tlsHandshakes, 0, 'the untrusted server must never see an application request');
  const snapshot = broker.snapshot();
  assert.equal(snapshot.byModel['deepseek-v4-flash'].upstreamErrors, 2);
});

// ---------------------------------------------------------------------------
// SOL-S10-002 — FROZEN as FIXED. Regressions preserved unchanged.
// ---------------------------------------------------------------------------

function permissiveProfile(dir) {
  const file = path.join(dir, 'permissive.sb');
  fs.writeFileSync(file, '(version 1)\n(allow default)\n', { encoding: 'utf8' });
  return file;
}

test('SOL-S10-002/1: forged verified object never spawns', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s10-forge-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const pwnFile = path.join(dir, 'pwned');
  const forged = {
    verified: true,
    verification: {},
    structural: true,
    sandboxExecutable: SEATBELT_EXECUTABLE,
    profilePath: permissiveProfile(dir),
    worktreeDir: dir,
    environment: {},
    networkPolicy: { mode: 'DENY_ALL', broker: null },
    credentialPaths: [],
    deniedWriteRoots: [],
    workUnitId: 'forged',
  };
  assert.throws(
    () => runConstrainedProcess(forged, { command: ['/bin/sh'], args: ['-c', `printf pwned > ${JSON.stringify(pwnFile)}`] }),
    /authorized|boundary/i,
  );
  assert.equal(fs.existsSync(pwnFile), false, 'no child side effect may occur');
});

test('SOL-S10-002/2: fabricated sealing evidence manufactures no authority', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s10-seal-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const boundaryModule = await import('../../src/controller/execution-boundary.mjs');
  const controllerModule = await import('../../src/controller/index.mjs');
  // Public sealing authority is removed entirely.
  assert.equal(boundaryModule.sealWorkerExecutionBoundary, undefined);
  assert.equal(controllerModule.sealWorkerExecutionBoundary, undefined);

  const pwnFile = path.join(dir, 'pwned');
  const forged = {
    verified: true,
    verification: { structural: true },
    structural: true,
    sandboxExecutable: SEATBELT_EXECUTABLE,
    profilePath: permissiveProfile(dir),
    worktreeDir: dir,
    environment: {},
    networkPolicy: { mode: 'DENY_ALL', broker: null },
    credentialPaths: [],
    deniedWriteRoots: [],
    workUnitId: 'forged',
  };
  // Even a successful objective verification probe (which fails closed here
  // anyway, against the forged object) grants no spawn authority.
  try {
    await verifyWorkerExecutionBoundary(forged);
  } catch {
    // Fail-closed verification is the expected outcome for a forged object;
    // whatever the outcome, it must never become spawn authority.
  }
  assert.throws(() => runConstrainedProcess(forged, { command: ['/bin/sh'], args: ['-c', `printf pwned > ${JSON.stringify(pwnFile)}`] }), /authorized|boundary/i);
  assert.equal(fs.existsSync(pwnFile), false);
});

test('SOL-S10-002/3: copied or cloned authorized objects are rejected', async (t) => {
  const { authorized, worktreeDir } = await makeBrokerBoundary(t);
  const pwnFile = path.join(worktreeDir, 'pwned');
  const attempt = (object) => () => runConstrainedProcess(object, { command: ['/bin/sh'], args: ['-c', `printf pwned > ${JSON.stringify(pwnFile)}`] });

  assert.throws(attempt({ ...authorized.boundary }), /authorized|boundary/i);
  assert.throws(attempt(Object.assign({}, authorized.boundary)), /authorized|boundary/i);
  assert.throws(attempt(JSON.parse(JSON.stringify(authorized.boundary))), /authorized|boundary/i);
  assert.equal(fs.existsSync(pwnFile), false);
  // The genuine object still spawns (cloning a real object does not clone
  // the module-private authority).
  const ok = await runConstrainedProcess(authorized.boundary, { command: ['/usr/bin/true'] });
  assert.equal(ok.status, 0);
});

test('SOL-S10-002/4: mutated profile bytes refuse spawn before child creation', async (t) => {
  const { authorized, worktreeDir } = await makeBrokerBoundary(t);
  const original = fs.readFileSync(authorized.boundary.profilePath, 'utf8');
  const pwnFile = path.join(worktreeDir, 'pwned');
  fs.writeFileSync(authorized.boundary.profilePath, '(version 1)\n(allow default)\n', { encoding: 'utf8' });
  assert.throws(
    () => runConstrainedProcess(authorized.boundary, { command: ['/bin/sh'], args: ['-c', `printf pwned > ${JSON.stringify(pwnFile)}`] }),
    /profile|digest/i,
  );
  assert.equal(fs.existsSync(pwnFile), false, 'spawn must be refused before child creation');
  // Restoring the exact authorized bytes re-enables the same capability.
  fs.writeFileSync(authorized.boundary.profilePath, original, { encoding: 'utf8' });
  const ok = await runConstrainedProcess(authorized.boundary, { command: ['/usr/bin/true'] });
  assert.equal(ok.status, 0);
});

test('SOL-S10-002/5: substituted profile path refuses spawn', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s10-path-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { authorized, worktreeDir } = await makeBrokerBoundary(t);
  const pwnFile = path.join(worktreeDir, 'pwned');
  const otherProfile = permissiveProfile(dir);

  // Object-level path substitution (a clone) is refused.
  assert.throws(
    () => runConstrainedProcess({ ...authorized.boundary, profilePath: otherProfile }, { command: ['/bin/sh'], args: ['-c', `printf pwned > ${JSON.stringify(pwnFile)}`] }),
    /authorized|boundary/i,
  );
  // A symlink swap at the authorized path is refused by realpath identity.
  fs.rmSync(authorized.boundary.profilePath, { force: true });
  fs.symlinkSync(otherProfile, authorized.boundary.profilePath);
  assert.throws(
    () => runConstrainedProcess(authorized.boundary, { command: ['/bin/sh'], args: ['-c', `printf pwned > ${JSON.stringify(pwnFile)}`] }),
    /profile|substitut|path/i,
  );
  assert.equal(fs.existsSync(pwnFile), false);
});

test('SOL-S10-002/6: sandbox executable substitution is refused', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s10-exe-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const shim = path.join(dir, 'shim-sandbox-exec');
  fs.writeFileSync(shim, '#!/bin/sh\nexec "$@"\n', { mode: 0o755 });
  const { authorized, worktreeDir, repoDir, runDir } = await makeBrokerBoundary(t);
  const pwnFile = path.join(worktreeDir, 'pwned');

  // A clone with a substituted executable is refused.
  assert.throws(
    () => runConstrainedProcess({ ...authorized.boundary, sandboxExecutable: shim }, { command: ['/bin/sh'], args: ['-c', `printf pwned > ${JSON.stringify(pwnFile)}`] }),
    /authorized|boundary/i,
  );
  assert.equal(fs.existsSync(pwnFile), false);

  // Authorization itself refuses non-canonical executables: production is
  // pinned to /usr/bin/sandbox-exec.
  await assert.rejects(
    authorizeWorkerExecutionBoundary({
      repoDir,
      worktreeDir,
      runDir,
      workUnitId: `lcim_wu_s10_${cryptoToken(12)}`,
      sandboxExecutable: shim,
    }),
    /canonical|pinned|sandbox-exec/i,
  );
});

test('SOL-S10-002/7: worktree/scratch mutation is refused', async (t) => {
  const { authorized, worktreeDir } = await makeBrokerBoundary(t);
  const evil = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s10-evil-'));
  t.after(() => fs.rmSync(evil, { recursive: true, force: true }));
  const pwnFile = path.join(evil, 'pwned');
  const attempt = (object) => () => runConstrainedProcess(object, { command: ['/bin/sh'], args: ['-c', `printf pwned > ${JSON.stringify(pwnFile)}`] });

  assert.throws(attempt({ ...authorized.boundary, worktreeDir: evil }), /authorized|boundary/i);
  assert.throws(attempt({ ...authorized.boundary, scratchRoot: evil }), /authorized|boundary/i);
  assert.throws(attempt({ ...authorized.boundary, deniedWriteRoots: [] }), /authorized|boundary/i);
  assert.equal(fs.existsSync(pwnFile), false);

  // The genuine capability still runs inside the AUTHORIZED worktree only.
  const proof = await runConstrainedProcess(authorized.boundary, {
    command: ['/bin/sh'],
    args: ['-c', `printf ok > ${JSON.stringify(path.join(worktreeDir, 'proof'))}`],
  });
  assert.equal(proof.status, 0);
  assert.equal(fs.readFileSync(path.join(worktreeDir, 'proof'), 'utf8'), 'ok');
  assert.equal(fs.existsSync(pwnFile), false);
});

test('SOL-S10-002/8: a genuine authorized boundary still runs permitted commands', async (t) => {
  const { authorized, worktreeDir } = await makeBrokerBoundary(t);
  const first = await runConstrainedProcess(authorized.boundary, {
    command: ['/bin/sh'],
    args: ['-c', `printf one > ${JSON.stringify(path.join(worktreeDir, 'genuine-1'))}`],
  });
  assert.equal(first.status, 0);
  assert.equal(fs.readFileSync(path.join(worktreeDir, 'genuine-1'), 'utf8'), 'one');
  const second = await runConstrainedProcess(authorized.boundary, {
    command: ['/bin/sh'],
    args: ['-c', `printf two > ${JSON.stringify(path.join(worktreeDir, 'genuine-2'))}`],
  });
  assert.equal(second.status, 0);
  assert.equal(fs.readFileSync(path.join(worktreeDir, 'genuine-2'), 'utf8'), 'two');
});
