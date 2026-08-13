/**
 * LCIM V2 Sprint 08 independent canonical reconciliation.
 *
 * Expectations below derive directly from loaded canonical Sprint-01 state
 * maps, never from another projection. Identity-multiset comparison catches
 * duplicate+omission corruption that count-only reconciliation misses.
 */

import { compareStartedStates } from './time.mjs';

function key(runId, id) {
  return `${runId}\u0000${id}`;
}

function multiset(values) {
  const out = new Map();
  for (const value of values) out.set(value, (out.get(value) ?? 0) + 1);
  return out;
}

function multisetDiff(expectedValues, actualValues) {
  const expected = multiset(expectedValues);
  const actual = multiset(actualValues);
  const missing = [];
  const unexpected = [];
  for (const [id, count] of expected) {
    const delta = count - (actual.get(id) ?? 0);
    for (let i = 0; i < Math.max(0, delta); i += 1) missing.push(id);
  }
  for (const [id, count] of actual) {
    const delta = count - (expected.get(id) ?? 0);
    for (let i = 0; i < Math.max(0, delta); i += 1) unexpected.push(id);
  }
  return { ok: missing.length === 0 && unexpected.length === 0, missing: missing.sort(), unexpected: unexpected.sort() };
}

function canonicalGroups(loadedRuns) {
  const groups = new Map();
  for (const lr of loadedRuns) {
    for (const state of lr.states.values()) {
      const identity = key(lr.runId, state.workUnitId);
      if (!groups.has(identity)) groups.set(identity, { runId: lr.runId, workUnitId: state.workUnitId, states: [] });
      groups.get(identity).states.push(state);
    }
  }
  for (const group of groups.values()) group.states.sort(compareStartedStates);
  return groups;
}

/**
 * Canonical WORKER classification is intentionally implemented here rather
 * than calling projection helpers: reconciliation must detect a projection
 * classifier regression instead of reproducing it from the same code path.
 */
function canonicalWorkUnitStatus(worker) {
  if (worker.length === 0) return 'UNKNOWN';
  if (worker.some((state) => state.assessmentResult === 'ACCEPTED')) return 'ACCEPTED';
  if (worker.some((state) => state.assessmentResult === 'REJECTED')) return 'REJECTED';
  if (worker.every((state) => state.status === 'ORPHANED' || state.status === 'SUPERSEDED')) return 'RECONCILED';
  if (worker.some((state) => state.status === 'STARTED' || state.status === 'COMPLETED')) return 'INCOMPLETE';
  return 'UNKNOWN';
}

function canonicalFirstPassAccepted(worker) {
  const first = [...worker].sort(compareStartedStates)[0] ?? null;
  if (first === null) return null;
  if (first.assessmentResult === 'ACCEPTED') return true;
  if (first.assessmentResult === 'REJECTED') return false;
  return null;
}

function canonicalRepairAccepted(worker) {
  let rejectedSeen = false;
  for (const state of [...worker].sort(compareStartedStates)) {
    if (state.assessmentResult === 'REJECTED') rejectedSeen = true;
    if (state.assessmentResult === 'ACCEPTED' && rejectedSeen) return true;
  }
  return false;
}

function canonicalWorkUnitClasses(loadedRuns) {
  const out = new Map();
  for (const [identity, group] of canonicalGroups(loadedRuns)) {
    const worker = group.states.filter((state) => state.role === 'WORKER');
    out.set(identity, {
      status: canonicalWorkUnitStatus(worker),
      firstPassAccepted: canonicalFirstPassAccepted(worker),
      repairAccepted: canonicalRepairAccepted(worker),
    });
  }
  return out;
}

function projectionWorkUnitClasses(workUnits) {
  const out = new Map();
  for (const line of workUnits) {
    const identity = key(line.runId, line.workUnitId);
    // Preserve duplicates as unique synthetic suffixes for identity check;
    // classification map itself only validates unique valid lines.
    if (!out.has(identity)) out.set(identity, {
      status: line.status,
      firstPassAccepted: line.firstPassAccepted,
      repairAccepted: line.repairAccepted,
    });
  }
  return out;
}

function check(name, expected, actual, detail = null) {
  return { name, expected, actual, detail, ok: detail?.ok ?? expected === actual };
}

/**
 * Build reconciliation from canonical state identity sets and lifecycle
 * summaries. `metrics` is used only for a separately declared metric
 * cross-check, never to construct canonical expectations.
 */
export function buildReconciliation({ loadedRuns, invocations, workUnits, reviews, usage, metrics }) {
  const ledger = { events: 0, invocations: 0, starts: 0, completions: 0, assessments: 0, reconciliations: 0 };
  const canonicalInvocationIds = [];
  const canonicalInvocationFacts = new Map();
  const canonicalReviewIds = [];
  const canonicalReviewRoles = new Map();
  let canonicalAssessed = 0;
  let canonicalRejected = 0;
  let canonicalReconciled = 0;
  const lifecycleFromStates = { starts: 0, completions: 0, assessments: 0, reconciliations: 0 };

  for (const lr of loadedRuns) {
    const summary = lr.summary;
    ledger.events += summary?.events ?? 0;
    ledger.invocations += summary?.invocations ?? 0;
    ledger.starts += summary?.starts ?? 0;
    ledger.completions += summary?.completions ?? 0;
    ledger.assessments += summary?.assessments ?? 0;
    ledger.reconciliations += summary?.reconciliations ?? 0;
    for (const state of lr.states.values()) {
      lifecycleFromStates.starts += state.counts?.START ?? 0;
      lifecycleFromStates.completions += state.counts?.COMPLETION ?? 0;
      lifecycleFromStates.assessments += state.counts?.ASSESSMENT ?? 0;
      lifecycleFromStates.reconciliations += state.counts?.RECONCILIATION ?? 0;
      const invocationKey = key(state.runId, state.invocationId);
      canonicalInvocationIds.push(invocationKey);
      canonicalInvocationFacts.set(invocationKey, {
        status: state.status,
        role: state.role,
        outcome: state.outcome ?? null,
        assessmentResult: state.assessmentResult ?? null,
        rejectionCode: state.rejectionCode ?? null,
      });
      if (state.role === 'SOL' || state.role === 'SOL_PRO') {
        const reviewKey = key(state.runId, state.invocationId);
        canonicalReviewIds.push(reviewKey);
        canonicalReviewRoles.set(reviewKey, state.role);
      }
      if (state.status === 'ASSESSED') canonicalAssessed += 1;
      if (state.assessmentResult === 'REJECTED') canonicalRejected += 1;
      if (state.status === 'ORPHANED' || state.status === 'SUPERSEDED') canonicalReconciled += 1;
    }
  }

  const invocationIdentity = multisetDiff(canonicalInvocationIds, invocations.map((line) => key(line.runId, line.invocationId)));
  const invocationFactMismatches = invocations
    .filter((line) => {
      const expected = canonicalInvocationFacts.get(key(line.runId, line.invocationId));
      return !expected ||
        line.status !== expected.status ||
        line.role !== expected.role ||
        (line.outcome ?? null) !== expected.outcome ||
        (line.assessmentResult ?? null) !== expected.assessmentResult ||
        (line.rejectionCode ?? null) !== expected.rejectionCode;
    })
    .map((line) => key(line.runId, line.invocationId))
    .sort();
  const invocationFactDetail = { ok: invocationFactMismatches.length === 0, missing: invocationFactMismatches, unexpected: [] };
  const usageIdentity = multisetDiff(canonicalInvocationIds, usage.map((line) => key(line.runId, line.invocationId)));
  const reviewIdentity = multisetDiff(canonicalReviewIds, reviews.map((line) => key(line.runId, line.reviewInvocationId)));
  const reviewRoleMismatches = reviews
    .filter((line) => canonicalReviewRoles.get(key(line.runId, line.reviewInvocationId)) !== line.role)
    .map((line) => key(line.runId, line.reviewInvocationId))
    .sort();
  const reviewRoleDetail = { ok: reviewRoleMismatches.length === 0, missing: reviewRoleMismatches, unexpected: [] };
  const canonicalClasses = canonicalWorkUnitClasses(loadedRuns);
  const canonicalWorkUnitIds = [...canonicalClasses.keys()];
  const canonicalOutcomeBuckets = { total: canonicalWorkUnitIds.length, accepted: 0, rejected: 0, reconciled: 0, incomplete: 0, unknown: 0 };
  for (const expected of canonicalClasses.values()) {
    const bucket = expected.status === 'RECONCILED' ? 'reconciled' : String(expected.status ?? 'UNKNOWN').toLowerCase();
    canonicalOutcomeBuckets[bucket] = (canonicalOutcomeBuckets[bucket] ?? 0) + 1;
  }
  const workUnitIdentity = multisetDiff(canonicalWorkUnitIds, workUnits.map((line) => key(line.runId, line.workUnitId)));

  const actualClasses = projectionWorkUnitClasses(workUnits);
  const classMismatches = [];
  for (const [identity, expected] of canonicalClasses) {
    const actual = actualClasses.get(identity);
    if (
      !actual ||
      actual.status !== expected.status ||
      actual.firstPassAccepted !== expected.firstPassAccepted ||
      actual.repairAccepted !== expected.repairAccepted
    ) {
      classMismatches.push(identity);
    }
  }
  const classDetail = { ok: classMismatches.length === 0, missing: classMismatches.sort(), unexpected: [] };
  const metricOutcomeMismatch = Object.keys(canonicalOutcomeBuckets)
    .filter((bucket) => canonicalOutcomeBuckets[bucket] !== metrics.workUnits[bucket])
    .sort();
  const metricOutcomeDetail = { ok: metricOutcomeMismatch.length === 0, missing: metricOutcomeMismatch, unexpected: [] };

  const checks = [
    check('invocation identities == canonical START identities', canonicalInvocationIds.length, invocations.length, invocationIdentity),
    check('invocation lifecycle/role/assessment fields == canonical states', canonicalInvocationIds.length, invocations.length, invocationFactDetail),
    check('usage identities == canonical START identities', canonicalInvocationIds.length, usage.length, usageIdentity),
    check('review identities == canonical SOL/SOL_PRO identities', canonicalReviewIds.length, reviews.length, reviewIdentity),
    check('review roles == canonical SOL/SOL_PRO membership', canonicalReviewIds.length, reviews.length, reviewRoleDetail),
    check('work-unit identities == canonical run/work-unit identities', canonicalWorkUnitIds.length, workUnits.length, workUnitIdentity),
    check('work-unit implementation status/first-pass/repair classification == canonical WORKER assessments', canonicalWorkUnitIds.length, workUnits.length, classDetail),
    check('work-unit outcome metric buckets == canonical WORKER classifications', canonicalWorkUnitIds.length, metrics.workUnits.total, metricOutcomeDetail),
    check('canonical START event count == ledger starts', ledger.starts, lifecycleFromStates.starts),
    check('canonical COMPLETION event count == ledger completions', ledger.completions, lifecycleFromStates.completions),
    check('canonical ASSESSMENT event count == ledger assessments', ledger.assessments, lifecycleFromStates.assessments),
    check('canonical RECONCILIATION event count == ledger reconciliations', ledger.reconciliations, lifecycleFromStates.reconciliations),
    check('assessed invocation states == ledger assessments', ledger.assessments, canonicalAssessed),
    check('REJECTED assessment states == rejected invocation projection count', canonicalRejected, invocations.filter((line) => line.assessmentResult === 'REJECTED').length),
    check('rejected invocation projection count == rejection-taxonomy metric', invocations.filter((line) => line.assessmentResult === 'REJECTED').length, metrics.rejections.total),
    check('reconciliation-closed invocation states == ledger reconciliation events', ledger.reconciliations, canonicalReconciled),
    check('canonical START identities == canonical start count', ledger.starts, canonicalInvocationIds.length),
    check('ledger event total == lifecycle event-kind total', ledger.events, ledger.starts + ledger.completions + ledger.assessments + ledger.reconciliations),
  ];

  const mismatches = [];
  for (const item of checks) {
    if (!item.ok) {
      const suffix = item.detail ? ` (missing ${item.detail.missing.length}, unexpected ${item.detail.unexpected.length})` : '';
      mismatches.push(`${item.name}: expected ${item.expected}, got ${item.actual}${suffix}`);
    }
  }

  return {
    ok: mismatches.length === 0,
    runs: loadedRuns.length,
    ledger,
    projections: {
      invocations: invocations.length,
      workUnits: workUnits.length,
      reviews: reviews.length,
      usage: usage.length,
    },
    checks,
    mismatches,
  };
}
