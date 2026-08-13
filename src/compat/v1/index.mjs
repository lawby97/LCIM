/**
 * LCIM V2 Sprint 09 V1 compatibility reader — public API (Sprint 09 owned).
 *
 * Read-only interpretation of historical V1 evidence:
 *
 *   readV1History(text, {kind})  — detect version, parse, and project in
 *                                  one call. Never writes, never repairs.
 *
 * Kind is 'auto' (detect), 'ledger', 'handoff', or 'response'. The
 * requested kind must match the detected evidence form; a mismatch fails
 * closed (the reader never reinterprets one evidence form as another).
 *
 * Native V2 behavior never depends on this module: nothing under src/
 * outside src/compat/v1 imports it.
 */

import {
  detectV1Version,
  detectionToError,
  V1_COMPATIBILITY_STATE,
  V1_SOURCE_KIND,
} from './version.mjs';
import { parseV1Ledger } from './ledger.mjs';
import { parseV1Handoff } from './handoff.mjs';
import { interpretV1FinalResponse } from './response.mjs';
import { projectV1Ledger, projectV1Payload } from './normalize.mjs';
import { V1CompatError } from './errors.mjs';

export { detectV1Version, detectionToError, V1_COMPATIBILITY_STATE, V1_SOURCE_KIND } from './version.mjs';
export {
  SUPPORTED_V1_VERSION,
  SUPPORTED_V1_LEDGER_SCHEMA_NAME,
  V1_STATUS_VOCABULARY,
  V1_LEGACY_FIELD_NAMES,
  V1_LEDGER_EVENT_KINDS,
} from './version.mjs';
export { parseV1Ledger } from './ledger.mjs';
export { parseV1Handoff, extractWorkerClaim } from './handoff.mjs';
export { interpretV1FinalResponse } from './response.mjs';
export { projectV1Ledger, projectV1Payload } from './normalize.mjs';
export { V1_COMPAT, UNKNOWN_V1 } from './schemas.mjs';
export {
  COMPAT_SCHEMA_MANIFEST,
  COMPAT_SCHEMA_VERSION,
  loadCompatSchema,
  validateCompatRecord,
  stampCompatRecord,
} from './schemas.mjs';
export {
  V1CompatError,
  UnsupportedV1VersionError,
  V1ChainIntegrityError,
} from './errors.mjs';

/**
 * Read one V1 evidence source end-to-end (detect -> parse -> project),
 * strictly read-only.
 *
 * @param {string} text - exact V1 evidence text.
 * @param {{kind?: 'auto'|'ledger'|'handoff'|'response'}} [options]
 * @returns {Readonly<{detection, parsed, projection}>}
 *   - detection: version-detection record (SUPPORTED_V1 /
 *     UNSUPPORTED_LEGACY_VARIANT / NOT_V1)
 *   - parsed: parsed ledger or handoff interpretation
 *   - projection: schema-valid lcim.v1.projection with provenance V1_COMPAT
 * @throws {UnsupportedV1VersionError} for unsupported legacy variants.
 * @throws {V1ChainIntegrityError} for broken historical chains.
 * @throws {V1CompatError} for malformed input or kind mismatches.
 */
export function readV1History(text, { kind = 'auto' } = {}) {
  const detection = detectV1Version(text);
  const sourceKind = resolveSourceKind(kind, detection);
  let parsed;
  let projection;
  if (sourceKind === 'ledger') {
    parsed = parseV1Ledger(text);
    projection = projectV1Ledger(parsed, { sourceBytes: text });
  } else {
    parsed = sourceKind === 'response' ? interpretV1FinalResponse(text) : parseV1Handoff(text);
    projection = projectV1Payload(parsed, { kind: sourceKind, sourceBytes: text });
  }
  return Object.freeze({ detection, parsed, projection });
}

/**
 * Resolve the requested kind against the detection result. Fails closed on
 * any mismatch — a source detected as a ledger is never reinterpreted as a
 * handoff and vice versa.
 */
function resolveSourceKind(kind, detection) {
  if (detection.state !== V1_COMPATIBILITY_STATE.SUPPORTED_V1) {
    throw detectionToError(detection, 'source');
  }
  if (kind === undefined || kind === null || kind === 'auto') {
    return detection.kind === V1_SOURCE_KIND.LEDGER ? 'ledger' : 'handoff';
  }
  if (kind !== 'ledger' && kind !== 'handoff' && kind !== 'response') {
    throw new V1CompatError(
      `unknown V1 source kind ${JSON.stringify(kind)} (expected 'auto', 'ledger', 'handoff', or 'response')`,
    );
  }
  const requested = kind === 'response' ? V1_SOURCE_KIND.HANDOFF : kind;
  if (detection.kind !== requested) {
    throw new V1CompatError(
      `input was detected as a V1 ${detection.kind} source, not the requested ${kind} source; refusing to reinterpret it`,
    );
  }
  return kind;
}
