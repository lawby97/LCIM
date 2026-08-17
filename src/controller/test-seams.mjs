/**
 * Controller-internal SOL test-seam authority.
 *
 * This module is deliberately not re-exported from src/controller/index.mjs.
 * A seam capability is opaque object identity held in a module-private
 * WeakSet: it has no serializable token, cannot be copied, and is consumed
 * exactly once when a controller run is created.  Consumption returns a
 * separate opaque run authority which is the only value accepted by the
 * transport internals.  Consequently ordinary project data, JSON, a copied
 * capability shape, or a reused capability can never mint test authority.
 *
 * Every run authorized this way is structurally NON-AUTHORITATIVE.  The
 * capability only permits local fixtures in node:test; it never grants
 * REVIEW_APPROVED authority.
 */

import { ConfigError } from '../shared/errors.mjs';

/** Opaque capability identities minted for node:test only. */
const mintedCapabilities = new WeakSet();
/** A capability is one-shot: once a run consumes it, it is forever invalid. */
const consumedCapabilities = new WeakSet();
/** Opaque, module-private per-run seam authorities. */
const runAuthorities = new WeakSet();
/** Optional process tables are captured only inside opaque test capabilities. */
const capabilityProcessTables = new WeakMap();
/** Per-authority process-table binding/claim state. */
const runAuthorityState = new WeakMap();
/** Wrapped tables that were claimed once for one exact run. */
const claimedProcessTables = new WeakMap();
/** Routing configs blessed only by an opaque test-run authority. */
const seamRoutingConfigs = new WeakSet();

export const SOL_TEST_SEAM_KIND = 'lcim.sol-test-seam-opaque';

function inNodeTest() {
  // node:test sets this for test workers. It is intentionally an additional
  // guard, not the security primitive: object identity + one-shot
  // consumption are the unforgeable boundary.
  return process.env.NODE_TEST_CONTEXT === 'child-v8';
}

/**
 * Internal test helper. It is intentionally absent from the public
 * controller integration surface. Production callers cannot mint a seam
 * capability; test workers receive an opaque object with no copyable data.
 */
export function mintSolTestSeam({ processTable = null } = {}) {
  if (!inNodeTest()) {
    throw new ConfigError('SOL test seam capabilities may be minted only by node:test workers; production callers cannot mint controller test authority');
  }
  if (processTable !== null && (typeof processTable !== 'object' || Array.isArray(processTable))) {
    throw new ConfigError('SOL test processTable must be an object');
  }
  const capability = Object.freeze(Object.create(null));
  mintedCapabilities.add(capability);
  if (processTable !== null) capabilityProcessTables.set(capability, processTable);
  return capability;
}

/** Whether a fresh opaque capability carries the private process-table seam. */
export function solTestSeamHasProcessTable(candidate) {
  return isSolTestSeam(candidate) && capabilityProcessTables.has(candidate);
}

/** True only for a currently unconsumed opaque test capability. */
export function isSolTestSeam(candidate) {
  return candidate !== null
    && typeof candidate === 'object'
    && mintedCapabilities.has(candidate)
    && !consumedCapabilities.has(candidate);
}

/**
 * Validate and consume one opaque capability, yielding an internal run
 * authority. The returned authority has no public representation and is
 * recognized only by isSolTestRunAuthority().
 */
export function consumeSolTestSeam(candidate, label = 'SOL test seam') {
  if (!isSolTestSeam(candidate)) {
    throw new ConfigError(
      `${label} is a controller-internal test seam and requires one fresh controller-minted SOL test capability (opaque, copied/forged/reused capabilities are refused)`,
    );
  }
  consumedCapabilities.add(candidate);
  const authority = Object.freeze(Object.create(null));
  runAuthorities.add(authority);
  runAuthorityState.set(authority, {
    processTable: capabilityProcessTables.get(candidate) ?? null,
    boundRunId: null,
    processTableClaimed: false,
  });
  return authority;
}

/** Compatibility assertion for tests that only need to inspect freshness. */
export function assertSolTestSeam(candidate, label) {
  if (!isSolTestSeam(candidate)) {
    throw new ConfigError(
      `${label} is a controller-internal test seam and requires one fresh controller-minted SOL test capability (opaque capability required)`,
    );
  }
  return candidate;
}

/** True only for the module-private run authority made by consumeSolTestSeam. */
export function isSolTestRunAuthority(candidate) {
  return candidate !== null && typeof candidate === 'object' && runAuthorities.has(candidate);
}

/**
 * Claim the private process-table seam exactly once for one canonical run.
 * The raw caller object is never accepted by a production API; this returns
 * a frozen wrapper whose identity is bound in module-private state.
 */
export function claimSolTestProcessTable(candidate, runId, label = 'SOL test process-table authority') {
  const state = runAuthorityState.get(candidate);
  if (!isSolTestRunAuthority(candidate) || state === undefined || state.processTable === null
    || state.processTableClaimed || state.boundRunId !== null
    || typeof runId !== 'string' || !/^lcim_run_[0-9a-f]{32}$/.test(runId)) {
    throw new ConfigError(`${label} is one-shot and run-bound; reuse, rebinding, or an unsealed caller process table is refused`);
  }
  const source = state.processTable;
  const methods = {};
  for (const key of ['list', 'listWithEnv', 'kill', 'onBegin']) {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (descriptor?.get !== undefined || descriptor?.set !== undefined) {
      throw new ConfigError(`${label}.${key} must be a data property, not an accessor`);
    }
    if (descriptor?.value !== undefined && descriptor.value !== null) {
      if (typeof descriptor.value !== 'function') throw new ConfigError(`${label}.${key} must be a function`);
      methods[key] = (...args) => descriptor.value.call(source, ...args);
    }
  }
  const wrapped = Object.freeze(methods);
  state.boundRunId = runId;
  state.processTableClaimed = true;
  claimedProcessTables.set(wrapped, Object.freeze({ authority: candidate, runId }));
  return wrapped;
}

/** Exact identity/run check used only by internal test-aware process code. */
export function isClaimedSolTestProcessTable(processTable, candidate, runId) {
  const binding = processTable !== null && typeof processTable === 'object'
    ? claimedProcessTables.get(processTable)
    : undefined;
  return binding !== undefined && binding.authority === candidate && binding.runId === runId;
}

/** Compatibility helper: a claimed process-table authority is no longer fresh. */
export function isUnspentSolTestRunAuthority(candidate) {
  const state = runAuthorityState.get(candidate);
  return isSolTestRunAuthority(candidate) && state !== undefined && state.processTableClaimed !== true;
}

/** Mark one controller-created routing config for a local SOL fixture. */
export function markSolFixtureRoutingConfig(config, runAuthority) {
  if (!isSolTestRunAuthority(runAuthority) || config === null || typeof config !== 'object') {
    throw new ConfigError('only an opaque consumed test-run authority may mark a SOL fixture routing config');
  }
  seamRoutingConfigs.add(config);
  return config;
}

/** True only for a config object marked above; ordinary data can never copy it. */
export function isSolFixtureRoutingConfig(config) {
  return config !== null && typeof config === 'object' && seamRoutingConfigs.has(config);
}
