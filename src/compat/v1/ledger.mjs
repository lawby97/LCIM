/**
 * LCIM V2 Sprint 09 read-only V1 assignment-ledger parser (Sprint 09
 * owned).
 *
 * Parses the SUPPORTED V1 ledger variant (v1Version '1.0'): a sequence of
 * `lcim.v1.ledger-event` records delivered either as one JSON object per
 * line (JSONL) or as a JSON array. Every event carries seq (monotonic,
 * beginning at 1), prevDigest, and digest (sha256 over the canonical JSON
 * of the event excluding its own digest field; GENESIS = 64 zeros for
 * seq 1). A non-empty supported V1 chain MUST begin at seq 1: a
 * genesis-linked chain that starts at any other sequence is a broken
 * chain (the reader never renumbers or rewrites the sequence) and fails
 * deterministically as V1_HASH_CHAIN_BROKEN.
 *
 * IMMUTABILITY: this module is strictly read-only. It never rewrites the
 * source, never normalizes the file in place, never repairs a malformed
 * historical event, never alters a historical hash, and never appends
 * invented events. A broken chain (tamper, torn tail, altered digest,
 * non-chaining prevDigest, non-monotonic seq) fails deterministically with
 * V1ChainIntegrityError and is reported, never repaired. The reader
 * RECOMPUTES digests only to VERIFY; it never writes a corrected hash
 * back.
 *
 * Public-safety: errors embed only bounded identifiers (seq, line numbers,
 * reason codes) — never event bodies or raw response text.
 */

import { V1ChainIntegrityError, V1CompatError } from './errors.mjs';
import { canonicalJson, sha256Hex, V1_GENESIS_DIGEST } from './digest.mjs';
import {
  detectV1Version,
  detectionToError,
  SUPPORTED_V1_VERSION,
  V1_COMPATIBILITY_STATE,
  V1_SOURCE_KIND,
} from './version.mjs';
import { validateCompatRecord } from './schemas.mjs';

/**
 * Parse a supported V1 assignment ledger read-only.
 *
 * @param {string} text - full ledger text (JSONL or JSON array encoding).
 * @returns {Readonly<{detection, encoding, events, workUnits, chain}>}
 *   - events: frozen array of validated ledger events
 *   - workUnits: frozen array of {workUnitId, events, assignment, handoff,
 *     actions} grouped in first-appearance order
 *   - chain: {valid: true, eventCount, lastDigest}
 * @throws {UnsupportedV1VersionError} for unsupported legacy variants.
 * @throws {V1ChainIntegrityError} when the historical chain is broken.
 * @throws {V1CompatError} for malformed/schema-invalid instances.
 */
export function parseV1Ledger(text) {
  if (typeof text !== 'string') {
    throw new V1CompatError('V1 ledger input is not text');
  }
  const detection = detectV1Version(text);
  if (detection.state !== V1_COMPATIBILITY_STATE.SUPPORTED_V1 || detection.kind !== V1_SOURCE_KIND.LEDGER) {
    throw detectionToError(detection, 'ledger');
  }
  if (detection.version !== SUPPORTED_V1_VERSION) {
    throw detectionToError(detection, 'ledger');
  }

  const encoding = detection.detail?.encoding ?? 'jsonl';
  const rawEvents = decodeEvents(text, encoding);

  const events = [];
  let prevDigest = V1_GENESIS_DIGEST;
  for (let i = 0; i < rawEvents.length; i += 1) {
    const ev = rawEvents[i];
    const label = encoding === 'jsonl' ? `line ${i + 1}` : `event[${i}]`;
    if (ev === null || typeof ev !== 'object' || Array.isArray(ev)) {
      throw new V1CompatError(`V1 ledger ${label} is not a JSON object`);
    }
    const schemaResult = validateCompatRecord('lcim.v1.ledger-event', ev);
    if (!schemaResult.valid) {
      const detail = schemaResult.errors
        .map((e) => `${e.path || '(root)'}: ${e.message}`)
        .join('; ');
      throw new V1CompatError(`V1 ledger ${label} is schema-invalid (${detail})`, { seq: ev.seq ?? null });
    }
    const ruleErrors = validateLedgerEventRules(ev);
    if (ruleErrors.length > 0) {
      throw new V1CompatError(`V1 ledger ${label} violates variant rules (${ruleErrors.join('; ')})`, {
        seq: ev.seq ?? null,
      });
    }
    if (!Number.isInteger(ev.seq) || ev.seq < 1) {
      throw new V1CompatError(`V1 ledger ${label}: seq must be a positive integer`, { seq: ev.seq ?? null });
    }
    if (events.length === 0 && ev.seq !== 1) {
      // The documented supported V1 chain begins at sequence 1. A
      // schema-valid, genesis-linked first event at any other sequence is
      // a broken chain — the reader never normalizes or renumbers it.
      throw new V1ChainIntegrityError(
        `V1 ledger ${label}: the supported v1.0 chain must begin at seq 1 (first event seq is ${ev.seq})`,
        { seq: ev.seq },
      );
    }
    if (events.length > 0 && ev.seq <= events[events.length - 1].seq) {
      throw new V1ChainIntegrityError(
        `V1 ledger ${label}: seq must be strictly increasing (previous event seq ${events[events.length - 1].seq})`,
        { seq: ev.seq },
      );
    }
    if (ev.prevDigest !== prevDigest) {
      throw new V1ChainIntegrityError(
        `V1 ledger ${label}: prevDigest does not chain to the previous event (broken or non-genesis start)`,
        { seq: ev.seq },
      );
    }
    const { digest: _digest, ...chainable } = ev;
    const expected = sha256Hex(canonicalJson(chainable));
    if (expected !== ev.digest) {
      throw new V1ChainIntegrityError(
        `V1 ledger ${label}: digest does not match the recomputed event hash — the historical chain is tampered or malformed`,
        { seq: ev.seq },
      );
    }
    prevDigest = ev.digest;
    events.push(Object.freeze(ev));
  }

  const byWorkUnit = new Map();
  for (const ev of events) {
    let wu = byWorkUnit.get(ev.workUnitId);
    if (wu === undefined) {
      wu = { workUnitId: ev.workUnitId, events: [], assignment: null, handoff: null, actions: [] };
      byWorkUnit.set(ev.workUnitId, wu);
    }
    wu.events.push(ev);
    if (ev.eventKind === 'ASSIGNMENT') wu.assignment = ev;
    else if (ev.eventKind === 'HANDOFF') wu.handoff = ev;
    else wu.actions.push(ev);
  }

  const workUnits = [...byWorkUnit.values()].map((wu) =>
    Object.freeze({
      workUnitId: wu.workUnitId,
      events: Object.freeze([...wu.events]),
      assignment: wu.assignment,
      handoff: wu.handoff,
      actions: Object.freeze([...wu.actions]),
    }),
  );

  return Object.freeze({
    detection,
    encoding,
    version: SUPPORTED_V1_VERSION,
    events,
    workUnits,
    chain: Object.freeze({ valid: true, eventCount: events.length, lastDigest: prevDigest }),
  });
}

/**
 * Decode the ledger container (JSON array, single object, or JSONL) into
 * raw event objects. JSONL lines are parsed individually; a malformed line
 * fails with a line-numbered error (raw line content is never embedded).
 */
function decodeEvents(text, encoding) {
  if (encoding === 'array') {
    return JSON.parse(text);
  }
  if (encoding === 'single-object') {
    return [JSON.parse(text)];
  }
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) {
    throw new V1CompatError('V1 ledger contains no events');
  }
  return lines.map((line, i) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new V1CompatError(`V1 ledger line ${i + 1} is not valid JSON`, { line: i + 1 });
    }
  });
}

/**
 * Kind-specific variant rules (the schema enforces the general shape; the
 * engine has no if/then so these are checked here, mirroring the
 * Sprint-01 event-rules pattern).
 */
function validateLedgerEventRules(ev) {
  const errors = [];
  switch (ev.eventKind) {
    case 'ASSIGNMENT':
      if (ev.assignment === undefined) errors.push('ASSIGNMENT events require an assignment object');
      else if (typeof ev.assignment.summary !== 'string' || ev.assignment.summary.length === 0) {
        errors.push('assignment.summary must be a non-empty string');
      }
      break;
    case 'HANDOFF':
      if (ev.response === undefined) {
        errors.push('HANDOFF events require a response object');
      } else if (ev.response.text === null && ev.response.responseRef === null) {
        errors.push('HANDOFF response must carry response text or a response reference');
      }
      break;
    case 'CONTROLLER_ACTION':
      if (ev.action === undefined) errors.push('CONTROLLER_ACTION events require an action object');
      break;
    default:
      errors.push(`unknown event kind ${JSON.stringify(ev.eventKind)}`);
  }
  return errors;
}
