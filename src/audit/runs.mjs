/**
 * LCIM V2 Sprint 08 run discovery, validation, and chronological `--last N`.
 *
 * Canonical run stores are validated independently by Sprint-01 before use.
 * Per-run structural/read defects become deterministic invalid-run records;
 * only top-level runtime discovery/resolution failures abort the audit.
 * Sprint-01 schemas permit ISO offsets, so selection is chronological by
 * epoch instant (createdAt), with runId as the stable equal-instant tie
 * break — never lexical timestamp ordering.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ConfigError } from '../shared/errors.mjs';
import { isValidId } from '../shared/ids.mjs';
import { resolveRuntimeRoot } from '../config/runtime-path.mjs';
import { readLedger, validateRunStore } from '../logging/reader.mjs';
import { buildInvocationStates } from '../logging/ledger.mjs';
import { safeDigest } from './sanitize.mjs';
import { compareRunsByCreatedAt, parseTimestamp } from './time.mjs';

export const RUNS_DIR = 'runs';

/** Validate `last`: null = all, otherwise a positive integer. */
export function assertLastParam(last) {
  if (last === null || last === undefined) return null;
  if (typeof last !== 'number' || !Number.isInteger(last)) {
    throw new ConfigError(`audit/review-export 'last' must be a positive integer or null (all runs), got ${JSON.stringify(last)}`);
  }
  if (last < 1) {
    throw new ConfigError(`audit/review-export 'last' must be a positive integer, got ${last}`);
  }
  return last;
}

/** List candidate run directories under runtimeRoot/runs (top-level errors propagate). */
export function discoverRunDirs(runtimeRoot) {
  const runsDir = path.join(runtimeRoot, RUNS_DIR);
  if (!fs.existsSync(runsDir)) return [];
  return fs
    .readdirSync(runsDir, { withFileTypes: true })
    // A symlink is not a canonical run directory, even when it points at
    // one. Never follow it while discovering audit inputs.
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort()
    .map((runId) => ({ runId, runDir: path.join(runsDir, runId) }));
}

function invalid(runId, runDir, detail, run = null, summary = null) {
  return {
    runId,
    runDir,
    run,
    summary,
    states: new Map(),
    errors: [{ code: 'INVALID_CANONICAL_RUN', detailDigest: safeDigest(detail) }],
    valid: false,
  };
}

/** Verify every ledger timestamp used by Sprint-08 ordering is a real instant. */
function assertCanonicalStateTimestamps(states, run) {
  for (const field of ['createdAt', 'finalizedAt', 'abortedAt']) {
    if (run[field] !== undefined && run[field] !== null) parseTimestamp(run[field]);
  }
  for (const st of states.values()) {
    for (const field of ['startedAt', 'completedAt', 'assessedAt', 'reconciledAt']) {
      if (st[field] !== undefined && st[field] !== null) parseTimestamp(st[field]);
    }
  }
}

/**
 * Load one run store. All per-run exceptions (I/O, a directory replacing a
 * ledger file, malformed JSON, timestamp that matches a regex but is not a
 * real instant) are captured as an invalid result, allowing other runs to
 * be audited.
 */
export function loadRunStore({ runId, runDir }) {
  if (!isValidId('run', runId)) {
    return invalid(runId, runDir, 'invalid run directory identity');
  }
  try {
    const validation = validateRunStore(runDir);
    if (!validation.valid) {
      return {
        runId,
        runDir,
        run: validation.run,
        summary: validation.summary,
        states: new Map(),
        errors: validation.errors.map((error) => ({
          code: 'INVALID_CANONICAL_RUN',
          detailDigest: safeDigest(`${error.path ?? ''}\u0000${error.message ?? ''}`),
        })),
        valid: false,
      };
    }
    const parsed = readLedger(runDir);
    // validateRunStore already validated parsing/chain; this is an
    // independent canonical state derivation for projections/reconciliation.
    if (parsed.errors.length > 0) {
      return invalid(runId, runDir, 'ledger parse mismatch after validation', validation.run, validation.summary);
    }
    const states = buildInvocationStates(parsed.events).states;
    assertCanonicalStateTimestamps(states, validation.run);
    return {
      runId,
      runDir,
      run: validation.run,
      summary: validation.summary,
      states,
      errors: [],
      valid: true,
    };
  } catch (err) {
    return invalid(runId, runDir, `${err?.name ?? 'Error'}\u0000${err?.message ?? ''}`);
  }
}

/** Selection key exposed for tests: exact UTC instant + stable run identity. */
export function selectionKey(loaded) {
  return { createdAt: parseTimestamp(loaded.run.createdAt), runId: loaded.runId };
}

/**
 * Select all / newest N valid runs. Results are returned chronological
 * ascending for deterministic projection output; `last` is applied from
 * the chronological end.
 */
export function selectRuns(loaded, last) {
  const valid = loaded.filter((line) => line.valid).sort(compareRunsByCreatedAt);
  const invalidRuns = loaded.filter((line) => !line.valid).sort((a, b) => (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0));
  const firstSelected = last === null ? 0 : Math.max(0, valid.length - last);
  return {
    selected: valid.slice(firstSelected),
    outOfWindow: valid.slice(0, firstSelected),
    invalid: invalidRuns,
  };
}

/** Runtime root for an audit/review-export invocation. */
export function resolveAuditRuntimeRoot(cwd) {
  return resolveRuntimeRoot(cwd);
}
