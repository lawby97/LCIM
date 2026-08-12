/**
 * Sprint 00 guard tests: .gitignore must keep forbidden runtime/secret
 * evidence out of Git — both by pattern presence and by behavior in a real
 * fixture repo (git check-ignore + git status + git add -A).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkIgnored, git, makeGitRepo, writeFixtureFile } from '../helpers/git-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GITIGNORE = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');

const REQUIRED_PATTERN_CLASSES = {
  'credentials/secrets': [/credentials/, /\.pem/, /\.key/, /id_rsa/, /\.secret/],
  'env files': [/(^|\n)\.env/, /\.env\.\*/],
  'raw transcripts': [/transcript/i],
  'review zip packets': [/\.zip/],
  'escalation records': [/escalation/i],
  'sol payloads': [/sol-payloads/i],
  'target-repo evidence': [/target-repo-evidence/i],
  'runtime logs/state': [/\.log/, /\.jsonl/, /lcim-runtime/],
};

test('.gitignore covers every forbidden artifact class', () => {
  for (const [klass, patterns] of Object.entries(REQUIRED_PATTERN_CLASSES)) {
    for (const re of patterns) {
      assert.match(GITIGNORE, re, `missing .gitignore pattern for class '${klass}': ${re}`);
    }
  }
});

test('.gitignore allow-lists .env.example', () => {
  assert.match(GITIGNORE, /!\.env\.example/);
});

test('forbidden files are ignored in a real repo, before and after git add -A', async (t) => {
  const repo = await makeGitRepo(t);
  // The fixture repo must carry the same .gitignore as the LCIM source tree.
  fs.copyFileSync(path.join(ROOT, '.gitignore'), path.join(repo.root, '.gitignore'));
  git(repo.root, ['add', '.gitignore']);
  git(repo.root, ['commit', '-m', 'baseline .gitignore']);
  const forbidden = [
    '.env',
    '.env.local',
    'credentials.json',
    'id_rsa',
    'run.transcript.json',
    'run.transcript.jsonl',
    'review.zip',
    'escalation-records/sol-1.txt',
    'sol-payloads/sol-ask-1.json',
    'target-repo-evidence/patch.diff',
    'debug.log',
    'events.jsonl',
    'lcim-runtime/run-1/state.json',
  ];
  for (const f of forbidden) {
    writeFixtureFile(repo.root, f, 'forbidden fixture content\n');
  }

  for (const f of forbidden) {
    assert.equal(checkIgnored(repo.root, f), 0, `git check-ignore should match ${f}`);
  }

  assert.equal(git(repo.root, ['status', '--porcelain']), '');

  git(repo.root, ['add', '-A']);
  assert.equal(git(repo.root, ['status', '--porcelain']), '');
  // only the baseline .gitignore is tracked; none of the forbidden files
  assert.equal(git(repo.root, ['ls-files']).trim(), '.gitignore');
});

test('legit source files are still trackable', async (t) => {
  const repo = await makeGitRepo(t);
  fs.copyFileSync(path.join(ROOT, '.gitignore'), path.join(repo.root, '.gitignore'));
  git(repo.root, ['add', '.gitignore']);
  git(repo.root, ['commit', '-m', 'baseline .gitignore']);
  writeFixtureFile(repo.root, 'src/feature.mjs', 'export const x = 1;\n');
  writeFixtureFile(repo.root, 'docs/note.md', '# note\n');
  assert.notEqual(checkIgnored(repo.root, 'src/feature.mjs'), 0);
  git(repo.root, ['add', 'src/feature.mjs', 'docs/note.md']);
  assert.match(git(repo.root, ['status', '--porcelain']), /src\/feature\.mjs/);
});
