/**
 * Sprint 00 smoke tests: bin/lcim.mjs skeleton CLI.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BIN = path.join(ROOT, 'bin', 'lcim.mjs');

function runCli(...args) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

test('lcim --version exits 0 and reports the V2 release-candidate version', () => {
  const r = runCli('--version');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^LCIM 2\.0\.0-rc\.1/);
  assert.match(r.stdout, /\(git [0-9a-f]{7}\)/);
});

test('lcim -v behaves like --version', () => {
  const r = runCli('-v');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^LCIM 2\.0\.0-rc\.1/);
});

test('lcim --help exits 0 and prints usage', () => {
  const r = runCli('--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage: lcim/);
  assert.match(r.stdout, /Sprint 10/);
});

test('lcim with no arguments prints help and exits 0', () => {
  const r = runCli();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage: lcim/);
});

test('lcim with an unknown command fails closed with exit 1', () => {
  const r = runCli('frobnicate');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown command 'frobnicate'/);
  assert.match(r.stderr, /Sprint 10/);
});
