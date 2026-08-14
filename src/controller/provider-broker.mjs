/**
 * Controller-owned provider transport broker (SOL-S10-001, R2 + R3).
 *
 * The broker is the ONLY network egress for the model-controlled execution
 * environment. R3: EVERY external provider invocation gets a FRESH broker
 * listener on a fresh loopback port (never reused across invocations); the
 * invocation's Seatbelt profile allows outbound TCP to exactly that port
 * (and nothing else). The sandboxed Pi process is configured (via a
 * models.json written into its per-invocation isolated agent directory) to
 * reach the provider through this broker only. A surviving process from an
 * OLD invocation structurally cannot reach a NEW invocation's broker
 * endpoint, even if it learned the new token.
 *
 * AUTHORIZATION IS INVOCATION-SCOPED (R2): there is no shared per-run token
 * and no model-keyed route table. Every automatic provider invocation
 * registers ONE ephemeral capability with its own broker:
 *
 *   token <- { invocationId, role, provider, model, upstream, ... }
 *
 * - the token is cryptographically unpredictable and unique per invocation;
 * - the broker derives the authoritative route from the token, never from
 *   body.model (body.model must still equal the route-bound model);
 * - the capability binds the canonical invocation identity, provider role,
 *   provider, model, and the exact controller-selected upstream;
 * - the capability is revoked when the invocation ends; a revoked or
 *   unknown token is rejected;
 * - a DeepSeek/worker invocation token can NEVER address the SOL upstream,
 *   and a SOL token can never address the DeepSeek upstream;
 * - the sandbox-visible Pi configuration exposes only the current
 *   invocation's model/token, never other routes.
 *
 * The broker is NOT a generic proxy. It fails closed unless a request is
 * bound to an exact controller-selected invocation capability:
 *
 * - only POST to the exact chat-completions path exists; CONNECT tunneling,
 *   upgrades, and any other path are structurally refused;
 * - the upstream endpoint, protocol, host, port, and provider come ONLY
 *   from the controller-bound capability; worker-supplied url/baseUrl/host/
 *   hostname/port/protocol/upstream/provider fields are REJECTED;
 * - upstream transport is selected by the controller-configured protocol:
 *   http: -> http.request, https: -> https.request; TLS verification is
 *   never disabled (an optional controller-owned CA bundle may be pinned
 *   via LCIM_BROKER_CA_FILE, which only ADDS a trust root);
 * - provider credentials live only in this controller process and are
 *   attached to the upstream request by the broker; they never appear in
 *   project config, worker environment, sandbox-visible files, or persisted
 *   records.
 *
 * An empty broker listener is not provider authority: no credentials or
 * routes exist until an actual permission-gated invocation registers one.
 *
 * The Pi provider catalog entries generated here mirror the reviewed pi
 * built-in semantics for the bound models (openai-completions transport,
 * deepseek-style reasoning content, xhigh thinking levels).
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { LcimError, ConfigError } from '../shared/errors.mjs';
import { canonicalJson } from '../logging/digest.mjs';

export const BROKER_PROVIDER_NAME = 'lcim';
export const BROKER_API_PREFIX = '/v1';
export const BROKER_CHAT_PATH = `${BROKER_API_PREFIX}/chat/completions`;
export const PROVIDER_BROKER_EVIDENCE_SCHEMA = 'lcim.provider-broker';
export const PROVIDER_BROKER_EVIDENCE_VERSION = '2.0.0';

/** Controller-owned optional upstream trust anchor (adds a root; never disables verification). */
export const BROKER_CA_FILE_ENV = 'LCIM_BROKER_CA_FILE';

const MAX_REQUEST_BYTES = 16 * 1024 * 1024;
const DEFAULT_UPSTREAM_TIMEOUT_MS = 1_800_000;
const MAX_UPSTREAM_TIMEOUT_MS = 1_800_000;
const TOKEN_BYTES = 32;

/** Body fields that would let a worker influence routing; always rejected. */
const ROUTE_OVERRIDE_FIELDS = Object.freeze([
  'url',
  'baseUrl',
  'host',
  'hostname',
  'port',
  'protocol',
  'upstream',
  'provider',
]);

export class ProviderBrokerError extends LcimError {
  constructor(message, details = null) {
    super(message, 'PROVIDER_BROKER_FAILED', details);
  }
}

function plainObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigError(`${label} must be a plain object`);
  }
  return value;
}

/** The controller-selected provider credential source for a model route. */
export function credentialEnvFor(model) {
  if (model === 'sol-xhigh') return 'OPENAI_API_KEY';
  return 'DEEPSEEK_API_KEY';
}

function normalizeUpstreamBaseUrl(value, model) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ProviderBrokerError(`no controller-configured upstream baseUrl for model ${model}; provider transport fails closed`, { model });
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new ProviderBrokerError(`controller-configured upstream baseUrl for model ${model} is not a valid URL; provider transport fails closed`, { model, cause: error.message });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ProviderBrokerError(`broker refuses a non-http(s) upstream endpoint for model ${model}; provider transport fails closed`, { model, protocol: parsed.protocol });
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new ProviderBrokerError(`broker refuses userinfo material in the upstream endpoint for model ${model}; provider transport fails closed`, { model });
  }
  return value.replace(/\/+$/, '');
}

/**
 * Resolve one exact controller-selected broker route. This is the
 * permission-gated invocation-time authorization: it reads the controller
 * credential from the controller environment and pins the exact upstream.
 *
 * @param {object} input - { role: 'WORKER'|'SOL', model, endpoint, env }
 * @returns {Readonly<object>} frozen { provider, model, upstream }
 * @throws {ProviderBrokerError} fail closed when the route is not exact.
 */
export function resolveBrokerRoute({ role, model, endpoint, env = process.env } = {}) {
  if (role !== 'WORKER' && role !== 'SOL') throw new ConfigError(`broker routes require role WORKER or SOL, got ${JSON.stringify(role)}`);
  if (typeof model !== 'string' || model.length === 0) throw new ConfigError('broker route requires an exact controller-selected model');
  const endpointObject = plainObject(endpoint, `endpoints.${model}`);
  const provider = role === 'SOL' ? 'sol' : 'pi';
  const upstreamBaseUrl = normalizeUpstreamBaseUrl(endpointObject.baseUrl, model);
  const credentialKey = credentialEnvFor(model);
  const apiKey = env[credentialKey];
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    throw new ProviderBrokerError(`provider credential ${credentialKey} is unavailable in the controller environment; provider transport fails closed`, { model, credential: credentialKey });
  }
  const timeoutMs = Number.isSafeInteger(endpointObject.timeoutMs) && endpointObject.timeoutMs >= 1
    ? Math.min(endpointObject.timeoutMs, MAX_UPSTREAM_TIMEOUT_MS)
    : DEFAULT_UPSTREAM_TIMEOUT_MS;
  return Object.freeze({
    provider,
    model,
    upstream: Object.freeze({ baseUrl: upstreamBaseUrl, apiKey, timeoutMs }),
  });
}

/** Pi catalog entry mirroring the reviewed pi built-in deepseek semantics. */
function deepseekPiModelEntry(model) {
  const names = {
    'deepseek-v4-flash': 'DeepSeek V4 Flash',
    'deepseek-pro-max': 'DeepSeek V4 Pro Max',
    terra: 'Terra (explicit fallback)',
    luna: 'Luna (explicit fallback)',
  };
  return {
    id: model,
    name: names[model] ?? model,
    api: 'openai-completions',
    reasoning: true,
    input: ['text'],
    compat: {
      supportsStore: false,
      supportsDeveloperRole: false,
      maxTokensField: 'max_tokens',
      requiresReasoningContentOnAssistantMessages: true,
      thinkingFormat: 'deepseek',
    },
    thinkingLevelMap: { minimal: null, low: 'low', medium: null, high: 'high', max: 'max' },
  };
}

/** Pi catalog entry for the SOL decision-engine route (openai-completions). */
function solPiModelEntry(model) {
  return {
    id: model,
    name: 'SOL xhigh (LCIM decision engine)',
    api: 'openai-completions',
    reasoning: true,
    input: ['text'],
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
    thinkingLevelMap: { xhigh: 'xhigh' },
  };
}

/** Exact pi model entry for a bound model id. Unknown models fail closed. */
export function piModelEntry(model) {
  if (model === 'sol-xhigh') return solPiModelEntry(model);
  if (model === 'deepseek-v4-flash' || model === 'deepseek-pro-max' || model === 'terra' || model === 'luna') {
    return deepseekPiModelEntry(model);
  }
  throw new ProviderBrokerError(`no reviewed pi provider catalog entry exists for model ${JSON.stringify(model)}; broker route fails closed`, { model });
}

/**
 * Write the isolated pi agent config (models.json) that points the sandboxed
 * Pi at the controller-owned broker for ONE invocation. The file exposes ONLY
 * the current invocation's model and its invocation-scoped token — never
 * other routes. The file lives in the writable scratch surface (Pi needs to
 * create its auth store next to it), but the channel cannot be redirected:
 * the Seatbelt profile pins the only reachable port to the broker, and the
 * broker pins the only reachable invocation capability. The apiKey here is
 * the ephemeral invocation token — never a provider credential.
 */
export function writePiAgentConfig(piAgentDir, { baseUrl, token, models } = {}) {
  if (typeof piAgentDir !== 'string' || piAgentDir.length === 0) throw new ConfigError('pi agent directory is required');
  if (typeof baseUrl !== 'string' || baseUrl.length === 0) throw new ConfigError('broker baseUrl is required for the pi agent config');
  if (typeof token !== 'string' || token.length === 0) throw new ConfigError('broker invocation token is required for the pi agent config');
  if (!Array.isArray(models) || models.length === 0) throw new ConfigError('at least one bound model is required for the pi agent config');
  const ids = [...new Set(models)];
  const entries = ids.map((model) => piModelEntry(model));
  const config = {
    providers: {
      [BROKER_PROVIDER_NAME]: {
        baseUrl,
        api: 'openai-completions',
        apiKey: token,
        models: entries,
      },
    },
  };
  fs.mkdirSync(piAgentDir, { recursive: true, mode: 0o700 });
  const file = path.join(piAgentDir, 'models.json');
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return file;
}

function readOptionalCaBundle(env) {
  const file = env[BROKER_CA_FILE_ENV];
  if (file === undefined || file === null || file === '') return null;
  if (typeof file !== 'string' || !path.isAbsolute(file)) {
    throw new ProviderBrokerError(`${BROKER_CA_FILE_ENV} must be an absolute path to a PEM CA bundle; broker TLS trust fails closed`, { env: BROKER_CA_FILE_ENV });
  }
  let pem;
  try {
    pem = fs.readFileSync(file, 'utf8');
  } catch (error) {
    throw new ProviderBrokerError(`${BROKER_CA_FILE_ENV} is set but unreadable; broker TLS trust fails closed`, { file, cause: error.message });
  }
  if (typeof pem !== 'string' || pem.length === 0 || !pem.includes('BEGIN CERTIFICATE')) {
    throw new ProviderBrokerError(`${BROKER_CA_FILE_ENV} does not contain a PEM certificate bundle; broker TLS trust fails closed`, { file });
  }
  return Object.freeze({
    file,
    digest: crypto.createHash('sha256').update(pem).digest('hex'),
    ca: pem,
  });
}

function normalizeInvocationUpstream(upstream) {
  if (upstream === null || typeof upstream !== 'object' || Array.isArray(upstream)) {
    throw new ProviderBrokerError('invocation capability requires a controller-resolved upstream; provider transport fails closed');
  }
  if (typeof upstream.baseUrl !== 'string' || upstream.baseUrl.length === 0) {
    throw new ProviderBrokerError('invocation capability requires an exact controller-selected upstream baseUrl');
  }
  // Protocol is controller-bound: only http/https are ever accepted.
  let parsed;
  try {
    parsed = new URL(upstream.baseUrl);
  } catch (error) {
    throw new ProviderBrokerError(`invocation upstream baseUrl is not a valid URL; provider transport fails closed: ${error.message}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ProviderBrokerError(`broker refuses a non-http(s) invocation upstream protocol ${JSON.stringify(parsed.protocol)}; provider transport fails closed`);
  }
  if (typeof upstream.apiKey !== 'string' || upstream.apiKey.length === 0) {
    throw new ProviderBrokerError('invocation capability requires the controller-resolved upstream credential');
  }
  return Object.freeze({
    baseUrl: upstream.baseUrl.replace(/\/+$/, ''),
    apiKey: upstream.apiKey,
    timeoutMs: Number.isSafeInteger(upstream.timeoutMs) && upstream.timeoutMs >= 1 ? Math.min(upstream.timeoutMs, MAX_UPSTREAM_TIMEOUT_MS) : DEFAULT_UPSTREAM_TIMEOUT_MS,
  });
}

/**
 * Start the controller-owned broker listener on 127.0.0.1 with a
 * controller-picked ephemeral port. NO routes, credentials, or tokens exist
 * yet: an empty listener is not provider authority. Invocation capabilities
 * are registered per invocation via `registerInvocation` and revoked via
 * `revokeInvocation`.
 *
 * R3: every external provider invocation gets a FRESH broker listener on a
 * port distinct from every prior invocation's port (`avoidPorts`), so an
 * old invocation's Seatbelt profile (pinned to its own port) structurally
 * cannot reach a future invocation's broker endpoint.
 */
export async function startProviderBroker({ env = process.env, avoidPorts = null } = {}) {
  const tlsCa = readOptionalCaBundle(env);
  const usedPorts = avoidPorts instanceof Set ? avoidPorts : new Set();
  const invocations = new Map(); // token -> capability
  const startedAt = new Date().toISOString();
  let port = null;

  const server = http.createServer((req, res) => {
    void handleRequest(req, res, { invocations, tlsCa }).catch((error) => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'broker failure', code: 'PROVIDER_BROKER_FAILED' }));
      } else {
        res.destroy();
      }
    });
  });
  // CONNECT tunneling and protocol upgrades are structurally refused.
  server.on('connect', (req, socket) => {
    socket.destroy();
  });
  server.on('upgrade', (req, socket) => {
    socket.destroy();
  });
  server.on('clientError', (error, socket) => {
    socket.destroy();
  });

  // Pick an ephemeral port that no prior invocation's boundary allows.
  for (let attempt = 0; attempt < 16; attempt += 1) {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const candidate = server.address().port;
    if (!usedPorts.has(candidate)) {
      port = candidate;
      break;
    }
    await new Promise((resolve) => server.close(resolve));
  }
  if (port === null) {
    throw new ProviderBrokerError('could not allocate a broker port distinct from every prior invocation endpoint; provider transport fails closed');
  }
  const baseUrl = `http://127.0.0.1:${port}/v1`;

  const registerInvocation = ({ invocationId, role, provider, model, upstream } = {}) => {
    if (typeof invocationId !== 'string' || invocationId.length === 0) {
      throw new ProviderBrokerError('broker invocation capability requires the canonical invocation identity');
    }
    if (role !== 'WORKER' && role !== 'SOL') {
      throw new ProviderBrokerError(`broker invocation capability requires role WORKER or SOL, got ${JSON.stringify(role)}`);
    }
    if (typeof model !== 'string' || model.length === 0 || (provider !== 'pi' && provider !== 'sol')) {
      throw new ProviderBrokerError('broker invocation capability requires a controller-selected provider and model');
    }
    const capability = Object.freeze({
      token: crypto.randomBytes(TOKEN_BYTES).toString('hex'),
      invocationId,
      role,
      provider,
      model,
      upstream: normalizeInvocationUpstream(upstream),
      registeredAt: new Date().toISOString(),
    });
    // The immutable binding is separate from the mutable transport record.
    const record = { capability, requests: 0, upstreamStatus: null, upstreamErrors: 0, revoked: false, revokedAt: null };
    invocations.set(capability.token, record);
    return Object.freeze({ token: capability.token, capability });
  };

  const revokeInvocation = (token) => {
    if (typeof token !== 'string' || token.length === 0) return false;
    const record = invocations.get(token);
    if (record === undefined || record.revoked) return false;
    record.revoked = true;
    record.revokedAt = new Date().toISOString();
    return true;
  };

  const broker = Object.freeze({
    port,
    baseUrl,
    startedAt,
    registerInvocation,
    revokeInvocation,
    snapshot: () => {
      const invocationsDetail = {};
      const byModel = {};
      let totalRequests = 0;
      let registered = 0;
      let revoked = 0;
      for (const record of invocations.values()) {
        const capability = record.capability;
        registered += 1;
        if (record.revoked) revoked += 1;
        totalRequests += record.requests;
        invocationsDetail[capability.invocationId] = {
          role: capability.role,
          provider: capability.provider,
          model: capability.model,
          upstreamBaseUrl: capability.upstream.baseUrl,
          requests: record.requests,
          upstreamStatus: record.upstreamStatus,
          upstreamErrors: record.upstreamErrors,
          revoked: record.revoked,
          revokedAt: record.revokedAt,
        };
        const aggregate = byModel[capability.model] ?? { provider: capability.provider, upstreamBaseUrl: capability.upstream.baseUrl, requests: 0, upstreamStatus: null, upstreamErrors: 0 };
        aggregate.requests += record.requests;
        if (record.upstreamStatus !== null) aggregate.upstreamStatus = record.upstreamStatus;
        aggregate.upstreamErrors += record.upstreamErrors;
        byModel[capability.model] = aggregate;
      }
      return {
        schemaName: PROVIDER_BROKER_EVIDENCE_SCHEMA,
        schemaVersion: PROVIDER_BROKER_EVIDENCE_VERSION,
        startedAt,
        port,
        totalRequests,
        invocationsRegistered: registered,
        invocationsRevoked: revoked,
        tlsCa: tlsCa === null ? null : Object.freeze({ file: tlsCa.file, digest: tlsCa.digest }),
        invocations: invocationsDetail,
        byModel,
      };
    },
    close: async () => {
      invocations.clear();
      await new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    },
  });

  return broker;
}

function fail(res, status, message) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ error: message }));
}

async function handleRequest(req, res, { invocations, tlsCa }) {
  // Exact route surface: only the bound chat-completions path, POST only.
  if (req.method !== 'POST') {
    fail(res, 405, 'method not allowed; the broker exposes only POST chat completions');
    return;
  }
  if (req.url !== BROKER_CHAT_PATH) {
    fail(res, 404, 'unknown broker path; only the bound chat-completions route exists');
    return;
  }
  const authorization = req.headers.authorization ?? '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
  const record = invocations.get(token);
  if (record === undefined || record.revoked) {
    fail(res, 401, 'broker invocation token is required, unknown, or revoked; invocation-scoped transport fails closed');
    return;
  }
  const capability = record.capability;

  const body = await readBoundedBody(req);
  if (body === null) {
    fail(res, 413, 'broker request body exceeds the bounded transport limit');
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    fail(res, 400, 'broker request body is not valid JSON; provider transport fails closed');
    return;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail(res, 400, 'broker request body must be a JSON object');
    return;
  }
  // Worker-supplied routing fields are rejected outright: they must never
  // influence the controller-bound upstream, protocol, host, port, provider,
  // model selection, or role.
  const override = ROUTE_OVERRIDE_FIELDS.find((key) => parsed[key] !== undefined);
  if (override !== undefined) {
    fail(res, 400, `broker request contains worker-supplied routing field ${JSON.stringify(override)}; routing authority is invocation-scoped and fails closed`);
    return;
  }
  // The authoritative route comes from the token capability. body.model must
  // still equal the route-bound model; a mismatch is rejected with no
  // upstream call.
  const model = parsed.model;
  if (typeof model !== 'string' || model.length === 0) {
    fail(res, 400, 'broker request must name the exact model bound to this invocation');
    return;
  }
  if (model !== capability.model) {
    fail(res, 400, `model ${JSON.stringify(model)} is not the model bound to this invocation (${JSON.stringify(capability.model)}); cross-route transport fails closed`);
    return;
  }

  const upstreamUrl = `${capability.upstream.baseUrl}/chat/completions`;
  let parsedUpstream;
  try {
    parsedUpstream = new URL(upstreamUrl);
  } catch (error) {
    record.upstreamErrors += 1;
    fail(res, 502, 'broker upstream URL is invalid; provider transport fails closed');
    return;
  }
  // Transport is selected by the CONTROLLER-BOUND upstream protocol only.
  const transport = parsedUpstream.protocol === 'https:' ? https.request : parsedUpstream.protocol === 'http:' ? http.request : null;
  if (transport === null) {
    record.upstreamErrors += 1;
    fail(res, 502, `broker refuses unsupported upstream protocol ${JSON.stringify(parsedUpstream.protocol)}; provider transport fails closed`);
    return;
  }
  const upstreamOptions = {
    method: 'POST',
    headers: {
      'content-type': req.headers['content-type'] ?? 'application/json',
      accept: 'text/event-stream, application/json',
      authorization: `Bearer ${capability.upstream.apiKey}`,
    },
    timeout: capability.upstream.timeoutMs,
  };
  if (parsedUpstream.protocol === 'https:' && tlsCa !== null) {
    // Adds a controller-owned trust root; certificate verification stays on.
    upstreamOptions.ca = tlsCa.ca;
  }
  const upstream = transport(new URL(upstreamUrl), upstreamOptions);
  record.requests += 1;
  let forwarded = false;
  upstream.on('response', (upstreamRes) => {
    forwarded = true;
    record.upstreamStatus = upstreamRes.statusCode;
    res.writeHead(upstreamRes.statusCode, { 'content-type': upstreamRes.headers['content-type'] ?? 'application/json' });
    upstreamRes.pipe(res);
  });
  upstream.on('timeout', () => {
    record.upstreamErrors += 1;
    upstream.destroy(new Error('broker upstream timeout'));
  });
  upstream.on('error', (error) => {
    record.upstreamErrors += 1;
    if (!forwarded) fail(res, 502, 'broker upstream transport failed; provider transport fails closed');
    else res.destroy();
  });
  req.on('aborted', () => upstream.destroy());
  upstream.end(body);
}

function readBoundedBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let bytes = 0;
    let rejected = false;
    req.on('data', (chunk) => {
      if (rejected) return;
      bytes += chunk.length;
      if (bytes > MAX_REQUEST_BYTES) {
        rejected = true;
        resolve(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!rejected) resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('aborted', () => resolve(null));
    req.on('error', () => resolve(null));
  });
}

/** Persist objective broker evidence (invocation stats, never credentials or tokens). */
export function persistBrokerEvidence(runDir, workUnitId, broker, { fileKey = null } = {}) {
  if (typeof runDir !== 'string' || typeof workUnitId !== 'string' || broker === null || typeof broker !== 'object') {
    throw new ConfigError('persistBrokerEvidence requires a run directory, work unit id, and broker');
  }
  const dir = path.join(runDir, 'controller', 'broker');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const safe = String(workUnitId).replace(/[^A-Za-z0-9_-]/g, '_');
  const key = fileKey === null ? safe : `${safe}-${String(fileKey).replace(/[^A-Za-z0-9_-]/g, '_')}`;
  const file = path.join(dir, `${key}.json`);
  const record = { ...broker.snapshot(), workUnitId };
  fs.writeFileSync(file, `${canonicalJson(record)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return file;
}
