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
import { compileRepairTicket } from '../sol/ask-compiler/repair-ticket.mjs';
import { assessHandoff, recordPatchObservation, summarizeForReport } from '../handoff/assessment.mjs';
import { preserveRawResponse } from '../handoff/preserve.mjs';
import { parseProviderJson, buildWorkerPrompt, invokeBoundedProvider, usesExternalProvider, withLocalRouteEndpoints } from './provider.mjs';
import { authorizeWorkerExecutionBoundary, persistBoundaryEvidence, resetWorkerScratch, runConstrainedProcess } from './execution-boundary.mjs';
import { persistBrokerEvidence, startProviderBroker } from './provider-broker.mjs';
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
  return JSON.parse(JSON.stringify(value));
}

function now() {
  return new Date().toISOString();
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
  return `controller validation failed (${code})`;
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
  return config;
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

function routeContext({ workUnitId, runId, state, contract, budget, routingConfig, resultAccepted, latestRejection, failureHistory, repairsDispatched, solDiagnosis, solReview, solFindings, stuckEvidence, evidenceRefs }) {
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
          : `Is the prior finding resolved by the new delta evidence without reopening unrelated invariants?`,
    whyNeeded: callType === 'SOL_CONTRACT_CHECK'
      ? 'The compiled contract contains unresolved high-risk semantics and implementation authority is blocked.'
      : callType === 'SOL_DIAGNOSE'
        ? 'The controller observed a bounded rejection and needs one falsifiable diagnosis before a targeted repair.'
        : callType === 'SOL_FINAL_REVIEW'
          ? 'A high-risk candidate requires a named final-review decision before it can be reviewably advanced.'
          : 'A prior bounded finding survived one repair and only delta evidence may be considered.',
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
          : 'Return NOT_RESOLVED when the prior finding or a named neighboring invariant still fails.',
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
      invocationBroker = await startProviderBroker({ avoidPorts: usedBrokerPorts });
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
  const supervisor = createProcessSupervisor({
    invocationId: invocation.invocationId,
    workUnitId,
    invocationMarker,
    // SOL-S10-001 R4: SOL runs under the same no-descendant MODEL boundary;
    // the supervisor is DEFENSE IN DEPTH / DIAGNOSTIC ONLY.
    childCreationStructurallyDenied: true,
    ...(processSupervisorOptions ?? {}),
  });
  const external = usesExternalProvider({ projectConfig: project.config, role: 'SOL' });
  let invocationBroker = null;
  let boundary = null;
  let boundaryEvidencePath = null;
  let brokerEvidencePath = null;
  let processLifetimeEvidencePath = null;
  let providerResult = null;
  let quiescence = null;
  let completed = false;
  try {
    if (external) {
      // SOL gets a FRESH broker endpoint on a port no prior invocation's
      // boundary allows, a FRESH boundary whose ONLY network exception is
      // that endpoint, and a FRESH Pi config surface. An old invocation's
      // surviving process structurally cannot reach this endpoint.
      invocationBroker = await startProviderBroker({ avoidPorts: usedBrokerPorts });
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
      // SOL-S10-001 R4: SOL is a bounded decision engine with no process
      // tools; it runs under the same structural no-descendant boundary.
      processCreation: 'DENIED',
    });
    boundary = authorized.boundary;
    boundaryEvidencePath = authorized.boundaryEvidencePath;
    if (evidencePaths !== null) evidencePaths.boundary.push(boundaryEvidencePath);
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
  const outcome = providerResult.timedOut ? 'TIMEOUT' : providerResult.error !== null || !providerResult.processCompleted ? 'TRANSPORT_ERROR' : providerResult.status === 0 ? 'SUCCESS' : 'FAILURE';
  await invocation.complete({ outcome, errorCode: outcome === 'SUCCESS' ? undefined : 'SOL_PROVIDER_FAILED' });
  completed = true;
  const rawRef = persistProviderOutput(runStore.runDir, invocation.invocationId, providerResult.stdout);
  // Wipe the scratch surface after quiescence so the SOL invocation's
  // per-invocation Pi config/token never outlives its invocation.
  resetWorkerScratch(boundary.scratchRoot);
  const parsed = parseProviderJson(providerResult.stdout);
  let response = null;
  let conversion = null;
  let errorCode = null;
  if (providerResult.status !== 0 || !providerResult.processCompleted || parsed.error !== null) {
    errorCode = parsed.error !== null ? 'TRANSPORT_MALFORMED' : 'SOL_ASK_INVALID';
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
  const accepted = response !== null && errorCode === null;
  const refs = [...evidenceRefs, `sol-ask:${ask.askId}`];
  await invocation.assess({
    assessmentResult: accepted ? 'ACCEPTED' : 'REJECTED',
    rejectionCode: accepted ? undefined : errorCode ?? 'SOL_ASK_INVALID',
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
  return Object.freeze({
    invocationId: invocation.invocationId,
    callType,
    ask,
    response,
    conversion,
    accepted,
    errorCode,
    evidenceRefs: refs,
    boundaryEvidencePath,
    brokerEvidencePath,
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

/** Execute one reviewable V2 work unit. */
export async function runController({
  cwd = process.cwd(),
  workerCommand,
  solCommand,
  worktreeRoot = null,
  credentialProbePaths = [],
  sandboxExecutable,
  semanticValidator,
  processSupervisorOptions = null,
  project: suppliedProject = null,
} = {}) {
  const project = suppliedProject ?? loadProjectConfig({ cwd });
  const repoDir = project.repoDir;
  const targetBaseSha = resolveHeadSha(repoDir);
  const contract = compileProjectContract(project);
  const routingConfig = effectiveRoutingConfig(project.config, { workerCommand, solCommand });
  const effectiveConfigDigest = digestConfig(routingConfig);
  const runStore = await RunStore.create({ cwd: repoDir, targetBaseSha, configDigest: effectiveConfigDigest });
  const runtimeRoot = resolveRuntimeRoot(repoDir);
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
  let stuckEvidence = {};
  let priorSolChain = null;
  let repairContract = null;
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
  const invocationEvidencePaths = { boundary: [], broker: [], processLifetime: [], validation: [] };
  const boundaryEvidencePaths = invocationEvidencePaths.boundary;
  const brokerEvidencePaths = invocationEvidencePaths.broker;
  const processLifetimeEvidencePaths = invocationEvidencePaths.processLifetime;
  const validationEvidencePaths = invocationEvidencePaths.validation;
  const routeDecisions = [];
  const controllerErrors = [];
  let finalDisposition = 'REJECTED';
  let finalReason = 'UNSUPPORTED_CLAIM';
  let candidate = null;

  try {
    for (let step = 0; step < MAX_CONTROLLER_STEPS; step += 1) {
      const ctx = routeContext({
        workUnitId,
        runId: runStore.runId,
        state,
        contract,
        budget,
        routingConfig,
        resultAccepted,
        latestRejection,
        failureHistory,
        repairsDispatched,
        solDiagnosis,
        solReview,
        solFindings,
        stuckEvidence,
        evidenceRefs: allEvidenceRefs,
      });
      const route = decideRoute(ctx);
      routeDecisions.push(route);
      persistRouteDecision(runStore.runDir, route);
      appendControllerEvent(runStore.runDir, { kind: 'ROUTE_DECISION', workUnitId, decisionId: route.decisionId, decision: route.decision, nextState: route.nextState, reasonCode: route.reasonCode });

      if (route.decision === 'ROUTE_COMPLETE') {
        finalDisposition = contract.riskClass === 'LOW_RISK' ? 'SEMANTICALLY_ACCEPTED' : 'REVIEW_APPROVED';
        finalReason = null;
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
          if (route.targetRole === 'REPAIR') repairsDispatched += 1;
          finalReason = rejectionCode;
        }
        continue;
      }

      const callType = routeCallType(route.decision);
      const prior = callType === 'SOL_RECHECK' ? priorSolChain : null;
      const finding = callType === 'SOL_RECHECK' ? solFindings.find((item) => item.status === 'OPEN') ?? null : null;
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
          evidencePaths: invocationEvidencePaths,
        });
      } catch (error) {
        controllerErrors.push({ code: publicErrorCode(error, 'SOL_ASK_INVALID'), message: staticReason(error, 'SOL_ASK_INVALID') });
        finalDisposition = 'REJECTED';
        finalReason = publicErrorCode(error, 'SOL_ASK_INVALID');
        break;
      }
      allEvidenceRefs = [...new Set([...allEvidenceRefs, ...solResult.evidenceRefs])];
      if (!solResult.accepted || solResult.response === null) {
        finalDisposition = 'REJECTED';
        finalReason = solResult.errorCode ?? 'SOL_ASK_INVALID';
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
      if (callType === 'SOL_FINAL_REVIEW' || callType === 'SOL_RECHECK') {
        const passed = response.verdict === (callType === 'SOL_FINAL_REVIEW' ? 'PASS' : 'RESOLVED');
        const responseFindings = response.findings ?? [];
        const findingIds = [];
        for (const item of responseFindings) {
          const findingRecord = persistFinding(runStore.runDir, {
            findingId: item.findingId,
            severity: item.severity ?? 'CRITICAL',
            invariantRef: item.invariantRef,
            summary: item.summary,
            evidenceRefs: item.evidenceRefs ?? [],
          });
          findingIds.push(findingRecord.findingId);
          const existing = solFindings.find((entry) => entry.findingId === findingRecord.findingId);
          if (existing) {
            existing.rechecks = (existing.rechecks ?? 0) + 1;
            existing.status = passed ? 'CLOSED' : 'OPEN';
          } else {
            solFindings.push({ findingId: findingRecord.findingId, status: passed ? 'CLOSED' : 'OPEN', repairCycles: callType === 'SOL_FINAL_REVIEW' ? 0 : 1, rechecks: callType === 'SOL_RECHECK' ? 1 : 0, origin: callType === 'SOL_FINAL_REVIEW' ? 'FINAL_REVIEW' : 'DIAGNOSE' });
          }
        }
        solReview = { verdict: passed ? 'PASSED' : 'FINDING', findingIds };
        resultAccepted = passed;
        state = route.nextState;
        if (!passed && callType === 'SOL_FINAL_REVIEW') {
          // The routing policy turns this named finding into exactly one
          // bounded repair, never an open-ended implementation retry.
          failureHistory = [...failureHistory, { rejectedAcceptanceRefs: [sideEffectSpecs(contract)[0]?.sideEffectId], credibleHypothesis: true }];
        }
        continue;
      }
    }

    if (finalDisposition === 'REJECTED' && finalReason === null) finalReason = 'UNSUPPORTED_CLAIM';
    const boundaryRefs = boundaryEvidencePaths.map((file) => `boundary:${path.basename(file)}`);
    const processLifetimeRefs = processLifetimeEvidencePaths.map((file) => `process-lifetime:${path.basename(file)}`);
    const validationRefs = validationEvidencePaths.map((file) => `validation-evidence:${path.basename(file)}`);
    const dispositionRefs = [...new Set([...allEvidenceRefs, ...boundaryRefs, ...processLifetimeRefs, ...validationRefs])];
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
    controllerErrors.push({ code: publicErrorCode(error), message: staticReason(error, 'CONTROLLER_FAILED') });
    finalDisposition = 'REJECTED';
    finalReason = canonicalRejectionCode(publicErrorCode(error, 'UNSUPPORTED_CLAIM'));
    try {
      persistDisposition(runStore.runDir, { workUnitId, disposition: 'REJECTED', reasonCode: finalReason, decidedAt: now(), evidenceRefs: allEvidenceRefs });
    } catch {
      // The finalizer below still preserves the invocation ledger.
    }
  } finally {
    try {
      await runStore.reconcileOrphans();
    } catch (error) {
      controllerErrors.push({ code: 'INCOMPLETE_LEDGER', message: 'controller could not reconcile an open invocation lifecycle' });
    }
  }

  let lifecycleState = null;
  let finalSummary = null;
  try {
    const finalized = await runStore.finalize();
    lifecycleState = finalized.lifecycleState;
    finalSummary = finalized.finalSummary;
  } catch (error) {
    controllerErrors.push({ code: 'INCOMPLETE_LEDGER', message: 'run finalization failed; use lcim recover with the run id' });
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
    cleanup,
    errors: controllerErrors,
    runtimeRoot,
  });
}

export async function recoverRun({ cwd = process.cwd(), runId } = {}) {
  if (typeof runId !== 'string' || runId.length === 0) throw new ConfigError('recover requires a run id');
  const store = await RunStore.open({ cwd, runId });
  if (store.record.lifecycleState !== 'OPEN') {
    return Object.freeze({ runId, reconciled: [], lifecycleState: store.record.lifecycleState, finalSummary: store.record.finalSummary });
  }
  const reconciled = await store.reconcileOrphans();
  const finalized = await store.finalize();
  return Object.freeze({ runId, reconciled, ...finalized });
}

export async function finalizeRun({ cwd = process.cwd(), runId } = {}) {
  if (typeof runId !== 'string' || runId.length === 0) throw new ConfigError('finalize requires a run id');
  const store = await RunStore.open({ cwd, runId });
  return Object.freeze({ runId, ...(store.record.lifecycleState === 'OPEN' ? await store.finalize() : { lifecycleState: store.record.lifecycleState, finalSummary: store.record.finalSummary }) });
}

export async function abortRun({ cwd = process.cwd(), runId, note = 'controller abort requested' } = {}) {
  if (typeof runId !== 'string' || runId.length === 0) throw new ConfigError('abort requires a run id');
  const store = await RunStore.open({ cwd, runId });
  return Object.freeze({ runId, ...(store.record.lifecycleState === 'OPEN' ? await store.abort({ note }) : { lifecycleState: store.record.lifecycleState }) });
}
