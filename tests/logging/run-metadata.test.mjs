/**
 * Sprint 01 run-metadata tests.
 *
 * Requirement: run metadata records LCIM version/commit, target base,
 * config digest, and schema version. The LCIM identity is anchored to the
 * LCIM source root (Sprint 00): when the run store lives inside a target
 * repository, lcimCommit must be the LCIM repo HEAD — never the target
 * repo's HEAD.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeGitRepo, git } from '../helpers/git-fixture.mjs';
import { TEST_CONFIG_DIGEST, TEST_TARGET_SHA, generateId, invocationParams } from '../helpers/logging-fixture.mjs';
import { RunStore } from '../../src/runtime/run-store.mjs';
import { getVersionInfo } from '../../src/config/version.mjs';
import { RUN_JSON } from '../../src/logging/reader.mjs';
import { ConfigError } from '../../src/shared/errors.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const T0 = '2025-01-01T00:00:00.000Z';

test('run.json records LCIM version/commit, target base sha, config digest, schema version', async (t) => {
  const repo = await makeGitRepo(t);
  git(repo.root, ['commit', '--allow-empty', '-m', 'target head']);
  const targetHead = git(repo.root, ['rev-parse', 'HEAD']).trim();

  const store = await RunStore.create({
    cwd: repo.root,
    targetBaseSha: targetHead,
    configDigest: TEST_CONFIG_DIGEST,
  });
  const record = JSON.parse(fs.readFileSync(path.join(store.runDir, RUN_JSON), 'utf8'));
  const info = getVersionInfo();

  assert.equal(record.targetBaseSha, targetHead, 'target base must be the target repo HEAD');
  assert.equal(record.configDigest, TEST_CONFIG_DIGEST);
  assert.equal(record.lcimVersion, info.version);
  assert.equal(record.schemaVersion, '1.0.0');
  assert.match(record.createdAt, /^[0-9]{4}-[0-9]{2}-[0-9]{2}T/);

  // LCIM identity must never be the target repo identity
  assert.equal(record.lcimCommit, info.gitCommit);
  assert.equal(info.gitCommit, git(ROOT, ['rev-parse', 'HEAD']).trim(), 'fixture sanity: LCIM repo HEAD');
  assert.notEqual(record.lcimCommit, targetHead, 'lcimCommit must not be the target repo HEAD');
});

test('invalid metadata inputs fail closed before any store is created', async (t) => {
  const repo = await makeGitRepo(t);
  await assert.rejects(
    RunStore.create({ cwd: repo.root, targetBaseSha: 'XYZ', configDigest: TEST_CONFIG_DIGEST }),
    ConfigError,
  );
  await assert.rejects(
    RunStore.create({ cwd: repo.root, targetBaseSha: TEST_TARGET_SHA, configDigest: 'nope' }),
    ConfigError,
  );
  await assert.rejects(
    RunStore.create({ cwd: repo.root, targetBaseSha: undefined, configDigest: undefined }),
    ConfigError,
  );
  // nothing was created
  assert.equal(fs.existsSync(path.join(repo.root, '.git', 'lcim', 'runs')), false);
});

test('a completed run keeps its original metadata after finalization', async (t) => {
  const repo = await makeGitRepo(t);
  const store = await RunStore.create({
    cwd: repo.root,
    targetBaseSha: TEST_TARGET_SHA,
    configDigest: TEST_CONFIG_DIGEST,
  });
  const wu = generateId('work-unit');
  const inv = await store.startInvocation({ ...invocationParams(wu), occurredAt: T0 });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: T0 });
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: T0 });
  await store.finalize();
  const record = JSON.parse(fs.readFileSync(path.join(store.runDir, RUN_JSON), 'utf8'));
  assert.equal(record.targetBaseSha, TEST_TARGET_SHA);
  assert.equal(record.configDigest, TEST_CONFIG_DIGEST);
  assert.equal(record.lcimVersion, getVersionInfo().version);
  assert.equal(record.lifecycleState, 'COMPLETED');
  assert.equal(record.finalizedAt !== null, true);
  assert.equal(record.abortedAt, null);
});

test('abort() records abortedAt and an optional bounded note', async (t) => {
  const repo = await makeGitRepo(t);
  const store = await RunStore.create({
    cwd: repo.root,
    targetBaseSha: TEST_TARGET_SHA,
    configDigest: TEST_CONFIG_DIGEST,
  });
  await store.abort({ note: 'manual stop: target repo moved' });
  const record = JSON.parse(fs.readFileSync(path.join(store.runDir, RUN_JSON), 'utf8'));
  assert.equal(record.lifecycleState, 'ABORTED');
  assert.equal(record.abortNote, 'manual stop: target repo moved');
  assert.ok(record.abortedAt !== null);
  assert.equal(record.finalizedAt, null);
  assert.equal(record.finalSummary, null);
  const result = await store.validate();
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});
