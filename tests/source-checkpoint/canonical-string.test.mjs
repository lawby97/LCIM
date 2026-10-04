/**
 * Independent contract tests for the canonical JSON string encoder
 * (`src/source-checkpoint/canonical-string.mjs`).
 *
 * Expectations are derived from the RFC 8785 (JCS) / ECMAScript
 * JSON.stringify string contract and are stated independently of the
 * implementation under test: the byte-level fixtures are written out
 * explicitly, and JSON.stringify is used only as a supplementary
 * cross-check over a corpus of well-formed strings, never as the sole
 * oracle. Nothing here is imported from `unicode.mjs`, so the surrogate
 * and limit expectations cannot drift with the helper under test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

import { encodeCanonicalString } from '../../src/source-checkpoint/canonical-string.mjs';

/** Contract default for both the code-unit and encoded-byte limits: 2^20. */
const DEFAULT_LIMIT = 1048576;

/**
 * Assert that `actual` is a Buffer whose bytes exactly equal `expected`,
 * where `expected` is a UTF-8 string or an array of byte values.
 */
function assertBufferEquals(actual, expected, label) {
  assert.ok(Buffer.isBuffer(actual), `${label}: expected a Buffer result`);
  const want = typeof expected === 'string' ? Buffer.from(expected, 'utf8') : Buffer.from(expected);
  assert.ok(
    actual.equals(want),
    `${label}: expected ${want.toString('hex')} got ${actual.toString('hex')}`,
  );
}

test('empty string encodes to exactly the two quote bytes', () => {
  const out = encodeCanonicalString('');
  assertBufferEquals(out, [0x22, 0x22], 'empty string');
  assert.strictEqual(out.length, 2);
});

test('plain ASCII (including space and DEL U+007F) is emitted literally', () => {
  assertBufferEquals(
    encodeCanonicalString('Hello, world!'),
    '"Hello, world!"',
    'ASCII sentence',
  );
  assertBufferEquals(encodeCanonicalString('a'), [0x22, 0x61, 0x22], 'single letter');
  assertBufferEquals(encodeCanonicalString(' '), [0x22, 0x20, 0x22], 'space U+0020');
  // Only U+0000..U+001F are controls in JSON; U+007F stays literal.
  assertBufferEquals(encodeCanonicalString('\u007F'), [0x22, 0x7f, 0x22], 'DEL U+007F');
});

test('quote, backslash and solidus handling', () => {
  const cases = [
    // '"' -> \"
    ['"', [0x22, 0x5c, 0x22, 0x22]],
    // '\' -> \\
    ['\\', [0x22, 0x5c, 0x5c, 0x22]],
    // '/' stays unescaped
    ['/', [0x22, 0x2f, 0x22]],
    ['a/b', [0x22, 0x61, 0x2f, 0x62, 0x22]],
    // a " b \ c / d -> "a\"b\\c/d"
    ['a"b\\c/d', [0x22, 0x61, 0x5c, 0x22, 0x62, 0x5c, 0x5c, 0x63, 0x2f, 0x64, 0x22]],
  ];
  for (const [value, bytes] of cases) {
    assertBufferEquals(encodeCanonicalString(value), bytes, `value ${JSON.stringify(value)}`);
  }
});

test('short control escapes \\b \\t \\n \\f \\r', () => {
  // The value holds five real control characters (U+0008, U+0009, U+000A,
  // U+000C, U+000D); the encoded literal is "\b\t\n\f\r".
  const group = '\b\t\n\f\r';
  assertBufferEquals(
    encodeCanonicalString(group),
    [0x22, 0x5c, 0x62, 0x5c, 0x74, 0x5c, 0x6e, 0x5c, 0x66, 0x5c, 0x72, 0x22],
    'short-escape control group',
  );
  // Backslash followed by newline: "\\\n"
  assertBufferEquals(
    encodeCanonicalString('\\\n'),
    [0x22, 0x5c, 0x5c, 0x5c, 0x6e, 0x22],
    'backslash then newline',
  );
});

test('remaining control characters use lowercase \\u00xx escapes', () => {
  const cases = [
    ['\u0001', [0x22, 0x5c, 0x75, 0x30, 0x30, 0x30, 0x31, 0x22]],
    ['\u000b', [0x22, 0x5c, 0x75, 0x30, 0x30, 0x30, 0x62, 0x22]], // lowercase b
    ['\u001a', [0x22, 0x5c, 0x75, 0x30, 0x30, 0x31, 0x61, 0x22]], // lowercase a
    ['\u001b', [0x22, 0x5c, 0x75, 0x30, 0x30, 0x31, 0x62, 0x22]],
    ['\u001f', [0x22, 0x5c, 0x75, 0x30, 0x30, 0x31, 0x66, 0x22]], // lowercase f
  ];
  for (const [value, bytes] of cases) {
    assertBufferEquals(
      encodeCanonicalString(value),
      bytes,
      `U+${value.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );
  }
});

test('every control character U+0000..U+001F has the exact canonical escape', () => {
  // Literal escape text for each control code unit; index == code unit.
  const ESC = [
    '\\u0000', '\\u0001', '\\u0002', '\\u0003', '\\u0004', '\\u0005', '\\u0006', '\\u0007',
    '\\b', '\\t', '\\n', '\\u000b', '\\f', '\\r', '\\u000e', '\\u000f',
    '\\u0010', '\\u0011', '\\u0012', '\\u0013', '\\u0014', '\\u0015', '\\u0016', '\\u0017',
    '\\u0018', '\\u0019', '\\u001a', '\\u001b', '\\u001c', '\\u001d', '\\u001e', '\\u001f',
  ];
  for (let c = 0; c < ESC.length; c += 1) {
    const label = `control U+${c.toString(16).padStart(4, '0')}`;
    assertBufferEquals(
      encodeCanonicalString(String.fromCharCode(c)),
      `"${ESC[c]}"`,
      label,
    );
  }
  let all = '';
  for (let c = 0; c < 32; c += 1) {
    all += String.fromCharCode(c);
  }
  assertBufferEquals(
    encodeCanonicalString(all),
    `"${ESC.join('')}"`,
    'all 32 controls in one string',
  );
});

test('BMP characters encode as literal 2- and 3-byte UTF-8', () => {
  const cases = [
    ['\u00E9', [0x22, 0xc3, 0xa9, 0x22]], // é
    ['\u07FF', [0x22, 0xdf, 0xbf, 0x22]], // two-byte ceiling
    ['\u0800', [0x22, 0xe0, 0xa0, 0x80, 0x22]], // three-byte floor
    ['\u20AC', [0x22, 0xe2, 0x82, 0xac, 0x22]], // €
    ['\u4E2D', [0x22, 0xe4, 0xb8, 0xad, 0x22]], // 中
    ['\uFEFF', [0x22, 0xef, 0xbb, 0xbf, 0x22]], // BOM/ZWSP
  ];
  for (const [value, bytes] of cases) {
    assertBufferEquals(
      encodeCanonicalString(value),
      bytes,
      `U+${value.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  }
});

test('supplementary characters encode as literal four-byte UTF-8', () => {
  const cases = [
    ['\uD800\uDC00', [0x22, 0xf0, 0x90, 0x80, 0x80, 0x22]], // U+10000
    ['\uD834\uDF06', [0x22, 0xf0, 0x9d, 0x8c, 0x86, 0x22]], // U+1D306
    ['\uD83D\uDE00', [0x22, 0xf0, 0x9f, 0x98, 0x80, 0x22]], // U+1F600
    ['\uDBFF\uDFFF', [0x22, 0xf4, 0x8f, 0xbf, 0xbf, 0x22]], // U+10FFFF
  ];
  for (const [value, bytes] of cases) {
    assertBufferEquals(encodeCanonicalString(value), bytes, JSON.stringify(value));
  }
});

test('noncharacters and U+2028/U+2029 are never escaped', () => {
  const cases = [
    ['\u2028', [0x22, 0xe2, 0x80, 0xa8, 0x22]],
    ['\u2029', [0x22, 0xe2, 0x80, 0xa9, 0x22]],
    ['\uFDD0', [0x22, 0xef, 0xb7, 0x90, 0x22]],
    ['\uFFFE', [0x22, 0xef, 0xbf, 0xbe, 0x22]],
    ['\uFFFF', [0x22, 0xef, 0xbf, 0xbf, 0x22]],
    ['\uD83F\uDFFE', [0x22, 0xf0, 0x9f, 0xbf, 0xbe, 0x22]], // U+1FFFE
  ];
  for (const [value, bytes] of cases) {
    assertBufferEquals(
      encodeCanonicalString(value),
      bytes,
      `U+${value.codePointAt(0).toString(16).toUpperCase()}`,
    );
  }
});

test('no Unicode normalization is applied in either direction', () => {
  // Precomposed é (U+00E9) must not be decomposed.
  assertBufferEquals(
    encodeCanonicalString('\u00E9'),
    [0x22, 0xc3, 0xa9, 0x22],
    'precomposed é',
  );
  // Decomposed e + U+0301 must not be composed to é.
  assertBufferEquals(
    encodeCanonicalString('e\u0301'),
    [0x22, 0x65, 0xcc, 0x81, 0x22],
    'decomposed e + combining acute',
  );
  // NFC would map U+212B (angstrom sign) to U+00C5; both stay literal.
  assertBufferEquals(
    encodeCanonicalString('\u212B'),
    [0x22, 0xe2, 0x84, 0xab, 0x22],
    'angstrom U+212B',
  );
  assertBufferEquals(
    encodeCanonicalString('\u00C5'),
    [0x22, 0xc3, 0x85, 0x22],
    'A with ring U+00C5',
  );
  const decomposed = encodeCanonicalString('e\u0301');
  assert.ok(
    !decomposed.equals(Buffer.from('"é"', 'utf8')),
    'decomposed input must not come back NFC-composed',
  );
});

test('valid surrogate pairs encode literally; malformed arrangements throw RangeError', () => {
  const valid = [
    '\uD800\uDC00', // U+10000 floor pair
    '\uDBFF\uDFFF', // U+10FFFF ceiling pair
    '\uD83D\uDE00',
    '\uD834\uDF06',
    '\uD800\uDC00\uD83D\uDE00', // adjacent pairs
    'a\uD83D\uDE00b', // pair surrounded by ASCII
  ];
  for (const value of valid) {
    // None of these contains an escapable character, so the canonical text
    // is the raw quoted input.
    assertBufferEquals(
      encodeCanonicalString(value),
      `"${value}"`,
      `valid pair(s) ${JSON.stringify(value)}`,
    );
  }
  const malformed = [
    '\uD800', // lone high at end
    '\uDBFF', // lone high (max) at end
    'a\uD800', // high at end after ASCII
    '\uD800a', // high followed by non-low
    '\uD800\uD800', // high followed by high
    '\uD800\uD800a',
    '\uD800\uD800\uDC00', // second high not followed by low
    '\uDC00', // lone low
    'a\uDC00',
    '\uDC00a', // low at start
    '\uDC00\uD800', // low then high
    '\uD800\uDC00\uD800', // trailing lone high after a valid pair
    '\uD800a\uDC00', // high not followed by low, plus stray low
    '\uD800\uDC00\uDC00', // stray low after a valid pair
  ];
  for (const value of malformed) {
    assert.throws(
      () => encodeCanonicalString(value),
      RangeError,
      `malformed ${JSON.stringify(value)}`,
    );
  }
});

test('non-string values are rejected with TypeError before coercion or accessors run', () => {
  const nonStrings = [
    undefined,
    null,
    false,
    true,
    0,
    1,
    NaN,
    42n,
    Symbol('s'),
    {},
    [],
    /regex/,
    new String('boxed'),
    new Number(7),
    () => {},
    new Uint8Array([97]),
  ];
  for (const value of nonStrings) {
    assert.throws(() => encodeCanonicalString(value), TypeError);
  }
  let toStringCalls = 0;
  let toJSONCalls = 0;
  let toPrimitiveCalls = 0;
  const hostile = {
    toString() {
      toStringCalls += 1;
      return 'x';
    },
    toJSON() {
      toJSONCalls += 1;
      return 'x';
    },
    [Symbol.toPrimitive]() {
      toPrimitiveCalls += 1;
      return 'x';
    },
  };
  assert.throws(() => encodeCanonicalString(hostile), TypeError);
  assert.strictEqual(toStringCalls, 0, 'toString must not be invoked');
  assert.strictEqual(toJSONCalls, 0, 'toJSON must not be invoked');
  assert.strictEqual(toPrimitiveCalls, 0, 'Symbol.toPrimitive must not be invoked');
});

test('limits must be positive safe integers; undefined selects the defaults', () => {
  const invalid = [
    0,
    -1,
    -1048576,
    0.5,
    -0.5,
    NaN,
    Infinity,
    -Infinity,
    2 ** 53,
    Number.MAX_SAFE_INTEGER + 1,
    '1048576',
    '',
    null,
    true,
    {},
    [1],
    Symbol('m'),
  ];
  for (const limit of invalid) {
    assert.throws(() => encodeCanonicalString('ok', limit), RangeError, 'bad maxCodeUnits');
    assert.throws(() => encodeCanonicalString('ok', 16, limit), RangeError, 'bad maxBytes');
  }
  assertBufferEquals(
    encodeCanonicalString('ok', undefined, undefined),
    '"ok"',
    'explicit undefined selects the defaults',
  );
  assertBufferEquals(
    encodeCanonicalString('ok', Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
    '"ok"',
    'largest safe integer limits are accepted',
  );
});

test('default limits are 2^20 for code units and bytes, with exact fit and overflow', () => {
  // Byte default: 1048574 ASCII chars + two quote bytes == 1048576 exactly.
  const asciiExact = 'a'.repeat(DEFAULT_LIMIT - 2);
  const out = encodeCanonicalString(asciiExact);
  assert.strictEqual(out.length, DEFAULT_LIMIT, 'exact byte-default fit uses all bytes');
  assertBufferEquals(out, `"${asciiExact}"`, 'exact byte-default fit content');
  // One more char pushes the encoded size over the byte default.
  assert.throws(() => encodeCanonicalString('a'.repeat(DEFAULT_LIMIT - 1)), RangeError);

  // Code-unit default: exactly 2^20 units are accepted once the byte budget
  // is raised (2^20 units plus quotes would exceed the byte default).
  const unitsExact = 'x'.repeat(DEFAULT_LIMIT);
  const wide = encodeCanonicalString(unitsExact, undefined, 2 * DEFAULT_LIMIT);
  assert.strictEqual(wide.length, DEFAULT_LIMIT + 2);
  assertBufferEquals(wide, `"${unitsExact}"`, 'exact code-unit default fit');
  assert.throws(
    () => encodeCanonicalString('x'.repeat(DEFAULT_LIMIT + 1), undefined, 2 * DEFAULT_LIMIT),
    RangeError,
    'one code unit over the default',
  );

  // The default code-unit budget counts surrogate pairs as two units each.
  const pairs = '\uD800\uDC00'.repeat(DEFAULT_LIMIT / 2); // 2^20 code units
  const pairOut = encodeCanonicalString(pairs, undefined, 4 * DEFAULT_LIMIT);
  assert.strictEqual(pairOut.length, 2 + 4 * (DEFAULT_LIMIT / 2));
  assertBufferEquals(pairOut, `"${pairs}"`, 'code-unit default counts surrogate pairs');
});

test('maxCodeUnits counts UTF-16 code units, not code points', () => {
  const emoji = '\uD83D\uDE00'; // one code point, two code units
  assertBufferEquals(
    encodeCanonicalString(emoji, 2, 4096),
    [0x22, 0xf0, 0x9f, 0x98, 0x80, 0x22],
    'pair fits in two code units',
  );
  assert.throws(() => encodeCanonicalString(emoji, 1, 4096), RangeError);
  const twoEmoji = '\uD83D\uDE00\uD83D\uDE00'; // two code points, four code units
  assert.strictEqual(encodeCanonicalString(twoEmoji, 4, 4096).length, 10);
  assert.throws(() => encodeCanonicalString(twoEmoji, 3, 4096), RangeError);
  const mixed = 'a\uD83D\uDE00b'; // four code units, eight encoded bytes
  assert.strictEqual(encodeCanonicalString(mixed, 4, 4096).length, 8);
  assert.throws(() => encodeCanonicalString(mixed, 3, 4096), RangeError);
});

test('maxBytes counts quotes, escapes and multibyte UTF-8 byte for byte', () => {
  const cases = [
    // empty string needs both quotes
    { value: '', maxBytes: 1, fits: false },
    { value: '', maxBytes: 2, fits: true },
    // plain ASCII
    { value: 'a', maxBytes: 2, fits: false },
    { value: 'a', maxBytes: 3, fits: true },
    // quote and backslash each cost two bytes
    { value: '"', maxBytes: 3, fits: false },
    { value: '"', maxBytes: 4, fits: true },
    { value: '\\', maxBytes: 3, fits: false },
    { value: '\\', maxBytes: 4, fits: true },
    // short control escape costs two bytes
    { value: '\n', maxBytes: 3, fits: false },
    { value: '\n', maxBytes: 4, fits: true },
    // \u00xx escape costs six bytes
    { value: '\u0001', maxBytes: 7, fits: false },
    { value: '\u0001', maxBytes: 8, fits: true },
    // two-byte UTF-8
    { value: '\u00E9', maxBytes: 3, fits: false },
    { value: '\u00E9', maxBytes: 4, fits: true },
    // three-byte UTF-8
    { value: '\u4E2D', maxBytes: 4, fits: false },
    { value: '\u4E2D', maxBytes: 5, fits: true },
    // four-byte UTF-8
    { value: '\uD83D\uDE00', maxBytes: 5, fits: false },
    { value: '\uD83D\uDE00', maxBytes: 6, fits: true },
    // quote escape plus multibyte: "a\"é"
    { value: 'a"\u00E9', maxBytes: 6, fits: false },
    { value: 'a"\u00E9', maxBytes: 7, fits: true },
    // escapes that force growth well past the initial 64-byte sink
    { value: '\n'.repeat(40), maxBytes: 81, fits: false },
    { value: '\n'.repeat(40), maxBytes: 82, fits: true },
  ];
  for (const c of cases) {
    const label = `maxBytes ${c.maxBytes} for ${JSON.stringify(c.value).slice(0, 40)}`;
    if (c.fits) {
      const out = encodeCanonicalString(c.value, undefined, c.maxBytes);
      assert.ok(Buffer.isBuffer(out), label);
      assert.strictEqual(out.length, c.maxBytes, `${label}: must use the whole budget`);
      assert.strictEqual(out.toString('utf8'), JSON.stringify(c.value), label);
    } else {
      assert.throws(() => encodeCanonicalString(c.value, undefined, c.maxBytes), RangeError, label);
    }
  }
});

test('bounded large inputs with a tiny byte allowance throw rather than truncate', () => {
  const big = 'z'.repeat(300000); // far under the default code-unit limit
  assert.throws(
    () => encodeCanonicalString(big, undefined, 1000),
    RangeError,
    'plain ASCII over a tiny byte budget',
  );
  const escaped = '\t'.repeat(150000);
  assert.throws(
    () => encodeCanonicalString(escaped, undefined, 1000),
    RangeError,
    'escape-heavy input over a tiny byte budget',
  );
  const pairs = '\uD800\uDC00'.repeat(75000); // 150000 code units
  assert.throws(
    () => encodeCanonicalString(pairs, undefined, 1000),
    RangeError,
    'multibyte input over a tiny byte budget',
  );
  // A large but compliant input still encodes completely at the exact bound.
  const exact = 'q'.repeat(100000);
  const out = encodeCanonicalString(exact, undefined, 100002);
  assert.strictEqual(out.length, 100002);
  assertBufferEquals(out, `"${exact}"`, 'exact large bound content');
  assert.throws(
    () => encodeCanonicalString(exact, undefined, 100001),
    RangeError,
    'one byte short of the large bound',
  );
});

test('canonical output matches JSON.stringify for a well-formed corpus (supplement)', () => {
  const corpus = [
    '',
    'ascii plain',
    'with "quote" and \\backslash and /solidus',
    '\u0000\u0001\u0007\u0008\u0009\u000a\u000b\u000c\u000d\u000e\u001f',
    'tab\there\nnewline\rcarriage\bback\fform',
    'é € 中 Ω',
    '\u2028\u2029',
    '\uFEFF\uFDD0\uFFFE\uFFFF',
    '\uD83D\uDE00 \uD834\uDF06 \uD800\uDC00',
    'e\u0301 \u212B',
    'a"b\\c/d "x"',
  ];
  for (const value of corpus) {
    const out = encodeCanonicalString(value);
    assert.strictEqual(out.toString('utf8'), JSON.stringify(value), JSON.stringify(value));
  }
});
