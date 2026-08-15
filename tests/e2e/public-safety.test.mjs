import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { assertNoTrackedFilesUnder, resolveRuntimeRoot, resolveGitCommonDir } from '../../src/config/runtime-path.mjs';

const ROOT = process.cwd();

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).split('\0').filter(Boolean);
}

function repositoryFiles() {
  const out = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else out.push(full);
    }
  };
  visit(ROOT);
  return out;
}

test('public-safe repository scan: tracked names/content contain no credentials or runtime evidence', () => {
  const tracked = trackedFiles();
  const forbiddenNames = [
    /(^|\/)\.env(?:\.|$)/i,
    /\.transcript\./i,
    /(^|\/)(?:review-packets?|escalation-records?|sol-payloads?)(\/|$)/i,
    /\.zip$/i,
    /(^|\/)(?:raw-runtime|runtime-logs?)(\/|$)/i,
  ];
  for (const rel of tracked) {
    assert.equal(forbiddenNames.some((pattern) => pattern.test(rel)), false, `forbidden tracked artifact name: ${rel}`);
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'lcim')), false);
  assertNoTrackedFilesUnder(resolveRuntimeRoot(ROOT), ROOT);
  assert.match(resolveGitCommonDir(ROOT), /[\\/]\.git$/);
});

test('secret scan: no tracked or source-tree file contains a real credential-shaped value', () => {
  const secretPatterns = [
    /\b(?:sk-|ghp_|github_pat_|glpat-)[A-Za-z0-9_-]{20,}\b/i,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bBearer\s+[A-Za-z0-9._~+\/-]{24,}\b/i,
    /-----BEGIN(?: [A-Z0-9][A-Z0-9 ]*)? PRIVATE KEY-----/i,
    /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token)\s*[:=]\s*[A-Za-z0-9/+_.-]{24,}/i,
  ];
  const leaked = [];
  const deterministicFixtureSentinel = /^(?:-----BEGIN(?: [A-Z0-9][A-Z0-9 ]*)? PRIVATE KEY-----|Bearer s10-[A-Za-z0-9._~+\\/-]+)$/i;
  for (const file of repositoryFiles()) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const realMatches = [];
    for (const pattern of secretPatterns) {
      const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
      const matcher = new RegExp(pattern.source, flags);
      for (const match of text.matchAll(matcher)) {
        if (!deterministicFixtureSentinel.test(match[0])) realMatches.push(match[0]);
      }
    }
    if (realMatches.length > 0) leaked.push(`${path.relative(ROOT, file)}: ${realMatches.join(',')}`);
  }
  assert.deepEqual(leaked, []);
});
