/**
 * Sprint 03 LCIM-created worktree registry.
 *
 * Append-only JSONL registry under `<git-common-dir>/lcim/worktrees/
 * registry.jsonl`. This is the controller-owned record of which worktrees
 * LCIM created, rooted at which base, for which work unit. Runtime state
 * never lives in tracked source directories (canonical root:
 * `<git-common-dir>/lcim`, see `src/config/runtime-path.mjs`).
 *
 * Identity and concurrency discipline (SOL-S03-006 / SOL-S03-007):
 *
 * - Every event line is STRICTLY validated: worktreeId (`lcim_wt_<32hex>`),
 *   workUnitId (`lcim_wu_<32hex>`), event (CREATED/REMOVED), baseSha
 *   (40-hex), absolute worktreePath, ISO `at`, and only the known optional
 *   fields (evidenceRefs, pruned). Malformed lines and unknown fields fail
 *   closed (`WorktreeSafetyError`) — never silently skipped.
 * - Lifecycle transitions are validated per worktreeId: the first event must
 *   be CREATED, followed by at most one REMOVED. A second CREATED for the
 *   same id, an event after REMOVED, or an event before CREATED is an
 *   impossible transition and fails closed. Worktree ids are unique per
 *   creation and are never reused. Validation happens on the COMPLETE
 *   tentative sequence (existingEvents + proposedEvent) BEFORE any byte is
 *   appended (SOL-S03-FINAL-002): an invalid transition is rejected without
 *   ever writing — the registry bytes remain exactly unchanged (fail before
 *   write, never append-then-rollback).
 * - A physical path may be claimed by AT MOST ONE active (latest CREATED)
 *   record. Creating a worktree at a path that is still actively claimed
 *   fails closed, so stale ownership can never authorize removal of a
 *   replacement (a crashed controller that never recorded REMOVED keeps its
 *   path quarantined until cleanup closes the lifecycle).
 * - All registry mutations are serialized through a local Git-common LCIM
 *   registry lock (exclusive-create lock file with stale-lock breaking), so
 *   concurrent controller processes never interleave or corrupt lines and
 *   read-check-append cycles stay atomic.
 * - CREATED events may carry the controller-created ownership marker
 *   identity (`markerId`, SOL-S03-FINAL-001): the registry references the
 *   marker, but registry data alone can never synthesize the marker file
 *   inside a foreign worktree's Git admin directory.
 */

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { assertNoTrackedFilesUnder, resolveGitCommonDir } from '../config/runtime-path.mjs';
import { isValidId } from '../shared/ids.mjs';
import { FULL_SHA_PATTERN } from './base.mjs';
import { normalizePath } from './state.mjs';
import { WorktreeSafetyError } from './errors.mjs';
import { isValidOwnershipMarkerId } from './worktree-ownership.mjs';

export const WORKTREE_EVENT = Object.freeze(['CREATED', 'REMOVED']);

/** LCIM worktree ids: `lcim_wt_<32 hex>`. Not a shared ID kind (Sprint 00). */
export function generateWorktreeId() {
  return `lcim_wt_${randomBytes(16).toString('hex')}`;
}

export function isValidWorktreeId(value) {
  return typeof value === 'string' && /^lcim_wt_[0-9a-f]{32}$/.test(value);
}

const ISO_AT_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$/;
const EVENT_KEYS = Object.freeze(['worktreeId', 'workUnitId', 'worktreePath', 'baseSha', 'event', 'at', 'evidenceRefs', 'pruned', 'markerId']);

/** Registry file: `<git-common-dir>/lcim/worktrees/registry.jsonl`. */
export function resolveWorktreeRegistryFile(repoDir) {
  return path.join(resolveGitCommonDir(repoDir), 'lcim', 'worktrees', 'registry.jsonl');
}

/** Registry lock: `<git-common-dir>/lcim/worktrees/.registry.lock`. */
export function resolveWorktreeRegistryLock(repoDir) {
  return path.join(resolveGitCommonDir(repoDir), 'lcim', 'worktrees', '.registry.lock');
}

const LOCK_RETRIES = 100;
const LOCK_RETRY_MS = 20;
const LOCK_STALE_MS = 10_000;

/**
 * Run `fn` while holding the local registry lock (exclusive-create lock
 * file, stale-lock breaking, bounded retries). Mutations are serialized
 * across controller processes WITHOUT globally serializing worker
 * execution — only registry ownership mutations are serialized.
 */
export function withWorktreeRegistryLock(repoDir, fn) {
  const lockPath = resolveWorktreeRegistryLock(repoDir);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  assertNoTrackedFilesUnder(path.dirname(lockPath), repoDir);
  let fd = null;
  for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
    try {
      fd = fs.openSync(lockPath, 'wx');
      break;
    } catch (err) {
      if (!err || err.code !== 'EEXIST') {
        throw new WorktreeSafetyError(`cannot acquire worktree registry lock ${lockPath}: ${err.message}`, { lockPath });
      }
      let stale = false;
      try {
        stale = Date.now() - fs.statSync(lockPath).mtimeMs > LOCK_STALE_MS;
      } catch {
        stale = true; // lock vanished between attempts
      }
      if (stale) {
        try {
          fs.rmSync(lockPath, { force: true });
        } catch {
          /* raced with another breaker; retry */
        }
      }
      const sleepMs = LOCK_RETRY_MS;
      const until = Date.now() + sleepMs;
      while (Date.now() < until) {
        // busy-ish wait without Atomics.wait on the main thread
      }
    }
  }
  if (fd === null) {
    throw new WorktreeSafetyError(`could not acquire worktree registry lock ${lockPath} after ${LOCK_RETRIES} attempts`, { lockPath });
  }
  try {
    fs.writeFileSync(fd, `${JSON.stringify({ pid: process.pid, at: new Date().toISOString() })}\n`);
    return fn();
  } finally {
    try {
      fs.closeSync(fd);
    } finally {
      fs.rmSync(lockPath, { force: true });
    }
  }
}

/**
 * Strictly validate one parsed registry event line. Throws
 * WorktreeSafetyError on any malformed field.
 */
export function validateWorktreeEvent(parsed, { file, line }) {
  const where = `worktree registry line ${line} in ${file}`;
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new WorktreeSafetyError(`malformed ${where}: not an object`);
  }
  for (const key of Object.keys(parsed)) {
    if (!EVENT_KEYS.includes(key)) {
      throw new WorktreeSafetyError(`malformed ${where}: unknown field ${JSON.stringify(key)}`);
    }
  }
  if (!isValidWorktreeId(parsed.worktreeId)) {
    throw new WorktreeSafetyError(`malformed ${where}: invalid worktreeId ${JSON.stringify(parsed.worktreeId)}`);
  }
  if (!WORKTREE_EVENT.includes(parsed.event)) {
    throw new WorktreeSafetyError(`malformed ${where}: invalid event ${JSON.stringify(parsed.event)}`);
  }
  if (!isValidId('work-unit', parsed.workUnitId)) {
    throw new WorktreeSafetyError(`malformed ${where}: invalid workUnitId ${JSON.stringify(parsed.workUnitId)}`);
  }
  if (typeof parsed.worktreePath !== 'string' || parsed.worktreePath.length === 0 || !path.isAbsolute(parsed.worktreePath)) {
    throw new WorktreeSafetyError(`malformed ${where}: worktreePath must be an absolute path`);
  }
  if (typeof parsed.baseSha !== 'string' || !FULL_SHA_PATTERN.test(parsed.baseSha)) {
    throw new WorktreeSafetyError(`malformed ${where}: baseSha must be a 40-hex sha`);
  }
  if (typeof parsed.at !== 'string' || !ISO_AT_PATTERN.test(parsed.at)) {
    throw new WorktreeSafetyError(`malformed ${where}: at must be an ISO-8601 timestamp`);
  }
  if (parsed.evidenceRefs !== undefined && (!Array.isArray(parsed.evidenceRefs) || parsed.evidenceRefs.some((r) => typeof r !== 'string' || r.length === 0))) {
    throw new WorktreeSafetyError(`malformed ${where}: evidenceRefs must be an array of non-empty strings`);
  }
  if (parsed.pruned !== undefined && typeof parsed.pruned !== 'boolean') {
    throw new WorktreeSafetyError(`malformed ${where}: pruned must be a boolean`);
  }
  if (parsed.markerId !== undefined && !isValidOwnershipMarkerId(parsed.markerId)) {
    throw new WorktreeSafetyError(`malformed ${where}: invalid markerId ${JSON.stringify(parsed.markerId)}`);
  }
  return parsed;
}

/**
 * Validate lifecycle transitions across all events: for each worktreeId the
 * sequence must be exactly CREATED followed by at most one REMOVED.
 * Worktree ids are unique per creation and never reused.
 */
export function assertValidRegistryTransitions(events, { file }) {
  const byId = new Map();
  for (const [i, event] of events.entries()) {
    const seq = byId.get(event.worktreeId) ?? [];
    if (event.event === 'CREATED') {
      if (seq.length > 0) {
        throw new WorktreeSafetyError(
          `impossible worktree registry transition in ${file} (event ${i + 1}): worktreeId ${event.worktreeId} already has events ${seq.join(' -> ')}; ids are never reused`,
          { worktreeId: event.worktreeId, sequence: seq },
        );
      }
    } else {
      // REMOVED
      if (seq.length !== 1 || seq[0] !== 'CREATED') {
        throw new WorktreeSafetyError(
          `impossible worktree registry transition in ${file} (event ${i + 1}): REMOVED for worktreeId ${event.worktreeId} without a preceding CREATED (sequence ${seq.join(' -> ') || 'empty'})`,
          { worktreeId: event.worktreeId, sequence: seq },
        );
      }
    }
    seq.push(event.event);
    byId.set(event.worktreeId, seq);
  }
  return events;
}

/**
 * Append one registry event. The mutation is serialized under the registry
 * lock; CREATED events additionally enforce the one-active-record-per-path
 * claim and per-id lifecycle rules. `extra` may only contain the known
 * optional fields (evidenceRefs, pruned, markerId).
 *
 * SOL-S03-FINAL-002: before ANY byte is written, the COMPLETE tentative
 * lifecycle (strictly validated existingEvents + the proposed event) must
 * be transition-valid. Duplicate CREATED, REMOVED for an unknown id,
 * duplicate REMOVED, CREATED after REMOVED, malformed events, and invalid
 * field shapes all throw BEFORE the append — the registry bytes stay
 * exactly unchanged (fail-before-write; never append-then-rollback, never
 * repair/rewrite existing history).
 */
export function recordWorktreeEvent({ repoDir, worktreeId, workUnitId, worktreePath, baseSha, event, ...extra }) {
  const file = resolveWorktreeRegistryFile(repoDir);
  const line = {
    worktreeId,
    workUnitId,
    worktreePath: path.resolve(worktreePath),
    baseSha,
    event,
    at: new Date().toISOString(),
    ...extra,
  };
  // Validate BEFORE locking (fail fast on programmer error), then re-validate
  // under the lock as part of the strict file-level parse.
  validateWorktreeEvent(line, { file, line: 'new' });
  return withWorktreeRegistryLock(repoDir, () => {
    const events = loadWorktreeEventsUnlocked(repoDir);
    // Validate the COMPLETE tentative sequence (existing + proposed) under
    // the lock, BEFORE any write. An invalid transition must never be
    // persisted, not even transiently.
    assertValidRegistryTransitions([...events, line], { file });
    if (event === 'CREATED') {
      const target = normalizePath(line.worktreePath);
      const claimant = activeWorktreeRecordsUnlocked(events).find((r) => normalizePath(r.worktreePath) === target);
      if (claimant !== undefined && claimant.worktreeId !== line.worktreeId) {
        throw new WorktreeSafetyError(
          `worktree path ${target} is already claimed by active LCIM worktree record ${claimant.worktreeId}; identities never reuse paths — close the stale lifecycle first`,
          { worktreePath: target, claimantWorktreeId: claimant.worktreeId, worktreeId: line.worktreeId },
        );
      }
    }
    fs.appendFileSync(file, `${JSON.stringify(line)}\n`);
    return line;
  });
}

/** Read all registry events in order. Throws on a malformed line. */
export function loadWorktreeEvents(repoDir) {
  return withWorktreeRegistryLock(repoDir, () => loadWorktreeEventsUnlocked(repoDir));
}

/** Read + strictly validate registry events (caller must hold the lock). */
function loadWorktreeEventsUnlocked(repoDir) {
  const file = resolveWorktreeRegistryFile(repoDir);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const events = [];
  for (const [i, line] of lines.entries()) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      throw new WorktreeSafetyError(`malformed worktree registry line ${i + 1} in ${file}: ${err.message}`, {
        file,
        line: i + 1,
      });
    }
    events.push(validateWorktreeEvent(parsed, { file, line: i + 1 }));
  }
  return assertValidRegistryTransitions(events, { file });
}

/**
 * All records whose latest event per worktreeId is CREATED (i.e. the
 * lifecycle is still open). Strictly validated and transition-valid.
 */
export function activeWorktreeRecords(repoDir) {
  return withWorktreeRegistryLock(repoDir, () => activeWorktreeRecordsUnlocked(loadWorktreeEventsUnlocked(repoDir)));
}

/** @param {Array<object>} events - strictly validated events */
function activeWorktreeRecordsUnlocked(events) {
  const latest = new Map();
  for (const event of events) {
    latest.set(event.worktreeId, event);
  }
  return [...latest.values()].filter((record) => record.event === 'CREATED');
}

/**
 * Find the active LCIM registry record for a controller-retained
 * worktreeId. Returns null when the id is unknown or its lifecycle is
 * closed (latest event REMOVED). Lookup is IDENTITY-bound — never path-based.
 */
export function findCreatedWorktree(repoDir, worktreeId) {
  if (!isValidWorktreeId(worktreeId)) {
    throw new WorktreeSafetyError(`invalid worktreeId ${JSON.stringify(worktreeId)}`);
  }
  const record = activeWorktreeRecords(repoDir).find((r) => r.worktreeId === worktreeId);
  return record ?? null;
}

/**
 * Assert that no ACTIVE LCIM registry record claims `target` (normalized
 * path). Used by createIsolatedWorktree before spawning a new worktree so a
 * path with an open lifecycle can never be reused by a different identity.
 */
export function assertWorktreePathNotClaimed(repoDir, target) {
  return withWorktreeRegistryLock(repoDir, () => {
    const events = loadWorktreeEventsUnlocked(repoDir);
    const claimant = activeWorktreeRecordsUnlocked(events).find((r) => normalizePath(r.worktreePath) === normalizePath(target));
    if (claimant !== undefined) {
      throw new WorktreeSafetyError(
        `worktree path ${target} is already claimed by active LCIM worktree record ${claimant.worktreeId} (${claimant.event} at ${claimant.at}); refusing to reuse a claimed path`,
        { worktreePath: target, claimantWorktreeId: claimant.worktreeId },
      );
    }
    return true;
  });
}
