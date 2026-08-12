/**
 * Sprint 02 tests: strict-parse-first and recorded syntactic normalization.
 *
 * Acceptance hooks:
 * - Strict JSON, fenced JSON, and one unique prose-wrapped JSON object
 *   behave as specified and record their normalization.
 * - Ambiguous multiple JSON objects and malformed JSON remain invalid
 *   (TRANSPORT_MALFORMED).
 * - Error messages never embed the raw model text (public safety).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseWorkerResponse, NORMALIZATION } from '../../src/handoff/parse.mjs';
import { TransportParseError } from '../../src/shared/errors.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'handoffs');

function readRaw(file) {
  return fs.readFileSync(path.join(FIXTURES, file), 'utf8');
}

const WORK_UNIT = 'lcim_wu_0123456789abcdef0123456789abcdef';

test('NORMALIZATION kinds are exactly the documented syntactic normalizations', () => {
  assert.deepEqual(NORMALIZATION, ['none', 'fence', 'prose-wrapped']);
});

test('strict JSON parses with normalization "none" and exact value', () => {
  const result = parseWorkerResponse(readRaw('strict-json.txt'));
  assert.equal(result.normalization, 'none');
  assert.equal(result.extraction.method, 'strict');
  assert.equal(result.value.workUnitId, WORK_UNIT);
  assert.equal(result.value.workerStatus, 'WORK_COMPLETE');
  assert.deepEqual(result.value.remainingIssues, []);
});

test('fenced JSON (json tag) parses with normalization "fence"', () => {
  const result = parseWorkerResponse(readRaw('fenced-json.txt'));
  assert.equal(result.normalization, 'fence');
  assert.equal(result.extraction.method, 'fence');
  assert.equal(result.extraction.startLine, 2);
  assert.ok(result.extraction.content.startsWith('{'));
  assert.equal(result.value.workerStatus, 'WORK_COMPLETE');
});

test('untagged fence with JSON content parses with normalization "fence"', () => {
  const result = parseWorkerResponse(readRaw('fenced-plain.txt'));
  assert.equal(result.normalization, 'fence');
  assert.equal(result.value.workerStatus, 'NO_CHANGE');
});

test('S02-002-A: fenced object plus another JSON object after the fence is ambiguous', () => {
  assert.throws(
    () => parseWorkerResponse(readRaw('fence-plus-outside-after.txt')),
    (err) =>
      err instanceof TransportParseError &&
      err.code === 'TRANSPORT_PARSE_FAILED' &&
      err.details?.reason === 'ambiguous-json-outside-fence' &&
      err.details?.location === 'suffix',
  );
});

test('S02-002-B: JSON object before the fence plus a fenced object is ambiguous', () => {
  assert.throws(
    () => parseWorkerResponse(readRaw('outside-before-fence.txt')),
    (err) =>
      err instanceof TransportParseError &&
      err.code === 'TRANSPORT_PARSE_FAILED' &&
      err.details?.reason === 'ambiguous-json-outside-fence' &&
      err.details?.location === 'prefix',
  );
});

test('S02-002-C: one fence with harmless prose only still parses with normalization "fence"', () => {
  const result = parseWorkerResponse(readRaw('fence-with-harmless-prose.txt'));
  assert.equal(result.normalization, 'fence');
  assert.equal(result.extraction.method, 'fence');
  assert.equal(result.value.workerStatus, 'BLOCKED');
  assert.deepEqual(result.value.acceptanceClaims, []);
});

test('S02-002-D: harmless non-JSON brace fragments around a fence do not create false ambiguity', () => {
  const result = parseWorkerResponse(readRaw('fence-with-brace-fragments.txt'));
  assert.equal(result.normalization, 'fence');
  assert.equal(result.value.workerStatus, 'BLOCKED');
  assert.equal(result.value.summary, 'blocked');
});

test('one unique prose-wrapped JSON object parses with normalization "prose-wrapped"', () => {
  const result = parseWorkerResponse(readRaw('prose-wrapped.txt'));
  assert.equal(result.normalization, 'prose-wrapped');
  assert.equal(result.extraction.method, 'prose-wrapped');
  assert.equal(result.value.workerStatus, 'BLOCKED');
  assert.ok(result.value.summary.startsWith('Blocked'));
  // offsets point at the extracted object
  const raw = readRaw('prose-wrapped.txt');
  assert.equal(raw.slice(result.extraction.start, result.extraction.end + 1), JSON.stringify(result.value));
});

test('prose containing non-JSON brace fragments still yields the one unique object', () => {
  // "{the team style guide}" and "{annex B}" are prose, not JSON objects;
  // exactly one JSON object is identifiable, so the handoff is accepted.
  const result = parseWorkerResponse(readRaw('prose-with-brace-fragments.txt'));
  assert.equal(result.normalization, 'prose-wrapped');
  assert.equal(result.value.workerStatus, 'NO_CHANGE');
});

test('brace inside a JSON string is handled correctly (string-aware scan)', () => {
  const raw = `Result: {"workUnitId":"${WORK_UNIT}","workerStatus":"FAILED","summary":"brace } inside string"}`;
  const result = parseWorkerResponse(raw);
  assert.equal(result.normalization, 'prose-wrapped');
  assert.equal(result.value.summary, 'brace } inside string');
});

test('ambiguous multiple JSON objects remain invalid', () => {
  assert.throws(
    () => parseWorkerResponse(readRaw('multiple-objects.txt')),
    (err) => err instanceof TransportParseError && err.code === 'TRANSPORT_PARSE_FAILED',
  );
});

test('multiple code fences remain invalid', () => {
  assert.throws(
    () => parseWorkerResponse(readRaw('multiple-fences.txt')),
    TransportParseError,
  );
});

test('unclosed code fence remains invalid', () => {
  assert.throws(
    () => parseWorkerResponse('```json\n{"a":1}\n'),
    TransportParseError,
  );
});

test('non-JSON fence tag remains invalid', () => {
  assert.throws(
    () => parseWorkerResponse('```python\n{"workUnitId":"x"}\n```'),
    TransportParseError,
  );
});

test('malformed JSON remains invalid', () => {
  assert.throws(
    () => parseWorkerResponse(readRaw('malformed.txt')),
    TransportParseError,
  );
});

test('empty and whitespace-only responses remain invalid', () => {
  assert.throws(() => parseWorkerResponse(''), TransportParseError);
  assert.throws(() => parseWorkerResponse('   \n\t  '), TransportParseError);
  assert.throws(() => parseWorkerResponse(readRaw('empty.txt')), TransportParseError);
});

test('non-string input remains invalid', () => {
  assert.throws(() => parseWorkerResponse(undefined), TransportParseError);
  assert.throws(() => parseWorkerResponse(null), TransportParseError);
  assert.throws(() => parseWorkerResponse({ a: 1 }), TransportParseError);
});

test('strict JSON that is not an object still parses (schema layer rejects it later)', () => {
  // Parse and schema validity are separate states: a JSON array is
  // transport-parseable but schema-invalid (SCHEMA_MISMATCH at validation).
  const result = parseWorkerResponse('[1, 2, 3]');
  assert.equal(result.normalization, 'none');
  assert.deepEqual(result.value, [1, 2, 3]);
});

test('CRLF line endings do not break fence detection (whitespace-only tolerance)', () => {
  const raw = [
    'Here you go:',
    '```json',
    `{"workUnitId":"${WORK_UNIT}","workerStatus":"FAILED","summary":"crlf fence"}`,
    '```',
  ].join('\r\n');
  const result = parseWorkerResponse(raw);
  assert.equal(result.normalization, 'fence');
  assert.equal(result.value.workerStatus, 'FAILED');
});

test('parse errors never embed the raw model text', () => {
  const secretMarker = 'UNIQUE_MARKER_9f8e7d6c5b4a';
  const raw = `{${secretMarker} "broken json`;
  try {
    parseWorkerResponse(raw);
    assert.fail('expected TransportParseError');
  } catch (err) {
    assert.ok(err instanceof TransportParseError);
    assert.equal(err.message.includes(secretMarker), false, 'message must not embed raw text');
    assert.equal(JSON.stringify(err.details).includes(secretMarker), false, 'details must not embed raw text');
  }
});

test('outside-fence ambiguity errors never embed the raw model text', () => {
  const secretMarker = 'UNIQUE_MARKER_9f8e7d6c5b4a';
  const raw = [`{"a":"${secretMarker}"}`, '```json', '{"b":1}', '```'].join('\n');
  try {
    parseWorkerResponse(raw);
    assert.fail('expected TransportParseError');
  } catch (err) {
    assert.ok(err instanceof TransportParseError);
    assert.equal(err.details?.reason, 'ambiguous-json-outside-fence');
    assert.equal(err.message.includes(secretMarker), false, 'message must not embed raw text');
    assert.equal(JSON.stringify(err.details).includes(secretMarker), false, 'details must not embed raw text');
  }
});
