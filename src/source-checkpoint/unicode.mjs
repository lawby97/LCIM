/**
 * Unicode validation foundation unit for source-checkpoint.
 *
 * This module performs no normalization and applies no coercion:
 * `assertValidUnicode` returns the exact string it received. Limits are
 * measured in UTF-16 code units (the unit of JS string `length`), not
 * UTF-8 bytes; callers of the future canonical encoder will enforce
 * their own byte limits separately.
 */

/** Default maximum accepted string length in UTF-16 code units (2^20). */
export const DEFAULT_MAX_CODE_UNITS = 1048576;

const HIGH_SURROGATE_MIN = 0xd800;
const HIGH_SURROGATE_MAX = 0xdbff;
const LOW_SURROGATE_MIN = 0xdc00;
const LOW_SURROGATE_MAX = 0xdfff;

/** RangeError subtype used only for malformed UTF-16 surrogate structure. */
export class MalformedUnicodeError extends RangeError {}

/**
 * Validate that `value` is a primitive string of well-formed UTF-16 whose
 * length in code units does not exceed `maxCodeUnits`.
 *
 * Empty strings, control characters, BMP characters, noncharacters and
 * valid supplementary pairs are all accepted. Every high surrogate must be
 * immediately followed by a low surrogate, and no unpaired low surrogate
 * may appear. The length check runs before the surrogate scan.
 *
 * @param {string} value - candidate string (must be a primitive string)
 * @param {number} [maxCodeUnits=DEFAULT_MAX_CODE_UNITS] - positive safe
 *   integer limit in UTF-16 code units
 * @returns {string} the exact original `value`
 * @throws {TypeError} if `value` is not a primitive string
 * @throws {RangeError} if `maxCodeUnits` is not a positive safe integer,
 *   if `value.length` exceeds the limit, or if the UTF-16 surrogate
 *   pairing is malformed
 */
export function assertValidUnicode(value, maxCodeUnits = DEFAULT_MAX_CODE_UNITS) {
  if (typeof value !== 'string') {
    throw new TypeError('assertValidUnicode: value must be a primitive string');
  }
  if (!Number.isSafeInteger(maxCodeUnits) || maxCodeUnits < 1) {
    throw new RangeError('assertValidUnicode: maxCodeUnits must be a positive safe integer');
  }
  if (value.length > maxCodeUnits) {
    throw new RangeError(
      `assertValidUnicode: string length ${value.length} exceeds maxCodeUnits ${maxCodeUnits}`,
    );
  }
  for (let i = 0; i < value.length; i += 1) {
    const unit = value.charCodeAt(i);
    if (unit >= HIGH_SURROGATE_MIN && unit <= HIGH_SURROGATE_MAX) {
      if (i + 1 >= value.length) {
        throw new MalformedUnicodeError(`assertValidUnicode: unpaired high surrogate at index ${i}`);
      }
      const next = value.charCodeAt(i + 1);
      if (next < LOW_SURROGATE_MIN || next > LOW_SURROGATE_MAX) {
        throw new MalformedUnicodeError(
          `assertValidUnicode: high surrogate at index ${i} is not followed by a low surrogate`,
        );
      }
      i += 1; // low surrogate already validated; skip it
    } else if (unit >= LOW_SURROGATE_MIN && unit <= LOW_SURROGATE_MAX) {
      throw new MalformedUnicodeError(`assertValidUnicode: unpaired low surrogate at index ${i}`);
    }
  }
  return value;
}
