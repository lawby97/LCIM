/**
 * Sprint 09 tests: V1 compatibility version detection.
 *
 * The detector classifies deterministically: SUPPORTED_V1 (ledger or
 * handoff payload), UNSUPPORTED_LEGACY_VARIANT (fail closed — never
 * best-effort), or NOT_V1 (not recognizable V1 evidence). Detection is by
 * evidence FORM, not origin: a payload that is also V2-schema-valid is
 * still a supported V1 handoff form when read through this reader;
 * provenance is applied by the caller (V1_COMPAT), never implied.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectV1Version,
  V1_COMPATIBILITY_STATE,
  SUPPORTED_V1_VERSION,
  V1_SOURCE_KIND,
  UNKNOWN_V1,
} from '../../../src/compat/v1/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'compat', 'v1');

const SUPPORTED = V1_COMPATIBILITY_STATE.SUPPORTED_V1;
const UNSUPPORTED = V1_COMPATIBILITY_STATE.UNSUPPORTED_LEGACY_VARIANT;
const NOT_V1 = V1_COMPATIBILITY_STATE.NOT_V1;

function readRaw(rel) {
  return fs.readFileSync(path.join(FIXTURES, rel), 'utf8');
}

test('SUPPORTED_V1 ledger (JSON array encoding) is detected deterministically', () => {
  const d = detectV1Version(readRaw('ledger/valid-lifecycle.json'));
  assert.equal(d.state, SUPPORTED);
  assert.equal(d.kind, V1_SOURCE_KIND.LEDGER);
  assert.equal(d.version, SUPPORTED_V1_VERSION);
  assert.equal(d.detail.encoding, 'array');
});

test('SUPPORTED_V1 ledger (JSONL encoding) is detected deterministically', () => {
  const d = detectV1Version(readRaw('ledger/hash-chain.txt'));
  assert.equal(d.state, SUPPORTED);
  assert.equal(d.kind, V1_SOURCE_KIND.LEDGER);
  assert.equal(d.detail.encoding, 'jsonl');
});

test('a single-object strict payload with ledger markers is a one-event ledger', () => {
  const oneEvent =
    '{"schemaName":"lcim.v1.ledger-event","schemaVersion":"1.0.0","v1Version":"1.0","seq":1,"eventKind":"ASSIGNMENT","workUnitId":"w-1","occurredAt":"2025-01-01T00:00:00Z","prevDigest":"0000000000000000000000000000000000000000000000000000000000000000","digest":"0000000000000000000000000000000000000000000000000000000000000000","assignment":{"summary":"x"}}';
  const d = detectV1Version(oneEvent);
  assert.equal(d.state, SUPPORTED);
  assert.equal(d.kind, V1_SOURCE_KIND.LEDGER);
  assert.equal(d.detail.encoding, 'single-object');
});

test('SUPPORTED_V1 handoff: PATCH_READY worker claim', () => {
  const d = detectV1Version(readRaw('handoff/patch-ready-handoff.txt'));
  assert.equal(d.state, SUPPORTED);
  assert.equal(d.kind, V1_SOURCE_KIND.HANDOFF);
  assert.deepEqual(d.detail.markers, ['workerStatus']);
});

test('SUPPORTED_V1 handoff: legacy V1 evidence fields are strong markers', () => {
  const d = detectV1Version(readRaw('handoff/legacy-evidence-array.txt'));
  assert.equal(d.state, SUPPORTED);
  assert.equal(d.kind, V1_SOURCE_KIND.HANDOFF);
  assert.ok(d.detail.markers.includes('evidence'));
  assert.ok(d.detail.markers.includes('baseSha'));
  assert.ok(d.detail.markers.includes('testLogPath') === false); // absent here
});

test('SUPPORTED_V1 handoff: unknown status with V1 context is a supported (schema-invalid) instance', () => {
  const d = detectV1Version(readRaw('handoff/schema-invalid-status.txt'));
  assert.equal(d.state, SUPPORTED);
  assert.equal(d.kind, V1_SOURCE_KIND.HANDOFF);
  assert.ok(d.detail.markers.includes('patchHash')); // legacy field is a strong marker
});

test('SUPPORTED_V1 handoff: unknown status with only context fields is schema-invalid-expected', () => {
  const d = detectV1Version('{"workUnitId":"w-1","workerStatus":"DEFINITELY_READY","summary":"s"}');
  assert.equal(d.state, SUPPORTED);
  assert.equal(d.kind, V1_SOURCE_KIND.HANDOFF);
  assert.equal(d.detail.schemaInvalidExpected, true);
});

test('SUPPORTED_V1 handoff: fenced and prose-wrapped responses record their encoding', () => {
  const fenced = detectV1Version(readRaw('response/fenced-response.txt'));
  assert.equal(fenced.state, SUPPORTED);
  assert.equal(fenced.detail.encoding, 'fence');
  const prose = detectV1Version(readRaw('response/prose-wrapped-response.txt'));
  assert.equal(prose.state, SUPPORTED);
  assert.equal(prose.detail.encoding, 'prose-wrapped');
});

test('a payload that is also V2-valid is still a supported V1 handoff FORM (provenance is caller-applied)', () => {
  const v2Shaped = JSON.stringify({
    workUnitId: 'lcim_wu_0123456789abcdef0123456789abcdef',
    workerStatus: 'WORK_COMPLETE',
    summary: 'V2-shaped payload read as V1 evidence.',
    acceptanceClaims: [{ claim: 'c', evidenceRefs: ['ref://1'] }],
  });
  const d = detectV1Version(v2Shaped);
  assert.equal(d.state, SUPPORTED);
  assert.equal(d.kind, V1_SOURCE_KIND.HANDOFF);
});

test('UNSUPPORTED_LEGACY_VARIANT: unsupported v1Version', () => {
  const d = detectV1Version(readRaw('ledger/unsupported-v1-version.txt'));
  assert.equal(d.state, UNSUPPORTED);
  assert.match(d.reason, /0\.9/);
});

test('UNSUPPORTED_LEGACY_VARIANT: later event with unsupported v1Version (mixed-version history)', () => {
  const events = JSON.parse(readRaw('ledger/valid-lifecycle.json'));
  const mixed = events.map((ev, i) => (i === 1 ? { ...ev, v1Version: '0.9' } : ev));
  const d = detectV1Version(JSON.stringify(mixed));
  assert.equal(d.state, UNSUPPORTED);
  assert.match(d.reason, /mixed-version history/);
});

test('UNSUPPORTED_LEGACY_VARIANT: later event with a different schema family marker', () => {
  const events = JSON.parse(readRaw('ledger/valid-lifecycle.json'));
  const mixed = events.map((ev, i) => (i === 2 ? { ...ev, schemaName: 'lcim.event' } : ev));
  const d = detectV1Version(JSON.stringify(mixed));
  assert.equal(d.state, UNSUPPORTED);
  assert.match(d.reason, /mixed\/incompatible schema markers/);
});

test('UNSUPPORTED_LEGACY_VARIANT: later event missing the version/schema markers', () => {
  const events = JSON.parse(readRaw('ledger/valid-lifecycle.json'));
  const { v1Version: _v1, schemaName: _s, ...stripped } = events[1];
  const mixed = [events[0], stripped, events[2]];
  const d = detectV1Version(JSON.stringify(mixed));
  assert.equal(d.state, UNSUPPORTED);
  assert.match(d.reason, /missing the supported v1\.0 version\/schema markers/);
});

test('UNSUPPORTED_LEGACY_VARIANT: unknown event kind inside a 1.0-marked ledger', () => {
  const d = detectV1Version(readRaw('ledger/unsupported-event-kind.txt'));
  assert.equal(d.state, UNSUPPORTED);
  assert.match(d.reason, /MAGIC_ACTION/);
});

test('UNSUPPORTED_LEGACY_VARIANT: unmarked ledger-like events are never best-effort parsed', () => {
  const d = detectV1Version(readRaw('ledger/unmarked-ledger-like.txt'));
  assert.equal(d.state, UNSUPPORTED);
  assert.match(d.reason, /unmarked legacy variant/);
});

test('UNSUPPORTED_LEGACY_VARIANT: unknown worker status with no other V1 markers', () => {
  const d = detectV1Version('{"workerStatus":"SUMMONED"}');
  assert.equal(d.state, UNSUPPORTED);
});

test('NOT_V1: empty/non-text inputs', () => {
  assert.equal(detectV1Version('').state, NOT_V1);
  assert.equal(detectV1Version('   \n ').state, NOT_V1);
  assert.equal(detectV1Version(42).state, NOT_V1);
  assert.equal(detectV1Version(null).state, NOT_V1);
});

test('NOT_V1: unrelated JSON', () => {
  assert.equal(detectV1Version('{"foo": 1}').state, NOT_V1);
  assert.equal(detectV1Version('"just a string"').state, NOT_V1);
  assert.equal(detectV1Version('[1, 2, 3]').state, NOT_V1);
});

test('NOT_V1: native V2 ledger events are not V1 evidence', () => {
  const v2Event = JSON.stringify({ schemaName: 'lcim.event', schemaVersion: '1.0.0', seq: 1 });
  assert.equal(detectV1Version(v2Event).state, NOT_V1);
});

test('NOT_V1: unparseable response text', () => {
  assert.equal(detectV1Version(readRaw('response/malformed-response.txt')).state, NOT_V1);
});

test('detection is deterministic and pure: identical input yields identical results', () => {
  const text = readRaw('ledger/valid-lifecycle.json');
  assert.deepEqual(detectV1Version(text), detectV1Version(text));
});

test('every supported ledger fixture keeps every event\'s version/schema markers consistent', () => {
  for (const rel of ['ledger/valid-lifecycle.json', 'ledger/hash-chain.txt', 'ledger/incomplete-ledger.txt']) {
    const d = detectV1Version(readRaw(rel));
    assert.equal(d.state, SUPPORTED, rel);
    assert.equal(d.kind, V1_SOURCE_KIND.LEDGER, rel);
  }
});

test('UNKNOWN_V1 reserved sentinel is exported exactly once', () => {
  assert.equal(UNKNOWN_V1, 'UNKNOWN_V1');
});
