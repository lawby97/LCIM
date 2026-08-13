/**
 * Sprint 08 strict local output namespaces.
 *
 * Audit projections may exist only below <runtimeRoot>/audit/** and review
 * exports only below <runtimeRoot>/exports/**. An explicit outDir is a
 * descendant selector inside its corresponding namespace, never a general
 * filesystem destination. Existing symlinks/non-directories are rejected
 * before projection bytes are written; real paths are checked after mkdir.
 */

import fs from 'node:fs';
import path from 'node:path';
import { isPathWithin } from '../config/runtime-path.mjs';
import { AuditError } from './errors.mjs';

const OUTPUT_NAMESPACES = new Set(['audit', 'exports']);

function reject() {
  throw new AuditError('output directory is outside the approved local audit/export namespace');
}

function lstatOrNull(pathname) {
  try {
    return fs.lstatSync(pathname);
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
}

function ensureDirectory(pathname) {
  const existing = lstatOrNull(pathname);
  if (existing !== null) {
    if (existing.isSymbolicLink() || !existing.isDirectory()) reject();
    return;
  }
  fs.mkdirSync(pathname, { recursive: true });
  const st = lstatOrNull(pathname);
  if (st === null || st.isSymbolicLink() || !st.isDirectory()) reject();
}

function assertDirectoryIfExisting(pathname) {
  const st = lstatOrNull(pathname);
  if (st === null) return false;
  if (st.isSymbolicLink() || !st.isDirectory()) reject();
  return true;
}

/** Reject a nested normal or bare Git repository even inside a namespace. */
function isGitRepositoryRoot(pathname) {
  if (lstatOrNull(path.join(pathname, '.git')) !== null) return true;
  return (
    lstatOrNull(path.join(pathname, 'HEAD')) !== null &&
    lstatOrNull(path.join(pathname, 'objects')) !== null &&
    lstatOrNull(path.join(pathname, 'refs')) !== null
  );
}

/** Inspect all existing descendant components without following symlinks. */
function inspectExistingDescendants(base, target) {
  if (!isPathWithin(base, target)) reject();
  const relative = path.relative(base, target);
  if (relative === '') return;
  let cursor = base;
  for (const part of relative.split(path.sep)) {
    cursor = path.join(cursor, part);
    const st = lstatOrNull(cursor);
    if (st === null) return;
    if (st.isSymbolicLink() || !st.isDirectory() || (cursor !== base && isGitRepositoryRoot(cursor))) reject();
  }
}

/**
 * Normalize runtimeRoot through its existing Git-common-dir parent. The
 * runtime root itself must be a real directory, never a symlink.
 */
function normalizedRuntimeRoot(runtimeRoot, create) {
  const supplied = path.resolve(runtimeRoot);
  const parent = path.dirname(supplied); // Git common dir from runtime-path.mjs
  let parentReal;
  try {
    parentReal = fs.realpathSync(parent);
  } catch {
    throw new AuditError('cannot resolve the local Git-common runtime parent');
  }
  const root = path.join(parentReal, path.basename(supplied));
  if (create) ensureDirectory(root);
  else assertDirectoryIfExisting(root);
  return root;
}

/**
 * Validate/prepare one S08 output directory.
 *
 * Relative explicit paths resolve inside the namespace root. Absolute
 * explicit paths are allowed only if already beneath that root. `create:
 * false` performs a no-write preflight (used by reviewExport before it
 * invokes audit, so an invalid export destination writes nothing).
 */
export function prepareOutputDir({ runtimeRoot, namespace, outDir = null, defaultName, create = true }) {
  if (!OUTPUT_NAMESPACES.has(namespace)) {
    throw new AuditError('unknown Sprint-08 output namespace');
  }
  if (typeof defaultName !== 'string' || defaultName === '') {
    throw new AuditError('output directory requires a deterministic default name');
  }

  const root = normalizedRuntimeRoot(runtimeRoot, create);
  // Runtime state must not become a nested repository merely because it is
  // beneath the target repository's Git common directory.
  if (isGitRepositoryRoot(root)) reject();
  const namespaceRoot = path.join(root, namespace);
  if (create) ensureDirectory(namespaceRoot);
  else assertDirectoryIfExisting(namespaceRoot);
  if (isGitRepositoryRoot(namespaceRoot)) reject();

  let target;
  if (outDir === null || outDir === undefined) {
    target = path.join(namespaceRoot, defaultName);
  } else {
    if (typeof outDir !== 'string' || outDir === '') {
      throw new AuditError('outDir must be a non-empty path string when supplied');
    }
    target = path.isAbsolute(outDir) ? path.resolve(outDir) : path.resolve(namespaceRoot, outDir);
  }
  if (!isPathWithin(namespaceRoot, target) || path.resolve(target) === path.resolve(namespaceRoot)) reject();

  // Validate all currently existing components before any mkdir/write.
  inspectExistingDescendants(namespaceRoot, target);
  if (!create) return target;

  ensureDirectory(target);
  inspectExistingDescendants(namespaceRoot, target);
  const realNamespace = fs.realpathSync(namespaceRoot);
  const realTarget = fs.realpathSync(target);
  if (!isPathWithin(realNamespace, realTarget)) reject();
  return realTarget;
}

/** No-write explicit-outDir preflight for reviewExport. */
export function preflightOutputDir({ runtimeRoot, namespace, outDir, defaultName = 'preflight' }) {
  if (outDir === null || outDir === undefined) return null;
  return prepareOutputDir({ runtimeRoot, namespace, outDir, defaultName, create: false });
}
