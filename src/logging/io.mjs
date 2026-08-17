/**
 * LCIM V2 Sprint 01 run-store I/O helpers.
 *
 * All run-store files live under <git-common-dir>/lcim/runs/<runId>/ (never
 * tracked). File writes are atomic (temp file + fsync + rename) so a crash
 * cannot leave a half-written run.json / invocation record. The ledger
 * append is a single writeSync + fsync on an append-only fd.
 *
 * withRunDirLock serializes ledger appends and finalization across sessions
 * (linked worktrees share one Git-common run store, so two controller
 * sessions can append to the same run concurrently).
 */

import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { RunStoreError } from './errors.mjs';

/** Persistent append-only owner queue used by the run-store mutex. */
export const LOCK_DIR_NAME = '.lcim.lock';
export const LOCK_QUEUE_FILE = 'owners.jsonl';
const LOCK_TIMEOUT_MS = 15_000;
const LOCK_RETRY_MS = 25;
const PS_TIMEOUT_MS = 5_000;
const LOCK_RECORD_VERSION = 1;

// Canonical absolute ps for owner-liveness verification (never PATH).
function resolveCanonicalPsExecutable() {
  for (const candidate of ['/bin/ps', '/usr/bin/ps']) {
    try {
      const stat = fs.lstatSync(candidate);
      if (stat.isSymbolicLink() || !stat.isFile()) continue;
      const resolved = fs.realpathSync(candidate);
      const resolvedStat = fs.statSync(resolved);
      if (!resolvedStat.isFile()) continue;
      fs.accessSync(resolved, fs.constants.X_OK);
      return resolved;
    } catch {
      // Try the next canonical system location only; PATH is never a
      // fallback for lock-owner liveness authority.
    }
  }
  throw new RunStoreError('controller could not establish a canonical absolute ps executable; lock-owner liveness cannot be verified');
}
const LOCK_PS_EXECUTABLE = resolveCanonicalPsExecutable();

/**
 * Read the recorded process start time of a pid (epoch ms) via canonical
 * ps, or null when unverifiable.
 */
function readProcessStartEpoch(pid) {
  try {
    const result = spawnSync(LOCK_PS_EXECUTABLE, ['-o', 'lstart=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: PS_TIMEOUT_MS,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0 || result.error) return null;
    const text = String(result.stdout ?? '').trim();
    if (text.length === 0) return null;
    const epoch = Date.parse(text);
    return Number.isFinite(epoch) ? epoch : null;
  } catch {
    return null;
  }
}

/**
 * Owner-verified liveness: the recorded owner is DEAD only when the pid no
 * longer exists (ESRCH) OR the pid was reused by a different process (its
 * recorded process-start epoch no longer matches). Unverifiable state
 * (ps failure) is UNKNOWN and never treated as dead — the lock is then
 * only releasable by its real owner or by timeout (fail closed). This is
 * what prevents an old owner's stale lock from being stolen from a live
 * successor, and prevents pid-reuse from wedging recovery forever.
 */
function ownerIsDead(owner) {
  if (owner === null || typeof owner !== 'object' || !Number.isSafeInteger(owner?.pid) || owner.pid <= 0) {
    // No owner record yet: not "dead", just not established.
    return false;
  }
  let alive = true;
  try {
    process.kill(owner.pid, 0);
  } catch (error) {
    if (error?.code === 'ESRCH') return true; // no such process: dead
    alive = true; // EPERM or unknown: assume alive unless start differs
  }
  if (!alive) return false;
  if (typeof owner.processStartedAt !== 'number' || !Number.isFinite(owner.processStartedAt)) {
    // Unverifiable start: never steal (fail closed).
    return false;
  }
  const current = readProcessStartEpoch(owner.pid);
  if (current === null) return false; // UNKNOWN: never steal
  return current !== owner.processStartedAt; // pid reused by a different process
}

function fsyncDirectory(dir) {
  let fd;
  try {
    fd = fs.openSync(dir, fs.constants.O_RDONLY);
    fs.fsyncSync(fd);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function ensureLockQueue(runDir) {
  const lockDir = path.join(runDir, LOCK_DIR_NAME);
  let created = false;
  try {
    fs.mkdirSync(lockDir, { mode: 0o700 });
    created = true;
  } catch (error) {
    if (error?.code !== 'EEXIST') {
      throw new RunStoreError(`cannot create run lock queue directory ${lockDir}: ${error.message}`);
    }
  }
  let stat;
  try { stat = fs.lstatSync(lockDir); } catch (error) {
    throw new RunStoreError(`cannot inspect run lock queue directory ${lockDir}: ${error.message}`);
  }
  if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o077) !== 0) {
    throw new RunStoreError(`run lock queue must be a private regular directory at ${lockDir}`);
  }
  const unexpected = fs.readdirSync(lockDir).filter((name) => name !== LOCK_QUEUE_FILE);
  if (unexpected.length > 0) {
    throw new RunStoreError(`run lock queue contains unrecognized legacy/foreign state at ${lockDir}; ownership is UNKNOWN`);
  }
  if (created) {
    fsyncDirectory(lockDir);
    fsyncDirectory(path.dirname(lockDir));
  }
  return { lockDir, queueFile: path.join(lockDir, LOCK_QUEUE_FILE) };
}

function validateLockRecord(record, line) {
  const validBase = record !== null
    && typeof record === 'object'
    && !Array.isArray(record)
    && record.version === LOCK_RECORD_VERSION
    && (record.type === 'ACQUIRE' || record.type === 'RELEASE')
    && Number.isSafeInteger(record.pid)
    && record.pid > 0
    && typeof record.nonce === 'string'
    && /^[0-9a-f]{32}$/.test(record.nonce)
    && typeof record.processStartedAt === 'number'
    && Number.isFinite(record.processStartedAt)
    && typeof record.recordedAt === 'string'
    && Number.isFinite(Date.parse(record.recordedAt));
  if (!validBase) throw new RunStoreError(`run lock queue contains an invalid owner record at line ${line}`);
  return record;
}

function readLockQueue(queueFile) {
  let fd;
  try {
    fd = fs.openSync(queueFile, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw new RunStoreError(`cannot open run lock owner queue ${queueFile}: ${error.message}`);
  }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) {
      throw new RunStoreError(`run lock owner queue must be a private regular file at ${queueFile}`);
    }
    const raw = fs.readFileSync(fd, 'utf8');
    if (raw.length === 0) return [];
    if (!raw.endsWith('\n')) {
      throw new RunStoreError(`run lock owner queue has an incomplete tail at ${queueFile}; lock state is UNKNOWN`);
    }
    const records = raw.slice(0, -1).split('\n').map((line, index) => {
      try { return validateLockRecord(JSON.parse(line), index + 1); } catch (error) {
        if (error instanceof RunStoreError) throw error;
        throw new RunStoreError(`run lock owner queue is malformed at line ${index + 1}; lock state is UNKNOWN`);
      }
    });
    const acquired = new Set();
    const released = new Set();
    for (const record of records) {
      if (record.type === 'ACQUIRE') {
        if (acquired.has(record.nonce)) throw new RunStoreError('run lock owner queue contains a duplicate ACQUIRE record');
        acquired.add(record.nonce);
      } else {
        if (!acquired.has(record.nonce) || released.has(record.nonce)) {
          throw new RunStoreError('run lock owner queue contains an unmatched or duplicate RELEASE record');
        }
        released.add(record.nonce);
      }
    }
    return records;
  } finally {
    fs.closeSync(fd);
  }
}

function appendLockRecord(lockDir, queueFile, record) {
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
  let fd;
  try {
    fd = fs.openSync(
      queueFile,
      fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o077) !== 0) {
      throw new RunStoreError(`run lock owner queue must be a private regular file at ${queueFile}`);
    }
    // One O_APPEND write gives every contender one immutable position in a
    // kernel-ordered queue. Never split a record across writes: a short
    // write leaves an UNKNOWN tail and all later acquisition fails closed.
    const written = fs.writeSync(fd, bytes, 0, bytes.length);
    if (written !== bytes.length) throw new RunStoreError(`short append to run lock owner queue at ${queueFile}`);
    fs.fsyncSync(fd);
  } catch (error) {
    if (error instanceof RunStoreError) throw error;
    throw new RunStoreError(`cannot append run lock owner record at ${queueFile}: ${error.message}`);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  fsyncDirectory(lockDir);
}

function lockBlocker(records, nonce) {
  const released = new Set(records.filter((record) => record.type === 'RELEASE').map((record) => record.nonce));
  const ownIndex = records.findIndex((record) => record.type === 'ACQUIRE' && record.nonce === nonce);
  if (ownIndex < 0) throw new RunStoreError('new run lock owner record was not observable after fsync; lock state is UNKNOWN');
  for (let index = 0; index < ownIndex; index += 1) {
    const record = records[index];
    if (record.type !== 'ACQUIRE' || released.has(record.nonce)) continue;
    if (ownerIsDead(record)) continue;
    return record;
  }
  return null;
}

/** Read + parse a JSON file. Throws RunStoreError on any failure. */
export function readJsonFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new RunStoreError(`cannot read ${file}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new RunStoreError(`cannot parse ${file}: ${err.message}`);
  }
}

/**
 * Owner-verified cross-process lock (sixth-review rule).
 *
 * Every contender appends one immutable ACQUIRE record to a persistent,
 * O_APPEND-ordered queue. It enters only after every earlier owner either
 * appended its own matching RELEASE or is verifiably dead (ESRCH / pid
 * start-epoch mismatch). Release only appends the caller's nonce; no owner,
 * stale observer, or delayed releaser ever deletes or replaces shared lock
 * state, so an old owner cannot delete a successor lock. UNKNOWN owner or
 * malformed/torn queue state fails closed.
 */
export async function withRunDirLock(runDir, fn, { timeoutMs = LOCK_TIMEOUT_MS, retryMs = LOCK_RETRY_MS } = {}) {
  if (typeof runDir !== 'string' || runDir.length === 0 || typeof fn !== 'function') {
    throw new RunStoreError('run lock requires a run directory and callback');
  }
  const { lockDir, queueFile } = ensureLockQueue(runDir);
  const nonce = randomBytes(16).toString('hex');
  const processStartedAt = readProcessStartEpoch(process.pid);
  if (processStartedAt === null) {
    throw new RunStoreError(`cannot verify the run lock owner's process start time at ${lockDir}; acquisition fails closed`);
  }
  appendLockRecord(lockDir, queueFile, {
    version: LOCK_RECORD_VERSION,
    type: 'ACQUIRE',
    pid: process.pid,
    nonce,
    processStartedAt,
    recordedAt: new Date().toISOString(),
  });
  const deadline = Date.now() + timeoutMs;
  try {
    for (;;) {
      const blocker = lockBlocker(readLockQueue(queueFile), nonce);
      if (blocker === null) break;
      if (Date.now() >= deadline) {
        throw new RunStoreError(`timed out waiting for run store lock at ${lockDir} (earlier owner pid ${blocker.pid} is live or UNKNOWN; no lock state was stolen)`);
      }
      await new Promise((resolve) => setTimeout(resolve, retryMs));
    }
    return await fn();
  } finally {
    appendLockRecord(lockDir, queueFile, {
      version: LOCK_RECORD_VERSION,
      type: 'RELEASE',
      pid: process.pid,
      nonce,
      processStartedAt,
      recordedAt: new Date().toISOString(),
    });
  }
}

/**
 * Atomically write a JSON file: write a temp file in the same directory,
 * fsync, then rename over the target. Readers never observe a partial file.
 */
export function writeJsonAtomic(file, obj) {
  const tmp = path.join(path.dirname(file), `.tmp-${path.basename(file)}-${randomBytes(4).toString('hex')}`);
  let fd;
  try {
    fd = fs.openSync(tmp, 'w');
    fs.writeFileSync(fd, `${JSON.stringify(obj, null, 2)}\n`);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(tmp, file);
  } catch (err) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        /* best effort */
      }
    }
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* best effort */
    }
    throw new RunStoreError(`cannot write ${file}: ${err.message}`);
  }
}

/** Append one line to a file with a single write + fsync (append-only). */
export function appendLineSync(file, line) {
  const fd = fs.openSync(file, 'a');
  try {
    fs.writeSync(fd, line);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Parse a JSONL file.
 * @returns {{ events: object[], errors: Array<{line:number, message:string}> }}
 *   Parse-level errors only (empty lines, invalid JSON, torn tail). Chain
 *   and lifecycle validation is the caller's job.
 */
export function readJsonlFile(file) {
  const events = [];
  const errors = [];
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new RunStoreError(`cannot read ${file}: ${err.message}`);
  }
  if (raw.length > 0 && !raw.endsWith('\n')) {
    errors.push({ line: raw.split('\n').length, message: 'torn tail: file does not end with a newline' });
  }
  const lines = raw.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  lines.forEach((line, i) => {
    if (line.trim() === '') {
      errors.push({ line: i + 1, message: 'empty line' });
      return;
    }
    try {
      events.push(JSON.parse(line));
    } catch (err) {
      errors.push({ line: i + 1, message: `invalid JSON: ${err.message}` });
    }
  });
  return { events, errors };
}

/**
 * Read the last line of a file (tail scan of at most 64 KiB, sufficient for
 * bounded ledger events).
 * @returns {{ line: string|null, torn: boolean }} `line` is the raw text of
 *   the last line, or null for an empty file. `torn` is true when the file
 *   does not end with a newline (crash during write) — callers fail closed.
 */
export function readTailLine(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    if (size === 0) return { line: null, torn: false };
    const chunkSize = Math.min(size, 64 * 1024);
    const buf = Buffer.alloc(chunkSize);
    fs.readSync(fd, buf, 0, chunkSize, size - chunkSize);
    const chunk = buf.toString('utf8');
    if (!chunk.endsWith('\n')) return { line: null, torn: true };
    const body = chunk.slice(0, -1);
    const lastNewline = body.lastIndexOf('\n');
    return { line: lastNewline >= 0 ? body.slice(lastNewline + 1) : body, torn: false };
  } finally {
    fs.closeSync(fd);
  }
}
