/**
 * LCIM immutable canonical record store.
 *
 * Public object-form API:
 *   - recordPath(root, ref)
 *   - persistCanonicalRecord({ root, value, limits })
 *   - readCanonicalRecord({ root, ref, limits })
 *
 * Design constraints (accepted contract):
 *   - Canonical JCS bytes only, produced/verified by the accepted primitives.
 *   - Final record path: <root>/records/sha256/<first2>/<remaining62>.jcs
 *   - Publication only via same-filesystem hard link; staging is retained.
 *   - No rename, copy, overwrite, truncate, unlink, or cleanup is ever done.
 *   - Every failure fails closed and surfaces as RecordStoreError.
 */

import fs from 'node:fs';
import { randomBytes } from 'node:crypto';

import { canonicalize } from './canonical.mjs';
import { parseCanonical } from './strict-json.mjs';
import { sha256, recordRef } from './digest.mjs';

const HEX64_RE = /^[0-9a-f]{64}$/;
const HEX32_RE = /^[0-9a-f]{32}$/;
const HEX2_RE = /^[0-9a-f]{2}$/;

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;

const SEGMENT_RECORDS = 'records';
const SEGMENT_SHA256 = 'sha256';
const RECORD_SUFFIX = '.jcs';

/**
 * Stable, public-safe error type. Codes are fixed strings; public messages
 * never embed caller-supplied absolute paths or raw sensitive data.
 */
export class RecordStoreError extends Error {
  constructor(code, message, options) {
    const safeMessage = typeof message === 'string' && message.length > 0 ? message : 'record store failure';
    super(safeMessage);
    this.name = 'RecordStoreError';
    this.code = code;
    if (options !== undefined && options !== null) {
      const cause = options.cause;
      if (cause !== undefined) {
        try {
          Object.defineProperty(this, 'cause', {
            value: cause,
            enumerable: false,
            writable: true,
            configurable: true,
          });
        } catch {
          // Retaining the cause is best-effort only.
        }
      }
    }
    if (typeof Error.captureStackTrace === 'function') Error.captureStackTrace(this, RecordStoreError);
  }
}

function fail(code, message, cause) {
  throw new RecordStoreError(code, message, cause === undefined ? undefined : { cause });
}

/* ------------------------------------------------------------------------- *
 * Generic structural validation helpers.
 * ------------------------------------------------------------------------- */

function isPlainRecord(value) {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep structural check used for the ref: a detached plain record with exactly
 * `sha256` and `byteLength`, own enumerable data properties, no extras, no
 * inherited entries, no getters/setters, and no exotic behavior.
 */
function isDetachedPlainRef(value, expectedKeys, allowSubset) {
  if (!isPlainRecord(value)) return false;
  const requiredKeys = expectedKeys === undefined ? ['sha256', 'byteLength'] : expectedKeys;
  const keys = Reflect.ownKeys(value);
  if (allowSubset === true) {
    if (keys.length > requiredKeys.length) return false;
  } else if (keys.length !== requiredKeys.length) return false;
  const detached = {};
  for (const key of keys) {
    if (typeof key !== 'string' || !requiredKeys.includes(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) return false;
    if (!('value' in descriptor)) return false;
    if (descriptor.get !== undefined || descriptor.set !== undefined) return false;
    if (descriptor.enumerable !== true) return false;
    Object.defineProperty(detached, key, {
      value: descriptor.value,
      enumerable: true,
      writable: false,
      configurable: false,
    });
  }
  if (expectedKeys !== undefined) return Object.freeze(detached);
  const shaDescriptor = Object.getOwnPropertyDescriptor(value, 'sha256');
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'byteLength');
  if (shaDescriptor === undefined || lengthDescriptor === undefined) return false;
  const sha = shaDescriptor.value;
  const byteLength = lengthDescriptor.value;
  if (typeof sha !== 'string' || !HEX64_RE.test(sha)) return false;
  if (typeof byteLength !== 'number' || !Number.isSafeInteger(byteLength)) return false;
  if (byteLength < 0) return false;
  return Object.freeze({ sha256: sha, byteLength: byteLength });
}

/** Validate a ref and return a freshly detached frozen copy of it. */
function validateAndDetachRef(ref) {
  let detached;
  try {
    detached = isDetachedPlainRef(ref);
  } catch (error) {
    fail('ERR_REF_INVALID', 'ref could not be inspected safely', error);
  }
  if (detached === false) {
    fail('ERR_REF_INVALID', 'ref must be a detached plain record with sha256 and byteLength');
  }
  return detached;
}

/** Validate a plain object argument with an exact own-property allowlist. */
function validateObjectArgument(name, value, allowedKeys) {
  let detached;
  try {
    detached = isDetachedPlainRef(value, allowedKeys);
  } catch (error) {
    fail('ERR_ARGUMENT_INVALID', name + ' could not be inspected safely', error);
  }
  if (detached === false) {
    fail('ERR_ARGUMENT_INVALID', name + ' must be a plain object');
  }
  return detached;
}

function validateRootArgument(root) {
  if (typeof root !== 'string') {
    fail('ERR_ROOT_INVALID', 'root must be an absolute canonical directory path string');
  }
  if (root.length === 0 || root.length > 4096) {
    fail('ERR_ROOT_INVALID', 'root length is not acceptable');
  }
  if (root.includes('\u0000')) {
    fail('ERR_ROOT_INVALID', 'root must not contain NUL');
  }
  if (!root.startsWith('/')) {
    fail('ERR_ROOT_INVALID', 'root must be an absolute path');
  }
}

/* ------------------------------------------------------------------------- *
 * Root canonicalization and confinement.
 * ------------------------------------------------------------------------- */

function lstatRootSync(root) {
  let stats;
  try {
    stats = fs.lstatSync(root);
  } catch (error) {
    fail('ERR_ROOT_UNAVAILABLE', 'root is not an accessible directory', error);
  }
  if (stats.isSymbolicLink()) {
    fail('ERR_ROOT_SYMLINK', 'root must not be a symbolic link');
  }
  if (!stats.isDirectory()) {
    fail('ERR_ROOT_NOT_DIRECTORY', 'root must be a directory');
  }
  assertMode(stats, DIRECTORY_MODE, 'ERR_DIRECTORY_MODE', 'root must have mode 0700');
  return stats;
}

function realpathRootSync(root) {
  let real;
  try {
    real = fs.realpathSync(root);
  } catch (error) {
    fail('ERR_ROOT_UNAVAILABLE', 'root realpath could not be resolved', error);
  }
  if (typeof real !== 'string' || real.length === 0) {
    fail('ERR_ROOT_UNAVAILABLE', 'root realpath could not be resolved');
  }
  return real;
}

/**
 * Resolve the canonical real root and enforce input === resolve === realpath.
 * Returns the canonical root string.
 */
function resolveCanonicalRootSync(root) {
  validateRootArgument(root);
  // Normalize without path module import side effects.
  const normalized = normalizeAbsolutePath(root);
  if (normalized !== root) {
    fail('ERR_ROOT_NOT_CANONICAL', 'root must already be a canonical absolute path');
  }
  lstatRootSync(root);
  const real = realpathRootSync(root);
  if (real !== root) {
    fail('ERR_ROOT_NOT_CANONICAL', 'root must not traverse symlinks or contain non-canonical segments');
  }
  return real;
}

/**
 * Minimal absolute-path normalizer: rejects '.', '..', empty segments,
 * duplicate separators, and trailing separators. Mirrors Node path.resolve
 * for the restricted absolute-path input space.
 */
function normalizeAbsolutePath(input) {
  if (input === '/') return '/';
  const segments = input.split('/');
  if (segments.at(0) !== '') return null;
  const out = [];
  for (let i = 1; i < segments.length; i += 1) {
    const segment = segments.at(i);
    if (segment === '') {
      if (i === segments.length - 1) return null; // trailing slash
      return null; // duplicate separators
    }
    if (segment === '.' || segment === '..') return null;
    if (segment.includes('\u0000')) return null;
    out.push(segment);
  }
  if (out.length === 0) return '/';
  return '/' + out.join('/');
}

/* ------------------------------------------------------------------------- *
 * Derived layout.
 * ------------------------------------------------------------------------- */

/** Validate the (already normalized) root/ref pair into a confined final path. */
function deriveFinalPath(root, ref) {
  if (!HEX64_RE.test(ref.sha256)) {
    fail('ERR_REF_INVALID', 'ref.sha256 must be a lowercase 64-hex string');
  }
  const first2 = ref.sha256.slice(0, 2);
  const rest62 = ref.sha256.slice(2);
  if (!HEX2_RE.test(first2) || rest62.length !== 62 || !/^[0-9a-f]{62}$/.test(rest62)) {
    fail('ERR_REF_INVALID', 'ref.sha256 must be a lowercase 64-hex string');
  }
  const recordsDir = root === '/' ? '/records' : root + '/' + SEGMENT_RECORDS;
  const shaDir = recordsDir + '/' + SEGMENT_SHA256;
  const shardDir = shaDir + '/' + first2;
  const finalPath = shardDir + '/' + rest62 + RECORD_SUFFIX;
  return Object.freeze({
    root: root,
    recordsDir: recordsDir,
    shaDir: shaDir,
    shardDir: shardDir,
    finalPath: finalPath,
  });
}

/** Ensure a candidate path is textually confined beneath root. */
function assertConfined(root, candidate) {
  if (root === '/') {
    if (!candidate.startsWith('/')) {
      fail('ERR_PATH_UNCONFINED', 'derived path escaped the canonical root');
    }
    return;
  }
  if (candidate !== root && !candidate.startsWith(root + '/')) {
    fail('ERR_PATH_UNCONFINED', 'derived path escaped the canonical root');
  }
}

function assertRegularFileStat(stats, code, message) {
  if (stats.isSymbolicLink()) {
    fail(code, message);
  }
  if (!stats.isFile()) {
    fail(code, message);
  }
}

function assertDirectoryStatSync(path, code, message) {
  let stats;
  try {
    stats = fs.lstatSync(path, { bigint: false, throwIfNoEntry: false });
  } catch (error) {
    fail(code, message, error);
  }
  if (stats === undefined) {
    fail(code, message);
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    fail(code, message);
  }
  return stats;
}

function assertMode(stats, expectedMode, code, message) {
  const mode = stats.mode & 0o7777;
  if (mode !== expectedMode) {
    fail(code, message);
  }
}

function verifyExistingDirectoryCandidateSync(root, targetPath, label) {
  assertConfined(root, targetPath);
  let candidate;
  try {
    candidate = fs.lstatSync(targetPath, { bigint: false, throwIfNoEntry: false });
  } catch (error) {
    fail('ERR_DIRECTORY_STAT', label + ' could not be inspected', error);
  }
  if (candidate === undefined) return false;
  if (candidate.isSymbolicLink() || !candidate.isDirectory()) {
    fail('ERR_DIRECTORY_UNSAFE', label + ' must be a real non-symlink directory');
  }
  assertMode(candidate, DIRECTORY_MODE, 'ERR_DIRECTORY_MODE', label + ' must have mode 0700');
  let descriptor;
  try {
    descriptor = fs.openSync(targetPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  } catch (error) {
    fail('ERR_DIRECTORY_OPEN', label + ' could not be opened safely', error);
  }
  try {
    let stats;
    try {
      stats = fs.fstatSync(descriptor);
    } catch (error) {
      fail('ERR_DIRECTORY_STAT', label + ' descriptor could not be inspected', error);
    }
    if (!stats.isDirectory() || stats.dev !== candidate.dev || stats.ino !== candidate.ino) {
      fail('ERR_DIRECTORY_RACE', label + ' changed identity between inspection and open');
    }
    assertMode(stats, DIRECTORY_MODE, 'ERR_DIRECTORY_MODE', label + ' descriptor must have mode 0700');
  } finally {
    try {
      fs.closeSync(descriptor);
    } catch (error) {
      fail('ERR_DIRECTORY_CLOSE', 'directory descriptor close failed', error);
    }
  }
  return true;
}

function verifyExistingDerivedDirectoriesSync(root, derived) {
  const candidates = [
    { path: derived.recordsDir, label: 'records directory' },
    { path: derived.shaDir, label: 'sha256 directory' },
    { path: derived.shardDir, label: 'shard directory' },
  ];
  for (const candidate of candidates) {
    if (!verifyExistingDirectoryCandidateSync(root, candidate.path, candidate.label)) return;
  }
}

/* ------------------------------------------------------------------------- *
 * recordPath — public synchronous API.
 * ------------------------------------------------------------------------- */

/**
 * Validate root and ref and return the confined final record path.
 * Creates nothing.
 */
export function recordPath(root, ref) {
  const canonicalRoot = resolveCanonicalRootSync(root);
  const detached = validateAndDetachRef(ref);
  const derived = deriveFinalPath(canonicalRoot, detached);
  assertConfined(canonicalRoot, derived.finalPath);
  verifyExistingDerivedDirectoriesSync(canonicalRoot, derived);
  return derived.finalPath;
}

/* ------------------------------------------------------------------------- *
 * Confined filesystem helpers (async).
 * ------------------------------------------------------------------------- */

async function lstatNoFollow(target) {
  try {
    return await fs.promises.lstat(target);
  } catch (error) {
    if (error && error.code === 'ENOENT') return undefined;
    fail('ERR_STAT_FAILED', 'unable to inspect derived path', error);
  }
}

async function verifyDirectoryCandidate(root, targetPath, label) {
  assertConfined(root, targetPath);
  const candidate = await lstatNoFollow(targetPath);
  if (candidate === undefined || candidate.isSymbolicLink() || !candidate.isDirectory()) {
    fail('ERR_DIRECTORY_UNSAFE', label + ' must be a real non-symlink directory');
  }
  assertMode(candidate, DIRECTORY_MODE, 'ERR_DIRECTORY_MODE', label + ' must have mode 0700');
  let handle;
  try {
    handle = await fs.promises.open(targetPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  } catch (error) {
    fail('ERR_DIRECTORY_OPEN', label + ' could not be opened safely', error);
  }
  try {
    let descriptor;
    try {
      descriptor = await handle.stat();
    } catch (error) {
      fail('ERR_DIRECTORY_STAT', label + ' descriptor could not be inspected', error);
    }
    if (!descriptor.isDirectory()) {
      fail('ERR_DIRECTORY_UNSAFE', label + ' descriptor must identify a directory');
    }
    assertMode(descriptor, DIRECTORY_MODE, 'ERR_DIRECTORY_MODE', label + ' descriptor must have mode 0700');
    if (descriptor.dev !== candidate.dev || descriptor.ino !== candidate.ino) {
      fail('ERR_DIRECTORY_RACE', label + ' changed identity between inspection and open');
    }
  } finally {
    try {
      await handle.close();
    } catch (error) {
      fail('ERR_DIRECTORY_CLOSE', 'directory descriptor close failed', error);
    }
  }
  await verifyRealpathConfinement(root, targetPath, label);
}

/**
 * Ensure one derived directory: real, non-symlink, mode 0700, and confined.
 * Creates it top-down with mode 0700 when missing and fsyncs the new directory
 * and its parent immediately.
 */
async function ensureDirectory(root, parentPath, targetPath, label) {
  assertConfined(root, targetPath);
  const existing = await lstatNoFollow(targetPath);
  if (existing !== undefined) {
    if (existing.isSymbolicLink() || !existing.isDirectory()) {
      fail('ERR_DIRECTORY_UNSAFE', label + ' must be a real non-symlink directory');
    }
    assertMode(existing, DIRECTORY_MODE, 'ERR_DIRECTORY_MODE', label + ' must have mode 0700');
    await verifyDirectoryCandidate(root, targetPath, label);
    return { created: false };
  }

  let created = false;
  try {
    await fs.promises.mkdir(targetPath, { mode: DIRECTORY_MODE, recursive: false });
    created = true;
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      created = false;
    } else {
      fail('ERR_DIRECTORY_CREATE', label + ' could not be created', error);
    }
  }

  const stats = await lstatNoFollow(targetPath);
  if (stats === undefined) {
    fail('ERR_DIRECTORY_MISSING', label + ' is missing after creation');
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    fail('ERR_DIRECTORY_UNSAFE', label + ' must be a real non-symlink directory');
  }
  assertMode(stats, DIRECTORY_MODE, 'ERR_DIRECTORY_MODE', label + ' must have mode 0700');
  await verifyDirectoryCandidate(root, targetPath, label);

  if (created) {
    await fsyncDirectory(targetPath, 'ERR_FSYNC_FAILED');
    await fsyncDirectory(parentPath, 'ERR_FSYNC_FAILED');
  }
  return { created: created };
}

async function verifyRealpathConfinement(root, targetPath, label) {
  let real;
  try {
    real = await fs.promises.realpath(targetPath);
  } catch (error) {
    fail('ERR_REALPATH_FAILED', label + ' could not be resolved canonically', error);
  }
  if (typeof real !== 'string' || real.length === 0) {
    fail('ERR_REALPATH_FAILED', label + ' could not be resolved canonically');
  }
  const expectedReal = root === '/' ? targetPath : targetPath;
  if (real !== expectedReal) {
    fail('ERR_PATH_UNCONFINED', label + ' escaped the canonical root');
  }
  assertConfined(root, real);
}

async function fsyncDirectory(targetPath, code) {
  let handle;
  try {
    handle = await fs.promises.open(targetPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  } catch (error) {
    fail(code, 'directory could not be opened for fsync', error);
  }
  try {
    await handle.sync();
  } catch (error) {
    fail(code, 'directory fsync failed', error);
  } finally {
    try {
      await handle.close();
    } catch (error) {
      fail('ERR_DIRECTORY_CLOSE', 'directory fsync descriptor close failed', error);
    }
  }
}

async function ensureDerivedDirectories(root, derived) {
  assertConfined(root, derived.recordsDir);
  assertConfined(root, derived.shaDir);
  assertConfined(root, derived.shardDir);
  await verifyDirectoryCandidate(root, root, 'root directory');
  await ensureDirectory(root, root, derived.recordsDir, 'records directory');
  await ensureDirectory(root, derived.recordsDir, derived.shaDir, 'sha256 directory');
  await ensureDirectory(root, derived.shaDir, derived.shardDir, 'shard directory');
}

async function verifyDerivedDirectories(root, derived) {
  await verifyDirectoryCandidate(root, root, 'root directory');
  await verifyDirectoryCandidate(root, derived.recordsDir, 'records directory');
  await verifyDirectoryCandidate(root, derived.shaDir, 'sha256 directory');
  await verifyDirectoryCandidate(root, derived.shardDir, 'shard directory');
}

/* ------------------------------------------------------------------------- *
 * Staging helpers.
 * ------------------------------------------------------------------------- */

const WRITE_CHUNK = 64 * 1024;

function normalizeLimits(limits) {
  if (limits === undefined) return undefined;
  const allowed = ['maxInputBytes', 'maxDepth', 'maxNodes', 'maxBytes', 'maxStringCodeUnits'];
  let detached;
  try {
    detached = isDetachedPlainRef(limits, allowed, true);
  } catch (error) {
    fail('ERR_LIMITS_INVALID', 'limits could not be inspected safely', error);
  }
  if (detached === false) {
    fail('ERR_LIMITS_INVALID', 'limits must be a plain object when provided');
  }
  return detached;
}

function enforceInputByteLimit(limits, byteLength) {
  if (limits === undefined) return;
  if (!('maxInputBytes' in limits)) return;
  const maximum = limits.maxInputBytes;
  if (typeof maximum !== 'number' || !Number.isSafeInteger(maximum) || maximum <= 0) {
    fail('ERR_LIMITS_INVALID', 'maxInputBytes must be a positive safe integer');
  }
  if (byteLength > maximum) {
    fail('ERR_INPUT_LIMIT', 'record byte length exceeds maxInputBytes');
  }
}

async function writeFull(handle, bytes) {
  if (!(bytes instanceof Uint8Array)) {
    fail('ERR_CANONICAL_BYTES', 'canonicalize did not return bytes');
  }
  let offset = 0;
  const total = bytes.byteLength;
  while (offset < total) {
    const end = Math.min(offset + WRITE_CHUNK, total);
    const slice = bytes.subarray(offset, end);
    let written;
    try {
      written = await handle.write(slice, 0, slice.byteLength, offset);
    } catch (error) {
      fail('ERR_WRITE_FAILED', 'record staging write failed', error);
    }
    if (!written || typeof written.bytesWritten !== 'number') {
      fail('ERR_WRITE_PROGRESS', 'record staging write made no measurable progress');
    }
    const advanced = written.bytesWritten;
    if (advanced !== slice.byteLength) {
      fail('ERR_WRITE_PROGRESS', 'record staging write progress was inconsistent');
    }
    offset += advanced;
  }
  if (offset !== total) {
    fail('ERR_WRITE_PROGRESS', 'record staging write did not complete');
  }
}

async function readFull(handle, size) {
  if (!Number.isSafeInteger(size) || size < 0) {
    fail('ERR_SIZE_INVALID', 'expected record size is not acceptable');
  }
  let stats;
  try {
    stats = await handle.stat();
  } catch (error) {
    fail('ERR_READ_STAT', 'record could not be inspected before reading', error);
  }
  if (!Number.isSafeInteger(stats.size) || stats.size !== size) {
    fail('ERR_RECORD_LENGTH', 'record byte length changed before reading');
  }
  const buffer = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    let read;
    try {
      read = await handle.read(buffer, offset, size - offset, offset);
    } catch (error) {
      fail('ERR_READ_FAILED', 'record read failed', error);
    }
    if (!read || typeof read.bytesRead !== 'number') {
      fail('ERR_READ_PROGRESS', 'record read made no measurable progress');
    }
    const advanced = read.bytesRead;
    if (!Number.isSafeInteger(advanced) || advanced < 0 || advanced > size - offset) {
      fail('ERR_READ_PROGRESS', 'record read progress was inconsistent');
    }
    if (advanced === 0) {
      fail('ERR_READ_PROGRESS', 'record read ended before the expected size');
    }
    offset += advanced;
  }
  return buffer;
}

function bytesEqual(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) return false;
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a.at(i) !== b.at(i)) return false;
  }
  return true;
}

function parseVerified(bytes, limits, expectedSha, expectedLength) {
  if (bytes.byteLength !== expectedLength) {
    fail('ERR_RECORD_LENGTH', 'record byte length does not match the expected reference');
  }
  const digest = sha256(bytes);
  if (typeof digest !== 'string' || digest !== expectedSha) {
    fail('ERR_RECORD_DIGEST', 'record digest does not match the expected reference');
  }
  let value;
  try {
    value = parseCanonical(bytes, limits);
  } catch (error) {
    fail('ERR_RECORD_NOT_CANONICAL', 'record bytes are not accepted canonical bytes', error);
  }
  return value;
}

/* ------------------------------------------------------------------------- *
 * persistCanonicalRecord.
 * ------------------------------------------------------------------------- */

function stagingNameFor(digest, suffix) {
  if (!HEX32_RE.test(suffix)) {
    fail('ERR_STAGING_NAME', 'staging suffix must be 32 lowercase hex characters');
  }
  return '.record-' + digest + '-' + suffix + '.tmp';
}

function secureRandomSuffix() {
  let buffer;
  try {
    buffer = randomBytes(16);
  } catch (error) {
    fail('ERR_RANDOM_UNAVAILABLE', 'a cryptographically secure random source is required', error);
  }
  if (!buffer || buffer.length !== 16) {
    fail('ERR_RANDOM_UNAVAILABLE', 'a cryptographically secure random source is required');
  }
  return buffer.toString('hex');
}

let stagingOpenQueue = Promise.resolve();

/**
 * Close a live directory handle, surfacing close failures as a stable error.
 */
async function closeDirectoryHandle(handle) {
  try {
    await handle.close();
  } catch (error) {
    fail('ERR_DIRECTORY_CLOSE', 'directory descriptor close failed', error);
  }
}

/**
 * Resolve an OS-supported stable alias for an open directory handle.
 *
 * Linux exposes /proc/self/fd/<fd>; macOS/darwin exposes /.vol/<dev>/<ino>.
 * The alias is derived from the descriptor identity, so no cwd and no
 * replaceable textual path participates in resolution. Unknown platforms
 * fail closed. The alias is validated against the live descriptor before it
 * is used.
 */
async function resolveStableDirectoryAlias(handle, directoryStats) {
  const platform = process.platform;
  if (platform === 'linux') {
    if (!Number.isSafeInteger(handle.fd) || handle.fd < 0) {
      fail('ERR_STAGING_ANCHOR', 'directory descriptor is not usable for a stable alias');
    }
    const alias = '/proc/self/fd/' + String(handle.fd);
    let aliasStats;
    try {
      aliasStats = await fs.promises.stat(alias);
    } catch (error) {
      fail('ERR_STAGING_ANCHOR', 'stable staging anchor is unavailable', error);
    }
    if (
      !aliasStats.isDirectory() ||
      aliasStats.dev !== directoryStats.dev ||
      aliasStats.ino !== directoryStats.ino
    ) {
      fail('ERR_STAGING_ANCHOR', 'stable staging anchor does not identify the verified shard');
    }
    return alias;
  }
  if (platform === 'darwin' || platform === 'macos') {
    const dev = directoryStats.dev;
    const ino = directoryStats.ino;
    if (!Number.isSafeInteger(dev) || !Number.isSafeInteger(ino)) {
      fail('ERR_STAGING_ANCHOR', 'shard identity is not usable for a stable alias');
    }
    const alias = '/.vol/' + String(dev) + '/' + String(ino);
    let aliasStats;
    try {
      aliasStats = await fs.promises.stat(alias);
    } catch (error) {
      fail('ERR_STAGING_ANCHOR', 'stable staging anchor is unavailable', error);
    }
    if (
      !aliasStats.isDirectory() ||
      aliasStats.dev !== directoryStats.dev ||
      aliasStats.ino !== directoryStats.ino
    ) {
      fail('ERR_STAGING_ANCHOR', 'stable staging anchor does not identify the verified shard');
    }
    return alias;
  }
  fail('ERR_STAGING_ANCHOR', 'no supported stable staging anchor on this platform');
}

async function openStagingExclusiveAnchored(root, derived, stagingName) {
  const activeFlags = fs.constants.O_RDWR | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW;
  let directoryHandle;
  let childHandle;
  try {
    // Inspect the shard path textually first, then open it no-follow and prove
    // the descriptor matches: this pins the already verified shard inode.
    const expectedShard = await lstatNoFollow(derived.shardDir);
    if (expectedShard === undefined || expectedShard.isSymbolicLink() || !expectedShard.isDirectory()) {
      fail('ERR_DIRECTORY_UNSAFE', 'shard directory must be a real non-symlink directory');
    }
    assertMode(expectedShard, DIRECTORY_MODE, 'ERR_DIRECTORY_MODE', 'shard directory must have mode 0700');

    try {
      directoryHandle = await fs.promises.open(derived.shardDir, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    } catch (error) {
      fail('ERR_DIRECTORY_OPEN', 'shard directory could not be opened safely', error);
    }

    let directoryStats;
    try {
      directoryStats = await directoryHandle.stat();
    } catch (error) {
      fail('ERR_DIRECTORY_STAT', 'shard directory descriptor could not be inspected', error);
    }
    if (!directoryStats.isDirectory()) {
      fail('ERR_DIRECTORY_UNSAFE', 'shard directory descriptor must identify a directory');
    }
    assertMode(directoryStats, DIRECTORY_MODE, 'ERR_DIRECTORY_MODE', 'shard directory descriptor must have mode 0700');
    if (directoryStats.dev !== expectedShard.dev || directoryStats.ino !== expectedShard.ino) {
      fail('ERR_DIRECTORY_RACE', 'shard directory changed identity between inspection and open');
    }

    const alias = await resolveStableDirectoryAlias(directoryHandle, directoryStats);
    const anchoredPath = alias + '/' + stagingName;

    try {
      childHandle = await fs.promises.open(anchoredPath, activeFlags, FILE_MODE);
    } catch (error) {
      if (error instanceof RecordStoreError) throw error;
      fail('ERR_STAGING_OPEN', 'exclusive staging file could not be created', error);
    }

    // Before any canonical bytes are written, prove the child belongs to the
    // verified shard inode and that the anchor still identifies that shard.
    let childStats;
    try {
      childStats = await childHandle.stat();
    } catch (error) {
      fail('ERR_STAGING_STAT', 'staged file could not be inspected', error);
    }
    if (childStats.isSymbolicLink() || !childStats.isFile()) {
      fail('ERR_STAGING_UNSAFE', 'staged file must be a regular file');
    }
    assertMode(childStats, FILE_MODE, 'ERR_STAGING_MODE', 'staged file must have mode 0600');
    if (childStats.nlink !== 1) {
      fail('ERR_STAGING_LINKS', 'staging inode must have exactly one link before publication');
    }

    let anchoredChild;
    try {
      anchoredChild = await fs.promises.lstat(anchoredPath);
    } catch (error) {
      fail('ERR_STAGING_STAT', 'staged file could not be inspected', error);
    }
    if (anchoredChild.isSymbolicLink() || !anchoredChild.isFile()) {
      fail('ERR_STAGING_UNSAFE', 'staged file must be a regular file');
    }
    assertMode(anchoredChild, FILE_MODE, 'ERR_STAGING_MODE', 'staged file must have mode 0600');
    if (anchoredChild.dev !== childStats.dev || anchoredChild.ino !== childStats.ino) {
      fail('ERR_STAGING_SUBSTITUTED', 'staged file changed identity after creation');
    }

    let anchoredParent;
    try {
      anchoredParent = await fs.promises.stat(alias);
    } catch (error) {
      fail('ERR_STAGING_ANCHOR', 'stable staging anchor could not be re-validated', error);
    }
    if (
      !anchoredParent.isDirectory() ||
      anchoredParent.dev !== directoryStats.dev ||
      anchoredParent.ino !== directoryStats.ino
    ) {
      fail('ERR_STAGING_ANCHOR', 'stable staging anchor changed identity during staging creation');
    }

    // The child is proven anchored; the directory handle is no longer needed.
    await closeDirectoryHandle(directoryHandle);
    directoryHandle = undefined;
  } catch (error) {
    const closeFailures = [];
    if (directoryHandle !== undefined) {
      try {
        await directoryHandle.close();
      } catch (closeError) {
        closeFailures.push({
          code: closeError instanceof RecordStoreError ? closeError.code : 'ERR_DIRECTORY_CLOSE',
          message: closeError instanceof RecordStoreError ? closeError.message : 'directory descriptor close failed',
          error: closeError,
        });
      }
      directoryHandle = undefined;
    }
    if (childHandle !== undefined) {
      try {
        await childHandle.close();
      } catch (closeError) {
        closeFailures.push({
          code: closeError instanceof RecordStoreError ? closeError.code : 'ERR_STAGING_CLOSE',
          message: closeError instanceof RecordStoreError ? closeError.message : 'staging record close failed',
          error: closeError,
        });
      }
      childHandle = undefined;
    }
    if (closeFailures.length > 0) {
      const firstFailure = closeFailures[0];
      const aggregateErrors = [error];
      for (const failure of closeFailures) {
        aggregateErrors.push(failure.error);
      }
      throw new RecordStoreError(firstFailure.code, firstFailure.message, {
        cause: new AggregateError(aggregateErrors, firstFailure.message),
      });
    }
    if (error instanceof RecordStoreError) throw error;
    fail('ERR_STAGING_OPEN', 'exclusive staging file could not be created', error);
  }

  try {
    await verifyDerivedDirectories(root, derived);
  } catch (error) {
    try {
      await childHandle.close();
    } catch (closeError) {
      throw new RecordStoreError('ERR_STAGING_CLOSE', 'staging record close failed', {
        cause: new AggregateError([error, closeError], 'staging record close failed'),
      });
    }
    throw error;
  }
  return childHandle;
}

function openStagingExclusive(root, derived, stagingName) {
  const operation = stagingOpenQueue.then(() => openStagingExclusiveAnchored(root, derived, stagingName));
  stagingOpenQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

async function verifyStagedFile(handle, stagingPath, expectedBytes, ref, limits) {
  let stats;
  try {
    stats = await handle.stat();
  } catch (error) {
    fail('ERR_STAGING_STAT', 'staged file could not be inspected', error);
  }
  if (stats.isSymbolicLink()) {
    fail('ERR_STAGING_UNSAFE', 'staged file must not be a symbolic link');
  }
  if (!stats.isFile()) {
    fail('ERR_STAGING_UNSAFE', 'staged file must be a regular file');
  }
  assertMode(stats, FILE_MODE, 'ERR_STAGING_MODE', 'staged file must have mode 0600');

  const onDiskSize = stats.size;
  if (!Number.isSafeInteger(onDiskSize) || onDiskSize < 0) {
    fail('ERR_STAGING_SIZE', 'staged file size is not acceptable');
  }
  if (onDiskSize !== expectedBytes.byteLength || onDiskSize !== ref.byteLength) {
    fail('ERR_STAGING_SIZE', 'staged file doesn\'t match the canonical byte length');
  }

  const bytes = await readFull(handle, onDiskSize);
  if (!bytesEqual(bytes, expectedBytes)) {
    fail('ERR_STAGING_CONTENT', 'staged file bytes are not the exact expected bytes');
  }
  parseVerified(bytes, limits, ref.sha256, ref.byteLength);

  try {
    await handle.sync();
  } catch (error) {
    fail('ERR_FSYNC_FAILED', 'staging fsync failed', error);
  }
}

async function linkStagingToFinal(stagingPath, finalPath) {
  try {
    await fs.promises.link(stagingPath, finalPath);
    return { created: true };
  } catch (error) {
    if (error && error.code === 'EEXIST') {
      return { created: false };
    }
    fail('ERR_PUBLISH_FAILED', 'hard-link publication failed', error);
  }
}

async function verifyStagingPathAfterPublish(root, stagingPath, expectedStats) {
  assertConfined(root, stagingPath);
  const pathStats = await lstatNoFollow(stagingPath);
  if (pathStats === undefined || pathStats.isSymbolicLink() || !pathStats.isFile()) {
    fail('ERR_STAGING_SUBSTITUTED', 'staging path changed after publication');
  }
  assertMode(pathStats, FILE_MODE, 'ERR_STAGING_MODE', 'staged file must have mode 0600');
  if (pathStats.dev !== expectedStats.dev || pathStats.ino !== expectedStats.ino) {
    fail('ERR_STAGING_SUBSTITUTED', 'staging path changed identity after publication');
  }
}

async function verifyFinalAfterPublish(handle, stats, stagingHandle, stagingStats, root, finalPath, expectedBytes, ref, limits, checkSharedInode) {
  if (stats.isSymbolicLink() || !stats.isFile()) {
    fail('ERR_FINAL_UNSAFE', 'published record must be a regular file');
  }
  assertMode(stats, FILE_MODE, 'ERR_FINAL_MODE', 'published record must have mode 0600');

  if (checkSharedInode) {
    if (stats.dev !== stagingStats.dev || stats.ino !== stagingStats.ino) {
      fail('ERR_PUBLISH_INODE', 'published record is not the same inode as its staging file');
    }
    if (stats.nlink !== 2) {
      fail('ERR_PUBLISH_LINKS', 'published record inode must have exactly two links');
    }
  } else {
    if (stats.nlink !== 2) {
      fail('ERR_FINAL_LINKS', 'existing record inode must have exactly two links');
    }
  }

  if (!Number.isSafeInteger(stats.size) || stats.size !== ref.byteLength) {
    fail('ERR_FINAL_SIZE', 'published record size does not match the expected reference');
  }

  const bytes = await readFull(handle, stats.size);
  if (!bytesEqual(bytes, expectedBytes)) {
    fail('ERR_FINAL_CONTENT', 'published record bytes are not the exact expected bytes');
  }
  parseVerified(bytes, limits, ref.sha256, ref.byteLength);

  await verifyRealpathConfinement(root, finalPath, 'published record');

  try {
    await handle.sync();
  } catch (error) {
    fail('ERR_FSYNC_FAILED', 'published record fsync failed', error);
  }
}

async function persistInternal(root, value, limits, suffix) {
  const canonicalRoot = resolveCanonicalRootSync(root);
  const normalizedLimits = normalizeLimits(limits);

  let bytes;
  try {
    bytes = canonicalize(value, normalizedLimits);
  } catch (error) {
    fail('ERR_NOT_CANONICALIZABLE', 'value could not be canonicalized under the provided limits', error);
  }
  if (!(bytes instanceof Uint8Array)) {
    fail('ERR_CANONICAL_BYTES', 'canonicalize did not return bytes');
  }

  let ref;
  try {
    ref = recordRef(bytes);
  } catch (error) {
    fail('ERR_DIGEST_UNAVAILABLE', 'record reference could not be computed', error);
  }
  const detachedRef = isDetachedPlainRef(ref);
  if (detachedRef === false) {
    fail('ERR_DIGEST_UNAVAILABLE', 'record reference handed back has an unexpected shape');
  }

  const derived = deriveFinalPath(canonicalRoot, detachedRef);
  assertConfined(canonicalRoot, derived.finalPath);

  await ensureDerivedDirectories(canonicalRoot, derived);

  const stagingName = stagingNameFor(detachedRef.sha256, suffix);
  const stagingPath = derived.shardDir + '/' + stagingName;
  assertConfined(canonicalRoot, stagingPath);

  let stagingHandle;
  try {
    stagingHandle = await openStagingExclusive(canonicalRoot, derived, stagingName);
  } catch (error) {
    throw error instanceof RecordStoreError ? error : new RecordStoreError('ERR_STAGING_OPEN', 'exclusive staging file could not be created', { cause: error });
  }

  try {
    await writeFull(stagingHandle, bytes);
    await verifyStagedFile(stagingHandle, stagingPath, bytes, detachedRef, normalizedLimits);

    let stagingStats;
    try {
      stagingStats = await stagingHandle.stat();
    } catch (error) {
      fail('ERR_STAGING_STAT', 'staged file could not be inspected', error);
    }
    if (stagingStats.isSymbolicLink() || !stagingStats.isFile()) {
      fail('ERR_STAGING_UNSAFE', 'staged file must be a regular file');
    }
    if (stagingStats.nlink !== 1) {
      fail('ERR_STAGING_LINKS', 'staging inode must have exactly one link before publication');
    }

    const published = await linkStagingToFinal(stagingPath, derived.finalPath);
    await verifyStagingPathAfterPublish(canonicalRoot, stagingPath, stagingStats);

    let finalHandle;
    try {
      finalHandle = await fs.promises.open(derived.finalPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    } catch (error) {
      fail('ERR_FINAL_OPEN', 'published record could not be opened for verification', error);
    }

    try {
      let finalStats;
      try {
        finalStats = await finalHandle.stat();
      } catch (error) {
        fail('ERR_FINAL_STAT', 'published record could not be inspected', error);
      }

      if (published.created) {
        await verifyFinalAfterPublish(
          finalHandle,
          finalStats,
          stagingHandle,
          stagingStats,
          canonicalRoot,
          derived.finalPath,
          bytes,
          detachedRef,
          normalizedLimits,
          true,
        );
      } else {
        // Race loss: the existing final was created by another winner; the
        // losing staging inode stays single-link and untouched.
        let losingStats;
        try {
          losingStats = await stagingHandle.stat();
        } catch (error) {
          fail('ERR_STAGING_STAT', 'staged file could not be inspected', error);
        }
        if (losingStats.isSymbolicLink() || !losingStats.isFile()) {
          fail('ERR_STAGING_UNSAFE', 'staged file must be a regular file');
        }
        if (losingStats.nlink !== 1) {
          fail('ERR_STAGING_LINKS', 'losing staging inode must remain single-link');
        }
        if (losingStats.dev === finalStats.dev && losingStats.ino === finalStats.ino) {
          fail('ERR_PUBLISH_INODE', 'losing staging inode must remain separate from the existing record');
        }
        await verifyFinalAfterPublish(
          finalHandle,
          finalStats,
          stagingHandle,
          losingStats,
          canonicalRoot,
          derived.finalPath,
          bytes,
          detachedRef,
          normalizedLimits,
          false,
        );
      }
    } finally {
      try {
        await finalHandle.close();
      } catch (error) {
        fail('ERR_FINAL_CLOSE', 'published record close failed', error);
      }
    }

    // Bottom-up directory fsync: final parent shard, sha256, records, root.
    await fsyncDirectory(derived.shardDir, 'ERR_FSYNC_FAILED');
    await fsyncDirectory(derived.shaDir, 'ERR_FSYNC_FAILED');
    await fsyncDirectory(derived.recordsDir, 'ERR_FSYNC_FAILED');
    await fsyncDirectory(canonicalRoot, 'ERR_FSYNC_FAILED');

    return Object.freeze({
      created: published.created,
      bytes: detachedRef.byteLength,
      ref: Object.freeze({ sha256: detachedRef.sha256, byteLength: detachedRef.byteLength }),
      path: derived.finalPath,
    });
  } finally {
    try {
      await stagingHandle.close();
    } catch (error) {
      fail('ERR_STAGING_CLOSE', 'staging record close failed', error);
    }
  }
}

/**
 * Canonicalize `value`, derive its detached ref, and persist the exact bytes
 * at the immutable final path. Retains the staging hard link on every path.
 */
export async function persistCanonicalRecord(argument) {
  const detachedArgument = validateObjectArgument('argument', argument, ['root', 'value', 'limits']);
  const suffix = secureRandomSuffix();
  return persistInternal(detachedArgument.root, detachedArgument.value, detachedArgument.limits, suffix);
}

/* ------------------------------------------------------------------------- *
 * readCanonicalRecord.
 * ------------------------------------------------------------------------- */

async function readInternal(root, ref, limits) {
  const canonicalRoot = resolveCanonicalRootSync(root);
  const detachedRef = validateAndDetachRef(ref);
  const normalizedLimits = normalizeLimits(limits);
  enforceInputByteLimit(normalizedLimits, detachedRef.byteLength);

  const derived = deriveFinalPath(canonicalRoot, detachedRef);
  assertConfined(canonicalRoot, derived.finalPath);

  await verifyDerivedDirectories(canonicalRoot, derived);

  // Read never creates derived directories; a missing record is a plain miss.
  const finalStats = await lstatNoFollow(derived.finalPath);
  if (finalStats === undefined) {
    fail('ERR_RECORD_NOT_FOUND', 'record does not exist');
  }
  if (finalStats.isSymbolicLink() || !finalStats.isFile()) {
    fail('ERR_FINAL_UNSAFE', 'record must be a regular non-symlink file');
  }
  assertMode(finalStats, FILE_MODE, 'ERR_FINAL_MODE', 'record must have mode 0600');
  if (finalStats.nlink !== 2) {
    fail('ERR_FINAL_LINKS', 'record inode must have exactly two links');
  }

  let handle;
  try {
    handle = await fs.promises.open(derived.finalPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      fail('ERR_RECORD_NOT_FOUND', 'record does not exist', error);
    }
    fail('ERR_FINAL_OPEN', 'record could not be opened', error);
  }

  try {
    let stats;
    try {
      stats = await handle.stat();
    } catch (error) {
      fail('ERR_FINAL_STAT', 'record could not be inspected', error);
    }
    if (stats.isSymbolicLink() || !stats.isFile()) {
      fail('ERR_FINAL_UNSAFE', 'record must be a regular non-symlink file');
    }
    assertMode(stats, FILE_MODE, 'ERR_FINAL_MODE', 'record must have mode 0600');
    if (stats.nlink !== 2) {
      fail('ERR_FINAL_LINKS', 'record inode must have exactly two links');
    }
    if (stats.dev !== finalStats.dev || stats.ino !== finalStats.ino) {
      fail('ERR_FINAL_RACE', 'record changed identity between inspection and open');
    }
    if (!Number.isSafeInteger(stats.size) || stats.size !== detachedRef.byteLength) {
      fail('ERR_FINAL_SIZE', 'record size does not match the expected reference');
    }

    const bytes = await readFull(handle, stats.size);
    const value = parseVerified(bytes, normalizedLimits, detachedRef.sha256, detachedRef.byteLength);

    await verifyRealpathConfinement(canonicalRoot, derived.finalPath, 'record');

    return Object.freeze({
      value: value,
      bytes: detachedRef.byteLength,
      ref: Object.freeze({ sha256: detachedRef.sha256, byteLength: detachedRef.byteLength }),
      path: derived.finalPath,
    });
  } finally {
    try {
      await handle.close();
    } catch (error) {
      fail('ERR_FINAL_CLOSE', 'record close failed', error);
    }
  }
}

/**
 * Open the immutable final record no-follow, verify it fully, and return the
 * decoded value with its detached ref. Performs no writes or repairs.
 */
export async function readCanonicalRecord(argument) {
  const detachedArgument = validateObjectArgument('argument', argument, ['root', 'ref', 'limits']);
  return readInternal(detachedArgument.root, detachedArgument.ref, detachedArgument.limits);
}
