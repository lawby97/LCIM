/** Sprint-07 static safety proofs for the manual text boundary. */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProEscalationSchema, validateProEscalation } from '../../src/sol/pro-handoff/schema.mjs';
import { MemoryClipboardAdapter } from '../../src/sol/pro-handoff/pbcopy.mjs';
import { proCopy } from '../../src/sol/pro-handoff/service.mjs';
import { captureOutput, COPIED_AT, makeEscalation, NOW } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HANDOFF_ROOT = path.join(ROOT, 'src', 'sol', 'pro-handoff');

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(full) : entry.name.endsWith('.mjs') ? [full] : [];
  });
}

test('the SOL Pro path has no network-client or remote-send implementation', () => {
  const text = sourceFiles(HANDOFF_ROOT).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(
    text,
    /\b(?:fetch|XMLHttpRequest|WebSocket|axios|undici|got\(|http\.request|https\.request|net\.connect|openai|responses\.create)\b/i,
  );
});

test('the SOL Pro path has no browser-driving or local-artifact transfer implementation', () => {
  const text = sourceFiles(HANDOFF_ROOT).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(text, /\b(?:playwright|puppeteer|selenium|chromium|webkit|setInputFiles|attachFile|uploadFile|formData\.append|openUploadDialog|openFilePicker)\b/i);
});

test('the only child-process command in the SOL Pro path is the local pbcopy adapter', () => {
  const text = sourceFiles(HANDOFF_ROOT).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  const calls = [...text.matchAll(/spawnSyncImpl\(([^,]+)/g)].map((match) => match[1].trim());
  assert.deepEqual(calls, ["'pbcopy'"]);
});

function trapGlobal(t, key) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value: () => {
      throw new Error(`${key} must not be reached by the manual SOL Pro boundary`);
    },
  });
  t.after(() => {
    if (descriptor === undefined) delete globalThis[key];
    else Object.defineProperty(globalThis, key, descriptor);
  });
}

test('pro-copy dynamically avoids network, browser, and attachment transports', async (t) => {
  const fixture = await makeEscalation(t);
  trapGlobal(t, 'fetch');
  trapGlobal(t, 'FormData');
  trapGlobal(t, 'window');
  const clipboard = new MemoryClipboardAdapter();
  await proCopy({
    cwd: fixture.repo.root,
    store: fixture.store,
    escalationId: fixture.record.escalationId,
    clipboard,
    output: captureOutput(),
    compiledAt: NOW,
    copiedAt: COPIED_AT,
  });
  assert.equal(clipboard.writes.length, 1);
});

test('the local escalation schema is a public-safe envelope and validates only local records', async (t) => {
  const schema = loadProEscalationSchema();
  assert.equal(schema.properties.schemaName.const, 'lcim.sol-pro-escalation');
  assert.equal(schema.properties.schemaVersion.const, '2.0.0');
  const fixture = await makeEscalation(t);
  const result = validateProEscalation(fixture.record);
  assert.equal(result.valid, true, result.errors.map((error) => error.message).join(' | '));
});
