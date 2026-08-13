/**
 * LCIM V2 route-decision schema registry (Sprint 05).
 *
 * Sprint-owned registry for `schemas/route-decision.v2.schema.json`
 * (`lcim.route-decision`, version 2.0.0). It deliberately does NOT touch
 * the Sprint-00 shared registry (`src/shared/schema-registry.mjs` stays the
 * authority for `lcim.common.*`) and mirrors the Sprint-04/01 pattern of
 * sprint-owned registries. Validation runs through the shared Sprint-00
 * engine (`validateAgainstSchema`) so the fail-closed keyword discipline
 * applies unchanged (no `$ref`, `oneOf`, `format`, `minimum`).
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
 * - Every ROUTE_SOL_* decision must target sol-xhigh on provider 'sol'
 *   with one of the four SOL roles. sol-pro (Sprint 07) is never routable
 *   from Sprint 05.
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

/** Sprint-05 schema manifest: schema name -> { file, version }. */
export const ROUTE_SCHEMA_MANIFEST = Object.freeze({
  'lcim.route-decision': { file: 'route-decision.v2.schema.json', version: '2.0.0' },
});

/** Current version of the Sprint-05 route-decision schema family. */
export const ROUTE_SCHEMA_VERSION = '2.0.0';

const cache = new Map();

export function routeSchemaNames() {
  return Object.keys(ROUTE_SCHEMA_MANIFEST);
}

export function loadRouteSchema(name) {
  if (!(name in ROUTE_SCHEMA_MANIFEST)) {
    throw new ConfigError(`unknown route schema name: ${name}`);
  }
  if (cache.has(name)) return cache.get(name);
  const file = path.join(SCHEMA_DIR, ROUTE_SCHEMA_MANIFEST[name].file);
  let schema;
  try {
    schema = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new ConfigError(`cannot load schema '${name}' from ${file}: ${err.message}`);
  }
  if (typeof schema.$id !== 'string' || schema.$id === '') {
    throw new ConfigError(`schema '${name}' is missing a non-empty $id`);
  }
  cache.set(name, schema);
  return schema;
}

const IMPLEMENTATION_MODELS = ['deepseek-v4-flash', 'deepseek-pro-max', 'terra', 'luna'];
const IMPLEMENT_ROLES = ['IMPLEMENT', 'REPAIR'];
const TERMINAL_DECISIONS = ['ROUTE_COMPLETE', 'STOP_STUCK', 'STOP_BUDGET', 'FAIL_NO_SUBSTITUTE'];

function push(result, path, message) {
  result.errors.push({ path, message });
  result.valid = false;
}

/**
 * Validate a route-decision record: schema validation plus the conditional
 * semantic rules above. Never repairs — it only reports.
 *
 * @param {unknown} instance
 * @returns {{ valid: boolean, errors: Array<{path: string, message: string}> }}
 */
export function validateRouteDecision(instance) {
  const result = validateAgainstSchema(instance, loadRouteSchema('lcim.route-decision'));
  if (!result.valid || instance === null || typeof instance !== 'object' || Array.isArray(instance)) {
    return result;
  }
  const d = instance;
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
    if (d.targetModel !== 'sol-xhigh') {
      push(result, 'targetModel', `SOL decisions require targetModel 'sol-xhigh', got ${JSON.stringify(d.targetModel)}`);
    }
    if (!SOL_ROLES.includes(d.targetRole)) {
      push(result, 'targetRole', `SOL decisions require one of the SOL roles (${SOL_ROLES.join(', ')}), got ${JSON.stringify(d.targetRole)}`);
    }
    if (d.targetProvider !== 'sol') {
      push(result, 'targetProvider', "SOL decisions require targetProvider 'sol', got " + JSON.stringify(d.targetProvider));
    }
    if (d.reasoningLevel !== undefined && d.reasoningLevel !== 'XHIGH') {
      push(result, 'reasoningLevel', "SOL decisions run at XHIGH only (sol-xhigh): reasoningLevel must be 'XHIGH' when present");
    }
  }

  if (d.decision === 'STOP_STUCK' && !isStuckReasonCode(d.reasonCode)) {
    push(result, 'reasonCode', `STOP_STUCK requires a STUCK reason code, got ${JSON.stringify(d.reasonCode)}`);
  }
  if (d.decision === 'STOP_BUDGET' && d.reasonCode !== 'BUDGET_EXHAUSTED') {
    push(result, 'reasonCode', `STOP_BUDGET requires reasonCode 'BUDGET_EXHAUSTED', got ${JSON.stringify(d.reasonCode)}`);
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
