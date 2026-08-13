/**
 * Sprint 09 tests: mutation protection.
 *
 * V1 historical evidence is immutable input. These tests prove, for every
 * fixture under tests/fixtures/compat/v1/, that the bytes are unchanged
 * after version detection, parsing, and compatibility projection, and that
 * no new files appear in the fixture tree. The reader is a pure
 * string-in/object-out API: it never writes, never repairs, never
 * re-hashes the source, and never appends invented events.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readV1History, detectV1Version, parseV1Ledger, V1CompatError, UnsupportedV1VersionError, V1ChainIntegrityError } from '../../../src/compat/v1/index.mjs';
import { canonicalJson, sha256Hex } from '../../../src/compat/v1/digest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'compat', 'v1');

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

function sha256Bytes(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function allFixtures() {
  return walk(FIXTURES).filter((f) => f.endsWith('.txt') || f.endsWith('.json'));
}

/** Run the full read pipeline; unsupported inputs must fail with a compat error. */
function exercise(text) {
  const detection = detectV1Version(text);
  try {
    const { projection } = readV1History(text);
    return { detection, projection };
  } catch (err) {
    assert.ok(
      err instanceof V1CompatError,
      `expected a compat error, got ${err?.constructor?.name}: ${err?.message}`,
    );
    return { detection, error: err };
  }
}

test('every fixture is byte-for-byte unchanged after detection, parsing, and projection', () => {
  const fixtures = allFixtures();
  assert.ok(fixtures.length >= 15, `expected a non-trivial fixture set, got ${fixtures.length}`);
  for (const file of fixtures) {
    const before = fs.readFileSync(file);
    const text = before.toString('utf8');
    const beforeHash = sha256Bytes(before);

    // ledger sources are additionally exercised through the raw parser
    const detection = detectV1Version(text);
    if (detection.kind === 'ledger' && detection.state === 'SUPPORTED_V1') {
      try {
        parseV1Ledger(text);
      } catch (err) {
        // A tampered chain fixture legitimately fails deterministically;
        // that failure is itself part of the read-only contract.
        assert.ok(
          err instanceof V1CompatError,
          `expected a compat error from parseV1Ledger, got ${err?.constructor?.name}: ${err?.message}`,
        );
      }
    }
    exercise(text);

    const after = fs.readFileSync(file);
    assert.deepEqual(after, before, `fixture bytes changed: ${file}`);
    assert.equal(sha256Bytes(after), beforeHash, `fixture hash changed: ${file}`);
  }
});

test('projection sourceDigest anchors the exact original bytes for every supported fixture', () => {
  const supported = [
    'ledger/valid-lifecycle.json',
    'ledger/incomplete-ledger.txt',
    'ledger/hash-chain.txt',
    'ledger/schema-invalid-handoff-manual-integration.txt',
    'ledger/missing-later-invocations.txt',
    'ledger/handoff-response-ref-only.txt',
    'handoff/valid-v1-handoff.txt',
    'handoff/patch-ready-handoff.txt',
    'handoff/schema-invalid-status.txt',
    'handoff/schema-invalid-type.txt',
    'handoff/missing-test-log-path.txt',
    'handoff/legacy-evidence-array.txt',
    'response/fenced-response.txt',
    'response/prose-wrapped-response.txt',
  ];
  for (const rel of supported) {
    const bytes = fs.readFileSync(path.join(FIXTURES, rel));
    const { projection } = readV1History(bytes.toString('utf8'));
    assert.equal(projection.sourceDigest, sha256Bytes(bytes), `sourceDigest must anchor ${rel}`);
    assert.equal(projection.sourceByteCount, bytes.length, `sourceByteCount must match ${rel}`);
  }
});

test('no new files are created anywhere under the fixture tree by the read pipeline', () => {
  const before = allFixtures();
  for (const file of before) {
    exercise(fs.readFileSync(file, 'utf8'));
  }
  const after = allFixtures();
  assert.deepEqual(after, before, 'the fixture tree must not gain or lose files');
});

test('historical ledger digests are verified read-only and still match their content', () => {
  // The reader recomputes digests to VERIFY; this test independently
  // re-verifies that the on-disk digests are genuinely consistent (i.e.
  // the fixtures are authentic chains, not self-consistent fakes).
  for (const file of ['ledger/valid-lifecycle.json', 'ledger/hash-chain.txt', 'ledger/incomplete-ledger.txt']) {
    const text = fs.readFileSync(path.join(FIXTURES, file), 'utf8');
    const parsed = parseV1Ledger(text);
    for (const ev of parsed.events) {
      const { digest, ...chainable } = ev;
      assert.equal(digest, sha256Hex(canonicalJson(chainable)), `on-disk digest of ${file} seq ${ev.seq} must match content`);
    }
  }
});

test('unsupported and tampered fixtures also remain byte-for-byte unchanged', () => {
  for (const rel of [
    'ledger/unsupported-v1-version.txt',
    'ledger/unsupported-event-kind.txt',
    'ledger/unmarked-ledger-like.txt',
    'ledger/hash-chain-tampered.txt',
    'response/malformed-response.txt',
  ]) {
    const file = path.join(FIXTURES, rel);
    const before = fs.readFileSync(file);
    assert.throws(
      () => readV1History(before.toString('utf8')),
      (err) =>
        err instanceof V1CompatError ||
        err instanceof UnsupportedV1VersionError ||
        err instanceof V1ChainIntegrityError,
      `expected a fail-closed compat error for ${rel}`,
    );
    assert.deepEqual(fs.readFileSync(file), before, `fixture bytes changed: ${rel}`);
  }
});
