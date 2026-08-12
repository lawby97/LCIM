/**
 * LCIM V2 version helpers (Sprint 00).
 *
 * Reads the VERSION file (pre-release value such as `2.0.0-dev.0`) and can
 * also report the LCIM repository Git commit. Git failures degrade to
 * `gitCommit: null` — version reporting must never depend on Git being
 * present, but when it is, the commit is included (master plan principle 10:
 * every run records the LCIM version/commit).
 *
 * LCIM implementation identity and the target repository base identity are
 * separate facts:
 * - `gitCommit` is ALWAYS resolved from the LCIM package/source root (the
 *   directory containing VERSION/package.json, derived deterministically
 *   from this module's own location) — never from the caller's/current
 *   working directory. Running LCIM from inside another Git repository can
 *   therefore never leak that repository's HEAD into the LCIM identity.
 * - Ownership is verified, not assumed (SOL-S00-R2-001): a SHA is accepted
 *   only when Git proves the discovered repository/worktree actually owns
 *   LCIM_ROOT. Git repository discovery walks upward through parent
 *   directories, so an unversioned LCIM install nested inside an unrelated
 *   repository (e.g. `<target>/node_modules/lcim/`) reports `gitCommit:
 *   null` — the enclosing repository's HEAD is a target identity, never the
 *   LCIM identity. Linked Git worktrees remain valid: `git rev-parse
 *   --show-toplevel` reports the linked worktree root, and the check
 *   concerns the worktree top-level, not where the `.git` administrative
 *   directory physically lives.
 * - `targetBaseSha` (the target repository HEAD) is a separate,
 *   controller-owned fact recorded in the run record (Sprint 03 owns its
 *   derivation); it is never derived here.
 */

import { readFileSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError } from '../shared/errors.mjs';
import { SCHEMA_VERSION } from '../shared/schema-registry.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VERSION_FILE = path.resolve(HERE, '../../VERSION');
/** LCIM package/source root: the directory containing VERSION/package.json. */
const LCIM_ROOT = path.resolve(HERE, '../..');

const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$/;

export function readVersion() {
  let raw;
  try {
    raw = readFileSync(VERSION_FILE, 'utf8').trim();
  } catch (err) {
    throw new ConfigError(`cannot read ${VERSION_FILE}: ${err.message}`);
  }
  if (!SEMVER_RE.test(raw)) {
    throw new ConfigError(`VERSION file does not contain a valid semver string: ${JSON.stringify(raw)}`);
  }
  return raw;
}

/** Canonicalize a path for ownership comparison (resolves symlinks). */
function canonicalPath(p) {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * @returns {string|null} full 40-hex HEAD sha of the LCIM repository, or
 *   null when Git cannot prove that the discovered repository/worktree
 *   actually owns LCIM_ROOT.
 *
 * Anchored to LCIM_ROOT (derived from this module's location) — the result
 * is independent of the caller's/current working directory. A SHA is
 * accepted only after `git rev-parse --show-toplevel` (anchored at
 * LCIM_ROOT) proves the discovered worktree top-level IS LCIM_ROOT.
 * Enclosing/unrelated repositories found by upward discovery are rejected
 * (SOL-S00-R2-001); linked Git worktrees remain accepted because
 * `--show-toplevel` reports the linked worktree root itself.
 */
export function readGitCommit() {
  const lcimRoot = canonicalPath(LCIM_ROOT);
  let toplevel;
  try {
    const raw = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: LCIM_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    toplevel = canonicalPath(path.isAbsolute(raw) ? raw : path.resolve(LCIM_ROOT, raw));
  } catch {
    // No repository/worktree discovered (or discovery failed): no ownership.
    return null;
  }
  if (toplevel !== lcimRoot) {
    // The discovered repository's worktree top-level is an ancestor or
    // otherwise unrelated to LCIM_ROOT: it does not own this install.
    return null;
  }
  try {
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: LCIM_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null;
  } catch {
    return null;
  }
}

/** @returns {{ version: string, gitCommit: string|null, gitCommitShort: string|null, schemaVersion: string }} */
export function getVersionInfo() {
  const gitCommit = readGitCommit();
  return {
    version: readVersion(),
    gitCommit,
    gitCommitShort: gitCommit ? gitCommit.slice(0, 7) : null,
    schemaVersion: SCHEMA_VERSION,
  };
}
