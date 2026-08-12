/**
 * LCIM V2 Sprint 01 optional compressed raw event/transcript sink.
 *
 * Local-only, best-effort, per-session: when a run store is created with
 * enableRawSink, every ledger line is mirrored into
 * <runDir>/raw/raw.jsonl.gz (gzip stream) and future provider adapters may
 * append raw transcript lines via RunStore.appendRaw().
 *
 * Guarantees (documented in docs/v2-logging-contract.md):
 * - The sink is NEVER authoritative (the ledger is) and is NEVER read by
 *   the reader/validator.
 * - Raw data is NEVER committed (it lives under <git-common-dir>/lcim) and
 *   is NEVER part of normal review export (Sprint 08).
 * - The gzip stream cannot be resumed after a crash: the sink is per-
 *   session and closed by finalize/abort/close. A torn raw file is
 *   acceptable and is discarded, never validated, never repaired.
 */

import fs from 'node:fs';
import zlib from 'node:zlib';
import { RawSinkError } from './errors.mjs';

/** Canonical raw sink file name inside the run store. */
export const RAW_FILE = 'raw.jsonl.gz';

export class RawSink {
  /**
   * @param {string} file absolute path of the .gz output file (parent dir
   *   must exist)
   */
  constructor(file) {
    this.file = file;
    this.ended = false;
    this.stream = fs.createWriteStream(file, { flags: 'w' });
    this.gzip = zlib.createGzip();
    this.gzip.pipe(this.stream);
    this.gzip.on('error', () => {
      this.ended = true;
    });
    // best-effort contract: stream failures (e.g. the run dir is removed
    // after a crash) must never become uncaught exceptions
    this.stream.on('error', () => {
      this.ended = true;
    });
  }

  /** Append one line of raw text (already serialized). */
  append(text) {
    if (this.ended) throw new RawSinkError(`raw sink already closed: ${this.file}`);
    try {
      this.gzip.write(text);
    } catch (err) {
      throw new RawSinkError(`cannot write raw sink ${this.file}: ${err.message}`);
    }
  }

  /** Close the gzip stream; resolves when the file is flushed. Idempotent. */
  end() {
    if (this.ended) return Promise.resolve();
    this.ended = true;
    return new Promise((resolve, reject) => {
      this.stream.on('close', resolve);
      this.stream.on('error', reject);
      this.gzip.end();
    });
  }
}
