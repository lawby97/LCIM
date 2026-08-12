/**
 * LCIM V2 raw worker-response preservation (Sprint 02).
 *
 * The EXACT final raw model response is preserved locally for debugging
 * under the runtime root (canonically `<git-common-dir>/lcim`, resolved by
 * src/config/runtime-path.mjs — never in tracked source directories).
 *
 * Layout: `<runtimeRoot>/handoffs/<workUnitId>/raw-response.txt`
 * (outside the Sprint-01-owned `runs/` store; Sprint 01 owns the run
 * ledger, Sprint 02 owns handoff artifact preservation).
 *
 * Policy: normal reports reference the preserved path
 * (`rawResponseRef`) but never embed or commit the raw content. The
 * preserved file lives under the Git common directory, so it can never be
 * tracked even by mistake.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ConfigError, PublicSafetyError } from '../shared/errors.mjs';
import { isValidId } from '../shared/ids.mjs';
import { isPathWithin } from '../config/runtime-path.mjs';

/**
 * Directory holding handoff artifacts for one work unit.
 * @param {string} runtimeRoot - canonical runtime root (`<git-common-dir>/lcim`).
 * @param {string} workUnitId
 */
export function handoffDir(runtimeRoot, workUnitId) {
  assertWorkUnitId(workUnitId);
  if (typeof runtimeRoot !== 'string' || runtimeRoot === '') {
    throw new ConfigError('preserveRawResponse requires a non-empty runtimeRoot');
  }
  return path.join(runtimeRoot, 'handoffs', workUnitId);
}

/**
 * Reference path of the preserved raw response for a work unit.
 * @param {string} runtimeRoot
 * @param {string} workUnitId
 */
export function rawResponseRef(runtimeRoot, workUnitId) {
  return path.join(handoffDir(runtimeRoot, workUnitId), 'raw-response.txt');
}

/**
 * Preserve the exact raw response byte-for-byte (UTF-8) and return its
 * reference. Creates `<runtimeRoot>/handoffs/<workUnitId>/`. Fails closed
 * (PublicSafetyError) if the target would escape the runtime root.
 *
 * @param {string} runtimeRoot
 * @param {string} workUnitId
 * @param {string} raw - exact final model response text.
 * @returns {{ref: string, bytes: number}}
 */
export function preserveRawResponse(runtimeRoot, workUnitId, raw) {
  if (typeof raw !== 'string') {
    throw new ConfigError('preserveRawResponse requires a string raw response');
  }
  const ref = rawResponseRef(runtimeRoot, workUnitId);
  if (!isPathWithin(runtimeRoot, ref)) {
    throw new PublicSafetyError(`raw-response ref escapes the runtime root: ${ref}`);
  }
  fs.mkdirSync(path.dirname(ref), { recursive: true });
  fs.writeFileSync(ref, raw, 'utf8');
  return { ref, bytes: Buffer.byteLength(raw, 'utf8') };
}

function assertWorkUnitId(workUnitId) {
  if (!isValidId('work-unit', workUnitId)) {
    throw new ConfigError(`invalid work-unit id: ${JSON.stringify(workUnitId)}`);
  }
}
