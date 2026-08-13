/**
 * Sprint 04 test helpers: contract fixtures.
 *
 * Fixtures under tests/fixtures/contracts/ are written in COMPILED document
 * shape (they carry schemaName/schemaVersion/compileStatus/compiledAt and,
 * since the SOL-S04 repairs, semanticDigest + derived sideEffectId values).
 * `compileSemanticContract` consumes RAW structured input only and fails
 * closed on caller-supplied derived fields (semanticDigest, sideEffectId),
 * so tests that compile a fixture convert it first.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONTRACT_FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'contracts',
);

/** @param {string} name fixture file name */
export function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(CONTRACT_FIXTURE_DIR, name), 'utf8'));
}

/** Compiled-document fields the compiler derives; never valid raw input. */
const DERIVED_DOC_FIELDS = [
  'schemaName',
  'schemaVersion',
  'compileStatus',
  'compiledAt',
  'semanticDigest',
  'compileWarnings',
];

/**
 * Convert a compiled-shaped fixture document into raw compiler input:
 * derived document fields are dropped and side effects lose their derived
 * sideEffectId (the compiler re-derives it deterministically).
 * @param {object} doc fixture document
 * @returns {object} raw input for compileSemanticContract
 */
export function rawInputFromFixture(doc) {
  const input = {};
  for (const [key, value] of Object.entries(doc)) {
    if (DERIVED_DOC_FIELDS.includes(key)) continue;
    input[key] = value;
  }
  if (Array.isArray(input.negativeSideEffects)) {
    input.negativeSideEffects = input.negativeSideEffects.map((s) => {
      const { sideEffectId: _derived, ...spec } = s;
      return spec;
    });
  }
  return input;
}
