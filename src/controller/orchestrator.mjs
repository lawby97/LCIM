/**
 * LCIM V2 controller lifecycle assembly.
 *
 * CLI handlers call this module; they do not route models, compile SOL asks,
 * inspect Git, decide dispositions, or perform provider transport themselves.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LcimError, ConfigError } from '../shared/errors.mjs';
import { generateId } from '../shared/ids.mjs';
import { stampRecord } from '../shared/schema-registry.mjs';
import { resolveRuntimeRoot } from '../config/runtime-path.mjs';
import { digestConfig, loadProjectConfig, isExternalProviderAllowed } from '../project/config.mjs';
import { RunStore } from '../runtime/run-store.mjs';
import { createBudgetTracker, decideRoute } from '../routing/index.mjs';
import { ESCALATION_STATE } from '../routing/state.mjs';
import { compileSemanticContract } from '../contracts/compiler.mjs';
import { renderSemanticContract } from '../contracts/render.mjs';
import { compileSolAsk } from '../sol/ask-compiler/compiler.mjs';
import { compileSolResponse } from '../sol/ask-compiler/response.mjs';
import { adjacentDefectFindingId } from '../sol/contracts/ids.mjs';
import { compileRepairTicket } from '../sol/ask-compiler/repair-ticket.mjs';
import { buildRepairContract } from '../contracts/repair.mjs';
import { assessHandoff, recordPatchObservation, summarizeForReport } from '../handoff/assessment.mjs';
import { preserveRawResponse } from '../handoff/preserve.mjs';
import { parseProviderJson, buildWorkerPrompt, invokeBoundedProvider, usesExternalProvider, withLocalRouteEndpoints, isCodexSolModel } from './provider.mjs';
import { authorizeWorkerExecutionBoundary, persistBoundaryEvidence, resetWorkerScratch, runConstrainedProcess } from './execution-boundary.mjs';
import { persistBrokerEvidence, startProviderBroker } from './provider-broker.mjs';
import {
  TRANSPORT_CREDENTIAL_LEAK,
  SOL_COMMAND_MASQUERADE,
  SOL_TRANSPORT_CLEANUP_FAILED,
  acquireCodexSolStore,
  assessEvidencePersistenceFailure,
  assessSolTransportResult,
  collectCanonicalStringValues,
  inspectSolTransportSurface,
  loadSolSystemPrompt,
  persistSolSemanticAcceptance,
  persistSolTransportEvidence,
  prepareCodexSolInvocation,
  reconcileStaleSolTransportSurfaces,
  resolvePiExecutable,
  runSolPiProcess,
  sanitizeArgvForEvidence,
  scanForCredentialLeakDetailed,
  SOL_REVIEW_AUTHORITY,
  sweepRunSolTransportSurfaces,
} from './sol-transport.mjs';
import { claimSolTestProcessTable, consumeSolTestSeam, markSolFixtureRoutingConfig, solTestSeamHasProcessTable } from './test-seams.mjs';
import { assertPlainOptions, ownDataProperty, snapshotEnvironment, snapshotFrozenJson, snapshotJson, snapshotStringArgv } from './input-snapshot.mjs';
import { createProcessSupervisor, generateInvocationMarker, persistProcessLifetimeEvidence } from './process-supervisor.mjs';
import { runValidationsOnCopy } from './validation-runner.mjs';
import {
  appendControllerEvent,
  persistCandidate,
  persistDisposition,
  persistFinding,
  persistRejection,
  persistRouteDecision,
  persistWorkUnit,
} from './state.mjs';
import {
  cleanupWorkerWorktree,
  collectAndPersistEvidence,
  inspectWorkerExit,
  prepareWorkerWorktree,
} from '../git/pipeline.mjs';
import { resolveHeadSha } from '../git/base.mjs';
import { loadPatchEvidence } from '../evidence/patch/store.mjs';
import { BaseMismatchError, ScopeViolationError, WorktreeSafetyError } from '../git/errors.mjs';
import { runGit } from '../git/exec.mjs';

export class ControllerError extends LcimError {
  constructor(message, code = 'CONTROLLER_FAILED', details = null) {
    super(message, code, details);
  }
}

const SEMANTIC_REJECTIONS = new Set(['SEMANTIC_CONFLATION', 'UNRESOLVED_SEMANTICS', 'UNSUPPORTED_CLAIM']);
const CANONICAL_REJECTION_CODES = new Set([
  'TRANSPORT_MALFORMED',
  'SCHEMA_MISMATCH',
  'SEMANTIC_CONFLATION',
  'WRONG_BASE',
  'SCOPE_VIOLATION',
  'UNRESOLVED_SEMANTICS',
  'UNSUPPORTED_CLAIM',
  'INCOMPLETE_LEDGER',
  'BUDGET_EXHAUSTED',
  'SECRET_DENIED_PATH',
  'SOL_ASK_INVALID',
]);
const MAX_CONTROLLER_STEPS = 8;

function canonicalRejectionCode(code) {
  if (CANONICAL_REJECTION_CODES.has(code)) return code;
  if (code === 'BUDGET_EXHAUSTED') return code;
  return 'UNSUPPORTED_CLAIM';
}

function clone(value) {
  return snapshotJson(value, 'controller-owned clone');
}

// SOL-S11-004/006: fail-closed transport identities that stay inside the
// frozen Sprint-00 ledger taxonomy (TRANSPORT_MALFORMED); the distinct
// identity is carried by the controller event, transport evidence, and the
// run-level error, never by the ledger rejectionCode.
const TRANSPORT_TAXONOMY_CODES = new Set([
  TRANSPORT_CREDENTIAL_LEAK,
  'SOL_TRANSPORT_REJECTED',
  'SOL_TRANSPORT_SURFACE_VIOLATION',
  'SOL_OAUTH_RELOAD_FAILED',
  SOL_TRANSPORT_CLEANUP_FAILED,
  'SOL_TRANSPORT_EVIDENCE_FAILED',
  'SOL_CREDENTIAL_SCAN_INCOMPLETE',
  'SOL_RESPONSE_TOO_LARGE',
  'CODEX_OAUTH_UNAVAILABLE',
]);

function now() {
  return new Date().toISOString();
}

function canonicalizeWithExistingAncestor(target) {
  const suffix = [];
  let cursor = target;
  for (;;) {
    try {
      return path.join(fs.realpathSync(cursor), ...suffix);
    } catch (error) {
      if (error?.code !== 'ENOENT') return target;
      const parent = path.dirname(cursor);
      if (parent === cursor) return target;
      suffix.unshift(path.basename(cursor));
      cursor = parent;
    }
  }
}

function assertPiAgentOverrideOutsideTarget(repoDir, environment) {
  const configured = environment?.PI_CODING_AGENT_DIR;
  if (typeof configured !== 'string' || configured.length === 0) return;
  const target = path.resolve(configured);
  const canonicalRepo = fs.realpathSync(repoDir);
  // Canonicalize the nearest existing ancestor as well as existing paths.
  // On macOS /var and /private/var alias each other; a missing target child
  // must not bypass the target-tree check merely because it lacks a direct
  // realpath yet.
  const canonicalTarget = canonicalizeWithExistingAncestor(target);
  const relative = path.relative(canonicalRepo, canonicalTarget);
  const lexicalRelative = path.relative(path.resolve(repoDir), target);
  const insideCanonical = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  const insideLexical = lexicalRelative === '' || (!lexicalRelative.startsWith('..') && !path.isAbsolute(lexicalRelative));
  if (insideCanonical || insideLexical) {
    throw new ConfigError('PI_CODING_AGENT_DIR must not point inside the target repository; target-controlled Pi auth/config surfaces are refused');
  }
}

function publicErrorCode(error, fallback = 'CONTROLLER_FAILED') {
  if (error instanceof BaseMismatchError) return 'WRONG_BASE';
  if (error instanceof ScopeViolationError) return 'SCOPE_VIOLATION';
  if (error instanceof WorktreeSafetyError) return 'SCOPE_VIOLATION';
  if (typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(error.code)) return error.code;
  return fallback;
}

function staticReason(error, fallback) {
  const code = publicErrorCode(error, fallback);
  if (code === 'WRONG_BASE') return 'controller base checkpoint failed';
  if (code === 'SCOPE_VIOLATION') return 'controller safety or write-scope validation failed';
  if (code === 'TRANSPORT_MALFORMED') return 'provider response transport was malformed';
  if (code === 'SCHEMA_MISMATCH') return 'provider response did not satisfy its reviewed schema';
  if (code === 'SOL_ASK_INVALID') return 'compiled SOL decision contract was invalid';
  if (code === 'PROCESS_TREE_QUIESCENCE_FAILED') return 'model-controlled descendant processes remained alive; invocation process-tree quiescence could not be proven';
  if (code === 'TRANSPORT_CREDENTIAL_LEAK') return 'provider output contained credential material and was rejected; invocation fails closed';
  if (code === 'SOL_TRANSPORT_REJECTED') return 'the SOL transport acceptance gate failed (status, error, timeout, completion, truncation, or credential checks)';
  if (code === 'SOL_TRANSPORT_SURFACE_VIOLATION') return 'the isolated Pi agent surface contained unexpected authority-bearing files after the invocation';
  if (code === 'SOL_OAUTH_RELOAD_FAILED') return 'the isolated Pi auth store could not be reloaded after the invocation; refreshed credential state cannot be verified';
  if (code === SOL_TRANSPORT_CLEANUP_FAILED) return 'the controller-owned SOL transport surface could not be removed; cleanup failure fails closed';
  if (code === 'SOL_TRANSPORT_RECONCILE_FAILED') return 'stale controller-owned SOL transport surfaces could not be reconciled at startup';
  if (code === 'SOL_TEST_SEAM_NON_AUTHORITATIVE') return 'the run used controller-internal test seams and cannot grant production review authority';
  if (code === 'SOL_CLASSIC_NO_AUTHORITY') return 'the classic sol-xhigh SOL execution branch has no production authority in 2.1; every SOL role runs through the strict openai-codex transport gate';
  if (code === 'SOL_TRANSPORT_EVIDENCE_FAILED') return 'authoritative SOL transport proof evidence could not be persisted; the transport fails closed';
  if (code === 'SOL_CREDENTIAL_SCAN_INCOMPLETE') return 'the credential analysis hit a search/view bound and is INCOMPLETE; the transport fails closed instead of claiming not-detected';
  if (code === 'CODEX_OAUTH_UNAVAILABLE') return 'RE-AUTHENTICATION REQUIRED: the read-only real openai-codex source credential could not authenticate or refresh; LCIM did not modify it. Run `pi /login` (ChatGPT Plus/Pro Codex) and retry';
  return `controller validation failed (${code})`;
}

function codexReauthenticationRequired(providerResult) {
  if (providerResult?.status === 0 && providerResult?.error === null) return false;
  const text = `${providerResult?.error ?? ''}\n${providerResult?.stderr ?? ''}\n${providerResult?.stdout ?? ''}`.toLowerCase();
  return /openai codex token (?:refresh|exchange).*(?:fail|error)/.test(text)
    || /(?:invalid_grant|invalid refresh token|refresh token.*(?:invalid|expired|revoked))/.test(text)
    || /(?:401|unauthorized|authentication failed|not authenticated|oauth credential.*(?:invalid|expired))/.test(text);
}

function defaultSemanticContract(projectKey, allowedWritePaths) {
  return {
    contractKey: `${projectKey}.default`,
    title: `Bounded implementation for ${projectKey}`,
    riskClass: 'LOW_RISK',
    sourceObjects: [
      {
        key: 'project-config',
        kind: 'config',
        ref: '.lcim/project.json',
        authority: 'target project owner configuration',
      },
    ],
    concepts: [
      {
        name: 'candidatePatch',
        kind: 'mutation',
        authoritativeFieldNames: ['allowedWritePaths'],
        ownership: 'LCIM controller',
        sourceObjectKey: 'project-config',
        failureBehavior: 'reject observed changes outside the controller allow-list',
        notes: `allowed paths: ${allowedWritePaths.join(', ')}`,
      },
    ],
    distinctConcepts: [],
    negativeSideEffects: [
      {
        gate: 'controller authorization',
        scope: 'mutation',
        requirement: 'No candidate mutation is published before controller validation and reviewable-candidate recording.',
        expectedCount: 0,
        evidenceKind: 'audit_log',
      },
    ],
    factsEstablished: [
      { fact: 'LCIM derives patch identity and changed paths from the isolated worktree.', evidence: 'Sprint-03 controller pipeline' },
      { fact: 'Workers cannot decide patch readiness or publication.', evidence: 'Sprint-00/Sprint-02 authority contract' },
    ],
    unresolvedSemantics: [],
  };
}

function compileProjectContract(project) {
  const raw = project.config.semanticContract ?? defaultSemanticContract(project.config.projectKey, project.config.allowedWritePaths);
  return compileSemanticContract(raw, { compiledAt: now() });
}

function effectiveRoutingConfig(projectConfig, options) {
  const config = withLocalRouteEndpoints(projectConfig, {
    workerCommand: options.workerCommand !== undefined || projectConfig.worker.command !== null,
    solCommand: options.solCommand !== undefined || projectConfig.sol.command !== null,
  });
  if (options.workerCommand !== undefined) config.worker.command = clone(options.workerCommand);
  if (options.solCommand !== undefined) config.sol.command = clone(options.solCommand);
  // Never serialize seam state into ordinary project/configuration data.
  // A WeakSet marker is attached only to this controller-created object.
  const frozen = snapshotFrozenJson(config, 'effective routing configuration');
  if (options.solCommand !== undefined) markSolFixtureRoutingConfig(frozen, options.solTestAuthority);
  return frozen;
}

function sideEffectSpecs(contract) {
  return Array.isArray(contract.negativeSideEffects) ? contract.negativeSideEffects : [];
}

function contractRefs(contract) {
  return [{
    contractKey: contract.contractKey,
    semanticDigest: contract.semanticDigest,
    requirementRefs: sideEffectSpecs(contract).map((item) => item.sideEffectId),
  }];
}

function evidenceForController({ evidenceId = null, patchRecord = null, reason = null, validation = [] } = {}) {
  const out = [];
  if (evidenceId) out.push({ ref: `patch:${evidenceId}`, kind: 'observation', content: 'Controller-derived patch evidence was persisted.' });
  if (patchRecord) {
    out.push({ ref: 'controller:changed-paths', kind: 'observation', content: `Controller observed ${patchRecord.changedPaths.length} changed path(s) within the isolated worktree.` });
    out.push({ ref: 'controller:diff-check', kind: 'test_result', content: `Controller diff-check result: ${patchRecord.diffCheck.clean ? 'clean' : 'errors recorded'}.` });
  }
  for (const item of validation) out.push({ ref: item.evidenceRef ?? `validation:${out.length}`, kind: 'test_result', content: item.summary });
  if (reason) out.push({ ref: 'controller:rejection', kind: 'observation', content: reason });
  return out;
}

function secretScan(buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer ?? '');
  const patterns = [
    /\b(?:sk-|ghp_|github_pat_|glpat-)[A-Za-z0-9_-]{12,}\b/i,
    /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/i,
    /-----BEGIN(?: [A-Z0-9][A-Z0-9 ]*)? PRIVATE KEY-----/i,
    /\b(?:api[_-]?key|access[_-]?token|password|secret)\s*[:=]\s*[^\s,;]+/i,
  ];
  const found = patterns.some((pattern) => pattern.test(text));
  return {
    kind: 'secret-scan',
    outcome: found ? 'FAIL' : 'PASS',
    summary: found ? 'controller secret scan found denied credential-shaped patch material' : 'controller secret scan passed',
    evidenceRef: 'validation:secret-scan',
  };
}

// Sprint-10 R4: validation runs on a separate disposable base+patch copy
// under the controller-owned VALIDATION boundary (validation-runner.mjs).
// Validation must never operate on the authoritative mutable worker
// worktree, so the pre-R4 worker-worktree validation helper was removed.

function createControllerWorkUnit({ runId, workUnitId, expectedBaseSha, projectConfig, status = 'CREATED' }) {
  return {
    workUnitId,
    runId,
    status,
    expectedBaseSha,
    allowedWritePaths: projectConfig.allowedWritePaths,
    ...(projectConfig.mustChangePaths.length > 0 ? { mustChangePaths: projectConfig.mustChangePaths } : {}),
    createdAt: now(),
  };
}

function routeContext({ workUnitId, runId, state, contract, budget, routingConfig, environment, resultAccepted, latestRejection, failureHistory, repairsDispatched, solDiagnosis, solReview, solFindings, activeFindingId, stuckEvidence, evidenceRefs }) {
  return {
    workUnitId,
    runId,
    state,
    semanticContract: contract,
    resultAccepted,
    latestRejection,
    failureHistory,
    repairsDispatched,
    solDiagnosis,
    solReview,
    solFindings,
    stuckEvidence,
    budget,
    config: routingConfig,
    environment,
    activeFindingId,
    evidenceRefs,
  };
}

function routeCallType(decision) {
  return {
    ROUTE_SOL_CONTRACT_CHECK: 'SOL_CONTRACT_CHECK',
    ROUTE_SOL_DIAGNOSE: 'SOL_DIAGNOSE',
    ROUTE_SOL_FINAL_REVIEW: 'SOL_FINAL_REVIEW',
    ROUTE_SOL_RECHECK: 'SOL_RECHECK',
  }[decision] ?? null;
}

function makeSolAsk({ callType, contract, patchRecord, evidenceRefs, prior = null, finding = null }) {
  const specs = sideEffectSpecs(contract);
  const requirements = specs.map((item) => item.sideEffectId);
  const evidence = evidenceForController({ evidenceId: evidenceRefs.find((ref) => ref.startsWith('patch:'))?.slice('patch:'.length) ?? null, patchRecord });
  const common = {
    callType,
    singleDecisionQuestion: callType === 'SOL_CONTRACT_CHECK'
      ? `Are the exact semantics of contract ${contract.contractKey} sufficiently specified for bounded implementation?`
      : callType === 'SOL_DIAGNOSE'
        ? `Why does acceptance criterion ${requirements[0] ?? 'the declared controller criterion'} fail in this work unit?`
        : callType === 'SOL_FINAL_REVIEW'
          ? `Does the candidate satisfy every named high-risk invariant in the locked checklist?`
          : `Is the exact prior finding resolved by the new delta evidence?`,
    whyNeeded: callType === 'SOL_CONTRACT_CHECK'
      ? 'The compiled contract contains unresolved high-risk semantics and implementation authority is blocked.'
      : callType === 'SOL_DIAGNOSE'
        ? 'The controller observed a bounded rejection and needs one falsifiable diagnosis before a targeted repair.'
        : callType === 'SOL_FINAL_REVIEW'
          ? 'A high-risk candidate requires a named final-review decision before it can be reviewably advanced.'
          : 'One exact prior finding received one bounded repair; only its new delta evidence may be considered.',
    contractRefs: contractRefs(contract),
    establishedFacts: contract.factsEstablished.slice(0, 8),
    evidence: callType === 'SOL_DIAGNOSE' || callType === 'SOL_RECHECK' ? [] : evidence,
    passCondition: callType === 'SOL_CONTRACT_CHECK'
      ? 'Return SUFFICIENTLY_SPECIFIED only when every locked semantic required for this unit is explicit and unambiguous.'
      : callType === 'SOL_DIAGNOSE'
        ? 'Return CAUSE_IDENTIFIED only with one root cause, bounded evidence, one smallest safe repair, and falsification.'
        : callType === 'SOL_FINAL_REVIEW'
          ? 'Return PASS only when every named invariant is directly supported by the bounded evidence.'
          : 'Return RESOLVED only when the prior finding is closed by the retained delta evidence.',
    failCondition: callType === 'SOL_CONTRACT_CHECK'
      ? 'Return AMENDMENTS_REQUIRED when any required semantic is unresolved, contradictory, or ambiguous.'
      : callType === 'SOL_DIAGNOSE'
        ? 'Return CAUSE_UNRESOLVED when the single failure lacks a falsifiable bounded explanation.'
        : callType === 'SOL_FINAL_REVIEW'
          ? 'Return FAIL when a named invariant is not satisfied or a directly evidenced locked defect remains.'
          : 'Return NOT_RESOLVED when the exact prior finding still fails.',
    allowedScope: specs.length > 0 ? [...new Set(specs.map((item) => item.scope))] : ['mutation'],
    outOfScope: ['generic review', 'unbounded refactoring', 'controller disposition changes', 'publication or push'],
  };
  if (callType === 'SOL_CONTRACT_CHECK') {
    return { ...common, contractCheck: { amendmentsOnly: true, expectedVerdicts: ['SUFFICIENTLY_SPECIFIED', 'AMENDMENTS_REQUIRED'] } };
  }
  if (callType === 'SOL_DIAGNOSE') {
    if (specs.length === 0) throw new ControllerError('SOL diagnosis cannot be compiled without a declared negative-side-effect criterion', 'SOL_ASK_INVALID');
    return {
      ...common,
      diagnose: {
        acceptanceCriterionRef: specs[0].sideEffectId,
        criterionRequirement: specs[0].requirement,
        priorEvidence: evidence.length > 0 ? evidence : [{ ref: 'controller:rejection', kind: 'observation', content: 'Controller recorded a bounded rejection for diagnosis.' }],
      },
    };
  }
  if (callType === 'SOL_FINAL_REVIEW') {
    if (specs.length === 0) throw new ControllerError('SOL final review cannot be compiled without named locked requirements', 'SOL_ASK_INVALID');
    return {
      ...common,
      finalReview: {
        invariantChecklist: specs.slice(0, 16).map((item, index) => ({
          invariantId: `invariant${index + 1}`,
          invariant: item.requirement,
          lockedRequirementRef: item.sideEffectId,
        })),
        maxAdjacentCriticalDefects: 1,
      },
    };
  }
  if (prior === null || finding === null) throw new ControllerError('SOL recheck requires the prior compiled ask, response, and finding', 'SOL_ASK_INVALID');
  return {
    ...common,
    evidence: [],
    recheck: {
      priorFindingRef: finding.findingId,
      priorAskId: prior.ask.askId,
      priorResponseId: prior.response.responseId,
      // The compiler derives and verifies this value from the prior response.
      priorFindingDigest: undefined,
      deltaEvidence: evidence.length > 0 ? evidence : [{ ref: 'controller:delta', kind: 'observation', content: 'Controller recorded bounded delta evidence for recheck.' }],
      neighboringInvariants: requirements.slice(0, 8),
      mustNotReopen: true,
    },
  };
}

function createFinalReviewRepairBinding({ contract, finding, ask, response }) {
  if (finding === null || typeof finding !== 'object' || typeof finding.findingId !== 'string') {
    throw new ControllerError('a final-review repair requires one persisted finding identity', 'SOL_ASK_INVALID');
  }
  // A checklist finding binds through its named invariant; an accepted
  // adjacentCriticalDefect binds through its lockedRequirementRef (the
  // response validator guarantees it resolves to a declared bound
  // requirement of the ask, i.e. a sideEffectId of the source contract).
  const invariant = ask?.finalReview?.invariantChecklist?.find((item) => item.invariantId === finding.invariantRef);
  const criterion = invariant?.lockedRequirementRef ?? finding.lockedRequirementRef ?? null;
  const spec = contract?.negativeSideEffects?.find((item) => item.sideEffectId === criterion);
  if (spec === undefined) {
    throw new ControllerError('final-review finding does not bind a locked source acceptance criterion; targeted repair is refused', 'SOL_ASK_INVALID');
  }
  const repairId = `lcim_repair_${crypto.createHash('sha256').update(`${finding.findingId}:${ask.askId}:${response.responseId}`).digest('hex').slice(0, 32)}`;
  const repairContract = buildRepairContract({
    semanticContract: contract,
    rejectedAcceptanceRefs: [criterion],
    objective: `resolve final-review finding ${finding.findingId}`,
    violation: `final-review finding ${finding.findingId}: ${finding.summary}`,
    requiredBehavior: spec.requirement,
    mustChange: [{ target: spec.scope, change: `Resolve the controller-recorded final-review finding ${finding.findingId} without widening scope.` }],
    mustNotChange: [{ target: 'contract', reason: 'preserve the locked semantic contract and every unrelated invariant' }],
    acceptanceTests: [],
    verification: [{ method: 'controller validation and bound SOL_RECHECK', expectation: spec.requirement }],
    findingRefs: [finding.findingId],
    repairId,
    createdAt: response.compiledAt,
  });
  const ticket = snapshotFrozenJson({
    kind: 'lcim.final-review-repair-binding',
    findingId: finding.findingId,
    defectKind: finding.defectKind ?? 'FINDING',
    repairId: repairContract.repairId,
    sourceAskId: ask.askId,
    sourceResponseId: response.responseId,
    ...(finding.invariantRef === undefined || finding.invariantRef === null ? {} : { invariantRef: finding.invariantRef }),
    ...(finding.lockedRequirementRef === undefined || finding.lockedRequirementRef === null ? {} : { lockedRequirementRef: finding.lockedRequirementRef }),
  }, 'final-review repair binding');
  return { repairContract, ticket };
}

function sanitizeSolInput(value) {
  // Do not repair or strip caller/model-derived response fields here. The
  // Sprint-06 response compiler must see them and reject them when present.
  return value === null || typeof value !== 'object' ? value : clone(value);
}

function persistSolArtifact(runDir, kind, id, value) {
  const dir = path.join(runDir, 'controller', 'sol', kind);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${id}.json`);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return file;
}

function persistProviderOutput(runDir, invocationId, raw) {
  if (typeof raw !== 'string') return null;
  const dir = path.join(runDir, 'controller', 'raw');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, `${invocationId}.txt`);
  fs.writeFileSync(file, raw, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return file;
}

async function executeWorkerAttempt({
  runStore,
  project,
  contract,
  repoDir,
  runtimeRoot,
  worktree,
  route,
  workUnitId,
  repairContract,
  semanticValidator,
  credentialProbePaths = [],
  sandboxExecutable,
  usedBrokerPorts,
  processSupervisorOptions = null,
  evidencePaths = null,
  environment = process.env,
}) {
  const invocation = await runStore.startInvocation({
    workUnitId,
    provider: route.targetProvider,
    model: route.targetModel,
    role: 'WORKER',
    reasoningEffort: route.reasoningLevel ?? 'XHIGH',
  });
  const invocationMarker = generateInvocationMarker();
  const supervisor = createProcessSupervisor({
    invocationId: invocation.invocationId,
    workUnitId,
    invocationMarker,
    // SOL-S10-001 R4: the model boundary structurally denies child
    // creation; the supervisor is DEFENSE IN DEPTH / DIAGNOSTIC ONLY and
    // its evidence records the structural primary proof.
    childCreationStructurallyDenied: true,
    ...(processSupervisorOptions ?? {}),
  });
  const external = usesExternalProvider({ projectConfig: project.config, role: 'WORKER' });
  let invocationBroker = null;
  let boundary = null;
  let boundaryEvidencePath = null;
  let brokerEvidencePath = null;
  let processLifetimeEvidencePath = null;
  let providerResult = null;
  let quiescence = null;
  let completed = false;
  try {
    // R3 per-invocation isolation: a LOCAL worker gets a fresh boundary with
    // network DENY_ALL and no broker at all; an external worker gets a FRESH
    // broker listener on a port no prior invocation's boundary allows, a
    // fresh boundary pinned to ONLY that port, and a fresh per-invocation Pi
    // config surface under <scratch>/<invocationId>/pi-agent.
    if (external) {
      invocationBroker = await startProviderBroker({ avoidPorts: usedBrokerPorts, env: environment });
      usedBrokerPorts.add(invocationBroker.port);
    }
    const authorized = await authorizeInvocationBoundary({
      runStore,
      repoDir,
      worktree,
      workUnitId,
      invocationId: invocation.invocationId,
      invocationMarker,
      credentialProbePaths,
      sandboxExecutable,
      broker: invocationBroker,
      // SOL-S10-001 R4: the MODEL invocation boundary structurally denies
      // child creation; this is the primary descendant-prevention proof.
      processCreation: 'DENIED',
    });
    boundary = authorized.boundary;
    boundaryEvidencePath = authorized.boundaryEvidencePath;
    if (evidencePaths !== null) evidencePaths.boundary.push(boundaryEvidencePath);
    const prompt = buildWorkerPrompt({
      workUnitId,
      contract,
      repairContract,
      objective: repairContract?.objective ?? contract.title,
    });
    try {
      providerResult = await invokeBoundedProvider({
        boundary,
        projectConfig: project.config,
        repoDir,
        model: route.targetModel,
        reasoning: route.reasoningLevel ?? 'XHIGH',
        role: 'WORKER',
        prompt,
        broker: invocationBroker,
        invocationId: invocation.invocationId,
        onSpawn: (info) => supervisor.begin(info.pid),
        env: environment,
      });
    } catch (error) {
      providerResult = {
        status: null,
        signal: null,
        stdout: '',
        stderr: '',
        error: error?.message ?? 'provider execution failed',
        timedOut: false,
        processCompleted: false,
        pid: null,
        durationMs: 0,
        provider: route.targetProvider,
        model: route.targetModel,
        reasoningEffort: route.reasoningLevel ?? 'XHIGH',
        role: 'WORKER',
      };
    }
    // The invocation-scoped capability dies with the invocation: revoke
    // (inside invokeBoundedProvider) and close the fresh listener BEFORE
    // model-controlled descendants are terminated.
    if (invocationBroker !== null) {
      brokerEvidencePath = persistBrokerEvidence(runStore.runDir, workUnitId, invocationBroker, { fileKey: invocation.invocationId });
      if (evidencePaths !== null) evidencePaths.broker.push(brokerEvidencePath);
      await invocationBroker.close();
    }
    quiescence = await supervisor.quiesce();
    processLifetimeEvidencePath = persistProcessLifetimeEvidence(runStore.runDir, invocation.invocationId, quiescence);
    if (evidencePaths !== null) evidencePaths.processLifetime.push(processLifetimeEvidencePath);
    if (!quiescence.quiescenceVerified) {
      // FAIL CLOSED: no completion success, no patch extraction, no next
      // provider invocation, no future capability. The invocation record
      // still carries the failure so the ledger stays complete.
      await invocation.complete({ outcome: 'FAILURE', errorCode: 'PROCESS_TREE_QUIESCENCE_FAILED' });
      completed = true;
      await invocation.assess({
        assessmentResult: 'REJECTED',
        // The shared rejection taxonomy is frozen (Sprint-00); the distinct
        // fail-closed identity is carried by the controller event, the
        // process-lifetime evidence, and the ControllerError below.
        rejectionCode: 'UNSUPPORTED_CLAIM',
        summary: 'model-controlled descendant processes remained alive; invocation process-tree quiescence could not be proven',
        evidenceRefs: [`process-lifetime:${path.basename(processLifetimeEvidencePath)}`],
      });
      appendControllerEvent(runStore.runDir, {
        kind: 'WORKER_ASSESSMENT',
        workUnitId,
        invocationId: invocation.invocationId,
        failClosed: 'PROCESS_TREE_QUIESCENCE_FAILED',
        safety: { ok: false, code: 'PROCESS_TREE_QUIESCENCE_FAILED' },
        handoff: null,
        processCompleted: providerResult?.processCompleted ?? false,
        processSucceeded: false,
        patchObserved: false,
        patchValid: false,
        transportValid: false,
        semanticAccepted: false,
        rejectionCode: 'UNSUPPORTED_CLAIM',
        rawResponseRef: null,
      });
      throw new ControllerError(
        'model-controlled descendant processes remained alive after the provider invocation; invocation process-tree quiescence could not be proven and the run fails closed',
        'PROCESS_TREE_QUIESCENCE_FAILED',
        { remainingPids: quiescence.remainingPids },
      );
    }
  } catch (error) {
    if (quiescence === null) {
      try {
        quiescence = await supervisor.quiesce();
      } catch {
        // Best-effort; the original failure is the primary fail-closed result.
      }
      if (quiescence !== null && processLifetimeEvidencePath === null) {
        try {
          processLifetimeEvidencePath = persistProcessLifetimeEvidence(runStore.runDir, invocation.invocationId, quiescence);
        } catch {
          // Evidence persistence failure must not mask the original error.
        }
      }
    }
    if (invocationBroker !== null) {
      try {
        if (brokerEvidencePath === null) {
          brokerEvidencePath = persistBrokerEvidence(runStore.runDir, workUnitId, invocationBroker, { fileKey: invocation.invocationId });
        }
      } catch {
        // The invocation failure remains primary.
      }
      try {
        await invocationBroker.close();
      } catch {
        // The invocation failure remains primary.
      }
    }
    if (!completed) {
      try {
        // Keep the ledger complete: an invocation that never reached
        // provider completion is explicitly reconciled, never left orphaned.
        await runStore.reconcileInvocation({
          invocationId: invocation.invocationId,
          reason: 'CRASH_AFTER_START',
          note: 'invocation failed before provider completion; run fails closed',
        });
      } catch {
        // The invocation failure remains primary.
      }
    }
    throw error;
  }
  const outcome = providerResult.timedOut
    ? 'TIMEOUT'
    : providerResult.error !== null || !providerResult.processCompleted
      ? 'TRANSPORT_ERROR'
      : providerResult.status === 0
        ? 'SUCCESS'
        : 'FAILURE';
  await invocation.complete({
    outcome,
    errorCode: outcome === 'SUCCESS' ? undefined : 'PROVIDER_EXECUTION_FAILED',
  });
  completed = true;
  const rawRef = persistProviderOutput(runStore.runDir, invocation.invocationId, providerResult.stdout);
  let handoff = assessHandoff({
    workUnitId,
    rawResponse: providerResult.stdout,
    runtimeRoot,
    modelProcessCompleted: providerResult.processCompleted,
  });

  // The scratch directory is an explicit controller-approved temporary
  // surface. Remove it before Git evidence extraction so it cannot become a
  // candidate path. (The controller re-writes the isolated pi agent config
  // before each provider invocation, so nothing here needs preservation.)
  resetWorkerScratch(boundary.scratchRoot);

  let safety = null;
  let safetyError = null;
  try {
    safety = inspectWorkerExit({ repoDir, worktreeDir: worktree.worktreeDir, expectedBaseSha: worktree.baseSha, snapshot: worktree });
  } catch (error) {
    safetyError = error;
  }

  // PRE_EXTRACT (R4 order): the controller derives the patch bytes/hash/
  // changed paths and PERSISTS the immutable patch artifact BEFORE any
  // validation runs. From this point the worker worktree is no longer
  // authoritative.
  let evidenceResult = null;
  let evidenceError = null;
  try {
    evidenceResult = collectAndPersistEvidence({
      repoDir,
      worktreeDir: worktree.worktreeDir,
      expectedBaseSha: worktree.baseSha,
      workUnitId,
      worktreeId: worktree.worktreeId,
      allowedWritePaths: project.config.allowedWritePaths,
      mustChangePaths: project.config.mustChangePaths,
      // Sprint-10 R4: validation runs AFTER artifact persistence on a
      // separate disposable copy (base + exact artifact). The persisted
      // Sprint-03 evidence record therefore carries no pre-extraction
      // validation results; post-persistence validation results are
      // controller evidence referenced by the disposition.
      validationResults: [],
    });
  } catch (error) {
    evidenceError = error;
    const evidenceId = error?.details?.evidenceId;
    if (typeof evidenceId === 'string') {
      try {
        const loaded = loadPatchEvidence(repoDir, evidenceId);
        evidenceResult = { ...loaded, record: loaded.record, evidenceId };
      } catch {
        // The collector's own persisted evidence remains referenced by the
        // error details, but an unverifiable load is not used as authority.
      }
    }
  }

  // VALIDATION PHASE (R4): the frozen patch artifact is validated on a
  // separate disposable validation copy constructed from expected base +
  // exact artifact bytes (validation-runner.mjs). Validation receives NO
  // provider broker, NO provider credentials, DENY_ALL network; it can
  // approve/reject the immutable artifact but cannot alter it.
  let validationResults = [];
  let validationEvidencePath = null;
  if (evidenceResult?.patchText) {
    try {
      const validation = await runValidationsOnCopy({
        projectConfig: project.config,
        repoDir,
        runDir: runStore.runDir,
        workUnitId,
        invocationId: invocation.invocationId,
        expectedBaseSha: worktree.baseSha,
        patchText: evidenceResult.patchText,
        patchRecord: evidenceResult.record,
        // SOL-S10-001 R4 recheck: caller-supplied credential probe paths
        // must survive the MODEL -> VALIDATION boundary switch; validation
        // structurally denies them and verifies unreadability first.
        credentialProbePaths,
        ...(sandboxExecutable === undefined ? {} : { sandboxExecutable }),
      });
      validationEvidencePath = validation.evidencePath;
      if (evidencePaths !== null && validation.evidencePath !== null) evidencePaths.validation.push(validation.evidencePath);
      validationResults = [...validation.results];
    } catch (error) {
      validationResults.push({ kind: 'test', outcome: 'FAIL', summary: `controller validation could not complete on the base+patch copy: ${error?.message ?? 'unknown error'}`, evidenceRef: 'validation:test-execution' });
    }
    const scan = secretScan(evidenceResult.patchText);
    validationResults = [...validationResults, scan];
  }
  if (evidenceResult) handoff = recordPatchObservation(handoff, true);
  else handoff = recordPatchObservation(handoff, false);

  const transportValid = handoff.schema.state === 'VALID' && handoff.workerResult?.workUnitId === workUnitId;
  const patchRecord = evidenceResult?.record ?? null;
  const testsPass = validationResults.filter((item) => item.kind === 'test').every((item) => item.outcome === 'PASS');
  const secretPass = validationResults.filter((item) => item.kind === 'secret-scan').every((item) => item.outcome === 'PASS');
  // Evidence persistence and scope validation are one fail-closed boundary:
  // a collector can persist useful evidence before throwing SCOPE_VIOLATION,
  // but that evidence error must never be mistaken for a valid patch.
  const patchValid = safetyError === null && evidenceError === null && evidenceResult !== null && patchRecord.changedPaths.length > 0 && patchRecord.diffCheck.clean && testsPass && secretPass;
  let semanticAccepted = patchValid;
  let semanticRejectionCode = null;
  if (patchValid && typeof semanticValidator === 'function') {
    const decision = await semanticValidator({ contract, patchRecord, handoff, worktreeDir: worktree.worktreeDir });
    if (decision === null || typeof decision !== 'object' || typeof decision.accepted !== 'boolean') throw new ControllerError('semanticValidator must return { accepted: boolean, rejectionCode? }', 'CONTROLLER_SEMANTIC_INVALID');
    semanticAccepted = decision.accepted;
    semanticRejectionCode = decision.accepted ? null : decision.rejectionCode;
  }
  if (patchValid && project.config.semanticRejectionCode !== null) {
    semanticAccepted = false;
    semanticRejectionCode = project.config.semanticRejectionCode;
  }

  let rejectionCode = null;
  if (safetyError) rejectionCode = publicErrorCode(safetyError, 'SCOPE_VIOLATION');
  else if (evidenceError) rejectionCode = publicErrorCode(evidenceError, 'SCOPE_VIOLATION');
  else if (!transportValid) rejectionCode = handoff.transportDefect ?? (providerResult.status === 0 ? 'SCHEMA_MISMATCH' : 'TRANSPORT_MALFORMED');
  else if (!patchValid) rejectionCode = validationResults.some((item) => item.kind === 'secret-scan' && item.outcome === 'FAIL') ? 'SECRET_DENIED_PATH' : 'SCOPE_VIOLATION';
  else if (!semanticAccepted) rejectionCode = semanticRejectionCode ?? 'UNSUPPORTED_CLAIM';

  const accepted = patchValid && transportValid && semanticAccepted && providerResult.status === 0;
  rejectionCode = accepted ? null : canonicalRejectionCode(rejectionCode ?? 'UNSUPPORTED_CLAIM');
  const refs = evidenceForController({ evidenceId: evidenceResult?.evidenceId ?? patchRecord?.evidenceId ?? null, patchRecord, reason: rejectionCode ? staticReason({ code: rejectionCode }, rejectionCode) : null, validation: validationResults });
  const validationFileRefs = validationEvidencePath === null ? [] : [`validation-evidence:${path.basename(validationEvidencePath)}`];
  const evidenceRefs = [...refs.map((item) => item.ref), ...validationFileRefs];
  const summary = summarizeForReport(handoff);
  await invocation.assess({
    assessmentResult: accepted ? 'ACCEPTED' : 'REJECTED',
    rejectionCode: accepted ? undefined : rejectionCode,
    summary: accepted ? 'controller objective patch and transport validation passed' : staticReason({ code: rejectionCode }, 'UNSUPPORTED_CLAIM'),
    evidenceRefs,
  });
  appendControllerEvent(runStore.runDir, {
    kind: 'WORKER_ASSESSMENT',
    workUnitId,
    invocationId: invocation.invocationId,
    safety: safetyError === null ? { ok: true } : { ok: false, code: publicErrorCode(safetyError, 'SCOPE_VIOLATION') },
    handoff: summary,
    processCompleted: providerResult.processCompleted,
    processSucceeded: providerResult.status === 0,
    patchObserved: evidenceResult !== null,
    patchValid,
    transportValid,
    semanticAccepted,
    rejectionCode,
    rawResponseRef: rawRef,
  });
  return Object.freeze({
    invocationId: invocation.invocationId,
    accepted,
    patchValid,
    transportValid,
    semanticAccepted,
    rejectionCode,
    evidenceResult,
    patchRecord,
    handoff,
    safety,
    safetyError,
    providerResult: {
      status: providerResult.status,
      processCompleted: providerResult.processCompleted,
      timedOut: providerResult.timedOut,
      error: providerResult.error,
      pid: providerResult.pid ?? null,
    },
    evidenceRefs,
    boundaryEvidencePath,
    brokerEvidencePath,
    processLifetimeEvidencePath,
    validationEvidencePath,
  });
}

async function executeSolAttempt({
  runStore,
  project,
  repoDir,
  worktree,
  route,
  contract,
  patchRecord,
  evidenceRefs,
  priorSol,
  finding,
  workUnitId,
  credentialProbePaths = [],
  sandboxExecutable,
  usedBrokerPorts,
  processSupervisorOptions = null,
  evidencePaths = null,
  solTransportOptions = null,
  solTestAuthority = null,
  solStoreRef = null,
  environment = process.env,
  systemPrompt = null,
  forceNonAuthoritative = false,
}) {
  const callType = routeCallType(route.decision);
  if (callType === null) throw new ControllerError('route did not name a SOL call type', 'SOL_ASK_INVALID');
  const askInput = makeSolAsk({ callType, contract, patchRecord, evidenceRefs, prior: priorSol, finding });
  const ask = compileSolAsk(askInput, { sources: [contract], prior: callType === 'SOL_RECHECK' ? priorSol : undefined });
  persistSolArtifact(runStore.runDir, 'asks', ask.askId, ask);
  const invocation = await runStore.startInvocation({
    workUnitId,
    provider: route.targetProvider,
    model: route.targetModel,
    role: 'SOL',
    reasoningEffort: route.reasoningLevel ?? 'XHIGH',
  });
  const invocationMarker = generateInvocationMarker();
  // V2.0.1: the GPT-5.6 Sol codex route runs Pi as a TRUSTED
  // CONTROLLER-SIDE provider client (never inside the model execution
  // boundary), so the supervisor is PRIMARY for it; the classic SOL
  // route keeps the no-descendant MODEL boundary and the supervisor is
  // DEFENSE IN DEPTH / DIAGNOSTIC ONLY.
  const codexRoute = isCodexSolModel(route.targetModel);
  const supervisor = createProcessSupervisor({
    invocationId: invocation.invocationId,
    workUnitId,
    invocationMarker,
    childCreationStructurallyDenied: !codexRoute,
    ...(processSupervisorOptions ?? {}),
  });
  const external = usesExternalProvider({ projectConfig: project.config, role: 'SOL' });
  if (codexRoute && !external) {
    // A repository/CLI local command never substitutes the codex transport.
    // The only codex fixture surface is piBin under opaque test authority.
    throw new ControllerError(
      'a configured sol.command cannot substitute the gpt-5.6-sol codex transport; production review requires controller-side pinned Pi',
      SOL_COMMAND_MASQUERADE,
      { model: route.targetModel },
    );
  }
  if (!codexRoute) {
    // Fifth-review rule: the classic sol-xhigh execution branch has NO
    // production authority in 2.1. Every current 2.1 SOL role
    // (CONTRACT_CHECK / DIAGNOSE / FINAL_REVIEW / RECHECK) runs through
    // the SAME strict Codex transport gate (openai-codex / gpt-5.6-sol /
    // XHIGH). Routing can no longer emit a classic SOL route; refusing it
    // here keeps the weaker transport path structurally unreachable.
    throw new ControllerError(
      'the classic sol-xhigh SOL execution branch has no production authority in 2.1; every SOL role must run through the strict openai-codex / gpt-5.6-sol / XHIGH transport gate',
      'SOL_CLASSIC_NO_AUTHORITY',
      { model: route.targetModel },
    );
  }
  let invocationBroker = null;
  let boundary = null;
  let boundaryEvidencePath = null;
  let brokerEvidencePath = null;
  let processLifetimeEvidencePath = null;
  let solStore = null;
  let solTransport = null;
  let solTransportEvidencePath = null;
  let providerResult = null;
  let quiescence = null;
  let completed = false;
  // Post-exit observed facts (SOL-S11-005): the transport result is never
  // trusted from the runner alone — everything below is observed after
  // exit+quiescence and fails closed on any anomaly.
  let leakDetected = false;
  let leakChannel = null;
  let rawScanState = null;
  let rawScanIncompleteReasons = null;
  let canonicalScanState = null;
  let canonicalScanIncompleteReasons = null;
  let reloadResult = null;
  let inspection = null;
  let cleanupFailed = false;
  let cleanupOutcome = null;
  let transportErrorCode = null;
  let transportProofsPassed = false;
  let reviewAuthorityForAttempt = null;
  let transportProofEvidence = null;
  let parsed = null;
  const cleanupInvocationTransport = async () => {
    if (solTransport === null) return null;
    if (solTransport.isRemoved()) return cleanupOutcome ?? { removed: true, observed: true, completed: true, verified: true, error: null };
    try {
      await solTransport.remove();
      cleanupOutcome = { removed: true, observed: true, completed: true, verified: true, error: null };
    } catch {
      cleanupFailed = true;
      cleanupOutcome = { removed: false, observed: false, completed: true, verified: false, error: 'cleanup-removal-failed' };
    }
    return cleanupOutcome;
  };
  /**
   * Sixth-review rule: the immutable exact-invocation transport proof is
   * persisted AND fsynced before provider output is parsed. For an
   * authoritative transport a persistence failure fails the invocation
   * closed (never tolerated); non-authoritative seams tolerate evidence
   * loss. Returns true when the record exists.
   */
  const persistTransportProofFailClosed = () => {
    if (solTransport === null) return true;
    try {
      solTransportEvidencePath = persistSolTransportEvidence(runStore.runDir, invocation.invocationId, {
        pi: solTransport.pi,
        transport: solTransport,
        store: solStore,
        flags: [...(leakDetected ? ['credential-leak-rejected'] : []), ...(cleanupFailed ? ['cleanup-failed'] : [])],
        leak: leakDetected,
        leakChannel: leakDetected ? leakChannel : null,
        inspection,
        reload: reloadResult,
        cleanup: cleanupOutcome,
        argv: providerResult?.argvSanitized ?? null,
        promptDigest: providerResult?.promptDigest ?? null,
        systemPromptDigest: providerResult?.systemPromptDigest ?? null,
        proofs: transportProofEvidence,
      });
      if (evidencePaths !== null) evidencePaths.solTransport.push(solTransportEvidencePath);
      return true;
    } catch (error) {
      transportErrorCode = 'SOL_TRANSPORT_EVIDENCE_FAILED';
      return false;
    }
  };
  try {
    if (codexRoute) {
      // V2.0.1 controller-side transport: the openai-codex Pi process is
      // a trusted controller-side provider client (like the broker). It
      // runs from a controller-owned empty directory with a strict
      // allowlist environment and a RUN-SCOPED isolated Pi agent dir
      // containing ONLY the openai-codex OAuth entry (mode 0600), so Pi's
      // OWN refresh/rotation persists across the run's SOL invocations
      // (SOL-RECHECK continuity) under Pi's normal locking rules. The
      // DeepSeek worker boundary is NOT involved: DeepSeek stays
      // BROKER_ONLY and validation stays DENY_ALL exactly as in 2.0.0.
      if (solStoreRef !== null && solStoreRef.current !== null) {
        solStore = solStoreRef.current;
      } else {
        const pi = resolvePiExecutable({
          piBin: solTransportOptions?.piBin ?? null,
          env: environment,
          testAuthority: solTestAuthority,
        });
        solStore = await acquireCodexSolStore({
          runDir: runStore.runDir,
          runId: runStore.runId,
          invocationId: invocation.invocationId,
          invocationMarker,
          pi,
          env: environment,
          testAuthority: solTestAuthority,
          forceNonAuthoritative,
        });
        if (solStoreRef !== null) solStoreRef.current = solStore;
      }
      solTransport = await prepareCodexSolInvocation({
        runDir: runStore.runDir,
        store: solStore,
        invocationId: invocation.invocationId,
        invocationMarker,
        systemPrompt: systemPrompt ?? solTransportOptions?.systemPrompt ?? loadSolSystemPrompt(),
        env: environment,
      });
    } else {
      // Unreachable in 2.1: the classic SOL execution branch was removed
      // above (SOL_CLASSIC_NO_AUTHORITY). Kept as a structural guard only.
      throw new ControllerError(
        'the classic sol-xhigh SOL execution branch has no production authority in 2.1',
        'SOL_CLASSIC_NO_AUTHORITY',
        { model: route.targetModel },
      );
    }
    try {
      providerResult = await invokeBoundedProvider({
        boundary,
        projectConfig: project.config,
        repoDir,
        model: route.targetModel,
        reasoning: route.reasoningLevel ?? 'XHIGH',
        role: 'SOL',
        ask,
        broker: invocationBroker,
        invocationId: invocation.invocationId,
        onSpawn: (info) => supervisor.begin(info.pid),
        solTransport,
        solTestAuthority,
        env: environment,
      });
    } catch (error) {
      providerResult = {
        status: null,
        stdout: '',
        stderr: '',
        error: error?.message ?? 'SOL provider failed',
        timedOut: false,
        processCompleted: false,
        pid: null,
        provider: route.targetProvider,
        model: route.targetModel,
        reasoningEffort: route.reasoningLevel ?? 'XHIGH',
        role: 'SOL',
      };
    }
    if (invocationBroker !== null) {
      brokerEvidencePath = persistBrokerEvidence(runStore.runDir, workUnitId, invocationBroker, { fileKey: invocation.invocationId });
      if (evidencePaths !== null) evidencePaths.broker.push(brokerEvidencePath);
      await invocationBroker.close();
    }
    quiescence = await supervisor.quiesce();
    processLifetimeEvidencePath = persistProcessLifetimeEvidence(runStore.runDir, invocation.invocationId, quiescence);
    if (evidencePaths !== null) evidencePaths.processLifetime.push(processLifetimeEvidencePath);
    if (!quiescence.quiescenceVerified) {
      // FAIL CLOSED: the SOL decision is never compiled from a run whose
      // model-controlled processes could not be proven absent.
      await invocation.complete({ outcome: 'FAILURE', errorCode: 'PROCESS_TREE_QUIESCENCE_FAILED' });
      completed = true;
      await invocation.assess({
        assessmentResult: 'REJECTED',
        // The shared rejection taxonomy is frozen (Sprint-00); the distinct
        // fail-closed identity is carried by the controller event, the
        // process-lifetime evidence, and the ControllerError below.
        rejectionCode: 'UNSUPPORTED_CLAIM',
        summary: 'model-controlled descendant processes remained alive; invocation process-tree quiescence could not be proven',
        evidenceRefs: [`process-lifetime:${path.basename(processLifetimeEvidencePath)}`],
      });
      throw new ControllerError(
        'model-controlled descendant processes remained alive after the SOL invocation; invocation process-tree quiescence could not be proven and the run fails closed',
        'PROCESS_TREE_QUIESCENCE_FAILED',
        { remainingPids: quiescence.remainingPids },
      );
    }
    if (solTransport !== null && quiescence.processAbsenceVerified === true) {
      solTransport.confirmProcessAbsence();
    }
    // Strict ordering for controller-side Pi SOL:
    // exit -> identity -> root/group/marker quiescence -> surface -> raw
    // credential scan -> verified cleanup -> strict gate -> parse ->
    // canonical-string scan -> compile/persist. No model text is parsed or
    // interpreted before every external transport/security proof is exact.
    if (solTransport !== null) {
      const reviewAuthority = solStore.nonAuthoritative === true
        ? SOL_REVIEW_AUTHORITY.TEST_SEAM_NON_AUTHORITATIVE
        : SOL_REVIEW_AUTHORITY.AUTHORITATIVE;
      reviewAuthorityForAttempt = reviewAuthority;
      const reload = solStore.refreshFromDisk();
      reloadResult = reload;
      inspection = inspectSolTransportSurface({ store: solStore, transport: solTransport, pi: solStore.pi });
      const rawLeak = scanForCredentialLeakDetailed(solTransport, {
        stdout: providerResult.stdout ?? '',
        stderr: providerResult.stderr ?? '',
      });
      rawScanState = rawLeak.scanState;
      rawScanIncompleteReasons = rawLeak.incompleteReasons;
      leakDetected = rawLeak.detected;
      leakChannel = rawLeak.detected ? rawLeak.channel : null;
      if (leakDetected) solStore.markLeak();
      // Invocation cleanup is itself a required positive proof and must
      // complete before the raw model text is parsed.
      await cleanupInvocationTransport();
      const proof = {
        status: providerResult.status,
        error: providerResult.error,
        timedOut: providerResult.timedOut,
        truncated: providerResult.truncated,
        processCompleted: providerResult.processCompleted,
        identityVerifiedBeforeSpawn: providerResult.identityVerifiedBeforeSpawn,
        identityVerifiedAfterExit: providerResult.identityVerifiedAfterExit,
        processAbsenceVerified: quiescence.processAbsenceVerified === true,
        quiescenceVerified: quiescence.quiescenceVerified === true,
        surfaceVerified: inspection.ok === true,
        // Sixth-review rule: an INCOMPLETE raw credential scan can never
        // claim credentialScanPassed (fail closed).
        credentialScanPassed: reload.ok === true && rawScanState === 'COMPLETE' && !leakDetected,
        rawScanState,
        rawScanIncompleteReasons,
        cleanupVerified: cleanupOutcome?.verified === true,
        reviewAuthority,
      };
      const gate = assessSolTransportResult(proof, {
        allowNonAuthoritativeTestSeam: solStore.nonAuthoritative === true,
      });
      if (!gate.ok) {
        transportErrorCode = leakDetected ? TRANSPORT_CREDENTIAL_LEAK
          : !reload.ok ? 'SOL_OAUTH_RELOAD_FAILED'
            : !inspection.ok ? 'SOL_TRANSPORT_SURFACE_VIOLATION'
              : cleanupFailed ? SOL_TRANSPORT_CLEANUP_FAILED
                : rawScanState === 'INCOMPLETE' ? 'SOL_CREDENTIAL_SCAN_INCOMPLETE'
                  : codexReauthenticationRequired(providerResult) ? 'CODEX_OAUTH_UNAVAILABLE'
                    : 'SOL_TRANSPORT_REJECTED';
        // Fifth-review rule: the canonical (parsed-value) credential scan
        // never ran, so no proof record may claim credentialScanPassed.
        transportProofEvidence = { ...proof, credentialScanPassed: false, gatePassed: false, rawScanState, rawScanIncompleteReasons };
        transportProofsPassed = false;
        // Sixth-review rule: the immutable exact-invocation transport
        // proof (a FAILED gate) is still persisted+fsynced now — before any
        // parse (there is none on this path).
        if (!persistTransportProofFailClosed()) {
          throw new ControllerError(
            'authoritative SOL transport proof evidence could not be persisted; the transport fails closed',
            'SOL_TRANSPORT_EVIDENCE_FAILED',
            {},
          );
        }
      } else {
        transportProofEvidence = { ...proof, gatePassed: gate.ok, rawScanState, rawScanIncompleteReasons };
        transportProofsPassed = gate.ok;
        // Sixth-review rule: the immutable exact-invocation transport
        // proof is persisted AND fsynced BEFORE provider output is parsed.
        // A crash during parsing can never lose the transport gate facts,
        // and an evidence persistence failure fails the transport closed.
        if (!persistTransportProofFailClosed()) {
          throw new ControllerError(
            'authoritative SOL transport proof evidence could not be persisted; the transport fails closed',
            'SOL_TRANSPORT_EVIDENCE_FAILED',
            {},
          );
        }
        // Gate passed: only now may the controller parse model output. The
        // post-parse scalar scan is an additional mandatory credential
        // check before response compilation/persistence.
        parsed = parseProviderJson(providerResult.stdout);
        let canonicalScanCompleted = false;
        let canonicalValues = [];
        try {
          canonicalValues = collectCanonicalStringValues(parsed?.value ?? null);
          canonicalScanCompleted = true;
        } catch (error) {
          // Fifth-review rule: an INCOMPLETE canonical credential scan can
          // never claim credentialScanPassed; the gate fails closed below
          // and the persisted evidence records credentialScanPassed=false.
          transportErrorCode = error?.code === 'SOL_RESPONSE_TOO_LARGE' ? 'SOL_RESPONSE_TOO_LARGE' : 'SOL_TRANSPORT_REJECTED';
        }
        // Re-assess after the parsed-scalar scan. The first gate guarded
        // parsing itself; this second exact gate guards compilation and
        // persistence with the complete raw+canonical credential proof.
        const canonicalProof = { ...proof, credentialScanPassed: canonicalScanCompleted && canonicalScanState === 'COMPLETE' && !leakDetected };
        if (canonicalScanCompleted) {
          const canonicalLeak = scanForCredentialLeakDetailed(solTransport, {
            stdout: providerResult.stdout ?? '',
            stderr: providerResult.stderr ?? '',
            values: canonicalValues,
          });
          canonicalScanState = canonicalLeak.scanState;
          canonicalScanIncompleteReasons = canonicalLeak.incompleteReasons;
          if (canonicalLeak.detected) {
            leakDetected = true;
            leakChannel = canonicalLeak.channel;
            solStore.markLeak();
          }
          canonicalProof.credentialScanPassed = canonicalScanState === 'COMPLETE' && !leakDetected;
        }
        const canonicalGate = assessSolTransportResult(canonicalProof, {
          allowNonAuthoritativeTestSeam: solStore.nonAuthoritative === true,
        });
        transportProofEvidence = { ...canonicalProof, gatePassed: canonicalGate.ok, rawScanState, rawScanIncompleteReasons, canonicalScanState, canonicalScanIncompleteReasons };
        transportProofsPassed = canonicalGate.ok;
        if (!canonicalGate.ok) {
          transportErrorCode = leakDetected ? TRANSPORT_CREDENTIAL_LEAK
            : (canonicalScanCompleted && canonicalScanState === 'INCOMPLETE') ? 'SOL_CREDENTIAL_SCAN_INCOMPLETE'
              : (transportErrorCode ?? 'SOL_TRANSPORT_REJECTED');
        }
      }
      if (transportErrorCode === TRANSPORT_CREDENTIAL_LEAK) {
        // Never return raw credential-bearing bytes to later stages.
        providerResult = {
          ...providerResult,
          status: null,
          stdout: '',
          stderr: '',
          error: `provider output contained credential material and was rejected; invocation fails closed (${TRANSPORT_CREDENTIAL_LEAK})`,
          credentialLeak: true,
          leakChannel,
        };
      }
    } else {
      // Classic SOL remains on its existing broker/boundary transport. It
      // still refuses malformed/timeout/incomplete results before parsing;
      // the controller-side Pi proof profile above applies only to Codex.
      const classicGate = providerResult.status === 0
        && providerResult.error === null
        && providerResult.timedOut === false
        && providerResult.processCompleted === true
        && providerResult.truncated !== true;
      if (!classicGate) transportErrorCode = 'SOL_TRANSPORT_REJECTED';
      else parsed = parseProviderJson(providerResult.stdout);
    }
  } catch (error) {
    if (quiescence === null) {
      try {
        quiescence = await supervisor.quiesce();
      } catch {
        // Best-effort; the original failure is the primary fail-closed result.
      }
      if (quiescence !== null && processLifetimeEvidencePath === null) {
        try {
          processLifetimeEvidencePath = persistProcessLifetimeEvidence(runStore.runDir, invocation.invocationId, quiescence);
        } catch {
          // Evidence persistence failure must not mask the original error.
        }
      }
    }
    if (solTransport !== null && quiescence?.quiescenceVerified === true) {
      solTransport.confirmProcessAbsence();
    }
    if (invocationBroker !== null) {
      try {
        if (brokerEvidencePath === null) {
          brokerEvidencePath = persistBrokerEvidence(runStore.runDir, workUnitId, invocationBroker, { fileKey: invocation.invocationId });
        }
      } catch {
        // The invocation failure remains primary.
      }
      try {
        await invocationBroker.close();
      } catch {
        // The invocation failure remains primary.
      }
    }
    // Cleanup happens before evidence: no record can claim success while a
    // finally block has not yet positively observed removal.
    await cleanupInvocationTransport();
    if (solTransport !== null) {
      try {
        solTransportEvidencePath = persistSolTransportEvidence(runStore.runDir, invocation.invocationId, {
          pi: solTransport.pi,
          transport: solTransport,
          store: solStore,
          flags: [...(leakDetected ? ['credential-leak-rejected'] : []), ...(cleanupFailed ? ['cleanup-failed'] : [])],
          leak: leakDetected,
          leakChannel: leakDetected ? leakChannel : null,
          inspection,
          reload: reloadResult,
          cleanup: cleanupOutcome,
          argv: providerResult?.argvSanitized ?? null,
          promptDigest: providerResult?.promptDigest ?? null,
          systemPromptDigest: providerResult?.systemPromptDigest ?? null,
          proofs: transportProofEvidence,
        });
        if (evidencePaths !== null) evidencePaths.solTransport.push(solTransportEvidencePath);
      } catch {
        // The invocation failure remains primary.
      }
    }
    if (!completed) {
      try {
        await runStore.reconcileInvocation({
          invocationId: invocation.invocationId,
          reason: 'CRASH_AFTER_START',
          note: 'SOL invocation failed before provider completion; run fails closed',
        });
      } catch {
        // The invocation failure remains primary.
      }
    }
    throw error;
  }
  // Successful path: process absence was proven above, then cleanup must
  // finish before any evidence/disposition can be recorded.
  await cleanupInvocationTransport();
  const outcome = providerResult.timedOut ? 'TIMEOUT' : providerResult.error !== null || !providerResult.processCompleted ? 'TRANSPORT_ERROR' : providerResult.status === 0 ? 'SUCCESS' : 'FAILURE';
  await invocation.complete({ outcome, errorCode: outcome === 'SUCCESS' ? undefined : 'SOL_PROVIDER_FAILED' });
  completed = true;
  // Credential discipline (SOL-S11-003): raw Codex stdout/stderr is NEVER
  // persisted as runtime evidence. Only the validated canonical SOL
  // response artifact (compiled below, after every acceptance check) may
  // be persisted; a credential leak or any failed gate persists nothing.
  const rawRef = null;
  // Wipe the worker scratch surface after quiescence so the classic SOL
  // invocation's per-invocation Pi config/token never outlives its
  // invocation (the codex transport removes its own surface in finally).
  if (boundary !== null) {
    resetWorkerScratch(boundary.scratchRoot);
  }
  let response = null;
  let conversion = null;
  let errorCode = null;
  if (transportErrorCode !== null) {
    errorCode = transportErrorCode;
  } else if (cleanupFailed) {
    // SOL-S11-006: cleanup failure fails closed — the invocation cannot be
    // ACCEPTED and can never produce REVIEW_APPROVED.
    errorCode = SOL_TRANSPORT_CLEANUP_FAILED;
  } else if (parsed === null || parsed.error !== null) {
    errorCode = 'TRANSPORT_MALFORMED';
  } else {
    try {
      response = compileSolResponse(sanitizeSolInput(parsed.value), { ask, sources: [contract] });
      persistSolArtifact(runStore.runDir, 'responses', response.responseId, response);
      if (callType === 'SOL_DIAGNOSE' && response.verdict === 'CAUSE_IDENTIFIED') {
        conversion = compileRepairTicket({ ask, response, sources: [contract] });
        persistSolArtifact(runStore.runDir, 'tickets', conversion.ticket.ticketId, conversion);
      }
    } catch (error) {
      errorCode = error?.code === 'SOL_ASK_INVALID' ? 'SOL_ASK_INVALID' : 'SCHEMA_MISMATCH';
    }
  }
  let accepted = response !== null && errorCode === null && !cleanupFailed;
  // Sixth-review rule: the SEMANTIC-ACCEPTANCE binding is persisted as a
  // SEPARATE record only after successful parsing and SOL compilation,
  // fsynced and bound to the immutable transport proof. No malformed or
  // rejected output can create a semantic-acceptance record. Persistence
  // failure fails every transport closed, including test seams.
  let solSemanticEvidencePath = null;
  if (solTransport !== null && response !== null && errorCode === null && accepted) {
    try {
      solSemanticEvidencePath = persistSolSemanticAcceptance(runStore.runDir, invocation.invocationId, {
        store: solStore,
        transportProofRef: solTransportEvidencePath,
        askId: ask.askId,
        responseId: response?.responseId ?? null,
        callType,
        verdict: response?.verdict ?? null,
        errorCode,
        finalAcceptance: accepted,
        semanticAccepted: response !== null,
        rawScanState,
        rawScanIncompleteReasons,
        canonicalScanState,
        canonicalScanIncompleteReasons,
        credentialScanPassed: transportProofEvidence?.credentialScanPassed ?? null,
        leak: leakDetected,
        leakChannel: leakDetected ? leakChannel : null,
      });
      if (evidencePaths !== null) evidencePaths.solTransport.push(solSemanticEvidencePath);
    } catch (error) {
      const evidenceFailCode = assessEvidencePersistenceFailure({ accepted });
      if (evidenceFailCode !== null) {
        errorCode = evidenceFailCode;
        accepted = false;
      }
    }
  }
  // Sixth-review scope simplification: refreshed credentials stay inside
  // the run-scoped isolated store (within-run continuity for SOL_RECHECK).
  // There is NO write-back/reconciliation to the real Pi auth store — the
  // real store is read-only input authority and no LCIM execution path
  // mutates it.
  const refs = [...evidenceRefs, `sol-ask:${ask.askId}`];
  await invocation.assess({
    assessmentResult: accepted ? 'ACCEPTED' : 'REJECTED',
    // The shared ledger rejection taxonomy is frozen (Sprint-00): the
    // distinct fail-closed identity for a credential leak and every other
    // transport-level refusal is carried by the controller event, the
    // transport evidence, and the run-level error — never by the ledger
    // rejectionCode, which stays a taxonomy code.
    rejectionCode: accepted ? undefined : (TRANSPORT_TAXONOMY_CODES.has(errorCode) ? 'TRANSPORT_MALFORMED' : errorCode ?? 'SOL_ASK_INVALID'),
    summary: accepted ? 'compiled SOL response bound to the exact ask' : staticReason({ code: errorCode ?? 'SOL_ASK_INVALID' }, 'SOL_ASK_INVALID'),
    evidenceRefs: refs,
  });
  appendControllerEvent(runStore.runDir, {
    kind: 'SOL_ASSESSMENT',
    workUnitId,
    invocationId: invocation.invocationId,
    callType,
    askId: ask.askId,
    responseId: response?.responseId ?? null,
    responseVerdict: response?.verdict ?? null,
    accepted,
    rejectionCode: errorCode,
    rawResponseRef: rawRef,
  });
  const transportRefs = [
    ...(solTransportEvidencePath === null ? [] : [`sol-transport:${path.basename(solTransportEvidencePath)}`]),
    ...(solSemanticEvidencePath === null ? [] : [`sol-semantic:${path.basename(solSemanticEvidencePath)}`]),
  ];
  return Object.freeze({
    invocationId: invocation.invocationId,
    callType,
    ask,
    response,
    conversion,
    accepted,
    errorCode,
    evidenceRefs: [...refs, ...transportRefs],
    boundaryEvidencePath,
    brokerEvidencePath,
    solTransportEvidencePath,
    solTransportStore: solStore,
    processLifetimeEvidencePath,
  });
}

async function ensureWorktree({ repoDir, runStore, workUnitId, expectedBaseSha, worktreeRoot }) {
  // The disposable worker worktree is prepared ONCE per run (Sprint-03
  // semantics); execution boundaries are per-invocation (R3) and are
  // authorized separately for each automatic provider invocation.
  const worktree = prepareWorkerWorktree({ repoDir, worktreeRoot, expectedBaseSha, workUnitId });
  return { worktree };
}

/**
 * Authorize ONE fresh execution boundary for ONE automatic provider
 * invocation, binding the exact invocation identity, work unit, worktree,
 * denied roots, credential policy, network policy, canonical sandbox
 * executable, profile digest, and (for external transport) exactly this
 * invocation's broker endpoint and per-invocation Pi config surface.
 */
async function authorizeInvocationBoundary({ runStore, repoDir, worktree, workUnitId, invocationId, invocationMarker, credentialProbePaths, sandboxExecutable, broker, processCreation = 'DENIED' }) {
  const authorized = await authorizeWorkerExecutionBoundary({
    repoDir,
    worktreeDir: worktree.worktreeDir,
    runDir: runStore.runDir,
    workUnitId,
    invocationId,
    invocationMarker,
    credentialProbePaths,
    // SOL-S10-001 R4: model invocations run under the no-descendant
    // boundary by default (fail-safe); validation boundaries explicitly
    // request ALLOWED in validation-runner.mjs.
    processCreation,
    ...(sandboxExecutable === undefined ? {} : { sandboxExecutable }),
    // The per-invocation broker's loopback port is pinned into THIS
    // invocation's Seatbelt profile; no other boundary ever allows it.
    ...(broker === null || broker === undefined ? {} : { broker: { port: broker.port } }),
    ...(broker === null || broker === undefined ? {} : { piAgentDir: path.join(worktree.worktreeDir, '.lcim-scratch', invocationId, 'pi-agent') }),
  });
  const boundaryEvidencePath = persistBoundaryEvidence(runStore.runDir, `${workUnitId}-${invocationId}`, authorized.evidence);
  appendControllerEvent(runStore.runDir, {
    kind: 'EXECUTION_BOUNDARY_VERIFIED',
    workUnitId,
    invocationId,
    mechanism: authorized.evidence.mechanism,
    networkMode: authorized.evidence.network.mode,
    allowedWriteRoot: authorized.evidence.allowedWriteRoot,
    evidenceRef: `boundary:${path.basename(boundaryEvidencePath)}`,
  });
  return { boundary: authorized.boundary, boundaryEvidencePath };
}

/** Snapshot production supervisor timing only; raw process tables are not an API input. */
function snapshotProcessSupervisorOptions(value) {
  if (value === undefined || value === null) return null;
  assertPlainOptions(value, 'processSupervisorOptions');
  const allowed = new Set(['pollIntervalMs', 'terminateGraceMs', 'verifyGraceMs']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new ConfigError(`unsupported processSupervisorOptions.${key}`);
  const result = {};
  for (const key of ['pollIntervalMs', 'terminateGraceMs', 'verifyGraceMs']) {
    const item = ownDataProperty(value, key, 'processSupervisorOptions');
    if (item !== undefined) {
      if (!Number.isSafeInteger(item)) throw new ConfigError(`processSupervisorOptions.${key} must be an integer`);
      result[key] = item;
    }
  }
  return Object.freeze(result);
}

/** Snapshot all authority-affecting public controller inputs before any await. */
export function snapshotControllerInputs(input) {
  if (input === undefined) input = {};
  assertPlainOptions(input, 'runController options');
  const known = new Set(['cwd', 'workerCommand', 'solCommand', 'worktreeRoot', 'credentialProbePaths', 'sandboxExecutable', 'semanticValidator', 'processSupervisorOptions', 'solTransportOptions', 'testCapability', 'project']);
  for (const key of Object.keys(input)) if (!known.has(key)) throw new ConfigError(`unsupported runController option '${key}'`);
  const suppliedProject = ownDataProperty(input, 'project', 'runController options');
  // Public project injection is deliberately removed. Loading through the
  // project adapter is the only path that performs normal schema/version/
  // sensitive-field normalization, so ordinary data cannot carry internal
  // seam state such as sol.seamAuthorized.
  if (suppliedProject !== undefined && suppliedProject !== null) throw new ConfigError('runController project injection is not supported; load normalized target project configuration from disk');
  const cwdValue = ownDataProperty(input, 'cwd', 'runController options');
  const cwd = cwdValue === undefined ? process.cwd() : cwdValue;
  if (typeof cwd !== 'string' || cwd.length === 0) throw new ConfigError('runController cwd must be a non-empty string');
  const workerCommand = snapshotStringArgv(ownDataProperty(input, 'workerCommand', 'runController options'), 'workerCommand');
  const solCommand = snapshotStringArgv(ownDataProperty(input, 'solCommand', 'runController options'), 'solCommand');
  const worktreeRootValue = ownDataProperty(input, 'worktreeRoot', 'runController options');
  const worktreeRoot = worktreeRootValue === undefined ? null : worktreeRootValue;
  if (worktreeRoot !== null && (typeof worktreeRoot !== 'string' || !path.isAbsolute(worktreeRoot))) throw new ConfigError('worktreeRoot must be null or an absolute path');
  const credentialPathsValue = ownDataProperty(input, 'credentialProbePaths', 'runController options');
  const credentialProbePaths = credentialPathsValue === undefined ? Object.freeze([]) : snapshotStringArgv(credentialPathsValue, 'credentialProbePaths', { allowUndefined: false });
  const sandboxValue = ownDataProperty(input, 'sandboxExecutable', 'runController options');
  const sandboxExecutable = sandboxValue === undefined ? undefined : sandboxValue;
  if (sandboxExecutable !== undefined && (typeof sandboxExecutable !== 'string' || !path.isAbsolute(sandboxExecutable))) throw new ConfigError('sandboxExecutable must be an absolute path when provided');
  const semanticValidator = ownDataProperty(input, 'semanticValidator', 'runController options');
  if (semanticValidator !== undefined && typeof semanticValidator !== 'function') throw new ConfigError('semanticValidator must be a function when provided');
  const processSupervisorOptions = snapshotProcessSupervisorOptions(ownDataProperty(input, 'processSupervisorOptions', 'runController options'));
  const rawTransport = ownDataProperty(input, 'solTransportOptions', 'runController options');
  let solTransportOptions = null;
  if (rawTransport !== undefined && rawTransport !== null) {
    const copied = snapshotJson(rawTransport, 'solTransportOptions');
    for (const key of Object.keys(copied)) if (!['piBin', 'systemPrompt'].includes(key)) throw new ConfigError(`unsupported solTransportOptions.${key}`);
    if (copied.piBin !== undefined && (typeof copied.piBin !== 'string' || !path.isAbsolute(copied.piBin))) throw new ConfigError('solTransportOptions.piBin must be an absolute path');
    if (copied.systemPrompt !== undefined && (typeof copied.systemPrompt !== 'string' || copied.systemPrompt.length === 0)) throw new ConfigError('solTransportOptions.systemPrompt must be non-empty text');
    solTransportOptions = snapshotFrozenJson(copied, 'solTransportOptions');
  }
  const testCapability = ownDataProperty(input, 'testCapability', 'runController options');
  // Raw process tables are not accepted here. node:test may capture one
  // only inside an opaque capability; it is claimed once after run creation,
  // bound to that exact run, and the run remains non-authoritative.
  const hasTestProcessTable = solTestSeamHasProcessTable(testCapability);
  const requiresOpaqueSolSeam = solTransportOptions !== null || solCommand !== undefined || hasTestProcessTable;
  const solTestAuthority = requiresOpaqueSolSeam
    ? consumeSolTestSeam(testCapability, solTransportOptions !== null ? 'solTransportOptions' : solCommand !== undefined ? 'solCommand' : 'test process table')
    : null;
  // Any injected callback/supervisor/command/fixture makes the run's SOL
  // result permanently non-authoritative. This boolean is snapshotted here;
  // later caller mutation cannot upgrade authority.
  const hasTestSeam = requiresOpaqueSolSeam || workerCommand !== undefined || semanticValidator !== undefined || processSupervisorOptions !== null || sandboxExecutable !== undefined;
  return Object.freeze({
    cwd,
    workerCommand,
    solCommand,
    worktreeRoot,
    credentialProbePaths,
    sandboxExecutable,
    semanticValidator,
    processSupervisorOptions,
    hasTestProcessTable,
    solTransportOptions,
    solTestAuthority,
    hasTestSeam,
    environment: snapshotEnvironment(process.env),
  });
}

/** Execute one reviewable V2 work unit. */
export async function runController(input = {}) {
  // Everything below this point uses this frozen snapshot only. This code is
  // intentionally before the first await (startup reconciliation).
  const inputs = snapshotControllerInputs(input);
  const {
    cwd, workerCommand, solCommand, worktreeRoot: inputWorktreeRoot,
    credentialProbePaths, sandboxExecutable, semanticValidator,
    processSupervisorOptions: snappedProcessSupervisorOptions,
    hasTestProcessTable, solTransportOptions, solTestAuthority,
    hasTestSeam, environment,
  } = inputs;
  let processSupervisorOptions = snappedProcessSupervisorOptions;
  let worktreeRoot = inputWorktreeRoot;
  const loadedProject = loadProjectConfig({ cwd });
  const project = snapshotFrozenJson({
    repoDir: loadedProject.repoDir,
    configPath: loadedProject.configPath,
    exists: loadedProject.exists,
    migrated: loadedProject.migrated,
    config: loadedProject.config,
    configDigest: loadedProject.configDigest,
  }, 'normalized project configuration');
  const repoDir = project.repoDir;
  assertPiAgentOverrideOutsideTarget(repoDir, environment);
  const targetBaseSha = resolveHeadSha(repoDir);
  const contract = compileProjectContract(project);
  const routingConfig = effectiveRoutingConfig(project.config, { workerCommand, solCommand, solTestAuthority });
  const effectiveConfigDigest = digestConfig(routingConfig);
  const runtimeRoot = resolveRuntimeRoot(repoDir);
  const solSystemPrompt = solTransportOptions?.systemPrompt ?? loadSolSystemPrompt();
  // SOL-S11-006: startup reconciliation — stale controller-owned SOL
  // transport surfaces (crash leftovers of terminal runs) are recognized
  // by their controller marker, orphaned Pi processes are terminated by
  // their invocation marker, and the surfaces are removed. Failure fails
  // closed: a new run never starts beside unremoved isolated credential
  // surfaces.
  const staleSweep = await reconcileStaleSolTransportSurfaces(runtimeRoot);
  if (!staleSweep.ok) {
    throw new ControllerError(
      'stale controller-owned SOL transport surfaces could not be reconciled at startup; refusing to start',
      'SOL_TRANSPORT_RECONCILE_FAILED',
      { failures: staleSweep.failures },
    );
  }
  const runStore = await RunStore.create({ cwd: repoDir, targetBaseSha, configDigest: effectiveConfigDigest });
  if (hasTestProcessTable) {
    const processTable = claimSolTestProcessTable(solTestAuthority, runStore.runId, 'runController test process table');
    if (typeof processTable.list !== 'function') throw new ConfigError('runController test process table requires list()');
    processSupervisorOptions = Object.freeze({ ...(processSupervisorOptions ?? {}), processTable });
  }
  const workUnitId = generateId('work-unit');
  const unit = createControllerWorkUnit({ runId: runStore.runId, workUnitId, expectedBaseSha: targetBaseSha, projectConfig: project.config });
  persistWorkUnit(runStore.runDir, unit);
  persistWorkUnit(runStore.runDir, { ...unit, status: 'IN_PROGRESS' });

  const budget = createBudgetTracker({ unitCalls: project.config.budgets.unitCalls, runCalls: project.config.budgets.runCalls });
  let state = 'ROUTING_READY';
  let resultAccepted = false;
  let latestRejection = null;
  let failureHistory = [];
  let repairsDispatched = 0;
  let solDiagnosis = null;
  let solReview = null;
  let solFindings = [];
  let activeFindingId = null;
  let stuckEvidence = {};
  let priorSolChain = null;
  let repairContract = null;
  let repairBinding = null;
  let patchRecord = null;
  let allEvidenceRefs = [];
  let lastHandoff = null;
  let lastAttempt = null;
  let context = null;
  let worktreeRootOwned = false;
  const usedBrokerPorts = new Set();
  // Evidence paths are collected through a shared collector so they survive
  // fail-closed throws (e.g. PROCESS_TREE_QUIESCENCE_FAILED) that abort the
  // attempt before it can return normally.
  const invocationEvidencePaths = { boundary: [], broker: [], processLifetime: [], validation: [], solTransport: [] };
  const boundaryEvidencePaths = invocationEvidencePaths.boundary;
  const brokerEvidencePaths = invocationEvidencePaths.broker;
  const processLifetimeEvidencePaths = invocationEvidencePaths.processLifetime;
  const validationEvidencePaths = invocationEvidencePaths.validation;
  const solTransportEvidencePaths = invocationEvidencePaths.solTransport;
  const routeDecisions = [];
  const controllerErrors = [];
  let finalDisposition = 'REJECTED';
  let finalReason = 'UNSUPPORTED_CLAIM';
  let candidate = null;
  // Run-scoped SOL transport store (codex channel): created by the first
  // SOL invocation and removed at run end; refreshed state is never written
  // back to the real read-only source store.
  let solStore = null;
  // Retained from the instant it is acquired, including exception paths.
  const solStoreRef = { current: null };

  try {
    for (let step = 0; step < MAX_CONTROLLER_STEPS; step += 1) {
      const ctx = routeContext({
        workUnitId,
        runId: runStore.runId,
        state,
        contract,
        budget,
        routingConfig,
        environment,
        resultAccepted,
        latestRejection,
        failureHistory,
        repairsDispatched,
        solDiagnosis,
        solReview,
        solFindings,
        activeFindingId,
        stuckEvidence,
        evidenceRefs: allEvidenceRefs,
      });
      const route = decideRoute(ctx);
      routeDecisions.push(route);
      persistRouteDecision(runStore.runDir, route);
      appendControllerEvent(runStore.runDir, { kind: 'ROUTE_DECISION', workUnitId, decisionId: route.decisionId, decision: route.decision, nextState: route.nextState, reasonCode: route.reasonCode });

      if (route.decision === 'ROUTE_COMPLETE') {
        if (solFindings.some((finding) => finding.status === 'OPEN')) {
          finalDisposition = 'REJECTED';
          finalReason = 'UNSUPPORTED_CLAIM';
          controllerErrors.push({ code: 'OPEN_AUTHORITATIVE_SOL_FINDING', message: 'a work unit with an open authoritative SOL finding cannot complete or receive review approval' });
        } else {
          finalDisposition = contract.riskClass === 'LOW_RISK' ? 'SEMANTICALLY_ACCEPTED' : 'REVIEW_APPROVED';
          finalReason = null;
        }
        break;
      }
      if (route.decision === 'STOP_BUDGET') {
        finalDisposition = 'REJECTED';
        finalReason = 'BUDGET_EXHAUSTED';
        break;
      }
      if (route.decision === 'STOP_STUCK') {
        finalDisposition = 'REJECTED';
        finalReason = latestRejection?.rejectionCode ?? route.reasonCode;
        break;
      }
      if (route.decision === 'FAIL_NO_SUBSTITUTE') {
        finalDisposition = 'REJECTED';
        finalReason = 'UNSUPPORTED_CLAIM';
        controllerErrors.push({ code: route.reasonCode, message: 'required provider capability is unavailable; no substitute was selected' });
        break;
      }

      state = route.nextState;
      const routeRole = route.decision.startsWith('ROUTE_SOL_') ? 'SOL' : 'WORKER';
      if (usesExternalProvider({ projectConfig: routingConfig, role: routeRole }) && !isExternalProviderAllowed(project)) {
        finalDisposition = 'REJECTED';
        finalReason = 'UNSUPPORTED_CLAIM';
        controllerErrors.push({ code: 'PROVIDER_PERMISSION_DENIED', message: 'external provider permission was not granted; no provider process was spawned' });
        break;
      }
      if (context === null) {
        if (worktreeRoot === null) {
          worktreeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-v2-worker-root-'));
          worktreeRootOwned = true;
        }
        // The disposable worker worktree is prepared once per run; the
        // execution boundary is per-invocation (R3) and is authorized by
        // the attempt with the exact network policy and broker endpoint
        // for THAT invocation only.
        context = await ensureWorktree({ project, repoDir, runStore, workUnitId, expectedBaseSha: targetBaseSha, worktreeRoot });
      }
      budget.consume();

      if (route.decision.startsWith('ROUTE_IMPLEMENT_')) {
        if (route.targetRole === 'REPAIR') {
          let activeFinding = null;
          if (activeFindingId !== null) {
            activeFinding = solFindings.find((finding) => finding.findingId === activeFindingId && finding.status === 'OPEN');
            if (activeFinding === undefined || repairBinding?.findingId !== activeFindingId || repairContract?.repairId !== repairBinding.repairId) {
              throw new ControllerError('targeted repair dispatch is not bound to one open authoritative SOL finding and its controller repair contract', 'SOL_ASK_INVALID');
            }
          } else {
            // Fifth-review rule: every accepted adjacentCriticalDefect (and
            // every ordinary finding) becomes an authoritative open defect
            // record; defects are repaired sequentially (one bounded repair
            // each) and completion stays blocked until all are explicitly
            // resolved or left open/STUCK. A later open defect that was
            // never repaired yet is selected and repair-bound here, one at
            // a time, using its originating final-review exchange.
            activeFinding = solFindings.find((finding) => finding.status === 'OPEN' && (finding.repairCycles ?? 0) === 0);
            if (activeFinding === undefined) {
              throw new ControllerError('routing dispatched a targeted repair but no un-repaired open authoritative SOL finding exists', 'SOL_ASK_INVALID');
            }
            if (activeFinding.priorSol === null || typeof activeFinding.priorSol !== 'object') {
              throw new ControllerError('an un-repaired authoritative SOL finding has no originating final-review exchange; targeted repair is refused', 'SOL_ASK_INVALID');
            }
            const binding = createFinalReviewRepairBinding({
              contract,
              finding: activeFinding,
              ask: activeFinding.priorSol.ask,
              response: activeFinding.priorSol.response,
            });
            persistSolArtifact(runStore.runDir, 'repair-bindings', binding.ticket.repairId, binding.ticket);
            activeFindingId = activeFinding.findingId;
            repairContract = binding.repairContract;
            repairBinding = binding.ticket;
            appendControllerEvent(runStore.runDir, {
              kind: 'SOL_FINDING_REPAIR_BOUND', workUnitId, findingId: activeFindingId,
              repairId: binding.ticket.repairId, sourceAskId: binding.ticket.sourceAskId,
              sourceResponseId: binding.ticket.sourceResponseId, defectKind: binding.ticket.defectKind,
            });
          }
          activeFinding.repairCycles = (activeFinding.repairCycles ?? 0) + 1;
          repairsDispatched += 1;
          appendControllerEvent(runStore.runDir, {
            kind: 'SOL_FINDING_REPAIR_DISPATCHED', workUnitId, findingId: activeFindingId,
            repairId: repairBinding.repairId, sourceAskId: repairBinding.sourceAskId, sourceResponseId: repairBinding.sourceResponseId,
            repairCycles: activeFinding.repairCycles,
          });
        }
        const attempt = await executeWorkerAttempt({
          runStore,
          project: { ...project, config: routingConfig },
          contract,
          repoDir,
          runtimeRoot,
          worktree: context.worktree,
          route,
          workUnitId,
          repairContract,
          semanticValidator,
          credentialProbePaths,
          sandboxExecutable,
          usedBrokerPorts,
          processSupervisorOptions,
          evidencePaths: invocationEvidencePaths,
          environment,
        });
        lastAttempt = attempt;
        lastHandoff = attempt.handoff;
        patchRecord = attempt.patchRecord ?? patchRecord;
        allEvidenceRefs = [...new Set([...allEvidenceRefs, ...attempt.evidenceRefs])];
        resultAccepted = attempt.accepted;
        if (attempt.accepted) {
          latestRejection = null;
          state = route.nextState;
        } else {
          const criterion = sideEffectSpecs(contract)[0]?.sideEffectId ?? 'controller:patch';
          const rejectionCode = attempt.rejectionCode ?? 'UNSUPPORTED_CLAIM';
          latestRejection = { rejectionCode, rejectedAcceptanceRefs: [criterion] };
          failureHistory = [...failureHistory, { rejectedAcceptanceRefs: [criterion], credibleHypothesis: attempt.patchValid === true && attempt.transportValid === true }];
          resultAccepted = false;
          state = route.nextState;
          finalReason = rejectionCode;
        }
        continue;
      }

      const callType = routeCallType(route.decision);
      const finding = callType === 'SOL_RECHECK'
        ? solFindings.find((item) => item.findingId === activeFindingId && item.status === 'OPEN') ?? null
        : null;
      const prior = callType === 'SOL_RECHECK' ? finding?.priorSol ?? null : null;
      if (callType === 'SOL_RECHECK' && (finding === null || prior === null)) {
        throw new ControllerError('SOL_RECHECK must be bound to the selected open finding and its exact originating final-review exchange', 'SOL_ASK_INVALID');
      }
      if (callType === 'SOL_RECHECK') {
        appendControllerEvent(runStore.runDir, {
          kind: 'SOL_FINDING_RECHECK_DISPATCHED', workUnitId, findingId: finding.findingId,
          repairCycles: finding.repairCycles ?? 0, sourceAskId: prior.ask.askId, sourceResponseId: prior.response.responseId,
        });
      }
      let solResult;
      try {
        solResult = await executeSolAttempt({
          runStore,
          project: { ...project, config: routingConfig },
          repoDir,
          worktree: context.worktree,
          route,
          contract,
          patchRecord,
          evidenceRefs: allEvidenceRefs,
          priorSol: prior,
          finding,
          workUnitId,
          credentialProbePaths,
          sandboxExecutable,
          usedBrokerPorts,
          processSupervisorOptions,
          solTransportOptions,
          solTestAuthority,
          solStoreRef,
          environment,
          systemPrompt: solSystemPrompt,
          forceNonAuthoritative: hasTestSeam,
          evidencePaths: invocationEvidencePaths,
        });
      } catch (error) {
        if (solStoreRef.current !== null) solStore = solStoreRef.current;
        controllerErrors.push({ code: publicErrorCode(error, 'SOL_ASK_INVALID'), message: staticReason(error, 'SOL_ASK_INVALID') });
        finalDisposition = 'REJECTED';
        finalReason = publicErrorCode(error, 'SOL_ASK_INVALID');
        break;
      }
      if (solStoreRef.current !== null) solStore = solStoreRef.current;
      else if (solResult.solTransportStore !== null) solStore = solResult.solTransportStore;
      allEvidenceRefs = [...new Set([...allEvidenceRefs, ...solResult.evidenceRefs])];
      if (!solResult.accepted || solResult.response === null) {
        finalDisposition = 'REJECTED';
        finalReason = solResult.errorCode ?? 'SOL_ASK_INVALID';
        if (solResult.errorCode === 'CODEX_OAUTH_UNAVAILABLE') {
          controllerErrors.push({ code: 'CODEX_OAUTH_UNAVAILABLE', message: staticReason({ code: 'CODEX_OAUTH_UNAVAILABLE' }, 'CODEX_OAUTH_UNAVAILABLE') });
        }
        break;
      }
      const response = solResult.response;
      priorSolChain = { ask: solResult.ask, response };
      if (callType === 'SOL_DIAGNOSE') {
        if (response.verdict === 'CAUSE_IDENTIFIED' && solResult.conversion !== null) {
          repairContract = solResult.conversion.repairContract;
          solDiagnosis = { status: 'RESOLVED' };
          state = route.nextState;
          resultAccepted = false;
          latestRejection = null;
          continue;
        }
        finalDisposition = 'REJECTED';
        finalReason = 'UNSUPPORTED_CLAIM';
        break;
      }
      if (callType === 'SOL_CONTRACT_CHECK') {
        finalDisposition = 'REVIEW_REQUIRED';
        finalReason = 'UNRESOLVED_SEMANTICS';
        appendControllerEvent(runStore.runDir, { kind: 'CONTRACT_REVIEW', workUnitId, verdict: response.verdict, askId: solResult.ask.askId });
        break;
      }
      if (callType === 'SOL_FINAL_REVIEW') {
        const passed = response.verdict === 'PASS';
        const findingIds = [];
        for (const item of response.findings ?? []) {
          const findingRecord = persistFinding(runStore.runDir, {
            findingId: item.findingId,
            severity: item.severity ?? 'CRITICAL',
            invariantRef: item.invariantRef,
            summary: item.summary,
            evidenceRefs: item.evidenceRefs ?? [],
          });
          findingIds.push(findingRecord.findingId);
          solFindings.push({
            findingId: findingRecord.findingId,
            status: 'OPEN', repairCycles: 0, rechecks: 0, origin: 'FINAL_REVIEW',
            defectKind: 'FINDING',
            invariantRef: item.invariantRef, summary: item.summary,
            priorSol: Object.freeze({ ask: solResult.ask, response }),
          });
        }
        // Fifth-review rule: every accepted adjacentCriticalDefect becomes
        // an authoritative open defect record with a stable controller
        // identity (persisted via the shared review-finding ledger) and
        // evidence binding. It is repair-bound, rechecked, and explicitly
        // resolved or left open/STUCK; completion/REVIEW_APPROVED is
        // forbidden while any accepted adjacent critical defect is open.
        for (const [index, item] of (response.adjacentCriticalDefects ?? []).entries()) {
          // Fifth-review rule: the defect gets a STABLE controller
          // identity derived deterministically from its locked content, so
          // the exact RECHECK ask can bind to it through the prior
          // response without any caller-supplied mapping.
          const defectRecord = persistFinding(runStore.runDir, {
            findingId: adjacentDefectFindingId(item),
            severity: 'CRITICAL',
            summary: item.summary,
            evidenceRefs: item.evidenceRefs ?? [],
          });
          findingIds.push(defectRecord.findingId);
          solFindings.push({
            findingId: defectRecord.findingId,
            status: 'OPEN', repairCycles: 0, rechecks: 0, origin: 'FINAL_REVIEW',
            defectKind: 'ADJACENT_CRITICAL_DEFECT',
            invariantRef: null,
            lockedRequirementRef: item.lockedRequirementRef,
            adjacentIndex: index,
            summary: item.summary,
            evidenceRefs: Object.freeze([...(item.evidenceRefs ?? [])]),
            priorSol: Object.freeze({ ask: solResult.ask, response }),
          });
        }
        if (passed) {
          solReview = { verdict: 'PASSED', findingIds: [] };
          resultAccepted = true;
          state = route.nextState;
          continue;
        }
        const selected = solFindings.find((entry) => findingIds.includes(entry.findingId) && entry.status === 'OPEN');
        if (selected === undefined) throw new ControllerError('SOL_FINAL_REVIEW failure did not create a selectable authoritative finding', 'SOL_ASK_INVALID');
        const binding = createFinalReviewRepairBinding({ contract, finding: selected, ask: solResult.ask, response });
        persistSolArtifact(runStore.runDir, 'repair-bindings', binding.ticket.repairId, binding.ticket);
        activeFindingId = selected.findingId;
        repairContract = binding.repairContract;
        repairBinding = binding.ticket;
        solReview = { verdict: 'FINDING', findingIds };
        resultAccepted = false;
        state = route.nextState;
        appendControllerEvent(runStore.runDir, {
          kind: 'SOL_FINAL_REVIEW_FINDING_BOUND', workUnitId, findingId: selected.findingId,
          defectKind: selected.defectKind,
          repairId: binding.ticket.repairId, askId: solResult.ask.askId, responseId: response.responseId,
        });
        failureHistory = [...failureHistory, { rejectedAcceptanceRefs: [binding.ticket.lockedRequirementRef], credibleHypothesis: true }];
        continue;
      }
      if (callType === 'SOL_RECHECK') {
        const selected = finding;
        if (selected === null) throw new ControllerError('SOL_RECHECK lost its selected prior finding', 'SOL_ASK_INVALID');
        const passed = response.verdict === 'RESOLVED';
        selected.rechecks = (selected.rechecks ?? 0) + 1;
        if (passed) selected.status = 'CLOSED';
        const findingIds = [selected.findingId];
        for (const item of response.findings ?? []) {
          const findingRecord = persistFinding(runStore.runDir, {
            findingId: item.findingId,
            severity: item.severity ?? 'CRITICAL', invariantRef: item.invariantRef,
            summary: item.summary, evidenceRefs: item.evidenceRefs ?? [],
          });
          if (!findingIds.includes(findingRecord.findingId)) findingIds.push(findingRecord.findingId);
        }
        solReview = { verdict: passed ? 'PASSED' : 'FINDING', findingIds };
        resultAccepted = passed;
        state = route.nextState;
        appendControllerEvent(runStore.runDir, {
          kind: 'SOL_RECHECK_RECORDED', workUnitId, findingId: selected.findingId,
          verdict: response.verdict, status: selected.status, rechecks: selected.rechecks,
          sourceAskId: selected.priorSol.ask.askId, sourceResponseId: selected.priorSol.response.responseId,
        });
        if (passed) {
          activeFindingId = null;
          repairBinding = null;
          repairContract = null;
        }
        continue;
      }
    }

    // SOL-S11-002: a run that used any controller-internal test seam is
    // NON-AUTHORITATIVE — it is structurally incapable of producing
    // production REVIEW_APPROVED.
    if (finalDisposition === 'REVIEW_APPROVED' && hasTestSeam) {
      finalDisposition = 'REJECTED';
      finalReason = 'SOL_TEST_SEAM_NON_AUTHORITATIVE';
      controllerErrors.push({ code: 'SOL_TEST_SEAM_NON_AUTHORITATIVE', message: staticReason({ code: 'SOL_TEST_SEAM_NON_AUTHORITATIVE' }, 'SOL_TEST_SEAM_NON_AUTHORITATIVE') });
    }
    // SOL-S11-007 (within-run refresh continuity) + SOL-S11-006
    // (crash-resilient cleanup): refreshed credentials remain only in the
    // isolated run store. At run end LCIM verifies its read-only source
    // snapshot and securely removes the isolated store. No write-back API
    // or real-store locking/writing path exists.
    if (solStore !== null) {
      // Sixth-review scope simplification: no refresh write-back exists.
      // Verify the real Pi auth store is READ-ONLY — byte-identical to the
      // acquisition snapshot — and record the observation. An external
      // concurrent Pi refresh is reported (never repaired, never failed
      // closed: LCIM itself never wrote it). The strong guarantee is
      // structural: the reconciliation write path was removed entirely.
      if (typeof solStore.verifyRealAuthSourceUnchanged === 'function') {
        const realAuthReadOnly = solStore.verifyRealAuthSourceUnchanged();
        appendControllerEvent(runStore.runDir, {
          kind: 'SOL_REAL_AUTH_READONLY_VERIFIED',
          workUnitId,
          invocationId: null,
          readOnly: realAuthReadOnly.changed !== true,
          reason: realAuthReadOnly.reason ?? null,
          recordedAt: now(),
        });
      }
      if (!solStore.isRemoved()) {
        try {
          await solStore.remove();
        } catch (error) {
          controllerErrors.push({ code: SOL_TRANSPORT_CLEANUP_FAILED, message: staticReason({ code: SOL_TRANSPORT_CLEANUP_FAILED }, SOL_TRANSPORT_CLEANUP_FAILED) });
          finalDisposition = 'REJECTED';
          finalReason = SOL_TRANSPORT_CLEANUP_FAILED;
        }
      }
    }

    // Positive terminal transport cleanup is required before any candidate
    // or approval disposition is persisted. A failure leaves the run open
    // for explicit recovery and cannot create a reviewable acceptance.
    try {
      await requireTerminalSolTransportCleanup(runStore.runDir);
    } catch (error) {
      finalDisposition = 'REJECTED';
      finalReason = SOL_TRANSPORT_CLEANUP_FAILED;
      controllerErrors.push({
        code: SOL_TRANSPORT_CLEANUP_FAILED,
        message: staticReason({ code: SOL_TRANSPORT_CLEANUP_FAILED }, SOL_TRANSPORT_CLEANUP_FAILED),
      });
    }

    if ((finalDisposition === 'SEMANTICALLY_ACCEPTED' || finalDisposition === 'REVIEW_APPROVED') && solFindings.some((finding) => finding.status === 'OPEN')) {
      finalDisposition = 'REJECTED';
      finalReason = 'UNSUPPORTED_CLAIM';
      controllerErrors.push({ code: 'OPEN_AUTHORITATIVE_SOL_FINDING', message: 'open authoritative SOL findings prohibit unit completion and review approval' });
    }
    if (finalDisposition === 'REJECTED' && finalReason === null) finalReason = 'UNSUPPORTED_CLAIM';
    const boundaryRefs = boundaryEvidencePaths.map((file) => `boundary:${path.basename(file)}`);
    const processLifetimeRefs = processLifetimeEvidencePaths.map((file) => `process-lifetime:${path.basename(file)}`);
    const validationRefs = validationEvidencePaths.map((file) => `validation-evidence:${path.basename(file)}`);
    const solTransportRefs = solTransportEvidencePaths.map((file) => `sol-transport:${path.basename(file)}`);
    const dispositionRefs = [...new Set([...allEvidenceRefs, ...boundaryRefs, ...processLifetimeRefs, ...validationRefs, ...solTransportRefs])];
    if (finalDisposition === 'REJECTED') {
      finalReason = canonicalRejectionCode(finalReason);
      const rejection = persistRejection(runStore.runDir, {
        workUnitId,
        rejectionCode: finalReason,
        reason: staticReason({ code: finalReason }, 'UNSUPPORTED_CLAIM'),
        evidenceRefs: dispositionRefs,
        rejectedAt: now(),
      });
      persistDisposition(runStore.runDir, { workUnitId, disposition: 'REJECTED', reasonCode: rejection.rejectionCode, decidedAt: now(), evidenceRefs: dispositionRefs });
    } else if (finalDisposition === 'REVIEW_REQUIRED') {
      persistDisposition(runStore.runDir, { workUnitId, disposition: 'REVIEW_REQUIRED', decidedAt: now(), evidenceRefs: dispositionRefs });
    } else {
      persistDisposition(runStore.runDir, { workUnitId, disposition: 'PATCH_VALID', decidedAt: now(), evidenceRefs: dispositionRefs });
      persistDisposition(runStore.runDir, { workUnitId, disposition: 'SEMANTICALLY_ACCEPTED', decidedAt: now(), evidenceRefs: dispositionRefs });
      candidate = persistCandidate(runStore.runDir, {
        candidateId: patchRecord?.patchId ?? `candidate_${workUnitId}`,
        workUnitId,
        runId: runStore.runId,
        status: 'REVIEWABLE_CANDIDATE',
        disposition: finalDisposition,
        patchEvidenceId: patchRecord?.evidenceId ?? null,
        patchId: patchRecord?.patchId ?? null,
        patchHash: patchRecord?.patchHash ?? null,
        changedPaths: patchRecord?.changedPaths ?? [],
        expectedBaseSha: targetBaseSha,
        review: finalDisposition === 'REVIEW_APPROVED' ? 'SOL_REVIEWED' : 'NOT_REQUIRED_FOR_LOW_RISK',
      });
      if (finalDisposition === 'REVIEW_APPROVED') persistDisposition(runStore.runDir, { workUnitId, disposition: 'REVIEW_APPROVED', decidedAt: now(), evidenceRefs: dispositionRefs });
    }
    persistWorkUnit(runStore.runDir, { ...unit, status: finalDisposition === 'REJECTED' || finalDisposition === 'REVIEW_REQUIRED' ? 'FAILED' : 'COMPLETED' });
  } catch (error) {
    const details = error?.details;
    controllerErrors.push({
      code: publicErrorCode(error),
      message: staticReason(error, 'CONTROLLER_FAILED') + (details?.reason !== undefined && details?.reason !== null ? ` (${details.reason})` : ''),
    });
    finalDisposition = 'REJECTED';
    finalReason = canonicalRejectionCode(publicErrorCode(error, 'UNSUPPORTED_CLAIM'));
    try {
      persistDisposition(runStore.runDir, { workUnitId, disposition: 'REJECTED', reasonCode: finalReason, decidedAt: now(), evidenceRefs: allEvidenceRefs });
    } catch {
      // The finalizer below still preserves the invocation ledger.
    }
  } finally {
    // SOL-S11-006: the run-scoped credential store must never outlive the
    // run, success or failure (exception paths). Removal is observed, never
    // inferred; a leftover store is swept by `recover`/startup
    // reconciliation.
    if (solStore !== null && !solStore.isRemoved()) {
      try {
        await solStore.remove();
      } catch (error) {
        controllerErrors.push({ code: SOL_TRANSPORT_CLEANUP_FAILED, message: staticReason({ code: SOL_TRANSPORT_CLEANUP_FAILED }, SOL_TRANSPORT_CLEANUP_FAILED) });
      }
    }
    try {
      await runStore.reconcileOrphans();
    } catch (error) {
      controllerErrors.push({ code: 'INCOMPLETE_LEDGER', message: 'controller could not reconcile an open invocation lifecycle' });
    }
  }

  let lifecycleState = null;
  let finalSummary = null;
  try {
    // A run may not become terminal merely because its in-memory store
    // handle believes cleanup succeeded. Sweep the marker-bound on-disk
    // surfaces and positively verify process absence immediately before the
    // terminal ledger transition.
    await requireTerminalSolTransportCleanup(runStore.runDir);
    // The authoritative terminal transition always repeats cleanup with
    // canonical production process inspection inside RunStore.finalize().
    // A test table may exercise the earlier non-authoritative sweep, but it
    // can never prove the terminal absence fact.
    const finalized = await runStore.finalize();
    lifecycleState = finalized.lifecycleState;
    finalSummary = finalized.finalSummary;
  } catch (error) {
    controllerErrors.push({
      code: error?.code === SOL_TRANSPORT_CLEANUP_FAILED ? SOL_TRANSPORT_CLEANUP_FAILED : 'INCOMPLETE_LEDGER',
      message: error?.code === SOL_TRANSPORT_CLEANUP_FAILED
        ? staticReason({ code: SOL_TRANSPORT_CLEANUP_FAILED }, SOL_TRANSPORT_CLEANUP_FAILED)
        : 'run finalization failed; use lcim recover with the run id',
    });
    lifecycleState = 'INCOMPLETE_LEDGER';
  }

  const evidenceRefsForCleanup = [...new Set(allEvidenceRefs.filter((ref) => ref.startsWith('lcim_ev_') || ref.startsWith('patch:')).map((ref) => ref.startsWith('patch:') ? ref.slice('patch:'.length) : ref))];
  let cleanup = null;
  if (context !== null) {
    try {
      cleanup = cleanupWorkerWorktree({ repoDir, worktreeId: context.worktree.worktreeId, worktreeDir: context.worktree.worktreeDir, evidenceRefs: evidenceRefsForCleanup });
    } catch (error) {
      controllerErrors.push({ code: 'WORKTREE_CLEANUP_FAILED', message: 'disposable worker worktree was retained because identity/evidence cleanup checks failed' });
    }
  }
  if (worktreeRootOwned && worktreeRoot && fs.existsSync(worktreeRoot)) {
    // Never recursively remove a retained worktree after a cleanup failure;
    // only reclaim the controller-owned empty container.
    try {
      if (fs.readdirSync(worktreeRoot).length === 0) fs.rmSync(worktreeRoot, { recursive: true, force: true });
    } catch {
      // Retention is safer than a destructive cleanup guess.
    }
  }

  return Object.freeze({
    ok: (finalDisposition === 'SEMANTICALLY_ACCEPTED' || finalDisposition === 'REVIEW_APPROVED') && lifecycleState !== 'INCOMPLETE_LEDGER',
    runId: runStore.runId,
    workUnitId,
    repoDir,
    targetBaseSha,
    configDigest: effectiveConfigDigest,
    lifecycleState,
    finalSummary,
    disposition: finalDisposition,
    rejectionCode: finalDisposition === 'REJECTED' ? finalReason : null,
    candidate,
    patchEvidence: patchRecord,
    handoff: lastHandoff ? summarizeForReport(lastHandoff) : null,
    routeDecisions,
    boundaryEvidencePath: boundaryEvidencePaths[0] ?? null,
    boundaryEvidencePaths: Object.freeze([...boundaryEvidencePaths]),
    brokerEvidencePath: brokerEvidencePaths[brokerEvidencePaths.length - 1] ?? null,
    brokerEvidencePaths: Object.freeze([...brokerEvidencePaths]),
    processLifetimeEvidencePaths: Object.freeze([...processLifetimeEvidencePaths]),
    validationEvidencePaths: Object.freeze([...validationEvidencePaths]),
    solTransportEvidencePaths: Object.freeze([...solTransportEvidencePaths]),
    cleanup,
    errors: controllerErrors,
    runtimeRoot,
  });
}

function snapshotPublicTerminalOptions(input, operation, allowed) {
  if (input === undefined) input = {};
  assertPlainOptions(input, `${operation} options`);
  for (const key of Object.keys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (descriptor?.get !== undefined || descriptor?.set !== undefined) throw new ConfigError(`${operation}.${key} must be a data property`);
    if (!allowed.has(key) && descriptor?.value !== undefined) {
      throw new ConfigError(`${operation} does not accept '${key}'; production terminalization always uses canonical process inspection`);
    }
  }
  return input;
}

async function requireTerminalSolTransportCleanup(runDir) {
  const sweep = await sweepRunSolTransportSurfaces(runDir);
  if (!sweep.ok) {
    throw new ControllerError(
      'SOL transport cleanup/process absence could not be positively verified; terminalization is refused',
      'SOL_TRANSPORT_CLEANUP_FAILED',
      { failures: sweep.failures },
    );
  }
  return sweep;
}

export async function recoverRun(input = {}) {
  const options = snapshotPublicTerminalOptions(input, 'recoverRun', new Set(['cwd', 'runId']));
  const cwd = options.cwd ?? process.cwd();
  const { runId } = options;
  if (typeof runId !== 'string' || runId.length === 0) throw new ConfigError('recover requires a run id');
  const store = await RunStore.open({ cwd, runId });
  // SOL-S11-006: crash recovery sweeps every controller-owned SOL
  // transport surface of the run (terminating orphaned Pi processes by
  // their invocation markers and removing marker-recognized surfaces).
  // `recover` is the explicit operator command that treats the run as
  // dead; leftovers are never silently assumed clean.
  const recoveredSolTransportSurfaces = await requireTerminalSolTransportCleanup(store.runDir);
  if (store.record.lifecycleState !== 'OPEN') {
    return Object.freeze({ runId, reconciled: [], recoveredSolTransportSurfaces, lifecycleState: store.record.lifecycleState, finalSummary: store.record.finalSummary });
  }
  const reconciled = await store.reconcileOrphans();
  const finalized = await store.finalize();
  return Object.freeze({ runId, reconciled, recoveredSolTransportSurfaces, ...finalized });
}

export async function finalizeRun(input = {}) {
  const options = snapshotPublicTerminalOptions(input, 'finalizeRun', new Set(['cwd', 'runId']));
  const cwd = options.cwd ?? process.cwd();
  const { runId } = options;
  if (typeof runId !== 'string' || runId.length === 0) throw new ConfigError('finalize requires a run id');
  const store = await RunStore.open({ cwd, runId });
  const terminalSolTransport = await requireTerminalSolTransportCleanup(store.runDir);
  return Object.freeze({
    runId,
    terminalSolTransport,
    ...(store.record.lifecycleState === 'OPEN'
      ? await store.finalize()
      : { lifecycleState: store.record.lifecycleState, finalSummary: store.record.finalSummary }),
  });
}

export async function abortRun(input = {}) {
  const options = snapshotPublicTerminalOptions(input, 'abortRun', new Set(['cwd', 'runId', 'note']));
  const cwd = options.cwd ?? process.cwd();
  const { runId } = options;
  const note = options.note ?? 'controller abort requested';
  if (typeof runId !== 'string' || runId.length === 0) throw new ConfigError('abort requires a run id');
  const store = await RunStore.open({ cwd, runId });
  const terminalSolTransport = await requireTerminalSolTransportCleanup(store.runDir);
  return Object.freeze({
    runId,
    terminalSolTransport,
    ...(store.record.lifecycleState === 'OPEN'
      ? await store.abort({ note })
      : { lifecycleState: store.record.lifecycleState }),
  });
}
