/**
 * Sprint-00 minimal JSON-schema validation engine (dependency-free).
 *
 * Supported keywords (documented in docs/v2-architecture.md):
 *   $schema, $id, $comment, title, description (ignored string metadata)
 *   type (string or array of strings), required, properties,
 *   additionalProperties (boolean only), items (schema object or array of
 *   schema objects), enum (non-empty array), const, pattern (string,
 *   compilable RegExp), minLength, maxLength, minItems, maxItems
 *   (non-negative integers).
 *
 * Everything else — including $ref, oneOf/anyOf/allOf/not, if/then/else,
 * format, patternProperties, $defs/definitions, minimum/maximum — FAILS
 * CLOSED with a SchemaEngineError. This prevents later sprints from
 * silently relying on validation semantics this engine does not implement.
 * A later sprint may swap in a full validator (e.g. ajv) behind the same
 * `validateAgainstSchema` signature via an interface-change request.
 *
 * FAILURE-CLOSED SCHEMA DEFINITIONS: before any instance is validated, the
 * schema definition itself is shape-checked (assertSupportedSchema). Every
 * supported keyword rejects value forms outside the explicitly supported
 * subset below with a SchemaEngineError — e.g. non-boolean
 * additionalProperties, boolean/null/primitive items, malformed enum /
 * required / type / pattern / bounds. Nothing is silently coerced or
 * silently skipped. Sub-schemas inside properties/items are checked
 * recursively.
 */

import { SchemaEngineError } from '../errors.mjs';
import { deepStrictEqual } from 'node:assert';

const SUPPORTED_KEYWORDS = new Set([
  '$schema',
  '$id',
  '$comment',
  'title',
  'description',
  'type',
  'required',
  'properties',
  'additionalProperties',
  'items',
  'enum',
  'const',
  'pattern',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
]);

/** Metadata keywords: accepted and shape-checked as strings, then ignored. */
const METADATA_KEYWORDS = ['$schema', '$id', '$comment', 'title', 'description'];

const TYPE_NAMES = new Set(['string', 'number', 'integer', 'boolean', 'null', 'array', 'object']);

/** Bounds keywords: non-negative integers only. */
const BOUND_KEYWORDS = ['minLength', 'maxLength', 'minItems', 'maxItems'];

/**
 * Validate an instance against a schema.
 * @returns {{ valid: boolean, errors: Array<{path: string, message: string}> }}
 */
export function validateAgainstSchema(instance, schema) {
  assertSupportedSchema(schema, '(root)');
  const errors = [];
  check(instance, schema, errors, '');
  return { valid: errors.length === 0, errors };
}

/**
 * Fail-closed shape validation of the schema definition itself. Every
 * supported keyword must use one of the explicitly supported forms; any
 * other value is rejected with SchemaEngineError before instance
 * validation. Recurses into sub-schemas of properties/items.
 */
function assertSupportedSchema(schema, at) {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new SchemaEngineError(
      `schema at ${at} must be an object, got ${describe(schema)}`,
    );
  }
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(key)) {
      throw new SchemaEngineError(
        `unsupported JSON-schema keyword '${key}' at ${at}; ` +
          `Sprint-00 engine supports: ${[...SUPPORTED_KEYWORDS].sort().join(', ')}`,
      );
    }
  }

  for (const key of METADATA_KEYWORDS) {
    if (schema[key] !== undefined && typeof schema[key] !== 'string') {
      throw keywordShapeError(at, key, 'a string', schema[key]);
    }
  }

  if (schema.type !== undefined) {
    const list = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (list.length === 0) {
      throw keywordShapeError(at, 'type', 'a type name or a non-empty array of type names', schema.type);
    }
    for (const t of list) {
      if (typeof t !== 'string' || !TYPE_NAMES.has(t)) {
        throw new SchemaEngineError(
          `invalid value for JSON-schema keyword 'type' at ${at}: ` +
            `${JSON.stringify(t)} is not a supported type; supported: ${[...TYPE_NAMES].sort().join(', ')}`,
        );
      }
    }
    if (Array.isArray(schema.type) && new Set(schema.type).size !== schema.type.length) {
      throw keywordShapeError(at, 'type', 'unique type names (no duplicates)', schema.type);
    }
  }

  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required)) {
      throw keywordShapeError(at, 'required', 'an array of unique non-empty strings', schema.required);
    }
    for (const r of schema.required) {
      if (typeof r !== 'string' || r.length === 0) {
        throw keywordShapeError(at, 'required', 'an array of unique non-empty strings', schema.required);
      }
    }
    if (new Set(schema.required).size !== schema.required.length) {
      throw keywordShapeError(at, 'required', 'unique property names (no duplicates)', schema.required);
    }
  }

  if (schema.properties !== undefined) {
    if (schema.properties === null || typeof schema.properties !== 'object' || Array.isArray(schema.properties)) {
      throw keywordShapeError(at, 'properties', 'an object whose values are schemas', schema.properties);
    }
    for (const [k, sub] of Object.entries(schema.properties)) {
      assertSupportedSchema(sub, `${at}.properties.${k}`);
    }
  }

  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== 'boolean') {
    throw keywordShapeError(at, 'additionalProperties', 'a boolean (true/false)', schema.additionalProperties);
  }

  if (schema.items !== undefined) {
    if (Array.isArray(schema.items)) {
      for (const [i, sub] of schema.items.entries()) {
        assertSupportedSchema(sub, `${at}.items[${i}]`);
      }
    } else if (schema.items !== null && typeof schema.items === 'object') {
      assertSupportedSchema(schema.items, `${at}.items`);
    } else {
      throw new SchemaEngineError(
        `invalid value for JSON-schema keyword 'items' at ${at}: only a schema object or an array of schema objects is supported, got ${describe(schema.items)}`,
      );
    }
  }

  if (schema.enum !== undefined && (!Array.isArray(schema.enum) || schema.enum.length === 0)) {
    throw keywordShapeError(at, 'enum', 'a non-empty array', schema.enum);
  }

  if (schema.pattern !== undefined) {
    if (typeof schema.pattern !== 'string') {
      throw keywordShapeError(at, 'pattern', 'a string regular expression', schema.pattern);
    }
    try {
      new RegExp(schema.pattern);
    } catch (err) {
      throw new SchemaEngineError(
        `invalid regular expression for 'pattern' at ${at}: ${err.message}`,
      );
    }
  }

  for (const key of BOUND_KEYWORDS) {
    if (schema[key] !== undefined && (typeof schema[key] !== 'number' || !Number.isInteger(schema[key]) || schema[key] < 0)) {
      throw keywordShapeError(at, key, 'a non-negative integer', schema[key]);
    }
  }
}

function keywordShapeError(at, keyword, expected, got) {
  return new SchemaEngineError(
    `invalid value for JSON-schema keyword '${keyword}' at ${at}: expected ${expected}, got ${describe(got)}`,
  );
}

function check(instance, schema, errors, at) {
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeOk(instance, t))) {
      errors.push({ path: at, message: `expected type ${JSON.stringify(schema.type)}, got ${describe(instance)}` });
      return;
    }
  }

  if (typeof instance === 'string') {
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(instance)) {
      errors.push({ path: at, message: `does not match pattern ${schema.pattern}` });
    }
    if (schema.minLength !== undefined && instance.length < schema.minLength) {
      errors.push({ path: at, message: `shorter than minLength ${schema.minLength}` });
    }
    if (schema.maxLength !== undefined && instance.length > schema.maxLength) {
      errors.push({ path: at, message: `longer than maxLength ${schema.maxLength}` });
    }
  }

  if (schema.enum !== undefined && !schema.enum.some((v) => deepEqual(v, instance))) {
    errors.push({ path: at, message: `must be one of ${JSON.stringify(schema.enum)}` });
  }

  if (schema.const !== undefined && !deepEqual(schema.const, instance)) {
    errors.push({ path: at, message: `must equal const ${JSON.stringify(schema.const)}` });
  }

  if (Array.isArray(instance)) {
    if (schema.minItems !== undefined && instance.length < schema.minItems) {
      errors.push({ path: at, message: `fewer than minItems ${schema.minItems}` });
    }
    if (schema.maxItems !== undefined && instance.length > schema.maxItems) {
      errors.push({ path: at, message: `more than maxItems ${schema.maxItems}` });
    }
    if (schema.items !== undefined) {
      if (Array.isArray(schema.items)) {
        for (let i = 0; i < instance.length; i += 1) {
          if (i < schema.items.length) check(instance[i], schema.items[i], errors, `${at}[${i}]`);
        }
      } else {
        for (let i = 0; i < instance.length; i += 1) {
          check(instance[i], schema.items, errors, `${at}[${i}]`);
        }
      }
    }
  }

  if (instance !== null && typeof instance === 'object' && !Array.isArray(instance)) {
    if (schema.required) {
      for (const r of schema.required) {
        if (!(r in instance)) errors.push({ path: at, message: `missing required property '${r}'` });
      }
    }
    if (schema.properties) {
      for (const [k, sub] of Object.entries(schema.properties)) {
        if (k in instance && instance[k] !== undefined) {
          check(instance[k], sub, errors, at ? `${at}.${k}` : k);
        }
      }
    }
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(instance)) {
        if (!schema.properties || !(k in schema.properties)) {
          errors.push({ path: at, message: `additional property '${k}' not allowed` });
        }
      }
    }
  }
}

function typeOk(value, type) {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    case 'array':
      return Array.isArray(value);
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    default:
      return false;
  }
}

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function deepEqual(a, b) {
  try {
    deepStrictEqual(a, b);
    return true;
  } catch {
    return false;
  }
}
