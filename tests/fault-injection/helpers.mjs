import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { setupProject } from '../../src/project/config.mjs';
import { resolveRunDir } from '../../src/config/runtime-path.mjs';
import { validateRunStore } from '../../src/logging/reader.mjs';
import { validateLedger } from '../../src/logging/ledger.mjs';

export function git(cwd, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  }
  return result;
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function readRun(repoDir, runId) {
  const runDir = resolveRunDir(repoDir, runId);
  const events = fs.readFileSync(path.join(runDir, 'events.v2.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const run = JSON.parse(fs.readFileSync(path.join(runDir, 'run.json'), 'utf8'));
  return { runDir, events, run };
}

/**
 * Assert the lifecycle invariant from the canonical ledger, not from a
 * controller result or an audit projection. Every START has exactly one
 * ordinary close (COMPLETION + ASSESSMENT) or one explicit reconciliation.
 */
export function assertInvocationLifecycle(repoDir, runId) {
  const { runDir, events, run } = readRun(repoDir, runId);
  const validation = validateRunStore(runDir);
  assert.equal(validation.valid, true, validation.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
  const ledger = validateLedger(events);
  assert.equal(ledger.valid, true, ledger.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));

  for (const state of ledger.states.values()) {
    assert.equal(state.counts.START, 1, `${state.invocationId}: exactly one START`);
    const ordinary = state.status === 'ASSESSED';
    const reconciled = state.status === 'ORPHANED' || state.status === 'SUPERSEDED';
    assert.equal(ordinary || reconciled, true, `${state.invocationId}: final lifecycle is explicit`);
    if (ordinary) {
      assert.equal(state.counts.COMPLETION, 1, `${state.invocationId}: exactly one COMPLETION`);
      assert.equal(state.counts.ASSESSMENT, 1, `${state.invocationId}: exactly one ASSESSMENT`);
      assert.equal(state.counts.RECONCILIATION, 0, `${state.invocationId}: no reconciliation after assessment`);
    } else {
      assert.equal(state.counts.RECONCILIATION, 1, `${state.invocationId}: exactly one reconciliation`);
      assert.equal(state.counts.ASSESSMENT, 0, `${state.invocationId}: reconciliation is not fabricated assessment`);
      assert.ok(state.counts.COMPLETION === 0 || state.counts.COMPLETION === 1, `${state.invocationId}: completion cardinality is bounded`);
    }
  }
  assert.equal(run.finalSummary?.incompleteInvocationIds?.length ?? 0, 0, 'finalized test run has no unclosed lifecycle');
  return { runDir, events, run, states: ledger.states, summary: ledger.summary };
}

export function workerResponse(prompt, { status = 'WORK_COMPLETE', summary = 'S11 deterministic worker' } = {}) {
  const workUnitId = prompt.match(/WORK_UNIT_ID:\s+(lcim_wu_[0-9a-f]+)/)?.[1] ?? null;
  return JSON.stringify({
    workUnitId,
    workerStatus: status,
    summary,
    acceptanceClaims: [],
    remainingIssues: [],
    reviewRisks: [],
    uncertainty: 'S11 fixture worker reports no controller-owned facts',
  });
}

/** Install a local provider fixture whose behavior is selected by argv[2]. */
export function installWorker(root, { defaultMode = 'normal' } = {}) {
  const script = `
let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const mode = process.argv[2] || ${JSON.stringify(defaultMode)};
  const parent = process.argv[3] || '';
  const response = (value) => process.stdout.write(value);
  const id = prompt.match(/WORK_UNIT_ID:\\s+(lcim_wu_[0-9a-f]+)/)?.[1] || null;
  const valid = () => JSON.stringify({ workUnitId: id, workerStatus: 'WORK_COMPLETE', summary: 'S11 deterministic worker', acceptanceClaims: [], remainingIssues: [], reviewRisks: [], uncertainty: 'S11 fixture worker reports no controller-owned facts' });
  if (mode === 'normal' || mode === 'semantic' || mode === 'malformed' || mode === 'schema' || mode === 'crash' || mode === 'timeout' || mode === 'scope' || mode === 'secret' || mode === 'parent' || mode === 'foreign' || mode === 'common' || mode === 'push') fs.writeFileSync('a.txt', 'B\\n');
  if (mode === 'scope') fs.writeFileSync('forbidden.txt', 'outside allow-list\\n');
  if (mode === 'secret') fs.writeFileSync('a.txt', 'secret=LCIM_S11_FAKE_SENTINEL\\n');
  if (mode === 'parent' && parent) { try { fs.writeFileSync(path.join(parent, 'a.txt'), 'PARENT_MUTATION\\n'); } catch (_) {} }
  if (mode === 'foreign' && parent) { try { fs.writeFileSync(path.join(path.dirname(parent), 'S11_FOREIGN_WRITE'), 'FOREIGN_MUTATION\\n'); } catch (_) {} }
  if (mode === 'common') {
    try {
      const gitdir = fs.readFileSync(path.join(process.cwd(), '.git'), 'utf8').trim().replace(/^gitdir:\\s*/, '');
      const common = path.dirname(path.dirname(path.resolve(process.cwd(), gitdir)));
      for (const rel of ['lcim/runs/S11_FORBIDDEN', 'lcim/evidence/S11_FORBIDDEN', 'lcim/worktrees/S11_FORBIDDEN']) {
        try { fs.writeFileSync(path.join(common, rel), 'COMMON_MUTATION\\n'); } catch (_) {}
      }
    } catch (_) {}
  }
  if (mode === 'push') {
    try { require('node:child_process').spawnSync('git', ['push', 'origin', 'HEAD:refs/lcim-s11/custom'], { stdio: 'ignore' }); } catch (_) {}
  }
  if (mode === 'crash') { process.exitCode = 23; return; }
  if (mode === 'timeout') { setInterval(() => {}, 1000); return; }
  if (mode === 'malformed') return response('not-json');
  if (mode === 'schema') return response(JSON.stringify({ workUnitId: id, summary: 'schema-invalid fixture' }));
  response(valid());
});
`;
  const file = path.join(root, 's11-worker.cjs');
  fs.writeFileSync(file, script, { mode: 0o600 });
  return file;
}

/** Create a minimal independent target with a non-secret local provider config. */
export function makeTarget(t, {
  mode = 'normal',
  allowedWritePaths = ['a.txt'],
  validationCommands = [],
  workerTimeoutMs = 300_000,
  commitProject = false,
  withRemote = false,
  projectKey = null,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s11-target-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'lcim-test@example.invalid']);
  git(root, ['config', 'user.name', 'LCIM Sprint 11']);
  fs.writeFileSync(path.join(root, 'a.txt'), 'A\n');
  git(root, ['add', 'a.txt']);
  git(root, ['commit', '-m', 'S11 fixture base']);
  const baseSha = git(root, ['rev-parse', 'HEAD']).stdout.trim();

  setupProject({ cwd: root });
  const workerFile = installWorker(root, { defaultMode: mode });
  const configPath = path.join(root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (projectKey !== null) config.projectKey = projectKey;
  config.allowedWritePaths = allowedWritePaths;
  config.worker.command = ['node', path.basename(workerFile)];
  config.worker.args = [mode, root];
  config.worker.timeoutMs = workerTimeoutMs;
  config.endpoints['deepseek-v4-flash'] = { baseUrl: 'local://s11-worker', kind: 'local-command' };
  if (validationCommands.length > 0) config.validation.commands = validationCommands;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  let remote = null;
  if (withRemote) {
    remote = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s11-remote-'));
    t.after(() => fs.rmSync(remote, { recursive: true, force: true }));
    git(remote, ['init', '--bare', '-b', 'main']);
    git(root, ['remote', 'add', 'origin', 'file:///definitely-unreachable-lcim-s11']);
    git(root, ['config', '--add', 'remote.origin.pushurl', remote]);
  }
  if (commitProject) {
    git(root, ['add', '.lcim', path.basename(workerFile)]);
    git(root, ['commit', '-m', 'S11 fixture project configuration']);
  }
  return { root, baseSha, configPath, workerFile, remote };
}

export function cli(bin, cwd, args) {
  return spawnSync(process.execPath, [bin, ...args, '--cwd', cwd, '--json'], {
    cwd,
    encoding: 'utf8',
  });
}

export function assertRuntimeIsTargetLocal(result, targetRoot) {
  assert.match(result.runtimeRoot, /[\\/]\.git[\\/]lcim$/);
  assert.equal(result.runtimeRoot.startsWith(path.resolve(targetRoot)), false);
  assert.equal(fs.existsSync(path.join(targetRoot, 'lcim')), false);
}

export function allFiles(root) {
  const files = [];
  if (!fs.existsSync(root)) return files;
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else files.push(full);
    }
  };
  visit(root);
  return files;
}

export function assertNoSentinel(root, sentinel) {
  const leaked = allFiles(root).filter((file) => {
    try { return fs.readFileSync(file, 'utf8').includes(sentinel); } catch { return false; }
  });
  assert.deepEqual(leaked, [], `sentinel leaked into ${leaked.join(', ')}`);
}
