/**
 * LCIM V2 deterministic deep clone / deep freeze for JSON-shaped contract
 * data (Sprint 04, SOL-S04-001).
 *
 * Compiled contract documents are JSON-shaped: plain objects, arrays,
 * strings, numbers, booleans, null. `deepCloneJson` copies them
 * deterministically (key order preserved) so freezing never mutates
 * caller-owned input; `deepFreezeJson` recursively freezes every nested
 * object and array so a validated COMPILED document cannot be altered into
 * a semantically inconsistent state after validation.
 *
 * These helpers are applied only to contract documents (and their
 * acceptance/repair counterparts) — never to unrelated process/global
 * objects.
 */

/**
 * Deterministic deep clone of a JSON-shaped value.
 * @param {*} value
 * @returns {*} independent copy
 */
export function deepCloneJson(value) {
  if (Array.isArray(value)) {
    return value.map(deepCloneJson);
  }
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = deepCloneJson(v);
    }
    return out;
  }
  return value;
}

/**
 * Recursively freeze every array and plain object in a JSON-shaped value.
 * @param {*} value
 * @returns {*} the frozen value
 */
export function deepFreezeJson(value) {
  if (Array.isArray(value)) {
    for (const v of value) deepFreezeJson(v);
    return Object.freeze(value);
  }
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreezeJson(v);
    return Object.freeze(value);
  }
  return value;
}
