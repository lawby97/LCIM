/**
 * Recursive canonical JSON (RFC 8785 / JCS) serializer for source-checkpoint.
 *
 * `canonicalize(value, limits)` returns the complete canonical UTF-8 encoding
 * of `value` as a Buffer. The supported input is ordinary JSON data:
 *
 *   - `null`, booleans, finite IEEE-754 numbers and well-formed Unicode
 *     strings (no Unicode normalization is applied);
 *   - dense arrays whose own properties are exactly the enumerable array
 *     index data properties plus the built-in `length` data property;
 *   - objects whose prototype is `Object.prototype` or `null` and whose own
 *     properties are enumerable, string-keyed data properties.
 *
 * Array element order is preserved. Object keys are sorted by UTF-16 code
 * units (RFC 8785). Strings and keys are encoded by `encodeCanonicalString`,
 * which owns canonical escaping, Unicode validation and the per-string
 * code-unit/byte budget. Numbers use the ECMAScript `Number::toString`
 * formatting that JSON uses, so `-0` becomes `0` and the exponent thresholds
 * match `JSON.stringify`; non-finite numbers are rejected. The output
 * contains no whitespace and no normalization.
 *
 * Counting conventions (documented choices of this implementation):
 *
 *   - Value node: every JSON value visited counts as one node - the root
 *     value, every array element and every object member value. Object keys
 *     are not counted separately. A shared reference counts once per visit;
 *     reference cycles are rejected.
 *   - Depth: the root value has depth 1 and every array element or object
 *     member value has depth parent + 1, so `maxDepth` bounds the number of
 *     values on any root-to-value path, scalars included.
 *
 * Traversal uses an explicit work stack rather than JavaScript recursion and
 * checks `maxDepth`/`maxNodes` before processing each value, so the configured
 * limits - not the call stack - guard deeply nested input. The `maxBytes`
 * budget is charged before every token (punctuation, keys, strings, numbers
 * and literals) is appended; string encoding receives only the remaining
 * budget, so oversized canonical output is never allocated.
 *
 * Unsupported values fail closed instead of being coerced or omitted:
 * accessors, `toJSON`, `valueOf`, `toString`, `Symbol.toPrimitive` and every
 * other user hook are never invoked. Unsupported value/object types, symbol
 * keys, sparse arrays, custom array properties, non-enumerable own
 * properties, cycles and malformed configuration shapes throw `TypeError`;
 * invalid limit values, non-finite numbers, malformed Unicode and
 * depth/node/byte/code-unit budget overruns throw `RangeError`. Hostile Proxy
 * traps are outside the supported ordinary-data domain and are not claimed to
 * be inert.
 */

import { Buffer } from 'node:buffer';
import { encodeCanonicalString } from './canonical-string.mjs';

/**
 * Frozen default limits: maximum value depth, value-node count, total encoded
 * bytes and per-string UTF-16 code units.
 */
export const DEFAULT_CANONICAL_LIMITS = Object.freeze({
  maxDepth: 64,
  maxNodes: 100000,
  maxBytes: 1048576,
  maxStringCodeUnits: 1048576,
});

/** The only own configuration keys `resolveLimits` accepts. */
const LIMIT_NAMES = Object.freeze(['maxDepth', 'maxNodes', 'maxBytes', 'maxStringCodeUnits']);

/** Canonical unsigned 32-bit-ish array index text (no leading zeros). */
const ARRAY_INDEX_NAME = /^(?:0|[1-9][0-9]*)$/;
const MAX_ARRAY_INDEX = 4294967294; // 2^32 - 2, the largest array index

/** True for own property names that denote an in-range array index. */
function isArrayIndexName(name) {
  if (!ARRAY_INDEX_NAME.test(name)) return false;
  return Number(name) <= MAX_ARRAY_INDEX;
}

/**
 * Validate and normalize the optional limit overrides.
 *
 * Only own string data properties for the four documented limits are read;
 * accessors are rejected from their descriptor without being invoked, unknown
 * or symbol-keyed configuration is rejected, and limit values must be
 * positive safe integers. The result is frozen.
 */
function resolveLimits(limits) {
  if (limits === undefined) return DEFAULT_CANONICAL_LIMITS;
  if (typeof limits !== 'object' || limits === null) {
    throw new TypeError(
      'canonicalize: limits must be an object with optional positive integer overrides',
    );
  }
  if (Object.getOwnPropertySymbols(limits).length > 0) {
    throw new TypeError('canonicalize: limits must not contain symbol keys');
  }
  const names = Object.getOwnPropertyNames(limits);
  if (names.length === 0) return DEFAULT_CANONICAL_LIMITS;
  const resolved = {
    maxDepth: DEFAULT_CANONICAL_LIMITS.maxDepth,
    maxNodes: DEFAULT_CANONICAL_LIMITS.maxNodes,
    maxBytes: DEFAULT_CANONICAL_LIMITS.maxBytes,
    maxStringCodeUnits: DEFAULT_CANONICAL_LIMITS.maxStringCodeUnits,
  };
  for (const name of names) {
    if (!LIMIT_NAMES.includes(name)) {
      throw new TypeError(`canonicalize: unknown limit "${name}"`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(limits, name);
    if (descriptor === undefined || !('value' in descriptor)) {
      // Only data descriptors are read, so accessor behavior never runs.
      throw new TypeError(`canonicalize: limit "${name}" must be a plain data property`);
    }
    const candidate = descriptor.value;
    if (typeof candidate !== 'number' || !Number.isSafeInteger(candidate) || candidate < 1) {
      throw new RangeError(`canonicalize: limit "${name}" must be a positive safe integer`);
    }
    resolved[name] = candidate;
  }
  return Object.freeze(resolved);
}

/** UTF-16 code-unit comparator for object member keys (RFC 8785 order). */
function compareEntriesByKey(left, right) {
  if (left.key === right.key) return 0;
  return left.key < right.key ? -1 : 1;
}

/**
 * Validate a dense array and capture its element values.
 *
 * Every own property must be either the built-in `length` data property or an
 * in-range enumerable index data property, and all indices must be present.
 * Descriptors are read directly, so accessor elements are rejected without
 * being invoked. `remainingNodes` is the node budget left after the array
 * itself was counted; a length beyond it cannot fit, which also bounds the
 * work for huge sparse input.
 */
function inspectArray(array, remainingNodes, maxNodes) {
  const length = array.length;
  if (length > remainingNodes) {
    // Each element would add at least one value visit, so the limit is doomed.
    throw new RangeError(`canonicalize: value-node limit maxNodes ${maxNodes} exceeded`);
  }
  if (Object.getOwnPropertySymbols(array).length > 0) {
    throw new TypeError('canonicalize: symbol-keyed array properties are not permitted');
  }
  const items = new Array(length);
  let indexed = 0;
  for (const name of Object.getOwnPropertyNames(array)) {
    if (name === 'length') {
      const descriptor = Object.getOwnPropertyDescriptor(array, name);
      if (descriptor === undefined || !('value' in descriptor)) {
        throw new TypeError('canonicalize: array length must be a data property');
      }
      continue;
    }
    if (!isArrayIndexName(name)) {
      throw new TypeError(`canonicalize: array has unsupported own property "${name}"`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(array, name);
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new TypeError('canonicalize: accessor array elements are not permitted');
    }
    if (!descriptor.enumerable) {
      throw new TypeError('canonicalize: non-enumerable array elements are not permitted');
    }
    const index = Number(name);
    if (index >= length) {
      throw new TypeError(`canonicalize: array has an out-of-range index "${name}"`);
    }
    items[index] = descriptor.value;
    indexed += 1;
  }
  if (indexed !== length) {
    throw new TypeError('canonicalize: sparse arrays are not permitted');
  }
  return items;
}

/**
 * Validate an ordinary data object and capture its own members sorted by
 * UTF-16 code units. Only data descriptors are read (accessors are rejected
 * without invocation), symbol keys and non-enumerable own properties are
 * rejected rather than silently dropped, and unsupported prototypes fail
 * closed.
 */
function inspectObject(object) {
  const prototype = Object.getPrototypeOf(object);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(
      'canonicalize: only objects with Object.prototype or null prototype are supported',
    );
  }
  if (Object.getOwnPropertySymbols(object).length > 0) {
    throw new TypeError('canonicalize: symbol-keyed object properties are not permitted');
  }
  const entries = [];
  for (const name of Object.getOwnPropertyNames(object)) {
    const descriptor = Object.getOwnPropertyDescriptor(object, name);
    if (descriptor === undefined || !('value' in descriptor)) {
      throw new TypeError('canonicalize: accessor object properties are not permitted');
    }
    if (!descriptor.enumerable) {
      throw new TypeError('canonicalize: non-enumerable own properties are not permitted');
    }
    entries.push({ key: name, value: descriptor.value });
  }
  entries.sort(compareEntriesByKey);
  return entries;
}

/**
 * Serialize `value` as canonical RFC 8785 / JCS UTF-8.
 *
 * @param {unknown} value - ordinary JSON data (see the module documentation
 *   for the exact supported domain)
 * @param {object} [limits={}] - optional overrides for `maxDepth`, `maxNodes`,
 *   `maxBytes` and `maxStringCodeUnits`; each must be a positive safe integer
 * @returns {Buffer} the complete canonical UTF-8 encoding
 * @throws {TypeError} for values outside the supported domain, reference
 *   cycles, or malformed/unknown/accessor configuration
 * @throws {RangeError} for invalid limit values, non-finite numbers, malformed
 *   Unicode, and depth/node/byte/code-unit budget overruns
 */
export function canonicalize(value, limits = {}) {
  const config = resolveLimits(limits);
  const { maxDepth, maxNodes, maxBytes, maxStringCodeUnits } = config;

  const chunks = [];
  let bytesUsed = 0;
  let nodesUsed = 0;
  // Containers on the current root-to-value path; used for cycle detection.
  const openContainers = new Set();

  const byteOverflowError = () =>
    new RangeError(`canonicalize: canonical output would exceed maxBytes ${maxBytes}`);

  // Append an ASCII token, charging the global byte budget first.
  const writeAscii = (text) => {
    const size = text.length;
    if (bytesUsed + size > maxBytes) throw byteOverflowError();
    chunks.push(Buffer.from(text, 'latin1'));
    bytesUsed += size;
  };

  // Append a canonical string/key literal. The helper receives the remaining
  // global budget as its byte limit, so it validates Unicode, enforces the
  // code-unit budget and refuses to allocate an oversized literal.
  const writeStringLiteral = (text) => {
    const remaining = maxBytes - bytesUsed;
    if (remaining < 2) throw byteOverflowError();
    let encoded;
    try {
      encoded = encodeCanonicalString(text, maxStringCodeUnits, remaining);
    } catch (error) {
      if (error instanceof RangeError && error.message.includes('maxBytes')) {
        throw byteOverflowError();
      }
      throw error;
    }
    chunks.push(encoded);
    bytesUsed += encoded.length;
  };

  // Explicit work stack: value frames serialize one JSON value; array/object
  // frames emit the next separator/member and re-push themselves to finish
  // the container. LIFO order reproduces a depth-first walk without using the
  // JavaScript call stack.
  const stack = [{ kind: 'value', value, depth: 1 }];

  while (stack.length > 0) {
    const frame = stack.pop();

    if (frame.kind === 'array') {
      const { items, nextIndex, depth, container } = frame;
      if (nextIndex >= items.length) {
        writeAscii(']');
        openContainers.delete(container);
        continue;
      }
      if (nextIndex > 0) writeAscii(',');
      stack.push({ kind: 'array', container, items, nextIndex: nextIndex + 1, depth });
      stack.push({ kind: 'value', value: items[nextIndex], depth: depth + 1 });
      continue;
    }

    if (frame.kind === 'object') {
      const { entries, nextIndex, depth, container } = frame;
      if (nextIndex >= entries.length) {
        writeAscii('}');
        openContainers.delete(container);
        continue;
      }
      if (nextIndex > 0) writeAscii(',');
      const entry = entries[nextIndex];
      writeStringLiteral(entry.key);
      writeAscii(':');
      stack.push({ kind: 'object', container, entries, nextIndex: nextIndex + 1, depth });
      stack.push({ kind: 'value', value: entry.value, depth: depth + 1 });
      continue;
    }

    // Value frame: charge the node/depth budgets before doing any work.
    nodesUsed += 1;
    if (nodesUsed > maxNodes) {
      throw new RangeError(`canonicalize: value-node limit maxNodes ${maxNodes} exceeded`);
    }
    const current = frame.value;
    const depth = frame.depth;
    if (depth > maxDepth) {
      throw new RangeError(`canonicalize: value depth ${depth} exceeds maxDepth ${maxDepth}`);
    }

    switch (typeof current) {
      case 'object': {
        if (current === null) {
          writeAscii('null');
          break;
        }
        if (openContainers.has(current)) {
          throw new TypeError('canonicalize: circular reference detected');
        }
        if (Array.isArray(current)) {
          const items = inspectArray(current, maxNodes - nodesUsed, maxNodes);
          openContainers.add(current);
          writeAscii('[');
          stack.push({ kind: 'array', container: current, items, nextIndex: 0, depth });
        } else {
          const entries = inspectObject(current);
          openContainers.add(current);
          writeAscii('{');
          stack.push({ kind: 'object', container: current, entries, nextIndex: 0, depth });
        }
        break;
      }
      case 'string':
        writeStringLiteral(current);
        break;
      case 'number':
        if (!Number.isFinite(current)) {
          throw new RangeError('canonicalize: non-finite numbers are not permitted');
        }
        // String(number) is the ECMAScript Number::toString formatting used
        // by JSON and RFC 8785; it renders -0 as "0".
        writeAscii(String(current));
        break;
      case 'boolean':
        writeAscii(current ? 'true' : 'false');
        break;
      case 'bigint':
        throw new TypeError('canonicalize: bigint values are not permitted');
      case 'function':
        throw new TypeError('canonicalize: function values are not permitted');
      case 'symbol':
        throw new TypeError('canonicalize: symbol values are not permitted');
      case 'undefined':
        throw new TypeError('canonicalize: undefined values are not permitted');
      default:
        throw new TypeError(`canonicalize: unsupported value type "${typeof current}"`);
    }
  }

  return Buffer.concat(chunks, bytesUsed);
}
