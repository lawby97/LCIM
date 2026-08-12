/**
 * Sprint 01 test helpers: run-store fixtures inside tmp git repos.
 * All runtime state is written under the fixture repo's Git common
 * directory (os.tmpdir()) — never in the LCIM source tree.
 */

import { RunStore } from '../../src/runtime/run-store.mjs';
import { generateId } from '../../src/shared/ids.mjs';
import { makeGitRepo } from './git-fixture.mjs';

/** Fixed, valid 40-hex target base sha for fixtures. */
export const TEST_TARGET_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
/** Fixed, valid 64-hex config digest for fixtures. */
export const TEST_CONFIG_DIGEST = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

/**
 * Create a fresh tmp git repo and a run store inside it.
 * @returns {{ repo: {root:string}, store: RunStore }}
 */
export async function makeRunStore(t, options = {}) {
  const repo = await makeGitRepo(t);
  const store = await RunStore.create({
    cwd: repo.root,
    targetBaseSha: TEST_TARGET_SHA,
    configDigest: TEST_CONFIG_DIGEST,
    options,
  });
  return { repo, store };
}

/** Convenience invocation parameters shared by tests. */
export function invocationParams(workUnitId) {
  return {
    workUnitId,
    provider: 'deepseek',
    model: 'deepseek-flash',
    role: 'WORKER',
    reasoningEffort: 'xhigh',
  };
}

export { generateId };
