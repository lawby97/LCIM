/**
 * Sprint 00 unit tests: fail-closed schema-definition shape validation
 * (SOL-S00-004).
 *
 * Before any instance is validated, the schema definition itself must be
 * checked: every supported keyword rejects value forms outside the
 * explicitly supported Sprint-00 JSON-Schema subset with SchemaEngineError.
 * Nothing may be silently coerced or silently skipped (e.g. an object
 * additionalProperties or a boolean `items` must not be treated as
 * unconstrained).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAgainstSchema } from '../../src/shared/schema/validate.mjs';
import { SchemaEngineError } from '../../src/shared/errors.mjs';

function expectSchemaEngineError(schema, label) {
  assert.throws(
    () => validateAgainstSchema(null, schema),
    SchemaEngineError,
    `${label}: expected SchemaEngineError for schema ${JSON.stringify(schema)}`,
  );
}

test('malformed additionalProperties is rejected (non-boolean forms are unsupported)', () => {
  expectSchemaEngineError(
    { type: 'object', additionalProperties: { type: 'string' } },
    'object additionalProperties',
  );
  expectSchemaEngineError(
    { type: 'object', additionalProperties: 'yes' },
    'string additionalProperties',
  );
  expectSchemaEngineError(
    { type: 'object', additionalProperties: null },
    'null additionalProperties',
  );
  // boolean forms stay supported
  assert.deepEqual(validateAgainstSchema({ a: 1 }, { type: 'object', additionalProperties: true }).errors, []);
  assert.ok(validateAgainstSchema({ a: 1, b: 2 }, { type: 'object', additionalProperties: false, properties: { a: {} } }).errors.length > 0);
});

test('malformed items is rejected (boolean/null/primitive forms are unsupported)', () => {
  expectSchemaEngineError({ type: 'array', items: true }, 'items: true');
  expectSchemaEngineError({ type: 'array', items: false }, 'items: false');
  expectSchemaEngineError({ type: 'array', items: null }, 'items: null');
  expectSchemaEngineError({ type: 'array', items: 5 }, 'items: number');
  expectSchemaEngineError({ type: 'array', items: 'string' }, 'items: string');
  expectSchemaEngineError({ type: 'array', items: [true] }, 'items array with boolean element');
  expectSchemaEngineError({ type: 'array', items: [5] }, 'items array with number element');
  // supported forms stay supported
  assert.deepEqual(validateAgainstSchema(['a'], { type: 'array', items: { type: 'string' } }).errors, []);
  assert.deepEqual(validateAgainstSchema(['a'], { type: 'array', items: [{ type: 'string' }] }).errors, []);
});

test('malformed type is rejected', () => {
  expectSchemaEngineError({ type: 'bogus' }, 'unknown type name');
  expectSchemaEngineError({ type: 5 }, 'numeric type');
  expectSchemaEngineError({ type: [] }, 'empty type array');
  expectSchemaEngineError({ type: ['string', 5] }, 'type array with non-string');
  expectSchemaEngineError({ type: ['string', 'string'] }, 'duplicate type names');
  expectSchemaEngineError({ type: ['string', 'not-a-type'] }, 'type array with unknown name');
  // supported forms stay supported
  assert.deepEqual(validateAgainstSchema('x', { type: 'string' }).errors, []);
  assert.deepEqual(validateAgainstSchema(null, { type: ['string', 'null'] }).errors, []);
});

test('malformed required is rejected', () => {
  expectSchemaEngineError({ required: 'x' }, 'string required');
  expectSchemaEngineError({ required: 5 }, 'numeric required');
  expectSchemaEngineError({ required: [5] }, 'required with non-string entry');
  expectSchemaEngineError({ required: [''] }, 'required with empty string');
  expectSchemaEngineError({ required: ['a', 'a'] }, 'duplicate required names');
  // supported form stays supported
  assert.deepEqual(validateAgainstSchema({ a: 1 }, { required: ['a'] }).errors, []);
});

test('malformed properties is rejected', () => {
  expectSchemaEngineError({ properties: [] }, 'array properties');
  expectSchemaEngineError({ properties: 'x' }, 'string properties');
  expectSchemaEngineError({ properties: null }, 'null properties');
  expectSchemaEngineError({ properties: { a: 5 } }, 'non-schema property value');
  expectSchemaEngineError({ properties: { a: null } }, 'null property value');
  expectSchemaEngineError({ properties: { a: { $ref: '#/$defs/x' } } }, 'unsupported keyword inside nested property');
  expectSchemaEngineError({ properties: { a: { additionalProperties: {} } } }, 'malformed nested property shape');
  // supported form stays supported, including nested sub-schemas
  assert.deepEqual(validateAgainstSchema({ a: 'x' }, { properties: { a: { type: 'string' } } }).errors, []);
});

test('malformed enum is rejected', () => {
  expectSchemaEngineError({ enum: 'x' }, 'string enum');
  expectSchemaEngineError({ enum: {} }, 'object enum');
  expectSchemaEngineError({ enum: [] }, 'empty enum');
  // supported form stays supported
  assert.deepEqual(validateAgainstSchema('a', { enum: ['a', 'b'] }).errors, []);
});

test('malformed pattern is rejected', () => {
  expectSchemaEngineError({ pattern: 5 }, 'numeric pattern');
  expectSchemaEngineError({ pattern: null }, 'null pattern');
  expectSchemaEngineError({ pattern: '[' }, 'uncompilable regex');
  // supported form stays supported
  assert.deepEqual(validateAgainstSchema('ab', { pattern: '^a' }).errors, []);
});

test('malformed minLength/maxLength bounds are rejected', () => {
  expectSchemaEngineError({ minLength: -1 }, 'negative minLength');
  expectSchemaEngineError({ minLength: 1.5 }, 'fractional minLength');
  expectSchemaEngineError({ minLength: 'x' }, 'string minLength');
  expectSchemaEngineError({ maxLength: -1 }, 'negative maxLength');
  expectSchemaEngineError({ maxLength: null }, 'null maxLength');
  // supported forms stay supported
  assert.deepEqual(validateAgainstSchema('ab', { minLength: 1, maxLength: 5 }).errors, []);
});

test('malformed minItems/maxItems bounds are rejected', () => {
  expectSchemaEngineError({ minItems: -1 }, 'negative minItems');
  expectSchemaEngineError({ minItems: 1.5 }, 'fractional minItems');
  expectSchemaEngineError({ maxItems: 'x' }, 'string maxItems');
  // supported forms stay supported
  assert.deepEqual(validateAgainstSchema([1, 2], { minItems: 1, maxItems: 5 }).errors, []);
});

test('minimum/maximum are unsupported keywords and fail closed', () => {
  // The Sprint-00 subset does not implement numeric range keywords; any use
  // (including \"malformed\" value forms) must fail closed, not be ignored.
  expectSchemaEngineError({ type: 'number', minimum: 0 }, 'minimum: 0');
  expectSchemaEngineError({ type: 'number', maximum: 10 }, 'maximum: 10');
  expectSchemaEngineError({ type: 'number', minimum: 'abc' }, 'malformed minimum');
  expectSchemaEngineError({ type: 'number', maximum: 'abc' }, 'malformed maximum');
});

test('malformed metadata keyword values are rejected', () => {
  expectSchemaEngineError({ $comment: 5 }, 'numeric $comment');
  expectSchemaEngineError({ title: {} }, 'object title');
  expectSchemaEngineError({ description: null }, 'null description');
  expectSchemaEngineError({ $id: 5 }, 'numeric $id');
  // supported forms stay supported and are ignored
  assert.deepEqual(
    validateAgainstSchema('x', { $schema: 'https://json-schema.org/draft/2020-12/schema', $comment: 'note', title: 'T', description: 'd', type: 'string' }).errors,
    [],
  );
});

test('schema definition errors are SchemaEngineError, never silent acceptance', () => {
  // The two exact examples from the review finding.
  expectSchemaEngineError({ type: 'object', additionalProperties: { type: 'string' } }, 'finding example 1');
  expectSchemaEngineError({ type: 'array', items: true }, 'finding example 2');
  // A root schema that is not an object also fails closed with SchemaEngineError.
  expectSchemaEngineError(null, 'null schema');
  expectSchemaEngineError([], 'array schema');
  expectSchemaEngineError('type', 'string schema');
});
