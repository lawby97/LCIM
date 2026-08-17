/**
 * Sixth-review scope-simplification tests: the real Pi auth store is
 * READ-ONLY input authority. LCIM reads the provider-scoped openai-codex
 * entry, copies it into the controller-owned run-scoped isolated surface,
 * and NEVER writes a refreshed token back. These tests prove the real
 * store stays byte-identical across every failure path and that missing /
 * corrupt / invalid source credentials fail closed with the
 * re-authentication-required instruction without modifying the store.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { acquireCodexSolStore } from '../../src/controller/sol-transport.mjs';
import { consumeSolTestSeam, mintSolTestSeam } from '../../src/controller/test-seams.mjs';
import { assertCodexOAuthAvailable } from '../../src/providers/oauth.mjs';
import { CODEX_OAUTH_PROVIDER, PI_AUTH_FILE } from '../../src/providers/oauth.mjs';
import { ProviderDiscoveryError } from '../../src/routing/errors.mjs';

const original = { type: 'oauth', access: 'original-access-token-0123456789', refresh: 'original-refresh-token-0123456789', expires: Date.now() + 3_600_000 };

function id(kind, character) {
  return `lcim_${kind}_${character.repeat(32)}`;
}

function sha256Bytes(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function writeFixturePi(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-readonly-pi-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cli = path.join(dir, 'fixture-pi.cjs');
  fs.writeFileSync(cli, `#!/usr/bin/env node\nprocess.stdin.resume();\nprocess.stdin.on('end', () => process.stdout.write('{}'));\n`, { mode: 0o755 });
  return cli;
}

async function makeStore(t, { realAuth = null, raw = null } = {}) {
  const runParent = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-readonly-run-'));
  const runId = id('run', 'a');
  const runDir = path.join(runParent, runId);
  fs.mkdirSync(runDir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(runDir, 'run.json'), `${JSON.stringify({ schemaName: 'lcim.run', schemaVersion: '1.0.0', runId, lifecycleState: 'OPEN', createdAt: new Date().toISOString(), targetBaseSha: 'a'.repeat(40), configDigest: 'b'.repeat(64), lcimVersion: '2.0.1', lcimCommit: null, storeVersion: '1', finalizedAt: null, abortedAt: null, abortNote: null, finalSummary: null })}\n`);
  t.after(() => fs.rmSync(runParent, { recursive: true, force: true }));
  const oauthRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-readonly-oauth-'));
  t.after(() => fs.rmSync(oauthRoot, { recursive: true, force: true }));
  const agent = path.join(oauthRoot, 'agent');
  fs.mkdirSync(agent, { recursive: true, mode: 0o700 });
  const authFile = path.join(agent, PI_AUTH_FILE);
  const content = raw ?? JSON.stringify({ [CODEX_OAUTH_PROVIDER]: realAuth ?? original });
  fs.writeFileSync(authFile, content, { mode: 0o600 });
  const authority = consumeSolTestSeam(mintSolTestSeam(), 'readonly fixture Pi');
  const pi = (await import('../../src/controller/sol-transport.mjs')).resolvePiExecutable({ piBin: writeFixturePi(t), testAuthority: authority });
  return {
    runDir,
    runId,
    authFile,
    authority,
    env: { PI_CODING_AGENT_DIR: agent, HOME: oauthRoot },
    realAuthBytes: content,
    realAuthSha: sha256Bytes(content),
    acquire: () => acquireCodexSolStore({
      runDir,
      runId,
      invocationId: id('inv', 'b'),
      invocationMarker: 'marker-' + 'a'.repeat(24),
      pi,
      env: { PI_CODING_AGENT_DIR: agent, HOME: oauthRoot },
      testAuthority: authority,
    }),
  };
}

test('the real Pi auth store is byte-identical after a successful isolated-store acquisition', async (t) => {
  const fixture = await makeStore(t);
  const store = await fixture.acquire();
  assert.equal(store.realAuthPath, fs.realpathSync(fixture.authFile));
  assert.equal(fs.readFileSync(fixture.authFile, 'utf8'), fixture.realAuthBytes, 'the real store must not be modified');
  assert.equal(sha256Bytes(fs.readFileSync(fixture.authFile, 'utf8')), fixture.realAuthSha);
  // The isolated store received the provider-scoped copy (only openai-codex).
  const isolated = JSON.parse(fs.readFileSync(store.authFile, 'utf8'));
  assert.deepEqual(Object.keys(isolated), [CODEX_OAUTH_PROVIDER]);
  assert.equal(isolated[CODEX_OAUTH_PROVIDER].access, original.access);
  // The read-only verification guard reports unchanged.
  const verification = store.verifyRealAuthSourceUnchanged();
  assert.equal(verification.ok, true);
  assert.equal(verification.changed, false);
  await store.remove();
  assert.equal(fs.readFileSync(fixture.authFile, 'utf8'), fixture.realAuthBytes, 'cleanup must never touch the real store');
});

test('within-run isolated refresh/rotation NEVER writes back to the real store', async (t) => {
  const fixture = await makeStore(t);
  const store = await fixture.acquire();
  // Pi refreshes inside the isolated surface (normal Pi refresh behaviour).
  const rotated = { type: 'oauth', access: 'rotated-access-token-0123456789', refresh: 'rotated-refresh-token-0123456789', expires: Date.now() + 7_200_000 };
  fs.writeFileSync(store.authFile, `${JSON.stringify({ [CODEX_OAUTH_PROVIDER]: rotated })}\n`, { mode: 0o600 });
  const reload = store.refreshFromDisk();
  assert.equal(reload.ok, true);
  assert.equal(reload.changedThisReload, true);
  assert.equal(store.entry().access, 'rotated-access-token-0123456789');
  // The real store is untouched and the verification guard still reports
  // byte-identical.
  assert.equal(fs.readFileSync(fixture.authFile, 'utf8'), fixture.realAuthBytes, 'a refreshed token must NEVER be written back');
  const verification = store.verifyRealAuthSourceUnchanged();
  assert.equal(verification.ok, true);
  assert.equal(verification.changed, false);
  await store.remove();
  assert.equal(fs.readFileSync(fixture.authFile, 'utf8'), fixture.realAuthBytes);
});

test('verifyRealAuthSourceUnchanged reports (never repairs) an external concurrent change', async (t) => {
  const fixture = await makeStore(t);
  const store = await fixture.acquire();
  // An external actor (e.g. the user's interactive Pi session) rewrites the
  // real store concurrently — LCIM must NOT repair or revert it, only
  // report the observation.
  const external = { type: 'oauth', access: 'external-refresh-token-00000000', refresh: 'external-refresh-token-00000000', expires: Date.now() + 9_000_000 };
  fs.writeFileSync(fixture.authFile, JSON.stringify({ [CODEX_OAUTH_PROVIDER]: external }), { mode: 0o600 });
  const verification = store.verifyRealAuthSourceUnchanged();
  assert.equal(verification.ok, false);
  assert.equal(verification.changed, true);
  assert.equal(verification.reason, 'bytes-changed');
  assert.equal(fs.readFileSync(fixture.authFile, 'utf8'), JSON.stringify({ [CODEX_OAUTH_PROVIDER]: external }), 'LCIM must never revert an external change');
  await store.remove();
});

test('a missing real auth store fails closed with the re-authentication instruction and never creates it', async (t) => {
  const fixture = await makeStore(t);
  fs.rmSync(fixture.authFile);
  await assert.rejects(
    fixture.acquire(),
    (error) => error.code === 'CODEX_OAUTH_UNAVAILABLE' && /RE-AUTHENTICATION REQUIRED/.test(error.message),
  );
  assert.equal(fs.existsSync(fixture.authFile), false, 'no-create: LCIM must never synthesize a real auth store');
});

test('a corrupt real auth store fails closed and is never repaired or overwritten', async (t) => {
  const fixture = await makeStore(t, { raw: '{corrupt' });
  await assert.rejects(
    fixture.acquire(),
    (error) => error.code === 'CODEX_OAUTH_UNAVAILABLE' && /RE-AUTHENTICATION REQUIRED/.test(error.message),
  );
  assert.equal(fs.readFileSync(fixture.authFile, 'utf8'), '{corrupt', 'the corrupt real store must stay byte-identical');
});

test('a real store without a usable openai-codex entry fails closed without modification', async (t) => {
  const fixture = await makeStore(t, { raw: JSON.stringify({ anthropic: { type: 'oauth', access: 'a', refresh: 'b' } }) });
  await assert.rejects(
    fixture.acquire(),
    (error) => error.code === 'CODEX_OAUTH_UNAVAILABLE',
  );
  assert.equal(fs.readFileSync(fixture.authFile, 'utf8'), fixture.realAuthBytes);
});

test('next-run: a stale/invalid real source credential fails closed with the re-auth instruction and leaves auth byte-identical', async (t) => {
  // Run 1: the valid real credential is copied into the isolated store and
  // Pi refreshes INSIDE that store — the real store keeps the ORIGINAL
  // bytes (no write-back, within-run continuity only).
  const fixture = await makeStore(t);
  const store = await fixture.acquire();
  const rotated = { type: 'oauth', access: 'rotated-access-token-0123456789', refresh: 'rotated-refresh-token-0123456789', expires: Date.now() + 7_200_000 };
  fs.writeFileSync(store.authFile, `${JSON.stringify({ [CODEX_OAUTH_PROVIDER]: rotated })}\n`, { mode: 0o600 });
  const reload = store.refreshFromDisk();
  assert.equal(reload.changedThisReload, true);
  assert.equal(store.entry().access, 'rotated-access-token-0123456789');
  await store.remove();
  assert.equal(fs.readFileSync(fixture.authFile, 'utf8'), fixture.realAuthBytes, 'run 1 must never write back');
  // Run 2 (NEXT run, fresh run id/dir): the real source credential is
  // stale/invalid (here: unusable). The run fails closed with the
  // re-authentication-required instruction and never modifies the real
  // store.
  const invalid = JSON.stringify({ [CODEX_OAUTH_PROVIDER]: { type: 'oauth', access: 'short', refresh: 'short', expires: Date.now() + 3_600_000 } });
  fs.writeFileSync(fixture.authFile, invalid, { mode: 0o600 });
  const run2 = await makeStore(t, { raw: invalid });
  await assert.rejects(
    run2.acquire(),
    (error) => error.code === 'CODEX_OAUTH_UNAVAILABLE' && /RE-AUTHENTICATION REQUIRED/.test(error.message),
  );
  assert.equal(fs.readFileSync(fixture.authFile, 'utf8'), invalid, 'the invalid source store stays byte-identical (never repaired, never replaced)');
});

test('routing-level availability fails closed with the re-authentication instruction (read-only source)', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-readonly-empty-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.throws(
    () => assertCodexOAuthAvailable({ env: { PI_CODING_AGENT_DIR: dir } }),
    (error) => error instanceof ProviderDiscoveryError
      && error.details?.reason === 'CODEX_OAUTH_UNAVAILABLE'
      && /RE-AUTHENTICATION REQUIRED/.test(error.message),
  );
  assert.deepEqual(fs.readdirSync(dir), [], 'the empty agent dir must stay empty (no-create)');
});
