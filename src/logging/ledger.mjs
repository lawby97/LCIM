/**
 * LCIM V2 Sprint 01 append-only ledger (events.v2.jsonl).
 *
 * One ledger per run store: <git-common-dir>/lcim/runs/<runId>/events.v2.jsonl.
 * Properties:
 * - Append-only: lines are written with a single write + fsync on an
 *   append-only fd. No in-place edit API exists.
 * - Monotonic sequence: seq starts at 1 and increments by exactly 1.
 * - Integrity chaining: each event carries prevDigest (digest of the
 *   previous line; GENESIS = 64 zeros for seq 1) and its own digest
 *   (sha256 of the canonical JSON of the event excluding its digest field).
 *   Rewriting any historical event breaks every subsequent digest.
 * - Fail-closed lifecycle state machine (checkTransition): exactly one
 *   START, one COMPLETION, one ASSESSMENT per invocation; RECONCILIATION
 *   only for STARTED/COMPLETED invocations and never mutates history.
 * - Crash/orphan handling is EXTERNAL to the ledger: a crashed invocation
 *   is closed by appending an explicit RECONCILIATION (supersession) event.
 * - Concurrency: appends take an advisory lock so linked worktrees sharing
 *   one Git-common run store cannot corrupt the chain.
 *
 * Missing lifecycle events are NOT integrity errors here: an invocation
 * left STARTED or COMPLETED is an incomplete-but-valid ledger; the run
 * finalizer (src/runtime/run-store.mjs) decides COMPLETED vs
 * INCOMPLETE_LEDGER from the resulting state.
 */

import fs from 'node:fs';
import path from 'node:path';
import { canonicalJson, sha256Hex } from './digest.mjs';
import { FINAL_INVOCATION_STATUSES, LEDGER_GENESIS_DIGEST } from './enums.mjs';
import { LedgerIntegrityError, LedgerWriteError } from './errors.mjs';
import { appendLineSync, readJsonlFile, readTailLine, withRunDirLock } from './io.mjs';
import { validateEventInstance } from './schemas.mjs';

/** Canonical ledger file name (specified by Sprint 01). */
export const EVENTS_FILE = 'events.v2.jsonl';

/**
 * Fail-closed transition check for one event against the current per-
 * invocation states. Returns an error message, or null when the transition
 * is legal. Never mutates state.
 */
export function checkTransition(states, ev) {
  const st = states.get(ev.invocationId);
  switch (ev.kind) {
    case 'START':
      if (st) return `duplicate START for invocation ${ev.invocationId}`;
      return null;
    case 'COMPLETION':
      if (!st) return `COMPLETION without START for invocation ${ev.invocationId}`;
      if (st.status !== 'STARTED') {
        return `COMPLETION for invocation ${ev.invocationId} in state ${st.status} (expected STARTED)`;
      }
      return null;
    case 'ASSESSMENT':
      if (!st) return `ASSESSMENT without START for invocation ${ev.invocationId}`;
      if (st.status !== 'COMPLETED') {
        return `ASSESSMENT for invocation ${ev.invocationId} in state ${st.status} (expected COMPLETED)`;
      }
      return null;
    case 'RECONCILIATION':
      if (!st) return `RECONCILIATION for unknown invocation ${ev.invocationId}`;
      if (st.status !== 'STARTED' && st.status !== 'COMPLETED') {
        return `RECONCILIATION for invocation ${ev.invocationId} in state ${st.status} (only STARTED/COMPLETED invocations can be reconciled)`;
      }
      if (ev.replacementInvocationId !== undefined) {
        if (ev.replacementInvocationId === ev.invocationId) {
          return `RECONCILIATION replacement must differ from the superseded invocation ${ev.invocationId}`;
        }
        if (!states.has(ev.replacementInvocationId)) {
          return `RECONCILIATION replacement ${ev.replacementInvocationId} has no START in this run (start the replacement before superseding)`;
        }
      }
      return null;
    default:
      return `unknown event kind ${JSON.stringify(ev.kind)}`;
  }
}

/**
 * Derive per-invocation lifecycle states from ledger events.
 * @returns {{ states: Map<string, object>, errors: Array<{path,message}> }}
 *   errors are invalid TRANSITIONS (duplicate START, COMPLETION without
 *   START, ...). Missing events (STARTED/COMPLETED without ASSESSMENT) are
 *   not errors — they are the incompleteness the finalizer decides on.
 */
export function buildInvocationStates(events) {
  const states = new Map();
  const errors = [];
  for (const ev of events) {
    const problem = checkTransition(states, ev);
    if (problem) {
      errors.push({ path: `seq ${ev.seq}`, message: problem });
      continue;
    }
    let st = states.get(ev.invocationId);
    if (st === undefined) {
      st = newInvocationState(ev);
      states.set(ev.invocationId, st);
    }
    applyEvent(st, ev);
  }
  return { states, errors };
}

function newInvocationState(ev) {
  return {
    invocationId: ev.invocationId,
    runId: ev.runId,
    workUnitId: ev.workUnitId,
    status: undefined,
    counts: { START: 0, COMPLETION: 0, ASSESSMENT: 0, RECONCILIATION: 0 },
    provider: undefined,
    model: undefined,
    role: undefined,
    reasoningEffort: undefined,
    startedAt: undefined,
    completedAt: undefined,
    assessedAt: undefined,
    reconciledAt: undefined,
    outcome: undefined,
    usage: undefined,
    errorCode: undefined,
    rejectionCode: undefined,
    assessmentResult: undefined,
    summary: undefined,
    evidenceRefs: undefined,
    reconciliationReason: undefined,
    supersededByInvocationId: undefined,
    lastSeq: undefined,
  };
}

function applyEvent(st, ev) {
  st.counts[ev.kind] += 1;
  st.lastSeq = ev.seq;
  switch (ev.kind) {
    case 'START':
      st.status = 'STARTED';
      st.startedAt = ev.occurredAt;
      st.provider = ev.provider;
      st.model = ev.model;
      st.role = ev.role;
      st.reasoningEffort = ev.reasoningEffort;
      break;
    case 'COMPLETION':
      st.status = 'COMPLETED';
      st.completedAt = ev.occurredAt;
      st.outcome = ev.outcome;
      st.usage = ev.usage;
      st.errorCode = ev.errorCode;
      st.rejectionCode = ev.rejectionCode;
      break;
    case 'ASSESSMENT':
      st.status = 'ASSESSED';
      st.assessedAt = ev.occurredAt;
      st.assessmentResult = ev.assessmentResult;
      st.summary = ev.summary;
      st.evidenceRefs = ev.evidenceRefs;
      if (ev.rejectionCode !== undefined) st.rejectionCode = ev.rejectionCode;
      break;
    case 'RECONCILIATION':
      st.status = ev.replacementInvocationId !== undefined ? 'SUPERSEDED' : 'ORPHANED';
      st.reconciledAt = ev.occurredAt;
      st.reconciliationReason = ev.reconciliationReason;
      if (ev.replacementInvocationId !== undefined) {
        st.supersededByInvocationId = ev.replacementInvocationId;
      }
      break;
    default:
      break;
  }
}

/**
 * Deterministic ledger summary (also the finalizer's finalSummary shape).
 * @returns {{ events, invocations, starts, completions, assessments,
 *   reconciliations, lastSeq, ledgerDigest, incompleteInvocationIds }}
 */
export function summarizeLedger(events) {
  const { states } = buildInvocationStates(events);
  const lastEvent = events[events.length - 1] ?? null;
  const incompleteInvocationIds = [...states.values()]
    .filter((s) => !FINAL_INVOCATION_STATUSES.includes(s.status))
    .map((s) => s.invocationId)
    .sort();
  const sum = (kind) =>
    [...states.values()].reduce((n, s) => n + s.counts[kind], 0);
  return {
    events: events.length,
    invocations: states.size,
    starts: sum('START'),
    completions: sum('COMPLETION'),
    assessments: sum('ASSESSMENT'),
    reconciliations: sum('RECONCILIATION'),
    lastSeq: lastEvent ? lastEvent.seq : 0,
    ledgerDigest: lastEvent ? lastEvent.digest : LEDGER_GENESIS_DIGEST,
    incompleteInvocationIds,
  };
}

/**
 * Validate the full ledger: canonical chain (seq monotonic from 1,
 * prevDigest links, digest recomputation), per-event schema/kind rules, and
 * transition validity. @returns {{ valid, errors, states, summary }}
 */
export function validateLedger(events) {
  const errors = [];
  let prevDigest = LEDGER_GENESIS_DIGEST;
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    const at = `seq ${i + 1}`;
    if (ev === null || typeof ev !== 'object' || Array.isArray(ev)) {
      errors.push({ path: at, message: `event is not an object: ${JSON.stringify(ev)}` });
      break;
    }
    if (ev.seq !== i + 1) {
      errors.push({ path: at, message: `sequence must be monotonic from 1 (expected ${i + 1}, got ${JSON.stringify(ev.seq)})` });
    }
    if (ev.prevDigest !== prevDigest) {
      errors.push({ path: at, message: `prevDigest mismatch: expected ${prevDigest}, got ${JSON.stringify(ev.prevDigest)}` });
    }
    const recomputed = sha256Hex(canonicalJson({ ...ev, digest: undefined }));
    if (ev.digest !== recomputed) {
      errors.push({ path: at, message: 'digest mismatch: event content or chain was rewritten' });
    }
    const schemaResult = validateEventInstance(ev);
    for (const e of schemaResult.errors) {
      errors.push({ path: `${at}.${e.path || '(root)'}`, message: e.message });
    }
    prevDigest = ev.digest;
  }
  const { states, errors: transitionErrors } = buildInvocationStates(events);
  errors.push(...transitionErrors);
  return {
    valid: errors.length === 0,
    errors,
    states,
    summary: summarizeLedger(events),
  };
}

/**
 * The append-only ledger writer. One instance per open run store; multiple
 * instances (e.g. from linked worktrees) may append concurrently — appends
 * are serialized by the run-dir lock and re-sync with the file tail.
 */
export class Ledger {
  constructor({ runDir, runId }) {
    this.runDir = runDir;
    this.runId = runId;
    this.eventsPath = path.join(runDir, EVENTS_FILE);
    if (!fs.existsSync(this.eventsPath)) {
      throw new LedgerIntegrityError(`ledger file missing: ${this.eventsPath}`);
    }
    this.reload();
  }

  /** Re-read + fully validate the ledger file. Fails closed on any defect. */
  reload() {
    const parsed = readJsonlFile(this.eventsPath);
    if (parsed.errors.length > 0) {
      throw new LedgerIntegrityError(
        `ledger parse errors in ${this.eventsPath}: ${parsed.errors.slice(0, 5).map((e) => `line ${e.line}: ${e.message}`).join('; ')}`,
        { errors: parsed.errors },
      );
    }
    const validation = validateLedger(parsed.events);
    if (!validation.valid) {
      throw new LedgerIntegrityError(
        `ledger validation failed for ${this.eventsPath}: ${validation.errors.slice(0, 5).map((e) => `${e.path}: ${e.message}`).join('; ')}`,
        { errors: validation.errors },
      );
    }
    this.events = parsed.events;
    this.states = validation.states;
    this.lastEvent = this.events[this.events.length - 1] ?? null;
  }

  get lastSeq() {
    return this.lastEvent ? this.lastEvent.seq : 0;
  }

  get lastDigest() {
    return this.lastEvent ? this.lastEvent.digest : LEDGER_GENESIS_DIGEST;
  }

  /**
   * Append one event. `fields` must contain kind/invocationId/workUnitId
   * and any kind-specific fields; seq/occurredAt/prevDigest/digest are
   * computed here. Returns the frozen, fully-chained event.
   */
  async appendEvent(fields) {
    return withRunDirLock(this.runDir, () => this.appendEventLocked(fields));
  }

  /**
   * @private Append one event while the caller ALREADY holds the run-dir
   * lock (the run store's mutation path). Identical to appendEvent() minus
   * lock acquisition, so the authoritative on-disk lifecycle check and the
   * append share one serialization boundary — no nested lock, no
   * check-to-write gap. Must not be called without the lock held.
   */
  appendEventLocked(fields) {
    const beforeCount = this.events.length;
    const tail = readTailLine(this.eventsPath);
    if (tail.torn) {
      throw new LedgerIntegrityError(`torn ledger tail: ${this.eventsPath} does not end with a complete line (crash during a previous write)`);
    }
    if (tail.line === null) {
      if (beforeCount > 0) {
        this.reload();
        if (this.events.length < beforeCount) {
          throw new LedgerIntegrityError('ledger shrank while appending');
        }
      }
    } else {
      let parsedTail;
      try {
        parsedTail = JSON.parse(tail.line);
      } catch (err) {
        throw new LedgerIntegrityError(`cannot parse ledger tail: ${err.message}`);
      }
      if (this.lastEvent === null || parsedTail.seq !== this.lastEvent.seq || parsedTail.digest !== this.lastEvent.digest) {
        this.reload();
        if (this.events.length < beforeCount) {
          throw new LedgerIntegrityError('ledger shrank while appending');
        }
      }
    }

    const ev = {
      ...fields,
      schemaName: 'lcim.event',
      schemaVersion: '1.0.0',
      runId: this.runId,
      seq: this.lastSeq + 1,
      prevDigest: this.lastDigest,
      occurredAt: fields.occurredAt ?? new Date().toISOString(),
    };
    delete ev.digest;
    ev.digest = sha256Hex(canonicalJson(ev));
    // normalize: drop undefined-valued fields so the in-memory event is
    // byte-identical in shape to what canonicalJson writes to the file
    for (const key of Object.keys(ev)) {
      if (ev[key] === undefined) delete ev[key];
    }

    const problem = checkTransition(this.states, ev);
    if (problem) {
      throw new LedgerIntegrityError(problem);
    }
    const schemaResult = validateEventInstance(ev);
    if (!schemaResult.valid) {
      throw new LedgerIntegrityError(
        `invalid ledger event (${schemaResult.errors.map((e) => `${e.path}: ${e.message}`).join('; ')})`,
      );
    }
    const line = `${canonicalJson(ev)}\n`;
    try {
      appendLineSync(this.eventsPath, line);
    } catch (err) {
      throw new LedgerWriteError(`cannot append ledger line: ${err.message}`);
    }

    this.events.push(ev);
    this.states = buildInvocationStates(this.events).states;
    this.lastEvent = ev;
    return Object.freeze({ ...ev });
  }
}
