/** Sprint-07 focused tests: local evidence, bounded clipboard preparation, redaction. */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveGitCommonDir } from '../../src/config/runtime-path.mjs';
import { makeGitRepo } from '../helpers/git-fixture.mjs';
import { MacosPbcopyAdapter, MemoryClipboardAdapter } from '../../src/sol/pro-handoff/pbcopy.mjs';
import {
  PRO_COPY_DEFAULT_MAX_CHARACTERS,
  prepareProCopyText,
  proCopy,
} from '../../src/sol/pro-handoff/service.mjs';
import { ProEscalationStore, resolveProEscalationDir } from '../../src/sol/pro-handoff/store.mjs';
import { createProEscalation } from '../../src/sol/pro-handoff/service.mjs';
import { compileProviderContract } from '../sol/helpers.mjs';
import {
  captureOutput,
  COPIED_AT,
  makeDiagnoseInput,
  makeEscalation,
  NOW,
} from './helpers.mjs';

function status(cwd) {
  return execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' });
}

function sizedEvidenceInput(source, lengths) {
  return makeDiagnoseInput(source, {
    evidence: lengths.map((size, index) => ({
      ref: `ev.boundary.${index}`,
      kind: 'test_result',
      content: 'x'.repeat(size),
      decisionCritical: index === 0,
    })),
  });
}

async function prepareLengthFixture(t, length) {
  // Six small text excerpts leave enough legal Sprint-06 evidence budget to
  // exercise the exact outer 12k boundary without weakening per-excerpt caps.
  const source = compileProviderContract();
  const baseLengths = Array.from({ length: 6 }, () => 1);
  const base = await makeEscalation(t, {
    askInput: sizedEvidenceInput(source, baseLengths),
    sources: [source],
    context: { task: 'x' },
  });
  const preview = await prepareProCopyText({
    cwd: base.repo.root,
    store: base.store,
    escalationId: base.record.escalationId,
    compiledAt: NOW,
  });
  let remaining = length - preview.characters;
  assert.ok(remaining >= 0, `baseline ${preview.characters} must fit under ${length}`);
  const lengths = [...baseLengths];
  for (let index = 0; index < lengths.length && remaining > 0; index += 1) {
    const add = Math.min(1_600 - lengths[index], remaining);
    lengths[index] += add;
    remaining -= add;
  }
  assert.equal(remaining, 0, 'test evidence capacity must reach the requested outer boundary');
  // Each evidence content string renders exactly once, so the final render is
  // exactly baseRender + Σ(lengths[i] - baseLengths[i]) characters.
  const expected = preview.characters + lengths.reduce((sum, n, i) => sum + (n - baseLengths[i]), 0);
  assert.equal(expected, length, 'fixture must produce exactly the requested outer boundary');
  const exact = await makeEscalation(t, {
    askInput: sizedEvidenceInput(source, lengths),
    sources: [source],
    context: { task: 'x' },
  });
  return exact;
}

test('pro-copy writes one redacted plain-text value to a mock clipboard and only prints manual instructions', async (t) => {
  const fixture = await makeEscalation(t);
  const clipboard = new MemoryClipboardAdapter();
  const output = captureOutput();
  const result = await proCopy({
    cwd: fixture.repo.root,
    store: fixture.store,
    escalationId: fixture.record.escalationId,
    clipboard,
    output,
    compiledAt: NOW,
    copiedAt: COPIED_AT,
  });

  assert.equal(clipboard.writes.length, 1);
  assert.equal(clipboard.writes[0], result.text);
  assert.match(result.text, /LCIM SOL Pro manual text escalation — initial exchange/);
  assert.match(result.text, /Why does the provider_factory negative side-effect criterion fail/);
  assert.match(result.text, /LCIM_SOL_PRO_DIRECTIVE_V1/);
  assert.doesNotMatch(output.text, /LCIM SOL Pro manual text escalation/);
  assert.match(output.text, /Manually paste only that text/);
  assert.match(output.text, /has not sent a message or executed a repair/);

  const localDir = resolveProEscalationDir(fixture.repo.root, fixture.record.escalationId);
  assert.ok(localDir.startsWith(resolveGitCommonDir(fixture.repo.root)));
  assert.ok(fs.existsSync(path.join(localDir, 'record.json')));
  assert.equal(status(fixture.repo.root), '');
});

test('recognised secrets are redacted before the clipboard adapter sees text', async (t) => {
  const source = compileProviderContract();
  const secret = `sk-${'x'.repeat(32)}`;
  const input = makeDiagnoseInput(source, {
    evidence: [{
      ref: 'ev.counter.provider_factory',
      kind: 'test_result',
      content: `counter output included token=${secret} before the gate`,
      decisionCritical: true,
    }],
  });
  const fixture = await makeEscalation(t, { askInput: input, sources: [source] });
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
  assert.doesNotMatch(clipboard.writes[0], new RegExp(secret));
  assert.match(clipboard.writes[0], /\[REDACTED_SECRET\]/);
  const local = await fixture.store.load(fixture.record.escalationId);
  assert.match(local.exchanges[0].askInput.evidence[0].content, new RegExp(secret));
});

test('local paths are redacted before the clipboard adapter sees text', async (t) => {
  const source = compileProviderContract();
  const localPath = '/Users/example/private-target/src/entry.mjs';
  const input = makeDiagnoseInput(source, {
    evidence: [{
      ref: 'ev.counter.provider_factory',
      kind: 'test_result',
      content: `counter failed in ${localPath} before the gate`,
      decisionCritical: true,
    }],
  });
  const fixture = await makeEscalation(t, { askInput: input, sources: [source] });
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
  assert.doesNotMatch(clipboard.writes[0], new RegExp(localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(clipboard.writes[0], /\[REDACTED_LOCAL_PATH\]/);
});

test('file-like local evidence is refused before clipboard write', async (t) => {
  const source = compileProviderContract();
  const input = makeDiagnoseInput(source, {
    evidence: [{
      ref: 'ev.counter.provider_factory',
      kind: 'test_result',
      content: 'file:///tmp/controller-evidence.log',
      decisionCritical: true,
    }],
  });
  const fixture = await makeEscalation(t, { askInput: input, sources: [source] });
  const clipboard = new MemoryClipboardAdapter();
  await assert.rejects(
    proCopy({
      cwd: fixture.repo.root,
      store: fixture.store,
      escalationId: fixture.record.escalationId,
      clipboard,
      output: captureOutput(),
      compiledAt: NOW,
    }),
    (err) => err?.code === 'PRO_EVIDENCE_FILE_REFERENCE',
  );
  assert.equal(clipboard.writes.length, 0);
});

test('a bare file-like artifact path is refused before clipboard write', async (t) => {
  const source = compileProviderContract();
  const input = makeDiagnoseInput(source, {
    evidence: [{
      ref: 'ev.counter.provider_factory',
      kind: 'test_result',
      content: 'inspect artifacts/controller-output.jsonl locally',
      decisionCritical: true,
    }],
  });
  const fixture = await makeEscalation(t, { askInput: input, sources: [source] });
  const clipboard = new MemoryClipboardAdapter();
  await assert.rejects(
    proCopy({
      cwd: fixture.repo.root,
      store: fixture.store,
      escalationId: fixture.record.escalationId,
      clipboard,
      output: captureOutput(),
      compiledAt: NOW,
    }),
    (err) => err?.code === 'PRO_EVIDENCE_FILE_REFERENCE',
  );
  assert.equal(clipboard.writes.length, 0);
});

test('raw JSON packets, full logs, transcripts, and multi-file diffs fail closed before clipboard write', async (t) => {
  const source = compileProviderContract();
  const contents = [
    ['PRO_EVIDENCE_RAW_PACKET', '{"schemaName":"lcim.sol-ask","evidence":[]}'],
    ['PRO_EVIDENCE_FULL_LOG', Array.from({ length: 13 }, (_, index) => `2025-01-01T00:00:${String(index).padStart(2, '0')}Z failure`).join('\n')],
    ['PRO_EVIDENCE_TRANSCRIPT', 'user: first local message\nassistant: second local message'],
    ['PRO_EVIDENCE_FULL_DIFF', 'diff --git a/a b/a\n@@ -1 +1 @@\n-x\n+y\ndiff --git a/b b/b\n@@ -1 +1 @@\n-x\n+y'],
  ];
  for (const [code, content] of contents) {
    await t.test(code, async (subtest) => {
      const input = makeDiagnoseInput(source, {
        evidence: [{ ref: 'ev.counter.provider_factory', kind: 'log_summary', content, decisionCritical: true }],
      });
      const fixture = await makeEscalation(subtest, { askInput: input, sources: [source] });
      const clipboard = new MemoryClipboardAdapter();
      await assert.rejects(
        proCopy({
          cwd: fixture.repo.root,
          store: fixture.store,
          escalationId: fixture.record.escalationId,
          clipboard,
          output: captureOutput(),
          compiledAt: NOW,
        }),
        (err) => err?.code === code,
      );
      assert.equal(clipboard.writes.length, 0);
    });
  }
});

test('an arbitrary target-repository absolute path is redacted at the outbound boundary', async (t) => {
  const source = compileProviderContract();
  const localPath = '/customer-target/private/src/entry.mjs';
  const input = makeDiagnoseInput(source, {
    evidence: [{
      ref: 'ev.counter.provider_factory',
      kind: 'test_result',
      content: `counter failed in ${localPath} before the gate`,
      decisionCritical: true,
    }],
  });
  const fixture = await makeEscalation(t, { askInput: input, sources: [source] });
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
  assert.doesNotMatch(clipboard.writes[0], new RegExp(localPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(clipboard.writes[0], /\[REDACTED_LOCAL_PATH\]/);
});

test('relative local source paths are redacted before clipboard write', async (t) => {
  const source = compileProviderContract();
  const input = makeDiagnoseInput(source, {
    evidence: [{
      ref: 'ev.counter.provider_factory',
      kind: 'test_result',
      content: 'the failing branch is in src/private/provider.mjs before the gate',
      decisionCritical: true,
    }],
  });
  const fixture = await makeEscalation(t, { askInput: input, sources: [source] });
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
  assert.doesNotMatch(clipboard.writes[0], /src\/private\/provider\.mjs/);
  assert.match(clipboard.writes[0], /\[REDACTED_LOCAL_PATH\]/);
});

test('the default hard boundary accepts exactly 12,000 characters', async (t) => {
  assert.equal(PRO_COPY_DEFAULT_MAX_CHARACTERS, 12_000);
  const fixture = await prepareLengthFixture(t, 12_000);
  const clipboard = new MemoryClipboardAdapter();
  const result = await proCopy({
    cwd: fixture.repo.root,
    store: fixture.store,
    escalationId: fixture.record.escalationId,
    clipboard,
    output: captureOutput(),
    compiledAt: NOW,
    copiedAt: COPIED_AT,
  });
  assert.equal(result.characters, 12_000);
  assert.equal(clipboard.writes[0].length, 12_000);
});

test('12,001 characters fails closed before clipboard write', async (t) => {
  const fixture = await prepareLengthFixture(t, 12_001);
  const clipboard = new MemoryClipboardAdapter();
  await assert.rejects(
    proCopy({
      cwd: fixture.repo.root,
      store: fixture.store,
      escalationId: fixture.record.escalationId,
      clipboard,
      output: captureOutput(),
      compiledAt: NOW,
    }),
    (err) => err?.code === 'PRO_TEXT_LIMIT_EXCEEDED' && err.details?.limit === 12_000 && err.details?.characters === 12_001,
  );
  assert.equal(clipboard.writes.length, 0);
});

test('SOL-S07-001: 12,000 is an absolute hard maximum — no public option may exceed it', async (t) => {
  // A valid rendered payload of 12,001 characters, requested through the
  // public path with a custom limit above the absolute cap.
  const fixture = await prepareLengthFixture(t, 12_001);
  const clipboard = new MemoryClipboardAdapter();

  // maxCharacters = 100000 must be rejected outright (limit validation).
  await assert.rejects(
    proCopy({
      cwd: fixture.repo.root,
      store: fixture.store,
      escalationId: fixture.record.escalationId,
      clipboard,
      output: captureOutput(),
      maxCharacters: 100_000,
      compiledAt: NOW,
    }),
    (err) => err?.code === 'CONFIG_INVALID',
  );
  assert.equal(clipboard.writes.length, 0);

  // Even maxCharacters = 12001 (one over the cap) is rejected.
  await assert.rejects(
    prepareProCopyText({
      cwd: fixture.repo.root,
      store: fixture.store,
      escalationId: fixture.record.escalationId,
      maxCharacters: 12_001,
      compiledAt: NOW,
    }),
    (err) => err?.code === 'CONFIG_INVALID',
  );
  assert.equal(clipboard.writes.length, 0);
});

test('SOL-S07-002: transcript-like supplemental context fails closed for every context field', async (t) => {
  const source = compileProviderContract();
  for (const field of ['task', 'previousAttempt', 'controllerRejection']) {
    await t.test(field, async (subtest) => {
      const repo = await makeGitRepo(subtest);
      const store = new ProEscalationStore({ cwd: repo.root });
      await assert.rejects(
        createProEscalation({
          cwd: repo.root,
          store,
          findingId: 'lcim_finding_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          askInput: makeDiagnoseInput(source),
          sources: [source],
          context: { [field]: 'user: first local line\nassistant: second local line' },
          createdAt: NOW,
        }),
        (err) => err?.code === 'PRO_EVIDENCE_TRANSCRIPT',
      );
    });
  }
});

test('SOL-S07-002: a tampered runtime record with transcript context is rejected before clipboard', async (t) => {
  const fixture = await makeEscalation(t);
  await fixture.store.update(fixture.record.escalationId, (record) => {
    record.context.previousAttempt = 'user: first local line\nassistant: second local line';
    return record;
  });
  const clipboard = new MemoryClipboardAdapter();
  await assert.rejects(
    proCopy({
      cwd: fixture.repo.root,
      store: fixture.store,
      escalationId: fixture.record.escalationId,
      clipboard,
      output: captureOutput(),
      compiledAt: NOW,
    }),
    (err) => err?.code === 'PRO_EVIDENCE_TRANSCRIPT',
  );
  assert.equal(clipboard.writes.length, 0);
});

async function makeEscalationWithContext(t, context, evidenceContent = null) {
  const source = compileProviderContract();
  const input = evidenceContent === null
    ? makeDiagnoseInput(source)
    : makeDiagnoseInput(source, {
        evidence: [{
          ref: 'ev.counter.provider_factory',
          kind: 'test_result',
          content: evidenceContent,
          decisionCritical: true,
        }],
      });
  return makeEscalation(t, { askInput: input, sources: [source], context });
}

test('SOL-S07-004: single-component absolute paths are redacted from evidence before clipboard', async (t) => {
  for (const path of ['/tmp', '/var', '/etc', '/private', '/Users', '/home']) {
    await t.test(path, async (subtest) => {
      const fixture = await makeEscalationWithContext(
        subtest,
        { task: 'x' },
        `counter wrote scratch to ${path} before the gate`,
      );
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
      assert.doesNotMatch(clipboard.writes[0], new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.match(clipboard.writes[0], /\[REDACTED_LOCAL_PATH\]/);
    });
  }
});

test('SOL-S07-004: single-component absolute paths are redacted from supplemental context', async (t) => {
  const fixture = await makeEscalationWithContext(t, {
    task: 'x',
    previousAttempt: 'scratch files were written to /tmp before the gate',
  });
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
  assert.doesNotMatch(clipboard.writes[0], /\/tmp/);
  assert.match(clipboard.writes[0], /\[REDACTED_LOCAL_PATH\]/);
});

test('SOL-S07-004 R2: assignment-form single-component paths are redacted from evidence', async (t) => {
  const fixture = await makeEscalationWithContext(t, { task: 'x' }, 'TMPDIR=/tmp before the gate');
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
  assert.doesNotMatch(clipboard.writes[0], /\/tmp/);
  assert.match(clipboard.writes[0], /\[REDACTED_LOCAL_PATH\]/);
});

test('SOL-S07-004 R2: assignment-form single-component paths are redacted from initial supplemental context', async (t) => {
  const fixture = await makeEscalationWithContext(t, {
    task: 'x',
    previousAttempt: 'scratch=/tmp then the criterion still failed',
  });
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
  assert.doesNotMatch(clipboard.writes[0], /\/tmp/);
  assert.match(clipboard.writes[0], /\[REDACTED_LOCAL_PATH\]/);
});

test('SOL-S07-004 R2: URLs containing /tmp are never misclassified as local paths', async (t) => {
  const fixture = await makeEscalationWithContext(t, { task: 'x' }, 'see https://example.com/tmp before the gate');
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
  assert.match(clipboard.writes[0], /https:\/\/example\.com\/tmp/);
});

test('SOL-S07-004 R2: prose form "failure occurred at /tmp" remains redacted', async (t) => {
  const fixture = await makeEscalationWithContext(t, { task: 'x' }, 'failure occurred at /tmp before the gate');
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
  assert.doesNotMatch(clipboard.writes[0], /\/tmp/);
  assert.match(clipboard.writes[0], /\[REDACTED_LOCAL_PATH\]/);
});

test('SOL-S07-005: PGP private-key armor fails closed without echoing the body', async (t) => {
  const source = compileProviderContract();
  const body = 'super-secret-material';
  const pgp = `-----BEGIN PGP PRIVATE KEY BLOCK-----\n${body}\n-----END PGP PRIVATE KEY BLOCK-----`;
  const fixture = await makeEscalationWithContext(t, { task: 'x' }, pgp);
  const clipboard = new MemoryClipboardAdapter();
  await assert.rejects(
    proCopy({
      cwd: fixture.repo.root,
      store: fixture.store,
      escalationId: fixture.record.escalationId,
      clipboard,
      output: captureOutput(),
      compiledAt: NOW,
    }),
    (err) => err?.code === 'PRO_UNREDACTABLE_SECRET' && !err.message.includes(body) && !err.message.includes('PGP PRIVATE KEY'),
  );
  assert.equal(clipboard.writes.length, 0);
});

test('unredactable secret material fails closed before clipboard write without echoing it', async (t) => {
  const source = compileProviderContract();
  const marker = '-----BEGIN PRIVATE KEY-----';
  const input = makeDiagnoseInput(source, {
    evidence: [{
      ref: 'ev.counter.provider_factory',
      kind: 'test_result',
      content: `${marker}\nnot-a-real-key`,
      decisionCritical: true,
    }],
  });
  const fixture = await makeEscalation(t, { askInput: input, sources: [source] });
  const clipboard = new MemoryClipboardAdapter();
  await assert.rejects(
    proCopy({
      cwd: fixture.repo.root,
      store: fixture.store,
      escalationId: fixture.record.escalationId,
      clipboard,
      output: captureOutput(),
      compiledAt: NOW,
    }),
    (err) => err?.code === 'PRO_UNREDACTABLE_SECRET' && !err.message.includes(marker),
  );
  assert.equal(clipboard.writes.length, 0);
});

test('the macOS adapter is mockable and invokes only pbcopy with text stdin', () => {
  const calls = [];
  const adapter = new MacosPbcopyAdapter({
    spawnSyncImpl(command, args, options) {
      calls.push({ command, args, options });
      return { status: 0 };
    },
  });
  const result = adapter.writeText('bounded text');
  assert.equal(result.characters, 12);
  assert.deepEqual(calls, [{
    command: 'pbcopy',
    args: [],
    options: { input: 'bounded text', encoding: 'utf8', stdio: ['pipe', 'ignore', 'pipe'] },
  }]);
});
