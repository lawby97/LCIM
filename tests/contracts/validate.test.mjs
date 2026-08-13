/**
 * Sprint 04 unit tests: contract validation (schema + semantic rules) and
 * schema-drift lockstep.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateSemanticContract,
  validateAcceptanceContract,
  SEMANTIC_ERROR_CODES,
  SEMANTIC_WARNING_CODES,
} from '../../src/contracts/validate.mjs';
import {
  CONTRACT_SCHEMA_MANIFEST,
  CONTRACT_SCHEMA_VERSION,
  loadContractSchema,
  contractSchemaNames,
} from '../../src/contracts/registry.mjs';
import { validateAgainstSchema } from '../../src/shared/schema/validate.mjs';
import { SchemaEngineError } from '../../src/shared/errors.mjs';
import { HIGH_RISK_CLASSES, RISK_CLASSES } from '../../src/risk/classes.mjs';
import { SIDE_EFFECT_SCOPES } from '../../src/risk/side-effects.mjs';
import { computeSemanticDigest } from '../../src/contracts/digest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SCHEMA_DIR = path.join(ROOT, 'schemas');
const FIXTURE_DIR = path.join(ROOT, 'tests', 'fixtures', 'contracts');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8'));
}

test('contract schema manifest files exist and versions are locked to 2.0.0', () => {
  assert.deepEqual(contractSchemaNames().sort(), ['lcim.acceptance-contract', 'lcim.semantic-contract']);
  for (const [name, meta] of Object.entries(CONTRACT_SCHEMA_MANIFEST)) {
    assert.ok(fs.existsSync(path.join(SCHEMA_DIR, meta.file)), name);
    assert.equal(meta.version, CONTRACT_SCHEMA_VERSION, name);
    const schema = loadContractSchema(name);
    assert.ok(schema.$id.startsWith('https://lcim.local/schemas/'), name);
    assert.equal(schema.properties.schemaName.const, name, name);
    assert.equal(schema.properties.schemaVersion.const, '2.0.0', name);
  }
});

test('contract schemas stay within the Sprint-00 engine subset (fail closed otherwise)', () => {
  for (const name of contractSchemaNames()) {
    const schema = loadContractSchema(name);
    // the engine itself validates schema definitions; any unsupported keyword
    // would throw SchemaEngineError here
    assert.doesNotThrow(() => validateAgainstSchema({}, schema), name);
  }
  // belt and braces: no $ref / oneOf / format / minimum anywhere
  const text = fs.readFileSync(path.join(SCHEMA_DIR, 'semantic-contract.v2.schema.json'), 'utf8') +
    fs.readFileSync(path.join(SCHEMA_DIR, 'acceptance-contract.v2.schema.json'), 'utf8');
  for (const forbidden of ['"$ref"', '"oneOf"', '"anyOf"', '"format"', '"minimum"', '"patternProperties"', '"$defs"']) {
    assert.ok(!text.includes(forbidden), `contract schemas must not use ${forbidden}`);
  }
});

test('schema riskClass enum matches src/risk/classes.mjs', () => {
  for (const name of ['lcim.semantic-contract', 'lcim.acceptance-contract']) {
    const schema = loadContractSchema(name);
    assert.deepEqual(schema.properties.riskClass.enum, [...RISK_CLASSES], name);
  }
  const semantic = loadContractSchema('lcim.semantic-contract');
  assert.deepEqual(semantic.properties.unresolvedSemantics.items.properties.riskClass.enum, [...RISK_CLASSES]);
  assert.deepEqual(
    semantic.properties.negativeSideEffects.items.properties.scope.enum,
    [...SIDE_EFFECT_SCOPES],
  );
  const acceptance = loadContractSchema('lcim.acceptance-contract');
  assert.deepEqual(acceptance.properties.negativeSideEffects.items.properties.scope.enum, [...SIDE_EFFECT_SCOPES]);
  assert.deepEqual(
    acceptance.properties.acceptanceTests.items.properties.negativeSideEffectScope.enum,
    [...SIDE_EFFECT_SCOPES],
  );
});

test('every valid fixture validates against its contract schema', () => {
  for (const file of fs.readdirSync(FIXTURE_DIR).filter((f) => f.startsWith('valid-')).sort()) {
    const instance = readJson(file);
    const name = file.startsWith('valid-acceptance') ? 'lcim.acceptance-contract' : 'lcim.semantic-contract';
    const result = validateAgainstSchema(instance, loadContractSchema(name));
    assert.deepEqual(result.errors, [], `${file} should be schema-valid`);
  }
  // semantic rules also pass on the valid semantic fixtures
  for (const file of ['valid-semantic-contract.json', 'valid-low-risk-unresolved.json', 'valid-warning-omissions.json']) {
    const result = validateSemanticContract(readJson(file));
    assert.equal(result.valid, true, file);
    assert.deepEqual(result.errors, [], file);
  }
  const repair = validateAcceptanceContract(readJson('valid-acceptance-contract.json'));
  assert.equal(repair.valid, true, 'valid-acceptance-contract.json');
  assert.deepEqual(repair.errors, []);
});

test('every invalid fixture fails validation with the targeted defect', () => {
  const cases = [
    ['invalid-ambiguous-digests.json', 'AMBIGUOUS_MEANING'],
    ['invalid-duplicate-concept.json', 'DUPLICATE_CONCEPT'],
    ['invalid-unknown-distinct-ref.json', 'UNKNOWN_DISTINCT_REF'],
    ['invalid-status-mismatch.json', 'STATUS_MISMATCH'],
    ['invalid-contradictory-lifecycle.json', 'INVALID_TRANSITION_STATE'],
    ['invalid-field-name-overlap.json', 'FIELD_NAME_OVERLAP'],
    ['invalid-negative-side-effect-count.json', 'INVALID_SIDE_EFFECT_COUNT'],
    ['invalid-unresolved-invention.json', null], // schema-level additionalProperties error
    ['invalid-unknown-source-object.json', 'UNKNOWN_SOURCE_OBJECT'],
  ];
  for (const [file, code] of cases) {
    const result = validateSemanticContract(readJson(file));
    assert.equal(result.valid, false, `${file} should be invalid`);
    if (code !== null) {
      assert.ok(
        result.errors.some((e) => e.message.includes(code)),
        `${file} expected error mentioning ${code}, got: ${JSON.stringify(result.errors)}`,
      );
    }
  }
});

test('distinct digests/identities cannot be represented ambiguously without warning/error', () => {
  // error: identical digest meaning under must_not_conflate
  const ambiguous = readJson('invalid-ambiguous-digests.json');
  const res = validateSemanticContract(ambiguous);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.message.includes('cannot be represented unambiguously')));

  // warning: digest concept without digestMeaning cannot be verified distinct
  const warned = readJson('valid-warning-omissions.json');
  const res2 = validateSemanticContract(warned);
  assert.equal(res2.valid, true);
  const codes = res2.warnings.map((w) => w.code);
  assert.ok(codes.includes('MISSING_DIGEST_MEANING'), JSON.stringify(res2.warnings));
  assert.ok(codes.includes('MISSING_SOURCE_OF_TRUTH'), JSON.stringify(res2.warnings));

  // error: identity concepts sharing an identityMeaning under must_not_conflate
  const idAmbiguous = {
    ...readJson('bl020-source-current-ticker-binding.json'),
    compileStatus: 'COMPILED',
    compiledAt: '2025-01-01T00:00:00.000Z',
    concepts: [
      {
        name: 'sourceTicker',
        kind: 'identity',
        authoritativeFieldNames: ['source_ticker'],
        identityMeaning: 'binds to registry ticker T',
        ownership: 't',
        sourceObjectKey: 'ticker-binding-config',
      },
      {
        name: 'currentTicker',
        kind: 'identity',
        authoritativeFieldNames: ['current_ticker'],
        identityMeaning: 'binds to registry ticker T',
        ownership: 't',
        sourceObjectKey: 'ticker-binding-config',
      },
    ],
  };
  const res3 = validateSemanticContract(idAmbiguous);
  assert.equal(res3.valid, false);
  assert.ok(res3.errors.some((e) => e.message.includes('cannot be represented unambiguously')));
});

test('missing source of truth is surfaced (warning), unknown source reference is an error', () => {
  const noSource = readJson('valid-warning-omissions.json');
  const res = validateSemanticContract(noSource);
  assert.ok(res.warnings.some((w) => w.code === 'MISSING_SOURCE_OF_TRUTH'));

  const unknown = readJson('invalid-unknown-source-object.json');
  const res2 = validateSemanticContract(unknown);
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some((e) => e.message.includes('unknown source object')));
});

test('contradictory lifecycles fail closed', () => {
  const res = validateSemanticContract(readJson('invalid-contradictory-lifecycle.json'));
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.message.includes('contradictory lifecycle')));
});

test('compileStatus consistency: high-risk unresolved semantics can never hide under COMPILED', () => {
  const res = validateSemanticContract(readJson('invalid-status-mismatch.json'));
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.path === 'compileStatus'));

  // the same content with the correct status validates
  const fixed = readJson('invalid-status-mismatch.json');
  fixed.compileStatus = 'CONTRACT_REVIEW_REQUIRED';
  const res2 = validateSemanticContract(fixed);
  assert.equal(res2.valid, true, JSON.stringify(res2.errors));
});

test('negative side-effect expectedCount must be an integer >= 0', () => {
  const res = validateSemanticContract(readJson('invalid-negative-side-effect-count.json'));
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.path === 'negativeSideEffects[0].expectedCount'));
});

test('unresolved semantics carrying invented answers are schema-invalid', () => {
  const res = validateSemanticContract(readJson('invalid-unresolved-invention.json'));
  assert.equal(res.valid, false);
  assert.ok(
    res.errors.some((e) => e.message.includes('answer')),
    JSON.stringify(res.errors),
  );
});

test('engine fail-closed behavior applies to contract schemas', () => {
  assert.throws(
    () => validateAgainstSchema({}, { type: 'object', $ref: '#/$defs/x' }),
    SchemaEngineError,
  );
});

test('warning/error code vocabularies are exported and non-empty', () => {
  assert.ok(SEMANTIC_ERROR_CODES.length >= 8);
  assert.ok(SEMANTIC_WARNING_CODES.length >= 3);
  assert.ok(HIGH_RISK_CLASSES.length === 6);
});

test('SOL-S04-005: duplicate source object keys fail closed', () => {
  const base = readJson('valid-semantic-contract.json');
  const withSources = (sourceObjects) =>
    validateSemanticContract({ ...base, sourceObjects });
  const dupPair = (a, b) => [
    { key: 'ticker-source', kind: 'fixture', ref: a, authority: 'current' },
    { key: 'ticker-source', kind: 'fixture', ref: b, authority: 'historical' },
  ];
  // duplicate key with different ref => fail
  const res1 = withSources([...base.sourceObjects, ...dupPair('source-A', 'source-B')]);
  assert.equal(res1.valid, false);
  assert.ok(res1.errors.some((e) => e.message.includes('DUPLICATE_SOURCE_KEY')), JSON.stringify(res1.errors));
  // duplicate key with different authority => fail
  const res2 = withSources([
    ...base.sourceObjects,
    { key: 'ticker-source', kind: 'fixture', ref: 'source-A', authority: 'current' },
    { key: 'ticker-source', kind: 'fixture', ref: 'source-A', authority: 'historical' },
  ]);
  assert.equal(res2.valid, false);
  assert.ok(res2.errors.some((e) => e.message.includes('DUPLICATE_SOURCE_KEY')));
  // otherwise identical duplicate => still fail (no spec permits duplicates)
  const res3 = withSources([
    ...base.sourceObjects,
    { key: 'ticker-source', kind: 'fixture', ref: 'same', authority: 'same' },
    { key: 'ticker-source', kind: 'fixture', ref: 'same', authority: 'same' },
  ]);
  assert.equal(res3.valid, false);
  assert.ok(res3.errors.some((e) => e.message.includes('DUPLICATE_SOURCE_KEY')));
  // unique source keys => normal validation succeeds (digest restamped)
  const unique = {
    ...base,
    sourceObjects: [
      ...base.sourceObjects,
      { key: 'ticker-source', kind: 'fixture', ref: 'A', authority: 'current' },
      { key: 'other-source', kind: 'fixture', ref: 'B', authority: 'historical' },
    ],
  };
  unique.semanticDigest = computeSemanticDigest(unique);
  const res4 = validateSemanticContract(unique);
  assert.equal(res4.valid, true, JSON.stringify(res4.errors));
});
