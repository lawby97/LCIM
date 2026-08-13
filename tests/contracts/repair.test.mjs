/**
 * Sprint 04 unit tests: worker-ready repair/acceptance contracts.
 *
 * Acceptance criteria covered here:
 * - negative side-effect expectations are first-class acceptance criteria;
 * - repair-contract output is bounded and worker-ready;
 * - SOL-S04-002: repairs are authority-bound (validated authoritative
 *   COMPILED source with an internally valid digest), explicitly name
 *   rejected acceptance items, keep mustChange bounded to the derived
 *   repair scope, mechanically preserve frozen semantics, and never ask
 *   the worker to decide authoritative semantics.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRepairContract,
  generateRepairId,
  isValidRepairId,
  REPAIR_ID_PATTERN,
} from '../../src/contracts/repair.mjs';
import { compileSemanticContract } from '../../src/contracts/compiler.mjs';
import { validateAcceptanceContract } from '../../src/contracts/validate.mjs';
import { renderAcceptanceContract } from '../../src/contracts/render.mjs';
import { RepairContractError } from '../../src/contracts/errors.mjs';
import { ConfigError } from '../../src/shared/errors.mjs';
import { readFixture, rawInputFromFixture } from '../helpers/semantic-fixture.mjs';
import { computeSemanticDigest } from '../../src/contracts/digest.mjs';

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'fixtures',
  'contracts',
);

const NOW = '2025-01-01T00:00:00.000Z';

function compileProviderContract() {
  return compileSemanticContract(
    rawInputFromFixture(readFixture('bl020-provider-construction-before-authz.json')),
    { compiledAt: NOW },
  );
}

/** sideEffectId of the provider_factory spec in the provider contract. */
function providerFactoryEffectId(semantic) {
  return semantic.negativeSideEffects.find((s) => s.scope === 'provider_factory').sideEffectId;
}

function repairInput(overrides = {}) {
  const semantic = compileProviderContract();
  return {
    semanticContract: semantic,
    rejectedAcceptanceRefs: [providerFactoryEffectId(semantic)],
    objective: 'Ensure provider construction never precedes persisted authorization',
    violation: 'provider factory was constructed before the authorization failure was handled',
    requiredBehavior: 'authorization failure terminates the flow with zero side effects',
    mustChange: [
      {
        target: 'provider_factory',
        change: 'move provider factory construction after the persisted authorization check',
      },
    ],
    mustNotChange: [
      {
        target: 'authorization store',
        reason: 'authorization store semantics are authoritative and out of scope',
      },
    ],
    verification: [
      { method: 'run negative side-effect test', expectation: 'all expectedCount assertions pass' },
    ],
    createdAt: NOW,
    ...overrides,
  };
}

test('repair ids follow the shared LCIM id convention (lcim_repair_<32 hex>)', () => {
  const id = generateRepairId();
  assert.match(id, REPAIR_ID_PATTERN);
  assert.equal(id.length, 'lcim_repair_'.length + 32);
  assert.equal(isValidRepairId(id), true);
  assert.equal(isValidRepairId('lcim_repair_xyz'), false);
  assert.equal(isValidRepairId('lcim_run_0123456789abcdef0123456789abcdef'), false);
  // generated ids are unique in practice
  const ids = new Set(Array.from({ length: 100 }, () => generateRepairId()));
  assert.equal(ids.size, 100);
});

test('buildRepairContract produces a frozen, stamped, worker-ready document', () => {
  const repair = buildRepairContract(repairInput());
  assert.equal(repair.schemaName, 'lcim.acceptance-contract');
  assert.equal(repair.schemaVersion, '2.0.0');
  assert.equal(repair.contractKey, 'bl020.provider-construction-before-authz');
  assert.equal(repair.riskClass, 'AUTHORIZATION_SECURITY_PROVIDER');
  assert.ok(Object.isFrozen(repair));
  // required worker-ready shape
  assert.ok(repair.objective.length > 0);
  assert.ok(repair.violation.length > 0);
  assert.ok(repair.requiredBehavior.length > 0);
  assert.ok(repair.mustChange.length >= 1);
  assert.ok(repair.mustNotChange.length >= 1);
  assert.ok(repair.acceptanceTests.length >= 1);
  assert.ok(repair.verification.length >= 1);
  assert.equal(isValidRepairId(repair.repairId), true);
  // explicit source binding + rejected acceptance references
  assert.match(repair.sourceSemanticDigest, /^[0-9a-f]{64}$/);
  assert.ok(repair.rejectedAcceptanceRefs.length >= 1);
  assert.ok(repair.frozenSemantics !== undefined);

  // bounded: all free text fields respect the schema caps
  const text = JSON.stringify(repair);
  assert.ok(text.length < 20000);
});

test('negative side-effect expectations are first-class: carried into the repair contract', () => {
  const repair = buildRepairContract(repairInput());
  const source = repairInput().semanticContract;

  // every source spec is carried verbatim (identity + exact fields)
  assert.equal(repair.negativeSideEffects.length, source.negativeSideEffects.length);
  for (const s of source.negativeSideEffects) {
    const carried = repair.negativeSideEffects.find((c) => c.sideEffectId === s.sideEffectId);
    assert.ok(carried, `missing carried spec ${s.sideEffectId}`);
    assert.equal(carried.gate, s.gate);
    assert.equal(carried.scope, s.scope);
    assert.equal(carried.requirement, s.requirement);
    assert.equal(carried.expectedCount, s.expectedCount);
    assert.equal(carried.evidenceKind, s.evidenceKind);
  }

  // every carried spec gets its own acceptance-test entry pinning the count
  for (const s of source.negativeSideEffects) {
    const testEntry = repair.acceptanceTests.find((t) => t.negativeSideEffectId === s.sideEffectId);
    assert.ok(testEntry, `missing acceptance test for ${s.sideEffectId}`);
    assert.equal(testEntry.negativeSideEffectScope, s.scope);
    assert.equal(testEntry.expectedSideEffectCount, 0);
    assert.equal(testEntry.expectation, s.requirement);
  }

  // the combined document validates with the source contract attached
  const result = validateAcceptanceContract(repair, { semanticContract: source });
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test('user-supplied acceptance tests are preserved and validated', () => {
  const repair = buildRepairContract(
    repairInput({
      acceptanceTests: [
        {
          name: 'authorization failure path returns the error to the caller',
          expectation: 'the flow returns AUTHORIZATION_FAILED and no provider is created',
        },
      ],
    }),
  );
  assert.ok(
    repair.acceptanceTests.some((t) => t.name === 'authorization failure path returns the error to the caller'),
  );
  // side-effect guard tests were added automatically alongside
  const guardCount = repair.acceptanceTests.filter((t) => t.negativeSideEffectId !== undefined).length;
  assert.equal(guardCount, 5);
});

test('a conflicting user acceptance test for a side effect is rejected', () => {
  const semantic = compileProviderContract();
  const effectId = providerFactoryEffectId(semantic);
  const input = repairInput({
    acceptanceTests: [
      {
        name: 'side-effect guard with wrong count',
        expectation: 'x',
        negativeSideEffectId: effectId,
        negativeSideEffectScope: 'provider_factory',
        expectedSideEffectCount: 3, // conflicts with source expectedCount 0
      },
    ],
  });
  assert.throws(() => buildRepairContract(input), RepairContractError);
});

test('user acceptance tests may not reference side effects by gate::scope alone', () => {
  const input = repairInput({
    acceptanceTests: [
      {
        name: 'legacy ref',
        expectation: 'x',
        negativeSideEffectRef: 'authorization failure::provider_factory',
        negativeSideEffectScope: 'provider_factory',
        expectedSideEffectCount: 0,
      },
    ],
  });
  assert.throws(() => buildRepairContract(input), ConfigError);
});

test('repair contract validation fails closed when side-effect criteria are dropped', () => {
  const semantic = compileProviderContract();
  const repair = buildRepairContract(repairInput());
  // keep only 2 carried specs, an acceptance test for the first carried spec
  // plus one plain user test (minItems 1), drop the rest
  const stripped = {
    ...repair,
    negativeSideEffects: repair.negativeSideEffects.slice(0, 2),
    acceptanceTests: repair.acceptanceTests
      .filter((t) => t.negativeSideEffectId === repair.negativeSideEffects[0].sideEffectId)
      .concat([{ name: 'user test', expectation: 'flow returns the error' }]),
  };
  const result = validateAcceptanceContract(stripped, { semanticContract: semantic });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.message.includes('SIDE_EFFECT_NOT_CARRIED')));
  assert.ok(result.errors.some((e) => e.message.includes('SIDE_EFFECT_TEST_MISSING')));
});

test('repair contract contractKey must match the source semantic contract', () => {
  const repair = buildRepairContract(repairInput());
  const mismatched = { ...repair, contractKey: 'some.other.contract' };
  const result = validateAcceptanceContract(mismatched, {
    semanticContract: repairInput().semanticContract,
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.path === 'contractKey'));
});

test('buildRepairContract refuses non-contract sources and malformed input', () => {
  assert.throws(() => buildRepairContract({}), ConfigError);
  assert.throws(
    () =>
      buildRepairContract(
        repairInput({ semanticContract: { schemaName: 'lcim.common.run' } }),
      ),
    ConfigError,
  );
  assert.throws(() => buildRepairContract(repairInput({ objective: '' })), ConfigError);
  // empty mustChange/verification fail closed via schema minItems (RepairContractError)
  assert.throws(() => buildRepairContract(repairInput({ mustChange: [] })), RepairContractError);
  assert.throws(() => buildRepairContract(repairInput({ verification: [] })), RepairContractError);
  // rejectedAcceptanceRefs is required and must be a non-empty array
  const { rejectedAcceptanceRefs: _drop, ...withoutRefs } = repairInput();
  assert.throws(() => buildRepairContract(withoutRefs), ConfigError);
  assert.throws(() => buildRepairContract(repairInput({ rejectedAcceptanceRefs: [] })), ConfigError);
  assert.throws(
    () => buildRepairContract(repairInput({ rejectedAcceptanceRefs: ['not-an-id'] })),
    ConfigError,
  );
});

test('finding references must be valid shared finding ids', () => {
  const repair = buildRepairContract(
    repairInput({
      findingRefs: ['lcim_finding_0123456789abcdef0123456789abcdef'],
    }),
  );
  assert.deepEqual(repair.findingRefs, ['lcim_finding_0123456789abcdef0123456789abcdef']);
  assert.throws(
    () => buildRepairContract(repairInput({ findingRefs: ['not-an-id'] })),
    ConfigError,
  );
});

test('valid acceptance-contract fixture validates and renders worker-ready', () => {
  const fixture = readFixture('valid-acceptance-contract.json');
  const result = validateAcceptanceContract(fixture);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(isValidRepairId(fixture.repairId), true);
});

// ---------------------------------------------------------------------------
// SOL-S04-002: repair contracts must be authority-bound and bounded
// ---------------------------------------------------------------------------

test('SOL-S04-002 #1: CONTRACT_REVIEW_REQUIRED source => repair rejected', () => {
  const semantic = compileSemanticContract(
    rawInputFromFixture(readFixture('bl020-provider-construction-before-authz.json')),
    { compiledAt: NOW },
  );
  const reviewRequired = JSON.parse(JSON.stringify(semantic));
  reviewRequired.unresolvedSemantics = [
    { question: 'revocation delay', riskClass: 'AUTHORIZATION_SECURITY_PROVIDER' },
  ];
  // unresolvedSemantics are authority-bearing: recompute the digest
  reviewRequired.semanticDigest = computeSemanticDigest(reviewRequired);
  reviewRequired.compileStatus = 'CONTRACT_REVIEW_REQUIRED';
  assert.throws(
    () => buildRepairContract(repairInput({ semanticContract: reviewRequired })),
    RepairContractError,
  );
});

test('SOL-S04-002 #2: malformed source => repair rejected', () => {
  // schema-invalid source
  assert.throws(
    () => buildRepairContract(repairInput({ semanticContract: { schemaName: 'lcim.semantic-contract' } })),
    RepairContractError,
  );
  // semantically invalid source (duplicate concept)
  const semantic = compileProviderContract();
  const invalid = JSON.parse(JSON.stringify(semantic));
  invalid.concepts.push({ ...invalid.concepts[0] });
  assert.throws(
    () => buildRepairContract(repairInput({ semanticContract: invalid })),
    RepairContractError,
  );
  // digest-forged source
  const forged = JSON.parse(JSON.stringify(compileProviderContract()));
  forged.semanticDigest = '0'.repeat(64);
  assert.throws(
    () => buildRepairContract(repairInput({ semanticContract: forged })),
    RepairContractError,
  );
});

test('SOL-S04-002 #3: valid authoritative source + no rejected acceptance refs => rejected', () => {
  const { rejectedAcceptanceRefs: _drop, ...noRefs } = repairInput();
  assert.throws(() => buildRepairContract(noRefs), ConfigError);
  assert.throws(() => buildRepairContract(repairInput({ rejectedAcceptanceRefs: [] })), ConfigError);
});

test('SOL-S04-002 #4: unknown rejected acceptance ref => rejected', () => {
  const input = repairInput({
    rejectedAcceptanceRefs: ['se_' + 'a'.repeat(64)],
  });
  assert.throws(() => buildRepairContract(input), RepairContractError);
});

test('SOL-S04-002 #5: duplicate rejected ref => rejected', () => {
  const semantic = compileProviderContract();
  const id = providerFactoryEffectId(semantic);
  assert.throws(
    () => buildRepairContract(repairInput({ rejectedAcceptanceRefs: [id, id] })),
    ConfigError,
  );
});

test('SOL-S04-002 #6/#7/#8: repair preserves low-risk unresolved items, distinctConcepts and must-not-conflate visibly', () => {
  const source = rawInputFromFixture(readFixture('bl020-source-current-ticker-binding.json'));
  source.negativeSideEffects = [
    { gate: 'binding failure', scope: 'lock', requirement: 'lock acquisitions remain zero', expectedCount: 0 },
  ];
  source.unresolvedSemantics = [
    { question: 'exact refresh cadence of the registry view', riskClass: 'LOW_RISK', impact: 'cosmetic' },
  ];
  const semantic = compileSemanticContract(source, { compiledAt: NOW });
  const rejected = semantic.negativeSideEffects[0].sideEffectId;
  const repair = buildRepairContract({
    semanticContract: semantic,
    rejectedAcceptanceRefs: [rejected],
    objective: 'fix the binding check',
    violation: 'lock was acquired before the binding check',
    requiredBehavior: 'lock count stays zero',
    mustChange: [{ target: 'lock', change: 'move lock acquisition after the binding check' }],
    verification: [{ method: 'run negative test', expectation: 'passes' }],
    createdAt: NOW,
  });
  // low-risk unresolved item preserved verbatim
  assert.deepEqual(repair.frozenSemantics.unresolvedSemantics, semantic.unresolvedSemantics);
  assert.equal(repair.frozenSemantics.unresolvedSemantics[0].riskClass, 'LOW_RISK');
  assert.equal(
    repair.frozenSemantics.unresolvedSemantics[0].question,
    'exact refresh cadence of the registry view',
  );
  // distinctConcepts / must-not-conflate preserved verbatim
  assert.deepEqual(repair.frozenSemantics.distinctConcepts, semantic.distinctConcepts);
  assert.equal(repair.frozenSemantics.distinctConcepts[0].conceptA, 'sourceTicker');
  assert.equal(repair.frozenSemantics.distinctConcepts[0].conceptB, 'currentTicker');
  assert.ok(repair.frozenSemantics.distinctConcepts[0].mustNotConflate.includes('binding'));
  // renderer shows them visibly as frozen
  const text = renderAcceptanceContract(repair);
  assert.ok(text.includes('FROZEN REQUIREMENTS'));
  assert.ok(text.includes('sourceTicker != currentTicker'));
  assert.ok(text.includes('[LOW_RISK] exact refresh cadence of the registry view'));
});

test('SOL-S04-002 #9: repair preserves negative side-effect requirements', () => {
  const semantic = compileProviderContract();
  const repair = buildRepairContract(repairInput());
  assert.deepEqual(repair.negativeSideEffects, semantic.negativeSideEffects);
});

test('SOL-S04-002 #10: repair preserves unrelated accepted requirements', () => {
  const semantic = compileProviderContract();
  const repair = buildRepairContract(repairInput());
  // all source objects, concepts, facts, and non-rejected side effects
  assert.deepEqual(repair.frozenSemantics.sourceObjects, semantic.sourceObjects);
  assert.deepEqual(repair.frozenSemantics.concepts, semantic.concepts);
  assert.deepEqual(repair.frozenSemantics.factsEstablished, semantic.factsEstablished);
  const rejected = new Set(repair.rejectedAcceptanceRefs);
  const expectedFrozenEffects = semantic.negativeSideEffects.filter((s) => !rejected.has(s.sideEffectId));
  assert.deepEqual(repair.frozenSemantics.negativeSideEffects, expectedFrozenEffects);
  assert.equal(repair.frozenSemantics.negativeSideEffects.length, semantic.negativeSideEffects.length - 1);
});

test('SOL-S04-002 #11: caller attempts unrelated mustChange target => rejected', () => {
  const semantic = compileProviderContract();
  // only provider_factory was rejected; targeting network is unrelated
  const input = repairInput({
    mustChange: [
      { target: 'network', change: 'rewrite the network path' },
    ],
  });
  assert.throws(() => buildRepairContract(input), RepairContractError);
  // file-path style targets are not semantic repair scope
  const fileTarget = repairInput({
    mustChange: [
      { target: 'src/authorization/store.mjs', change: 'redesign unrelated behavior' },
    ],
  });
  assert.throws(() => buildRepairContract(fileTarget), RepairContractError);
});

test('SOL-S04-002 #12: bounded target directly corresponding to rejected item => accepted', () => {
  const repair = buildRepairContract(repairInput());
  const rejectedScope = repair.mustChange[0].target;
  const rejectedSpec = repair.negativeSideEffects.find(
    (s) => s.sideEffectId === repair.rejectedAcceptanceRefs[0],
  );
  assert.equal(rejectedScope, rejectedSpec.scope, 'mustChange target equals the rejected item scope');
  const result = validateAcceptanceContract(repair, { semanticContract: repairInput().semanticContract });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('SOL-S04-002 #13: worker-facing rendering distinguishes repair targets from frozen requirements', () => {
  const repair = buildRepairContract(repairInput());
  const text = renderAcceptanceContract(repair);
  assert.ok(text.includes('REPAIR TARGETS (rejected acceptance items):'));
  assert.ok(text.includes('FROZEN REQUIREMENTS (must not change):'));
  // the rejected side effect is tagged as a target in the carry section
  const rejectedId = repair.rejectedAcceptanceRefs[0];
  assert.ok(text.includes(`[${rejectedId}] [REJECTED TARGET]`));
  assert.ok(text.includes('[FROZEN]'));
});

test('SOL-S04-002: repair does not ask the worker to decide authoritative semantics', () => {
  const repair = buildRepairContract(repairInput());
  // no invented answers for unresolved semantics anywhere in the document
  for (const u of repair.frozenSemantics.unresolvedSemantics) {
    assert.equal('answer' in u, false);
    assert.equal('resolvedValue' in u, false);
  }
  // the repair never re-defines source authority
  assert.deepEqual(repair.frozenSemantics.concepts, repairInput().semanticContract.concepts);
  // no routing/provider/model/git fields exist in the acceptance schema shape
  for (const forbidden of ['provider', 'model', 'routing', 'gitSha', 'baseSha', 'prompt']) {
    assert.ok(!(forbidden in repair), `repair must not carry '${forbidden}'`);
  }
});

test('SOL-S04-002: frozen requirements tamper fails closed', () => {
  const semantic = compileProviderContract();
  const repair = buildRepairContract(repairInput());
  const tampered = JSON.parse(JSON.stringify(repair));
  tampered.frozenSemantics.concepts[0].failureBehavior = 'tampered semantics';
  const res = validateAcceptanceContract(tampered, { semanticContract: semantic });
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.message.includes('FROZEN_REQUIREMENT_MISMATCH')));
});
