/**
 * Sprint 03 LCIM worktree ownership marker (SOL-S03-FINAL-001).
 *
 * A genuine LCIM-created worktree is proven by an ADDITIONAL independent
 * ownership proof beyond the registry: a controller-created,
 * worktree-specific marker written inside THE LINKED WORKTREE'S OWN Git
 * administrative directory (its per-worktree gitdir).
 *
 * Why this exists: the registry lifecycle (worktreeId, registered path,
 * workUnitId, base), git registration, and a matching detached HEAD/base
 * can ALL be manufactured by appending a syntactically valid forged
 * CREATED event. Registry data alone must NEVER establish LCIM ownership
 * of a foreign worktree.
 *
 * Marker placement rules (enforced here, never caller-supplied):
 *
 * - The marker lives in the per-worktree Git admin directory resolved
 *   through GIT (`git rev-parse --absolute-git-dir` executed inside the
 *   worktree); the admin dir's own git-written `commondir`/`gitdir` files
 *   must prove it belongs to this repository and to EXACTLY this worktree.
 * - When the checkout directory is GONE (SOL-S03-R3-001), the per-worktree
 *   Git admin directory is derived from REPOSITORY-OWNED Git metadata
 *   (`git worktree list --porcelain` registration + `<common>/worktrees/*`
 *   enumeration, cross-checked via git-written `commondir`/`gitdir`/`HEAD`
 *   files) — never from the registry, worker data, or caller input — and
 *   the genuine marker must exist inside that exact derived admin
 *   directory before any prune/removal/REMOVED may happen.
 * - It is never the checked-out working tree, never a tracked repository
 *   file, never an arbitrary caller path, never another linked worktree's
 *   gitdir, and never the common Git directory.
 * - The resolved admin directory must be strictly inside the repository
 *   common Git directory and must NOT equal it (a linked worktree's admin
 *   identity, not the main worktree's).
 *
 * Marker contents (public-safe structured local metadata):
 *   schemaName/schemaVersion (marker format version)
 *   markerId      `lcim_mk_<32hex>` controller-generated random identity
 *   worktreeId    `lcim_wt_<32hex>`
 *   workUnitId    `lcim_wu_<32hex>`
 *   worktreePath  canonical absolute worktree path
 *   baseSha       expected/base 40-hex sha
 *   createdAt     ISO-8601
 *
 * The marker is Sprint-03 controller evidence, NOT worker authority: it is
 * an ADDITIONAL proof layered on the existing registry, git-registration,
 * base, path, and persisted-evidence checks — it never replaces them, and
 * it never authorizes anything by itself. The registry CREATED event
 * references the marker identity, but registry data alone cannot
 * synthesize the marker file inside the foreign worktree's gitdir.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { isPathWithin, resolveGitCommonDir } from '../config/runtime-path.mjs';
import { runGit } from './exec.mjs';
import { FULL_SHA_PATTERN } from './base.mjs';
import { normalizePath } from './state.mjs';
import { WorktreeSafetyError } from './errors.mjs';

/** Marker file name inside the per-worktree Git admin directory. */
export const OWNERSHIP_MARKER_FILE = 'lcim-ownership.json';

/** Marker format identity. */
export const OWNERSHIP_MARKER_SCHEMA_NAME = 'lcim.worktree-ownership-marker';
export const OWNERSHIP_MARKER_SCHEMA_VERSION = '1.0.0';

/** Controller-generated ownership marker identities: `lcim_mk_<32 hex>`. */
export const OWNERSHIP_MARKER_ID_PATTERN = /^lcim_mk_[0-9a-f]{32}$/;

const WORKTREE_ID_PATTERN = /^lcim_wt_[0-9a-f]{32}$/;
const WORK_UNIT_ID_PATTERN = /^lcim_wu_[0-9a-f]{32}$/;
const ISO_AT_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$/;
const MARKER_KEYS = Object.freeze([
  'schemaName',
  'schemaVersion',
  'markerId',
  'worktreeId',
  'workUnitId',
  'worktreePath',
  'baseSha',
  'createdAt',
]);

/** Fresh random ownership marker identity (controller-generated nonce). */
export function generateOwnershipMarkerId() {
  return `lcim_mk_${randomBytes(16).toString('hex')}`;
}

/** True for `lcim_mk_<32hex>` marker identities. */
export function isValidOwnershipMarkerId(value) {
  return typeof value === 'string' && OWNERSHIP_MARKER_ID_PATTERN.test(value);
}

/**
 * Resolve the EXACT per-worktree Git administrative directory for a linked
 * worktree, through Git + canonical filesystem operations:
 *
 * 1. `git rev-parse --absolute-git-dir` executed INSIDE the worktree —
 *    this is the linked worktree's own gitdir (`<common>/worktrees/<name>`),
 *    never a caller-supplied path.
 * 2. The resolved directory must exist-canonicalize to a path strictly
 *    INSIDE the repository common Git directory and must NOT equal it
 *    (a linked worktree's admin identity is never the common dir and never
 *    a sibling filesystem path).
 * 3. The per-worktree admin directory is self-describing (files created by
 *    git itself): its `commondir` file must resolve to the repository
 *    common Git directory, and its `gitdir` file must resolve to exactly
 *    `<worktreeDir>/.git` — proving this is the administrative identity of
 *    EXACTLY this worktree, never another linked worktree's gitdir and
 *    never the common Git directory.
 *
 * Any failure throws WorktreeSafetyError (fail closed).
 *
 * @param {object} args
 * @param {string} args.worktreeDir - the linked worktree directory
 * @param {string} args.repoDir - main/parent worktree directory
 * @returns {string} canonical absolute per-worktree gitdir path
 */
export function resolveWorktreeGitAdminDir({ worktreeDir, repoDir }) {
  if (typeof worktreeDir !== 'string' || worktreeDir.length === 0) {
    throw new WorktreeSafetyError('cannot resolve the worktree Git admin directory: worktreeDir is required');
  }
  let raw;
  try {
    raw = runGit(worktreeDir, ['rev-parse', '--absolute-git-dir']).stdout.trim();
  } catch (err) {
    throw new WorktreeSafetyError(
      `cannot resolve the Git administrative directory of worktree ${worktreeDir}: ${err.message}`,
      { worktreeDir, cause: err },
    );
  }
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new WorktreeSafetyError(`git rev-parse --absolute-git-dir returned an empty result for worktree ${worktreeDir}`);
  }
  const adminDir = normalizePath(raw);
  const commonDir = resolveGitCommonDir(repoDir);
  if (normalizePath(adminDir) === normalizePath(commonDir)) {
    throw new WorktreeSafetyError(
      `refusing: the resolved Git administrative directory ${adminDir} IS the repository common Git directory ${commonDir}; only a linked worktree's own per-worktree admin directory is a valid ownership location`,
      { worktreeDir, adminDir, commonDir },
    );
  }
  if (!isPathWithin(commonDir, adminDir)) {
    throw new WorktreeSafetyError(
      `refusing: the resolved Git administrative directory ${adminDir} is OUTSIDE the repository common Git directory ${commonDir}; a marker there cannot be this worktree's own admin identity`,
      { worktreeDir, adminDir, commonDir },
    );
  }

  // Current Git administrative identity: the per-worktree admin dir is
  // self-describing (files written by git itself).
  //
  // (a) `commondir` must resolve to the repository common Git directory —
  //     proof that this is a per-worktree admin dir OF THIS REPOSITORY.
  const commondirFile = path.join(adminDir, 'commondir');
  let commondirRaw;
  try {
    commondirRaw = fs.readFileSync(commondirFile, 'utf8').trim();
  } catch (err) {
    throw new WorktreeSafetyError(
      `refusing: ${adminDir} is not a per-worktree Git admin directory (missing commondir file): ${err.message}`,
      { worktreeDir, adminDir, cause: err },
    );
  }
  if (normalizePath(path.resolve(adminDir, commondirRaw)) !== normalizePath(commonDir)) {
    throw new WorktreeSafetyError(
      `refusing: the resolved admin directory ${adminDir} belongs to a different repository (its commondir ${JSON.stringify(commondirRaw)} does not resolve to ${commonDir})`,
      { worktreeDir, adminDir, commondirRaw, commonDir },
    );
  }
  // (b) `gitdir` must resolve to exactly `<worktreeDir>/.git` — proof that
  //     this admin dir is the identity of EXACTLY this worktree, never a
  //     sibling linked worktree's gitdir.
  const gitdirFile = path.join(adminDir, 'gitdir');
  let gitdirRaw;
  try {
    gitdirRaw = fs.readFileSync(gitdirFile, 'utf8').trim();
  } catch (err) {
    throw new WorktreeSafetyError(
      `refusing: ${adminDir} is not a per-worktree Git admin directory (missing gitdir file): ${err.message}`,
      { worktreeDir, adminDir, cause: err },
    );
  }
  const expectedWorktreeDotGit = normalizePath(path.join(worktreeDir, '.git'));
  if (normalizePath(path.resolve(adminDir, gitdirRaw)) !== expectedWorktreeDotGit) {
    throw new WorktreeSafetyError(
      `refusing: the resolved admin directory ${adminDir} is ANOTHER worktree's gitdir (its gitdir file points at ${gitdirRaw}, not ${path.join(worktreeDir, '.git')}); a marker in another linked worktree's gitdir is never this worktree's ownership proof`,
      { worktreeDir, adminDir, gitdirRaw },
    );
  }
  return adminDir;
}

/**
 * Strictly parse + validate an ownership marker document. Any unknown
 * field, wrong schema/version, or malformed shape fails closed.
 * @returns {object} the validated marker
 */
export function parseWorktreeOwnershipMarker(raw) {
  const where = 'LCIM worktree ownership marker';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new WorktreeSafetyError(`${where} is not valid JSON: ${err.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new WorktreeSafetyError(`${where}: must be a JSON object`);
  }
  for (const key of Object.keys(parsed)) {
    if (!MARKER_KEYS.includes(key)) {
      throw new WorktreeSafetyError(`${where}: unknown field ${JSON.stringify(key)}`);
    }
  }
  if (parsed.schemaName !== OWNERSHIP_MARKER_SCHEMA_NAME) {
    throw new WorktreeSafetyError(`${where}: schemaName must be ${JSON.stringify(OWNERSHIP_MARKER_SCHEMA_NAME)}, got ${JSON.stringify(parsed.schemaName)}`);
  }
  if (parsed.schemaVersion !== OWNERSHIP_MARKER_SCHEMA_VERSION) {
    throw new WorktreeSafetyError(`${where}: schemaVersion must be ${JSON.stringify(OWNERSHIP_MARKER_SCHEMA_VERSION)}, got ${JSON.stringify(parsed.schemaVersion)}`);
  }
  if (!isValidOwnershipMarkerId(parsed.markerId)) {
    throw new WorktreeSafetyError(`${where}: invalid markerId ${JSON.stringify(parsed.markerId)}`);
  }
  if (typeof parsed.worktreeId !== 'string' || !WORKTREE_ID_PATTERN.test(parsed.worktreeId)) {
    throw new WorktreeSafetyError(`${where}: invalid worktreeId ${JSON.stringify(parsed.worktreeId)}`);
  }
  if (typeof parsed.workUnitId !== 'string' || !WORK_UNIT_ID_PATTERN.test(parsed.workUnitId)) {
    throw new WorktreeSafetyError(`${where}: invalid workUnitId ${JSON.stringify(parsed.workUnitId)}`);
  }
  if (typeof parsed.worktreePath !== 'string' || parsed.worktreePath.length === 0 || !path.isAbsolute(parsed.worktreePath)) {
    throw new WorktreeSafetyError(`${where}: worktreePath must be an absolute path`);
  }
  if (typeof parsed.baseSha !== 'string' || !FULL_SHA_PATTERN.test(parsed.baseSha)) {
    throw new WorktreeSafetyError(`${where}: baseSha must be a 40-hex sha`);
  }
  if (typeof parsed.createdAt !== 'string' || !ISO_AT_PATTERN.test(parsed.createdAt)) {
    throw new WorktreeSafetyError(`${where}: createdAt must be an ISO-8601 timestamp`);
  }
  return parsed;
}

/**
 * Create the controller-owned ownership marker for a freshly created LCIM
 * worktree, inside its own per-worktree Git admin directory (resolved via
 * Git — never a caller path, never the checked-out tree, never a tracked
 * file, never the common Git directory). Exclusive creation (`wx`): an
 * existing marker at a fresh id-derived path fails closed.
 *
 * @returns {{ markerId: string, markerPath: string, marker: object, adminDir: string }}
 */
export function createWorktreeOwnershipMarker({ worktreeDir, repoDir, worktreeId, workUnitId, baseSha }) {
  if (typeof worktreeId !== 'string' || !WORKTREE_ID_PATTERN.test(worktreeId)) {
    throw new WorktreeSafetyError(`cannot create ownership marker: invalid worktreeId ${JSON.stringify(worktreeId)}`);
  }
  if (typeof workUnitId !== 'string' || !WORK_UNIT_ID_PATTERN.test(workUnitId)) {
    throw new WorktreeSafetyError(`cannot create ownership marker: invalid workUnitId ${JSON.stringify(workUnitId)}`);
  }
  if (typeof baseSha !== 'string' || !FULL_SHA_PATTERN.test(baseSha)) {
    throw new WorktreeSafetyError(`cannot create ownership marker: invalid baseSha ${JSON.stringify(baseSha)}`);
  }
  const adminDir = resolveWorktreeGitAdminDir({ worktreeDir, repoDir });
  const markerId = generateOwnershipMarkerId();
  const marker = {
    schemaName: OWNERSHIP_MARKER_SCHEMA_NAME,
    schemaVersion: OWNERSHIP_MARKER_SCHEMA_VERSION,
    markerId,
    worktreeId,
    workUnitId,
    worktreePath: normalizePath(worktreeDir),
    baseSha,
    createdAt: new Date().toISOString(),
  };
  const markerPath = path.join(adminDir, OWNERSHIP_MARKER_FILE);
  try {
    fs.writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      throw new WorktreeSafetyError(
        `an LCIM ownership marker already exists at ${markerPath}; markers are controller-created exactly once per worktree identity — refusing to overwrite`,
        { markerPath, adminDir },
      );
    }
    throw new WorktreeSafetyError(`cannot write the LCIM ownership marker at ${markerPath}: ${err.message}`, {
      markerPath,
      adminDir,
      cause: err,
    });
  }
  return { markerId, markerPath, marker, adminDir };
}

/**
 * Read + strictly validate the ownership marker from an EXACT per-worktree
 * Git admin directory (already derived and verified). A missing marker
 * fails closed: the registry, git registration, path, and base alone never
 * prove LCIM ownership.
 *
 * @returns {{ marker: object, markerPath: string, adminDir: string }}
 */
function readOwnershipMarkerFromAdminDir(adminDir, { worktreeDir } = {}) {
  const markerPath = path.join(adminDir, OWNERSHIP_MARKER_FILE);
  let raw;
  try {
    raw = fs.readFileSync(markerPath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new WorktreeSafetyError(
        `no genuine LCIM ownership marker at ${markerPath}: marker missing — registry data alone never establishes LCIM ownership of this worktree`,
        { markerPath, adminDir, ...(worktreeDir !== undefined ? { worktreeDir } : {}) },
      );
    }
    throw new WorktreeSafetyError(`cannot read the LCIM ownership marker at ${markerPath}: ${err.message}`, {
      markerPath,
      adminDir,
      cause: err,
    });
  }
  return { marker: parseWorktreeOwnershipMarker(raw), markerPath, adminDir };
}

/**
 * Read + strictly validate the ownership marker of a linked worktree from
 * its OWN per-worktree Git admin directory, resolved through git from the
 * EXISTING checkout directory. A missing marker fails closed: the
 * registry, git registration, path, and base alone never prove LCIM
 * ownership.
 *
 * @returns {{ marker: object, markerPath: string, adminDir: string }}
 */
export function readWorktreeOwnershipMarker({ worktreeDir, repoDir }) {
  const adminDir = resolveWorktreeGitAdminDir({ worktreeDir, repoDir });
  return readOwnershipMarkerFromAdminDir(adminDir, { worktreeDir });
}

/**
 * Binding checks shared by BOTH cleanup ownership proofs (existing checkout
 * directory AND missing checkout directory): the structurally validated
 * marker must bind to EVERY identity of the registered lifecycle:
 *
 *   marker.markerId   == registered marker identity (record.markerId)
 *   marker.worktreeId == controller-retained worktreeId
 *   marker.workUnitId == registered workUnitId
 *   marker.baseSha    == registered base SHA
 *   marker path       == canonical registered worktree path
 *
 * Any mismatch throws WorktreeSafetyError (fail closed) — the caller must
 * refuse cleanup, never invoke `git worktree remove`/`prune`, and never
 * append REMOVED.
 */
function assertMarkerBindsToLifecycle({
  marker,
  markerPath,
  adminDir,
  worktreeId,
  workUnitId,
  baseSha,
  registeredPath,
  markerId,
}) {
  const failures = [];
  if (marker.markerId !== markerId) {
    failures.push(`marker identity ${marker.markerId} does not match the registered LCIM ownership identity ${markerId}`);
  }
  if (marker.worktreeId !== worktreeId) {
    failures.push(`marker worktreeId ${marker.worktreeId} does not match the controller-retained worktreeId ${worktreeId}`);
  }
  if (marker.workUnitId !== workUnitId) {
    failures.push(`marker workUnitId ${marker.workUnitId} does not match the registered workUnitId ${workUnitId}`);
  }
  if (marker.baseSha !== baseSha) {
    failures.push(`marker baseSha ${marker.baseSha} does not match the registered base ${baseSha}`);
  }
  if (normalizePath(marker.worktreePath) !== normalizePath(registeredPath)) {
    failures.push(`marker path ${marker.worktreePath} does not match the registered worktree path ${registeredPath}`);
  }
  if (failures.length > 0) {
    throw new WorktreeSafetyError(
      `LCIM ownership marker at ${markerPath} does not bind to the registered lifecycle: ${failures.join('; ')}`,
      { markerPath, adminDir, failures },
    );
  }
  return marker;
}

/**
 * Full cleanup ownership verification (EXISTING checkout directory): the
 * marker must exist in the exact per-worktree Git admin directory (resolved
 * through git from the live worktree), be valid and structurally exact, and
 * bind to EVERY identity of the registered lifecycle. Any mismatch throws
 * WorktreeSafetyError (fail closed) — the caller must refuse cleanup,
 * never invoke `git worktree remove`, and never append REMOVED.
 *
 * @returns {{ marker: object, markerPath: string, adminDir: string }}
 */
export function verifyWorktreeOwnershipMarker({
  worktreeDir,
  repoDir,
  worktreeId,
  workUnitId,
  baseSha,
  registeredPath,
  markerId,
}) {
  const { marker, markerPath, adminDir } = readWorktreeOwnershipMarker({ worktreeDir, repoDir });
  assertMarkerBindsToLifecycle({ marker, markerPath, adminDir, worktreeId, workUnitId, baseSha, registeredPath, markerId });
  return { marker, markerPath, adminDir };
}

// ---------------------------------------------------------------------------
// Missing-checkout-directory ownership proof (SOL-S03-R3-001)
// ---------------------------------------------------------------------------
//
// When the checkout directory is gone, `git rev-parse --absolute-git-dir`
// executed inside the worktree is impossible. The per-worktree Git admin
// directory is instead derived from REPOSITORY-OWNED Git metadata only:
//
//  1. `git worktree list --porcelain` — the repository's own registration
//     list must still contain exactly one entry for the claimed canonical
//     worktree path (a vanished checkout directory leaves a stale,
//     prune-eligible registration; a missing entry means there is no Git
//     administrative identity to clean up at all).
//  2. enumeration of `<common>/worktrees/*` — the admin directory whose
//     git-written `commondir` resolves to this repository's common Git
//     directory AND whose git-written `gitdir` resolves to exactly
//     `<claimedPath>/.git` (never the common dir itself, never a sibling
//     worktree's gitdir).
//  3. cross-check: the admin dir's own `HEAD` must equal the porcelain
//     registration HEAD (two independent repository-owned sources).
//
// The genuine controller-created ownership marker must then exist inside
// that exact derived admin directory, be structurally valid, and bind to
// every registered identity. Nothing supplied by the registry, a worker,
// or an arbitrary caller is trusted as an admin path.

/**
 * Canonical absolute spelling of a path WITHOUT requiring it to exist:
 * realpath when it exists, otherwise canonicalize the nearest existing
 * ancestor and re-append the missing components. Git realpaths worktree
 * paths at `git worktree add` time (e.g. /var/... -> /private/var/... on
 * macOS), so a registry spelling and the repository's own metadata
 * spelling of the SAME worktree must be compared in canonical form even
 * when the checkout directory is gone.
 */
function canonicalizePath(p) {
  const resolved = path.resolve(p);
  try {
    return fs.realpathSync(resolved);
  } catch {
    const missing = [];
    let cur = resolved;
    for (;;) {
      try {
        return path.join(fs.realpathSync(cur), ...missing.reverse());
      } catch {
        const parent = path.dirname(cur);
        if (parent === cur) return resolved;
        missing.push(path.basename(cur));
        cur = parent;
      }
    }
  }
}

/** Read a small git-written admin file; null when absent/unreadable. */
function readTrimmed(file) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return null;
  }
}

/** Parse `git worktree list --porcelain` into { path, headSha, prunable }. */
function parseWorktreeListPorcelain(output) {
  const entries = [];
  for (const block of output.split(/\n\n+/)) {
    const lines = block.split('\n').filter(Boolean);
    if (lines.length === 0 || !lines[0].startsWith('worktree ')) continue;
    const entry = { path: lines[0].slice('worktree '.length) };
    for (const line of lines.slice(1)) {
      const space = line.indexOf(' ');
      const key = space === -1 ? line : line.slice(0, space);
      const value = space === -1 ? '' : line.slice(space + 1).trim();
      if (key === 'HEAD') entry.headSha = value;
      else if (key === 'prunable') entry.prunable = value;
    }
    entries.push(entry);
  }
  return entries;
}

/**
 * True when a `<common>/worktrees/*` candidate administers EXACTLY the
 * claimed worktree of THIS repository: its git-written `commondir` must
 * resolve to the repository common Git directory, and its git-written
 * `gitdir` must resolve to exactly `<target>/.git` (never the common Git
 * directory itself, never a sibling worktree's gitdir).
 */
function adminDirIsForWorktree(candidate, { commonDir, target }) {
  const commondirRaw = readTrimmed(path.join(candidate, 'commondir'));
  const gitdirRaw = readTrimmed(path.join(candidate, 'gitdir'));
  if (commondirRaw === null || gitdirRaw === null) return false;
  if (canonicalizePath(path.resolve(candidate, commondirRaw)) !== commonDir) return false;
  if (canonicalizePath(path.resolve(candidate, gitdirRaw)) !== canonicalizePath(path.join(target, '.git'))) return false;
  return true;
}

/**
 * Derive the EXACT per-worktree Git administrative directory for a stale
 * linked-worktree registration whose checkout directory is MISSING, from
 * REPOSITORY-OWNED Git metadata only (never a registry-, worker-, or
 * caller-supplied admin path):
 *
 * 1. `git worktree list --porcelain` must still register exactly one
 *    worktree at the canonical claimed path (its HEAD is captured for the
 *    base check). No registration -> there is nothing Git administers for
 *    this identity -> fail closed.
 * 2. `<common>/worktrees/*` is enumerated and the admin directory whose
 *    git-written `commondir`/`gitdir` files prove it administers exactly
 *    this worktree of this repository is selected; zero or multiple
 *    matches fail closed (never pick arbitrarily).
 * 3. The admin dir's own `HEAD` must agree with the porcelain
 *    registration HEAD.
 *
 * @param {object} args
 * @param {string} args.repoDir - main/parent worktree directory
 * @param {string} args.worktreePath - registered worktree path (checkout
 *        directory is absent)
 * @returns {{ adminDir: string, canonicalPath: string, headSha: string }}
 */
export function resolveStaleWorktreeGitAdminDir({ repoDir, worktreePath }) {
  if (typeof worktreePath !== 'string' || worktreePath.length === 0) {
    throw new WorktreeSafetyError('cannot resolve stale worktree Git admin metadata: worktreePath is required');
  }
  const commonDir = resolveGitCommonDir(repoDir);
  const target = canonicalizePath(worktreePath);

  // 1. The repository's own registration list must still contain exactly
  //    one entry for the claimed canonical path.
  let registered = null;
  for (const entry of parseWorktreeListPorcelain(runGit(repoDir, ['worktree', 'list', '--porcelain']).stdout)) {
    if (canonicalizePath(entry.path) === target) {
      if (registered !== null) {
        throw new WorktreeSafetyError(
          `refusing: multiple Git worktree registrations resolve to ${target}; cannot bind one exact administrative identity`,
          { worktreePath: target },
        );
      }
      registered = entry;
    }
  }
  if (registered === null) {
    throw new WorktreeSafetyError(`worktree ${worktreePath} is not registered with git; refusing to remove`, {
      worktreePath: target,
    });
  }

  // 2. Enumerate <common>/worktrees/* and select the admin directory that
  //    administers exactly this worktree (git-written commondir/gitdir).
  const worktreesDir = path.join(commonDir, 'worktrees');
  let adminDir = null;
  if (fs.existsSync(worktreesDir)) {
    for (const name of fs.readdirSync(worktreesDir)) {
      const candidate = path.join(worktreesDir, name);
      let st;
      try {
        st = fs.statSync(candidate);
      } catch {
        continue;
      }
      if (!st.isDirectory()) continue;
      if (!adminDirIsForWorktree(candidate, { commonDir, target })) continue;
      if (adminDir !== null) {
        throw new WorktreeSafetyError(
          `refusing: multiple per-worktree Git admin directories claim worktree ${target}; cannot bind one exact administrative identity`,
          { worktreePath: target },
        );
      }
      adminDir = candidate;
    }
  }
  if (adminDir === null) {
    throw new WorktreeSafetyError(
      `no per-worktree Git administrative directory for ${target} under ${worktreesDir}; refusing to remove`,
      { worktreePath: target },
    );
  }

  // 3. Cross-check the admin dir's own HEAD against the porcelain
  //    registration HEAD (two independent repository-owned sources).
  let adminHead = null;
  try {
    adminHead = fs.readFileSync(path.join(adminDir, 'HEAD'), 'utf8').trim();
  } catch (err) {
    throw new WorktreeSafetyError(
      `refusing: ${adminDir} is not a per-worktree Git admin directory (missing HEAD file): ${err.message}`,
      { worktreePath: target, adminDir, cause: err },
    );
  }
  if (typeof registered.headSha !== 'string' || !FULL_SHA_PATTERN.test(adminHead) || adminHead !== registered.headSha) {
    throw new WorktreeSafetyError(
      `refusing: per-worktree admin HEAD ${adminHead} does not match the Git registration HEAD ${registered.headSha} for ${target}`,
      { worktreePath: target, adminDir },
    );
  }

  return { adminDir, canonicalPath: target, headSha: registered.headSha };
}

/**
 * Missing-checkout-directory cleanup ownership verification: derive the
 * exact per-worktree Git admin directory from REPOSITORY-OWNED Git
 * metadata (porcelain registration + <common>/worktrees/* enumeration,
 * cross-checked via git-written commondir/gitdir/HEAD files), require the
 * registration HEAD to equal the registered base, and require the genuine
 * controller-created ownership marker to exist inside the derived admin
 * directory and bind to EVERY identity of the registered lifecycle.
 *
 * Any failure throws WorktreeSafetyError (fail closed): no prune, no
 * removal, no REMOVED, no registry mutation. Registry data alone can never
 * manufacture a marker inside a foreign worktree's admin directory, so a
 * forged CREATED event cannot authorize pruning a foreign registration
 * whose checkout directory vanished.
 *
 * @returns {{ marker: object, markerPath: string, adminDir: string, canonicalPath: string }}
 */
export function verifyWorktreeOwnershipMarkerFromGitMetadata({
  repoDir,
  worktreePath,
  worktreeId,
  workUnitId,
  baseSha,
  registeredPath,
  markerId,
}) {
  const resolved = resolveStaleWorktreeGitAdminDir({ repoDir, worktreePath });
  if (resolved.headSha !== baseSha) {
    throw new WorktreeSafetyError(
      `worktree ${worktreePath} Git registration HEAD ${resolved.headSha} does not match the registered base ${baseSha}; refusing removal`,
      { worktreePath: resolved.canonicalPath, headSha: resolved.headSha, baseSha },
    );
  }
  const { marker, markerPath, adminDir } = readOwnershipMarkerFromAdminDir(resolved.adminDir);
  assertMarkerBindsToLifecycle({
    marker,
    markerPath,
    adminDir,
    worktreeId,
    workUnitId,
    baseSha,
    registeredPath,
    markerId,
  });
  return { marker, markerPath, adminDir, canonicalPath: resolved.canonicalPath };
}
