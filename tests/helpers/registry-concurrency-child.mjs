/**
 * Sprint 03 registry-concurrency child process helper.
 *
 * Simulates one independent controller process for the SOL-S03-007
 * concurrent tests. Actions:
 *
 *   create <repoDir> <worktreeRoot> <baseSha> <workUnitId>
 *       -> creates one isolated worktree, prints {worktreeId, worktreeDir}
 *   remove <repoDir> <worktreeRoot> <baseSha> <workUnitId> <worktreeId>
 *       -> removes that controller's OWN worktree, prints {removed}
 *   burst <repoDir> <worktreeRoot> <baseSha> <workUnitId> <n> <prefix>
 *       -> appends <n> registry CREATED events under distinct ids/paths,
 *          prints {written}
 *
 * Output is a single JSON line on stdout.
 */

import { createIsolatedWorktree, removeIsolatedWorktree } from '../../src/git/worktree.mjs';
import { recordWorktreeEvent, generateWorktreeId } from '../../src/git/worktree-registry.mjs';

const [action, repoDir, worktreeRoot, baseSha, workUnitId, ...rest] = process.argv.slice(2);

if (action === 'create') {
  const ctx = createIsolatedWorktree({ repoDir, worktreeRoot, expectedBaseSha: baseSha, workUnitId });
  console.log(JSON.stringify({ worktreeId: ctx.worktreeId, worktreeDir: ctx.worktreeDir }));
} else if (action === 'remove') {
  const [worktreeId] = rest;
  const result = removeIsolatedWorktree({ repoDir, worktreeId, worktreeDir: undefined });
  console.log(JSON.stringify({ removed: result.removed }));
} else if (action === 'burst') {
  const [count, prefix] = rest;
  for (let i = 0; i < Number(count); i += 1) {
    recordWorktreeEvent({
      repoDir,
      worktreeId: generateWorktreeId(),
      workUnitId,
      worktreePath: `/tmp/lcim-burst-${prefix}-${i}`,
      baseSha,
      event: 'CREATED',
    });
  }
  console.log(JSON.stringify({ written: Number(count) }));
} else {
  throw new Error(`unknown child action: ${action}`);
}
