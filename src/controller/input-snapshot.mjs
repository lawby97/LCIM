/**
 * Synchronous authority-input snapshotting for the controller.
 *
 * Controller entry points must never retain caller-owned mutable objects
 * across an await. These helpers reject accessors/prototype-backed data,
 * copy JSON-shaped values without invoking getters, and deeply freeze the
 * resulting snapshot. They intentionally do not attempt to serialize
 * callbacks: callbacks are explicit test seams and are handled separately
 * by the orchestrator.
 */

import { ConfigError } from '../shared/errors.mjs';
import { deepFreezeJson } from '../contracts/deep-freeze.mjs';

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownDescriptors(value, label, { array = false } = {}) {
  if ((array && !Array.isArray(value)) || (!array && !isPlainObject(value))) {
    throw new ConfigError(`${label} must be a ${array ? 'plain array' : 'plain object without a custom prototype'}`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (key === 'length' && array) continue;
    if (!Object.hasOwn(descriptor, 'value')) {
      throw new ConfigError(`${label}.${key} must be a data property; getter/setter-backed controller inputs are refused`);
    }
  }
  return descriptors;
}

/** Safely read an own data property without invoking a getter. */
export function ownDataProperty(value, key, label, { optional = true } = {}) {
  const descriptors = ownDescriptors(value, label);
  const descriptor = descriptors[key];
  if (descriptor === undefined) {
    if (optional) return undefined;
    throw new ConfigError(`${label}.${key} is required`);
  }
  return descriptor.value;
}

/**
 * Clone a JSON-shaped value without calling getters or retaining source
 * objects. Symbols, functions, bigint, undefined, non-finite numbers,
 * custom prototypes, sparse arrays, and accessors are rejected.
 */
export function snapshotJson(value, label = 'value') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ConfigError(`${label} must not contain a non-finite number`);
    return value;
  }
  if (Array.isArray(value)) {
    const descriptors = ownDescriptors(value, label, { array: true });
    const out = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined) throw new ConfigError(`${label}[${index}] must not be a sparse array hole`);
      out.push(snapshotJson(descriptor.value, `${label}[${index}]`));
    }
    for (const key of Object.keys(descriptors)) {
      if (key !== 'length' && !/^(0|[1-9][0-9]*)$/.test(key)) {
        throw new ConfigError(`${label} may not carry non-index array properties`);
      }
    }
    return out;
  }
  if (isPlainObject(value)) {
    const descriptors = ownDescriptors(value, label);
    const out = {};
    for (const key of Object.keys(descriptors)) {
      out[key] = snapshotJson(descriptors[key].value, `${label}.${key}`);
    }
    return out;
  }
  throw new ConfigError(`${label} must be JSON-shaped plain data`);
}

export function snapshotFrozenJson(value, label = 'value') {
  return deepFreezeJson(snapshotJson(value, label));
}

/** Snapshot string argv data; undefined remains distinguishable from []. */
export function snapshotStringArgv(value, label, { allowUndefined = true, allowNull = false } = {}) {
  if (value === undefined && allowUndefined) return undefined;
  if (value === null && allowNull) return null;
  if (!Array.isArray(value)) throw new ConfigError(`${label} must be an argv array`);
  const copy = snapshotJson(value, label);
  for (const [index, item] of copy.entries()) {
    if (typeof item !== 'string' || item.length === 0) throw new ConfigError(`${label}[${index}] must be a non-empty string`);
  }
  return deepFreezeJson(copy);
}

/** Snapshot process.env into an ordinary frozen own-data map. */
export function snapshotEnvironment(env = process.env) {
  const out = {};
  // process.env has a special prototype, so enumerate it rather than using
  // snapshotJson. Values are copied synchronously before the first await.
  for (const key of Object.keys(env ?? {})) {
    const descriptor = Object.getOwnPropertyDescriptor(env, key);
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) {
      throw new ConfigError(`controller environment ${key} is accessor-backed and cannot be snapshotted`);
    }
    if (typeof descriptor.value === 'string') out[key] = descriptor.value;
  }
  return Object.freeze(out);
}

/** Ensure an options bag itself has only own data properties. */
export function assertPlainOptions(value, label = 'controller options') {
  ownDescriptors(value, label);
  return value;
}
