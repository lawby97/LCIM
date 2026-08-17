/**
 * Thin provider command adapters used by the controller.
 *
 * Provider execution is deliberately boring: the controller selects the exact
 * route, renders a bounded request, and the process is spawned only through
 * the authorized worker boundary. Three transport shapes exist:
 *
 * - a project-configured local command (test/local fixtures) runs directly
 *   inside the network-denied boundary;
 * - the default Pi route runs `pi` inside the boundary, and Pi's provider
 *   transport leaves the sandbox ONLY through the controller-owned broker
 *   port pinned into the boundary's Seatbelt profile (SOL-S10-001). The
 *   broker holds provider credentials and performs the real upstream
 *   transport; the sandbox never holds them;
 * - V2.0.1: the GPT-5.6 Sol codex route runs Pi as a TRUSTED
 *   CONTROLLER-SIDE provider client (src/controller/sol-transport.mjs) —
 *   never inside the worker boundary. This module validates the
 *   controller-prepared transport, runs the credential canary, and fails
 *   closed on any repository/CLI `sol.command` masquerade.
 *
 * This module contains no routing policy and no SOL decision logic.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError } from '../shared/errors.mjs';
import { parseWorkerResponse } from '../handoff/parse.mjs';
import { renderSemanticContract, renderAcceptanceContract } from '../contracts/render.mjs';
import { renderSolAsk } from '../sol/ask-compiler/render.mjs';
import { runConstrainedProcess } from './execution-boundary.mjs';
import { BROKER_PROVIDER_NAME, ProviderBrokerError, resolveBrokerRoute, writePiAgentConfig } from './provider-broker.mjs';
import { CODEX_SOL_MODEL, CLASSIC_SOL_MODEL } from '../providers/capabilities/metadata.mjs';
import {
  buildCodexSolCommand,
  runSolPiProcess,
  sanitizeArgvForEvidence,
  SOL_COMMAND_MASQUERADE,
} from './sol-transport.mjs';
import { isSolTestRunAuthority } from './test-seams.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function workerSystemPrompt() {
  const file = path.resolve(HERE, '../../prompts/deepseek/worker.system.md');
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    // Prompt assets are part of the reviewed worker interface. A version/help
    // invocation never calls this function; a real worker run fails closed
    // rather than substituting an unreviewed prompt.
    throw new ConfigError(`cannot load reviewed worker system prompt from ${file}: ${error.message}`);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function basename(command) {
  return path.basename(command).toLowerCase();
}

function commandLooksLikePi(command) {
  return basename(command[0] ?? '') === 'pi' || basename(command[0] ?? '') === 'pi.mjs' || command[0] === 'pi';
}

function resolveConfiguredCommand(spec, repoDir, label) {
  if (spec === null || spec === undefined || spec.command === null) return null;
  if (!Array.isArray(spec.command) || spec.command.length === 0) throw new ConfigError(`${label}.command must be a non-empty argv array`);
  const command = [...spec.command].map((item, index) => {
    if (typeof item === 'string' && !path.isAbsolute(item) && (index === 0 ? item.includes('/') : fs.existsSync(path.join(repoDir, item)))) {
      const candidate = path.resolve(repoDir, item);
      if (index === 0 || fs.existsSync(candidate)) return candidate;
    }
    return item;
  });
  const args = [...(spec.args ?? [])].map((arg) => {
    if (typeof arg !== 'string') throw new ConfigError(`${label}.args must contain strings`);
    // A project-local script argument is resolved against the target project,
    // while ordinary provider flags/values remain untouched.
    if (!path.isAbsolute(arg) && (arg.startsWith('./') || arg.startsWith('../') || fs.existsSync(path.join(repoDir, arg)))) {
      const candidate = path.resolve(repoDir, arg);
      if (fs.existsSync(candidate)) return candidate;
    }
    return arg;
  });
  return { command, args, timeoutMs: spec.timeoutMs };
}

function brokerPiCommand({ model, reasoning, role }) {
  // The sandboxed Pi reaches the provider exclusively through the
  // controller-owned broker: provider/model identity is controller-selected
  // and the broker's pi agent config (written by the controller) pins the
  // endpoint to the broker's loopback port.
  const thinking = reasoning === 'MAX' ? 'max' : 'xhigh';
  return {
    command: ['pi'],
    args: [
      '--provider', BROKER_PROVIDER_NAME,
      '--model', model,
      '--thinking', thinking,
      '--print',
      '--no-session',
      '--no-context-files',
      '--no-extensions',
      '--no-skills',
      '--approve',
      // SOL-S10-001 R4 tool surface: the model-controlled invocation is
      // granted ONLY the in-process file tools. bash/find/grep spawn OS
      // executables and are structurally removed from the tool set; the
      // Seatbelt boundary denies process creation regardless (both layers
      // are required: the tool list is UX/policy, the profile is the
      // security boundary). SOL is a bounded decision engine and needs no
      // process tools either.
      '--tools', 'read,write,edit,ls',
    ],
    timeoutMs: role === 'SOL' ? 120_000 : 300_000,
  };
}

/**
 * Resolve a provider-role timeout from normalized project configuration.
 * The project config loader already validates and bounds these values
 * (worker/sol defaults 300_000/120_000, bounds 100..1_800_000); this guard
 * only falls back when a caller-constructed config lacks a valid value and
 * never invents an unbounded timeout. The constrained runners re-enforce
 * the same bounds at invocation time.
 */
function configuredTimeoutMs(projectConfig, section, fallback) {
  const value = projectConfig?.[section]?.timeoutMs;
  return Number.isSafeInteger(value) && value >= 1 ? value : fallback;
}

/**
 * V2.0.1: the GPT-5.6 Sol codex command is built by the controller-side
 * SOL transport (src/controller/sol-transport.mjs): canonical absolute
 * node+Pi entrypoint (never unqualified `pi`), zero-tool model surface
 * (`--no-tools`), no repository/user Pi resources (`--no-approve`,
 * `--no-context-files`, `--no-extensions`, `--no-skills`,
 * `--no-prompt-templates`, `--no-session`), `--print`, and a
 * controller-pinned `--system-prompt`. Kept here as a thin re-export for
 * callers that need the canonical flags without the full transport.
 */
export function codexSolPiCommand({ pi, systemPrompt, reasoning = 'XHIGH' } = {}) {
  const spec = buildCodexSolCommand({ pi, systemPrompt, reasoning });
  return { command: [...spec.command], args: [...spec.args], timeoutMs: spec.timeoutMs };
}

/** @returns {boolean} true when the model key is the V2.0.1 codex SOL model. */
export function isCodexSolModel(model) {
  return model === CODEX_SOL_MODEL;
}

/** @returns {boolean} true when the model key is the classic automatic SOL model. */
export function isClassicSolModel(model) {
  return model === CLASSIC_SOL_MODEL;
}

/**
 * Resolve the command for a route. Returns null when the default Pi route
 * applies (provider transport through the controller-owned broker).
 */
export function commandForRoute({ projectConfig, repoDir, model, reasoning, role }) {
  const configured = role === 'SOL'
    ? resolveConfiguredCommand(projectConfig.sol, repoDir, 'sol')
    : resolveConfiguredCommand(projectConfig.worker, repoDir, 'worker');
  return configured;
}

/** The controller-configured endpoint descriptor for a model, or null. */
export function endpointForModel(projectConfig, model) {
  if (projectConfig === null || typeof projectConfig !== 'object') return null;
  const endpoint = projectConfig.endpoints?.[model];
  return endpoint === null || endpoint === undefined ? null : endpoint;
}

export function usesExternalProvider({ projectConfig, role }) {
  const spec = role === 'SOL' ? projectConfig.sol : projectConfig.worker;
  return spec?.command === null || spec?.command === undefined;
}

export function buildWorkerPrompt({ workUnitId, contract, repairContract = null, objective = null }) {
  if (typeof workUnitId !== 'string' || contract === null || typeof contract !== 'object') throw new ConfigError('worker prompt requires workUnitId and compiled semantic contract');
  const parts = [
    workerSystemPrompt().trim(),
    '',
    'LCIM CONTROLLER BRIEF',
    `WORK_UNIT_ID: ${workUnitId}`,
    `OBJECTIVE: ${objective ?? contract.title}`,
    '',
    renderSemanticContract(contract),
  ];
  if (repairContract !== null) parts.push('', renderAcceptanceContract(repairContract));
  parts.push(
    '',
    'The controller will inspect Git, patch, scope, tests, and safety independently. Return only the worker response object described above. Do not report controller-owned facts.',
  );
  return parts.join('\n');
}

export function buildSolPrompt(ask) {
  // The only SOL prompt construction path is the reviewed Sprint-06 renderer.
  return renderSolAsk(ask);
}

/**
 * Execute a provider command inside the already-authorized boundary.
 *
 * The default Pi route registers a per-invocation broker capability bound to
 * the canonical invocation identity, role, model, and controller-selected
 * upstream; the sandbox-visible Pi config exposes ONLY that invocation's
 * model/token; the capability is revoked when the invocation ends.
 *
 * V2.0.1: the GPT-5.6 Sol codex route (role SOL, model `gpt-5.6-sol`) runs
 * Pi as a TRUSTED CONTROLLER-SIDE provider client instead — no worker
 * boundary, no broker, no LCIM-held credential beyond the invocation-
 * scoped isolated store. The route REQUIRES a controller-prepared SOL
 * transport (see src/controller/sol-transport.mjs) and refuses every
 * other shape fail-closed: a non-codex boundary, a missing transport, or
 * a repository/CLI `sol.command` masquerading as the production codex
 * transport. Post-exit credential scanning and acceptance ordering remain
 * controller-owned in orchestrator.mjs; this adapter persists nothing.
 *
 * `runner` is a test seam defaulting to the real transport runner; it is
 * never caller-controlled in production paths.
 */
export async function invokeBoundedProvider({ boundary, projectConfig, repoDir, model, reasoning, role, prompt, ask = null, broker = null, invocationId = null, onSpawn = null, runner = null, solTransport = null, solTestAuthority = null, env = process.env }) {
  if (role !== 'WORKER' && role !== 'SOL') throw new ConfigError(`unsupported automatic provider role ${JSON.stringify(role)}`);
  if (role === 'SOL') {
    if (ask === null || typeof ask !== 'object' || Array.isArray(ask)) {
      throw new ConfigError('SOL provider invocation requires the compiled Sprint-06 ask object; generic prompts are refused');
    }
    // The compiled ask, not a caller-supplied generic string, is the only
    // prompt that can reach the SOL provider path.
    prompt = buildSolPrompt(ask);
  }
  if (typeof prompt !== 'string' || prompt.length === 0) throw new ConfigError('provider invocation requires a non-empty rendered prompt');
  const commandSpec = commandForRoute({ projectConfig, repoDir, model, reasoning, role });
  let command;
  let args;
  let input;
  let timeoutMs;
  let result;
  const codexRoute = role === 'SOL' && isCodexSolModel(model);
  if (codexRoute) {
    // V2.0.1 codex SOL route: controller-side trusted Pi transport.
    if (commandSpec !== null) {
      // A repository or CLI sol.command must never masquerade as a
      // production openai-codex / gpt-5.6-sol review. Test fixtures use
      // the explicit controller-owned transport seam instead.
      throw new ProviderBrokerError(
        'a configured sol.command cannot substitute the gpt-5.6-sol codex transport (production review authority requires the controller-side Pi openai-codex transport); remove sol.command or the codex endpoint — provider invocation fails closed',
        { model, role, code: SOL_COMMAND_MASQUERADE },
      );
    }
    if (solTransport === null || typeof solTransport !== 'object') {
      throw new ProviderBrokerError('GPT-5.6 Sol codex transport requires the controller-prepared controller-side Pi SOL transport; provider invocation fails closed', { model, role });
    }
    if (typeof solTransport.agentDir !== 'string' || !path.isAbsolute(solTransport.agentDir)
      || typeof solTransport.cwd !== 'string' || !path.isAbsolute(solTransport.cwd)
      || solTransport.env === null || typeof solTransport.env !== 'object'
      || solTransport.env.PI_CODING_AGENT_DIR !== solTransport.agentDir) {
      throw new ProviderBrokerError('GPT-5.6 Sol codex transport shape is invalid (agentDir/cwd/env pins); provider invocation fails closed', { model, role });
    }
    // SOL-S11-002: a caller-supplied runner is a controller-internal test
    // seam. It is honored ONLY for a non-authoritative transport (created
    // under a controller-minted test capability); a normal caller can
    // never substitute the runner and receive production SOL authority.
    if (runner !== null && (solTransport.nonAuthoritative !== true || !isSolTestRunAuthority(solTestAuthority))) {
      throw new ProviderBrokerError(
        'a caller-supplied provider runner is a controller-internal test seam and requires opaque consumed non-authoritative test-run authority; production provider invocation fails closed',
        { model, role },
      );
    }
    const spec = buildCodexSolCommand({ pi: solTransport.pi, systemPrompt: solTransport.systemPrompt, reasoning });
    command = spec.command;
    args = [...spec.args, prompt];
    input = '';
    timeoutMs = configuredTimeoutMs(projectConfig, 'sol', spec.timeoutMs);
    const run = runner === null ? (transport, options) => runSolPiProcess({ ...options, transport }) : runner;
    result = await run(solTransport, {
      command,
      args,
      input,
      timeoutMs,
      onSpawn,
    });
    // Raw output remains in bounded controller memory only. The controller
    // performs the credential scan after post-exit process/surface proofs and
    // before parsing, compilation, persistence, or any evidence record.
  } else if (commandSpec === null) {
    // Default Pi route: provider transport must leave the sandbox through
    // the controller-owned broker pinned into this boundary. If the boundary
    // has no broker allowance, the invocation fails closed — the sandbox is
    // network-denied by construction and cannot reach any provider directly.
    const allowance = boundary.networkPolicy?.broker ?? null;
    if (allowance === null || allowance.port === undefined) {
      throw new ProviderBrokerError('default Pi provider transport requires a controller-owned broker allowance pinned in the execution boundary; provider invocation fails closed', { model, role });
    }
    if (broker === null || typeof broker !== 'object' || typeof broker.registerInvocation !== 'function' || typeof broker.revokeInvocation !== 'function') {
      throw new ProviderBrokerError('default Pi provider transport requires the controller-planned broker listener; provider invocation fails closed', { model, role });
    }
    if (typeof invocationId !== 'string' || invocationId.length === 0) {
      throw new ProviderBrokerError('default Pi provider transport requires the canonical invocation identity; provider invocation fails closed', { model, role });
    }
    // SOL-S11-002 mirror: a caller-supplied runner is a controller-internal
    // test seam. It is honored ONLY under an opaque consumed
    // non-authoritative test-run authority; a production broker invocation
    // carrying a runner fails closed before any capability registration.
    if (runner !== null && !isSolTestRunAuthority(solTestAuthority)) {
      throw new ProviderBrokerError(
        'a caller-supplied provider runner is a controller-internal test seam and requires opaque consumed non-authoritative test-run authority; production provider invocation fails closed',
        { model, role },
      );
    }
    // Permission-gated, invocation-time route authorization: resolves the
    // controller credential and pins the exact upstream for THIS invocation.
    const routeSpec = resolveBrokerRoute({ role, model, endpoint: endpointForModel(projectConfig, model), env });
    const { token } = await broker.registerInvocation({
      invocationId,
      role,
      provider: routeSpec.provider,
      model,
      upstream: routeSpec.upstream,
    });
    // Sandbox-visible Pi config exposes ONLY this invocation's model/token.
    writePiAgentConfig(boundary.piAgentDir, { baseUrl: broker.baseUrl, token, models: [model] });
    const spec = brokerPiCommand({ model, reasoning, role });
    command = spec.command;
    args = [...spec.args, prompt];
    input = '';
    // The project worker timeout is authoritative on the default brokered
    // WORKER route (the loader already bounded it); the classic SOL broker
    // branch keeps its own bounded default and never inherits the worker
    // timeout.
    timeoutMs = role === 'WORKER' ? configuredTimeoutMs(projectConfig, 'worker', spec.timeoutMs) : spec.timeoutMs;
    const run = runner === null ? (bnd, options) => runConstrainedProcess(bnd, options) : runner;
    try {
      result = await run(boundary, {
        command,
        args,
        input,
        timeoutMs,
        onSpawn,
      });
    } finally {
      // The invocation-scoped capability dies with the invocation.
      broker.revokeInvocation(token);
    }
  } else {
    const pi = commandLooksLikePi(commandSpec.command);
    if (role === 'SOL' && !isSolTestRunAuthority(solTestAuthority)) {
      // Repository configuration can never carry test authority. Only the
      // opaque run authority consumed at controller entry may execute a
      // local SOL fixture, and that run is permanently non-authoritative.
      throw new ProviderBrokerError(
        'a configured sol.command cannot grant SOL decision authority; only an opaque controller-internal test-run seam may execute it',
        { model, role, code: SOL_COMMAND_MASQUERADE },
      );
    }
    args = pi ? [...commandSpec.args, prompt] : commandSpec.args;
    input = pi ? '' : prompt;
    command = commandSpec.command;
    timeoutMs = commandSpec.timeoutMs;
    result = await runConstrainedProcess(boundary, {
      command,
      args,
      input,
      timeoutMs,
      onSpawn,
    });
  }
  return Object.freeze({
    ...result,
    provider: role === 'SOL' ? (isCodexSolModel(model) ? 'pi' : 'sol') : 'pi',
    model,
    reasoningEffort: reasoning,
    role,
    command: Object.freeze([...command]),
    // SOL-S11-005: for the codex SOL transport the evidence records the
    // SANITIZED argv (the prompt argument replaced by its SHA-256 digest)
    // and the prompt digest — never prompt content.
    ...(codexRoute
      ? (() => {
        const sanitized = sanitizeArgvForEvidence([...command, ...args], prompt, solTransport.systemPrompt);
        return {
          argvSanitized: sanitized.argv,
          promptDigest: sanitized.promptDigest,
          systemPromptDigest: sanitized.systemPromptDigest,
        };
      })()
      : {}),
    // The prompt is intentionally not returned or persisted by the caller.
    promptBytes: Buffer.byteLength(prompt, 'utf8'),
  });
}

/** Parse one provider text response without inventing or repairing content. */
export function parseProviderJson(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return { value: null, normalization: null, error: 'empty' };
  try {
    const parsed = parseWorkerResponse(raw);
    return { value: parsed.value, normalization: parsed.normalization, extraction: parsed.extraction, error: null };
  } catch (err) {
    return { value: null, normalization: null, error: err?.message ?? 'malformed provider response' };
  }
}

export function withLocalRouteEndpoints(projectConfig, { workerCommand = false, solCommand = false } = {}) {
  const config = clone(projectConfig);
  config.endpoints = { ...(config.endpoints ?? {}) };
  if (workerCommand && config.endpoints['deepseek-v4-flash'] === undefined) {
    config.endpoints['deepseek-v4-flash'] = { baseUrl: 'local://controller-worker', kind: 'local-command' };
  }
  // V2.0.1: a local SOL command auto-configures the CLASSIC sol-xhigh
  // endpoint only when no codex endpoint is configured; a project that
  // explicitly configures endpoints['gpt-5.6-sol'] keeps the codex channel
  // (a local sol command then substitutes the transport for tests/fixtures).
  if (solCommand && config.endpoints['sol-xhigh'] === undefined && config.endpoints['gpt-5.6-sol'] === undefined) {
    config.endpoints['sol-xhigh'] = { baseUrl: 'local://controller-sol', kind: 'local-command' };
  }
  return config;
}
