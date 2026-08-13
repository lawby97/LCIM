/**
 * Sprint 09 tests: read-only V1 assignment-ledger parsing and historical
 * hash-chain verification.
 *
 * The reader VERIFIES the chain by recomputing digests (read-only) and
 * NEVER rewrites, repairs, or re-hashes the source. A broken chain fails
 * deterministically with V1ChainIntegrityError. Unsupported variants fail
 * with UnsupportedV1VersionError; malformed instances fail with
 * V1CompatError. Error messages never embed event bodies or response text.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseV1Ledger, readV1History } from '../../../src/compat/v1/index.mjs';
import {
  canonicalJson,
  sha256Hex,
  V1_GENESIS_DIGEST,
} from '../../../src/compat/v1/digest.mjs';
import {
  V1ChainIntegrityError,
  V1CompatError,
  UnsupportedV1VersionError,
} from '../../../src/compat/v1/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'compat', 'v1', 'ledger');

function readRaw(file) {
  return fs.readFileSync(path.join(FIXTURES, file), 'utf8');
}

/** Read-only re-verification of the fixture chain with the reader's own convention. */
function verifyChain(events) {
  let prevDigest = V1_GENESIS_DIGEST;
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    assert.equal(ev.prevDigest, prevDigest, `event ${ev.seq} prevDigest chains`);
    const { digest, ...chainable } = ev;
    assert.equal(digest, sha256Hex(canonicalJson(chainable)), `event ${ev.seq} digest matches content`);
    prevDigest = digest;
  }
}

test('valid lifecycle (JSON array) parses read-only with a valid chain', () => {
  const parsed = parseV1Ledger(readRaw('valid-lifecycle.json'));
  assert.equal(parsed.encoding, 'array');
  assert.equal(parsed.events.length, 3);
  assert.equal(parsed.chain.valid, true);
  assert.equal(parsed.chain.lastDigest, parsed.events[2].digest);
  assert.equal(parsed.workUnits.length, 1);
  assert.equal(parsed.workUnits[0].workUnitId, 'wu-0001');
  assert.equal(parsed.workUnits[0].actions.length, 1);
  verifyChain(parsed.events);
});

test('JSONL ledger parses read-only with a valid chain', () => {
  const parsed = parseV1Ledger(readRaw('hash-chain.txt'));
  assert.equal(parsed.encoding, 'jsonl');
  assert.equal(parsed.events.length, 3);
  assert.equal(parsed.chain.valid, true);
  verifyChain(parsed.events);
});

test('work units are grouped in first-appearance order', () => {
  const parsed = parseV1Ledger(readRaw('incomplete-ledger.txt'));
  assert.deepEqual(parsed.workUnits.map((wu) => wu.workUnitId), ['wu-0002', 'wu-0003']);
  assert.equal(parsed.workUnits[0].handoff.eventKind, 'HANDOFF');
  assert.equal(parsed.workUnits[0].actions.length, 0);
  assert.equal(parsed.workUnits[1].actions.length, 1);
});

test('tampered historical chain fails deterministically (content edited, digest not updated)', () => {
  assert.throws(
    () => parseV1Ledger(readRaw('hash-chain-tampered.txt')),
    (err) => {
      assert.ok(err instanceof V1ChainIntegrityError);
      assert.equal(err.code, 'V1_HASH_CHAIN_BROKEN');
      assert.equal(typeof err.details.seq, 'number');
      // error messages never embed event content or response text
      assert.ok(!err.message.includes('edited after the fact'));
      assert.ok(!err.message.includes('report module'));
      return true;
    },
  );
});

test('non-chaining prevDigest fails deterministically', () => {
  const text = readRaw('hash-chain.txt').replace(
    /"seq":3/,
    '"seq":3',
  );
  // build a broken variant: seq 2 prevDigest replaced with zeros
  const lines = text.trim().split('\n');
  const broken = lines.map((line) => {
    const ev = JSON.parse(line);
    if (ev.seq === 2) {
      return JSON.stringify({ ...ev, prevDigest: V1_GENESIS_DIGEST });
    }
    return line;
  });
  assert.throws(
    () => parseV1Ledger(broken.join('\n')),
    (err) => err instanceof V1ChainIntegrityError && err.code === 'V1_HASH_CHAIN_BROKEN',
  );
});

test('non-monotonic seq fails deterministically as a chain violation', () => {
  const lines = readRaw('hash-chain.txt').trim().split('\n');
  const events = lines.map((l) => JSON.parse(l));
  // swap seq values of events 2 and 3, keeping every other field
  const swapped = [events[0], { ...events[2], seq: events[1].seq }, { ...events[1], seq: events[2].seq }];
  assert.throws(
    () => parseV1Ledger(swapped.map((e) => JSON.stringify(e)).join('\n')),
    (err) => err instanceof V1ChainIntegrityError && err.code === 'V1_HASH_CHAIN_BROKEN',
  );
});

test('non-positive seq is a malformed instance (V1CompatError)', () => {
  const lines = readRaw('hash-chain.txt').trim().split('\n');
  const events = lines.map((l) => JSON.parse(l));
  const bad = JSON.stringify({ ...events[1], seq: 0 });
  assert.throws(
    () => parseV1Ledger([lines[0], bad, lines[2]].join('\n')),
    (err) => err instanceof V1CompatError && err.code === 'V1_COMPAT_INVALID',
  );
});

test('a correctly hashed chain beginning at seq 2 fails closed: the supported chain must begin at seq 1', () => {
  // Build a fully consistent, genesis-linked chain that starts at seq 2:
  // every prevDigest chains and every digest is recomputed correctly —
  // only the initial sequence violates the documented supported variant.
  const lines = readRaw('hash-chain.txt').trim().split('\n');
  const events = lines.map((l) => JSON.parse(l));
  const rehash = (ev) => {
    const { digest: _ignored, ...chainable } = ev;
    return { ...ev, digest: sha256Hex(canonicalJson(chainable)) };
  };
  const firstAt2 = rehash({ ...events[0], seq: 2 }); // prevDigest stays GENESIS
  const secondAt3 = rehash({ ...events[1], seq: 3, prevDigest: firstAt2.digest });
  const text = [firstAt2, secondAt3].map((e) => JSON.stringify(e)).join('\n');
  assert.throws(
    () => parseV1Ledger(text),
    (err) => {
      assert.ok(err instanceof V1ChainIntegrityError);
      assert.equal(err.code, 'V1_HASH_CHAIN_BROKEN');
      assert.match(err.message, /must begin at seq 1/);
      assert.equal(err.details.seq, 2);
      return true;
    },
  );
  // The read path surfaces the same explicit chain-integrity failure.
  assert.throws(
    () => readV1History(text),
    (err) => err instanceof V1ChainIntegrityError && err.code === 'V1_HASH_CHAIN_BROKEN',
  );
});

test('HANDOFF without response evidence violates variant rules', () => {
  const lines = readRaw('hash-chain.txt').trim().split('\n');
  const events = lines.map((l) => JSON.parse(l));
  const bad = JSON.stringify({ ...events[1], response: { text: null, responseRef: null } });
  assert.throws(
    () => parseV1Ledger([lines[0], bad, lines[2]].join('\n')),
    (err) => err instanceof V1CompatError && /response/.test(err.message),
  );
});

test('malformed JSON line fails with a line number and no raw content', () => {
  const lines = readRaw('hash-chain.txt').trim().split('\n');
  const malformed = [lines[0], '{ this is not json', lines[2]].join('\n');
  assert.throws(
    () => parseV1Ledger(malformed),
    (err) => {
      assert.ok(err instanceof V1CompatError);
      assert.match(err.message, /line 2/);
      assert.ok(!err.message.includes('this is not json'));
      return true;
    },
  );
});

test('unsupported variants fail with UnsupportedV1VersionError', () => {
  for (const file of ['unsupported-v1-version.txt', 'unsupported-event-kind.txt', 'unmarked-ledger-like.txt']) {
    assert.throws(
      () => parseV1Ledger(readRaw(file)),
      (err) => err instanceof UnsupportedV1VersionError && err.code === 'V1_UNSUPPORTED_VERSION',
      `expected UnsupportedV1VersionError for ${file}`,
    );
  }
});

test('a supported HANDOFF payload cannot be parsed as a ledger (kind mismatch fails closed)', () => {
  const payload =
    '{"workUnitId":"wu-1","workerStatus":"PATCH_READY","summary":"ready"}';
  assert.throws(
    () => parseV1Ledger(payload),
    (err) => err instanceof V1CompatError && err.code === 'V1_COMPAT_INVALID',
  );
});

test('empty ledger fails closed', () => {
  assert.throws(() => parseV1Ledger(''), (err) => err instanceof V1CompatError);
  assert.throws(() => parseV1Ledger('[]'), (err) => err instanceof V1CompatError);
});
