/**
 * LCIM V2 Sprint 01 schema registry for the sprint-owned record families.
 *
 * Sprint 01 owns three record families — lcim.event (ledger line),
 * lcim.invocation (compact invocation projection), lcim.run (run store
 * record) — defined in schemas/event.v2.schema.json,
 * schemas/invocation.v2.schema.json, schemas/run.v2.schema.json.
 *
 * These are SEPARATE from the frozen Sprint-00 common family
 * (src/shared/schema-registry.mjs, lcim.common.*, version 2.0.0). They are
 * versioned independently (1.0.0 at first release) and validated with the
 * same shared validation engine (validateAgainstSchema) so the Sprint-00
 * failure-closed subset discipline applies unchanged. No Sprint-00 shared
 * file is modified.
 *
 * Conditional semantic rules enforced here (mirroring the Sprint-00
 * REJECTED-disposition rule):
 * - lcim.event / lcim.invocation: when assessmentResult === 'REJECTED',
 *   rejectionCode is REQUIRED and must be a valid rejection-taxonomy code.
 * - lcim.event kind-specific rules (validateEventInstance): START requires
 *   provider/model/role/reasoningEffort; COMPLETION requires outcome and
 *   non-negative usage tokens; ASSESSMENT requires assessmentResult;
 *   RECONCILIATION requires reconciliationReason.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, SchemaValidationError } from '../shared/errors.mjs';
import { validateAgainstSchema } from '../shared/schema/validate.mjs';
import { INVOCATION_OUTCOME, INVOCATION_ROLE } from './enums.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.resolve(HERE, '../../schemas');

/** Sprint-01 schema manifest: schema name -> { file, version }. */
export const SPRINT_SCHEMA_MANIFEST = Object.freeze({
  'lcim.event': { file: 'event.v2.schema.json', version: '1.0.0' },
  'lcim.invocation': { file: 'invocation.v2.schema.json', version: '1.0.0' },
  'lcim.run': { file: 'run.v2.schema.json', version: '1.0.0' },
});

/** Current schema version of the Sprint-01 record families. */
export const SPRINT_SCHEMA_VERSION = '1.0.0';

const cache = new Map();

export function sprintSchemaNames() {
  return Object.keys(SPRINT_SCHEMA_MANIFEST);
}

export function getSprintSchemaVersion(name) {
  if (!(name in SPRINT_SCHEMA_MANIFEST)) {
    throw new ConfigError(`unknown sprint schema name: ${name}`);
  }
  return SPRINT_SCHEMA_MANIFEST[name].version;
}

export function loadSprintSchema(name) {
  if (!(name in SPRINT_SCHEMA_MANIFEST)) {
    throw new ConfigError(`unknown sprint schema name: ${name}`);
  }
  if (cache.has(name)) return cache.get(name);
  const file = path.join(SCHEMA_DIR, SPRINT_SCHEMA_MANIFEST[name].file);
  let schema;
  try {
    schema = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new ConfigError(`cannot load sprint schema '${name}' from ${file}: ${err.message}`);
  }
  if (typeof schema.$id !== 'string' || schema.$id === '') {
    throw new ConfigError(`sprint schema '${name}' is missing a non-empty $id`);
  }
  cache.set(name, schema);
  return schema;
}

/**
 * Validate an instance against a sprint schema, including the conditional
 * semantic rules. @returns {{ valid: boolean, errors: Array<{path,message}> }}
 */
export function validateSprintRecord(name, instance) {
  const result = validateAgainstSchema(instance, loadSprintSchema(name));
  if (result.valid) {
    assertRejectedAssessmentHasRejectionCode(name, instance, result);
  }
  return result;
}

/** REJECTED assessmentResult requires a valid rejectionCode (both families). */
function assertRejectedAssessmentHasRejectionCode(name, instance, result) {
  if (name !== 'lcim.event' && name !== 'lcim.invocation') return;
  if (instance === null || typeof instance !== 'object') return;
  if (instance.assessmentResult === 'REJECTED' && instance.rejectionCode === undefined) {
    result.errors.push({
      path: 'rejectionCode',
      message: "rejectionCode is required when assessmentResult is 'REJECTED' (a valid rejection-taxonomy code must be recorded)",
    });
    result.valid = false;
  }
}

/**
 * Stamp a sprint record with schemaName/schemaVersion and validate it.
 * Returns a frozen copy; throws SchemaValidationError on failure.
 */
export function stampSprintRecord(name, data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ConfigError(`stampSprintRecord('${name}') requires a plain object`);
  }
  const record = Object.freeze({
    ...data,
    schemaName: name,
    schemaVersion: getSprintSchemaVersion(name),
  });
  const result = validateSprintRecord(name, record);
  if (!result.valid) {
    throw new SchemaValidationError(
      `record '${name}' failed sprint schema validation: ${formatErrors(result.errors)}`,
      { errors: result.errors },
    );
  }
  return record;
}

/**
 * Validate a ledger event: schema + conditional rules + kind-specific
 * requirements. This is the authoritative per-event check used by the
 * writer and the reader/validator.
 */
export function validateEventInstance(ev) {
  const result = validateSprintRecord('lcim.event', ev);
  if (!result.valid) return result;
  const errors = [];
  if (!Number.isInteger(ev.seq) || ev.seq < 1) {
    errors.push({ path: 'seq', message: 'seq must be a positive integer (monotonic from 1)' });
  }
  switch (ev.kind) {
    case 'START':
      for (const field of ['provider', 'model', 'role', 'reasoningEffort']) {
        if (typeof ev[field] !== 'string' || ev[field].length === 0) {
          errors.push({ path: field, message: `required non-empty string for START events` });
        }
      }
      if (ev.role !== undefined && !INVOCATION_ROLE.includes(ev.role)) {
        errors.push({ path: 'role', message: `invalid invocation role ${JSON.stringify(ev.role)}` });
      }
      break;
    case 'COMPLETION':
      if (ev.outcome === undefined) {
        errors.push({ path: 'outcome', message: 'required for COMPLETION events' });
      } else if (!INVOCATION_OUTCOME.includes(ev.outcome)) {
        errors.push({ path: 'outcome', message: `invalid outcome ${JSON.stringify(ev.outcome)}` });
      }
      if (ev.usage !== undefined) {
        for (const field of ['inputTokens', 'outputTokens', 'totalTokens']) {
          const v = ev.usage[field];
          if (!Number.isInteger(v) || v < 0) {
            errors.push({ path: `usage.${field}`, message: 'usage tokens must be non-negative integers' });
          }
        }
      }
      break;
    case 'ASSESSMENT':
      if (ev.assessmentResult === undefined) {
        errors.push({ path: 'assessmentResult', message: 'required for ASSESSMENT events' });
      }
      break;
    case 'RECONCILIATION':
      if (ev.reconciliationReason === undefined) {
        errors.push({ path: 'reconciliationReason', message: 'required for RECONCILIATION events' });
      }
      break;
    default:
      errors.push({ path: 'kind', message: `unknown event kind ${JSON.stringify(ev.kind)}` });
  }
  return { valid: errors.length === 0, errors };
}

function formatErrors(errors) {
  return errors.map((e) => `${e.path || '(root)'}: ${e.message}`).join('; ');
}
