/**
 * Controller-owned GPT-5.6 Sol transport.
 *
 * Production uses only the exact Pi dependency pinned in LCIM's own
 * package-lock.  A controller-internal node:test seam may use a fixture,
 * but its opaque run authority makes the complete run non-authoritative.
 * Credentials exist only in a marker-recognized, run-scoped Pi auth store
 * and raw provider output is never persisted.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { ConfigError, LcimError } from '../shared/errors.mjs';
import { canonicalJson } from '../logging/digest.mjs';
import { isValidId } from '../shared/ids.mjs';
import { withRunDirLock } from '../logging/io.mjs';
import { CODEX_OAUTH_PROVIDER, PI_AUTH_FILE, resolvePiAgentDir } from '../providers/oauth.mjs';
import { CODEX_SOL_MODEL } from '../providers/capabilities/metadata.mjs';
import { isSolTestRunAuthority } from './test-seams.mjs';
import { terminateProcessesByMarker } from './process-supervisor.mjs';
import { snapshotJson } from './input-snapshot.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LCIM_ROOT = path.resolve(HERE, '../..');
const LCIM_NODE_MODULES = path.join(LCIM_ROOT, 'node_modules');
const PI_PACKAGE_NAME = '@earendil-works/pi-coding-agent';
const SUPPORTED_PI_VERSION = '0.84.1';
const SUPPORTED_PI_INTEGRITY = 'sha512-ncAqFrG+iybuPGOhMiZoEHkEzTpJgz3guYD32pD+M7ucc0WeHmauP6wa7qwP8V/KWvsZDVNa5XGsdZ7fkC7w7A==';
// Reviewed manifest of the exact lockfile-resolved executable closure. This
// prevents a mutable installed tree from becoming authority merely because
// its package.json still claims the supported version.
const SUPPORTED_PI_CLOSURE_FILE_COUNT = 19066;
const SUPPORTED_PI_CLOSURE_SHA256 = '57462f26cac81ce9a68e60c704c6d3e6ca41d11f01254ee5c9b00ee560da85a8';
const PI_CLI_REL = path.posix.join('dist', 'cli.js');
const PI_AUTH_STORAGE_REL = path.posix.join('dist', 'core', 'auth-storage.js');
const PI_PUBLIC_ENTRY_REL = path.posix.join('dist', 'index.js');
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;
const TERMINATE_GRACE_MS = 1_000;
const POST_KILL_SETTLE_MS = 2_000;
const TRANSPORT_MARKER_FILE = '.lcim-sol-transport.json';
const EVIDENCE_DIR = 'evidence';
const MIN_CANARY_CREDENTIAL_LENGTH = 8;
// One logical Codex OAuth store exists for an in-process run. Reacquiring a
// disk path must never reset its original/current credential state.
/**
 * Fifth-review rule: transport surface creation/acquisition, marked
 * transport registration, store removal, finalize, abort, recovery
 * terminalization, and transport cleanup/sweep are serialized under ONE
 * authoritative per-run lifecycle lock. A run must never transition
 * terminal while a new marked transport surface can appear concurrently.
 *
 * The lock is an in-process async mutex (per canonical run dir) made
 * reentrant with AsyncLocalStorage, and every OUTERMOST acquisition also
 * holds the owner-verified on-disk run lock (`withRunDirLock`). Thus every
 * creation, registration, removal, sweep, and terminal transition uses the
 * same cross-process serialization boundary. Transport creation additionally
 * requires lifecycleState === 'OPEN' while that boundary is held.
 */
const runLifecycleAls = new AsyncLocalStorage();
const runLifecycleQueues = new Map();

export function withSolTransportRunLock(runDir, fn) {
  if (typeof runDir !== 'string' || runDir.length === 0) throw new ConfigError('sol transport run lock requires a run directory');
  let canonical;
  try { canonical = fs.realpathSync(runDir); } catch { canonical = path.resolve(runDir); }
  const held = runLifecycleAls.getStore();
  if (held !== null && typeof held === 'object' && held.has(canonical)) {
    // Reentrant acquisition from the same async context (e.g. the sweep
    // running inside finalize's terminalization critical section).
    return Promise.resolve().then(() => fn());
  }
  const tail = runLifecycleQueues.get(canonical) ?? Promise.resolve();
  const next = tail.then(async () => {
    const current = runLifecycleAls.getStore();
    const store = new Set(current !== null && typeof current === 'object' ? current : []);
    store.add(canonical);
    return runLifecycleAls.run(store, () => withRunDirLock(runDir, fn));
  });
  const tracked = next.then(() => undefined, () => undefined);
  runLifecycleQueues.set(canonical, tracked);
  tracked.then(() => {
    if (runLifecycleQueues.get(canonical) === tracked) runLifecycleQueues.delete(canonical);
  }, () => {
    if (runLifecycleQueues.get(canonical) === tracked) runLifecycleQueues.delete(canonical);
  });
  return next;
}

/**
 * Authoritative cross-process lifecycle gate for NEW marked transport
 * surface creation: while holding the run-dir lock, the run.json
 * lifecycleState must still be OPEN. A terminal (or unreadable) run
 * refuses any new surface — a run can never gain a new marked transport
 * surface after terminalization.
 */
function assertRunLifecycleOpen(runDir) {
  let parsed = null;
  try { parsed = JSON.parse(fs.readFileSync(path.join(runDir, 'run.json'), 'utf8')); } catch { /* reflected below */ }
  const lifecycleState = parsed !== null && typeof parsed === 'object' ? parsed.lifecycleState : null;
  if (lifecycleState !== 'OPEN') {
    throw new LcimError(
      `run lifecycle is ${lifecycleState ?? 'UNREADABLE'}; a new marked transport surface cannot appear for a non-open run`,
      'SOL_TRANSPORT_SURFACE_VIOLATION',
      { path: runDir, lifecycleState },
    );
  }
  return parsed;
}

/** @returns {string} the controller-owned sol-transport root under a run dir. */
export function solTransportRootOf(runDir) {
  return path.join(runDir, 'controller', 'sol-transport');
}

/** @returns {string} the durable external marker directory (outside the credential subtree). */
export function transportMarkersDir(runDir) {
  return path.join(solTransportRootOf(runDir), 'markers');
}

/** @returns {string} the durable external store marker path (never inside the deleted credential subtree). */
export function storeMarkerPathOf(runDir, runId) {
  return path.join(transportMarkersDir(runDir), `${runId}.json`);
}

const retainedSolStores = new Map();
const retiredSolStoreKeys = new Set();

export const SOL_TRANSPORT_SCHEMA_NAME = 'lcim.sol-transport';
export const SOL_TRANSPORT_SCHEMA_VERSION = '1.4.0';
export const SOL_REVIEW_AUTHORITY = Object.freeze({
  AUTHORITATIVE: 'AUTHORITATIVE',
  TEST_SEAM_NON_AUTHORITATIVE: 'TEST_SEAM_NON_AUTHORITATIVE',
});
export const TRANSPORT_CREDENTIAL_LEAK = 'TRANSPORT_CREDENTIAL_LEAK';
export const SOL_COMMAND_MASQUERADE = 'SOL_COMMAND_MASQUERADE';
export const SOL_TRANSPORT_CLEANUP_FAILED = 'SOL_TRANSPORT_CLEANUP_FAILED';
/** Retained only to reject legacy external-Pi configuration explicitly. */
export const PI_CONTROLLER_CONFIG_ENV = 'LCIM_SOL_PI_CLI';

export const STRIPPED_ENV_FAMILIES = Object.freeze([
  'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY',
  'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR',
  'NODE_OPTIONS', 'NODE_REPL_EXTERNAL_MODULE', 'NODE_PATH',
  'PI_CODING_AGENT_SESSION_DIR', 'PI_OAUTH_CALLBACK_HOST', 'PI_SHARE_VIEWER_URL',
]);

export const PI_ENV_PINS = Object.freeze({
  PI_OFFLINE: '1',
  PI_SKIP_VERSION_CHECK: '1',
  PI_TELEMETRY: '0',
});

const BASE_ENV_ALLOWLIST = Object.freeze([
  'HOME', 'PATH', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'LC_CTYPE',
  'NO_COLOR', 'TERM', 'SYSTEMROOT', 'COMSPEC',
]);

export const SOL_TRANSPORT_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';

function credentialShaped(key) {
  return /(?:API|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|PRIVATE.?KEY)/i.test(key);
}
function proxyShaped(key) { return /PROXY/i.test(key); }
function piShaped(key) { return /^PI_/i.test(key); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function samePath(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
function safeLstat(target, label) {
  let stat;
  try { stat = fs.lstatSync(target); } catch (error) {
    throw new ConfigError(`${label} is unavailable at ${target}: ${error.message}`);
  }
  if (stat.isSymbolicLink()) throw new ConfigError(`${label} must not be a symlink: ${target}`);
  return stat;
}
function assertAbsent(target, label) {
  try {
    fs.lstatSync(target);
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    throw new LcimError(`${label} absence could not be verified: ${error.message}`, SOL_TRANSPORT_CLEANUP_FAILED);
  }
  throw new LcimError(`${label} still exists after cleanup`, SOL_TRANSPORT_CLEANUP_FAILED);
}
function makeWritableForCleanup(root) {
  const stat = fs.lstatSync(root);
  if (stat.isSymbolicLink()) throw new LcimError('controller cleanup refuses a symlinked transport surface', SOL_TRANSPORT_CLEANUP_FAILED);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(root)) makeWritableForCleanup(path.join(root, name));
    fs.chmodSync(root, 0o700);
  } else if (stat.isFile()) fs.chmodSync(root, 0o600);
  else throw new LcimError('controller cleanup found a non-regular transport surface entry', SOL_TRANSPORT_CLEANUP_FAILED);
}
function freeze(value) { return Object.freeze(value); }

/** Build a strict transport environment from a pre-snapshotted environment. */
export function buildSolTransportEnv({ agentDir, cwd, home, tmp, invocationMarker = null, env = process.env } = {}) {
  for (const [label, value] of Object.entries({ agentDir, cwd, home, tmp })) {
    if (typeof value !== 'string' || !path.isAbsolute(value)) throw new ConfigError(`sol transport requires absolute ${label}`);
  }
  const out = {};
  for (const key of BASE_ENV_ALLOWLIST) {
    const value = env?.[key];
    if (typeof value !== 'string' || value.length === 0) continue;
    if (STRIPPED_ENV_FAMILIES.includes(key) || credentialShaped(key) || proxyShaped(key) || piShaped(key)) continue;
    out[key] = value;
  }
  out.HOME = home;
  out.PATH = SOL_TRANSPORT_PATH;
  out.TMPDIR = tmp;
  out.TMP = tmp;
  out.TEMP = tmp;
  out.PI_CODING_AGENT_DIR = agentDir;
  for (const [key, value] of Object.entries(PI_ENV_PINS)) out[key] = value;
  if (typeof invocationMarker === 'string' && invocationMarker.length > 0) out.LCIM_INVOCATION_MARKER = invocationMarker;
  return freeze(out);
}

function packageRootForFile(file, expectedName = PI_PACKAGE_NAME) {
  let current = path.dirname(file);
  while (samePath(LCIM_ROOT, current)) {
    const manifest = path.join(current, 'package.json');
    try {
      const parsed = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (parsed?.name === expectedName) return current;
    } catch { /* keep walking */ }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function readPackageFacts(packageRoot, { exactVersion = true } = {}) {
  safeLstat(packageRoot, 'Pi package root');
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')); } catch (error) {
    throw new ConfigError(`Pi package manifest is unreadable at ${packageRoot}: ${error.message}`);
  }
  if (pkg === null || typeof pkg !== 'object' || Array.isArray(pkg)) throw new ConfigError('Pi package manifest must be an object');
  if (pkg.name !== PI_PACKAGE_NAME) throw new ConfigError(`Pi package name must be ${PI_PACKAGE_NAME}`);
  if (typeof pkg.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new ConfigError('Pi package version must be an exact supported semantic version');
  if (exactVersion && pkg.version !== SUPPORTED_PI_VERSION) throw new ConfigError(`unsupported Pi version ${pkg.version}; LCIM supports exactly ${SUPPORTED_PI_VERSION}`);
  if (pkg.bin === null || typeof pkg.bin !== 'object' || Array.isArray(pkg.bin) || pkg.bin.pi !== PI_CLI_REL) {
    throw new ConfigError(`Pi package bin.pi must be exactly ${PI_CLI_REL}`);
  }
  // We resolve only the package root export. The CLI/auth-storage files are
  // validated by explicit reviewed-layout paths, never by an unexported
  // import.meta.resolve subpath.
  const rootExport = pkg.exports?.['.'];
  const importTarget = typeof rootExport === 'object' && rootExport !== null ? rootExport.import : null;
  if (importTarget !== `./${PI_PUBLIC_ENTRY_REL}`) {
    throw new ConfigError(`Pi package must export '.' for import as ./${PI_PUBLIC_ENTRY_REL}; unsupported package-export layout`);
  }
  for (const relative of [PI_CLI_REL, PI_PUBLIC_ENTRY_REL, PI_AUTH_STORAGE_REL]) {
    const target = path.join(packageRoot, relative);
    const stat = safeLstat(target, `Pi reviewed layout file ${relative}`);
    if (!stat.isFile()) throw new ConfigError(`Pi reviewed layout target is not a regular file: ${relative}`);
  }
  return freeze({ name: pkg.name, version: pkg.version, bin: pkg.bin.pi, importTarget });
}

/** Verify an exact-supported canonical Pi CLI layout (does not establish authority alone). */
export function verifyPiCliPath(candidate) {
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) return { ok: false, reason: 'not-an-absolute-path' };
  let resolved;
  try {
    if (fs.lstatSync(candidate).isSymbolicLink()) return { ok: false, reason: 'symlink-cli' };
    resolved = fs.realpathSync(candidate);
  } catch { return { ok: false, reason: 'unresolvable' }; }
  const packageRoot = path.dirname(path.dirname(resolved));
  if (path.relative(packageRoot, resolved) !== path.join('dist', 'cli.js')) return { ok: false, reason: 'not-reviewed-cli-layout' };
  try {
    const facts = readPackageFacts(packageRoot);
    const stat = safeLstat(resolved, 'Pi CLI');
    if (!stat.isFile()) return { ok: false, reason: 'not-regular-file' };
    fs.accessSync(resolved, fs.constants.X_OK);
    return freeze({ ok: true, resolved, packageRoot, packageName: facts.name, packageVersion: facts.version });
  } catch (error) {
    return { ok: false, reason: /version/.test(error.message) ? 'unsupported-version' : 'package-unreadable-or-mismatched' };
  }
}

export function computeFileIdentity(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) throw new ConfigError('identity pinning requires an absolute file path');
  const stat = safeLstat(file, 'identity target');
  if (!stat.isFile()) throw new ConfigError(`pinned identity target is not a regular file: ${file}`);
  const realpath = fs.realpathSync(file);
  const realStat = fs.statSync(realpath);
  return freeze({
    realpath,
    stat: freeze({ dev: realStat.dev, ino: realStat.ino, size: realStat.size, mtimeMs: realStat.mtimeMs }),
    sha256: sha256(fs.readFileSync(realpath)),
  });
}

export function assertIdentityUnchanged(label, pinned) {
  if (pinned === null || typeof pinned !== 'object') throw new ConfigError(`cannot verify unpinned identity for ${label}`);
  const stat = safeLstat(pinned.realpath, label);
  if (!stat.isFile()) throw new ConfigError(`${label} is no longer a regular file`);
  const realpath = fs.realpathSync(pinned.realpath);
  if (realpath !== pinned.realpath) throw new ConfigError(`${label} realpath changed since verification`);
  const now = fs.statSync(realpath);
  if (now.dev !== pinned.stat.dev || now.ino !== pinned.stat.ino || now.size !== pinned.stat.size || now.mtimeMs !== pinned.stat.mtimeMs) {
    throw new ConfigError(`${label} stat identity changed since verification`);
  }
  if (sha256(fs.readFileSync(realpath)) !== pinned.sha256) throw new ConfigError(`${label} content hash changed since verification`);
  return true;
}

function dependencyNames(pkg) {
  return [...new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.optionalDependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
    ...(Array.isArray(pkg.bundledDependencies) ? pkg.bundledDependencies : []),
  ])].sort();
}
function dependencyAt(packageRoot, name, dependencyRoot = LCIM_NODE_MODULES) {
  let current = packageRoot;
  while (samePath(dependencyRoot, current)) {
    const candidates = [path.join(current, 'node_modules', name)];
    if (path.basename(current) === 'node_modules') candidates.push(path.join(current, name));
    for (const candidate of candidates) {
      try {
        const stat = fs.lstatSync(candidate);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw new ConfigError(`Pi dependency ${name} must be a real directory, not a symlink`);
        const real = fs.realpathSync(candidate);
        if (!samePath(dependencyRoot, real)) throw new ConfigError(`Pi dependency ${name} resolves outside the pinned controller dependency tree`);
        const pkg = JSON.parse(fs.readFileSync(path.join(real, 'package.json'), 'utf8'));
        if (pkg?.name !== name) throw new ConfigError(`Pi dependency ${name} manifest identity does not match its resolution path`);
        return real;
      } catch (error) {
        if (error?.code === 'ENOENT') continue;
        throw error;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}
function inventoryPackageFiles(packageRoot, rootLabel, out) {
  const walk = (dir) => {
    const names = fs.readdirSync(dir).sort();
    for (const name of names) {
      if (name === 'node_modules') continue;
      const full = path.join(dir, name);
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) throw new ConfigError(`Pi executable closure contains a symlink: ${full}`);
      if (stat.isDirectory()) walk(full);
      else if (stat.isFile()) out.push({ path: `${rootLabel}/${path.relative(packageRoot, full).split(path.sep).join('/')}`, size: stat.size, sha256: sha256(fs.readFileSync(full)) });
      else throw new ConfigError(`Pi executable closure contains a non-regular file: ${full}`);
    }
  };
  walk(packageRoot);
}

/** Hash the complete installed Pi executable dependency closure. */
export function computePiDependencyClosure(packageRoot, { dependencyRoot = LCIM_NODE_MODULES } = {}) {
  let canonicalDependencyRoot;
  try { canonicalDependencyRoot = fs.realpathSync(dependencyRoot); } catch (error) {
    throw new ConfigError(`Pi dependency root is unavailable: ${error.message}`);
  }
  const roots = new Map();
  const queue = [packageRoot];
  while (queue.length > 0) {
    const root = queue.shift();
    const real = fs.realpathSync(root);
    if (roots.has(real)) continue;
    const stat = safeLstat(real, 'Pi dependency closure package');
    if (!stat.isDirectory()) throw new ConfigError(`Pi dependency closure package is not a directory: ${real}`);
    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(path.join(real, 'package.json'), 'utf8')); } catch (error) {
      throw new ConfigError(`Pi dependency closure manifest is unreadable: ${error.message}`);
    }
    if (typeof pkg?.name !== 'string' || pkg.name.length === 0) throw new ConfigError(`Pi dependency closure manifest has no name at ${real}`);
    roots.set(real, pkg.name);
    for (const dependency of dependencyNames(pkg)) {
      const child = dependencyAt(real, dependency, canonicalDependencyRoot);
      // Optional packages may be absent; a declared mandatory dependency may
      // also be bundled, in which case it is reachable from the package.
      if (child !== null) queue.push(child);
      else if ((pkg.dependencies ?? {})[dependency] !== undefined) {
        throw new ConfigError(`required Pi dependency ${dependency} is missing from LCIM's dependency tree`);
      }
    }
  }
  const files = [];
  for (const [root] of [...roots.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    // Preserve each resolved package's relative installation path. Package
    // names alone are ambiguous when npm nests two versions of the same
    // dependency; an identity hash must cover both distinctly.
    const label = path.relative(canonicalDependencyRoot, root).split(path.sep).join('/');
    if (label === '' || label.startsWith('../') || path.isAbsolute(label)) throw new ConfigError('Pi dependency closure root escaped the controller dependency tree');
    inventoryPackageFiles(root, label, files);
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  return freeze({
    roots: freeze([...roots.entries()].map(([root, name]) => freeze({ root, name }))),
    files: freeze(files.map((entry) => freeze(entry))),
    fileCount: files.length,
    sha256: sha256(canonicalJson(files)),
  });
}

function verifyExecutionCopyManifest(executionNodeModules, expectedFiles) {
  const expected = new Map(expectedFiles.map((entry) => [entry.path, entry]));
  const allowedDirs = new Set(['']);
  for (const file of expected.keys()) {
    let current = path.posix.dirname(file);
    while (current !== '.' && current !== '') {
      allowedDirs.add(current);
      current = path.posix.dirname(current);
    }
  }
  const seen = new Set();
  const walk = (dir, relative = '') => {
    const names = fs.readdirSync(dir).sort();
    for (const name of names) {
      const full = path.join(dir, name);
      const rel = relative ? `${relative}/${name}` : name;
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
        throw new ConfigError(`immutable Pi execution copy contains an unsupported entry: ${rel}`);
      }
      if (stat.isDirectory()) {
        if (!allowedDirs.has(rel)) throw new ConfigError(`immutable Pi execution copy contains an extra module directory: ${rel}`);
        walk(full, rel);
      } else {
        const expectedFile = expected.get(rel);
        if (expectedFile === undefined) throw new ConfigError(`immutable Pi execution copy contains an extra executable/module file: ${rel}`);
        if (expectedFile.size !== stat.size || expectedFile.sha256 !== sha256(fs.readFileSync(full))) {
          throw new ConfigError(`immutable Pi execution copy manifest mismatch: ${rel}`);
        }
        seen.add(rel);
      }
    }
  };
  walk(executionNodeModules);
  if (seen.size !== expected.size || [...expected.keys()].some((entry) => !seen.has(entry))) {
    throw new ConfigError('immutable Pi execution copy is missing a pinned closure file');
  }
  return true;
}

function readLcimDependencyLock() {
  const manifestFile = path.join(LCIM_ROOT, 'package.json');
  const lockFile = path.join(LCIM_ROOT, 'package-lock.json');
  let manifest;
  let lock;
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch (error) {
    throw new ConfigError(`LCIM package manifest is unreadable; Pi provenance cannot be established: ${error.message}`);
  }
  try { lock = JSON.parse(fs.readFileSync(lockFile, 'utf8')); } catch (error) {
    throw new ConfigError(`LCIM package-lock is unreadable; Pi provenance cannot be established: ${error.message}`);
  }
  const declared = lock?.packages?.['']?.dependencies?.[PI_PACKAGE_NAME];
  const installed = lock?.packages?.[`node_modules/${PI_PACKAGE_NAME}`];
  if (manifest?.dependencies?.[PI_PACKAGE_NAME] !== SUPPORTED_PI_VERSION
    || declared !== SUPPORTED_PI_VERSION
    || installed?.version !== SUPPORTED_PI_VERSION
    || installed?.integrity !== SUPPORTED_PI_INTEGRITY) {
    throw new ConfigError(`LCIM package-lock does not pin ${PI_PACKAGE_NAME}@${SUPPORTED_PI_VERSION} with the reviewed integrity; refusing production Pi authority`);
  }
  return freeze({ lockIdentity: computeFileIdentity(lockFile), manifestIdentity: computeFileIdentity(manifestFile) });
}

function pinVerifiedPi(verified, resolvedFrom = 'lcim-pinned-dependency') {
  const lockFacts = readLcimDependencyLock();
  const closure = computePiDependencyClosure(verified.packageRoot);
  if (closure.fileCount !== SUPPORTED_PI_CLOSURE_FILE_COUNT || closure.sha256 !== SUPPORTED_PI_CLOSURE_SHA256) {
    throw new ConfigError('installed Pi executable closure does not match LCIM\'s reviewed exact lockfile manifest; refusing production Pi authority');
  }
  const nodeIdentity = computeFileIdentity(process.execPath);
  return freeze({
    node: nodeIdentity.realpath,
    cli: verified.resolved,
    packageRoot: verified.packageRoot,
    packageName: verified.packageName,
    packageVersion: verified.packageVersion,
    nodeIdentity,
    cliIdentity: computeFileIdentity(verified.resolved),
    lockIdentity: lockFacts.lockIdentity,
    manifestIdentity: lockFacts.manifestIdentity,
    closure,
    resolvedFrom,
    nonAuthoritative: false,
  });
}

function pinFixturePi(piBin) {
  if (typeof piBin !== 'string' || !path.isAbsolute(piBin)) throw new ConfigError('piBin test seam must be an absolute executable path');
  const cliIdentity = computeFileIdentity(piBin);
  fs.accessSync(cliIdentity.realpath, fs.constants.X_OK);
  const nodeIdentity = computeFileIdentity(process.execPath);
  return freeze({
    node: nodeIdentity.realpath,
    cli: cliIdentity.realpath,
    packageRoot: null,
    packageName: null,
    packageVersion: null,
    nodeIdentity,
    cliIdentity,
    lockIdentity: null,
    manifestIdentity: null,
    closure: null,
    resolvedFrom: 'node-test-fixture',
    nonAuthoritative: true,
  });
}

/**
 * Resolve production Pi only from LCIM's own installed dependency tree.
 * LCIM_SOL_PI_CLI and arbitrary canonical-looking package layouts are not
 * production authority. A fixture piBin is accepted only with an opaque
 * consumed node:test run authority.
 */
export function resolvePiExecutable({ piBin = null, env = process.env, testAuthority = null } = {}) {
  if (piBin !== null && piBin !== undefined) {
    if (!isSolTestRunAuthority(testAuthority)) throw new ConfigError('piBin is a controller-internal node:test seam and requires opaque consumed test-run authority');
    return pinFixturePi(piBin);
  }
  if (typeof env?.[PI_CONTROLLER_CONFIG_ENV] === 'string' && env[PI_CONTROLLER_CONFIG_ENV].length > 0) {
    throw new ConfigError(`${PI_CONTROLLER_CONFIG_ENV} is not a production Pi authority source; production uses only LCIM's exact pinned dependency`);
  }
  let entry;
  try { entry = fileURLToPath(import.meta.resolve(PI_PACKAGE_NAME)); } catch (error) {
    throw new ConfigError(`LCIM's exact pinned Pi dependency ${PI_PACKAGE_NAME}@${SUPPORTED_PI_VERSION} is unavailable from the controller dependency tree: ${error.message}`);
  }
  const packageRoot = packageRootForFile(entry);
  if (packageRoot === null || !samePath(LCIM_NODE_MODULES, packageRoot)) {
    throw new ConfigError('Pi resolved outside LCIM\'s own dependency tree; target repository/module resolution is never trusted');
  }
  const cli = path.join(packageRoot, PI_CLI_REL);
  const verified = verifyPiCliPath(cli);
  if (!verified.ok) throw new ConfigError(`LCIM's pinned Pi package failed reviewed-layout verification: ${verified.reason}`);
  return pinVerifiedPi(verified);
}

/**
 * Copy only the hashed Pi dependency closure into the controller-owned run
 * surface. The copied tree, not LCIM's live node_modules or the target
 * repository, is what Node executes. Files/directories are made read-only
 * after copying and the complete copied closure is re-hashed before every
 * spawn and after exit.
 */
function copyPackageWithoutNestedNodeModules(source, destination) {
  const walk = (from, to) => {
    fs.mkdirSync(to, { recursive: true, mode: 0o700 });
    for (const name of fs.readdirSync(from)) {
      if (name === 'node_modules') continue;
      const src = path.join(from, name);
      const dest = path.join(to, name);
      const stat = fs.lstatSync(src);
      if (stat.isSymbolicLink()) throw new ConfigError(`cannot materialize Pi closure containing a symlink: ${src}`);
      if (stat.isDirectory()) walk(src, dest);
      else if (stat.isFile()) {
        fs.copyFileSync(src, dest, fs.constants.COPYFILE_EXCL);
      } else throw new ConfigError(`cannot materialize non-regular Pi closure file: ${src}`);
    }
  };
  walk(source, destination);
}
function sealExecutionTree(root) {
  for (const name of fs.readdirSync(root)) {
    const target = path.join(root, name);
    const stat = fs.lstatSync(target);
    if (stat.isDirectory()) {
      sealExecutionTree(target);
      fs.chmodSync(target, 0o555);
    } else if (stat.isFile()) fs.chmodSync(target, (stat.mode & 0o111) !== 0 ? 0o555 : 0o444);
  }
}
function writeImmutableResolutionLoader(executionRoot, executionNodeModules) {
  const loader = path.join(executionRoot, 'lcim-immutable-resolution-loader.mjs');
  const source = `import path from 'node:path';\nimport { fileURLToPath } from 'node:url';\nconst immutableRoot = ${JSON.stringify(executionNodeModules)};\nfunction inside(root, child) { const rel = path.relative(root, child); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); }\nexport async function resolve(specifier, context, nextResolve) { const resolved = await nextResolve(specifier, context); if (resolved.url.startsWith('node:')) return resolved; if (!resolved.url.startsWith('file:')) throw new Error('LCIM immutable Pi loader refused a non-file module resolution'); const file = fileURLToPath(resolved.url); if (!inside(immutableRoot, file)) throw new Error('LCIM immutable Pi loader refused module resolution outside the controller-owned execution copy'); return resolved; }\n`;
  fs.writeFileSync(loader, source, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  const fd = fs.openSync(loader, fs.constants.O_RDONLY);
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.chmodSync(loader, 0o444);
  return computeFileIdentity(loader);
}
function writeExecutionClosureManifest(executionRoot, closure) {
  const manifest = path.join(executionRoot, 'lcim-pi-closure-manifest.json');
  const record = {
    schemaName: 'lcim.pi-execution-closure-manifest',
    schemaVersion: '1.0.0',
    fileCount: closure.fileCount,
    closureSha256: closure.sha256,
    files: closure.files,
  };
  fs.writeFileSync(manifest, `${canonicalJson(record)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  const fd = fs.openSync(manifest, fs.constants.O_RDONLY);
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.chmodSync(manifest, 0o444);
  return computeFileIdentity(manifest);
}
function writeImmutableRequireGuard(executionRoot, executionNodeModules) {
  const guard = path.join(executionRoot, 'lcim-immutable-require-guard.cjs');
  const source = `'use strict';\nconst path = require('node:path');\nconst Module = require('node:module');\nconst immutableRoot = ${JSON.stringify(executionNodeModules)};\nfunction inside(root, child) { const rel = path.relative(root, child); return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel)); }\nconst original = Module._resolveFilename;\nModule._resolveFilename = function(request, parent, isMain, options) { const resolved = original.call(this, request, parent, isMain, options); if (typeof resolved === 'string' && path.isAbsolute(resolved) && !inside(immutableRoot, resolved)) throw new Error('LCIM immutable Pi require guard refused module resolution outside the controller-owned execution copy'); return resolved; };\n`;
  fs.writeFileSync(guard, source, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  const fd = fs.openSync(guard, fs.constants.O_RDONLY);
  try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.chmodSync(guard, 0o444);
  return computeFileIdentity(guard);
}
function expectedPiCommand(pi) {
  return pi?.executionLoader === undefined || pi.executionLoader === null
    ? [pi.node, pi.cli]
    : [pi.node, '--require', pi.executionRequireGuard, '--experimental-loader', pi.executionLoader, pi.cli];
}

export function materializePinnedPiExecution(pi, { storeDir } = {}) {
  if (pi?.nonAuthoritative === true) return pi;
  if (typeof storeDir !== 'string' || !path.isAbsolute(storeDir)) throw new ConfigError('Pi execution copy requires absolute controller-owned storeDir');
  assertPiExecutableUnchanged(pi);
  const executionRoot = path.join(storeDir, 'pi-runtime');
  const executionNodeModules = path.join(executionRoot, 'node_modules');
  if (fs.existsSync(executionRoot)) throw new ConfigError('controller-owned Pi execution copy path already exists');
  fs.mkdirSync(executionNodeModules, { recursive: true, mode: 0o700 });
  const canonicalExecutionRoot = fs.realpathSync(executionRoot);
  const canonicalExecutionNodeModules = fs.realpathSync(executionNodeModules);
  try {
    for (const { root } of pi.closure.roots) {
      const relative = path.relative(LCIM_NODE_MODULES, root);
      if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) throw new ConfigError('Pi closure root escaped LCIM node_modules during materialization');
      copyPackageWithoutNestedNodeModules(root, path.join(executionNodeModules, relative));
    }
    sealExecutionTree(executionNodeModules);
    fs.chmodSync(executionNodeModules, 0o555);
    const packageRoot = path.join(executionNodeModules, PI_PACKAGE_NAME);
    const verified = verifyPiCliPath(packageRoot + path.sep + PI_CLI_REL);
    if (!verified.ok) throw new ConfigError(`materialized Pi copy failed reviewed-layout verification: ${verified.reason}`);
    const closure = computePiDependencyClosure(packageRoot, { dependencyRoot: canonicalExecutionNodeModules });
    if (closure.sha256 !== pi.closure.sha256 || closure.fileCount !== pi.closure.fileCount) {
      throw new ConfigError('materialized Pi execution copy does not match the pinned dependency closure; refusing transitive-module substitution');
    }
    verifyExecutionCopyManifest(canonicalExecutionNodeModules, pi.closure.files);
    const executionManifestIdentity = writeExecutionClosureManifest(canonicalExecutionRoot, closure);
    const executionLoaderIdentity = writeImmutableResolutionLoader(canonicalExecutionRoot, canonicalExecutionNodeModules);
    const executionRequireGuardIdentity = writeImmutableRequireGuard(canonicalExecutionRoot, canonicalExecutionNodeModules);
    fs.chmodSync(canonicalExecutionRoot, 0o555);
    const sourcePi = pi;
    return freeze({
      node: pi.node,
      cli: verified.resolved,
      packageRoot,
      packageName: pi.packageName,
      packageVersion: pi.packageVersion,
      nodeIdentity: pi.nodeIdentity,
      cliIdentity: computeFileIdentity(verified.resolved),
      lockIdentity: pi.lockIdentity,
      manifestIdentity: pi.manifestIdentity,
      closure,
      resolvedFrom: 'controller-owned-immutable-execution-copy',
      nonAuthoritative: false,
      executionCopyRoot: canonicalExecutionRoot,
      executionNodeModules: canonicalExecutionNodeModules,
      executionManifest: executionManifestIdentity.realpath,
      executionManifestIdentity,
      executionLoader: executionLoaderIdentity.realpath,
      executionLoaderIdentity,
      executionRequireGuard: executionRequireGuardIdentity.realpath,
      executionRequireGuardIdentity,
      sourcePi,
    });
  } catch (error) {
    // A partially sealed copy can contain read-only nested directories.
    // Restore permissions recursively before removal; never leave a
    // credential-adjacent controller surface merely because construction
    // failed after sealing began.
    try {
      if (fs.existsSync(executionRoot)) {
        makeWritableForCleanup(executionRoot);
        fs.rmSync(executionRoot, { recursive: true, force: true });
        assertAbsent(executionRoot, 'partial Pi execution copy');
      }
    } catch { /* retain only on cleanup uncertainty; caller fails closed */ }
    throw error;
  }
}

/** Reverify node, CLI, package lock, package metadata, and every closure file. */
export function assertPiExecutableUnchanged(pi) {
  if (pi === null || typeof pi !== 'object' || typeof pi.nodeIdentity !== 'object' || typeof pi.cliIdentity !== 'object') {
    throw new ConfigError('a pinned Pi executable record is required');
  }
  assertIdentityUnchanged('node executable', pi.nodeIdentity);
  assertIdentityUnchanged('Pi CLI entrypoint', pi.cliIdentity);
  if (pi.nonAuthoritative === true) return true;
  if (pi.packageRoot === null || pi.closure === null || pi.lockIdentity === null || pi.manifestIdentity === null) throw new ConfigError('production Pi record is missing closure provenance');
  assertIdentityUnchanged('LCIM package-lock', pi.lockIdentity);
  assertIdentityUnchanged('LCIM package manifest', pi.manifestIdentity);
  const facts = readPackageFacts(pi.packageRoot);
  if (facts.name !== pi.packageName || facts.version !== pi.packageVersion) throw new ConfigError('Pi package identity changed since verification');
  const closure = computePiDependencyClosure(pi.packageRoot, {
    dependencyRoot: pi.executionNodeModules ?? LCIM_NODE_MODULES,
  });
  if (closure.sha256 !== pi.closure.sha256 || closure.fileCount !== pi.closure.fileCount) {
    throw new ConfigError('Pi executable dependency closure changed since verification; refusing transitive-module substitution');
  }
  if (pi.executionNodeModules !== undefined) {
    verifyExecutionCopyManifest(pi.executionNodeModules, pi.closure.files);
    if (typeof pi.executionManifest !== 'string' || typeof pi.executionManifestIdentity !== 'object'
      || typeof pi.executionLoader !== 'string' || typeof pi.executionLoaderIdentity !== 'object'
      || typeof pi.executionRequireGuard !== 'string' || typeof pi.executionRequireGuardIdentity !== 'object') {
      throw new ConfigError('immutable Pi execution copy is missing its pinned module-resolution guards');
    }
    if (!samePath(pi.executionCopyRoot, pi.executionManifest)
      || !samePath(pi.executionCopyRoot, pi.executionLoader)
      || !samePath(pi.executionCopyRoot, pi.executionRequireGuard)) {
      throw new ConfigError('immutable Pi module-resolution guard escaped the controller-owned execution copy');
    }
    assertIdentityUnchanged('immutable Pi closure manifest', pi.executionManifestIdentity);
    assertIdentityUnchanged('immutable Pi module-resolution loader', pi.executionLoaderIdentity);
    assertIdentityUnchanged('immutable Pi CommonJS require guard', pi.executionRequireGuardIdentity);
    let storedManifest;
    try { storedManifest = JSON.parse(fs.readFileSync(pi.executionManifest, 'utf8')); } catch { throw new ConfigError('immutable Pi closure manifest is unreadable'); }
    if (!Array.isArray(storedManifest?.files)
      || storedManifest?.fileCount !== pi.closure.fileCount
      || storedManifest?.closureSha256 !== pi.closure.sha256
      || canonicalJson(storedManifest.files) !== canonicalJson(pi.closure.files)) {
      throw new ConfigError('immutable Pi closure manifest does not bind the executed closure');
    }
    const expectedSupport = new Set(['node_modules', path.basename(pi.executionManifest), path.basename(pi.executionLoader), path.basename(pi.executionRequireGuard)]);
    const actualSupport = fs.readdirSync(pi.executionCopyRoot);
    if (actualSupport.length !== expectedSupport.size || actualSupport.some((entry) => !expectedSupport.has(entry))) {
      throw new ConfigError('immutable Pi execution copy contains an extra support/executable file');
    }
  }
  return true;
}

export function loadSolSystemPrompt() {
  const file = path.resolve(HERE, '../../prompts/sol/system.system.md');
  try { return fs.readFileSync(file, 'utf8'); } catch (error) {
    throw new ConfigError(`cannot load controller-pinned SOL system prompt: ${error.message}`);
  }
}

export function buildCodexSolCommand({ pi, systemPrompt, reasoning = 'XHIGH' } = {}) {
  if (pi === null || typeof pi !== 'object' || typeof pi.node !== 'string' || typeof pi.cli !== 'string') throw new ConfigError('buildCodexSolCommand requires pinned Pi');
  if (typeof systemPrompt !== 'string' || systemPrompt.length === 0) throw new ConfigError('buildCodexSolCommand requires controller-pinned system prompt');
  if (reasoning !== 'XHIGH') throw new ConfigError('GPT-5.6 Sol transport permits XHIGH reasoning only');
  return freeze({
    command: freeze(expectedPiCommand(pi)),
    args: freeze([
      '--provider', CODEX_OAUTH_PROVIDER,
      '--model', CODEX_SOL_MODEL,
      '--thinking', 'xhigh',
      '--print', '--no-session', '--no-context-files', '--no-extensions',
      '--no-skills', '--no-prompt-templates', '--no-tools', '--no-approve',
      '--system-prompt', systemPrompt,
    ]),
    timeoutMs: DEFAULT_TIMEOUT_MS,
  });
}

function piIdentityDigest(pi) {
  return sha256(canonicalJson({
    node: pi?.nodeIdentity?.sha256 ?? null,
    cli: pi?.cliIdentity?.sha256 ?? null,
    packageName: pi?.packageName ?? null,
    packageVersion: pi?.packageVersion ?? null,
    closure: pi?.closure?.sha256 ?? null,
    packageLock: pi?.lockIdentity?.sha256 ?? null,
    packageManifest: pi?.manifestIdentity?.sha256 ?? null,
    executionManifest: pi?.executionManifestIdentity?.sha256 ?? null,
    executionLoader: pi?.executionLoaderIdentity?.sha256 ?? null,
    executionRequireGuard: pi?.executionRequireGuardIdentity?.sha256 ?? null,
    nonAuthoritative: pi?.nonAuthoritative === true,
  }));
}
function markerPath(dir) { return path.join(dir, TRANSPORT_MARKER_FILE); }
function fsyncDirectory(dir) {
  let fd;
  try {
    fd = fs.openSync(dir, fs.constants.O_RDONLY);
    fs.fsyncSync(fd);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
/**
 * Sixth-review rule (marker durability): create every MISSING ancestor
 * directory of `dir` top-down, fsyncing each new directory and its parent
 * immediately, so a crash can never leave credential bytes in a directory
 * chain whose entries were not durable. Existing directories are verified
 * but not rewritten.
 */
function mkdirParentsFsynced(dir) {
  const missing = [];
  let cursor = dir;
  for (;;) {
    try {
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new LcimError('durable transport ancestor is not a regular directory', 'SOL_TRANSPORT_SURFACE_VIOLATION', { path: cursor });
      }
      break;
    } catch (error) {
      if (error instanceof LcimError) throw error;
      if (error?.code !== 'ENOENT') throw error;
      missing.unshift(cursor);
      const parent = path.dirname(cursor);
      if (parent === cursor) throw new LcimError('no existing ancestor for durable transport directory', 'SOL_TRANSPORT_SURFACE_VIOLATION', { path: dir });
      cursor = parent;
    }
  }
  // Creating a directory is made durable by fsyncing BOTH the new
  // directory and the parent that contains its new directory entry. Do
  // this top-down so every ancestor is durable before any descendant — and
  // therefore before any credential byte — can be created.
  for (const target of missing) {
    fs.mkdirSync(target, { mode: 0o700 });
    fsyncDirectory(target);
    fsyncDirectory(path.dirname(target));
  }
  return missing;
}
function writeDurableMarker(file, record) {
  let fd;
  try {
    fd = fs.openSync(file, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(record)}\n`, { encoding: 'utf8' });
    fs.fsyncSync(fd);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}
function canonicalDirectory(dir, label) {
  const stat = safeLstat(dir, label);
  if (!stat.isDirectory()) throw new ConfigError(`${label} is not a directory: ${dir}`);
  return fs.realpathSync(dir);
}

/**
 * Write one durable transport marker.
 *
 * Fifth-review rule: the durable STORE marker lives OUTSIDE the credential
 * subtree (in <sol-root>/markers/<runId>.json) so a crash during recursive
 * credential-subtree removal can never leave credential bytes without a
 * marker. Invocation markers (no credential material) stay inside their
 * own invocation root. Marker-before-credential ordering is preserved:
 * the marker is durably written before any OAuth byte exists.
 */
function writeTransportMarker(targetDir, { kind, runId, invocationId, invocationMarker, pi, credentialPath = null, runDir = null } = {}) {
  if (!isValidId('run', runId) || !isValidId('invocation', invocationId)) throw new ConfigError('transport markers require canonical runId and invocationId');
  if (typeof invocationMarker !== 'string' || invocationMarker.length < 12) throw new ConfigError('transport markers require an invocation marker');
  if (kind !== 'sol-transport-store' && kind !== 'sol-transport-invocation') throw new ConfigError('unknown transport marker kind');
  const canonicalPath = canonicalDirectory(targetDir, 'transport marker directory');
  const record = {
    schemaName: SOL_TRANSPORT_SCHEMA_NAME,
    schemaVersion: SOL_TRANSPORT_SCHEMA_VERSION,
    kind,
    runId,
    invocationId,
    invocationMarker,
    canonicalPath,
    ...(credentialPath === null ? {} : { credentialPath }),
    transportIdentity: piIdentityDigest(pi),
    nodeIdentitySha256: pi?.nodeIdentity?.sha256 ?? null,
    cliIdentitySha256: pi?.cliIdentity?.sha256 ?? null,
    closureIdentitySha256: pi?.closure?.sha256 ?? null,
    createdAt: new Date().toISOString(),
  };
  let file;
  if (kind === 'sol-transport-store') {
    // Durable marker OUTSIDE the credential subtree: a crash during
    // recursive credential removal can never orphan credential bytes.
    if (typeof runDir !== 'string' || runDir.length === 0) throw new ConfigError('store markers require the owning runDir');
    const markersDir = transportMarkersDir(runDir);
    // Sixth-review rule: create + fsync EVERY new ancestor directory
    // BEFORE the marker file (and therefore before any credential byte).
    mkdirParentsFsynced(markersDir);
    file = storeMarkerPathOf(runDir, runId);
    if (fs.existsSync(file)) throw new LcimError('durable store marker already exists; refusing to overwrite it', 'SOL_TRANSPORT_SURFACE_VIOLATION', { path: file });
  } else {
    file = markerPath(canonicalPath);
  }
  // Durable marker-before-credential ordering: a crash after this point is
  // recoverable without guessing which directory may contain OAuth bytes.
  // The marker file itself is fsynced (writeDurableMarker) and its parent
  // directory is fsynced here — only then may credential bytes exist.
  writeDurableMarker(file, record);
  fsyncDirectory(path.dirname(file));
  return freeze(record);
}
function readTransportMarker(file) {
  try {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) return null;
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}
function validateTransportMarker(dir, { kind = null, runId = null, invocationId = null, pi = null, markerFile = null, requireSurface = true } = {}) {
  // For a marker-only leftover (crash between subtree removal and marker
  // removal) the surface directory no longer exists; canonicalize through
  // the nearest existing ancestor so the /var vs /private aliasing on
  // macOS cannot defeat the binding.
  const canonicalPath = requireSurface
    ? canonicalDirectory(dir, 'transport surface')
    : (() => {
      try { return fs.realpathSync(dir); } catch {
        return path.join(fs.realpathSync(path.dirname(dir)), path.basename(dir));
      }
    })();
  const file = markerFile === null || markerFile === undefined ? markerPath(canonicalPath) : markerFile;
  const marker = readTransportMarker(file);
  if (marker === null || marker.schemaName !== SOL_TRANSPORT_SCHEMA_NAME || marker.schemaVersion !== SOL_TRANSPORT_SCHEMA_VERSION
    || (kind !== null && marker.kind !== kind) || !isValidId('run', marker.runId) || !isValidId('invocation', marker.invocationId)
    || typeof marker.invocationMarker !== 'string' || marker.invocationMarker.length < 12
    || typeof marker.transportIdentity !== 'string' || !/^[0-9a-f]{64}$/.test(marker.transportIdentity)
    || typeof marker.nodeIdentitySha256 !== 'string' || !/^[0-9a-f]{64}$/.test(marker.nodeIdentitySha256)
    || typeof marker.cliIdentitySha256 !== 'string' || !/^[0-9a-f]{64}$/.test(marker.cliIdentitySha256)
    || (marker.closureIdentitySha256 !== null && (typeof marker.closureIdentitySha256 !== 'string' || !/^[0-9a-f]{64}$/.test(marker.closureIdentitySha256)))
    || marker.canonicalPath !== canonicalPath) {
    throw new LcimError('controller-owned SOL transport marker is missing, malformed, or does not bind its canonical surface; refusing the surface', 'SOL_TRANSPORT_SURFACE_VIOLATION', { path: canonicalPath });
  }
  if (runId !== null && marker.runId !== runId) throw new LcimError('SOL transport marker run binding mismatch', 'SOL_TRANSPORT_SURFACE_VIOLATION');
  if (invocationId !== null && marker.invocationId !== invocationId) throw new LcimError('SOL transport marker invocation binding mismatch', 'SOL_TRANSPORT_SURFACE_VIOLATION');
  if (pi !== null && (marker.transportIdentity !== piIdentityDigest(pi)
    || marker.nodeIdentitySha256 !== pi?.nodeIdentity?.sha256
    || marker.cliIdentitySha256 !== pi?.cliIdentity?.sha256
    || marker.closureIdentitySha256 !== (pi?.closure?.sha256 ?? null))) {
    throw new LcimError('SOL transport marker transport-identity mismatch', 'SOL_TRANSPORT_SURFACE_VIOLATION');
  }
  if (marker.kind === 'sol-transport-store') {
    const expectedCredential = path.join(canonicalPath, 'agent', PI_AUTH_FILE);
    if (marker.credentialPath !== expectedCredential) throw new LcimError('SOL store marker credential-path binding mismatch', 'SOL_TRANSPORT_SURFACE_VIOLATION');
    if (markerFile === null || markerFile === undefined) throw new LcimError('SOL store markers must be validated at their durable external path', 'SOL_TRANSPORT_SURFACE_VIOLATION');
  }
  return freeze({ ...marker });
}

function cloneEntry(entry) { return snapshotJson(entry, 'OAuth entry'); }
function assertCanaryValue(value, label, { required = false } = {}) {
  if (value === null || value === undefined) {
    if (required) throw new LcimError(`${label} is unavailable`, 'CODEX_OAUTH_UNAVAILABLE', { provider: CODEX_OAUTH_PROVIDER });
    return null;
  }
  if (typeof value !== 'string' || value.length < MIN_CANARY_CREDENTIAL_LENGTH || normalizedAlnum(value).length < MIN_CANARY_CREDENTIAL_LENGTH) {
    throw new LcimError('openai-codex credential is too short for safe controller leak detection; SOL transport is unavailable (fail closed) (RE-AUTHENTICATION REQUIRED — LCIM treats the real Pi auth store as read-only input authority and never modifies it; re-authenticate with `pi /login` and retry)', 'CODEX_OAUTH_UNAVAILABLE', { provider: CODEX_OAUTH_PROVIDER });
  }
  return value;
}
function normalizeOAuthEntry(entry, label = 'OAuth entry') {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new LcimError(`${label} is not a usable openai-codex oauth entry`, 'CODEX_OAUTH_UNAVAILABLE', { provider: CODEX_OAUTH_PROVIDER });
  }
  // Clone before inspecting fields so a getter-backed auth object is never
  // evaluated as controller authority.
  let copied;
  try { copied = cloneEntry(entry); } catch {
    throw new LcimError(`${label} is not a usable openai-codex oauth entry`, 'CODEX_OAUTH_UNAVAILABLE', { provider: CODEX_OAUTH_PROVIDER });
  }
  if (copied.type !== 'oauth') {
    throw new LcimError(`${label} is not a usable openai-codex oauth entry`, 'CODEX_OAUTH_UNAVAILABLE', { provider: CODEX_OAUTH_PROVIDER });
  }
  // Match the reviewed Pi OAuth storage contract. A partial entry cannot be
  // allowed through merely because Pi might later fail while holding the
  // copied credential surface.
  assertCanaryValue(copied.access, `${label}.access`, { required: true });
  assertCanaryValue(copied.refresh, `${label}.refresh`, { required: true });
  if (!Number.isFinite(copied.expires)) {
    throw new LcimError(`${label}.expires is unavailable`, 'CODEX_OAUTH_UNAVAILABLE', { provider: CODEX_OAUTH_PROVIDER });
  }
  return freeze(copied);
}
function strictReadRealAuth(env) {
  const agentDir = resolvePiAgentDir({ env });
  const authFile = path.join(agentDir, PI_AUTH_FILE);
  let pathStat;
  try { pathStat = fs.lstatSync(authFile); } catch {
    throw new LcimError('GPT-5.6 Sol codex transport is unavailable: real Pi auth.json is missing (RE-AUTHENTICATION REQUIRED — the real Pi auth store is read-only input authority and was not modified by LCIM; run `pi /login` selecting ChatGPT Plus/Pro Codex and retry)', 'CODEX_OAUTH_UNAVAILABLE', { provider: CODEX_OAUTH_PROVIDER });
  }
  if (pathStat.isSymbolicLink() || !pathStat.isFile()) throw new LcimError('GPT-5.6 Sol codex transport is unavailable: real Pi auth.json is not a regular file (RE-AUTHENTICATION REQUIRED — LCIM never modifies the real store; restore the Pi auth file and retry)', 'CODEX_OAUTH_UNAVAILABLE', { provider: CODEX_OAUTH_PROVIDER });
  let realpath;
  let fd;
  let fdStat;
  let rawBytes;
  try {
    realpath = fs.realpathSync(authFile);
    fd = fs.openSync(realpath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    fdStat = fs.fstatSync(fd);
    if (!fdStat.isFile() || fdStat.dev !== pathStat.dev || fdStat.ino !== pathStat.ino) throw new Error('auth path identity changed during read');
    rawBytes = fs.readFileSync(fd);
    const after = fs.lstatSync(authFile);
    if (after.isSymbolicLink() || !after.isFile() || after.dev !== fdStat.dev || after.ino !== fdStat.ino
      || fs.realpathSync(authFile) !== realpath) throw new Error('auth path identity changed during read');
  } catch {
    throw new LcimError('GPT-5.6 Sol codex transport is unavailable: real Pi auth.json identity could not be held for a read-only snapshot (RE-AUTHENTICATION REQUIRED — LCIM did not modify it; close concurrent auth updates, run `pi /login` if needed, and retry)', 'CODEX_OAUTH_UNAVAILABLE', { provider: CODEX_OAUTH_PROVIDER });
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  let store;
  try { store = JSON.parse(rawBytes.toString('utf8')); } catch {
    throw new LcimError('GPT-5.6 Sol codex transport is unavailable: real Pi auth.json is corrupt and will not be repaired (RE-AUTHENTICATION REQUIRED — LCIM treats the real Pi auth store as read-only input authority and never repairs or rewrites it; re-authenticate with `pi /login` and retry)', 'CODEX_OAUTH_UNAVAILABLE', { provider: CODEX_OAUTH_PROVIDER });
  }
  if (store === null || typeof store !== 'object' || Array.isArray(store)) throw new LcimError('GPT-5.6 Sol codex transport is unavailable: real Pi auth.json is corrupt and will not be repaired (RE-AUTHENTICATION REQUIRED — LCIM treats the real Pi auth store as read-only input authority and never repairs or rewrites it; re-authenticate with `pi /login` and retry)', 'CODEX_OAUTH_UNAVAILABLE', { provider: CODEX_OAUTH_PROVIDER });
  const entry = normalizeOAuthEntry(store[CODEX_OAUTH_PROVIDER], 'real openai-codex entry');
  // Sixth-review rule: one no-follow read-only descriptor supplies BOTH the
  // credential entry and the path/inode/byte snapshot. No LCIM code path
  // opens the real store writable.
  return freeze({
    authFile: realpath,
    entry,
    entryCanonical: canonicalJson(entry),
    identity: freeze({ dev: fdStat.dev, ino: fdStat.ino }),
    bytesSha256: crypto.createHash('sha256').update(rawBytes).digest('hex'),
    byteLength: rawBytes.length,
  });
}
function readIsolatedCodexEntry(agentDir) {
  const authFile = path.join(agentDir, PI_AUTH_FILE);
  try {
    const stat = fs.lstatSync(authFile);
    if (stat.isSymbolicLink() || !stat.isFile()) return { ok: false, reason: 'auth-file-not-regular' };
    if ((stat.mode & 0o777) !== 0o600) return { ok: false, reason: 'auth-file-mode' };
    const parsed = JSON.parse(fs.readFileSync(authFile, 'utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, reason: 'auth-store-invalid' };
    if (Object.keys(parsed).length !== 1 || !Object.hasOwn(parsed, CODEX_OAUTH_PROVIDER)) return { ok: false, reason: 'auth-provider-set-invalid' };
    return { ok: true, entry: normalizeOAuthEntry(parsed[CODEX_OAUTH_PROVIDER], 'isolated openai-codex entry') };
  } catch (error) {
    if (error?.code === 'CODEX_OAUTH_UNAVAILABLE') return { ok: false, reason: 'auth-entry-unusable' };
    return { ok: false, reason: 'auth-file-unreadable' };
  }
}
function addSensitiveValues(set, entry) {
  // OAuthCredential permits provider-specific extension fields. Treat every
  // string carried by the copied credential object as sensitive rather than
  // assuming only access/refresh can contain bearer material.
  const walk = (value, key = '') => {
    if (typeof value === 'string') {
      if (key !== 'type' && value.length > 0) set.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
    } else if (value !== null && typeof value === 'object') {
      for (const [childKey, child] of Object.entries(value)) walk(child, childKey);
    }
  };
  walk(entry);
}

/** Acquire one retained run-scoped isolated auth store. */
export async function acquireCodexSolStore({ runDir, runId, invocationId, invocationMarker, pi, env = process.env, testAuthority = null, forceNonAuthoritative = false } = {}) {
  if (typeof runDir !== 'string' || !path.isAbsolute(runDir)) throw new ConfigError('sol transport requires an absolute runDir');
  if (!isValidId('run', runId) || !isValidId('invocation', invocationId)) throw new ConfigError('sol transport store requires canonical runId and invocationId');
  if (pi === null || typeof pi !== 'object') throw new ConfigError('sol transport store requires pinned Pi');
  const nonAuthoritative = pi.nonAuthoritative === true || isSolTestRunAuthority(testAuthority) || forceNonAuthoritative === true;
  if (pi.nonAuthoritative === true && !isSolTestRunAuthority(testAuthority)) throw new ConfigError('fixture Pi requires opaque node:test run authority');
  let transportPi = pi;
  const root = path.join(runDir, 'controller', 'sol-transport');
  const storeDir = path.join(root, 'store');
  const agentDir = path.join(storeDir, 'agent');
  const authFile = path.join(agentDir, PI_AUTH_FILE);
  const lexicalStoreKey = path.resolve(storeDir);
  const storeMarker = storeMarkerPathOf(runDir, runId);
  // Fifth-review rule: creation/acquisition of a Codex transport surface
  // is serialized under the same authoritative run lifecycle lock as
  // finalize/abort/recovery terminalization and cleanup/sweep, and the
  // authoritative run.json lifecycleState must still be OPEN (checked
  // under the run-dir lock, the same serialization boundary the
  // terminalization sweep+write holds). A run never transitions terminal
  // while a new marked transport surface can appear concurrently.
  return withSolTransportRunLock(runDir, () => {
    assertRunLifecycleOpen(runDir);
    const existingStoreKey = fs.existsSync(storeDir) ? fs.realpathSync(storeDir) : lexicalStoreKey;
    if (retiredSolStoreKeys.has(existingStoreKey) || retiredSolStoreKeys.has(lexicalStoreKey)) {
      throw new LcimError('run-scoped SOL store was already retired for this run; refusing OAuth state recreation', 'SOL_TRANSPORT_SURFACE_VIOLATION');
    }
    const retained = retainedSolStores.get(existingStoreKey);
    if (retained !== undefined) {
      if (retained.runId !== runId || retained.isRemoved()) {
        throw new LcimError('run-scoped SOL store handle is no longer reusable; refusing state reconstruction', 'SOL_TRANSPORT_SURFACE_VIOLATION');
      }
      validateTransportMarker(storeDir, { kind: 'sol-transport-store', runId, pi: retained.pi, markerFile: storeMarker });
      return retained;
    }
    // A store left by another process/crash has no in-memory original/current
    // state. Never rebuild that authority from live auth.json; recovery owns
    // its deletion and a new run owns a new store.
    if (fs.existsSync(storeDir)) {
      throw new LcimError('existing run-scoped SOL store has no retained controller state; refusing OAuth state reacquisition', 'SOL_TRANSPORT_SURFACE_VIOLATION');
    }
    let entry;
    let originalReal = null;
    {
      // Marker first: if the controller crashes at any later byte write,
      // recovery has a bound run/invocation/path/transport identity. The
      // durable store marker lives OUTSIDE the credential subtree, so a
      // crash during recursive credential removal can never orphan
      // credential bytes.
      // Sixth-review rule (marker durability): every new ancestor
      // directory is created AND fsynced before the marker file, and the
      // marker (file fsync + parent fsync) precedes any credential byte.
      mkdirParentsFsynced(storeDir);
      // Production executes an immutable controller-owned copy of the exact
      // hashed dependency closure. The marker is still written before any
      // credential bytes, and binds this execution identity.
      if (pi.nonAuthoritative !== true) transportPi = materializePinnedPiExecution(pi, { storeDir });
      writeTransportMarker(storeDir, {
        kind: 'sol-transport-store', runId, invocationId, invocationMarker, pi: transportPi, runDir,
        credentialPath: path.join(fs.realpathSync(storeDir), 'agent', PI_AUTH_FILE),
      });
      validateTransportMarker(storeDir, { kind: 'sol-transport-store', runId, invocationId, pi: transportPi, markerFile: storeMarker });
      try {
        originalReal = strictReadRealAuth(env);
        entry = originalReal.entry;
        // Sixth-review rule: the agent directory chain is created + fsynced
        // before the credential file is written (marker already durable).
        mkdirParentsFsynced(agentDir);
        fs.writeFileSync(authFile, `${JSON.stringify({ [CODEX_OAUTH_PROVIDER]: entry })}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        fs.chmodSync(authFile, 0o600);
      } catch (error) {
        // If credential bytes may have reached the new isolated file, remove
        // them synchronously rather than relying on a later run finalizer
        // that cannot receive a store handle from this failed constructor.
        // A crash between marker creation and this catch is still recoverable
        // because the marker was written first (and lives outside the
        // subtree, so this removal cannot orphan the marker semantics).
        try {
          if (fs.existsSync(storeDir)) {
            makeWritableForCleanup(storeDir);
            fs.rmSync(storeDir, { recursive: true, force: false });
            assertAbsent(storeDir, 'partially constructed SOL credential store');
            fsyncDirectory(root);
          }
          if (fs.existsSync(storeMarker)) {
            fs.rmSync(storeMarker, { force: false });
            assertAbsent(storeMarker, 'partially constructed SOL store marker');
            fsyncDirectory(transportMarkersDir(runDir));
          }
        } catch (cleanupError) {
          throw new LcimError('partially constructed SOL credential store could not be removed; refusing to continue', SOL_TRANSPORT_CLEANUP_FAILED, { cause: cleanupError?.message ?? String(cleanupError) });
        }
        throw error;
      }
    }
    const baselineEntry = freeze(cloneEntry(entry));
    const sensitive = new Set();
    addSensitiveValues(sensitive, entry);
    let leakObserved = false;
    let removed = false;
    const retainedStoreKey = fs.realpathSync(storeDir);
    const transports = new Set();
    const oauthFacts = freeze({
      provider: CODEX_OAUTH_PROVIDER,
      type: entry.type,
      hasAccessToken: true,
      expiresAt: typeof entry.expires === 'number' ? entry.expires : null,
    });
    const store = {
      schemaName: SOL_TRANSPORT_SCHEMA_NAME,
      schemaVersion: SOL_TRANSPORT_SCHEMA_VERSION,
      kind: 'lcim.sol-transport-store',
      runId,
      runDir: fs.realpathSync(runDir),
      storeDir: fs.realpathSync(storeDir),
      agentDir: fs.realpathSync(agentDir),
      authFile: fs.realpathSync(authFile),
      realAuthPath: originalReal.authFile,
      realAuthBytesSha256: originalReal.bytesSha256,
      pi: freeze({ ...transportPi }),
      nonAuthoritative,
      oauthFacts,
      // Sixth-review rule: the real Pi auth store is READ-ONLY input
      // authority — LCIM never writes a refreshed token back. Both
      // baselines are retained for the full run so within-run rotation is
      // observed (SOL_RECHECK continuity) without any write-back path.
      entry: () => entry,
      currentOpenAiCodexEntry: () => entry,
      originalEntry: () => baselineEntry,
      originalOpenAiCodexEntry: () => baselineEntry,
      realAuthIdentity: () => originalReal.identity,
      realAuthSnapshot: () => freeze({
        path: originalReal.authFile,
        identity: originalReal.identity,
        bytesSha256: originalReal.bytesSha256,
        byteLength: originalReal.byteLength,
      }),
      // READ-ONLY verification: the real store must be byte-identical to
      // the acquisition snapshot. This is the guard that proves no LCIM
      // execution path ever mutated real Pi credentials. An external
      // concurrent Pi refresh is reported (changed=true), never repaired.
      verifyRealAuthSourceUnchanged() {
        let stat;
        try { stat = fs.lstatSync(originalReal.authFile); } catch {
          return freeze({ ok: false, changed: true, reason: 'missing', observed: null });
        }
        if (stat.isSymbolicLink() || !stat.isFile()) {
          return freeze({ ok: false, changed: true, reason: 'not-regular-file', observed: null });
        }
        let realpath;
        try { realpath = fs.realpathSync(originalReal.authFile); } catch {
          return freeze({ ok: false, changed: true, reason: 'unresolvable', observed: null });
        }
        if (realpath !== originalReal.authFile) {
          return freeze({ ok: false, changed: true, reason: 'path-substituted', observed: null });
        }
        const nowStat = fs.statSync(realpath);
        if (nowStat.dev !== originalReal.identity.dev || nowStat.ino !== originalReal.identity.ino) {
          return freeze({ ok: false, changed: true, reason: 'inode-substituted', observed: null });
        }
        let nowBytes;
        try { nowBytes = fs.readFileSync(realpath); } catch {
          return freeze({ ok: false, changed: true, reason: 'unreadable', observed: null });
        }
        const nowSha = crypto.createHash('sha256').update(nowBytes).digest('hex');
        if (nowSha !== originalReal.bytesSha256 || nowBytes.length !== originalReal.byteLength) {
          return freeze({ ok: false, changed: true, reason: 'bytes-changed', observed: null });
        }
        return freeze({ ok: true, changed: false, reason: null, observed: freeze({ path: realpath, bytesSha256: nowSha, byteLength: nowBytes.length }) });
      },
      sensitiveValues: () => freeze([...sensitive]),
      leakObserved: () => leakObserved,
      markLeak() { leakObserved = true; },
      refreshFromDisk() {
        // Sixth-review rule: refresh/rotation is observed ONLY inside the
        // run-scoped isolated store; the real store is never consulted or
        // written here.
        const loaded = readIsolatedCodexEntry(agentDir);
        if (!loaded.ok) return freeze({ ok: false, reason: loaded.reason, changed: false, changedThisReload: false });
        const nextCanonical = canonicalJson(loaded.entry);
        const changedThisReload = nextCanonical !== canonicalJson(entry);
        if (changedThisReload) {
          entry = loaded.entry;
          addSensitiveValues(sensitive, entry);
        }
        return freeze({ ok: true, changed: changedThisReload, changedThisReload, entry });
      },
      registerTransport(transport) { transports.add(transport); },
      removeTransport(transport) { transports.delete(transport); },
      async remove() {
        if (removed) return;
        return withSolTransportRunLock(runDir, async () => {
          if (removed) return;
          for (const transport of [...transports]) {
            if (typeof transport.canBeRemoved !== 'function' || !transport.canBeRemoved()) {
              throw new LcimError('run-scoped SOL store cannot be removed before every spawned transport process has proven absence and its invocation surface is removed', SOL_TRANSPORT_CLEANUP_FAILED);
            }
            if (typeof transport.isRemoved !== 'function' || !transport.isRemoved()) {
              // An unspawned transport has no process lifetime to retain; an
              // already-proven-absent transport may likewise be removed here.
              // Never bypass transport.remove(), which validates its marker and
              // observed nonexistence before unregistering itself.
              await transport.remove();
            }
            if (typeof transport.isRemoved !== 'function' || !transport.isRemoved()) {
              throw new LcimError('run-scoped SOL store cannot be removed before every spawned transport process has proven absence and its invocation surface is removed', SOL_TRANSPORT_CLEANUP_FAILED);
            }
          }
          validateTransportMarker(storeDir, { kind: 'sol-transport-store', runId, pi: transportPi, markerFile: storeMarker });
          // Fifth-review cleanup order (durable external marker):
          // 1. every spawned transport process already proved absence above;
          // 2. delete the credential/auth/model-store subtree;
          // 3. fsync the parent and verify subtree absence;
          // 4. ONLY THEN remove the durable external marker;
          // 5. fsync the marker parent.
          // A crash at any earlier point leaves the marker present so
          // recovery re-runs the removal.
          makeWritableForCleanup(storeDir);
          fs.rmSync(storeDir, { recursive: true, force: false });
          assertAbsent(storeDir, 'run-scoped SOL credential store');
          fsyncDirectory(root);
          if (fs.existsSync(storeMarker)) {
            fs.rmSync(storeMarker, { force: false });
            assertAbsent(storeMarker, 'run-scoped SOL store marker');
          }
          fsyncDirectory(transportMarkersDir(runDir));
          removed = true;
          retainedSolStores.delete(retainedStoreKey);
          retiredSolStoreKeys.add(retainedStoreKey);
          retiredSolStoreKeys.add(path.resolve(storeDir));
        });
      },
      isRemoved: () => removed,
    };
    const frozenStore = freeze(store);
    retainedSolStores.set(retainedStoreKey, frozenStore);
    return frozenStore;
  });
}

/** Prepare one isolated invocation surface over the retained store. */
export async function prepareCodexSolInvocation({ runDir, store, invocationId, invocationMarker, systemPrompt, env = process.env } = {}) {
  if (typeof runDir !== 'string' || !path.isAbsolute(runDir)) throw new ConfigError('sol transport requires an absolute runDir');
  if (store === null || typeof store !== 'object' || store.kind !== 'lcim.sol-transport-store') throw new ConfigError('sol transport requires a retained run-scoped store');
  if (!isValidId('invocation', invocationId)) throw new ConfigError('sol transport requires canonical invocationId');
  if (typeof invocationMarker !== 'string' || invocationMarker.length < 12) throw new ConfigError('sol transport requires invocation marker');
  if (typeof systemPrompt !== 'string' || systemPrompt.length === 0) throw new ConfigError('sol transport requires controller-pinned system prompt');
  const root = path.join(runDir, 'controller', 'sol-transport', 'invocations', invocationId);
  // Fifth-review rule: marked transport registration is serialized under
  // the same authoritative run lifecycle lock; a terminal run can never
  // gain a new marked transport surface.
  return withSolTransportRunLock(runDir, () => {
    assertRunLifecycleOpen(runDir);
    // Sixth-review rule: every new ancestor directory is created + fsynced
    // before the invocation marker file.
    mkdirParentsFsynced(root);
    writeTransportMarker(root, { kind: 'sol-transport-invocation', runId: store.runId, invocationId, invocationMarker, pi: store.pi });
    validateTransportMarker(root, { kind: 'sol-transport-invocation', runId: store.runId, invocationId, pi: store.pi });
    const cwd = path.join(root, 'cwd');
    const home = path.join(root, 'home');
    const tmp = path.join(root, 'tmp');
    for (const dir of [cwd, home, tmp]) {
      mkdirParentsFsynced(dir);
      fsyncDirectory(dir);
    }
    let spawned = false;
    let processAbsent = false;
    let removed = false;
    const transport = {
      schemaName: SOL_TRANSPORT_SCHEMA_NAME,
      schemaVersion: SOL_TRANSPORT_SCHEMA_VERSION,
      kind: 'lcim.sol-transport-invocation',
      runId: store.runId,
      invocationId,
      root: fs.realpathSync(root),
      agentDir: store.agentDir,
      authFile: store.authFile,
      cwd: fs.realpathSync(cwd),
      home: fs.realpathSync(home),
      tmp: fs.realpathSync(tmp),
      env: buildSolTransportEnv({ agentDir: store.agentDir, cwd: fs.realpathSync(cwd), home: fs.realpathSync(home), tmp: fs.realpathSync(tmp), invocationMarker, env }),
      pi: store.pi,
      systemPrompt,
      oauthFacts: store.oauthFacts,
      nonAuthoritative: store.nonAuthoritative,
      credentials: freeze({ access: store.entry()?.access ?? null, refresh: store.entry()?.refresh ?? null }),
      sensitiveValues: store.sensitiveValues,
      markProcessSpawned() { spawned = true; },
      confirmProcessAbsence() { processAbsent = true; },
      canBeRemoved: () => !spawned || processAbsent,
      async remove() {
        if (removed) return;
        return withSolTransportRunLock(runDir, () => {
          if (removed) return;
          if (spawned && !processAbsent) throw new LcimError('SOL invocation process absence has not been positively verified; credential surface is retained for recovery', SOL_TRANSPORT_CLEANUP_FAILED);
          validateTransportMarker(root, { kind: 'sol-transport-invocation', runId: store.runId, invocationId, pi: store.pi });
          fs.rmSync(root, { recursive: true, force: false });
          assertAbsent(root, 'SOL invocation surface');
          removed = true;
          store.removeTransport(transport);
        });
      },
      isRemoved: () => removed,
    };
    store.registerTransport(transport);
    return freeze(transport);
  });
}

export const CREDENTIAL_LEAK_MIN_FULL_LENGTH = MIN_CANARY_CREDENTIAL_LENGTH;
export const CREDENTIAL_LEAK_MIN_FRAGMENT_LENGTH = 6;
function normalizedAlnum(value) { return String(value).replace(/[^A-Za-z0-9]/g, ''); }
function normalizedUrl(value) {
  // Percent escape hex is case-insensitive; unescaped characters retain case.
  return String(value).replace(/%([0-9a-fA-F]{2})/g, (_, h) => `%${h.toUpperCase()}`).replace(/[^A-Za-z0-9%]/g, '');
}
function unicodeEscaped(value) {
  let out = '';
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    const ch = value[i];
    out += code >= 0x20 && code <= 0x7e ? ch : `\\u${code.toString(16).padStart(4, '0')}`;
  }
  return out;
}
function asciiByteUnicodeEscaped(value) {
  // Adversarial JSON serializers may escape every ASCII byte, not only
  // non-ASCII code points: `token` -> `\\u0074\\u006f...`.
  return [...Buffer.from(value, 'utf8')]
    .map((byte) => `\\u00${byte.toString(16).padStart(2, '0')}`)
    .join('');
}
function encodedNeedles(value) {
  const bytes = Buffer.from(value, 'utf8');
  const base64 = bytes.toString('base64');
  const base64url = base64.replaceAll('+', '-').replaceAll('/', '_');
  const json = JSON.stringify(value).slice(1, -1);
  return [
    { value, normalizer: normalizedAlnum, caseInsensitive: false },
    { value: json, normalizer: normalizedAlnum, caseInsensitive: false },
    { value: unicodeEscaped(value), normalizer: normalizedAlnum, caseInsensitive: true },
    { value: asciiByteUnicodeEscaped(value), normalizer: normalizedAlnum, caseInsensitive: true },
    { value: base64, normalizer: normalizedAlnum, caseInsensitive: false },
    { value: base64url, normalizer: normalizedAlnum, caseInsensitive: false },
    { value: base64url.replace(/=+$/, ''), normalizer: normalizedAlnum, caseInsensitive: false },
    { value: bytes.toString('hex'), normalizer: normalizedAlnum, caseInsensitive: true },
    { value: encodeURIComponent(value), normalizer: normalizedUrl, caseInsensitive: false },
    // A second URL canonicalization intentionally lower-cases only for
    // leak detection. It catches mixed-case/split percent escapes while
    // still requiring a full form or multiple dispersed windows.
    { value: encodeURIComponent(value), normalizer: normalizedAlnum, caseInsensitive: true },
  ];
}
function dispersedWindows(value) {
  if (value.length < CREDENTIAL_LEAK_MIN_FRAGMENT_LENGTH) return [];
  const width = Math.min(8, value.length);
  const positions = new Set([0, Math.floor((value.length - width) / 3), Math.floor((2 * (value.length - width)) / 3), value.length - width]);
  return [...positions].sort((a, b) => a - b).map((position) => value.slice(position, position + width));
}
function bufferFor(value) { return Buffer.isBuffer(value) ? value : Buffer.from(String(value ?? ''), 'utf8'); }
function boundedJoin(parts, limitBytes = MAX_OUTPUT_BYTES, separator = '') {
  let bytes = 0;
  let out = '';
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (index > 0) {
      bytes += Buffer.byteLength(separator, 'utf8');
      out += separator;
    }
    bytes += Buffer.byteLength(part, 'utf8');
    if (bytes > limitBytes) return null;
    out += part;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Fifth-review canonical security-scanning layer.
//
// Reversible representations are recursively NORMALIZED BEFORE matching
// (not only whole-value needles): every source is expanded into canonical
// views that un-escape mixed raw + `\\u00XX` sequences, URL-escape
// fragments, and reconstruct base64/base64url and hex fragments (with
// optional prefixes/case variation) that were split per-chunk or across
// fields. Ordered fragments (raw stdout, raw stderr, combined ordered
// channels, parsed JSON scalar/string values in response order) are
// scanned both as whole views and as bounded-gap ordered subsequences, so
// interleaved parsed fields and alternating stdout/stderr pieces cannot
// hide the credential. No field names or artificial gaps are inserted into
// the reconstruction. The benign-output false-positive corpus must keep
// passing: reconstructed views only match when they actually contain a
// full credential form or multiple dispersed fragment windows.
// ---------------------------------------------------------------------------
const DEFAULT_SCAN_LIMITS = Object.freeze({
  maxCanonicalViewsPerSource: 14,
  subsequenceMaxText: 2 * 1024 * 1024,
  subsequenceMaxStates: 200_000,
  subsequenceGap: 64,
  interleavedMaxText: 256 * 1024,
  interleavedViewPairsMax: 196,
  interleavedMaxStates: 200_000,
  base64RunMax: 1024 * 1024,
  hexRunMax: 1024 * 1024,
  bytewiseBase64Max: 1024 * 1024,
  numericByteArrayMax: 1024 * 1024,
  joinLimitBytes: MAX_OUTPUT_BYTES,
});
export const SCAN_STATE_COMPLETE = 'COMPLETE';
export const SCAN_STATE_INCOMPLETE = 'INCOMPLETE';
export const SCAN_INCOMPLETE_REASON = Object.freeze({
  CANONICAL_VIEW_LIMIT: 'CANONICAL_VIEW_LIMIT',
  SUBSEQUENCE_TEXT_LIMIT: 'SUBSEQUENCE_TEXT_LIMIT',
  SUBSEQUENCE_STATE_LIMIT: 'SUBSEQUENCE_STATE_LIMIT',
  INTERLEAVED_TEXT_LIMIT: 'INTERLEAVED_TEXT_LIMIT',
  INTERLEAVED_VIEW_PAIR_LIMIT: 'INTERLEAVED_VIEW_PAIR_LIMIT',
  INTERLEAVED_STATE_LIMIT: 'INTERLEAVED_STATE_LIMIT',
  INTERLEAVED_SECRET_LIMIT: 'INTERLEAVED_SECRET_LIMIT',
  BASE64_RUN_LIMIT: 'BASE64_RUN_LIMIT',
  BYTEWISE_BASE64_LIMIT: 'BYTEWISE_BASE64_LIMIT',
  HEX_RUN_LIMIT: 'HEX_RUN_LIMIT',
  NUMERIC_BYTE_ARRAY_LIMIT: 'NUMERIC_BYTE_ARRAY_LIMIT',
  PARSED_JOIN_LIMIT: 'PARSED_JOIN_LIMIT',
});

function mergeScanLimits(limits) {
  return { ...DEFAULT_SCAN_LIMITS, ...(limits !== null && typeof limits === 'object' ? limits : {}) };
}

/** One-pass decode of `\\uXXXX` (e.g. `\\u00XX`) escapes to raw characters. */
function decodeUnicodeEscapes(text) {
  return String(text).replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

/** One-pass decode of `%XX` URL escapes to raw characters. */
function decodeUrlEscapes(text) {
  return String(text).replace(/%([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}

/**
 * Reconstruct base64/base64url fragments: whitespace is joined (per-chunk
 * base64), then maximal alphabet runs are decoded (base64url `-_` is
 * normalized, padding repaired). Fragments split across fields are
 * reconstructed by the joined text of the source. A run that exceeds the
 * bounded quantifier marks the extraction INCOMPLETE (sixth-review rule:
 * any search/view bound reached => INCOMPLETE => fail closed).
 */
function extractBase64Fragments(text, limits) {
  const joined = String(text).replace(/\s+/g, '');
  const out = [];
  let complete = true;
  let reason = null;
  if (hasAlphabetRun(joined, (code) => (
    (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)
    || (code >= 0x30 && code <= 0x39) || code === 0x2b || code === 0x2f || code === 0x3d || code === 0x2d || code === 0x5f
  ), limits.base64RunMax + 1)) {
    complete = false;
    reason = SCAN_INCOMPLETE_REASON.BASE64_RUN_LIMIT;
  }
  for (const match of joined.matchAll(new RegExp(`[A-Za-z0-9+/=_-]{16,${limits.base64RunMax}}`, 'g'))) {
    const run = match[0].replaceAll('-', '+').replaceAll('_', '/');
    const unpadded = run.replace(/=+$/, '');
    const padded = `${unpadded}${'='.repeat((4 - (unpadded.length % 4)) % 4)}`;
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(padded)) continue;
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    if (decoded.length > 0) out.push(decoded);
  }
  return { decoded: out, complete, reason };
}

/**
 * Independently padded per-byte/per-chunk base64/base64url (sixth-review
 * rule): every 2/3/4-char base64 token is decoded on its own, so
 * `YQ==Yg==` or unpadded per-byte base64url `YQYg` reconstructs to `ab`
 * even though a single joined decode would produce different bytes.
 */
function extractBytewiseBase64Fragments(text, limits) {
  const original = String(text);
  const joined = original.replace(/\s+/g, '').replaceAll('-', '+').replaceAll('_', '/');
  const out = [];
  let complete = true;
  let reason = null;
  if (original.length > limits.bytewiseBase64Max || joined.length > limits.bytewiseBase64Max) {
    complete = false;
    reason = SCAN_INCOMPLETE_REASON.BYTEWISE_BASE64_LIMIT;
  }
  const boundedOriginal = original.slice(0, limits.bytewiseBase64Max);
  const bounded = joined.slice(0, limits.bytewiseBase64Max);
  // Interpretation 1: adjacent padded chunks (including per-byte chunks).
  // Splitting into legal 2/3/4-character base64 atoms reconstructs arbitrary
  // independently padded chunks such as `Z2hpag==a2xtbg==`.
  const tokenRe = /[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{3}|[A-Za-z0-9+/]{2}/g;
  let adjacent = '';
  for (const match of bounded.matchAll(tokenRe)) {
    const decoded = Buffer.from(match[0], 'base64').toString('utf8');
    if (decoded.length > 0) adjacent += decoded;
  }
  if (adjacent.length > 0) out.push(adjacent);
  // Interpretation 2: independently delimited padded OR unpadded chunks.
  // Preserve whitespace/punctuation boundaries before decoding; deleting
  // those boundaries makes unpadded chunks ambiguous and was the prior
  // per-chunk base64url bypass.
  let delimited = '';
  let delimitedCount = 0;
  for (const match of boundedOriginal.matchAll(/[A-Za-z0-9+/_-]{2,}={0,2}/g)) {
    const token = match[0].replaceAll('-', '+').replaceAll('_', '/');
    const unpadded = token.replace(/=+$/, '');
    if (unpadded.length % 4 === 1 || !/^[A-Za-z0-9+/]+$/.test(unpadded)) continue;
    const padded = `${unpadded}${'='.repeat((4 - (unpadded.length % 4)) % 4)}`;
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    if (decoded.length === 0) continue;
    delimited += decoded;
    delimitedCount += 1;
  }
  if (delimitedCount > 1 && !out.includes(delimited)) out.push(delimited);
  // Interpretation 3: strict two-char-per-byte (gap-free unpadded form).
  if (bounded.length % 2 === 0) {
    let bytewise = '';
    let valid = true;
    for (let i = 0; i + 1 < bounded.length; i += 2) {
      const pair = bounded.slice(i, i + 2);
      if (!/^[A-Za-z0-9+/]{2}$/.test(pair)) { valid = false; break; }
      bytewise += Buffer.from(pair, 'base64').toString('utf8');
    }
    if (valid && bytewise.length > 0 && !out.includes(bytewise)) out.push(bytewise);
  }
  return { decoded: out, complete, reason };
}

/**
 * Reconstruct hex fragments with optional `0x` prefixes, case variation
 * and PUNCTUATION (sixth-review rule: `0x61,0x62` / `61-62` / `61:62` /
 * `61 62` all reconstruct to `ab`): whitespace and a defined punctuation
 * set are stripped, prefixes are removed, then even-length hex runs are
 * decoded pairwise.
 */
function extractHexFragments(text, limits) {
  const source = String(text);
  const runs = [];
  let current = '';
  let complete = true;
  let reason = null;
  const flush = () => {
    if (current.length >= 8 && current.length % 2 === 0) runs.push(current);
    current = '';
  };
  const isHex = (ch) => /^[0-9a-fA-F]$/.test(ch);
  for (let index = 0; index < source.length; index += 1) {
    // Optional per-byte/per-chunk 0x prefix. The prefix is syntax, not data.
    if (source[index] === '0' && (source[index + 1] === 'x' || source[index + 1] === 'X')
      && isHex(source[index + 2] ?? '') && isHex(source[index + 3] ?? '')) {
      current += source[index + 2] + source[index + 3];
      index += 3;
    } else if (isHex(source[index])) {
      current += source[index];
    } else if (/[A-Za-z0-9]/.test(source[index])) {
      // Non-hex alphanumeric text is a semantic boundary. Punctuation of
      // any kind (`-`, `/`, `|`, `\\`, `~`, `+`, commas, whitespace, etc.)
      // remains a legal byte separator and is ignored.
      flush();
    }
    if (current.length > limits.hexRunMax) {
      complete = false;
      reason = SCAN_INCOMPLETE_REASON.HEX_RUN_LIMIT;
      current = current.slice(0, limits.hexRunMax);
    }
  }
  flush();
  const decoded = [];
  for (const run of runs) {
    const value = Buffer.from(run, 'hex').toString('utf8');
    if (value.length > 0) decoded.push(value);
  }
  return { decoded, complete, reason };
}

/**
 * Numeric byte arrays (sixth-review rule): runs of 1-3 digit integers in
 * 0..255 separated by any non-digit characters (`[97, 98, 99]`, `97 98
 * 99`, `97-98-99`) reconstruct to their byte sequence. Non-byte numbers
 * break the run (they are not a bound).
 */
function extractNumericByteArrays(text, limits) {
  const out = [];
  let complete = true;
  let reason = null;
  if (String(text).length > limits.numericByteArrayMax) {
    complete = false;
    reason = SCAN_INCOMPLETE_REASON.NUMERIC_BYTE_ARRAY_LIMIT;
  }
  const bounded = String(text).slice(0, limits.numericByteArrayMax);
  const tokens = bounded.split(/[^\d]+/);
  let run = [];
  const flush = () => {
    if (run.length >= 6) {
      const bytes = Buffer.from(run);
      const decoded = bytes.toString('utf8');
      if (decoded.length > 0) out.push(decoded);
    }
    run = [];
  };
  for (const token of tokens) {
    if (token.length === 0) continue;
    const value = Number.parseInt(token, 10);
    if (Number.isSafeInteger(value) && value >= 0 && value <= 255) run.push(value);
    else flush();
  }
  flush();
  return { decoded: out, complete, reason };
}

/**
 * A decoded view can only match an ASCII OAuth credential, so decoded
 * bytes that are not mostly printable text are discarded: digest-like hex
 * refs decode to binary garbage and would otherwise consume the bounded
 * view budget (and create false-positive surface) without ever matching.
 * Raw text and unicode/URL-unescaped views are always kept.
 */
/**
 * Linear run-length detection (never a regex with an unbounded min
 * quantifier — those exhaust the regex engine on oversized outputs).
 */
function hasAlphabetRun(text, isAlphabet, minLength) {
  let run = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (isAlphabet(text.charCodeAt(i))) {
      run += 1;
      if (run >= minLength) return true;
    } else {
      run = 0;
    }
  }
  return false;
}

function isPlausibleCredentialText(view) {
  if (typeof view !== 'string' || view.length === 0) return false;
  let printable = 0;
  for (let i = 0; i < view.length; i += 1) {
    const code = view.charCodeAt(i);
    if ((code >= 0x20 && code <= 0x7e) || code === 0x09 || code === 0x0a || code === 0x0d) printable += 1;
  }
  return printable / view.length >= 0.75;
}

/**
 * Recursively normalize one source text into its canonical views: each
 * decoder/extractor is applied, then applied again to its own outputs
 * (bounded), so LAYERED/NESTED encodings (e.g. base64 of a unicode-escaped
 * value, or hex of base64) are reconstructed before matching. When the
 * view budget is exhausted the analysis is INCOMPLETE (fail closed).
 */
function canonicalViewsFor(text, limits) {
  const views = [];
  const seen = new Set();
  const queue = [String(text ?? '')];
  const reasons = new Set();
  let complete = true;
  while (queue.length > 0) {
    if (views.length >= limits.maxCanonicalViewsPerSource) {
      complete = false;
      reasons.add(SCAN_INCOMPLETE_REASON.CANONICAL_VIEW_LIMIT);
      break;
    }
    const current = queue.shift();
    if (current.length === 0 || seen.has(current)) continue;
    seen.add(current);
    views.push(current);
    const base64 = extractBase64Fragments(current, limits);
    const bytewise = extractBytewiseBase64Fragments(current, limits);
    const hex = extractHexFragments(current, limits);
    const numeric = extractNumericByteArrays(current, limits);
    if (!base64.complete || !bytewise.complete || !hex.complete || !numeric.complete) complete = false;
    for (const r of [base64.reason, bytewise.reason, hex.reason, numeric.reason]) {
      if (r !== null && r !== undefined) reasons.add(r);
    }
    const candidates = [
      decodeUnicodeEscapes(current),
      decodeUrlEscapes(current),
      ...base64.decoded,
      ...bytewise.decoded,
      ...hex.decoded,
      ...numeric.decoded,
    ];
    for (const candidate of candidates) {
      if (candidate.length === 0 || seen.has(candidate)) continue;
      // Decoded views that are not plausible credential text cannot match
      // an ASCII OAuth credential; keep the budget for real reconstructions.
      if (!isPlausibleCredentialText(candidate)) continue;
      queue.push(candidate);
    }
  }
  return { views, complete, reasons: freeze([...reasons].sort()) };
}

/**
 * Bounded-gap ordered subsequence match: every character of the secret
 * must appear in order in the text with at most limits.subsequenceGap
 * interleaved characters between consecutive secret characters. Reaching
 * the text-size bound is INCOMPLETE, never "not detected".
 */
function orderedSubsequenceMatch(secret, text, limits) {
  if (secret.length < CREDENTIAL_LEAK_MIN_FRAGMENT_LENGTH) return { matched: false, complete: true, reason: null };
  if (typeof text !== 'string' || text.length === 0) return { matched: false, complete: true, reason: null };
  if (text.length > limits.subsequenceMaxText) return { matched: false, complete: false, reason: SCAN_INCOMPLETE_REASON.SUBSEQUENCE_TEXT_LIMIT };
  const positions = new Map();
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    let list = positions.get(ch);
    if (list === undefined) { list = []; positions.set(ch, list); }
    list.push(index);
  }
  let reachable = positions.get(secret[0]) ?? [];
  let states = reachable.length;
  if (states >= limits.subsequenceMaxStates) return { matched: false, complete: false, reason: SCAN_INCOMPLETE_REASON.SUBSEQUENCE_STATE_LIMIT };
  if (reachable.length === 0) return { matched: false, complete: true, reason: null };
  for (let secretIndex = 1; secretIndex < secret.length; secretIndex += 1) {
    const candidates = positions.get(secret[secretIndex]) ?? [];
    const next = [];
    let previousIndex = 0;
    let latestReachable = -1;
    for (const candidate of candidates) {
      while (previousIndex < reachable.length && reachable[previousIndex] < candidate) {
        latestReachable = reachable[previousIndex];
        previousIndex += 1;
      }
      states += 1;
      if (states >= limits.subsequenceMaxStates) {
        return { matched: false, complete: false, reason: SCAN_INCOMPLETE_REASON.SUBSEQUENCE_STATE_LIMIT };
      }
      if (latestReachable >= 0 && candidate - latestReachable - 1 <= limits.subsequenceGap) next.push(candidate);
    }
    if (next.length === 0) return { matched: false, complete: true, reason: null };
    reachable = next;
  }
  return { matched: true, complete: true, reason: null };
}

function reversedText(text) { return [...text].reverse().join(''); }

/**
 * Bounded two-stream interleaving search: every character of the secret
 * must appear in order by advancing through EITHER stream (stdout or
 * stderr), with at most limits.subsequenceGap interleaved characters
 * between consecutive secret characters. Reaching ANY bound (total text,
 * memoized states, or secret length) is INCOMPLETE, never "not detected".
 */
function interleavedSubsequenceMatch(secret, a, b, limits) {
  if (secret.length < CREDENTIAL_LEAK_MIN_FRAGMENT_LENGTH) return { matched: false, complete: true, reason: null };
  // Real openai-codex refresh tokens are long (hundreds to ~1-2KB chars);
  // the interleaving search bound must comfortably cover them while still
  // bounding adversarial blowup. Reaching it is INCOMPLETE (fail closed).
  if (secret.length > 4096) return { matched: false, complete: false, reason: SCAN_INCOMPLETE_REASON.INTERLEAVED_SECRET_LIMIT };
  if (typeof a !== 'string' || typeof b !== 'string') return { matched: false, complete: true, reason: null };
  if (a.length + b.length === 0) return { matched: false, complete: true, reason: null };
  if (a.length + b.length > limits.interleavedMaxText) return { matched: false, complete: false, reason: SCAN_INCOMPLETE_REASON.INTERLEAVED_TEXT_LIMIT };
  let states = new Map([['0:0', [0, 0]]]);
  let explored = 0;
  const addChoices = (next, text, from, other, useA, ch, first) => {
    const end = first ? text.length - 1 : Math.min(text.length - 1, from + limits.subsequenceGap);
    let index = text.indexOf(ch, from);
    while (index !== -1 && index <= end) {
      const ai = useA ? index + 1 : other;
      const bi = useA ? other : index + 1;
      next.set(`${ai}:${bi}`, [ai, bi]);
      explored += 1;
      if (next.size >= limits.interleavedMaxStates || explored >= limits.interleavedMaxStates) return false;
      index = text.indexOf(ch, index + 1);
    }
    return true;
  };
  for (let secretIndex = 0; secretIndex < secret.length; secretIndex += 1) {
    const next = new Map();
    for (const [ai, bi] of states.values()) {
      if (!addChoices(next, a, ai, bi, true, secret[secretIndex], secretIndex === 0)
        || !addChoices(next, b, bi, ai, false, secret[secretIndex], secretIndex === 0)) {
        return { matched: false, complete: false, reason: SCAN_INCOMPLETE_REASON.INTERLEAVED_STATE_LIMIT };
      }
    }
    if (next.size === 0) return { matched: false, complete: true, reason: null };
    states = next;
  }
  return { matched: true, complete: true, reason: null };
}

function sourceMatchKind(source, needle, limits) {
  let fragment = false;
  let complete = true;
  const reasons = new Set();
  for (const view of source.views) {
    const raw = Buffer.from(view, 'utf8');
    if (raw.includes(Buffer.from(needle.value, 'utf8'))) return { kind: 'full', complete: true, reasons: [] };
    const canonical = needle.normalizer(needle.value);
    let haystack = needle.normalizer(view);
    let ci = canonical;
    if (needle.caseInsensitive) {
      ci = canonical.toLowerCase();
      haystack = haystack.toLowerCase();
    }
    if (ci.length === 0) continue;
    if (haystack.includes(ci)) return { kind: 'full', complete: true, reasons: [] };
    const windows = dispersedWindows(ci);
    if (windows.length >= 2 && windows.filter((window) => haystack.includes(window)).length >= Math.min(3, windows.length)) {
      fragment = true;
    }
    if (source.subsequence === true && view.length > limits.subsequenceMaxText) {
      complete = false;
      reasons.add(SCAN_INCOMPLETE_REASON.SUBSEQUENCE_TEXT_LIMIT);
    }
  }
  if (fragment) return { kind: 'fragment', complete, reasons: [...reasons] };
  // Ordered reconstruction: interleaved parsed fields / alternating
  // channel pieces (both channel orders and the reversed combined order).
  if (source.subsequence === true) {
    for (const view of source.views) {
      const sub = orderedSubsequenceMatch(needle.value, view, limits);
      if (!sub.complete) { complete = false; if (sub.reason !== null) reasons.add(sub.reason); }
      if (sub.matched) return { kind: 'fragment', complete, reasons: [...reasons] };
      if (source.reversed === true) {
        const rev = orderedSubsequenceMatch(reversedText(needle.value), view, limits);
        if (!rev.complete) { complete = false; if (rev.reason !== null) reasons.add(rev.reason); }
        if (rev.matched) return { kind: 'fragment', complete, reasons: [...reasons] };
      }
    }
  }
  return { kind: null, complete, reasons: [...reasons] };
}
function sourceMatchKindForSecret(source, secret, limits) {
  let fragment = false;
  let complete = true;
  const reasons = new Set();
  for (const needle of encodedNeedles(secret)) {
    const { kind, complete: kindComplete, reasons: kindReasons } = sourceMatchKind(source, needle, limits);
    if (!kindComplete) complete = false;
    for (const reason of kindReasons) reasons.add(reason);
    if (kind === 'full') return { kind: 'full', complete, reasons: [...reasons] };
    if (kind === 'fragment') fragment = true;
  }
  return { kind: fragment ? 'fragment' : null, complete, reasons: [...reasons] };
}

/**
 * Return byte-free leak detection and conservative attribution. Raw
 * channels are evaluated independently and combined; parsed scalar values
 * are also evaluated independently and as a bounded concatenation in
 * response order (no field names inserted), so split/encoded/interleaved
 * credentials cannot hide across fields/chunks/channels.
 *
 * Sixth-review rule: the result explicitly reports whether the analysis
 * was COMPLETE or INCOMPLETE. ANY search/view bound reached (view budget,
 * subsequence text bound, interleaving bounds, run caps, join budget)
 * yields scanState INCOMPLETE with the reasons — the caller MUST fail
 * closed; "not detected" is never returned for an incomplete analysis.
 */
export function scanForCredentialLeakDetailed(transport, { stdout = '', stderr = '', values = null, limits = null } = {}) {
  const lim = mergeScanLimits(limits);
  const incompleteReasons = new Set();
  const sensitive = typeof transport?.sensitiveValues === 'function'
    ? transport.sensitiveValues()
    : [transport?.credentials?.access, transport?.credentials?.refresh];
  const stdoutBuffer = bufferFor(stdout);
  const stderrBuffer = bufferFor(stderr);
  const stdoutText = stdoutBuffer.toString('utf8');
  const stderrText = stderrBuffer.toString('utf8');
  let scalarValues = [];
  let scalarKeys = [];
  let orderedValues = null;
  if (Array.isArray(values)) {
    scalarValues = values.filter((value) => typeof value === 'string');
  } else if (values !== null && typeof values === 'object') {
    // Fifth-review rule: field names are scanned as ordered grammar
    // fragments but NEVER inserted into the gap-free value reconstruction.
    scalarValues = Array.isArray(values.values) ? values.values.filter((value) => typeof value === 'string') : [];
    scalarKeys = Array.isArray(values.keys) ? values.keys.filter((value) => typeof value === 'string') : [];
    orderedValues = Array.isArray(values.ordered) ? values.ordered.filter((value) => typeof value === 'string') : null;
  }
  const joinedValues = boundedJoin(scalarValues, lim.joinLimitBytes);
  const chunkedValues = boundedJoin(scalarValues, lim.joinLimitBytes, '\n');
  const joinedOrdered = orderedValues === null ? null : boundedJoin(orderedValues, lim.joinLimitBytes);
  const chunkedOrdered = orderedValues === null ? null : boundedJoin(orderedValues, lim.joinLimitBytes, '\n');
  const finish = (detected, channel, sources, extraReasons = []) => {
    for (const reason of extraReasons) incompleteReasons.add(reason);
    return freeze({
      detected,
      channel,
      sources: freeze(sources),
      scanState: incompleteReasons.size === 0 ? SCAN_STATE_COMPLETE : SCAN_STATE_INCOMPLETE,
      incompleteReasons: freeze([...incompleteReasons].sort()),
    });
  };
  if (joinedValues === null || chunkedValues === null
    || (orderedValues !== null && (joinedOrdered === null || chunkedOrdered === null))) {
    return finish(true, 'UNKNOWN', ['PARSED_OVERSIZE'], [SCAN_INCOMPLETE_REASON.PARSED_JOIN_LIMIT]);
  }
  const combined = stdoutText + stderrText;
  const sources = [
    { name: 'STDOUT', channel: 'STDOUT', text: stdoutText, subsequence: true },
    { name: 'STDERR', channel: 'STDERR', text: stderrText, subsequence: true },
    { name: 'STDOUT_STDERR_COMBINED', channel: 'MULTIPLE', text: combined, subsequence: true },
    { name: 'STDERR_STDOUT_COMBINED', channel: 'MULTIPLE', text: stderrText + stdoutText, subsequence: true },
    { name: 'COMBINED_REVERSED', channel: 'MULTIPLE', text: reversedText(combined), subsequence: true, reversed: true },
    ...scalarValues.map((value, index) => ({ name: `PARSED_${index}`, channel: 'UNKNOWN', text: value })),
    ...scalarKeys.map((value, index) => ({ name: `PARSED_KEY_${index}`, channel: 'UNKNOWN', text: value })),
    ...(scalarValues.length > 1 ? [
      { name: 'PARSED_COMBINED', channel: 'UNKNOWN', text: joinedValues, subsequence: true },
      { name: 'PARSED_CHUNKED', channel: 'UNKNOWN', text: chunkedValues, subsequence: true },
    ] : []),
    ...(orderedValues !== null && orderedValues.length > 1 ? [
      { name: 'PARSED_ORDERED_COMBINED', channel: 'UNKNOWN', text: joinedOrdered, subsequence: true },
      { name: 'PARSED_ORDERED_CHUNKED', channel: 'UNKNOWN', text: chunkedOrdered, subsequence: true },
    ] : []),
  ];
  for (const source of sources) {
    const views = canonicalViewsFor(source.text, lim);
    source.views = views.views;
    if (!views.complete) {
      for (const reason of views.reasons) incompleteReasons.add(reason);
      incompleteReasons.add(SCAN_INCOMPLETE_REASON.CANONICAL_VIEW_LIMIT);
    }
    if (source.subsequence === true && source.text.length > lim.subsequenceMaxText) {
      incompleteReasons.add(SCAN_INCOMPLETE_REASON.SUBSEQUENCE_TEXT_LIMIT);
    }
  }
  const matched = new Map();
  for (const secret of sensitive) {
    if (secret === null || secret === undefined || secret === '') continue;
    if (typeof secret !== 'string' || secret.length < MIN_CANARY_CREDENTIAL_LENGTH || normalizedAlnum(secret).length < MIN_CANARY_CREDENTIAL_LENGTH) {
      return finish(true, 'UNKNOWN', ['UNSCANNABLE_CREDENTIAL']);
    }
    if (secret.length > 4096) incompleteReasons.add(SCAN_INCOMPLETE_REASON.INTERLEAVED_SECRET_LIMIT);
    for (const source of sources) {
      const { kind, complete, reasons } = sourceMatchKindForSecret(source, secret, lim);
      if (!complete && reasons.length === 0) incompleteReasons.add(SCAN_INCOMPLETE_REASON.SUBSEQUENCE_STATE_LIMIT);
      for (const reason of reasons) incompleteReasons.add(reason);
      if (kind === 'full' || kind === 'fragment') {
        const prior = matched.get(source.name);
        matched.set(source.name, prior === 'full' || kind === 'full' ? 'full' : 'fragment');
      }
    }
    // Alternating stdout/stderr pieces: search every bounded canonical-view
    // pair, not only raw text. This reconstructs encoded chunks split across
    // channels while preserving each channel's internal order.
    const stdoutViews = sources.find((source) => source.name === 'STDOUT').views;
    const stderrViews = sources.find((source) => source.name === 'STDERR').views;
    const pairCount = stdoutViews.length * stderrViews.length;
    if (pairCount > lim.interleavedViewPairsMax) incompleteReasons.add(SCAN_INCOMPLETE_REASON.INTERLEAVED_VIEW_PAIR_LIMIT);
    let checkedPairs = 0;
    let interleavedMatched = false;
    outer: for (const stdoutView of stdoutViews) {
      for (const stderrView of stderrViews) {
        if (checkedPairs >= lim.interleavedViewPairsMax) break outer;
        checkedPairs += 1;
        const interleaved = interleavedSubsequenceMatch(secret, stdoutView, stderrView, lim);
        if (!interleaved.complete && interleaved.reason !== null) incompleteReasons.add(interleaved.reason);
        if (interleaved.matched) { interleavedMatched = true; break outer; }
      }
    }
    if (interleavedMatched) {
      const prior = matched.get('STDOUT_STDERR_COMBINED');
      matched.set('STDOUT_STDERR_COMBINED', prior === 'full' ? 'full' : 'fragment');
    }
  }
  if (matched.size === 0) return finish(false, null, []);
  const stdoutFull = matched.get('STDOUT') === 'full';
  const stderrFull = matched.get('STDERR') === 'full';
  const combinedChannel = matched.has('STDOUT_STDERR_COMBINED')
    || matched.has('STDERR_STDOUT_COMBINED')
    || matched.has('COMBINED_REVERSED');
  // Fragment windows/subsequence establish a leak but do not prove a
  // single source channel; a split encoding is MULTIPLE/UNKNOWN rather
  // than an invented stderr attribution.
  const channel = stdoutFull && !stderrFull
    ? 'STDOUT'
    : stderrFull && !stdoutFull
      ? 'STDERR'
      : combinedChannel || (stdoutFull && stderrFull)
        ? 'MULTIPLE'
        : 'UNKNOWN';
  return finish(true, channel, [...matched.keys()].sort());
}

/** Boolean compatibility wrapper for callers that only need fail-closed detection. */
export function scanForCredentialLeak(transport, options = {}) {
  const result = scanForCredentialLeakDetailed(transport, options);
  return result.detected || result.scanState === SCAN_STATE_INCOMPLETE;
}


export function collectCanonicalStringValues(value, { limitBytes = MAX_OUTPUT_BYTES } = {}) {
  const values = [];
  const keys = [];
  const ordered = [];
  let total = 0;
  const add = (text, target) => {
    total += Buffer.byteLength(text, 'utf8');
    if (total > limitBytes) throw new LcimError('parsed SOL response exceeded canonical credential-scan budget', 'SOL_RESPONSE_TOO_LARGE');
    target.push(text);
  };
  const walk = (current) => {
    if (typeof current === 'string') {
      add(current, values);
      ordered.push(current);
    } else if (typeof current === 'number' && Number.isFinite(current)) {
      const text = String(current);
      add(text, values);
      ordered.push(text);
    } else if (Array.isArray(current)) {
      for (const item of current) walk(item);
    } else if (current !== null && typeof current === 'object') {
      // Fifth-review rule: field names are scanned as ordered grammar
      // fragments (keys are collected separately, in response order) but
      // they are NEVER interleaved into the gap-free VALUE reconstruction
      // — interleaving would insert artificial gaps that prevent
      // reconstructing credentials split across adjacent parsed fields.
      // The ordered key+value grammar is scanned separately, so a
      // credential split across a key and its value (or interleaved
      // fields) is still reconstructed.
      for (const key of Object.keys(current)) {
        if (key.length > 0) {
          add(key, keys);
          ordered.push(key);
        }
        walk(current[key]);
      }
    }
  };
  walk(value);
  return freeze({ values: freeze(values), keys: freeze(keys), ordered: freeze(ordered) });
}

/**
 * Fifth-review rule: proof-evidence persistence failure fails the transport
 * closed for AUTHORITATIVE production transport. For an already-rejected
 * invocation the primary error stays primary; for non-authoritative test
 * seams the evidence loss is tolerated (the run is structurally incapable
 * of production authority anyway). Returns the fail-closed error code or
 * null.
 */
export function assessEvidencePersistenceFailure({ accepted = false } = {}) {
  if (accepted === true) return 'SOL_TRANSPORT_EVIDENCE_FAILED';
  return null;
}

/**
 * Strict controller-side Pi acceptance gate. Every proof is explicit and
 * exact: omitted/null/undefined is never interpreted as success. Test seams
 * may exercise routing only through the explicit non-authoritative override;
 * they never become production-authoritative.
 */
export function assessSolTransportResult(result = {}, { allowNonAuthoritativeTestSeam = false } = {}) {
  const failures = [];
  const requireExact = (field, value, failure) => {
    if (result[field] !== value) failures.push(failure);
  };
  requireExact('status', 0, 'status');
  requireExact('error', null, 'transport-error');
  requireExact('timedOut', false, 'timeout');
  requireExact('truncated', false, 'output-truncated');
  requireExact('processCompleted', true, 'process-not-completed');
  requireExact('identityVerifiedBeforeSpawn', true, 'identity-before-spawn-unverified');
  requireExact('identityVerifiedAfterExit', true, 'entrypoint-identity-changed');
  requireExact('processAbsenceVerified', true, 'process-absence-unverified');
  requireExact('quiescenceVerified', true, 'quiescence-unverified');
  requireExact('surfaceVerified', true, 'surface-unverified');
  requireExact('credentialScanPassed', true, 'credential-scan-failed');
  requireExact('cleanupVerified', true, 'cleanup-unverified');
  const authoritative = result.reviewAuthority === SOL_REVIEW_AUTHORITY.AUTHORITATIVE;
  const permittedTestSeam = allowNonAuthoritativeTestSeam === true
    && result.reviewAuthority === SOL_REVIEW_AUTHORITY.TEST_SEAM_NON_AUTHORITATIVE;
  if (!authoritative && !permittedTestSeam) failures.push('review-authority');
  return freeze({
    ok: failures.length === 0,
    authoritative,
    failures: freeze(failures),
  });
}

function inspectDirectoryTree(root, { allowed = new Set(), recurseAllowed = new Set() } = {}) {
  const entries = [];
  const unexpected = [];
  const walk = (dir, relBase = '') => {
    let names;
    try { names = fs.readdirSync(dir).sort(); } catch (error) {
      unexpected.push({ path: relBase || '.', type: 'unreadable', mode: null });
      return;
    }
    for (const name of names) {
      const full = path.join(dir, name);
      const rel = relBase ? path.join(relBase, name) : name;
      let stat;
      try { stat = fs.lstatSync(full); } catch {
        unexpected.push({ path: rel, type: 'unreadable', mode: null });
        continue;
      }
      const type = stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : stat.isFile() ? 'file' : 'other';
      const item = { path: rel.split(path.sep).join('/'), type, mode: stat.mode & 0o777 };
      entries.push(item);
      if (type === 'symlink' || type === 'other' || !allowed.has(rel)) unexpected.push(item);
      if (type === 'directory' && recurseAllowed.has(rel)) walk(full, rel);
      else if (type === 'directory' && !allowed.has(rel)) walk(full, rel);
    }
  };
  walk(root);
  return { entries, unexpected };
}
function inspectInvocationSurface(transport) {
  if (transport === null || transport === undefined) return null;
  const expected = new Set([TRANSPORT_MARKER_FILE, 'cwd', 'home', 'tmp']);
  const tree = inspectDirectoryTree(transport.root, { allowed: expected });
  const emptiness = {};
  for (const key of ['cwd', 'home', 'tmp']) {
    try {
      const stat = fs.lstatSync(path.join(transport.root, key));
      const names = stat.isDirectory() && !stat.isSymbolicLink() ? fs.readdirSync(path.join(transport.root, key)) : null;
      emptiness[key] = names !== null && names.length === 0;
      if (emptiness[key] !== true) tree.unexpected.push({ path: key, type: 'nonempty-or-invalid-directory', mode: stat.mode & 0o777 });
    } catch { tree.unexpected.push({ path: key, type: 'missing-or-unreadable', mode: null }); }
  }
  return freeze({ entries: freeze(tree.entries.map(freeze)), unexpected: freeze(tree.unexpected.map(freeze)), empty: freeze(emptiness) });
}

/** Observe (never assert) every controller-owned transport surface after exit. */
export function inspectSolTransportSurface({ store = null, transport = null, pi = null } = {}) {
  if (store === null || typeof store !== 'object') throw new ConfigError('surface inspection requires run-scoped SOL store');
  const agentDir = store.agentDir;
  let agent;
  try {
    safeLstat(agentDir, 'isolated agent directory');
    // Fifth-review rule: real Pi 0.84.1 creates exactly ONE additional
    // offline surface in the isolated agent dir — models-store.json,
    // mode 0600, content exactly {} (verified empirically against the
    // pinned package). It is permitted ONLY under the exact-expected
    // shape below (see validateModelsStoreSurface); anything else fails
    // closed and surface inspection is not weakened.
    agent = inspectDirectoryTree(agentDir, { allowed: new Set([PI_AUTH_FILE, 'auth.json.lock', 'models-store.json']), recurseAllowed: new Set(['auth.json.lock']) });
  } catch (error) {
    return freeze({ ok: false, observed: freeze({ entries: freeze([]), unexpectedFiles: freeze([]), unexpectedDirectories: freeze([]), symlinks: freeze([]), authJsonMode: null, authProviderKeys: freeze([]), authJsonOnly: false, modelsStore: freeze({ present: false, valid: false, error: 'agent-dir-unreadable', mode: null, exactEmptyObject: false }), invocationSurface: inspectInvocationSurface(transport) }), identityVerified: false, identityError: error.message, errors: freeze(['agent-dir-unreadable']) });
  }
  const authFile = path.join(agentDir, PI_AUTH_FILE);
  const lockFile = path.join(agentDir, 'auth.json.lock');
  const modelsStoreFile = path.join(agentDir, 'models-store.json');
  let authJsonMode = null;
  let authProviderKeys = [];
  let authValid = false;
  let authLockValid = true;
  let authLockState = 'ABSENT';
  try {
    const authStat = fs.lstatSync(authFile);
    authJsonMode = authStat.mode & 0o777;
    if (!authStat.isSymbolicLink() && authStat.isFile()) {
      const parsed = JSON.parse(fs.readFileSync(authFile, 'utf8'));
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        authProviderKeys = Object.keys(parsed).sort();
        authValid = authProviderKeys.length === 1
          && authProviderKeys[0] === CODEX_OAUTH_PROVIDER
          && readIsolatedCodexEntry(agentDir).ok === true;
      }
    }
  } catch { /* reflected below */ }
  try {
    const lockStat = fs.lstatSync(lockFile);
    if (lockStat.isSymbolicLink() || !lockStat.isDirectory()) {
      authLockValid = false;
      authLockState = 'INVALID_TYPE';
    } else if (fs.readdirSync(lockFile).length !== 0) {
      authLockValid = false;
      authLockState = 'NONEMPTY_DIRECTORY';
    } else {
      authLockState = 'EMPTY_DIRECTORY';
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      authLockValid = false;
      authLockState = 'UNREADABLE';
    }
  }
  const modelsStore = validateModelsStoreSurface(modelsStoreFile);
  const invocationSurface = inspectInvocationSurface(transport);
  let identityVerified = false;
  let identityError = null;
  try { assertPiExecutableUnchanged(pi ?? store.pi); identityVerified = true; } catch (error) { identityError = error.message; }
  const unexpectedFiles = agent.unexpected.filter((item) => item.type === 'file' || item.type === 'other');
  const unexpectedDirectories = agent.unexpected.filter((item) => item.type === 'directory');
  const symlinks = agent.unexpected.filter((item) => item.type === 'symlink');
  // A VALID exact Pi 0.84.1 offline models-store.json is not an unexpected
  // file; any invalid/authority-bearing shape stays unexpected AND adds an
  // explicit models-store error below.
  const unexpectedNonModelsFiles = unexpectedFiles.filter((item) => !(modelsStore.valid === true && item.path === 'models-store.json'));
  const nonLock = agent.entries.filter((item) => item.path !== 'auth.json.lock' && !item.path.startsWith('auth.json.lock/'));
  const expectedNonLock = ['auth.json'];
  if (modelsStore.present && modelsStore.valid) expectedNonLock.push('models-store.json');
  const nonLockPaths = new Set(nonLock.map((item) => item.path));
  const authJsonOnly = nonLock.length === expectedNonLock.length
    && expectedNonLock.every((entry) => nonLockPaths.has(entry))
    && nonLock.every((item) => item.type === 'file')
    && agent.unexpected.length === 0
    && authValid && authLockValid;
  const errors = [];
  if (unexpectedNonModelsFiles.length > 0) errors.push('unexpected-files');
  if (unexpectedDirectories.length > 0) errors.push('unexpected-directories');
  if (symlinks.length > 0) errors.push('symlinks');
  if (authJsonMode !== 0o600) errors.push('auth-json-mode');
  if (!authValid) errors.push('auth-provider-set');
  if (!authLockValid) errors.push('auth-json-lock');
  if (modelsStore.present && !modelsStore.valid) errors.push('models-store-invalid');
  if (invocationSurface !== null && invocationSurface.unexpected.length > 0) errors.push('invocation-surface');
  if (!identityVerified) errors.push('entrypoint-identity');
  return freeze({
    ok: errors.length === 0,
    observed: freeze({
      entries: freeze(agent.entries.map(freeze)),
      unexpectedFiles: freeze(unexpectedNonModelsFiles.map(freeze)),
      unexpectedDirectories: freeze(unexpectedDirectories.map(freeze)),
      symlinks: freeze(symlinks.map(freeze)),
      authJsonMode,
      authProviderKeys: freeze(authProviderKeys),
      authLockValid,
      authLockState,
      authJsonOnly,
      invocationSurface,
      modelsStore,
      modelsJson: agent.entries.some((item) => item.path === 'models.json'),
      modelsStoreJson: agent.entries.some((item) => item.path === 'models-store.json'),
      settingsJson: agent.entries.some((item) => item.path === 'settings.json'),
      systemMd: agent.entries.some((item) => item.path.endsWith('/SYSTEM.md') || item.path === 'SYSTEM.md'),
      appendSystemMd: agent.entries.some((item) => item.path.endsWith('/APPEND_SYSTEM.md') || item.path === 'APPEND_SYSTEM.md'),
      extensions: agent.entries.some((item) => item.path === 'extensions' || item.path.startsWith('extensions/')),
      skills: agent.entries.some((item) => item.path === 'skills' || item.path.startsWith('skills/')),
      promptTemplates: agent.entries.some((item) => item.path === 'prompt-templates' || item.path.startsWith('prompt-templates/')),
      sessions: agent.entries.some((item) => item.path === 'sessions' || item.path.startsWith('sessions/')),
      tools: agent.entries.some((item) => item.path === 'tools' || item.path.startsWith('tools/')),
    }),
    identityVerified,
    identityError,
    errors: freeze(errors),
  });
}

/**
 * Exact-expected Pi 0.84.1 offline models-store.json surface (fifth-review
 * rule). Verified empirically against the pinned package: during offline
 * startup Pi's FileModelsStore creates models-store.json as a regular
 * file, mode 0600, containing exactly `{}`. Permitted ONLY when every
 * condition holds: regular file, mode 0600, content exactly `{}` (an
 * empty object, no keys), no symlink, no provider/base-url/model override
 * content. Any non-empty or authority-bearing shape fails closed.
 */
export function validateModelsStoreSurface(file) {
  let stat;
  try { stat = fs.lstatSync(file); } catch (error) {
    if (error?.code === 'ENOENT') return freeze({ present: false, valid: true, error: null, mode: null, exactEmptyObject: false, contentSha256: null });
    return freeze({ present: true, valid: false, error: 'unreadable', mode: null, exactEmptyObject: false, contentSha256: null });
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    return freeze({ present: true, valid: false, error: stat.isSymbolicLink() ? 'symlink' : 'not-regular-file', mode: stat.mode & 0o777, exactEmptyObject: false, contentSha256: null });
  }
  const mode = stat.mode & 0o777;
  if (mode !== 0o600) {
    return freeze({ present: true, valid: false, error: 'mode-not-0600', mode, exactEmptyObject: false, contentSha256: null });
  }
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch {
    return freeze({ present: true, valid: false, error: 'unreadable', mode, exactEmptyObject: false, contentSha256: null });
  }
  if (raw.trim() !== '{}') {
    return freeze({ present: true, valid: false, error: 'content-not-exact-empty-object', mode, exactEmptyObject: false, contentSha256: sha256(raw) });
  }
  let parsed;
  try { parsed = JSON.parse(raw); } catch {
    return freeze({ present: true, valid: false, error: 'content-unparseable', mode, exactEmptyObject: false, contentSha256: sha256(raw) });
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length !== 0) {
    return freeze({ present: true, valid: false, error: 'content-has-keys', mode, exactEmptyObject: false, contentSha256: sha256(raw) });
  }
  return freeze({ present: true, valid: true, error: null, mode, exactEmptyObject: true, contentSha256: sha256(raw) });
}

/** Redact both user ask and system prompt from argv evidence. */
export function sanitizeArgvForEvidence(argv, prompt, systemPrompt = null) {
  const promptDigest = sha256(String(prompt ?? ''));
  const systemPromptDigest = systemPrompt === null || systemPrompt === undefined ? null : sha256(String(systemPrompt));
  const out = [];
  let redactSystemNext = false;
  for (const item of argv ?? []) {
    const arg = String(item);
    if (redactSystemNext) {
      out.push(`sha256:${systemPromptDigest}`);
      redactSystemNext = false;
    } else if (arg === '--system-prompt') {
      out.push(arg);
      redactSystemNext = true;
    } else if (arg === String(prompt ?? '')) out.push(`sha256:${promptDigest}`);
    else if (systemPrompt !== null && arg === String(systemPrompt)) out.push(`sha256:${systemPromptDigest}`);
    else out.push(arg);
  }
  return freeze({ argv: freeze(out), promptDigest, systemPromptDigest });
}

function killGroup(child, signal) {
  if (!child?.pid) return false;
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, signal);
    else child.kill(signal);
    return true;
  } catch {
    try { return child.kill(signal); } catch { return false; }
  }
}

/** Hard-bounded detached-process-group Pi runner. */
export function runSolPiProcess({ transport, command, args = [], input = '', timeoutMs = DEFAULT_TIMEOUT_MS, onSpawn = null } = {}) {
  if (transport === null || typeof transport !== 'object') throw new ConfigError('runSolPiProcess requires controller-prepared transport');
  const expectedCommand = expectedPiCommand(transport.pi);
  if (!Array.isArray(command) || command.length !== expectedCommand.length || command.some((part, index) => part !== expectedCommand[index])) {
    throw new ConfigError('SOL process command must be the exact pinned node + immutable Pi resolution-loader + CLI argv');
  }
  if (!Array.isArray(args) || typeof input !== 'string') throw new ConfigError('SOL process args/input are invalid');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 1_800_000) throw new ConfigError('SOL timeoutMs is out of bounds');
  let identityVerifiedBeforeSpawn = false;
  try {
    assertPiExecutableUnchanged(transport.pi);
    identityVerifiedBeforeSpawn = true;
  } catch {
    return Promise.resolve(freeze({ status: null, signal: null, stdout: '', stderr: '', error: 'the pinned SOL transport entrypoint identity changed before spawn; refusing spawn', timedOut: false, processCompleted: false, truncated: false, pid: null, durationMs: 0, identityVerifiedBeforeSpawn: false, identityVerifiedAfterExit: false, directProcessExited: false, processAbsenceVerified: false }));
  }
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command[0], [...command.slice(1), ...args], { cwd: transport.cwd, env: transport.env, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
      transport.markProcessSpawned?.();
    } catch (error) {
      resolve(freeze({ status: null, signal: null, stdout: '', stderr: '', error: error.message, timedOut: false, processCompleted: false, truncated: false, pid: null, durationMs: Date.now() - startedAt, identityVerifiedBeforeSpawn, identityVerifiedAfterExit: false, directProcessExited: false, processAbsenceVerified: false }));
      return;
    }
    try { onSpawn?.({ pid: child.pid, processGroup: child.pid }); } catch { /* supervisor independently fails closed */ }
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let truncated = false;
    let timedOut = false;
    let terminationStarted = false;
    let settled = false;
    let killTimer = null;
    let settleTimer = null;
    const clearTimers = () => { if (timeoutTimer) clearTimeout(timeoutTimer); if (killTimer) clearTimeout(killTimer); if (settleTimer) clearTimeout(settleTimer); };
    const requestTermination = (reason) => {
      if (terminationStarted) return;
      terminationStarted = true;
      if (reason === 'timeout') timedOut = true;
      killGroup(child, 'SIGTERM');
      killTimer = setTimeout(() => {
        killGroup(child, 'SIGKILL');
        // A hostile child that somehow remains after SIGKILL cannot hold the
        // promise forever. The outer supervisor verifies absence before any
        // result can be accepted.
        settleTimer = setTimeout(() => settle({ status: null, signal: null, error: 'SOL process did not settle after process-group SIGKILL', processCompleted: false }), POST_KILL_SETTLE_MS);
      }, TERMINATE_GRACE_MS);
      killTimer.unref?.();
    };
    const settle = (fields) => {
      if (settled) return;
      settled = true;
      clearTimers();
      let identityVerifiedAfterExit = false;
      let identityError = null;
      try { assertPiExecutableUnchanged(transport.pi); identityVerifiedAfterExit = true; } catch (error) { identityError = error.message; }
      const error = identityError !== null
        ? 'the pinned SOL transport entrypoint identity changed after execution; result rejected'
        : truncated ? 'SOL transport output exceeded bounded capture buffer'
          : (fields.error ?? null);
      resolve(freeze({
        status: fields.status,
        signal: fields.signal ?? null,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        error,
        timedOut,
        processCompleted: fields.processCompleted === true,
        truncated,
        pid: child.pid ?? null,
        processGroup: child.pid ?? null,
        durationMs: Date.now() - startedAt,
        identityVerifiedBeforeSpawn,
        identityVerifiedAfterExit,
        directProcessExited: fields.processCompleted === true,
        // Direct child close is not a process-lifetime proof. The
        // controller supervisor supplies the positive root/group/marker
        // absence proof before this can become true in the acceptance gate.
        processAbsenceVerified: false,
      }));
    };
    const timeoutTimer = setTimeout(() => requestTermination('timeout'), timeoutMs);
    timeoutTimer.unref?.();
    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= MAX_OUTPUT_BYTES) stdout.push(chunk);
      else { truncated = true; requestTermination('truncation'); }
    });
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= MAX_OUTPUT_BYTES) stderr.push(chunk);
      else { truncated = true; requestTermination('truncation'); }
    });
    child.on('error', (error) => settle({ status: null, error: error.message, processCompleted: false }));
    child.on('close', (status, signal) => {
      // The direct Pi process may exit after TERM while a same-session child
      // ignores it. Do not cancel the process-group KILL merely because the
      // leader closed; issue it now and let the outer supervisor make the
      // final fresh-table absence proof.
      if (terminationStarted) killGroup(child, 'SIGKILL');
      settle({ status, signal, error: null, processCompleted: true });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

/**
 * Sixth-review scope simplification: LCIM NEVER writes back / reconciles a
 * refreshed openai-codex credential into the user's real Pi auth store.
 *
 * The real Pi auth store (`~/.pi/agent/auth.json` or the
 * PI_CODING_AGENT_DIR override) is READ-ONLY INPUT AUTHORITY for 2.0.1:
 *
 * 1. the provider-scoped openai-codex entry is read from the real store;
 * 2. copied into the controller-owned run-scoped isolated auth surface;
 * 3. every SOL invocation of the run reuses that same isolated store;
 * 4. Pi may refresh/rotate credentials inside that run-scoped store;
 * 5. later SOL_RECHECK calls in the same run use the refreshed isolated
 *    state (within-run continuity);
 * 6. at run cleanup the isolated credential surface is deleted;
 * 7. a refreshed token is NEVER written back to the real auth.json;
 * 8. a later LCIM run that cannot authenticate with the real source
 *    credential fails closed with an explicit re-authentication-required
 *    status/instruction (`CODEX_OAUTH_UNAVAILABLE` + `pi /login`);
 * 9. no LCIM execution path mutates real Pi credentials
 *    (`verifyRealAuthSourceUnchanged()` proves byte-identical state).
 *
 * Cross-run OAuth refresh persistence is intentionally deferred to a
 * future separately reviewed feature.
 */

function runIdFromRunDir(runDir) {
  const id = path.basename(runDir);
  return isValidId('run', id) ? id : null;
}
function markerSurfaces(runDir) {
  const root = path.join(runDir, 'controller', 'sol-transport');
  const runId = runIdFromRunDir(runDir);
  const surfaces = [];
  const failures = [];
  if (!fs.existsSync(root)) return { root, surfaces, failures };
  try { safeLstat(root, 'SOL transport root'); } catch (error) { return { root, surfaces, failures: [{ kind: 'root', error: error.message }] }; }
  const storeDir = path.join(root, 'store');
  const markersDir = path.join(root, 'markers');
  const storeMarkerFile = storeMarkerPathOf(runDir, runId);
  // The durable STORE marker lives OUTSIDE the credential subtree
  // (markers/<runId>.json). A store directory whose marker is missing or
  // malformed is an unbound credential surface and fails closed.
  if (fs.existsSync(storeDir)) {
    try {
      surfaces.push({ path: storeDir, markerFile: storeMarkerFile, marker: validateTransportMarker(storeDir, { kind: 'sol-transport-store', runId, markerFile: storeMarkerFile }) });
    } catch (error) { failures.push({ kind: 'invalid-marker', path: storeDir, error: error.message }); }
  } else if (fs.existsSync(markersDir)) {
    // Marker-only leftover: the credential subtree was already removed but
    // the durable external marker survived (crash between cleanup steps 3
    // and 4). Recovery removes the marker; the subtree is already gone.
    try {
      const stat = safeLstat(markersDir, 'SOL store marker directory');
      if (!stat.isDirectory()) throw new ConfigError('not a directory');
      for (const name of fs.readdirSync(markersDir).sort()) {
        const markerFile = path.join(markersDir, name);
        if (name !== `${runId}.json`) {
          failures.push({ kind: 'marker-run-mismatch', path: markerFile });
          continue;
        }
        try {
          surfaces.push({ path: storeDir, markerFile, marker: validateTransportMarker(storeDir, { kind: 'sol-transport-store', runId, markerFile, requireSurface: false }), markerOnly: true });
        } catch (error) { failures.push({ kind: 'invalid-marker', path: markerFile, error: error.message }); }
      }
    } catch (error) { failures.push({ kind: 'markers-unreadable', path: markersDir, error: error?.message ?? String(error) }); }
  }
  const invocations = path.join(root, 'invocations');
  if (fs.existsSync(invocations)) {
    try {
      const stat = safeLstat(invocations, 'SOL invocation container');
      if (!stat.isDirectory()) throw new ConfigError('not a directory');
      for (const name of fs.readdirSync(invocations).sort()) {
        const target = path.join(invocations, name);
        try { surfaces.push({ path: target, marker: validateTransportMarker(target, { kind: 'sol-transport-invocation', runId }) }); } catch (error) { failures.push({ kind: 'invalid-marker', path: target, error: error.message }); }
      }
    } catch (error) { failures.push({ kind: 'invocations-unreadable', path: invocations, error: error.message }); }
  }
  const storeMarker = surfaces.find((surface) => surface.marker.kind === 'sol-transport-store')?.marker ?? null;
  const invocationMarkers = surfaces.filter((surface) => surface.marker.kind === 'sol-transport-invocation');
  if (storeMarker === null && invocationMarkers.length > 0) {
    failures.push({ kind: 'missing-store-marker-for-invocation', path: invocations });
  }
  if (storeMarker !== null) {
    for (const surface of surfaces) {
      if (surface.marker.kind !== 'sol-transport-invocation') continue;
      if (surface.marker.transportIdentity !== storeMarker.transportIdentity
        || surface.marker.nodeIdentitySha256 !== storeMarker.nodeIdentitySha256
        || surface.marker.cliIdentitySha256 !== storeMarker.cliIdentitySha256
        || surface.marker.closureIdentitySha256 !== storeMarker.closureIdentitySha256) {
        failures.push({ kind: 'marker-identity-mismatch', path: surface.path });
      }
    }
  }
  try {
    for (const name of fs.readdirSync(root)) {
      const target = path.join(root, name);
      if (!['store', 'invocations', 'markers', EVIDENCE_DIR].includes(name)) {
        failures.push({ kind: 'unrecognized-surface', path: target });
      } else if (name === EVIDENCE_DIR) {
        try {
          const stat = safeLstat(target, 'SOL transport evidence directory');
          if (!stat.isDirectory()) throw new ConfigError('not a directory');
        } catch (error) {
          failures.push({ kind: 'evidence-surface-invalid', path: target, error: error?.message ?? String(error) });
        }
      }
    }
  } catch (error) {
    failures.push({ kind: 'root-unreadable', path: root, error: error?.message ?? String(error) });
  }
  return { root, surfaces, failures };
}

/**
 * Recover only marker-bound surfaces after positively verified process
 * absence. Serialized under the same authoritative run lifecycle lock as
 * transport creation and terminalization (fifth-review rule). A
 * Destructive recovery always uses canonical process inspection; this API
 * accepts no caller/test process table, so injected absence can never delete
 * a production surface.
 */
export async function sweepRunSolTransportSurfaces(runDir, options = {}) {
  if (typeof runDir !== 'string' || !path.isAbsolute(runDir)) throw new ConfigError('sweep requires absolute runDir');
  if (options === null || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).length > 0) {
    throw new ConfigError('transport sweep never accepts caller process inspection; canonical production inspection is mandatory');
  }
  return withSolTransportRunLock(runDir, async () => {
    const { root, surfaces, failures } = markerSurfaces(runDir);
    const removed = [];
    const terminations = [];
    if (!fs.existsSync(root)) return freeze({ ok: true, removed: freeze([]), failures: freeze([]), terminations: freeze([]) });
    const markers = new Set(surfaces.map((surface) => surface.marker.invocationMarker));
    for (const marker of markers) {
      try {
        const result = await terminateProcessesByMarker(marker);
        terminations.push(result);
        // Fifth-review rule: an UNREADABLE process table is UNKNOWN, never
        // an empty survivor set; absence must be positively verified.
        if (result.verified !== true || (result.remaining ?? []).length > 0) failures.push({ kind: 'process-termination-unverified', markerDigest: sha256(marker), verified: result.verified === true, remainingPids: result.remaining ?? null });
      } catch (error) { failures.push({ kind: 'process-termination', error: error?.message ?? String(error) }); }
    }
    // Never delete markers/credentials while any process absence proof failed.
    if (failures.length === 0) {
      // Invocation roots first, then the shared credential store, then the
      // durable external marker. Once an invocation removal fails, never
      // continue and delete its shared store: that would leave an unbound
      // credential/process surface.
      const order = { 'sol-transport-invocation': 0, 'sol-transport-store': 1 };
      for (const surface of [...surfaces].sort((a, b) => (order[a.marker.kind] ?? 2) - (order[b.marker.kind] ?? 2))) {
        if (failures.length > 0) break;
        try {
          if (surface.marker.kind === 'sol-transport-invocation') {
            makeWritableForCleanup(surface.path);
            fs.rmSync(surface.path, { recursive: true, force: false });
            assertAbsent(surface.path, 'recovered SOL invocation surface');
            removed.push(surface.path);
            continue;
          }
          if (surface.marker.kind === 'sol-transport-store') {
            if (surface.markerOnly !== true) {
              // Fifth-review cleanup order with the durable external marker:
              // 1. process absence already positively verified above;
              // 2. delete the credential/auth/model-store subtree;
              // 3. fsync the parent and verify subtree absence;
              // 4. ONLY THEN remove the durable external marker;
              // 5. fsync the marker parent.
              // A crash at any earlier point leaves the marker present, so
              // recovery re-runs the removal.
              makeWritableForCleanup(surface.path);
              const canonicalSurface = fs.realpathSync(surface.path);
              fs.rmSync(surface.path, { recursive: true, force: false });
              assertAbsent(surface.path, 'recovered SOL credential store');
              fsyncDirectory(root);
              for (const [key, retained] of retainedSolStores) {
                if (retained?.storeDir === canonicalSurface) retainedSolStores.delete(key);
              }
              retiredSolStoreKeys.add(canonicalSurface);
              retiredSolStoreKeys.add(path.resolve(surface.path));
            }
            if (fs.existsSync(surface.markerFile)) {
              fs.rmSync(surface.markerFile, { force: false });
              assertAbsent(surface.markerFile, 'recovered SOL store marker');
            }
            fsyncDirectory(transportMarkersDir(runDir));
            removed.push(surface.path);
            continue;
          }
          failures.push({ kind: 'removal', path: surface.path, error: 'unknown surface kind' });
        } catch (error) { failures.push({ kind: 'removal', path: surface.path, error: error?.message ?? String(error) }); }
      }
    }
    return freeze({ ok: failures.length === 0, removed: freeze(removed), failures: freeze(failures), terminations: freeze(terminations) });
  });
}

export async function reconcileStaleSolTransportSurfaces(runtimeRoot, options = {}) {
  if (typeof runtimeRoot !== 'string' || !path.isAbsolute(runtimeRoot)) throw new ConfigError('startup reconciliation requires absolute runtimeRoot');
  if (options === null || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).length > 0) {
    throw new ConfigError('startup reconciliation never accepts caller process inspection');
  }
  const runsRoot = path.join(runtimeRoot, 'runs');
  const removed = [];
  const skipped = [];
  const failures = [];
  if (!fs.existsSync(runsRoot)) return freeze({ ok: true, removed: freeze([]), skipped: freeze([]), failures: freeze([]) });
  for (const name of fs.readdirSync(runsRoot).sort()) {
    const runDir = path.join(runsRoot, name);
    let lifecycle = null;
    try { lifecycle = JSON.parse(fs.readFileSync(path.join(runDir, 'run.json'), 'utf8'))?.lifecycleState; } catch { skipped.push(name); continue; }
    if (!['COMPLETED', 'INCOMPLETE_LEDGER', 'ABORTED'].includes(lifecycle)) { skipped.push(name); continue; }
    const sweep = await sweepRunSolTransportSurfaces(runDir);
    removed.push(...sweep.removed);
    failures.push(...sweep.failures.map((item) => ({ runId: name, ...item })));
  }
  return freeze({ ok: failures.length === 0, removed: freeze(removed), skipped: freeze(skipped), failures: freeze(failures) });
}

/** Persist byte-free observed transport evidence only after cleanup completed. */
/**
 * Persist the IMMUTABLE exact-invocation TRANSPORT PROOF (sixth-review
 * rule): the record is written AND fsynced BEFORE provider output is
 * parsed, so a crash during parsing can never lose the transport gate
 * facts. The writer validates that a gatePassed claim implies every
 * individual proof (an inconsistent claim is refused), and a persistence
 * failure fails the authoritative transport closed at the call site.
 * The post-parse outcome is recorded separately by
 * persistSolSemanticAcceptance (never merged into this immutable record).
 */
export function persistSolTransportEvidence(runDir, invocationId, {
  pi, transport, store, flags = [], leak = false, leakChannel = null,
  inspection = null, reload = null, cleanup = null, argv = null,
  promptDigest = null, systemPromptDigest = null, proofs = null,
} = {}) {
  if (typeof runDir !== 'string' || !path.isAbsolute(runDir) || !isValidId('invocation', invocationId)) throw new ConfigError('persistSolTransportEvidence requires canonical runDir/invocationId');
  if (pi === null || typeof pi !== 'object') throw new ConfigError('persistSolTransportEvidence requires Pi');
  if (cleanup !== null && cleanup.completed !== true) throw new ConfigError('transport evidence cannot claim cleanup before cleanup finally completed');
  if (cleanup?.removed === true && cleanup.verified !== true) throw new ConfigError('transport evidence cannot claim successful cleanup without explicit nonexistence verification');
  // Sixth-review rule: gatePassed IMPLIES every proof — an inconsistent
  // claim is a writer-side contract violation and fails closed.
  if (proofs?.gatePassed === true) {
    const exact = {
      status: 0,
      error: null,
      timedOut: false,
      truncated: false,
      processCompleted: true,
      identityVerifiedBeforeSpawn: true,
      identityVerifiedAfterExit: true,
      processAbsenceVerified: true,
      quiescenceVerified: true,
      surfaceVerified: true,
      credentialScanPassed: true,
      cleanupVerified: true,
    };
    for (const [key, expected] of Object.entries(exact)) {
      if (proofs[key] !== expected) {
        throw new ConfigError(`transport evidence gatePassed claim is inconsistent with proof '${key}' (got ${String(proofs[key])}); refusing to persist a false proof record`);
      }
    }
    if (proofs.rawScanState !== SCAN_STATE_COMPLETE
      || !Array.isArray(proofs.rawScanIncompleteReasons)
      || proofs.rawScanIncompleteReasons.length !== 0) {
      throw new ConfigError('transport evidence gatePassed requires a COMPLETE raw credential scan with no incomplete reason');
    }
    const expectedAuthority = store?.nonAuthoritative === true
      ? SOL_REVIEW_AUTHORITY.TEST_SEAM_NON_AUTHORITATIVE
      : SOL_REVIEW_AUTHORITY.AUTHORITATIVE;
    if (proofs.reviewAuthority !== expectedAuthority) {
      throw new ConfigError('transport evidence gatePassed review authority does not match the exact run-scoped store authority');
    }
  }
  const dir = path.join(runDir, 'controller', 'sol-transport', EVIDENCE_DIR);
  mkdirParentsFsynced(dir);
  const file = path.join(dir, `${invocationId}.json`);
  const evidence = {
    schemaName: SOL_TRANSPORT_SCHEMA_NAME,
    schemaVersion: SOL_TRANSPORT_SCHEMA_VERSION,
    invocationId,
    mechanism: 'controller-side-trusted-pi-client',
    reviewAuthority: store?.nonAuthoritative === true
      ? SOL_REVIEW_AUTHORITY.TEST_SEAM_NON_AUTHORITATIVE
      : SOL_REVIEW_AUTHORITY.AUTHORITATIVE,
    pi: {
      node: pi.node,
      cli: pi.cli,
      resolvedFrom: pi.resolvedFrom,
      packageName: pi.packageName,
      packageVersion: pi.packageVersion,
      nodeSha256: pi.nodeIdentity?.sha256 ?? null,
      cliSha256: pi.cliIdentity?.sha256 ?? null,
      closureSha256: pi.closure?.sha256 ?? null,
      closureFileCount: pi.closure?.fileCount ?? null,
      immutableManifestSha256: pi.executionManifestIdentity?.sha256 ?? null,
      immutableLoaderSha256: pi.executionLoaderIdentity?.sha256 ?? null,
    },
    agentDir: store?.agentDir ?? transport?.agentDir ?? null,
    cwd: transport?.cwd ?? null,
    home: transport?.home ?? null,
    tmp: transport?.tmp ?? null,
    surfaceOk: inspection?.ok === true,
    agentDirLayoutObserved: inspection?.observed ?? null,
    identityVerifiedAfterExit: inspection?.identityVerified === true,
    identityError: inspection?.identityError ?? null,
    oauthFacts: transport?.oauthFacts ?? store?.oauthFacts ?? null,
    envAllowlist: transport?.env ? Object.keys(transport.env).sort() : [],
    envPins: transport?.env ? { PATH: transport.env.PATH, HOME: transport.env.HOME, PI_CODING_AGENT_DIR: transport.env.PI_CODING_AGENT_DIR, ...PI_ENV_PINS } : null,
    strippedFamilies: STRIPPED_ENV_FAMILIES,
    flags: [...flags],
    credentialLeak: leak === true,
    leakChannel: leak === true ? leakChannel : null,
    refreshedCredentials: reload === null ? null : { ok: reload.ok === true, changed: reload.changed === true, changedThisReload: reload.changedThisReload === true, reason: reload.reason ?? null },
    cleanup: cleanup === null ? null : { removed: cleanup.removed === true, observed: cleanup.observed === true, completed: cleanup.completed === true, verified: cleanup.verified === true, error: cleanup.error ?? null },
    phase: 'TRANSPORT_PROOF',
    transportProofs: proofs === null ? null : {
      status: proofs.status ?? null,
      error: proofs.error ?? null,
      timedOut: proofs.timedOut === true,
      truncated: proofs.truncated === true,
      processCompleted: proofs.processCompleted === true,
      reviewAuthority: proofs.reviewAuthority ?? null,
      identityVerifiedBeforeSpawn: proofs.identityVerifiedBeforeSpawn === true,
      identityVerifiedAfterExit: proofs.identityVerifiedAfterExit === true,
      processAbsenceVerified: proofs.processAbsenceVerified === true,
      quiescenceVerified: proofs.quiescenceVerified === true,
      surfaceVerified: proofs.surfaceVerified === true,
      credentialScanPassed: proofs.credentialScanPassed === true,
      cleanupVerified: proofs.cleanupVerified === true,
      gatePassed: proofs.gatePassed === true,
    },
    // The pre-parse credential scan state (sixth-review rule): an
    // INCOMPLETE raw scan can never claim credentialScanPassed.
    rawScanState: proofs?.rawScanState ?? null,
    rawScanIncompleteReasons: proofs?.rawScanIncompleteReasons ?? null,
    sanitizedArgv: argv === null ? null : [...argv],
    promptDigest,
    systemPromptDigest,
    recordedAt: new Date().toISOString(),
  };
  let fd;
  try {
    fd = fs.openSync(file, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8' });
    fs.fsyncSync(fd);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  fsyncDirectory(dir);
  return file;
}

/**
 * Persist the separate SEMANTIC-ACCEPTANCE binding (sixth-review rule):
 * written only AFTER successful parsing and SOL compilation (or after a
 * definitive post-parse rejection), fsynced, and consistent with the final
 * acceptance decision. It references the immutable transport-proof record
 * (`transportProofRef`) and records the canonical credential scan state.
 */
export function persistSolSemanticAcceptance(runDir, invocationId, {
  store = null, transportProofRef = null, askId = null, responseId = null,
  callType = null, errorCode = null, finalAcceptance = null,
  semanticAccepted = null, rawScanState = null,
  rawScanIncompleteReasons = null, canonicalScanState = null,
  canonicalScanIncompleteReasons = null, credentialScanPassed = null,
  leak = false, leakChannel = null, verdict = null,
} = {}) {
  if (typeof runDir !== 'string' || !path.isAbsolute(runDir) || !isValidId('invocation', invocationId)) throw new ConfigError('persistSolSemanticAcceptance requires canonical runDir/invocationId');
  const dir = path.join(runDir, 'controller', 'sol-transport', EVIDENCE_DIR);
  mkdirParentsFsynced(dir);
  const expectedProof = path.join(dir, `${invocationId}.json`);
  if (typeof transportProofRef !== 'string' || path.resolve(transportProofRef) !== path.resolve(expectedProof)) {
    throw new ConfigError('semantic acceptance must reference the exact invocation transport proof');
  }
  const proofStat = fs.lstatSync(expectedProof);
  if (proofStat.isSymbolicLink() || !proofStat.isFile()) throw new ConfigError('semantic acceptance transport proof is not a regular file');
  let proofRecord;
  try { proofRecord = JSON.parse(fs.readFileSync(expectedProof, 'utf8')); } catch {
    throw new ConfigError('semantic acceptance transport proof is unreadable or malformed');
  }
  const expectedAuthority = store?.nonAuthoritative === true
    ? SOL_REVIEW_AUTHORITY.TEST_SEAM_NON_AUTHORITATIVE
    : SOL_REVIEW_AUTHORITY.AUTHORITATIVE;
  if (proofRecord?.phase !== 'TRANSPORT_PROOF' || proofRecord?.invocationId !== invocationId
    || proofRecord?.reviewAuthority !== expectedAuthority
    || proofRecord?.transportProofs?.gatePassed !== true
    || proofRecord?.transportProofs?.credentialScanPassed !== true
    || proofRecord?.rawScanState !== SCAN_STATE_COMPLETE) {
    throw new ConfigError('semantic acceptance requires the exact gate-passed immutable transport proof');
  }
  if (finalAcceptance !== true || semanticAccepted !== true || errorCode !== null
    || typeof responseId !== 'string' || responseId.length === 0
    || rawScanState !== SCAN_STATE_COMPLETE || canonicalScanState !== SCAN_STATE_COMPLETE
    || !Array.isArray(rawScanIncompleteReasons) || rawScanIncompleteReasons.length !== 0
    || !Array.isArray(canonicalScanIncompleteReasons) || canonicalScanIncompleteReasons.length !== 0
    || credentialScanPassed !== true || leak === true) {
    throw new ConfigError('semantic acceptance binding requires successful compilation, complete credential scans, and exact final acceptance');
  }
  const file = path.join(dir, `${invocationId}.semantic.json`);
  const record = {
    schemaName: SOL_TRANSPORT_SCHEMA_NAME,
    schemaVersion: SOL_TRANSPORT_SCHEMA_VERSION,
    invocationId,
    phase: 'SEMANTIC_ACCEPTANCE',
    transportProofRef: transportProofRef === null ? null : path.basename(transportProofRef),
    reviewAuthority: store?.nonAuthoritative === true
      ? SOL_REVIEW_AUTHORITY.TEST_SEAM_NON_AUTHORITATIVE
      : SOL_REVIEW_AUTHORITY.AUTHORITATIVE,
    askId,
    responseId,
    callType,
    verdict,
    errorCode,
    semanticAccepted: semanticAccepted === null || semanticAccepted === undefined ? null : semanticAccepted === true,
    finalAcceptance: finalAcceptance === null || finalAcceptance === undefined ? null : finalAcceptance === true,
    rawScanState,
    rawScanIncompleteReasons: rawScanIncompleteReasons === null ? null : [...rawScanIncompleteReasons],
    canonicalScanState,
    canonicalScanIncompleteReasons: canonicalScanIncompleteReasons === null ? null : [...canonicalScanIncompleteReasons],
    credentialScanPassed: credentialScanPassed === null || credentialScanPassed === undefined ? null : credentialScanPassed === true,
    credentialLeak: leak === true,
    leakChannel: leak === true ? leakChannel : null,
    recordedAt: new Date().toISOString(),
  };
  let fd;
  try {
    fd = fs.openSync(file, 'wx', 0o600);
    fs.writeFileSync(fd, `${JSON.stringify(record, null, 2)}\n`, { encoding: 'utf8' });
    fs.fsyncSync(fd);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  fsyncDirectory(dir);
  return file;
}
