/**
 * LCIM V2 Sprint 08 projection serialization.
 *
 * Deterministic, atomic local writes of the Sprint-08 projections:
 * invocations.jsonl, work-units.jsonl, reviews.jsonl, usage.jsonl,
 * final.json. All files live under the target repository's Git common
 * directory (never tracked; guards forbid *.jsonl in the source tree) and
 * are written temp+rename so readers never observe partial output. The
 * JSONL lines use canonical JSON (sorted keys) so identical canonical
 * stores produce byte-identical projection files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { canonicalJson } from '../logging/digest.mjs';
import { writeJsonAtomic } from '../logging/io.mjs';
import { AuditError } from './errors.mjs';

/** Canonical JSONL serialization of projection lines. */
export function serializeJsonl(lines) {
  // An empty JSONL stream is empty, not a single invalid blank record.
  if (lines.length === 0) return '';
  return `${lines.map((line) => canonicalJson(line)).join('\n')}\n`;
}

/** Atomic text write (temp + fsync + rename), mirroring writeJsonAtomic. */
export function writeTextAtomic(file, text) {
  const tmp = path.join(path.dirname(file), `.tmp-${path.basename(file)}-${randomBytes(4).toString('hex')}`);
  let fd;
  try {
    fd = fs.openSync(tmp, 'w');
    fs.writeFileSync(fd, text);
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
    throw new AuditError(`cannot write ${file}: ${err.message}`);
  }
}

/** Deterministic selection hash: first 12 hex chars of sha256(run ids). */
export function selectionHash(runIds) {
  const sorted = [...runIds].sort();
  return createHash('sha256').update(canonicalJson(sorted)).digest('hex').slice(0, 12);
}

/** Audit output dir name for a selection. */
export function auditDirName(last, runIds) {
  const scope = last === null ? 'all' : `last-${last}`;
  return `${scope}-${selectionHash(runIds)}`;
}

/**
 * Write the five projection files into `dir` (created on demand).
 * @returns {string[]} file names written, in fixed order.
 */
export function writeProjections(dir, { invocations, workUnits, reviews, usage, result }) {
  fs.mkdirSync(dir, { recursive: true });
  writeTextAtomic(path.join(dir, 'invocations.jsonl'), serializeJsonl(invocations));
  writeTextAtomic(path.join(dir, 'work-units.jsonl'), serializeJsonl(workUnits));
  writeTextAtomic(path.join(dir, 'reviews.jsonl'), serializeJsonl(reviews));
  writeTextAtomic(path.join(dir, 'usage.jsonl'), serializeJsonl(usage));
  writeJsonAtomic(path.join(dir, 'final.json'), result);
  return ['invocations.jsonl', 'work-units.jsonl', 'reviews.jsonl', 'usage.jsonl', 'final.json'];
}
