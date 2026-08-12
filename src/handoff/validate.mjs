/**
 * LCIM V2 worker-result validation (Sprint 02).
 *
 * Validates a PARSED worker payload against `schemas/worker-result.v2.schema.json`
 * using the Sprint-00 shared validation engine (`src/shared/schema/validate.mjs` —
 * reused, not replaced). On top of schema validity it applies the worker
 * contract's objective-evidence scan (src/workers/contract.mjs) so legacy
 * V1 / controller-owned fields get precise diagnostics.
 *
 * Validation only records validity — it NEVER repairs a semantically wrong
 * response to make the schema pass (Sprint 02 acceptance criterion). A
 * parsed-but-invalid payload is a `SCHEMA_MISMATCH` transport defect,
 * distinct from a `TRANSPORT_MALFORMED` parse failure.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAgainstSchema } from '../shared/schema/validate.mjs';
import { SchemaValidationError } from '../shared/errors.mjs';
import {
  WORKER_RESULT_SCHEMA_FILE,
  listObjectiveEvidenceViolations,
} from '../workers/contract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKER_RESULT_SCHEMA_PATH = path.resolve(HERE, '../../schemas', WORKER_RESULT_SCHEMA_FILE);

let cachedSchema = null;

/**
 * Load (and cache) the worker-result schema. The Sprint-00 engine validates
 * the schema definition itself and fails closed on unsupported keywords.
 */
export function loadWorkerResultSchema() {
  if (cachedSchema) return cachedSchema;
  let schema;
  try {
    schema = JSON.parse(readFileSync(WORKER_RESULT_SCHEMA_PATH, 'utf8'));
  } catch (err) {
    throw new SchemaValidationError(
      `cannot load worker-result schema from ${WORKER_RESULT_SCHEMA_PATH}: ${err.message}`,
    );
  }
  cachedSchema = schema;
  return schema;
}

/**
 * Validate a parsed worker payload.
 * @param {unknown} value
 * @returns {{ok: boolean, errors: Array<{path: string, message: string}>, value: unknown}}
 */
export function validateWorkerResult(value) {
  const result = validateAgainstSchema(value, loadWorkerResultSchema());
  const violations = listObjectiveEvidenceViolations(value);
  const errors = [
    ...result.errors.map((e) => ({ path: e.path, message: e.message })),
    ...violations.map((v) => ({ path: v.field, message: v.reason })),
  ];
  return { ok: result.valid && violations.length === 0, errors, value };
}

/**
 * Authoritative assertion path (mirrors `stampRecord`): throws
 * SchemaValidationError when the payload is not schema-valid. Returns the
 * frozen value on success.
 */
export function assertWorkerResult(value) {
  const result = validateWorkerResult(value);
  if (!result.ok) {
    const detail = result.errors
      .map((e) => `${e.path || '(root)'}: ${e.message}`)
      .join('; ');
    throw new SchemaValidationError(`worker result failed schema validation: ${detail}`);
  }
  return Object.freeze(value);
}
