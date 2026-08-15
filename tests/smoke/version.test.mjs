/**
 * Sprint 00 smoke tests: VERSION file, version helpers, schema version.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getVersionInfo, readVersion } from '../../src/config/version.mjs';
import { SCHEMA_VERSION } from '../../src/shared/schema-registry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('VERSION file contains the 2.0.0-rc.1 release-candidate value', () => {
  const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  assert.equal(version, '2.0.0-rc.1');
  assert.match(version, /^2\.0\.0-rc\.1$/);
});

test('package.json version matches VERSION file', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.version, readVersion());
});

test('readVersion() returns the release-candidate value', () => {
  assert.equal(readVersion(), '2.0.0-rc.1');
});

test('getVersionInfo() reports version, LCIM git commit, and schema version', () => {
  const info = getVersionInfo();
  assert.equal(info.version, '2.0.0-rc.1');
  assert.match(info.gitCommit, /^[0-9a-f]{40}$/);
  assert.equal(info.gitCommitShort, info.gitCommit.slice(0, 7));
  assert.equal(info.schemaVersion, SCHEMA_VERSION);
  assert.equal(SCHEMA_VERSION, '2.0.0');
});
