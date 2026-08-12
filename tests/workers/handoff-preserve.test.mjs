/**
 * Sprint 02 tests: raw-response preservation.
 *
 * The exact final raw response is preserved byte-for-byte under the runtime
 * root (canonically <git-common-dir>/lcim, never tracked); reports
 * reference the preserved file and never commit its content.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  preserveRawResponse,
  rawResponseRef,
  handoffDir,
} from '../../src/handoff/preserve.mjs';
import { ConfigError, PublicSafetyError } from '../../src/shared/errors.mjs';

const WORK_UNIT = 'lcim_wu_0123456789abcdef0123456789abcdef';
const OTHER_WORK_UNIT = 'lcim_wu_ffffffffffffffffffffffffffffffff';

function makeTmpRuntime(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s02-preserve-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('preserveRawResponse writes the exact raw bytes under runtimeRoot/handoffs/<workUnitId>/', (t) => {
  const runtime = makeTmpRuntime(t);
  const raw = '{\n  "workUnitId": "lcim_wu_0123456789abcdef0123456789abcdef",\n  "workerStatus": "NO_CHANGE",\n  "summary": "ünïcödé ☃"\n}';
  const { ref, bytes } = preserveRawResponse(runtime, WORK_UNIT, raw);
  assert.equal(ref, path.join(runtime, 'handoffs', WORK_UNIT, 'raw-response.txt'));
  assert.equal(bytes, Buffer.byteLength(raw, 'utf8'));
  assert.equal(fs.readFileSync(ref, 'utf8'), raw);
  assert.equal(fs.readFileSync(ref, 'utf8').length, raw.length);
});

test('handoffDir and rawResponseRef produce stable layout paths', (t) => {
  const runtime = makeTmpRuntime(t);
  assert.equal(
    handoffDir(runtime, WORK_UNIT),
    path.join(runtime, 'handoffs', WORK_UNIT),
  );
  assert.equal(
    rawResponseRef(runtime, WORK_UNIT),
    path.join(runtime, 'handoffs', WORK_UNIT, 'raw-response.txt'),
  );
});

test('work units keep separate preservation directories', (t) => {
  const runtime = makeTmpRuntime(t);
  preserveRawResponse(runtime, WORK_UNIT, '{"a":1}');
  preserveRawResponse(runtime, OTHER_WORK_UNIT, '{"b":2}');
  assert.equal(fs.readFileSync(rawResponseRef(runtime, WORK_UNIT), 'utf8'), '{"a":1}');
  assert.equal(fs.readFileSync(rawResponseRef(runtime, OTHER_WORK_UNIT), 'utf8'), '{"b":2}');
});

test('preservation fails closed on invalid ids and non-string raw', (t) => {
  const runtime = makeTmpRuntime(t);
  assert.throws(() => preserveRawResponse(runtime, 'not-an-id', '{}'), ConfigError);
  assert.throws(() => handoffDir(runtime, 42), ConfigError);
  assert.throws(() => preserveRawResponse(runtime, WORK_UNIT, 42), ConfigError);
  assert.throws(() => handoffDir('', WORK_UNIT), ConfigError);
});

test('preservation never writes outside the runtime root', async (t) => {
  const runtime = makeTmpRuntime(t);
  const result = preserveRawResponse(runtime, WORK_UNIT, '{}');
  // the ref must be inside the runtime root (path-wise)
  const rel = path.relative(runtime, result.ref);
  assert.ok(rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel));
  // the escape guard uses the shared Sprint-00 isPathWithin semantics
  const { isPathWithin } = await import('../../src/config/runtime-path.mjs');
  assert.equal(isPathWithin(runtime, result.ref), true);
  assert.equal(isPathWithin(runtime, path.join(runtime, '..', 'escape')), false);
});
