/**
 * Bounded SOL repair regressions for SOL-S08-001 .. SOL-S08-013.
 *
 * These tests intentionally exercise only Sprint-08 public APIs and real
 * Sprint-01 run stores. They do not mutate shared contracts; where the
 * upstream schemas permit a value (offset timestamps, arbitrary bounded
 * dimension/free text), the test demonstrates safe Sprint-08 handling.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { audit } from '../../src/audit/index.mjs';
import { reviewExport } from '../../src/reporting/index.mjs';
import { buildReconciliation } from '../../src/audit/reconcile.mjs';
import { buildProjections, buildWorkUnitLine } from '../../src/audit/project.mjs';
import { computeMetrics, countBy } from '../../src/audit/metrics.mjs';
import { loadRunStore, selectRuns, selectionKey } from '../../src/audit/runs.mjs';
import { compareTimestampThenId, parseTimestamp } from '../../src/audit/time.mjs';
import { validateReviewSummary } from '../../src/audit/schemas.mjs';
import { validateRunStore } from '../../src/logging/reader.mjs';
import { RunStore } from '../../src/runtime/run-store.mjs';
import { generateId } from '../../src/shared/ids.mjs';
import { resolveRuntimeRoot } from '../../src/config/runtime-path.mjs';
import { git, makeGitRepo } from '../helpers/git-fixture.mjs';
import { TEST_TARGET_SHA, TEST_CONFIG_DIGEST } from '../helpers/logging-fixture.mjs';
import { buildAuditFixture } from '../helpers/audit-fixture.mjs';

const PRICE = { deepseek: { 'deepseek-flash': { inputPerMillion: 1, outputPerMillion: 1 } } };
const MARKERS = ['SECRET_MARKER', 'TARGET_SOURCE_MARKER', 'TARGET_PATH_MARKER', 'TRANSCRIPT_MARKER', 'MARKDOWN_MARKER'];

function readProjectionText(dir) {
  return ['invocations.jsonl', 'work-units.jsonl', 'reviews.jsonl', 'usage.jsonl', 'final.json', 'REVIEW.md']
    .filter((file) => fs.existsSync(path.join(dir, file)))
    .map((file) => fs.readFileSync(path.join(dir, file), 'utf8'))
    .join('\n');
}

function usage(input = 1, output = 1) {
  return { inputTokens: input, outputTokens: output, totalTokens: input + output };
}

async function createStore(repo) {
  return RunStore.create({ cwd: repo.root, targetBaseSha: TEST_TARGET_SHA, configDigest: TEST_CONFIG_DIGEST });
}

async function worker(store, workUnitId, at, { assessment = 'ACCEPTED', rejectionCode, usageValue = usage(), provider = 'deepseek', model = 'deepseek-flash', reasoning = 'xhigh' } = {}) {
  const inv = await store.startInvocation({ workUnitId, provider, model, role: 'WORKER', reasoningEffort: reasoning, occurredAt: at.start });
  await inv.complete({ outcome: 'SUCCESS', usage: usageValue, occurredAt: at.complete });
  await inv.assess({ assessmentResult: assessment, rejectionCode, occurredAt: at.assess });
  return inv;
}

async function sol(store, workUnitId, at, { complete = true, reconcile = false, summary, evidenceRefs, provider = 'deepseek', model = 'deepseek-flash', reasoning = 'xhigh' } = {}) {
  const inv = await store.startInvocation({ workUnitId, provider, model, role: 'SOL', reasoningEffort: reasoning, occurredAt: at.start });
  if (complete) {
    await inv.complete({ outcome: 'SUCCESS', usage: usage(), occurredAt: at.complete });
    await inv.assess({ assessmentResult: 'ACCEPTED', summary, evidenceRefs, occurredAt: at.assess });
  } else if (reconcile) {
    await store.reconcileInvocation({ invocationId: inv.invocationId, reason: 'CRASH_AFTER_START', occurredAt: at.reconcile });
  }
  return inv;
}

function slot(second) {
  return {
    start: `2025-02-01T00:00:${String(second).padStart(2, '0')}.000Z`,
    complete: `2025-02-01T00:00:${String(second + 1).padStart(2, '0')}.000Z`,
    assess: `2025-02-01T00:00:${String(second + 2).padStart(2, '0')}.000Z`,
    reconcile: `2025-02-01T00:00:${String(second + 1).padStart(2, '0')}.000Z`,
  };
}

test('SOL-S08-002: arbitrary canonical free text is absent from every normal output', async (t) => {
  const repo = await makeGitRepo(t);
  const valid = await createStore(repo);
  const wu = generateId('work-unit');
  const markerText = MARKERS.join(' ');
  const inv = await valid.startInvocation({
    workUnitId: wu,
    provider: `provider-${MARKERS[0]}`,
    model: `model-${MARKERS[1]}`,
    role: 'SOL',
    reasoningEffort: `reason-${MARKERS[2]}`,
    occurredAt: '2025-02-01T00:00:01.000Z',
  });
  await inv.complete({ outcome: 'SUCCESS', usage: usage(), occurredAt: '2025-02-01T00:00:02.000Z' });
  await inv.assess({
    assessmentResult: 'ACCEPTED',
    summary: `${MARKERS[3]} ${markerText}`,
    evidenceRefs: [MARKERS[4]],
    occurredAt: '2025-02-01T00:00:03.000Z',
  });
  const noteWu = generateId('work-unit');
  const noted = await valid.startInvocation({ workUnitId: noteWu, provider: 'deepseek', model: 'deepseek-flash', role: 'WORKER', reasoningEffort: 'xhigh', occurredAt: '2025-02-01T00:00:04.000Z' });
  await valid.reconcileInvocation({ invocationId: noted.invocationId, reason: 'CRASH_AFTER_START', note: MARKERS[2], occurredAt: '2025-02-01T00:00:05.000Z' });
  await valid.finalize();

  // A separate invalid run injects attacker-controlled validation text. The
  // valid marker-bearing run must still be projected and sanitized.
  const invalid = await createStore(repo);
  const bad = await worker(invalid, generateId('work-unit'), slot(10));
  await invalid.finalize();
  const projectionPath = path.join(invalid.runDir, 'invocations', `${bad.invocationId}.json`);
  const record = JSON.parse(fs.readFileSync(projectionPath, 'utf8'));
  record.provider = `bad-${MARKERS[4]}`;
  fs.writeFileSync(projectionPath, JSON.stringify(record));

  const audited = await audit({ cwd: repo.root });
  const exported = await reviewExport({ cwd: repo.root });
  assert.equal(audited.result.selection.includedRunIds.length, 1);
  const combined = `${readProjectionText(audited.outDir)}\n${readProjectionText(exported.dir)}\n${JSON.stringify(audited.result)}`;
  for (const marker of MARKERS) assert.equal(combined.includes(marker), false, marker);
  assert.equal(audited.result.selection.invalidRunIds.length, 1);
  assert.ok(audited.result.selection.errors.every((error) => 'detailDigest' in error || error.code === 'OUTSIDE_LAST_N_WINDOW'));
});

test('SOL-S08-003: audit/review outDir rejects run storage, worktree, external repo, traversal, and symlink escapes before writes', async (t) => {
  const fixture = await buildAuditFixture(t);
  const runtimeRoot = resolveRuntimeRoot(fixture.repo.root);
  const run = fixture.runs[0];
  const invDir = path.join(runtimeRoot, 'runs', run.runId, 'invocations');
  const ledgerPath = path.join(runtimeRoot, 'runs', run.runId, 'events.v2.jsonl');
  const beforeLedger = fs.readFileSync(ledgerPath, 'utf8');
  const beforeInvFiles = fs.readdirSync(invDir).sort();
  const external = await makeGitRepo(t);
  const nestedRepo = path.join(runtimeRoot, 'audit', 'nested-repository');
  fs.mkdirSync(nestedRepo, { recursive: true });
  git(nestedRepo, ['init', '-b', 'main']);
  const targets = [
    invDir,
    fixture.repo.root,
    process.cwd(),
    external.root,
    nestedRepo,
    path.join(runtimeRoot, 'audit', '..', 'runs', run.runId, 'invocations'),
  ];
  for (const target of targets) {
    const before = fs.existsSync(target) && fs.statSync(target).isDirectory() ? fs.readdirSync(target).sort() : null;
    await assert.rejects(() => audit({ cwd: fixture.repo.root, outDir: target }));
    await assert.rejects(() => reviewExport({ cwd: fixture.repo.root, outDir: target }));
    if (before !== null) {
      const after = fs.readdirSync(target).sort();
      assert.deepEqual(after, before, `rejected target must not receive output bytes: ${target}`);
    }
  }
  const auditSymlink = path.join(runtimeRoot, 'audit', 'escape-link');
  const exportSymlink = path.join(runtimeRoot, 'exports', 'escape-link');
  fs.mkdirSync(path.dirname(auditSymlink), { recursive: true });
  fs.mkdirSync(path.dirname(exportSymlink), { recursive: true });
  fs.symlinkSync(invDir, auditSymlink);
  fs.symlinkSync(invDir, exportSymlink);
  await assert.rejects(() => audit({ cwd: fixture.repo.root, outDir: auditSymlink }));
  await assert.rejects(() => reviewExport({ cwd: fixture.repo.root, outDir: exportSymlink }));
  assert.deepEqual(fs.readdirSync(invDir).sort(), beforeInvFiles);
  assert.equal(fs.readFileSync(ledgerPath, 'utf8'), beforeLedger);
  assert.equal(validateRunStore(path.join(runtimeRoot, 'runs', run.runId)).valid, true);
});

test('SOL-S08-003: namespace roots and symlinked run entries are not trusted', async (t) => {
  const fixture = await buildAuditFixture(t);
  const runtimeRoot = resolveRuntimeRoot(fixture.repo.root);
  const auditRoot = path.join(runtimeRoot, 'audit');
  fs.mkdirSync(auditRoot, { recursive: true });
  git(auditRoot, ['init', '-b', 'main']);
  await assert.rejects(() => audit({ cwd: fixture.repo.root }));

  // A separate fixture exercises discovery: a symlink under runs/ is never
  // followed or surfaced as a canonical candidate run.
  const second = await buildAuditFixture(t);
  const secondRuntime = resolveRuntimeRoot(second.repo.root);
  const linkedName = 'lcim_run_ffffffffffffffffffffffffffffffff';
  fs.symlinkSync(path.join(secondRuntime, 'runs', second.runs[0].runId), path.join(secondRuntime, 'runs', linkedName));
  const result = await audit({ cwd: second.repo.root });
  assert.equal(result.result.selection.invalidRunIds.includes(linkedName), false);
  assert.equal(result.result.selection.includedRunIds.length, second.runs.length);
});

test('SOL-S08-004: implementation acceptance is WORKER-only; first-pass and repair require explicit sequences', async (t) => {
  const repo = await makeGitRepo(t);
  const store = await createStore(repo);
  const solOnly = generateId('work-unit');
  const orphanThenAccepted = generateId('work-unit');
  const rejectedThenAccepted = generateId('work-unit');
  const acceptedFirst = generateId('work-unit');

  await sol(store, solOnly, slot(1), { summary: 'No findings' });
  const orphan = await store.startInvocation({ workUnitId: orphanThenAccepted, provider: 'deepseek', model: 'deepseek-flash', role: 'WORKER', reasoningEffort: 'xhigh', occurredAt: slot(5).start });
  await store.reconcileInvocation({ invocationId: orphan.invocationId, reason: 'CRASH_AFTER_START', occurredAt: slot(5).reconcile });
  await worker(store, orphanThenAccepted, slot(8));
  await worker(store, rejectedThenAccepted, slot(12), { assessment: 'REJECTED', rejectionCode: 'SEMANTIC_CONFLATION' });
  await worker(store, rejectedThenAccepted, slot(16));
  await worker(store, acceptedFirst, slot(20));
  await store.finalize();

  const { projections, result } = await audit({ cwd: repo.root });
  const byWu = new Map(projections.workUnits.map((line) => [line.workUnitId, line]));
  assert.equal(byWu.get(solOnly).status, 'UNKNOWN');
  assert.equal(byWu.get(solOnly).acceptedInvocationId, null);
  assert.equal(byWu.get(solOnly).firstPassAccepted, null);
  assert.equal(byWu.get(solOnly).repairAccepted, false);
  assert.equal(byWu.get(orphanThenAccepted).status, 'ACCEPTED');
  assert.equal(byWu.get(orphanThenAccepted).firstPassAccepted, null);
  assert.equal(byWu.get(orphanThenAccepted).repairAccepted, false);
  assert.equal(byWu.get(rejectedThenAccepted).status, 'ACCEPTED');
  assert.equal(byWu.get(rejectedThenAccepted).firstPassAccepted, false);
  assert.equal(byWu.get(rejectedThenAccepted).repairAccepted, true);
  assert.equal(byWu.get(acceptedFirst).firstPassAccepted, true);
  assert.equal(byWu.get(acceptedFirst).repairAccepted, false);
  assert.equal(result.metrics.workUnits.accepted, 3);
  assert.equal(result.metrics.acceptance.repairAccepted, 1);
});

test('SOL-S08-005: aggregate cost requires complete usage and complete pricing, with labeled subtotal only', async (t) => {
  // A: one usage-less call -> MISSING_USAGE even with pricing.
  const repoA = await makeGitRepo(t);
  const a = await createStore(repoA);
  const wuA = generateId('work-unit');
  await worker(a, wuA, slot(1), { usageValue: usage(2, 2) });
  const noUsage = await a.startInvocation({ workUnitId: wuA, provider: 'deepseek', model: 'deepseek-flash', role: 'WORKER', reasoningEffort: 'xhigh', occurredAt: slot(5).start });
  await noUsage.complete({ outcome: 'SUCCESS', occurredAt: slot(5).complete });
  await noUsage.assess({ assessmentResult: 'ACCEPTED', occurredAt: slot(5).assess });
  await a.finalize();
  const costA = (await audit({ cwd: repoA.root, pricing: PRICE })).result.metrics.usage.cost;
  assert.deepEqual({ availability: costA.availability, usd: costA.usd, reason: costA.reason }, { availability: 'UNKNOWN', usd: null, reason: 'MISSING_USAGE' });
  assert.ok(costA.knownCostSubtotal > 0);

  // B: all usage known, one model unpriced -> MISSING_PRICING.
  const repoB = await makeGitRepo(t);
  const b = await createStore(repoB);
  const wuB = generateId('work-unit');
  await worker(b, wuB, slot(1), { usageValue: usage(2, 2) });
  await worker(b, wuB, slot(5), { usageValue: usage(3, 3), model: 'other-model' });
  await b.finalize();
  const costB = (await audit({ cwd: repoB.root, pricing: PRICE })).result.metrics.usage.cost;
  assert.deepEqual({ availability: costB.availability, usd: costB.usd, reason: costB.reason }, { availability: 'UNKNOWN', usd: null, reason: 'MISSING_PRICING' });
  assert.ok(costB.knownCostSubtotal > 0);

  // C: all usage known + all priced -> computed total exact.
  const repoC = await makeGitRepo(t);
  const c = await createStore(repoC);
  const wuC = generateId('work-unit');
  await worker(c, wuC, slot(1), { usageValue: usage(2, 2) });
  await worker(c, wuC, slot(5), { usageValue: usage(3, 3) });
  await c.finalize();
  const costC = (await audit({ cwd: repoC.root, pricing: PRICE })).result.metrics.usage.cost;
  assert.equal(costC.availability, 'COMPUTED');
  assert.equal(costC.usd, 0.00001);
  assert.equal(costC.usd, costC.knownCostSubtotal);
  assert.equal(costC.totalCallCount, 2);
});

test('SOL-S08-007/008: review linkage remains null and incomplete SOL outcomes are explicit null/schema-valid', async (t) => {
  const repo = await makeGitRepo(t);
  const store = await createStore(repo);
  const wu = generateId('work-unit');
  await sol(store, wu, slot(1), { summary: 'No findings' });
  await worker(store, wu, slot(5));
  await sol(store, wu, slot(9), { summary: 'Unrelated review' });
  const started = await sol(store, generateId('work-unit'), slot(13), { complete: false });
  const orphaned = await sol(store, generateId('work-unit'), slot(16), { complete: false, reconcile: true });
  await store.finalize();

  const { projections, result } = await audit({ cwd: repo.root });
  const reviews = projections.reviews;
  assert.equal(reviews.length, 4);
  for (const review of reviews) {
    assert.equal(review.findingDelivered, null);
    assert.equal(review.recheckOf, null);
    assert.equal(review.survivedRepair, null);
    assert.equal(review.summary, null);
    assert.equal(validateReviewSummary(review).valid, true);
  }
  const startedLine = reviews.find((line) => line.reviewInvocationId === started.invocationId);
  const orphanedLine = reviews.find((line) => line.reviewInvocationId === orphaned.invocationId);
  assert.equal(startedLine.outcome, null);
  assert.equal(orphanedLine.outcome, null);
  assert.equal(result.metrics.solFindings.findings, null);
});

test('SOL-S08-009: identity-preserving projection corruption always fails independent reconciliation', async (t) => {
  const fixture = await buildAuditFixture(t);
  const runtimeRoot = resolveRuntimeRoot(fixture.repo.root);
  const loaded = fixture.runs.map((run) => loadRunStore({ runId: run.runId, runDir: path.join(runtimeRoot, 'runs', run.runId) }));
  const { selected } = selectRuns(loaded, null);
  const projections = buildProjections(selected);
  const metrics = computeMetrics({ ...projections, loadedRuns: selected });
  const corrupt = (lines) => {
    const copy = [...lines];
    copy[0] = { ...copy[1] };
    return copy;
  };
  for (const [kind, changed] of Object.entries({
    invocations: corrupt(projections.invocations),
    usage: corrupt(projections.usage),
    reviews: corrupt(projections.reviews),
    workUnits: corrupt(projections.workUnits),
  })) {
    const altered = { ...projections, [kind]: changed };
    const reconciliation = buildReconciliation({ loadedRuns: selected, ...altered, metrics });
    assert.equal(reconciliation.ok, false, kind);
  }
  const wrongClass = projections.workUnits.map((line, index) => index === 0
    ? { ...line, status: line.status === 'REJECTED' ? 'ACCEPTED' : 'REJECTED' }
    : line);
  assert.equal(buildReconciliation({ loadedRuns: selected, ...projections, workUnits: wrongClass, metrics }).ok, false);
  const wrongReviewRole = projections.reviews.map((line, index) => index === 0 ? { ...line, role: line.role === 'SOL' ? 'SOL_PRO' : 'SOL' } : line);
  assert.equal(buildReconciliation({ loadedRuns: selected, ...projections, reviews: wrongReviewRole, metrics }).ok, false);
});

test('SOL-S08-010: structurally unreadable run is reported while valid runs continue', async (t) => {
  const repo = await makeGitRepo(t);
  const good = await createStore(repo);
  await worker(good, generateId('work-unit'), slot(1));
  await good.finalize();
  const bad = await createStore(repo);
  await worker(bad, generateId('work-unit'), slot(5));
  await bad.finalize();
  const ledger = path.join(bad.runDir, 'events.v2.jsonl');
  fs.unlinkSync(ledger);
  fs.mkdirSync(ledger);
  const { result, projections } = await audit({ cwd: repo.root });
  assert.equal(result.selection.invalidRunIds.length, 1);
  assert.equal(projections.invocations.length, 1);
  assert.ok(result.selection.errors.every((error) => error.code === 'INVALID_CANONICAL_RUN'));
});

test('SOL-S08-011: offsets order chronologically, equal instants tie-break by stable ID', async (t) => {
  const a = { runId: 'lcim_run_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', run: { createdAt: '2025-01-01T00:30:00+01:00' }, valid: true };
  const b = { runId: 'lcim_run_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', run: { createdAt: '2024-12-31T23:45:00Z' }, valid: true };
  const c = { runId: 'lcim_run_cccccccccccccccccccccccccccccccc', run: { createdAt: '2025-01-01T00:45:00+01:00' }, valid: true };
  const selected = selectRuns([a, b, c], null).selected;
  // a = 23:30Z, b/c = 23:45Z; b wins equal-instant tie before c.
  assert.deepEqual(selected.map((line) => line.runId), [a.runId, b.runId, c.runId]);

  // Real canonical states: lexical timestamp order would put the Z call
  // first, but chronological order makes the +01:00 rejection first.
  const repo = await makeGitRepo(t);
  const store = await createStore(repo);
  const workerWu = generateId('work-unit');
  const first = await store.startInvocation({ workUnitId: workerWu, provider: 'deepseek', model: 'deepseek-flash', role: 'WORKER', reasoningEffort: 'xhigh', occurredAt: '2025-01-01T00:30:00+01:00' });
  await first.complete({ outcome: 'SUCCESS', usage: usage(), occurredAt: '2025-01-01T00:30:01+01:00' });
  await first.assess({ assessmentResult: 'REJECTED', rejectionCode: 'SEMANTIC_CONFLATION', occurredAt: '2025-01-01T00:30:02+01:00' });
  const later = await store.startInvocation({ workUnitId: workerWu, provider: 'deepseek', model: 'deepseek-flash', role: 'WORKER', reasoningEffort: 'xhigh', occurredAt: '2024-12-31T23:45:00Z' });
  await later.complete({ outcome: 'SUCCESS', usage: usage(), occurredAt: '2024-12-31T23:45:01Z' });
  await later.assess({ assessmentResult: 'ACCEPTED', occurredAt: '2024-12-31T23:45:02Z' });
  const reviewWu = generateId('work-unit');
  const reviewA = await sol(store, reviewWu, { start: '2025-01-01T00:45:00+01:00', complete: '2025-01-01T00:45:01+01:00', assess: '2025-01-01T00:45:02+01:00' });
  const reviewB = await sol(store, reviewWu, { start: '2024-12-31T23:45:00Z', complete: '2024-12-31T23:45:01Z', assess: '2024-12-31T23:45:02Z' });
  await store.finalize();
  const { projections } = await audit({ cwd: repo.root });
  const workerLine = projections.workUnits.find((line) => line.workUnitId === workerWu);
  assert.equal(workerLine.firstPassAccepted, false);
  assert.equal(workerLine.repairAccepted, true);
  const reviewIds = projections.reviews.filter((line) => line.workUnitId === reviewWu).map((line) => line.reviewInvocationId);
  assert.deepEqual(reviewIds, [reviewA.invocationId, reviewB.invocationId].sort());
});

test('SOL-S08-011: sub-millisecond fractions order chronologically and never collapse to ID tie-breaks', async (t) => {
  // --- exact representation ------------------------------------------------
  assert.deepEqual(parseTimestamp('2025-01-01T00:00:00.0001Z'), { seconds: 1735689600n, fraction: '0001' });
  assert.deepEqual(parseTimestamp('2025-01-01T00:00:00Z'), { seconds: 1735689600n, fraction: '' });
  assert.deepEqual(parseTimestamp('2025-01-01T01:00:00.123456+01:00'), { seconds: 1735689600n, fraction: '123456' });
  const key = selectionKey({ runId: 'lcim_run_11111111111111111111111111111111', run: { createdAt: '2025-01-01T00:00:00.0001Z' } });
  assert.deepEqual(key, { createdAt: { seconds: 1735689600n, fraction: '0001' }, runId: 'lcim_run_11111111111111111111111111111111' });

  // --- comparison primitives -----------------------------------------------
  const ID_HIGH = 'lcim_inv_ffffffffffffffffffffffffffffffff'; // lexically LAST
  const ID_LOW = 'lcim_inv_00000000000000000000000000000000'; // lexically FIRST
  const cmp = (aTime, aId, bTime, bId) => compareTimestampThenId(aTime, aId, bTime, bId);

  // A: .0001Z < .0002Z even with reverse-sorting IDs.
  assert.equal(cmp('2025-01-01T00:00:00.0001Z', ID_HIGH, '2025-01-01T00:00:00.0002Z', ID_LOW), -1);
  assert.equal(cmp('2025-01-01T00:00:00.0002Z', ID_LOW, '2025-01-01T00:00:00.0001Z', ID_HIGH), 1);

  // B: arbitrary longer fractions.
  assert.equal(cmp('2025-01-01T00:00:00.123456789Z', 'x', '2025-01-01T00:00:00.123456790Z', 'y'), -1);
  assert.equal(cmp('2025-01-01T00:00:00.000000000Z', 'x', '2025-01-01T00:00:00.000000001Z', 'y'), -1);

  // C: trailing-zero-equivalent fractions are genuinely equal instants.
  assert.equal(parseTimestamp('2025-01-01T00:00:00.1Z').fraction, '1');
  assert.equal(parseTimestamp('2025-01-01T00:00:00.10Z').fraction, '1');
  assert.equal(parseTimestamp('2025-01-01T00:00:00.100000Z').fraction, '1');
  assert.equal(cmp('2025-01-01T00:00:00.1Z', 'a', '2025-01-01T00:00:00.10Z', 'a'), 0);
  assert.equal(cmp('2025-01-01T00:00:00.1Z', 'a', '2025-01-01T00:00:00.100000Z', 'a'), 0);
  assert.equal(cmp('2025-01-01T00:00:00.10Z', ID_LOW, '2025-01-01T00:00:00.100000Z', ID_HIGH), -1);

  // D: exact offset-equivalent instants, including sub-millisecond fractions.
  assert.equal(cmp('2025-01-01T00:00:00.123456Z', 'a', '2025-01-01T01:00:00.123456+01:00', 'a'), 0);
  assert.equal(cmp('2025-01-01T00:00:00.000001Z', 'a', '2025-01-01T01:00:00.000001+01:00', 'a'), 0);
  assert.equal(cmp('2025-01-01T00:00:00.123456-01:00', 'a', '2025-01-01T00:00:00.123456-01:00', 'a'), 0);

  // E: offset timestamps with >3 fractional digits compare chronologically
  //    rather than lexically (the +01:00 instant is earlier though its raw
  //    string sorts after the Z string).
  assert.equal(cmp('2025-01-01T01:00:00.123456+01:00', 'a', '2025-01-01T00:00:00.123457Z', 'a'), -1);
  assert.equal(cmp('2025-01-01T00:59:59.999999+01:00', 'a', '2024-12-31T23:59:59.999999Z', 'a'), 0);

  // F: whole-second crossover is decided by exact seconds.
  assert.equal(cmp('2025-01-01T00:00:00.999999999Z', 'a', '2025-01-01T00:00:01Z', 'a'), -1);
  assert.equal(cmp('2025-01-01T00:00:00.000000001Z', 'a', '2025-01-01T00:00:00Z', 'a'), 1);

  // G: only genuinely equal instants reach stable-ID tie-breaking.
  assert.equal(cmp('2025-01-01T00:00:00.0001Z', ID_LOW, '2025-01-01T00:00:00.0001Z', ID_HIGH), -1);
  assert.equal(cmp('2025-01-01T00:00:00.0001Z', ID_HIGH, '2025-01-01T00:00:00.0001Z', ID_LOW), 1);
  assert.equal(cmp('2025-01-01T00:00:00.0001Z', ID_LOW, '2025-01-01T00:00:00.0001Z', ID_LOW), 0);
  assert.equal(cmp('2025-01-01T00:00:00.0001Z', ID_LOW, '2025-01-01T00:00:00.0002Z', ID_LOW), -1);

  // Invalid/non-real timestamps fail closed.
  for (const bad of [
    '2025-02-30T00:00:00Z',
    '2025-01-01T24:00:00Z',
    '2025-01-01T00:00:60Z',
    '2025-01-01T00:00:00.123456',
    '2025-01-01T00:00:00',
    '2025-01-01T00:00:00+24:00',
    '2025-01-01T00:00:00+01:60',
    'not-a-timestamp',
  ]) {
    assert.throws(() => parseTimestamp(bad));
  }
  assert.throws(() => parseTimestamp(1735689600));
  assert.throws(() => parseTimestamp(null));
  assert.throws(() => compareTimestampThenId('2025-01-01T00:00:00.0001Z', 'a', 'not-a-timestamp', 'b'));

  // --- 1. FIRST WORKER: .0001Z remains the first implementation attempt ---
  const loadedRun = {
    runId: 'lcim_run_11111111111111111111111111111111',
    run: { targetBaseSha: TEST_TARGET_SHA, createdAt: '2025-01-01T00:00:00.0000Z' },
    states: new Map(),
  };
  const wu = generateId('work-unit');
  const invState = (invocationId, role, at, result, rejectionCode) => ({
    invocationId,
    runId: loadedRun.runId,
    workUnitId: wu,
    status: 'ASSESSED',
    counts: { START: 1, COMPLETION: 1, ASSESSMENT: 1, RECONCILIATION: 0 },
    provider: 'deepseek',
    model: 'deepseek-flash',
    role,
    reasoningEffort: 'xhigh',
    startedAt: at.start,
    completedAt: at.complete,
    assessedAt: at.assess,
    outcome: 'SUCCESS',
    usage: usage(),
    rejectionCode,
    assessmentResult: result,
    summary: undefined,
    evidenceRefs: undefined,
    reconciliationReason: undefined,
    supersededByInvocationId: undefined,
    lastSeq: 3,
  });
  const atEarly = { start: '2025-01-01T00:00:00.0001Z', complete: '2025-01-01T00:00:01.0001Z', assess: '2025-01-01T00:00:02.0001Z' };
  const atLate = { start: '2025-01-01T00:00:00.0002Z', complete: '2025-01-01T00:00:01.0002Z', assess: '2025-01-01T00:00:02.0002Z' };
  // Adversarial: the EARLIER .0001Z call carries the lexically-LAST id and
  // the LATER .0002Z call the lexically-FIRST id.
  const earlyWorker = invState(ID_HIGH, 'WORKER', atEarly, 'REJECTED', 'SEMANTIC_CONFLATION');
  const lateWorker = invState(ID_LOW, 'WORKER', atLate, 'ACCEPTED');
  const firstWorkerLine = buildWorkUnitLine(loadedRun, wu, [earlyWorker, lateWorker]);
  assert.equal(firstWorkerLine.firstInvocationId, ID_HIGH);
  assert.equal(firstWorkerLine.firstPassAccepted, false);
  assert.equal(firstWorkerLine.repairAccepted, true);
  assert.equal(firstWorkerLine.acceptedInvocationId, ID_LOW);

  // --- 2. REVIEW ORDER: .0001Z review precedes .0002Z despite adversarial ids ---
  const earlyReview = invState(ID_HIGH, 'SOL', atEarly, 'ACCEPTED');
  const lateReview = invState(ID_LOW, 'SOL', atLate, 'ACCEPTED');
  loadedRun.states = new Map([
    [earlyReview.invocationId, earlyReview],
    [lateReview.invocationId, lateReview],
  ]);
  const { reviews } = buildProjections([loadedRun]);
  const reviewIds = reviews.filter((line) => line.workUnitId === wu).map((line) => line.reviewInvocationId);
  assert.deepEqual(reviewIds, [ID_HIGH, ID_LOW]);

  // --- 3. NEWEST-N: .0002Z run must be selected for last=1 ---
  const earlyRun = { runId: 'lcim_run_ffffffffffffffffffffffffffffffff', run: { createdAt: '2025-01-01T00:00:00.0001Z' }, valid: true };
  const lateRun = { runId: 'lcim_run_00000000000000000000000000000000', run: { createdAt: '2025-01-01T00:00:00.0002Z' }, valid: true };
  assert.deepEqual(selectRuns([earlyRun, lateRun], 1).selected.map((line) => line.runId), [lateRun.runId]);
  assert.deepEqual(selectRuns([lateRun, earlyRun], 1).selected.map((line) => line.runId), [lateRun.runId]);
  assert.deepEqual(selectRuns([earlyRun, lateRun], null).selected.map((line) => line.runId), [earlyRun.runId, lateRun.runId]);

  // --- real canonical store: fractional chronology through the full audit ---
  // Reviews get their own sub-millisecond instants so no cross-role
  // equal-instant tie depends on random IDs (stable tie-breaks are proven
  // deterministically in the synthetic sections above).
  const repo = await makeGitRepo(t);
  const store = await createStore(repo);
  const realWu = generateId('work-unit');
  const atReviewEarly = { start: '2025-01-01T00:00:00.0003Z', complete: '2025-01-01T00:00:01.0003Z', assess: '2025-01-01T00:00:02.0003Z' };
  const atReviewLate = { start: '2025-01-01T00:00:00.0004Z', complete: '2025-01-01T00:00:01.0004Z', assess: '2025-01-01T00:00:02.0004Z' };
  const first = await store.startInvocation({ workUnitId: realWu, provider: 'deepseek', model: 'deepseek-flash', role: 'WORKER', reasoningEffort: 'xhigh', occurredAt: atEarly.start });
  await first.complete({ outcome: 'SUCCESS', usage: usage(), occurredAt: atEarly.complete });
  await first.assess({ assessmentResult: 'REJECTED', rejectionCode: 'SEMANTIC_CONFLATION', occurredAt: atEarly.assess });
  const second = await store.startInvocation({ workUnitId: realWu, provider: 'deepseek', model: 'deepseek-flash', role: 'WORKER', reasoningEffort: 'xhigh', occurredAt: atLate.start });
  await second.complete({ outcome: 'SUCCESS', usage: usage(), occurredAt: atLate.complete });
  await second.assess({ assessmentResult: 'ACCEPTED', occurredAt: atLate.assess });
  const reviewEarly = await sol(store, realWu, atReviewEarly);
  const reviewLate = await sol(store, realWu, atReviewLate);
  await store.finalize();
  const { projections } = await audit({ cwd: repo.root });
  const realLine = projections.workUnits.find((line) => line.workUnitId === realWu);
  assert.equal(realLine.firstInvocationId, first.invocationId);
  assert.equal(realLine.firstPassAccepted, false);
  assert.equal(realLine.repairAccepted, true);
  assert.equal(realLine.acceptedInvocationId, second.invocationId);
  const realReviewIds = projections.reviews.filter((line) => line.workUnitId === realWu).map((line) => line.reviewInvocationId);
  assert.deepEqual(realReviewIds, [reviewEarly.invocationId, reviewLate.invocationId]);

  // --- invalid canonical timestamp fails the run closed (never orders) ---
  const secondRepo = await makeGitRepo(t);
  const badStore = await createStore(secondRepo);
  await worker(badStore, generateId('work-unit'), slot(1));
  await badStore.finalize();
  const runJsonPath = path.join(badStore.runDir, 'run.json');
  const runRecord = JSON.parse(fs.readFileSync(runJsonPath, 'utf8'));
  runRecord.createdAt = '2025-02-30T00:00:00Z'; // schema-shaped but not a real instant
  fs.writeFileSync(runJsonPath, `${JSON.stringify(runRecord, null, 2)}\n`);
  const failed = await audit({ cwd: secondRepo.root });
  assert.equal(failed.result.selection.invalidRunIds.length, 1);
  assert.ok(failed.result.selection.errors.every((error) => error.code === 'INVALID_CANONICAL_RUN'));
  assert.equal(failed.projections.invocations.length, 0);
});

test('SOL-S08-012: valid prototype-like canonical dimensions count safely and preserve totals', async (t) => {
  const prototypeCounts = countBy([{ value: 'toString' }, { value: '__proto__' }], 'value');
  assert.deepEqual(Object.keys(prototypeCounts), ['__proto__', 'toString']);
  assert.equal(Object.hasOwn(prototypeCounts, '__proto__'), true);
  assert.equal(prototypeCounts.__proto__, 1);
  assert.equal(prototypeCounts.toString, 1);
  const repo = await makeGitRepo(t);
  const store = await createStore(repo);
  await worker(store, generateId('work-unit'), slot(1), { provider: 'toString', model: '__proto__', reasoning: 'toString' });
  await store.finalize();
  const { result, projections } = await audit({ cwd: repo.root });
  // Raw values are opaque in normal output; countBy independently remains
  // prototype-safe (tested through opaque safe labels and a total of one).
  assert.equal(result.metrics.calls.total, 1);
  assert.equal(Object.values(result.metrics.calls.byProvider).reduce((n, v) => n + v, 0), 1);
  assert.equal(Object.values(result.metrics.calls.byModel).reduce((n, v) => n + v, 0), 1);
  assert.match(projections.invocations[0].provider, /^provider_[0-9a-f]{16}$/);
  assert.match(projections.invocations[0].model, /^model_[0-9a-f]{16}$/);
  // Inherited prototype properties are never valid pricing matches.
  const priced = await audit({ cwd: repo.root, pricing: {} });
  assert.equal(priced.projections.usage[0].costAvailability, 'UNKNOWN');
});

test('SOL-S08-013: empty history is UNKNOWN; one identity exact; differing identities MIXED', async (t) => {
  const empty = await makeGitRepo(t);
  const emptyResult = (await audit({ cwd: empty.root })).result;
  const emptyMetric = emptyResult.metrics.lcim;
  assert.deepEqual(emptyMetric, { version: 'UNKNOWN', commit: null, availability: false, reason: 'NO_HISTORICAL_RUNS', versions: [] });
  assert.deepEqual(
    { tokenAvailability: emptyResult.metrics.usage.tokens.availability, tokenTotal: emptyResult.metrics.usage.tokens.totalTokens, costAvailability: emptyResult.metrics.usage.cost.availability, cost: emptyResult.metrics.usage.cost.usd },
    { tokenAvailability: 'COMPUTED', tokenTotal: 0, costAvailability: 'COMPUTED', cost: 0 },
  );

  const one = await makeGitRepo(t);
  const store = await createStore(one);
  await worker(store, generateId('work-unit'), slot(1));
  await store.finalize();
  const oneMetric = (await audit({ cwd: one.root })).result.metrics.lcim;
  assert.equal(oneMetric.version, '2.0.1');
  assert.equal(oneMetric.availability, true);

  // Synthetic loaded-run identity aggregation reaches MIXED only for two
  // genuinely differing canonical records; no source files are changed.
  const loaded = [
    { run: { lcimVersion: '2.0.0', lcimCommit: 'a'.repeat(40) }, states: new Map() },
    { run: { lcimVersion: '2.0.1-dev.0', lcimCommit: 'b'.repeat(40) }, states: new Map() },
  ];
  const metrics = computeMetrics({ invocations: [], workUnits: [], reviews: [], usage: [], loadedRuns: loaded });
  assert.equal(metrics.lcim.version, 'MIXED');
  assert.equal(metrics.lcim.availability, true);
});
