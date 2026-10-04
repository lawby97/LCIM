/**
 * Tests for src/source-checkpoint/unicode.mjs.
 * Run with: node --test tests/source-checkpoint/unicode.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertValidUnicode,
  DEFAULT_MAX_CODE_UNITS,
} from '../../src/source-checkpoint/unicode.mjs';

test('accepts empty, ASCII, BMP, control, noncharacter and supplementary strings', () => {
  const valid = [
    '',
    'plain ascii',
    'caf\u00E9', // BMP: U+00E9
    '\u4F60\u597D', // BMP: CJK
    '\u0000\u0007\u001F\u007F', // controls incl. NUL and DEL
    '\uFDD0\uFFFF', // noncharacters
    '\u{10000}\u{10FFFF}', // supplementary range endpoints
    '\u{1F600}', // supplementary: emoji
  ];
  for (const s of valid) {
    assert.equal(assertValidUnicode(s), s);
  }
});

test('returns the exact original string: no normalization or coercion', () => {
  const decomposed = 'e\u0301'; // e + combining acute accent
  const returned = assertValidUnicode(decomposed);
  assert.equal(returned, decomposed);
  assert.equal(returned.length, 2); // still two code units, not NFC \u00E9
  assert.notEqual(returned, '\u00E9');
});

test('rejects lone and trailing unpaired surrogates', () => {
  for (const s of ['\uD800', 'abc\uD800', '\uDC00', 'abc\uDC00']) {
    assert.throws(() => assertValidUnicode(s), RangeError);
  }
  assert.throws(() => assertValidUnicode('ab\uD800'), {
    message: /unpaired high surrogate at index 2/,
  });
  assert.throws(() => assertValidUnicode('a\uDC00b'), {
    message: /unpaired low surrogate at index 1/,
  });
});

test('rejects high surrogates not followed by a low surrogate', () => {
  for (const s of ['\uD800x', 'x\uD800y', '\uD800\uD800', '\uDBFF\uDBFF\uDFFF']) {
    assert.throws(() => assertValidUnicode(s), RangeError);
  }
  assert.throws(() => assertValidUnicode('\uD800x'), {
    message: /not followed by a low surrogate/,
  });
});

test('rejects non-primitive-string values without coercion', () => {
  const nonStrings = [
    undefined,
    null,
    42,
    true,
    {},
    [],
    /x/,
    Symbol('s'),
    42n,
    new String('x'), // boxed string is not a primitive string
  ];
  for (const bad of nonStrings) {
    assert.throws(() => assertValidUnicode(bad), TypeError);
  }
  assert.throws(() => assertValidUnicode(), TypeError);
});

test('rejects invalid maxCodeUnits values without coercion', () => {
  const invalidLimits = [
    0,
    -1,
    0.5,
    1.5,
    NaN,
    Infinity,
    -Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    Number.MAX_VALUE,
    '5',
    null,
    true,
    {},
    5n,
  ];
  for (const bad of invalidLimits) {
    assert.throws(() => assertValidUnicode('x', bad), RangeError);
  }
});

test('counts UTF-16 code units, not UTF-8 bytes', () => {
  assert.equal(assertValidUnicode('\u00E9', 1), '\u00E9'); // 1 code unit, 2 UTF-8 bytes
  assert.equal(assertValidUnicode('\uD83D\uDE00', 2), '\uD83D\uDE00'); // pair = 2 units
  assert.throws(() => assertValidUnicode('\uD83D\uDE00', 1), RangeError);
});

test('accepts at the exact limit and rejects one over, including a supplementary pair', () => {
  assert.equal(assertValidUnicode('a\u{1F600}', 3), 'a\u{1F600}'); // exact fit: 1 + 2 units
  assert.equal(assertValidUnicode('abc', 3), 'abc');
  assert.equal(assertValidUnicode('', 1), '');
  assert.throws(() => assertValidUnicode('ab\u{1F600}', 3), RangeError); // 4 units, one over
  assert.throws(() => assertValidUnicode('abcd', 3), RangeError);
});

test('exposes the documented default limit and applies it when omitted', () => {
  assert.equal(DEFAULT_MAX_CODE_UNITS, 1048576);
  assert.equal(assertValidUnicode('ok'), 'ok');
  assert.equal(assertValidUnicode('ok', undefined), 'ok'); // explicit undefined still defaults
});
