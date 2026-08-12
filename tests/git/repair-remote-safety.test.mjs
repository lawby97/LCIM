/**
 * SOL-S03-004 regression tests: PUSH / REMOTE SAFETY (defense in depth).
 *
 * PRIMARY safety — "worker push capability is unavailable by construction"
 * — requires a controller-owned worker execution boundary that Sprint 03
 * does not contain (no sandbox/runner; requested in ICR-2026-002, consumed
 * by Sprint 10). These tests therefore do NOT claim the push is blocked:
 * they prove the DETERMINISTIC FAIL-CLOSED behavior of the candidate when
 * push capability exists or cannot be ruled out:
 *
 * 1. unreachable fetch URL + REACHABLE push URL + push-capable custom
 *    namespace: the worker push SUCCEEDS at the git level (proving push
 *    capability genuinely exists), and the candidate then deterministically
 *    fails safety (unverifiable remote -> fail closed) and cannot proceed.
 * 2. reachable remote: pushes to CUSTOM namespaces (e.g.
 *    refs/lcim-safety-test/custom) are detected via the FULL advertised-ref
 *    comparison — a --heads/--tags-only snapshot would miss them.
 * 3. pushurl is accounted for SEPARATELY from the fetch URL (per-URL
 *    verification + per-URL ref comparison).
 * 4. an unverifiable push URL fails closed even without any push attempt.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git } from '../helpers/git-fixture.mjs';
import { makeBareRemote, makeWorkerFixture, makeWorkUnitId, workerGit } from '../helpers/git-safety-fixture.mjs';
import { prepareWorkerWorktree } from '../../src/git/pipeline.mjs';
import { checkWorkerSafety } from '../../src/validation/git/safety.mjs';
import { snapshotRemotes } from '../../src/git/state.mjs';
import { WorktreeSafetyError } from '../../src/git/errors.mjs';

const CUSTOM_REF = 'refs/lcim-safety-test/custom';

test('S03-004-1: unreachable fetch URL + reachable push URL + custom namespace -> push succeeds at git level, candidate FAILS CLOSED', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const { remote: pushRemote } = makeBareRemote(t);
  const deadFetch = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s03-dead-')), 'does-not-exist');
  // controller configures the remote BEFORE spawn: unreachable fetch URL,
  // reachable push URL (the distinction the finding requires)
  git(repoDir, ['remote', 'add', 'origin', deadFetch]);
  git(repoDir, ['config', 'remote.origin.pushurl', pushRemote]);
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });

  // the remote is UNVERIFIABLE at snapshot time (fetch URL unreachable)
  const snap = snapshotRemotes(repoDir);
  assert.equal(snap.origin.refs[deadFetch], null, 'fetch URL must be recorded unverifiable');
  assert.notEqual(snap.origin.refs[pushRemote], null, 'push URL is reachable and verified separately');

  // worker pushes a custom namespace via the pushurl: the PUSH ITSELF
  // SUCCEEDS — push capability genuinely exists (not blocked in Sprint 03)
  workerGit(ctx.worktreeDir, ['push', '-q', 'origin', `HEAD:${CUSTOM_REF}`]);
  const advertised = git(pushRemote, ['for-each-ref', '--format=%(refname)']).split('\n').filter(Boolean);
  assert.ok(advertised.includes(CUSTOM_REF), 'the push really landed on the push URL');

  // ...therefore the candidate deterministically fails safety and cannot proceed
  assert.throws(
    () => checkWorkerSafety({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, snapshot: ctx }),
    (err) =>
      err instanceof WorktreeSafetyError &&
      /cannot prove push capability is unavailable/.test(err.message) &&
      err.details.unverifiableRemotes.includes('origin'),
  );
});

test('S03-004-2: reachable remote — custom-namespace push is detected via FULL advertised refs (not only heads/tags)', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const { remote, name } = makeBareRemote(t);
  git(repoDir, ['remote', 'add', name, remote]);
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });

  // demonstrate the gap the old snapshot had: a custom namespace is NOT a
  // head or tag, so --heads --tags cannot see it
  workerGit(ctx.worktreeDir, ['push', '-q', name, `HEAD:${CUSTOM_REF}`]);
  const headsTagsOnly = git(remote, ['ls-remote', '--heads', '--tags', remote]).split('\n').filter(Boolean);
  assert.ok(!headsTagsOnly.some((l) => l.includes(CUSTOM_REF)), 'heads/tags-only view misses the custom ref');
  const allRefs = git(remote, ['ls-remote', remote]).split('\n').filter(Boolean);
  assert.ok(allRefs.some((l) => l.includes(CUSTOM_REF)), 'full advertised-ref view sees it');

  // full-ref comparison detects the push
  assert.throws(
    () => checkWorkerSafety({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, snapshot: ctx }),
    (err) => err instanceof WorktreeSafetyError && /pushed to a remote/.test(err.message),
  );
});

test('S03-004-3: pushurl is verified and compared SEPARATELY from the fetch URL', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const { remote: fetchRemote } = makeBareRemote(t);
  const { remote: pushRemote } = makeBareRemote(t);
  git(repoDir, ['remote', 'add', 'origin', fetchRemote]);
  git(repoDir, ['config', 'remote.origin.pushurl', pushRemote]);
  // seed the FETCH URL directly (pushing via 'origin' would use the pushurl)
  git(repoDir, ['push', '-q', fetchRemote, `HEAD:refs/heads/main`]);

  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });
  const snap = snapshotRemotes(repoDir);
  // both URLs independently verified; the fetch URL's refs prove nothing
  // about the push URL's refs
  assert.notEqual(snap.origin.refs[fetchRemote], null);
  assert.notEqual(snap.origin.refs[pushRemote], null);
  assert.deepEqual(snap.origin.refs[pushRemote], [], 'push URL starts empty');

  // push via the PUSH URL to a custom namespace
  workerGit(ctx.worktreeDir, ['push', '-q', 'origin', `HEAD:${CUSTOM_REF}`]);
  const pushed = git(pushRemote, ['ls-remote', pushRemote]).split('\n').filter(Boolean);
  assert.ok(pushed.some((l) => l.includes(CUSTOM_REF)), 'push landed on the push URL');
  assert.ok(!git(fetchRemote, ['ls-remote', fetchRemote]).includes(CUSTOM_REF), 'fetch URL untouched');

  assert.throws(
    () => checkWorkerSafety({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, snapshot: ctx }),
    (err) => err instanceof WorktreeSafetyError && /pushed to a remote/.test(err.message),
  );
});

test('S03-004-4: unverifiable push URL fails closed even with NO push attempt', async (t) => {
  const { repoDir, worktreeRoot, baseSha } = await makeWorkerFixture(t);
  const { remote: fetchRemote } = makeBareRemote(t);
  const deadPush = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s03-dead-')), 'no-such-repo');
  git(repoDir, ['remote', 'add', 'origin', fetchRemote]);
  git(repoDir, ['config', 'remote.origin.pushurl', deadPush]);
  const ctx = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId: makeWorkUnitId() });

  // worker does NOTHING (clean exit) — the unverifiable push capability
  // alone makes the candidate fail closed
  assert.throws(
    () => checkWorkerSafety({ repoDir, worktreeDir: ctx.worktreeDir, expectedBaseSha: baseSha, snapshot: ctx }),
    (err) => err instanceof WorktreeSafetyError && /unverifiable push URLs/.test(err.message),
  );
});
