/**
 * Lexical grammar tests for `scanJsonToken`.
 *
 * Scope: exact token shape `{type, value, start, end}` measured in UTF-16
 * code units, the six punctuation characters, the four JSON whitespace
 * characters, empty/whitespace-only EOF, explicit offsets, mixed sequential
 * streams, string escapes and Unicode preservation, JSON number spellings,
 * literal spellings and token-boundary rules.
 *
 * Out of scope: limits/config validation and input-safety behavior (they
 * have their own test files) and parser-level structure/canonicalization.
 * Error assertions check the error class only, never message text.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { scanJsonToken } from '../../src/source-checkpoint/json-token.mjs';

const TOKEN_KEYS = ['end', 'start', 'type', 'value'];
const JSON_WHITESPACE = [' ', '\t', '\n', '\r'];

const quoted = (body) => `"${body}"`;

function assertTokenEquals(actual, expected) {
  assert.deepStrictEqual(Object.keys(actual).sort(), TOKEN_KEYS);
  assert.deepStrictEqual(Object.getOwnPropertySymbols(actual), []);
  assert.equal(Object.getPrototypeOf(actual), Object.prototype);
  assert.equal(actual.type, expected.type);
  assert.equal(actual.start, expected.start);
  assert.equal(actual.end, expected.end);
  if (expected.type === 'number') {
    assert.ok(
      Object.is(actual.value, expected.value),
      `number value ${String(actual.value)} is not Object.is-equal to ${String(expected.value)}`,
    );
  } else {
    assert.deepStrictEqual(actual.value, expected.value);
  }
}

function assertScan(text, offset, expected) {
  assertTokenEquals(scanJsonToken(text, offset), expected);
}

function assertScanRejects(text, offset, ErrorCtor) {
  assert.throws(
    () => scanJsonToken(text, offset),
    ErrorCtor,
    `expected ${ErrorCtor.name} scanning ${JSON.stringify(text)} at offset ${offset}`,
  );
}

/** Scan tokens until EOF, continuing at each token's exclusive `end`. */
function scanStream(text) {
  const tokens = [];
  let offset = 0;
  for (;;) {
    const token = scanJsonToken(text, offset);
    tokens.push(token);
    if (token.type === 'eof') {
      return tokens;
    }
    offset = token.end;
  }
}

test('punctuation: each of the six characters spans one code unit', () => {
  for (const value of ['{', '}', '[', ']', ':', ',']) {
    assertScan(value, 0, { type: 'punctuation', value, start: 0, end: 1 });
    assertScan(` ${value}`, 0, { type: 'punctuation', value, start: 1, end: 2 });
  }
});

test('punctuation: sequences are lexical, not structural JSON', () => {
  const stream = scanStream('}]},{:[');
  const expected = [
    ['}', 0, 1],
    [']', 1, 2],
    ['}', 2, 3],
    [',', 3, 4],
    ['{', 4, 5],
    [':', 5, 6],
    ['[', 6, 7],
  ];
  assert.equal(stream.length, expected.length + 1);
  expected.forEach(([value, start, end], index) => {
    assertTokenEquals(stream[index], { type: 'punctuation', value, start, end });
  });
  assertTokenEquals(stream[expected.length], { type: 'eof', value: null, start: 7, end: 7 });
});

test('whitespace: all four JSON whitespace code units are skipped', () => {
  for (const whitespace of JSON_WHITESPACE) {
    assertScan(`${whitespace}true`, 0, { type: 'literal', value: true, start: 1, end: 5 });
    assertScan(`${whitespace}{`, 0, { type: 'punctuation', value: '{', start: 1, end: 2 });
    assertScan(`${whitespace}0`, 0, { type: 'number', value: 0, start: 1, end: 2 });
    assertScan(`${whitespace}"a"`, 0, { type: 'string', value: 'a', start: 1, end: 4 });
  }
  assertScan(' \t\r\n\t null', 0, { type: 'literal', value: null, start: 6, end: 10 });
});

test('whitespace: only TAB, LF, CR and SPACE count, not NBSP/BOM or other spaces', () => {
  const nonJsonWhitespace = ['\u00a0', '\uFEFF', '\u000b', '\u000c', '\u0085', '\u2028', '\u2029', '\u3000'];
  for (const whitespace of nonJsonWhitespace) {
    assertScanRejects(`${whitespace}null`, 0, SyntaxError);
    assertScanRejects(whitespace, 0, SyntaxError);
  }
});

test('EOF: empty and whitespace-only inputs end at text.length', () => {
  assertScan('', 0, { type: 'eof', value: null, start: 0, end: 0 });
  assertScan(' ', 0, { type: 'eof', value: null, start: 1, end: 1 });
  assertScan('   ', 3, { type: 'eof', value: null, start: 3, end: 3 });
  assertScan('\t\r\n', 0, { type: 'eof', value: null, start: 3, end: 3 });
});

test('offsets: nonzero offsets are honored and end offsets yield EOF', () => {
  assertScan('xxnull', 2, { type: 'literal', value: null, start: 2, end: 6 });
  assertScan('{"a"', 1, { type: 'string', value: 'a', start: 1, end: 4 });
  assertScan('[ 1, 2]', 1, { type: 'number', value: 1, start: 2, end: 3 });
  assertScan('  :', 1, { type: 'punctuation', value: ':', start: 2, end: 3 });
  assertScan('  :', 2, { type: 'punctuation', value: ':', start: 2, end: 3 });
  assertScan(' \t {}', 3, { type: 'punctuation', value: '{', start: 3, end: 4 });
  assertScan(' \t"x" ', 0, { type: 'string', value: 'x', start: 2, end: 5 });
  assertScan(' ', 1, { type: 'eof', value: null, start: 1, end: 1 });
  assertScan('{}', 2, { type: 'eof', value: null, start: 2, end: 2 });
  assertScan('null', 4, { type: 'eof', value: null, start: 4, end: 4 });
  assertScan(' \t"x" ', 6, { type: 'eof', value: null, start: 6, end: 6 });
  assertScan('{"a" ', 5, { type: 'eof', value: null, start: 5, end: 5 });
});

test('sequential stream: mixed tokens report exact UTF-16 extents', () => {
  const text = ' {"a": [1, -0.5e+2, true, false, null]} ';
  const expected = [
    ['punctuation', '{', 1, 2],
    ['string', 'a', 2, 5],
    ['punctuation', ':', 5, 6],
    ['punctuation', '[', 7, 8],
    ['number', 1, 8, 9],
    ['punctuation', ',', 9, 10],
    ['number', -50, 11, 18],
    ['punctuation', ',', 18, 19],
    ['literal', true, 20, 24],
    ['punctuation', ',', 24, 25],
    ['literal', false, 26, 31],
    ['punctuation', ',', 31, 32],
    ['literal', null, 33, 37],
    ['punctuation', ']', 37, 38],
    ['punctuation', '}', 38, 39],
    ['eof', null, 40, 40],
  ];
  const stream = scanStream(text);
  assert.equal(stream.length, expected.length);
  expected.forEach(([type, value, start, end], index) => {
    assertTokenEquals(stream[index], { type, value, start, end });
  });
});

test('strings: ordinary text, empty text and escape decoding', () => {
  const cases = [
    ['"hello"', 'hello', 0, 7],
    ['""', '', 0, 2],
    [quoted('\\"'), '"', 0, 4],
    [quoted('\\\\'), '\\', 0, 4],
    [quoted('\\/'), '/', 0, 4],
    [quoted('\\b'), '\b', 0, 4],
    [quoted('\\f'), '\f', 0, 4],
    [quoted('\\n'), '\n', 0, 4],
    [quoted('\\r'), '\r', 0, 4],
    [quoted('\\t'), '\t', 0, 4],
    [quoted('\\"\\\\\\/\\b\\f\\n\\r\\t'), '"\\/\b\f\n\r\t', 0, 18],
  ];
  for (const [text, value, start, end] of cases) {
    assertScan(text, 0, { type: 'string', value, start, end });
  }
});

test('strings: BMP escapes, raw BMP/noncharacters, supplementary and surrogates', () => {
  const cases = [
    [quoted('\\u0041\\u00e9'), 'A\u00e9', 0, 14],
    [quoted('\\u0000\\uFFFE'), '\u0000\uFFFE', 0, 14],
    [quoted('\u00e9\uFFFE\uFFFF'), '\u00e9\uFFFE\uFFFF', 0, 5],
    [quoted('\u{1F600}'), '\u{1F600}', 0, 4],
    [quoted('\u{10FFFF}'), '\u{10FFFF}', 0, 4],
    [quoted('\\uD83D\\uDE00'), '\u{1F600}', 0, 14],
    [quoted(`caf\\u00e9 \u{1F600}`), 'caf\u00e9 \u{1F600}', 0, 14],
  ];
  for (const [text, value, start, end] of cases) {
    assertScan(text, 0, { type: 'string', value, start, end });
  }
});

test('strings: unnormalized Unicode and noncanonical escapes are preserved', () => {
  assertScan(quoted('e\\u0301'), 0, { type: 'string', value: 'e\u0301', start: 0, end: 9 });
  assertScan(quoted('\u00e9'), 0, { type: 'string', value: '\u00e9', start: 0, end: 3 });
  assertScan(quoted('\\u0041'), 0, { type: 'string', value: 'A', start: 0, end: 8 });
  assertScan(quoted('\\u0061'), 0, { type: 'string', value: 'a', start: 0, end: 8 });
  assert.notEqual(scanJsonToken(quoted('e\\u0301')).value, '\u00e9');
  assert.equal(scanJsonToken(quoted('\\u0041')).value, scanJsonToken(quoted('A')).value);
});

test('strings: unterminated quotes, raw controls and invalid escapes reject', () => {
  const cases = [
    '"abc',
    '"',
    '"\\',
    quoted('abc\\'),
    quoted('a\nb'),
    quoted('a\rb'),
    quoted('a\tb'),
    quoted('a\u0000b'),
    quoted('\u000b'),
    quoted('\u000c'),
    quoted('\u001f'),
    quoted('\\x41'),
    quoted('\\a'),
    quoted('\\ '),
    quoted('\\U0041'),
    quoted('\\u12'),
    quoted('\\uZZZZ'),
    quoted('\\u12G4'),
    quoted('\\u{41}'),
    quoted('\\uD83D\\uDE0'),
    quoted('\\uD8'),
  ];
  for (const text of cases) {
    assertScanRejects(text, 0, SyntaxError);
  }
});

test('strings: decoded lone or mismatched surrogates reject', () => {
  const cases = [
    quoted('\\uD83D'),
    quoted('\\uDE00'),
    quoted('\\uD83D\\u0041'),
    quoted('\\uD83D\\uD83D'),
    quoted('\\uDE00\\uD83D'),
    quoted('\\uD83D\\uDE00\\uD83D'),
    quoted('\uD83D'),
    quoted('\uDE00'),
    quoted('a\uDC00b'),
  ];
  for (const text of cases) {
    assertScanRejects(text, 0, RangeError);
  }
});

test('numbers: zero, negative zero, integers, fractions and exponent forms', () => {
  const cases = [
    ['0', 0, 0, 1],
    ['-0', -0, 0, 2],
    ['1', 1, 0, 1],
    ['42', 42, 0, 2],
    ['123456789', 123456789, 0, 9],
    ['0.5', 0.5, 0, 3],
    ['-1.25', -1.25, 0, 5],
    ['0.0', 0, 0, 3],
    ['-0.0', -0, 0, 4],
    ['1e2', 100, 0, 3],
    ['1E2', 100, 0, 3],
    ['1e+2', 100, 0, 4],
    ['1e02', 100, 0, 4],
    ['1E+02', 100, 0, 5],
    ['-1e2', -100, 0, 4],
    ['2.5e-1', 0.25, 0, 6],
    ['1e-2', 0.01, 0, 4],
    ['1e-02', 0.01, 0, 5],
    ['1.25e2', 125, 0, 6],
    ['1.5e3', 1500, 0, 5],
    ['0e0', 0, 0, 3],
    ['-0e0', -0, 0, 4],
  ];
  for (const [text, value, start, end] of cases) {
    assertScan(text, 0, { type: 'number', value, start, end });
  }
});

test('numbers: underflow to finite zero and finite unsafe magnitudes are accepted', () => {
  assertScan('9007199254740993', 0, { type: 'number', value: 9007199254740992, start: 0, end: 16 });
  assertScan('-9007199254740993', 0, { type: 'number', value: -9007199254740992, start: 0, end: 17 });
  assertScan('1e-1000', 0, { type: 'number', value: 0, start: 0, end: 7 });
  assertScan('-1e-1000', 0, { type: 'number', value: -0, start: 0, end: 8 });
  assertScan('5e-324', 0, { type: 'number', value: 5e-324, start: 0, end: 6 });

  const large = scanJsonToken('123456789012345678901234567890');
  assert.equal(large.type, 'number');
  assert.ok(Number.isFinite(large.value));
  assert.ok(large.value > Number.MAX_SAFE_INTEGER);
  assert.equal(large.start, 0);
  assert.equal(large.end, 30);
});

test('numbers: nonfinite overflow is rejected', () => {
  const cases = ['1e309', '-1e309', '1e1000', '-1e1000', '2e308', '1e999999999', `1${'0'.repeat(309)}`];
  for (const text of cases) {
    assertScanRejects(text, 0, RangeError);
  }
});

test('numbers: malformed spellings and continuations are rejected', () => {
  const cases = [
    '+1',
    '-',
    '--1',
    '-e1',
    '.5',
    '01',
    '00',
    '-01',
    '01.5',
    '1.',
    '1.e2',
    '1e',
    '1e+',
    '1E-',
    '1e++2',
    '1+',
    '1-2',
    '1..2',
    '1.2.3',
    '1e2.5',
    '1e2e3',
    '0x10',
    '1x',
    '1a',
    '1_',
    '1@',
    '1.5x',
    '1e2x',
    '1\u00a0',
    '1\uFEFF',
    'Infinity',
    '-Infinity',
    'NaN',
  ];
  for (const text of cases) {
    assertScanRejects(text, 0, SyntaxError);
  }
});

test('literals: exact true/false/null values and extents', () => {
  const cases = [
    ['true', true, 0, 4],
    ['false', false, 0, 5],
    ['null', null, 0, 4],
    [' true', true, 1, 5],
    ['\tfalse', false, 1, 6],
    ['\nnull', null, 1, 5],
  ];
  for (const [text, value, start, end] of cases) {
    assertScan(text, 0, { type: 'literal', value, start, end });
  }
});

test('literals: wrong case, truncated, extended and unknown spellings reject', () => {
  const cases = [
    'True',
    'TRUE',
    'tRue',
    'False',
    'FALSE',
    'fALSE',
    'NULL',
    'nUll',
    'nuLL',
    't',
    'tr',
    'tru',
    'f',
    'fa',
    'fal',
    'fals',
    'n',
    'nu',
    'nul',
    'truex',
    'true1',
    'true_',
    'truly',
    'falsey',
    'false1',
    'false_',
    'nulls',
    'nullify',
    'null1',
    'x',
    '@',
    '_',
    '(',
    ')',
    '!',
    'undefined',
    'yes',
    'no',
    'nil',
    '\u0000',
  ];
  for (const text of cases) {
    assertScanRejects(text, 0, SyntaxError);
  }
});

const BOUNDARY_PREFIXES = [
  ['"s"', 'string', 's', 3],
  ['-2.5e-1', 'number', -0.25, 7],
  ['123', 'number', 123, 3],
  ['true', 'literal', true, 4],
  ['false', 'literal', false, 5],
  ['null', 'literal', null, 4],
];

test('boundaries: EOF, JSON whitespace and JSON punctuation follow string/number/literal', () => {
  const suffixes = ['', ' ', '\t', '\n', '\r', ',', ':', '[', ']', '{', '}'];
  for (const [prefix, type, value, end] of BOUNDARY_PREFIXES) {
    for (const suffix of suffixes) {
      assertScan(`${prefix}${suffix}`, 0, { type, value, start: 0, end });
    }
  }
});

test('boundaries: adjacent non-boundary characters reject instead of shortening the token', () => {
  const suffixes = ['x', '"', '\\', '_', '@', '#', '?', '\u000b', '\u00a0', '\uFEFF'];
  for (const [prefix] of BOUNDARY_PREFIXES) {
    for (const suffix of suffixes) {
      assertScanRejects(`${prefix}${suffix}`, 0, SyntaxError);
    }
  }
});
