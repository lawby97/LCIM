/**
 * LCIM V2 shared schema registry (Sprint 00).
 *
 * Single source of truth mapping schema names to schema files under
 * `schemas/common/`. Every shared record is stamped with `schemaName` +
 * `schemaVersion` (envelope) before it can be validated, so callers cannot
 * mislabel records. Later sprints register their own schemas here (or in
 * their own modules) — the name/version discipline is established now.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, SchemaValidationError, errorPayload } from './errors.mjs';
import { validateAgainstSchema } from './schema/validate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.resolve(HERE, '../../schemas/common');

/** Canonical schema manifest: schema name -> { file, version }. */
export const SCHEMA_MANIFEST = Object.freeze({
  'lcim.common.envelope': { file: 'common-envelope.v2.schema.json', version: '2.0.0' },
  'lcim.common.enums': { file: 'common-enums.v2.schema.json', version: '2.0.0' },
  'lcim.common.run': { file: 'common-run.v2.schema.json', version: '2.0.0' },
  'lcim.common.invocation': { file: 'common-invocation.v2.schema.json', version: '2.0.0' },
  'lcim.common.work-unit': { file: 'common-work-unit.v2.schema.json', version: '2.0.0' },
  'lcim.common.disposition': { file: 'common-disposition.v2.schema.json', version: '2.0.0' },
  'lcim.common.review-finding': { file: 'common-review-finding.v2.schema.json', version: '2.0.0' },
  'lcim.common.rejection': { file: 'common-rejection.v2.schema.json', version: '2.0.0' },
  'lcim.common.error': { file: 'common-error.v2.schema.json', version: '2.0.0' },
});

/** Current schema version for the shared contract family. */
export const SCHEMA_VERSION = '2.0.0';

const cache = new Map();

export function schemaNames() {
  return Object.keys(SCHEMA_MANIFEST);
}

export function getSchemaVersion(name) {
  if (!(name in SCHEMA_MANIFEST)) {
    throw new ConfigError(`unknown schema name: ${name}`);
  }
  return SCHEMA_MANIFEST[name].version;
}

export function loadSchema(name) {
  if (!(name in SCHEMA_MANIFEST)) {
    throw new ConfigError(`unknown schema name: ${name}`);
  }
  if (cache.has(name)) return cache.get(name);
  const file = path.join(SCHEMA_DIR, SCHEMA_MANIFEST[name].file);
  let schema;
  try {
    schema = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new ConfigError(`cannot load schema '${name}' from ${file}: ${err.message}`);
  }
  if (typeof schema.$id !== 'string' || schema.$id === '') {
    throw new ConfigError(`schema '${name}' is missing a non-empty $id`);
  }
  cache.set(name, schema);
  return schema;
}

/** Validate a record against one of the shared schemas.
 *
 * This is the AUTHORITATIVE common-record validation path: `stampRecord()`,
 * `toErrorRecord()` and every other consumer go through it. Besides the
 * generic engine it enforces the conditional semantic rule (documented here
 * and in docs/v2-architecture.md section 3.5):
 *
 *   lcim.common.disposition: if disposition === 'REJECTED', reasonCode is
 *   REQUIRED and must be a valid rejection-taxonomy code. (The taxonomy
 *   enum itself is enforced by the schema's reasonCode enum once the
 *   property is present; this rule closes the "REJECTED without reason"
 *   gap.) reasonCode stays optional for every positive/non-rejected
 *   disposition (PATCH_VALID, SEMANTICALLY_ACCEPTED, CANDIDATE_INTEGRATED,
 *   REVIEW_APPROVED, REVIEW_REQUIRED).
 */
export function validateCommonRecord(name, instance) {
  const result = validateAgainstSchema(instance, loadSchema(name));
  if (result.valid) {
    assertRejectedDispositionHasReasonCode(name, instance, result);
  }
  return result;
}

/**
 * Conditional semantic rule for lcim.common.disposition records:
 * REJECTED must carry a reasonCode (validity of the code value is enforced
 * by the schema's reasonCode enum). Non-disposition records and
 * non-REJECTED dispositions are unaffected.
 */
function assertRejectedDispositionHasReasonCode(name, instance, result) {
  if (name !== 'lcim.common.disposition') return;
  if (instance === null || typeof instance !== 'object') return;
  if (instance.disposition === 'REJECTED' && instance.reasonCode === undefined) {
    result.errors.push({
      path: 'reasonCode',
      message: "reasonCode is required when disposition is 'REJECTED' (a valid rejection-taxonomy code must be recorded)",
    });
    result.valid = false;
  }
}

/**
 * Stamp a record with its schema name/version and validate it.
 * Returns a frozen copy; throws SchemaValidationError on failure.
 */
export function stampRecord(name, data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ConfigError(`stampRecord('${name}') requires a plain object`);
  }
  const record = Object.freeze({
    ...data,
    schemaName: name,
    schemaVersion: getSchemaVersion(name),
  });
  const result = validateCommonRecord(name, record);
  if (!result.valid) {
    throw new SchemaValidationError(
      `record '${name}' failed schema validation: ${formatErrors(result.errors)}`,
      { errors: result.errors },
    );
  }
  return record;
}

/** Build a public-safe, schema-valid error record from any thrown value. */
export function toErrorRecord(err) {
  return stampRecord('lcim.common.error', errorPayload(err));
}

function formatErrors(errors) {
  return errors.map((e) => `${e.path || '(root)'}: ${e.message}`).join('; ');
}
