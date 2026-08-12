/**
 * Sprint 02 tests: prompt contract (no forced-success language).
 *
 * Acceptance hook: prompt tests demonstrate no forced-success language —
 * prompts explicitly permit BLOCKED/FAILED/NO_CHANGE, require factual
 * uncertainty reporting, forbid PATCH_READY/controller dispositions and
 * V1 objective-evidence fields, and mandate exactly one JSON object.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROMPT_DIR = path.join(ROOT, 'prompts', 'deepseek');

const PROMPT_FILES = [
  'README.md',
  'WORKER_RESPONSE_CONTRACT.md',
  'worker.system.md',
];

/** Forced-success language: pressure to succeed or to hide difficulty. */
const FORCED_SUCCESS_PATTERNS = [
  /\byou must (succeed|complete|finish|deliver)\b/i,
  /\b(always|never fail to) (succeed|complete|finish)\b/i,
  /\bmust not (report|say|return|claim) (BLOCKED|FAILED|NO_CHANGE|blocked|failed)\b/i,
  /\bnever (report|say|return|claim) (BLOCKED|FAILED|NO_CHANGE|blocked|failed)\b/i,
  /\bdo not (report|say|return|claim) (BLOCKED|FAILED|NO_CHANGE|blocked|failed)\b/i,
  /\bdon['’]t (report|say|return|claim) (BLOCKED|FAILED|NO_CHANGE|blocked|failed)\b/i,
  /\b(blocked|failed) (is|are) not (an )?acceptable\b/i,
  /\bfailure (is|was) not an option\b/i,
  /\bsuccess (is|was) required\b/i,
  /\bno (failures|failure) (allowed|permitted|tolerated)\b/i,
  /\byou must never (say|report|return) that you (failed|are blocked)\b/i,
];

function readPrompt(file) {
  return fs.readFileSync(path.join(PROMPT_DIR, file), 'utf8');
}

test('prompt files exist', () => {
  for (const file of PROMPT_FILES) {
    assert.ok(fs.existsSync(path.join(PROMPT_DIR, file)), `missing prompt file: ${file}`);
  }
});

test('prompts contain no forced-success language', () => {
  for (const file of PROMPT_FILES) {
    const text = readPrompt(file);
    for (const re of FORCED_SUCCESS_PATTERNS) {
      assert.doesNotMatch(text, re, `${file} contains forced-success language: ${re}`);
    }
  }
});

test('prompts explicitly permit every worker status including BLOCKED/FAILED/NO_CHANGE', () => {
  const contract = readPrompt('WORKER_RESPONSE_CONTRACT.md');
  const system = readPrompt('worker.system.md');
  for (const status of ['WORK_COMPLETE', 'BLOCKED', 'FAILED', 'NO_CHANGE']) {
    assert.ok(contract.includes(status), `contract must mention ${status}`);
    assert.ok(system.includes(status), `system prompt must mention ${status}`);
  }
  // difficulty reporting is framed as correct behavior
  assert.match(system, /Reporting them is good work, not failure/i);
  assert.match(contract, /Reporting difficulty is fully\s+acceptable/i);
});

test('prompts require factual uncertainty reporting', () => {
  for (const file of ['WORKER_RESPONSE_CONTRACT.md', 'worker.system.md']) {
    const text = readPrompt(file);
    assert.ok(text.includes('uncertainty'), `${file} must require uncertainty reporting`);
    assert.match(text, /uncertainty/i);
    assert.match(text, /never hide uncertainty|hidden|Factual uncertainty/i);
  }
});

test('prompts never instruct the worker to emit PATCH_READY or controller dispositions', () => {
  for (const file of PROMPT_FILES) {
    const text = readPrompt(file);
    // PATCH_READY may appear ONLY inside a paragraph that also states a
    // prohibition ("never …"); any other mention would be an instruction.
    const paragraphs = text.split(/\n\s*\n/);
    const outsideProhibition = paragraphs
      .filter((p) => !/\bnever\b/i.test(p))
      .join('\n');
    assert.equal(
      outsideProhibition.includes('PATCH_READY'),
      false,
      `${file}: PATCH_READY appears outside a prohibition paragraph`,
    );
    // controller dispositions never appear as reportable values
    for (const disposition of ['PATCH_VALID', 'SEMANTICALLY_ACCEPTED', 'CANDIDATE_INTEGRATED', 'REVIEW_APPROVED']) {
      assert.equal(text.includes(disposition), false, `${file} must not mention ${disposition}`);
    }
  }
});

test('prompts mandate exactly one JSON object', () => {
  const contract = readPrompt('WORKER_RESPONSE_CONTRACT.md');
  const system = readPrompt('worker.system.md');
  assert.match(contract, /exactly ONE JSON object|exactly one JSON object/i);
  assert.match(system, /exactly ONE JSON object|exactly one JSON object/i);
  assert.match(contract, /Never more than one JSON object/i);
  assert.match(system, /never more than one JSON object/i);
});

test('prompts forbid V1 objective-evidence fields in the response', () => {
  for (const file of ['WORKER_RESPONSE_CONTRACT.md', 'worker.system.md']) {
    const text = readPrompt(file);
    // changed files / patch hashes / SHAs / test logs / exit status /
    // secret scans / integration status are explicitly forbidden
    assert.match(text, /changed-file|changed files/i, file);
    assert.match(text, /patch hash/i, file);
    assert.match(text, /SHAs?/i, file);
    assert.match(text, /test-log|test log/i, file);
    assert.match(text, /exit status/i, file);
    assert.match(text, /secret-scan|secret scan/i, file);
    assert.match(text, /integration status/i, file);
  }
});

test('prompts state that acceptance is decided only by the controller', () => {
  const contract = readPrompt('WORKER_RESPONSE_CONTRACT.md');
  const system = readPrompt('worker.system.md');
  assert.match(contract, /decided only by the controller/i);
  assert.match(system, /controller decisions?/i);
});

test('prompts are public-safe: no secret values, transcripts, or evidence placeholders', () => {
  const all = PROMPT_FILES.map(readPrompt).join('\n');
  // actual secret patterns (the words themselves may appear only inside
  // prohibitions, so scan for value shapes instead)
  assert.doesNotMatch(all, /(api[_-]?key|password|secret)\s*[:=]\s*\S+/i);
  assert.doesNotMatch(all, /sk-[A-Za-z0-9]{8,}/);
  assert.doesNotMatch(all, /BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY/);
  assert.doesNotMatch(all, /transcript/i);
  assert.doesNotMatch(all, /\bAKIA[0-9A-Z]{16}\b/);
});
