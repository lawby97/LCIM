/**
 * LCIM V2.0.1 — controller-owned facts about Pi's `openai-codex` OAuth
 * store.
 *
 * The automatic GPT-5.6 Sol SOL channel runs through Pi's NATIVE
 * `openai-codex` provider as a TRUSTED CONTROLLER-SIDE transport (see
 * `src/controller/sol-transport.mjs` and `docs/v2-codex-sol-oauth.md`).
 * Authentication originates in Pi's existing OAuth store
 * (`~/.pi/agent/auth.json`, or the `PI_CODING_AGENT_DIR` override), which
 * Pi owns: pi logs in via `/login` and refreshes tokens automatically.
 *
 * LCIM NEVER:
 *
 * - modifies the real Pi store (it is read in-process only);
 * - performs the OAuth flow or refreshes tokens itself (Pi's own refresh
 *   runs inside the run-scoped isolated agent directory);
 * - reads token values into any record (only existence/type/expiry facts
 *   may be derived, and only in the controller process);
 * - persists credential bytes anywhere except the run-scoped isolated
 *   `auth.json` (mode 0600) created by the controller transport and
 *   securely removed at run cleanup.
 *
 * The controller reads auth.json IN PROCESS (like it reads
 * `OPENAI_API_KEY` from the environment for the classic broker route) to
 * (a) decide whether the codex channel is available BEFORE routing to it
 * (fail closed with `CODEX_OAUTH_UNAVAILABLE`) and (b) copy ONLY the
 * `openai-codex` entry into the run-scoped isolated agent directory
 * for the controller-side Pi transport.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ConfigError } from '../shared/errors.mjs';
import { ProviderDiscoveryError } from '../routing/errors.mjs';

/** The Pi provider id whose OAuth store backs the GPT-5.6 Sol channel. */
export const CODEX_OAUTH_PROVIDER = 'openai-codex';

/** Reason code carried on FAIL_NO_SUBSTITUTE when the OAuth store is unusable. */
export const CODEX_OAUTH_UNAVAILABLE = 'CODEX_OAUTH_UNAVAILABLE';

/** Filename of the Pi credential store inside the agent directory. */
export const PI_AUTH_FILE = 'auth.json';

/**
 * Resolve the Pi agent directory the controller will treat as the codex
 * OAuth store. Deterministic: `PI_CODING_AGENT_DIR` (absolute) when set,
 * otherwise `~/.pi/agent`. This mirrors pi's own `getAgentDir()`.
 *
 * @param {object} [options] - { env }
 * @returns {string} absolute agent directory
 * @throws {ConfigError} when an override is set but not absolute
 */
export function resolvePiAgentDir({ env = process.env } = {}) {
  const override = env?.PI_CODING_AGENT_DIR;
  if (typeof override === 'string' && override.length > 0) {
    if (!path.isAbsolute(override)) {
      throw new ConfigError('PI_CODING_AGENT_DIR must be an absolute directory path when set');
    }
    return override;
  }
  const home = typeof env?.HOME === 'string' && env.HOME.length > 0 ? env.HOME : os.homedir();
  if (!path.isAbsolute(home)) throw new ConfigError('HOME must be absolute when resolving the Pi OAuth store');
  return path.join(home, '.pi', 'agent');
}

/**
 * Read NON-SECRET facts about the codex OAuth entry. Token material is
 * only existence-checked inside this module and is never returned,
 * persisted, or echoed.
 *
 * @param {object} [options] - { env }
 * @returns {Readonly<object>} frozen facts:
 *   { agentDir, authFile, exists, parseError: string|null, provider,
 *     type: string|null, hasAccessToken: boolean, expiresAt: number|null }
 */
export function readCodexOAuthEntry({ env = process.env } = {}) {
  const agentDir = resolvePiAgentDir({ env });
  const authFile = path.join(agentDir, PI_AUTH_FILE);
  let exists = false;
  try {
    exists = fs.existsSync(authFile);
  } catch {
    exists = false;
  }
  let parsed = null;
  let parseError = null;
  if (exists) {
    try {
      parsed = JSON.parse(fs.readFileSync(authFile, 'utf8'));
    } catch (error) {
      parseError = error?.code ?? 'PARSE_FAILED';
      parsed = null;
    }
  }
  const entry = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed[CODEX_OAUTH_PROVIDER]
    : undefined;
  const hasAccessToken = entry !== undefined
    && entry !== null
    && typeof entry === 'object'
    && entry.type === 'oauth'
    && typeof entry.access === 'string'
    && entry.access.length > 0
    && typeof entry.refresh === 'string'
    && entry.refresh.length > 0
    && typeof entry.expires === 'number'
    && Number.isFinite(entry.expires);
  return Object.freeze({
    agentDir,
    authFile,
    exists,
    parseError,
    provider: CODEX_OAUTH_PROVIDER,
    type: entry !== undefined && entry !== null && typeof entry === 'object' ? (entry.type ?? null) : null,
    hasAccessToken,
    expiresAt: entry !== undefined && entry !== null && typeof entry === 'object' && typeof entry.expires === 'number' ? entry.expires : null,
  });
}

/**
 * Fail-closed availability gate for the codex SOL channel. Throws
 * `ProviderDiscoveryError` (reason `CODEX_OAUTH_UNAVAILABLE`) when the Pi
 * OAuth store is absent, unreadable, or lacks a usable `openai-codex`
 * oauth entry. Never returns or persists token material.
 *
 * @param {object} [options] - { env }
 * @returns {Readonly<object>} the facts from readCodexOAuthEntry
 */
export function assertCodexOAuthAvailable({ env = process.env } = {}) {
  const state = readCodexOAuthEntry({ env });
  if (!state.exists || state.parseError !== null || !state.hasAccessToken) {
    // Sixth-review rule: the real Pi auth store is READ-ONLY input
    // authority. LCIM never repairs, refreshes, or writes it; when the
    // real source credential is missing/invalid/expired the run fails
    // closed with an explicit re-authentication-required instruction.
    throw new ProviderDiscoveryError(
      'RE-AUTHENTICATION REQUIRED: automatic GPT-5.6 Sol review is unavailable because the real Pi openai-codex credential is missing, unreadable, or unusable (LCIM treats the Pi auth store as read-only input authority and never modifies it). Re-authenticate with `pi /login` (select ChatGPT Plus/Pro Codex) or refresh the real credential with `pi auth print-bearer-token --provider openai-codex`, then re-run LCIM; the real store was not modified by this run.',
      { model: 'gpt-5.6-sol', provider: CODEX_OAUTH_PROVIDER, reason: CODEX_OAUTH_UNAVAILABLE },
    );
  }
  return state;
}

/**
 * Load ONLY the `openai-codex` oauth entry from the real Pi store as
 * trusted controller transport state. This is the single internal path
 * that returns credential material, and it is used exclusively by the
 * controller-side SOL transport to build the run-scoped isolated
 * `auth.json` (and by its output canary scan). The returned entry is:
 *
 * - never persisted, logged, serialized, or echoed by the caller;
 * - never placed in prompts, evidence, invocation records, controller
 *   events, audit, review export, or error messages;
 * - never written back to the real store (Pi's own refresh writes only
 *   inside the isolated run-scoped directory).
 *
 * @param {object} [options] - { env }
 * @returns {object|null} the openai-codex oauth entry, or null when the
 *   store is absent/unreadable or the entry is unusable
 */
export function loadCodexOAuthCredential({ env = process.env } = {}) {
  const state = readCodexOAuthEntry({ env });
  if (!state.exists || state.parseError !== null || !state.hasAccessToken) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(state.authFile, 'utf8'));
  } catch {
    return null;
  }
  const entry = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? parsed[CODEX_OAUTH_PROVIDER]
    : undefined;
  if (entry === undefined || entry === null || typeof entry !== 'object' || Array.isArray(entry)) return null;
  if (typeof entry.access !== 'string' || entry.access.length === 0) return null;
  // Return ONLY the openai-codex entry: other providers' credentials in the
  // real store never leave it.
  return Object.freeze({
    type: typeof entry.type === 'string' ? entry.type : null,
    access: entry.access,
    refresh: typeof entry.refresh === 'string' && entry.refresh.length > 0 ? entry.refresh : null,
    expires: typeof entry.expires === 'number' ? entry.expires : null,
    accountId: typeof entry.accountId === 'string' && entry.accountId.length > 0 ? entry.accountId : null,
  });
}
