/**
 * LCIM V2 SOL schema registry (Sprint 06).
 *
 * Sprint-owned registry for the three Sprint-06 schemas
 * (`lcim.sol-ask`, `lcim.sol-response`, `lcim.repair-ticket`). It
 * deliberately does NOT touch the Sprint-00 shared registry
 * (`src/shared/schema-registry.mjs` stays the authority for
 * `lcim.common.*`) nor the Sprint-04 registry
 * (`src/contracts/registry.mjs` stays the authority for
 * `lcim.semantic-contract` / `lcim.acceptance-contract`); later sprints
 * consuming SOL contracts import this module instead. Validation runs
 * through the shared Sprint-00 engine (`validateAgainstSchema`) so the
 * fail-closed keyword discipline applies unchanged — these schemas use
 * only the supported subset (no `$ref`, no `oneOf`, no `format`, no
 * minimum/maximum; budget magnitudes and other non-negative integer
 * semantics are enforced in `./validate.mjs`).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError } from '../../shared/errors.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.resolve(HERE, '../../../schemas');

/** Sprint-06 schema manifest: schema name -> { file, version }. */
export const SOL_SCHEMA_MANIFEST = Object.freeze({
  'lcim.sol-ask': { file: 'sol-ask.v2.schema.json', version: '2.0.0' },
  'lcim.sol-response': { file: 'sol-response.v2.schema.json', version: '2.0.0' },
  'lcim.repair-ticket': { file: 'repair-ticket.v2.schema.json', version: '2.0.0' },
});

/** Current version of the Sprint-06 SOL schema family. */
export const SOL_SCHEMA_VERSION = '2.0.0';

const cache = new Map();

export function solSchemaNames() {
  return Object.keys(SOL_SCHEMA_MANIFEST);
}

export function loadSolSchema(name) {
  if (!(name in SOL_SCHEMA_MANIFEST)) {
    throw new ConfigError(`unknown SOL schema name: ${name}`);
  }
  if (cache.has(name)) return cache.get(name);
  const file = path.join(SCHEMA_DIR, SOL_SCHEMA_MANIFEST[name].file);
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
