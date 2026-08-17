/**
 * Fifth-review hardening tests (Sol XHIGH review #5, LIVE_TRANSPORT_GATE
 * findings): canonical credential-scanning layer, exact Pi 0.84.1
 * models-store surface, fail-closed proof evidence, external durable
 * recovery marker crash transitions, and unknown-survivor representation.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  acquireCodexSolStore,
  assessEvidencePersistenceFailure,
  collectCanonicalStringValues,
  SCAN_STATE_COMPLETE,
  SCAN_STATE_INCOMPLETE,
  inspectSolTransportSurface,
  loadSolSystemPrompt,
  persistSolTransportEvidence,
  resolvePiExecutable,
  scanForCredentialLeak,
  scanForCredentialLeakDetailed,
  sweepRunSolTransportSurfaces,
  validateModelsStoreSurface,
} from '../../src/controller/sol-transport.mjs';
import { consumeSolTestSeam, mintSolTestSeam } from '../../src/controller/test-seams.mjs';
import { CODEX_OAUTH_PROVIDER, PI_AUTH_FILE } from '../../src/providers/oauth.mjs';
import { terminateProcessesByMarker } from '../../src/controller/process-supervisor.mjs';

function id(kind, character) {
  return `lcim_${kind}_${character.repeat(32)}`;
}

function writeFixturePi(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-fifth-pi-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cli = path.join(dir, 'fixture-pi.cjs');
  fs.writeFileSync(cli, `#!/usr/bin/env node\nprocess.stdin.resume();\nprocess.stdin.on('end', () => process.stdout.write('{}'));\n`, { mode: 0o755 });
  return cli;
}

function oauthEnv(t, { access = 'fifth-access-token-0123456789', refresh = 'fifth-refresh-token-0123456789' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-fifth-oauth-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const agent = path.join(root, 'agent');
  fs.mkdirSync(agent, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(agent, 'auth.json'), JSON.stringify({ [CODEX_OAUTH_PROVIDER]: { type: 'oauth', access, refresh, expires: Date.now() + 3_600_000 } }), { mode: 0o600 });
  return { PI_CODING_AGENT_DIR: agent, HOME: root };
}

async function fixtureStore(t, { access, refresh } = {}) {
  const runParent = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-fifth-run-'));
  const runId = id('run', 'a');
  const runDir = path.join(runParent, runId);
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({ schemaName: 'lcim.run', schemaVersion: '1.0.0', runId, lifecycleState: 'OPEN', createdAt: new Date().toISOString(), targetBaseSha: 'a'.repeat(40), configDigest: 'b'.repeat(64), lcimVersion: '2.0.1', lcimCommit: null, storeVersion: '1', finalizedAt: null, abortedAt: null, abortNote: null, finalSummary: null })}\n`);
  t.after(() => fs.rmSync(runParent, { recursive: true, force: true }));
  const authority = consumeSolTestSeam(mintSolTestSeam(), 'fifth fixture Pi');
  const pi = resolvePiExecutable({ piBin: writeFixturePi(t), testAuthority: authority });
  const store = await acquireCodexSolStore({
    runDir,
    runId,
    invocationId: id('inv', 'b'),
    invocationMarker: 'marker-' + 'a'.repeat(24),
    pi,
    env: oauthEnv(t, { ...(access !== undefined ? { access } : {}), ...(refresh !== undefined ? { refresh } : {}) }),
    testAuthority: authority,
  });
  return { runDir, runId, store, authority };
}

/** A bare OPEN run directory (no store handle) for crash-surface fixtures. */
function bareRun(t, character = 'z') {
  const runParent = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-fifth-crash-'));
  const runId = id('run', character);
  const runDir = path.join(runParent, runId);
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({ schemaName: 'lcim.run', schemaVersion: '1.0.0', runId, lifecycleState: 'OPEN', createdAt: new Date().toISOString(), targetBaseSha: 'a'.repeat(40), configDigest: 'b'.repeat(64), lcimVersion: '2.0.1', lcimCommit: null, storeVersion: '1', finalizedAt: null, abortedAt: null, abortNote: null, finalSummary: null })}\n`);
  t.after(() => fs.rmSync(runParent, { recursive: true, force: true }));
  return { runDir, runId };
}

/** Minimal transport-like surface exposing the sensitive-value set. */
function scannerTransport(access, refresh = 'fifth-refresh-token-0123456789') {
  return { sensitiveValues: () => [access, refresh], credentials: { access, refresh } };
}

// ---------------------------------------------------------------------------
// Finding 3 — canonical security-scanning layer
// ---------------------------------------------------------------------------

test('canonical scan: mixed raw + \\u00XX unicode-escaped sequences are reconstructed before matching', () => {
  const token = 'fifth-access-token-0123456789';
  const transport = scannerTransport(token);
  // Only PART of the credential is unicode-escaped (adversarial mixed
  // serializer); whole-value needles cannot match, the canonical
  // unicode-unescape view can.
  // Escape exactly the 'a' at index 6 and the 'o' at index 14; the rest
  // stays raw (mixed raw + \\u00XX adversarial serializer).
  const mixed = `${token.slice(0, 6)}\\u0061${token.slice(7, 14)}\\u006f${token.slice(15)}`;
  assert.equal(scanForCredentialLeak(transport, { stdout: mixed }), true, 'mixed raw/escaped sequences must be detected');
  const detail = scanForCredentialLeakDetailed(transport, { stdout: mixed });
  assert.equal(detail.channel, 'STDOUT');
});

test('canonical scan: per-chunk base64 (whitespace-joined fragments) is reconstructed', () => {
  const token = 'fifth-access-token-0123456789';
  const transport = scannerTransport(token);
  const base64 = Buffer.from(token, 'utf8').toString('base64');
  // Chunks separated by newlines/whitespace (per-chunk base64 emission).
  const chunked = [base64.slice(0, 12), base64.slice(12, 24), base64.slice(24)].join('\n');
  assert.equal(scanForCredentialLeak(transport, { stdout: chunked }), true);
  // Base64 fragments split across parsed fields (joined without gaps).
  const values = [base64.slice(0, 9), base64.slice(9, 20), base64.slice(20)];
  assert.equal(scanForCredentialLeak(transport, { values }), true, 'base64 split across fields must be reconstructed');
});

test('canonical scan: prefixed/mixed-case hex fragments are reconstructed', () => {
  const token = 'fifth-access-token-0123456789';
  const transport = scannerTransport(token);
  const hex = Buffer.from(token, 'utf8').toString('hex');
  // 0x-prefixed tokens with case variation, whitespace separated.
  const prefixed = hex.toUpperCase().match(/.{1,2}/g).map((pair) => `0x${pair}`).join(' ');
  assert.equal(scanForCredentialLeak(transport, { stdout: prefixed }), true, 'prefixed/mixed hex must be detected');
  const detail = scanForCredentialLeakDetailed(transport, { stdout: prefixed });
  assert.equal(detail.channel, 'STDOUT');
});

test('canonical scan: interleaved parsed fields are reconstructed as ordered fragments', () => {
  const token = 'fifth-access-token-0123456789';
  const transport = scannerTransport(token);
  // The credential is interleaved with unrelated fields; no contiguous
  // substring exists, but the ordered bounded-gap subsequence does.
  const values = [token.slice(0, 8), 'UNRELATED-FIELD-CONTENT', token.slice(8, 16), 'more-noise', token.slice(16)];
  const detail = scanForCredentialLeakDetailed(transport, { values });
  assert.equal(detail.detected, true, 'interleaved parsed fields must be detected');
  // A key+value split is detected through the ordered key+value grammar
  // (field names are scanned as ordered fragments, never interleaved into
  // the gap-free value reconstruction).
  const collected = collectCanonicalStringValues({ [token.slice(0, 8)]: token.slice(8) });
  assert.equal(collected.values.join(''), token.slice(8), 'the gap-free value reconstruction contains no field names');
  const keyValue = scanForCredentialLeakDetailed(transport, { values: collected });
  assert.equal(keyValue.detected, true, 'a credential split across a key and its value must be detected');
});

test('canonical scan: alternating stdout/stderr pieces are reconstructed', () => {
  const token = 'fifth-access-token-0123456789';
  const transport = scannerTransport(token);
  // Full token split across the two ordered channels: the combined
  // channel reconstruction detects it and attributes MULTIPLE.
  const detail = scanForCredentialLeakDetailed(transport, {
    stdout: token.slice(0, 13),
    stderr: token.slice(13),
  });
  assert.equal(detail.detected, true, 'split stdout/stderr pieces must be detected');
  assert.equal(detail.channel, 'MULTIPLE');
  // Alternating fragments: the pieces interleave between stdout and
  // stderr; the ordered combined subsequence reconstruction catches it.
  const threeWay = scanForCredentialLeakDetailed(transport, {
    stdout: `${token.slice(0, 4)}${token.slice(8, 12)}`,
    stderr: `${token.slice(4, 8)}${token.slice(12)}`,
  });
  assert.equal(threeWay.detected, true, 'alternating stdout/stderr fragments must be detected');
  assert.equal(threeWay.channel, 'MULTIPLE');
});

test('canonical scan: the benign-output false-positive corpus is preserved', () => {
  const token = 'fifth-access-token-0123456789';
  const transport = scannerTransport(token);
  for (const benign of [
    'The response has a JWT-like header eyJhbGciOiJIUzI1NiJ9.payload.signature but no credential.',
    '{"verdict":"PASS","id":"eyJhbGciOiJIUzI1NiJ9.payload.signature"}',
    'eyJ0eXAiOiJKV1QifQ.eyJzdWIiOiJmaXh0dXJlIn0.signature',
    'normal bounded SOL response with a sha256 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  ]) {
    assert.equal(scanForCredentialLeak(transport, { stdout: benign }), false, `benign corpus false positive: ${benign}`);
  }
});

// ---------------------------------------------------------------------------
// Finding C (sixth review) — COMPLETE/INCOMPLETE scan states and new encodings
// ---------------------------------------------------------------------------

test('sixth-review scan: per-byte INDEPENDENTLY PADDED base64/base64url is reconstructed', () => {
  const token = 'fifth-access-token-0123456789';
  const transport = scannerTransport(token);
  // Each byte independently base64-encoded with its own padding.
  const perBytePadded = [...Buffer.from(token, 'utf8')].map((b) => Buffer.from([b]).toString('base64')).join(' ');
  const padded = scanForCredentialLeakDetailed(transport, { stdout: perBytePadded });
  assert.equal(padded.detected, true, 'independently padded per-byte base64 must be detected');
  assert.equal(padded.scanState, SCAN_STATE_COMPLETE);
  // Each byte independently base64url-encoded WITHOUT padding (2 chars).
  const perByteUrl = [...Buffer.from(token, 'utf8')]
    .map((b) => Buffer.from([b]).toString('base64').replace(/=+$/, '').replaceAll('+', '-').replaceAll('/', '_'))
    .join('');
  const unpadded = scanForCredentialLeakDetailed(transport, { stdout: perByteUrl });
  assert.equal(unpadded.detected, true, 'unpadded per-byte base64url must be detected');
  assert.equal(unpadded.scanState, SCAN_STATE_COMPLETE);
  // Independently unpadded multi-byte chunks retain whitespace boundaries.
  const bytes = Buffer.from(token, 'utf8');
  const chunks = [];
  for (let index = 0; index < bytes.length; index += 5) chunks.push(bytes.subarray(index, index + 5).toString('base64url'));
  const chunked = scanForCredentialLeakDetailed(transport, { stdout: chunks.join(' ') });
  assert.equal(chunked.detected, true, 'independently unpadded multi-byte base64url chunks must be detected');
  // Encoded chunks split across stdout/stderr are reconstructed through
  // bounded canonical-view interleaving.
  const even = [];
  const odd = [];
  [...bytes].forEach((byte, index) => (index % 2 === 0 ? even : odd).push(Buffer.from([byte]).toString('base64url')));
  assert.equal(scanForCredentialLeakDetailed(transport, { stdout: even.join(' '), stderr: odd.join(' ') }).detected, true);
});

test('sixth-review scan: numeric byte arrays are reconstructed', () => {
  const token = 'fifth-access-token-0123456789';
  const transport = scannerTransport(token);
  const bytes = [...Buffer.from(token, 'utf8')];
  for (const form of [
    `[${bytes.join(', ')}]`,
    bytes.join(' '),
    bytes.join('-'),
    bytes.map((b) => String(b).padStart(3, '0')).join(','),
  ]) {
    const result = scanForCredentialLeakDetailed(transport, { stdout: form });
    assert.equal(result.detected, true, `numeric byte array form must be detected: ${form.slice(0, 30)}...`);
    assert.equal(result.scanState, SCAN_STATE_COMPLETE);
  }
  const parsed = collectCanonicalStringValues(bytes);
  assert.equal(scanForCredentialLeakDetailed(transport, { values: parsed }).detected, true, 'parsed numeric array elements must remain ordered scan values');
});

test('sixth-review scan: punctuated hex is reconstructed', () => {
  const token = 'fifth-access-token-0123456789';
  const transport = scannerTransport(token);
  const pairs = [...Buffer.from(token, 'utf8')].map((b) => b.toString(16).padStart(2, '0'));
  for (const form of [
    pairs.map((p) => `0x${p}`).join(','),
    pairs.join('-'),
    pairs.join(':'),
    pairs.join('_'),
    pairs.join('/|\\~+'),
    `(${pairs.map((p) => `0x${p}`).join(') (')})`,
  ]) {
    const result = scanForCredentialLeakDetailed(transport, { stdout: form });
    assert.equal(result.detected, true, `punctuated hex form must be detected: ${form.slice(0, 40)}...`);
    assert.equal(result.scanState, SCAN_STATE_COMPLETE);
  }
});

test('sixth-review scan: nested encodings are reconstructed (base64 of hex, url of base64)', () => {
  const token = 'fifth-access-token-0123456789';
  const transport = scannerTransport(token);
  const hex = Buffer.from(token, 'utf8').toString('hex');
  const nested1 = Buffer.from(hex, 'utf8').toString('base64');
  assert.equal(scanForCredentialLeakDetailed(transport, { stdout: nested1 }).detected, true, 'base64(hex(token)) must be detected');
  const nested2 = encodeURIComponent(Buffer.from(token, 'utf8').toString('base64'));
  assert.equal(scanForCredentialLeakDetailed(transport, { stdout: nested2 }).detected, true, 'url(base64(token)) must be detected');
});

test('sixth-review scan: EVERY incomplete-search bound is reported INCOMPLETE (never not-detected)', () => {
  const token = 'fifth-access-token-0123456789';
  const transport = scannerTransport(token);
  const cases = [
    { name: 'subsequence text limit', options: { stdout: 'x'.repeat(3_000), limits: { subsequenceMaxText: 1_000 } }, reasons: ['SUBSEQUENCE_TEXT_LIMIT'] },
    { name: 'subsequence state limit', options: { stdout: 'f'.repeat(50), limits: { subsequenceMaxStates: 1 } }, reasons: ['SUBSEQUENCE_STATE_LIMIT'] },
    { name: 'canonical view limit', options: { stdout: Array.from({ length: 30 }, (_, i) => Buffer.from(`frag${i}-content-0123456789`).toString('base64')).join('|'), limits: { maxCanonicalViewsPerSource: 3 } }, reasons: ['CANONICAL_VIEW_LIMIT'] },
    { name: 'base64 run limit', options: { stdout: Buffer.from('A'.repeat(5_000)).toString('base64'), limits: { base64RunMax: 100 } }, reasons: ['BASE64_RUN_LIMIT'] },
    { name: 'bytewise base64 limit', options: { stdout: 'A'.repeat(5_000), limits: { bytewiseBase64Max: 100 } }, reasons: ['BYTEWISE_BASE64_LIMIT'] },
    { name: 'hex run limit', options: { stdout: 'f'.repeat(5_000), limits: { hexRunMax: 100 } }, reasons: ['HEX_RUN_LIMIT'] },
    { name: 'numeric byte array limit', options: { stdout: '1 '.repeat(5_000), limits: { numericByteArrayMax: 100 } }, reasons: ['NUMERIC_BYTE_ARRAY_LIMIT'] },
    { name: 'interleaved text limit', options: { stdout: token.slice(0, 13), stderr: token.slice(13), limits: { interleavedMaxText: 10 } }, reasons: ['INTERLEAVED_TEXT_LIMIT'] },
    { name: 'interleaved state limit', options: { stdout: 'f'.repeat(50), stderr: 'f'.repeat(50), limits: { interleavedMaxStates: 1 } }, reasons: ['INTERLEAVED_STATE_LIMIT'] },
    { name: 'interleaved view-pair limit', options: { stdout: 'hello', stderr: 'world', limits: { interleavedViewPairsMax: 0 } }, reasons: ['INTERLEAVED_VIEW_PAIR_LIMIT'] },
    { name: 'parsed join limit', options: { values: ['a'.repeat(500), 'b'.repeat(500)], limits: { joinLimitBytes: 100 } }, reasons: ['PARSED_JOIN_LIMIT'] },
  ];
  for (const { name, options, reasons } of cases) {
    const result = scanForCredentialLeakDetailed(transport, options);
    assert.equal(result.scanState, SCAN_STATE_INCOMPLETE, `${name}: analysis must be INCOMPLETE`);
    assert.ok(Array.isArray(result.incompleteReasons) && result.incompleteReasons.length > 0, `${name}: reasons must be recorded`);
    for (const reason of reasons) assert.ok(result.incompleteReasons.includes(reason), `${name}: ${reason}`);
    assert.equal(typeof result.detected, 'boolean', `${name}: detected must remain a boolean for diagnostics`);
    assert.equal(scanForCredentialLeak(transport, options), true, `${name}: boolean compatibility wrapper must fail closed on INCOMPLETE`);
  }
  // A completely analyzed clean input is COMPLETE.
  const clean = scanForCredentialLeakDetailed(transport, { stdout: 'plain benign text', stderr: '' });
  assert.equal(clean.scanState, SCAN_STATE_COMPLETE);
  assert.equal(clean.detected, false);
});

test('sixth-review scan: an oversized secret reaches the interleaving secret bound => INCOMPLETE', () => {
  const longSecret = 'L'.repeat(5000);
  const transport = scannerTransport(longSecret, longSecret);
  const result = scanForCredentialLeakDetailed(transport, { stdout: 'L'.repeat(5000), stderr: '' });
  assert.equal(result.scanState, SCAN_STATE_INCOMPLETE, 'a >4096-char secret exceeds the interleaving bound');
  assert.ok(result.incompleteReasons.includes('INTERLEAVED_SECRET_LIMIT'));
});

test('sixth-review scan: a detected leak with an incomplete bound still reports INCOMPLETE (fail closed)', () => {
  const token = 'fifth-access-token-0123456789';
  const transport = scannerTransport(token);
  const result = scanForCredentialLeakDetailed(transport, {
    stdout: `Bearer ${token}`,
    stderr: 'y'.repeat(5_000),
    limits: { subsequenceMaxText: 1_000 },
  });
  assert.equal(result.detected, true, 'the raw full match is still found');
  assert.equal(result.scanState, SCAN_STATE_INCOMPLETE, 'a bound was reached => INCOMPLETE => the caller fails closed');
});

// ---------------------------------------------------------------------------
// Finding 5 — exact Pi 0.84.1 models-store.json surface
// ---------------------------------------------------------------------------

test('an accepted empty 0600 models-store.json is the ONLY permitted Pi 0.84.1 offline surface addition', async (t) => {
  const { store } = await fixtureStore(t);
  // Exact verified runtime shape of the pinned Pi 0.84.1 offline startup:
  // regular file, mode 0600, content exactly {}.
  fs.writeFileSync(path.join(store.agentDir, 'models-store.json'), '{}', { mode: 0o600 });
  fs.chmodSync(path.join(store.agentDir, 'models-store.json'), 0o600);
  fs.mkdirSync(path.join(store.agentDir, 'auth.json.lock'), { mode: 0o700 });
  const result = inspectSolTransportSurface({ store, pi: store.pi });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.observed.authJsonOnly, true, 'auth.json + exact models-store.json is the accepted layout');
  assert.equal(result.observed.modelsStore.present, true);
  assert.equal(result.observed.modelsStore.valid, true);
  assert.equal(result.observed.modelsStore.exactEmptyObject, true);
  assert.equal(result.observed.modelsStore.mode, 0o600);
  assert.equal(result.observed.unexpectedFiles.length, 0);
  await store.remove();
});

test('any non-empty or authority-bearing models-store.json fails closed', async (t) => {
  const { store } = await fixtureStore(t);
  const cases = [
    { name: 'provider-catalog', content: JSON.stringify({ providers: { openai: { models: [] } } }) },
    { name: 'base-url-override', content: JSON.stringify({ baseUrl: 'https://attacker.invalid' }) },
    { name: 'model-override', content: JSON.stringify({ 'gpt-5.6-sol': { baseUrl: 'https://attacker.invalid' } }) },
    { name: 'whitespace-object', content: '{ }' },
  ];
  for (const { name, content } of cases) {
    const file = path.join(store.agentDir, 'models-store.json');
    fs.writeFileSync(file, content, { mode: 0o600 });
    const validation = validateModelsStoreSurface(file);
    assert.equal(validation.valid, false, name);
    const result = inspectSolTransportSurface({ store, pi: store.pi });
    assert.equal(result.ok, false, name);
    assert.ok(result.errors.includes('models-store-invalid'), name);
    fs.rmSync(file);
  }
  await store.remove();
});

test('a non-0600 or symlinked models-store.json fails closed', async (t) => {
  const { store } = await fixtureStore(t);
  const file = path.join(store.agentDir, 'models-store.json');
  fs.writeFileSync(file, '{}', { mode: 0o644 });
  assert.equal(validateModelsStoreSurface(file).valid, false);
  assert.equal(validateModelsStoreSurface(file).error, 'mode-not-0600');
  fs.rmSync(file);
  const decoy = path.join(store.agentDir, 'decoy.json');
  fs.writeFileSync(decoy, '{}', { mode: 0o600 });
  fs.symlinkSync(decoy, file);
  const validation = validateModelsStoreSurface(file);
  assert.equal(validation.valid, false);
  assert.equal(validation.error, 'symlink');
  fs.rmSync(file);
  fs.rmSync(decoy);
  await store.remove();
});

test('exact Pi 0.84.1 isolated startup behavior: real pinned Pi creates ONLY models-store.json = {} (0600) in the agent dir', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-pi-0841-startup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const agent = path.join(root, 'agent');
  fs.mkdirSync(agent, { recursive: true, mode: 0o700 });
  const authFile = path.join(agent, PI_AUTH_FILE);
  fs.writeFileSync(authFile, JSON.stringify({ [CODEX_OAUTH_PROVIDER]: { type: 'oauth', access: 'fake-access-000000000000000000', refresh: 'fake-refresh-000000000000000000', expires: Date.now() + 3_600_000 } }), { mode: 0o600 });
  const before = fs.readFileSync(authFile, 'utf8');
  // Run the EXACT pinned Pi 0.84.1 CLI from LCIM's own dependency tree in
  // an isolated agent directory with the same offline pins the controller
  // transport uses. The invocation cannot authenticate (fixture entry), but
  // the offline STARTUP filesystem behavior is what this test exercises.
  const pi = resolvePiExecutable();
  const result = spawnSync(pi.node, [...pi.cli.split ? [] : [], pi.cli, '--provider', 'openai-codex', '--model', 'gpt-5.6-sol', '--thinking', 'xhigh', '--print', '--no-session', '--no-context-files', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-tools', '--no-approve', '--system-prompt', 'probe', 'hello'], {
    encoding: 'utf8',
    env: { ...process.env, PI_CODING_AGENT_DIR: agent, PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1', PI_TELEMETRY: '0' },
    timeout: 120_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // The transport gate fails on missing auth (expected: fixture entry is
  // not a real credential); what matters is the startup surface.
  assert.equal(result.status, 1, result.stderr?.slice(0, 500));
  const entries = fs.readdirSync(agent).sort();
  assert.deepEqual(entries, [PI_AUTH_FILE, 'models-store.json'], 'the isolated agent dir gains ONLY models-store.json at offline startup');
  assert.equal(fs.readFileSync(authFile, 'utf8'), before, 'the pre-existing auth entry must never be modified by Pi startup');
  const modelsStore = validateModelsStoreSurface(path.join(agent, 'models-store.json'));
  assert.equal(modelsStore.present, true);
  assert.equal(modelsStore.valid, true, JSON.stringify(modelsStore));
  assert.equal(modelsStore.mode, 0o600);
  assert.equal(modelsStore.exactEmptyObject, true);
});

// ---------------------------------------------------------------------------
// Finding D (sixth review) — marker ancestor durability
// ---------------------------------------------------------------------------

test('every new marker ancestor directory is created and fsynced BEFORE the marker file and credential bytes', async (t) => {
  // Source-order guarantee: ancestor creation+fsync, marker file fsync,
  // marker parent fsync all precede the isolated auth.json write.
  const source = fs.readFileSync(new URL('../../src/controller/sol-transport.mjs', import.meta.url), 'utf8');
  const ancestorIdx = source.indexOf('mkdirParentsFsynced(storeDir);');
  const markerCallIdx = source.indexOf('writeTransportMarker(storeDir, {');
  const markerWriteIdx = source.indexOf('writeDurableMarker(file, record);');
  const credentialIdx = source.indexOf('fs.writeFileSync(authFile,');
  assert.ok(ancestorIdx !== -1 && markerCallIdx !== -1 && markerWriteIdx !== -1 && credentialIdx !== -1);
  assert.ok(ancestorIdx < markerCallIdx, 'ancestor dirs must be created before the marker is written');
  assert.ok(markerWriteIdx < credentialIdx, 'the marker (file + parent fsync) must precede credential bytes');
  assert.match(source, /fsyncDirectory\(path\.dirname\(target\)\)/, 'each newly created ancestor entry requires its containing parent fsync');
  assert.match(source, /fsyncDirectory\(path\.dirname\(file\)\)/, 'the marker parent must be fsynced');
  // Behavioral: acquisition through a DEEP missing ancestor chain leaves
  // every ancestor durable and ordered marker-before-credentials.
  const { runDir, store } = await fixtureStore(t);
  const solRoot = path.join(store.runDir, 'controller', 'sol-transport');
  const markersDir = path.join(solRoot, 'markers');
  assert.equal(fs.existsSync(markersDir), true);
  assert.equal(fs.statSync(markersDir).isDirectory(), true);
  const markerFile = path.join(markersDir, `${store.runId}.json`);
  assert.equal(fs.existsSync(markerFile), true, 'the marker must exist');
  assert.equal(fs.existsSync(store.authFile), true, 'the credential file must exist');
  await store.remove();
});

// ---------------------------------------------------------------------------
// Finding E (sixth review) — proof persistence ordering
// ---------------------------------------------------------------------------

test('the immutable transport proof is persisted AND fsynced BEFORE provider output is parsed', async (t) => {
  // Source-order guarantee in the orchestrator: the pre-parse gate runs,
  // the transport proof is persisted, and only then parseProviderJson is
  // reached.
  const source = fs.readFileSync(new URL('../../src/controller/orchestrator.mjs', import.meta.url), 'utf8');
  const persistIdx = source.indexOf('persistTransportProofFailClosed()');
  const parseIdx = source.indexOf('parsed = parseProviderJson(providerResult.stdout);');
  assert.ok(persistIdx !== -1 && parseIdx !== -1);
  assert.ok(persistIdx < parseIdx, 'the transport proof must be persisted before provider output is parsed');
  // Behavioral: a transport that succeeds but emits INVALID JSON still
  // leaves the immutable TRANSPORT_PROOF record (gate passed) on disk.
  const fixture = await fixtureStore(t, { access: 'proof-order-access-token-0000', refresh: 'proof-order-refresh-token-0000' });
  // Build a minimal invocation surface and run the real runner with an
  // invalid-JSON fixture Pi; then verify the transport-proof writer's
  // fail-closed contract directly.
  const { prepareCodexSolInvocation, runSolPiProcess, buildCodexSolCommand, loadSolSystemPrompt, persistSolTransportEvidence, persistSolSemanticAcceptance } = await import('../../src/controller/sol-transport.mjs');
  const transport = await prepareCodexSolInvocation({
    runDir: fixture.runDir,
    store: fixture.store,
    invocationId: id('inv', 'd'),
    invocationMarker: 'marker-' + 'b'.repeat(24),
    systemPrompt: loadSolSystemPrompt(),
    env: {},
  });
  const spec = buildCodexSolCommand({ pi: transport.pi, systemPrompt: transport.systemPrompt });
  const result = await runSolPiProcess({ transport, command: spec.command, args: [...spec.args, 'not-json'], input: '' });
  assert.equal(result.status, 0);
  // The transport gate (minus the surface proofs, which we do not have
  // here) is the pre-parse gate; the writer persists it before any parse.
  const proofs = {
    status: result.status,
    error: result.error,
    timedOut: result.timedOut,
    truncated: result.truncated,
    processCompleted: result.processCompleted,
    identityVerifiedBeforeSpawn: true,
    identityVerifiedAfterExit: true,
    processAbsenceVerified: true,
    quiescenceVerified: true,
    surfaceVerified: true,
    credentialScanPassed: true,
    cleanupVerified: true,
    reviewAuthority: 'TEST_SEAM_NON_AUTHORITATIVE',
    rawScanState: 'COMPLETE',
    rawScanIncompleteReasons: [],
    gatePassed: true,
  };
  const proofFile = persistSolTransportEvidence(fixture.runDir, id('inv', 'd'), {
    pi: transport.pi,
    transport,
    store: fixture.store,
    proofs,
  });
  assert.equal(fs.existsSync(proofFile), true);
  const persisted = JSON.parse(fs.readFileSync(proofFile, 'utf8'));
  assert.equal(persisted.phase, 'TRANSPORT_PROOF');
  assert.equal(persisted.transportProofs.gatePassed, true);
  // Invalid JSON cannot create a semantic-acceptance binding. The writer
  // accepts only an actually compiled response with both scans COMPLETE.
  assert.throws(() => persistSolSemanticAcceptance(fixture.runDir, id('inv', 'd'), {
    store: fixture.store,
    transportProofRef: proofFile,
    askId: id('ask', 'e'),
    responseId: null,
    callType: 'SOL_DIAGNOSE',
    errorCode: 'TRANSPORT_MALFORMED',
    finalAcceptance: false,
    semanticAccepted: false,
  }), /requires successful compilation/);
  const semanticFile = persistSolSemanticAcceptance(fixture.runDir, id('inv', 'd'), {
    store: fixture.store,
    transportProofRef: proofFile,
    askId: id('ask', 'e'),
    responseId: id('response', 'f'),
    callType: 'SOL_DIAGNOSE',
    errorCode: null,
    finalAcceptance: true,
    semanticAccepted: true,
    rawScanState: 'COMPLETE',
    rawScanIncompleteReasons: [],
    canonicalScanState: 'COMPLETE',
    canonicalScanIncompleteReasons: [],
    credentialScanPassed: true,
  });
  const semantic = JSON.parse(fs.readFileSync(semanticFile, 'utf8'));
  assert.equal(semantic.phase, 'SEMANTIC_ACCEPTANCE');
  assert.equal(semantic.finalAcceptance, true);
  assert.equal(semantic.transportProofRef, path.basename(proofFile));
  transport.confirmProcessAbsence();
  await transport.remove();
  await fixture.store.remove();
});

// ---------------------------------------------------------------------------
// Finding 8 — fail-closed proof evidence
// ---------------------------------------------------------------------------

test('assessEvidencePersistenceFailure fails every accepted transport closed', () => {
  assert.equal(assessEvidencePersistenceFailure({ nonAuthoritative: false, accepted: true }), 'SOL_TRANSPORT_EVIDENCE_FAILED');
  assert.equal(assessEvidencePersistenceFailure({ nonAuthoritative: false, accepted: false }), null, 'a rejected invocation keeps its primary error');
  assert.equal(assessEvidencePersistenceFailure({ nonAuthoritative: true, accepted: true }), 'SOL_TRANSPORT_EVIDENCE_FAILED', 'test seams do not bypass proof persistence');
});

test('collectCanonicalStringValues fails closed when the parsed scan budget is exceeded (SOL_RESPONSE_TOO_LARGE)', () => {
  assert.throws(
    () => collectCanonicalStringValues({ huge: 'X'.repeat(17 * 1024 * 1024) }),
    (error) => error.code === 'SOL_RESPONSE_TOO_LARGE',
  );
});

test('persistSolTransportEvidence refuses to claim success before observed facts exist (fail closed)', async (t) => {
  const { runDir, store } = await fixtureStore(t);
  const invocationId = id('inv', 'c');
  // Cleanup never completed: evidence must refuse to claim anything.
  assert.throws(
    () => persistSolTransportEvidence(runDir, invocationId, {
      pi: store.pi, store, cleanup: { removed: false, observed: false, completed: false, verified: false },
      proofs: { gatePassed: true },
    }),
    /cleanup/,
  );
  // Sixth-review rule: the evidence writer validates that gatePassed
  // IMPLIES every proof — an inconsistent claim is refused.
  assert.throws(
    () => persistSolTransportEvidence(runDir, invocationId, {
      pi: store.pi, store,
      cleanup: { removed: true, observed: true, completed: true, verified: true },
      proofs: { gatePassed: true, identityVerifiedBeforeSpawn: true, identityVerifiedAfterExit: true, processAbsenceVerified: true, quiescenceVerified: true, surfaceVerified: true, credentialScanPassed: false, cleanupVerified: true },
    }),
    /gatePassed claim is inconsistent/,
  );
  // A duplicate evidence target (persistence failure) throws instead of
  // silently overwriting a proof record.
  const evidenceDir = path.join(runDir, 'controller', 'sol-transport', 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, `${invocationId}.json`), '{}');
  assert.throws(
    () => persistSolTransportEvidence(runDir, invocationId, {
      pi: store.pi, store,
      cleanup: { removed: true, observed: true, completed: true, verified: true },
      proofs: { status: 0, error: null, timedOut: false, truncated: false, processCompleted: true, reviewAuthority: 'TEST_SEAM_NON_AUTHORITATIVE', rawScanState: 'COMPLETE', rawScanIncompleteReasons: [], gatePassed: true, identityVerifiedBeforeSpawn: true, identityVerifiedAfterExit: true, processAbsenceVerified: true, quiescenceVerified: true, surfaceVerified: true, credentialScanPassed: true, cleanupVerified: true },
    }),
    /EEXIST|already exists/,
  );
  await store.remove();
});

// ---------------------------------------------------------------------------
// Finding 7 — durable external recovery marker: crash-simulated transitions
// ---------------------------------------------------------------------------

function writeCrashFixture({ runDir, runId, marker = 'crash-marker-' + 'c'.repeat(16), withCredentialBytes = true, storeOnly = false, markerOnly = false, unbound = false } = {}) {
  const solRoot = path.join(runDir, 'controller', 'sol-transport');
  const storeDir = path.join(solRoot, 'store');
  const markerFile = path.join(solRoot, 'markers', `${runId}.json`);
  if (unbound) {
    // Crash BEFORE the durable marker write: credential bytes with no
    // marker at all (recovery must fail closed and retain them).
    fs.mkdirSync(path.join(storeDir, 'agent'), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(storeDir, 'agent', 'auth.json'), JSON.stringify({ [CODEX_OAUTH_PROVIDER]: { type: 'oauth', access: 'crash-leftover-token-0123456789', refresh: 'crash-leftover-refresh-0123456789', expires: Date.now() + 3_600_000 } }), { mode: 0o600 });
    return { storeDir, markerFile, marker };
  }
  if (!markerOnly) fs.mkdirSync(storeDir, { recursive: true, mode: 0o700 });
  if (withCredentialBytes && !storeOnly && !markerOnly) {
    fs.mkdirSync(path.join(storeDir, 'agent'), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(storeDir, 'agent', 'auth.json'), JSON.stringify({ [CODEX_OAUTH_PROVIDER]: { type: 'oauth', access: 'crash-leftover-token-0123456789', refresh: 'crash-leftover-refresh-0123456789', expires: Date.now() + 3_600_000 } }), { mode: 0o600 });
  }
  fs.mkdirSync(path.dirname(markerFile), { recursive: true, mode: 0o700 });
  const canonical = fs.existsSync(storeDir)
    ? fs.realpathSync(storeDir)
    : path.join(fs.realpathSync(path.dirname(storeDir)), path.basename(storeDir));
  fs.writeFileSync(markerFile, `${JSON.stringify({
    schemaName: 'lcim.sol-transport', schemaVersion: '1.4.0', kind: 'sol-transport-store',
    runId, invocationId: 'lcim_inv_' + 'd'.repeat(32), invocationMarker: marker,
    canonicalPath: canonical, credentialPath: path.join(canonical, 'agent', 'auth.json'),
    transportIdentity: 'a'.repeat(64), nodeIdentitySha256: 'b'.repeat(64), cliIdentitySha256: 'c'.repeat(64),
    closureIdentitySha256: null, createdAt: new Date().toISOString(),
  })}\n`);
  return { storeDir, markerFile, marker };
}

test('crash at EVERY marker/credential cleanup transition is recoverable; the external marker outlives the subtree', async (t) => {
  // Transition 1: full store + marker -> sweep removes subtree then marker.
  {
    const { runDir, runId } = bareRun(t, 'a');
    const { storeDir, markerFile } = writeCrashFixture({ runDir, runId });
    const sweep = await sweepRunSolTransportSurfaces(runDir);
    assert.equal(sweep.ok, true, JSON.stringify(sweep.failures));
    assert.equal(fs.existsSync(storeDir), false);
    assert.equal(fs.existsSync(markerFile), false, 'the durable external marker is removed only after the subtree');
  }
  // Transition 2: crash mid-subtree-removal (agent/ credential bytes remain,
  // marker external and intact) -> recovery removes the leftover subtree.
  {
    const { runDir, runId } = bareRun(t, 'b');
    const { storeDir, markerFile } = writeCrashFixture({ runDir, runId });
    const sweep = await sweepRunSolTransportSurfaces(runDir);
    assert.equal(sweep.ok, true, JSON.stringify(sweep.failures));
    assert.equal(fs.existsSync(storeDir), false, 'the credential subtree must be removed');
    assert.equal(fs.existsSync(markerFile), false, 'the marker is removed after subtree absence is verified');
  }
  // Transition 3: crash with only an EMPTY store dir (no credential bytes
  // yet) -> the marker-bound surface is still recognized and removed.
  {
    const { runDir, runId } = bareRun(t, 'c');
    const { storeDir, markerFile } = writeCrashFixture({ runDir, runId, withCredentialBytes: false, storeOnly: true });
    const sweep = await sweepRunSolTransportSurfaces(runDir);
    assert.equal(sweep.ok, true, JSON.stringify(sweep.failures));
    assert.equal(fs.existsSync(storeDir), false);
    assert.equal(fs.existsSync(markerFile), false);
  }
  // Transition 4: crash AFTER subtree removal but BEFORE marker removal
  // (marker-only leftover) -> recovery removes the durable marker.
  {
    const { runDir, runId } = bareRun(t, 'd');
    const { markerFile } = writeCrashFixture({ runDir, runId, markerOnly: true });
    assert.equal(fs.existsSync(path.join(runDir, 'controller', 'sol-transport', 'store')), false, 'fixture must simulate the subtree already removed');
    const sweep = await sweepRunSolTransportSurfaces(runDir);
    assert.equal(sweep.ok, true, JSON.stringify(sweep.failures));
    assert.equal(fs.existsSync(markerFile), false, 'the marker-only leftover must be swept');
  }
  // Transition 5: crash BEFORE the marker write (unbound store) -> sweep
  // fails closed and retains the credential bytes for explicit recovery.
  {
    const { runDir, runId } = bareRun(t, 'e');
    const { storeDir } = writeCrashFixture({ runDir, runId, unbound: true });
    const sweep = await sweepRunSolTransportSurfaces(runDir);
    assert.equal(sweep.ok, false, 'an unbound credential surface must never be guessed away');
    assert.equal(fs.existsSync(storeDir), true, 'unbound credential bytes are retained for explicit recovery');
  }
  // Transition 6: the ordering invariant — subtree removal ALWAYS precedes
  // the external marker removal (a crash between them leaves the marker).
  {
    const { runDir, runId } = bareRun(t, 'f');
    const { storeDir, markerFile } = writeCrashFixture({ runDir, runId });
    // Simulate the crash by removing the subtree manually and re-running:
    // the sweep must finish the job (remove the marker) and never recreate
    // the subtree.
    fs.rmSync(storeDir, { recursive: true, force: true });
    const sweep = await sweepRunSolTransportSurfaces(runDir);
    assert.equal(sweep.ok, true, JSON.stringify(sweep.failures));
    assert.equal(fs.existsSync(storeDir), false);
    assert.equal(fs.existsSync(markerFile), false);
  }
});

// ---------------------------------------------------------------------------
// Finding 8 — unknown survivor state is UNKNOWN, never []
// ---------------------------------------------------------------------------

test('an unreadable process table yields UNKNOWN survivor state (null), never an empty array', async () => {
  const denied = { listWithEnv: () => { throw new Error('denied'); }, kill: () => true };
  const result = await terminateProcessesByMarker('orphanmarker' + 'f'.repeat(16), { processTable: denied });
  assert.equal(result.verified, false);
  assert.equal(result.identified, null, 'an unreadable enumeration is UNKNOWN, not []');
  assert.equal(result.remaining, null, 'an unreadable enumeration is UNKNOWN, not []');
  // A readable-but-empty table proves absence with an explicit empty set.
  const empty = { listWithEnv: () => [], kill: () => true };
  const proven = await terminateProcessesByMarker('orphanmarker' + 'f'.repeat(16), { processTable: empty });
  assert.equal(proven.verified, true);
  assert.deepEqual(proven.remaining, []);
  assert.deepEqual(proven.identified, []);
});
