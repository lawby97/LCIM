/**
 * Focused canonical strict-JSON parser vectors, partition 1 of 2.
 *
 * This partition covers core scalar/string/Unicode vectors and the required
 * JSON grammar enforcement. It intentionally does not cover limit values,
 * exact/overflow boundaries, adversarial byte views, or deep iterative
 * nesting; those belong to the follow-up partition.
 *
 * Every input byte sequence and every expected value below is written out
 * independently of the parser's own canonicalizer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseCanonical } from '../../src/source-checkpoint/strict-json.mjs';

const encoder = new TextEncoder();

/** UTF-8 bytes for an independently written literal document. */
function toBytes(input) {
  return typeof input === 'string' ? encoder.encode(input) : input;
}

/**
 * Structural JSON comparison that tolerates null-prototype objects: key set,
 * key insertion order and every value are compared without requiring the
 * parsed object to inherit from Object.prototype.
 */
function assertJsonEqual(actual, expected, path = '$') {
  if (expected === null) {
    assert.strictEqual(actual, null, path);
    return;
  }
  if (typeof expected === 'number') {
    assert.strictEqual(typeof actual, 'number', path);
    assert.ok(Object.is(actual, expected), `${path}: expected ${expected}, got ${actual}`);
    return;
  }
  if (typeof expected !== 'object') {
    assert.strictEqual(actual, expected, path);
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path}: expected an array`);
    assert.strictEqual(actual.length, expected.length, `${path}.length`);
    for (let index = 0; index < expected.length; index += 1) {
      assertJsonEqual(actual[index], expected[index], `${path}[${index}]`);
    }
    return;
  }
  assert.ok(actual !== null && typeof actual === 'object' && !Array.isArray(actual), path);
  const expectedKeys = Object.keys(expected);
  assert.deepStrictEqual(Object.keys(actual), expectedKeys, `${path}: keys`);
  for (const key of expectedKeys) {
    assert.ok(Object.prototype.hasOwnProperty.call(actual, key), `${path}.${key}: own data property`);
    assertJsonEqual(actual[key], expected[key], `${path}.${key}`);
  }
}

/** Assert `input` is rejected with SyntaxError; error wording is not asserted. */
function assertRejected(input) {
  assert.throws(() => parseCanonical(toBytes(input)), SyntaxError);
}

const ACCEPT_VECTORS = [
  ['null', 'null', null],
  ['true', 'true', true],
  ['false', 'false', false],
  ['zero', '0', 0],
  ['negative integer', '-42', -42],
  ['fraction', '2.5', 2.5],
  ['small exponent number', '1e-7', 1e-7],
  ['small decimal number', '0.000001', 0.000001],
  ['large exponent number', '1e+21', 1e21],
  ['large integer number', '100000000000000000000', 1e20],
  ['empty string', '""', ''],
  ['empty containers', '[[],{}]', [[], {}]],
  ['dense nested arrays', '[[1,2],[3,[4,5]]]', [[1, 2], [3, [4, 5]]]],
  ['sorted object keys', '{"A":1,"a":2,"b":3}', { A: 1, a: 2, b: 3 }],
  [
    'canonical control escapes',
    '"\\u0000\\u0001\\u001f\\b\\f\\n\\r\\t"',
    '\u0000\u0001\u001f\b\f\n\r\t',
  ],
  ['BMP character', '"\u00e9"', '\u00e9'],
  ['combining accent sequence', '"e\u0301"', 'e\u0301'],
  ['supplementary character', [0x22, 0xf0, 0x9f, 0x98, 0x80, 0x22], '\u{1F600}'],
  ['BMP noncharacter', [0x22, 0xef, 0xb7, 0x90, 0x22], '\uFDD0'],
  ['supplementary noncharacter', [0x22, 0xf4, 0x8f, 0xbf, 0xbf, 0x22], '\u{10FFFF}'],
];

test('accepts canonical core vectors and returns the described value', async (t) => {
  for (const [name, rawInput, expected] of ACCEPT_VECTORS) {
    await t.test(name, () => {
      const input = Array.isArray(rawInput) ? Uint8Array.from(rawInput) : toBytes(rawInput);
      assertJsonEqual(parseCanonical(input), expected);
    });
  }
});

test('preserves Unicode scalar values without normalization', () => {
  const precomposed = parseCanonical(toBytes('"\u00e9"'));
  const decomposed = parseCanonical(toBytes('"e\u0301"'));

  assert.strictEqual(precomposed, '\u00e9');
  assert.strictEqual(decomposed, 'e\u0301');
  assert.notStrictEqual(precomposed, decomposed);
  assert.strictEqual(decomposed.length, 2);

  const emoji = parseCanonical(Uint8Array.from([0x22, 0xf0, 0x9f, 0x98, 0x80, 0x22]));
  assert.strictEqual(emoji, '\u{1F600}');
  assert.strictEqual(emoji.length, 2);
  assert.strictEqual(emoji.codePointAt(0), 0x1f600);
});

test('keeps empty and prototype-looking keys as own data properties', () => {
  const parsed = parseCanonical(toBytes('{"":1,"__proto__":2,"constructor":3}'));

  assert.deepStrictEqual(Object.keys(parsed), ['', '__proto__', 'constructor']);
  assert.strictEqual(parsed[''], 1);
  assert.strictEqual(parsed['__proto__'], 2);
  assert.strictEqual(parsed.constructor, 3);
  assert.ok(Object.prototype.hasOwnProperty.call(parsed, ''));
  assert.ok(Object.prototype.hasOwnProperty.call(parsed, '__proto__'));
  assert.ok(Object.prototype.hasOwnProperty.call(parsed, 'constructor'));

  const prototype = Object.getPrototypeOf(parsed);
  assert.ok(prototype === null || prototype === Object.prototype);
  assert.strictEqual({}.constructor, Object);
  assert.strictEqual(Object.getPrototypeOf({}), Object.prototype);
});

test('rejects duplicate decoded keys, including escaped equivalents', () => {
  for (const input of [
    '{"a":1,"a":2}',
    '{"x":{"b":1,"b":2}}',
    '{"a":1,"\\u0061":2}',
    '{"\\u0061":1,"a":2}',
    '{"__proto__":1,"__proto__":2}',
  ]) {
    assertRejected(input);
  }
});

test('rejects empty, truncated and malformed documents', () => {
  for (const input of [
    '',
    'tru',
    'nul',
    '[1,',
    '{"a":',
    '"unterminated',
    '[,1]',
    '[1,,2]',
    '{"a" 1}',
    '{"a":}',
    '{:1}',
    '[1 2]',
    '{"a":1,}',
    '[1,]',
    ']',
    '}',
    '+1',
    '.5',
    '1.',
  ]) {
    assertRejected(input);
  }
});

test('rejects noncanonical whitespace and trailing whitespace/content', () => {
  for (const input of [
    ' 1',
    '1 ',
    '1\n',
    '\t[]',
    '[1, 2]',
    '{"a": 1}',
    '{\n"a":1}',
    '1 2',
    'nulltrue',
    '{}{}',
    '[] []',
  ]) {
    assertRejected(input);
  }
});

test('rejects unordered object keys', () => {
  for (const input of [
    '{"b":1,"a":2}',
    '{"x":{"b":1,"a":2}}',
    '{"a":1,"A":2}',
    '{"2":1,"1":2}',
    '{"aa":1,"a":2}',
  ]) {
    assertRejected(input);
  }
});

test('rejects noncanonical number spellings', () => {
  for (const input of [
    '-0',
    '01',
    '1.0',
    '1e0',
    '1E+21',
    '1e+7',
    '2.5e0',
    '1e-9999',
  ]) {
    assertRejected(input);
  }
});

test('rejects unnecessary or noncanonical string escapes', () => {
  for (const input of [
    '"\\u0041"',
    '"\\/"',
    '"\\u001F"',
    '"\\u00e9"',
    '"\\u0022"',
    '"\\u005c"',
    '"\\uD83D\\uDE00"',
  ]) {
    assertRejected(input);
  }
});

test('rejects malformed, lone and reversed surrogate escapes', () => {
  for (const input of [
    '"\\uD800"',
    '"\\uDC00"',
    '"\\uDE00\\uD83D"',
    '"\\uD83D\\u0041"',
    '"\\uD83D\\uD83D"',
    '"\\uD83Dx"',
  ]) {
    assert.throws(() => parseCanonical(toBytes(input)), SyntaxError, input);
  }
});

test('rejects malformed UTF-8 and a leading BOM', () => {
  const cases = [
    ['lone continuation byte', [0x80]],
    ['invalid continuation byte', [0xc3, 0x28]],
    ['overlong two-byte sequence', [0xc0, 0xaf]],
    ['overlong three-byte sequence', [0xe0, 0x80, 0xaf]],
    ['truncated two-byte sequence', [0xc3]],
    ['truncated three-byte sequence', [0xe2, 0x82]],
    ['truncated four-byte sequence', [0xf0, 0x9f, 0x98]],
    ['encoded surrogate U+D800', [0xed, 0xa0, 0x80]],
    ['encoded surrogate U+DFFF', [0xed, 0xbf, 0xbf]],
    ['code point above U+10FFFF', [0xf4, 0x90, 0x80, 0x80]],
    ['invalid lead byte 0xF5', [0xf5, 0x80, 0x80, 0x80]],
    ['leading BOM before document', [0xef, 0xbb, 0xbf, 0x31]],
    ['leading BOM alone', [0xef, 0xbb, 0xbf]],
  ];
  for (const [name, codes] of cases) {
    assert.throws(() => parseCanonical(Uint8Array.from(codes)), SyntaxError, name);
  }
});

test('rejects numeric tokens whose decoded value is not finite', () => {
  for (const input of ['1e999', '-1e999', '1e309']) {
    assert.throws(() => parseCanonical(toBytes(input)), RangeError, input);
  }
});

test('does not mutate the caller bytes and reads only the visible range', () => {
  const accepted = toBytes('[1,2,3]');
  const acceptedSnapshot = Uint8Array.from(accepted);
  assertJsonEqual(parseCanonical(accepted), [1, 2, 3]);
  assert.deepStrictEqual(accepted, acceptedSnapshot);

  const rejected = toBytes('{"a":1, "b":2}');
  const rejectedSnapshot = Uint8Array.from(rejected);
  assert.throws(() => parseCanonical(rejected), SyntaxError);
  assert.deepStrictEqual(rejected, rejectedSnapshot);

  const backing = toBytes('xx[1,2]yy');
  const view = backing.subarray(2, 7);
  assertJsonEqual(parseCanonical(view), [1, 2]);
  assert.deepStrictEqual(backing, toBytes('xx[1,2]yy'));
});
