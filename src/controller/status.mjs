/** Read-only controller status projection for the CLI. */

import { resolveRuntimeRoot, assertNoTrackedFilesUnder } from '../config/runtime-path.mjs';
import { loadProjectConfig } from '../project/config.mjs';
import { resolveHeadSha } from '../git/base.mjs';
import { discoverRunDirs, loadRunStore, selectRuns } from '../audit/runs.mjs';
import { readControllerState } from './state.mjs';

export function readStatus({ cwd = process.cwd() } = {}) {
  const project = loadProjectConfig({ cwd });
  const repoDir = project.repoDir;
  const runtimeRoot = resolveRuntimeRoot(repoDir);
  assertNoTrackedFilesUnder(runtimeRoot, repoDir);
  const loaded = discoverRunDirs(runtimeRoot).map(loadRunStore);
  const selected = selectRuns(loaded, null);
  const runs = selected.selected.map((loadedRun) => {
    let controller = null;
    let controllerState = 'KNOWN';
    try {
      controller = readControllerState(loadedRun.runDir);
    } catch {
      controllerState = 'UNKNOWN';
    }
    return {
      runId: loadedRun.runId,
      lifecycleState: loadedRun.run?.lifecycleState ?? 'UNKNOWN',
      createdAt: loadedRun.run?.createdAt ?? null,
      targetBaseSha: loadedRun.run?.targetBaseSha ?? null,
      finalSummary: loadedRun.run?.finalSummary ?? null,
      controllerState,
      candidates: controller?.candidates?.map((candidate) => ({
        workUnitId: candidate.workUnitId,
        status: candidate.status,
        disposition: candidate.disposition,
        patchId: candidate.patchId ?? null,
        changedPaths: candidate.changedPaths ?? [],
        autoPublished: candidate.autoPublished === true,
      })) ?? [],
    };
  });
  return Object.freeze({
    repoDir,
    runtimeRoot,
    targetHeadSha: (() => {
      try { return resolveHeadSha(repoDir); } catch { return null; }
    })(),
    project: {
      exists: project.exists,
      configPath: project.configPath,
      configDigest: project.configDigest,
      projectKey: project.config.projectKey,
      migrated: project.migrated,
    },
    runs,
    invalidRunIds: selected.invalid.map((line) => line.runId),
    outOfWindowRunIds: selected.outOfWindow.map((line) => line.runId),
  });
}
