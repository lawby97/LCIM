/**
 * LCIM V2 shared error taxonomy (Sprint 00).
 *
 * Error classes are the in-process interface; the wire/persisted shape is
 * `schemas/common/common-error.v2.schema.json` (schema name `lcim.common.error`).
 * `errorPayload()` builds the payload; `toErrorRecord()` in
 * `./schema-registry.mjs` stamps and validates it against that schema.
 */

export class LcimError extends Error {
  constructor(message, code = 'LCIM_ERROR', details = null) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

/** Configuration/input problems (bad id kind, unreadable VERSION, unknown schema name). */
export class ConfigError extends LcimError {
  constructor(message, details = null) {
    super(message, 'CONFIG_INVALID', details);
  }
}

/** A record failed validation against a shared schema. */
export class SchemaValidationError extends LcimError {
  constructor(message, details = null) {
    super(message, 'SCHEMA_VALIDATION_FAILED', details);
  }
}

/** The Sprint-00 validation engine does not support a keyword used by a schema. Fail closed. */
export class SchemaEngineError extends LcimError {
  constructor(message, details = null) {
    super(message, 'SCHEMA_ENGINE_UNSUPPORTED', details);
  }
}

/** Reserved for Sprint 02: a model transport payload could not be parsed. */
export class TransportParseError extends LcimError {
  constructor(message, details = null) {
    super(message, 'TRANSPORT_PARSE_FAILED', details);
  }
}

/** A public-safety boundary was violated (forbidden content/path in tracked space). */
export class PublicSafetyError extends LcimError {
  constructor(message, details = null) {
    super(message, 'PUBLIC_SAFETY_VIOLATION', details);
  }
}

/** Git common-dir/runtime-path resolution failed or produced an invalid path. */
export class RuntimePathError extends LcimError {
  constructor(message, details = null) {
    super(message, 'RUNTIME_PATH_INVALID', details);
  }
}

/**
 * Build the public-safe error payload (code + message + optional details).
 * Never includes credentials, transcripts, or raw model output.
 */
export function errorPayload(err) {
  const code = err instanceof LcimError ? err.code : 'LCIM_UNEXPECTED';
  const message = err instanceof Error ? err.message : String(err);
  const payload = { code, message };
  if (
    err instanceof LcimError &&
    err.details !== undefined &&
    err.details !== null &&
    typeof err.details === 'object' &&
    !Array.isArray(err.details)
  ) {
    payload.details = err.details;
  }
  return payload;
}
