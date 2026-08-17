/**
 * Sprint 05 tests: route-decision schema + conditional semantic rules.
 *
 * Covers: code/schema lockstep (decisions, reason codes, states), schema
 * version fail-closed, Pro MAX / Flash MAX machine-readable justification
 * requirements, implementation/SOL target requirements, STOP reason
 * constraints, substitution recording, non-negative budget counts, and the
 * fixture files.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRouteDecision, stampRouteDecision, loadRouteSchema } from '../../src/routing/registry.mjs';
import { SchemaValidationError } from '../../src/shared/errors.mjs';
import { ROUTE_DECISION, ROUTE_REASON_CODE, STUCK_REASON_CODES } from '../../src/routing/reasons.mjs';
import { ESCALATION_STATE } from '../../src/routing/state.mjs';
import { validDecision, WU_ID } from '../helpers/routing-fixture.mjs';

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'routing');

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

/** Build a terminal-decision record without target/reasoning fields. */
function terminalDecision(overrides = {}) {
  const { targetProvider, targetModel, targetRole, reasoningLevel, ...rest } = validDecision(overrides);
  return rest;
}

function errorsOf(record) {
  return validateRouteDecision(record).errors.map((e) => `${e.path || '(root)'}: ${e.message}`);
}

test('code vocabularies match the schema enums (lockstep, current 2.1.0)', () => {
  const schema = loadRouteSchema('lcim.route-decision', '2.1.0');
  assert.deepEqual(schema.properties.decision.enum, ROUTE_DECISION);
  assert.deepEqual(schema.properties.reasonCode.enum, ROUTE_REASON_CODE);
  assert.deepEqual(schema.properties.state.enum, ESCALATION_STATE);
  assert.deepEqual(schema.properties.nextState.enum, ESCALATION_STATE);
  for (const code of STUCK_REASON_CODES) {
    assert.ok(ROUTE_REASON_CODE.includes(code), `stuck code ${code} must be in ROUTE_REASON_CODE`);
  }
  assert.deepEqual(
    schema.properties.escalationJustification.properties.basis.enum,
    ['SOL_DIRECTED_REPAIR', 'CONFIRMED_CAPABILITY_FAILURE', 'CONTRACT_LOCKED_DIFFICULT_TASK'],
  );
});

test('the immutable 2.0.0 schema keeps its original vocabulary (never mutated)', () => {
  const schema = loadRouteSchema('lcim.route-decision', '2.0.0');
  assert.equal(schema.properties.schemaVersion.const, '2.0.0');
  // The 2.0.0 targetModel enum has NO gpt-5.6-sol and the reasonCode enum
  // has NO CODEX_OAUTH_UNAVAILABLE: V2.0.1 changes live only in 2.1.0.
  assert.ok(!schema.properties.targetModel.enum.includes('gpt-5.6-sol'), '2.0.0 targetModel must not include gpt-5.6-sol');
  assert.ok(!schema.properties.reasonCode.enum.includes('CODEX_OAUTH_UNAVAILABLE'), '2.0.0 reasonCode must not include CODEX_OAUTH_UNAVAILABLE');
  assert.deepEqual(
    schema.properties.targetModel.enum,
    ['deepseek-v4-flash', 'deepseek-pro-max', 'sol-xhigh', 'terra', 'luna'],
  );
});

test('valid normal Flash route validates and stamps to a frozen 2.1.0 record', () => {
  const record = validDecision();
  assert.equal(validateRouteDecision(record).valid, true);
  const stamped = stampRouteDecision(record);
  assert.equal(stamped.schemaName, 'lcim.route-decision');
  assert.equal(stamped.schemaVersion, '2.1.0');
  assert.equal(Object.isFrozen(stamped), true);
  assert.equal(Object.isFrozen(stamped.budget), true);
});

test('wrong schemaVersion fails closed (9.9.9)', () => {
  const record = validDecision({ schemaVersion: '9.9.9' });
  assert.equal(validateRouteDecision(record).valid, false);
});

test('unknown decision / reason code / state are rejected by the schema', () => {
  assert.equal(validateRouteDecision(validDecision({ decision: 'ROUTE_WHATEVER' })).valid, false);
  assert.equal(validateRouteDecision(validDecision({ reasonCode: 'WHATEVER' })).valid, false);
  assert.equal(validateRouteDecision(validDecision({ state: 'WHATEVER' })).valid, false);
  assert.equal(validateRouteDecision(validDecision({ nextState: 'WHATEVER' })).valid, false);
  assert.equal(validateRouteDecision(validDecision({ reasoningLevel: 'LOW' })).valid, false);
});

test('ROUTE_IMPLEMENT_PRO_MAX always requires a machine-readable justification', () => {
  const base = validDecision({
    decision: 'ROUTE_IMPLEMENT_PRO_MAX',
    reasonCode: 'PRO_MAX_ESCALATION',
    state: 'AWAITING_SOL_DIAGNOSE',
    nextState: 'AWAITING_PRO_MAX',
    targetModel: 'deepseek-pro-max',
    reasoningLevel: 'MAX',
  });
  // no justification -> invalid
  const errors = errorsOf(base);
  assert.ok(errors.some((e) => e.includes('escalationJustification is required')), errors.join(' | '));

  // valid justification -> valid
  const ok = { ...base, escalationJustification: { basis: 'SOL_DIRECTED_REPAIR', detail: 'SOL directed a difficult repair' } };
  assert.equal(validateRouteDecision(ok).valid, true);

  // invalid basis -> invalid
  const badBasis = { ...base, escalationJustification: { basis: 'I_FELT_LIKE_IT', detail: 'x' } };
  assert.equal(validateRouteDecision(badBasis).valid, false);

  // wrong target model for Pro MAX -> invalid
  const wrongModel = { ...ok, targetModel: 'deepseek-v4-flash' };
  assert.equal(validateRouteDecision(wrongModel).valid, false);
});

test('fixture: Pro MAX without justification is invalid; stamp throws', () => {
  const fixture = readFixture('invalid-pro-max-no-justification.json');
  assert.equal(validateRouteDecision(fixture).valid, false);
  assert.throws(() => stampRouteDecision(fixture), SchemaValidationError);
});

test('fixture: valid normal route validates', () => {
  const fixture = readFixture('valid-normal-route.json');
  assert.equal(validateRouteDecision(fixture).valid, true);
});

test('ROUTE_IMPLEMENT_FLASH_MAX requires justification with CONTRACT_LOCKED_DIFFICULT_TASK', () => {
  const base = validDecision({
    decision: 'ROUTE_IMPLEMENT_FLASH_MAX',
    reasonCode: 'MAX_JUSTIFIED',
    targetModel: 'deepseek-v4-flash',
    reasoningLevel: 'MAX',
  });
  assert.equal(validateRouteDecision(base).valid, false); // missing justification
  const ok = { ...base, escalationJustification: { basis: 'CONTRACT_LOCKED_DIFFICULT_TASK', detail: 'contract-locked unusually difficult implementation' } };
  assert.equal(validateRouteDecision(ok).valid, true);
  const solBasis = { ...ok, escalationJustification: { basis: 'SOL_DIRECTED_REPAIR', detail: 'x' } };
  assert.equal(validateRouteDecision(solBasis).valid, false); // SOL basis is not a Flash MAX basis
});

test('ROUTE_IMPLEMENT_FLASH must be XHIGH (MAX cannot dodge justification)', () => {
  const record = validDecision({ reasoningLevel: 'MAX' });
  const errors = errorsOf(record);
  assert.ok(errors.some((e) => e.includes("must be 'XHIGH'")), errors.join(' | '));
});

test('SOL decisions: 2.0.0 keeps classic sol-xhigh; 2.1.0 is the strict Codex gate only', () => {
  const solBase = {
    ...validDecision({
      decision: 'ROUTE_SOL_DIAGNOSE',
      reasonCode: 'SEMANTIC_REJECTION_ESCALATION',
      state: 'AWAITING_IMPLEMENTATION',
      nextState: 'AWAITING_SOL_DIAGNOSE',
    }),
    targetProvider: 'sol',
    targetModel: 'sol-xhigh',
    targetRole: 'SOL_DIAGNOSE',
    reasoningLevel: 'XHIGH',
  };
  // Immutable 2.0.0 historical semantics: classic sol-xhigh stays valid.
  assert.equal(validateRouteDecision({ ...solBase, schemaVersion: '2.0.0' }).valid, true);
  // Fifth-review rule: the classic channel has NO 2.1 production authority.
  assert.equal(validateRouteDecision({ ...solBase, schemaVersion: '2.1.0' }).valid, false);
  // implementation model on a SOL decision -> invalid
  assert.equal(validateRouteDecision({ ...solBase, schemaVersion: '2.0.0', targetModel: 'deepseek-v4-flash' }).valid, false);
  // non-SOL role -> invalid
  assert.equal(validateRouteDecision({ ...solBase, schemaVersion: '2.0.0', targetRole: 'IMPLEMENT' }).valid, false);
  // sol-pro provider is not routable from Sprint 05
  assert.equal(validateRouteDecision({ ...solBase, schemaVersion: '2.0.0', targetProvider: 'sol-pro' }).valid, false);
  // A 2.1.0 SOL record must be exactly openai-codex / gpt-5.6-sol / XHIGH.
  const codexBase = {
    ...solBase,
    schemaVersion: '2.1.0',
    targetProvider: 'pi',
    targetModel: 'gpt-5.6-sol',
  };
  assert.equal(validateRouteDecision(codexBase).valid, true);
  // 2.1.0 SOL without reasoningLevel is refused (XHIGH is part of the gate).
  assert.equal(validateRouteDecision({ ...codexBase, reasoningLevel: undefined }).valid, false);
  // every 2.1 SOL role is exactly the same strict gate
  for (const [decision, role, state, next] of [
    ['ROUTE_SOL_CONTRACT_CHECK', 'SOL_CONTRACT_CHECK', 'ROUTING_READY', 'AWAITING_SOL_CONTRACT_CHECK'],
    ['ROUTE_SOL_FINAL_REVIEW', 'SOL_FINAL_REVIEW', 'AWAITING_IMPLEMENTATION', 'AWAITING_SOL_FINAL_REVIEW'],
    ['ROUTE_SOL_RECHECK', 'SOL_RECHECK', 'AWAITING_REPAIR', 'AWAITING_SOL_RECHECK'],
  ]) {
    const record = {
      ...validDecision({ decision, reasonCode: 'SOL_FINAL_REVIEW', state, nextState: next }),
      schemaVersion: '2.1.0',
      targetProvider: 'pi',
      targetModel: 'gpt-5.6-sol',
      targetRole: role,
      reasoningLevel: 'XHIGH',
    };
    assert.equal(validateRouteDecision(record).valid, true, decision);
  }
});

test('schema-version compatibility: a 2.0.0 record cannot smuggle the codex channel', () => {
  // The V2.0.1 repair must NOT mutate 2.0.0 semantics: the same fields
  // that are valid under 2.1.0 are INVALID under 2.0.0, and relabeling a
  // 2.0.0 record as 2.1.0 is a version change, not a backfill.
  const codexTarget = {
    ...validDecision({
      decision: 'ROUTE_SOL_DIAGNOSE',
      reasonCode: 'SEMANTIC_REJECTION_ESCALATION',
      state: 'AWAITING_IMPLEMENTATION',
      nextState: 'AWAITING_SOL_DIAGNOSE',
    }),
    targetProvider: 'pi',
    targetModel: 'gpt-5.6-sol',
    targetRole: 'SOL_DIAGNOSE',
    reasoningLevel: 'XHIGH',
  };
  assert.equal(validateRouteDecision({ ...codexTarget, schemaVersion: '2.0.0' }).valid, false);
  assert.equal(validateRouteDecision({ ...codexTarget, schemaVersion: '2.1.0' }).valid, true);
  // A 2.1.0 record that smuggles the classic channel is refused (no 2.1 authority).
  assert.equal(
    validateRouteDecision({
      ...codexTarget,
      schemaVersion: '2.1.0',
      targetProvider: 'sol',
      targetModel: 'sol-xhigh',
    }).valid,
    false,
  );
  // A 2.0.0-stamped record carrying the new reason code is also refused.
  const stale = validDecision({
    decision: 'FAIL_NO_SUBSTITUTE',
    reasonCode: 'CODEX_OAUTH_UNAVAILABLE',
    state: 'ROUTING_READY',
    nextState: 'FAILED_NO_SUBSTITUTE',
  });
  delete stale.targetProvider;
  delete stale.targetModel;
  delete stale.targetRole;
  delete stale.reasoningLevel;
  assert.equal(validateRouteDecision({ ...stale, schemaVersion: '2.0.0' }).valid, false);
  assert.equal(validateRouteDecision({ ...stale, schemaVersion: '2.1.0' }).valid, true);
});

test('V2.0.1 SOL decisions must be EXACTLY gpt-5.6-sol on provider pi at XHIGH (2.1.0 only)', () => {
  const solBase = {
    ...validDecision({
      decision: 'ROUTE_SOL_DIAGNOSE',
      reasonCode: 'SEMANTIC_REJECTION_ESCALATION',
      state: 'AWAITING_IMPLEMENTATION',
      nextState: 'AWAITING_SOL_DIAGNOSE',
    }),
    schemaVersion: '2.1.0',
    targetProvider: 'pi',
    targetModel: 'gpt-5.6-sol',
    targetRole: 'SOL_DIAGNOSE',
    reasoningLevel: 'XHIGH',
  };
  assert.equal(validateRouteDecision(solBase).valid, true);
  // cross-channel mixes are invalid (no silent substitution, no classic)
  assert.equal(validateRouteDecision({ ...solBase, targetModel: 'sol-xhigh' }).valid, false);
  assert.equal(validateRouteDecision({ ...solBase, targetProvider: 'sol', targetModel: 'gpt-5.6-sol' }).valid, false);
  assert.equal(validateRouteDecision({ ...solBase, targetRole: 'IMPLEMENT' }).valid, false);
  // 2.1.0 SOL decisions REQUIRE XHIGH (the strict gate runs XHIGH only)
  assert.equal(validateRouteDecision({ ...solBase, reasoningLevel: 'MAX' }).valid, false);
  assert.equal(validateRouteDecision({ ...solBase, reasoningLevel: undefined }).valid, false);
  // every SOL role is valid on the codex target at XHIGH
  for (const [decision, role, state, next] of [
    ['ROUTE_SOL_CONTRACT_CHECK', 'SOL_CONTRACT_CHECK', 'ROUTING_READY', 'AWAITING_SOL_CONTRACT_CHECK'],
    ['ROUTE_SOL_FINAL_REVIEW', 'SOL_FINAL_REVIEW', 'AWAITING_IMPLEMENTATION', 'AWAITING_SOL_FINAL_REVIEW'],
    ['ROUTE_SOL_RECHECK', 'SOL_RECHECK', 'AWAITING_REPAIR', 'AWAITING_SOL_RECHECK'],
  ]) {
    const record = {
      ...validDecision({ decision, reasonCode: 'SOL_FINAL_REVIEW', state, nextState: next }),
      schemaVersion: '2.1.0',
      targetProvider: 'pi',
      targetModel: 'gpt-5.6-sol',
      targetRole: role,
      reasoningLevel: 'XHIGH',
    };
    assert.equal(validateRouteDecision(record).valid, true, decision);
  }
});

test('FAIL_NO_SUBSTITUTE accepts only the no-substitute reason codes (2.1.0 rule)', () => {
  const base = {
    ...validDecision({
      decision: 'FAIL_NO_SUBSTITUTE',
      reasonCode: 'PROVIDER_UNAVAILABLE',
      state: 'ROUTING_READY',
      nextState: 'FAILED_NO_SUBSTITUTE',
    }),
    schemaVersion: '2.1.0',
  };
  delete base.targetProvider;
  delete base.targetModel;
  delete base.targetRole;
  delete base.reasoningLevel;
  assert.equal(validateRouteDecision(base).valid, true);
  for (const code of ['CAPABILITY_GAP_NO_SUBSTITUTE', 'CODEX_OAUTH_UNAVAILABLE']) {
    assert.equal(validateRouteDecision({ ...base, reasonCode: code }).valid, true, code);
  }
  assert.equal(validateRouteDecision({ ...base, reasonCode: 'NORMAL_BOUNDED_TASK' }).valid, false);
  assert.equal(validateRouteDecision({ ...base, reasonCode: 'CODEX_OAUTH_UNAVAILABLE', targetModel: 'gpt-5.6-sol' }).valid, false);
});

test('implementation decisions require an implementation-capable target', () => {
  assert.equal(validateRouteDecision(validDecision({ targetModel: 'sol-xhigh', targetRole: 'SOL_RECHECK' })).valid, false);
  assert.equal(validateRouteDecision(validDecision({ targetProvider: 'sol' })).valid, false);
  assert.equal(validateRouteDecision(validDecision({ targetRole: 'SOL_DIAGNOSE' })).valid, false);
});

test('STOP_STUCK requires a STUCK reason code; STOP_BUDGET requires BUDGET_EXHAUSTED', () => {
  const stuckBase = terminalDecision({
    decision: 'STOP_STUCK',
    state: 'AWAITING_REPAIR',
    nextState: 'STOPPED_STUCK',
  });
  assert.equal(validateRouteDecision({ ...stuckBase, reasonCode: 'NORMAL_BOUNDED_TASK' }).valid, false);
  assert.equal(validateRouteDecision({ ...stuckBase, reasonCode: 'SAME_AC_FAILED_AFTER_REPAIR' }).valid, true);

  const budgetBase = terminalDecision({
    decision: 'STOP_BUDGET',
    state: 'AWAITING_IMPLEMENTATION',
    nextState: 'STOPPED_BUDGET',
  });
  assert.equal(validateRouteDecision({ ...budgetBase, reasonCode: 'PROVIDER_UNAVAILABLE' }).valid, false);
  assert.equal(validateRouteDecision({ ...budgetBase, reasonCode: 'BUDGET_EXHAUSTED' }).valid, true);
});

test('substituteOf must be recorded with a substitution reason code on implementation decisions', () => {
  const base = validDecision({ substituteOf: 'deepseek-v4-flash' });
  assert.equal(validateRouteDecision(base).valid, false); // NORMAL_BOUNDED_TASK is not a substitution code
  assert.equal(
    validateRouteDecision({
      ...base,
      reasonCode: 'EXACT_SUBSTITUTE_CONFIGURED',
      targetModel: 'terra',
      targetProvider: 'pi',
    }).valid,
    true,
  );
  assert.equal(
    validateRouteDecision({ ...base, reasonCode: 'CAPABILITY_FALLBACK_CONFIGURED', targetModel: 'luna' }).valid,
    true,
  );
  const complete = terminalDecision({ decision: 'ROUTE_COMPLETE', reasonCode: 'RESULT_ACCEPTED', nextState: 'UNIT_COMPLETE', substituteOf: 'deepseek-v4-flash' });
  assert.equal(validateRouteDecision(complete).valid, false); // terminal decision cannot carry substituteOf
});

test('terminal decisions carry no target/reasoning/escalation fields', () => {
  const complete = terminalDecision({ decision: 'ROUTE_COMPLETE', reasonCode: 'RESULT_ACCEPTED', nextState: 'UNIT_COMPLETE' });
  assert.equal(validateRouteDecision(complete).valid, true);
  assert.equal(validateRouteDecision({ ...complete, targetModel: 'deepseek-v4-flash' }).valid, false);
  assert.equal(validateRouteDecision({ ...complete, reasoningLevel: 'XHIGH' }).valid, false);
  assert.equal(
    validateRouteDecision({ ...complete, escalationJustification: { basis: 'CONTRACT_LOCKED_DIFFICULT_TASK', detail: 'x' } }).valid,
    false,
  );
});

test('budget counts must be non-negative integers', () => {
  const bad = validDecision({ budget: { runCallsConsumed: 0, runCallsLimit: 50, unitCallsConsumed: -1, unitCallsLimit: 10 } });
  assert.equal(validateRouteDecision(bad).valid, false);
  const fractional = validDecision({ budget: { runCallsConsumed: 0, runCallsLimit: 50, unitCallsConsumed: 1.5, unitCallsLimit: 10 } });
  assert.equal(validateRouteDecision(fractional).valid, false);
});

test('workUnitId must match the lcim_wu_ pattern', () => {
  assert.equal(validateRouteDecision(validDecision({ workUnitId: 'nope' })).valid, false);
  assert.equal(validateRouteDecision(validDecision({ workUnitId: WU_ID })).valid, true);
});

test('ROUTE_IMPLEMENT_FLASH targeting deepseek-pro-max fails validation (escalation-only bypass)', () => {
  // A manually stamped Flash route cannot smuggle Pro MAX as an ordinary target.
  const bypass = validDecision({ targetModel: 'deepseek-pro-max', reasoningLevel: 'XHIGH' });
  assert.equal(validateRouteDecision(bypass).valid, false);
  const errors = errorsOf(bypass);
  assert.ok(
    errors.some((e) => e.includes('escalation-only')),
    errors.join(' | '),
  );
  assert.throws(() => stampRouteDecision(bypass), SchemaValidationError);
  // ROUTE_IMPLEMENT_FLASH_MAX with Pro MAX is equally refused.
  const maxBypass = validDecision({
    decision: 'ROUTE_IMPLEMENT_FLASH_MAX',
    reasonCode: 'MAX_JUSTIFIED',
    targetModel: 'deepseek-pro-max',
    reasoningLevel: 'MAX',
    escalationJustification: { basis: 'CONTRACT_LOCKED_DIFFICULT_TASK', detail: 'x' },
  });
  assert.equal(validateRouteDecision(maxBypass).valid, false);
});
