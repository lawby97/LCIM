// src/source-checkpoint/digest.mjs
//
// Foundation hashing unit for the source-checkpoint subsystem.
//
// Deliberately minimal scope for this unit:
//   * sha256(bytes)    -> lowercase 64-character hex SHA-256 of the exact bytes
//   * recordRef(bytes) -> detached { sha256, byteLength } reference record
//
// This unit performs no filesystem I/O, no self-digest bookkeeping, no
// exclusion rules, and no canonical encoding. It imports only Node built-ins
// (node:crypto and node:util) and no project modules.

import { createHash } from "node:crypto"
import { types } from "node:util"

const ALGORITHM = "sha256"

// Brand check: util.types.isUint8Array tests the value's internal
// typed-array identity rather than its prototype chain, so genuine
// Uint8Array values created in other realms (such as node:vm contexts) and
// values whose prototype was replaced still pass, while other typed arrays
// (Int8Array, Uint8ClampedArray, Float64Array, ...), DataView, ArrayBuffer,
// and spoofed plain objects that only fake byteLength/buffer/byteOffset
// properties fail.
const { isUint8Array } = types

// Byte-length source: %TypedArray%.prototype.byteLength reads the
// [[ByteLength]] internal slot of its receiver, so capture that intrinsic
// accessor once at module load. recordRef must never read `bytes.byteLength`
// as an ordinary property: untrusted input can install own data properties
// or accessors under that name, and an ordinary read would even invoke such
// an accessor. The captured accessor reads internal slots only (no user code
// runs) and works across realms and prototype tampering.
const intrinsicByteLengthGetter = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  "byteLength",
).get
const intrinsicApply = Reflect.apply

function visibleByteLength(bytes) {
  return intrinsicApply(intrinsicByteLengthGetter, bytes, [])
}

function requireBytes(value, api) {
  if (!isUint8Array(value)) {
    const received =
      value === null
        ? "null"
        : Array.isArray(value)
          ? "array"
          : typeof value
    throw new TypeError(
      `${api}() expects a Buffer or Uint8Array, received ${received}`,
    )
  }
}

/**
 * Lowercase hex SHA-256 digest of the exact bytes in `bytes`.
 *
 * Accepts Buffer or Uint8Array from any realm, including subarray views with
 * a nonzero byteOffset and values whose prototype was replaced. Strings and
 * other non-byte values are rejected rather than implicitly re-encoded. The
 * view's own byteLength/buffer/byteOffset properties are never read or
 * invoked; hashing operates on the view's backing-store bytes directly.
 *
 * @param {Buffer|Uint8Array} bytes bytes to hash
 * @returns {string} lowercase 64-character hex digest
 */
export function sha256(bytes) {
  requireBytes(bytes, "sha256")
  return createHash(ALGORITHM).update(bytes).digest("hex")
}

/**
 * Detached { sha256, byteLength } reference over the exact bytes in `bytes`.
 *
 * The returned object is a plain snapshot of primitives; mutating `bytes`
 * afterwards does not change it. `byteLength` comes from the view's internal
 * typed-array slots (never from user-visible properties) and reflects the
 * exact visible length (for subarray views, the visible portion only), so it
 * always agrees with the bytes actually hashed.
 *
 * @param {Buffer|Uint8Array} bytes bytes to reference
 * @returns {{ sha256: string, byteLength: number }} detached reference record
 */
export function recordRef(bytes) {
  requireBytes(bytes, "recordRef")
  return { sha256: sha256(bytes), byteLength: visibleByteLength(bytes) }
}
