#!/usr/bin/env node
/**
 * Sprint-11's single controlled self-host trial.
 *
 * This file is intentionally not part of `npm test`: it is an explicit,
 * one-shot release gate. Run it only after the prerequisite suites pass:
 *
 *   node tests/self-host/controlled-trial.mjs
 *
 * It uses LCIM's standalone CLI against one detached worktree of this LCIM
 * repository, creates only a reviewable documentation candidate, and never
 * commits, pushes, merges, or publishes.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

import { resolvePatchEvidenceDir } from '../../src/evidence/patch/store.mjs';
import { resolveRuntimeRoot, assertNoTrackedFilesUnder } from '../../src/config/runtime-path.mjs';
import { readControllerState } from '../../src/controller/state.mjs';
import { readVersion } from '../../src/config/version.mjs';
import { assertInvocationLifecycle, git, sha256 } from '../fault-injection/helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BIN = path.join(ROOT, 'bin', 'lcim.mjs');
const EXPECTED_BASE = 'f369cfa2991fe39c8100c040dda3eae94a76fbb6';
const CANDIDATE_PATH = 'docs/self-host-candidate-note.md';
const CANDIDATE_TEXT = 'LCIM V2 self-host proof: deterministic documentation-only candidate.\n';

function cli(cwd, args) {
  const result = spawnSync(process.execPath, [BIN, ...args, '--cwd', cwd, '--json'], {
    cwd,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function writeWorker(target) {
  const file = path.join(target, 's11-self-host-worker.cjs');
  fs.writeFileSync(file, `
let prompt = '';
process.stdin.on('data', (chunk) => { prompt += chunk; });
process.stdin.on('end', () => {
  const fs = require('node:fs');
  const id = prompt.match(/WORK_UNIT_ID:\\s+(lcim_wu_[0-9a-f]+)/)?.[1] || null;
  fs.writeFileSync(${JSON.stringify(CANDIDATE_PATH)}, ${JSON.stringify(CANDIDATE_TEXT)});
  process.stdout.write(JSON.stringify({ workUnitId: id, workerStatus: 'WORK_COMPLETE', summary: 'deterministic documentation-only self-host proof', acceptanceClaims: [], remainingIssues: [], reviewRisks: [], uncertainty: 'fixture worker reports no controller-owned facts' }));
});
`, { mode: 0o600 });
  return file;
}

function configureTarget(target, worker) {
  const config = JSON.parse(fs.readFileSync(path.join(target, '.lcim', 'project.json'), 'utf8'));
  config.projectKey = 'lcim-self-host-proof';
  config.allowedWritePaths = [CANDIDATE_PATH];
  config.mustChangePaths = [CANDIDATE_PATH];
  config.worker.command = ['node', path.basename(worker)];
  config.worker.args = [];
  config.endpoints['deepseek-v4-flash'] = { baseUrl: 'local://lcim-self-host-proof', kind: 'local-command' };
  config.validation.commands = [[
    'node', '-e',
    `const fs=require('node:fs'); if(fs.readFileSync(${JSON.stringify(CANDIDATE_PATH)},'utf8')!==${JSON.stringify(CANDIDATE_TEXT)}) process.exit(1);`,
  ]];
  fs.writeFileSync(path.join(target, '.lcim', 'project.json'), `${JSON.stringify(config, null, 2)}\n`);
}

export async function runControlledSelfHostTrial() {
  assert.equal(git(ROOT, ['rev-parse', 'HEAD']).stdout.trim(), EXPECTED_BASE, 'self-host must start from the declared clean base');
  const sourceHeadBefore = git(ROOT, ['rev-parse', 'HEAD']).stdout.trim();
  const sourceStatusBefore = git(ROOT, ['status', '--porcelain']).stdout;
  const sourceRuntime = resolveRuntimeRoot(ROOT);
  const existingRunCount = fs.existsSync(path.join(sourceRuntime, 'runs'))
    ? fs.readdirSync(path.join(sourceRuntime, 'runs')).length
    : 0;
  // A failed first trial is retained as immutable local evidence if a
  // development defect is found. The successful repeat audits only the
  // newest run (`--last 1`) and never deletes that prior evidence.

  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-s11-self-host-target-'));
  let runId = null;
  try {
    git(ROOT, ['worktree', 'add', '--detach', target, EXPECTED_BASE]);
    assert.equal(git(target, ['rev-parse', 'HEAD']).stdout.trim(), EXPECTED_BASE);
    const setup = cli(target, ['setup', '--force']);
    assert.equal(setup.written.length, 5);
    const worker = writeWorker(target);
    configureTarget(target, worker);

    const expected = {
      lcimVersion: readVersion(),
      targetBaseSha: EXPECTED_BASE,
      workUnits: 1,
      invocations: 1,
      provider: 'pi',
      model: 'deepseek-v4-flash',
      role: 'WORKER',
      reasoningEffort: 'XHIGH',
      changedPaths: [CANDIDATE_PATH],
      validation: 'PASS',
      disposition: 'SEMANTICALLY_ACCEPTED',
      finalState: 'COMPLETED',
      publication: 'REVIEWABLE_ONLY',
    };

    const run = cli(target, ['run']);
    runId = run.runId;
    assert.equal(run.ok, true, JSON.stringify(run));
    assert.equal(run.targetBaseSha, expected.targetBaseSha);
    assert.equal(run.disposition, expected.disposition);
    assert.equal(run.candidate.status, 'REVIEWABLE_CANDIDATE');
    assert.equal(run.candidate.publication, expected.publication);
    assert.equal(run.candidate.autoPublished, false);
    assert.deepEqual(run.candidate.changedPaths, expected.changedPaths);
    assert.equal(git(target, ['rev-parse', 'HEAD']).stdout.trim(), expected.targetBaseSha);
    assert.equal(fs.existsSync(path.join(target, CANDIDATE_PATH)), false, 'candidate remains isolated from the target parent');
    assert.equal(git(ROOT, ['rev-parse', 'HEAD']).stdout.trim(), sourceHeadBefore);

    const lifecycle = assertInvocationLifecycle(target, runId);
    assert.deepEqual(
      [lifecycle.summary.starts, lifecycle.summary.completions, lifecycle.summary.assessments, lifecycle.summary.reconciliations],
      [1, 1, 1, 0],
    );
    const workerStart = lifecycle.events.find((event) => event.kind === 'START');
    assert.deepEqual(
      { provider: workerStart.provider, model: workerStart.model, role: workerStart.role, reasoningEffort: workerStart.reasoningEffort },
      { provider: expected.provider, model: expected.model, role: expected.role, reasoningEffort: expected.reasoningEffort },
    );

    const state = readControllerState(path.join(resolveRuntimeRoot(target), 'runs', runId));
    assert.equal(state.workUnits.length, expected.workUnits);
    assert.equal(state.candidates.length, 1);
    assert.equal(state.candidates[0].patchHash, run.candidate.patchHash);
    assert.ok(state.dispositions.some((record) => record.disposition === 'PATCH_VALID'));
    assert.ok(state.dispositions.some((record) => record.disposition === expected.disposition));

    const patchPath = path.join(resolvePatchEvidenceDir(target), `${run.candidate.patchId}.patch`);
    const patchBefore = fs.readFileSync(patchPath);
    assert.equal(sha256(patchBefore), run.candidate.patchHash);
    assert.ok(patchBefore.toString('utf8').includes('+LCIM V2 self-host proof'));

    const audit = cli(target, ['audit', '--last', '1']);
    assert.equal(audit.result.runs.length, 1);
    assert.deepEqual(audit.result.reconciliation.ledger, {
      events: 3,
      invocations: 1,
      starts: 1,
      completions: 1,
      assessments: 1,
      reconciliations: 0,
    });
    assert.deepEqual(audit.result.reconciliation.projections, { invocations: 1, workUnits: 1, reviews: 0, usage: 1 });
    assert.equal(audit.result.metrics.calls.total, 1);
    assert.equal(Object.values(audit.result.metrics.calls.byModel).reduce((sum, count) => sum + count, 0), 1);
    assert.equal(Object.keys(audit.result.metrics.calls.byModel).length, 1);
    assert.deepEqual(audit.result.metrics.calls.byRole, { WORKER: 1 });
    assert.equal(audit.result.metrics.workUnits.accepted, 1);
    assert.equal(audit.result.metrics.usage.tokens.availability, 'UNKNOWN');
    assert.equal(audit.result.metrics.usage.cost.availability, 'UNKNOWN');
    assert.equal(audit.result.metrics.ledger.runs.completed, 1);
    assert.equal(audit.result.reconciliation.ok, true);

    const review = cli(target, ['review-export', '--last', '1']);
    assert.equal(review.result.reconciliation.ok, true);
    assert.equal(fs.existsSync(path.join(review.dir, 'REVIEW.md')), true);
    assert.deepEqual(fs.readFileSync(patchPath), patchBefore, 'candidate artifact is immutable across audit/review');

    const status = cli(target, ['status']);
    assert.equal(status.project.projectKey, 'lcim-self-host-proof');
    assert.equal(status.runs.length, existingRunCount + 1);
    const statusRun = status.runs.find((item) => item.runId === runId);
    assert.ok(statusRun);
    assert.equal(statusRun.lifecycleState, expected.finalState);
    assert.equal(statusRun.candidates[0].autoPublished, false);

    assert.equal(fs.existsSync(path.join(target, 'docs', 'self-host-candidate-note.md')), false);
    assert.equal(fs.existsSync(path.join(ROOT, 'docs', 'self-host-candidate-note.md')), false);
    assert.equal(fs.existsSync(sourceRuntime), true);
    assert.equal(git(ROOT, ['rev-parse', 'HEAD']).stdout.trim(), sourceHeadBefore);
    assert.equal(git(ROOT, ['status', '--porcelain']).stdout, sourceStatusBefore);
    assertNoTrackedFilesUnder(resolveRuntimeRoot(target), ROOT);
    assert.match(resolveRuntimeRoot(target), /[\\/]\.git[\\/]lcim$/);

    return Object.freeze({
      expected,
      observed: {
        runId,
        runtimeRoot: resolveRuntimeRoot(target),
        lifecycle: {
          starts: lifecycle.summary.starts,
          completions: lifecycle.summary.completions,
          assessments: lifecycle.summary.assessments,
          reconciliations: lifecycle.summary.reconciliations,
        },
        auditLedger: audit.result.reconciliation.ledger,
        auditProjections: audit.result.reconciliation.projections,
        disposition: run.disposition,
        validation: 'PASS',
        candidateStatus: run.candidate.status,
        patchHashVerified: sha256(patchBefore) === run.candidate.patchHash,
        parentUnchanged: !fs.existsSync(path.join(target, CANDIDATE_PATH)),
        publication: run.candidate.publication,
      },
    });
  } finally {
    // This removes only the isolated target worktree. The target Git-common
    // runtime evidence remains local and untracked for the release report.
    git(ROOT, ['worktree', 'remove', '--force', target], { allowFailure: true });
    fs.rmSync(target, { recursive: true, force: true });
  }
}

const invoked = process.argv[1] !== undefined
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (invoked) {
  runControlledSelfHostTrial()
    .then((summary) => {
      process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`self-host: ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
