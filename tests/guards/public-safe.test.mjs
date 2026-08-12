/**
 * Sprint 00 guard tests: the tracked LCIM tree itself must be public-safe.
 *
 * Scans every file Git has tracked in this worktree for forbidden names and
 * artifact classes. (Files that are merely untracked are covered by the
 * .gitignore behavioral tests in ignore-guards.test.mjs.)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { git } from '../helpers/git-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const FORBIDDEN = [
  /(^|\/)\.env($|\.)/,
  /\.(pem|key|p12|pfx)$/,
  /(^|\/)id_(rsa|ed25519)(\.|$)/,
  /credentials/,
  /transcript/i,
  /escalation/i,
  /sol-payload/i,
  /review-(export|packets)/i,
  /target-repo-evidence/i,
  /\.jsonl$/,
  /\.log$/,
  /\.zip$/,
  /(^|\/)lcim\/runs\//,
  /lcim-run-state/,
  /\.secret$/,
];

test('every tracked file passes the public-safe name rules', () => {
  const tracked = git(ROOT, ['ls-files', '-z']).split('\0').filter(Boolean);
  assert.ok(tracked.length >= 5, 'expected a non-trivial tracked file list');
  for (const file of tracked) {
    for (const re of FORBIDDEN) {
      assert.doesNotMatch(file, re, `tracked file violates public-safe rule: ${file}`);
    }
  }
});

test('no tracked file lives inside any runtime-evidence path', () => {
  const tracked = git(ROOT, ['ls-files', '-z']).split('\0').filter(Boolean);
  for (const file of tracked) {
    const abs = path.join(ROOT, file);
    const normalized = path.normalize(abs);
    assert.ok(
      !/\/\.git\/lcim\//.test(normalized) &&
        !/\/(node_modules|coverage|lcim-runtime)\//.test(normalized),
      `tracked file under runtime/tooling path: ${file}`,
    );
  }
});
