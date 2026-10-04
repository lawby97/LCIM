/**
 * Canonical JSON string encoder unit for source-checkpoint.
 *
 * Encodes a validated primitive string as a canonical (RFC 8785, i.e.
 * ECMAScript JSON.stringify) JSON string literal: surrounding quotes,
 * the standard short control escapes (\b \t \n \f \r), \" and \\
 * escapes, an unescaped solidus, lowercase \u00xx escapes for the
 * remaining U+0000..U+001F control characters, and literal UTF-8 for
 * every other valid Unicode code point. No normalization is applied.
 *
 * The encoded byte budget (including quotes and escapes) is enforced
 * while encoding, so an oversized encoded value is never constructed;
 * the input is never JSON.stringify'd or UTF-8-encoded wholesale before
 * the size check. Encoding is iterative and side-effect free: no
 * recursion, input mutation, coercion, getters, toJSON, I/O or other
 * observable effects.
 */

import { Buffer } from 'node:buffer';
import { assertValidUnicode, DEFAULT_MAX_CODE_UNITS } from './unicode.mjs';

/** Default maximum encoded length in bytes, including both quotes (2^20). */
export const DEFAULT_MAX_BYTES = 1048576;

const QUOTE = 0x22; // '"' must always be escaped inside a JSON string
const REVERSE_SOLIDUS = 0x5c; // '\' must always be escaped inside a JSON string
const HEX = '0123456789abcdef';

// Escape text for each U+0000..U+001F control code unit: the five JSON
// short escapes where defined, otherwise the six-character lowercase
// \u00xx form required by RFC 8785 / JSON.stringify.
const CONTROL_ESCAPES = new Array(0x20).fill(null);
CONTROL_ESCAPES[0x08] = '\\b';
CONTROL_ESCAPES[0x09] = '\\t';
CONTROL_ESCAPES[0x0a] = '\\n';
CONTROL_ESCAPES[0x0c] = '\\f';
CONTROL_ESCAPES[0x0d] = '\\r';
for (let c = 0; c < 0x20; c += 1) {
  if (CONTROL_ESCAPES[c] === null) {
    CONTROL_ESCAPES[c] = '\\u00' + HEX[c >> 4] + HEX[c & 0xf];
  }
}

/**
 * Encode `value` as a canonical JSON string literal in UTF-8 bytes.
 *
 * @param {string} value - primitive string of well-formed UTF-16
 * @param {number} [maxCodeUnits=DEFAULT_MAX_CODE_UNITS] - code-unit limit
 *   forwarded to `assertValidUnicode` (default 2^20)
 * @param {number} [maxBytes=DEFAULT_MAX_BYTES] - positive safe integer
 *   limit on encoded bytes including quotes (default 2^20)
 * @returns {Buffer} the complete canonical JSON string, quotes included
 * @throws {TypeError} if `value` is not a primitive string
 * @throws {RangeError} if a limit is invalid or the code-unit length,
 *   UTF-16 pairing, or encoded byte length exceeds it
 */
export function encodeCanonicalString(
  value,
  maxCodeUnits = DEFAULT_MAX_CODE_UNITS,
  maxBytes = DEFAULT_MAX_BYTES,
) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new RangeError('encodeCanonicalString: maxBytes must be a positive safe integer');
  }
  // Primitive-type, code-unit-length and surrogate-pair validation.
  assertValidUnicode(value, maxCodeUnits);

  // Growable byte sink whose capacity never exceeds maxBytes. Only written
  // bytes are ever read, so allocUnsafe is deterministic in effect.
  let out = Buffer.allocUnsafe(Math.min(maxBytes, 64));
  let used = 0;

  // Reserve `pieceBytes` more bytes of encoded output, throwing before
  // writing anything once the budget would be exceeded.
  const reserve = (pieceBytes) => {
    const needed = used + pieceBytes;
    if (needed > maxBytes) {
      throw new RangeError(
        `encodeCanonicalString: encoded length would exceed maxBytes ${maxBytes}`,
      );
    }
    if (needed > out.length) {
      const grown = Buffer.allocUnsafe(Math.min(maxBytes, Math.max(needed, out.length * 2)));
      grown.set(out.subarray(0, used));
      out = grown;
    }
  };

  const writeAscii = (text) => {
    reserve(text.length);
    out.write(text, used); // ASCII-only text; UTF-8 bytes equal its code units
    used += text.length;
  };

  // Leading quote.
  reserve(1);
  out[used] = QUOTE;
  used += 1;

  for (let i = 0; i < value.length; ) {
    const unit = value.charCodeAt(i);
    i += 1;
    if (unit < 0x20) {
      writeAscii(CONTROL_ESCAPES[unit]);
    } else if (unit === QUOTE || unit === REVERSE_SOLIDUS) {
      writeAscii('\\' + String.fromCharCode(unit));
    } else if (unit < 0x80) {
      reserve(1);
      out[used] = unit;
      used += 1;
    } else if (unit >= 0xd800 && unit <= 0xdbff) {
      // assertValidUnicode guarantees that a low surrogate follows here.
      const low = value.charCodeAt(i);
      i += 1;
      const codePoint = 0x10000 + ((unit - 0xd800) << 10) + (low - 0xdc00);
      reserve(4);
      out[used] = 0xf0 | (codePoint >> 18);
      out[used + 1] = 0x80 | ((codePoint >> 12) & 0x3f);
      out[used + 2] = 0x80 | ((codePoint >> 6) & 0x3f);
      out[used + 3] = 0x80 | (codePoint & 0x3f);
      used += 4;
    } else if (unit < 0x800) {
      reserve(2);
      out[used] = 0xc0 | (unit >> 6);
      out[used + 1] = 0x80 | (unit & 0x3f);
      used += 2;
    } else {
      // 0x800..0xffff; unpaired surrogates cannot occur (validated above).
      reserve(3);
      out[used] = 0xe0 | (unit >> 12);
      out[used + 1] = 0x80 | ((unit >> 6) & 0x3f);
      out[used + 2] = 0x80 | (unit & 0x3f);
      used += 3;
    }
  }

  // Trailing quote.
  reserve(1);
  out[used] = QUOTE;
  used += 1;

  // Exact-length copy: the result shares no backing memory with the growth
  // buffer and contains only the canonical bytes.
  return Buffer.from(out.subarray(0, used));
}
