/**
 * Sprint 09 tests: unsupported legacy variants and kind mismatches fail
 * clearly and safely.
 *
 * The reader never "best-effort" interprets an unknown legacy format as a
 * supported V1 version, never reinterprets one evidence form as another,
 * and never embeds raw evidence content in error messages.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readV1History,
  UnsupportedV1VersionError,
  V1CompatError,
} from '../../../src/compat/v1/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'compat', 'v1');

function readRaw(rel) {
  return fs.readFileSync(path.join(FIXTURES, rel), 'utf8');
}

test('unsupported v1Version fails clearly with the version in the reason', () => {
  assert.throws(
    () => readV1History(readRaw('ledger/unsupported-v1-version.txt')),
    (err) => {
      assert.ok(err instanceof UnsupportedV1VersionError);
      assert.equal(err.code, 'V1_UNSUPPORTED_VERSION');
      assert.match(err.message, /0\.9/);
      assert.ok(!err.message.includes('wu-0900')); // no raw event content
      return true;
    },
  );
});

test('unknown event kind inside a 1.0-marked ledger fails clearly', () => {
  assert.throws(
    () => readV1History(readRaw('ledger/unsupported-event-kind.txt')),
    (err) => err instanceof UnsupportedV1VersionError && err.code === 'V1_UNSUPPORTED_VERSION',
  );
});

test('mixed-version history (later unsupported v1Version) fails as V1_UNSUPPORTED_VERSION, not schema-invalid fallback', () => {
  const events = JSON.parse(readRaw('ledger/valid-lifecycle.json'));
  const mixed = events.map((ev, i) => (i === 1 ? { ...ev, v1Version: '2.0' } : ev));
  assert.throws(
    () => readV1History(JSON.stringify(mixed)),
    (err) => {
      assert.ok(err instanceof UnsupportedV1VersionError);
      assert.equal(err.code, 'V1_UNSUPPORTED_VERSION');
      assert.match(err.message, /mixed-version history/);
      return true;
    },
  );
  assert.throws(
    () => readV1History(JSON.stringify(mixed), { kind: 'ledger' }),
    (err) => err instanceof UnsupportedV1VersionError && err.code === 'V1_UNSUPPORTED_VERSION',
  );
});

test('unmarked ledger-like data fails clearly (no best-effort interpretation)', () => {
  assert.throws(
    () => readV1History(readRaw('ledger/unmarked-ledger-like.txt')),
    (err) => err instanceof UnsupportedV1VersionError && err.code === 'V1_UNSUPPORTED_VERSION',
  );
});

test('unparseable response text fails as NOT_V1 (V1CompatError), never guessed', () => {
  assert.throws(
    () => readV1History(readRaw('response/malformed-response.txt')),
    (err) => {
      assert.ok(err instanceof V1CompatError);
      assert.equal(err.code, 'V1_COMPAT_INVALID');
      assert.ok(!err.message.includes('unclosed brace')); // no raw content
      return true;
    },
  );
});

test('native V2 ledger evidence is NOT V1 evidence and is never reinterpreted', () => {
  const v2Event = JSON.stringify({
    schemaName: 'lcim.event',
    schemaVersion: '1.0.0',
    runId: 'lcim_run_00000000000000000000000000000000',
    seq: 1,
    kind: 'START',
    invocationId: 'lcim_inv_00000000000000000000000000000000',
    workUnitId: 'lcim_wu_00000000000000000000000000000000',
    occurredAt: '2025-01-01T00:00:00Z',
    prevDigest: '0'.repeat(64),
    digest: '0'.repeat(64),
    provider: 'deepseek',
    model: 'flash',
    role: 'WORKER',
    reasoningEffort: 'xhigh',
  });
  assert.throws(
    () => readV1History(v2Event),
    (err) => err instanceof V1CompatError && err.code === 'V1_COMPAT_INVALID',
  );
});

test('kind mismatch fails closed: a handoff requested as a ledger is refused', () => {
  assert.throws(
    () => readV1History(readRaw('handoff/patch-ready-handoff.txt'), { kind: 'ledger' }),
    (err) => {
      assert.ok(err instanceof V1CompatError);
      assert.match(err.message, /refusing to reinterpret/);
      return true;
    },
  );
});

test('kind mismatch fails closed: a ledger requested as a handoff/response is refused', () => {
  assert.throws(
    () => readV1History(readRaw('ledger/valid-lifecycle.json'), { kind: 'handoff' }),
    (err) => err instanceof V1CompatError && /refusing to reinterpret/.test(err.message),
  );
  assert.throws(
    () => readV1History(readRaw('ledger/valid-lifecycle.json'), { kind: 'response' }),
    (err) => err instanceof V1CompatError && /refusing to reinterpret/.test(err.message),
  );
});

test('an unknown kind value is rejected', () => {
  assert.throws(
    () => readV1History(readRaw('handoff/patch-ready-handoff.txt'), { kind: 'spreadsheet' }),
    (err) => err instanceof V1CompatError && /unknown V1 source kind/.test(err.message),
  );
});

test('tampered chain errors stay public-safe and deterministic', () => {
  assert.throws(
    () => readV1History(readRaw('ledger/hash-chain-tampered.txt')),
    (err) => {
      assert.equal(err.code, 'V1_HASH_CHAIN_BROKEN');
      assert.ok(!err.message.includes('(edited after the fact)'));
      assert.equal(typeof err.details.seq, 'number');
      return true;
    },
  );
});
