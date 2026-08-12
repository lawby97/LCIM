/**
 * Sprint 03 worker-safety validation.
 *
 * Post-exit detection surface for prohibited worker behavior, aligned with
 * the existing V1 safety model (isolated worktrees, no worker commits/push/
 * merge, no destructive reset/clean, parent worktree preserved):
 *
 * 1. HEAD moved         — worker commits/resets/merges/rebases move the
 *                         detached worktree HEAD away from the base
 *                         (also enforced by the POST_EXIT base checkpoint).
 * 2. Refs changed       — new/deleted branches or tags in the shared repo.
 * 3. Forbidden reflog   — `git reflog` entries naming commit/merge/rebase/
 *                         pull/cherry-pick/reset/clean/push/fetch/am/revert.
 * 4. Config changed     — local repository configuration modified (e.g. a
 *                         remote added for a push attempt).
 * 5. Remote refs        — per-URL (fetch URL AND pushurls, separately) FULL
 *                         advertised-ref comparison (`git ls-remote <url>`,
 *                         all namespaces). Any push-relevant URL that is
 *                         unreachable/unverifiable fails closed: an
 *                         unverifiable remote is NOT proof that no push
 *                         occurred while push capability exists.
 * 6. Parent preserved   — parent HEAD sha, porcelain status, AND
 *                         cryptographic content digests of dirty tracked /
 *                         staged / untracked items (byte changes with an
 *                         identical porcelain shape are still detected).
 *
 * LIMITATION (documented; see ICR-2026-001/002): this is post-hoc DETECTION,
 * not prevention. LCIM V2 has no controller-owned worker execution boundary
 * in Sprint 03, so filesystem write confinement and push/credential
 * confinement are NOT enforced here — they require the execution-boundary
 * interface requested in the interface-change requests. This validator
 * fails closed when it cannot rule out a violation.
 */

import {
  diffLineSnapshots,
  diffRemoteSnapshots,
  requireSnapshot,
  snapshotConfig,
  snapshotParentState,
  snapshotReflog,
  snapshotRefs,
  snapshotRemotes,
} from '../../git/state.mjs';
import { resolveHeadSha } from '../../git/base.mjs';
import { WorktreeSafetyError } from '../../git/errors.mjs';

/** Git operations whose reflog entries are prohibited for a worker. */
export const FORBIDDEN_REFLOG_OPS = Object.freeze([
  'commit',
  'merge',
  'rebase',
  'pull',
  'cherry-pick',
  'reset',
  'clean',
  'push',
  'fetch',
  'am',
  'revert',
]);

const FORBIDDEN_REFLOG_RE = new RegExp(`\\b(?:${FORBIDDEN_REFLOG_OPS.join('|')})\\b`, 'i');

/**
 * Verify a worker worktree against the pre-spawn snapshots.
 * Throws WorktreeSafetyError on the FIRST violation (fail closed).
 *
 * @param {object} args
 * @param {string} args.repoDir - parent/main worktree dir
 * @param {string} args.worktreeDir - worker worktree dir
 * @param {string} args.expectedBaseSha - base the worktree must still sit on
 * @param {object} args.snapshot - context returned by createIsolatedWorktree
 *        (refsSnapshot, reflogSnapshot, configSnapshot, remotesSnapshot,
 *        parentSnapshot)
 * @returns {{ ok: true, details: object }}
 */
export function checkWorkerSafety({ repoDir, worktreeDir, expectedBaseSha, snapshot }) {
  requireSnapshot(snapshot, 'worktree');
  const { refsSnapshot, reflogSnapshot, configSnapshot, remotesSnapshot, parentSnapshot } = snapshot;

  // 1. HEAD must still equal the base.
  const worktreeHead = resolveHeadSha(worktreeDir);
  if (worktreeHead !== expectedBaseSha) {
    throw new WorktreeSafetyError(
      `worker moved the worktree HEAD from ${expectedBaseSha} to ${worktreeHead} (worker commits/reset/merge detected)`,
      { expectedBaseSha, worktreeHead },
    );
  }

  // 2. Refs must be unchanged.
  const refs = diffLineSnapshots(refsSnapshot, snapshotRefs(repoDir));
  if (refs.added.length > 0 || refs.removed.length > 0) {
    throw new WorktreeSafetyError('worker created or deleted repository refs (branch/tag manipulation)', {
      refsAdded: refs.added,
      refsRemoved: refs.removed,
    });
  }

  // 3. Reflog must not record forbidden operations.
  const reflog = diffLineSnapshots(reflogSnapshot, snapshotReflog(worktreeDir));
  const forbidden = reflog.added.filter((entry) => FORBIDDEN_REFLOG_RE.test(entry));
  if (forbidden.length > 0) {
    throw new WorktreeSafetyError(
      `worker ran forbidden git operations: ${forbidden.join('; ')}`,
      { forbiddenReflogEntries: forbidden },
    );
  }

  // 4. Repository configuration must be unchanged.
  const config = diffLineSnapshots(configSnapshot, snapshotConfig(repoDir));
  if (config.added.length > 0 || config.removed.length > 0) {
    throw new WorktreeSafetyError('worker modified the repository git configuration', {
      configAdded: config.added,
      configRemoved: config.removed,
    });
  }

  // 5. Remote advertisements must be unchanged (push detection), and every
  //    push-relevant URL must remain VERIFIABLE. An unverifiable remote is
  //    never proof that no push occurred while push capability exists:
  //    the candidate fails closed.
  const remotes = diffRemoteSnapshots(remotesSnapshot, snapshotRemotes(repoDir));
  if (remotes.unverifiable.length > 0) {
    throw new WorktreeSafetyError(
      `cannot prove push capability is unavailable: remote(s) ${remotes.unverifiable.join(', ')} have unverifiable push URLs; candidate fails closed (an unverifiable remote is not proof that no push occurred)`,
      { unverifiableRemotes: remotes.unverifiable },
    );
  }
  if (remotes.added.length > 0 || remotes.removed.length > 0 || remotes.changedRemotes.length > 0) {
    throw new WorktreeSafetyError('worker changed remote configuration or pushed to a remote', {
      remotesAdded: remotes.added,
      remotesRemoved: remotes.removed,
      changedRemotes: remotes.changedRemotes,
    });
  }

  // 6. Parent worktree must be byte-identical to the pre-spawn snapshot:
  //    HEAD sha, porcelain shape, AND content digests (a byte change with an
  //    identical porcelain shape is still a violation).
  const parentNow = snapshotParentState(repoDir);
  if (parentNow.headSha !== parentSnapshot.headSha) {
    throw new WorktreeSafetyError('worker changed the parent worktree HEAD', {
      parentHeadBefore: parentSnapshot.headSha,
      parentHeadAfter: parentNow.headSha,
    });
  }
  if (parentNow.porcelain !== parentSnapshot.porcelain) {
    throw new WorktreeSafetyError('parent worktree dirty state changed during the worker run', {
      parentStatusBefore: parentSnapshot.porcelain,
      parentStatusAfter: parentNow.porcelain,
    });
  }
  const parentDigestsBefore = JSON.stringify(parentSnapshot.contentDigest ?? []);
  const parentDigestsAfter = JSON.stringify(parentNow.contentDigest ?? []);
  if (parentDigestsBefore !== parentDigestsAfter) {
    throw new WorktreeSafetyError(
      'parent worktree file contents changed during the worker run (porcelain shape unchanged; content digests differ)',
      { parentDigestBefore: parentSnapshot.contentDigest, parentDigestAfter: parentNow.contentDigest },
    );
  }

  return {
    ok: true,
    details: {
      worktreeHead,
      refsAdded: refs.added,
      refsRemoved: refs.removed,
      reflogEntriesAdded: reflog.added,
      configChanged: false,
      remotesChanged: false,
      parentPreserved: true,
    },
  };
}
