/**
 * LCIM V2 route-decision schema registry (Sprint 05).
 *
 * Sprint-owned registry for the `lcim.route-decision` record family.
 * Since LCIM 2.0.1 (V2.0.1) the family has TWO immutable schema versions:
 *
 * - `2.0.0` — schemas/route-decision.v2.schema.json (UNCHANGED 2.0.0
 *   semantics: SOL decisions require `sol-xhigh` on provider `sol`; the
 *   schema file is byte-identical to the 2.0.0 release);
 * - `2.1.0` — schemas/route-decision.v2.1.schema.json (new immutable
 *   version: the ONLY automatic SOL channel is the gpt-5.6-sol codex
 *   channel through the strict controller-side openai-codex transport
 *   gate at XHIGH; the classic sol-xhigh channel is retained solely as
 *   immutable 2.0.0 historical semantics and is never a valid 2.1
 *   production SOL target; FAIL_NO_SUBSTITUTE reason codes are
 *   constrained to the no-substitute set).
 *
 * Records are validated against the schema named by THEIR OWN
 * schemaVersion (never mutated semantics): a 2.0.0 record is valid iff it
 * satisfies the 2.0.0 schema and rules; a 2.1.0 record is valid iff it
 * satisfies the 2.1.0 schema and rules. Unknown versions fail closed.
 *
 * It deliberately does NOT touch the Sprint-00 shared registry
 * (`src/shared/schema-registry.mjs` stays the authority for
 * `lcim.common.*`) and mirrors the Sprint-04/01 pattern of sprint-owned
 * registries. Validation runs through the shared Sprint-00 engine
 * (`validateAgainstSchema`) so the fail-closed keyword discipline applies
 * unchanged (no `$ref`, `oneOf`, `format`, `minimum`).
 *
 * Conditional semantic rules enforced here (the engine subset has no
 * if/then; these mirror the Sprint-00 REJECTED-disposition rule):
 * - ROUTE_IMPLEMENT_PRO_MAX: escalationJustification REQUIRED with a
 *   locked basis (SOL_DIRECTED_REPAIR | CONFIRMED_CAPABILITY_FAILURE |
 *   CONTRACT_LOCKED_DIFFICULT_TASK), reasoningLevel must be MAX, and the
 *   target model must be deepseek-pro-max. Pro MAX is escalation-only.
 * - ROUTE_IMPLEMENT_FLASH_MAX: escalationJustification REQUIRED with basis
 *   CONTRACT_LOCKED_DIFFICULT_TASK (the only Flash-MAX basis), reasoning
 *   MAX, target deepseek-v4-flash.
 * - ROUTE_IMPLEMENT_FLASH: reasoningLevel must be XHIGH (MAX goes through
 *   ROUTE_IMPLEMENT_FLASH_MAX so it can never dodge the justification).
 * - Every ROUTE_IMPLEMENT_* decision must name an implementation-capable
 *   model (deepseek-v4-flash | deepseek-pro-max | terra | luna) on
 *   provider 'pi' with role IMPLEMENT or REPAIR.
 * - Every ROUTE_SOL_* decision in 2.1.0 must target the exact automatic
 *   SOL channel: gpt-5.6-sol on provider 'pi' with reasoningLevel XHIGH
 *   (the strict Codex transport gate). The classic sol-xhigh channel is
 *   valid ONLY on immutable 2.0.0 records (historical evidence
 *   validation); it has no production authority for current routing.
 * - 2.1.0: FAIL_NO_SUBSTITUTE reasonCode is constrained to
 *   PROVIDER_UNAVAILABLE | CAPABILITY_GAP_NO_SUBSTITUTE |
 *   CODEX_OAUTH_UNAVAILABLE.
 * - STOP_STUCK reasonCode must be a STUCK reason code; STOP_BUDGET must be
 *   BUDGET_EXHAUSTED.
 * - `substituteOf` may appear only on implementation decisions whose
 *   reasonCode is EXACT_SUBSTITUTE_CONFIGURED or
 *   CAPABILITY_FALLBACK_CONFIGURED (no silent substitution).
 * - Terminal decisions (ROUTE_COMPLETE / STOP_* / FAIL_NO_SUBSTITUTE)
 *   carry no targetModel/targetRole/reasoningLevel/escalationJustification.
 * - budget counts are non-negative integers (the engine subset has no
 *   minimum keyword).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, SchemaValidationError } from '../shared/errors.mjs';
import { validateAgainstSchema } from '../shared/schema/validate.mjs';
import { deepFreezeJson } from '../contracts/deep-freeze.mjs';
import { isStuckReasonCode } from './reasons.mjs';
import { PRO_MAX_BASES, FLASH_MAX_BASES } from './reasons.mjs';
import { SOL_ROLES } from '../providers/capabilities/metadata.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.resolve(HERE, '../../schemas');

/** Sprint-05 schema manifest: schema name -> immutable versioned files. */
export const ROUTE_SCHEMA_MANIFEST = Object.freeze({
  'lcim.route-decision': Object.freeze([
    Object.freeze({ file: 'route-decision.v2.schema.json', version: '2.0.0' }),
    Object.freeze({ file: 'route-decision.v2.1.schema.json', version: '2.1.0' }),
  ]),
});

/** Current version of the Sprint-05 route-decision schema family (new records are stamped with it). */
export const ROUTE_SCHEMA_VERSION = '2.1.0';

const cache = new Map();

export function routeSchemaNames() {
  return Object.keys(ROUTE_SCHEMA_MANIFEST);
}

export function routeSchemaVersions(name) {
  const entries = ROUTE_SCHEMA_MANIFEST[name];
  if (entries === undefined) throw new ConfigError(`unknown route schema name: ${name}`);
  return entries.map((entry) => entry.version);
}

/**
 * Load one immutable schema version of the route-decision family. The
 * version is part of the contract: callers must validate a record against
 * the schema named by the record's OWN schemaVersion.
 */
export function loadRouteSchema(name, version = ROUTE_SCHEMA_VERSION) {
  const entries = ROUTE_SCHEMA_MANIFEST[name];
  if (entries === undefined) throw new ConfigError(`unknown route schema name: ${name}`);
  const entry = entries.find((item) => item.version === version);
  if (entry === undefined) {
    throw new ConfigError(`unknown ${name} schema version ${JSON.stringify(version)} (supported: ${entries.map((item) => item.version).join(', ')})`);
  }
  const key = `${name}@${version}`;
  if (cache.has(key)) return cache.get(key);
  const file = path.join(SCHEMA_DIR, entry.file);
  let schema;
  try {
    schema = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new ConfigError(`cannot load schema '${name}' v${version} from ${file}: ${err.message}`);
  }
  if (typeof schema.$id !== 'string' || schema.$id === '') {
    throw new ConfigError(`schema '${name}' v${version} is missing a non-empty $id`);
  }
  cache.set(key, schema);
  return schema;
}

const IMPLEMENTATION_MODELS = ['deepseek-v4-flash', 'deepseek-pro-max', 'terra', 'luna'];
const IMPLEMENT_ROLES = ['IMPLEMENT', 'REPAIR'];
const TERMINAL_DECISIONS = ['ROUTE_COMPLETE', 'STOP_STUCK', 'STOP_BUDGET', 'FAIL_NO_SUBSTITUTE'];

/**
 * V2.1.0 (2.0.1): the ONLY automatic SOL channel target for CURRENT
 * production routing is the strict Codex transport gate — gpt-5.6-sol on
 * provider 'pi' (Pi's native openai-codex OAuth, reasoning XHIGH). The
 * classic sol-xhigh channel has NO production authority in 2.1 records;
 * it is preserved only as immutable 2.0.0 historical semantics.
 */
const SOL_TARGETS_V2_1 = Object.freeze([
  Object.freeze({ model: 'gpt-5.6-sol', provider: 'pi' }),
]);

/** V2.0.0: the classic automatic SOL channel target (unchanged semantics). */
const SOL_TARGETS_V2_0 = Object.freeze([
  Object.freeze({ model: 'sol-xhigh', provider: 'sol' }),
]);

/** V2.1.0: reason codes valid on the FAIL_NO_SUBSTITUTE decision. */
const FAIL_NO_SUBSTITUTE_CODES = Object.freeze([
  'PROVIDER_UNAVAILABLE',
  'CAPABILITY_GAP_NO_SUBSTITUTE',
  'CODEX_OAUTH_UNAVAILABLE',
]);

function push(result, path, message) {
  result.errors.push({ path, message });
  result.valid = false;
}

/**
 * Validate a route-decision record: schema validation (against the
 * immutable schema version named by the record's OWN schemaVersion) plus
 * the conditional semantic rules for that version. Never repairs — it
 * only reports.
 *
 * @param {unknown} instance
 * @returns {{ valid: boolean, errors: Array<{path: string, message: string}> }}
 */
export function validateRouteDecision(instance) {
  const version = instance !== null && typeof instance === 'object' && !Array.isArray(instance)
    ? instance.schemaVersion
    : undefined;
  let schema;
  try {
    schema = loadRouteSchema('lcim.route-decision', version);
  } catch {
    // Unknown/missing schemaVersion fails closed with an explicit error
    // (the version is part of the contract; it can never be guessed).
    return {
      valid: false,
      errors: [{ path: 'schemaVersion', message: `unknown lcim.route-decision schemaVersion ${JSON.stringify(version)} (supported: ${routeSchemaVersions('lcim.route-decision').join(', ')})` }],
    };
  }
  const result = validateAgainstSchema(instance, schema);
  if (!result.valid || instance === null || typeof instance !== 'object' || Array.isArray(instance)) {
    return result;
  }
  const d = instance;
  const v2_1 = version === '2.1.0';
  const justification = d.escalationJustification;
  const isImpl = ['ROUTE_IMPLEMENT_FLASH', 'ROUTE_IMPLEMENT_FLASH_MAX', 'ROUTE_IMPLEMENT_PRO_MAX'].includes(d.decision);
  const isSol = [
    'ROUTE_SOL_CONTRACT_CHECK',
    'ROUTE_SOL_DIAGNOSE',
    'ROUTE_SOL_FINAL_REVIEW',
    'ROUTE_SOL_RECHECK',
  ].includes(d.decision);

  if (d.decision === 'ROUTE_IMPLEMENT_PRO_MAX') {
    if (justification === undefined) {
      push(result, 'escalationJustification', "escalationJustification is required for ROUTE_IMPLEMENT_PRO_MAX (Pro MAX is escalation-only; every Pro MAX usage needs a machine-readable justification)");
    } else if (!PRO_MAX_BASES.includes(justification.basis)) {
      push(result, 'escalationJustification.basis', `invalid Pro MAX basis ${JSON.stringify(justification.basis)} (allowed: ${PRO_MAX_BASES.join(', ')})`);
    }
    if (d.reasoningLevel !== 'MAX') {
      push(result, 'reasoningLevel', "reasoningLevel must be 'MAX' for ROUTE_IMPLEMENT_PRO_MAX");
    }
    if (d.targetModel !== 'deepseek-pro-max') {
      push(result, 'targetModel', "targetModel must be 'deepseek-pro-max' for ROUTE_IMPLEMENT_PRO_MAX");
    }
  }

  if (d.decision === 'ROUTE_IMPLEMENT_FLASH_MAX') {
    if (justification === undefined) {
      push(result, 'escalationJustification', "escalationJustification is required for ROUTE_IMPLEMENT_FLASH_MAX (MAX reasoning is explicit-justification-only)");
    } else if (!FLASH_MAX_BASES.includes(justification.basis)) {
      push(result, 'escalationJustification.basis', `invalid Flash MAX basis ${JSON.stringify(justification.basis)} (allowed: ${FLASH_MAX_BASES.join(', ')})`);
    }
    if (d.reasoningLevel !== 'MAX') {
      push(result, 'reasoningLevel', "reasoningLevel must be 'MAX' for ROUTE_IMPLEMENT_FLASH_MAX");
    }
    if (d.targetModel !== 'deepseek-v4-flash') {
      push(result, 'targetModel', "targetModel must be 'deepseek-v4-flash' for ROUTE_IMPLEMENT_FLASH_MAX");
    }
  }

  if (d.decision === 'ROUTE_IMPLEMENT_FLASH') {
    if (d.reasoningLevel !== 'XHIGH') {
      push(result, 'reasoningLevel', "reasoningLevel must be 'XHIGH' for ROUTE_IMPLEMENT_FLASH (MAX goes through ROUTE_IMPLEMENT_FLASH_MAX so it can never dodge justification)");
    }
  }

  if (isImpl) {
    if (!IMPLEMENTATION_MODELS.includes(d.targetModel)) {
      push(result, 'targetModel', `implementation decisions require an implementation-capable targetModel (${IMPLEMENTATION_MODELS.join(', ')}), got ${JSON.stringify(d.targetModel)}`);
    }
    if (!IMPLEMENT_ROLES.includes(d.targetRole)) {
      push(result, 'targetRole', `implementation decisions require targetRole ${IMPLEMENT_ROLES.join(' | ')}, got ${JSON.stringify(d.targetRole)}`);
    }
    if (d.targetProvider !== 'pi') {
      push(result, 'targetProvider', "implementation decisions require targetProvider 'pi' (DeepSeek through Pi), got " + JSON.stringify(d.targetProvider));
    }
    if (d.targetModel === 'deepseek-pro-max' && d.decision !== 'ROUTE_IMPLEMENT_PRO_MAX') {
      push(result, 'targetModel', 'deepseek-pro-max is escalation-only: it may appear only on ROUTE_IMPLEMENT_PRO_MAX (never as a Flash/substitute target)');
    }
  }

  if (isSol) {
    const exactTarget = (v2_1 ? SOL_TARGETS_V2_1 : SOL_TARGETS_V2_0).some(
      (t) => t.model === d.targetModel && t.provider === d.targetProvider,
    );
    if (!exactTarget) {
      push(result, 'targetModel', v2_1
        ? `SOL decisions require the exact automatic SOL target 'gpt-5.6-sol' on provider 'pi' (the strict openai-codex transport gate); the classic 'sol-xhigh' channel has no production SOL authority in 2.1, got model ${JSON.stringify(d.targetModel)} on provider ${JSON.stringify(d.targetProvider)}`
        : `SOL decisions require targetModel 'sol-xhigh' on provider 'sol', got model ${JSON.stringify(d.targetModel)} on provider ${JSON.stringify(d.targetProvider)}`);
    }
    if (!SOL_ROLES.includes(d.targetRole)) {
      push(result, 'targetRole', `SOL decisions require one of the SOL roles (${SOL_ROLES.join(', ')}), got ${JSON.stringify(d.targetRole)}`);
    }
    if (v2_1 && d.reasoningLevel !== 'XHIGH') {
      // Every current 2.1 production SOL route is exactly
      // openai-codex / gpt-5.6-sol / XHIGH.
      push(result, 'reasoningLevel', "2.1 SOL decisions require reasoningLevel 'XHIGH' (the strict Codex transport gate runs XHIGH only)");
    } else if (!v2_1 && d.reasoningLevel !== undefined && d.reasoningLevel !== 'XHIGH') {
      push(result, 'reasoningLevel', "SOL decisions run at XHIGH only: reasoningLevel must be 'XHIGH' when present");
    }
  }

  if (d.decision === 'STOP_STUCK' && !isStuckReasonCode(d.reasonCode)) {
    push(result, 'reasonCode', `STOP_STUCK requires a STUCK reason code, got ${JSON.stringify(d.reasonCode)}`);
  }
  if (d.decision === 'STOP_BUDGET' && d.reasonCode !== 'BUDGET_EXHAUSTED') {
    push(result, 'reasonCode', `STOP_BUDGET requires reasonCode 'BUDGET_EXHAUSTED', got ${JSON.stringify(d.reasonCode)}`);
  }
  // V2.1.0 only: FAIL_NO_SUBSTITUTE is restricted to the no-substitute
  // reason codes. The 2.0.0 version keeps its original (schema-enum-only)
  // semantics — this schema-version discipline is what the V2.0.1 repair
  // introduced (see ICR-2026-002).
  if (v2_1 && d.decision === 'FAIL_NO_SUBSTITUTE' && !FAIL_NO_SUBSTITUTE_CODES.includes(d.reasonCode)) {
    push(result, 'reasonCode', `FAIL_NO_SUBSTITUTE requires reasonCode ${FAIL_NO_SUBSTITUTE_CODES.join(' | ')} (no-substitute semantics), got ${JSON.stringify(d.reasonCode)}`);
  }

  if (d.substituteOf !== undefined) {
    const allowed = ['EXACT_SUBSTITUTE_CONFIGURED', 'CAPABILITY_FALLBACK_CONFIGURED'];
    if (!isImpl) {
      push(result, 'substituteOf', 'substituteOf may appear only on implementation decisions');
    }
    if (!allowed.includes(d.reasonCode)) {
      push(result, 'reasonCode', `substituteOf requires reasonCode ${allowed.join(' | ')}, got ${JSON.stringify(d.reasonCode)}`);
    }
  }

  if (TERMINAL_DECISIONS.includes(d.decision)) {
    if (d.targetModel !== undefined || d.targetRole !== undefined || d.reasoningLevel !== undefined || d.escalationJustification !== undefined) {
      push(result, 'decision', 'terminal decisions (ROUTE_COMPLETE / STOP_* / FAIL_NO_SUBSTITUTE) must not carry targetModel, targetRole, reasoningLevel, or escalationJustification');
    }
  }

  if (d.budget !== undefined && d.budget !== null && typeof d.budget === 'object') {
    for (const key of ['runCallsConsumed', 'runCallsLimit', 'unitCallsConsumed', 'unitCallsLimit']) {
      if (typeof d.budget[key] !== 'number' || !Number.isSafeInteger(d.budget[key]) || d.budget[key] < 0) {
        push(result, `budget.${key}`, `budget.${key} must be a non-negative integer, got ${JSON.stringify(d.budget[key])}`);
      }
    }
  }

  return result;
}

/**
 * Stamp a route decision with schemaName/schemaVersion, validate it
 * (schema + conditional rules), and return a deeply frozen record.
 * Throws SchemaValidationError on failure (fail closed).
 *
 * @param {object} data - decisionId, workUnitId, decision, reasonCode,
 *   state, nextState, decidedAt, budget, evidenceRefs (+ optional fields)
 * @returns {Readonly<object>} frozen, validated route-decision record
 */
export function stampRouteDecision(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new ConfigError("stampRouteDecision requires a plain object");
  }
  const record = {
    ...data,
    schemaName: 'lcim.route-decision',
    schemaVersion: ROUTE_SCHEMA_VERSION,
  };
  const result = validateRouteDecision(record);
  if (!result.valid) {
    throw new SchemaValidationError(
      `route decision failed validation: ${result.errors
        .map((e) => `${e.path || '(root)'}: ${e.message}`)
        .join('; ')}`,
      { errors: result.errors },
    );
  }
  return deepFreezeJson(record);
}
