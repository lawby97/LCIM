/** Sprint 08 focused tests: deterministic sanitized projections. */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { audit } from '../../src/audit/index.mjs';
import { validateSprintRecord } from '../../src/logging/schemas.mjs';
import { validateReviewSummary } from '../../src/audit/schemas.mjs';
import { validateRunStore } from '../../src/logging/reader.mjs';
import { resolveRuntimeRoot } from '../../src/config/runtime-path.mjs';
import { buildAuditFixture, FIXTURE_SCENARIOS } from '../helpers/audit-fixture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/audit/scenarios.json'), 'utf8'));

function readLines(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() !== '').map((line) => JSON.parse(line));
}

test('fixture manifest matches the builder', () => {
  assert.deepEqual(
    MANIFEST.scenarios.map(({ id, workUnits, invocations }) => ({ id, workUnits, invocations })),
    FIXTURE_SCENARIOS.map(({ id, workUnits, invocations }) => ({ id, workUnits, invocations })),
  );
});

test('invocations.jsonl has one schema-valid sanitized normal-export record per ledger invocation', async (t) => {
  const { repo } = await buildAuditFixture(t);
  const { result, outDir } = await audit({ cwd: repo.root });
  const lines = readLines(path.join(outDir, 'invocations.jsonl'));
  assert.equal(result.projections.invocations, 19);
  assert.equal(lines.length, 19);
  for (const line of lines) {
    const validation = validateSprintRecord('lcim.invocation', line);
    assert.equal(validation.valid, true, validation.errors.map((e) => e.message).join('; '));
    assert.equal('summary' in line, false, 'free-text summaries must not enter normal exports');
    assert.equal('errorCode' in line, false, 'free-text/error-like fields must not enter normal exports');
  }
});

test('work-unit projection keeps controller, semantic, and integration states separate', async (t) => {
  const { repo } = await buildAuditFixture(t);
  const { outDir } = await audit({ cwd: repo.root });
  const lines = readLines(path.join(outDir, 'work-units.jsonl'));
  assert.equal(lines.length, 11);
  const statuses = {};
  for (const wu of lines) statuses[wu.status] = (statuses[wu.status] ?? 0) + 1;
  assert.deepEqual(statuses, { ACCEPTED: 7, REJECTED: 2, RECONCILED: 1, INCOMPLETE: 1 });

  for (const wu of lines) {
    assert.equal(wu.states.modelReportedStatus, 'UNKNOWN');
    assert.equal(wu.states.finalIntegration, 'UNKNOWN');
    assert.ok(['OK', 'TRANSPORT_FAILURE', 'SCHEMA_MISMATCH', 'CALL_FAILURE', 'UNKNOWN'].includes(wu.states.transportSchemaStatus));
    assert.ok(['ACCEPTED', 'REJECTED', 'MIXED', 'NONE', 'UNKNOWN'].includes(wu.states.controllerValidation));
    assert.ok(['SEMANTIC_REJECTED', 'UNKNOWN'].includes(wu.states.semanticDisposition));
  }

  // SOL-S08-001: transport failure/useful patch does not imply semantic acceptance.
  const transport = lines.find((wu) => wu.states.transportSchemaStatus === 'TRANSPORT_FAILURE');
  assert.ok(transport);
  assert.equal(transport.states.controllerValidation, 'ACCEPTED');
  assert.equal(transport.states.semanticDisposition, 'UNKNOWN');
  assert.equal(transport.states.finalIntegration, 'UNKNOWN');

  // Wrong-base rejection is not invented as a semantic disposition.
  const wrongBase = lines.find((wu) => wu.lastRejectionCode === 'WRONG_BASE');
  assert.equal(wrongBase.states.semanticDisposition, 'UNKNOWN');

  const repair = lines.find((wu) => wu.repairAccepted === true);
  assert.ok(repair);
  assert.equal(repair.firstPassAccepted, false);
  assert.equal(repair.status, 'ACCEPTED');

  const incomplete = lines.find((wu) => wu.status === 'INCOMPLETE');
  assert.equal(incomplete.firstPassAccepted, null);
  assert.equal(incomplete.repairAccepted, false);
});

test('reviews.jsonl uses explicit unknowns for non-canonical finding/recheck facts', async (t) => {
  const { repo } = await buildAuditFixture(t);
  const { outDir } = await audit({ cwd: repo.root });
  const lines = readLines(path.join(outDir, 'reviews.jsonl'));
  assert.equal(lines.length, 6);
  for (const line of lines) {
    const validation = validateReviewSummary(line);
    assert.equal(validation.valid, true, validation.errors.map((e) => e.message).join('; '));
    assert.ok(line.role === 'SOL' || line.role === 'SOL_PRO');
    assert.equal(line.summary, null);
    assert.equal(line.findingDelivered, null);
    assert.equal(line.recheckOf, null);
    assert.equal(line.survivedRepair, null);
  }
});

test('usage projection separates explicit rejected waste from unassessed/orphaned calls', async (t) => {
  const { repo } = await buildAuditFixture(t);
  const { outDir } = await audit({ cwd: repo.root });
  const lines = readLines(path.join(outDir, 'usage.jsonl'));
  assert.equal(lines.length, 19);
  assert.equal(lines.filter((line) => line.usageAvailability === 'AVAILABLE').length, 16);
  assert.equal(lines.filter((line) => line.usageAvailability === 'UNAVAILABLE').length, 3);
  assert.equal(lines.filter((line) => line.rejectedWaste).length, 5);
  assert.equal(lines.filter((line) => line.nonAcceptedCategory === 'ORPHANED').length, 1);
  assert.equal(lines.filter((line) => line.nonAcceptedCategory === 'UNASSESSED').length, 1);
  const rejectedWithUsage = lines.filter((line) => line.rejectedWaste && line.wasteTokens !== null);
  assert.equal(rejectedWithUsage.length, 5);
  assert.equal(rejectedWithUsage.reduce((sum, line) => sum + line.wasteTokens, 0), 450);
});

test('projection JSONL is deterministic and canonical ledgers stay unchanged', async (t) => {
  const { repo, runs } = await buildAuditFixture(t);
  const runtimeRoot = resolveRuntimeRoot(repo.root);
  const before = new Map(runs.map((run) => [run.runId, fs.readFileSync(path.join(runtimeRoot, 'runs', run.runId, 'events.v2.jsonl'), 'utf8')]));
  const first = await audit({ cwd: repo.root });
  const second = await audit({ cwd: repo.root });
  for (const file of ['invocations.jsonl', 'work-units.jsonl', 'reviews.jsonl', 'usage.jsonl', 'final.json']) {
    assert.equal(fs.readFileSync(path.join(first.outDir, file), 'utf8'), fs.readFileSync(path.join(second.outDir, file), 'utf8'));
  }
  assert.equal(first.result.generatedAt, null);
  assert.deepEqual(first.result.metrics, second.result.metrics);
  assert.deepEqual(first.result.reconciliation, second.result.reconciliation);
  for (const run of runs) {
    const runDir = path.join(runtimeRoot, 'runs', run.runId);
    assert.equal(validateRunStore(runDir).valid, true);
    assert.equal(fs.readFileSync(path.join(runDir, 'events.v2.jsonl'), 'utf8'), before.get(run.runId));
  }
});
