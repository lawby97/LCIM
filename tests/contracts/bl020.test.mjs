/**
 * Sprint 04 tests: BL-020 error classes as semantic-contract fixtures.
 *
 * Each observed BL-020 failure class must be representable as an exact,
 * validated semantic contract and, where relevant, a repair contract with
 * first-class negative side-effect expectations:
 *
 * - approval field names/casing (C5)
 * - decision vs evidence vs membership digests (C5)
 * - source/current ticker binding (C5)
 * - serial date/time formats (C5)
 * - provider construction before persisted authorization (C5 + negative
 *   side-effect contract)
 *
 * Since the SOL-S04 repairs, every compiled contract also carries a
 * deterministic semanticDigest (content identity) and every negative
 * side-effect requirement carries a content-bound sideEffectId.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { compileSemanticContract, isAuthoritative } from '../../src/contracts/compiler.mjs';
import { validateSemanticContract } from '../../src/contracts/validate.mjs';
import { buildRepairContract } from '../../src/contracts/repair.mjs';
import { renderSemanticContract } from '../../src/contracts/render.mjs';
import { readFixture, rawInputFromFixture } from '../helpers/semantic-fixture.mjs';

const BL020_FIXTURES = [
  'bl020-approval-field-casing.json',
  'bl020-decision-evidence-membership-digests.json',
  'bl020-source-current-ticker-binding.json',
  'bl020-serial-date-time-format.json',
  'bl020-provider-construction-before-authz.json',
];

const NOW = '2025-01-01T00:00:00.000Z';

function compileFixture(name) {
  return compileSemanticContract(rawInputFromFixture(readFixture(name)), {
    compiledAt: NOW,
  });
}

test('all BL-020 fixtures compile, validate, and render without errors', () => {
  for (const name of BL020_FIXTURES) {
    const contract = compileFixture(name);
    const result = validateSemanticContract(contract);
    assert.deepEqual(result.errors, [], name);
    assert.equal(contract.compileStatus, 'COMPILED', name);
    assert.equal(isAuthoritative(contract), true, name);
    const text = renderSemanticContract(contract);
    assert.ok(text.length > 0, name);
    assert.ok(text.startsWith(`SEMANTIC CONTRACT: ${contract.contractKey}`), name);
    // deterministic content identity is stamped and internally valid
    assert.match(contract.semanticDigest, /^[0-9a-f]{64}$/, name);
  }
});

test('BL-020 approval fixture: exact field names/casing and forbidden alternatives', () => {
  const contract = compileFixture('bl020-approval-field-casing.json');
  const approval = contract.concepts.find((c) => c.name === 'approval');
  assert.deepEqual(approval.authoritativeFieldNames, ['approval_decision', 'approval_status']);
  assert.deepEqual(approval.authoritativeEnum, ['PENDING', 'AUTHORIZED', 'DENIED', 'REVOKED']);
  // every wrong-case/renamed alternative is explicitly forbidden
  for (const alt of ['approved', 'Approved', 'isApproved', 'approvalDecision', 'approvalStatus']) {
    assert.ok(approval.forbiddenAlternatives.includes(alt), `must forbid ${alt}`);
  }
  // casing is exact: 'Approved' is NOT an authoritative name
  assert.ok(!approval.authoritativeFieldNames.includes('Approved'));
});

test('BL-020 digest fixture: decision/evidence/membership digests are distinct concepts', () => {
  const contract = compileFixture('bl020-decision-evidence-membership-digests.json');
  const names = contract.concepts.map((c) => c.name).sort();
  assert.deepEqual(names, ['decisionDigest', 'evidenceDigest', 'membershipDigest']);
  const meanings = new Set(contract.concepts.map((c) => c.digestMeaning));
  assert.equal(meanings.size, 3, 'digest meanings must be pairwise distinct');
  const pairs = contract.distinctConcepts.map((d) => `${d.conceptA}!=${d.conceptB}`);
  assert.ok(pairs.includes('decisionDigest!=evidenceDigest'));
  assert.ok(pairs.includes('decisionDigest!=membershipDigest'));
  assert.ok(pairs.includes('evidenceDigest!=membershipDigest'));
});

test('BL-020 ticker fixture: source/current ticker binding is explicit and non-interchangeable', () => {
  const contract = compileFixture('bl020-source-current-ticker-binding.json');
  const source = contract.concepts.find((c) => c.name === 'sourceTicker');
  const current = contract.concepts.find((c) => c.name === 'currentTicker');
  assert.equal(source.identityMeaning.includes('decision'), true);
  assert.equal(current.identityMeaning.includes('evaluation'), true);
  const pair = contract.distinctConcepts[0];
  assert.equal(pair.conceptA, 'sourceTicker');
  assert.equal(pair.conceptB, 'currentTicker');
  assert.equal(pair.severity, 'CRITICAL');
  assert.equal(pair.warnIfSameValue, true);
  assert.ok(pair.mustNotConflate.includes('binding'));
});

test('BL-020 serial date/time fixture: exact representation with forbidden formats', () => {
  const contract = compileFixture('bl020-serial-date-time-format.json');
  const serial = contract.concepts[0];
  assert.equal(serial.kind, 'timestamp');
  assert.equal(serial.dateTimeRepresentation, 'ISO-8601 UTC with milliseconds, e.g. 2025-01-02T03:04:05.678Z; never local time, never epoch seconds, never a serial integer');
  for (const alt of ['MM/dd/yyyy', 'unix_ms', 'serial_integer']) {
    assert.ok(serial.forbiddenAlternatives.includes(alt), `must forbid ${alt}`);
  }
});

test('BL-020 provider fixture: negative side-effect requirements are first-class', () => {
  const contract = compileFixture('bl020-provider-construction-before-authz.json');
  assert.equal(contract.riskClass, 'AUTHORIZATION_SECURITY_PROVIDER');
  const effects = contract.negativeSideEffects;
  assert.equal(effects.length, 5);
  const scopes = new Set(effects.map((s) => s.scope));
  assert.deepEqual(
    [...scopes].sort(),
    ['database', 'lock', 'mutation', 'network', 'provider_factory'],
  );
  for (const s of effects) {
    assert.equal(s.expectedCount, 0, `${s.scope} must remain zero`);
    assert.equal(s.gate, 'authorization failure');
    assert.match(s.sideEffectId, /^se_[0-9a-f]{64}$/);
  }
  assert.equal(new Set(effects.map((s) => s.sideEffectId)).size, 5, 'unique identities');

  // the side-effect contract must flow into the worker-ready repair contract
  const providerFactoryId = contract.negativeSideEffects.find(
    (s) => s.scope === 'provider_factory',
  ).sideEffectId;
  const repair = buildRepairContract({
    semanticContract: contract,
    rejectedAcceptanceRefs: [providerFactoryId],
    objective: 'Ensure provider construction never precedes persisted authorization',
    violation: 'provider factory was constructed before the authorization failure was handled',
    requiredBehavior: 'authorization failure terminates the flow with zero side effects',
    mustChange: [
      {
        target: 'provider_factory',
        change: 'move provider construction after the persisted authorization check',
      },
    ],
    verification: [
      { method: 'run negative side-effect test', expectation: 'all expectedCount assertions pass' },
    ],
    createdAt: NOW,
  });
  assert.equal(repair.negativeSideEffects.length, 5);
  assert.equal(repair.rejectedAcceptanceRefs[0], providerFactoryId);
  assert.equal(repair.sourceSemanticDigest, contract.semanticDigest);
  const guardTests = repair.acceptanceTests.filter((t) => t.negativeSideEffectId !== undefined);
  assert.equal(guardTests.length, 5);
  for (const t of guardTests) {
    assert.equal(t.expectedSideEffectCount, 0);
    assert.ok(contract.negativeSideEffects.some((s) => s.sideEffectId === t.negativeSideEffectId));
  }
});

test('BL-020 provider fixture: unresolved low-risk semantics are recorded without blocking', () => {
  const contract = compileFixture('bl020-provider-construction-before-authz.json');
  assert.equal(contract.unresolvedSemantics.length, 1);
  assert.equal(contract.unresolvedSemantics[0].riskClass, 'LOW_RISK');
  assert.equal(contract.compileStatus, 'COMPILED');
});
