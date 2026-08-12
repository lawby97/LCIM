/**
 * LCIM V2 Sprint 01 deterministic ledger reader and validator.
 *
 * readLedger() parses events.v2.jsonl deterministically (same file ->
 * same events, same order). validateRunStore() checks the whole run store:
 * run.json, ledger chain, per-event schema/kind rules, lifecycle
 * transitions, compact invocation projections, and run-record consistency
 * (finalized runs must be anchored to the ledger end; COMPLETED must have
 * no incomplete invocations; INCOMPLETE_LEDGER must list exactly the
 * incomplete invocations; ABORTED runs are exempt from completeness).
 *
 * Reporting/analytics projections themselves are Sprint 08; this module
 * only emits the minimal validator output (summary + errors).
 */

import fs from 'node:fs';
import path from 'node:path';
import { deepStrictEqual } from 'node:assert';
import { EVENTS_FILE, buildInvocationStates, summarizeLedger, validateLedger } from './ledger.mjs';
import { LEDGER_GENESIS_DIGEST } from './enums.mjs';
import { readJsonFile, readJsonlFile } from './io.mjs';
import { validateSprintRecord } from './schemas.mjs';

export const RUN_JSON = 'run.json';
export const INVOCATIONS_DIR = 'invocations';
export const RAW_DIR = 'raw';

/**
 * Read + parse the ledger file.
 * @returns {{ events: object[], errors: Array<{line,message}> }} parse-level
 *   only; chain/lifecycle validation is validateLedger()'s job.
 */
export function readLedger(runDir) {
  return readJsonlFile(path.join(runDir, EVENTS_FILE));
}

function deepEqual(a, b) {
  try {
    deepStrictEqual(a, b);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate the compact invocation projections (invocations/<id>.json)
 * against the ledger-derived states. A projection is an exact mirror of the
 * ledger for the compared fields; any mismatch (including a missing
 * record or a record without events) is an error.
 * @returns {{ errors: Array<{path,message}> }}
 */
export function checkProjections(invDir, events) {
  const errors = [];
  const { states } = buildInvocationStates(events);
  if (!fs.existsSync(invDir)) {
    errors.push({ path: 'invocations', message: 'missing invocation records directory' });
    return { errors };
  }
  const seen = new Set();
  for (const file of fs.readdirSync(invDir).filter((f) => f.endsWith('.json')).sort()) {
    const invocationId = file.replace(/\.json$/, '');
    seen.add(invocationId);
    const abs = path.join(invDir, file);
    const at = `invocations/${file}`;
    let record;
    try {
      record = readJsonFile(abs);
    } catch (err) {
      errors.push({ path: at, message: `unparseable: ${err.message}` });
      continue;
    }
    const schemaResult = validateSprintRecord('lcim.invocation', record);
    for (const e of schemaResult.errors) {
      errors.push({ path: `${at}.${e.path || '(root)'}`, message: e.message });
    }
    const st = states.get(invocationId);
    if (st === undefined) {
      errors.push({ path: at, message: 'no ledger events for this invocation record' });
      continue;
    }
    const expected = {
      status: st.status,
      workUnitId: st.workUnitId,
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
    };
    for (const [key, value] of Object.entries(expected)) {
      if (!deepEqual(record[key], value)) {
        errors.push({
          path: `${at}.${key}`,
          message: `projection mismatch: record has ${JSON.stringify(record[key])}, ledger has ${JSON.stringify(value)}`,
        });
      }
    }
  }
  for (const id of states.keys()) {
    if (!seen.has(id)) {
      errors.push({ path: `invocations/${id}.json`, message: 'missing projection record for a ledger invocation' });
    }
  }
  return { errors };
}

/**
 * Validate a complete run store directory.
 * @returns {{ valid, errors, run, summary }}
 *   - run: the parsed run.json record (or null when missing/unparseable)
 *   - summary: summarizeLedger() output
 *   - errors: chain/schema/transition/projection/consistency errors
 */
export function validateRunStore(runDir) {
  const errors = [];

  // run.json
  const runJsonPath = path.join(runDir, RUN_JSON);
  let run = null;
  if (!fs.existsSync(runJsonPath)) {
    errors.push({ path: RUN_JSON, message: 'missing run record' });
  } else {
    try {
      run = readJsonFile(runJsonPath);
    } catch (err) {
      errors.push({ path: RUN_JSON, message: `unparseable: ${err.message}` });
    }
    if (run !== null) {
      const schemaResult = validateSprintRecord('lcim.run', run);
      for (const e of schemaResult.errors) {
        errors.push({ path: `${RUN_JSON}.${e.path || '(root)'}`, message: e.message });
      }
    }
  }

  // ledger
  const eventsPath = path.join(runDir, EVENTS_FILE);
  let events = [];
  if (!fs.existsSync(eventsPath)) {
    errors.push({ path: EVENTS_FILE, message: 'missing ledger file' });
  } else {
    const parsed = readJsonlFile(eventsPath);
    for (const e of parsed.errors) {
      errors.push({ path: `${EVENTS_FILE}:${e.line}`, message: e.message });
    }
    events = parsed.events;
    const validation = validateLedger(events);
    for (const e of validation.errors) {
      errors.push({ path: `${EVENTS_FILE}.${e.path}`, message: e.message });
    }
  }
  const summary = summarizeLedger(events);

  // run-record <-> ledger consistency
  if (run !== null) {
    const lifecycleState = run.lifecycleState;
    const incomplete = summary.incompleteInvocationIds;
    if (lifecycleState === 'COMPLETED' && incomplete.length > 0) {
      errors.push({
        path: `${RUN_JSON}.lifecycleState`,
        message: `run claims COMPLETED but the ledger has incomplete invocations: ${incomplete.join(', ')}`,
      });
    }
    if (lifecycleState === 'INCOMPLETE_LEDGER') {
      const recorded = run.finalSummary?.incompleteInvocationIds ?? [];
      const actual = incomplete;
      if (!deepEqual(recorded, actual)) {
        errors.push({
          path: `${RUN_JSON}.finalSummary.incompleteInvocationIds`,
          message: `finalSummary lists ${JSON.stringify(recorded)} but the ledger has ${JSON.stringify(actual)}`,
        });
      }
      if (run.finalizedAt === null || run.finalizedAt === undefined) {
        errors.push({ path: `${RUN_JSON}.finalizedAt`, message: 'INCOMPLETE_LEDGER run must be finalized (finalizedAt required)' });
      }
    }
    if ((lifecycleState === 'COMPLETED' || lifecycleState === 'INCOMPLETE_LEDGER') && (run.finalSummary === null || run.finalSummary === undefined)) {
      errors.push({ path: `${RUN_JSON}.finalSummary`, message: 'a finalized run must carry the finalizer summary' });
    }
    if (lifecycleState === 'OPEN' && (run.finalizedAt !== null || run.abortedAt !== null)) {
      errors.push({ path: `${RUN_JSON}.lifecycleState`, message: 'OPEN run must not carry finalizedAt/abortedAt' });
    }
    if (run.finalSummary !== null && run.finalSummary !== undefined) {
      const lastEvent = events[events.length - 1] ?? null;
      const actualDigest = lastEvent ? lastEvent.digest : LEDGER_GENESIS_DIGEST;
      const actualSeq = lastEvent ? lastEvent.seq : 0;
      if (run.finalSummary.ledgerDigest !== actualDigest) {
        errors.push({
          path: `${RUN_JSON}.finalSummary.ledgerDigest`,
          message: `finalSummary ledgerDigest ${run.finalSummary.ledgerDigest} does not match the ledger end ${actualDigest} (ledger was truncated or rewritten after finalization)`,
        });
      }
      if (run.finalSummary.lastSeq !== actualSeq) {
        errors.push({
          path: `${RUN_JSON}.finalSummary.lastSeq`,
          message: `finalSummary lastSeq ${run.finalSummary.lastSeq} does not match the ledger end seq ${actualSeq}`,
        });
      }
    }
  }

  // invocation projections
  const projection = checkProjections(path.join(runDir, INVOCATIONS_DIR), events);
  errors.push(...projection.errors);

  return { valid: errors.length === 0, errors, run, summary };
}

/**
 * Minimal human-readable validation report (the only reporting Sprint 01
 * provides; projections/analytics are Sprint 08).
 */
export function formatValidationReport(result) {
  const { run, summary } = result;
  const lines = [];
  const runId = run?.runId ?? '<missing>';
  const lcim = run ? `${run.lcimVersion}@${run.lcimCommit ? run.lcimCommit.slice(0, 7) : 'no-git'}` : '?';
  lines.push(`run ${runId}: lifecycleState=${run?.lifecycleState ?? '<missing>'} (lcim ${lcim})`);
  if (summary) {
    lines.push(
      `ledger: ${summary.events} events (starts ${summary.starts}, completions ${summary.completions}, ` +
        `assessments ${summary.assessments}, reconciliations ${summary.reconciliations}); ` +
        `${summary.invocations} invocations; lastSeq ${summary.lastSeq}`,
    );
    if (summary.incompleteInvocationIds.length > 0) {
      lines.push(`incomplete invocations: ${summary.incompleteInvocationIds.join(', ')}`);
    }
  }
  lines.push(`validation: ${result.valid ? 'OK' : `FAILED (${result.errors.length} error(s))`}`);
  for (const e of result.errors) {
    lines.push(`  - ${e.path}: ${e.message}`);
  }
  return `${lines.join('\n')}\n`;
}
