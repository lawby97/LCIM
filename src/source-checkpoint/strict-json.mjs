/**
 * Strict canonical JSON parser for source-checkpoint.
 *
 * `parseCanonical(bytes, limits)` decodes one complete UTF-8 JSON document
 * and accepts it only when the input bytes are exactly the canonical
 * RFC 8785 / JCS encoding that `canonicalize` produces for the value those
 * bytes describe. Canonical input is therefore the only accepted input:
 * object-key order, number spellings, string escapes, Unicode bytes and
 * whitespace must already be canonical, and noncanonical input is rejected
 * instead of being silently repaired.
 *
 * Input domain
 * ------------
 * `bytes` must be a genuine `Uint8Array`, which includes `Buffer` instances,
 * views from other realms and views whose prototype or own properties were
 * changed. The visible range is read through the built-in `%TypedArray%`
 * internal-slot getters (`Symbol.toStringTag`, `buffer`, `byteOffset`,
 * `byteLength`), so shadowed properties, iterators, coercion hooks and
 * `valueOf` are never consulted, and the caller's bytes are never mutated.
 * The range is copied once before parsing, so later changes to the caller's
 * view or buffer cannot affect the result. Hostile `Proxy` traps are outside
 * the supported ordinary-data domain.
 *
 * Objects in the returned value are ordinary `Object.prototype` objects whose
 * keys are own enumerable data properties (every key is installed with
 * `Object.defineProperty`), so dangerous-looking names such as `__proto__` or
 * `constructor` remain plain data and never mutate a prototype.
 *
 * Limits
 * ------
 * `limits` may override any subset of {@link DEFAULT_PARSE_LIMITS}:
 *
 * - `maxInputBytes`: input byte length, checked before any decoding happens.
 * - `maxDepth`: value depth, counted exactly as `canonicalize` documents it:
 *   the root value has depth 1 and every array element or object member value
 *   has depth parent + 1, so scalars count too.
 * - `maxNodes`: value-node count, counted exactly as `canonicalize` documents
 *   it: the root value and every array element or object member value counts
 *   once; object keys are not value nodes.
 * - `maxBytes`: canonical output byte length, forwarded to `canonicalize`
 *   together with the other three canonical limits; `maxInputBytes` stays a
 *   parser-only bound.
 * - `maxStringCodeUnits`: decoded key/value length in UTF-16 code units,
 *   enforced for every parsed string and forwarded to `canonicalize`.
 *
 * Only own string-keyed data properties are read: unknown names, symbol keys
 * and accessor properties are rejected without invoking any getter, and limit
 * values are never coerced. The lexical caps passed to `scanJsonToken` are
 * derived from `maxInputBytes` (which upper-bounds the decoded text in code
 * units, because UTF-8 never yields more UTF-16 code units than bytes) and
 * `maxStringCodeUnits`, so the helper's own defaults never apply.
 *
 * Parsing and canonicalization are iterative and use explicit heap stacks, so
 * the configured depth/node limits - never JavaScript stack exhaustion - are
 * the guard for deeply nested input.
 *
 * Errors
 * ------
 * - `TypeError`: `bytes` is not a genuine `Uint8Array`/`Buffer` (plain
 *   objects, other typed arrays, `DataView`, proxies of views, primitives) or
 *   exposes no readable byte range; `limits` is not an object or carries
 *   unknown, symbol-keyed or accessor properties.
 * - `RangeError`: a limit override is not a positive safe integer; the input
 *   exceeds `maxInputBytes`; the value-node or depth budget is exceeded; a
 *   decoded string exceeds `maxStringCodeUnits`; a number token is
 *   non-finite; or the canonical output exceeds `maxBytes` (the string,
 *   number and canonical-output checks are raised by the supplied helpers).
 * - `SyntaxError`: a leading UTF-8 BOM, malformed or truncated UTF-8, invalid
 *   JSON syntax, a duplicate object key, trailing content, or input bytes
 *   that are not exactly the canonical encoding of the parsed value.
 *
 * @module source-checkpoint/strict-json
 */

import { TextDecoder } from 'node:util';
import { canonicalize } from './canonical.mjs';
import { scanJsonToken as scanJsonTokenRaw } from './json-token.mjs';
import { MalformedUnicodeError } from './unicode.mjs';

/** Preserve limit RangeErrors while classifying malformed JSON string Unicode as syntax. */
function scanJsonToken(...args) {
  try {
    return scanJsonTokenRaw(...args);
  } catch (error) {
    if (error instanceof MalformedUnicodeError) {
      throw new SyntaxError('parseCanonical: malformed Unicode in JSON string token');
    }
    throw error;
  }
}

/**
 * Frozen default parser limits: input bytes, value depth, value nodes,
 * canonical output bytes and per-string UTF-16 code units.
 */
export const DEFAULT_PARSE_LIMITS = Object.freeze({
  maxInputBytes: 1048576,
  maxDepth: 64,
  maxNodes: 100000,
  maxBytes: 1048576,
  maxStringCodeUnits: 1048576,
});

/** The only own configuration keys `resolveLimits` accepts. */
const LIMIT_NAMES = Object.freeze([
  'maxInputBytes',
  'maxDepth',
  'maxNodes',
  'maxBytes',
  'maxStringCodeUnits',
]);

/** UTF-8 encoding of U+FEFF, rejected as a leading byte-order mark. */
const BOM_BYTES = Object.freeze([0xef, 0xbb, 0xbf]);

/*
 * Trusted `%TypedArray%` internal-slot accessors captured once from this
 * realm. Calling them with `.call(value)` reads the genuine slot values of
 * any typed-array object - including cross-realm views and views whose
 * prototype chain or own properties were changed - while shadowed
 * `Symbol.toStringTag`, `byteLength`, `buffer` and `byteOffset` properties
 * are never consulted.
 */
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayTagGetter = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  Symbol.toStringTag,
).get;
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'buffer',
).get;
const typedArrayByteOffsetGetter = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'byteOffset',
).get;
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'byteLength',
).get;

/**
 * Validate and normalize the optional parser limit overrides.
 *
 * Only own string-keyed data properties for the five documented limits are
 * read; accessors are rejected from their descriptor without being invoked,
 * unknown or symbol-keyed configuration is rejected, and limit values must be
 * positive safe integers. The result is frozen.
 *
 * @param {object|undefined} limits
 * @returns {{maxInputBytes: number, maxDepth: number, maxNodes: number,
 *   maxBytes: number, maxStringCodeUnits: number}}
 */
function resolveLimits(limits) {
  if (limits === undefined) return DEFAULT_PARSE_LIMITS;
  if (typeof limits !== 'object' || limits === null) {
    throw new TypeError(
      'parseCanonical: limits must be an object with optional positive integer overrides',
    );
  }
  if (Object.getOwnPropertySymbols(limits).length > 0) {
    throw new TypeError('parseCanonical: limits must not contain symbol keys');
  }
  const names = Object.getOwnPropertyNames(limits);
  if (names.length === 0) return DEFAULT_PARSE_LIMITS;
  const resolved = { ...DEFAULT_PARSE_LIMITS };
  for (const name of names) {
    if (!LIMIT_NAMES.includes(name)) {
      throw new TypeError(`parseCanonical: unknown limit "${name}"`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(limits, name);
    if (descriptor === undefined || !('value' in descriptor)) {
      // Only data descriptors are read, so accessor behavior never runs.
      throw new TypeError(`parseCanonical: limit "${name}" must be a plain data property`);
    }
    const candidate = descriptor.value;
    if (typeof candidate !== 'number' || !Number.isSafeInteger(candidate) || candidate < 1) {
      throw new RangeError(`parseCanonical: limit "${name}" must be a positive safe integer`);
    }
    resolved[name] = candidate;
  }
  return Object.freeze(resolved);
}

/**
 * Read the visible byte length of a genuine `Uint8Array`/`Buffer` through the
 * trusted internal-slot getters. Other typed arrays, `DataView`, plain
 * objects, proxies of views and primitives are rejected with `TypeError`.
 *
 * @param {unknown} bytes
 * @returns {number} the view's genuine byte length
 */
function readVisibleByteLength(bytes) {
  if (typedArrayTagGetter.call(bytes) !== 'Uint8Array') {
    throw new TypeError('parseCanonical: bytes must be a genuine Uint8Array or Buffer');
  }
  return typedArrayByteLengthGetter.call(bytes);
}

/**
 * Copy the visible bytes of a genuine `Uint8Array`/`Buffer` into a new
 * same-realm array. The copy is taken through the trusted `buffer`,
 * `byteOffset` and `byteLength` internal slots, so no shadowed property,
 * iterator or coercion hook participates.
 *
 * @param {unknown} bytes
 * @param {number} byteLength - result of {@link readVisibleByteLength}
 * @returns {Uint8Array}
 */
function copyVisibleBytes(bytes, byteLength) {
  let source;
  try {
    const buffer = typedArrayBufferGetter.call(bytes);
    const byteOffset = typedArrayByteOffsetGetter.call(bytes);
    source = new Uint8Array(buffer, byteOffset, byteLength);
  } catch {
    throw new TypeError('parseCanonical: bytes must expose a readable byte range');
  }
  const copy = new Uint8Array(byteLength);
  copy.set(source);
  return copy;
}

/**
 * True when the copied bytes start with the UTF-8 encoding of U+FEFF.
 *
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
function hasLeadingBom(bytes) {
  return (
    bytes.length >= BOM_BYTES.length &&
    bytes[0] === BOM_BYTES[0] &&
    bytes[1] === BOM_BYTES[1] &&
    bytes[2] === BOM_BYTES[2]
  );
}

/**
 * Decode `bytes` as strict UTF-8. The WHATWG decoder's fatal mode rejects
 * malformed, overlong, surrogate and truncated sequences; `ignoreBOM` keeps a
 * U+FEFF character visible so only the explicit leading-BOM check above can
 * remove it (and always by rejection).
 *
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function decodeStrictUtf8(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new SyntaxError('parseCanonical: input is not well-formed UTF-8');
  }
}

/**
 * Return the index of the first differing byte, or `-1` when the two byte
 * sequences are identical.
 *
 * @param {Uint8Array} canonical
 * @param {Uint8Array} input
 * @returns {number}
 */
function firstByteMismatch(canonical, input) {
  const shared = canonical.length < input.length ? canonical.length : input.length;
  for (let index = 0; index < shared; index += 1) {
    if (canonical[index] !== input[index]) return index;
  }
  return canonical.length === input.length ? -1 : shared;
}

/**
 * Parse one complete JSON document from already-decoded text.
 *
 * The parser is a small explicit state machine. `stack` holds one frame per
 * open container plus a virtual root frame; frames record the depth of the
 * value they belong to, the partially built container, the object's decoded
 * key set and the current expectation. Every value is counted against
 * `maxNodes` and `maxDepth` exactly as `canonicalize` documents counting, so
 * an accepted document can never trip the canonicalizer's own budgets.
 * Object keys are decoded by `scanJsonToken` before they are compared, so
 * escape aliases of the same key are duplicates, and keys are installed with
 * `Object.defineProperty` only after the duplicate check.
 *
 * @param {string} text - decoded UTF-8 document
 * @param {{maxInputBytes: number, maxDepth: number, maxNodes: number,
 *   maxBytes: number, maxStringCodeUnits: number}} config
 * @returns {unknown} ordinary JSON data
 */
function parseDocument(text, config) {
  const { maxDepth, maxNodes } = config;
  // Lexical caps derived from the parser limits. `maxInputBytes` upper-bounds
  // the decoded text in UTF-16 code units, so neither cap can reject a
  // document that passed the input byte check, and no helper default applies.
  const tokenLimits = {
    maxInputCodeUnits: config.maxInputBytes,
    maxTokenCodeUnits: config.maxInputBytes,
    maxStringCodeUnits: config.maxStringCodeUnits,
  };

  let position = 0;
  let nodesUsed = 0;
  let rootValue;

  const countValueNode = (depth) => {
    nodesUsed += 1;
    if (nodesUsed > maxNodes) {
      throw new RangeError(`parseCanonical: value-node limit maxNodes ${maxNodes} exceeded`);
    }
    if (depth > maxDepth) {
      throw new RangeError(`parseCanonical: value depth ${depth} exceeds maxDepth ${maxDepth}`);
    }
  };

  const stack = [{ kind: 'root', valueDepth: 0, state: 'value' }];

  const attach = (frame, value) => {
    if (frame.kind === 'root') {
      rootValue = value;
      frame.state = 'end';
      return;
    }
    if (frame.kind === 'array') {
      frame.container.push(value);
      frame.state = 'comma-or-end';
      return;
    }
    // `defineProperty` keeps every decoded key - including "__proto__" and
    // other dangerous-looking names - as an ordinary own data property.
    Object.defineProperty(frame.container, frame.pendingKey, {
      value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    frame.pendingKey = null;
    frame.state = 'comma-or-end';
  };

  const closeContainer = (frame) => {
    stack.pop();
    attach(stack[stack.length - 1], frame.container);
  };

  for (;;) {
    const frame = stack[stack.length - 1];

    if (frame.state === 'value') {
      const childDepth = frame.valueDepth + 1;
      const token = scanJsonToken(text, position, tokenLimits);
      position = token.end;
      if (token.type === 'eof') {
        throw new SyntaxError('parseCanonical: unexpected end of input');
      }
      if (token.type === 'punctuation') {
        if (token.value === '{') {
          countValueNode(childDepth);
          stack.push({
            kind: 'object',
            container: {},
            keys: new Set(),
            pendingKey: null,
            valueDepth: childDepth,
            state: 'first-key',
          });
          continue;
        }
        if (token.value === '[') {
          countValueNode(childDepth);
          stack.push({
            kind: 'array',
            container: [],
            valueDepth: childDepth,
            state: 'first',
          });
          continue;
        }
        throw new SyntaxError(
          `parseCanonical: unexpected punctuation "${token.value}" at offset ${token.start}`,
        );
      }
      // string, number or literal token
      countValueNode(childDepth);
      attach(frame, token.value);
      continue;
    }

    if (frame.state === 'end') {
      const token = scanJsonToken(text, position, tokenLimits);
      if (token.type !== 'eof') {
        throw new SyntaxError(
          `parseCanonical: unexpected trailing content at offset ${token.start}`,
        );
      }
      return rootValue;
    }

    if (frame.kind === 'array') {
      if (frame.state === 'first') {
        const token = scanJsonToken(text, position, tokenLimits);
        if (token.type === 'punctuation' && token.value === ']') {
          position = token.end;
          closeContainer(frame);
          continue;
        }
        // Not the empty array: re-read the same token as a value.
        frame.state = 'value';
        continue;
      }
      // frame.state === 'comma-or-end'
      const token = scanJsonToken(text, position, tokenLimits);
      if (token.type === 'punctuation' && token.value === ',') {
        position = token.end;
        frame.state = 'value';
        continue;
      }
      if (token.type === 'punctuation' && token.value === ']') {
        position = token.end;
        closeContainer(frame);
        continue;
      }
      throw new SyntaxError(`parseCanonical: expected "," or "]" at offset ${token.start}`);
    }

    // frame.kind === 'object'
    if (frame.state === 'first-key') {
      const token = scanJsonToken(text, position, tokenLimits);
      if (token.type === 'punctuation' && token.value === '}') {
        position = token.end;
        closeContainer(frame);
        continue;
      }
      // Not the empty object: re-read the same token as a property name.
      frame.state = 'key';
      continue;
    }

    if (frame.state === 'key') {
      const token = scanJsonToken(text, position, tokenLimits);
      if (token.type === 'eof') {
        throw new SyntaxError('parseCanonical: unexpected end of input');
      }
      if (token.type !== 'string') {
        throw new SyntaxError(
          `parseCanonical: expected a double-quoted property name at offset ${token.start}`,
        );
      }
      position = token.end;
      if (frame.keys.has(token.value)) {
        throw new SyntaxError(`parseCanonical: duplicate object key at offset ${token.start}`);
      }
      frame.keys.add(token.value);
      frame.pendingKey = token.value;
      frame.state = 'colon';
      continue;
    }

    if (frame.state === 'colon') {
      const token = scanJsonToken(text, position, tokenLimits);
      if (token.type === 'punctuation' && token.value === ':') {
        position = token.end;
        frame.state = 'value';
        continue;
      }
      if (token.type === 'eof') {
        throw new SyntaxError('parseCanonical: unexpected end of input');
      }
      throw new SyntaxError(`parseCanonical: expected ":" at offset ${token.start}`);
    }

    // frame.state === 'comma-or-end'
    const token = scanJsonToken(text, position, tokenLimits);
    if (token.type === 'punctuation' && token.value === ',') {
      position = token.end;
      frame.state = 'key';
      continue;
    }
    if (token.type === 'punctuation' && token.value === '}') {
      position = token.end;
      closeContainer(frame);
      continue;
    }
    throw new SyntaxError(`parseCanonical: expected "," or "}" at offset ${token.start}`);
  }
}

/**
 * Parse `bytes` as one complete canonical JSON document.
 *
 * The visible input bytes are copied, checked against `maxInputBytes`,
 * rejected if they begin with a BOM or are not well-formed UTF-8, parsed with
 * `scanJsonToken` under explicit depth/node/string budgets, canonicalized
 * with the four canonical limits, and accepted only when the canonical output
 * is byte-for-byte identical to the input. Nothing in the input is coerced or
 * executed, and the input bytes are never modified.
 *
 * @param {Uint8Array|Buffer} bytes - complete encoded JSON document
 * @param {object} [limits={}] - optional overrides for `maxInputBytes`,
 *   `maxDepth`, `maxNodes`, `maxBytes` and `maxStringCodeUnits`; each must be
 *   a positive safe integer and unknown/accessor/symbol configuration rejects
 * @returns {unknown} ordinary JSON data (objects are `Object.prototype`
 *   objects whose keys are own enumerable data properties)
 * @throws {TypeError} if `bytes` is not a genuine readable `Uint8Array`/
 *   `Buffer`, or `limits` has an unsupported shape
 * @throws {RangeError} if a limit override is invalid, the input exceeds
 *   `maxInputBytes`, a value depth/node/string budget is exceeded, a number
 *   token is non-finite, or the canonical output exceeds `maxBytes`
 * @throws {SyntaxError} if the input has a leading BOM, is malformed or
 *   truncated UTF-8, is invalid JSON, contains duplicate keys or trailing
 *   content, or is not byte-for-byte canonical
 */
export function parseCanonical(bytes, limits = {}) {
  const config = resolveLimits(limits);
  const byteLength = readVisibleByteLength(bytes);
  if (byteLength > config.maxInputBytes) {
    throw new RangeError(
      `parseCanonical: input length ${byteLength} exceeds maxInputBytes ${config.maxInputBytes}`,
    );
  }
  const input = copyVisibleBytes(bytes, byteLength);
  if (hasLeadingBom(input)) {
    throw new SyntaxError('parseCanonical: a leading UTF-8 BOM is not permitted');
  }
  const text = decodeStrictUtf8(input);
  const value = parseDocument(text, config);

  const canonical = canonicalize(value, {
    maxDepth: config.maxDepth,
    maxNodes: config.maxNodes,
    maxBytes: config.maxBytes,
    maxStringCodeUnits: config.maxStringCodeUnits,
  });
  const mismatch = firstByteMismatch(canonical, input);
  if (mismatch !== -1) {
    throw new SyntaxError(
      'parseCanonical: input is not canonical JSON ' +
        `(input ${input.length} bytes, canonical ${canonical.length} bytes, ` +
        `first difference at byte ${mismatch})`,
    );
  }
  return value;
}
