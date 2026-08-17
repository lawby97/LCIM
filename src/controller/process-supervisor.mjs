/**
 * Controller-owned invocation process-lifetime supervisor (SOL-S10-001, R3).
 *
 * A completed model invocation is NOT complete merely because its direct
 * child exited. Model-controlled code can fork a detached/background process
 * (setsid/new session, new process group, nohup/background shell patterns)
 * that survives the direct child and observes LATER invocations' broker
 * capabilities or mutates the disposable worktree after POST_EXIT
 * assumptions begin.
 *
 * This supervisor gives the controller an invocation-owned process-lifetime
 * boundary with three identity-capture layers plus kernel-style absence
 * verification:
 *
 *   1. ANCESTRY CAPTURE — while the direct child lives, the supervisor
 *      continuously re-reads the macOS process table (`ps -axo
 *      pid,ppid,pgid,state`) and records every descendant of the direct
 *      child. This retains objective process identity BEFORE reparenting
 *      can erase the ancestry (macOS reparents orphans to launchd, pid 1,
 *      even while an ancestor is still alive).
 *   2. PROCESS-GROUP SWEEP — every verification pass also counts any live
 *      process still in the direct child's process group (the direct child
 *      is spawned as a new session/group leader). This catches same-group
 *      background survivors (nohup, `cmd &`) after reparenting, because a
 *      process group id survives reparenting.
 *   3. INVOCATION-ENV MARKER — the boundary environment carries a
 *      per-invocation random marker (LCIM_INVOCATION_MARKER). At quiescence
 *      the supervisor scans `ps -E` for any live process whose environment
 *      still contains this invocation's marker. A process carrying the
 *      marker is BY DEFINITION part of this invocation's tree (the marker
 *      exists only in this invocation's boundary environment). This layer
 *      catches detached watchers that orphan to launchd within a single
 *      scan interval (a child can alter its environment, so this layer is
 *      redundant, not sole, proof — the regression demonstrates the
 *      combined mechanism on genuinely detached processes).
 *
 * Termination is by retained identity: SIGTERM to every identified survivor,
 * a grace window, then SIGKILL, then repeated fresh-table verification. If
 * any identified process remains (or the process table is unreadable), the
 * supervisor reports quiescenceVerified=false and the controller FAILS
 * CLOSED: no completion state, no patch extraction, no next invocation, no
 * future capability.
 *
 * The supervisor never reads or persists command lines or environment
 * values — evidence contains pids, identities, counts, and outcomes only.
 * The process table is an injectable seam (processTable) so the controller
 * can deterministically exercise the fail-closed path.
 *
 * SOL-S10-001 R4: for MODEL invocations this supervisor is DEFENSE IN DEPTH
 * / DIAGNOSTIC ONLY. The primary descendant-prevention proof is
 * CHILD_CREATION_STRUCTURALLY_DENIED (the bound Seatbelt profile denies
 * process-fork/posix_spawn; see execution-boundary.mjs) plus direct process
 * exit. When `childCreationStructurallyDenied` is set, quiescence evidence
 * records that primary proof; if the supervisor nevertheless observes a
 * live descendant, the sandbox invariant was violated and the controller
 * FAILS CLOSED. Polling/process-table races are no longer the authority
 * for model invocations.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { LcimError, ConfigError } from '../shared/errors.mjs';
import { canonicalJson } from '../logging/digest.mjs';

export const PROCESS_LIFETIME_EVIDENCE_SCHEMA = 'lcim.process-lifetime';
export const PROCESS_LIFETIME_EVIDENCE_VERSION = '1.0.0';
export const INVOCATION_MARKER_ENV = 'LCIM_INVOCATION_MARKER';

/** Default supervisor cadence (ms). */
const DEFAULT_POLL_INTERVAL_MS = 100;
const DEFAULT_TERMINATE_GRACE_MS = 3000;
const DEFAULT_VERIFY_GRACE_MS = 5000;
const PS_TIMEOUT_MS = 5000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

// Process inspection is a controller security primitive. Never resolve it
// through PATH: a target/user-controlled PATH must not decide whether an
// orphaned Pi process exists.
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
      // fallback for process-lifetime authority.
    }
  }
  throw new ConfigError('controller could not establish a canonical absolute ps executable; process-tree quiescence cannot be proven');
}

export const PROCESS_TABLE_EXECUTABLE = resolveCanonicalPsExecutable();

export class ProcessLifetimeError extends LcimError {
  constructor(message, details = null) {
    super(message, 'PROCESS_TREE_QUIESCENCE_FAILED', details);
  }
}

function parsePsLine(line) {
  const fields = line.trim().split(/\s+/);
  const pid = Number.parseInt(fields[0] ?? '', 10);
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  return {
    pid,
    ppid: Number.parseInt(fields[1] ?? '', 10) || 0,
    pgid: Number.parseInt(fields[2] ?? '', 10) || 0,
    state: String(fields[3] ?? '').trim(),
  };
}

function runPs(args) {
  const result = spawnSync(PROCESS_TABLE_EXECUTABLE, args, {
    encoding: 'utf8',
    timeout: PS_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error !== undefined && result.error !== null) {
    throw new ProcessLifetimeError('controller process supervisor could not execute the macOS process table command; process-tree quiescence cannot be proven (fail closed)', {
      args: args.map((a) => (a.length > 120 ? `${a.slice(0, 120)}…` : a)),
      error: result.error?.message ?? String(result.error),
    });
  }
  if (result.status !== 0) {
    throw new ProcessLifetimeError('controller process supervisor could not read the macOS process table; process-tree quiescence cannot be proven (fail closed)', {
      args: args.map((a) => (a.length > 120 ? `${a.slice(0, 120)}…` : a)),
      status: result.status,
      stderrDigest: crypto.createHash('sha256').update(result.stderr ?? '').digest('hex'),
    });
  }
  return result.stdout;
}

/**
 * The default macOS process table: canonical absolute `/bin/ps` (realpath
 * pinned at module load) only, no command lines or environment persistence.
 * `onBegin(rootPid)` is the test seam hook a
 * wrapped table may use to learn the direct-child identity.
 */
export function createPsProcessTable() {
  const list = () => {
    const out = runPs(['-axo', 'pid=,ppid=,pgid=,state=']);
    const rows = [];
    for (const line of out.split('\n')) {
      const row = parsePsLine(line);
      if (row !== null) rows.push(row);
    }
    return rows;
  };
  const listWithEnv = () => {
    // macOS ps -E appends the environment after the command on each line.
    // Used ONLY for a marker substring match; never persisted.
    return runPs(['-E', '-axo', 'pid=,ppid=,state=,command=']).split('\n');
  };
  const kill = (pid, signal) => {
    if (!Number.isSafeInteger(pid) || pid <= 1) return false;
    try {
      process.kill(pid, signal);
      return true;
    } catch {
      return false;
    }
  };
  return Object.freeze({ list, listWithEnv, kill, onBegin: null });
}

/**
 * Create one invocation-owned process supervisor.
 *
 * @param {object} options
 * @param {string} options.invocationId - canonical invocation identity
 * @param {string} options.workUnitId - owning work unit
 * @param {string|null} [options.invocationMarker] - LCIM_INVOCATION_MARKER
 *   value bound into this invocation's boundary environment
 * @param {object|null} [options.processTable] - injectable process table
 *   (default: createPsProcessTable()); test seam for fail-closed paths
 * @param {number} [options.pollIntervalMs=100]
 * @param {number} [options.terminateGraceMs=3000] - SIGTERM grace window
 * @param {number} [options.verifyGraceMs=5000] - SIGKILL verify window
 */
export function createProcessSupervisor({
  invocationId,
  workUnitId,
  invocationMarker = null,
  processTable = null,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  terminateGraceMs = DEFAULT_TERMINATE_GRACE_MS,
  verifyGraceMs = DEFAULT_VERIFY_GRACE_MS,
  childCreationStructurallyDenied = false,
} = {}) {
  if (typeof invocationId !== 'string' || invocationId.length === 0) {
    throw new ConfigError('process supervisor requires the canonical invocation identity');
  }
  if (typeof workUnitId !== 'string' || workUnitId.length === 0) {
    throw new ConfigError('process supervisor requires the owning work unit identity');
  }
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 10 || pollIntervalMs > 5000) {
    throw new ConfigError('process supervisor pollIntervalMs is out of bounds');
  }
  const table = processTable ?? createPsProcessTable();
  if (table === null || typeof table !== 'object' || typeof table.list !== 'function') {
    throw new ConfigError('process supervisor requires a process table with a list() function');
  }

  let rootPid = null;
  let rootPgid = null;
  let began = false;
  const tracked = new Map(); // pid -> { pid, firstSeenAt, source, pgid }
  let timer = null;
  let scanCount = 0;
  let lastScanAt = null;
  let result = null;
  let processTableFailure = null;
  let markerScanFailure = null;
  const startedAt = Date.now();
  const sentSignals = { sigterm: new Set(), sigkill: new Set() };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /** Structural primary proof for the new model boundary (R4). */
  const structuralEvidence = childCreationStructurallyDenied
    ? Object.freeze({
      primaryProof: 'CHILD_CREATION_STRUCTURALLY_DENIED',
      childCreationStructurallyDenied: true,
      supervisorRole: 'DEFENSE_IN_DEPTH',
      note: 'the bound Seatbelt profile denies process-fork/posix_spawn; the direct process cannot create a surviving descendant, so the supervisor is diagnostic only. If a descendant is observed anyway, the sandbox invariant was violated and the controller fails closed.',
    })
    : Object.freeze({ primaryProof: 'PROCESS_TREE_QUIESCENCE', supervisorRole: 'PRIMARY' });

  function validRow(row) {
    return row !== null
      && typeof row === 'object'
      && Number.isSafeInteger(row.pid) && row.pid > 0
      && Number.isSafeInteger(row.ppid) && row.ppid >= 0
      && Number.isSafeInteger(row.pgid) && row.pgid >= 0
      && typeof row.state === 'string';
  }

  function readRows() {
    try {
      const rows = table.list();
      if (!Array.isArray(rows) || !rows.every(validRow)) throw new Error('malformed process table rows');
      return rows;
    } catch {
      processTableFailure = 'process-table-unreadable';
      return null;
    }
  }

  function scan() {
    if (!began || rootPid === null) return [];
    const all = readRows();
    if (all === null) return null;
    const byPpid = new Map();
    for (const row of all) {
      if (!byPpid.has(row.ppid)) byPpid.set(row.ppid, []);
      byPpid.get(row.ppid).push(row);
    }
    const queue = [rootPid];
    const seen = new Set();
    while (queue.length > 0) {
      const pid = queue.shift();
      for (const child of byPpid.get(pid) ?? []) {
        if (seen.has(child.pid) || child.pid === rootPid || child.pid <= 1) continue;
        seen.add(child.pid);
        if (!tracked.has(child.pid)) {
          tracked.set(child.pid, {
            pid: child.pid,
            pgid: child.pgid,
            firstSeenAt: new Date().toISOString(),
            source: 'ancestry',
          });
        }
        queue.push(child.pid);
      }
    }
    scanCount += 1;
    lastScanAt = new Date().toISOString();
    return all;
  }

  function markerCandidates() {
    if (invocationMarker === null || invocationMarker.length === 0) return new Set();
    try {
      if (typeof table.listWithEnv !== 'function') throw new Error('marker enumeration unavailable');
      const lines = table.listWithEnv();
      if (!Array.isArray(lines) || !lines.every((line) => typeof line === 'string')) throw new Error('malformed marker process table');
      const out = new Set();
      for (const line of lines) {
        if (!line.includes(invocationMarker)) continue;
        const pid = Number.parseInt(line.trim().split(/\s+/)[0] ?? '', 10);
        if (!Number.isSafeInteger(pid) || pid <= 1) throw new Error('marker row did not contain a valid pid');
        out.add(pid);
      }
      return out;
    } catch {
      markerScanFailure = 'marker-scan-unreadable';
      return null;
    }
  }

  /**
   * Live survivors include the direct root itself, every retained
   * descendant, every member of its process group, and every marker match.
   * The root must never disappear from the proof merely because it has no
   * descendants.
   */
  function survivorsFrom(all, marker) {
    const byPid = new Map(all.map((row) => [row.pid, row]));
    const survivors = new Set();
    const root = byPid.get(rootPid);
    if (root !== undefined && !root.state.startsWith('Z')) survivors.add(rootPid);
    for (const pid of tracked.keys()) {
      const row = byPid.get(pid);
      if (row !== undefined && !row.state.startsWith('Z')) survivors.add(pid);
    }
    if (rootPgid !== null) {
      for (const row of all) {
        if (row.pgid === rootPgid && !row.state.startsWith('Z')) survivors.add(row.pid);
      }
    }
    for (const pid of marker) survivors.add(pid);
    return survivors;
  }

  async function waitForAbsence(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const all = scan();
      const marker = markerCandidates();
      if (all === null || marker === null) return null;
      if (survivorsFrom(all, marker).size === 0) return new Set();
      await sleep(Math.min(pollIntervalMs, 50));
    }
    const final = scan();
    const marker = markerCandidates();
    return final === null || marker === null ? null : survivorsFrom(final, marker);
  }

  /** Record the direct child identity and begin continuous tracking. */
  function begin(pid) {
    if (!Number.isSafeInteger(pid) || pid <= 1) return false;
    rootPid = pid;
    if (typeof table.onBegin === 'function') table.onBegin(pid);
    began = true;
    const all = readRows();
    const rootRow = all?.find((row) => row.pid === pid);
    rootPgid = rootRow?.pgid ?? pid;
    scan();
    timer = setInterval(() => { scan(); }, pollIntervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    return true;
  }

  /**
   * Terminate all identified model-controlled processes and prove absence.
   * A table/marker inspection failure is never converted to an empty set.
   */
  async function quiesce({ terminate = true } = {}) {
    if (result !== null) return result;
    if (!began || rootPid === null) {
      result = Object.freeze({
        schemaName: PROCESS_LIFETIME_EVIDENCE_SCHEMA,
        schemaVersion: PROCESS_LIFETIME_EVIDENCE_VERSION,
        invocationId,
        workUnitId,
        mechanism: 'controller-owned macOS process supervisor (ancestry capture, process-group sweep, invocation-env marker)',
        directProcess: null,
        trackedDescendantCount: 0,
        trackedDescendants: [],
        markerMatches: [],
        terminationAttempted: false,
        termination: null,
        processTableReadable: true,
        markerScanVerified: true,
        rootPidAbsent: true,
        processGroupAbsent: true,
        markerAbsent: true,
        processAbsenceVerified: true,
        quiescenceVerified: true,
        remainingPids: [],
        scanCount: 0,
        lastScanAt: null,
        reason: 'no provider process was spawned for this invocation',
        verifiedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        ...structuralEvidence,
      });
      return result;
    }
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    let all = scan();
    let marker = markerCandidates();
    if (marker !== null) {
      for (const pid of marker) {
        if (!tracked.has(pid) && pid !== rootPid) {
          tracked.set(pid, { pid, pgid: null, firstSeenAt: new Date().toISOString(), source: 'env-marker' });
        }
      }
    }
    let survivors = all === null || marker === null ? null : survivorsFrom(all, marker);
    const terminationAttempted = terminate && survivors !== null && survivors.size > 0;
    if (terminate && survivors !== null && survivors.size > 0) {
      if (typeof table.kill !== 'function') {
        processTableFailure = 'process-termination-unavailable';
        survivors = null;
      } else {
        for (const pid of survivors) {
          if (table.kill(pid, 'SIGTERM')) sentSignals.sigterm.add(pid);
        }
        const afterTerm = await waitForAbsence(terminateGraceMs);
        if (afterTerm === null) {
          survivors = null;
        } else if (afterTerm.size > 0) {
          survivors = afterTerm;
          for (const pid of survivors) {
            if (table.kill(pid, 'SIGKILL')) sentSignals.sigkill.add(pid);
          }
          survivors = await waitForAbsence(verifyGraceMs);
        } else {
          survivors = new Set();
        }
      }
    }

    // Fresh final verification includes root pid, retained descendants,
    // process group, and marker matches. Every failure is NOT PROVEN.
    const finalRows = scan();
    const finalMarker = markerCandidates();
    const processTableReadable = finalRows !== null && processTableFailure === null;
    const markerScanVerified = finalMarker !== null && markerScanFailure === null;
    const root = finalRows === null ? null : finalRows.find((row) => row.pid === rootPid && !row.state.startsWith('Z'));
    const rootPidAbsent = processTableReadable && root === undefined;
    const processGroupAbsent = processTableReadable
      && (rootPgid === null || !finalRows.some((row) => row.pgid === rootPgid && !row.state.startsWith('Z')));
    const markerAbsent = markerScanVerified && finalMarker.size === 0;
    const finalSurvivors = processTableReadable && markerScanVerified
      ? survivorsFrom(finalRows, finalMarker)
      : null;
    const quiescenceVerified = processTableReadable
      && markerScanVerified
      && rootPidAbsent
      && processGroupAbsent
      && markerAbsent
      && finalSurvivors.size === 0;

    const evidence = {
      schemaName: PROCESS_LIFETIME_EVIDENCE_SCHEMA,
      schemaVersion: PROCESS_LIFETIME_EVIDENCE_VERSION,
      invocationId,
      workUnitId,
      mechanism: childCreationStructurallyDenied
        ? 'defense-in-depth controller-owned macOS process supervisor (ancestry capture, process-group sweep, invocation-env marker); primary proof is the Seatbelt process-fork denial bound into the invocation execution boundary'
        : 'controller-owned macOS process supervisor: continuous ancestry capture while the direct child lives + process-group sweep + invocation-env marker scan; SIGTERM then SIGKILL by retained identity; fresh-table absence verification',
      directProcess: Object.freeze({ pid: rootPid, processGroup: rootPgid }),
      ...structuralEvidence,
      trackedDescendantCount: tracked.size,
      trackedDescendants: Object.freeze([...tracked.values()].map((entry) => Object.freeze({
        pid: entry.pid,
        firstSeenAt: entry.firstSeenAt,
        source: entry.source,
      }))),
      // Fifth-review rule: an unreadable/malformed marker scan is UNKNOWN
      // (null), never an empty set — absence must be positively verified.
      markerMatches: Object.freeze(finalMarker === null ? null : [...finalMarker]),
      terminationAttempted,
      termination: Object.freeze({
        sigtermPids: Object.freeze([...sentSignals.sigterm]),
        sigkillPids: Object.freeze([...sentSignals.sigkill]),
      }),
      processTableReadable,
      markerScanVerified,
      rootPidAbsent,
      processGroupAbsent,
      markerAbsent,
      processAbsenceVerified: quiescenceVerified,
      quiescenceVerified,
      // Fifth-review rule: unknown survivor state is UNKNOWN (null), never
      // an empty array — a missing survivor list must not look like proof.
      remainingPids: Object.freeze(finalSurvivors === null ? null : [...finalSurvivors]),
      processTableFailure,
      markerScanFailure,
      scanCount,
      lastScanAt,
      verifiedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    };
    result = Object.freeze(evidence);
    return result;
  }

  /** Stop background tracking without a verification decision. */
  function dispose() {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  return Object.freeze({
    begin,
    quiesce,
    dispose,
    snapshot: () => Object.freeze({
      invocationId,
      began,
      rootPid,
      rootPgid,
      trackedDescendantCount: tracked.size,
      scanCount,
      lastScanAt,
      settled: result !== null,
      childCreationStructurallyDenied,
    }),
  });
}

/** Generate one invocation-boundary marker (public-safe random hex). */
export function generateInvocationMarker() {
  return crypto.randomBytes(12).toString('hex');
}

/**
 * Terminate every live process whose environment still carries an
 * invocation marker (crash-recovery sweep for orphaned controller-side Pi
 * SOL processes). SIGTERM, grace window, SIGKILL, then a fresh-table
 * verification. Never infers absence that was not observed: `remaining`
 * lists every pid still carrying the marker after the sweep.
 *
 * @param {string} marker - invocation marker (LCIM_INVOCATION_MARKER value)
 * @param {object} [options] - { processTable, terminateGraceMs, verifyGraceMs }
 * @returns {Readonly<object>} frozen { identified, sigterm, sigkill, remaining }
 */
export function terminateProcessesByMarker(marker, { processTable = null, terminateGraceMs = 3000, verifyGraceMs = 5000 } = {}) {
  if (typeof marker !== 'string' || marker.length === 0) {
    throw new ConfigError('marker-based termination requires a non-empty marker');
  }
  const table = processTable ?? createPsProcessTable();
  const scan = () => {
    try {
      if (typeof table?.listWithEnv !== 'function') return null;
      const lines = table.listWithEnv();
      if (!Array.isArray(lines) || !lines.every((line) => typeof line === 'string')) return null;
      const pids = new Set();
      for (const line of lines) {
        if (!line.includes(marker)) continue;
        const pid = Number.parseInt(line.trim().split(/\s+/)[0] ?? '', 10);
        if (!Number.isSafeInteger(pid) || pid <= 1) return null;
        pids.add(pid);
      }
      return pids;
    } catch {
      return null; // unreadable/malformed table: absence cannot be proven
    }
  };
  const identified = scan();
  const sent = { sigterm: [], sigkill: [] };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitForAbsence = async (targets, timeoutMs) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const current = scan();
      if (current === null) {
        await sleep(50);
        continue;
      }
      const remaining = new Set([...current].filter((pid) => targets.has(pid)));
      if (remaining.size === 0) return new Set();
      await sleep(50);
    }
    const final = scan();
    if (final === null) return null;
    return new Set([...final].filter((pid) => targets.has(pid)));
  };
  return Promise.resolve().then(async () => {
    let remaining = identified === null ? null : new Set(identified);
    if (identified !== null && identified.size > 0) {
      for (const pid of identified) {
        try {
          if (table.kill(pid, 'SIGTERM')) sent.sigterm.push(pid);
        } catch {
          // process already gone; absence is proven by the final scan
        }
      }
      const afterTerm = await waitForAbsence(identified, terminateGraceMs);
      if (afterTerm === null) {
        remaining = null;
      } else if (afterTerm.size > 0) {
        for (const pid of afterTerm) {
          try {
            if (table.kill(pid, 'SIGKILL')) sent.sigkill.push(pid);
          } catch {
            // process already gone; absence is proven by the final scan
          }
        }
        const afterKill = await waitForAbsence(afterTerm, verifyGraceMs);
        remaining = afterKill === null ? null : afterKill;
      } else {
        remaining = new Set();
      }
    }
    const finalScan = scan();
    const finalRemaining = finalScan === null ? null : new Set(finalScan);
    return Object.freeze({
      // Fifth-review rule: an unreadable/malformed process table is
      // UNKNOWN (null), never an empty set.
      identified: Object.freeze(identified === null ? null : [...identified].sort((a, b) => a - b)),
      sigterm: Object.freeze(sent.sigterm),
      sigkill: Object.freeze(sent.sigkill),
      remaining: Object.freeze(finalRemaining === null ? null : [...finalRemaining].sort((a, b) => a - b)),
      verified: finalScan !== null,
    });
  });
}

/**
 * Persist controller-owned, public-safe process-lifetime evidence. Never
 * contains command lines, environment values, or raw transcripts.
 */
export function persistProcessLifetimeEvidence(runDir, invocationId, evidence) {
  if (typeof runDir !== 'string' || runDir.length === 0) throw new ConfigError('run directory is required');
  if (typeof invocationId !== 'string' || invocationId.length === 0) throw new ConfigError('invocation id is required');
  if (evidence === null || typeof evidence !== 'object') throw new ConfigError('process-lifetime evidence must be an object');
  const dir = path.join(runDir, 'controller', 'process-lifetime');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${invocationId}.json`);
  fs.writeFileSync(file, `${canonicalJson(evidence)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return file;
}
