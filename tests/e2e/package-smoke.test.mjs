import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { readVersion } from '../../src/config/version.mjs';
import { resolveGitCommonDir } from '../../src/config/runtime-path.mjs';
import { makeTarget, git } from '../fault-injection/helpers.mjs';

const ROOT = process.cwd();

function runNode(bin, args, cwd) {
  return spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' });
}

function runNpm(args, cwd) {
  return spawnSync('npm', args, { cwd, encoding: 'utf8' });
}

function jsonCli(bin, cwd, args) {
  const result = runNode(bin, [...args, '--cwd', cwd, '--json'], cwd);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test('packaging/install smoke: consumed package has correct metadata, CLI, target-local runtime, and no source-tree state', async (t) => {
  const version = readVersion();
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(packageJson.version, version);
  assert.equal(packageJson.bin.lcim, 'bin/lcim.mjs');

  const packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s11-pack-'));
  const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s11-consumer-'));
  t.after(() => {
    fs.rmSync(packDir, { recursive: true, force: true });
    fs.rmSync(consumer, { recursive: true, force: true });
  });
  const packed = runNpm(['pack', '--json', '--pack-destination', packDir], ROOT);
  assert.equal(packed.status, 0, packed.stderr);
  const packRecords = JSON.parse(packed.stdout);
  assert.equal(packRecords.length, 1);
  assert.equal(packRecords[0].name, packageJson.name);
  assert.equal(packRecords[0].version, version);
  const tarball = packRecords[0].filename;
  const tarballPath = path.join(packDir, tarball);
  assert.equal(fs.existsSync(tarballPath), true);

  const installed = runNpm(['install', '--prefix', consumer, tarballPath, '--ignore-scripts', '--no-audit', '--no-fund'], consumer);
  assert.equal(installed.status, 0, installed.stderr);
  const installedBin = path.join(consumer, 'node_modules', '.bin', 'lcim');
  assert.equal(fs.existsSync(installedBin), true);

  const versionResult = runNode(installedBin, ['--version'], consumer);
  assert.equal(versionResult.status, 0, versionResult.stderr);
  assert.match(versionResult.stdout, new RegExp(`^LCIM ${version.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?: \\(git [0-9a-f]{7}\\))?\\n$`));
  const help = runNode(installedBin, ['--help'], consumer);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /setup|review-export|recover/);

  const target = makeTarget(t, { mode: 'normal', projectKey: 's11-installed-target' });
  const setup = jsonCli(installedBin, target.root, ['setup', '--force']);
  assert.equal(setup.written.length, 5);
  const config = JSON.parse(fs.readFileSync(target.configPath, 'utf8'));
  config.projectKey = 's11-installed-target';
  config.allowedWritePaths = ['a.txt'];
  config.worker.command = ['node', path.basename(target.workerFile)];
  config.worker.args = ['normal', target.root];
  config.endpoints['deepseek-v4-flash'] = { baseUrl: 'local://s11-installed-worker', kind: 'local-command' };
  fs.writeFileSync(target.configPath, `${JSON.stringify(config, null, 2)}\n`);

  const run = jsonCli(installedBin, target.root, ['run']);
  assert.equal(run.ok, true, JSON.stringify(run));
  assert.equal(run.candidate.autoPublished, false);
  const status = jsonCli(installedBin, target.root, ['status']);
  assert.equal(status.project.projectKey, 's11-installed-target');
  const audit = jsonCli(installedBin, target.root, ['audit', '--last', '1']);
  assert.equal(audit.result.reconciliation.ok, true);
  const review = jsonCli(installedBin, target.root, ['review-export', '--last', '1']);
  assert.equal(fs.existsSync(path.join(review.dir, 'REVIEW.md')), true);

  const targetCommon = resolveGitCommonDir(target.root);
  assert.match(targetCommon, /[\\/]\.git$/);
  assert.equal(fs.existsSync(path.join(target.root, 'lcim')), false);
  assert.equal(fs.existsSync(path.join(consumer, 'lcim')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'lcim')), false);
  assert.equal(git(target.root, ['ls-files']).stdout.includes('lcim/runs/'), false);
});
