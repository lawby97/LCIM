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

test('code vocabularies match the schema enums (lockstep)', () => {
  const schema = loadRouteSchema('lcim.route-decision');
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

test('valid normal Flash route validates and stamps to a frozen record', () => {
  const record = validDecision();
  assert.equal(validateRouteDecision(record).valid, true);
  const stamped = stampRouteDecision(record);
  assert.equal(stamped.schemaName, 'lcim.route-decision');
  assert.equal(stamped.schemaVersion, '2.0.0');
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

test('SOL decisions must target sol-xhigh with a SOL role on provider sol', () => {
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
  };
  assert.equal(validateRouteDecision(solBase).valid, true);
  // implementation model on a SOL decision -> invalid
  assert.equal(validateRouteDecision({ ...solBase, targetModel: 'deepseek-v4-flash' }).valid, false);
  // non-SOL role -> invalid
  assert.equal(validateRouteDecision({ ...solBase, targetRole: 'IMPLEMENT' }).valid, false);
  // sol-pro provider is not routable from Sprint 05
  assert.equal(validateRouteDecision({ ...solBase, targetProvider: 'sol-pro' }).valid, false);
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
