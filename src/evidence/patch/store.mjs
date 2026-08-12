/**
 * Sprint 03 patch evidence persistence.
 *
 * Controller-owned evidence store under the target repository's Git common
 * directory (never tracked, never part of the LCIM source tree):
 *
 *   <git-common-dir>/lcim/evidence/patch/<evidenceId>.json  (contextual record)
 *   <git-common-dir>/lcim/evidence/patch/<patchId>.patch    (content artifact)
 *
 * Identity model (three separate concepts, never conflated):
 *
 *   A. CONTENT identity      patchId / patchHash — sha256 over the canonical
 *                            controller-collected patch bytes. Identical bytes
 *                            share ONE content-addressed patch artifact at
 *                            <patchId>.patch. The artifact is immutable:
 *                            reuse happens only after the existing bytes are
 *                            verified to hash to the same patchHash, and any
 *                            mismatch fails closed.
 *   B. OBSERVATION identity  evidenceId — a unique controller-generated
 *                            contextual record identity. EVERY observation
 *                            gets its own <evidenceId>.json; two work units
 *                            with identical patch bytes still receive
 *                            distinct, immutable record references.
 *   C. WORKTREE identity     worktreeId — recorded inside the evidence so a
 *                            cleanup decision can prove the observation
 *                            belongs to the exact controller-owned worktree.
 *
 * Publication is exclusive (`wx`): a concurrent writer can never truncate or
 * overwrite an already-published record or artifact. The store is guarded by
 * `assertNoTrackedFilesUnder()` (fails closed if a tracked file ever appears
 * there) and is independent of the disposable worker worktree: cleanup of the
 * worktree never touches persisted evidence.
 */

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertNoTrackedFilesUnder, isPathWithin, resolveGitCommonDir } from '../../config/runtime-path.mjs';
import { EvidenceError } from '../../git/errors.mjs';
import { stampPatchEvidence, validatePatchEvidence } from './schema.mjs';

export const PATCH_ID_PATTERN = /^lcim_patch_[0-9a-f]{32}$/;

/** Contextual evidence observation ids: `lcim_ev_<32 hex>`. Sprint-local. */
export const EVIDENCE_ID_PATTERN = /^lcim_ev_[0-9a-f]{32}$/;

/** Generate a fresh contextual evidence observation id (controller-owned). */
export function generateEvidenceId() {
  return `lcim_ev_${randomBytes(16).toString('hex')}`;
}

function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/** Evidence store dir: `<git-common-dir>/lcim/evidence/patch`. */
export function resolvePatchEvidenceDir(repoDir) {
  return path.join(resolveGitCommonDir(repoDir), 'lcim', 'evidence', 'patch');
}

/**
 * Persist one contextual patch-evidence observation + canonical patch
 * artifact.
 *
 * - The record must already be stamped by the controller (schemaName/
 *   schemaVersion/patchId/patchHash/evidenceId/worktreeId/workUnitId...).
 * - The supplied patch bytes MUST hash to record.patchHash; any mismatch
 *   fails closed (the controller — never the worker — supplies both, and the
 *   store refuses an internally inconsistent pair).
 * - The patch artifact is content-addressed at <patchId>.patch. If it
 *   already exists its bytes are verified against record.patchHash before
 *   reuse; a non-matching existing artifact fails closed.
 * - The contextual record is written exclusively at <evidenceId>.json and
 *   is immutable: an existing record at that path fails closed (no
 *   truncate, no overwrite).
 *
 * @returns {{ record: object, recordPath: string, patchPath: string, dir: string, evidenceId: string }}
 */
export function persistPatchEvidence({ repoDir, record, patchText }) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    throw new EvidenceError('cannot persist evidence: record must be a stamped evidence object');
  }
  if (!PATCH_ID_PATTERN.test(record.patchId)) {
    throw new EvidenceError(`cannot persist evidence: invalid patchId ${JSON.stringify(record.patchId)}`);
  }
  if (!EVIDENCE_ID_PATTERN.test(record.evidenceId)) {
    throw new EvidenceError(`cannot persist evidence: invalid evidenceId ${JSON.stringify(record.evidenceId)}`);
  }
  const patchBuffer = Buffer.isBuffer(patchText) ? patchText : Buffer.from(String(patchText), 'utf8');
  if (sha256Hex(patchBuffer) !== record.patchHash) {
    throw new EvidenceError(
      `cannot persist evidence: supplied patch bytes do not hash to record.patchHash ${record.patchHash}`,
      { patchId: record.patchId, evidenceId: record.evidenceId },
    );
  }

  const dir = resolvePatchEvidenceDir(repoDir);
  assertNoTrackedFilesUnder(dir, repoDir);
  fs.mkdirSync(dir, { recursive: true });

  const recordPath = path.join(dir, `${record.evidenceId}.json`);
  const patchPath = path.join(dir, `${record.patchId}.patch`);

  // 1. Patch artifact: content-addressed, immutable, verified before reuse.
  if (fs.existsSync(patchPath)) {
    const existing = fs.readFileSync(patchPath);
    if (sha256Hex(existing) !== record.patchHash) {
      throw new EvidenceError(
        `existing patch artifact at ${patchPath} does not match patchHash ${record.patchHash}; refusing reuse (fail closed)`,
        { patchId: record.patchId, evidenceId: record.evidenceId },
      );
    }
  } else {
    try {
      fs.writeFileSync(patchPath, patchBuffer, { flag: 'wx' });
    } catch (err) {
      if (err && err.code === 'EEXIST') {
        // Another publisher won the race for the same content identity:
        // verify instead of overwriting.
        const existing = fs.readFileSync(patchPath);
        if (sha256Hex(existing) !== record.patchHash) {
          throw new EvidenceError(
            `concurrent patch artifact at ${patchPath} does not match patchHash ${record.patchHash}; refusing reuse (fail closed)`,
            { patchId: record.patchId, evidenceId: record.evidenceId },
          );
        }
      } else {
        throw new EvidenceError(`cannot write patch artifact ${patchPath}: ${err.message}`, { cause: err });
      }
    }
  }

  // 2. Contextual record: exclusive, immutable, collision-free identity.
  try {
    fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      throw new EvidenceError(
        `evidence record already exists at ${recordPath}; records are immutable and must never be overwritten`,
        { evidenceId: record.evidenceId, recordPath },
      );
    }
    throw new EvidenceError(`cannot write evidence record ${recordPath}: ${err.message}`, { cause: err });
  }

  return { record, recordPath, patchPath, dir, evidenceId: record.evidenceId };
}

/**
 * Load a contextual evidence record by its observation identity.
 * Validates the record against the patch-evidence schema and verifies the
 * record self-identifies with the requested evidenceId.
 * @returns {{ record: object, patchText: Buffer, recordPath: string, patchPath: string }}
 */
export function loadPatchEvidence(repoDir, evidenceId) {
  if (!EVIDENCE_ID_PATTERN.test(evidenceId)) {
    throw new EvidenceError(`invalid evidenceId: ${JSON.stringify(evidenceId)}`);
  }
  const dir = resolvePatchEvidenceDir(repoDir);
  const recordPath = path.join(dir, `${evidenceId}.json`);
  let record;
  try {
    record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  } catch (err) {
    throw new EvidenceError(`cannot load patch evidence record ${evidenceId}: ${err.message}`);
  }
  const validation = validatePatchEvidence(record);
  if (!validation.valid) {
    throw new EvidenceError(
      `loaded evidence record ${evidenceId} failed schema validation: ${validation.errors.map((e) => `${e.path || '(root)'}: ${e.message}`).join('; ')}`,
      { errors: validation.errors },
    );
  }
  if (record.evidenceId !== evidenceId) {
    throw new EvidenceError(
      `loaded evidence record ${evidenceId} self-identifies as ${JSON.stringify(record.evidenceId)}; refusing (fail closed)`,
      { evidenceId, recordEvidenceId: record.evidenceId },
    );
  }
  const patchPath = path.join(dir, `${record.patchId}.patch`);
  let patchText;
  try {
    patchText = fs.readFileSync(patchPath);
  } catch (err) {
    throw new EvidenceError(`cannot load patch artifact for ${evidenceId} (${record.patchId}): ${err.message}`);
  }
  if (sha256Hex(patchText) !== record.patchHash) {
    throw new EvidenceError(
      `loaded patch artifact for ${evidenceId} does not hash to record.patchHash; refusing (fail closed)`,
      { evidenceId, patchId: record.patchId },
    );
  }
  return { record, patchText, recordPath, patchPath };
}

/**
 * Resolve one evidence reference to a validated contextual record + verified
 * patch artifact. Used by dirty-worktree cleanup gates (SOL-S03-005).
 *
 * Accepts ONLY:
 * - an evidenceId (`lcim_ev_<32hex>`), resolved under the canonical store, or
 * - an absolute path to a `<evidenceId>.json` record file INSIDE the
 *   canonical Git-common LCIM evidence store.
 *
 * Arbitrary strings, nonexistent paths, foreign paths, malformed records,
 * missing artifacts, and hash mismatches all fail closed.
 *
 * @param {string} repoDir
 * @param {string} ref - evidenceId or in-store record path
 * @returns {{ evidenceId: string, record: object, recordPath: string, patchPath: string }}
 */
export function resolveEvidenceRef(repoDir, ref) {
  const dir = resolvePatchEvidenceDir(repoDir);
  let evidenceId;
  let recordPath;
  if (typeof ref === 'string' && EVIDENCE_ID_PATTERN.test(ref)) {
    evidenceId = ref;
    recordPath = path.join(dir, `${ref}.json`);
  } else if (typeof ref === 'string' && ref.length > 0) {
    const abs = path.resolve(ref);
    if (!isPathWithin(dir, abs)) {
      throw new EvidenceError(
        `evidence ref ${JSON.stringify(ref)} is outside the canonical LCIM evidence store ${dir}; refusing (fail closed)`,
        { ref },
      );
    }
    const base = path.basename(abs);
    if (!base.endsWith('.json')) {
      throw new EvidenceError(`evidence ref ${JSON.stringify(ref)} is not a contextual record file (*.json)`, { ref });
    }
    evidenceId = base.slice(0, -'.json'.length);
    if (!EVIDENCE_ID_PATTERN.test(evidenceId)) {
      throw new EvidenceError(`evidence ref ${JSON.stringify(ref)} does not name an evidence record`, { ref });
    }
    recordPath = abs;
  } else {
    throw new EvidenceError(`invalid evidence ref: ${JSON.stringify(ref)}`, { ref });
  }

  if (!fs.existsSync(recordPath)) {
    throw new EvidenceError(`evidence record does not exist: ${recordPath}`, { ref, recordPath });
  }
  let record;
  try {
    record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
  } catch (err) {
    throw new EvidenceError(`cannot parse evidence record ${recordPath}: ${err.message}`, { ref });
  }
  const validation = validatePatchEvidence(record);
  if (!validation.valid) {
    throw new EvidenceError(
      `evidence record ${evidenceId} failed schema validation: ${validation.errors.map((e) => `${e.path || '(root)'}: ${e.message}`).join('; ')}`,
      { errors: validation.errors },
    );
  }
  if (record.evidenceId !== evidenceId) {
    throw new EvidenceError(
      `evidence record at ${recordPath} self-identifies as ${JSON.stringify(record.evidenceId)}; refusing (fail closed)`,
      { recordPath, evidenceId },
    );
  }
  const patchPath = path.join(dir, `${record.patchId}.patch`);
  if (!fs.existsSync(patchPath)) {
    throw new EvidenceError(
      `patch artifact ${patchPath} referenced by evidence ${evidenceId} is missing; refusing (fail closed)`,
      { evidenceId, patchId: record.patchId },
    );
  }
  const artifactBytes = fs.readFileSync(patchPath);
  if (sha256Hex(artifactBytes) !== record.patchHash) {
    throw new EvidenceError(
      `patch artifact for evidence ${evidenceId} does not hash to record.patchHash; refusing (fail closed)`,
      { evidenceId, patchId: record.patchId },
    );
  }
  return { evidenceId, record, recordPath, patchPath };
}
