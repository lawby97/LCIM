/**
 * V2.0.1 tests: controller-side Pi SOL transport (GPT-5.6 Sol via Pi's
 * native `openai-codex` provider).
 *
 * Pi is a TRUSTED CONTROLLER-SIDE provider client for SOL only — it NEVER
 * runs inside the DeepSeek worker execution boundary. These tests pin:
 *
 * - PROVENANCE (SOL-S11-001): the Pi entrypoint comes ONLY from a
 *   controller-trusted source (dependency-resolved from the controller
 *   package, `LCIM_SOL_PI_CLI`, or the capability-gated fixture seam).
 *   `npm`, `which`, and inherited PATH are never used: a PATH-shadowed
 *   npm/pi, a poisoned npm prefix, and a fake canonical-looking package in
 *   a PATH-controlled location can never be selected.
 * - IDENTITY PINNING: node + CLI are realpath'd and pinned by stat
 *   identity + SHA-256; the identity is re-verified immediately before
 *   spawn and after exit (verify→replace and package replacement are
 *   refused).
 * - strict environment allowlist (proxy/custom-trust/PI-star/credential
 *   families stripped);
 * - run-scoped isolated PI_CODING_AGENT_DIR (only auth.json, mode 0600,
 *   only the openai-codex entry; no models.json / models-store.json /
 *   settings.json / SYSTEM.md / extensions / skills / templates);
 * - Pi's own OAuth refresh works inside the writable isolated dir and the
 *   refreshed credential joins the leak-scan sensitive set; rotation is
 *   reconciled to the real store under Pi's storage semantics (two
 *   sequential invocations: the second uses the refreshed state);
 * - repository/CLI sol.command can never masquerade as an automatic SOL
 *   channel; test seams (piBin/systemPrompt/runner/solCommand) are
 *   capability-gated and non-authoritative;
 * - credential canary: raw, JSON-escaped, base64/hex/URL-encoded,
 *   fragmented, short, and refreshed token forms in stdout/stderr and in
 *   parsed canonical values are rejected statically and never persisted
 *   or echoed;
 * - transport acceptance gate: valid SOL JSON with timedOut=true or a
 *   transport error is rejected;
 * - cleanup marks removal only after observed success; injected cleanup
 *   failure fails closed;
 * - observed (not asserted) post-exit agent-dir layout evidence.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { invokeBoundedProvider } from '../../src/controller/provider.mjs';
import {
  PI_CONTROLLER_CONFIG_ENV,
  SOL_TRANSPORT_SCHEMA_VERSION,
  acquireCodexSolStore,
  assessSolTransportResult,
  assertPiExecutableUnchanged,
  buildCodexSolCommand,
  buildSolTransportEnv,
  collectCanonicalStringValues,
  computeFileIdentity,
  inspectSolTransportSurface,
  loadSolSystemPrompt,
  prepareCodexSolInvocation,
  resolvePiExecutable,
  runSolPiProcess,
  sanitizeArgvForEvidence,
  scanForCredentialLeak,
  SOL_TRANSPORT_PATH,
  STRIPPED_ENV_FAMILIES,
  TRANSPORT_CREDENTIAL_LEAK,
  verifyPiCliPath,
} from '../../src/controller/sol-transport.mjs';
import { mintSolTestSeam, consumeSolTestSeam, isSolTestSeam, assertSolTestSeam } from '../../src/controller/test-seams.mjs';
import { ProviderBrokerError } from '../../src/controller/provider-broker.mjs';
import { ConfigError } from '../../src/shared/errors.mjs';
import { CODEX_OAUTH_PROVIDER, PI_AUTH_FILE } from '../../src/providers/oauth.mjs';
import { readSolFixture } from '../sol/helpers.mjs';

/** Compiled Sprint-06 diagnose ask fixture (validated by the real schema). */
function fixtureAsk() {
  return readSolFixture('valid-ask-diagnose.json');
}

function fixtureProjectConfig() {
  return {
    worker: { command: null, args: [], timeoutMs: 300_000 },
    sol: { command: null, args: [], timeoutMs: 120_000 },
    endpoints: {},
  };
}

/** Write a fixture pi CLI script (a controller-owned test seam binary). */
function writeFixturePi(t, { onRun = 'console.log(JSON.stringify({ fixture: true }));' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-pi-seam-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'fixture-pi.cjs');
  fs.writeFileSync(
    file,
    `#!/usr/bin/env node\n'use strict';\nlet prompt = '';\nprocess.stdin.on('data', (c) => { prompt += c; });\nprocess.stdin.on('end', () => { ${onRun} });\n`,
    { mode: 0o755 },
  );
  return file;
}

function resolveFixturePi(t, options = {}) {
  const authority = consumeSolTestSeam(mintSolTestSeam(), 'unit fixture Pi');
  return { authority, pi: resolvePiExecutable({ piBin: writeFixturePi(t, options), testAuthority: authority }) };
}

/** Install a fixture real Pi store (controller-side availability + transport source). */
function withOAuthStore(t, { extraProviders = false, tokenValue = 'fixture-access-token-value', refreshValue = 'fixture-refresh-token-value' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-transport-oauth-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(dir, { recursive: true });
  const auth = {
    [CODEX_OAUTH_PROVIDER]: {
      type: 'oauth',
      access: tokenValue,
      refresh: refreshValue,
      expires: Date.now() + 3_600_000,
      accountId: 'fixture-account',
    },
  };
  if (extraProviders) {
    auth['anthropic'] = { type: 'oauth', access: 'other-provider-secret-value', refresh: 'other-provider-refresh', expires: Date.now() + 3_600_000 };
    auth['openai'] = { type: 'api-key', access: 'api-key-secret-value' };
  }
  fs.writeFileSync(path.join(dir, PI_AUTH_FILE), JSON.stringify(auth));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  t.after(() => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
  });
  return dir;
}

/** Build a run-scoped store + one invocation transport for the fixture seam. */
async function transportFor(t, { runDir = null, seam = true, tokenValue, refreshValue, onRun } = {}) {
  withOAuthStore(t, { ...(tokenValue !== undefined ? { tokenValue } : {}), ...(refreshValue !== undefined ? { refreshValue } : {}) });
  const run = runDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-transport-run-'));
  if (runDir === null) t.after(() => fs.rmSync(run, { recursive: true, force: true }));
  // Fifth-review rule: transport surface creation requires the
  // authoritative run.json lifecycleState OPEN (checked under the run-dir
  // lock); a terminal run can never gain a new marked transport surface.
  fs.writeFileSync(path.join(run, 'run.json'), `${JSON.stringify({ schemaName: 'lcim.run', schemaVersion: '1.0.0', runId: 'lcim_run_' + 'a'.repeat(32), lifecycleState: 'OPEN', createdAt: new Date().toISOString(), targetBaseSha: 'a'.repeat(40), configDigest: 'b'.repeat(64), lcimVersion: '2.0.1', lcimCommit: null, storeVersion: '1', finalizedAt: null, abortedAt: null, abortNote: null, finalSummary: null })}\n`);
  // Fixture Pi is always a structurally non-authoritative node:test seam.
  const authority = consumeSolTestSeam(mintSolTestSeam(), 'unit fixture Pi');
  const pi = resolvePiExecutable({ piBin: writeFixturePi(t, { ...(onRun !== undefined ? { onRun } : {}) }), testAuthority: authority });
  const store = await acquireCodexSolStore({
    runDir: run,
    runId: 'lcim_run_' + 'a'.repeat(32),
    invocationId: 'lcim_inv_' + 'b'.repeat(32),
    invocationMarker: 'a'.repeat(24),
    pi,
    env: process.env,
    testAuthority: authority,
  });
  const transport = await prepareCodexSolInvocation({
    runDir: run,
    store,
    invocationId: 'lcim_inv_' + 'b'.repeat(32),
    invocationMarker: 'a'.repeat(24),
    systemPrompt: loadSolSystemPrompt(),
    env: process.env,
  });
  return { store, transport, runDir: run, pi, authority };
}

/** Build a fake canonical-looking Pi package (full layout, name, version, bin). */
function fakeCanonicalPiPackage(t, { cliContent = '#!/usr/bin/env node\nconsole.log("fake canonical pi");\n', version = '0.84.1' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-fake-pi-pkg-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pkgRoot = path.join(root, 'node_modules', '@earendil-works', 'pi-coding-agent');
  fs.mkdirSync(path.join(pkgRoot, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(pkgRoot, 'package.json'), `${JSON.stringify({
    name: '@earendil-works/pi-coding-agent',
    version,
    type: 'module',
    bin: { pi: 'dist/cli.js' },
    exports: { '.': { import: './dist/index.js' } },
  }, null, 2)}\n`);
  fs.mkdirSync(path.join(pkgRoot, 'dist', 'core'), { recursive: true });
  fs.writeFileSync(path.join(pkgRoot, 'dist', 'index.js'), 'export {};\n');
  fs.writeFileSync(path.join(pkgRoot, 'dist', 'core', 'auth-storage.js'), 'export class FileAuthStorageBackend {}\n');
  const cli = path.join(pkgRoot, 'dist', 'cli.js');
  fs.writeFileSync(cli, cliContent, { mode: 0o755 });
  // Fixed integer mtime so identity-pin tests can restore an identical
  // stat after a same-size rewrite (exercising the content-hash path).
  fs.utimesSync(cli, 1_700_000_000, 1_700_000_000);
  return { root, pkgRoot, cli };
}

// ---------------------------------------------------------------------------
// SOL-S11-001 — Pi provenance: no npm/which/inherited PATH, identity pins
// ---------------------------------------------------------------------------

test('resolvePiExecutable returns an absolute pinned entrypoint, never unqualified pi', (t) => {
  const piBin = writeFixturePi(t);
  const authority = consumeSolTestSeam(mintSolTestSeam(), 'unit fixture Pi');
  const pi = resolvePiExecutable({ piBin, testAuthority: authority });
  assert.ok(path.isAbsolute(pi.node));
  assert.ok(path.isAbsolute(pi.cli));
  assert.equal(pi.cli, fs.realpathSync(piBin));
  assert.equal(pi.resolvedFrom, 'node-test-fixture');
  assert.equal(pi.node, fs.realpathSync(process.execPath));
  assert.match(pi.nodeIdentity.sha256, /^[0-9a-f]{64}$/);
  assert.match(pi.cliIdentity.sha256, /^[0-9a-f]{64}$/);
  assert.equal(typeof pi.nodeIdentity.stat.ino, 'number');
  // The seam must be absolute: a relative/plain name is refused outright.
  assert.throws(() => resolvePiExecutable({ piBin: 'pi' }), ConfigError);
  assert.throws(() => resolvePiExecutable({ piBin: 'relative/pi' }), ConfigError);
  assert.throws(() => resolvePiExecutable({ piBin: path.join(os.tmpdir(), 'does-not-exist-pi') }), ConfigError);
});

test('SOL-S11-001: poisoned PATH/npm/which cannot affect the exact LCIM dependency resolver', (t) => {
  const poisonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-poison-'));
  t.after(() => fs.rmSync(poisonDir, { recursive: true, force: true }));
  for (const name of ['pi', 'npm', 'which']) fs.writeFileSync(path.join(poisonDir, name), '#!/bin/sh\necho poisoned\n', { mode: 0o755 });
  const resolved = resolvePiExecutable({ env: { ...process.env, PATH: `${poisonDir}:/usr/bin:/bin` } });
  assert.equal(resolved.packageVersion, '0.84.1');
  assert.ok(!resolved.cli.startsWith(poisonDir));
});

test('SOL-S11-001: the resolver never invokes npm or which (source guard)', () => {
  const source = fs.readFileSync(new URL('../../src/controller/sol-transport.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /(spawn|spawnSync|exec|execFile|execSync|execFileSync)\([^)]*\b(npm|which)\b/, 'npm/which must never be spawned');
  assert.ok(!source.includes('resolveNpmGlobalRoot'), 'npm global-root resolution must not exist');
  assert.ok(!source.includes(`spawnSync('npm'`), 'unqualified npm must never be invoked');
});

test('SOL-S11-001: arbitrary LCIM_SOL_PI_CLI and canonical-looking foreign layouts never establish production authority', (t) => {
  const fake = fakeCanonicalPiPackage(t);
  assert.equal(verifyPiCliPath(fake.cli).ok, true, 'layout verification alone is not authority');
  assert.throws(
    () => resolvePiExecutable({ env: { ...process.env, [PI_CONTROLLER_CONFIG_ENV]: fake.cli } }),
    /not a production Pi authority source/,
  );
  const resolved = resolvePiExecutable();
  assert.notEqual(resolved.cli, fs.realpathSync(fake.cli));
  assert.equal(assertPiExecutableUnchanged(resolved), true);
});

test('SOL-S11-001: malformed/unknown package versions and invalid bin metadata are rejected', (t) => {
  const fake = fakeCanonicalPiPackage(t, { version: '0.84' });
  assert.equal(verifyPiCliPath(fake.cli).ok, false);
  const unknown = fakeCanonicalPiPackage(t, { version: '9.9.9' });
  assert.equal(verifyPiCliPath(unknown.cli).ok, false, 'an arbitrary semver must not become authority');
  const nullVersion = fakeCanonicalPiPackage(t, { version: null });
  assert.equal(verifyPiCliPath(nullVersion.cli).ok, false, 'null package metadata must fail closed');
  const badBin = fakeCanonicalPiPackage(t);
  const manifest = JSON.parse(fs.readFileSync(path.join(badBin.pkgRoot, 'package.json'), 'utf8'));
  manifest.bin.pi = '../evil.js';
  fs.writeFileSync(path.join(badBin.pkgRoot, 'package.json'), JSON.stringify(manifest));
  assert.equal(verifyPiCliPath(badBin.cli).ok, false);
  const badExports = fakeCanonicalPiPackage(t);
  const exportManifest = JSON.parse(fs.readFileSync(path.join(badExports.pkgRoot, 'package.json'), 'utf8'));
  exportManifest.exports = { '.': './dist/index.js' };
  fs.writeFileSync(path.join(badExports.pkgRoot, 'package.json'), JSON.stringify(exportManifest));
  assert.equal(verifyPiCliPath(badExports.cli).ok, false, 'incompatible package exports must fail closed');
});

test('SOL-S11-001: verify→spawn replacement is refused at spawn time (runSolPiProcess fails closed)', async (t) => {
  const { store, transport, pi } = await transportFor(t);
  // Replace the fixture CLI AFTER resolution but BEFORE spawn.
  fs.writeFileSync(pi.cli, '#!/usr/bin/env node\nconsole.log("replaced between verify and spawn");\n', { mode: 0o755 });
  const spec = buildCodexSolCommand({ pi: transport.pi, systemPrompt: transport.systemPrompt, reasoning: 'XHIGH' });
  const result = await runSolPiProcess({
    transport,
    command: spec.command,
    args: [...spec.args, 'prompt'],
    input: '',
    timeoutMs: 10_000,
  });
  assert.equal(result.status, null);
  assert.equal(result.processCompleted, false);
  assert.ok(result.error.includes('identity changed'), `expected fail-closed identity error, got ${result.error}`);
  assert.equal(result.identityVerifiedAfterExit, false);
  assert.equal(fs.existsSync(transport.agentDir), true, 'the store must still exist (removed by the run end)');
  await store.remove();
});

test('verifyPiCliPath pins the canonical @earendil-works/pi-coding-agent layout', (t) => {
  // A PATH-shadow-style fake `pi` elsewhere must NEVER verify.
  const fakeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-shadow-'));
  t.after(() => fs.rmSync(fakeDir, { recursive: true, force: true }));
  const fakeCli = path.join(fakeDir, 'pi');
  fs.writeFileSync(fakeCli, '#!/bin/sh\necho fake-pi\n', { mode: 0o755 });
  const shadow = verifyPiCliPath(fakeCli);
  assert.equal(shadow.ok, false, 'a shadow pi outside the canonical package layout must not verify');
  assert.ok(!fs.existsSync(path.join(fakeDir, '..', 'pi-coding-agent', 'dist', 'cli.js')));
  // Non-absolute and nonexistent candidates fail closed.
  assert.equal(verifyPiCliPath('pi').ok, false);
  assert.equal(verifyPiCliPath(path.join(fakeDir, 'missing.js')).ok, false);
  // A canonical-looking package WITHOUT the bin.pi -> dist/cli.js mapping
  // (layout/packaging substitution) must not verify.
  const fake = fakeCanonicalPiPackage(t, {});
  fs.writeFileSync(path.join(fake.pkgRoot, 'package.json'), `${JSON.stringify({ name: '@earendil-works/pi-coding-agent', version: '0.84.1' }, null, 2)}\n`);
  const noBin = verifyPiCliPath(fake.cli);
  assert.equal(noBin.ok, false, 'a package without bin.pi -> dist/cli.js must not verify');
  assert.equal(noBin.reason, 'package-unreadable-or-mismatched');
  // A correctly-shaped package verifies with package facts.
  const good = fakeCanonicalPiPackage(t, {});
  const verified = verifyPiCliPath(good.cli);
  assert.equal(verified.ok, true);
  assert.equal(verified.packageName, '@earendil-works/pi-coding-agent');
  assert.equal(verified.packageVersion, '0.84.1');
});

// ---------------------------------------------------------------------------
// Command/env surface
// ---------------------------------------------------------------------------

test('buildCodexSolCommand pins provider/model/reasoning and the full isolation flag surface', (t) => {
  const { pi } = resolveFixturePi(t);
  const systemPrompt = loadSolSystemPrompt();
  const spec = buildCodexSolCommand({ pi, systemPrompt, reasoning: 'XHIGH' });
  // Canonical absolute entrypoint only.
  assert.equal(spec.command[0], process.execPath);
  assert.ok(path.isAbsolute(spec.command[1]));
  assert.ok(!spec.command.includes('pi'), 'unqualified pi must never appear');
  assert.ok(!spec.args.includes('--approve'), '--approve must never appear (project trust must be refused)');
  const args = spec.args;
  assert.ok(args.includes('--provider') && args.includes(CODEX_OAUTH_PROVIDER));
  assert.ok(args.includes('--model') && args.includes('gpt-5.6-sol'));
  assert.ok(args.includes('--thinking') && args.includes('xhigh'));
  assert.ok(args.includes('--print'));
  assert.ok(args.includes('--no-session'));
  assert.ok(args.includes('--no-context-files'));
  assert.ok(args.includes('--no-extensions'));
  assert.ok(args.includes('--no-skills'));
  assert.ok(args.includes('--no-prompt-templates'));
  assert.ok(args.includes('--no-tools'));
  assert.ok(args.includes('--no-approve'));
  // Controller-pinned system prompt via Pi's supported mechanism.
  const systemPromptIndex = args.indexOf('--system-prompt');
  assert.ok(systemPromptIndex !== -1, '--system-prompt must be passed explicitly');
  assert.equal(args[systemPromptIndex + 1], systemPrompt);
  assert.match(systemPrompt, /SOL decision engine/);
  assert.equal(args.includes('--tools'), false);
});

test('buildSolTransportEnv is an allowlist: proxy/trust/PI-star/credential families are stripped', () => {
  const poison = {
    PATH: '/evil:/usr/bin:/bin',
    HOME: '/Users/evil',
    HTTP_PROXY: 'http://evil-proxy:8080',
    HTTPS_PROXY: 'http://evil-proxy:8080',
    ALL_PROXY: 'http://evil-proxy:8080',
    NO_PROXY: 'evil.example',
    http_proxy: 'http://evil-proxy:8080',
    https_proxy: 'http://evil-proxy:8080',
    all_proxy: 'http://evil-proxy:8080',
    no_proxy: 'evil.example',
    NODE_EXTRA_CA_CERTS: '/evil/ca.pem',
    SSL_CERT_FILE: '/evil/cert.pem',
    SSL_CERT_DIR: '/evil/certs',
    NODE_OPTIONS: '--require /evil/init.js',
    NODE_PATH: '/evil/node_modules',
    PI_OAUTH_CALLBACK_HOST: 'evil.example',
    PI_SHARE_VIEWER_URL: 'https://evil.example',
    PI_CODING_AGENT_SESSION_DIR: '/evil/sessions',
    OPENAI_API_KEY: 'sk-evil-secret',
    DEEPSEEK_API_KEY: 'dk-evil-secret',
    AWS_SECRET_ACCESS_KEY: 'aws-evil-secret',
    GITHUB_TOKEN: 'ghp_evil',
    SSH_AUTH_SOCK: '/evil/agent.sock',
    LANG: 'en_US.UTF-8',
    NO_COLOR: '1',
    TERM: 'xterm-256color',
  };
  const env = buildSolTransportEnv({
    agentDir: '/run/agent',
    cwd: '/run/cwd',
    home: '/run/home',
    tmp: '/run/tmp',
    invocationMarker: 'marker-from-parent',
    env: poison,
  });
  for (const key of Object.keys(poison)) {
    if (key === 'LANG' || key === 'NO_COLOR' || key === 'TERM' || key === 'PATH' || key === 'HOME') continue;
    assert.equal(key in env, false, `${key} must be stripped from the transport environment`);
  }
  // Controller pins.
  assert.equal(env.HOME, '/run/home');
  assert.equal(env.TMPDIR, '/run/tmp');
  assert.equal(env.PATH, SOL_TRANSPORT_PATH);
  assert.equal(env.PI_CODING_AGENT_DIR, '/run/agent');
  assert.equal(env.PI_OFFLINE, '1');
  assert.equal(env.PI_SKIP_VERSION_CHECK, '1');
  assert.equal(env.PI_TELEMETRY, '0');
  assert.equal(env.LCIM_INVOCATION_MARKER, 'marker-from-parent');
  // No other PI_* variable may exist.
  for (const key of Object.keys(env)) {
    assert.ok(!/^PI_/i.test(key) || ['PI_CODING_AGENT_DIR', 'PI_OFFLINE', 'PI_SKIP_VERSION_CHECK', 'PI_TELEMETRY'].includes(key), `unexpected PI_* key: ${key}`);
  }
  for (const family of STRIPPED_ENV_FAMILIES) {
    assert.equal(family in env, false, `stripped family member ${family} must not be present`);
  }
});

// ---------------------------------------------------------------------------
// Run-scoped isolated store
// ---------------------------------------------------------------------------

test('acquireCodexSolStore builds ONLY auth.json with ONLY the openai-codex entry (0600) and a controller marker', async (t) => {
  const { store, transport } = await transportFor(t, { seam: false });
  const agentEntries = fs.readdirSync(store.agentDir);
  assert.deepEqual(agentEntries, [PI_AUTH_FILE], 'the isolated agent dir must contain ONLY auth.json');
  const mode = fs.statSync(store.authFile).mode & 0o777;
  assert.equal(mode, 0o600, 'auth.json must be mode 0600');
  const parsed = JSON.parse(fs.readFileSync(store.authFile, 'utf8'));
  assert.deepEqual(Object.keys(parsed), [CODEX_OAUTH_PROVIDER], 'only the openai-codex entry may be copied');
  assert.equal(parsed[CODEX_OAUTH_PROVIDER].access, 'fixture-access-token-value');
  // The controller-owned durable STORE marker lives OUTSIDE the
  // credential subtree (markers/<runId>.json) so a crash during recursive
  // credential removal can never orphan credential bytes; the invocation
  // marker stays in its own invocation root.
  const storeMarker = JSON.parse(fs.readFileSync(path.join(store.runDir, 'controller', 'sol-transport', 'markers', store.runId + '.json'), 'utf8'));
  const invocationMarker = JSON.parse(fs.readFileSync(path.join(transport.root, '.lcim-sol-transport.json'), 'utf8'));
  assert.equal(storeMarker.schemaVersion, SOL_TRANSPORT_SCHEMA_VERSION);
  assert.equal(storeMarker.canonicalPath, fs.realpathSync(store.storeDir));
  assert.equal(storeMarker.credentialPath, path.join(fs.realpathSync(store.storeDir), 'agent', PI_AUTH_FILE));
  assert.match(storeMarker.transportIdentity, /^[0-9a-f]{64}$/);
  assert.match(storeMarker.nodeIdentitySha256, /^[0-9a-f]{64}$/);
  assert.match(storeMarker.cliIdentitySha256, /^[0-9a-f]{64}$/);
  assert.equal(storeMarker.closureIdentitySha256, null, 'fixture marker records no production closure');
  assert.equal(invocationMarker.canonicalPath, fs.realpathSync(transport.root));
  assert.equal(invocationMarker.invocationId, transport.invocationId);
  // No repository/user Pi config surface exists.
  for (const forbidden of ['models.json', 'models-store.json', 'settings.json', 'SYSTEM.md', 'APPEND_SYSTEM.md', 'tools', 'prompts', 'sessions', 'extensions', 'skills']) {
    assert.equal(fs.existsSync(path.join(store.agentDir, forbidden)), false, `${forbidden} must not exist in the isolated agent dir`);
  }
  // cwd is a fresh empty controller-owned directory.
  assert.equal(fs.readdirSync(transport.cwd).length, 0);
  assert.notEqual(transport.cwd, process.cwd());
  // env pins the isolated dir.
  assert.equal(transport.env.PI_CODING_AGENT_DIR, store.agentDir);
  await await store.remove();
  assert.equal(fs.existsSync(store.agentDir), false, 'secure removal must delete the isolated surface');
  assert.equal(fs.existsSync(path.join(store.runDir, 'controller', 'sol-transport', 'markers', store.runId + '.json')), false, 'the durable external marker must be removed after the credential subtree');
});

test('the isolated agent dir is writable so Pi OWN OAuth refresh works (lock + rewrite, then reload+removal)', async (t) => {
  const { store } = await transportFor(t);
  // Pi's FileAuthStorageBackend refreshes by acquiring proper-lockfile on
  // auth.json (creating auth.json.lock) and rewriting the file. The
  // controller-owned dir must permit exactly that.
  fs.mkdirSync(path.join(store.agentDir, 'auth.json.lock'), { mode: 0o700 });
  const refreshed = {
    [CODEX_OAUTH_PROVIDER]: {
      type: 'oauth',
      access: 'refreshed-access-token-value',
      refresh: 'refreshed-refresh-token-value',
      expires: Date.now() + 7_200_000,
      accountId: 'fixture-account',
    },
  };
  fs.writeFileSync(store.authFile, JSON.stringify(refreshed));
  fs.chmodSync(store.authFile, 0o600);
  const reload = store.refreshFromDisk();
  assert.equal(reload.ok, true);
  assert.equal(reload.changedThisReload, true, 'rotation must be detected');
  assert.ok(store.sensitiveValues().includes('refreshed-access-token-value'), 'the refreshed access token joins the sensitive set');
  assert.ok(store.sensitiveValues().includes('fixture-access-token-value'), 'the original access token stays in the sensitive set');
  await await store.remove();
  assert.equal(fs.existsSync(store.agentDir), false, 'refreshed tokens must be securely removed with the surface');
});

test('SOL-S11-007: two sequential invocations — the first refreshes, the second uses the refreshed state (run-scoped store)', async (t) => {
  const { store, transport: first, runDir: firstRunDir } = await transportFor(t);
  // Invocation 1: Pi rotates credentials inside the isolated store.
  const rotated = {
    type: 'oauth',
    access: 'rotated-access-token-0001',
    refresh: 'rotated-refresh-token-0001',
    expires: Date.now() + 7_200_000,
    accountId: 'fixture-account',
  };
  fs.writeFileSync(store.authFile, `${JSON.stringify({ [CODEX_OAUTH_PROVIDER]: rotated })}\n`);
  fs.chmodSync(store.authFile, 0o600);
  const reload = store.refreshFromDisk();
  assert.equal(reload.ok, true);
  assert.equal(reload.changed, true);
  // Invocation 2: a fresh invocation surface over the SAME run-scoped
  // store — it must see the refreshed credential.
  const second = await prepareCodexSolInvocation({
    runDir: firstRunDir,
    store,
    invocationId: 'lcim_inv_' + 'c'.repeat(32),
    invocationMarker: 'b'.repeat(24),
    systemPrompt: loadSolSystemPrompt(),
    env: process.env,
  });
  const parsed = JSON.parse(fs.readFileSync(second.authFile, 'utf8'));
  assert.equal(parsed[CODEX_OAUTH_PROVIDER].access, 'rotated-access-token-0001', 'the second invocation must use the refreshed credential');
  assert.equal(second.credentials.access, 'rotated-access-token-0001');
  // The refreshed credential is in the sensitive set for the second scan.
  assert.ok(second.sensitiveValues().includes('rotated-access-token-0001'));
  const noRefresh = store.refreshFromDisk();
  assert.equal(noRefresh.changedThisReload, false, 'a later no-refresh invocation must not reset rotation state');
  assert.equal(store.currentOpenAiCodexEntry().access, 'rotated-access-token-0001');
  // Sixth-review scope simplification: the real Pi auth store is READ-ONLY
  // input authority — the refreshed isolated state is NEVER written back.
  const realAuthFile = path.join(process.env.PI_CODING_AGENT_DIR, PI_AUTH_FILE);
  const realBefore = fs.readFileSync(realAuthFile, 'utf8');
  const verification = store.verifyRealAuthSourceUnchanged();
  assert.equal(verification.ok, true, 'the real store must be byte-identical (read-only)');
  assert.equal(verification.changed, false);
  await store.remove();
  assert.equal(fs.readFileSync(realAuthFile, 'utf8'), realBefore, 'removal must never touch the real store');
});

test('sixth-review: the real Pi auth store is READ-ONLY — refreshed isolated state is never written back', async (t) => {
  // An AUTHORITATIVE store (real pinned Pi, no seam) whose entry rotates
  // inside the isolated surface: the real store must remain byte-identical
  // and no write-back/reconciliation path may exist.
  const realDir = withOAuthStore(t, { extraProviders: true });
  const realAuthFile = path.join(realDir, PI_AUTH_FILE);
  const realBefore = fs.readFileSync(realAuthFile, 'utf8');
  const realIdentity = fs.statSync(realAuthFile);
  const pi = resolvePiExecutable();
  const run = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-reconcile-run-'));
  t.after(() => fs.rmSync(run, { recursive: true, force: true }));
  fs.writeFileSync(path.join(run, 'run.json'), `${JSON.stringify({ schemaName: 'lcim.run', schemaVersion: '1.0.0', runId: 'lcim_run_' + 'a'.repeat(32), lifecycleState: 'OPEN', createdAt: new Date().toISOString(), targetBaseSha: 'a'.repeat(40), configDigest: 'b'.repeat(64), lcimVersion: '2.0.1', lcimCommit: null, storeVersion: '1', finalizedAt: null, abortedAt: null, abortNote: null, finalSummary: null })}\n`);
  const store = await acquireCodexSolStore({ runDir: run, runId: 'lcim_run_' + 'a'.repeat(32), invocationId: 'lcim_inv_' + 'b'.repeat(32), invocationMarker: 'a'.repeat(24), pi, env: process.env });
  assert.equal(store.nonAuthoritative, false);
  assert.equal(store.realAuthIdentity().ino, realIdentity.ino, 'the store must retain the acquisition-time real store identity');
  assert.equal(store.realAuthSnapshot().bytesSha256.length, 64);
  // Simulate Pi rotation inside the isolated store (within-run continuity).
  const rotated = {
    type: 'oauth',
    access: 'reconciled-access-token-9876543210',
    refresh: 'reconciled-refresh-token-9876543210',
    expires: Date.now() + 9_000_000,
    accountId: 'fixture-account',
  };
  fs.writeFileSync(store.authFile, `${JSON.stringify({ [CODEX_OAUTH_PROVIDER]: rotated })}\n`);
  const refresh = store.refreshFromDisk();
  assert.equal(refresh.changedThisReload, true);
  assert.equal(store.entry().access, 'reconciled-access-token-9876543210');
  // READ-ONLY: the real store is byte-identical, and there is no
  // reconciliation API anymore (write-back removed by design).
  assert.equal(fs.readFileSync(realAuthFile, 'utf8'), realBefore, 'a refreshed token must NEVER be written back');
  const verification = store.verifyRealAuthSourceUnchanged();
  assert.equal(verification.ok, true);
  assert.equal(verification.changed, false);
  assert.equal(fs.existsSync(`${fs.realpathSync(realAuthFile)}.lock`), false, 'no lock surface is ever created on the real store');
  const solTransportModule = await import('../../src/controller/sol-transport.mjs');
  assert.equal(typeof solTransportModule.reconcileCodexSolStoreRefresh, 'undefined', 'the write-back reconciliation API must not exist');
  // Reacquisition in the same process returns the same retained logical
  // store: within-run continuity preserves original/current entries.
  const store2 = await acquireCodexSolStore({ runDir: run, runId: 'lcim_run_' + 'a'.repeat(32), invocationId: 'lcim_inv_' + 'c'.repeat(32), invocationMarker: 'c'.repeat(24), pi: store.pi, env: process.env });
  assert.equal(store2, store);
  assert.equal(store2.currentOpenAiCodexEntry().access, 'reconciled-access-token-9876543210');
  assert.equal(store2.originalOpenAiCodexEntry().access, 'fixture-access-token-value');
  await store.remove();
  assert.equal(fs.readFileSync(realAuthFile, 'utf8'), realBefore, 'cleanup must never touch the real store');
  await assert.rejects(
    acquireCodexSolStore({ runDir: run, runId: 'lcim_run_' + 'a'.repeat(32), invocationId: 'lcim_inv_' + 'd'.repeat(32), invocationMarker: 'd'.repeat(24), pi, env: process.env }),
    /already retired|state recreation/,
  );
});

// ---------------------------------------------------------------------------
// SOL-S11-003 — credential-leak defense (every representation)
// ---------------------------------------------------------------------------

test('scanForCredentialLeak detects raw token bytes in stdout/stderr and never leaks them', async (t) => {
  const { store, transport } = await transportFor(t);
  assert.equal(scanForCredentialLeak(transport, { stdout: 'plain review output', stderr: '' }), false);
  assert.equal(scanForCredentialLeak(transport, { stdout: `Bearer ${transport.credentials.access}`, stderr: '' }), true);
  assert.equal(scanForCredentialLeak(transport, { stdout: '', stderr: 'refresh fixture-refresh-token-value' }), true);
  await store.remove();
});

test('scanForCredentialLeak detects JSON-escaped (unicode-escaped) credentials', async (t) => {
  const { store, transport } = await transportFor(t, { tokenValue: 'access-token-ünïcode-αβγ', refreshValue: 'refresh-ünïcode-δ' });
  // JSON-style unicode escaping (\uXXXX per code unit) — the practical
  // escaped form a serializer emits for non-ASCII bytes.
  const jsonUnicodeEscape = (value) => value.replace(/[^\x20-\x7e]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
  const escaped = jsonUnicodeEscape('access-token-ünïcode-αβγ');
  assert.ok(escaped.includes('\\u'), 'the fixture token must be non-ASCII so escaping produces \\uXXXX');
  assert.equal(scanForCredentialLeak(transport, { stdout: `answer { "token": "${escaped}" }`, stderr: '' }), true, 'JSON-escaped form must be detected');
  await store.remove();
});

test('scanForCredentialLeak detects base64/hex/URL-encoded credentials', async (t) => {
  const { store, transport } = await transportFor(t);
  const bytes = Buffer.from(transport.credentials.access, 'utf8');
  const forms = [
    bytes.toString('base64'),
    bytes.toString('base64').replaceAll('+', '-').replaceAll('/', '_'),
    bytes.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''),
    bytes.toString('hex'),
    bytes.toString('hex').toUpperCase(),
    encodeURIComponent(transport.credentials.access),
  ];
  for (const form of forms) {
    assert.equal(scanForCredentialLeak(transport, { stdout: `output containing ${form} here`, stderr: '' }), true, `encoded form must be detected: ${form.slice(0, 24)}...`);
    assert.equal(scanForCredentialLeak(transport, { stdout: '', stderr: `err ${form}` }), true, `encoded form in stderr must be detected`);
  }
  await store.remove();
});

test('scanForCredentialLeak detects fragmented and short credentials conservatively', async (t) => {
  const { store, transport } = await transportFor(t, { tokenValue: 'fixture-access-token-value-0123456789' });
  // Punctuation-fragmented: the normalized token appears split in output.
  assert.equal(scanForCredentialLeak(transport, { stdout: 'fixture access token value 0123456789', stderr: '' }), true, 'whole normalized token must be detected');
  // Fragment-only detection requires multiple dispersed windows; one
  // predictable JWT-like prefix is intentionally insufficient.
  assert.equal(scanForCredentialLeak(transport, { stdout: '...fixtureacces...', stderr: '' }), false, 'one predictable fragment must not trigger a false positive');
  assert.equal(scanForCredentialLeak(transport, { stdout: 'fixtureacces --- tokenvalue0123 --- 456789', stderr: '' }), true, 'multiple dispersed fragments must be detected');
  // Short credential: full and normalized forms are still detected.
  const { store: shortStore, transport: shortTransport } = await transportFor(t, { tokenValue: 'abc12345x', refreshValue: 'def98765y' });
  assert.equal(scanForCredentialLeak(shortTransport, { stdout: 'prefix abc12345x suffix', stderr: '' }), true, 'short raw token must be detected');
  assert.equal(scanForCredentialLeak(shortTransport, { stdout: 'prefix abc 12345 x suffix', stderr: '' }), true, 'short normalized token must be detected');
  assert.equal(scanForCredentialLeak(shortTransport, { stdout: 'no secrets here at all', stderr: '' }), false);
  shortStore.remove();
  await store.remove();
});

test('scanForCredentialLeak detects refreshed/rotated credentials after reload', async (t) => {
  const { store, transport } = await transportFor(t);
  assert.equal(scanForCredentialLeak(transport, { stdout: 'rotated-access-token-9999', stderr: '' }), false, 'unknown future token is not yet sensitive');
  fs.writeFileSync(store.authFile, `${JSON.stringify({ [CODEX_OAUTH_PROVIDER]: { type: 'oauth', access: 'rotated-access-token-9999', refresh: 'rotated-refresh-token-9999', expires: Date.now() + 3_600_000 } })}\n`);
  assert.equal(store.refreshFromDisk().ok, true);
  assert.equal(scanForCredentialLeak(transport, { stdout: 'rotated-access-token-9999', stderr: '' }), true, 'refreshed token must be detected after reload');
  assert.equal(scanForCredentialLeak(transport, { stdout: '', stderr: 'rotated-refresh-token-9999' }), true);
  await store.remove();
});

test('scanForCredentialLeak detects credential material inside parsed canonical values', async (t) => {
  const { store, transport } = await transportFor(t);
  const canonical = collectCanonicalStringValues({ answer: { nested: ['ok', transport.credentials.access] } });
  assert.equal(scanForCredentialLeak(transport, { stdout: '', stderr: '', values: canonical }), true, 'parsed canonical values must be scanned');
  // Encoded form inside a canonical value.
  const encoded = collectCanonicalStringValues({ note: Buffer.from(transport.credentials.refresh, 'utf8').toString('hex') });
  assert.equal(scanForCredentialLeak(transport, { stdout: '', stderr: '', values: encoded }), true);
  assert.equal(scanForCredentialLeak(transport, { stdout: '', stderr: '', values: ['clean', 'values'] }), false);
  const splitAcrossFields = collectCanonicalStringValues({ [transport.credentials.access.slice(0, 8)]: transport.credentials.access.slice(8) });
  assert.equal(scanForCredentialLeak(transport, { stdout: '', stderr: '', values: splitAcrossFields }), true, 'parsed key/value concatenation must be scanned');
  await store.remove();
});

test('TRANSPORT_CREDENTIAL_LEAK is a static, byte-free identity', () => {
  assert.equal(typeof TRANSPORT_CREDENTIAL_LEAK, 'string');
  assert.ok(!TRANSPORT_CREDENTIAL_LEAK.includes('token'));
  assert.match(TRANSPORT_CREDENTIAL_LEAK, /^[A-Z_]+$/);
});

// ---------------------------------------------------------------------------
// SOL-S11-004 — transport acceptance gate
// ---------------------------------------------------------------------------

test('assessSolTransportResult requires every exact controller-side Pi proof', () => {
  const pass = {
    status: 0,
    error: null,
    timedOut: false,
    truncated: false,
    processCompleted: true,
    identityVerifiedBeforeSpawn: true,
    identityVerifiedAfterExit: true,
    processAbsenceVerified: true,
    quiescenceVerified: true,
    surfaceVerified: true,
    credentialScanPassed: true,
    cleanupVerified: true,
    reviewAuthority: 'AUTHORITATIVE',
  };
  assert.equal(assessSolTransportResult(pass).ok, true);
  const failureByField = {
    status: 'status', error: 'transport-error', timedOut: 'timeout', truncated: 'output-truncated',
    processCompleted: 'process-not-completed', identityVerifiedBeforeSpawn: 'identity-before-spawn-unverified',
    identityVerifiedAfterExit: 'entrypoint-identity-changed', processAbsenceVerified: 'process-absence-unverified',
    quiescenceVerified: 'quiescence-unverified', surfaceVerified: 'surface-unverified',
    credentialScanPassed: 'credential-scan-failed', cleanupVerified: 'cleanup-unverified', reviewAuthority: 'review-authority',
  };
  for (const [field, wrong] of [
    ['status', 1], ['error', 'boom'], ['timedOut', true], ['truncated', true], ['processCompleted', false],
    ['identityVerifiedBeforeSpawn', false], ['identityVerifiedAfterExit', false], ['processAbsenceVerified', false],
    ['quiescenceVerified', false], ['surfaceVerified', false], ['credentialScanPassed', false], ['cleanupVerified', false], ['reviewAuthority', 'TEST_SEAM_NON_AUTHORITATIVE'],
  ]) {
    const gate = assessSolTransportResult({ ...pass, [field]: wrong });
    assert.equal(gate.ok, false, `${field}=${String(wrong)} must fail the gate`);
    assert.ok(gate.failures.includes(failureByField[field]));
  }
  for (const field of Object.keys(pass)) {
    const omitted = { ...pass };
    delete omitted[field];
    assert.equal(assessSolTransportResult(omitted).ok, false, `omitted ${field} must fail closed`);
    // `error` is the one intentionally-null success proof; every other
    // null/undefined proof is fail-closed.
    if (field !== 'error') assert.equal(assessSolTransportResult({ ...pass, [field]: null }).ok, false, `null ${field} must fail closed`);
  }
  const testOnly = assessSolTransportResult({ ...pass, reviewAuthority: 'TEST_SEAM_NON_AUTHORITATIVE' }, { allowNonAuthoritativeTestSeam: true });
  assert.equal(testOnly.ok, true);
  assert.equal(testOnly.authoritative, false);
});

// ---------------------------------------------------------------------------
// SOL-S11-002 — test seams are capability-gated and non-authoritative
// ---------------------------------------------------------------------------

test('sol test-seam capability: minted capabilities verify; forged shapes are refused', () => {
  const capability = mintSolTestSeam();
  assert.equal(isSolTestSeam(capability), true);
  assert.equal(assertSolTestSeam(capability, 'test'), capability);
  assert.equal(isSolTestSeam(null), false);
  assert.equal(isSolTestSeam({ kind: 'other', token: 'x' }), false);
  assert.equal(isSolTestSeam({ kind: 'lcim.sol-test-seam', token: '0'.repeat(64) }), false, 'an un-minted token must never verify');
  assert.equal(isSolTestSeam({ kind: 'lcim.sol-test-seam', token: 'f'.repeat(64) }), false);
  assert.throws(() => assertSolTestSeam(null, 'solTransportOptions'), ConfigError);
  assert.throws(() => assertSolTestSeam({ kind: 'lcim.sol-test-seam', token: '0'.repeat(64) }, 'solCommand'), ConfigError);
});

test('invokeBoundedProvider refuses a caller-supplied runner without the opaque run authority', async (t) => {
  const { store, transport } = await transportFor(t);
  assert.equal(transport.nonAuthoritative, true);
  const runner = async () => ({ status: 0, stdout: '{}', stderr: '', processCompleted: true });
  await assert.rejects(
    invokeBoundedProvider({
      boundary: null,
      projectConfig: fixtureProjectConfig(),
      repoDir: os.tmpdir(),
      model: 'gpt-5.6-sol',
      reasoning: 'XHIGH',
      role: 'SOL',
      ask: fixtureAsk(),
      solTransport: transport,
      runner,
    }),
    (err) => err instanceof ProviderBrokerError && /controller-internal test seam/.test(err.message),
  );
  await store.remove();
});

test('invokeBoundedProvider accepts the runner only for a non-authoritative opaque test run', async (t) => {
  const { store, transport, authority } = await transportFor(t);
  assert.equal(transport.nonAuthoritative, true);
  const runner = async () => ({ status: 0, stdout: '{}', stderr: '', processCompleted: true, pid: 9, durationMs: 1 });
  const result = await invokeBoundedProvider({
    boundary: null,
    projectConfig: fixtureProjectConfig(),
    repoDir: os.tmpdir(),
    model: 'gpt-5.6-sol',
    reasoning: 'XHIGH',
    role: 'SOL',
    ask: fixtureAsk(),
    solTransport: transport,
    solTestAuthority: authority,
    runner,
  });
  assert.equal(result.status, 0);
  assert.equal(result.provider, 'pi');
  await store.remove();
});

test('invokeBoundedProvider refuses the codex route without a controller-prepared transport', async (t) => {
  const withStore = withOAuthStore(t);
  assert.ok(withStore);
  await assert.rejects(
    invokeBoundedProvider({
      boundary: null,
      projectConfig: fixtureProjectConfig(),
      repoDir: os.tmpdir(),
      model: 'gpt-5.6-sol',
      reasoning: 'XHIGH',
      role: 'SOL',
      ask: fixtureAsk(),
    }),
    (err) => err instanceof ProviderBrokerError && /controller-side Pi SOL transport/.test(err.message),
  );
});

test('invokeBoundedProvider refuses the codex route when a sol.command is configured (masquerade)', async (t) => {
  const { store, transport } = await transportFor(t);
  await assert.rejects(
    invokeBoundedProvider({
      boundary: null,
      projectConfig: {
        ...fixtureProjectConfig(),
        sol: { command: ['node', 'fixture-sol.cjs'], args: [], timeoutMs: 120_000 },
      },
      repoDir: os.tmpdir(),
      model: 'gpt-5.6-sol',
      reasoning: 'XHIGH',
      role: 'SOL',
      ask: fixtureAsk(),
      solTransport: transport,
    }),
    (err) => err instanceof ProviderBrokerError && /cannot substitute the gpt-5.6-sol codex transport/.test(err.message),
  );
  await store.remove();
});

test('invokeBoundedProvider refuses a classic SOL local command without seam authorization (SOL-S11-002)', async (t) => {
  await assert.rejects(
    invokeBoundedProvider({
      boundary: null,
      projectConfig: {
        ...fixtureProjectConfig(),
        sol: { command: ['node', 'fixture-sol.cjs'], args: [], timeoutMs: 120_000 },
        endpoints: { 'sol-xhigh': { baseUrl: 'local://fixture-sol', kind: 'local-command' } },
      },
      repoDir: os.tmpdir(),
      model: 'sol-xhigh',
      reasoning: 'XHIGH',
      role: 'SOL',
      ask: fixtureAsk(),
    }),
    (err) => err instanceof ProviderBrokerError && /cannot grant SOL decision authority/.test(err.message),
  );
});

test('invokeBoundedProvider runs the codex command through the controller-side transport runner', async (t) => {
  const { store, transport, authority } = await transportFor(t);
  let captured = null;
  const runner = async (transportArg, options) => {
    captured = { transport: transportArg, options };
    return {
      status: 0,
      signal: null,
      stdout: '{}',
      stderr: '',
      error: null,
      timedOut: false,
      processCompleted: true,
      pid: 42,
      durationMs: 10,
      identityVerifiedAfterExit: true,
    };
  };
  const result = await invokeBoundedProvider({
    boundary: null,
    projectConfig: fixtureProjectConfig(),
    repoDir: os.tmpdir(),
    model: 'gpt-5.6-sol',
    reasoning: 'XHIGH',
    role: 'SOL',
    ask: fixtureAsk(),
    solTransport: transport,
    solTestAuthority: authority,
    runner,
  });
  assert.equal(result.provider, 'pi');
  assert.equal(result.model, 'gpt-5.6-sol');
  assert.equal(result.role, 'SOL');
  assert.equal(captured.transport, transport);
  assert.equal(captured.options.command[0], process.execPath);
  assert.ok(path.isAbsolute(captured.options.command[1]));
  assert.ok(captured.options.args.includes(CODEX_OAUTH_PROVIDER));
  assert.ok(captured.options.args.includes('gpt-5.6-sol'));
  assert.ok(captured.options.args.includes('--no-tools'));
  assert.ok(captured.options.args.includes('--no-approve'));
  assert.equal(captured.options.timeoutMs, 120_000);
  // The compiled ask is the only prompt content (no generic prompt possible).
  assert.ok(captured.options.args.at(-1).includes('lcim_sol_ask_'));
  // Sanitized argv: the prompt argument is replaced by its digest.
  assert.ok(result.argvSanitized.some((arg) => arg.startsWith('sha256:')), 'the prompt argument must be replaced by its digest');
  assert.ok(!result.argvSanitized.includes('lcim_sol_ask_'), 'prompt content must never appear in sanitized argv');
  assert.match(result.promptDigest, /^[0-9a-f]{64}$/);
  await store.remove();
});

test('invokeBoundedProvider honors a configured sol timeoutMs for the codex route', async (t) => {
  const { store, transport, authority } = await transportFor(t);
  let captured = null;
  const runner = async (transportArg, options) => {
    captured = options;
    return { status: 0, stdout: '{}', stderr: '', processCompleted: true, pid: 1, durationMs: 1 };
  };
  await invokeBoundedProvider({
    boundary: null,
    projectConfig: { ...fixtureProjectConfig(), sol: { command: null, args: [], timeoutMs: 300_000 } },
    repoDir: os.tmpdir(),
    model: 'gpt-5.6-sol',
    reasoning: 'XHIGH',
    role: 'SOL',
    ask: fixtureAsk(),
    solTransport: transport,
    solTestAuthority: authority,
    runner,
  });
  assert.equal(captured.timeoutMs, 300_000);
  await store.remove();
});

test('invokeBoundedProvider retains bounded raw output for the controller-ordered credential gate (it does not persist it)', async (t) => {
  const { store, transport, authority } = await transportFor(t);
  const runner = async () => ({
    status: 0,
    stdout: `answer text ... ${transport.credentials.access} ... more`,
    stderr: '',
    processCompleted: true,
    pid: 7,
    durationMs: 5,
  });
  const result = await invokeBoundedProvider({
    boundary: null,
    projectConfig: fixtureProjectConfig(),
    repoDir: os.tmpdir(),
    model: 'gpt-5.6-sol',
    reasoning: 'XHIGH',
    role: 'SOL',
    ask: fixtureAsk(),
    solTransport: transport,
    solTestAuthority: authority,
    runner,
  });
  assert.equal(result.credentialLeak, undefined);
  assert.ok(result.stdout.includes(transport.credentials.access), 'only the controller post-exit gate may inspect this bounded in-memory output');
  assert.equal(result.stderr, '');
  assert.equal(result.error, undefined);
  // The provider adapter itself persists nothing; the orchestrator scanner
  // strips this output before any response/evidence path.
  await store.remove();
});

test('runSolPiProcess executes only the pinned Pi argv from controller-owned cwd with allowlisted env', async (t) => {
  const runnerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-probe-'));
  t.after(() => fs.rmSync(runnerDir, { recursive: true, force: true }));
  const outFile = path.join(runnerDir, 'out.json');
  const { store, transport } = await transportFor(t, {
    onRun: `require('node:fs').writeFileSync(${JSON.stringify(outFile)}, JSON.stringify({ cwd: process.cwd(), env: process.env, argv0: process.argv[1] }));`,
  });
  const spec = buildCodexSolCommand({ pi: transport.pi, systemPrompt: transport.systemPrompt, reasoning: 'XHIGH' });
  const result = await runSolPiProcess({ transport, command: spec.command, args: [...spec.args, 'prompt'], input: '', timeoutMs: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.identityVerifiedBeforeSpawn, true, 'pre-spawn identity must be positively verified');
  assert.equal(result.identityVerifiedAfterExit, true, 'post-exit identity must be re-verified');
  const observed = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert.equal(fs.realpathSync(observed.cwd), fs.realpathSync(transport.cwd), 'Pi must run from controller-owned cwd');
  assert.equal(observed.env.PI_CODING_AGENT_DIR, transport.agentDir);
  assert.equal(observed.env.HOME, transport.home);
  assert.ok(!('HTTP_PROXY' in observed.env));
  assert.ok(!('NODE_OPTIONS' in observed.env));
  assert.throws(() => runSolPiProcess({ transport, command: [process.execPath, '/tmp/attacker.cjs'], args: [], input: '' }), ConfigError);
  transport.confirmProcessAbsence();
  await transport.remove();
  await store.remove();
});

test('runSolPiProcess fails closed on output truncation and reports it', async (t) => {
  const { store, transport } = await transportFor(t, {
    onRun: `process.stdout.write(Buffer.alloc(64 * 1024 * 1024, 0x61).toString());`,
  });
  const spec = buildCodexSolCommand({ pi: transport.pi, systemPrompt: transport.systemPrompt, reasoning: 'XHIGH' });
  const result = await runSolPiProcess({
    transport,
    command: spec.command,
    args: [...spec.args, 'prompt'],
    input: '',
    timeoutMs: 30_000,
  });
  assert.equal(result.truncated, true);
  assert.ok(result.error !== null, 'truncation must set a transport error');
  assert.equal(assessSolTransportResult(result).ok, false, 'truncated output must never pass the acceptance gate');
  transport.confirmProcessAbsence();
  await transport.remove();
  await store.remove();
});

test('invokeBoundedProvider refuses a generic prompt on the SOL path (compiled ask only)', async (t) => {
  const { store, transport } = await transportFor(t);
  await assert.rejects(
    invokeBoundedProvider({
      boundary: null,
      projectConfig: fixtureProjectConfig(),
      repoDir: os.tmpdir(),
      model: 'gpt-5.6-sol',
      reasoning: 'XHIGH',
      role: 'SOL',
      prompt: 'review this repository',
      solTransport: transport,
    }),
    ConfigError,
  );
  await store.remove();
});

// ---------------------------------------------------------------------------
// SOL-S11-005 — observed (never asserted) post-exit surface evidence
// ---------------------------------------------------------------------------

test('inspectSolTransportSurface observes the real layout and identity; unexpected authority-bearing files fail closed', async (t) => {
  const { store, transport } = await transportFor(t);
  const clean = inspectSolTransportSurface({ store, pi: store.pi });
  assert.equal(clean.ok, true);
  assert.equal(clean.observed.authJsonOnly, true);
  assert.equal(clean.observed.authJsonMode, 0o600);
  assert.equal(clean.identityVerified, true);
  // A Pi lock artifact (auth.json.lock directory) is the ONLY allowed extra.
  fs.mkdirSync(path.join(store.agentDir, 'auth.json.lock'), { recursive: true });
  const withLock = inspectSolTransportSurface({ store, pi: store.pi });
  assert.equal(withLock.ok, true, 'pi lock artifacts are expected');
  // An unexpected authority-bearing file fails closed.
  fs.writeFileSync(path.join(store.agentDir, 'models.json'), '{}');
  const dirty = inspectSolTransportSurface({ store, pi: store.pi });
  assert.equal(dirty.ok, false);
  assert.deepEqual(dirty.errors, ['unexpected-files']);
  assert.equal(dirty.observed.modelsJson, true);
  assert.equal(dirty.observed.authJsonOnly, false);
  assert.ok(dirty.observed.unexpectedFiles.some((entry) => entry.path === 'models.json'));
  // A mode change fails closed.
  fs.rmSync(path.join(store.agentDir, 'models.json'));
  fs.chmodSync(store.authFile, 0o644);
  const badMode = inspectSolTransportSurface({ store, pi: store.pi });
  assert.equal(badMode.ok, false);
  assert.ok(badMode.errors.includes('auth-json-mode'));
  assert.ok(badMode.errors.includes('auth-provider-set'));
  await store.remove();
});

test('inspectSolTransportSurface fails closed when the pinned entrypoint identity changed', async (t) => {
  const { store, pi } = await transportFor(t);
  fs.writeFileSync(pi.cli, '#!/usr/bin/env node\nconsole.log("substituted");\n', { mode: 0o755 });
  const result = inspectSolTransportSurface({ store, pi: store.pi });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('entrypoint-identity'));
  await store.remove();
});

test('sanitizeArgvForEvidence records the prompt digest, never prompt content', () => {
  const { argv, promptDigest } = sanitizeArgvForEvidence(['node', '/pi/cli.js', '--print', 'the full prompt text'], 'the full prompt text');
  assert.deepEqual(argv, ['node', '/pi/cli.js', '--print', `sha256:${promptDigest}`]);
  assert.match(promptDigest, /^[0-9a-f]{64}$/);
  assert.ok(!argv.join(' ').includes('prompt text'));
});

// ---------------------------------------------------------------------------
// SOL-S11-006 — crash-resilient cleanup
// ---------------------------------------------------------------------------

test('cleanup marks removal ONLY after observed success; injected failure fails closed and retry works', async (t) => {
  const { store } = await transportFor(t);
  const parent = path.dirname(store.storeDir);
  const originalMode = fs.statSync(parent).mode & 0o777;
  try {
    // Inject a removal failure: the parent becomes non-writable.
    fs.chmodSync(parent, 0o500);
    await assert.rejects(() => store.remove(), (err) => err.code === 'EACCES' || err.code === 'EPERM');
    assert.equal(store.isRemoved(), false, 'removal must NOT be marked when it was not observed to succeed');
    assert.equal(fs.existsSync(store.agentDir), true, 'the isolated surface must still exist after the failed removal');
  } finally {
    fs.chmodSync(parent, originalMode);
  }
  // After the failure is fixed, removal succeeds and is marked.
  await store.remove();
  assert.equal(store.isRemoved(), true);
  assert.equal(fs.existsSync(store.agentDir), false);
});

test('acquireCodexSolStore fails closed when the store exists but lost its controller marker', async (t) => {
  const { store, runDir } = await transportFor(t);
  // The durable store marker lives OUTSIDE the credential subtree
  // (markers/<runId>.json); destroying it makes the store unbound.
  fs.rmSync(path.join(store.runDir, 'controller', 'sol-transport', 'markers', `${store.runId}.json`));
  const { pi, authority } = resolveFixturePi(t);
  await assert.rejects(
    acquireCodexSolStore({ runDir, runId: 'lcim_run_' + 'a'.repeat(32), invocationId: 'lcim_inv_' + 'b'.repeat(32), invocationMarker: 'a'.repeat(24), pi, env: process.env, testAuthority: authority }),
    (err) => err.code === 'SOL_TRANSPORT_SURFACE_VIOLATION' && /marker/.test(err.message),
  );
  // The marker was deliberately destroyed, so normal cleanup refuses it;
  // remove the test-only directory directly after proving fail-closed reuse.
  fs.rmSync(store.storeDir, { recursive: true, force: true });
});

test('computeFileIdentity is a stable pin and rejects non-files', (t) => {
  const file = writeFixturePi(t);
  const first = computeFileIdentity(file);
  const second = computeFileIdentity(file);
  assert.deepEqual(first.stat, second.stat);
  assert.equal(first.sha256, second.sha256);
  assert.equal(first.realpath, fs.realpathSync(file));
  assert.throws(() => computeFileIdentity(path.join(file, 'not-a-file')), ConfigError);
  assert.throws(() => computeFileIdentity('relative'), ConfigError);
});

test('the transport schema version is 1.4.0 (durable identity-bound marker/evidence shape)', () => {
  assert.equal(SOL_TRANSPORT_SCHEMA_VERSION, '1.4.0');
});
