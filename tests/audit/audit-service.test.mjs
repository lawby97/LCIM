/**
 * Sprint 08 focused tests: audit service/API (`audit --last N`).
 *
 * Covers deterministic last-N selection, local (never-tracked) output,
 * fail-closed argument validation, invalid-run handling, and empty-store
 * behavior. CLI wiring is Sprint 10 — this module only tests the service.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { audit } from '../../src/audit/index.mjs';
import { ConfigError, RuntimePathError } from '../../src/shared/errors.mjs';
import { assertNoTrackedFilesUnder, resolveRuntimeRoot } from '../../src/config/runtime-path.mjs';
import { makeGitRepo } from '../helpers/git-fixture.mjs';
import { RunStore } from '../../src/runtime/run-store.mjs';
import { TEST_TARGET_SHA, TEST_CONFIG_DIGEST } from '../helpers/logging-fixture.mjs';
import { buildAuditFixture, FIXTURE_SCENARIOS } from '../helpers/audit-fixture.mjs';

/** runId of the fixture run with the given scenario id. */
function runForScenario(fixture, scenarioId) {
  const run = fixture.runs.find((r) => r.scenarioId === scenarioId);
  assert.ok(run, `fixture missing scenario ${scenarioId}`);
  return run;
}

test('audit --last N selects the N most recent runs by createdAt, deterministically', async (t) => {
  const fixture = await buildAuditFixture(t);
  const all = fixture.runs.map((r) => r.runId);
  const lastThree = fixture.runs.slice(-3).map((r) => r.runId);

  const allResult = await audit({ cwd: fixture.repo.root });
  assert.deepEqual(allResult.result.selection.includedRunIds, all);
  assert.equal(allResult.result.selection.outOfWindowRunIds.length, 0);

  const last3 = await audit({ cwd: fixture.repo.root, last: 3 });
  assert.deepEqual(last3.result.selection.includedRunIds, lastThree);
  assert.deepEqual(last3.result.selection.outOfWindowRunIds, all.slice(0, 6));

  const last1 = await audit({ cwd: fixture.repo.root, last: 1 });
  assert.deepEqual(last1.result.selection.includedRunIds, [fixture.runs[8].runId]);

  const last99 = await audit({ cwd: fixture.repo.root, last: 99 });
  assert.deepEqual(last99.result.selection.includedRunIds, all);

  // Deterministic across invocations.
  const again = await audit({ cwd: fixture.repo.root, last: 3 });
  assert.deepEqual(again.result.selection.includedRunIds, lastThree);

  // The selected runs are exactly the latest scenarios.
  const selectedScenarios = lastThree.map((id) => fixture.runs.find((r) => r.runId === id).scenarioId);
  assert.deepEqual(selectedScenarios, FIXTURE_SCENARIOS.slice(-3).map((s) => s.id));
});

test('audit writes the five projection files locally under the Git common dir', async (t) => {
  const fixture = await buildAuditFixture(t);
  const { result, outDir, files } = await audit({ cwd: fixture.repo.root });
  assert.deepEqual(files, ['invocations.jsonl', 'work-units.jsonl', 'reviews.jsonl', 'usage.jsonl', 'final.json']);
  for (const f of files) {
    assert.ok(fs.existsSync(path.join(outDir, f)), `missing ${f}`);
  }
  // Output lives under the runtime root (Git common dir) — never tracked.
  assert.ok(outDir.startsWith(resolveRuntimeRoot(fixture.repo.root) + path.sep));
  assertNoTrackedFilesUnder(outDir, fixture.repo.root);
  // final.json is the full audit result.
  const finalJson = JSON.parse(fs.readFileSync(path.join(outDir, 'final.json'), 'utf8'));
  assert.equal(finalJson.schemaName, 'lcim.audit.final');
  assert.deepEqual(finalJson.metrics, result.metrics);
});

test('audit fails closed on invalid last parameters and non-git cwd', async (t) => {
  const fixture = await buildAuditFixture(t);
  for (const bad of [0, -1, -5, 1.5, '3', NaN]) {
    await assert.rejects(() => audit({ cwd: fixture.repo.root, last: bad }), ConfigError, `last=${String(bad)} must be rejected`);
  }
  const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s08-nongit-'));
  t.after(() => fs.rmSync(nonGit, { recursive: true, force: true }));
  await assert.rejects(() => audit({ cwd: nonGit }), RuntimePathError);
});

test('audit reports invalid run stores and excludes them without fabricating projections', async (t) => {
  const fixture = await buildAuditFixture(t);
  // Corrupt one run store: append a garbage line to its ledger.
  const target = runForScenario(fixture, 'accepted-first-pass');
  const ledgerPath = path.join(resolveRuntimeRoot(fixture.repo.root), 'runs', target.runId, 'events.v2.jsonl');
  const before = fs.readFileSync(ledgerPath, 'utf8');
  fs.appendFileSync(ledgerPath, '{"garbage": true}\n');

  const { result, projections } = await audit({ cwd: fixture.repo.root });
  assert.deepEqual(result.selection.invalidRunIds, [target.runId]);
  assert.equal(result.selection.includedRunIds.length, 8);
  assert.ok(result.selection.errors.some((e) => e.runId === target.runId));
  // The valid runs still project and reconcile exactly.
  assert.equal(projections.invocations.length, 18);
  assert.equal(result.reconciliation.ok, true);
  assert.equal(result.reconciliation.runs, 8);
  assert.equal(result.metrics.workUnits.total, 10);
  // The corrupt store is not modified by the audit (only reported).
  assert.equal(fs.readFileSync(ledgerPath, 'utf8'), `${before}{"garbage": true}\n`);
});

test('audit of an empty runtime store is a valid empty audit', async (t) => {
  const repo = await makeGitRepo(t);
  const { result, outDir } = await audit({ cwd: repo.root });
  assert.equal(result.selection.includedRunIds.length, 0);
  assert.equal(result.reconciliation.ok, true);
  assert.equal(result.metrics.calls.total, 0);
  assert.equal(result.metrics.callsPerAcceptedWorkUnit.available, false);
  for (const file of ['invocations.jsonl', 'work-units.jsonl', 'reviews.jsonl', 'usage.jsonl']) {
    assert.equal(fs.readFileSync(path.join(outDir, file), 'utf8'), '', `${file} must be an empty JSONL stream`);
  }
});

test('audit with explicit outDir writes there (still local, still guarded)', async (t) => {
  const fixture = await buildAuditFixture(t);
  const runtimeRoot = resolveRuntimeRoot(fixture.repo.root);
  const outDir = path.join(runtimeRoot, 'audit', 'custom-out');
  const { files } = await audit({ cwd: fixture.repo.root, outDir });
  assert.equal(fs.existsSync(path.join(outDir, 'final.json')), true);
  assert.equal(files.length, 5);
});

test('malformed pricing tables fail closed', async (t) => {
  const fixture = await buildAuditFixture(t);
  await assert.rejects(() => audit({ cwd: fixture.repo.root, pricing: { deepseek: { 'deepseek-flash': { inputPerMillion: -1, outputPerMillion: 1 } } } }), ConfigError);
  await assert.rejects(() => audit({ cwd: fixture.repo.root, pricing: { deepseek: { 'deepseek-flash': 'nope' } } }), ConfigError);
  await assert.rejects(() => audit({ cwd: fixture.repo.root, pricing: [] }), ConfigError);
  const inheritedRate = Object.create({ inputPerMillion: 1, outputPerMillion: 1 });
  await assert.rejects(() => audit({ cwd: fixture.repo.root, pricing: { deepseek: { 'deepseek-flash': inheritedRate } } }), ConfigError);
});

test('schema-shaped but non-real run timestamps invalidate only that run', async (t) => {
  const fixture = await buildAuditFixture(t);
  const run = runForScenario(fixture, 'accepted-first-pass');
  const runFile = path.join(resolveRuntimeRoot(fixture.repo.root), 'runs', run.runId, 'run.json');
  const record = JSON.parse(fs.readFileSync(runFile, 'utf8'));
  record.finalizedAt = '2025-02-30T00:00:00Z';
  fs.writeFileSync(runFile, JSON.stringify(record));
  const result = await audit({ cwd: fixture.repo.root });
  assert.equal(result.result.selection.invalidRunIds.includes(run.runId), true);
  assert.equal(result.result.selection.includedRunIds.length, fixture.runs.length - 1);
});

test('a run left OPEN is audited as an open run without fabricating completeness', async (t) => {
  const repo = await makeGitRepo(t);
  const store = await RunStore.create({ cwd: repo.root, targetBaseSha: TEST_TARGET_SHA, configDigest: TEST_CONFIG_DIGEST });
  const inv = await store.startInvocation({
    workUnitId: 'lcim_wu_11111111111111111111111111111111',
    provider: 'deepseek',
    model: 'deepseek-flash',
    role: 'WORKER',
    reasoningEffort: 'xhigh',
    occurredAt: '2025-01-01T00:00:01.000Z',
  });
  await inv.complete({ outcome: 'SUCCESS', occurredAt: '2025-01-01T00:00:02.000Z' });
  await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: '2025-01-01T00:00:03.000Z' });
  // leave OPEN (no finalize)
  const { result } = await audit({ cwd: repo.root });
  assert.equal(result.runs.length, 1);
  assert.equal(result.metrics.ledger.runs.open, 1);
  assert.equal(result.metrics.ledger.runs.completed, 0);
  assert.equal(result.reconciliation.ok, true);
  assert.equal(result.metrics.calls.total, 1);
});
