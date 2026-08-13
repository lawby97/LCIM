/**
 * LCIM V2 Sprint 08 workflow metrics.
 *
 * Metrics consume sanitized projections plus independently loaded canonical
 * run states. Unknown remains distinct from known zero throughout:
 * incomplete usage/pricing never becomes a total cost, unassessed calls
 * never become rejected waste, and unavailable finding linkage never
 * becomes zero findings.
 */

import { getVersionInfo } from '../config/version.mjs';
import { sanitizeVersion } from './sanitize.mjs';
import {
  FAILED_OUTCOMES,
  SEMANTIC_REJECTION_CODES,
  TRANSPORT_SCHEMA_CODES,
  isProModel,
  isTransportSchemaCode,
} from './project.mjs';

/**
 * Prototype-safe deterministic dimension counts. Map protects values such
 * as `toString` and `__proto__`; Object.fromEntries creates ordinary own
 * data properties in sorted order for stable JSON output.
 */
export function countBy(lines, key) {
  const counts = new Map();
  for (const line of lines) {
    const value = line[key];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0)));
}

/** Rate helper: value/total or null when denominator has no known members. */
function rate(value, total) {
  return total > 0 ? value / total : null;
}

function sum(lines, field) {
  return lines.reduce((n, line) => n + line[field], 0);
}

function costReason({ missingUsage, missingPricing }) {
  if (missingUsage && missingPricing) return 'MISSING_USAGE_AND_PRICING';
  if (missingUsage) return 'MISSING_USAGE';
  if (missingPricing) return 'MISSING_PRICING';
  return null;
}

function completeCostMetric(lines) {
  const totalCallCount = lines.length;
  const knownUsage = lines.filter((line) => line.usageAvailability === 'AVAILABLE');
  const priced = knownUsage.filter((line) => line.costAvailability === 'COMPUTED' && line.costUsd !== null);
  const missingUsage = knownUsage.length !== totalCallCount;
  const missingPricing = priced.length !== knownUsage.length;
  const subtotal = Number(sum(priced, 'costUsd').toFixed(6));
  // Empty selected history is a known zero, not an unavailable fact.
  const complete = !missingUsage && !missingPricing;
  return {
    availability: complete ? 'COMPUTED' : 'UNKNOWN',
    available: complete,
    usd: complete ? subtotal : null,
    reason: complete ? null : costReason({ missingUsage, missingPricing }),
    knownCostSubtotal: subtotal,
    knownUsageCallCount: knownUsage.length,
    pricedCallCount: priced.length,
    totalCallCount,
  };
}

function completeTokenMetric(lines) {
  const totalCallCount = lines.length;
  const knownUsage = lines.filter((line) => line.usageAvailability === 'AVAILABLE');
  // An empty explicit-rejected set is a known zero, not unavailable.
  const complete = knownUsage.length === totalCallCount;
  const subtotal = knownUsage.reduce((n, l) => n + l.usage.totalTokens, 0);
  return {
    availability: complete,
    available: complete,
    value: complete ? subtotal : null,
    reason: complete ? null : 'MISSING_USAGE',
    knownTokenSubtotal: subtotal,
    knownUsageCallCount: knownUsage.length,
    totalCallCount,
  };
}

/** Historical LCIM identity aggregation from selected canonical run records. */
function historicalLcimIdentity(loadedRuns) {
  if (loadedRuns.length === 0) {
    return {
      version: 'UNKNOWN',
      commit: null,
      availability: false,
      reason: 'NO_HISTORICAL_RUNS',
      versions: [],
    };
  }
  const groups = new Map();
  for (const lr of loadedRuns) {
    const version = lr.run?.lcimVersion === null || lr.run?.lcimVersion === undefined
      ? 'UNKNOWN'
      : sanitizeVersion(lr.run.lcimVersion);
    const commit = lr.run?.lcimCommit ?? null;
    const key = `${version}\u0000${commit ?? ''}`;
    const entry = groups.get(key) ?? { version, commit, runs: 0, calls: 0 };
    entry.runs += 1;
    entry.calls += lr.states.size;
    groups.set(key, entry);
  }
  const versions = [...groups.values()].sort((a, b) => {
    const av = `${a.version}\u0000${a.commit ?? ''}`;
    const bv = `${b.version}\u0000${b.commit ?? ''}`;
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
  if (versions.length === 1) {
    return { version: versions[0].version, commit: versions[0].commit, availability: true, reason: null, versions };
  }
  return { version: 'MIXED', commit: null, availability: true, reason: null, versions };
}

/** Compute the full metrics object. */
export function computeMetrics({ invocations, workUnits, reviews, usage, loadedRuns }) {
  const lcim = historicalLcimIdentity(loadedRuns);

  const calls = {
    total: invocations.length,
    byProvider: countBy(invocations, 'provider'),
    byModel: countBy(invocations, 'model'),
    byRole: countBy(invocations, 'role'),
    byReasoning: countBy(invocations, 'reasoningEffort'),
  };

  const workUnitOutcomes = { total: workUnits.length, accepted: 0, rejected: 0, reconciled: 0, incomplete: 0, unknown: 0 };
  for (const wu of workUnits) {
    const bucket = wu.status === 'RECONCILED' ? 'reconciled' : String(wu.status ?? 'UNKNOWN').toLowerCase();
    workUnitOutcomes[bucket] = (workUnitOutcomes[bucket] ?? 0) + 1;
  }
  const knownFirstPass = workUnits.filter((wu) => typeof wu.firstPassAccepted === 'boolean');
  const firstPassAccepted = knownFirstPass.filter((wu) => wu.firstPassAccepted === true).length;
  const firstPassRejected = knownFirstPass.filter((wu) => wu.firstPassAccepted === false).length;
  const firstPassUnknown = workUnits.length - knownFirstPass.length;
  const repairAccepted = workUnits.filter((wu) => wu.repairAccepted === true).length;
  const acceptance = {
    firstPassAccepted,
    firstPassRejected,
    firstPassUnknown,
    firstPassKnownCount: knownFirstPass.length,
    firstPassAcceptedRate: rate(firstPassAccepted, knownFirstPass.length),
    repairAccepted,
    repairAcceptedRate: rate(repairAccepted, workUnitOutcomes.accepted),
    acceptanceRate: rate(workUnitOutcomes.accepted, workUnitOutcomes.total),
  };

  const rejectedLines = invocations.filter((l) => l.assessmentResult === 'REJECTED');
  const byCode = countBy(rejectedLines.map((l) => ({ code: l.rejectionCode ?? 'UNKNOWN' })), 'code');
  const taxonomy = [...SEMANTIC_REJECTION_CODES, ...TRANSPORT_SCHEMA_CODES, 'WRONG_BASE', 'SCOPE_VIOLATION', 'INCOMPLETE_LEDGER', 'BUDGET_EXHAUSTED', 'SECRET_DENIED_PATH', 'SOL_ASK_INVALID', 'UNKNOWN'];
  const bucket = (codes) => {
    const inner = Object.fromEntries([...codes].sort().map((code) => [code, byCode[code] ?? 0]));
    return { total: Object.values(inner).reduce((n, v) => n + v, 0), byCode: inner };
  };
  const rejections = {
    total: rejectedLines.length,
    byCode,
    semantic: bucket(SEMANTIC_REJECTION_CODES),
    transportSchema: bucket(TRANSPORT_SCHEMA_CODES),
    wrongBase: bucket(['WRONG_BASE']),
    scopeViolations: bucket(['SCOPE_VIOLATION']),
    other: bucket(taxonomy.filter((code) => !SEMANTIC_REJECTION_CODES.includes(code) && !TRANSPORT_SCHEMA_CODES.includes(code) && code !== 'WRONG_BASE' && code !== 'SCOPE_VIOLATION')),
  };

  const outcomeFailures = { total: 0, byOutcome: Object.fromEntries(FAILED_OUTCOMES.map((o) => [o, 0])) };
  for (const line of invocations) {
    if (line.outcome !== undefined && FAILED_OUTCOMES.includes(line.outcome)) {
      outcomeFailures.byOutcome[line.outcome] += 1;
      outcomeFailures.total += 1;
    }
  }
  const transportCodeLines = invocations.filter((l) => isTransportSchemaCode(l.rejectionCode));
  const transportCodeByCode = Object.fromEntries(TRANSPORT_SCHEMA_CODES.map((code) => [code, 0]));
  for (const line of transportCodeLines) transportCodeByCode[line.rejectionCode] += 1;
  const usefulPatchDespiteTransportFailure = invocations.filter(
    (l) => l.assessmentResult === 'ACCEPTED' && ((l.outcome !== undefined && FAILED_OUTCOMES.includes(l.outcome)) || isTransportSchemaCode(l.rejectionCode)),
  ).length;
  const transport = {
    outcomeFailures,
    transportSchemaRejections: { total: transportCodeLines.length, byCode: transportCodeByCode },
    usefulPatchDespiteTransportFailure,
  };

  const solCalls = invocations.filter((l) => l.role === 'SOL').length;
  const solProCalls = invocations.filter((l) => l.role === 'SOL_PRO').length;
  const proModelCalls = invocations.filter((l) => l.role === 'WORKER' && isProModel(l.model)).length;
  const totalEscalated = solCalls + solProCalls + proModelCalls;
  const escalation = {
    solCalls,
    solProCalls,
    proModelCalls,
    totalEscalated,
    escalatedRate: rate(totalEscalated, calls.total),
    solRate: rate(solCalls, calls.total),
    solProRate: rate(solProCalls, calls.total),
    proModelRate: rate(proModelCalls, calls.total),
  };

  const callsPerAcceptedWorkUnit = {
    value: workUnitOutcomes.accepted > 0 ? calls.total / workUnitOutcomes.accepted : null,
    available: workUnitOutcomes.accepted > 0,
    reason: workUnitOutcomes.accepted > 0 ? null : 'NO_ACCEPTED_IMPLEMENTATION_WORK_UNITS',
  };

  const availableUsage = usage.filter((l) => l.usageAvailability === 'AVAILABLE');
  const unavailableCalls = usage.length - availableUsage.length;
  const tokenComplete = availableUsage.length === usage.length;
  const knownInputTokenSubtotal = availableUsage.reduce((n, l) => n + l.usage.inputTokens, 0);
  const knownOutputTokenSubtotal = availableUsage.reduce((n, l) => n + l.usage.outputTokens, 0);
  const knownTotalTokenSubtotal = availableUsage.reduce((n, l) => n + l.usage.totalTokens, 0);
  const allCost = completeCostMetric(usage);
  const rejectedUsage = usage.filter((l) => l.rejectedWaste === true);
  const rejectedTokens = completeTokenMetric(rejectedUsage);
  const rejectedCost = completeCostMetric(rejectedUsage);
  const nonRejectedNonAccepted = usage.filter((l) => l.nonAcceptedCategory !== null && l.nonAcceptedCategory !== 'REJECTED');
  const usageMetrics = {
    availableCalls: availableUsage.length,
    unavailableCalls,
    tokens: {
      availability: tokenComplete ? 'COMPUTED' : 'UNKNOWN',
      available: tokenComplete,
      reason: tokenComplete ? null : 'MISSING_USAGE',
      calls: tokenComplete ? usage.length : null,
      inputTokens: tokenComplete ? knownInputTokenSubtotal : null,
      outputTokens: tokenComplete ? knownOutputTokenSubtotal : null,
      totalTokens: tokenComplete ? knownTotalTokenSubtotal : null,
      knownInputTokenSubtotal,
      knownOutputTokenSubtotal,
      knownTotalTokenSubtotal,
      knownUsageCallCount: availableUsage.length,
      totalCallCount: usage.length,
    },
    cost: allCost,
    rejectedWaste: {
      calls: rejectedUsage.length,
      tokens: rejectedTokens,
      cost: rejectedCost,
    },
    nonRejectedNonAccepted: {
      calls: nonRejectedNonAccepted.length,
      byCategory: countBy(nonRejectedNonAccepted, 'nonAcceptedCategory'),
    },
  };

  // Sprint-01 has review calls but no canonical finding/recheck identity or
  // resolution linkage. Null is an unavailable fact, not a known zero.
  const solFindings = {
    availability: 'UNKNOWN',
    reason: 'NO_CANONICAL_FINDING_LINKAGE',
    findings: null,
    rechecks: null,
    survivedFirstRepair: null,
    resolvedByRepair: null,
    severityRecorded: null,
    reviewCallCount: reviews.length,
  };

  const ledgerRuns = { total: loadedRuns.length, completed: 0, incompleteLedger: 0, aborted: 0, open: 0 };
  let incompleteInvocations = 0;
  let orphaned = 0;
  let superseded = 0;
  let reconciliationEvents = 0;
  for (const lr of loadedRuns) {
    const state = lr.run?.lifecycleState;
    if (state === 'COMPLETED') ledgerRuns.completed += 1;
    else if (state === 'INCOMPLETE_LEDGER') ledgerRuns.incompleteLedger += 1;
    else if (state === 'ABORTED') ledgerRuns.aborted += 1;
    else ledgerRuns.open += 1;
    incompleteInvocations += lr.summary?.incompleteInvocationIds?.length ?? 0;
    reconciliationEvents += lr.summary?.reconciliations ?? 0;
    for (const st of lr.states.values()) {
      if (st.status === 'ORPHANED') orphaned += 1;
      if (st.status === 'SUPERSEDED') superseded += 1;
    }
  }
  const ledger = {
    runs: ledgerRuns,
    incompleteInvocations,
    orphans: { orphaned, superseded },
    reconciliationEvents,
    normalizationCount: {
      value: 'UNKNOWN',
      available: false,
      reason: 'NO_CANONICAL_NORMALIZATION_FACT',
    },
  };

  return {
    lcim,
    calls,
    workUnits: workUnitOutcomes,
    acceptance,
    transport,
    rejections,
    escalation,
    callsPerAcceptedWorkUnit,
    usage: usageMetrics,
    solFindings,
    ledger,
  };
}

/** Explicit unavailable historical facts for final.json and REVIEW.md. */
export function collectUnknownFacts({ metrics }) {
  const facts = [
    {
      fact: 'model-reported work status',
      reason: 'NO_CANONICAL_WORKER_STATUS',
    },
    {
      fact: 'semantic acceptance',
      reason: 'NO_CANONICAL_SEMANTIC_ACCEPTANCE_FACT',
    },
    {
      fact: 'final integration disposition (CANDIDATE_INTEGRATED / REVIEW_APPROVED)',
      reason: 'NO_CANONICAL_FINAL_INTEGRATION_FACT',
    },
    {
      fact: 'normalization count',
      reason: metrics.ledger.normalizationCount.reason,
    },
    {
      fact: 'SOL findings/rechecks/survival/severity',
      reason: metrics.solFindings.reason,
    },
  ];
  if (metrics.usage.cost.availability === 'UNKNOWN') {
    facts.push({ fact: 'aggregate tokens/cost', reason: metrics.usage.cost.reason });
  }
  return facts;
}

/** Identity stamp for the running LCIM source (not historical run identity). */
export function auditIdentity() {
  const info = getVersionInfo();
  return { version: sanitizeVersion(info.version), commit: info.gitCommit, schemaVersion: info.schemaVersion };
}
