import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveRuntimeRoot } from '../../src/config/runtime-path.mjs';
import { resolveEvidenceRef } from '../../src/evidence/patch/store.mjs';
import { readControllerState } from '../../src/controller/state.mjs';

import { assertInvocationLifecycle, cli, makeTarget } from '../fault-injection/helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BIN = path.join(ROOT, 'bin', 'lcim.mjs');

function runCli(cwd, args) {
  const result = cli(BIN, cwd, args);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function configure(target, projectKey) {
  const setup = runCli(target.root, ['setup', '--force']);
  assert.equal(setup.written.length, 5);
  const config = JSON.parse(fs.readFileSync(target.configPath, 'utf8'));
  config.projectKey = projectKey;
  config.allowedWritePaths = ['a.txt'];
  config.worker.command = ['node', path.basename(target.workerFile)];
  config.worker.args = ['normal', target.root];
  config.endpoints['deepseek-v4-flash'] = { baseUrl: `local://${projectKey}`, kind: 'local-command' };
  fs.writeFileSync(target.configPath, `${JSON.stringify(config, null, 2)}\n`);
}

test('two-target isolation: runtime, config, evidence, run identities, and provider state cannot bleed across targets', async (t) => {
  const first = makeTarget(t, { mode: 'normal', projectKey: 's11-target-a' });
  const second = makeTarget(t, { mode: 'normal', projectKey: 's11-target-b' });
  configure(first, 's11-target-a');
  configure(second, 's11-target-b');

  const a = runCli(first.root, ['run']);
  const b = runCli(second.root, ['run']);
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.equal(b.ok, true, JSON.stringify(b));
  assert.notEqual(a.runId, b.runId);
  assert.notEqual(a.configDigest, b.configDigest);
  assert.notEqual(a.candidate.patchEvidenceId, b.candidate.patchEvidenceId);
  assert.notEqual(resolveRuntimeRoot(first.root), resolveRuntimeRoot(second.root));
  assert.match(a.runtimeRoot, /[\\/]\.git[\\/]lcim$/);
  assert.match(b.runtimeRoot, /[\\/]\.git[\\/]lcim$/);

  const aState = readControllerState(path.join(a.runtimeRoot, 'runs', a.runId));
  const bState = readControllerState(path.join(b.runtimeRoot, 'runs', b.runId));
  assert.equal(aState.candidates.length, 1);
  assert.equal(bState.candidates.length, 1);
  assert.equal(aState.candidates[0].runId, a.runId);
  assert.equal(bState.candidates[0].runId, b.runId);
  assert.equal(aState.candidates[0].expectedBaseSha, first.baseSha);
  assert.equal(bState.candidates[0].expectedBaseSha, second.baseSha);
  assert.deepEqual(aState.events.filter((event) => event.kind === 'EXECUTION_BOUNDARY_VERIFIED'), aState.events.filter((event) => event.kind === 'EXECUTION_BOUNDARY_VERIFIED'));
  assert.equal(a.brokerEvidencePaths.length, 0, 'local target A has no external provider broker state');
  assert.equal(b.brokerEvidencePaths.length, 0, 'local target B has no external provider broker state');

  assert.throws(
    () => resolveEvidenceRef(second.root, a.patchEvidence.evidenceId),
    /does not exist|evidence record/i,
    'candidate evidence from A cannot authorize or resolve in B',
  );
  assert.equal(fs.readFileSync(path.join(first.root, 'a.txt'), 'utf8'), 'A\n');
  assert.equal(fs.readFileSync(path.join(second.root, 'a.txt'), 'utf8'), 'A\n');
  assert.equal(fs.existsSync(path.join(first.root, 'lcim')), false);
  assert.equal(fs.existsSync(path.join(second.root, 'lcim')), false);

  const statusA = runCli(first.root, ['status']);
  const statusB = runCli(second.root, ['status']);
  assert.equal(statusA.project.projectKey, 's11-target-a');
  assert.equal(statusB.project.projectKey, 's11-target-b');
  assert.deepEqual(statusA.runs.map((run) => run.runId), [a.runId]);
  assert.deepEqual(statusB.runs.map((run) => run.runId), [b.runId]);
  assertInvocationLifecycle(first.root, a.runId);
  assertInvocationLifecycle(second.root, b.runId);
});
