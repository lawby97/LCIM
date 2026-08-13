/**
 * LCIM V2 Sprint 08 safe REVIEW.md renderer.
 *
 * REVIEW.md is a normal export, not forensic output. It renders only
 * schema-constrained IDs/hashes/enums/counts and already-sanitized
 * dimension labels. Arbitrary canonical summaries, evidence text, paths,
 * validation errors, and notes are deliberately absent.
 */

const SAFE_ID = /^lcim_(?:run|inv|wu|finding)_[0-9a-f]{32}$/;
const SAFE_HASH = /^[0-9a-f]{40,64}$/;
const SAFE_DIMENSION = /^(?:deepseek|chatgpt|deepseek-flash|deepseek-pro-max|gpt-4o|xhigh|MAX|(?:provider|model|reasoning)_[0-9a-f]{16})$/;
const SAFE_VERSION = /^(?:[0-9]+\.[0-9]+\.[0-9]+(?:-(?:dev|rc)\.[0-9]+)?|version_[0-9a-f]{16})$/;
const SAFE_ENUM = /^(?:OPEN|COMPLETED|INCOMPLETE_LEDGER|ABORTED|STARTED|ASSESSED|ORPHANED|SUPERSEDED|ACCEPTED|REJECTED|MIXED|NONE|UNKNOWN|RECONCILED|INCOMPLETE|OK|SEMANTIC_REJECTED|TRANSPORT_FAILURE|SCHEMA_MISMATCH|CALL_FAILURE|NOT_EVALUATED|SUCCESS|FAILURE|TIMEOUT|TRANSPORT_ERROR|CANCELED|SOL|SOL_PRO|WORKER|TRANSPORT_MALFORMED|SEMANTIC_CONFLATION|WRONG_BASE|SCOPE_VIOLATION|UNRESOLVED_SEMANTICS|UNSUPPORTED_CLAIM|BUDGET_EXHAUSTED|SECRET_DENIED_PATH|SOL_ASK_INVALID|OUTSIDE_LAST_N_WINDOW|INVALID_CANONICAL_RUN|NO_CANONICAL_[A-Z_]+|MISSING_[A-Z_]+|NO_[A-Z_]+|FAILED_UNASSESSED)$/;

/** Short safe display form for a canonical ID/hash; no arbitrary input is echoed. */
export function shortId(value) {
  if (typeof value !== 'string') return 'UNKNOWN';
  if (SAFE_ID.test(value)) return `${value.slice(0, 17)}…`;
  if (SAFE_HASH.test(value)) return `${value.slice(0, 12)}…`;
  return 'REDACTED';
}

function enumText(value) {
  return typeof value === 'string' && SAFE_ENUM.test(value) ? value : 'UNKNOWN';
}

function versionText(value) {
  return typeof value === 'string' && SAFE_VERSION.test(value) ? value : 'UNKNOWN';
}

function dimensionText(value) {
  return typeof value === 'string' && SAFE_DIMENSION.test(value) ? value : 'REDACTED';
}

function booleanText(value) {
  return value === true ? 'yes' : value === false ? 'no' : 'UNKNOWN';
}

function numberText(value, digits = 4) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'UNKNOWN';
  let rendered = Number(value).toFixed(digits);
  if (digits > 0) rendered = rendered.replace(/\.0+$/, '').replace(/(\.[0-9]*?)0+$/, '$1');
  return rendered === '' || rendered === '-' ? '0' : rendered;
}

function formatCounts(counts, formatter = dimensionText) {
  const entries = Object.entries(counts ?? {}).filter(([, count]) => count !== 0);
  if (entries.length === 0) return 'none';
  return entries.map(([label, count]) => `${formatter(label)}=${numberText(count, 0)}`).join(', ');
}

function factText(value) {
  const labels = {
    'model-reported work status': 'model-reported work status',
    'semantic acceptance': 'semantic acceptance',
    'final integration disposition (CANDIDATE_INTEGRATED / REVIEW_APPROVED)': 'final integration disposition',
    'normalization count': 'normalization count',
    'SOL findings/rechecks/survival/severity': 'SOL findings/rechecks/survival/severity',
    'aggregate tokens/cost': 'aggregate tokens/cost',
  };
  return labels[value] ?? 'UNKNOWN';
}

function costText(cost) {
  if (cost?.availability === 'COMPUTED') return `**$${numberText(cost.usd, 6)}**`;
  const subtotal = cost?.knownCostSubtotal === null || cost?.knownCostSubtotal === undefined
    ? 'none'
    : `$${numberText(cost.knownCostSubtotal, 6)}`;
  return `**UNKNOWN** (${enumText(cost?.reason)}; known subtotal ${subtotal}; priced ${numberText(cost?.pricedCallCount, 0)}/${numberText(cost?.totalCallCount, 0)} calls)`;
}

/** Render a safe readable workflow review. */
export function renderReviewMarkdown(result, { workUnits = [], reviews = [] } = {}) {
  const { selection, runs, metrics: m, reconciliation, unknownFacts } = result;
  const lines = [];
  const push = (line = '') => lines.push(line);

  push('# LCIM workflow review');
  push();
  push(`- generated: ${typeof result.generatedAt === 'string' ? result.generatedAt : 'UNKNOWN (not canonical evidence)'}`);
  push(`- LCIM historical identity: ${versionText(m.lcim.version)}${m.lcim.commit ? ` (git ${shortId(m.lcim.commit)})` : ''}${m.lcim.reason ? ` — ${enumText(m.lcim.reason)}` : ''}`);
  push(`- runtime: ${typeof selection.runtimeRef === 'string' && /^runtime_[0-9a-f]{16}$/.test(selection.runtimeRef) ? selection.runtimeRef : 'REDACTED'}`);
  push(`- scope: ${selection.last === null ? 'all runs' : `last ${numberText(selection.last, 0)} runs`}; included ${selection.includedRunIds.length}; invalid ${selection.invalidRunIds.length}`);
  push();

  push('## Run overview');
  push('| run | state | LCIM | target base | calls | work units | ledger events |');
  push('|---|---|---|---|---|---|---|');
  for (const run of runs) {
    push(`| ${shortId(run.runId)} | ${enumText(run.lifecycleState)} | ${versionText(run.lcimVersion)} | ${shortId(run.targetBaseSha)} | ${numberText(run.projections?.invocations, 0)} | ${numberText(run.projections?.workUnits, 0)} | ${numberText(run.ledger?.events, 0)} |`);
  }
  push();

  push('## Calls');
  push(`- total calls: **${numberText(m.calls.total, 0)}**`);
  push(`- by provider: ${formatCounts(m.calls.byProvider)}`);
  push(`- by model: ${formatCounts(m.calls.byModel)}`);
  push(`- by role: ${formatCounts(m.calls.byRole, enumText)}`);
  push(`- by reasoning effort: ${formatCounts(m.calls.byReasoning)}`);
  push();

  push('## Work-unit outcomes and separated states');
  push('Model-reported status, semantic acceptance, and final integration are UNKNOWN unless independently canonicalized. Controller acceptance is not semantic acceptance.');
  push();
  push('| work unit | run | calls | implementation outcome | first pass | repair | transport/schema | controller | semantic | integration |');
  push('|---|---|---|---|---|---|---|---|---|---|');
  for (const wu of workUnits) {
    push(`| ${shortId(wu.workUnitId)} | ${shortId(wu.runId)} | ${numberText(wu.invocationCount, 0)} | ${enumText(wu.status)} | ${booleanText(wu.firstPassAccepted)} | ${booleanText(wu.repairAccepted)} | ${enumText(wu.states?.transportSchemaStatus)} | ${enumText(wu.states?.controllerValidation)} | ${enumText(wu.states?.semanticDisposition)} | ${enumText(wu.states?.finalIntegration)} |`);
  }
  push();
  push(`- implementation work units: ${numberText(m.workUnits.total, 0)} — accepted ${numberText(m.workUnits.accepted, 0)}, rejected ${numberText(m.workUnits.rejected, 0)}, reconciled ${numberText(m.workUnits.reconciled, 0)}, incomplete ${numberText(m.workUnits.incomplete, 0)}, unknown ${numberText(m.workUnits.unknown, 0)}`);
  push(`- first-pass acceptance: ${numberText(m.acceptance.firstPassAccepted, 0)} accepted / ${numberText(m.acceptance.firstPassKnownCount, 0)} known; unknown ${numberText(m.acceptance.firstPassUnknown, 0)}`);
  push(`- repair acceptance: ${numberText(m.acceptance.repairAccepted, 0)} (only explicit rejected WORKER → accepted WORKER sequences)`);
  push(`- calls per accepted implementation work unit: ${m.callsPerAcceptedWorkUnit.available ? numberText(m.callsPerAcceptedWorkUnit.value) : `UNKNOWN (${enumText(m.callsPerAcceptedWorkUnit.reason)})`}`);
  push();

  push('## Rejections and transport');
  push(`- rejected assessments: **${numberText(m.rejections.total, 0)}**; taxonomy: ${formatCounts(m.rejections.byCode, enumText)}`);
  push(`- semantic rejections: ${numberText(m.rejections.semantic.total, 0)}; wrong-base ${numberText(m.rejections.wrongBase.total, 0)}; scope ${numberText(m.rejections.scopeViolations.total, 0)}`);
  push(`- failed call outcomes: ${numberText(m.transport.outcomeFailures.total, 0)} (${formatCounts(m.transport.outcomeFailures.byOutcome, enumText)})`);
  push(`- useful patch despite transport failure: ${numberText(m.transport.usefulPatchDespiteTransportFailure, 0)}`);
  push();

  push('## Escalation');
  push(`- SOL ${numberText(m.escalation.solCalls, 0)}; SOL Pro ${numberText(m.escalation.solProCalls, 0)}; Pro-model ${numberText(m.escalation.proModelCalls, 0)}; total rate ${numberText(m.escalation.escalatedRate)}`);
  push();

  push('## Usage and cost');
  push(`- usage available: ${numberText(m.usage.availableCalls, 0)}; unavailable: ${numberText(m.usage.unavailableCalls, 0)}`);
  push(`- known token subtotal: ${numberText(m.usage.tokens.knownInputTokenSubtotal, 0)} in / ${numberText(m.usage.tokens.knownOutputTokenSubtotal, 0)} out / ${numberText(m.usage.tokens.knownTotalTokenSubtotal, 0)} total across ${numberText(m.usage.tokens.knownUsageCallCount, 0)}/${numberText(m.usage.tokens.totalCallCount, 0)} calls${m.usage.tokens.available ? '' : ` (${enumText(m.usage.tokens.reason)})`}`);
  push(`- aggregate cost: ${costText(m.usage.cost)}`);
  push(`- rejected-call waste: ${numberText(m.usage.rejectedWaste.calls, 0)} explicit rejected calls; tokens ${m.usage.rejectedWaste.tokens.availability ? numberText(m.usage.rejectedWaste.tokens.value, 0) : `UNKNOWN (${enumText(m.usage.rejectedWaste.tokens.reason)})`}; cost ${costText(m.usage.rejectedWaste.cost)}`);
  push(`- non-rejected/non-accepted calls: ${numberText(m.usage.nonRejectedNonAccepted.calls, 0)} (${formatCounts(m.usage.nonRejectedNonAccepted.byCategory, enumText)})`);
  push();

  push('## SOL findings');
  push(`- review calls: ${numberText(m.solFindings.reviewCallCount, 0)}`);
  push(`- findings/rechecks/survival: **UNKNOWN** (${enumText(m.solFindings.reason)}) — Sprint-01 contains no finding identity or repair/recheck linkage`);
  push();
  push('| review | work unit | role | outcome | assessment | finding/recheck linkage |');
  push('|---|---|---|---|---|---|');
  for (const review of reviews) {
    push(`| ${shortId(review.reviewInvocationId)} | ${shortId(review.workUnitId)} | ${enumText(review.role)} | ${enumText(review.outcome)} | ${enumText(review.assessmentResult)} | UNKNOWN |`);
  }
  push();

  push('## Ledger completeness');
  push(`- runs: ${numberText(m.ledger.runs.total, 0)} — completed ${numberText(m.ledger.runs.completed, 0)}, incomplete ${numberText(m.ledger.runs.incompleteLedger, 0)}, aborted ${numberText(m.ledger.runs.aborted, 0)}, open ${numberText(m.ledger.runs.open, 0)}`);
  push(`- incomplete invocations: ${numberText(m.ledger.incompleteInvocations, 0)}; orphaned ${numberText(m.ledger.orphans.orphaned, 0)}; superseded ${numberText(m.ledger.orphans.superseded, 0)}`);
  push(`- normalization count: UNKNOWN (${enumText(m.ledger.normalizationCount.reason)})`);
  push();

  push('## Unknown / unavailable facts');
  for (const fact of unknownFacts) push(`- **${factText(fact.fact)}**: ${enumText(fact.reason)}`);
  push();

  push('## Reconciliation against canonical lifecycle evidence');
  push(`- ledger: ${numberText(reconciliation.ledger.events, 0)} events / ${numberText(reconciliation.ledger.starts, 0)} starts / ${numberText(reconciliation.ledger.completions, 0)} completions / ${numberText(reconciliation.ledger.assessments, 0)} assessments / ${numberText(reconciliation.ledger.reconciliations, 0)} reconciliations`);
  push('| check | expected | actual | ok |');
  push('|---|---|---|---|');
  for (const item of reconciliation.checks) {
    push(`| ${item.name.replace(/[^A-Za-z0-9 =/().-]/g, '')} | ${numberText(item.expected, 0)} | ${numberText(item.actual, 0)} | ${item.ok ? 'yes' : 'NO'} |`);
  }
  push(`**Reconciliation: ${reconciliation.ok ? 'OK' : 'FAILED'}**`);
  push();

  push('## Errors');
  if (selection.errors.length === 0) push('None.');
  for (const error of selection.errors) {
    const ref = shortId(error.runId);
    const code = enumText(error.code);
    const digest = typeof error.detailDigest === 'string' && /^[0-9a-f]{64}$/.test(error.detailDigest) ? shortId(error.detailDigest) : '';
    push(`- ${ref}: ${code}${digest ? ` (${digest})` : ''}`);
  }
  push();
  return `${lines.join('\n')}\n`;
}
