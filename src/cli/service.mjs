/** Thin CLI adapters. Policy and orchestration stay in src/controller and reviewed sprint APIs. */

import { audit } from '../audit/index.mjs';
import { reviewExport } from '../reporting/index.mjs';
import { prepareProCopyText, proCopy } from '../sol/pro-handoff/service.mjs';
import { setupProject } from '../project/config.mjs';
import { runController, recoverRun, finalizeRun, abortRun } from '../controller/orchestrator.mjs';
import { readStatus } from '../controller/status.mjs';

export const cliSetup = setupProject;
export const cliRun = runController;
export const cliStatus = readStatus;
export const cliAudit = audit;
export const cliReviewExport = reviewExport;
export async function cliProCopy({ dryRun = false, ...options } = {}) {
  if (!dryRun) return proCopy(options);
  const prepared = await prepareProCopyText(options);
  return Object.freeze({ ...prepared, dryRun: true, instructions: 'dry run: no clipboard write and no manual send' });
}
export const cliRecover = recoverRun;
export const cliFinalize = finalizeRun;
export const cliAbort = abortRun;
