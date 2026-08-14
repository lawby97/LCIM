/**
 * Local-only persistence for Sprint-07 manual exchanges.
 *
 * Every record is beneath the target repository's Git common directory:
 *   <git-common-dir>/lcim/sol-pro/escalations/<id>/record.json
 *
 * The store deliberately reuses the Sprint-00 runtime resolver and Sprint-01
 * atomic JSON/locking helpers. It never writes evidence into the LCIM source
 * tree and it is not a second invocation ledger.
 */

import fs from 'node:fs';
import path from 'node:path';
import { ConfigError } from '../../shared/errors.mjs';
import { isValidId } from '../../shared/ids.mjs';
import { assertNoTrackedFilesUnder, resolveRuntimeRoot } from '../../config/runtime-path.mjs';
import { readJsonFile, withRunDirLock, writeJsonAtomic } from '../../logging/io.mjs';
import { ProHandoffError } from './errors.mjs';
import { assertProContextSafe } from './evidence.mjs';
import { generateProEscalationId, generateProResponseBindingId, isValidProEscalationId } from './ids.mjs';
import {
  PRO_ESCALATION_SCHEMA_NAME,
  PRO_ESCALATION_SCHEMA_VERSION,
  validateProEscalation,
} from './schema.mjs';

export const PRO_RUNTIME_DIR = 'sol-pro';
export const PRO_ESCALATIONS_DIR = 'escalations';
export const PRO_RECORD_FILE = 'record.json';

function cloneJson(value, label) {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error('value is undefined');
    return JSON.parse(encoded);
  } catch {
    throw new ConfigError(`${label} must be JSON-serializable local data`);
  }
}

function assertPlainObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigError(`${label} must be a plain object`);
  }
}

function normalizeContext(context = {}) {
  assertPlainObject(context, 'SOL Pro context');
  const allowed = new Set(['task', 'previousAttempt', 'controllerRejection']);
  for (const key of Object.keys(context)) {
    if (!allowed.has(key)) throw new ConfigError(`unknown SOL Pro context field '${key}'`);
  }
  const out = {};
  for (const [key, max] of [
    ['task', 500],
    ['previousAttempt', 1000],
    ['controllerRejection', 1000],
  ]) {
    if (context[key] !== undefined) {
      if (typeof context[key] !== 'string' || context[key].length === 0 || context[key].length > max) {
        throw new ConfigError(`SOL Pro context.${key} must be a non-empty string of at most ${max} characters`);
      }
      out[key] = context[key];
    }
  }
  // Every context field that can reach clipboard text passes the same
  // outbound safety policy as evidence (SOL-S07-002).
  assertProContextSafe(out);
  return out;
}

/**
 * Follow-ups are DELTA ONLY and accept NO supplemental free-form context
 * (SOL-S07-003). The compact follow-up text is derived from the compiled
 * RECHECK ask and the recorded escalation identifiers, so a caller can never
 * replay first-exchange evidence or task prose through a context field.
 */
function normalizeFollowUpContext(context = {}) {
  assertPlainObject(context, 'SOL Pro follow-up context');
  if (Object.keys(context).length > 0) {
    throw new ConfigError('SOL Pro follow-up accepts no supplemental free-form context; the compact follow-up text is derived from the compiled RECHECK ask and recorded identifiers');
  }
  return {};
}

function recordValidationError(result) {
  return result.errors.map((error) => `${error.path || '(root)'}: ${error.message}`).join('; ');
}

export function resolveProRuntimeRoot(cwd = process.cwd()) {
  return path.join(resolveRuntimeRoot(cwd), PRO_RUNTIME_DIR);
}

export function resolveProEscalationDir(cwd = process.cwd(), escalationId) {
  if (!isValidProEscalationId(escalationId)) {
    throw new ConfigError('invalid SOL Pro escalation identifier');
  }
  return path.join(resolveProRuntimeRoot(cwd), PRO_ESCALATIONS_DIR, escalationId);
}

export function resolveProEscalationRecordPath(cwd = process.cwd(), escalationId) {
  return path.join(resolveProEscalationDir(cwd, escalationId), PRO_RECORD_FILE);
}

export class ProEscalationStore {
  constructor({ cwd = process.cwd() } = {}) {
    this.cwd = cwd;
  }

  async create({ findingId, askInput, sources, context = {}, createdAt = new Date().toISOString() }) {
    if (!isValidId('finding', findingId)) {
      throw new ConfigError('SOL Pro escalation requires a valid controller finding identifier');
    }
    assertPlainObject(askInput, 'SOL Pro ask input');
    if (!Array.isArray(sources) || sources.length === 0 || sources.length > 8) {
      throw new ConfigError('SOL Pro escalation requires one to eight local semantic sources');
    }
    const escalationId = generateProEscalationId();
    const dir = resolveProEscalationDir(this.cwd, escalationId);
    const runtimeRoot = resolveProRuntimeRoot(this.cwd);
    assertNoTrackedFilesUnder(runtimeRoot, this.cwd);
    if (fs.existsSync(dir)) {
      throw new ProHandoffError('local SOL Pro escalation record already exists', 'PRO_RUNTIME_CONFLICT');
    }
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });

    const record = {
      schemaName: PRO_ESCALATION_SCHEMA_NAME,
      schemaVersion: PRO_ESCALATION_SCHEMA_VERSION,
      escalationId,
      findingId,
      createdAt,
      context: normalizeContext(context),
      sources: cloneJson(sources, 'SOL Pro sources'),
      exchanges: [
        {
          sequence: 1,
          kind: 'INITIAL',
          responseBindingId: generateProResponseBindingId(),
          askInput: cloneJson(askInput, 'SOL Pro ask input'),
          context: {},
          compiledAsk: null,
          canonicalResponse: null,
          repairTicket: null,
          repairContract: null,
          copiedAt: null,
          responseRecordedAt: null,
        },
      ],
    };
    this._validate(record);
    try {
      writeJsonAtomic(path.join(dir, PRO_RECORD_FILE), record);
    } catch (err) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup only; the common-dir remains outside Git.
      }
      throw new ProHandoffError('could not persist the local SOL Pro escalation record', 'PRO_RUNTIME_WRITE_FAILED');
    }
    return cloneJson(record, 'SOL Pro escalation record');
  }

  async load(escalationId) {
    const file = resolveProEscalationRecordPath(this.cwd, escalationId);
    if (!fs.existsSync(file)) {
      throw new ProHandoffError('local SOL Pro escalation record was not found', 'PRO_ESCALATION_NOT_FOUND');
    }
    let record;
    try {
      record = readJsonFile(file);
    } catch {
      throw new ProHandoffError('local SOL Pro escalation record cannot be read safely', 'PRO_RUNTIME_READ_FAILED');
    }
    this._validate(record);
    return cloneJson(record, 'SOL Pro escalation record');
  }

  /**
   * Serialize an update with the Sprint-01 local lock primitive. `mutate`
   * receives a detached JSON object and must return the replacement record.
   */
  async update(escalationId, mutate) {
    if (typeof mutate !== 'function') throw new ConfigError('SOL Pro record mutator must be a function');
    const dir = resolveProEscalationDir(this.cwd, escalationId);
    const file = path.join(dir, PRO_RECORD_FILE);
    if (!fs.existsSync(file)) {
      throw new ProHandoffError('local SOL Pro escalation record was not found', 'PRO_ESCALATION_NOT_FOUND');
    }
    return withRunDirLock(dir, async () => {
      let current;
      try {
        current = readJsonFile(file);
      } catch {
        throw new ProHandoffError('local SOL Pro escalation record cannot be read safely', 'PRO_RUNTIME_READ_FAILED');
      }
      this._validate(current);
      const next = await mutate(cloneJson(current, 'SOL Pro escalation record'));
      assertPlainObject(next, 'updated SOL Pro escalation record');
      this._validate(next);
      try {
        writeJsonAtomic(file, next);
      } catch {
        throw new ProHandoffError('could not persist the local SOL Pro escalation record', 'PRO_RUNTIME_WRITE_FAILED');
      }
      return cloneJson(next, 'SOL Pro escalation record');
    });
  }

  _validate(record) {
    const result = validateProEscalation(record);
    if (!result.valid) {
      throw new ProHandoffError(
        `local SOL Pro escalation record is invalid: ${recordValidationError(result)}`,
        'PRO_RUNTIME_RECORD_INVALID',
      );
    }
  }
}

export { normalizeContext, normalizeFollowUpContext };
