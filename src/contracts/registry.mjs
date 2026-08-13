/**
 * LCIM V2 semantic/acceptance schema registry (Sprint 04).
 *
 * Sprint-owned registry for the two Sprint-04 schemas. It deliberately does
 * NOT touch the Sprint-00 shared registry (`src/shared/schema-registry.mjs`
 * stays the authority for `lcim.common.*`); later sprints consuming the
 * semantic contract import this module instead. Validation runs through the
 * shared Sprint-00 engine (`validateAgainstSchema`) so the fail-closed
 * keyword discipline applies unchanged — these schemas use only the
 * supported subset (no `$ref`, no `oneOf`, no `format`, no minimum/maximum;
 * expectedCount >= 0 is enforced as a semantic rule in `./validate.mjs`).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError } from '../shared/errors.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.resolve(HERE, '../../schemas');

/** Sprint-04 schema manifest: schema name -> { file, version }. */
export const CONTRACT_SCHEMA_MANIFEST = Object.freeze({
  'lcim.semantic-contract': { file: 'semantic-contract.v2.schema.json', version: '2.0.0' },
  'lcim.acceptance-contract': { file: 'acceptance-contract.v2.schema.json', version: '2.0.0' },
});

/** Current version of the Sprint-04 contract schema family. */
export const CONTRACT_SCHEMA_VERSION = '2.0.0';

const cache = new Map();

export function contractSchemaNames() {
  return Object.keys(CONTRACT_SCHEMA_MANIFEST);
}

export function loadContractSchema(name) {
  if (!(name in CONTRACT_SCHEMA_MANIFEST)) {
    throw new ConfigError(`unknown contract schema name: ${name}`);
  }
  if (cache.has(name)) return cache.get(name);
  const file = path.join(SCHEMA_DIR, CONTRACT_SCHEMA_MANIFEST[name].file);
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
