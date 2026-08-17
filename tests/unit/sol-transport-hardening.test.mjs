import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

import {
  acquireCodexSolStore,
  assessSolTransportResult,
  assertPiExecutableUnchanged,
  buildCodexSolCommand,
  computePiDependencyClosure,
  inspectSolTransportSurface,
  loadSolSystemPrompt,
  materializePinnedPiExecution,
  prepareCodexSolInvocation,
  resolvePiExecutable,
  runSolPiProcess,
  sanitizeArgvForEvidence,
  scanForCredentialLeak,
  scanForCredentialLeakDetailed,
  sweepRunSolTransportSurfaces,
} from '../../src/controller/sol-transport.mjs';
import { consumeSolTestSeam, mintSolTestSeam } from '../../src/controller/test-seams.mjs';
import { ConfigError } from '../../src/shared/errors.mjs';

function id(kind, character) {
  return `lcim_${kind}_${character.repeat(32)}`;
}

function fixturePi(t, body = "process.stdout.write('{}');") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-sol-hardening-pi-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cli = path.join(dir, 'fixture-pi.cjs');
  fs.writeFileSync(cli, `#!/usr/bin/env node\nprocess.stdin.resume();\nprocess.stdin.on('end', () => { ${body} });\n`);
  fs.chmodSync(cli, 0o700);
  const seam = mintSolTestSeam();
  return {
    pi: resolvePiExecutable({ piBin: cli, testAuthority: consumeSolTestSeam(seam, 'fixture Pi') }),
    authority: consumeSolTestSeam(mintSolTestSeam(), 'fixture store'),
  };
}

function oauthEnv(t, { access = 'fixture-access-token-0123456789', refresh = 'fixture-refresh-token-0123456789', raw = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-sol-hardening-auth-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const agent = path.join(root, 'agent');
  fs.mkdirSync(agent, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(agent, 'auth.json'), raw ?? JSON.stringify({ 'openai-codex': { type: 'oauth', access, refresh, expires: Date.now() + 3_600_000 } }), { mode: 0o600 });
  return { PI_CODING_AGENT_DIR: agent, HOME: root };
}

async function fixtureStore(t, { fixtureBody, envOptions, runCharacter = 'a' } = {}) {
  const runParent = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-sol-hardening-run-'));
  const runId = id('run', runCharacter);
  const runDir = path.join(runParent, runId);
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  // Fifth-review rule: transport surface creation requires the
  // authoritative run.json lifecycleState OPEN under the run-dir lock.
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({ schemaName: 'lcim.run', schemaVersion: '1.0.0', runId, lifecycleState: 'OPEN', createdAt: new Date().toISOString(), targetBaseSha: 'a'.repeat(40), configDigest: 'b'.repeat(64), lcimVersion: '2.0.1', lcimCommit: null, storeVersion: '1', finalizedAt: null, abortedAt: null, abortNote: null, finalSummary: null })}\n`);
  t.after(() => fs.rmSync(runParent, { recursive: true, force: true }));
  const { pi, authority } = fixturePi(t, fixtureBody);
  const store = await acquireCodexSolStore({
    runDir,
    runId,
    invocationId: id('inv', 'b'),
    invocationMarker: 'marker-' + 'a'.repeat(24),
    pi,
    env: oauthEnv(t, envOptions),
    testAuthority: authority,
  });
  return { runDir, runId, store };
}

test('opaque SOL seam authorities cannot be copied or reused', () => {
  const capability = mintSolTestSeam();
  assert.throws(() => consumeSolTestSeam({ ...capability }, 'copied capability'), ConfigError);
  const authority = consumeSolTestSeam(capability, 'first use');
  assert.ok(authority);
  assert.throws(() => consumeSolTestSeam(capability, 'reuse'), ConfigError);
  assert.throws(() => consumeSolTestSeam({ kind: 'lcim.sol-test-seam-opaque' }, 'forged capability'), ConfigError);
});

test('normal production Node processes cannot mint a SOL test authority', () => {
  const seamUrl = pathToFileURL(path.resolve('src/controller/test-seams.mjs')).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `import { mintSolTestSeam } from ${JSON.stringify(seamUrl)}; mintSolTestSeam();`], {
    encoding: 'utf8',
    env: { ...process.env, NODE_TEST_CONTEXT: '' },
  });
  assert.notEqual(child.status, 0);
  assert.match(child.stderr, /may be minted only by node:test workers/);
});

test('transport acceptance fails every omitted/null positive proof independently', () => {
  const accepted = {
    status: 0, error: null, timedOut: false, truncated: false, processCompleted: true,
    identityVerifiedBeforeSpawn: true, identityVerifiedAfterExit: true,
    processAbsenceVerified: true, quiescenceVerified: true, surfaceVerified: true,
    credentialScanPassed: true, cleanupVerified: true, reviewAuthority: 'AUTHORITATIVE',
  };
  assert.equal(assessSolTransportResult(accepted).ok, true);
  for (const field of Object.keys(accepted)) {
    const omitted = { ...accepted };
    delete omitted[field];
    assert.equal(assessSolTransportResult(omitted).ok, false, `omitted ${field}`);
    if (field !== 'error') assert.equal(assessSolTransportResult({ ...accepted, [field]: null }).ok, false, `null ${field}`);
  }
  for (const [field, value] of [
    ['status', 2], ['error', 'static error'], ['timedOut', true], ['truncated', true],
    ['processCompleted', false], ['identityVerifiedBeforeSpawn', false], ['identityVerifiedAfterExit', false],
    ['processAbsenceVerified', false], ['quiescenceVerified', false], ['surfaceVerified', false],
    ['credentialScanPassed', false], ['cleanupVerified', false], ['reviewAuthority', 'UNKNOWN'],
  ]) assert.equal(assessSolTransportResult({ ...accepted, [field]: value }).ok, false, `${field} must fail`);
});

test('credential canary catches encodings and fragments but accepts ordinary JWT-like prose', async (t) => {
  const { store } = await fixtureStore(t, { envOptions: { access: 'Abc-0123+/token-XYZ', refresh: 'refresh-9876543210' } });
  const token = store.entry().access;
  assert.equal(scanForCredentialLeak(store, { stdout: Buffer.from(token).toString('base64') }), true);
  assert.equal(scanForCredentialLeak(store, { stdout: Buffer.from(token).toString('hex') }), true);
  assert.equal(scanForCredentialLeak(store, { stdout: encodeURIComponent(token) }), true);
  assert.equal(scanForCredentialLeak(store, { stdout: 'Abc0123 tokenXYZ refresh9876 543210' }), true);
  assert.equal(scanForCredentialLeak(store, { stdout: 'The response has a JWT-like header eyJhbGciOiJIUzI1NiJ9.payload.signature but no credential.' }), false);
  await store.remove();
});

test('credential scanner catches split escaped/encoded forms and reports only proven channels', async (t) => {
  const { store } = await fixtureStore(t, { envOptions: { access: 'Ascii+Token/Value=0123456789', refresh: 'Refresh+Token/Value=0123456789' } });
  const token = store.entry().access;
  const asciiEscaped = [...Buffer.from(token, 'utf8')].map((byte) => `\\u00${byte.toString(16).padStart(2, '0')}`).join('');
  assert.equal(scanForCredentialLeak(store, { stdout: asciiEscaped }), true, 'every-byte ASCII unicode escaping must be detected');
  const base64 = Buffer.from(token, 'utf8').toString('base64').replace(/=+$/, '');
  const splitBase64 = scanForCredentialLeakDetailed(store, { stdout: base64.slice(0, 8), stderr: base64.slice(8) });
  assert.equal(splitBase64.detected, true);
  assert.equal(splitBase64.channel, 'MULTIPLE');
  const base64url = base64.replaceAll('+', '-').replaceAll('/', '_');
  assert.equal(scanForCredentialLeak(store, { values: [base64url.slice(0, 9), base64url.slice(9)] }), true, 'base64url split across fields must be detected');
  const hex = Buffer.from(token, 'utf8').toString('hex');
  const splitHex = scanForCredentialLeakDetailed(store, { values: [hex.slice(0, 12), hex.slice(12)] });
  assert.equal(splitHex.detected, true, 'hex split across parsed fields must be detected');
  assert.equal(splitHex.channel, 'UNKNOWN');
  const url = encodeURIComponent(token).replace('%2B', '%2b').replace('%2F', '%2f');
  assert.equal(scanForCredentialLeak(store, { stdout: `${url.slice(0, 9)}---${url.slice(9)}` }), true, 'mixed-case fragmented URL encoding must be detected');
  const crossFields = scanForCredentialLeakDetailed(store, { values: [token.slice(0, 7), token.slice(7)] });
  assert.equal(crossFields.detected, true, 'parsed field concatenation must be detected');
  const keyAndValue = scanForCredentialLeakDetailed(store, { values: [token.slice(0, 8), token.slice(8)] });
  assert.equal(keyAndValue.detected, true);
  const encodedStdout = scanForCredentialLeakDetailed(store, { stdout: Buffer.from(token).toString('hex') });
  assert.equal(encodedStdout.channel, 'STDOUT', 'encoded stdout must not be mislabeled as stderr');
  for (const benign of [
    '{"verdict":"PASS","id":"eyJhbGciOiJIUzI1NiJ9.payload.signature"}',
    '{"summary":"normal bounded SOL response","tokenCount":123}',
    'eyJ0eXAiOiJKV1QifQ.eyJzdWIiOiJmaXh0dXJlIn0.signature',
  ]) assert.equal(scanForCredentialLeak(store, { stdout: benign }), false, `benign corpus false positive: ${benign}`);
  await store.remove();
});

test('sub-eight-character OAuth values fail closed before they enter a transport surface', async (t) => {
  const runParent = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-short-secret-'));
  t.after(() => fs.rmSync(runParent, { recursive: true, force: true }));
  const runId = id('run', 'c');
  const runDir = path.join(runParent, runId);
  fs.mkdirSync(runDir);
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({ schemaName: 'lcim.run', schemaVersion: '1.0.0', runId, lifecycleState: 'OPEN', createdAt: new Date().toISOString(), targetBaseSha: 'a'.repeat(40), configDigest: 'b'.repeat(64), lcimVersion: '2.0.1', lcimCommit: null, storeVersion: '1', finalizedAt: null, abortedAt: null, abortNote: null, finalSummary: null })}\n`);
  const { pi, authority } = fixturePi(t);
  await assert.rejects(acquireCodexSolStore({ runDir, runId, invocationId: id('inv', 'd'), invocationMarker: 'marker-' + 'b'.repeat(24), pi, env: oauthEnv(t, { access: 'short' }), testAuthority: authority }), /too short/);
});

test('marker is written before corrupt real auth can abort store construction', async (t) => {
  const runParent = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-marker-window-'));
  t.after(() => fs.rmSync(runParent, { recursive: true, force: true }));
  const runId = id('run', 'e');
  const runDir = path.join(runParent, runId);
  fs.mkdirSync(runDir);
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({ schemaName: 'lcim.run', schemaVersion: '1.0.0', runId, lifecycleState: 'OPEN', createdAt: new Date().toISOString(), targetBaseSha: 'a'.repeat(40), configDigest: 'b'.repeat(64), lcimVersion: '2.0.1', lcimCommit: null, storeVersion: '1', finalizedAt: null, abortedAt: null, abortNote: null, finalSummary: null })}\n`);
  const { pi, authority } = fixturePi(t);
  await assert.rejects(acquireCodexSolStore({ runDir, runId, invocationId: id('inv', 'f'), invocationMarker: 'marker-' + 'c'.repeat(24), pi, env: oauthEnv(t, { raw: '{not-json' }), testAuthority: authority }), /corrupt/);
  // The durable store marker lives OUTSIDE the credential subtree. An
  // in-process construction failure removes BOTH the partial subtree and
  // the marker (nothing may be left behind); a crash at any earlier point
  // is recoverable because the marker was durably written FIRST.
  const storeDir = path.join(runDir, 'controller', 'sol-transport', 'store');
  const marker = path.join(runDir, 'controller', 'sol-transport', 'markers', `${runId}.json`);
  assert.equal(fs.existsSync(storeDir), false, 'a failed construction must not leave a partial credential surface');
  assert.equal(fs.existsSync(marker), false, 'a failed construction must not leave a dangling marker');
  const source = fs.readFileSync(new URL('../../src/controller/sol-transport.mjs', import.meta.url), 'utf8');
  assert.ok(source.indexOf('writeDurableMarker(file, record)') < source.lastIndexOf('strictReadRealAuth(env)'), 'durable marker write must precede any credential read/write');
  assert.match(source, /fs\.fsyncSync\(fd\)/);
  assert.match(source, /fsyncDirectory\(path\.dirname\(file\)\)/);
});

test('surface inspection rejects extra providers, directories, and symlinks', async (t) => {
  const { store } = await fixtureStore(t, { runCharacter: 'a' });
  const auth = JSON.parse(fs.readFileSync(store.authFile, 'utf8'));
  auth.anotherProvider = { type: 'oauth', access: 'another-access-token-0123456789' };
  fs.writeFileSync(store.authFile, JSON.stringify(auth), { mode: 0o600 });
  fs.mkdirSync(path.join(store.agentDir, 'skills'));
  fs.symlinkSync(path.join(store.agentDir, 'auth.json'), path.join(store.agentDir, 'linked-auth.json'));
  const result = inspectSolTransportSurface({ store, pi: store.pi });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('auth-provider-set'));
  assert.ok(result.errors.includes('unexpected-directories'));
  assert.ok(result.errors.includes('symlinks'));
  // The deliberately injected symlink makes normal security cleanup refuse
  // the surface; remove this test fixture directly after proving rejection.
  fs.rmSync(store.storeDir, { recursive: true, force: true });
});

test('surface inspection rejects authority-bearing leftovers in controller cwd/home/tmp', async (t) => {
  const { runDir, store } = await fixtureStore(t, { runCharacter: 'c' });
  const transport = await prepareCodexSolInvocation({
    runDir,
    store,
    invocationId: id('inv', 'd'),
    invocationMarker: 'marker-' + 'e'.repeat(24),
    systemPrompt: loadSolSystemPrompt(),
    env: {},
  });
  fs.writeFileSync(path.join(transport.home, 'settings.json'), '{}');
  const result = inspectSolTransportSurface({ store, transport, pi: store.pi });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('invocation-surface'));
  fs.rmSync(transport.root, { recursive: true, force: true });
  fs.rmSync(store.storeDir, { recursive: true, force: true });
});

test('surface inspection rejects an auth.json.lock with invalid type or state', async (t) => {
  const { store } = await fixtureStore(t, { runCharacter: 'b' });
  fs.writeFileSync(path.join(store.agentDir, 'auth.json.lock'), 'not a proper-lockfile directory');
  const result = inspectSolTransportSurface({ store, pi: store.pi });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('auth-json-lock'));
  fs.rmSync(store.storeDir, { recursive: true, force: true });
});

test('argv evidence redacts controller system-prompt text as well as ask text', () => {
  const system = 'controller-only system instruction SECRET_SYSTEM_TEXT';
  const ask = 'lcim_sol_ask_sensitive_prompt';
  const result = sanitizeArgvForEvidence(['--system-prompt', system, ask], ask, system);
  assert.equal(result.argv.includes(system), false);
  assert.equal(result.argv.includes(ask), false);
  assert.ok(result.argv.every((value) => !value.includes('SECRET_SYSTEM_TEXT')));
  assert.match(result.systemPromptDigest, /^[0-9a-f]{64}$/);
});

test('timeout kills a detached child that ignores SIGTERM and preserves cleanup eligibility', async (t) => {
  const { runDir, runId, store } = await fixtureStore(t, {
    fixtureBody: "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);",
    runCharacter: 'b',
  });
  const transport = await prepareCodexSolInvocation({
    runDir, store, invocationId: id('inv', 'c'), invocationMarker: 'marker-' + 'd'.repeat(24), systemPrompt: loadSolSystemPrompt(), env: {},
  });
  const spec = buildCodexSolCommand({ pi: transport.pi, systemPrompt: transport.systemPrompt });
  const started = Date.now();
  const result = await runSolPiProcess({ transport, command: spec.command, args: [...spec.args, 'ask'], input: '', timeoutMs: 100 });
  assert.equal(result.timedOut, true);
  assert.ok(Date.now() - started < 5_000, 'TERM→KILL must remain bounded');
  assert.equal(result.processAbsenceVerified, false, 'direct child exit alone is not controller process-lifetime proof');
  transport.confirmProcessAbsence();
  await transport.remove();
  await store.remove();
});

test('recovery sweep rejects caller process inspection and leaves the marked surface intact', async (t) => {
  const { runDir, store } = await fixtureStore(t, { runCharacter: 'd' });
  await assert.rejects(
    sweepRunSolTransportSurfaces(runDir, { processTable: { listWithEnv() { throw new Error('process table denied'); } } }),
    /never accepts caller process inspection/,
  );
  assert.equal(fs.existsSync(store.storeDir), true, 'marked credential surface must remain for explicit recovery');
  await store.remove();
});

test('recovery never deletes a surface whose marker schema is unknown', async (t) => {
  const { runDir, store } = await fixtureStore(t, { runCharacter: 'f' });
  const markerFile = path.join(runDir, 'controller', 'sol-transport', 'markers', `${store.runId}.json`);
  const marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
  marker.schemaVersion = '999.0.0';
  fs.writeFileSync(markerFile, JSON.stringify(marker));
  const result = await sweepRunSolTransportSurfaces(runDir);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.kind === 'invalid-marker'));
  assert.equal(fs.existsSync(store.storeDir), true);
  fs.rmSync(store.storeDir, { recursive: true, force: true });
});

test('recovery refuses marker identity disagreement rather than deleting surfaces', async (t) => {
  const { runDir, store } = await fixtureStore(t, { runCharacter: 'd' });
  const transport = await prepareCodexSolInvocation({
    runDir, store, invocationId: id('inv', 'e'), invocationMarker: 'marker-' + 'f'.repeat(24), systemPrompt: loadSolSystemPrompt(), env: {},
  });
  const markerFile = path.join(transport.root, '.lcim-sol-transport.json');
  const marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
  marker.cliIdentitySha256 = 'f'.repeat(64);
  fs.writeFileSync(markerFile, JSON.stringify(marker));
  const result = await sweepRunSolTransportSurfaces(runDir);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.kind === 'marker-identity-mismatch'));
  assert.equal(fs.existsSync(store.storeDir), true);
  fs.rmSync(store.storeDir, { recursive: true, force: true });
  fs.rmSync(transport.root, { recursive: true, force: true });
});

test('recovery reports a cleanup failure and retains a marker-bound surface', async (t) => {
  const { runDir, store } = await fixtureStore(t, { runCharacter: 'e' });
  fs.symlinkSync(store.authFile, path.join(store.agentDir, 'malicious-link'));
  const result = await sweepRunSolTransportSurfaces(runDir);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.kind === 'removal'));
  assert.equal(fs.existsSync(store.storeDir), true, 'failed recovery must retain rather than guess-delete the credential surface');
  fs.rmSync(store.storeDir, { recursive: true, force: true });
});

test('immutable execution copy detects a modified transitive Pi module before spawn', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-pi-copy-tamper-'));
  const makeWritable = (target) => {
    const stat = fs.lstatSync(target);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(target)) makeWritable(path.join(target, name));
      fs.chmodSync(target, 0o700);
    } else fs.chmodSync(target, 0o600);
  };
  try {
    const copy = materializePinnedPiExecution(resolvePiExecutable(), { storeDir: root });
    const command = buildCodexSolCommand({ pi: copy, systemPrompt: loadSolSystemPrompt() }).command;
    assert.deepEqual(command, [copy.node, '--require', copy.executionRequireGuard, '--experimental-loader', copy.executionLoader, copy.cli]);
    assert.ok(path.isAbsolute(copy.executionManifest));
    assert.ok(path.isAbsolute(copy.executionLoader));
    assert.ok(path.isAbsolute(copy.executionRequireGuard));
    const manifest = JSON.parse(fs.readFileSync(copy.executionManifest, 'utf8'));
    assert.equal(manifest.closureSha256, copy.closure.sha256);
    assert.equal(manifest.fileCount, copy.closure.fileCount);
    const version = spawnSync(copy.node, [...command.slice(1), '--version'], { encoding: 'utf8', env: { ...process.env, NODE_PATH: '' } });
    assert.equal(version.status, 0, version.stderr);
    assert.equal(version.stdout.trim(), '0.84.1');
    const outside = path.join(root, 'outside-target-module.mjs');
    fs.writeFileSync(outside, 'export default 1;\n');
    const externalImport = spawnSync(copy.node, ['--experimental-loader', copy.executionLoader, '--input-type=module', '--eval', `await import(${JSON.stringify(pathToFileURL(outside).href)});`], { encoding: 'utf8' });
    assert.notEqual(externalImport.status, 0, 'immutable loader must refuse resolution outside copied node_modules');
    const outsideCjs = path.join(root, 'outside-target-module.cjs');
    fs.writeFileSync(outsideCjs, 'module.exports = 1;\n');
    const externalRequire = spawnSync(copy.node, ['--require', copy.executionRequireGuard, '--eval', `require(${JSON.stringify(outsideCjs)});`], { encoding: 'utf8' });
    assert.notEqual(externalRequire.status, 0, 'immutable CommonJS guard must refuse target/external resolution');
    const transitiveRoot = copy.closure.roots.find((entry) => entry.name === 'proper-lockfile')?.root;
    const transitive = path.join(transitiveRoot ?? '', 'index.js');
    assert.equal(fs.existsSync(transitive), true, 'reviewed closure must contain transitive runtime modules');
    const original = fs.readFileSync(transitive);
    fs.chmodSync(transitive, 0o600);
    fs.appendFileSync(transitive, '\\n// test transitive replacement\\n');
    assert.throws(() => assertPiExecutableUnchanged(copy), /dependency closure changed/);
    fs.writeFileSync(transitive, original);
    fs.chmodSync(transitive, 0o444);
    fs.chmodSync(path.dirname(transitive), 0o700);
    fs.rmSync(transitive);
    assert.throws(() => assertPiExecutableUnchanged(copy), /dependency closure changed|missing a pinned closure file/);
    fs.writeFileSync(transitive, original);
    fs.chmodSync(transitive, 0o444);
    fs.chmodSync(copy.executionNodeModules, 0o700);
    const extraRoot = path.join(copy.executionNodeModules, 'target-ancestor-injection');
    fs.mkdirSync(extraRoot);
    fs.writeFileSync(path.join(extraRoot, 'index.js'), 'export default null;\n');
    assert.throws(() => assertPiExecutableUnchanged(copy), /extra module directory|extra executable\/module file/);
  } finally {
    if (fs.existsSync(root)) {
      makeWritable(root);
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('execution closure includes source Pi dependencies and is pinned independently of target cwd', () => {
  const pi = resolvePiExecutable();
  const closure = computePiDependencyClosure(pi.packageRoot);
  assert.ok(closure.fileCount > 1_000);
  assert.ok(closure.roots.some((root) => root.name === '@earendil-works/pi-coding-agent'));
  assert.ok(closure.roots.some((root) => root.name === 'proper-lockfile'));
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-target-node-modules-'));
  try {
    fs.mkdirSync(path.join(target, 'node_modules', '@earendil-works', 'pi-coding-agent'), { recursive: true });
    fs.writeFileSync(path.join(target, 'node_modules', '@earendil-works', 'pi-coding-agent', 'package.json'), JSON.stringify({ name: '@earendil-works/pi-coding-agent', version: '999.0.0' }));
    assert.ok(!pi.packageRoot.startsWith(target), 'controller resolution must never use target-tree node_modules');
    const transportUrl = pathToFileURL(path.resolve('src/controller/sol-transport.mjs')).href;
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', `import { resolvePiExecutable } from ${JSON.stringify(transportUrl)}; console.log(resolvePiExecutable().packageRoot);`], { cwd: target, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout.trim().startsWith(target), false, 'module resolution from a target cwd must still use LCIM-owned node_modules');
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
  }
});
