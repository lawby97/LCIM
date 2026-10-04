// tests/source-checkpoint/digest.test.mjs
//
// Focused unit tests for the digest foundation unit. Run with:
//   node --test tests/source-checkpoint/digest.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { sha256, recordRef } from "../../src/source-checkpoint/digest.mjs";

// Well-established external vectors (lowercase hex).
const EMPTY_HEX =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const ABC_HEX =
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const FOX_HEX =
  "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592";
const HELLO_HEX =
  "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
const SINGLE_NUL_BYTE_HEX =
  "6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d";

test("sha256(): empty input matches the NIST empty vector", () => {
  assert.equal(sha256(new Uint8Array(0)), EMPTY_HEX);
  assert.equal(sha256(Buffer.alloc(0)), EMPTY_HEX);
});

test("sha256(): 'abc' matches the NIST vector for Uint8Array and Buffer", () => {
  assert.equal(sha256(new TextEncoder().encode("abc")), ABC_HEX);
  assert.equal(sha256(Buffer.from("abc", "utf8")), ABC_HEX);
});

test("sha256(): known vector for a non-text binary byte", () => {
  assert.equal(sha256(Uint8Array.of(0x00)), SINGLE_NUL_BYTE_HEX);
  assert.equal(sha256(Buffer.from([0x00])), SINGLE_NUL_BYTE_HEX);
});

test("sha256(): arbitrary binary payloads hash exactly their bytes", () => {
  const binary = Uint8Array.of(0x00, 0xff, 0x80, 0x7f, 0xde, 0xad, 0x01);
  const expected = createHash("sha256").update(binary).digest("hex");
  assert.equal(sha256(binary), expected);

  // Ordering matters: the same bytes in a different order differ.
  const reversed = Uint8Array.from(binary).reverse();
  assert.notEqual(sha256(binary), sha256(reversed));
});

test("sha256(): subarray with nonzero offset hashes only its visible bytes", () => {
  const container = Uint8Array.of(0xaa, 0xbb, 0x61, 0x62, 0x63, 0xcc, 0xdd);
  const view = container.subarray(2, 5); // byteOffset 2, length 3 -> "abc"
  assert.equal(view.byteOffset, 2);
  assert.equal(view.byteLength, 3);
  assert.equal(sha256(view), ABC_HEX);
  assert.notEqual(sha256(container), ABC_HEX);

  // Buffer.from may allocate from a shared pool, so the absolute byteOffset is
  // implementation-dependent; only the subarray-relative offset is fixed.
  const buffer = Buffer.from("xxabcxx", "utf8");
  const bufferView = buffer.subarray(2, 5);
  assert.equal(bufferView.byteOffset - buffer.byteOffset, 2);
  assert.equal(sha256(bufferView), ABC_HEX);
});

test("sha256(): returns a lowercase 64-character hex digest", () => {
  const fox = "The quick brown fox jumps over the lazy dog";
  const hex = sha256(new TextEncoder().encode(fox));
  assert.equal(hex, FOX_HEX);
  assert.equal(hex.length, 64);
  assert.match(hex, /^[0-9a-f]{64}$/);
  assert.ok(!/[A-F]/.test(hex));
});

test("recordRef(): returns a detached {sha256, byteLength} record", () => {
  const bytes = new TextEncoder().encode("abc");
  const ref = recordRef(bytes);
  assert.deepEqual(Object.keys(ref).sort(), ["byteLength", "sha256"]);
  assert.equal(typeof ref.sha256, "string");
  assert.equal(ref.sha256, ABC_HEX);
  assert.match(ref.sha256, /^[0-9a-f]{64}$/);
  assert.equal(ref.byteLength, 3);

  // Detached snapshot: mutating the source afterwards cannot change it.
  bytes.fill(0x00);
  assert.equal(ref.sha256, ABC_HEX);
  assert.equal(ref.byteLength, 3);
  assert.notEqual(sha256(bytes), ABC_HEX);
});

test("recordRef(): exact byteLength for subarray views and Buffers", () => {
  const container = Uint8Array.of(1, 2, 3, 4, 5, 6);
  const view = container.subarray(1, 4); // byteOffset 1, length 3
  const viewRef = recordRef(view);
  assert.equal(viewRef.byteLength, 3);
  assert.equal(viewRef.sha256, sha256(view));

  const buffer = Buffer.from("hello", "utf8");
  const bufferRef = recordRef(buffer);
  assert.equal(bufferRef.byteLength, 5);
  assert.equal(bufferRef.sha256, HELLO_HEX);
  assert.equal(bufferRef.sha256, sha256(buffer));
});

test("recordRef(): empty input yields the empty-vector digest and zero length", () => {
  const ref = recordRef(new Uint8Array(0));
  assert.equal(ref.sha256, EMPTY_HEX);
  assert.equal(ref.byteLength, 0);
});

test("sha256() and recordRef() leave the input unchanged", () => {
  const bytes = Uint8Array.of(0x00, 0xff, 0x7f, 0x01, 0x80);
  const snapshot = Uint8Array.from(bytes);
  sha256(bytes);
  recordRef(bytes);
  assert.deepEqual(bytes, snapshot);

  const buffer = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
  const bufferSnapshot = Buffer.from(buffer);
  sha256(buffer);
  recordRef(buffer);
  assert.deepEqual(buffer, bufferSnapshot);
});

test("sha256(): rejects strings instead of implicitly encoding them", () => {
  for (const value of ["abc", "", "The quick brown fox jumps over the lazy dog"]) {
    assert.throws(() => sha256(value), TypeError);
  }
});

test("sha256(): rejects non-byte types", () => {
  const values = [
    null,
    undefined,
    0,
    42,
    NaN,
    true,
    {},
    { length: 3 },
    [],
    ["abc"],
    "abc",
    Symbol("bytes"),
    () => {},
    new ArrayBuffer(8),
    new DataView(new ArrayBuffer(8)),
    new Int8Array([1]),
    new Int16Array([1]),
    new Uint16Array([1]),
    new Float32Array([1]),
    new BigUint64Array([1n]),
  ];
  for (const value of values) {
    assert.throws(() => sha256(value), TypeError);
  }
});

test("recordRef(): rejects strings and other non-byte types", () => {
  const values = [
    "abc",
    "",
    null,
    undefined,
    7,
    true,
    {},
    [],
    new ArrayBuffer(4),
    new DataView(new ArrayBuffer(4)),
    new Int32Array([1]),
  ];
  for (const value of values) {
    assert.throws(() => recordRef(value), TypeError);
  }
  // Buffer is a Uint8Array subclass and must keep working.
  const ref = recordRef(Buffer.from("abc", "utf8"));
  assert.equal(ref.sha256, ABC_HEX);
  assert.equal(ref.byteLength, 3);
});

// ---------------------------------------------------------------------------
// Regression coverage for the digest repair. Acceptance must be by internal
// typed-array brand, and byte accounting must come from internal slots only:
// genuine values from other realms or with tampered prototypes keep working,
// look-alikes keep failing, and shadowed own byteLength/buffer/byteOffset
// properties (data or accessor, lying or throwing) are never consulted.
// Expected digests below come from external vectors or from node:crypto over
// independently built literal fixture bytes; expected byte counts are stated
// as literals and never read off the view under test.
// ---------------------------------------------------------------------------

test("sha256() and recordRef() accept genuine cross-realm Uint8Array values", () => {
  // Built inside a fresh node:vm context, so its prototype chain belongs to
  // that realm: `instanceof Uint8Array` fails here even though the value is a
  // real Uint8Array internally.
  const realmBytes = vm.runInNewContext(
    "new Uint8Array([0x61, 0x62, 0x63, 0x64, 0x65])",
  );
  assert.ok(!(realmBytes instanceof Uint8Array));

  // Independent reference: sha256 over the five literal fixture bytes.
  const expected = createHash("sha256")
    .update(Uint8Array.of(0x61, 0x62, 0x63, 0x64, 0x65))
    .digest("hex");

  assert.equal(sha256(realmBytes), expected);
  const ref = recordRef(realmBytes);
  assert.equal(ref.sha256, expected);
  assert.equal(ref.byteLength, 5);
});

test("sha256() and recordRef() accept a cross-realm subarray view", () => {
  // Cross-realm container with guard bytes; the visible window is "abc".
  const realmView = vm.runInNewContext(
    "new Uint8Array([0xaa, 0x61, 0x62, 0x63, 0xbb]).subarray(1, 4)",
  );

  assert.equal(sha256(realmView), ABC_HEX);
  const ref = recordRef(realmView);
  assert.equal(ref.sha256, ABC_HEX);
  assert.equal(ref.byteLength, 3);
});

test("sha256() and recordRef() accept genuine values with replaced prototypes, including null", () => {
  const cases = [
    ["null prototype", null],
    ["plain object prototype", {}],
    [
      "hostile byteLength accessor prototype",
      {
        get byteLength() {
          throw new Error("byteLength must not be read through the prototype");
        },
      },
    ],
    ["wrong typed-array prototype", Int8Array.prototype],
  ];
  for (const [label, proto] of cases) {
    const bytes = Uint8Array.of(0x61, 0x62, 0x63);
    Object.setPrototypeOf(bytes, proto);

    assert.equal(sha256(bytes), ABC_HEX, `sha256(): ${label}`);
    const ref = recordRef(bytes);
    assert.equal(ref.sha256, ABC_HEX, `recordRef().sha256: ${label}`);
    assert.equal(ref.byteLength, 3, `recordRef().byteLength: ${label}`);
  }
});

test("sha256() and recordRef() keep rejecting spoofed Uint8Array look-alikes", () => {
  // Plain object faking every observable shape of a Uint8Array.
  const shapeSpoof = {
    0: 0x61,
    1: 0x62,
    2: 0x63,
    length: 3,
    byteLength: 3,
    byteOffset: 0,
    buffer: Uint8Array.of(0x61, 0x62, 0x63).buffer,
    [Symbol.toStringTag]: "Uint8Array",
  };

  // Ordinary object inheriting from Uint8Array.prototype: passes instanceof
  // Uint8Array while having no typed-array internal slots at all.
  const protoSpoof = Object.create(Uint8Array.prototype);
  protoSpoof[0] = 0x61;
  protoSpoof[1] = 0x62;
  protoSpoof[2] = 0x63;
  Object.defineProperty(protoSpoof, "byteLength", { value: 3 });
  assert.ok(protoSpoof instanceof Uint8Array);

  for (const spoof of [shapeSpoof, protoSpoof]) {
    assert.throws(() => sha256(spoof), TypeError);
    assert.throws(() => recordRef(spoof), TypeError);
  }
});

test("sha256() and recordRef() keep rejecting other typed-array brands and views", () => {
  const nearMisses = [
    new Uint8ClampedArray([0x61, 0x62, 0x63]),
    new Int8Array([0x61, 0x62, 0x63]),
    new Float64Array([1, 2, 3]),
    new BigInt64Array([1n, 2n, 3n]),
    new DataView(Uint8Array.of(0x61, 0x62, 0x63).buffer),
    new ArrayBuffer(8),
  ];
  for (const value of nearMisses) {
    assert.throws(() => sha256(value), TypeError);
    assert.throws(() => recordRef(value), TypeError);
  }
});

test("sha256() and recordRef() ignore an own byteLength lying with false data", () => {
  const expectedAbc = createHash("sha256")
    .update(Uint8Array.of(0x61, 0x62, 0x63))
    .digest("hex");

  // Whole view whose own byteLength claims 9999 bytes.
  const whole = Uint8Array.of(0x61, 0x62, 0x63);
  Object.defineProperty(whole, "byteLength", {
    value: 9999,
    writable: true,
    configurable: true,
  });
  assert.equal(whole.byteLength, 9999); // the shadow is really in place
  assert.equal(sha256(whole), expectedAbc);
  const wholeRef = recordRef(whole);
  assert.equal(wholeRef.sha256, expectedAbc);
  assert.equal(wholeRef.byteLength, 3);
  assert.deepEqual(Array.from(whole), [0x61, 0x62, 0x63]);

  // Subarray view whose own byteLength claims zero visible bytes.
  const container = Uint8Array.of(0xf0, 0xf1, 0xde, 0xad, 0xbe, 0xef, 0x01, 0xf2);
  const view = container.subarray(2, 7); // real visible window: five bytes
  Object.defineProperty(view, "byteLength", {
    value: 0,
    writable: true,
    configurable: true,
  });
  assert.equal(view.byteLength, 0); // the shadow is really in place

  const expectedFive = createHash("sha256")
    .update(Uint8Array.of(0xde, 0xad, 0xbe, 0xef, 0x01))
    .digest("hex");
  assert.equal(sha256(view), expectedFive);
  const viewRef = recordRef(view);
  assert.equal(viewRef.sha256, expectedFive);
  assert.equal(viewRef.byteLength, 5);
  assert.deepEqual(Array.from(view), [0xde, 0xad, 0xbe, 0xef, 0x01]);
});

test("sha256() and recordRef() make zero byteLength getter calls on a shadowing accessor", () => {
  const bytes = Uint8Array.of(0x61, 0x62, 0x63, 0x64, 0x65); // "abcde"
  let getterCalls = 0;
  Object.defineProperty(bytes, "byteLength", {
    configurable: true,
    enumerable: false,
    get() {
      getterCalls += 1;
      throw new Error("byteLength getter was invoked by the digest unit");
    },
  });

  const expected = createHash("sha256")
    .update(Uint8Array.of(0x61, 0x62, 0x63, 0x64, 0x65))
    .digest("hex");

  assert.equal(sha256(bytes), expected);
  const ref = recordRef(bytes);
  assert.equal(ref.sha256, expected);
  assert.equal(ref.byteLength, 5);
  assert.equal(getterCalls, 0);
  assert.deepEqual(Array.from(bytes), [0x61, 0x62, 0x63, 0x64, 0x65]);
});

test("sha256() and recordRef() never consult shadowed buffer/byteOffset properties", () => {
  // Whole view: reading buffer or byteOffset at all would invoke these
  // throwing getters, so a digest and record prove neither is consulted.
  const whole = Uint8Array.of(0x61, 0x62, 0x63);
  let shadowReads = 0;
  for (const name of ["buffer", "byteOffset"]) {
    Object.defineProperty(whole, name, {
      configurable: true,
      get() {
        shadowReads += 1;
        throw new Error(`${name} getter was consulted by the digest unit`);
      },
    });
  }
  assert.equal(sha256(whole), ABC_HEX);
  const wholeRef = recordRef(whole);
  assert.equal(wholeRef.sha256, ABC_HEX);
  assert.equal(wholeRef.byteLength, 3);
  assert.equal(shadowReads, 0);

  // Subarray view: lying own data properties point at different bytes ("xyz")
  // and an offset of zero; trusting them would hash the wrong window.
  const container = Uint8Array.of(0xaa, 0x61, 0x62, 0x63, 0xbb);
  const view = container.subarray(1, 4); // visible window: "abc"
  const decoy = Uint8Array.of(0x78, 0x79, 0x7a); // "xyz" backing store
  Object.defineProperty(view, "buffer", {
    value: decoy.buffer,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(view, "byteOffset", {
    value: 0,
    writable: true,
    configurable: true,
  });
  assert.equal(view.buffer, decoy.buffer);
  assert.equal(view.byteOffset, 0);

  assert.equal(sha256(view), ABC_HEX);
  const viewRef = recordRef(view);
  assert.equal(viewRef.sha256, ABC_HEX);
  assert.equal(viewRef.byteLength, 3);
  assert.deepEqual(Array.from(view), [0x61, 0x62, 0x63]);
});

test("cross-realm subarray view: a shadowing byteLength accessor stays untouched", () => {
  const realmView = vm.runInNewContext(
    "new Uint8Array([0xaa, 0x61, 0x62, 0x63, 0xbb]).subarray(1, 4)",
  );
  let getterCalls = 0;
  Object.defineProperty(realmView, "byteLength", {
    configurable: true,
    get() {
      getterCalls += 1;
      throw new Error("byteLength getter was invoked by the digest unit");
    },
  });

  const ref = recordRef(realmView);
  assert.equal(ref.sha256, ABC_HEX);
  assert.equal(ref.byteLength, 3);
  assert.equal(getterCalls, 0);
  assert.equal(sha256(realmView), ABC_HEX);
  assert.equal(getterCalls, 0);
  assert.deepEqual(Array.from(realmView), [0x61, 0x62, 0x63]);
});
