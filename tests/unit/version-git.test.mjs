/**
 * Sprint 00 unit tests: LCIM git-commit identity is anchored to the LCIM
 * package/source root and is independent of the caller's/current working
 * directory (SOL-S00-002), and repository ownership is verified before any
 * Git SHA is accepted as the LCIM commit (SOL-S00-R2-001).
 *
 * LCIM implementation identity (gitCommit) and target repository base
 * identity (targetBaseSha) are separate facts. These tests stage a
 * standalone LCIM source copy as repository A, create an unrelated caller
 * repository B with a different HEAD, and invoke getVersionInfo / the CLI
 * while cwd is B: the reported commit must be A's HEAD, never B's. An
 * unversioned LCIM install nested inside a target repository must report
 * null (never the enclosing repo HEAD), and an LCIM-owned linked Git
 * worktree must still be recognized.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { git, makeGitRepo, makeLinkedWorktree, stageLcimSource, writeFixtureFile } from '../helpers/git-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Run `node <root>/runner.mjs` with cwd = <callerCwd> and parse the JSON output. */
function runVersionInfo(root, callerCwd) {
  const runner = path.join(root, 'runner.mjs');
  writeFixtureFile(
    root,
    'runner.mjs',
    "import { getVersionInfo } from './src/config/version.mjs';\nconsole.log(JSON.stringify(getVersionInfo()));\n",
  );
  const out = spawnSync(process.execPath, [runner], { cwd: callerCwd, encoding: 'utf8' });
  assert.equal(out.status, 0, `runner failed: ${out.stderr}`);
  return JSON.parse(out.stdout);
}

test('getVersionInfo() reports the LCIM source repo HEAD, not the caller repo HEAD', async (t) => {
  // Repository A: standalone LCIM fixture/source repository.
  const lcim = await stageLcimSource(t, { gitRepo: true });
  const lcimHead = git(lcim.root, ['rev-parse', 'HEAD']).trim();
  assert.match(lcimHead, /^[0-9a-f]{40}$/);

  // Repository B: target/caller repository with a different HEAD.
  const target = await makeGitRepo(t);
  writeFixtureFile(target.root, 'work.txt', 'target work\n');
  git(target.root, ['add', 'work.txt']);
  git(target.root, ['commit', '-m', 'target head']);
  const targetHead = git(target.root, ['rev-parse', 'HEAD']).trim();
  assert.notEqual(lcimHead, targetHead);

  // Invoke getVersionInfo while cwd is repository B.
  const info = runVersionInfo(lcim.root, target.root);
  assert.equal(info.version, '2.0.0-rc.1');
  assert.equal(info.gitCommit, lcimHead, 'gitCommit must be the LCIM repository A HEAD');
  assert.notEqual(info.gitCommit, targetHead, 'gitCommit must NOT be the target repository B HEAD');
  assert.equal(info.gitCommitShort, lcimHead.slice(0, 7));
  assert.equal(info.schemaVersion, '2.0.0');
});

test('bin/lcim.mjs reports the LCIM commit while cwd is another Git repository', async (t) => {
  const lcim = await stageLcimSource(t, { gitRepo: true });
  const lcimHead = git(lcim.root, ['rev-parse', 'HEAD']).trim();
  const target = await makeGitRepo(t);
  writeFixtureFile(target.root, 'work.txt', 'target work\n');
  git(target.root, ['add', 'work.txt']);
  git(target.root, ['commit', '-m', 'target head']);
  const targetHead = git(target.root, ['rev-parse', 'HEAD']).trim();
  assert.notEqual(lcimHead, targetHead);

  const out = spawnSync(process.execPath, [path.join(lcim.root, 'bin', 'lcim.mjs'), '--version'], {
    cwd: target.root,
    encoding: 'utf8',
  });
  assert.equal(out.status, 0, out.stderr);
  assert.match(
    out.stdout.trim(),
    new RegExp(`^LCIM 2\\.0\\.0-rc\\.1 \\(git ${lcimHead.slice(0, 7)}\\)$`),
    `CLI must report the LCIM repo commit (A), got: ${out.stdout.trim()}`,
  );
});

test('getVersionInfo() returns gitCommit null when LCIM source has no Git metadata', async (t) => {
  // A staged LCIM source copy that is NOT a git repository: no usable Git
  // metadata at the install root -> null fallback, version still works.
  const staged = await stageLcimSource(t, { gitRepo: false });
  const info = runVersionInfo(staged.root, staged.root);
  assert.equal(info.version, '2.0.0-rc.1');
  assert.equal(info.gitCommit, null);
  assert.equal(info.gitCommitShort, null);
  assert.equal(info.schemaVersion, '2.0.0');
});

test('nested unversioned LCIM install inside a target repo reports gitCommit null (SOL-S00-R2-001)', async (t) => {
  // Target repository T with its own commit T_SHA.
  const target = await makeGitRepo(t);
  writeFixtureFile(target.root, 'work.txt', 'target work\n');
  git(target.root, ['add', 'work.txt']);
  git(target.root, ['commit', '-m', 'target head']);
  const targetHead = git(target.root, ['rev-parse', 'HEAD']).trim();
  assert.match(targetHead, /^[0-9a-f]{40}$/);

  // LCIM installed WITHOUT its own Git metadata inside T:
  // T/node_modules/lcim/ holds the LCIM source/version fixture but no
  // LCIM-owned .git metadata. Git discovery from that directory walks up
  // and finds T/.git — which must NOT supply the LCIM commit.
  const staged = await stageLcimSource(t, { gitRepo: false });
  const nested = path.join(target.root, 'node_modules', 'lcim');
  fs.cpSync(staged.root, nested, { recursive: true });
  assert.ok(!fs.existsSync(path.join(nested, '.git')), 'fixture must not contain .git');

  const { getVersionInfo } = await requireVersionModule(nested);
  const info = getVersionInfo();
  assert.equal(info.version, '2.0.0-rc.1');
  assert.equal(info.gitCommit, null, 'enclosing target repo HEAD must NOT become the LCIM commit');
  assert.equal(info.gitCommitShort, null);
  assert.notEqual(info.gitCommit, targetHead, 'gitCommit must never equal the target repository T_SHA');
  assert.equal(info.schemaVersion, '2.0.0');
});

test('an LCIM-owned linked Git worktree is still recognized (SOL-S00-R2-001)', async (t) => {
  // LCIM main repo + LCIM linked worktree: the LCIM package/source root is
  // the linked worktree root, whose Git administrative directory lives in
  // the main repo. Ownership must be decided by the worktree top-level, not
  // by where `.git` physically lives.
  const wt = await makeLinkedWorktree(t); // { root: main repo, linked }
  const staged = await stageLcimSource(t, { gitRepo: false });
  fs.cpSync(staged.root, wt.linked, { recursive: true });
  git(wt.linked, ['add', '-A']);
  git(wt.linked, ['commit', '-m', 'lcim source in linked worktree']);
  const linkedHead = git(wt.linked, ['rev-parse', 'HEAD']).trim();
  const mainHead = git(wt.root, ['rev-parse', 'HEAD']).trim();
  assert.notEqual(linkedHead, mainHead, 'fixture: linked worktree HEAD differs from main repo HEAD');

  const { getVersionInfo } = await requireVersionModule(wt.linked);
  const info = getVersionInfo();
  assert.equal(info.gitCommit, linkedHead, 'gitCommit must be the linked worktree HEAD');
  assert.equal(info.gitCommitShort, linkedHead.slice(0, 7));
  assert.notEqual(info.gitCommit, mainHead);
  assert.equal(info.version, '2.0.0-rc.1');
});

test('the live LCIM repo reports its own HEAD (no cwd parameter)', async () => {
  const { getVersionInfo } = await requireVersionModule(ROOT);
  const expected = git(ROOT, ['rev-parse', 'HEAD']).trim();
  const info = getVersionInfo();
  assert.equal(info.gitCommit, expected);
  assert.equal(info.gitCommitShort, expected.slice(0, 7));
  assert.equal(info.version, '2.0.0-rc.1');
});

/** Import src/config/version.mjs from a given repo root (fresh module URL). */
function requireVersionModule(root) {
  // Dynamic import keyed by path so each fixture copy gets its own module.
  return import(pathToFileURL(path.join(root, 'src', 'config', 'version.mjs')).href);
}
