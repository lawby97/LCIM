/**
 * Limits and input-safety tests for `scanJsonToken`.
 *
 * Scope: the frozen default limits, resolution of own-data overrides
 * (including null-prototype containers and ignored inherited properties),
 * exact-bound / one-beyond behavior of `maxInputCodeUnits`,
 * `maxTokenCodeUnits` and `maxStringCodeUnits` with small independent
 * fixtures, and rejection of invalid text, offset and limits
 * configurations without coercion or getter invocation.
 *
 * Out of scope: lexical grammar fixtures (see json-token-grammar.test.mjs)
 * and parser-level structure. Error assertions check the error class only,
 * never message text.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_JSON_TOKEN_LIMITS,
  scanJsonToken,
} from '../../src/source-checkpoint/json-token.mjs';

const DEFAULTS = Object.freeze({
  maxInputCodeUnits: 1048576,
  maxTokenCodeUnits: 1048576,
  maxStringCodeUnits: 1048576,
});

const FIELDS = Object.freeze(['maxInputCodeUnits', 'maxTokenCodeUnits', 'maxStringCodeUnits']);

const NO_CALLS = Object.freeze({ toString: 0, valueOf: 0, toJSON: 0 });

const LITERAL_NULL = Object.freeze({ type: 'literal', value: null, start: 0, end: 4 });

/** Coercion probe: none of its hooks may ever run for text/offset/limits. */
function makeProbe() {
  const calls = { toString: 0, valueOf: 0, toJSON: 0 };
  const value = {
    toString() {
      calls.toString += 1;
      return 'null';
    },
    valueOf() {
      calls.valueOf += 1;
      return 0;
    },
    toJSON() {
      calls.toJSON += 1;
      return 'null';
    },
  };
  return { calls, value };
}

test('defaults: the frozen constant exposes exactly the documented limits', () => {
  assert.ok(Object.isFrozen(DEFAULT_JSON_TOKEN_LIMITS));
  assert.deepStrictEqual(DEFAULT_JSON_TOKEN_LIMITS, DEFAULTS);
  assert.deepStrictEqual(Object.keys(DEFAULT_JSON_TOKEN_LIMITS).sort(), [...FIELDS].sort());
  for (const field of FIELDS) {
    const descriptor = Object.getOwnPropertyDescriptor(DEFAULT_JSON_TOKEN_LIMITS, field);
    assert.equal(descriptor.writable, false);
    assert.equal(descriptor.configurable, false);
    assert.equal(descriptor.enumerable, true);
  }
});

test('defaults: mutation attempts are rejected and leave the constant unchanged', () => {
  const snapshot = { ...DEFAULT_JSON_TOKEN_LIMITS };
  for (const field of FIELDS) {
    assert.throws(() => {
      DEFAULT_JSON_TOKEN_LIMITS[field] = 1;
    }, TypeError);
  }
  assert.throws(
    () => Object.defineProperty(DEFAULT_JSON_TOKEN_LIMITS, 'maxInputCodeUnits', { value: 2 }),
    TypeError,
  );
  assert.throws(() => {
    delete DEFAULT_JSON_TOKEN_LIMITS.maxTokenCodeUnits;
  }, TypeError);
  assert.deepStrictEqual(DEFAULT_JSON_TOKEN_LIMITS, snapshot);
  assert.deepStrictEqual(DEFAULT_JSON_TOKEN_LIMITS, DEFAULTS);
});

test('defaults: invocation without explicit limits scans ordinary tokens', () => {
  assert.deepStrictEqual(scanJsonToken('null'), LITERAL_NULL);
  assert.deepStrictEqual(scanJsonToken('"x"', 0, {}), { type: 'string', value: 'x', start: 0, end: 3 });
  assert.deepStrictEqual(scanJsonToken('{}', 1), { type: 'punctuation', value: '}', start: 1, end: 2 });
  assert.deepStrictEqual(scanJsonToken('', 0), { type: 'eof', value: null, start: 0, end: 0 });
  assert.deepStrictEqual(scanJsonToken('null', 0, DEFAULT_JSON_TOKEN_LIMITS), LITERAL_NULL);
});

test('overrides: own data properties and null-prototype limits are honored', () => {
  const exact = { maxInputCodeUnits: 4, maxTokenCodeUnits: 4, maxStringCodeUnits: 4 };
  assert.deepStrictEqual(scanJsonToken('null', 0, exact), LITERAL_NULL);

  const hiddenOwn = {};
  Object.defineProperty(hiddenOwn, 'maxTokenCodeUnits', { value: 4 });
  assert.deepStrictEqual(scanJsonToken('true', 0, hiddenOwn), {
    type: 'literal',
    value: true,
    start: 0,
    end: 4,
  });
  const hiddenTight = {};
  Object.defineProperty(hiddenTight, 'maxStringCodeUnits', { value: 1 });
  assert.throws(() => scanJsonToken('"ab"', 0, hiddenTight), RangeError);

  const nullProto = Object.create(null);
  nullProto.maxInputCodeUnits = 8;
  nullProto.maxTokenCodeUnits = 6;
  nullProto.maxStringCodeUnits = 4;
  assert.deepStrictEqual(scanJsonToken('"abcd"', 0, nullProto), {
    type: 'string',
    value: 'abcd',
    start: 0,
    end: 6,
  });
  assert.throws(() => scanJsonToken('"abcde"', 0, nullProto), RangeError);

  const frozen = Object.freeze({ maxInputCodeUnits: 4, maxTokenCodeUnits: 4, maxStringCodeUnits: 4 });
  assert.deepStrictEqual(scanJsonToken('null', 0, frozen), LITERAL_NULL);
});

test('maxInputCodeUnits: exact bound succeeds, one beyond rejects, skipped prefix counts', () => {
  const cases = [
    { text: 'null', offset: 0, expected: LITERAL_NULL },
    { text: '  null', offset: 0, expected: { type: 'literal', value: null, start: 2, end: 6 } },
    { text: 'xxnull', offset: 2, expected: { type: 'literal', value: null, start: 2, end: 6 } },
  ];
  for (const { text, offset, expected } of cases) {
    assert.deepStrictEqual(scanJsonToken(text, offset, { maxInputCodeUnits: text.length }), expected);
    assert.throws(() => scanJsonToken(text, offset, { maxInputCodeUnits: text.length - 1 }), RangeError);
  }
});

test('maxTokenCodeUnits: exact raw bound succeeds and one beyond rejects per token kind', () => {
  const cases = [
    { text: '1e2', expected: { type: 'number', value: 100, start: 0, end: 3 } },
    { text: '123', expected: { type: 'number', value: 123, start: 0, end: 3 } },
    { text: 'true', expected: { type: 'literal', value: true, start: 0, end: 4 } },
    { text: 'false', expected: { type: 'literal', value: false, start: 0, end: 5 } },
    { text: '"a"', expected: { type: 'string', value: 'a', start: 0, end: 3 } },
    { text: '"abc"', expected: { type: 'string', value: 'abc', start: 0, end: 5 } },
  ];
  for (const { text, expected } of cases) {
    const bound = text.length;
    assert.deepStrictEqual(scanJsonToken(text, 0, { maxTokenCodeUnits: bound }), expected);
    assert.throws(() => scanJsonToken(text, 0, { maxTokenCodeUnits: bound - 1 }), RangeError);
  }
});

test('maxTokenCodeUnits: skipped whitespace does not count toward the token bound', () => {
  assert.deepStrictEqual(scanJsonToken('   true', 0, { maxTokenCodeUnits: 4 }), {
    type: 'literal',
    value: true,
    start: 3,
    end: 7,
  });
  assert.throws(() => scanJsonToken('   true', 0, { maxTokenCodeUnits: 3 }), RangeError);
});

test('maxTokenCodeUnits: quotes and escape spelling count, not decoded length', () => {
  const cases = [
    { text: '"\\n"', raw: 4, units: 1, decoded: '\n' },
    { text: '"a\\nb"', raw: 6, units: 3, decoded: 'a\nb' },
    { text: '"\\u0041"', raw: 8, units: 1, decoded: 'A' },
    { text: '"\\uD83D\\uDE00"', raw: 14, units: 2, decoded: '\u{1F600}' },
  ];
  for (const { text, raw, units, decoded } of cases) {
    assert.deepStrictEqual(
      scanJsonToken(text, 0, { maxTokenCodeUnits: raw, maxStringCodeUnits: units }),
      { type: 'string', value: decoded, start: 0, end: raw },
    );
    assert.throws(
      () => scanJsonToken(text, 0, { maxTokenCodeUnits: raw - 1, maxStringCodeUnits: units }),
      RangeError,
    );
  }
});

test('maxStringCodeUnits: decoded UTF-16 code units bound raw and escaped pairs', () => {
  const cases = [
    { text: '"abc"', bound: 3, tight: 2, decoded: 'abc', end: 5 },
    { text: '"a\u{1F600}b"', bound: 4, tight: 3, decoded: 'a\u{1F600}b', end: 6 },
    { text: '"\u{1F600}"', bound: 2, tight: 1, decoded: '\u{1F600}', end: 4 },
    { text: '"\\uD83D\\uDE00"', bound: 2, tight: 1, decoded: '\u{1F600}', end: 14 },
  ];
  for (const { text, bound, tight, decoded, end } of cases) {
    assert.deepStrictEqual(
      scanJsonToken(text, 0, { maxStringCodeUnits: bound }),
      { type: 'string', value: decoded, start: 0, end },
    );
    assert.throws(() => scanJsonToken(text, 0, { maxStringCodeUnits: tight }), RangeError);
  }
  assert.deepStrictEqual(
    scanJsonToken('"\\u0041"', 0, { maxTokenCodeUnits: 8, maxStringCodeUnits: 1 }),
    { type: 'string', value: 'A', start: 0, end: 8 },
  );
});

test('caps: punctuation with token cap 1 and empty/whitespace EOF with positive caps are valid', () => {
  const tight = { maxInputCodeUnits: 1, maxTokenCodeUnits: 1, maxStringCodeUnits: 1 };
  for (const character of ['{', '}', '[', ']', ':', ',']) {
    assert.deepStrictEqual(scanJsonToken(character, 0, tight), {
      type: 'punctuation',
      value: character,
      start: 0,
      end: 1,
    });
  }
  assert.deepStrictEqual(scanJsonToken('', 0, tight), { type: 'eof', value: null, start: 0, end: 0 });
  assert.deepStrictEqual(scanJsonToken(' ', 0, tight), { type: 'eof', value: null, start: 1, end: 1 });
  assert.deepStrictEqual(
    scanJsonToken(' \t\n\r', 0, { maxInputCodeUnits: 4, maxTokenCodeUnits: 1, maxStringCodeUnits: 1 }),
    { type: 'eof', value: null, start: 4, end: 4 },
  );
});

test('limits: nonpositive values reject even for empty EOF input', () => {
  for (const field of FIELDS) {
    for (const value of [0, -1, -0.5]) {
      assert.throws(() => scanJsonToken('', 0, { [field]: value }), RangeError);
    }
  }
});

test('text: nonstring and boxed-string inputs reject without coercion', () => {
  const inputs = [
    null,
    undefined,
    0,
    -1,
    3.5,
    NaN,
    Infinity,
    true,
    false,
    1n,
    Symbol('text'),
    {},
    [],
    ['null'],
    new String('null'),
    () => 'null',
  ];
  for (const value of inputs) {
    assert.throws(() => scanJsonToken(value), TypeError);
  }
  const { calls, value: coercible } = makeProbe();
  assert.throws(() => scanJsonToken(coercible), TypeError);
  assert.deepStrictEqual(calls, NO_CALLS);
});

test('offset: negative, fractional, nonfinite, unsafe and out-of-range numbers reject', () => {
  const offsets = [-1, -0.5, 0.5, 1.5, 4.5, NaN, Infinity, -Infinity, 2 ** 53, Number.MAX_VALUE];
  for (const offset of offsets) {
    assert.throws(() => scanJsonToken('null', offset), RangeError);
  }
  assert.throws(() => scanJsonToken('null', 5), RangeError);
  assert.throws(() => scanJsonToken('', 1), RangeError);
  assert.deepStrictEqual(scanJsonToken('null', 4), { type: 'eof', value: null, start: 4, end: 4 });
});

test('offset: nonnumber inputs reject with TypeError and no coercion', () => {
  const offsets = ['0', '4', '', null, 0n, 4n, Symbol('offset'), {}, [], new Number(0), true, false];
  for (const offset of offsets) {
    assert.throws(() => scanJsonToken('null', offset), TypeError);
  }
  const { calls, value: coercible } = makeProbe();
  assert.throws(() => scanJsonToken('null', coercible), TypeError);
  assert.deepStrictEqual(calls, NO_CALLS);
});

test('limits: null, nonobject, function and array containers reject', () => {
  const containers = [null, 5, 0, NaN, 'x', '', true, false, 1n, Symbol('limits'), () => ({}), [], [1, 2], new String('x')];
  for (const limits of containers) {
    assert.throws(() => scanJsonToken('null', 0, limits), TypeError);
  }
});

test('limits: unknown, nonenumerable and symbol keys reject without reading getters', () => {
  assert.throws(() => scanJsonToken('null', 0, { extra: 1 }), TypeError);
  assert.throws(() => scanJsonToken('null', 0, { maxTokenCodeUnits: 4, extra: 1 }), TypeError);

  const hidden = {};
  Object.defineProperty(hidden, 'maxInput', { value: 1 });
  assert.throws(() => scanJsonToken('null', 0, hidden), TypeError);

  let symbolReads = 0;
  const symbolic = { maxTokenCodeUnits: 4 };
  Object.defineProperty(symbolic, Symbol('secret'), {
    get() {
      symbolReads += 1;
      return 1;
    },
  });
  assert.throws(() => scanJsonToken('null', 0, symbolic), TypeError);
  assert.equal(symbolReads, 0);

  let unknownReads = 0;
  const unknownAccessor = {};
  Object.defineProperty(unknownAccessor, 'bogus', {
    get() {
      unknownReads += 1;
      return 1;
    },
  });
  assert.throws(() => scanJsonToken('null', 0, unknownAccessor), TypeError);
  assert.equal(unknownReads, 0);
});

test('limits: accessor fields reject without invoking getters or setters', () => {
  for (const field of FIELDS) {
    let reads = 0;
    const accessor = {};
    Object.defineProperty(accessor, field, {
      get() {
        reads += 1;
        return 8;
      },
      enumerable: true,
      configurable: true,
    });
    assert.throws(() => scanJsonToken('null', 0, accessor), TypeError);
    assert.equal(reads, 0);
  }

  let writes = 0;
  const setterOnly = {};
  Object.defineProperty(setterOnly, 'maxStringCodeUnits', {
    set(_value) {
      writes += 1;
    },
    configurable: true,
  });
  assert.throws(() => scanJsonToken('null', 0, setterOnly), TypeError);
  assert.equal(writes, 0);
});

test('limits: nonpositive, fractional, nonfinite and unsafe values reject per field', () => {
  const values = [0, -1, -0.5, 0.5, 1.5, NaN, Infinity, -Infinity, 2 ** 53, Number.MAX_VALUE];
  for (const field of FIELDS) {
    for (const value of values) {
      assert.throws(() => scanJsonToken('null', 0, { [field]: value }), RangeError);
    }
  }
});

test('limits: nonnumeric and coercible values reject with TypeError per field', () => {
  const values = ['1', '4', '', true, false, null, undefined, 1n, Symbol('limit'), [], {}, new Number(4)];
  for (const field of FIELDS) {
    for (const value of values) {
      assert.throws(() => scanJsonToken('null', 0, { [field]: value }), TypeError);
    }
    const { calls, value: coercible } = makeProbe();
    assert.throws(() => scanJsonToken('null', 0, { [field]: coercible }), TypeError);
    assert.deepStrictEqual(calls, NO_CALLS);
  }
});

test('limits: inherited properties are ignored and inherited getters never run', () => {
  let reads = 0;
  const proto = {};
  for (const field of FIELDS) {
    Object.defineProperty(proto, field, {
      get() {
        reads += 1;
        return 1;
      },
    });
  }
  const inherited = Object.create(proto);
  assert.deepStrictEqual(scanJsonToken('true', 0, inherited), {
    type: 'literal',
    value: true,
    start: 0,
    end: 4,
  });
  assert.deepStrictEqual(scanJsonToken('"ok"', 0, inherited), {
    type: 'string',
    value: 'ok',
    start: 0,
    end: 4,
  });
  assert.equal(reads, 0);

  const inheritedData = Object.create({ maxInputCodeUnits: 1, maxTokenCodeUnits: 1, unknown: true });
  assert.deepStrictEqual(scanJsonToken('null', 0, inheritedData), LITERAL_NULL);
});

test('preservation: scanning leaves inputs, descriptors and frozen limits unchanged', () => {
  const ordinary = { maxInputCodeUnits: 16, maxTokenCodeUnits: 5, maxStringCodeUnits: 5 };
  const before = Object.getOwnPropertyDescriptors(ordinary);
  const text = ' false ';
  assert.deepStrictEqual(scanJsonToken(text, 0, ordinary), {
    type: 'literal',
    value: false,
    start: 1,
    end: 6,
  });
  assert.equal(text, ' false ');
  assert.deepStrictEqual(Object.getOwnPropertyDescriptors(ordinary), before);
  assert.ok(Object.isExtensible(ordinary));
  assert.ok(!Object.isFrozen(ordinary));

  const frozen = Object.freeze({ maxInputCodeUnits: 16, maxTokenCodeUnits: 5, maxStringCodeUnits: 5 });
  const frozenBefore = Object.getOwnPropertyDescriptors(frozen);
  assert.deepStrictEqual(scanJsonToken(text, 0, frozen), {
    type: 'literal',
    value: false,
    start: 1,
    end: 6,
  });
  assert.deepStrictEqual(Object.getOwnPropertyDescriptors(frozen), frozenBefore);
  assert.ok(Object.isFrozen(frozen));
});
