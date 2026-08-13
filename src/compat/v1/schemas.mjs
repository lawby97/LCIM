/**
 * LCIM V2 Sprint 09 schema registry for the V1-compatibility families
 * (Sprint 09 owned).
 *
 * Sprint 09 owns three families — lcim.v1.ledger-event (one event of the
 * supported V1 assignment-ledger variant), lcim.v1.handoff (a historical
 * V1 worker handoff payload), lcim.v1.projection (the normalized
 * V2-compatible projection with provenance V1_COMPAT) — defined in
 * schemas/compat/v1-ledger-event.v1.schema.json,
 * schemas/compat/v1-handoff.v1.schema.json,
 * schemas/compat/v1-projection.v1.schema.json.
 *
 * These are SEPARATE from the frozen Sprint-00 common family
 * (src/shared/schema-registry.mjs, lcim.common.*, version 2.0.0) and from
 * the Sprint-01/02 families. They are versioned independently (1.0.0) and
 * validated with the same shared validation engine
 * (validateAgainstSchema) so the Sprint-00 failure-closed subset
 * discipline applies unchanged. No shared file is modified.
 *
 * Conditional code-side rules enforced here (the engine has no if/then):
 * - lcim.v1.projection: every UNKNOWN-able string fact must be either the
 *   exact reserved sentinel 'UNKNOWN_V1' or a non-empty string — empty
 *   strings would silently erase a fact, which is forbidden.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, SchemaValidationError } from '../../shared/errors.mjs';
import { validateAgainstSchema } from '../../shared/schema/validate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.resolve(HERE, '../../../schemas/compat');

/** Sprint-09 compat schema manifest: schema name -> { file, version }. */
export const COMPAT_SCHEMA_MANIFEST = Object.freeze({
  'lcim.v1.ledger-event': { file: 'v1-ledger-event.v1.schema.json', version: '1.0.0' },
  'lcim.v1.handoff': { file: 'v1-handoff.v1.schema.json', version: '1.0.0' },
  'lcim.v1.projection': { file: 'v1-projection.v1.schema.json', version: '1.0.0' },
});

/** Current schema version of the Sprint-09 compat families. */
export const COMPAT_SCHEMA_VERSION = '1.0.0';

/**
 * Provenance marker for every normalized V1 fact: the fact originated from
 * V1 compatibility interpretation, never from a native V2 canonical ledger.
 */
export const V1_COMPAT = 'V1_COMPAT';

/**
 * Reserved sentinel for facts that cannot be established from V1 evidence.
 * Unavailable/ambiguous facts are NEVER invented, zeroed, or defaulted —
 * they are exactly this value. 'UNKNOWN_V1' is a reserved literal and must
 * never be emitted as a known fact value.
 */
export const UNKNOWN_V1 = 'UNKNOWN_V1';

const cache = new Map();

export function compatSchemaNames() {
  return Object.keys(COMPAT_SCHEMA_MANIFEST);
}

export function getCompatSchemaVersion(name) {
  if (!(name in COMPAT_SCHEMA_MANIFEST)) {
    throw new ConfigError(`unknown compat schema name: ${name}`);
  }
  return COMPAT_SCHEMA_MANIFEST[name].version;
}

export function loadCompatSchema(name) {
  if (!(name in COMPAT_SCHEMA_MANIFEST)) {
    throw new ConfigError(`unknown compat schema name: ${name}`);
  }
  if (cache.has(name)) return cache.get(name);
  const file = path.join(SCHEMA_DIR, COMPAT_SCHEMA_MANIFEST[name].file);
  let schema;
  try {
    schema = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new ConfigError(`cannot load compat schema '${name}' from ${file}: ${err.message}`);
  }
  if (typeof schema.$id !== 'string' || schema.$id === '') {
    throw new ConfigError(`compat schema '${name}' is missing a non-empty $id`);
  }
  cache.set(name, schema);
  return schema;
}

/**
 * Validate an instance against a compat schema, including conditional
 * code-side rules. @returns {{ valid: boolean, errors: Array<{path,message}> }}
 */
export function validateCompatRecord(name, instance) {
  const result = validateAgainstSchema(instance, loadCompatSchema(name));
  if (result.valid) {
    assertNoEmptyStringFacts(name, instance, result);
  }
  return result;
}

/**
 * Conditional rule for lcim.v1.projection: every UNKNOWN-able string fact
 * must be the exact reserved sentinel 'UNKNOWN_V1' or a non-empty string;
 * every UNKNOWN-able integer fact must be a non-negative integer or the
 * exact sentinel. Empty strings / invented values would silently erase a
 * fact, which is forbidden.
 */
function assertNoEmptyStringFacts(name, instance, result) {
  if (name !== 'lcim.v1.projection') return;
  if (instance === null || typeof instance !== 'object' || Array.isArray(instance)) return;
  const push = (path_, value) => {
    if (typeof value === 'string' && value !== 'UNKNOWN_V1' && value.length === 0) {
      result.errors.push({
        path: path_,
        message: 'string facts must be non-empty (or the reserved sentinel UNKNOWN_V1); empty strings are not a valid fact representation',
      });
      result.valid = false;
    }
    if (typeof value === 'number' && !(Number.isInteger(value) && value >= 0)) {
      result.errors.push({
        path: path_,
        message: 'integer facts must be non-negative integers (or the reserved sentinel UNKNOWN_V1); invented values are forbidden',
      });
      result.valid = false;
    }
  };
  if (Array.isArray(instance.workUnits)) {
    for (const [i, wu] of instance.workUnits.entries()) {
      if (wu === null || typeof wu !== 'object' || Array.isArray(wu)) continue;
      const at = `workUnits[${i}]`;
      push(`${at}.workUnitId`, wu.workUnitId);
      push(`${at}.assignment.taskSummary`, wu.assignment?.taskSummary);
      push(`${at}.assignment.baseShaClaim`, wu.assignment?.baseShaClaim);
      push(`${at}.handoff.workerClaim.status`, wu.handoff?.workerClaim?.status);
      push(`${at}.handoff.workerClaim.summary`, wu.handoff?.workerClaim?.summary);
      push(`${at}.handoff.workerClaim.testLogPath`, wu.handoff?.workerClaim?.testLogPath);
      push(`${at}.handoff.workerClaim.patchHashClaim`, wu.handoff?.workerClaim?.patchHashClaim);
      push(`${at}.handoff.workerClaim.evidenceRefCount`, wu.handoff?.workerClaim?.evidenceRefCount);
      push(`${at}.handoff.workerClaim.changedFileCount`, wu.handoff?.workerClaim?.changedFileCount);
      push(`${at}.handoff.workerClaim.testExitStatus`, wu.handoff?.workerClaim?.testExitStatus);
      push(`${at}.patch.usefulnessEvidence`, wu.patch?.usefulnessEvidence);
      push(`${at}.controller.integrationNote`, wu.controller?.integrationNote);
      push(`${at}.coverage.laterEventCount`, wu.coverage?.laterEventCount);
    }
  }
}

/**
 * Stamp a compat record with schemaName/schemaVersion and validate it.
 * Returns a frozen copy; throws SchemaValidationError on failure.
 */
export function stampCompatRecord(name, data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ConfigError(`stampCompatRecord('${name}') requires a plain object`);
  }
  const record = Object.freeze({
    ...data,
    schemaName: name,
    schemaVersion: getCompatSchemaVersion(name),
  });
  const result = validateCompatRecord(name, record);
  if (!result.valid) {
    throw new SchemaValidationError(
      `record '${name}' failed compat schema validation: ${formatErrors(result.errors)}`,
      { errors: result.errors },
    );
  }
  return record;
}

function formatErrors(errors) {
  return errors.map((e) => `${e.path || '(root)'}: ${e.message}`).join('; ');
}
