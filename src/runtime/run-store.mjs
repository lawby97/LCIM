/**
 * LCIM V2 Sprint 01 run store.
 *
 * Run state lives under <git-common-dir>/lcim/runs/<runId>/ (resolved by
 * src/config/runtime-path.mjs; never tracked; linked worktrees share one
 * Git-common store). Layout:
 *
 *   run.json                  lcim.run record (created OPEN; finalizer/
 *                             abort() transitions it; anchored to the
 *                             ledger end once finalized)
 *   events.v2.jsonl           append-only integrity-chained ledger
 *   invocations/<id>.json     compact invocation projections
 *   raw/raw.jsonl.gz          optional compressed raw sink (best-effort)
 *
 * Responsibilities:
 * - canonical invocation lifecycle wrapper (src/logging/invocation.mjs);
 * - crash/orphan reconciliation via explicit RECONCILIATION events
 *   (reconcileInvocation / reconcileOrphans) — never mutation;
 * - run finalizer: detects cardinality failures (incomplete lifecycles)
 *   and marks INCOMPLETE_LEDGER while preserving all ledger evidence;
 * - abort(): explicit controller stop (ABORTED, appends refused);
 * - fail-closed open/append after finalization.
 *
 * Cross-process lifecycle authority (SOL-S01-001): the ON-DISK run.json
 * lifecycleState is authoritative for EVERY mutation. Every mutation path
 * acquires the run-dir lock, re-reads run.json from disk while holding it,
 * requires lifecycleState === 'OPEN', and only then writes. A session that
 * opened the run while OPEN cannot append/finalize/abort after another
 * session made the run terminal — its stale in-memory state never
 * authorizes a write.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getVersionInfo } from '../config/version.mjs';
import { assertNoTrackedFilesUnder, resolveRunDir } from '../config/runtime-path.mjs';
import { generateId, isValidId } from '../shared/ids.mjs';
import { ConfigError } from '../shared/errors.mjs';
import { canonicalJson } from '../logging/digest.mjs';
import { INVOCATION_ROLE, RECONCILIATION_REASON } from '../logging/enums.mjs';
import {
  LedgerFinalizedError,
  LedgerIntegrityError,
  RunStoreError,
} from '../logging/errors.mjs';
import { readJsonFile, readJsonlFile, writeJsonAtomic, withRunDirLock } from '../logging/io.mjs';
import { EVENTS_FILE, Ledger, validateLedger } from '../logging/ledger.mjs';
import { Invocation } from '../logging/invocation.mjs';
import { RawSink, RAW_FILE } from '../logging/raw-sink.mjs';
import {
  INVOCATIONS_DIR,
  RAW_DIR,
  RUN_JSON,
  checkProjections,
  validateRunStore,
} from '../logging/reader.mjs';
import { stampSprintRecord, validateSprintRecord } from '../logging/schemas.mjs';

const SHA40 = /^[0-9a-f]{40}$/;
const SHA64 = /^[0-9a-f]{64}$/;
const MAX_NOTE = 500;

export class RunStore {
  constructor({ cwd, runId, runDir, record, ledger, rawSink }) {
    this.cwd = cwd;
    this.runId = runId;
    this.runDir = runDir;
    this.record = record;
    this.ledger = ledger;
    this.rawSink = rawSink;
    this.runJsonPath = path.join(runDir, RUN_JSON);
    this.finalState = record.lifecycleState === 'OPEN' ? null : record.lifecycleState;
  }

  /**
   * Create a new run store. Generates the run id, writes run.json (OPEN)
   * and the empty ledger, and (optionally) opens the raw sink.
   * @param {{ cwd?: string, targetBaseSha: string, configDigest: string,
   *   options?: { enableRawSink?: boolean } }} params
   */
  static async create({ cwd = process.cwd(), targetBaseSha, configDigest, options = {} }) {
    const { enableRawSink = false } = options;
    if (typeof targetBaseSha !== 'string' || !SHA40.test(targetBaseSha)) {
      throw new ConfigError(`targetBaseSha must be a 40-hex git sha, got ${JSON.stringify(targetBaseSha)}`);
    }
    if (typeof configDigest !== 'string' || !SHA64.test(configDigest)) {
      throw new ConfigError(`configDigest must be a 64-hex sha256 digest, got ${JSON.stringify(configDigest)}`);
    }
    const runId = generateId('run');
    const runDir = resolveRunDir(cwd, runId);
    if (fs.existsSync(runDir)) {
      throw new RunStoreError(`run store already exists: ${runDir}`);
    }
    assertNoTrackedFilesUnder(runDir, cwd);
    fs.mkdirSync(path.join(runDir, INVOCATIONS_DIR), { recursive: true });
    if (enableRawSink) {
      fs.mkdirSync(path.join(runDir, RAW_DIR), { recursive: true });
    }
    const info = getVersionInfo();
    const record = stampSprintRecord('lcim.run', {
      runId,
      lifecycleState: 'OPEN',
      lcimVersion: info.version,
      lcimCommit: info.gitCommit,
      targetBaseSha,
      configDigest,
      createdAt: new Date().toISOString(),
      storeVersion: '1',
      finalizedAt: null,
      abortedAt: null,
      abortNote: null,
      finalSummary: null,
    });
    writeJsonAtomic(path.join(runDir, RUN_JSON), record);
    fs.writeFileSync(path.join(runDir, EVENTS_FILE), '');
    const ledger = new Ledger({ runDir, runId });
    const rawSink = enableRawSink ? new RawSink(path.join(runDir, RAW_DIR, RAW_FILE)) : null;
    return new RunStore({ cwd, runId, runDir, record, ledger, rawSink });
  }

  /**
   * Open an existing run store (crash recovery, linked worktrees, later
   * sessions). Fails closed when the store is corrupt: missing/unparseable
   * run.json, ledger defects, or a ledger end that contradicts a finalized
   * run's finalSummary anchor.
   * @param {{ cwd?: string, runId: string }} params
   */
  static async open({ cwd = process.cwd(), runId }) {
    if (!isValidId('run', runId)) {
      throw new ConfigError(`invalid run id: ${JSON.stringify(runId)}`);
    }
    const runDir = resolveRunDir(cwd, runId);
    if (!fs.existsSync(runDir)) {
      throw new RunStoreError(`run store does not exist: ${runDir}`);
    }
    const runJsonPath = path.join(runDir, RUN_JSON);
    if (!fs.existsSync(runJsonPath)) {
      throw new RunStoreError(`run store is missing ${RUN_JSON}: ${runJsonPath}`);
    }
    let parsed;
    try {
      parsed = readJsonFile(runJsonPath);
    } catch (err) {
      throw new RunStoreError(`cannot open run store: ${err.message}`);
    }
    const validation = validateSprintRecord('lcim.run', parsed);
    if (!validation.valid) {
      throw new RunStoreError(`run record is invalid: ${validation.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`);
    }
    const ledger = new Ledger({ runDir, runId });
    const store = new RunStore({ cwd, runId, runDir, record: parsed, ledger, rawSink: null });
    if (
      (parsed.lifecycleState === 'COMPLETED' || parsed.lifecycleState === 'INCOMPLETE_LEDGER') &&
      (parsed.finalSummary === null || parsed.finalizedAt === null)
    ) {
      throw new RunStoreError(`run ${runId} claims ${parsed.lifecycleState} but is missing finalSummary/finalizedAt`);
    }
    if (store.finalState !== null && parsed.finalSummary !== null) {
      const last = ledger.lastEvent;
      const actualSeq = last ? last.seq : 0;
      const actualDigest = last ? last.digest : undefined;
      if (parsed.finalSummary.lastSeq !== actualSeq || parsed.finalSummary.ledgerDigest !== actualDigest) {
        throw new LedgerIntegrityError(
          `ledger end does not match the finalized run anchor (run ${runId} may have been truncated or rewritten)`,
        );
      }
    }
    return store;
  }

  /**
   * Start an invocation: append the START event and create the compact
   * invocation record. Returns the Invocation wrapper (the lifecycle API
   * future provider adapters use).
   */
  async startInvocation({ workUnitId, provider, model, role, reasoningEffort, occurredAt } = {}) {
    if (!isValidId('work-unit', workUnitId)) {
      throw new ConfigError(`invalid workUnitId: ${JSON.stringify(workUnitId)}`);
    }
    for (const [field, value] of [
      ['provider', provider],
      ['model', model],
      ['reasoningEffort', reasoningEffort],
    ]) {
      if (typeof value !== 'string' || value.length === 0) {
        throw new ConfigError(`${field} must be a non-empty string`);
      }
    }
    if (!INVOCATION_ROLE.includes(role)) {
      throw new ConfigError(`invalid role ${JSON.stringify(role)} (expected one of ${INVOCATION_ROLE.join(', ')})`);
    }
    const invocationId = generateId('invocation');
    await this._appendInvocationEvent({
      kind: 'START',
      invocationId,
      workUnitId,
      provider,
      model,
      role,
      reasoningEffort,
      occurredAt,
    });
    return new Invocation(this, invocationId);
  }

  /**
   * Reconcile (supersede) one invocation that never reached ASSESSED:
   * appends an explicit RECONCILIATION event; the invocation becomes
   * ORPHANED (no replacement) or SUPERSEDED (replacement given). Never
   * mutates history.
   */
  async reconcileInvocation({ invocationId, reason, replacementInvocationId, note, occurredAt } = {}) {
    if (!isValidId('invocation', invocationId)) {
      throw new ConfigError(`invalid invocationId: ${JSON.stringify(invocationId)}`);
    }
    if (!RECONCILIATION_REASON.includes(reason)) {
      throw new ConfigError(`invalid reconciliation reason ${JSON.stringify(reason)} (expected one of ${RECONCILIATION_REASON.join(', ')})`);
    }
    if (replacementInvocationId !== undefined && !isValidId('invocation', replacementInvocationId)) {
      throw new ConfigError(`invalid replacementInvocationId: ${JSON.stringify(replacementInvocationId)}`);
    }
    if (note !== undefined && (typeof note !== 'string' || note.length === 0 || note.length > MAX_NOTE)) {
      throw new ConfigError(`note must be a bounded non-empty string (max ${MAX_NOTE} chars)`);
    }
    return this._appendInvocationEvent({
      kind: 'RECONCILIATION',
      invocationId,
      reconciliationReason: reason,
      replacementInvocationId,
      note,
      occurredAt,
    });
  }

  /**
   * Reconcile every STARTED/COMPLETED invocation (crash-recovery helper):
   * CRASH_AFTER_START / CRASH_AFTER_COMPLETION respectively. Returns the
   * appended reconciliation events.
   */
  async reconcileOrphans({ occurredAt } = {}) {
    this.assertWritable();
    const targets = [...this.ledger.states.values()]
      .filter((s) => s.status === 'STARTED' || s.status === 'COMPLETED')
      .map((s) => s.invocationId)
      .sort();
    const events = [];
    for (const invocationId of targets) {
      const st = this.ledger.states.get(invocationId);
      events.push(
        await this.reconcileInvocation({
          invocationId,
          reason: st.status === 'STARTED' ? 'CRASH_AFTER_START' : 'CRASH_AFTER_COMPLETION',
          occurredAt,
        }),
      );
    }
    return events;
  }

  /**
   * Run finalizer: verifies the ledger chain, transitions, and projections,
   * then computes lifecycle completeness. Every invocation must be ASSESSED
   * (exactly 1 START / 1 COMPLETION / 1 ASSESSMENT) or explicitly
   * reconciled (ORPHANED/SUPERSEDED); otherwise the run is marked
   * INCOMPLETE_LEDGER. All ledger evidence is preserved — nothing is
   * deleted, rewritten, or repaired.
   * @returns {{ lifecycleState: 'COMPLETED'|'INCOMPLETE_LEDGER', finalSummary: object }}
   */
  async finalize() {
    this.assertWritable();
    return withRunDirLock(this.runDir, async () => {
      this._assertAuthoritativeOpen();
      const parsed = readJsonlFile(this.ledger.eventsPath);
      if (parsed.errors.length > 0) {
        throw new LedgerIntegrityError('ledger cannot be finalized: parse errors', { errors: parsed.errors });
      }
      const validation = validateLedger(parsed.events);
      if (!validation.valid) {
        throw new LedgerIntegrityError('ledger cannot be finalized: validation failed', { errors: validation.errors });
      }
      const { errors: projectionErrors } = checkProjections(path.join(this.runDir, INVOCATIONS_DIR), parsed.events);
      if (projectionErrors.length > 0) {
        throw new LedgerIntegrityError('ledger cannot be finalized: invocation projections do not match the ledger', { errors: projectionErrors });
      }
      const summary = validation.summary;
      const lifecycleState = summary.incompleteInvocationIds.length > 0 ? 'INCOMPLETE_LEDGER' : 'COMPLETED';
      const record = stampSprintRecord('lcim.run', {
        ...this.baseRecordFields(),
        lifecycleState,
        finalizedAt: new Date().toISOString(),
        abortedAt: null,
        abortNote: null,
        finalSummary: summary,
      });
      writeJsonAtomic(path.join(this.runDir, RUN_JSON), record);
      this.record = record;
      this.finalState = lifecycleState;
      await this.close();
      return { lifecycleState, finalSummary: record.finalSummary };
    });
  }

  /** Explicitly abort the run (controller stop). Appends are refused after. */
  async abort({ note } = {}) {
    this.assertWritable();
    if (note !== undefined && (typeof note !== 'string' || note.length === 0 || note.length > MAX_NOTE)) {
      throw new ConfigError(`note must be a bounded non-empty string (max ${MAX_NOTE} chars)`);
    }
    return withRunDirLock(this.runDir, async () => {
      this._assertAuthoritativeOpen();
      const record = stampSprintRecord('lcim.run', {
        ...this.baseRecordFields(),
        lifecycleState: 'ABORTED',
        finalizedAt: null,
        abortedAt: new Date().toISOString(),
        abortNote: note ?? null,
        finalSummary: null,
      });
      writeJsonAtomic(path.join(this.runDir, RUN_JSON), record);
      this.record = record;
      this.finalState = 'ABORTED';
      await this.close();
      return { lifecycleState: 'ABORTED' };
    });
  }

  /** Full deterministic validation of the run store. */
  async validate() {
    return validateRunStore(this.runDir);
  }

  /**
   * All ledger events (immutable copies), read deterministically from the
   * file so concurrently-appended events from other sessions (linked
   * worktrees) are always visible. Fails closed on any ledger defect.
   */
  async readEvents() {
    const parsed = readJsonlFile(this.ledger.eventsPath);
    if (parsed.errors.length > 0) {
      throw new LedgerIntegrityError(`ledger parse errors in ${this.ledger.eventsPath}`, { errors: parsed.errors });
    }
    const validation = validateLedger(parsed.events);
    if (!validation.valid) {
      throw new LedgerIntegrityError(`ledger validation failed for ${this.ledger.eventsPath}`, { errors: validation.errors });
    }
    return parsed.events.map((e) => Object.freeze({ ...e }));
  }

  /** The compact invocation record for an invocation (frozen projection). */
  async getInvocationRecord(invocationId) {
    if (!isValidId('invocation', invocationId)) {
      throw new ConfigError(`invalid invocationId: ${JSON.stringify(invocationId)}`);
    }
    const file = path.join(this.runDir, INVOCATIONS_DIR, `${invocationId}.json`);
    if (!fs.existsSync(file)) {
      throw new RunStoreError(`no invocation record for ${invocationId}`);
    }
    const record = readJsonFile(file);
    const validation = validateSprintRecord('lcim.invocation', record);
    if (!validation.valid) {
      throw new RunStoreError(`invocation record is invalid: ${validation.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`);
    }
    return record;
  }

  /**
   * Append a raw line to the optional compressed raw sink (transcript
   * data). Only available when the store was created with
   * enableRawSink: true. Best-effort; never validated; never in review
   * export.
   */
  async appendRaw(line) {
    if (!this.rawSink || this.rawSink.ended) {
      throw new RunStoreError('raw sink is not enabled for this run store (create it with enableRawSink: true)');
    }
    if (typeof line !== 'string') {
      throw new ConfigError('raw sink lines must be strings');
    }
    this.rawSink.append(line.endsWith('\n') ? line : `${line}\n`);
  }

  /** Close the raw sink (idempotent; finalize/abort do this automatically). */
  async close() {
    if (this.rawSink && !this.rawSink.ended) {
      await this.rawSink.end();
      this.rawSink = null;
    }
  }

  /** @private append an event, mirror it to the raw sink, refresh projection. */
  async _appendEvent(fields) {
    this.assertWritable();
    return withRunDirLock(this.runDir, async () => {
      // authoritative on-disk lifecycle gate: re-read run.json under the
      // lock so the check and the write share one serialization boundary
      this._assertAuthoritativeOpen();
      const event = this.ledger.appendEventLocked(fields);
      if (this.rawSink && !this.rawSink.ended) {
        this.rawSink.append(`${canonicalJson(event)}\n`);
      }
      return event;
    });
  }

  /** @private append a lifecycle event and refresh the invocation projection. */
  async _appendInvocationEvent(fields) {
    // workUnitId is recorded once (START); later lifecycle events inherit it
    // from the ledger state so the wrapper never has to repeat it.
    const st = this.ledger.states.get(fields.invocationId);
    const workUnitId = st ? st.workUnitId : fields.workUnitId;
    const event = await this._appendEvent({ ...fields, workUnitId });
    this._refreshInvocationRecord(event.invocationId);
    return event;
  }

  /** @private rewrite the compact invocation record from ledger state. */
  _refreshInvocationRecord(invocationId) {
    const st = this.ledger.states.get(invocationId);
    if (st === undefined) {
      throw new LedgerIntegrityError(`no ledger state for invocation ${invocationId}`);
    }
    const record = stampSprintRecord('lcim.invocation', {
      invocationId,
      runId: this.runId,
      workUnitId: st.workUnitId,
      status: st.status,
      provider: st.provider,
      model: st.model,
      role: st.role,
      reasoningEffort: st.reasoningEffort,
      startedAt: st.startedAt,
      completedAt: st.completedAt ?? null,
      assessedAt: st.assessedAt ?? null,
      reconciledAt: st.reconciledAt ?? null,
      outcome: st.outcome,
      usage: st.usage,
      errorCode: st.errorCode,
      rejectionCode: st.rejectionCode,
      assessmentResult: st.assessmentResult,
      summary: st.summary,
      evidenceRefs: st.evidenceRefs,
      reconciliationReason: st.reconciliationReason,
      supersededByInvocationId: st.supersededByInvocationId,
    });
    writeJsonAtomic(path.join(this.runDir, INVOCATIONS_DIR, `${invocationId}.json`), record);
    return record;
  }

  /**
   * @private fail closed when the run is already final. This is a fast-fail
   * CACHE ONLY (this session's own in-memory terminal state); it never
   * authorizes a mutation. The authoritative lifecycle gate for every write
   * is _assertAuthoritativeOpen() under the run-dir lock.
   */
  assertWritable() {
    if (this.finalState !== null) {
      throw new LedgerFinalizedError(`run ${this.runId} is ${this.finalState}; no further events may be appended`);
    }
  }

  /**
   * @private Authoritative cross-process lifecycle gate. MUST be called
   * while holding the run-dir lock: re-reads run.json from disk, validates
   * the record, and requires lifecycleState === 'OPEN'. Throws
   * LedgerFinalizedError when the authoritative on-disk run is terminal
   * (another session finalized/aborted it) and RunStoreError when the
   * on-disk record is missing or invalid. Performs zero writes.
   */
  _assertAuthoritativeOpen() {
    const parsed = readJsonFile(this.runJsonPath);
    const validation = validateSprintRecord('lcim.run', parsed);
    if (!validation.valid) {
      throw new RunStoreError(`authoritative run record is invalid: ${validation.errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`);
    }
    if (parsed.lifecycleState !== 'OPEN') {
      throw new LedgerFinalizedError(
        `run ${this.runId} is ${parsed.lifecycleState} (authoritative on-disk state); no further mutations may be performed`,
      );
    }
    return parsed;
  }

  /** @private immutable run-record header fields for finalize/abort. */
  baseRecordFields() {
    return {
      runId: this.record.runId,
      lcimVersion: this.record.lcimVersion,
      lcimCommit: this.record.lcimCommit,
      targetBaseSha: this.record.targetBaseSha,
      configDigest: this.record.configDigest,
      createdAt: this.record.createdAt,
      storeVersion: this.record.storeVersion,
    };
  }
}
