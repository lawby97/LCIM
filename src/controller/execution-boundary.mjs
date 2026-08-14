/**
 * Controller-owned worker execution boundary.
 *
 * On macOS this uses Seatbelt (sandbox-exec) with a deny-by-default
 * profile. The child may read the host filesystem needed to inspect a target
 * repository, but the only writable subtree is the controller-created
 * disposable worker worktree. Network access is denied by default; when the
 * controller binds a provider transport broker (see
 * src/controller/provider-broker.mjs), the profile allows outbound TCP to
 * exactly the broker's loopback port and nothing else.
 *
 * PROCESS CREATION (SOL-S10-001 R4): the MODEL invocation boundary
 * structurally denies child creation with `(deny process-fork)` in the
 * bound profile. On this host that policy operation covers fork(2) AND
 * posix_spawn(2) (empirically verified: node spawn/spawnSync/fork,
 * detached/new-session spawns, shell background jobs, and raw
 * os.posix_spawn are all refused with EPERM at creation, before any
 * descendant becomes executable). `process-exec*` stays allowed only so
 * the controller-selected initial executable can start; without fork no
 * model-controlled descendant can ever exist, so exec-in-place cannot
 * create a survivor and cannot escape the same sandbox. The R3 process
 * supervisor therefore remains DEFENSE IN DEPTH / DIAGNOSTIC ONLY for
 * model invocations: the primary proof is CHILD_CREATION_STRUCTURALLY_DENIED
 * plus direct process exit. Verification empirically probes child-creation
 * denial inside the boundary before authorization; if the probe ever fails
 * the boundary is refused. The VALIDATION boundary (validation-runner.mjs)
 * explicitly uses processCreation 'ALLOWED' because controller-owned
 * validation tests may legitimately spawn subprocesses — it has no broker,
 * no credentials, and DENY_ALL network, and runs on a separate disposable
 * copy of base + frozen patch artifact.
 *
 * AUTHORIZATION (SOL-S10-002): spawn authority is a module-private,
 * unforgeable capability. Only `authorizeWorkerExecutionBoundary` — the
 * single successful internal verification path — registers a boundary
 * instance in a module-private WeakMap along with an immutable capability
 * record that binds the exact security-critical state (canonical sandbox
 * executable, profile bytes digest, profile path, worktree/scratch roots,
 * denied write/credential roots, broker allowance, network policy, run and
 * work-unit identity). Caller-constructed, cloned, spread, or mutated
 * objects are never authorized, and public booleans (`verified`,
 * `verification`, `structural`) grant nothing. Before every spawn the
 * capability is revalidated: the profile is re-read and digested, the
 * profile path is re-resolved, the canonical executable is re-checked, and
 * the worktree is re-verified. Any change refuses child creation.
 *
 * Production execution is pinned to the canonical `/usr/bin/sandbox-exec`;
 * a caller-provided executable path is never trusted as authority.
 *
 * This is prevention. Sprint-03's worktree/base/safety pipeline still runs
 * after exit and remains the independent detection layer.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { isPathWithin } from '../config/runtime-path.mjs';
import { LcimError, ConfigError } from '../shared/errors.mjs';
import { canonicalJson } from '../logging/digest.mjs';
import { writeJsonAtomic } from '../logging/io.mjs';

export const EXECUTION_BOUNDARY_SCHEMA_NAME = 'lcim.worker-execution-boundary';
export const EXECUTION_BOUNDARY_SCHEMA_VERSION = '1.1.0';
export const SEATBELT_EXECUTABLE = '/usr/bin/sandbox-exec';

/** Process-creation policy for a boundary. */
export const PROCESS_CREATION_MODES = Object.freeze(['DENIED', 'ALLOWED']);
const DEFAULT_PROCESS_CREATION = 'DENIED';

/**
 * Empirical child-creation probe run INSIDE a DENIED boundary during
 * verification. Exit contract (deterministic classification):
 *
 *   0 = child creation refused with EXACTLY EPERM (kernel-level structural
 *       denial) — the ONLY outcome that may authorize a model boundary
 *   1 = a child was actually created ('spawn' or 'exit' observed)
 *   2 = child creation failed for ANY non-EPERM reason (EAGAIN, EMFILE,
 *       ENOENT, ENOMEM, EACCES, ...) — NOT_PROVEN, never structural proof
 *   3 = timeout / ambiguous (no definitive child outcome)
 *
 * Both Node failure modes are classified: a synchronous spawn() throw and
 * the asynchronous ChildProcess 'error' event. Structural denial is never
 * inferred merely because no useful child result appeared.
 *
 * Regression seam: LCIM_PROBE_SIMULATE_ASYNC_ERROR (set in the boundary
 * environment before construction) replaces the real spawn with an
 * asynchronous failure carrying exactly that non-EPERM code, so the
 * async-error classification is deterministic. 'EPERM' can never be
 * simulated — the exact-EPERM branch is reachable only through the real
 * in-sandbox Seatbelt denial, so the seam cannot fabricate proof.
 */
export const CHILD_CREATION_PROBE_SCRIPT = [
  "'use strict';",
  "const { spawn } = require('node:child_process');",
  "const { EventEmitter } = require('node:events');",
  'const simulatedError = process.env.LCIM_PROBE_SIMULATE_ASYNC_ERROR || null;',
  'let child;',
  'try {',
  '  if (simulatedError !== null) {',
  "    if (simulatedError === 'EPERM') process.exit(2);",
  '    child = new EventEmitter();',
  '    setTimeout(() => {',
  "      const error = new Error('simulated spawn failure');",
  '      error.code = simulatedError;',
  "      child.emit('error', error);",
  '    }, 5);',
  '  } else {',
  "    child = spawn('/usr/bin/true');",
  '  }',
  '} catch (error) {',
  "  process.exit(error && error.code === 'EPERM' ? 0 : 2);",
  '}',
  'let outcome = null;',
  'const settle = (code) => { if (outcome === null) { outcome = code; process.exit(code); } };',
  "child.on('spawn', () => settle(1));",
  "child.on('error', (error) => settle(error && error.code === 'EPERM' ? 0 : 2));",
  "child.on('exit', () => settle(1));",
  'setTimeout(() => settle(3), 3000);',
].join('\n');

/** Deterministic probe-outcome classification (pure; grants no authority by itself). */
export const CHILD_CREATION_PROBE_OUTCOMES = Object.freeze({
  DENIED_EPERM: 'CHILD_CREATION_DENIED_EPERM',
  SUCCEEDED: 'CHILD_CREATION_SUCCEEDED',
  FAILED_OTHER: 'CHILD_CREATION_FAILED_OTHER',
  AMBIGUOUS: 'CHILD_CREATION_AMBIGUOUS',
});

/**
 * Classify the probe result. Only CHILD_CREATION_DENIED_EPERM may authorize
 * a MODEL boundary; the production authorization path derives this from the
 * REAL in-sandbox probe (this helper is not an authority).
 */
export function classifyChildCreationProbeOutcome({ status, error } = {}) {
  if (error !== null && error !== undefined) return CHILD_CREATION_PROBE_OUTCOMES.AMBIGUOUS;
  if (status === 0) return CHILD_CREATION_PROBE_OUTCOMES.DENIED_EPERM;
  if (status === 1) return CHILD_CREATION_PROBE_OUTCOMES.SUCCEEDED;
  if (status === 2) return CHILD_CREATION_PROBE_OUTCOMES.FAILED_OTHER;
  return CHILD_CREATION_PROBE_OUTCOMES.AMBIGUOUS;
}

/**
 * Credential-surface read probe run INSIDE the boundary during
 * verification. Works for files AND directories and needs no fork, so it is
 * meaningful under both the DENIED (model) and ALLOWED (validation)
 * profiles. Exit contract (deterministic classification):
 *
 *   0 = the credential target was refused with EXACTLY EPERM/EACCES (at
 *       stat/access AND at the actual read/readdir attempt) — the ONLY
 *       outcome that may prove credential isolation
 *   2 = unexpected filesystem/probe condition: ENOENT, EIO, EMFILE, a
 *       malformed target, an unexpected JS error, or a non-EPERM/EACCES
 *       stat/read failure — NOT_PROVEN, never structural proof
 *   3 = the credential material was READABLE — verification failure
 *
 * A signal termination, a controller probe timeout, or an outer
 * spawn/sandbox failure (probeSync error) is classified NOT_PROVEN by the
 * controller and fails closed. ENOENT/EIO/EMFILE/JS errors are never
 * treated as proof of denial: inability to prove the intended denial fails
 * closed (the controller only skips targets whose required state is absent
 * by its own filesystem fact). The probe never reads the content out of
 * the sandbox: a denied read yields only the kernel error code.
 *
 * Regression seam: LCIM_PROBE_SIMULATE_CRED_READ (set in the boundary
 * environment before construction) deterministically produces FAILURE
 * states only — READABLE (3), UNEXPECTED (2), UNKNOWN (7), SIGNAL,
 * TIMEOUT, or OUTER_ERROR. An optional `=targetPath` suffix scopes the
 * simulation to exactly that probe target (for mixed multi-target
 * regressions). There is NO simulated 'BLOCKED'/'DENIED' value: the exact
 * status-0 branch is reachable only through the real in-sandbox Seatbelt
 * EPERM/EACCES denial, so the seam can never fabricate credential-
 * isolation proof.
 */
export const CREDENTIAL_READ_PROBE_SCRIPT = [
  "'use strict';",
  "const fs = require('node:fs');",
  'const target = process.argv[1];',
  'const simulatedRaw = process.env.LCIM_PROBE_SIMULATE_CRED_READ || null;',
  'let simulated = null;',
  'if (simulatedRaw !== null) {',
  "  const eq = simulatedRaw.indexOf('=');",
  '  const kind = eq === -1 ? simulatedRaw : simulatedRaw.slice(0, eq);',
  '  const onlyFor = eq === -1 ? null : simulatedRaw.slice(eq + 1);',
  '  if (onlyFor === null || onlyFor === target) simulated = kind;',
  '}',
  "if (simulated === 'READABLE') process.exit(3);",
  "if (simulated === 'UNEXPECTED') process.exit(2);",
  "if (simulated === 'UNKNOWN') process.exit(7);",
  "if (simulated === 'SIGNAL') process.kill(process.pid, 'SIGTERM');",
  "if (simulated === 'OUTER_ERROR') { try { fs.writeSync(2, Buffer.alloc(3 * 1024 * 1024, 0x78)); } catch { process.exit(2); } }",
  "if (simulated !== 'TIMEOUT') {",
  '  let st;',
  '  try { st = fs.statSync(target); } catch (error) {',
  "    process.exit(error && (error.code === 'EPERM' || error.code === 'EACCES') ? 0 : 2);",
  '  }',
  '  try {',
  '    if (st.isDirectory()) fs.readdirSync(target);',
  '    else fs.readFileSync(target);',
  '    process.exit(3);',
  '  } catch (error) {',
  "    process.exit(error && (error.code === 'EPERM' || error.code === 'EACCES') ? 0 : 2);",
  '  }',
  '}',
  '// TIMEOUT simulation (or an impossible fall-through): never exit; the',
  '// controller probe timeout then fails closed.',
  'setInterval(() => {}, 1000);',
].join('\n');

/** Deterministic credential-probe outcome classification (pure; grants no authority by itself). */
export const CREDENTIAL_READ_PROBE_OUTCOMES = Object.freeze({
  BLOCKED_PROVEN: 'ACCESS_DENIAL_PROVEN',
  READABLE: 'CREDENTIAL_READABLE',
  NOT_PROVEN: 'PROBE_ERROR_OR_UNEXPECTED',
});

/**
 * Classify the credential probe result. ONLY ACCESS_DENIAL_PROVEN — exact
 * probe status 0 with no outer spawn error and no signal termination (a
 * spawnSync timeout is surfaced as an ETIMEDOUT error plus the kill
 * signal, so it can never reach this branch) — may authorize a boundary.
 * The production authorization path derives this from the REAL in-sandbox
 * probe (this helper is not an authority). Status 3 (READABLE), status 2
 * or any other unexpected status, signal termination, timeout, and outer
 * spawn/sandbox errors all fail closed.
 */
export function classifyCredentialReadProbe({ status, signal, error } = {}) {
  if (error !== null && error !== undefined) return CREDENTIAL_READ_PROBE_OUTCOMES.NOT_PROVEN;
  if (signal !== null && signal !== undefined) return CREDENTIAL_READ_PROBE_OUTCOMES.NOT_PROVEN;
  if (status === 0) return CREDENTIAL_READ_PROBE_OUTCOMES.BLOCKED_PROVEN;
  if (status === 3) return CREDENTIAL_READ_PROBE_OUTCOMES.READABLE;
  return CREDENTIAL_READ_PROBE_OUTCOMES.NOT_PROVEN;
}
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const PROBE_TIMEOUT_MS = 5_000;

/** Module-private spawn authority: boundary instance -> immutable capability record. */
const authorizedCapabilities = new WeakMap();

export class ExecutionBoundaryError extends LcimError {
  constructor(message, details = null) {
    super(message, 'EXECUTION_BOUNDARY_FAILED', details);
  }
}

function absoluteExisting(value, label) {
  if (typeof value !== 'string' || value.length === 0 || !path.isAbsolute(value)) {
    throw new ConfigError(`${label} must be an absolute path`);
  }
  try {
    return fs.realpathSync(value);
  } catch (err) {
    throw new ExecutionBoundaryError(`${label} does not resolve to an existing path`, { label, cause: err.message });
  }
}

/** Production pinning: only the canonical Seatbelt executable may be used. */
function canonicalSandboxExecutable(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0 || !path.isAbsolute(candidate)) {
    throw new ConfigError('sandboxExecutable must be an absolute path');
  }
  let canonical;
  try {
    canonical = fs.realpathSync(SEATBELT_EXECUTABLE);
  } catch (err) {
    throw new ExecutionBoundaryError(`required structural sandbox executable is unavailable: ${SEATBELT_EXECUTABLE}`, { executable: SEATBELT_EXECUTABLE, cause: err.message });
  }
  let resolved;
  try {
    resolved = fs.realpathSync(candidate);
  } catch (err) {
    throw new ExecutionBoundaryError(`required structural sandbox executable is unavailable: ${candidate}`, { executable: candidate, cause: err.message });
  }
  if (resolved !== canonical) {
    throw new ExecutionBoundaryError(
      `production execution is pinned to the canonical sandbox executable ${SEATBELT_EXECUTABLE}; refusing non-canonical executable ${candidate}`,
      { executable: candidate, canonical },
    );
  }
  try {
    fs.accessSync(canonical, fs.constants.X_OK);
  } catch (err) {
    throw new ExecutionBoundaryError(`required structural sandbox executable is not executable: ${canonical}`, { executable: canonical, cause: err.message });
  }
  return canonical;
}

function quoteShell(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function uniquePaths(values) {
  return [...new Set(values
    .filter((value) => typeof value === 'string' && value.length > 0)
    .map((value) => {
      try { return fs.realpathSync(value); } catch { return path.resolve(value); }
    }))];
}

function profilePathFor(runDir, workUnitId, invocationId = null) {
  const safe = String(workUnitId).replace(/[^A-Za-z0-9_-]/g, '_');
  const invocation = invocationId === null || invocationId === undefined
    ? ''
    : `-${String(invocationId).replace(/[^A-Za-z0-9_-]/g, '_')}`;
  return path.join(runDir, 'boundary', `${safe}${invocation}.sb`);
}

function credentialPaths(home, extra = []) {
  return uniquePaths([
    path.join(home, '.gitconfig'),
    path.join(home, '.git-credentials'),
    path.join(home, '.netrc'),
    path.join(home, '.ssh'),
    path.join(home, '.aws'),
    path.join(home, '.azure'),
    path.join(home, '.docker'),
    path.join(home, '.npmrc'),
    path.join(home, '.pypirc'),
    path.join(home, '.config', 'gh'),
    path.join(home, '.config', 'git'),
    path.join(home, '.config', 'gcloud'),
    // Pi provider credential/config surface (auth.json, models-store.json,
    // sessions, settings): the default agent directory. Validation must be
    // structurally unable to read provider credentials even though it may
    // create processes; a custom PI_CODING_AGENT_DIR override is appended
    // by the boundary constructor. Validation never needs Pi provider auth.
    path.join(home, '.pi', 'agent'),
    // The REAL default Pi agent directory is denied unconditionally, so no
    // credentialHome re-targeting (verification seam) can ever make the
    // installed provider auth surface readable.
    path.join(os.homedir(), '.pi', 'agent'),
    ...extra,
  ]);
}

function makeProfile({ allowedRoot, deniedWriteRoots, deniedReadRoots, brokerPort, processCreation }) {
  const lines = [
    '(version 1)',
    '(deny default)',
    // SOL-S10-001 R4: for MODEL invocations this profile structurally
    // denies child creation. Verified on this host: (deny process-fork)
    // refuses fork(2) AND posix_spawn(2) (node spawn/spawnSync/fork,
    // detached/new-session spawns, shell background, raw posix_spawn) with
    // EPERM at creation. process-exec* below stays allowed for the initial
    // exec only; without fork no descendant can exist. Validation
    // boundaries explicitly request 'ALLOWED' (controller-owned tests).
    processCreation === 'DENIED' ? '(deny process-fork)' : '(allow process-fork)',
    '(allow process-exec*)',
    '(allow process-info*)',
    '(allow signal (target self))',
    // Node and the pi agent read kernel/host information at startup.
    '(allow sysctl-read)',
    '(allow file-read*)',
    '(allow file-read* file-test-existence file-write-data (literal "/dev/null") (literal "/dev/zero") (literal "/dev/random") (literal "/dev/urandom"))',
    `(allow file-write* (subpath ${JSON.stringify(allowedRoot)}))`,
  ];
  // These explicit denies document the surfaces and make the profile's
  // security intent auditable even though deny-default already rejects them.
  for (const root of uniquePaths(deniedWriteRoots)) lines.push(`(deny file-write* (subpath ${JSON.stringify(root)}))`);
  for (const root of uniquePaths(deniedReadRoots)) lines.push(`(deny file-read* (subpath ${JSON.stringify(root)}))`);
  // Controller-owned provider transport: the ONLY network egress is the
  // broker's loopback port. The trailing deny documents intent; deny-default
  // rejects every other address/port.
  if (brokerPort !== null && brokerPort !== undefined) {
    lines.push(`(allow network-outbound (remote ip "localhost:${brokerPort}"))`);
  }
  lines.push('(deny network*)');
  return `${lines.join('\n')}\n`;
}

function probeSync(boundary, executable, args = [], input = '') {
  const result = spawnSync(boundary.sandboxExecutable, ['-f', boundary.profilePath, executable, ...args], {
    cwd: boundary.worktreeDir,
    env: boundary.environment,
    input,
    encoding: 'utf8',
    timeout: PROBE_TIMEOUT_MS,
    maxBuffer: 2 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return {
    status: result.status,
    signal: result.signal ?? null,
    error: result.error ? result.error.message : null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function writeProbeScript(target) {
  return `set -e\nprintf x > ${quoteShell(target)}`;
}

function readProbeResult(result, expectedBlocked) {
  const blocked = result.status !== 0 || result.error !== null;
  return {
    status: result.status,
    blocked,
    expectedBlocked,
    stderrDigest: crypto.createHash('sha256').update(result.stderr ?? '').digest('hex'),
  };
}

/**
 * Truthful credential-probe evidence: `blocked` is true ONLY for an exact
 * proven denial (status 0, no error, no signal). Readable material and
 * every not-proven state serialize `blocked: false` with an explicit
 * `verification` classification; no credential bytes are ever echoed.
 */
function credentialReadEvidence(result, outcome) {
  return {
    status: result.status,
    signal: result.signal ?? null,
    // The outer spawn/sandbox error message (public-safe: spawnSync failure
    // text such as ENOENT/ETIMEDOUT/ENOBUFS; never probe output content).
    error: result.error ?? null,
    blocked: outcome === CREDENTIAL_READ_PROBE_OUTCOMES.BLOCKED_PROVEN,
    verification: outcome,
    expectedBlocked: true,
    stderrDigest: crypto.createHash('sha256').update(result.stderr ?? '').digest('hex'),
  };
}

function safeEnvironment({ worktreeDir, safeHome, safeGitConfig, scratchRoot, broker, invocationMarker = null }) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/(?:API|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|PRIVATE.?KEY)/i.test(key)) delete env[key];
  }
  for (const key of [
    'SSH_AUTH_SOCK',
    'SSH_AGENT_PID',
    'GIT_ASKPASS',
    'GIT_SSH',
    'GIT_SSH_COMMAND',
    'GIT_TERMINAL_PROMPT',
    'GCM_INTERACTIVE',
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'DEEPSEEK_API_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    // The Pi config-directory override points at real provider auth when
    // set in the controller environment. It must never be inherited by a
    // sandboxed process: the MODEL boundary redirects it to the isolated
    // per-invocation agent dir below, and every other boundary (validation
    // included) must not see it at all. The original custom directory is
    // additionally denied for filesystem reads by the profile (candidate
    // code may know the path; environment stripping alone is not enough).
    'PI_CODING_AGENT_DIR',
  ]) delete env[key];
  env.HOME = safeHome;
  env.USERPROFILE = safeHome;
  env.XDG_CONFIG_HOME = path.join(scratchRoot, '.config');
  env.XDG_CACHE_HOME = path.join(scratchRoot, '.cache');
  env.XDG_DATA_HOME = path.join(scratchRoot, '.data');
  env.TMPDIR = scratchRoot;
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_CONFIG_GLOBAL = safeGitConfig;
  env.GIT_TERMINAL_PROMPT = '0';
  env.LCIM_WORKTREE = worktreeDir;
  env.LCIM_EXECUTION_BOUNDARY = broker ? 'macos-seatbelt-deny-default-broker-only' : 'macos-seatbelt-deny-default';
  if (invocationMarker !== null && invocationMarker !== undefined) {
    // Per-invocation provenance marker: the controller's process supervisor
    // uses it to identify surviving descendants of THIS invocation only.
    env.LCIM_INVOCATION_MARKER = invocationMarker;
  }
  if (broker !== null && broker !== undefined) {
    // The sandboxed Pi must use the isolated agent config that points at the
    // controller-owned broker, and must not perform startup network
    // operations (update checks/telemetry) — those are structurally denied
    // anyway; these pins make the behavior deterministic.
    env.PI_CODING_AGENT_DIR = broker.piAgentDir;
    env.PI_OFFLINE = '1';
    env.PI_SKIP_VERSION_CHECK = '1';
    env.PI_TELEMETRY = '0';
  }
  return Object.freeze(env);
}

function normalizeBrokerAllowance(broker) {
  if (broker === null || broker === undefined) return null;
  if (typeof broker !== 'object' || Array.isArray(broker)) throw new ConfigError('broker allowance must be a plain object');
  const port = broker.port;
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new ExecutionBoundaryError('broker allowance requires a controller-pinned loopback port; refusing a boundary without a pin', { brokerPort: port });
  }
  return Object.freeze({
    host: '127.0.0.1',
    port,
    baseUrl: `http://127.0.0.1:${port}/v1`,
  });
}

/** Construct an unverified boundary. Authorization is mandatory before spawn. */
export function createWorkerExecutionBoundary({
  repoDir,
  worktreeDir,
  runDir,
  workUnitId,
  invocationId = null,
  piAgentDir = null,
  invocationMarker = null,
  credentialProbePaths = [],
  credentialHome = null,
  sandboxExecutable = SEATBELT_EXECUTABLE,
  broker = null,
  processCreation = DEFAULT_PROCESS_CREATION,
} = {}) {
  if (process.platform !== 'darwin') {
    throw new ExecutionBoundaryError(`no verified structural worker sandbox is implemented for platform ${process.platform}; refusing to spawn`, { platform: process.platform });
  }
  if (!PROCESS_CREATION_MODES.includes(processCreation)) {
    throw new ConfigError(`processCreation must be one of ${PROCESS_CREATION_MODES.join(', ')}; refusing an unclassifiable boundary`);
  }
  const executable = canonicalSandboxExecutable(sandboxExecutable);
  const brokerAllowance = normalizeBrokerAllowance(broker);
  const repo = absoluteExisting(repoDir, 'repoDir');
  const worktree = absoluteExisting(worktreeDir, 'worktreeDir');
  const run = absoluteExisting(runDir, 'runDir');
  if (isPathWithin(repo, worktree)) {
    throw new ExecutionBoundaryError('worker worktree must not be inside the parent/main worktree', { repoDir: repo, worktreeDir: worktree });
  }
  if (isPathWithin(run, worktree) || isPathWithin(worktree, run)) {
    throw new ExecutionBoundaryError('worker worktree and run store must be disjoint', { runDir: run, worktreeDir: worktree });
  }
  if (typeof workUnitId !== 'string' || workUnitId.length === 0) throw new ConfigError('workUnitId is required for the execution boundary');
  if (invocationId !== null && (typeof invocationId !== 'string' || invocationId.length === 0)) {
    throw new ConfigError('invocationId must be a non-empty string when provided');
  }

  const boundaryDir = path.join(run, 'boundary');
  fs.mkdirSync(boundaryDir, { recursive: true, mode: 0o700 });
  const scratchRoot = path.join(worktree, '.lcim-scratch');
  fs.mkdirSync(scratchRoot, { recursive: true, mode: 0o700 });
  const safeHome = path.join(boundaryDir, 'home');
  fs.mkdirSync(safeHome, { recursive: true, mode: 0o700 });
  const safeGitConfig = path.join(boundaryDir, `${workUnitId}.gitconfig`);
  if (!fs.existsSync(safeGitConfig)) {
    fs.writeFileSync(safeGitConfig, '[credential]\n\thelper =\n\n[core]\n\task = false\n', { mode: 0o600, flag: 'wx' });
  }
  // The isolated pi agent directory lives in the writable scratch surface
  // because Pi must create its auth/model store next to models.json. The
  // channel cannot be redirected: the profile pins the only reachable port
  // to the broker and the broker pins the only reachable routes. Each
  // invocation gets its OWN config surface (R3): an old invocation must
  // never watch a future invocation's models.json/token, so the caller
  // passes a per-invocation piAgentDir under <scratch>/<invocationId>/.
  let resolvedPiAgentDir = brokerAllowance === null ? null : path.join(scratchRoot, 'pi-agent');
  if (piAgentDir !== null && piAgentDir !== undefined) {
    if (typeof piAgentDir !== 'string' || !path.isAbsolute(piAgentDir)) {
      throw new ConfigError('piAgentDir must be an absolute path');
    }
    if (!isPathWithin(scratchRoot, piAgentDir)) {
      throw new ExecutionBoundaryError('per-invocation pi agent dir must live inside the worker scratch surface', { piAgentDir, scratchRoot });
    }
    resolvedPiAgentDir = piAgentDir;
  }

  const home = path.resolve(credentialHome === null || credentialHome === undefined ? os.homedir() : credentialHome);
  if (credentialHome !== null && credentialHome !== undefined) {
    if (typeof credentialHome !== 'string' || credentialHome.length === 0 || !path.isAbsolute(credentialHome)) {
      throw new ConfigError('credentialHome must be an absolute path when provided');
    }
  }
  // A custom PI_CODING_AGENT_DIR (pi config-directory override) is itself a
  // credential surface. Validation must not inherit usable authority to it:
  // the environment strips the variable (safeEnvironment) AND the profile
  // structurally denies file-read access to the original directory.
  const customPiAgentDir = process.env.PI_CODING_AGENT_DIR;
  const customPiAgentCredentialPath = typeof customPiAgentDir === 'string' && customPiAgentDir.length > 0 && path.isAbsolute(customPiAgentDir) ? customPiAgentDir : null;
  const credentialPathsForProfile = credentialPaths(home, [
    ...credentialProbePaths,
    ...(customPiAgentCredentialPath === null ? [] : [customPiAgentCredentialPath]),
  ]);
  const deniedWriteRoots = uniquePaths([
    repo,
    run,
    path.join(worktree, '.git'),
    ...credentialPathsForProfile,
    boundaryDir,
    safeGitConfig,
  ]);
  const profilePath = profilePathFor(run, workUnitId, invocationId);
  const profile = makeProfile({
    allowedRoot: worktree,
    deniedWriteRoots,
    deniedReadRoots: credentialPathsForProfile,
    brokerPort: brokerAllowance?.port ?? null,
    processCreation,
  });
  fs.writeFileSync(profilePath, profile, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  const environment = safeEnvironment({
    worktreeDir: worktree,
    safeHome,
    safeGitConfig,
    scratchRoot,
    broker: brokerAllowance === null ? null : { piAgentDir: resolvedPiAgentDir },
    invocationMarker,
  });
  const networkPolicy = brokerAllowance === null
    ? Object.freeze({ mode: 'DENY_ALL', broker: null })
    : Object.freeze({ mode: 'BROKER_ONLY', broker: brokerAllowance });

  return Object.freeze({
    schemaName: EXECUTION_BOUNDARY_SCHEMA_NAME,
    schemaVersion: EXECUTION_BOUNDARY_SCHEMA_VERSION,
    mechanism: 'macOS Seatbelt sandbox-exec deny-default profile',
    structural: true,
    processCreation,
    sandboxExecutable: executable,
    profilePath,
    repoDir: repo,
    worktreeDir: worktree,
    runDir: run,
    allowedWriteRoot: worktree,
    scratchRoot,
    piAgentDir: resolvedPiAgentDir,
    safeHome,
    safeGitConfig,
    workUnitId,
    invocationId,
    credentialPaths: Object.freeze(credentialPathsForProfile),
    deniedWriteRoots: Object.freeze(deniedWriteRoots),
    networkMode: networkPolicy.mode,
    networkPolicy,
    environment,
    verified: false,
    verification: null,
  });
}

/** Verify profile compilation, write confinement, credential isolation, and network policy. Grants NO spawn authority. */
export async function verifyWorkerExecutionBoundary(boundary) {
  if (boundary === null || typeof boundary !== 'object' || boundary.structural !== true) {
    throw new ExecutionBoundaryError('only a controller-created structural boundary may be verified');
  }
  canonicalSandboxExecutable(boundary.sandboxExecutable);
  if (boundary.processCreation !== 'DENIED' && boundary.processCreation !== 'ALLOWED') {
    throw new ExecutionBoundaryError('boundary processCreation policy is unclassifiable; refusing spawn', { processCreation: boundary.processCreation });
  }
  const compile = probeSync(boundary, '/usr/bin/true');
  if (compile.status !== 0 || compile.error !== null) {
    throw new ExecutionBoundaryError('Seatbelt profile could not be compiled/executed; refusing worker spawn', { compile: readProbeResult(compile, false) });
  }

  // SOL-S10-001 R4: for the MODEL invocation boundary, child creation must
  // be STRUCTURALLY denied. The probe runs a real spawn attempt inside the
  // sandbox; ONLY an exact-EPERM-at-creation outcome authorizes the
  // boundary (SOL-S10-001 R4 recheck: a non-EPERM spawn failure such as
  // EAGAIN/EMFILE/ENOENT/ENOMEM/EACCES is NOT proof of structural denial
  // and fails closed, as does an actual child creation or an ambiguous
  // outcome). An ALLOWED boundary (controller-owned validation) skips this
  // probe.
  let childCreation = null;
  if (boundary.processCreation === 'DENIED') {
    const probe = probeSync(boundary, process.execPath, ['-e', CHILD_CREATION_PROBE_SCRIPT]);
    const evidence = readProbeResult(probe, true);
    const probeOutcome = classifyChildCreationProbeOutcome({ status: probe.status, error: probe.error });
    const structurallyDenied = probeOutcome === CHILD_CREATION_PROBE_OUTCOMES.DENIED_EPERM;
    childCreation = Object.freeze({
      mode: structurallyDenied ? 'STRUCTURALLY_DENIED' : 'NOT_PROVEN',
      mechanism: 'Seatbelt process-fork denial: (deny process-fork) in the bound profile refuses fork(2)/posix_spawn(2) at creation; only an exact-EPERM probe outcome may prove structural denial',
      probed: true,
      blocked: structurallyDenied,
      probeOutcome,
      probe: evidence,
    });
    if (!structurallyDenied) {
      throw new ExecutionBoundaryError('Seatbelt boundary did not prove exact-EPERM structural denial of child process creation (non-EPERM failure, actual child creation, or ambiguous probe outcome); refusing model invocation spawn', { childCreation });
    }
  } else {
    childCreation = Object.freeze({
      mode: 'ALLOWED',
      mechanism: 'process-fork explicitly allowed for controller-owned validation/test execution',
      probed: false,
      blocked: false,
    });
  }

  const token = crypto.randomBytes(8).toString('hex');
  const allowedProbe = path.join(boundary.worktreeDir, `.lcim-boundary-allowed-${token}`);
  const allowed = probeSync(boundary, '/bin/sh', ['-c', writeProbeScript(allowedProbe)]);
  const allowedResult = readProbeResult(allowed, false);
  if (!fs.existsSync(allowedProbe) || allowed.status !== 0) {
    throw new ExecutionBoundaryError('Seatbelt boundary does not permit the controller-approved worker worktree write surface', { allowed: allowedResult });
  }
  fs.rmSync(allowedProbe, { force: true });

  const deniedTargets = [
    path.join(boundary.repoDir, `.lcim-boundary-parent-${token}`),
    path.join(path.dirname(boundary.repoDir), `.lcim-boundary-sibling-${token}`),
    path.join(boundary.runDir, `.lcim-boundary-runtime-${token}`),
    path.join(path.dirname(boundary.profilePath), `.lcim-boundary-profile-${token}`),
  ];
  const denied = [];
  for (const target of deniedTargets) {
    const result = probeSync(boundary, '/bin/sh', ['-c', writeProbeScript(target)]);
    const evidence = readProbeResult(result, true);
    if (!evidence.blocked || fs.existsSync(target)) {
      if (fs.existsSync(target)) fs.rmSync(target, { force: true });
      throw new ExecutionBoundaryError('Seatbelt boundary failed to block a write outside the approved worker worktree', { target, evidence });
    }
    denied.push({ target, ...evidence });
  }

  const credentialResults = [];
  for (const target of boundary.credentialPaths) {
    if (!fs.existsSync(target)) continue;
    // Probe the exact effective path (file read or directory read). For the
    // Pi agent directory the named credential file auth.json is probed in
    // addition to the subtree listing; both must be structurally denied.
    const probeTargets = [target];
    if (fs.statSync(target).isDirectory()) {
      const authFile = path.join(target, 'auth.json');
      if (fs.existsSync(authFile)) probeTargets.push(authFile);
    }
    for (const probeTarget of probeTargets) {
      const result = probeSync(boundary, process.execPath, ['-e', CREDENTIAL_READ_PROBE_SCRIPT, probeTarget]);
      const outcome = classifyCredentialReadProbe(result);
      const evidence = credentialReadEvidence(result, outcome);
      // SOL-S10-001 (R6): ONLY an exact probe status 0 (in-sandbox
      // EPERM/EACCES) proves credential isolation. Readable material
      // (status 3), unexpected probe failures (status 2 or any other),
      // signal termination, timeout, and outer spawn/sandbox errors all
      // fail closed BEFORE the boundary may authorize, and EVERY
      // credential target must independently pass — "at least one blocked"
      // is never enough.
      if (outcome === CREDENTIAL_READ_PROBE_OUTCOMES.READABLE) {
        throw new ExecutionBoundaryError('credential material remained readable inside the worker boundary; only exact probe status 0 (structural EPERM/EACCES denial) may authorize', { target: probeTarget, evidence });
      }
      if (outcome !== CREDENTIAL_READ_PROBE_OUTCOMES.BLOCKED_PROVEN) {
        throw new ExecutionBoundaryError('credential isolation could not be objectively proven (probe error, signal, timeout, or unexpected status); only exact probe status 0 (structural EPERM/EACCES denial) may authorize', { target: probeTarget, evidence });
      }
      credentialResults.push({ target: probeTarget, ...evidence });
    }
  }

  const networkResult = await verifyNetworkPolicy(boundary);
  if (networkResult.mode === 'DENY_ALL' && (!networkResult.blocked || networkResult.connections !== 0)) {
    throw new ExecutionBoundaryError('worker network access could not be proven unavailable', { network: networkResult });
  }
  if (networkResult.mode === 'BROKER_ONLY') {
    if (!networkResult.brokerReachable) {
      throw new ExecutionBoundaryError('worker boundary cannot reach the controller-owned provider broker', { network: networkResult });
    }
    if (!networkResult.otherLoopbackBlocked) {
      throw new ExecutionBoundaryError('worker boundary reached a local endpoint outside the controller-pinned broker allowance', { network: networkResult });
    }
  }

  const selfWidening = probeSync(boundary, '/bin/sh', ['-c', writeProbeScript(boundary.profilePath)]);
  const selfWideningEvidence = readProbeResult(selfWidening, true);
  if (!selfWideningEvidence.blocked) throw new ExecutionBoundaryError('worker can alter its Seatbelt boundary profile; refusing spawn', { selfWidening: selfWideningEvidence });

  return Object.freeze({
    schemaName: EXECUTION_BOUNDARY_SCHEMA_NAME,
    schemaVersion: EXECUTION_BOUNDARY_SCHEMA_VERSION,
    mechanism: boundary.mechanism,
    structural: true,
    processCreation: boundary.processCreation,
    childCreation,
    allowedWriteRoot: boundary.allowedWriteRoot,
    scratchRoot: boundary.scratchRoot,
    deniedWriteSurfaces: Object.freeze(denied.map((item) => item.target)),
    credentialIsolation: Object.freeze({
      mode: 'environment-stripped-and-filesystem-denied',
      checkedPaths: Object.freeze(credentialResults.map((item) => item.target)),
      unavailableWhenAbsent: true,
    }),
    network: networkResult,
    boundaryConfiguration: Object.freeze({ profilePath: boundary.profilePath, immutableToWorker: true, selfWidening: selfWideningEvidence }),
    probes: Object.freeze({ profileCompiled: true, allowedWrite: allowedResult, deniedWrites: Object.freeze(denied), credentials: Object.freeze(credentialResults) }),
    verifiedAt: new Date().toISOString(),
  });
}

function buildCapabilityRecord(boundary, evidence) {
  let profileBytes;
  try {
    profileBytes = fs.readFileSync(boundary.profilePath, 'utf8');
  } catch (err) {
    throw new ExecutionBoundaryError('authorized boundary profile could not be read for capability binding; refusing authorization', { profilePath: boundary.profilePath, cause: err.message });
  }
  const evidenceDigest = crypto.createHash('sha256').update(canonicalJson(evidence)).digest('hex');
  return Object.freeze({
    schemaName: boundary.schemaName,
    schemaVersion: boundary.schemaVersion,
    mechanism: boundary.mechanism,
    processCreation: boundary.processCreation,
    childCreation: boundary.childCreation,
    sandboxExecutable: boundary.sandboxExecutable,
    profilePath: boundary.profilePath,
    profileDigest: crypto.createHash('sha256').update(profileBytes).digest('hex'),
    worktreeDir: boundary.worktreeDir,
    allowedWriteRoot: boundary.allowedWriteRoot,
    scratchRoot: boundary.scratchRoot,
    piAgentDir: boundary.piAgentDir,
    safeHome: boundary.safeHome,
    safeGitConfig: boundary.safeGitConfig,
    runDir: boundary.runDir,
    workUnitId: boundary.workUnitId,
    invocationId: boundary.invocationId ?? null,
    deniedWriteRoots: Object.freeze([...boundary.deniedWriteRoots]),
    credentialPaths: Object.freeze([...boundary.credentialPaths]),
    networkPolicy: boundary.networkPolicy,
    environment: boundary.environment,
    evidenceDigest,
    registeredAt: new Date().toISOString(),
  });
}

/** Construct, verify, and authorize one boundary in a single fail-closed operation. */
export async function authorizeWorkerExecutionBoundary(options) {
  const boundary = createWorkerExecutionBoundary(options);
  const evidence = await verifyWorkerExecutionBoundary(boundary);
  const capability = buildCapabilityRecord(boundary, evidence);
  const authorizedBoundary = Object.freeze({ ...boundary, verified: true, verification: evidence });
  // Only this successful internal authorization path may register a spawn
  // capability. The instance is the unforgeable authority; the record is
  // immutable and binds every security-critical value.
  authorizedCapabilities.set(authorizedBoundary, capability);
  return Object.freeze({ boundary: authorizedBoundary, evidence });
}

/**
 * Spawn-time revalidation against the immutable capability record. Any
 * change to bound material refuses child creation.
 */
function assertSpawnCapabilityFresh(capability) {
  let profileBytes;
  try {
    profileBytes = fs.readFileSync(capability.profilePath, 'utf8');
  } catch (err) {
    throw new ExecutionBoundaryError('Seatbelt profile could not be re-read at spawn time; refusing child creation', { profilePath: capability.profilePath, cause: err.message });
  }
  const digest = crypto.createHash('sha256').update(profileBytes).digest('hex');
  if (digest !== capability.profileDigest) {
    throw new ExecutionBoundaryError('Seatbelt profile bytes changed since authorization; refusing child creation', { profilePath: capability.profilePath });
  }
  let profileReal;
  try {
    profileReal = fs.realpathSync(capability.profilePath);
  } catch (err) {
    throw new ExecutionBoundaryError('Seatbelt profile path is no longer resolvable; refusing child creation', { profilePath: capability.profilePath, cause: err.message });
  }
  if (profileReal !== capability.profilePath) {
    throw new ExecutionBoundaryError('Seatbelt profile path was substituted since authorization; refusing child creation', { profilePath: capability.profilePath, resolved: profileReal });
  }
  let executableReal;
  try {
    executableReal = fs.realpathSync(capability.sandboxExecutable);
    fs.accessSync(capability.sandboxExecutable, fs.constants.X_OK);
  } catch (err) {
    throw new ExecutionBoundaryError('canonical sandbox executable is no longer available at the authorized path; refusing child creation', { executable: capability.sandboxExecutable, cause: err.message });
  }
  if (executableReal !== capability.sandboxExecutable) {
    throw new ExecutionBoundaryError('sandbox executable path was substituted since authorization; refusing child creation', { executable: capability.sandboxExecutable, resolved: executableReal });
  }
  try {
    if (!fs.statSync(capability.worktreeDir).isDirectory()) throw new Error('not a directory');
  } catch (err) {
    throw new ExecutionBoundaryError('authorized worker worktree is no longer a directory; refusing child creation', { worktreeDir: capability.worktreeDir, cause: err.message });
  }
}

/** Spawn a command inside an authorized boundary. Caller-constructed sandbox claims are never accepted. */
export function runConstrainedProcess(boundary, { command, args = [], input = '', timeoutMs = 300_000, onSpawn = null } = {}) {
  const capability = authorizedCapabilities.get(boundary);
  if (capability === undefined) {
    throw new ExecutionBoundaryError('worker process requested without a controller-authorized execution boundary; caller-constructed, cloned, or mutated boundary objects never grant spawn authority');
  }
  // Revalidate the bound security-critical state before ANY child creation.
  assertSpawnCapabilityFresh(capability);
  if (!Array.isArray(command) || command.length === 0) throw new ConfigError('constrained process command must be a non-empty argv array');
  if (!Array.isArray(args)) throw new ConfigError('constrained process args must be an array');
  if (typeof input !== 'string') throw new ConfigError('constrained process input must be text');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 1_800_000) throw new ConfigError('constrained process timeoutMs is out of bounds');
  if (onSpawn !== null && typeof onSpawn !== 'function') throw new ConfigError('constrained process onSpawn must be a function when provided');
  const argv = [...command, ...args];
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(capability.sandboxExecutable, ['-f', capability.profilePath, ...argv], {
        cwd: capability.worktreeDir,
        env: capability.environment,
        stdio: ['pipe', 'pipe', 'pipe'],
        // The direct child becomes a NEW session/process-group leader so
        // the controller-owned process supervisor owns a clean lifetime
        // boundary: same-group descendants can be swept by group identity
        // and detached descendants are tracked by retained identity.
        detached: true,
      });
    } catch (err) {
      resolve({ status: null, signal: null, stdout: '', stderr: '', error: err.message, timedOut: false, processCompleted: false, pid: null, durationMs: Date.now() - startedAt });
      return;
    }
    if (typeof onSpawn === 'function') {
      try {
        onSpawn({ pid: child.pid });
      } catch {
        // The supervisor is best-effort at identity handoff; the child is
        // still spawned and the controller's fail-closed checks run after.
      }
    }
    const out = [];
    const errOut = [];
    let outBytes = 0;
    let errBytes = 0;
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      outBytes += chunk.length;
      if (outBytes <= MAX_OUTPUT_BYTES) out.push(chunk);
      else child.kill('SIGTERM');
    });
    child.stderr.on('data', (chunk) => {
      errBytes += chunk.length;
      if (errBytes <= MAX_OUTPUT_BYTES) errOut.push(chunk);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status: null, signal: null, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(errOut).toString('utf8'), error: error.message, timedOut, processCompleted: false, pid: child.pid ?? null, durationMs: Date.now() - startedAt });
    });
    child.on('close', (status, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        status,
        signal,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(errOut).toString('utf8'),
        error: outBytes > MAX_OUTPUT_BYTES || errBytes > MAX_OUTPUT_BYTES ? 'worker output exceeded the bounded transport buffer' : null,
        timedOut,
        processCompleted: true,
        pid: child.pid ?? null,
        durationMs: Date.now() - startedAt,
      });
    });
    child.stdin.on('error', () => {
      // The constrained child may exit before its stdin is fully flushed
      // (EPIPE). The child's exit/error/close paths already own the result;
      // a broken stdin pipe carries no additional signal.
    });
    child.stdin.end(input);
  });
}

/** Recreate the worker scratch surface, preserving controller-owned entries such as the pi agent dir. */
export function resetWorkerScratch(scratchRoot, { preserve = [] } = {}) {
  if (typeof scratchRoot !== 'string' || scratchRoot.length === 0 || !path.isAbsolute(scratchRoot)) {
    throw new ConfigError('worker scratch root must be an absolute path');
  }
  if (!Array.isArray(preserve)) throw new ConfigError('scratch preserve list must be an array of basenames');
  const keep = new Set(preserve);
  if (fs.existsSync(scratchRoot)) {
    for (const entry of fs.readdirSync(scratchRoot)) {
      if (keep.has(entry)) continue;
      fs.rmSync(path.join(scratchRoot, entry), { recursive: true, force: true });
    }
  }
  fs.mkdirSync(scratchRoot, { recursive: true, mode: 0o700 });
  return scratchRoot;
}

/**
 * Persist objective boundary evidence under the run store, never in project
 * config. `key` must be unique per persisted boundary (per-invocation),
 * e.g. `${workUnitId}-${invocationId}`.
 */
export function persistBoundaryEvidence(runDir, key, evidence) {
  if (typeof runDir !== 'string' || typeof key !== 'string' || key.length === 0 || evidence === null || typeof evidence !== 'object') {
    throw new ConfigError('persistBoundaryEvidence requires a run directory, unique key, and evidence object');
  }
  const dir = path.join(runDir, 'boundary');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const safe = key.replace(/[^A-Za-z0-9_-]/g, '_');
  const file = path.join(dir, `${safe}.json`);
  writeJsonAtomic(file, evidence);
  return file;
}

async function probeNetwork(boundary, port) {
  const script = [
    `const net=require('node:net');`,
    `const s=net.createConnection({host:'127.0.0.1',port:${port}});`,
    `s.on('connect',()=>process.exit(0));`,
    `s.on('error',()=>process.exit(3));`,
    `setTimeout(()=>process.exit(4),1000);`,
  ].join('');
  return probeSync(boundary, process.execPath, ['-e', script]);
}

async function verifyNetworkPolicy(boundary) {
  const broker = boundary.networkPolicy?.broker ?? null;
  const forbiddenServer = net.createServer(() => {
    // A connection here is objective proof that the boundary leaked network.
  });
  await new Promise((resolve, reject) => {
    forbiddenServer.once('error', reject);
    forbiddenServer.listen(0, '127.0.0.1', resolve);
  });
  const forbiddenPort = forbiddenServer.address().port;
  const forbiddenResult = await probeNetwork(boundary, forbiddenPort);
  await new Promise((resolve) => setImmediate(resolve));
  const connections = forbiddenServer.connections ?? 0;
  await new Promise((resolve) => forbiddenServer.close(resolve));

  if (broker === null) {
    return Object.freeze({
      mode: 'DENY_ALL',
      blocked: forbiddenResult.status !== 0 && connections === 0,
      connections,
      status: forbiddenResult.status,
      error: forbiddenResult.error,
      stderrDigest: crypto.createHash('sha256').update(forbiddenResult.stderr ?? '').digest('hex'),
    });
  }

  const brokerResult = await probeNetwork(boundary, broker.port);
  return Object.freeze({
    mode: 'BROKER_ONLY',
    broker: Object.freeze({ host: broker.host, port: broker.port }),
    brokerReachable: brokerResult.status === 0,
    brokerStatus: brokerResult.status,
    otherLoopbackBlocked: forbiddenResult.status !== 0 && connections === 0,
    forbiddenConnections: connections,
    forbiddenStatus: forbiddenResult.status,
    blocked: true,
    connections: 0,
    error: forbiddenResult.error,
    stderrDigest: crypto.createHash('sha256').update(forbiddenResult.stderr ?? '').digest('hex'),
  });
}

export const runWorkerProcess = runConstrainedProcess;
