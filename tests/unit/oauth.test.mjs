/**
 * V2.0.1 tests: controller-owned Pi openai-codex OAuth facts.
 *
 * The codex SOL channel runs through Pi's NATIVE `openai-codex` provider;
 * LCIM never holds, copies, or persists the credential. This module only
 * derives existence/type/expiry facts in the controller process and fails
 * closed (CODEX_OAUTH_UNAVAILABLE) when the store is unusable.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CODEX_OAUTH_PROVIDER,
  CODEX_OAUTH_UNAVAILABLE,
  PI_AUTH_FILE,
  assertCodexOAuthAvailable,
  loadCodexOAuthCredential,
  readCodexOAuthEntry,
  resolvePiAgentDir,
} from '../../src/providers/oauth.mjs';
import { ProviderDiscoveryError } from '../../src/routing/errors.mjs';

function makeAgentDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-oauth-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeAuth(t, dir, content) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, PI_AUTH_FILE), JSON.stringify(content));
}

/** Non-secret fixture OAuth entry (values are fixtures, not real tokens). */
function fixtureEntry() {
  return {
    type: 'oauth',
    access: 'fixture-access-token-value',
    refresh: 'fixture-refresh-token-value',
    expires: Date.now() + 3_600_000,
    accountId: 'fixture-account',
  };
}

test('resolvePiAgentDir honors PI_CODING_AGENT_DIR and defaults to ~/.pi/agent', () => {
  const override = path.join(os.tmpdir(), 'pi-agent-override');
  assert.equal(resolvePiAgentDir({ env: { PI_CODING_AGENT_DIR: override } }), override);
  assert.equal(
    resolvePiAgentDir({ env: {} }),
    path.join(os.homedir(), '.pi', 'agent'),
  );
  assert.throws(() => resolvePiAgentDir({ env: { PI_CODING_AGENT_DIR: 'relative/pi' } }));
});

test('readCodexOAuthEntry reports unusable stores without echoing token material', (t) => {
  const empty = makeAgentDir(t);
  const missing = readCodexOAuthEntry({ env: { PI_CODING_AGENT_DIR: empty } });
  assert.equal(missing.exists, false);
  assert.equal(missing.hasAccessToken, false);
  assert.equal(missing.agentDir, empty);

  const noEntry = makeAgentDir(t);
  writeAuth(t, noEntry, { deepseek: { type: 'api_key', key: 'fixture' } });
  const other = readCodexOAuthEntry({ env: { PI_CODING_AGENT_DIR: noEntry } });
  assert.equal(other.exists, true);
  assert.equal(other.parseError, null);
  assert.equal(other.type, null);
  assert.equal(other.hasAccessToken, false);

  const malformed = makeAgentDir(t);
  fs.writeFileSync(path.join(malformed, PI_AUTH_FILE), 'not-json{');
  const bad = readCodexOAuthEntry({ env: { PI_CODING_AGENT_DIR: malformed } });
  assert.equal(bad.exists, true);
  assert.equal(bad.parseError, 'PARSE_FAILED');
  assert.equal(bad.hasAccessToken, false);

  const wrongType = makeAgentDir(t);
  writeAuth(t, wrongType, { [CODEX_OAUTH_PROVIDER]: { type: 'api_key', key: 'fixture' } });
  const wrong = readCodexOAuthEntry({ env: { PI_CODING_AGENT_DIR: wrongType } });
  assert.equal(wrong.type, 'api_key');
  assert.equal(wrong.hasAccessToken, false);

  // The facts never contain the token values themselves.
  const serialized = JSON.stringify(missing) + JSON.stringify(other) + JSON.stringify(bad) + JSON.stringify(wrong);
  assert.equal(serialized.includes('fixture-access-token-value'), false);
});

test('readCodexOAuthEntry reports an available openai-codex oauth entry', (t) => {
  const dir = makeAgentDir(t);
  writeAuth(t, dir, { [CODEX_OAUTH_PROVIDER]: fixtureEntry() });
  const state = readCodexOAuthEntry({ env: { PI_CODING_AGENT_DIR: dir } });
  assert.equal(state.exists, true);
  assert.equal(state.provider, CODEX_OAUTH_PROVIDER);
  assert.equal(state.type, 'oauth');
  assert.equal(state.hasAccessToken, true);
  assert.equal(typeof state.expiresAt, 'number');
});

test('assertCodexOAuthAvailable fails closed with the locked reason', (t) => {
  const empty = makeAgentDir(t);
  assert.throws(
    () => assertCodexOAuthAvailable({ env: { PI_CODING_AGENT_DIR: empty } }),
    (err) => err instanceof ProviderDiscoveryError && err.details?.reason === CODEX_OAUTH_UNAVAILABLE,
  );

  const dir = makeAgentDir(t);
  writeAuth(t, dir, { [CODEX_OAUTH_PROVIDER]: fixtureEntry() });
  const state = assertCodexOAuthAvailable({ env: { PI_CODING_AGENT_DIR: dir } });
  assert.equal(state.hasAccessToken, true);
});

test('loadCodexOAuthCredential returns ONLY the openai-codex entry (trusted transport state)', (t) => {
  const dir = makeAgentDir(t);
  writeAuth(t, dir, {
    [CODEX_OAUTH_PROVIDER]: fixtureEntry(),
    anthropic: { type: 'oauth', access: 'other-provider-access', refresh: 'other-provider-refresh', expires: 1, accountId: 'x' },
    openai: { type: 'api-key', access: 'api-key-value' },
  });
  const entry = loadCodexOAuthCredential({ env: { PI_CODING_AGENT_DIR: dir } });
  assert.ok(entry !== null);
  assert.equal(entry.access, 'fixture-access-token-value');
  assert.equal(entry.refresh, 'fixture-refresh-token-value');
  assert.equal(entry.type, 'oauth');
  assert.equal(typeof entry.expires, 'number');
  assert.equal(entry.accountId, 'fixture-account');
  // Other providers' credential material never leaves the store.
  const serialized = JSON.stringify(entry);
  assert.equal(serialized.includes('other-provider-access'), false);
  assert.equal(serialized.includes('api-key-value'), false);
});

test('loadCodexOAuthCredential fails closed (null) for missing/unusable stores', (t) => {
  assert.equal(loadCodexOAuthCredential({ env: { PI_CODING_AGENT_DIR: makeAgentDir(t) } }), null);
  const malformed = makeAgentDir(t);
  fs.writeFileSync(path.join(malformed, PI_AUTH_FILE), 'not json');
  assert.equal(loadCodexOAuthCredential({ env: { PI_CODING_AGENT_DIR: malformed } }), null);
  const wrongType = makeAgentDir(t);
  writeAuth(t, wrongType, { [CODEX_OAUTH_PROVIDER]: { type: 'api-key', access: '' } });
  assert.equal(loadCodexOAuthCredential({ env: { PI_CODING_AGENT_DIR: wrongType } }), null);
  const emptyEntry = makeAgentDir(t);
  writeAuth(t, emptyEntry, { [CODEX_OAUTH_PROVIDER]: { type: 'oauth' } });
  assert.equal(loadCodexOAuthCredential({ env: { PI_CODING_AGENT_DIR: emptyEntry } }), null);
  const partial = makeAgentDir(t);
  writeAuth(t, partial, { [CODEX_OAUTH_PROVIDER]: { type: 'oauth', access: 'access-without-refresh', expires: Date.now() } });
  assert.equal(loadCodexOAuthCredential({ env: { PI_CODING_AGENT_DIR: partial } }), null, 'Pi OAuth refresh and expiry fields are mandatory');
});
