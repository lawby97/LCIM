/**
 * Sprint 06 schema lockstep tests.
 *
 * - the three Sprint-06 schemas load through the Sprint-00 engine subset
 *   (no SchemaEngineError — failure-closed keyword discipline);
 * - valid fixtures validate; invalid fixtures fail;
 * - the Sprint-04 contract family keeps validating (regression);
 * - SOL error codes stay aligned with the shared rejection taxonomy.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { SOL_SCHEMA_MANIFEST, solSchemaNames, loadSolSchema, SOL_SCHEMA_VERSION } from '../../src/sol/contracts/registry.mjs';
import { validateSolAsk, validateSolResponse, validateRepairTicket } from '../../src/sol/contracts/validate.mjs';
import { ConfigError } from '../../src/shared/errors.mjs';
import { REJECTION_CODE } from '../../src/shared/enums.mjs';
import { validateAgainstSchema } from '../../src/shared/schema/validate.mjs';
import { loadContractSchema } from '../../src/contracts/registry.mjs';
import { readSolFixture } from './helpers.mjs';
import { readFixture } from '../helpers/semantic-fixture.mjs';

test('SOL schema manifest registers exactly the three Sprint-06 schemas', () => {
  assert.deepEqual(solSchemaNames().sort(), ['lcim.repair-ticket', 'lcim.sol-ask', 'lcim.sol-response']);
  for (const [name, entry] of Object.entries(SOL_SCHEMA_MANIFEST)) {
    assert.equal(entry.version, '2.0.0', name);
    assert.ok(entry.file.endsWith('.v2.schema.json'), name);
  }
  assert.equal(SOL_SCHEMA_VERSION, '2.0.0');
  assert.throws(() => loadSolSchema('lcim.common.envelope'), ConfigError);
});

test('all three SOL schemas stay inside the Sprint-00 engine subset', () => {
  // loading + validating an instance proves the schema shape check passes
  // (unsupported keywords would throw SchemaEngineError).
  const schemas = ['lcim.sol-ask', 'lcim.sol-response', 'lcim.repair-ticket'];
  for (const name of schemas) {
    const schema = loadSolSchema(name);
    assert.equal(typeof schema.$id, 'string');
    assert.equal(schema.$id.length > 0, true);
    // a bogus instance validates (or fails) without engine errors
    const result = validateAgainstSchema({}, schema);
    assert.equal(typeof result.valid, 'boolean');
  }
});

test('valid ask fixtures validate against the schema + semantic rules', () => {
  for (const name of [
    'valid-ask-contract-check.json',
    'valid-ask-diagnose.json',
    'valid-ask-final-review.json',
    'valid-ask-recheck.json',
  ]) {
    const result = validateSolAsk(readSolFixture(name));
    assert.equal(result.valid, true, name);
    assert.equal(result.errors.length, 0, name);
  }
});

test('valid response fixtures validate; invalid fixtures fail with the right codes', () => {
  for (const name of [
    'valid-response-contract-check-amendments.json',
    'valid-response-contract-check-sufficient.json',
    'valid-response-diagnose-cause-identified.json',
    'valid-response-final-review-pass.json',
    'valid-response-final-review-fail.json',
    'valid-response-recheck-resolved.json',
  ]) {
    const result = validateSolResponse(readSolFixture(name));
    assert.equal(result.valid, true, name);
  }
  const invalid = validateSolResponse(readSolFixture('invalid-response-unknown-verdict.json'));
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((e) => e.code === 'VERDICT_NOT_IN_VOCABULARY'));
});

test('valid repair-ticket fixture validates; a ticket with ticketId != repairId fails', () => {
  const fixture = readSolFixture('valid-repair-ticket.json');
  assert.equal(validateRepairTicket(fixture).valid, true);
  const mismatched = { ...fixture, ticketId: 'lcim_repair_' + '1'.repeat(32) };
  const result = validateRepairTicket(mismatched);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.code === 'TICKET_ID_MISMATCH'));
});

test('Sprint-04 contract schemas still validate (regression)', () => {
  const acceptance = loadContractSchema('lcim.acceptance-contract');
  const validRepair = readFixture('valid-acceptance-contract.json');
  const result = validateAgainstSchema(validRepair, acceptance);
  assert.equal(result.valid, true, 'Sprint-04 acceptance-contract fixture must keep validating');
  const semantic = loadContractSchema('lcim.semantic-contract');
  const validSemantic = readFixture('valid-semantic-contract.json');
  assert.equal(validateAgainstSchema(validSemantic, semantic).valid, true);
});

test('SOL rejection codes align with the shared rejection taxonomy', () => {
  assert.ok(REJECTION_CODE.includes('SOL_ASK_INVALID'));
  assert.ok(REJECTION_CODE.includes('BUDGET_EXHAUSTED'));
});
