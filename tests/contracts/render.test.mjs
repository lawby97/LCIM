/**
 * Sprint 04 unit tests: compact human-readable renderer.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderSemanticContract,
  renderAcceptanceContract,
  RENDER_MAX_LENGTH,
} from '../../src/contracts/render.mjs';
import { compileSemanticContract } from '../../src/contracts/compiler.mjs';
import { buildRepairContract } from '../../src/contracts/repair.mjs';
import { readFixture, rawInputFromFixture } from '../helpers/semantic-fixture.mjs';

const NOW = '2025-01-01T00:00:00.000Z';

function compileFixture(name) {
  return compileSemanticContract(rawInputFromFixture(readFixture(name)), { compiledAt: NOW });
}

function buildProviderRepair() {
  const semantic = compileFixture('bl020-provider-construction-before-authz.json');
  const providerFactoryId = semantic.negativeSideEffects.find(
    (s) => s.scope === 'provider_factory',
  ).sideEffectId;
  return buildRepairContract({
    semanticContract: semantic,
    rejectedAcceptanceRefs: [providerFactoryId],
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
  });
}

test('renderSemanticContract is compact, deterministic, and contains the authoritative facts', () => {
  const contract = compileFixture('bl020-provider-construction-before-authz.json');
  const first = renderSemanticContract(contract);
  const second = renderSemanticContract(contract);
  assert.equal(first, second); // deterministic

  assert.ok(first.startsWith('SEMANTIC CONTRACT: bl020.provider-construction-before-authz'));
  assert.ok(first.includes('status: COMPILED'));
  assert.ok(first.includes('AUTHORIZATION_SECURITY_PROVIDER'));
  assert.ok(first.includes('authorizationGate'));
  assert.ok(first.includes('provider_factory count = 0'));
  assert.ok(first.includes('network count = 0'));
  assert.ok(first.includes('database count = 0'));
  assert.ok(first.includes('lock count = 0'));
  assert.ok(first.includes('mutation count = 0'));
  assert.ok(first.includes('unresolvedSemantics: 1'));
  // content identity is rendered
  assert.ok(first.includes(`semanticDigest: ${contract.semanticDigest}`));
  // side-effect identities are rendered
  for (const s of contract.negativeSideEffects) {
    assert.ok(first.includes(s.sideEffectId), `render must show ${s.sideEffectId}`);
  }
  assert.ok(first.length <= RENDER_MAX_LENGTH);
});

test('renderer surfaces distinct_concepts and forbidden alternatives', () => {
  const contract = compileFixture('bl020-decision-evidence-membership-digests.json');
  const text = renderSemanticContract(contract);
  assert.ok(text.includes('decisionDigest != evidenceDigest [CRITICAL]'));
  assert.ok(text.includes('decisionDigest != membershipDigest [CRITICAL]'));
  assert.ok(text.includes('digest=sha256 over the decision record body only'));
  assert.ok(text.includes('forbidden='));
});

test('renderer surfaces unresolved semantics and review-required status', () => {
  const raw = rawInputFromFixture(readFixture('bl020-provider-construction-before-authz.json'));
  raw.unresolvedSemantics = [
    {
      question: 'exact revocation propagation delay',
      riskClass: 'AUTHORIZATION_SECURITY_PROVIDER',
      impact: 'revocation timing is security-relevant',
    },
  ];
  const contract = compileSemanticContract(raw, { compiledAt: NOW });
  const text = renderSemanticContract(contract);
  assert.ok(text.includes('status: CONTRACT_REVIEW_REQUIRED'));
  assert.ok(text.includes('[AUTHORIZATION_SECURITY_PROVIDER] exact revocation propagation delay'));
});

test('renderer output is bounded even for warning-heavy contracts', () => {
  const contract = compileFixture('valid-warning-omissions.json');
  const text = renderSemanticContract(contract);
  assert.ok(text.includes('compileWarnings:'));
  assert.ok(text.includes('[MISSING_DIGEST_MEANING]'));
  assert.ok(text.length <= RENDER_MAX_LENGTH);
});

test('renderAcceptanceContract is compact and worker-readable', () => {
  const repair = buildProviderRepair();
  const text = renderAcceptanceContract(repair);
  assert.ok(text.startsWith(`REPAIR CONTRACT: ${repair.repairId}`));
  assert.ok(text.includes('objective: Ensure provider construction'));
  assert.ok(text.includes('violation: provider factory was constructed'));
  assert.ok(text.includes('mustChange (bounded to rejected acceptance items):'));
  assert.ok(text.includes('side-effect(provider_factory)=0'));
  assert.ok(text.includes('side-effect(network)=0'));
  assert.ok(text.includes('side-effect(mutation)=0'));
  assert.ok(text.length <= RENDER_MAX_LENGTH);
});

test('renderAcceptanceContract distinguishes repair targets from frozen requirements', () => {
  const repair = buildProviderRepair();
  const text = renderAcceptanceContract(repair);
  assert.ok(text.includes('REPAIR TARGETS (rejected acceptance items):'));
  assert.ok(text.includes('FROZEN REQUIREMENTS (must not change):'));
  const rejectedId = repair.rejectedAcceptanceRefs[0];
  assert.ok(text.includes(`[${rejectedId}] [REJECTED TARGET]`), 'rejected item is tagged');
  assert.ok(text.includes('[FROZEN]'), 'preserved items are tagged');
  // source binding is visible
  assert.ok(text.includes(`sourceSemanticDigest: ${repair.sourceSemanticDigest}`));
});

test('renderer never exceeds the hard cap, even with many concepts', () => {
  const raw = rawInputFromFixture(readFixture('valid-semantic-contract.json'));
  for (let i = 0; i < 60; i += 1) {
    raw.concepts.push({
      name: `extraConcept${i}`,
      kind: 'field',
      authoritativeFieldNames: [`extra_field_${i}`],
      ownership: 'unit test',
      sourceObjectKey: 'source-one',
    });
  }
  const contract = compileSemanticContract(raw, { compiledAt: NOW });
  const text = renderSemanticContract(contract);
  assert.ok(text.length <= RENDER_MAX_LENGTH);
});
