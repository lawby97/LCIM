/**
 * LCIM V2 Sprint 08 review-summary schema registry (sprint-local).
 *
 * Sprint 08 owns one record family: lcim.review-summary (one line of the
 * deterministic reviews.jsonl audit projection), defined in
 * schemas/review-summary.v2.schema.json and versioned independently at
 * 1.0.0 — mirroring the Sprint-01 lcim.event/lcim.invocation/lcim.run
 * discipline (separate from the frozen Sprint-00 lcim.common.* family at
 * 2.0.0; no shared file is modified).
 *
 * Every reviews.jsonl line is stamped and validated here before it can be
 * serialized, so a derivation bug fails the audit closed instead of
 * emitting an out-of-contract projection line.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, SchemaValidationError } from '../shared/errors.mjs';
import { validateAgainstSchema } from '../shared/schema/validate.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_FILE = path.resolve(HERE, '../../schemas/review-summary.v2.schema.json');

/** Sprint-08 review-summary schema identity. */
export const REVIEW_SUMMARY_SCHEMA = Object.freeze({
  name: 'lcim.review-summary',
  file: 'review-summary.v2.schema.json',
  version: '1.0.0',
});

let cached = null;

export function loadReviewSummarySchema() {
  if (cached !== null) return cached;
  let schema;
  try {
    schema = JSON.parse(readFileSync(SCHEMA_FILE, 'utf8'));
  } catch (err) {
    throw new ConfigError(`cannot load review-summary schema from ${SCHEMA_FILE}: ${err.message}`);
  }
  if (typeof schema.$id !== 'string' || schema.$id === '') {
    throw new ConfigError('review-summary schema is missing a non-empty $id');
  }
  cached = schema;
  return schema;
}

/** Validate a review-summary instance (no stamping). */
export function validateReviewSummary(instance) {
  return validateAgainstSchema(instance, loadReviewSummarySchema());
}

/**
 * Stamp a review-summary record with schemaName/schemaVersion, validate
 * against the schema, and freeze. Throws SchemaValidationError on failure.
 */
export function stampReviewSummary(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ConfigError('stampReviewSummary() requires a plain object');
  }
  const record = Object.freeze({
    ...data,
    schemaName: REVIEW_SUMMARY_SCHEMA.name,
    schemaVersion: REVIEW_SUMMARY_SCHEMA.version,
  });
  const result = validateReviewSummary(record);
  if (!result.valid) {
    throw new SchemaValidationError(
      `review-summary record failed schema validation: ${result.errors.map((e) => `${e.path || '(root)'}: ${e.message}`).join('; ')}`,
      { errors: result.errors },
    );
  }
  return record;
}
