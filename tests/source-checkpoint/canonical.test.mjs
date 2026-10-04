/**
 * Contract tests for the recursive canonical JSON (RFC 8785 / JCS) serializer
 * (`src/source-checkpoint/canonical.mjs`).
 *
 * Expected outputs are written out explicitly as independent golden vectors:
 * they are derived from the RFC 8785 rules and the documented counting
 * conventions, never by running a second implementation-shaped serializer as
 * an oracle. No commands, filesystem, network or process effects are used.
 *
 * Documented counting conventions exercised here (module documentation owns
 * the definitions):
 *   - value nodes: root + every array element + every object member value;
 *     object keys are not nodes; shared references count once per visit;
 *   - depth: root is depth 1 and each element/member value is parent + 1.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';

import {
  canonicalize,
  DEFAULT_CANONICAL_LIMITS,
} from '../../src/source-checkpoint/canonical.mjs';

/**
 * Assert that `canonicalize(value, limits)` returns a Buffer whose bytes
 * exactly equal the UTF-8 encoding of `expected`.
 */
function assertCanonical(value, expected, limits, label) {
  const actual = canonicalize(value, limits);
  assert.ok(Buffer.isBuffer(actual), `${label}: expected a Buffer result`);
  const want = Buffer.from(expected, 'utf8');
  assert.ok(
    actual.equals(want),
    `${label}: expected ${want.toString('hex')} got ${actual.toString('hex')}`,
  );
}

/** Assert a RangeError whose message matches `pattern`. */
function assertLimitError(fn, pattern, label) {
  assert.throws(
    fn,
    (error) => error instanceof RangeError && pattern.test(error.message),
    `${label}: expected RangeError matching ${pattern}`,
  );
}

test('DEFAULT_CANONICAL_LIMITS is frozen with the contract defaults', () => {
  assert.deepEqual(DEFAULT_CANONICAL_LIMITS, {
    maxDepth: 64,
    maxNodes: 100000,
    maxBytes: 1048576,
    maxStringCodeUnits: 1048576,
  });
  assert.ok(Object.isFrozen(DEFAULT_CANONICAL_LIMITS), 'limits object must be frozen');
  assert.throws(() => {
    DEFAULT_CANONICAL_LIMITS.maxDepth = 1;
  }, TypeError);
  assert.strictEqual(DEFAULT_CANONICAL_LIMITS.maxDepth, 64);
});

test('golden scalars and empty containers', () => {
  assertCanonical(null, 'null', undefined, 'null');
  assertCanonical(true, 'true', undefined, 'true');
  assertCanonical(false, 'false', undefined, 'false');
  assertCanonical([], '[]', undefined, 'empty array');
  assertCanonical({}, '{}', undefined, 'empty object');
  assertCanonical([null, true, false], '[null,true,false]', undefined, 'scalars in an array');
  assertCanonical([[]], '[[]]', undefined, 'nested empty arrays');
  assertCanonical([{}, {}], '[{},{}]', undefined, 'nested empty objects');
});

test('finite numbers match ECMAScript JSON formatting, including -0', () => {
  const cases = [
    [0, '0'],
    [-0, '0'],
    [1, '1'],
    [-1, '-1'],
    [0.5, '0.5'],
    [1.5, '1.5'],
    [-1.5, '-1.5'],
    [100, '100'],
    [1e20, '100000000000000000000'],
    [1e21, '1e+21'],
    [-1e21, '-1e+21'],
    [1e-6, '0.000001'],
    [1e-7, '1e-7'],
    [1e-10, '1e-10'],
    [5e-324, '5e-324'],
    [Number.MAX_VALUE, '1.7976931348623157e+308'],
    [Number.EPSILON, '2.220446049250313e-16'],
    [9007199254740992, '9007199254740992'],
    [123456789.123, '123456789.123'],
  ];
  for (const [value, text] of cases) {
    assertCanonical(value, text, undefined, `number ${String(value)}`);
  }
  assertCanonical([-0, 1e21], '[0,1e+21]', undefined, 'numbers in an array');
  assertCanonical({ a: -0, b: 1e-7 }, '{"a":0,"b":1e-7}', undefined, 'numbers in an object');
});

test('non-finite numbers are rejected at the root and nested positions', () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    assertLimitError(() => canonicalize(bad), /non-finite/, 'non-finite root');
    assertLimitError(() => canonicalize([bad]), /non-finite/, 'non-finite element');
    assertLimitError(() => canonicalize({ value: bad }), /non-finite/, 'non-finite member');
  }
});

test('canonical string escaping golden vectors', () => {
  const cases = [
    ['', '""'],
    ['abc', '"abc"'],
    ['a"b', '"a\\"b"'],
    ['a\\b', '"a\\\\b"'],
    ['a"b\\c/d', '"a\\"b\\\\c/d"'],
    ['/', '"/"'],
    ['\b\t\n\f\r', '"\\b\\t\\n\\f\\r"'],
    ['\u0000', '"\\u0000"'],
    ['\u000b', '"\\u000b"'],
    ['\u001f', '"\\u001f"'],
    ['\u0000\u001f', '"\\u0000\\u001f"'],
    ['\u007f', '"\u007f"'],
    ['\u00e9', '"\u00e9"'],
    ['\u4e2d', '"\u4e2d"'],
    ['\u{1F600}', '"\u{1F600}"'],
    ['\u2028\u2029', '"\u2028\u2029"'],
    ['\uFEFF', '"\uFEFF"'],
  ];
  for (const [value, text] of cases) {
    assertCanonical(value, text, undefined, `string of length ${value.length}`);
  }
});

test('no Unicode normalization is applied', () => {
  assertCanonical('\u00e9', '"\u00e9"', undefined, 'precomposed e-acute');
  assertCanonical('e\u0301', '"e\u0301"', undefined, 'decomposed e plus combining acute');
  const precomposed = canonicalize('\u00e9');
  const decomposed = canonicalize('e\u0301');
  assert.ok(!precomposed.equals(decomposed), 'composed and decomposed forms stay distinct');
  assert.deepEqual(precomposed, Buffer.from([0x22, 0xc3, 0xa9, 0x22]));
  assert.deepEqual(decomposed, Buffer.from([0x22, 0x65, 0xcc, 0x81, 0x22]));
  // The angstrom sign must not be folded to A-with-ring.
  assertCanonical('\u212b', '"\u212b"', undefined, 'angstrom sign');
});

test('malformed Unicode in values and keys is rejected', () => {
  const malformed = ['\uD800', '\uDC00', 'a\uD800', '\uD800a', '\uD800\uD800', 'x\uDC00y'];
  for (const bad of malformed) {
    assert.throws(() => canonicalize(bad), RangeError, 'malformed value');
    assert.throws(() => canonicalize([bad]), RangeError, 'malformed element');
    assert.throws(() => canonicalize({ [bad]: 1 }), RangeError, 'malformed key');
  }
});

test('nested dense arrays keep order and objects serialize canonically', () => {
  assertCanonical([1, [2, [3]]], '[1,[2,[3]]]', undefined, 'nested arrays');
  assertCanonical([3, 1, 2], '[3,1,2]', undefined, 'array order preserved');
  assertCanonical(
    { a: [1, 2], b: { c: null } },
    '{"a":[1,2],"b":{"c":null}}',
    undefined,
    'nested object',
  );
  assertCanonical({ b: 1, a: 2 }, '{"a":2,"b":1}', undefined, 'sorted keys');
  assertCanonical({ a: [true, false, null] }, '{"a":[true,false,null]}', undefined, 'literal members');
});

test('key ordering is by UTF-16 code units (not code points or numeric order)', () => {
  assertCanonical({ 10: 1, 9: 2, 2: 3 }, '{"10":1,"2":3,"9":2}', undefined, 'numeric-looking keys');
  assertCanonical({ b: 1, a: 2, A: 3 }, '{"A":3,"a":2,"b":1}', undefined, 'case ordering');
  assertCanonical({ ab: 1, a: 2 }, '{"a":2,"ab":1}', undefined, 'prefix ordering');
  // U+10000 is the surrogate pair D800 DC00; D800 < E000 and D800 < FFFF, so
  // the supplementary key precedes high-BMP keys even though its code point
  // is larger.
  assertCanonical(
    { '\uE000': 2, '\u{10000}': 1 },
    '{"\u{10000}":1,"\uE000":2}',
    undefined,
    'supplementary key before U+E000',
  );
  assertCanonical(
    { '\uFFFF': 2, '\u{10000}': 1 },
    '{"\u{10000}":1,"\uFFFF":2}',
    undefined,
    'supplementary key before U+FFFF',
  );
  assertCanonical(
    { 'a\uE000': 2, 'a\u{10000}': 1 },
    '{"a\u{10000}":1,"a\uE000":2}',
    undefined,
    'supplementary code unit inside a key',
  );
  assertCanonical(
    { '\u0007': 3, 'a"b': 1, 'c\\d': 2 },
    '{"\\u0007":3,"a\\"b":1,"c\\\\d":2}',
    undefined,
    'escaped keys sort by their underlying code units',
  );
});

test('null-prototype objects are ordinary data objects', () => {
  const empty = Object.create(null);
  assertCanonical(empty, '{}', undefined, 'empty null-prototype object');
  const child = Object.create(null);
  child.y = 1;
  const root = Object.create(null);
  root.b = child;
  root.a = 2;
  assertCanonical(root, '{"a":2,"b":{"y":1}}', undefined, 'nested null-prototype objects');
  const dangerous = Object.create(null);
  dangerous.__proto__ = 7; // own data property: no inherited accessor on this object
  assertCanonical(dangerous, '{"__proto__":7}', undefined, 'null-prototype __proto__ data key');
});

test('dangerous-looking ordinary data keys remain data', () => {
  const parsed = JSON.parse(
    '{"__proto__":1,"constructor":2,"prototype":3,"toJSON":4,"hasOwnProperty":5}',
  );
  assert.strictEqual(Object.getPrototypeOf(parsed), Object.prototype);
  assertCanonical(
    parsed,
    '{"__proto__":1,"constructor":2,"hasOwnProperty":5,"prototype":3,"toJSON":4}',
    undefined,
    'parsed dangerous-looking keys',
  );
  assertCanonical({ toJSON: 7 }, '{"toJSON":7}', undefined, 'toJSON data member');
  assertCanonical(
    { valueOf: 8, toString: 9 },
    '{"toString":9,"valueOf":8}',
    undefined,
    'coercion-named data members',
  );
});

test('undefined, bigint, function and symbol values are rejected, never omitted', () => {
  const badValues = [undefined, 10n, Symbol('s'), function named() {}, () => {}];
  for (const bad of badValues) {
    assert.throws(() => canonicalize(bad), TypeError, 'unsupported root value');
    assert.throws(() => canonicalize([1, bad]), TypeError, 'unsupported array element');
    assert.throws(() => canonicalize({ a: 1, b: bad }), TypeError, 'unsupported object member');
  }
  assert.throws(() => canonicalize(), TypeError, 'missing value is undefined');
  assert.throws(() => canonicalize({ b: undefined }), TypeError, 'undefined member is not dropped');
  assert.throws(() => canonicalize({ b() {} }), TypeError, 'function member is not dropped');
  assert.throws(() => canonicalize({ b: Symbol('x') }), TypeError, 'symbol member is not dropped');
});

test('unsupported object types are rejected', () => {
  class Point {
    constructor() {
      this.x = 1;
    }
  }
  const cases = [
    new Date(0),
    new Map(),
    new Set(),
    /regex/,
    new Number(1),
    new String('boxed'),
    new Boolean(true),
    new Uint8Array([1, 2]),
    Promise.resolve(1),
    new Error('boom'),
    new Point(),
    Object.create({ inherited: 1 }),
    Object.prototype,
  ];
  for (const bad of cases) {
    assert.throws(() => canonicalize(bad), TypeError, 'unsupported root object type');
    assert.throws(() => canonicalize([bad]), TypeError, 'unsupported nested object type');
  }
  assert.throws(() => canonicalize({ a: new Map() }), TypeError, 'unsupported member');
});

test('sparse arrays are rejected', () => {
  const emptySlots = new Array(2);
  const lengthOnly = [];
  lengthOnly.length = 3;
  const interiorHole = [1, , 3];
  const trailingHole = [1];
  trailingHole[3] = 4;
  for (const bad of [emptySlots, lengthOnly, interiorHole, trailingHole]) {
    assert.throws(() => canonicalize(bad), TypeError, 'sparse array');
  }
});

test('custom array properties and symbol keys are rejected', () => {
  const extra = [1, 2];
  extra.label = 'x';
  const hidden = [1, 2];
  Object.defineProperty(hidden, 'meta', { value: 1, enumerable: false });
  const nonEnumerableIndex = [1, 2];
  Object.defineProperty(nonEnumerableIndex, '0', { value: 9, enumerable: false, configurable: true });
  const padded = [1, 2];
  padded['01'] = 3;
  const negative = [1, 2];
  negative[-1] = 3;
  for (const bad of [extra, hidden, nonEnumerableIndex, padded, negative]) {
    assert.throws(() => canonicalize(bad), TypeError, 'custom array property');
  }

  const symbolArray = [1, 2];
  symbolArray[Symbol('s')] = 3;
  assert.throws(() => canonicalize(symbolArray), TypeError, 'symbol array property');
  const symbolObject = { a: 1 };
  symbolObject[Symbol('s')] = 2;
  assert.throws(() => canonicalize(symbolObject), TypeError, 'symbol object property');
  const hiddenSymbol = { a: 1 };
  Object.defineProperty(hiddenSymbol, Symbol('hidden'), { value: 1, enumerable: false });
  assert.throws(() => canonicalize(hiddenSymbol), TypeError, 'non-enumerable symbol property');
});

test('accessors are rejected without being invoked', () => {
  let calls = 0;

  const withGetter = {};
  Object.defineProperty(withGetter, 'a', {
    enumerable: true,
    configurable: true,
    get() {
      calls += 1;
      return 1;
    },
  });
  assert.throws(() => canonicalize(withGetter), TypeError);
  assert.strictEqual(calls, 0);

  const withHiddenGetter = {};
  Object.defineProperty(withHiddenGetter, 'hidden', {
    enumerable: false,
    configurable: true,
    get() {
      calls += 1;
      return 1;
    },
  });
  assert.throws(() => canonicalize(withHiddenGetter), TypeError);
  assert.strictEqual(calls, 0);

  const arrayGetter = [1, 2];
  Object.defineProperty(arrayGetter, '1', {
    enumerable: true,
    configurable: true,
    get() {
      calls += 1;
      return 20;
    },
  });
  assert.throws(() => canonicalize(arrayGetter), TypeError);
  assert.strictEqual(calls, 0);

  const setterOnly = {};
  Object.defineProperty(setterOnly, 'a', {
    enumerable: true,
    configurable: true,
    set() {
      calls += 1;
    },
  });
  assert.throws(() => canonicalize(setterOnly), TypeError);
  assert.strictEqual(calls, 0);
});

test('toJSON, valueOf, toString and Symbol.toPrimitive sentinels never execute', () => {
  let invocations = 0;

  const withToJSON = {
    a: 1,
    toJSON() {
      invocations += 1;
      return { a: 2 };
    },
  };
  assert.throws(() => canonicalize(withToJSON), TypeError);
  assert.strictEqual(invocations, 0, 'toJSON must not be invoked');

  const host = {
    valueOf() {
      invocations += 1;
      return 1;
    },
    toString() {
      invocations += 1;
      return '1';
    },
    [Symbol.toPrimitive]() {
      invocations += 1;
      return 1;
    },
  };
  assert.throws(() => canonicalize(host), TypeError);
  assert.strictEqual(invocations, 0, 'coercion hooks must not be invoked');
  assert.throws(() => canonicalize([host]), TypeError);
  assert.strictEqual(invocations, 0);
  assert.throws(() => canonicalize({ n: host }), TypeError);
  assert.strictEqual(invocations, 0);

  const getterToJSON = {};
  Object.defineProperty(getterToJSON, 'toJSON', {
    enumerable: true,
    configurable: true,
    get() {
      invocations += 1;
      return {};
    },
  });
  assert.throws(() => canonicalize(getterToJSON), TypeError);
  assert.strictEqual(invocations, 0, 'toJSON getter must not be invoked');
});

test('non-enumerable own properties are rejected, not silently omitted', () => {
  const hidden = {};
  Object.defineProperty(hidden, 'secret', { value: 1, enumerable: false, writable: true });
  assert.throws(() => canonicalize(hidden), TypeError);
  const visible = {};
  Object.defineProperty(visible, 'shown', { value: 1, enumerable: true, writable: true });
  assertCanonical(visible, '{"shown":1}', undefined, 'enumerable data property');
});

test('reference cycles are rejected', () => {
  const selfArray = [];
  selfArray.push(selfArray);
  const selfObject = {};
  selfObject.self = selfObject;
  const left = {};
  const right = { left };
  left.right = right;
  for (const cyclic of [selfArray, selfObject, left]) {
    assert.throws(
      () => canonicalize(cyclic),
      (error) => error instanceof TypeError && /circular/i.test(error.message),
      'cycle must be a TypeError naming the circular reference',
    );
  }
});

test('shared references without cycles serialize once per visit', () => {
  const shared = { x: [1] };
  assertCanonical([shared, shared], '[{"x":[1]},{"x":[1]}]', undefined, 'shared object');
  const sharedArray = [0];
  assertCanonical([sharedArray, [sharedArray]], '[[0],[[0]]]', undefined, 'shared array at depths');
  const child = {};
  assertCanonical({ a: child, b: child }, '{"a":{},"b":{}}', undefined, 'shared member');
});

test('shared references consume repeated value-node visits', () => {
  const shared = { x: [1] };
  // Nodes: root array, shared object, [1] array, 1, shared object, [1], 1 => 7.
  assertCanonical([shared, shared], '[{"x":[1]},{"x":[1]}]', { maxNodes: 7 }, 'exact node budget');
  assertLimitError(
    () => canonicalize([shared, shared], { maxNodes: 6 }),
    /maxNodes/,
    'one node short of the shared-reference visits',
  );
});

test('only the four documented limit overrides are accepted', () => {
  assertCanonical(1, '1', undefined, 'default limits');
  assertCanonical(1, '1', {}, 'empty limits object');
  assertCanonical([1], '[1]', { maxDepth: 2 }, 'maxDepth override');
  assertCanonical(true, 'true', { maxNodes: 1 }, 'maxNodes override');
  assertCanonical(1234, '1234', { maxBytes: 4 }, 'maxBytes override');
  assertCanonical('ab', '"ab"', { maxStringCodeUnits: 2 }, 'maxStringCodeUnits override');
  assertCanonical(
    null,
    'null',
    { maxDepth: 1, maxNodes: 1, maxBytes: 4, maxStringCodeUnits: 1 },
    'all four overrides at exact boundaries',
  );
});

test('invalid limit values are rejected as RangeError without coercion', () => {
  const invalidValues = [
    0,
    -1,
    -0,
    1.5,
    NaN,
    Infinity,
    -Infinity,
    2 ** 53,
    Number.MAX_SAFE_INTEGER + 1,
    '64',
    '',
    true,
    false,
    null,
    64n,
    {},
    [8],
    Symbol('64'),
  ];
  for (const name of ['maxDepth', 'maxNodes', 'maxBytes', 'maxStringCodeUnits']) {
    for (const bad of invalidValues) {
      assert.throws(
        () => canonicalize(1, { [name]: bad }),
        RangeError,
        `invalid ${name} value`,
      );
    }
  }
});

test('unknown, symbol and accessor configuration is rejected without accessor behavior', () => {
  assert.throws(() => canonicalize(1, null), TypeError, 'null limits');
  assert.throws(() => canonicalize(1, 64), TypeError, 'number limits');
  assert.throws(() => canonicalize(1, 'limits'), TypeError, 'string limits');
  assert.throws(() => canonicalize(1, 64n), TypeError, 'bigint limits');
  assert.throws(() => canonicalize(1, [64]), TypeError, 'array limits have unknown keys');
  assert.throws(() => canonicalize(1, { maxDepth: 2, maxNode: 3 }), TypeError, 'unknown key');
  assert.throws(() => canonicalize(1, { maxByte: 4 }), TypeError, 'misspelled key');
  assert.throws(
    () => canonicalize(1, { maxDepth: 2, unknown: undefined }),
    TypeError,
    'unknown key with undefined value is still rejected',
  );
  assert.throws(
    () => canonicalize(1, { [Symbol('maxDepth')]: 64 }),
    TypeError,
    'symbol configuration key',
  );

  let reads = 0;
  const accessorLimits = {};
  Object.defineProperty(accessorLimits, 'maxDepth', {
    enumerable: true,
    get() {
      reads += 1;
      return 64;
    },
  });
  assert.throws(() => canonicalize(1, accessorLimits), TypeError, 'accessor limit');
  assert.strictEqual(reads, 0, 'accessor limit must not be read');

  const unknownAccessor = {};
  Object.defineProperty(unknownAccessor, 'nope', {
    enumerable: true,
    get() {
      reads += 1;
      return 1;
    },
  });
  assert.throws(() => canonicalize(1, unknownAccessor), TypeError, 'unknown accessor key');
  assert.strictEqual(reads, 0, 'unknown accessor must not be read');

  let valueOfCalls = 0;
  const coerciveLimits = {
    valueOf() {
      valueOfCalls += 1;
      return { maxDepth: 1 };
    },
  };
  assert.throws(() => canonicalize(1, coerciveLimits), TypeError, 'coercive limits object');
  assert.strictEqual(valueOfCalls, 0, 'limits must not be coerced with valueOf');

  let prototypeReads = 0;
  const prototype = {
    get maxDepth() {
      prototypeReads += 1;
      return 1;
    },
  };
  assertCanonical(
    { a: 1 },
    '{"a":1}',
    Object.create(prototype),
    'inherited accessor is not configuration',
  );
  assert.strictEqual(prototypeReads, 0, 'inherited accessors must not be read');
});

test('depth boundaries follow the documented counting convention (root is depth 1)', () => {
  assertCanonical(0, '0', { maxDepth: 1 }, 'root scalar at depth 1');
  assertCanonical([], '[]', { maxDepth: 1 }, 'root container at depth 1');
  assertCanonical([1], '[1]', { maxDepth: 2 }, 'element at depth 2');
  assertLimitError(() => canonicalize([1], { maxDepth: 1 }), /maxDepth/, 'element denied at depth 1');
  assertLimitError(() => canonicalize({ a: 1 }, { maxDepth: 1 }), /maxDepth/, 'member denied at depth 1');
  assertCanonical([[[1]]], '[[[1]]]', { maxDepth: 4 }, 'four-value path');
  assertLimitError(
    () => canonicalize([[[1]]], { maxDepth: 3 }),
    /maxDepth/,
    'innermost scalar at depth 4 denied',
  );
  assertCanonical({ a: { b: { c: 1 } } }, '{"a":{"b":{"c":1}}}', { maxDepth: 4 }, 'object path depth 4');
  assertLimitError(
    () => canonicalize({ a: { b: { c: 1 } } }, { maxDepth: 3 }),
    /maxDepth/,
    'innermost member at depth 4 denied',
  );
});

test('value-node boundaries follow the documented counting convention', () => {
  assertCanonical([], '[]', { maxNodes: 1 }, 'empty array root node');
  assertCanonical({}, '{}', { maxNodes: 1 }, 'empty object root node');
  assertCanonical([1, 2], '[1,2]', { maxNodes: 3 }, 'array of two scalars');
  assertLimitError(() => canonicalize([1, 2], { maxNodes: 2 }), /maxNodes/, 'one node short');
  assertCanonical({ a: 1 }, '{"a":1}', { maxNodes: 2 }, 'object plus member');
  assertLimitError(() => canonicalize({ a: 1 }, { maxNodes: 1 }), /maxNodes/, 'member node denied');
  assertCanonical({ a: [1, 2] }, '{"a":[1,2]}', { maxNodes: 4 }, 'nested nodes');
  assertLimitError(() => canonicalize({ a: [1, 2] }, { maxNodes: 3 }), /maxNodes/, 'nested node denied');
});

test('default maxDepth admits 63 nested containers and denies 64', () => {
  const chain = (levels) => {
    let current = 0;
    for (let i = 0; i < levels; i += 1) current = [current];
    return current;
  };
  assertCanonical(chain(63), '['.repeat(63) + '0' + ']'.repeat(63), undefined, '63 nested arrays');
  assertLimitError(() => canonicalize(chain(64)), /maxDepth/, '64 nested arrays exceed default depth');
});

test('a 10000-level array chain serializes iteratively with explicit limits', () => {
  const levels = 10000;
  let deep = 0;
  for (let i = 0; i < levels; i += 1) deep = [deep];
  const expected = '['.repeat(levels) + '0' + ']'.repeat(levels);
  const limits = { maxDepth: levels + 1, maxNodes: levels + 1, maxBytes: expected.length };
  const out = canonicalize(deep, limits);
  assert.deepEqual(out, Buffer.from(expected, 'utf8'));
  assert.strictEqual(out.length, 2 * levels + 1);
  // The configured limits, not call-stack exhaustion, produce these failures.
  assertLimitError(
    () => canonicalize(deep, { ...limits, maxDepth: levels }),
    /maxDepth/,
    'chain denied when maxDepth is one short',
  );
  assertLimitError(
    () => canonicalize(deep, { ...limits, maxNodes: levels }),
    /maxNodes/,
    'chain denied when maxNodes is one short',
  );
  assertLimitError(
    () => canonicalize(deep, { ...limits, maxBytes: expected.length - 1 }),
    /maxBytes/,
    'chain denied when maxBytes is one short',
  );
});

test('maxBytes is charged for every token, including delimiters and separators', () => {
  assertCanonical(true, 'true', { maxBytes: 4 }, 'true exact');
  assertLimitError(() => canonicalize(true, { maxBytes: 3 }), /maxBytes/, 'true one byte short');
  assertCanonical('', '""', { maxBytes: 2 }, 'empty string exact');
  assertLimitError(() => canonicalize('', { maxBytes: 1 }), /maxBytes/, 'empty string one short');
  assertCanonical([], '[]', { maxBytes: 2 }, 'empty array exact');
  assertLimitError(() => canonicalize([], { maxBytes: 1 }), /maxBytes/, 'empty array one short');
  assertCanonical({}, '{}', { maxBytes: 2 }, 'empty object exact');
  assertLimitError(() => canonicalize({}, { maxBytes: 1 }), /maxBytes/, 'empty object one short');
  assertCanonical([1], '[1]', { maxBytes: 3 }, 'closing bracket counted');
  assertLimitError(() => canonicalize([1], { maxBytes: 2 }), /maxBytes/, 'closing bracket overflow');
  assertCanonical([1, 2], '[1,2]', { maxBytes: 5 }, 'comma and delimiters counted');
  assertLimitError(() => canonicalize([1, 2], { maxBytes: 4 }), /maxBytes/, 'comma path overflow');
  assertCanonical([[], []], '[[],[]]', { maxBytes: 7 }, 'separator exact');
  assertLimitError(() => canonicalize([[], []], { maxBytes: 6 }), /maxBytes/, 'separator overflow');
  assertCanonical({ '': {} }, '{"":{}}', { maxBytes: 7 }, 'colon exact');
  assertLimitError(() => canonicalize({ '': {} }, { maxBytes: 6 }), /maxBytes/, 'colon overflow');
});

test('maxBytes covers escaped keys and multibyte Unicode across nested values', () => {
  const quoteKey = { '"': 1 };
  assertCanonical(quoteKey, '{"\\"":1}', { maxBytes: 8 }, 'escaped key exact');
  assertLimitError(() => canonicalize(quoteKey, { maxBytes: 7 }), /maxBytes/, 'escaped key overflow');
  assertLimitError(
    () => canonicalize(quoteKey, { maxBytes: 4 }),
    /maxBytes/,
    'escaped key itself cannot fit',
  );

  const controlKey = { '\u0007': 1 };
  assertCanonical(controlKey, '{"\\u0007":1}', { maxBytes: 12 }, 'control escape key exact');
  assertLimitError(
    () => canonicalize(controlKey, { maxBytes: 11 }),
    /maxBytes/,
    'control escape key overflow',
  );

  const pairKey = { '\u{1F600}': 1 };
  assertCanonical(pairKey, '{"\u{1F600}":1}', { maxBytes: 10 }, 'four-byte key exact');
  assertLimitError(() => canonicalize(pairKey, { maxBytes: 9 }), /maxBytes/, 'four-byte key overflow');

  assertCanonical('\u00e9', '"\u00e9"', { maxBytes: 4 }, 'two-byte value exact');
  assertLimitError(() => canonicalize('\u00e9', { maxBytes: 3 }), /maxBytes/, 'two-byte value overflow');

  assertCanonical(['\u00e9', '\u00e9'], '["\u00e9","\u00e9"]', { maxBytes: 11 }, 'multibyte list exact');
  assertLimitError(
    () => canonicalize(['\u00e9', '\u00e9'], { maxBytes: 10 }),
    /maxBytes/,
    'multibyte list overflow',
  );

  assertCanonical('\u{1F600}', '"\u{1F600}"', { maxBytes: 6 }, 'four-byte value exact');
  assertLimitError(
    () => canonicalize('\u{1F600}', { maxBytes: 5 }),
    /maxBytes/,
    'four-byte value overflow',
  );
});

test('per-string limits cannot replace whole-output byte accounting', () => {
  assertCanonical(
    ['aaaa', 'bbbb'],
    '["aaaa","bbbb"]',
    { maxStringCodeUnits: 100, maxBytes: 15 },
    'exact global budget',
  );
  assertLimitError(
    () => canonicalize(['aaaa', 'bbbb'], { maxStringCodeUnits: 100, maxBytes: 14 }),
    /maxBytes/,
    'two strings under per-string limits but over the global budget',
  );
  const longStrings = ['x'.repeat(1000), 'y'.repeat(1000)];
  assertLimitError(
    () => canonicalize(longStrings, { maxStringCodeUnits: 1000000, maxBytes: 100 }),
    /maxBytes/,
    'large per-string allowance must not bypass global maxBytes',
  );
});

test('bounded large ordinary inputs fail fast under a tiny byte ceiling', () => {
  const bigArray = new Array(50000).fill(0);
  assertLimitError(() => canonicalize(bigArray, { maxBytes: 16 }), /maxBytes/, 'large dense array');
  const bigString = 'z'.repeat(200000);
  assertLimitError(() => canonicalize(bigString, { maxBytes: 64 }), /maxBytes/, 'large string');
  const bigObject = {};
  for (let i = 0; i < 5000; i += 1) bigObject[`k${i}`] = i;
  assertLimitError(() => canonicalize(bigObject, { maxBytes: 32 }), /maxBytes/, 'large object');
  const oversized = new Array(200000).fill(0);
  assertLimitError(
    () => canonicalize(oversized),
    /maxNodes/,
    'default node limit bails out before walking a huge array',
  );
});

test('maxStringCodeUnits default and overrides apply to values and keys', () => {
  assert.strictEqual(DEFAULT_CANONICAL_LIMITS.maxStringCodeUnits, 1048576);
  assertCanonical('ab', '"ab"', { maxStringCodeUnits: 2 }, 'two code units accepted');
  assert.throws(() => canonicalize('abc', { maxStringCodeUnits: 2 }), RangeError, 'value too long');
  assert.throws(() => canonicalize({ abc: 1 }, { maxStringCodeUnits: 2 }), RangeError, 'key too long');
  assert.throws(
    () => canonicalize({ a: 'abc' }, { maxStringCodeUnits: 2 }),
    RangeError,
    'member value too long',
  );
  assert.throws(
    () => canonicalize('\u{1F600}', { maxStringCodeUnits: 1 }),
    RangeError,
    'a surrogate pair is two code units',
  );
  const atDefault = 'a'.repeat(1048576);
  const accepted = canonicalize(atDefault, { maxBytes: 1048578 });
  assert.strictEqual(accepted.length, 1048578, 'default code-unit length plus quotes');
  assert.throws(
    () => canonicalize('a'.repeat(1048577), { maxBytes: 2 * 1048576 }),
    RangeError,
    'one code unit over the default code-unit limit',
  );
});

test('inputs are never mutated and frozen inputs serialize', () => {
  const object = { b: 1, a: { y: 2 } };
  const keysBefore = Object.keys(object);
  const innerBefore = Object.getOwnPropertyNames(object.a);
  canonicalize(object);
  assert.deepEqual(Object.keys(object), keysBefore, 'member order must not be changed');
  assert.deepEqual(Object.getOwnPropertyNames(object.a), innerBefore);
  assert.deepEqual(object, { b: 1, a: { y: 2 } });

  const array = [3, 1, 2];
  canonicalize(array);
  assert.deepEqual(array, [3, 1, 2]);
  assert.strictEqual(array.length, 3);
  assert.deepEqual(Object.getOwnPropertyNames(array), ['0', '1', '2', 'length']);

  const frozen = Object.freeze({
    b: Object.freeze([1, 2]),
    a: Object.freeze({ c: 3 }),
  });
  assertCanonical(frozen, '{"a":{"c":3},"b":[1,2]}', undefined, 'deeply frozen input');
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.a) && Object.isFrozen(frozen.b));
});

test('canonical output contains no extra whitespace', () => {
  const value = { z: [1, { y: 'a b' }], a: true };
  assertCanonical(value, '{"a":true,"z":[1,{"y":"a b"}]}', undefined, 'no structural whitespace');
});

test('repeated canonicalization is deterministic for shared input', () => {
  const shared = { x: [1, { y: 2 }] };
  const input = [shared, shared];
  const limits = { maxDepth: 8, maxNodes: 20, maxBytes: 100, maxStringCodeUnits: 16 };
  const first = canonicalize(input, limits);
  const second = canonicalize(input, limits);
  assert.deepEqual(first, second);
  assertCanonical(input, '[{"x":[1,{"y":2}]},{"x":[1,{"y":2}]}]', limits, 'shared structure');
});
