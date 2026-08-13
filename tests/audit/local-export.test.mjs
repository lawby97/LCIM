/** Sprint 08 focused tests: local sanitized review export. */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { reviewExport } from '../../src/reporting/index.mjs';
import { audit } from '../../src/audit/index.mjs';
import { assertNoTrackedFilesUnder, resolveRuntimeRoot } from '../../src/config/runtime-path.mjs';
import { buildAuditFixture, RAW_SINK_SAMPLES } from '../helpers/audit-fixture.mjs';

function walkFiles(dir) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) walk(file);
      else out.push(file);
    }
  };
  walk(dir);
  return out;
}

test('REVIEW.md supports workflow review using only sanitized deterministic facts', async (t) => {
  const fixture = await buildAuditFixture(t);
  const { dir, result } = await reviewExport({ cwd: fixture.repo.root });
  const md = fs.readFileSync(path.join(dir, 'REVIEW.md'), 'utf8');
  for (const heading of [
    '## Run overview', '## Calls', '## Work-unit outcomes and separated states',
    '## Rejections and transport', '## Escalation', '## Usage and cost',
    '## SOL findings', '## Ledger completeness', '## Unknown / unavailable facts',
    '## Reconciliation against canonical lifecycle evidence',
  ]) assert.match(md, new RegExp(heading.replace(/[()]/g, '\\$&')));
  assert.match(md, /total calls: \*\*19\*\*/);
  assert.match(md, /semantic acceptance.*UNKNOWN/i);
  assert.match(md, /findings\/rechecks\/survival: \*\*UNKNOWN\*\*/);
  assert.match(md, /aggregate cost: \*\*UNKNOWN\*\* \(MISSING_USAGE/);
  assert.match(md, /Reconciliation: OK/);
  assert.ok(!md.includes('SOL_DIAGNOSE finding'));
  assert.ok(!md.includes('SOL_RECHECK finding persists'));
  assert.equal(result.selection.includedRunIds.length, 9);
});

test('review export remains local and excludes raw forensic content', async (t) => {
  const fixture = await buildAuditFixture(t);
  const { dir } = await reviewExport({ cwd: fixture.repo.root });
  const files = walkFiles(dir);
  const text = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  for (const sample of RAW_SINK_SAMPLES) assert.equal(text.includes(sample), false);
  assert.equal(text.includes('raw.jsonl.gz'), false);
  assert.ok(files.every((file) => !file.endsWith('.gz') && !file.endsWith('.zip')));
  const runtimeRoot = resolveRuntimeRoot(fixture.repo.root);
  assert.ok(walkFiles(path.join(runtimeRoot, 'runs')).some((file) => file.endsWith('raw.jsonl.gz')));
  assert.ok(dir.startsWith(runtimeRoot + path.sep));
  assertNoTrackedFilesUnder(dir, fixture.repo.root);
});

test('review-export --last N follows audit selection and writes all local artifacts', async (t) => {
  const fixture = await buildAuditFixture(t);
  const { dir, files, result } = await reviewExport({ cwd: fixture.repo.root, last: 2 });
  assert.deepEqual(result.selection.includedRunIds, fixture.runs.slice(-2).map((run) => run.runId));
  assert.deepEqual(files, ['REVIEW.md', 'invocations.jsonl', 'work-units.jsonl', 'reviews.jsonl', 'usage.jsonl', 'final.json']);
  for (const file of files) assert.ok(fs.existsSync(path.join(dir, file)));
  const auditResult = await audit({ cwd: fixture.repo.root, last: 2 });
  for (const file of ['invocations.jsonl', 'work-units.jsonl', 'reviews.jsonl', 'usage.jsonl']) {
    assert.equal(fs.readFileSync(path.join(dir, file), 'utf8'), fs.readFileSync(path.join(auditResult.outDir, file), 'utf8'));
  }
});

test('review-export fails closed on invalid selection and non-git cwd', async (t) => {
  const fixture = await buildAuditFixture(t);
  for (const value of [0, -1, 1.5, '3']) await assert.rejects(() => reviewExport({ cwd: fixture.repo.root, last: value }));
  const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s08-export-nongit-'));
  t.after(() => fs.rmSync(nonGit, { recursive: true, force: true }));
  await assert.rejects(() => reviewExport({ cwd: nonGit }));
});
