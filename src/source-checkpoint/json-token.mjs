/**
 * JSON primitive-token lexical helper for source-checkpoint.
 *
 * `scanJsonToken` reads exactly one JSON token beginning at or after a
 * caller-supplied offset inside an already materialized primitive string.
 * It understands JSON whitespace, the six structural punctuation
 * characters, double-quoted strings, JSON numbers and the `true` / `false`
 * / `null` literals. It performs no structural parsing: object/array
 * composition, key ordering, duplicate-key detection, depth/node/byte
 * limits, trailing-content checks and canonical byte equality belong to the
 * strict parser built on top of this helper. This module is a lexical
 * utility only and never a source of authority.
 *
 * Counting and slicing
 * --------------------
 * Every position and limit in this module counts UTF-16 code units, i.e.
 * `String.prototype.length`, matching the companion `assertValidUnicode`.
 * `start` is the index of the first non-whitespace code unit at or after
 * `offset`; `end` is exclusive. A token's measured length is `end - start`
 * and includes quotes, backslashes and escape characters for strings. The
 * decoded string value is measured separately by `assertValidUnicode`
 * against `maxStringCodeUnits`. All counters and slices stay within the
 * configured finite bounds.
 *
 * Token grammar
 * -------------
 * - Whitespace is limited to space (U+0020), tab (U+0009), CR (U+000D) and
 *   LF (U+000A); no other Unicode whitespace is accepted.
 * - Strings are double quoted, may not contain unescaped control
 *   characters, may only use legal JSON escapes and must decode to
 *   well-formed UTF-16; unpaired surrogates in the decoded value are
 *   rejected. Decoding is delegated to the built-in and already bounded
 *   `JSON.parse` applied to the single validated token.
 * - Numbers follow `-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?` and
 *   must convert to a finite `Number`. Valid noncanonical spellings such as
 *   `-0`, `1.0` or `1e2` are accepted here because canonical byte equality
 *   is enforced later by the strict parser, and finite values outside the
 *   safe-integer range remain allowed at this lexical layer because later
 *   record schemas constrain counters.
 * - Literals are exactly `true`, `false` and `null`.
 * - After a string, number or literal token the next code unit must be EOF,
 *   JSON whitespace or JSON punctuation; any other continuation rejects
 *   instead of being silently shortened.
 *
 * Limits
 * ------
 * `limits` may provide any subset of the three fields of
 * {@link DEFAULT_JSON_TOKEN_LIMITS}. Only own string-keyed data properties
 * are consulted: inherited properties are ignored, and unknown own keys,
 * symbol keys and accessor properties are rejected without invoking
 * getters. Limit values are never coerced. `maxInputCodeUnits` bounds the
 * whole input before scanning, `maxTokenCodeUnits` bounds every token while
 * its extent is being measured (before slicing or decoding), and
 * `maxStringCodeUnits` bounds the decoded string value. Inputs are expected
 * to be ordinary data values; no hostile-Proxy inertness is claimed.
 *
 * Errors
 * ------
 * - `TypeError`: input is not a primitive string; `offset` is not a number;
 *   `limits` is not an object, carries an unknown/symbol/accessor field, or
 *   a limit value is not a number.
 * - `RangeError`: `offset` is a number but not a safe integer or lies
 *   outside `[0, text.length]`; a limit value is not a positive safe
 *   integer; the whole text exceeds `maxInputCodeUnits`; a token exceeds
 *   `maxTokenCodeUnits`; the decoded string is malformed UTF-16 or longer
 *   than `maxStringCodeUnits`; a validated number converts to a non-finite
 *   value.
 * - `SyntaxError`: the code unit at `start` cannot begin a token, the token
 *   is malformed (unterminated string, illegal escape, unescaped control,
 *   invalid number/literal spelling) or a required token boundary is
 *   missing.
 *
 * Checks run left to right; when a token violates more than one rule the
 * first violation encountered while scanning is reported.
 *
 * @module source-checkpoint/json-token
 */

import { assertValidUnicode } from './unicode.mjs';

/** Default limits for {@link scanJsonToken}, frozen against mutation. */
export const DEFAULT_JSON_TOKEN_LIMITS = Object.freeze({
  maxInputCodeUnits: 1048576,
  maxTokenCodeUnits: 1048576,
  maxStringCodeUnits: 1048576,
});

const CHAR_TAB = 0x09;
const CHAR_LF = 0x0a;
const CHAR_CR = 0x0d;
const CHAR_SPACE = 0x20;
const CHAR_QUOTE = 0x22;
const CHAR_PLUS = 0x2b;
const CHAR_COMMA = 0x2c;
const CHAR_MINUS = 0x2d;
const CHAR_DOT = 0x2e;
const CHAR_ZERO = 0x30;
const CHAR_NINE = 0x39;
const CHAR_COLON = 0x3a;
const CHAR_UPPER_E = 0x45;
const CHAR_LBRACKET = 0x5b;
const CHAR_BACKSLASH = 0x5c;
const CHAR_RBRACKET = 0x5d;
const CHAR_LOWER_E = 0x65;
const CHAR_LBRACE = 0x7b;
const CHAR_RBRACE = 0x7d;

/** Validated JSON number grammar, tested only against already bounded slices. */
const NUMBER_TOKEN_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;

/** Literal spellings; first code units are distinct, so order is irrelevant. */
const LITERAL_TOKENS = Object.freeze([
  Object.freeze({ text: 'true', value: true }),
  Object.freeze({ text: 'false', value: false }),
  Object.freeze({ text: 'null', value: null }),
]);

function isAsciiDigit(unit) {
  return unit >= CHAR_ZERO && unit <= CHAR_NINE;
}

function isJsonWhitespace(unit) {
  return unit === CHAR_SPACE || unit === CHAR_TAB || unit === CHAR_LF || unit === CHAR_CR;
}

function isJsonPunctuation(unit) {
  return (
    unit === CHAR_LBRACE ||
    unit === CHAR_RBRACE ||
    unit === CHAR_LBRACKET ||
    unit === CHAR_RBRACKET ||
    unit === CHAR_COLON ||
    unit === CHAR_COMMA
  );
}

function isJsonBoundary(unit) {
  return isJsonWhitespace(unit) || isJsonPunctuation(unit);
}

function isNumberExtentUnit(unit) {
  return (
    isAsciiDigit(unit) ||
    unit === CHAR_MINUS ||
    unit === CHAR_PLUS ||
    unit === CHAR_DOT ||
    unit === CHAR_UPPER_E ||
    unit === CHAR_LOWER_E
  );
}

function describeCodeUnit(unit) {
  if (unit >= 0x20 && unit <= 0x7e) {
    return `'${String.fromCharCode(unit)}'`;
  }
  return `U+${unit.toString(16).toUpperCase().padStart(4, '0')}`;
}

function tokenCapError(start, maxTokenCodeUnits) {
  return new RangeError(
    `scanJsonToken: token beginning at offset ${start} exceeds maxTokenCodeUnits ${maxTokenCodeUnits}`,
  );
}

function missingBoundaryError(kind, position, unit) {
  return new SyntaxError(
    `scanJsonToken: unexpected character ${describeCodeUnit(unit)} after ${kind} token at offset ${position}`,
  );
}

function isAllowedLimitField(name) {
  return (
    name === 'maxInputCodeUnits' ||
    name === 'maxTokenCodeUnits' ||
    name === 'maxStringCodeUnits'
  );
}

/**
 * Resolve caller-supplied limits against {@link DEFAULT_JSON_TOKEN_LIMITS}.
 *
 * Only own string-keyed data properties are inspected; inherited
 * properties are ignored and accessors are never invoked.
 *
 * @param {object} limits - already type-checked limits argument
 * @returns {{maxInputCodeUnits: number, maxTokenCodeUnits: number, maxStringCodeUnits: number}}
 */
function resolveLimits(limits) {
  if (typeof limits !== 'object' || limits === null) {
    throw new TypeError(
      'scanJsonToken: limits must be an object carrying optional positive-safe-integer fields',
    );
  }
  if (Object.getOwnPropertySymbols(limits).length > 0) {
    throw new TypeError('scanJsonToken: limits must not carry symbol-keyed properties');
  }
  let maxInputCodeUnits = DEFAULT_JSON_TOKEN_LIMITS.maxInputCodeUnits;
  let maxTokenCodeUnits = DEFAULT_JSON_TOKEN_LIMITS.maxTokenCodeUnits;
  let maxStringCodeUnits = DEFAULT_JSON_TOKEN_LIMITS.maxStringCodeUnits;
  for (const name of Object.getOwnPropertyNames(limits)) {
    if (!isAllowedLimitField(name)) {
      throw new TypeError(`scanJsonToken: unknown limits field '${name}'`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(limits, name);
    if (descriptor === undefined) {
      throw new TypeError(`scanJsonToken: limits field '${name}' could not be inspected`);
    }
    if ('get' in descriptor || 'set' in descriptor) {
      throw new TypeError(`scanJsonToken: limits field '${name}' must be a data property`);
    }
    if (typeof descriptor.value !== 'number') {
      throw new TypeError(`scanJsonToken: limits field '${name}' must be a number`);
    }
    if (!Number.isSafeInteger(descriptor.value) || descriptor.value < 1) {
      throw new RangeError(
        `scanJsonToken: limits field '${name}' must be a positive safe integer`,
      );
    }
    if (name === 'maxInputCodeUnits') {
      maxInputCodeUnits = descriptor.value;
    } else if (name === 'maxTokenCodeUnits') {
      maxTokenCodeUnits = descriptor.value;
    } else {
      maxStringCodeUnits = descriptor.value;
    }
  }
  return { maxInputCodeUnits, maxTokenCodeUnits, maxStringCodeUnits };
}

/**
 * Scan a double-quoted string token starting at `start`.
 *
 * The measured token length includes both quotes and every escaped code
 * unit. Because there is no standalone backslash escape at the JSON lexical
 * layer, a backslash always consumes the following code unit during
 * measurement; escape legality and control-character rejection are then
 * enforced by the bounded `JSON.parse` decode. The decoded value is finally
 * validated by `assertValidUnicode` against `maxStringCodeUnits`.
 *
 * @param {string} text
 * @param {number} start
 * @param {number} maxTokenCodeUnits
 * @param {number} maxStringCodeUnits
 * @returns {{type: 'string', value: string, start: number, end: number}}
 */
function scanStringToken(text, start, maxTokenCodeUnits, maxStringCodeUnits) {
  const textLength = text.length;
  let position = start + 1;
  let tokenLength = 1;
  for (;;) {
    if (position >= textLength) {
      throw new SyntaxError(
        `scanJsonToken: unterminated string token beginning at offset ${start}`,
      );
    }
    const unit = text.charCodeAt(position);
    if (unit === CHAR_QUOTE) {
      tokenLength += 1;
      if (tokenLength > maxTokenCodeUnits) {
        throw tokenCapError(start, maxTokenCodeUnits);
      }
      position += 1;
      break;
    }
    if (unit === CHAR_BACKSLASH) {
      if (position + 1 >= textLength) {
        throw new SyntaxError(
          `scanJsonToken: unterminated string token beginning at offset ${start}`,
        );
      }
      tokenLength += 2;
      if (tokenLength > maxTokenCodeUnits) {
        throw tokenCapError(start, maxTokenCodeUnits);
      }
      position += 2;
      continue;
    }
    tokenLength += 1;
    if (tokenLength > maxTokenCodeUnits) {
      throw tokenCapError(start, maxTokenCodeUnits);
    }
    position += 1;
  }
  if (position < textLength && !isJsonBoundary(text.charCodeAt(position))) {
    throw missingBoundaryError('string', position, text.charCodeAt(position));
  }
  const token = text.slice(start, position);
  let decoded;
  try {
    decoded = JSON.parse(token);
  } catch (error) {
    throw new SyntaxError(
      `scanJsonToken: invalid JSON string token beginning at offset ${start}: ${error.message}`,
    );
  }
  return {
    type: 'string',
    value: assertValidUnicode(decoded, maxStringCodeUnits),
    start,
    end: position,
  };
}

/**
 * Scan a JSON number token starting at `start` (a minus sign or digit).
 *
 * The maximal run of number-grammar characters is measured first, with the
 * token cap enforced while measuring, then the bounded slice is matched
 * against the full JSON number grammar, boundary-checked, and converted to
 * a finite `Number`. No unvalidated text is ever converted.
 *
 * @param {string} text
 * @param {number} start
 * @param {number} maxTokenCodeUnits
 * @returns {{type: 'number', value: number, start: number, end: number}}
 */
function scanNumberToken(text, start, maxTokenCodeUnits) {
  const textLength = text.length;
  let position = start;
  while (position < textLength && isNumberExtentUnit(text.charCodeAt(position))) {
    position += 1;
    if (position - start > maxTokenCodeUnits) {
      throw tokenCapError(start, maxTokenCodeUnits);
    }
  }
  const token = text.slice(start, position);
  if (!NUMBER_TOKEN_PATTERN.test(token)) {
    throw new SyntaxError(
      `scanJsonToken: invalid JSON number token beginning at offset ${start}`,
    );
  }
  if (position < textLength && !isJsonBoundary(text.charCodeAt(position))) {
    throw missingBoundaryError('number', position, text.charCodeAt(position));
  }
  const value = Number(token);
  if (!Number.isFinite(value)) {
    throw new RangeError(
      `scanJsonToken: number token beginning at offset ${start} converts to a non-finite value`,
    );
  }
  return { type: 'number', value, start, end: position };
}

/**
 * Scan a `true`, `false` or `null` token starting at `start`.
 *
 * @param {string} text
 * @param {number} start
 * @param {number} maxTokenCodeUnits
 * @returns {{type: 'literal', value: boolean|null, start: number, end: number}}
 */
function scanLiteralToken(text, start, maxTokenCodeUnits) {
  const textLength = text.length;
  for (const literal of LITERAL_TOKENS) {
    if (!text.startsWith(literal.text, start)) {
      continue;
    }
    const end = start + literal.text.length;
    if (literal.text.length > maxTokenCodeUnits) {
      throw tokenCapError(start, maxTokenCodeUnits);
    }
    if (end < textLength && !isJsonBoundary(text.charCodeAt(end))) {
      throw missingBoundaryError('literal', end, text.charCodeAt(end));
    }
    return { type: 'literal', value: literal.value, start, end };
  }
  throw new SyntaxError(
    `scanJsonToken: unexpected character ${describeCodeUnit(text.charCodeAt(start))} at offset ${start}`,
  );
}

/**
 * Scan one JSON primitive token from `text` beginning at `offset`.
 *
 * Leading JSON whitespace at or after `offset` is skipped. The returned
 * object always has exactly the own data properties `type`, `value`,
 * `start` and `end`:
 *
 * - `{type: 'punctuation', value: '{'|'}'|'['|']'|':'|',', start, end}`
 * - `{type: 'string', value: decodedString, start, end}`
 * - `{type: 'number', value: finiteNumber, start, end}`
 * - `{type: 'literal', value: true|false|null, start, end}`
 * - `{type: 'eof', value: null, start: text.length, end: text.length}`
 *
 * `start` is the first non-whitespace code-unit index and `end` is
 * exclusive. The special offset `text.length` (and any offset whose
 * remainder is whitespace only) yields the EOF token. Punctuation and EOF
 * tokens are length 0 or 1 and therefore always satisfy the validated
 * positive token cap. This function performs no structural object/array
 * parsing and grants no source authority.
 *
 * @param {string} text - primitive string to scan
 * @param {number} [offset=0] - safe integer in `[0, text.length]`
 * @param {{maxInputCodeUnits?: number, maxTokenCodeUnits?: number, maxStringCodeUnits?: number}} [limits={}]
 *   optional positive-safe-integer overrides for
 *   {@link DEFAULT_JSON_TOKEN_LIMITS}
 * @returns {{type: 'punctuation'|'string'|'number'|'literal'|'eof',
 *   value: string|number|boolean|null, start: number, end: number}}
 * @throws {TypeError} if `text` is not a primitive string, `offset` is not
 *   a number, or `limits` is not an object / carries unknown, symbol-keyed
 *   or accessor fields / carries a non-number limit value
 * @throws {RangeError} if `offset` is not a safe integer or is outside
 *   `[0, text.length]`, a limit value is not a positive safe integer,
 *   `text.length` exceeds `maxInputCodeUnits`, a token exceeds
 *   `maxTokenCodeUnits`, the decoded string is malformed UTF-16 or exceeds
 *   `maxStringCodeUnits`, or a validated number is non-finite
 * @throws {SyntaxError} if no token can begin at `start`, or a token is
 *   malformed (unterminated string, illegal escape, unescaped control,
 *   invalid number or literal spelling, missing token boundary)
 */
export function scanJsonToken(text, offset = 0, limits = {}) {
  if (typeof text !== 'string') {
    throw new TypeError('scanJsonToken: text must be a primitive string');
  }
  if (typeof offset !== 'number') {
    throw new TypeError('scanJsonToken: offset must be a number');
  }
  if (!Number.isSafeInteger(offset)) {
    throw new RangeError('scanJsonToken: offset must be a safe integer');
  }

  const resolved = resolveLimits(limits);

  if (offset < 0 || offset > text.length) {
    throw new RangeError(`scanJsonToken: offset ${offset} is outside [0, ${text.length}]`);
  }
  if (text.length > resolved.maxInputCodeUnits) {
    throw new RangeError(
      `scanJsonToken: text length ${text.length} exceeds maxInputCodeUnits ${resolved.maxInputCodeUnits}`,
    );
  }

  let start = offset;
  while (start < text.length && isJsonWhitespace(text.charCodeAt(start))) {
    start += 1;
  }
  if (start === text.length) {
    return { type: 'eof', value: null, start, end: start };
  }

  const unit = text.charCodeAt(start);
  if (isJsonPunctuation(unit)) {
    // Length 1, which always satisfies the validated positive token cap.
    return { type: 'punctuation', value: text.charAt(start), start, end: start + 1 };
  }
  if (unit === CHAR_QUOTE) {
    return scanStringToken(text, start, resolved.maxTokenCodeUnits, resolved.maxStringCodeUnits);
  }
  if (unit === CHAR_MINUS || isAsciiDigit(unit)) {
    return scanNumberToken(text, start, resolved.maxTokenCodeUnits);
  }
  return scanLiteralToken(text, start, resolved.maxTokenCodeUnits);
}
