import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeEscalation } from '../sol-pro/helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BIN = path.join(ROOT, 'bin', 'lcim.mjs');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function invoke(cwd, ...args) {
  return spawnSync(process.execPath, [BIN, ...args, '--cwd', cwd], { cwd, encoding: 'utf8' });
}

test('standalone CLI setup/run/status/audit/review-export/recovery surfaces work on an independent target', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s10-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'lcim-test@example.invalid']);
  git(root, ['config', 'user.name', 'LCIM Sprint 10 CLI']);
  fs.writeFileSync(path.join(root, 'a.txt'), 'A\n');
  git(root, ['add', 'a.txt']);
  git(root, ['commit', '-m', 'fixture base']);

  const setup = invoke(root, 'setup', '--json');
  assert.equal(setup.status, 0);
  assert.equal(JSON.parse(setup.stdout).written.length, 5);
  fs.writeFileSync(path.join(root, 'worker.cjs'), `let prompt='';process.stdin.on('data',c=>prompt+=c);process.stdin.on('end',()=>{require('node:fs').writeFileSync('a.txt','B\\n');const id=prompt.match(/WORK_UNIT_ID:\\s+(lcim_wu_[0-9a-f]+)/)[1];process.stdout.write(JSON.stringify({workUnitId:id,workerStatus:'WORK_COMPLETE',summary:'cli fixture',acceptanceClaims:[],remainingIssues:[],reviewRisks:[],uncertainty:'fixture'}))});`);
  const configPath = path.join(root, '.lcim', 'project.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.allowedWritePaths = ['a.txt'];
  config.worker.command = ['node', 'worker.cjs'];
  config.endpoints['deepseek-v4-flash'] = { baseUrl: 'local://cli-worker', kind: 'local-command' };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

  const run = invoke(root, 'run', '--json');
  assert.equal(run.status, 0, run.stderr);
  const runResult = JSON.parse(run.stdout);
  assert.equal(runResult.ok, true);
  assert.equal(runResult.disposition, 'SEMANTICALLY_ACCEPTED');
  assert.match(runResult.runId, /^lcim_run_/);

  const status = invoke(root, 'status', '--json');
  assert.equal(status.status, 0);
  assert.equal(JSON.parse(status.stdout).runs.length, 1);

  const audit = invoke(root, 'audit', '--last', '1', '--json');
  assert.equal(audit.status, 0, audit.stderr);
  assert.ok(fs.existsSync(JSON.parse(audit.stdout).outDir));

  const review = invoke(root, 'review-export', '--last', '1', '--json');
  assert.equal(review.status, 0, review.stderr);
  assert.ok(fs.existsSync(path.join(JSON.parse(review.stdout).dir, 'REVIEW.md')));

  const recovered = invoke(root, 'recover', runResult.runId, '--json');
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.equal(JSON.parse(recovered.stdout).lifecycleState, 'COMPLETED');
  assert.equal(git(root, ['status', '--porcelain']).includes('a.txt'), false);
});

test('CLI run fails closed with deterministic defaults when no project config exists', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s10-no-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, ['init', '-b', 'main']);
  git(root, ['config', 'user.email', 'lcim-test@example.invalid']);
  git(root, ['config', 'user.name', 'LCIM Sprint 10 no-config']);
  fs.writeFileSync(path.join(root, 'a.txt'), 'A\n');
  git(root, ['add', 'a.txt']);
  git(root, ['commit', '-m', 'fixture base']);

  const run = invoke(root, 'run', '--json');
  assert.equal(run.status, 1);
  const result = JSON.parse(run.stdout);
  assert.equal(result.ok, false);
  assert.equal(result.finalSummary.invocations, 0);
  assert.ok(result.errors.length > 0);
  assert.equal(fs.existsSync(path.join(root, '.lcim')), false);
});

test('CLI Pro-copy dry run prepares bounded text without clipboard or manual send', async (t) => {
  const { repo, record, store } = await makeEscalation(t);
  const result = invoke(repo.root, 'pro-copy', record.escalationId, '--dry-run', '--json');
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.dryRun, true);
  assert.match(output.instructions, /no clipboard write/i);
  const updated = await store.load(record.escalationId);
  assert.equal(updated.exchanges[0].copiedAt, null);
});
