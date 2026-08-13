/**
 * LCIM V2 Sprint 09 V1 compatibility version detection (Sprint 09 owned).
 *
 * The reader NEVER "best-effort" interprets an unknown legacy format as a
 * supported V1 version. Every input is classified deterministically into
 * exactly one of:
 *
 *   SUPPORTED_V1               — the input is a supported V1 evidence form
 *                                (v1.0 ledger, or a V1 worker handoff /
 *                                final-response payload).
 *   UNSUPPORTED_LEGACY_VARIANT — the input looks like V1-family evidence
 *                                but is a variant this reader does not
 *                                support (unsupported v1Version, unknown
 *                                event kinds, unmarked ledger-like data,
 *                                unknown worker-status vocabulary). Fails
 *                                closed — never silently reinterpreted.
 *   NOT_V1                     — the input is not recognizable as V1
 *                                evidence at all (e.g. native V2 ledger
 *                                events, unrelated JSON, garbage).
 *
 * Detection is by evidence FORM, not by file origin: a payload that also
 * happens to satisfy the V2 worker-result schema is still a supported V1
 * handoff FORM when read through this reader; provenance is recorded by
 * the projection (V1_COMPAT), never implied by the bytes.
 *
 * Public-safety: reasons embed only bounded values (v1Version, eventKind,
 * schemaName, reason codes) — never raw response text or event bodies.
 */

import { TransportParseError } from '../../shared/errors.mjs';
import { parseWorkerResponse } from '../../handoff/parse.mjs';
import { UnsupportedV1VersionError, V1CompatError } from './errors.mjs';

/** Deterministic classification states. */
export const V1_COMPATIBILITY_STATE = Object.freeze({
  SUPPORTED_V1: 'SUPPORTED_V1',
  UNSUPPORTED_LEGACY_VARIANT: 'UNSUPPORTED_LEGACY_VARIANT',
  NOT_V1: 'NOT_V1',
});

/** Kinds of supported V1 evidence the reader can interpret. */
export const V1_SOURCE_KIND = Object.freeze({
  LEDGER: 'ledger',
  HANDOFF: 'handoff',
});

/** The single supported V1 compatibility version. */
export const SUPPORTED_V1_VERSION = '1.0';

/** Schema identity of a supported V1 ledger event. */
export const SUPPORTED_V1_LEDGER_SCHEMA_NAME = 'lcim.v1.ledger-event';

/** The native V2 ledger event family (never V1 evidence). */
export const V2_LEDGER_SCHEMA_NAME = 'lcim.event';

/**
 * Historical V1 worker status vocabulary. PATCH_READY is a V1 WORKER
 * claim (docs/worker-contract.md documents it as a legacy V1 status that
 * V2 forbids); it is NEVER a V2 worker status and NEVER a V2 controller
 * disposition.
 */
export const V1_STATUS_VOCABULARY = Object.freeze([
  'WORK_COMPLETE',
  'BLOCKED',
  'FAILED',
  'NO_CHANGE',
  'PATCH_READY',
]);

/**
 * Known V1 worker-reportable fields (docs/worker-contract.md section 2)
 * that V2 removed from the worker contract. Their presence marks a payload
 * as V1 evidence; in V1 they are worker CLAIMS, never controller facts.
 */
export const V1_LEGACY_FIELD_NAMES = Object.freeze([
  'evidence',
  'changedFiles',
  'lineCount',
  'patchHash',
  'baseSha',
  'headSha',
  'testLogPath',
  'testExitStatus',
  'secretScan',
  'integrationStatus',
  'patchReady',
]);

/** Event kinds of the supported V1 ledger variant. */
export const V1_LEDGER_EVENT_KINDS = Object.freeze([
  'ASSIGNMENT',
  'HANDOFF',
  'CONTROLLER_ACTION',
]);

/** Fields that make an unmarked object look ledger-like (unsupported when unmarked). */
const V1_LEDGER_LIKE_FIELDS = ['eventKind', 'seq', 'prevDigest', 'digest'];

/**
 * Detect the V1 compatibility state of a text input.
 *
 * @param {unknown} text - raw V1 evidence text.
 * @returns {Readonly<{state, kind, version, reason, detail}>} frozen
 *   detection record. `kind` is 'ledger' | 'handoff' | null;
 *   `version` is '1.0' for supported inputs else null;
 *   `detail.encoding` records how the payload/ledger was encoded
 *   ('array' | 'jsonl' | 'single-object' | 'strict' | 'fence' |
 *   'prose-wrapped').
 */
export function detectV1Version(text) {
  if (typeof text !== 'string') {
    return freeze({ state: V1_COMPATIBILITY_STATE.NOT_V1, kind: null, version: null, reason: 'input is not text' });
  }
  if (text.trim() === '') {
    return freeze({ state: V1_COMPATIBILITY_STATE.NOT_V1, kind: null, version: null, reason: 'input is empty' });
  }

  // 1) Strict JSON: an array is the ledger container form; an object is a
  //    payload (handoff / final response).
  const strict = tryParseJson(text);
  if (strict.ok) {
    if (Array.isArray(strict.value)) {
      if (strict.value.length === 0) {
        return freeze({ state: V1_COMPATIBILITY_STATE.NOT_V1, kind: null, version: null, reason: 'empty JSON array' });
      }
      const first = strict.value[0];
      if (first === null || typeof first !== 'object' || Array.isArray(first)) {
        return freeze({ state: V1_COMPATIBILITY_STATE.NOT_V1, kind: null, version: null, reason: 'JSON array whose first element is not an object' });
      }
      return detectLedgerForm(first, { encoding: 'array', events: strict.value });
    }
    if (isPlainObject(strict.value)) {
      // A single-object strict payload could be a one-event ledger (the
      // degenerate JSONL encoding) or a handoff/response payload. Ledger
      // markers win when present; otherwise classify as a payload.
      const ledger = detectLedgerForm(strict.value, { encoding: 'single-object', events: [strict.value] });
      if (ledger.state !== V1_COMPATIBILITY_STATE.NOT_V1) return ledger;
      return detectPayloadForm(strict.value, { encoding: 'strict' });
    }
    return freeze({ state: V1_COMPATIBILITY_STATE.NOT_V1, kind: null, version: null, reason: 'JSON value is neither an object nor an array' });
  }

  // 2) JSONL ledger form (one event object per line).
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const firstObject = firstParseableObject(lines);
  if (firstObject !== null) {
    const ledger = detectLedgerForm(firstObject, { encoding: 'jsonl', lines });
    if (ledger.state !== V1_COMPATIBILITY_STATE.NOT_V1) return ledger;
  }

  // 3) Payload form embedded in prose / a JSON code fence, using the
  //    established syntactic grammar (Sprint 02, read-only).
  let parsed;
  try {
    parsed = parseWorkerResponse(text);
  } catch (err) {
    if (err instanceof TransportParseError) {
      return freeze({
        state: V1_COMPATIBILITY_STATE.NOT_V1,
        kind: null,
        version: null,
        reason: `no supported V1 evidence form recognized (${err.details?.reason ?? 'unparseable'})`,
      });
    }
    throw err;
  }
  if (!isPlainObject(parsed.value)) {
    return freeze({ state: V1_COMPATIBILITY_STATE.NOT_V1, kind: null, version: null, reason: 'extracted JSON value is not an object' });
  }
  return detectPayloadForm(parsed.value, { encoding: parsed.normalization });
}

/**
 * Classify a ledger container from its first event plus (for the supported
 * marker) the full event vocabulary scan.
 */
function detectLedgerForm(obj, { encoding, events = null, lines = null }) {
  if (obj.schemaName === SUPPORTED_V1_LEDGER_SCHEMA_NAME) {
    if (obj.v1Version === SUPPORTED_V1_VERSION) {
      return supportedLedger({ encoding, events, lines });
    }
    if (typeof obj.v1Version === 'string') {
      return unsupported(`v1 ledger marker declares v1Version ${JSON.stringify(obj.v1Version)}, but only ${SUPPORTED_V1_VERSION} is supported`);
    }
    return unsupported('v1 ledger marker present without a v1Version field; the variant cannot be confirmed');
  }
  if (typeof obj.schemaName === 'string') {
    if (obj.schemaName === V2_LEDGER_SCHEMA_NAME) {
      return notV1('native V2 ledger event (lcim.event) — not V1 evidence');
    }
    return notV1(`unrecognized evidence-family schemaName ${JSON.stringify(obj.schemaName)}`);
  }
  if (typeof obj.v1Version === 'string') {
    if (obj.v1Version === SUPPORTED_V1_VERSION) {
      return supportedLedger({ encoding, events, lines });
    }
    return unsupported(`v1Version ${JSON.stringify(obj.v1Version)} is not a supported V1 compatibility version`);
  }
  if (hasLedgerShape(obj)) {
    return unsupported('ledger-like events without the supported v1Version marker — an unmarked legacy variant is not supported (no best-effort interpretation)');
  }
  return notV1('no ledger markers on the first JSON object');
}

/**
 * A 1.0-marked ledger is supported only when EVERY event carries the
 * supported v1.0 version/schema markers and a recognized event kind. A
 * later event with an unsupported v1Version, a different schema family
 * marker, a non-string version marker, or no version/schema markers at
 * all is a mixed-version history — an unsupported legacy variant, never a
 * supported ledger whose later events degrade into generic
 * schema-invalid handling.
 */
function supportedLedger({ encoding, events, lines }) {
  const all = events ?? (lines ? lines.map((l) => tryParseJson(l).ok ? tryParseJson(l).value : null) : []);
  for (const ev of all) {
    if (ev === null || typeof ev !== 'object' || Array.isArray(ev)) continue;
    if (typeof ev.eventKind === 'string' && !V1_LEDGER_EVENT_KINDS.includes(ev.eventKind)) {
      return unsupported(`ledger declares v1Version ${SUPPORTED_V1_VERSION} but uses eventKind ${JSON.stringify(ev.eventKind)}, which is not in the supported v1.0 variant`);
    }
    if (typeof ev.schemaName === 'string' && ev.schemaName !== SUPPORTED_V1_LEDGER_SCHEMA_NAME) {
      return unsupported(`ledger event uses schemaName ${JSON.stringify(ev.schemaName)}, which is not the supported v1.0 marker ${JSON.stringify(SUPPORTED_V1_LEDGER_SCHEMA_NAME)} (mixed/incompatible schema markers)`);
    }
    if (typeof ev.v1Version === 'string' && ev.v1Version !== SUPPORTED_V1_VERSION) {
      return unsupported(`ledger event declares v1Version ${JSON.stringify(ev.v1Version)}, but only ${SUPPORTED_V1_VERSION} is supported (mixed-version history)`);
    }
    if (ev.v1Version !== undefined && typeof ev.v1Version !== 'string') {
      return unsupported('ledger event declares a non-string v1Version marker; the variant cannot be confirmed');
    }
    if (ev.schemaName === undefined || ev.v1Version === undefined) {
      return unsupported('ledger event is missing the supported v1.0 version/schema markers (mixed marker history)');
    }
  }
  return freeze({
    state: V1_COMPATIBILITY_STATE.SUPPORTED_V1,
    kind: V1_SOURCE_KIND.LEDGER,
    version: SUPPORTED_V1_VERSION,
    reason: 'ok',
    detail: { encoding },
  });
}

/**
 * Classify a payload object (handoff / final response) by its vocabulary.
 *
 * - A workerStatus in the V1 vocabulary, or any known V1 legacy field, is
 *   a STRONG V1 marker -> supported.
 * - An unknown workerStatus with V1 context fields (workUnitId/summary)
 *   is still the supported variant: the instance will be schema-invalid
 *   (parseable but historically invalid) — that is the required
 *   schema-invalid-handoff case, not an unsupported variant.
 * - An unknown workerStatus with no other V1 markers cannot be confirmed
 *   as this variant -> unsupported.
 */
function detectPayloadForm(obj, { encoding }) {
  const markers = [];
  if (typeof obj.workerStatus === 'string' && V1_STATUS_VOCABULARY.includes(obj.workerStatus)) {
    markers.push('workerStatus');
  }
  for (const field of V1_LEGACY_FIELD_NAMES) {
    if (Object.hasOwn(obj, field)) markers.push(field);
  }
  if (markers.length > 0) {
    return freeze({
      state: V1_COMPATIBILITY_STATE.SUPPORTED_V1,
      kind: V1_SOURCE_KIND.HANDOFF,
      version: SUPPORTED_V1_VERSION,
      reason: 'ok',
      detail: { encoding, markers },
    });
  }
  if (Object.hasOwn(obj, 'workerStatus')) {
    const hasContext =
      (typeof obj.workUnitId === 'string' && obj.workUnitId.length > 0) ||
      (typeof obj.summary === 'string' && obj.summary.length > 0);
    if (hasContext) {
      return freeze({
        state: V1_COMPATIBILITY_STATE.SUPPORTED_V1,
        kind: V1_SOURCE_KIND.HANDOFF,
        version: SUPPORTED_V1_VERSION,
        reason: 'ok',
        detail: { encoding, markers, schemaInvalidExpected: true },
      });
    }
    return unsupported('workerStatus present but outside the supported V1 vocabulary, with no other V1 evidence markers');
  }
  return notV1('JSON object without any V1 evidence markers');
}

function hasLedgerShape(obj) {
  return V1_LEDGER_LIKE_FIELDS.some((f) => Object.hasOwn(obj, f));
}

function firstParseableObject(lines) {
  for (const line of lines) {
    const parsed = tryParseJson(line);
    if (parsed.ok && isPlainObject(parsed.value)) return parsed.value;
  }
  return null;
}

function tryParseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function notV1(reason) {
  return freeze({ state: V1_COMPATIBILITY_STATE.NOT_V1, kind: null, version: null, reason });
}

function unsupported(reason) {
  return freeze({ state: V1_COMPATIBILITY_STATE.UNSUPPORTED_LEGACY_VARIANT, kind: null, version: null, reason });
}

function freeze(detection) {
  return Object.freeze({
    ...detection,
    detail: detection.detail === undefined ? null : Object.freeze({ ...detection.detail }),
  });
}

/**
 * Convert a non-supported detection into the precise error.
 * @returns {UnsupportedV1VersionError|V1CompatError}
 */
export function detectionToError(detection, expectedKind) {
  if (detection.state === V1_COMPATIBILITY_STATE.UNSUPPORTED_LEGACY_VARIANT) {
    return new UnsupportedV1VersionError(`unsupported legacy V1 variant: ${detection.reason}`);
  }
  return new V1CompatError(
    `expected a supported V1 ${expectedKind} source, but the input was not recognized as V1 evidence: ${detection.reason}`,
  );
}
