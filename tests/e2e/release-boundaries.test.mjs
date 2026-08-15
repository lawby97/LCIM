import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  authorizeWorkerExecutionBoundary,
  runConstrainedProcess,
  SEATBELT_EXECUTABLE,
} from '../../src/controller/execution-boundary.mjs';
import { invokeBoundedProvider } from '../../src/controller/provider.mjs';
import { SOL_CALL_TYPES, SOL_VERDICTS } from '../../src/sol/contracts/call-types.mjs';
import { compileSolAsk } from '../../src/sol/ask-compiler/compiler.mjs';
import { ProRedactionError, redactProText } from '../../src/redaction/pro-boundary.mjs';
import { enforceCharacterLimit, PRO_COPY_DEFAULT_MAX_CHARACTERS } from '../../src/sol/pro-handoff/service.mjs';
import { readV1History, UNKNOWN_V1, V1_COMPAT } from '../../src/compat/v1/index.mjs';
import { compileProviderContract, buildDiagnoseAsk, buildPriorFinalReview, NOW } from '../sol/helpers.mjs';
import { rawAskFromFixture, readSolFixture, bindAskRefs } from '../sol/helpers.mjs';
import { makeTarget } from '../fault-injection/helpers.mjs';

function dirs(t, prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const repoDir = path.join(root, 'repo');
  const worktreeDir = path.join(root, 'worktree');
  const runDir = path.join(root, 'run');
  fs.mkdirSync(repoDir);
  fs.mkdirSync(worktreeDir);
  fs.mkdirSync(runDir);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, repoDir, worktreeDir, runDir };
}

test('release boundary: structural model execution confines writes, descendants, credentials, and network', async (t) => {
  const fixture = dirs(t, 'lcim-s11-boundary-');
  const credential = path.join(fixture.root, 'credential-sentinel.txt');
  fs.writeFileSync(credential, 'LCIM_S11_CREDENTIAL_SENTINEL\n', { mode: 0o600 });
  const workUnitId = `lcim_wu_${crypto.randomBytes(16).toString('hex')}`;
  const authorized = await authorizeWorkerExecutionBoundary({
    repoDir: fixture.repoDir,
    worktreeDir: fixture.worktreeDir,
    runDir: fixture.runDir,
    workUnitId,
    credentialProbePaths: [credential],
  });
  assert.equal(authorized.boundary.sandboxExecutable, SEATBELT_EXECUTABLE);
  assert.equal(authorized.evidence.structural, true);
  assert.equal(authorized.evidence.processCreation, 'DENIED');
  assert.equal(authorized.evidence.childCreation.mode, 'STRUCTURALLY_DENIED');
  assert.equal(authorized.evidence.network.mode, 'DENY_ALL');
  assert.ok(authorized.evidence.probes.credentials.every((probe) => probe.blocked === true));

  const parentProbe = path.join(fixture.repoDir, 'parent-write');
  const runtimeProbe = path.join(fixture.runDir, 'runtime-write');
  const childProbe = path.join(fixture.worktreeDir, 'child-created');
  const result = await runConstrainedProcess(authorized.boundary, {
    command: [process.execPath],
    args: ['-e', `
const fs = require('node:fs');
const cp = require('node:child_process');
try { fs.writeFileSync(${JSON.stringify(parentProbe)}, 'x'); } catch (e) { console.log('parent=' + e.code); }
try { fs.writeFileSync(${JSON.stringify(runtimeProbe)}, 'x'); } catch (e) { console.log('runtime=' + e.code); }
try { fs.writeFileSync(${JSON.stringify(path.join(fixture.worktreeDir, 'allowed.txt'))}, 'ok'); console.log('allowed=yes'); } catch (e) { console.log('allowed=' + e.code); }
try { fs.readFileSync(${JSON.stringify(credential)}, 'utf8'); console.log('credential=READABLE'); } catch (e) { console.log('credential=' + e.code); }
try { cp.spawn('/usr/bin/true'); console.log('child=CREATED'); } catch (e) { console.log('child=' + e.code); }
`],
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /parent=EACCES|parent=EPERM/);
  assert.match(result.stdout, /runtime=EACCES|runtime=EPERM/);
  assert.match(result.stdout, /allowed=yes/);
  assert.match(result.stdout, /credential=EACCES|credential=EPERM/);
  assert.match(result.stdout, /child=EPERM/);
  assert.equal(fs.existsSync(parentProbe), false);
  assert.equal(fs.existsSync(runtimeProbe), false);
  assert.equal(fs.existsSync(childProbe), false);
  assert.equal(fs.readFileSync(credential, 'utf8').includes('SENTINEL'), true);

  const forged = { ...authorized.boundary, verified: true, verification: authorized.evidence };
  assert.throws(() => runConstrainedProcess(forged, { command: ['/usr/bin/true'] }), /authorized|boundary/i);
});

test('release boundary: generic SOL prompts cannot bypass the compiler and all four call types stay locked', async () => {
  assert.deepEqual(SOL_CALL_TYPES, ['SOL_CONTRACT_CHECK', 'SOL_DIAGNOSE', 'SOL_FINAL_REVIEW', 'SOL_RECHECK']);
  assert.deepEqual(SOL_VERDICTS, {
    SOL_CONTRACT_CHECK: ['SUFFICIENTLY_SPECIFIED', 'AMENDMENTS_REQUIRED'],
    SOL_DIAGNOSE: ['CAUSE_IDENTIFIED', 'CAUSE_UNRESOLVED'],
    SOL_FINAL_REVIEW: ['PASS', 'FAIL'],
    SOL_RECHECK: ['RESOLVED', 'NOT_RESOLVED'],
  });
  const source = compileProviderContract();
  const diagnosis = buildDiagnoseAsk();
  assert.equal(diagnosis.ask.callType, 'SOL_DIAGNOSE');
  const finalReview = buildPriorFinalReview();
  assert.equal(finalReview.ask.callType, 'SOL_FINAL_REVIEW');
  const contractCheck = compileSolAsk({
    callType: 'SOL_CONTRACT_CHECK',
    singleDecisionQuestion: 'Are the exact semantics of the locked contract sufficiently specified?',
    whyNeeded: 'The locked contract has a bounded semantic check.',
    contractRefs: [{ contractKey: source.contractKey, semanticDigest: source.semanticDigest, requirementRefs: [source.negativeSideEffects[0].sideEffectId] }],
    establishedFacts: [{ fact: 'the contract is authoritative', evidence: 'compiled source' }],
    evidence: [{ ref: 'ev.s11', kind: 'test_result', content: 'the bounded contract was loaded', decisionCritical: true }],
    passCondition: 'every locked semantic is explicit',
    failCondition: 'a locked semantic is unresolved',
    allowedScope: ['contract semantics'],
    outOfScope: ['implementation', 'publication'],
    contractCheck: { amendmentsOnly: true, expectedVerdicts: ['SUFFICIENTLY_SPECIFIED', 'AMENDMENTS_REQUIRED'] },
  }, { sources: [source], compiledAt: NOW });
  assert.equal(contractCheck.callType, 'SOL_CONTRACT_CHECK');
  assert.throws(
    () => compileSolAsk({ ...rawAskFromFixture(readSolFixture('valid-ask-contract-check.json')), singleDecisionQuestion: 'review this generally' }, { sources: [source], compiledAt: NOW }),
    /SOL|question|generic/i,
  );
  // The provider adapter accepts only a compiled ask object for SOL. This
  // check occurs before any boundary or process invocation is reachable.
  await assert.rejects(
    invokeBoundedProvider({ role: 'SOL', ask: null, prompt: 'generic review', projectConfig: {}, repoDir: process.cwd(), model: 'sol-xhigh', reasoning: 'XHIGH' }),
    /compiled.*ask|generic|SOL provider/i,
  );
  void finalReview;
});

test('release boundary: Pro handoff is text-only, redacted, and hard-limited to 12,000 characters', () => {
  assert.equal(PRO_COPY_DEFAULT_MAX_CHARACTERS, 12_000);
  assert.throws(() => enforceCharacterLimit('x'.repeat(12_001), 12_000), (error) => error.code === 'PRO_TEXT_LIMIT_EXCEEDED');
  const fakeSecret = 'LCIM_S11_FAKE_PRO_SECRET_7A91';
  const redacted = redactProText(`summary secret=${fakeSecret} at /private/s11-target/src/file.mjs`);
  assert.equal(redacted.text.includes(fakeSecret), false);
  assert.equal(redacted.text.includes('/private/s11-target/src/file.mjs'), false);
  assert.ok(redacted.redactedSecrets > 0);
  assert.ok(redacted.redactedPaths > 0);
  assert.throws(
    () => redactProText('-----BEGIN PRIVATE KEY-----\nLCIM_S11_UNREDACTABLE\n-----END PRIVATE KEY-----'),
    (error) => error instanceof ProRedactionError && error.code === 'PRO_UNREDACTABLE_SECRET' && !error.message.includes('UNREDACTABLE'),
  );
});

test('release boundary: V1 compatibility evidence is byte-stable, read-only, and never promoted into V2 authority', () => {
  const fixture = path.join(process.cwd(), 'tests', 'fixtures', 'compat', 'v1', 'ledger', 'schema-invalid-handoff-manual-integration.txt');
  const before = fs.readFileSync(fixture);
  const result = readV1History(before.toString('utf8'));
  const after = fs.readFileSync(fixture);
  assert.deepEqual(after, before);
  assert.equal(result.projection.provenance, V1_COMPAT);
  const workUnit = result.projection.workUnits[0];
  assert.equal(workUnit.patch.preserved, true);
  assert.equal(workUnit.controller.v2Disposition, UNKNOWN_V1);
  assert.equal(workUnit.usageCost.tokens, UNKNOWN_V1);
  assert.equal(workUnit.semanticReview.findings, UNKNOWN_V1);
  assert.equal(JSON.stringify(result.projection).includes('PATCH_VALID'), false);
  assert.equal(JSON.stringify(result.projection).includes('SEMANTICALLY_ACCEPTED'), false);
  assert.equal(fs.existsSync(path.join(path.dirname(fixture), 'runtime')), false);
  void makeTarget;
});
