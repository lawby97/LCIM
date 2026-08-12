/**
 * Sprint 03 repository/worktree state snapshots.
 *
 * Controller-owned baselines captured when a worker worktree is prepared and
 * compared after the worker exits. Every snapshot is a plain, serializable
 * value so comparison is a deterministic equality check:
 *
 * - refs:      all refs of the shared repository (`git for-each-ref`);
 *              a worker creating/deleting branches or tags shows up here.
 * - reflog:    HEAD reflog of the worker worktree; commits/resets/merges/
 *              rebases/cleans/pushes leave permanent entries here.
 * - config:    local repository configuration; adding a remote or changing
 *              safety-relevant settings shows up here.
 * - remotes:   per-remote push-relevant URL accounting (fetch URL AND
 *              pushurls separately) with FULL advertised-ref snapshots
 *              (`git ls-remote <url>`, every namespace, not just heads/tags)
 *              per URL; an unreachable URL is recorded as unverifiable.
 * - parent:    parent worktree HEAD + `git status --porcelain` PLUS
 *              cryptographic content digests of every dirty tracked file,
 *              staged change, and untracked user file — so byte changes
 *              that leave the porcelain shape identical are still detected
 *              (defense in depth; digests only, never raw user contents).
 *
 * All snapshots are taken AFTER the LCIM worktree is created (so creation
 * noise is excluded) and BEFORE the worker runs.
 */

import { createHash } from 'node:crypto';
import { realpathSync, lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';
import { runGit, runGitBuffer } from './exec.mjs';
import { resolveHeadSha } from './base.mjs';
import { WorktreeSafetyError } from './errors.mjs';

/** All refs of the shared repository: sorted `refname objectname` lines. */
export function snapshotRefs(repoDir) {
  const out = runGit(repoDir, ['for-each-ref', '--format=%(refname) %(objectname)']).stdout;
  return out.split('\n').filter(Boolean).sort();
}

/**
 * HEAD reflog of a worktree. A freshly added detached worktree carries one
 * empty-message entry; failures (e.g. no reflog) are treated as an empty
 * snapshot so the comparison is still well-defined.
 */
export function snapshotReflog(worktreeDir) {
  const out = runGit(worktreeDir, ['reflog', '--format=%gd|%gs'], { allowNonZero: true }).stdout;
  return out.split('\n').filter(Boolean);
}

/** Local repository configuration, sorted `key=value` lines. */
export function snapshotConfig(repoDir) {
  const out = runGit(repoDir, ['config', '--local', '--list']).stdout;
  return out.split('\n').filter(Boolean).sort();
}

/**
 * Remote snapshot for push detection (defense in depth — the primary
 * push-prevention mechanism must be the worker execution boundary, see
 * ICR-2026-002). Per remote:
 *
 *   {
 *     fetchUrl:  string|null   (remote.<name>.url)
 *     pushUrls:  string[]      (remote.<name>.pushurl, may be empty)
 *     refs:      { [url]: string[] | null } — FULL advertised refs per
 *                push-relevant URL (`git ls-remote <url>`, all namespaces),
 *                or null when the URL is unreachable/unverifiable.
 *   }
 *
 * pushurls are accounted for SEPARATELY from the fetch URL: a reachable
 * fetch URL proves nothing about a distinct push URL.
 */
export function snapshotRemotes(repoDir, { timeoutMs = 15_000 } = {}) {
  const names = runGit(repoDir, ['remote']).stdout.split('\n').filter(Boolean).sort();
  const snapshot = {};
  for (const name of names) {
    const fetchUrlRaw = runGit(repoDir, ['config', '--get', `remote.${name}.url`], { allowNonZero: true }).stdout;
    const fetchUrl = fetchUrlRaw.trim() || null;
    const pushUrlsRaw = runGit(repoDir, ['config', '--get-all', `remote.${name}.pushurl`], { allowNonZero: true }).stdout;
    const pushUrls = pushUrlsRaw.split('\n').map((s) => s.trim()).filter(Boolean);
    const urls = [...new Set([...(fetchUrl !== null ? [fetchUrl] : []), ...pushUrls])];
    const refs = {};
    for (const url of urls) {
      const r = runGit(repoDir, ['ls-remote', url], { allowNonZero: true, timeout: timeoutMs });
      refs[url] = r.status === 0 ? r.stdout.split('\n').filter(Boolean).sort() : null;
    }
    snapshot[name] = { fetchUrl, pushUrls, refs };
  }
  return snapshot;
}

/**
 * Parent worktree state: HEAD sha + porcelain status + cryptographic
 * content digests of every preserved dirty/staged/untracked item. The
 * digests detect byte changes that leave the porcelain shape unchanged
 * (SOL-S03-003 defense in depth); raw user contents are never stored.
 */
export function snapshotParentState(repoDir) {
  return {
    headSha: resolveHeadSha(repoDir),
    porcelain: runGit(repoDir, ['status', '--porcelain']).stdout,
    contentDigest: parentContentDigest(repoDir),
  };
}

function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Digest the preserved parent state that porcelain alone cannot see:
 * - worktree-layer contents of dirty tracked files,
 * - index (staged) blob digests of staged changes,
 * - untracked user file contents + modes.
 * Returns a sorted serializable array of {path, layer, digest, mode};
 * digest is null for deletions / directories (submodules).
 */
export function parentContentDigest(repoDir) {
  const entries = [];

  // Index blob oids (mode oid stage\tpath) for staged-change resolution.
  const stageOut = runGit(repoDir, ['ls-files', '--stage', '-z']).stdout;
  const oidByPath = new Map();
  for (const record of stageOut.split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t');
    if (tab === -1) continue;
    const modeOidStage = record.slice(0, tab).split(' ');
    oidByPath.set(record.slice(tab + 1), modeOidStage[1] ?? null);
  }

  const digestLayer = (relPath, layer) => {
    const abs = pathResolve(repoDir, relPath);
    let digest;
    let mode = null;
    try {
      const st = lstatSync(abs);
      mode = st.mode;
      if (st.isSymbolicLink()) {
        digest = sha256Hex(Buffer.from(readlinkSync(abs), 'utf8'));
      } else if (st.isDirectory()) {
        digest = null; // submodule-style entry; no byte content
      } else {
        digest = sha256Hex(readFileSync(abs));
      }
    } catch {
      digest = null; // missing in worktree layer (deletion)
    }
    entries.push({ path: relPath, layer, digest, mode });
  };

  // Staged changes (index vs HEAD), resolved through blob digests.
  const stagedOut = runGit(repoDir, ['diff', '--cached', '--name-only', '-z', '--no-renames']).stdout;
  for (const relPath of stagedOut.split('\0').filter(Boolean)) {
    const oid = oidByPath.get(relPath) ?? null;
    let digest = null;
    if (oid !== null) {
      const blob = runGitBuffer(repoDir, ['cat-file', 'blob', oid]).stdout;
      digest = sha256Hex(blob);
    }
    entries.push({ path: relPath, layer: 'index', digest, mode: null });
  }

  // Worktree-layer changes (worktree vs index).
  const dirtyOut = runGit(repoDir, ['diff', '--name-only', '-z', '--no-renames']).stdout;
  for (const relPath of dirtyOut.split('\0').filter(Boolean)) {
    digestLayer(relPath, 'worktree');
  }

  // Untracked user files (preserved parent state).
  const untrackedOut = runGit(repoDir, ['ls-files', '--others', '--exclude-standard', '-z']).stdout;
  for (const relPath of untrackedOut.split('\0').filter(Boolean)) {
    digestLayer(relPath, 'untracked');
  }

  return entries.sort((a, b) => (a.path === b.path ? a.layer.localeCompare(b.layer) : a.path.localeCompare(b.path)));
}

/**
 * Compare two sorted line snapshots.
 * @returns {{ added: string[], removed: string[] }}
 */
export function diffLineSnapshots(before, after) {
  const beforeSet = new Set(before ?? []);
  const afterSet = new Set(after ?? []);
  return {
    added: (after ?? []).filter((line) => !beforeSet.has(line)),
    removed: (before ?? []).filter((line) => !afterSet.has(line)),
  };
}

/** Normalized absolute path used for worktree identity comparisons. */
export function normalizePath(p) {
  try {
    return realpathSync(p);
  } catch {
    return pathResolve(p);
  }
}

/**
 * Deep-compare two remote snapshots (full advertised-ref sets per
 * push-relevant URL, fetch URL and pushurls accounted separately).
 * @returns {{ added: string[], removed: string[], changedRemotes: string[], unverifiable: string[] }}
 */
export function diffRemoteSnapshots(before, after) {
  const names = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
  const added = [];
  const removed = [];
  const changedRemotes = [];
  const unverifiable = [];
  for (const name of names) {
    const b = before?.[name];
    const a = after?.[name];
    if (b === undefined && a !== undefined) {
      added.push(name);
      if (remoteUnverifiable(a)) unverifiable.push(name);
      continue;
    }
    if (b !== undefined && a === undefined) {
      removed.push(name);
      if (remoteUnverifiable(b)) unverifiable.push(name);
      continue;
    }
    if (b === undefined || a === undefined) continue;
    if (remoteUnverifiable(b) || remoteUnverifiable(a)) {
      unverifiable.push(name);
    }
    // URL topology changed (fetch/pushurl added/removed/altered)?
    const bUrls = JSON.stringify([b.fetchUrl, b.pushUrls]);
    const aUrls = JSON.stringify([a.fetchUrl, a.pushUrls]);
    if (bUrls !== aUrls) {
      changedRemotes.push(name);
      continue;
    }
    const allUrls = [...new Set([...Object.keys(b.refs ?? {}), ...Object.keys(a.refs ?? {})])].sort();
    for (const url of allUrls) {
      const beforeLines = b.refs?.[url] ?? null;
      const afterLines = a.refs?.[url] ?? null;
      if (beforeLines === null || afterLines === null) {
        // verifiability flipped OR still unverifiable — already accounted
        // above via remoteUnverifiable; a null->lines flip is still a change
        if (beforeLines === null && afterLines !== null) changedRemotes.push(name);
        if (beforeLines !== null && afterLines === null) changedRemotes.push(name);
        continue;
      }
      const { added: add, removed: rem } = diffLineSnapshots(beforeLines, afterLines);
      if (add.length > 0 || rem.length > 0) {
        changedRemotes.push(name);
      }
    }
  }
  return { added, removed, changedRemotes: [...new Set(changedRemotes)], unverifiable: [...new Set(unverifiable)] };
}

/** True when any push-relevant URL of the remote snapshot is unverifiable. */
function remoteUnverifiable(remote) {
  if (remote === null || remote === undefined || typeof remote !== 'object') return true;
  const urls = Object.keys(remote.refs ?? {});
  if (urls.length === 0) return true; // remote with no resolvable URL at all
  return urls.some((url) => remote.refs[url] === null);
}

/** Fail closed when a snapshot argument is missing (programmer error). */
export function requireSnapshot(snapshot, label) {
  if (snapshot === null || snapshot === undefined) {
    throw new WorktreeSafetyError(`missing ${label} snapshot; prepareWorkerWorktree() must provide it`, {
      label,
    });
  }
  return snapshot;
}
