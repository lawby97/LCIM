import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { RunStore } from '../../src/runtime/run-store.mjs';
import { abortRun, finalizeRun, recoverRun } from '../../src/controller/orchestrator.mjs';
import { SOL_TRANSPORT_SCHEMA_NAME, SOL_TRANSPORT_SCHEMA_VERSION, transportMarkersDir, acquireCodexSolStore, sweepRunSolTransportSurfaces } from '../../src/controller/sol-transport.mjs';
import { claimSolTestProcessTable, mintSolTestSeam, consumeSolTestSeam } from '../../src/controller/test-seams.mjs';
import { CODEX_OAUTH_PROVIDER, PI_AUTH_FILE } from '../../src/providers/oauth.mjs';

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

async function makeRun(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-terminal-transport-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'terminal@example.invalid']);
  git(root, ['config', 'user.name', 'Terminal Test']);
  fs.writeFileSync(path.join(root, 'a.txt'), 'A\n');
  git(root, ['add', 'a.txt']);
  git(root, ['commit', '-m', 'base']);
  const store = await RunStore.create({
    cwd: root,
    targetBaseSha: git(root, ['rev-parse', 'HEAD']),
    configDigest: 'a'.repeat(64),
  });
  return { root, store };
}

function claimedTable(runId, processTable) {
  const authority = consumeSolTestSeam(mintSolTestSeam({ processTable }), 'terminal process table');
  return { authority, processTable: claimSolTestProcessTable(authority, runId, 'terminal process table') };
}

function writeMarkedStore(store, { marker = 'terminal-marker-' + 'a'.repeat(24), sabotage = null } = {}) {
  const root = path.join(store.runDir, 'controller', 'sol-transport');
  const storeDir = path.join(root, 'store');
  const agent = path.join(storeDir, 'agent');
  const invocationId = 'lcim_inv_' + 'b'.repeat(32);
  fs.mkdirSync(agent, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(agent, 'auth.json'), JSON.stringify({ 'openai-codex': { type: 'oauth', access: 'terminal-access-token-0123456789', refresh: 'terminal-refresh-token-0123456789', expires: Date.now() + 3_600_000 } }), { mode: 0o600 });
  const canonical = fs.realpathSync(storeDir);
  // Fifth-review rule: the durable store marker lives OUTSIDE the
  // credential subtree (markers/<runId>.json).
  const markerFile = path.join(transportMarkersDir(store.runDir), `${store.runId}.json`);
  fs.mkdirSync(path.dirname(markerFile), { recursive: true, mode: 0o700 });
  fs.writeFileSync(markerFile, `${JSON.stringify({
    schemaName: SOL_TRANSPORT_SCHEMA_NAME,
    schemaVersion: SOL_TRANSPORT_SCHEMA_VERSION,
    kind: 'sol-transport-store',
    runId: store.runId,
    invocationId,
    invocationMarker: marker,
    canonicalPath: canonical,
    credentialPath: path.join(canonical, 'agent', 'auth.json'),
    transportIdentity: 'a'.repeat(64),
    nodeIdentitySha256: 'b'.repeat(64),
    cliIdentitySha256: 'c'.repeat(64),
    closureIdentitySha256: null,
    createdAt: new Date().toISOString(),
  })}\n`);
  if (sabotage === 'symlink') fs.symlinkSync(path.join(agent, 'auth.json'), path.join(agent, 'malicious-link'));
  return { storeDir, marker, markerFile };
}

test('a raw process table cannot fabricate terminal process absence', async (t) => {
  const { root, store } = await makeRun(t);
  const { marker, storeDir } = writeMarkedStore(store);
  const table = {
    listWithEnv: () => [`424242 1 424242 R node LCIM_INVOCATION_MARKER=${marker}`],
    kill: () => false,
  };
  await assert.rejects(
    sweepRunSolTransportSurfaces(store.runDir, { processTable: table }),
    /never accepts caller process inspection/,
  );
  assert.equal((await RunStore.open({ cwd: root, runId: store.runId })).record.lifecycleState, 'OPEN');
  assert.equal(fs.existsSync(storeDir), true);
});

test('abortRun removes a retained marker-bound OAuth surface before becoming ABORTED', async (t) => {
  const { root, store } = await makeRun(t);
  const { storeDir } = writeMarkedStore(store);
  const result = await abortRun({ cwd: root, runId: store.runId });
  assert.equal(result.lifecycleState, 'ABORTED');
  assert.equal(fs.existsSync(storeDir), false);
  assert.ok(result.terminalSolTransport.removed.length > 0);
});

test('even a sealed run-bound test table cannot authorize destructive terminal sweep', async (t) => {
  const { root, store } = await makeRun(t);
  const { storeDir } = writeMarkedStore(store);
  const seam = claimedTable(store.runId, { listWithEnv: () => [], kill: () => true });
  await assert.rejects(
    sweepRunSolTransportSurfaces(store.runDir, { processTable: seam.processTable, testAuthority: seam.authority }),
    /never accepts caller process inspection/,
  );
  assert.equal((await RunStore.open({ cwd: root, runId: store.runId })).record.lifecycleState, 'OPEN');
  assert.equal(fs.existsSync(storeDir), true);
});

test('direct RunStore.finalize cannot bypass marker-bound transport recovery', async (t) => {
  const { store } = await makeRun(t);
  const { markerFile } = writeMarkedStore(store);
  const marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
  marker.schemaVersion = 'unknown';
  fs.writeFileSync(markerFile, JSON.stringify(marker));
  await assert.rejects(store.finalize(), /terminal cleanup could not be proven/);
  assert.equal(store.record.lifecycleState, 'OPEN');
});

async function makeTransportFixture(t, store) {
  // A fixture Pi seam + real-auth env so a NEW marked transport surface can
  // be created for the race tests (fifth-review rule: creation is
  // serialized under the same authoritative run lifecycle lock).
  const seamDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-terminal-seam-'));
  const piBin = path.join(seamDir, 'fixture-pi.cjs');
  fs.writeFileSync(piBin, "#!/usr/bin/env node\nprocess.stdin.resume();\nprocess.stdin.on('end', () => process.stdout.write('{}'));\n", { mode: 0o755 });
  const authority = consumeSolTestSeam(mintSolTestSeam(), 'terminal race fixture');
  const oauthDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-terminal-oauth-'));
  fs.writeFileSync(path.join(oauthDir, PI_AUTH_FILE), JSON.stringify({ [CODEX_OAUTH_PROVIDER]: { type: 'oauth', access: 'race-access-token-0123456789', refresh: 'race-refresh-token-0123456789', expires: Date.now() + 3_600_000 } }), { mode: 0o600 });
  return { piBin, authority, env: { PI_CODING_AGENT_DIR: oauthDir, HOME: oauthDir } };
}

test('a new marked transport surface can NEVER appear after terminalization (create vs finalize)', async (t) => {
  const { root, store } = await makeRun(t);
  const fixture = await makeTransportFixture(t, store);
  // Terminalize the run first (no surfaces exist), then attempt creation:
  // the authoritative run.json lifecycleState is no longer OPEN.
  const finalized = await finalizeRun({ cwd: root, runId: store.runId });
  assert.equal(finalized.lifecycleState, 'COMPLETED');
  await assert.rejects(
    acquireCodexSolStore({
      runDir: store.runDir,
      runId: store.runId,
      invocationId: 'lcim_inv_' + 'c'.repeat(32),
      invocationMarker: 'marker-' + 'b'.repeat(24),
      pi: (await import('../../src/controller/sol-transport.mjs')).resolvePiExecutable({ piBin: fixture.piBin, testAuthority: fixture.authority }),
      env: fixture.env,
      testAuthority: fixture.authority,
    }),
    (error) => error.code === 'SOL_TRANSPORT_SURFACE_VIOLATION' && /non-open run/.test(error.message),
  );
});

test('concurrent transport creation vs finalize serializes under the run lifecycle lock (consistent outcome)', async (t) => {
  const { root, store } = await makeRun(t);
  const fixture = await makeTransportFixture(t, store);
  const solTransport = await import('../../src/controller/sol-transport.mjs');
  const pi = solTransport.resolvePiExecutable({ piBin: fixture.piBin, testAuthority: fixture.authority });
  const creation = acquireCodexSolStore({
    runDir: store.runDir,
    runId: store.runId,
    invocationId: 'lcim_inv_' + 'd'.repeat(32),
    invocationMarker: 'marker-' + 'c'.repeat(24),
    pi,
    env: fixture.env,
    testAuthority: fixture.authority,
  });
  const finalization = finalizeRun({ cwd: root, runId: store.runId });
  const [created, finalized] = await Promise.allSettled([creation, finalization]);
  const storeDir = path.join(store.runDir, 'controller', 'sol-transport', 'store');
  const lifecycle = JSON.parse(fs.readFileSync(path.join(store.runDir, 'run.json'), 'utf8')).lifecycleState;
  if (created.status === 'fulfilled') {
    // Creation won the lock: terminalization must have swept the new
    // marked surface before writing the terminal run.json.
    assert.equal(finalized.status, 'fulfilled', JSON.stringify(finalized.reason?.message));
    assert.equal(lifecycle, 'COMPLETED');
    assert.equal(fs.existsSync(storeDir), false, 'the terminal sweep must remove the concurrently created surface');
  } else {
    // Terminalization won: creation fails closed (run no longer OPEN) and
    // no surface may exist.
    assert.equal(finalized.status, 'fulfilled', JSON.stringify(finalized.reason?.message));
    assert.equal(lifecycle, 'COMPLETED');
    assert.equal(fs.existsSync(storeDir), false);
    assert.equal(created.reason?.code, 'SOL_TRANSPORT_SURFACE_VIOLATION');
  }
});

test('concurrent transport creation vs abort and vs recover serialize under the run lifecycle lock', async (t) => {
  for (const terminal of ['abort', 'recover']) {
    const { root, store } = await makeRun(t);
    const fixture = await makeTransportFixture(t, store);
    const solTransport = await import('../../src/controller/sol-transport.mjs');
    const pi = solTransport.resolvePiExecutable({ piBin: fixture.piBin, testAuthority: fixture.authority });
    const creation = acquireCodexSolStore({
      runDir: store.runDir,
      runId: store.runId,
      invocationId: 'lcim_inv_' + 'e'.repeat(32),
      invocationMarker: 'marker-' + 'd'.repeat(24),
      pi,
      env: fixture.env,
      testAuthority: fixture.authority,
    });
    const terminalCall = terminal === 'abort'
      ? abortRun({ cwd: root, runId: store.runId })
      : recoverRun({ cwd: root, runId: store.runId });
    const [created, terminalResult] = await Promise.allSettled([creation, terminalCall]);
    const storeDir = path.join(store.runDir, 'controller', 'sol-transport', 'store');
    const lifecycle = JSON.parse(fs.readFileSync(path.join(store.runDir, 'run.json'), 'utf8')).lifecycleState;
    assert.equal(terminalResult.status, 'fulfilled', `${terminal}: ${JSON.stringify(terminalResult.reason?.message)}`);
    assert.equal(fs.existsSync(storeDir), false, `${terminal}: no marked surface may survive terminalization`);
    if (created.status === 'fulfilled') {
      assert.ok(['COMPLETED', 'ABORTED'].includes(lifecycle), `${terminal}: run must be terminal`);
    } else {
      assert.equal(created.reason?.code, 'SOL_TRANSPORT_SURFACE_VIOLATION', `${terminal}: a raced creation either lands before the sweep or fails closed`);
    }
  }
});

test('production terminal APIs do not accept caller-supplied process inspection', async (t) => {
  const { root, store } = await makeRun(t);
  const table = { listWithEnv: () => [], kill: () => true };
  for (const call of [
    () => finalizeRun({ cwd: root, runId: store.runId, processTable: table }),
    () => abortRun({ cwd: root, runId: store.runId, processTable: table }),
    () => recoverRun({ cwd: root, runId: store.runId, processTable: table }),
  ]) {
    await assert.rejects(call(), /does not accept 'processTable'/);
  }
  assert.equal((await RunStore.open({ cwd: root, runId: store.runId })).record.lifecycleState, 'OPEN', 'no terminalization may happen with an ungated table');
});

test('a process-table seam is ONE-SHOT and RUN-BOUND: reuse across runs is refused', async (t) => {
  const { store } = await makeRun(t);
  const table = { listWithEnv: () => [], kill: () => true };
  const authority = consumeSolTestSeam(mintSolTestSeam({ processTable: table }), 'one-shot terminal authority');
  const sealed = claimSolTestProcessTable(authority, store.runId, 'one-shot terminal authority');
  assert.equal(typeof sealed.listWithEnv, 'function');
  const { store: store2 } = await makeRun(t);
  assert.throws(
    () => claimSolTestProcessTable(authority, store2.runId, 'one-shot terminal authority'),
    /one-shot and run-bound/,
  );
  assert.equal(store2.record.lifecycleState, 'OPEN');
});

test('finalizeRun fails closed when marked surface cleanup itself fails', async (t) => {
  const { root, store } = await makeRun(t);
  const { storeDir } = writeMarkedStore(store, { sabotage: 'symlink' });
  await assert.rejects(
    finalizeRun({ cwd: root, runId: store.runId }),
    (error) => error.code === 'SOL_TRANSPORT_CLEANUP_FAILED',
  );
  assert.equal((await RunStore.open({ cwd: root, runId: store.runId })).record.lifecycleState, 'OPEN');
  assert.equal(fs.existsSync(storeDir), true);
});
