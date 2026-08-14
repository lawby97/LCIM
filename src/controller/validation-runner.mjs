/**
 * Sprint-10 SOL-S10-001 R4 — controller-owned VALIDATION boundary.
 *
 * ARCHITECTURAL SPLIT: MODEL IMPLEMENTATION is separated from CONTROLLER
 * VALIDATION. The model invocation runs under a no-descendant boundary and
 * edits only the disposable worker worktree; the controller extracts and
 * freezes an immutable patch artifact. Validation NEVER operates on the
 * authoritative mutable worker worktree. Instead it runs on a separate
 * disposable validation copy constructed from exactly:
 *
 *     expected base SHA + the exact controller-owned patch artifact bytes
 *
 * The validation copy is created with `git worktree add --detach` at the
 * base and the frozen artifact is applied with `git apply` (controller-side;
 * the controller is not model-controlled). The copy therefore contains
 * exactly base + patch, with no project-config mutation and no worker
 * process ever inside it.
 *
 * VALIDATION boundary properties (distinct from the MODEL boundary):
 *
 *   - separate disposable validation worktree/copy;
 *   - no provider broker (network mode DENY_ALL; nothing to reach);
 *   - no provider credentials: environment stripping is inherited from the
 *     execution boundary's safeEnvironment, the Pi credential surface
 *     (~/.pi/agent and any custom PI_CODING_AGENT_DIR) is structurally
 *     denied for file reads by the profile, and caller-supplied
 *     credentialProbePaths are denied for validation reads too;
 *   - network DENY_ALL — no validation egress unless a separately reviewed
 *     validation requirement exists;
 *   - parent/main/sibling/Git-common writes denied (inherited deniedWrite
 *     roots: repoDir, runDir, credential paths, .git);
 *   - the candidate patch artifact is controller-owned and read-only to
 *     validation: it lives in the Git-common evidence store, which is a
 *     denied write root, and the copy is created from its bytes — validation
 *     cannot modify the authoritative artifact;
 *   - process-fork is ALLOWED here: controller-owned validation tests may
 *     legitimately spawn subprocesses. This is NOT a weakening of the MODEL
 *     boundary — the model boundary stays structurally no-descendant.
 *
 * VALIDATION CREDENTIAL INVARIANT (SOL-S10-001 R4 recheck): because
 * validation may create processes, EVERY validation process and EVERY
 * validation descendant must be structurally unable to read provider
 * credential material — no broker, no broker token, no provider credential
 * environment variables, no usable Pi auth config, DENY_ALL network, and
 * structural file-read denial of the credential locations (environment
 * stripping alone is never enough: candidate code can open files directly).
 * Validation must not start until its boundary has objectively verified the
 * credential paths are unreadable; any readable credential path fails
 * closed BEFORE candidate-controlled validation runs.
 *
 * A validation process may create detached descendants; they inherit this
 * same sandbox profile (the sandbox is inherited across fork/exec), so they
 * remain confined to the validation-only disposable surface with DENY_ALL
 * network and no broker/credentials. Candidate correctness/security never
 * relies on identifying or terminating them: the authoritative candidate
 * patch was already frozen before validation started. A lingering
 * validation descendant is incapable of changing patchHash, patch artifact
 * bytes, the parent repo, worker candidate state, later provider channels,
 * or Git-common evidence.
 *
 * Validation output is EVIDENCE ONLY: results can approve/reject the
 * immutable patch artifact (by identity: patchId/patchHash) but cannot
 * alter it.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigError } from '../shared/errors.mjs';
import { generateId } from '../shared/ids.mjs';
import { runGit } from '../git/exec.mjs';
import { authorizeWorkerExecutionBoundary, persistBoundaryEvidence, runConstrainedProcess } from './execution-boundary.mjs';
import { canonicalJson } from '../logging/digest.mjs';

export const VALIDATION_EVIDENCE_SCHEMA = 'lcim.validation-run';
export const VALIDATION_EVIDENCE_VERSION = '1.0.0';

const VALIDATION_TIMEOUT_MS = 120_000;

function validateInputs({ repoDir, runDir, workUnitId, invocationId, expectedBaseSha, patchText, patchRecord }) {
  if (typeof repoDir !== 'string' || typeof runDir !== 'string') throw new ConfigError('validation copy requires repoDir and runDir');
  if (typeof workUnitId !== 'string' || typeof invocationId !== 'string') throw new ConfigError('validation copy requires work unit and invocation identity');
  if (typeof expectedBaseSha !== 'string' || expectedBaseSha.length !== 40) throw new ConfigError('validation copy requires the expected base SHA');
  if ((typeof patchText !== 'string' && !Buffer.isBuffer(patchText)) || patchText.length === 0) {
    throw new ConfigError('validation copy requires the persisted patch artifact bytes');
  }
  if (patchRecord === null || typeof patchRecord !== 'object' || typeof patchRecord.patchId !== 'string' || typeof patchRecord.patchHash !== 'string') {
    throw new ConfigError('validation copy requires the controller-owned patch record identity');
  }
}

/**
 * Resolve one validation command argv item against the validation copy
 * first (the isolated surface), then against the target repository for
 * project-owned scripts. Reading the target repo is permitted (validation
 * is read-capable but write-confined to the copy by the sandbox).
 */
function resolveValidationArg(item, copyDir, repoDir) {
  if (typeof item !== 'string' || item.length === 0) return item;
  if (path.isAbsolute(item)) return item;
  // Path-shaped relative items resolve against the validation copy first
  // (the isolated surface), then against the target repository for
  // project-owned scripts. Reading the target repo is permitted (validation
  // is read-capable but write-confined to the copy by the sandbox).
  const inCopy = path.resolve(copyDir, item);
  if (fs.existsSync(inCopy)) return inCopy;
  const inRepo = path.resolve(repoDir, item);
  if (fs.existsSync(inRepo)) return inRepo;
  // Bare command names (no path separators, not ./ prefixed) that exist
  // nowhere resolve through PATH inside the validation boundary (e.g.
  // `node`, `git`).
  if (!item.includes('/') && !item.startsWith('.')) return item;
  return inCopy;
}

/**
 * Run the controller-owned validation commands against a separate disposable
 * copy of base + frozen patch artifact. Returns results and persisted
 * evidence; never touches the authoritative worker worktree or the frozen
 * artifact.
 *
 * @returns {object} { results, evidence, evidencePath, boundaryEvidencePath,
 *   applied, copyRemoved, copyDir }
 */
export async function runValidationsOnCopy({
  projectConfig,
  repoDir,
  runDir,
  workUnitId,
  invocationId,
  expectedBaseSha,
  patchText,
  patchRecord,
  credentialProbePaths = [],
  credentialHome = null,
  sandboxExecutable,
} = {}) {
  const commands = projectConfig?.validation?.commands ?? [];
  if (!Array.isArray(commands) || commands.length === 0) {
    return Object.freeze({
      results: [],
      evidence: null,
      evidencePath: null,
      boundaryEvidencePath: null,
      applied: false,
      copyRemoved: false,
      copyDir: null,
    });
  }
  validateInputs({ repoDir, runDir, workUnitId, invocationId, expectedBaseSha, patchText, patchRecord });

  // A distinct controller-owned identity for the validation copy (work-unit
  // id shape satisfies the git-worktree identity machinery).
  const validationId = generateId('work-unit');
  const copyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-v2-validation-root-'));
  const copyDir = path.join(copyRoot, `validation-${validationId.replace(/^lcim_wu_/, '')}`);
  let boundary = null;
  let boundaryEvidencePath = null;
  let boundaryEvidence = null;
  let applied = false;
  let copyRemoved = false;
  let failure = null;
  const results = [];

  try {
    // 1. Disposable validation copy at exactly the expected base.
    const add = runGit(repoDir, ['worktree', 'add', '--detach', copyDir, expectedBaseSha], { allowNonZero: true });
    if (add.status !== 0) {
      throw new ConfigError(`validation copy could not be created at base ${expectedBaseSha}: ${(add.stderr ?? '').trim() || 'git worktree add failed'}`);
    }
    // 2. Apply the EXACT controller-owned artifact bytes.
    const patchFile = path.join(copyRoot, `${validationId}.patch`);
    fs.writeFileSync(patchFile, patchText, { encoding: 'utf8', mode: 0o600 });
    const apply = runGit(copyDir, ['apply', '--binary', '--whitespace=nowarn', patchFile], { allowNonZero: true });
    if (apply.status !== 0) {
      failure = `frozen patch artifact did not apply to the base copy: ${(apply.stderr ?? '').trim() || 'git apply failed'}`;
      results.push({ kind: 'test', outcome: 'FAIL', summary: failure, evidenceRef: 'validation:apply' });
    } else {
      applied = true;
    }

    // 3. Distinct VALIDATION boundary: process-fork ALLOWED (tests may
    //    spawn), NO broker, DENY_ALL network, no credentials, write confined
    //    to the validation copy. All SOL-S10-002 authorization machinery
    //    (module-private capability, profile digest binding, canonical
    //    executable, path binding) applies unchanged. Caller-supplied
    //    credentialProbePaths are NOT dropped when switching from the MODEL
    //    boundary to the VALIDATION boundary: they are denied for validation
    //    reads and objectively probed before candidate-controlled code runs.
    const authorized = await authorizeWorkerExecutionBoundary({
      repoDir,
      worktreeDir: copyDir,
      runDir,
      workUnitId: validationId,
      invocationId,
      processCreation: 'ALLOWED',
      broker: null,
      credentialProbePaths,
      ...(credentialHome === null || credentialHome === undefined ? {} : { credentialHome }),
      ...(sandboxExecutable === undefined ? {} : { sandboxExecutable }),
    });
    boundary = authorized.boundary;
    boundaryEvidence = authorized.evidence;
    boundaryEvidencePath = persistBoundaryEvidence(runDir, `${validationId}-${invocationId}`, authorized.evidence);

    // 4. Run the configured validation commands in the copy.
    if (applied) {
      for (const [index, command] of commands.entries()) {
        if (!Array.isArray(command) || command.length === 0) {
          results.push({ kind: 'test', outcome: 'FAIL', summary: `validation.commands[${index}] is not a non-empty argv array`, evidenceRef: `validation:test-${index + 1}` });
          continue;
        }
        const argv = command.map((item) => resolveValidationArg(item, copyDir, repoDir));
        let result;
        try {
          result = await runConstrainedProcess(boundary, {
            command: [argv[0]],
            args: argv.slice(1),
            input: '',
            timeoutMs: VALIDATION_TIMEOUT_MS,
          });
        } catch (error) {
          result = { processCompleted: false, status: null, error: error?.message ?? 'validation command execution failed' };
        }
        const passed = result.processCompleted === true && result.status === 0;
        results.push({
          kind: 'test',
          outcome: passed ? 'PASS' : 'FAIL',
          summary: passed
            ? `controller validation command ${index + 1} passed on the base+patch copy`
            : `controller validation command ${index + 1} failed or did not complete on the base+patch copy`,
          evidenceRef: `validation:test-${index + 1}`,
          // Bounded public-safe output tails: validation output is evidence
          // only; it is never allowed to modify the frozen artifact.
          stdoutTail: String(result.stdout ?? '').slice(0, 2048),
          stderrTail: String(result.stderr ?? '').slice(0, 2048),
        });
      }
    }
  } catch (error) {
    failure = error?.message ?? 'validation copy construction or execution failed';
    results.push({ kind: 'test', outcome: 'FAIL', summary: failure, evidenceRef: 'validation:execution' });
  } finally {
    // The validation copy is disposable and controller-owned. Detached
    // validation descendants may still hold the (deleted) directory; they
    // inherit the same sandbox and cannot touch any authoritative surface.
    try {
      runGit(repoDir, ['worktree', 'remove', '--force', copyDir], { allowNonZero: true });
      copyRemoved = !fs.existsSync(copyDir);
    } catch {
      copyRemoved = false;
    }
    try {
      if (fs.existsSync(copyRoot)) fs.rmSync(copyRoot, { recursive: true, force: true });
    } catch {
      // Retention of the disposable root is safe (controller-owned temp).
    }
  }

  const evidence = Object.freeze({
    schemaName: VALIDATION_EVIDENCE_SCHEMA,
    schemaVersion: VALIDATION_EVIDENCE_VERSION,
    validationId,
    workUnitId,
    invocationId,
    // The disposition refers back to the IMMUTABLE patch identity.
    patchId: patchRecord.patchId,
    patchHash: patchRecord.patchHash,
    changedPaths: Object.freeze([...(patchRecord.changedPaths ?? [])]),
    applied,
    failure,
    network: Object.freeze({ mode: 'DENY_ALL', broker: null, providerCredentials: 'none' }),
    credentialIsolation: 'environment-stripped-and-filesystem-denied',
    processCreation: 'ALLOWED',
    results: Object.freeze([...results]),
    copyRemoved,
    boundaryEvidenceRef: boundaryEvidencePath === null ? null : `boundary:${path.basename(boundaryEvidencePath)}`,
    createdAt: new Date().toISOString(),
  });

  let evidencePath = null;
  if (results.length > 0) {
    const dir = path.join(runDir, 'controller', 'validation');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const safe = String(invocationId).replace(/[^A-Za-z0-9_-]/g, '_');
    evidencePath = path.join(dir, `${safe}.json`);
    fs.writeFileSync(evidencePath, `${canonicalJson(evidence)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  }

  return Object.freeze({
    results: Object.freeze([...results]),
    evidence,
    evidencePath,
    boundaryEvidencePath,
    boundaryEvidence,
    applied,
    copyRemoved,
    copyDir,
    patchHash: patchRecord.patchHash,
    patchId: patchRecord.patchId,
  });
}

/** Persist validation evidence explicitly (used when evidence was not yet written). */
export function persistValidationEvidence(runDir, invocationId, evidence) {
  if (typeof runDir !== 'string' || typeof invocationId !== 'string' || evidence === null || typeof evidence !== 'object') {
    throw new ConfigError('persistValidationEvidence requires a run directory, invocation id, and evidence object');
  }
  const dir = path.join(runDir, 'controller', 'validation');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const safe = String(invocationId).replace(/[^A-Za-z0-9_-]/g, '_');
  const file = path.join(dir, `${safe}.json`);
  fs.writeFileSync(file, `${canonicalJson(evidence)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return file;
}
