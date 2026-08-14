/**
 * Target-project adapter configuration for LCIM V2.
 *
 * The project file is deliberately small and non-secret. It is project-owned
 * configuration, not a runtime store: runtime evidence is resolved from the
 * target repository's Git common directory by src/config/runtime-path.mjs.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { canonicalJson } from '../logging/digest.mjs';
import { ConfigError, PublicSafetyError } from '../shared/errors.mjs';

export const PROJECT_CONFIG_VERSION = '1.0.0';
export const PROJECT_CONFIG_DIR = '.lcim';
export const PROJECT_CONFIG_FILE = 'project.json';

const PROJECT_KEY = /^[a-z][a-z0-9._-]{0,63}$/;
const REJECTION_CODES = new Set([
  'TRANSPORT_MALFORMED',
  'SCHEMA_MISMATCH',
  'SEMANTIC_CONFLATION',
  'WRONG_BASE',
  'SCOPE_VIOLATION',
  'UNRESOLVED_SEMANTICS',
  'UNSUPPORTED_CLAIM',
  'INCOMPLETE_LEDGER',
  'BUDGET_EXHAUSTED',
  'SECRET_DENIED_PATH',
  'SOL_ASK_INVALID',
]);

const TOP_LEVEL_KEYS = new Set([
  'schemaName',
  'schemaVersion',
  'projectKey',
  'allowedWritePaths',
  'mustChangePaths',
  'semanticContract',
  'endpoints',
  'exactSubstitutes',
  'enableOptionalFallbacks',
  'worker',
  'sol',
  'permissions',
  'budgets',
  'validation',
  'semanticRejectionCode',
]);
const WORKER_KEYS = new Set(['command', 'args', 'timeoutMs']);
const SOL_KEYS = new Set(['command', 'args', 'timeoutMs']);
const ENDPOINT_KEYS = new Set(['baseUrl', 'kind', 'name', 'timeoutMs']);
const VALIDATION_KEYS = new Set(['commands']);
const SENSITIVE_KEY = /(api.?key|access.?token|auth.?token|password|passwd|secret|credential|private.?key|authorization|bearer|cookie)/i;
const FORBIDDEN_CONFIG_KEY = /^(runtime|runtimeRoot|evidence|ledger|runs|raw|transcript|credentials?|secrets?)$/i;

function plainObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigError(`${label} must be a plain object`);
  }
  return value;
}

function string(value, label, { max = 1000 } = {}) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new ConfigError(`${label} must be a non-empty string of at most ${max} characters`);
  }
  return value;
}

function boundedInteger(value, label, { min = 1, max = 1_000_000 } = {}) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ConfigError(`${label} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function assertNoSensitiveMaterial(value, at = 'config') {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) assertNoSensitiveMaterial(item, `${at}[${index}]`);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) {
        throw new PublicSafetyError(`project configuration contains a credential-bearing field at ${at}.${key}; credentials are not accepted in project config`);
      }
      assertNoSensitiveMaterial(item, `${at}.${key}`);
    }
    return;
  }
  if (typeof value === 'string') {
    // Reject common credential-shaped values even when a caller hides them
    // behind an otherwise harmless field name. This is intentionally narrow;
    // ordinary URLs and prose remain valid project configuration.
    if (/\b(?:sk-|ghp_|github_pat_|glpat-|AKIA[0-9A-Z]{16}|Bearer\s+)[A-Za-z0-9_.:/=-]{8,}/i.test(value) || /(?:--(?:api[-_]?key|access[-_]?token|auth[-_]?token|password|secret)|(?:api[-_]?key|access[-_]?token)\s*[:=])/i.test(value)) {
      throw new PublicSafetyError(`project configuration contains credential-shaped material at ${at}`);
    }
  }
}

function assertKnownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ConfigError(`unsupported project configuration field '${label}.${key}'`);
    }
    if (FORBIDDEN_CONFIG_KEY.test(key)) {
      throw new PublicSafetyError(`project configuration field '${label}.${key}' is a runtime/private store field and is not supported`);
    }
  }
}

function normalizePathList(value, label, { required = true } = {}) {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || (required && value.length === 0)) {
    throw new ConfigError(`${label} must be a non-empty array of repository-relative paths`);
  }
  const out = value.map((item, index) => {
    const p = string(item, `${label}[${index}]`, { max: 300 });
    if (p.includes('\\') || path.posix.isAbsolute(p)) {
      throw new ConfigError(`${label}[${index}] must be a repository-relative POSIX path`);
    }
    const normalized = path.posix.normalize(p).replace(/\/+$/, '');
    if (normalized === '' || normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
      throw new ConfigError(`${label}[${index}] must not escape the target repository`);
    }
    return normalized;
  });
  return [...new Set(out)].sort();
}

function normalizeCommand(value, label) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length === 0) {
    throw new ConfigError(`${label}.command must be null or a non-empty argv array`);
  }
  return value.map((item, index) => string(item, `${label}.command[${index}]`, { max: 1000 }));
}

function normalizeArgs(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ConfigError(`${label}.args must be an argv array`);
  return value.map((item, index) => string(item, `${label}.args[${index}]`, { max: 4000 }));
}

function normalizeEndpoint(value, label) {
  plainObject(value, label);
  assertKnownKeys(value, ENDPOINT_KEYS, label);
  const result = {};
  if (value.baseUrl !== undefined) {
    const baseUrl = string(value.baseUrl, `${label}.baseUrl`, { max: 500 });
    let parsed;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new ConfigError(`${label}.baseUrl must be an absolute URL or an explicit local scheme`);
    }
    if (parsed.username || parsed.password || parsed.searchParams.size > 0 || /(?:token|key|secret|password|auth)=/i.test(parsed.search)) {
      throw new PublicSafetyError(`${label}.baseUrl must not contain userinfo or credential query material`);
    }
    result.baseUrl = baseUrl;
  }
  if (value.kind !== undefined) result.kind = string(value.kind, `${label}.kind`, { max: 100 });
  if (value.name !== undefined) result.name = string(value.name, `${label}.name`, { max: 100 });
  if (value.timeoutMs !== undefined) result.timeoutMs = boundedInteger(value.timeoutMs, `${label}.timeoutMs`, { min: 100, max: 600_000 });
  return result;
}

function normalizeEndpoints(value) {
  if (value === undefined) return {};
  plainObject(value, 'endpoints');
  const result = {};
  for (const key of Object.keys(value).sort()) result[key] = normalizeEndpoint(value[key], `endpoints.${key}`);
  return result;
}

function normalizeProviderBlock(value, label) {
  if (value === undefined) return { command: null, args: [], timeoutMs: label === 'worker' ? 300_000 : 120_000 };
  plainObject(value, label);
  assertKnownKeys(value, label === 'worker' ? WORKER_KEYS : SOL_KEYS, label);
  const timeoutMs = value.timeoutMs === undefined
    ? (label === 'worker' ? 300_000 : 120_000)
    : boundedInteger(value.timeoutMs, `${label}.timeoutMs`, { min: 100, max: 1_800_000 });
  return {
    command: normalizeCommand(value.command, label),
    args: normalizeArgs(value.args, label),
    timeoutMs,
  };
}

function normalizeValidation(value) {
  if (value === undefined) return { commands: [] };
  plainObject(value, 'validation');
  assertKnownKeys(value, VALIDATION_KEYS, 'validation');
  if (value.commands === undefined) return { commands: [] };
  if (!Array.isArray(value.commands)) throw new ConfigError('validation.commands must be an array of argv arrays');
  return {
    commands: value.commands.map((command, index) => {
      if (!Array.isArray(command) || command.length === 0) throw new ConfigError(`validation.commands[${index}] must be a non-empty argv array`);
      return command.map((item, argIndex) => string(item, `validation.commands[${index}][${argIndex}]`, { max: 2000 }));
    }),
  };
}

function normalizeSemanticRejection(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !REJECTION_CODES.has(value)) {
    throw new ConfigError(`semanticRejectionCode must be one of the controller rejection codes, got ${JSON.stringify(value)}`);
  }
  return value;
}

function normalizeConfig(raw, repoDir, { migrated = false } = {}) {
  plainObject(raw, 'project configuration');
  assertNoSensitiveMaterial(raw);
  assertKnownKeys(raw, TOP_LEVEL_KEYS, 'project');
  if (raw.schemaName !== undefined && raw.schemaName !== 'lcim.project') {
    throw new ConfigError(`unsupported project schemaName ${JSON.stringify(raw.schemaName)}`);
  }
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== PROJECT_CONFIG_VERSION) {
    throw new ConfigError(`unsupported project configuration schemaVersion ${JSON.stringify(raw.schemaVersion)}; supported ${PROJECT_CONFIG_VERSION}`);
  }
  const fallbackKey = path.basename(repoDir).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z]+/, 'project').slice(0, 64) || 'project';
  const projectKey = raw.projectKey === undefined ? fallbackKey : string(raw.projectKey, 'project.projectKey', { max: 64 });
  if (!PROJECT_KEY.test(projectKey)) throw new ConfigError(`project.projectKey must match ${PROJECT_KEY}`);

  const budgets = raw.budgets === undefined ? {} : plainObject(raw.budgets, 'budgets');
  assertKnownKeys(budgets, new Set(['unitCalls', 'runCalls']), 'budgets');
  const normalizedBudgets = {
    unitCalls: budgets.unitCalls === undefined ? 4 : boundedInteger(budgets.unitCalls, 'budgets.unitCalls', { min: 1, max: 1000 }),
    runCalls: budgets.runCalls === undefined ? 16 : boundedInteger(budgets.runCalls, 'budgets.runCalls', { min: 1, max: 10_000 }),
  };

  const permissions = raw.permissions === undefined ? {} : plainObject(raw.permissions, 'permissions');
  assertKnownKeys(permissions, new Set(['externalProvider']), 'permissions');
  if (permissions.externalProvider !== undefined && typeof permissions.externalProvider !== 'boolean') {
    throw new ConfigError('permissions.externalProvider must be boolean');
  }

  const exactSubstitutes = raw.exactSubstitutes === undefined ? {} : plainObject(raw.exactSubstitutes, 'exactSubstitutes');
  const normalizedSubstitutes = {};
  for (const key of Object.keys(exactSubstitutes).sort()) normalizedSubstitutes[key] = string(exactSubstitutes[key], `exactSubstitutes.${key}`, { max: 100 });
  const fallbacks = raw.enableOptionalFallbacks === undefined ? [] : raw.enableOptionalFallbacks;
  if (!Array.isArray(fallbacks)) throw new ConfigError('enableOptionalFallbacks must be an array of model keys');
  const normalizedFallbacks = [...new Set(fallbacks.map((item, index) => string(item, `enableOptionalFallbacks[${index}]`, { max: 100 })))].sort();

  const config = {
    schemaName: 'lcim.project',
    schemaVersion: PROJECT_CONFIG_VERSION,
    projectKey,
    allowedWritePaths: normalizePathList(raw.allowedWritePaths ?? ['README.md'], 'allowedWritePaths'),
    mustChangePaths: normalizePathList(raw.mustChangePaths, 'mustChangePaths', { required: false }),
    semanticContract: raw.semanticContract === undefined ? null : raw.semanticContract,
    endpoints: normalizeEndpoints(raw.endpoints),
    exactSubstitutes: normalizedSubstitutes,
    enableOptionalFallbacks: normalizedFallbacks,
    worker: normalizeProviderBlock(raw.worker, 'worker'),
    sol: normalizeProviderBlock(raw.sol, 'sol'),
    permissions: { externalProvider: permissions.externalProvider === true },
    budgets: normalizedBudgets,
    validation: normalizeValidation(raw.validation),
    semanticRejectionCode: normalizeSemanticRejection(raw.semanticRejectionCode),
  };
  if (config.semanticContract !== null) plainObject(config.semanticContract, 'semanticContract');
  // Runtime paths and raw provider output are never project configuration.
  for (const [key, value] of Object.entries(config)) {
    if (FORBIDDEN_CONFIG_KEY.test(key)) throw new PublicSafetyError(`unsupported private/runtime project field '${key}'`);
    void value;
  }
  return { config, migrated };
}

export function defaultProjectConfig(repoDir = process.cwd()) {
  const { config } = normalizeConfig({}, path.resolve(repoDir));
  return config;
}

/** Resolve the target worktree top-level; linked worktrees remain independent projects. */
export function resolveProjectRoot(cwd = process.cwd()) {
  let raw;
  try {
    raw = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (err) {
    throw new ConfigError(`target project is not a Git worktree: ${err.message}`);
  }
  if (!raw) throw new ConfigError('target project Git worktree root is empty');
  const root = path.resolve(cwd, raw);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new ConfigError(`target project root does not exist: ${root}`);
  return fs.realpathSync(root);
}

export function projectConfigPath(repoDir) {
  return path.join(repoDir, PROJECT_CONFIG_DIR, PROJECT_CONFIG_FILE);
}

/** Load and validate the project config; absent config returns deterministic defaults. */
export function loadProjectConfig({ cwd = process.cwd(), requireConfig = false } = {}) {
  const repoDir = resolveProjectRoot(cwd);
  const projectDir = path.join(repoDir, PROJECT_CONFIG_DIR);
  if (fs.existsSync(projectDir)) {
    const dirStat = fs.lstatSync(projectDir);
    if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) throw new PublicSafetyError(`project config directory is not a real directory: ${projectDir}`);
  }
  const file = projectConfigPath(repoDir);
  if (fs.existsSync(file)) {
    const fileStat = fs.lstatSync(file);
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) throw new PublicSafetyError(`project config file is not a regular file: ${file}`);
  }
  if (!fs.existsSync(file)) {
    if (requireConfig) throw new ConfigError(`project configuration is missing: ${file}; run 'lcim setup' first`);
    const config = defaultProjectConfig(repoDir);
    return Object.freeze({
      repoDir,
      configPath: file,
      exists: false,
      migrated: false,
      config,
      configDigest: digestConfig(config),
    });
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new ConfigError(`project configuration is not valid JSON: ${err.message}`);
  }
  const migrated = raw?.schemaVersion === undefined || raw?.schemaVersion === '1';
  if (raw?.schemaVersion === '1') raw = { ...raw, schemaVersion: PROJECT_CONFIG_VERSION };
  const normalized = normalizeConfig(raw, repoDir, { migrated });
  return Object.freeze({
    repoDir,
    configPath: file,
    exists: true,
    migrated: normalized.migrated,
    config: normalized.config,
    configDigest: digestConfig(normalized.config),
  });
}

export function digestConfig(config) {
  const bytes = Buffer.from(canonicalJson(config), 'utf8');
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function safeWrite(file, text, { force = false } = {}) {
  if (fs.existsSync(file)) {
    const st = fs.lstatSync(file);
    if (st.isSymbolicLink() || !st.isFile()) throw new PublicSafetyError(`refusing to write a symlink or non-file project config material path: ${file}`);
    if (!force) return false;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, { encoding: 'utf8', flag: force ? 'w' : 'wx' });
  return true;
}

/** Create minimal non-secret project-owned material. Never creates runtime state. */
export function setupProject({ cwd = process.cwd(), force = false } = {}) {
  const repoDir = resolveProjectRoot(cwd);
  const dir = path.join(repoDir, PROJECT_CONFIG_DIR);
  if (fs.existsSync(dir)) {
    const st = fs.lstatSync(dir);
    if (st.isSymbolicLink() || !st.isDirectory()) throw new PublicSafetyError(`refusing to use a symlink or non-directory project config path: ${dir}`);
  }
  fs.mkdirSync(dir, { recursive: true });
  const config = defaultProjectConfig(repoDir);
  const files = {
    [PROJECT_CONFIG_FILE]: `${JSON.stringify(config, null, 2)}\n`,
    'PROJECT_CAPSULE.md': '# Project capsule\n\nDescribe the target project and its non-secret invariants here.\n',
    'REPO_MAP.md': '# Repository map\n\nList relevant repository paths here. Do not add credentials or runtime evidence.\n',
    'risk-globs.json': `${JSON.stringify({ schemaVersion: '1.0.0', globs: [] }, null, 2)}\n`,
    'PROJECT_DECISIONS.md': '# Project decisions\n\nRecord durable, non-secret project decisions here.\n',
  };
  const written = [];
  for (const [name, content] of Object.entries(files)) {
    if (safeWrite(path.join(dir, name), content, { force })) written.push(path.join(dir, name));
  }
  return Object.freeze({ repoDir, configPath: projectConfigPath(repoDir), written, configDigest: digestConfig(config) });
}

export function isExternalProviderAllowed(project) {
  return project?.config?.permissions?.externalProvider === true;
}

export function projectRuntimeBoundaryStatement() {
  return `runtime evidence is stored only under <git-common-dir>/lcim; ${os.platform()} project config is non-secret and never contains provider credentials`;
}
