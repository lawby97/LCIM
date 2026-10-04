/**
 * Adversarial configuration and byte-view tests for `parseCanonical`.
 *
 * This unit deliberately leaves grammar, canonical encodings and resource
 * boundaries to the complementary source-checkpoint suites. It covers only
 * own-data configuration validation and genuine-versus-spoofed byte views.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import vm from 'node:vm';

import { parseCanonical } from '../../src/source-checkpoint/strict-json.mjs';

const NULL_BYTES = Uint8Array.of(0x6e, 0x75, 0x6c, 0x6c);
const ZERO_ARRAY_BYTES = Uint8Array.of(0x5b, 0x30, 0x5d);
const LIMIT_NAMES = Object.freeze([
  'maxInputBytes',
  'maxDepth',
  'maxNodes',
  'maxBytes',
  'maxStringCodeUnits',
]);

/**
 * Read view metadata before any adversarial own properties are installed.
 * Later assertions use only this captured buffer, offset and length; they do
 * not read the shadowed view properties or iterate the view under test.
 */
function captureView(view) {
  const backingBuffer = view.buffer;
  const byteOffset = view.byteOffset;
  const byteLength = view.byteLength;
  const backingBytes = Uint8Array.from(new Uint8Array(backingBuffer));
  return { backingBuffer, byteOffset, byteLength, backingBytes };
}

function assertViewResult(view, snapshot, expectedBytes, expected, label) {
  assert.deepStrictEqual(
    snapshot.backingBytes.slice(
      snapshot.byteOffset,
      snapshot.byteOffset + snapshot.byteLength,
    ),
    expectedBytes,
    `${label}: captured visible bytes`,
  );

  const actual = parseCanonical(view);
  if (Array.isArray(expected)) {
    assert.deepStrictEqual(actual, expected, label);
  } else {
    assert.strictEqual(actual, expected, label);
  }

  assert.deepStrictEqual(
    new Uint8Array(snapshot.backingBuffer),
    snapshot.backingBytes,
    `${label}: complete backing store is unchanged`,
  );
}

test('accepts ordinary and null-prototype own-data limit configurations', () => {
  const ordinary = {
    maxInputBytes: NULL_BYTES.length,
    maxDepth: 1,
    maxNodes: 1,
    maxBytes: NULL_BYTES.length,
    maxStringCodeUnits: 1,
  };
  assert.strictEqual(parseCanonical(NULL_BYTES, ordinary), null);

  const nullPrototype = Object.create(null);
  nullPrototype.maxInputBytes = ZERO_ARRAY_BYTES.length;
  nullPrototype.maxDepth = 2;
  nullPrototype.maxNodes = 2;
  nullPrototype.maxBytes = ZERO_ARRAY_BYTES.length;
  nullPrototype.maxStringCodeUnits = 1;
  assert.deepStrictEqual(parseCanonical(ZERO_ARRAY_BYTES, nullPrototype), [0]);
});

const SINGLE_LIMIT_OVERRIDES = [
  { name: 'maxInputBytes', value: NULL_BYTES.length },
  { name: 'maxDepth', value: 1 },
  { name: 'maxNodes', value: 1 },
  { name: 'maxBytes', value: NULL_BYTES.length },
  { name: 'maxStringCodeUnits', value: 1 },
];

test('accepts single-key and subset limit overrides, including Number.MAX_SAFE_INTEGER', () => {
  for (const { name, value } of SINGLE_LIMIT_OVERRIDES) {
    assert.strictEqual(
      parseCanonical(NULL_BYTES, { [name]: value }),
      null,
      `${name}: sole own override`,
    );
    assert.strictEqual(
      parseCanonical(NULL_BYTES, { [name]: Number.MAX_SAFE_INTEGER }),
      null,
      `${name}: upper positive-safe-integer endpoint`,
    );
  }

  // A subset override must merge with the documented defaults.
  const subset = { maxInputBytes: ZERO_ARRAY_BYTES.length, maxNodes: 2 };
  assert.deepStrictEqual(parseCanonical(ZERO_ARRAY_BYTES, subset), [0]);
});

test('ignores inherited configuration and does not require a plain-object prototype', () => {
  const calls = { maxDepth: 0, valueOf: 0, toString: 0 };
  const prototype = {
    get maxDepth() {
      calls.maxDepth += 1;
      return 1;
    },
    valueOf() {
      calls.valueOf += 1;
      return { maxDepth: 1 };
    },
    toString() {
      calls.toString += 1;
      return 'limits';
    },
  };
  const inherited = Object.create(prototype);

  assert.deepStrictEqual(parseCanonical(ZERO_ARRAY_BYTES, inherited), [0]);
  assert.deepStrictEqual(calls, { maxDepth: 0, valueOf: 0, toString: 0 });
});

test('rejects unknown, symbol-keyed and accessor configuration without invoking behavior', () => {
  assert.throws(() => parseCanonical(NULL_BYTES, { unknown: 1 }), TypeError);

  let unknownReads = 0;
  const unknownAccessor = {};
  Object.defineProperty(unknownAccessor, 'unknown', {
    configurable: true,
    get() {
      unknownReads += 1;
      throw new Error('unknown configuration getter was invoked');
    },
  });
  assert.throws(() => parseCanonical(NULL_BYTES, unknownAccessor), TypeError);
  assert.strictEqual(unknownReads, 0);

  let symbolReads = 0;
  const symbolKey = Symbol('limit');
  const symbolAccessor = {};
  Object.defineProperty(symbolAccessor, symbolKey, {
    configurable: true,
    get() {
      symbolReads += 1;
      throw new Error('symbol configuration getter was invoked');
    },
  });
  assert.throws(() => parseCanonical(NULL_BYTES, symbolAccessor), TypeError);
  assert.strictEqual(symbolReads, 0);

  for (const name of LIMIT_NAMES) {
    let reads = 0;
    const accessor = {};
    Object.defineProperty(accessor, name, {
      configurable: true,
      get() {
        reads += 1;
        return 1;
      },
      set() {
        reads += 1;
      },
    });
    assert.throws(() => parseCanonical(NULL_BYTES, accessor), TypeError, name);
    assert.strictEqual(reads, 0, `${name}: accessor must stay untouched`);
  }
});

test('rejects invalid numeric limit overrides', () => {
  const invalidNumbers = [
    NaN,
    Infinity,
    -Infinity,
    0,
    -0,
    -1,
    -0.5,
    0.5,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.MIN_SAFE_INTEGER - 1,
  ];

  for (const name of LIMIT_NAMES) {
    for (const value of invalidNumbers) {
      assert.throws(
        () => parseCanonical(NULL_BYTES, { [name]: value }),
        RangeError,
        `${name}: invalid numeric override`,
      );
    }
  }
});

test('rejects nonnumeric and coercible limit overrides without coercion', () => {
  const invalidValues = [
    '1',
    '4',
    '',
    true,
    false,
    null,
    undefined,
    1n,
    Symbol('limit'),
    new Number(4),
  ];

  for (const name of LIMIT_NAMES) {
    for (const value of invalidValues) {
      assert.throws(
        () => parseCanonical(NULL_BYTES, { [name]: value }),
        RangeError,
        `${name}: nonnumeric override`,
      );
    }
  }

  const calls = { toPrimitive: 0, valueOf: 0, toString: 0, toJSON: 0 };
  const coercionSentinel = {
    [Symbol.toPrimitive]() {
      calls.toPrimitive += 1;
      return 4;
    },
    valueOf() {
      calls.valueOf += 1;
      return 4;
    },
    toString() {
      calls.toString += 1;
      return '4';
    },
    toJSON() {
      calls.toJSON += 1;
      return 4;
    },
  };

  for (const name of LIMIT_NAMES) {
    assert.throws(
      () => parseCanonical(NULL_BYTES, { [name]: coercionSentinel }),
      RangeError,
      `${name}: coercion sentinel`,
    );
  }
  assert.deepStrictEqual(calls, { toPrimitive: 0, valueOf: 0, toString: 0, toJSON: 0 });
});

const NON_OBJECT_LIMIT_CASES = [
  { name: 'null', make: () => ({ limits: null }) },
  { name: 'string', make: () => ({ limits: '4' }) },
  { name: 'number', make: () => ({ limits: 4 }) },
  { name: 'boolean', make: () => ({ limits: true }) },
  { name: 'bigint', make: () => ({ limits: 4n }) },
  { name: 'symbol', make: () => ({ limits: Symbol('limits') }) },
  {
    name: 'callable object with coercion hooks',
    make: () => {
      const calls = { toPrimitive: 0, valueOf: 0, toString: 0 };
      const limits = function limits() {};
      Object.defineProperties(limits, {
        [Symbol.toPrimitive]: {
          configurable: true,
          value() {
            calls.toPrimitive += 1;
            return { maxDepth: 1 };
          },
        },
        valueOf: {
          configurable: true,
          value() {
            calls.valueOf += 1;
            return { maxDepth: 1 };
          },
        },
        toString: {
          configurable: true,
          value() {
            calls.toString += 1;
            return 'limits';
          },
        },
      });
      return { limits, calls };
    },
  },
];

test('rejects non-object limits containers without coercion', () => {
  // `undefined` stays the documented default (no-override) case.
  assert.strictEqual(parseCanonical(NULL_BYTES, undefined), null);

  for (const vector of NON_OBJECT_LIMIT_CASES) {
    const specimen = vector.make();
    assert.throws(() => parseCanonical(NULL_BYTES, specimen.limits), TypeError, vector.name);
    if (specimen.calls) {
      for (const [hook, count] of Object.entries(specimen.calls)) {
        assert.strictEqual(count, 0, `${vector.name}: ${hook} must remain uncalled`);
      }
    }
  }
});

const GENUINE_VIEW_CASES = [
  {
    name: 'Buffer subarray with a nonzero offset',
    make() {
      const backing = Buffer.alloc(6);
      backing.set([0xa1, ...NULL_BYTES, 0xb1]);
      return {
        view: backing.subarray(1, 1 + NULL_BYTES.length),
        expectedBytes: NULL_BYTES,
        expected: null,
      };
    },
  },
  {
    name: 'Uint8Array subarray with a nonzero offset',
    make() {
      const backing = Uint8Array.of(0xa2, ...ZERO_ARRAY_BYTES, 0xb2);
      return {
        view: backing.subarray(1, 1 + ZERO_ARRAY_BYTES.length),
        expectedBytes: ZERO_ARRAY_BYTES,
        expected: [0],
      };
    },
  },
  {
    name: 'cross-realm Uint8Array subarray with a nonzero offset',
    make() {
      const view = vm.runInNewContext(
        'new Uint8Array([0xa3, 0x5b, 0x30, 0x5d, 0xb3]).subarray(1, 4)',
      );
      return { view, expectedBytes: ZERO_ARRAY_BYTES, expected: [0] };
    },
  },
];

for (const vector of GENUINE_VIEW_CASES) {
  test(`genuine byte views: ${vector.name}`, () => {
    const { view, expectedBytes, expected } = vector.make();
    const snapshot = captureView(view);
    assert.ok(snapshot.byteOffset > 0, `${vector.name}: view must have an offset`);
    if (vector.name.startsWith('cross-realm')) {
      assert.ok(!(view instanceof Uint8Array), 'cross-realm brand is not local instanceof');
    }
    assertViewResult(view, snapshot, expectedBytes, expected, vector.name);
  });
}

const PROTOTYPE_CASES = [
  {
    name: 'replaced prototype with a throwing byteLength accessor',
    makePrototype() {
      return {
        get byteLength() {
          throw new Error('replaced prototype byteLength was read');
        },
      };
    },
  },
  {
    name: 'null prototype',
    makePrototype() {
      return null;
    },
  },
];

for (const vector of PROTOTYPE_CASES) {
  test(`genuine byte views: ${vector.name}`, () => {
    const backing = Uint8Array.of(0xa4, ...NULL_BYTES, 0xb4);
    const view = backing.subarray(1, 1 + NULL_BYTES.length);
    const snapshot = captureView(view);
    Object.setPrototypeOf(view, vector.makePrototype());
    assertViewResult(view, snapshot, NULL_BYTES, null, vector.name);
  });
}

const SHADOW_CASES = [
  {
    name: 'lying own data properties',
    expectedCalls: { properties: 0, iterator: 0 },
    install(view, calls) {
      const decoyBuffer = new ArrayBuffer(0);
      Object.defineProperties(view, {
        byteLength: { configurable: true, value: 0, writable: true },
        buffer: { configurable: true, value: decoyBuffer, writable: true },
        byteOffset: { configurable: true, value: 0, writable: true },
        [Symbol.iterator]: {
          configurable: true,
          value() {
            calls.iterator += 1;
            throw new Error('custom iterator was invoked');
          },
        },
      });
    },
  },
  {
    name: 'throwing own accessors',
    expectedCalls: { properties: 0, iterator: 0 },
    install(view, calls) {
      const propertyGetter = (name) => {
        return {
          configurable: true,
          get() {
            calls.properties += 1;
            throw new Error(`shadowed ${name} getter was invoked`);
          },
        };
      };
      Object.defineProperties(view, {
        byteLength: propertyGetter('byteLength'),
        buffer: propertyGetter('buffer'),
        byteOffset: propertyGetter('byteOffset'),
        [Symbol.iterator]: {
          configurable: true,
          get() {
            calls.iterator += 1;
            throw new Error('shadowed iterator getter was invoked');
          },
        },
      });
    },
  },
  {
    name: 'throwing own brand, length, coercion and toJSON sentinels',
    expectedCalls: {
      toStringTag: 0,
      length: 0,
      toPrimitive: 0,
      valueOf: 0,
      toString: 0,
      toJSON: 0,
    },
    install(view, calls) {
      const sentinel = (name) => {
        return {
          configurable: true,
          get() {
            calls[name] += 1;
            throw new Error(`shadowed ${name} sentinel was consulted`);
          },
        };
      };
      Object.defineProperties(view, {
        [Symbol.toStringTag]: sentinel('toStringTag'),
        length: sentinel('length'),
        [Symbol.toPrimitive]: sentinel('toPrimitive'),
        valueOf: sentinel('valueOf'),
        toString: sentinel('toString'),
        toJSON: sentinel('toJSON'),
      });
    },
  },
];

for (const vector of SHADOW_CASES) {
  test(`genuine byte views: ${vector.name} are ignored`, () => {
    const backing = Uint8Array.of(0xa5, ...ZERO_ARRAY_BYTES, 0xb5);
    const view = backing.subarray(1, 1 + ZERO_ARRAY_BYTES.length);
    const snapshot = captureView(view);
    const calls = Object.fromEntries(
      Object.keys(vector.expectedCalls).map((property) => [property, 0]),
    );
    vector.install(view, calls);

    // `assertViewResult` consults only the pre-shadow snapshot for metadata
    // and nonmutation checks, never the overridden properties, iterators or
    // brand/coercion sentinels, and compares the complete backing store.
    assertViewResult(view, snapshot, ZERO_ARRAY_BYTES, [0], vector.name);
    assert.deepStrictEqual(calls, vector.expectedCalls);
  });
}

function makeShapeSpoof() {
  const calls = {
    byteLength: 0,
    buffer: 0,
    byteOffset: 0,
    iterator: 0,
    toPrimitive: 0,
    valueOf: 0,
    toString: 0,
  };
  const spoof = {
    0: NULL_BYTES[0],
    1: NULL_BYTES[1],
    2: NULL_BYTES[2],
    3: NULL_BYTES[3],
    length: NULL_BYTES.length,
    [Symbol.toStringTag]: 'Uint8Array',
    [Symbol.toPrimitive]() {
      calls.toPrimitive += 1;
      return 'null';
    },
    valueOf() {
      calls.valueOf += 1;
      return NULL_BYTES;
    },
    toString() {
      calls.toString += 1;
      return 'null';
    },
  };
  for (const name of ['byteLength', 'buffer', 'byteOffset']) {
    Object.defineProperty(spoof, name, {
      configurable: true,
      get() {
        calls[name] += 1;
        throw new Error(`spoof ${name} getter was invoked`);
      },
    });
  }
  Object.defineProperty(spoof, Symbol.iterator, {
    configurable: true,
    get() {
      calls.iterator += 1;
      throw new Error('spoof iterator getter was invoked');
    },
  });
  return { input: spoof, calls };
}

function makePrototypeSpoof() {
  const calls = { iterator: 0 };
  const spoof = Object.create(Uint8Array.prototype);
  spoof[0] = NULL_BYTES[0];
  spoof[1] = NULL_BYTES[1];
  spoof[2] = NULL_BYTES[2];
  spoof[3] = NULL_BYTES[3];
  Object.defineProperties(spoof, {
    byteLength: { configurable: true, value: NULL_BYTES.length },
    buffer: { configurable: true, value: new ArrayBuffer(0) },
    byteOffset: { configurable: true, value: 0 },
    [Symbol.iterator]: {
      configurable: true,
      value() {
        calls.iterator += 1;
        throw new Error('prototype spoof iterator was invoked');
      },
    },
  });
  return { input: spoof, calls };
}

function makeHookedArray() {
  const calls = { iterator: 0, valueOf: 0, toString: 0 };
  const input = [NULL_BYTES[0], NULL_BYTES[1], NULL_BYTES[2], NULL_BYTES[3]];
  Object.defineProperty(input, Symbol.iterator, {
    configurable: true,
    get() {
      calls.iterator += 1;
      throw new Error('ordinary-array iterator was invoked');
    },
  });
  input.valueOf = () => {
    calls.valueOf += 1;
    return NULL_BYTES;
  };
  input.toString = () => {
    calls.toString += 1;
    return 'null';
  };
  return { input, calls };
}

const INVALID_INPUT_CASES = [
  { name: 'Uint8ClampedArray', make: () => ({ input: new Uint8ClampedArray(NULL_BYTES) }) },
  { name: 'Int8Array', make: () => ({ input: new Int8Array(NULL_BYTES) }) },
  { name: 'Uint16Array', make: () => ({ input: new Uint16Array(NULL_BYTES) }) },
  { name: 'Float64Array', make: () => ({ input: new Float64Array([0]) }) },
  { name: 'BigInt64Array', make: () => ({ input: new BigInt64Array([0n]) }) },
  {
    name: 'DataView',
    make: () => ({ input: new DataView(Uint8Array.from(NULL_BYTES).buffer) }),
  },
  { name: 'string', make: () => ({ input: 'null' }) },
  { name: 'boxed string', make: () => ({ input: new String('null') }) },
  { name: 'ordinary array with hooks', make: makeHookedArray },
  { name: 'ArrayBuffer', make: () => ({ input: new ArrayBuffer(NULL_BYTES.length) }) },
  { name: 'shape spoof with accessors and coercion hooks', make: makeShapeSpoof },
  { name: 'object inheriting Uint8Array.prototype', make: makePrototypeSpoof },
  {
    name: 'plain coercion object',
    make: () => {
      const calls = { toPrimitive: 0, valueOf: 0, toString: 0 };
      const input = {
        [Symbol.toPrimitive]() {
          calls.toPrimitive += 1;
          return NULL_BYTES;
        },
        valueOf() {
          calls.valueOf += 1;
          return NULL_BYTES;
        },
        toString() {
          calls.toString += 1;
          return 'null';
        },
      };
      return { input, calls };
    },
  },
  { name: 'null', make: () => ({ input: null }) },
  { name: 'undefined', make: () => ({ input: undefined }) },
  { name: 'number', make: () => ({ input: 0 }) },
];

test('rejects spoofed, non-byte and other typed-array inputs without coercion', () => {
  for (const vector of INVALID_INPUT_CASES) {
    const specimen = vector.make();
    assert.throws(() => parseCanonical(specimen.input), TypeError, vector.name);
    if (specimen.calls) {
      for (const [hook, count] of Object.entries(specimen.calls)) {
        assert.strictEqual(count, 0, `${vector.name}: ${hook} must remain uncalled`);
      }
    }
  }
});
