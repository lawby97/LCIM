/**
 * Sprint 08 synthetic multi-run audit fixture.
 *
 * Builds N=9 canonical run stores (via the real Sprint-01 RunStore API)
 * inside one tmp git repo, covering every scenario the sprint requires:
 *
 *   1. accepted-first-pass          one WORKER call, controller-accepted
 *   2. repair-acceptance            semantic rejection then accepted repair
 *   3. semantic-rejection           unresolved semantics, no later acceptance
 *   4. transport-failure-useful-patch  TRANSPORT_ERROR + TRANSPORT_MALFORMED
 *                                   but the patch was assessed ACCEPTED
 *                                   (transport validity != patch usefulness)
 *   5. wrong-base                   WRONG_BASE controller rejection
 *   6. sol-finding-recheck          SOL review sequence around worker repairs;
 *                                   canonical finding/recheck linkage remains
 *                                   unavailable (Sprint-01 has no identity field)
 *   7. incomplete-ledger            invocation left STARTED; finalizer marks
 *                                   INCOMPLETE_LEDGER
 *   8. orphan-unknown-usage         ORPHANED invocation (CRASH_AFTER_START)
 *                                   plus an accepted call without usage
 *   9. mixed-providers              deepseek-flash / deepseek-pro-max /
 *                                   SOL (deepseek) / SOL_PRO (chatgpt)
 *
 * Fixture discipline:
 * - Every ledger event carries a fixed occurredAt (deterministic).
 * - Run creation order sets createdAt = 2025-01-01T00:{10*i}:00Z by
 *   rewriting run.json after finalization (canonical EVENTS are never
 *   touched; only the fixture's own run record timestamps are pinned so
 *   `--last N` selection is deterministic in tests).
 * - No secrets/transcripts are written to the ledger. Run 1 optionally
 *   exercises the raw sink with synthetic neutral markers so sanitization
 *   tests can prove normal exports never copy forensic content.
 */

import fs from 'node:fs';
import path from 'node:path';
import { RunStore } from '../../src/runtime/run-store.mjs';
import { generateId } from '../../src/shared/ids.mjs';
import { resolveRuntimeRoot } from '../../src/config/runtime-path.mjs';
import { makeGitRepo } from './git-fixture.mjs';
import { TEST_TARGET_SHA, TEST_CONFIG_DIGEST } from './logging-fixture.mjs';

/** Scenario manifest (mirrored by tests/fixtures/audit/scenarios.json). */
export const FIXTURE_SCENARIOS = Object.freeze([
  { id: 'accepted-first-pass', title: 'accepted first pass', workUnits: 1, invocations: 1 },
  { id: 'repair-acceptance', title: 'repair acceptance after semantic rejection', workUnits: 1, invocations: 2 },
  { id: 'semantic-rejection', title: 'semantic rejection (unresolved)', workUnits: 1, invocations: 1 },
  { id: 'transport-failure-useful-patch', title: 'transport failure with useful patch', workUnits: 1, invocations: 1 },
  { id: 'wrong-base', title: 'wrong base rejection', workUnits: 1, invocations: 1 },
  { id: 'sol-finding-recheck', title: 'SOL review sequence (canonical linkage unavailable)', workUnits: 2, invocations: 6 },
  { id: 'incomplete-ledger', title: 'incomplete ledger', workUnits: 1, invocations: 1 },
  { id: 'orphan-unknown-usage', title: 'orphaned invocation and unknown usage', workUnits: 2, invocations: 2 },
  { id: 'mixed-providers', title: 'mixed providers and Pro/SOL_PRO escalation', workUnits: 1, invocations: 4 },
]);

/** Synthetic raw-sink markers used by the normal-export exclusion test. */
export const RAW_SINK_SAMPLES = Object.freeze([
  'S08_RAW_SINK_MARKER_ALPHA',
  'S08_RAW_SINK_MARKER_BETA',
  'S08_RAW_SINK_MARKER_GAMMA',
]);

/** Run i created at 2025-01-01 00:{i*10} minutes (i in 1..9). */
function createdAtFor(i) {
  const minutes = i * 10;
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `2025-01-01T${hh}:${mm}:00.000Z`;
}

function ts(base, offsetSec) {
  return new Date(Date.parse(base) + offsetSec * 1000).toISOString();
}

async function createStore(repo) {
  return RunStore.create({
    cwd: repo.root,
    targetBaseSha: TEST_TARGET_SHA,
    configDigest: TEST_CONFIG_DIGEST,
    options: {},
  });
}

/** Pin run.json createdAt AFTER finalization (fixture-only; events untouched). */
function pinCreatedAt(store, createdAt) {
  const runJsonPath = path.join(store.runDir, 'run.json');
  const rec = JSON.parse(fs.readFileSync(runJsonPath, 'utf8'));
  rec.createdAt = createdAt;
  fs.writeFileSync(runJsonPath, `${JSON.stringify(rec, null, 2)}\n`);
}

function usage(input, output) {
  return { inputTokens: input, outputTokens: output, totalTokens: input + output };
}

/** Start one invocation with a deterministic startedAt. */
async function startInv(store, { workUnitId, base, at, provider = 'deepseek', model = 'deepseek-flash', role = 'WORKER', reasoning = 'xhigh' }) {
  const inv = await store.startInvocation({
    workUnitId,
    provider,
    model,
    role,
    reasoningEffort: reasoning,
    occurredAt: ts(base, at),
  });
  return { inv, invocationId: inv.invocationId };
}

/**
 * Build the full 9-run fixture.
 * @returns {{ repo: {root}, runtimeRoot: string,
 *   runs: Array<{ scenarioId, runId, createdAt, workUnits: Array<{workUnitId, invocationIds}> }> }}
 */
export async function buildAuditFixture(t) {
  const repo = await makeGitRepo(t);
  const runs = [];

  // --- run 1: accepted first pass (+ raw sink samples) ---------------------
  {
    const base = createdAtFor(1);
    const store = await RunStore.create({
      cwd: repo.root,
      targetBaseSha: TEST_TARGET_SHA,
      configDigest: TEST_CONFIG_DIGEST,
      options: { enableRawSink: true },
    });
    for (const sample of RAW_SINK_SAMPLES) await store.appendRaw(sample);
    const wuId = generateId('work-unit');
    const { inv, invocationId } = await startInv(store, { workUnitId: wuId, base, at: 1 });
    await inv.complete({ outcome: 'SUCCESS', usage: usage(10, 20), occurredAt: ts(base, 2) });
    await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: ts(base, 3) });
    await store.finalize();
    pinCreatedAt(store, base);
    runs.push({ scenarioId: 'accepted-first-pass', runId: store.runId, createdAt: base, workUnits: [{ workUnitId: wuId, invocationIds: [invocationId] }] });
  }

  // --- run 2: repair acceptance ----------------------------------------------
  {
    const base = createdAtFor(2);
    const store = await createStore(repo);
    const wuId = generateId('work-unit');
    const { inv: inv1, invocationId: id1 } = await startInv(store, { workUnitId: wuId, base, at: 1 });
    await inv1.complete({ outcome: 'SUCCESS', usage: usage(15, 25), occurredAt: ts(base, 2) });
    await inv1.assess({ assessmentResult: 'REJECTED', rejectionCode: 'SEMANTIC_CONFLATION', occurredAt: ts(base, 3) });
    const { inv: inv2, invocationId: id2 } = await startInv(store, { workUnitId: wuId, base, at: 4 });
    await inv2.complete({ outcome: 'SUCCESS', usage: usage(20, 30), occurredAt: ts(base, 5) });
    await inv2.assess({ assessmentResult: 'ACCEPTED', occurredAt: ts(base, 6) });
    await store.finalize();
    pinCreatedAt(store, base);
    runs.push({ scenarioId: 'repair-acceptance', runId: store.runId, createdAt: base, workUnits: [{ workUnitId: wuId, invocationIds: [id1, id2] }] });
  }

  // --- run 3: semantic rejection ----------------------------------------------
  {
    const base = createdAtFor(3);
    const store = await createStore(repo);
    const wuId = generateId('work-unit');
    const { inv, invocationId } = await startInv(store, { workUnitId: wuId, base, at: 1 });
    await inv.complete({ outcome: 'SUCCESS', usage: usage(25, 35), occurredAt: ts(base, 2) });
    await inv.assess({ assessmentResult: 'REJECTED', rejectionCode: 'UNRESOLVED_SEMANTICS', occurredAt: ts(base, 3) });
    await store.finalize();
    pinCreatedAt(store, base);
    runs.push({ scenarioId: 'semantic-rejection', runId: store.runId, createdAt: base, workUnits: [{ workUnitId: wuId, invocationIds: [invocationId] }] });
  }

  // --- run 4: transport failure with useful patch -----------------------------
  {
    const base = createdAtFor(4);
    const store = await createStore(repo);
    const wuId = generateId('work-unit');
    const { inv, invocationId } = await startInv(store, { workUnitId: wuId, base, at: 1 });
    await inv.complete({
      outcome: 'TRANSPORT_ERROR',
      rejectionCode: 'TRANSPORT_MALFORMED',
      usage: usage(30, 40),
      occurredAt: ts(base, 2),
    });
    // Controller assessed the delivered patch USEFUL despite the transport
    // defect — transport validity and patch usefulness are separate states.
    await inv.assess({ assessmentResult: 'ACCEPTED', occurredAt: ts(base, 3) });
    await store.finalize();
    pinCreatedAt(store, base);
    runs.push({ scenarioId: 'transport-failure-useful-patch', runId: store.runId, createdAt: base, workUnits: [{ workUnitId: wuId, invocationIds: [invocationId] }] });
  }

  // --- run 5: wrong base ---------------------------------------------------------
  {
    const base = createdAtFor(5);
    const store = await createStore(repo);
    const wuId = generateId('work-unit');
    const { inv, invocationId } = await startInv(store, { workUnitId: wuId, base, at: 1 });
    await inv.complete({ outcome: 'SUCCESS', usage: usage(35, 45), occurredAt: ts(base, 2) });
    await inv.assess({ assessmentResult: 'REJECTED', rejectionCode: 'WRONG_BASE', occurredAt: ts(base, 3) });
    await store.finalize();
    pinCreatedAt(store, base);
    runs.push({ scenarioId: 'wrong-base', runId: store.runId, createdAt: base, workUnits: [{ workUnitId: wuId, invocationIds: [invocationId] }] });
  }

  // --- run 6: SOL review sequence (no canonical finding/recheck linkage) ---------
  {
    const base = createdAtFor(6);
    const store = await createStore(repo);

    const wuA = generateId('work-unit');
    const { inv: f1, invocationId: f1id } = await startInv(store, { workUnitId: wuA, base, at: 1, role: 'SOL' });
    await f1.complete({ outcome: 'SUCCESS', usage: usage(40, 50), occurredAt: ts(base, 2) });
    await f1.assess({ assessmentResult: 'ACCEPTED', summary: 'SOL_DIAGNOSE finding: acceptance contract AC-3 is ambiguous about null handling; must-change: clarify AC-3 semantics', evidenceRefs: ['lcim_ev_00000000000000000000000000000001'], occurredAt: ts(base, 3) });
    const { inv: r1, invocationId: r1id } = await startInv(store, { workUnitId: wuA, base, at: 4 });
    await r1.complete({ outcome: 'SUCCESS', usage: usage(45, 55), occurredAt: ts(base, 5) });
    await r1.assess({ assessmentResult: 'ACCEPTED', occurredAt: ts(base, 6) });
    const { inv: c1, invocationId: c1id } = await startInv(store, { workUnitId: wuA, base, at: 7, role: 'SOL' });
    await c1.complete({ outcome: 'SUCCESS', usage: usage(50, 60), occurredAt: ts(base, 8) });
    await c1.assess({ assessmentResult: 'REJECTED', rejectionCode: 'SEMANTIC_CONFLATION', summary: 'SOL_RECHECK finding persists: AC-3 ambiguity not resolved by repair; still not falsifiable', evidenceRefs: ['lcim_ev_00000000000000000000000000000002'], occurredAt: ts(base, 9) });

    const wuB = generateId('work-unit');
    const { inv: f2, invocationId: f2id } = await startInv(store, { workUnitId: wuB, base, at: 11, role: 'SOL' });
    await f2.complete({ outcome: 'SUCCESS', usage: usage(55, 65), occurredAt: ts(base, 12) });
    await f2.assess({ assessmentResult: 'ACCEPTED', summary: 'SOL_DIAGNOSE finding: evidence E-2 lacks a falsifiable test; repair must add a counterexample test', evidenceRefs: ['lcim_ev_00000000000000000000000000000003'], occurredAt: ts(base, 13) });
    const { inv: r2, invocationId: r2id } = await startInv(store, { workUnitId: wuB, base, at: 14 });
    await r2.complete({ outcome: 'SUCCESS', usage: usage(60, 70), occurredAt: ts(base, 15) });
    await r2.assess({ assessmentResult: 'ACCEPTED', occurredAt: ts(base, 16) });
    const { inv: c2, invocationId: c2id } = await startInv(store, { workUnitId: wuB, base, at: 17, role: 'SOL' });
    await c2.complete({ outcome: 'SUCCESS', usage: usage(65, 75), occurredAt: ts(base, 18) });
    await c2.assess({ assessmentResult: 'ACCEPTED', summary: 'SOL_RECHECK resolved: E-2 falsifiable test added; no adjacent critical defect', evidenceRefs: ['lcim_ev_00000000000000000000000000000004'], occurredAt: ts(base, 19) });

    await store.finalize();
    pinCreatedAt(store, base);
    runs.push({
      scenarioId: 'sol-finding-recheck',
      runId: store.runId,
      createdAt: base,
      workUnits: [
        { workUnitId: wuA, invocationIds: [f1id, r1id, c1id] },
        { workUnitId: wuB, invocationIds: [f2id, r2id, c2id] },
      ],
    });
  }

  // --- run 7: incomplete ledger ---------------------------------------------------
  {
    const base = createdAtFor(7);
    const store = await createStore(repo);
    const wuId = generateId('work-unit');
    const { inv, invocationId } = await startInv(store, { workUnitId: wuId, base, at: 1 });
    // invocation is left STARTED (crash) -> finalizer marks INCOMPLETE_LEDGER
    await store.finalize();
    pinCreatedAt(store, base);
    runs.push({ scenarioId: 'incomplete-ledger', runId: store.runId, createdAt: base, workUnits: [{ workUnitId: wuId, invocationIds: [invocationId] }] });
  }

  // --- run 8: orphan + unknown usage ------------------------------------------------
  {
    const base = createdAtFor(8);
    const store = await createStore(repo);
    const wuOrphan = generateId('work-unit');
    const { inv: o1 } = await startInv(store, { workUnitId: wuOrphan, base, at: 1 });
    const o1id = o1.invocationId;
    await store.reconcileInvocation({ invocationId: o1id, reason: 'CRASH_AFTER_START', occurredAt: ts(base, 2) });

    const wuNoUsage = generateId('work-unit');
    const { inv: n1, invocationId: n1id } = await startInv(store, { workUnitId: wuNoUsage, base, at: 3 });
    // No usage recorded on purpose: provider usage unavailable
    await n1.complete({ outcome: 'SUCCESS', occurredAt: ts(base, 4) });
    await n1.assess({ assessmentResult: 'ACCEPTED', occurredAt: ts(base, 5) });

    await store.finalize();
    pinCreatedAt(store, base);
    runs.push({
      scenarioId: 'orphan-unknown-usage',
      runId: store.runId,
      createdAt: base,
      workUnits: [
        { workUnitId: wuOrphan, invocationIds: [o1id] },
        { workUnitId: wuNoUsage, invocationIds: [n1id] },
      ],
    });
  }

  // --- run 9: mixed providers / Pro / SOL_PRO ------------------------------------------
  {
    const base = createdAtFor(9);
    const store = await createStore(repo);
    const wuId = generateId('work-unit');
    const { inv: i1, invocationId: i1id } = await startInv(store, { workUnitId: wuId, base, at: 1 });
    await i1.complete({ outcome: 'SUCCESS', usage: usage(70, 80), occurredAt: ts(base, 2) });
    await i1.assess({ assessmentResult: 'ACCEPTED', occurredAt: ts(base, 3) });

    const { inv: i2, invocationId: i2id } = await startInv(store, { workUnitId: wuId, base, at: 4, model: 'deepseek-pro-max', reasoning: 'MAX' });
    await i2.complete({ outcome: 'SUCCESS', usage: usage(75, 85), occurredAt: ts(base, 5) });
    await i2.assess({ assessmentResult: 'REJECTED', rejectionCode: 'SCOPE_VIOLATION', occurredAt: ts(base, 6) });

    const { inv: i3, invocationId: i3id } = await startInv(store, { workUnitId: wuId, base, at: 7, role: 'SOL' });
    await i3.complete({ outcome: 'SUCCESS', usage: usage(80, 90), occurredAt: ts(base, 8) });
    await i3.assess({ assessmentResult: 'ACCEPTED', summary: 'SOL_FINAL_REVIEW no critical findings on named invariants I-1..I-3', evidenceRefs: ['lcim_ev_00000000000000000000000000000005'], occurredAt: ts(base, 9) });

    const { inv: i4, invocationId: i4id } = await startInv(store, { workUnitId: wuId, base, at: 10, provider: 'chatgpt', model: 'gpt-4o', role: 'SOL_PRO', reasoning: 'MAX' });
    await i4.complete({ outcome: 'SUCCESS', usage: usage(85, 95), occurredAt: ts(base, 11) });
    await i4.assess({ assessmentResult: 'ACCEPTED', summary: 'SOL_PRO final review: invariant I-2 wording tightened; otherwise clean', evidenceRefs: ['lcim_ev_00000000000000000000000000000006'], occurredAt: ts(base, 12) });

    await store.finalize();
    pinCreatedAt(store, base);
    runs.push({ scenarioId: 'mixed-providers', runId: store.runId, createdAt: base, workUnits: [{ workUnitId: wuId, invocationIds: [i1id, i2id, i3id, i4id] }] });
  }

  return { repo, runtimeRoot: resolveRuntimeRoot(repo.root), runs };
}
