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
import fs from 'node:fs';
import path from 'node:path';
import { RunStoreError } from './errors.mjs';

/** Name of the advisory lock directory inside a run store. */
export const LOCK_DIR_NAME = '.lcim.lock';
const LOCK_STALE_MS = 60_000;
const LOCK_TIMEOUT_MS = 15_000;
const LOCK_RETRY_MS = 25;

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

/**
 * Serialize a critical section across sessions with an advisory lock
 * directory (atomic mkdir). Stale locks (older than LOCK_STALE_MS) are
 * removed; otherwise the caller waits up to LOCK_TIMEOUT_MS and then fails
 * closed.
 */
export async function withRunDirLock(runDir, fn) {
  const lockDir = path.join(runDir, LOCK_DIR_NAME);
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      fs.mkdirSync(lockDir);
      break;
    } catch (err) {
      if (err.code !== 'EEXIST') {
        throw new RunStoreError(`cannot create lock directory ${lockDir}: ${err.message}`);
      }
      try {
        const st = fs.statSync(lockDir);
        if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
          fs.rmSync(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch {
        // lock directory vanished; retry immediately
        continue;
      }
      if (Date.now() >= deadline) {
        throw new RunStoreError(`timed out waiting for run store lock at ${lockDir}`);
      }
      await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
    }
  }
  try {
    return await fn();
  } finally {
    try {
      fs.rmSync(lockDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}
