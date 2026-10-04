/**
 * Resource-limit tests for `parseCanonical` from
 * `src/source-checkpoint/strict-json.mjs`.
 *
 * Scope: the five documented resource limits only - `maxInputBytes`,
 * `maxDepth`, `maxNodes`, `maxBytes` and `maxStringCodeUnits` - covering the
 * exported defaults, each default boundary, and independent exact/one-over
 * checks of every cap.
 *
 * All expected byte counts and UTF-16 code-unit counts below are literal,
 * independent vectors: they are never derived from `canonicalize`. The real
 * UTF-8 length of every vector is asserted against its literal before the
 * parser sees it, and every accepted parse is checked against the expected
 * semantic value. Large and deep constructions are built and traversed
 * iteratively and stay bounded; there are no timing assertions.
 *
 * Grammar/canonical-encoding tests and invalid-limit/byte-view tests live in
 * the complementary files.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PARSE_LIMITS,
  parseCanonical,
} from '../../src/source-checkpoint/strict-json.mjs';

const encoder = new TextEncoder();

/** Exact UTF-8 bytes of a canonical test document. */
const bytesOf = (text) => encoder.encode(text);

/**
 * Loose limits for small vectors. Every value is a positive safe integer, so
 * exactly one cap can be tight at a time.
 */
const LOOSE_LIMITS = Object.freeze({
  maxInputBytes: 4096,
  maxDepth: 256,
  maxNodes: 4096,
  maxBytes: 4096,
  maxStringCodeUnits: 256,
});

/** Loose limits with the named caps overridden. */
function withLimits(overrides) {
  return { ...LOOSE_LIMITS, ...overrides };
}

/** Canonical text of an array holding `count` null values (count >= 1). */
function nullArrayText(count) {
  return `[${'null,'.repeat(count - 1)}null]`;
}

/**
 * A limit overrun must be rejected as `RangeError`: that subclass is part of
 * the documented contract for every bound exercised in this file.
 */
function expectLimitRejection(attempt, label) {
  assert.throws(attempt, RangeError, label);
}

test('DEFAULT_PARSE_LIMITS: frozen defaults are exactly the documented five limits', () => {
  assert.ok(Object.isFrozen(DEFAULT_PARSE_LIMITS));
  assert.deepStrictEqual(DEFAULT_PARSE_LIMITS, {
    maxInputBytes: 1_048_576,
    maxDepth: 64,
    maxNodes: 100_000,
    maxBytes: 1_048_576,
    maxStringCodeUnits: 1_048_576,
  });
  assert.deepStrictEqual(
    Object.getOwnPropertyNames(DEFAULT_PARSE_LIMITS).sort(),
    ['maxBytes', 'maxDepth', 'maxInputBytes', 'maxNodes', 'maxStringCodeUnits'],
  );
  assert.throws(() => {
    DEFAULT_PARSE_LIMITS.maxInputBytes = 1;
  }, TypeError);
});

/*
 * Independent small byte-cost vectors. Each literal carries the expected
 * costs of structure, punctuation, multibyte characters, escapes, control
 * characters and keys; the checks below never call `canonicalize`.
 */
const BYTE_VECTORS = [
  { name: 'null is 4 bytes, 1 node, depth 1', text: 'null', bytes: 4, value: null },
  { name: 'number zero is 1 byte', text: '0', bytes: 1, value: 0 },
  { name: 'empty array punctuation is 2 bytes', text: '[]', bytes: 2, value: [] },
  { name: 'empty object punctuation is 2 bytes', text: '{}', bytes: 2, value: {} },
  { name: 'array with null is 6 bytes, 2 nodes, depth 2', text: '[null]', bytes: 6, value: [null] },
  { name: 'array of two nulls is 11 bytes, 3 nodes, depth 2', text: '[null,null]', bytes: 11, value: [null, null] },
  { name: 'array of two zeros is 5 bytes including the comma', text: '[0,0]', bytes: 5, value: [0, 0] },
  { name: 'one null-valued member is 10 bytes, 2 nodes', text: '{"a":null}', bytes: 10, value: { a: null } },
  { name: 'empty key is 9 bytes', text: '{"":null}', bytes: 9, value: { '': null } },
  { name: 'escaped newline key is 11 bytes and one decoded unit', text: '{"\\n":null}', bytes: 11, value: { '\n': null } },
  { name: 'two null-valued members are 19 bytes, 3 nodes, keys do not count', text: '{"a":null,"b":null}', bytes: 19, value: { a: null, b: null } },
  { name: 'quoted supplementary character is 6 bytes and 2 code units', text: '"😀"', bytes: 6, value: '😀' },
  { name: 'quoted two-byte character is 4 bytes and 1 code unit', text: '"é"', bytes: 4, value: 'é' },
  { name: 'quoted three-byte character is 5 bytes and 1 code unit', text: '"€"', bytes: 5, value: '€' },
  { name: 'quoted four-byte character is 6 bytes and 2 code units', text: '"𐍈"', bytes: 6, value: '𐍈' },
  { name: 'escaped newline value is 4 bytes and 1 decoded unit', text: '"\\n"', bytes: 4, value: '\n' },
  { name: 'escaped control value is 8 bytes and 1 decoded unit', text: '"\\u0001"', bytes: 8, value: '\u0001' },
  { name: 'escaped quote value is 4 bytes', text: '"\\""', bytes: 4, value: '"' },
  { name: 'nested empty arrays are 4 bytes and 2 nodes', text: '[[]]', bytes: 4, value: [[]] },
];

test('byte-cost vectors: exact input and output caps accept, one byte over rejects', () => {
  for (const vector of BYTE_VECTORS) {
    const bytes = bytesOf(vector.text);
    assert.strictEqual(
      bytes.length,
      vector.bytes,
      `${vector.name}: expected ${vector.bytes} UTF-8 bytes`,
    );

    assert.deepStrictEqual(
      parseCanonical(bytes, withLimits({ maxInputBytes: vector.bytes })),
      vector.value,
      `${vector.name}: exact input cap must accept`,
    );
    assert.deepStrictEqual(
      parseCanonical(bytes, withLimits({ maxBytes: vector.bytes })),
      vector.value,
      `${vector.name}: exact output cap must accept`,
    );

    // A one-over cap is only meaningful when the cap can stay positive; the
    // single-byte vector and invalid (zero/negative) overrides belong to the
    // complementary invalid-config file.
    if (vector.bytes > 1) {
      expectLimitRejection(
        () => parseCanonical(bytes, withLimits({ maxInputBytes: vector.bytes - 1 })),
        `${vector.name}: input one byte over`,
      );
      expectLimitRejection(
        () => parseCanonical(bytes, withLimits({ maxBytes: vector.bytes - 1 })),
        `${vector.name}: output one byte over`,
      );
    }
  }
});

test('input-byte and output-byte caps are separate bounds', () => {
  const bytes = bytesOf('[null]');
  assert.strictEqual(bytes.length, 6);

  assert.deepStrictEqual(
    parseCanonical(bytes, withLimits({ maxInputBytes: 6, maxBytes: 6 })),
    [null],
  );
  // The input cap rejects before any parsing happens, even though the output
  // cap would allow the document.
  expectLimitRejection(
    () => parseCanonical(bytes, withLimits({ maxInputBytes: 5, maxBytes: 4096 })),
    'input cap five rejects the six-byte document',
  );
  // The output cap rejects a canonically parsed document even though the
  // input cap would allow it.
  expectLimitRejection(
    () => parseCanonical(bytes, withLimits({ maxInputBytes: 4096, maxBytes: 5 })),
    'output cap five rejects the six-byte canonical output',
  );
});

/*
 * Depth vectors: the root value has depth 1 and every array element / object
 * member value adds 1, so scalars count too.
 */
const DEPTH_VECTORS = [
  { name: 'null is depth 1', text: 'null', depth: 1, value: null },
  { name: 'empty array is depth 1', text: '[]', depth: 1, value: [] },
  { name: 'empty object is depth 1', text: '{}', depth: 1, value: {} },
  { name: '[null] is depth 2', text: '[null]', depth: 2, value: [null] },
  { name: 'one-member object is depth 2', text: '{"a":null}', depth: 2, value: { a: null } },
  { name: '[[null]] is depth 3', text: '[[null]]', depth: 3, value: [[null]] },
  { name: '{"a":[null]} is depth 3', text: '{"a":[null]}', depth: 3, value: { a: [null] } },
  { name: '{"a":{"b":null}} is depth 3', text: '{"a":{"b":null}}', depth: 3, value: { a: { b: null } } },
];

test('depth boundary: exact depth accepts, one shallower rejects', () => {
  for (const vector of DEPTH_VECTORS) {
    const bytes = bytesOf(vector.text);
    assert.deepStrictEqual(
      parseCanonical(bytes, withLimits({ maxDepth: vector.depth })),
      vector.value,
      `${vector.name}: exact depth cap must accept`,
    );

    // Depth 1 vectors have no positive one-under cap (0 is invalid config,
    // covered by the complementary invalid-config file); their one-over case
    // is exercised by the depth 2 vectors in this table.
    if (vector.depth > 1) {
      expectLimitRejection(
        () => parseCanonical(bytes, withLimits({ maxDepth: vector.depth - 1 })),
        `${vector.name}: depth one over`,
      );
    }
  }
});

/*
 * Node vectors: the root value and every array element / object member value
 * counts once; object keys do not.
 */
const NODE_VECTORS = [
  { name: 'null is one node', text: 'null', nodes: 1, value: null },
  { name: 'empty array is one node', text: '[]', nodes: 1, value: [] },
  { name: 'empty object is one node', text: '{}', nodes: 1, value: {} },
  { name: '[null] is two nodes', text: '[null]', nodes: 2, value: [null] },
  { name: 'one-member object is two nodes', text: '{"a":null}', nodes: 2, value: { a: null } },
  { name: '[null,null] is three nodes', text: '[null,null]', nodes: 3, value: [null, null] },
  { name: 'two-member object is three nodes, keys do not count', text: '{"a":null,"b":null}', nodes: 3, value: { a: null, b: null } },
  { name: 'nested empty array is two nodes', text: '[[]]', nodes: 2, value: [[]] },
];

test('node boundary: exact node count accepts, one node over rejects', () => {
  for (const vector of NODE_VECTORS) {
    const bytes = bytesOf(vector.text);
    assert.deepStrictEqual(
      parseCanonical(bytes, withLimits({ maxNodes: vector.nodes })),
      vector.value,
      `${vector.name}: exact node cap must accept`,
    );

    // Single-node vectors have no positive one-under cap (0 is invalid
    // config); their one-over case is exercised by the two-node vectors in
    // this table.
    if (vector.nodes > 1) {
      expectLimitRejection(
        () => parseCanonical(bytes, withLimits({ maxNodes: vector.nodes - 1 })),
        `${vector.name}: node one over`,
      );
    }
  }
});

/*
 * String vectors: the cap counts decoded UTF-16 code units, so a
 * supplementary pair counts 2 and an escape sequence counts only its decoded
 * character. Both keys and values are bounded.
 */
const STRING_VECTORS = [
  { name: 'empty string value is zero units', text: '""', bytes: 2, units: 0, value: '' },
  { name: 'one ASCII unit', text: '"a"', bytes: 3, units: 1, value: 'a' },
  { name: 'two ASCII units', text: '"ab"', bytes: 4, units: 2, value: 'ab' },
  { name: 'two-byte character is one unit', text: '"é"', bytes: 4, units: 1, value: 'é' },
  { name: 'three-byte character is one unit', text: '"€"', bytes: 5, units: 1, value: '€' },
  { name: 'supplementary pair is two units', text: '"😀"', bytes: 6, units: 2, value: '😀' },
  { name: 'two supplementary pairs are four units', text: '"😀😀"', bytes: 10, units: 4, value: '😀😀' },
  { name: 'escaped newline is one decoded unit', text: '"\\n"', bytes: 4, units: 1, value: '\n' },
  { name: 'escaped control is one decoded unit', text: '"\\u0001"', bytes: 8, units: 1, value: '\u0001' },
  { name: 'empty key is zero units', text: '{"":0}', bytes: 6, units: 0, value: { '': 0 } },
  { name: 'four-unit key', text: '{"aaaa":0}', bytes: 10, units: 4, value: { aaaa: 0 } },
  { name: 'key and value both one unit', text: '{"a":"b"}', bytes: 9, units: 1, value: { a: 'b' } },
  { name: 'two-unit escaped key', text: '{"\\n\\n":0}', bytes: 10, units: 2, value: { '\n\n': 0 } },
  { name: 'supplementary key is two units', text: '{"😀":0}', bytes: 10, units: 2, value: { '😀': 0 } },
  { name: 'key fits but four-unit value is bounded by the value', text: '{"a":"bbbb"}', bytes: 12, units: 4, value: { a: 'bbbb' } },
];

test('string boundary: exact units accept, one unit over rejects', () => {
  for (const vector of STRING_VECTORS) {
    const bytes = bytesOf(vector.text);
    assert.strictEqual(
      bytes.length,
      vector.bytes,
      `${vector.name}: expected ${vector.bytes} UTF-8 bytes`,
    );

    // Zero-unit vectors are accepted at the smallest legal cap, 1; a cap of 0
    // is invalid configuration and belongs to the complementary file.
    const exactCap = vector.units === 0 ? 1 : vector.units;
    assert.deepStrictEqual(
      parseCanonical(bytes, withLimits({ maxStringCodeUnits: exactCap })),
      vector.value,
      `${vector.name}: exact string cap must accept`,
    );

    // One-unit vectors have no positive one-under cap; their one-over case is
    // covered by the explicit two-unit vectors below.
    if (vector.units > 1) {
      expectLimitRejection(
        () => parseCanonical(bytes, withLimits({ maxStringCodeUnits: vector.units - 1 })),
        `${vector.name}: string one unit over`,
      );
    }
  }
});

test('string cap of one rejects any two-unit value or key', () => {
  const capOne = withLimits({ maxStringCodeUnits: 1 });

  expectLimitRejection(() => parseCanonical(bytesOf('"ab"'), capOne), 'two-unit value');
  expectLimitRejection(() => parseCanonical(bytesOf('"😀"'), capOne), 'supplementary pair is two units');
  expectLimitRejection(() => parseCanonical(bytesOf('{"aa":0}'), capOne), 'two-unit key');
  expectLimitRejection(() => parseCanonical(bytesOf('{"a":"bb"}'), capOne), 'two-unit value under one-unit key');

  assert.deepStrictEqual(parseCanonical(bytesOf('"a"'), capOne), 'a');
  assert.deepStrictEqual(parseCanonical(bytesOf('{"a":0}'), capOne), { a: 0 });
});

test('string cap applies independently to every key and every value', () => {
  // Key exactly at the cap with a shorter value.
  assert.deepStrictEqual(
    parseCanonical(bytesOf('{"aaaa":"b"}'), withLimits({ maxStringCodeUnits: 4 })),
    { aaaa: 'b' },
  );
  // Value exactly at the cap with a shorter key.
  assert.deepStrictEqual(
    parseCanonical(bytesOf('{"a":"bbbb"}'), withLimits({ maxStringCodeUnits: 4 })),
    { a: 'bbbb' },
  );
  // Cap three rejects the four-unit key...
  expectLimitRejection(
    () => parseCanonical(bytesOf('{"aaaa":"b"}'), withLimits({ maxStringCodeUnits: 3 })),
    'four-unit key over a three-unit cap',
  );
  // ...and independently the four-unit value.
  expectLimitRejection(
    () => parseCanonical(bytesOf('{"a":"bbbb"}'), withLimits({ maxStringCodeUnits: 3 })),
    'four-unit value over a three-unit cap',
  );
  // Key fits at three while the value is over.
  expectLimitRejection(
    () => parseCanonical(bytesOf('{"aaa":"bbbb"}'), withLimits({ maxStringCodeUnits: 3 })),
    'value over cap while key fits',
  );
});

test('default maxInputBytes 1048576: exact accepts, one byte over rejects', () => {
  const longText = 'a'.repeat(1_048_574);
  const exact = bytesOf(`"${longText}"`);
  assert.strictEqual(exact.length, 1_048_576);
  // Default caps accept the exact boundary; the output cap is lifted in the
  // second call so the input cap is the only byte bound in force.
  assert.strictEqual(parseCanonical(exact), longText);
  assert.strictEqual(parseCanonical(exact, { maxBytes: 1_048_577 }), longText);

  const overText = 'a'.repeat(1_048_575);
  const over = bytesOf(`"${overText}"`);
  assert.strictEqual(over.length, 1_048_577);
  expectLimitRejection(() => parseCanonical(over), 'default input cap');
  // Lifting only the output cap is not enough: the input cap still rejects.
  expectLimitRejection(
    () => parseCanonical(over, { maxBytes: 1_048_577 }),
    'input cap rejects even when the output cap is lifted',
  );
});

test('default maxBytes 1048576: exact accepts, one byte over rejects', () => {
  const longText = 'a'.repeat(1_048_574);
  const exact = bytesOf(`"${longText}"`);
  assert.strictEqual(exact.length, 1_048_576);
  // The input cap is lifted so the output cap is the only byte bound in force.
  assert.strictEqual(parseCanonical(exact, { maxInputBytes: 1_048_577 }), longText);

  const overText = 'a'.repeat(1_048_575);
  const over = bytesOf(`"${overText}"`);
  assert.strictEqual(over.length, 1_048_577);
  expectLimitRejection(
    () => parseCanonical(over, { maxInputBytes: 1_048_577 }),
    'default output cap rejects the 1048577-byte canonical output',
  );
  // Lifting maxBytes as well accepts the same document, proving the
  // rejection above came from the output cap.
  assert.strictEqual(
    parseCanonical(over, { maxInputBytes: 1_048_577, maxBytes: 1_048_577 }),
    overText,
  );
});

test('default maxStringCodeUnits 1048576: exact accepts, one unit over rejects', () => {
  const exactText = 'a'.repeat(1_048_576);
  const exact = bytesOf(`"${exactText}"`);
  assert.strictEqual(exact.length, 1_048_578);
  const liftedInputAndOutput = { maxInputBytes: 1_048_578, maxBytes: 1_048_578 };
  assert.strictEqual(parseCanonical(exact, liftedInputAndOutput), exactText);

  const overText = 'a'.repeat(1_048_577);
  const over = bytesOf(`"${overText}"`);
  assert.strictEqual(over.length, 1_048_579);
  // Input and output caps are lifted enough that only the default string cap
  // can reject this document.
  expectLimitRejection(
    () => parseCanonical(over, { maxInputBytes: 1_048_579, maxBytes: 1_048_579 }),
    'default string cap rejects 1048577 decoded code units',
  );
});

test('default maxDepth 64: depth 64 accepts, depth 65 rejects', () => {
  // 63 arrays plus a null: the null sits at depth 64, so scalars count.
  const exactBytes = bytesOf('['.repeat(63) + 'null' + ']'.repeat(63));
  assert.strictEqual(exactBytes.length, 130);
  let value = parseCanonical(exactBytes);
  let arrays = 0;
  while (Array.isArray(value)) {
    assert.strictEqual(value.length, 1);
    value = value[0];
    arrays += 1;
  }
  assert.strictEqual(arrays, 63);
  assert.strictEqual(value, null);

  // 64 nested arrays without a scalar are also exactly depth 64.
  const emptyChain = bytesOf('['.repeat(64) + ']'.repeat(64));
  assert.strictEqual(emptyChain.length, 128);
  let cursor = parseCanonical(emptyChain);
  let levels = 0;
  for (;;) {
    assert.ok(Array.isArray(cursor), 'depth 64 chain must parse to nested arrays');
    levels += 1;
    if (cursor.length === 0) break;
    assert.strictEqual(cursor.length, 1);
    cursor = cursor[0];
  }
  assert.strictEqual(levels, 64);

  const overBytes = bytesOf('['.repeat(64) + 'null' + ']'.repeat(64));
  assert.strictEqual(overBytes.length, 132);
  expectLimitRejection(() => parseCanonical(overBytes), 'default depth cap');
});

test('default maxNodes 100000: 100000 nodes accept, 100001 nodes reject', () => {
  const exact = bytesOf(nullArrayText(99_999));
  assert.strictEqual(exact.length, 499_996);
  const parsed = parseCanonical(exact);
  assert.strictEqual(parsed.length, 99_999);
  assert.strictEqual(parsed.every((entry) => entry === null), true);
  assert.strictEqual(parsed[0], null);
  assert.strictEqual(parsed[99_998], null);

  const over = bytesOf(nullArrayText(100_000));
  assert.strictEqual(over.length, 500_001);
  expectLimitRejection(() => parseCanonical(over), 'default node cap');
  // Raising maxNodes by one accepts the same document, proving the rejection
  // above came from the node cap.
  const lifted = parseCanonical(over, { maxNodes: 100_001 });
  assert.strictEqual(lifted.length, 100_000);
  assert.strictEqual(lifted.every((entry) => entry === null), true);
});

test('bounded large input with exact caps, and a tiny input cap', () => {
  const longText = 'b'.repeat(200_000);
  const bytes = bytesOf(`"${longText}"`);
  assert.strictEqual(bytes.length, 200_002);
  const explicit = {
    maxInputBytes: 200_002,
    maxDepth: 8,
    maxNodes: 8,
    maxBytes: 200_002,
    maxStringCodeUnits: 200_000,
  };
  assert.strictEqual(parseCanonical(bytes, explicit), longText);

  expectLimitRejection(
    () => parseCanonical(bytes, { maxInputBytes: 200_001 }),
    'input one byte under the large document',
  );
  expectLimitRejection(
    () => parseCanonical(bytes, { maxInputBytes: 200_002, maxBytes: 200_001 }),
    'output one byte under the large document',
  );
  expectLimitRejection(
    () => parseCanonical(bytes, { maxInputBytes: 1 }),
    'tiny input cap rejects the large document',
  );
  assert.strictEqual(parseCanonical(bytesOf('0'), { maxInputBytes: 1 }), 0);
});

test('10000-level nested-array chain parses iteratively and default depth rejects', () => {
  const DEPTH_LEVELS = 10_000;

  // Scalars count, so 10000 arrays plus a null is a 10001-node document whose
  // deepest value sits at depth 10001.
  const scalarNodes = DEPTH_LEVELS + 1;
  const scalarBytes = bytesOf(
    '['.repeat(DEPTH_LEVELS) + 'null' + ']'.repeat(DEPTH_LEVELS),
  );
  assert.strictEqual(scalarBytes.length, DEPTH_LEVELS * 2 + 4);
  const scalarLimits = {
    maxInputBytes: scalarBytes.length,
    maxDepth: scalarNodes,
    maxNodes: scalarNodes,
    maxBytes: scalarBytes.length,
    maxStringCodeUnits: 1,
  };
  const scalarParsed = parseCanonical(scalarBytes, scalarLimits);

  // Iterative traversal only: no recursive helper, no whole-chain dump.
  let value = scalarParsed;
  let arrays = 0;
  while (Array.isArray(value)) {
    assert.strictEqual(value.length, 1);
    value = value[0];
    arrays += 1;
  }
  assert.strictEqual(arrays, DEPTH_LEVELS);
  assert.strictEqual(value, null);
  assert.strictEqual(arrays + 1, scalarNodes);

  // The same document must be rejected by the default depth cap of 64, and
  // by explicit caps one below the actual depth and node counts.
  expectLimitRejection(() => parseCanonical(scalarBytes), 'default depth rejects the 10001-deep chain');
  expectLimitRejection(
    () => parseCanonical(scalarBytes, { ...scalarLimits, maxDepth: scalarNodes - 1 }),
    'explicit depth one below the chain depth',
  );
  expectLimitRejection(
    () => parseCanonical(scalarBytes, { ...scalarLimits, maxNodes: scalarNodes - 1 }),
    'explicit node cap one below the chain node count',
  );

  // A chain of 10000 nested arrays with an empty innermost array is exactly
  // depth 10000; parsing at the exact bounds must succeed and stay iterative.
  const emptyBytes = bytesOf('['.repeat(DEPTH_LEVELS) + ']'.repeat(DEPTH_LEVELS));
  assert.strictEqual(emptyBytes.length, DEPTH_LEVELS * 2);
  const emptyLimits = {
    maxInputBytes: emptyBytes.length,
    maxDepth: DEPTH_LEVELS,
    maxNodes: DEPTH_LEVELS,
    maxBytes: emptyBytes.length,
    maxStringCodeUnits: 1,
  };
  const emptyParsed = parseCanonical(emptyBytes, emptyLimits);
  let cursor = emptyParsed;
  let levels = 0;
  for (;;) {
    assert.ok(Array.isArray(cursor), 'empty chain must parse to nested arrays');
    levels += 1;
    if (cursor.length === 0) break;
    assert.strictEqual(cursor.length, 1);
    cursor = cursor[0];
  }
  assert.strictEqual(levels, DEPTH_LEVELS);
  assert.strictEqual(cursor.length, 0);

  expectLimitRejection(() => parseCanonical(emptyBytes), 'default depth rejects the 10000-deep empty chain');
  expectLimitRejection(
    () => parseCanonical(emptyBytes, { ...emptyLimits, maxDepth: DEPTH_LEVELS - 1 }),
    'explicit depth one below the empty chain depth',
  );
});
