/**
 * Sprint 03 base-SHA checkpoint validation (policy).
 *
 * The serial base discipline is enforced at four controller-owned
 * checkpoints:
 *
 *   PRE_SPAWN       expectedBaseSha must be a commit in the repository and,
 *                   when serialBaseSha is supplied, must equal the accepted
 *                   head of the predecessor unit (accepted unit N yields the
 *                   only allowed base for dependent unit N+1).
 *   POST_EXIT       after the worker exits, the worker worktree HEAD must
 *                   still equal expectedBaseSha (no commits/resets/merges).
 *   PRE_EXTRACT     immediately before patch evidence is collected, the
 *                   worker worktree HEAD must still equal expectedBaseSha.
 *   PRE_INTEGRATION before integration handoff, BOTH the integration target
 *                   (parent worktree) HEAD and the worker worktree HEAD must
 *                   equal expectedBaseSha.
 *
 * Every violation throws BaseMismatchError with objective details (observed
 * SHAs, ahead/behind counts). Fail closed: an unverifiable state is a
 * mismatch.
 */

import { ConfigError } from '../../shared/errors.mjs';
import {
  aheadBehind,
  assertFullSha,
  commitExists,
  resolveCommitSha,
  resolveHeadSha,
} from '../../git/base.mjs';
import { BaseMismatchError } from '../../git/errors.mjs';

export const BASE_CHECKPOINTS = Object.freeze([
  'PRE_SPAWN',
  'POST_EXIT',
  'PRE_EXTRACT',
  'PRE_INTEGRATION',
]);

/**
 * Validate the base at one of the four checkpoints.
 *
 * @param {object} args
 * @param {string} args.repoDir - parent/main worktree dir (integration target)
 * @param {string} [args.worktreeDir] - worker worktree dir (POST_EXIT/PRE_EXTRACT/PRE_INTEGRATION)
 * @param {string} args.expectedBaseSha - 40-hex base required by the work unit
 * @param {string} args.checkpoint - one of BASE_CHECKPOINTS
 * @param {string} [args.serialBaseSha] - PRE_SPAWN: accepted head of the
 *        predecessor unit; when given, expectedBaseSha must equal it
 * @returns {{ checkpoint: string, ok: true, baseSha: string, [worktreeHead]: string, [parentHead]: string }}
 */
export function validateBaseAtCheckpoint({ repoDir, worktreeDir, expectedBaseSha, checkpoint, serialBaseSha }) {
  if (!BASE_CHECKPOINTS.includes(checkpoint)) {
    throw new ConfigError(`unknown base checkpoint: ${JSON.stringify(checkpoint)} (expected one of ${BASE_CHECKPOINTS.join(', ')})`);
  }
  assertFullSha(expectedBaseSha, 'expectedBaseSha');
  if (serialBaseSha !== undefined) {
    assertFullSha(serialBaseSha, 'serialBaseSha');
  }

  switch (checkpoint) {
    case 'PRE_SPAWN': {
      if (!commitExists(repoDir, expectedBaseSha)) {
        throw new BaseMismatchError(
          `PRE_SPAWN: expected base ${expectedBaseSha} is not a commit in the repository at ${repoDir}`,
          { checkpoint, expectedBaseSha, repoDir },
        );
      }
      const resolved = resolveCommitSha(repoDir, expectedBaseSha);
      if (resolved !== expectedBaseSha) {
        throw new BaseMismatchError(
          `PRE_SPAWN: expected base ${expectedBaseSha} resolves to ${resolved}`,
          { checkpoint, expectedBaseSha, resolved },
        );
      }
      if (serialBaseSha !== undefined && expectedBaseSha !== serialBaseSha) {
        throw new BaseMismatchError(
          `PRE_SPAWN: serial base violation — expected base ${expectedBaseSha} is not the accepted head ${serialBaseSha} of the predecessor unit; accepted unit N yields the only allowed base for unit N+1`,
          { checkpoint, expectedBaseSha, serialBaseSha },
        );
      }
      return { checkpoint, ok: true, baseSha: expectedBaseSha };
    }

    case 'POST_EXIT':
    case 'PRE_EXTRACT': {
      const worktreeHead = resolveHeadSha(worktreeDir);
      if (worktreeHead !== expectedBaseSha) {
        const { ahead, behind } = aheadBehind(worktreeDir, expectedBaseSha);
        throw new BaseMismatchError(
          `${checkpoint}: worker worktree HEAD ${worktreeHead} does not equal expected base ${expectedBaseSha} (ahead=${ahead}, behind=${behind})`,
          { checkpoint, expectedBaseSha, worktreeHead, ahead, behind },
        );
      }
      return { checkpoint, ok: true, baseSha: expectedBaseSha, worktreeHead };
    }

    case 'PRE_INTEGRATION': {
      const parentHead = resolveHeadSha(repoDir);
      const worktreeHead = worktreeDir ? resolveHeadSha(worktreeDir) : null;
      const problems = [];
      if (parentHead !== expectedBaseSha) {
        problems.push(
          `integration target HEAD ${parentHead} is not the expected base ${expectedBaseSha} (serial base for this unit)`,
        );
      }
      if (worktreeHead !== null && worktreeHead !== expectedBaseSha) {
        problems.push(`worker worktree HEAD ${worktreeHead} is not the expected base ${expectedBaseSha}`);
      }
      if (problems.length > 0) {
        throw new BaseMismatchError(`PRE_INTEGRATION: ${problems.join('; ')}`, {
          checkpoint,
          expectedBaseSha,
          parentHead,
          worktreeHead,
        });
      }
      return { checkpoint, ok: true, baseSha: expectedBaseSha, parentHead, worktreeHead };
    }

    default:
      throw new ConfigError(`unreachable checkpoint: ${checkpoint}`);
  }
}

/**
 * Serial candidate-base policy: the accepted (post-integration) head of
 * unit N is the ONLY allowed base for dependent unit N+1.
 *
 * @param {object|null} acceptedUnit - null when no unit was accepted yet
 * @param {string} acceptedUnit.headSha - head of the accepted unit N
 * @returns {string|null} the only allowed expected base for unit N+1, or
 *          null when no unit has been accepted (base remains the run base)
 */
export function nextSerialBase(acceptedUnit) {
  if (acceptedUnit === null || acceptedUnit === undefined) return null;
  const head = acceptedUnit.headSha;
  assertFullSha(head, 'acceptedUnit.headSha');
  return head;
}
