/**
 * Sprint 03 patch-evidence schema registry (sprint-local).
 *
 * The Sprint 00 shared registry (`src/shared/schema-registry.mjs`) is a
 * frozen contract and its lockstep test pins it to `schemas/common/*.json`;
 * Sprint 03 therefore registers its own schema here, in its own module, and
 * validates with the same shared validation engine
 * (`src/shared/schema/validate.mjs`). Schema family version: 2.0.0.
 *
 * Semantic rule enforced at stamp time (like the shared disposition rule):
 * patchId MUST equal `lcim_patch_` + first 32 hex chars of patchHash — the
 * patch artifact identity is derived from the controller-computed hash.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAgainstSchema } from '../../shared/schema/validate.mjs';
import { EvidenceError } from '../../git/errors.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_FILE = path.resolve(HERE, '../../../schemas/patch-evidence.v2.schema.json');

export const PATCH_EVIDENCE_SCHEMA = Object.freeze({
  name: 'lcim.patch-evidence',
  file: 'patch-evidence.v2.schema.json',
  version: '2.0.0',
});

let cached = null;

export function loadPatchEvidenceSchema() {
  if (cached !== null) return cached;
  let schema;
  try {
    schema = JSON.parse(readFileSync(SCHEMA_FILE, 'utf8'));
  } catch (err) {
    throw new EvidenceError(`cannot load patch-evidence schema from ${SCHEMA_FILE}: ${err.message}`);
  }
  if (typeof schema.$id !== 'string' || schema.$id === '') {
    throw new EvidenceError(`patch-evidence schema is missing a non-empty $id`);
  }
  cached = schema;
  return schema;
}

/** Validate a patch-evidence instance (no stamping). */
export function validatePatchEvidence(instance) {
  return validateAgainstSchema(instance, loadPatchEvidenceSchema());
}

/**
 * Stamp a patch-evidence record with schemaName/schemaVersion, enforce the
 * patchId<->patchHash identity rule, validate, and freeze.
 * Throws EvidenceError on any failure.
 */
export function stampPatchEvidence(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new EvidenceError('stampPatchEvidence() requires a plain object');
  }
  if (typeof data.patchId === 'string' && typeof data.patchHash === 'string') {
    const expectedId = `lcim_patch_${data.patchHash.slice(0, 32)}`;
    if (data.patchId !== expectedId) {
      throw new EvidenceError(
        `patchId ${data.patchId} does not derive from patchHash ${data.patchHash} (expected ${expectedId})`,
        { patchId: data.patchId, patchHash: data.patchHash },
      );
    }
  }
  const record = Object.freeze({
    ...data,
    schemaName: PATCH_EVIDENCE_SCHEMA.name,
    schemaVersion: PATCH_EVIDENCE_SCHEMA.version,
  });
  const result = validateAgainstSchema(record, loadPatchEvidenceSchema());
  if (!result.valid) {
    throw new EvidenceError(
      `patch-evidence record failed schema validation: ${result.errors.map((e) => `${e.path || '(root)'}: ${e.message}`).join('; ')}`,
      { errors: result.errors },
    );
  }
  return record;
}
