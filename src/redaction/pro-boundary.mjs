/**
 * Text-only SOL Pro boundary redaction.
 *
 * This module is deliberately transport-agnostic. It receives text that is
 * about to cross the manual clipboard boundary and either redacts recognised
 * credentials/local paths or fails closed for material that cannot safely be
 * reduced to a bounded text excerpt (for example a private-key block).
 */

import { LcimError, ConfigError } from '../shared/errors.mjs';

export class ProRedactionError extends LcimError {
  constructor(message, code = 'PRO_REDACTION_FAILED', details = null) {
    super(message, code, details);
  }
}

export const REDACTED_SECRET = '[REDACTED_SECRET]';
export const REDACTED_LOCAL_PATH = '[REDACTED_LOCAL_PATH]';

// Multi-line private-key material cannot be safely excerpted. Do not attempt
// to infer its extent or retain a partial value: make the local user reduce it
// before a clipboard packet can be prepared.
const UNREDACTABLE_SECRET_PATTERNS = [
  // PEM-style and armor families: `-----BEGIN PRIVATE KEY-----`,
  // `-----BEGIN RSA PRIVATE KEY-----`, `-----BEGIN PGP PRIVATE KEY BLOCK-----`,
  // `-----BEGIN OPENSSH PRIVATE KEY-----`, ...
  /-----BEGIN(?: [A-Z0-9][A-Z0-9 ]*)? PRIVATE KEY(?: BLOCK)?-----/i,
  /-----BEGIN OPENSSH PRIVATE KEY-----/i,
  /\bunredactable[ _-]?secret\b/i,
];

const SECRET_REPLACERS = [
  // Provider, source-control, cloud, and chat-token shaped values.
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{12,}|AKIA[0-9A-Z]{16}|AIza[A-Za-z0-9_-]{20,})\b/g,
  // JWT-shaped bearer material.
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  // Explicit bearer values.
  /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/gi,
  // Named secret values. Keep the field name so the bounded text remains
  // intelligible while replacing only the value.
  /\b((?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd|authorization))\s*([:=])\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
];

// A slash which follows neither ':' nor '/' cannot be part of a URI scheme
// (`https://…`), but it may be an arbitrary target-repository absolute path.
// Treat it as local context rather than trusting a project-specific root name.
const GENERIC_ABSOLUTE_LOCAL_PATH = /(?<![:/])\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~%+@=,:-]+)+(?!\/)/g;

// Single-component absolute POSIX roots (`/tmp`, `/var`, `/etc`, `/Users`,
// `/home`, ...). A leading slash that follows a boundary — start of string,
// whitespace, quotes, parentheses, or an assignment/label delimiter (`=`,
// `:`) — is a path, not prose punctuation; URLs are masked before this rule
// runs (SOL-S07-004).
const SINGLE_COMPONENT_ABSOLUTE_LOCAL_PATH = /(?:^|(?<=[\s"'`(=:]))\/(?:tmp|var|etc|private|Users|home|Volumes|opt|usr|Library|Applications|System|dev|mnt|workspace|workspaces)(?=$|[\s.,;:)\]}"'`])/g;

const LOCAL_PATH_REPLACERS = [
  // A file URI is a local artifact reference, not a text excerpt.
  { pattern: /\bfile:\/{2,3}[^\s"'`<>|)}\]]+/gi, preserveLeading: false },
  // Home-relative paths.
  { pattern: /~\/[A-Za-z0-9._~%+@=,:/-]+/g, preserveLeading: false },
  // Windows user/workspace paths.
  { pattern: /\b[A-Za-z]:\\(?:Users|home|workspace|workspaces|tmp|Temp)(?:\\[^\s"'`<>|)}\]]+)+/g, preserveLeading: false },
  // POSIX paths. Capture the non-path leading delimiter so prose remains
  // readable after replacement.
  { pattern: /(^|[^A-Za-z0-9:])\/(?:Users|home|private|var|tmp|Volumes|opt|usr|etc|Library|Applications|System|dev|mnt|workspace|workspaces)(?:\/[A-Za-z0-9._~%+@=,:-]+)+/g, preserveLeading: true },
  { pattern: GENERIC_ABSOLUTE_LOCAL_PATH, preserveLeading: false },
  { pattern: SINGLE_COMPONENT_ABSOLUTE_LOCAL_PATH, preserveLeading: false },
  // Relative local source paths and file-like code/test references. A
  // minimal excerpt can describe the relevant code without target layout.
  { pattern: /(?:^|(?<=[\s"'`(]))(?:\.\.\/|\.\/)+(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]+/g, preserveLeading: false },
  { pattern: /\b(?:src|lib|app|test|tests|packages|services|config)\/(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]+(?:\.[A-Za-z0-9]+)?\b/g, preserveLeading: false },
  { pattern: /\b[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\.(?:mjs|cjs|js|ts|tsx|jsx|py|go|rs|java|json|ya?ml|toml|md|txt|log|diff|patch)\b/g, preserveLeading: false },
];

const REMAINING_SECRET_PATTERNS = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/i,
  /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|glpat-[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{12,}|AKIA[0-9A-Z]{16}|AIza[A-Za-z0-9_-]{20,})\b/i,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/i,
  /\bBearer\s+[A-Za-z0-9._~+\/-]{8,}/i,
  /\b(?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd|authorization)\s*[:=]\s*(?!\[REDACTED_SECRET\])(?:"[^"]*"|'[^']*'|[^\s,;]+)/i,
];

const REMAINING_LOCAL_PATH_PATTERNS = [
  /\bfile:\/{2,3}[^\s"'`<>|)}\]]+/i,
  /~\/[A-Za-z0-9._~%+@=,:/-]+/,
  /\b[A-Za-z]:\\(?:Users|home|workspace|workspaces|tmp|Temp)(?:\\[^\s"'`<>|)}\]]+)+/,
  /(?:^|[^A-Za-z0-9:])\/(?:Users|home|private|var|tmp|Volumes|opt|usr|etc|Library|Applications|System|dev|mnt|workspace|workspaces)(?:\/[A-Za-z0-9._~%+@=,:-]+)+/,
  /(?<![:/])\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~%+@=,:-]+)+/,
  // Derived from the SAME source as the replacement matcher so the final
  // fail-closed check recognizes exactly the same single-component class
  // (SOL-S07-004).
  new RegExp(SINGLE_COMPONENT_ABSOLUTE_LOCAL_PATH.source),
  /(?:^|(?<=[\s"'`(]))(?:\.\.\/|\.\/)+(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]+/,
  /\b(?:src|lib|app|test|tests|packages|services|config)\/(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]+(?:\.[A-Za-z0-9]+)?\b/,
  /\b[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\.(?:mjs|cjs|js|ts|tsx|jsx|py|go|rs|java|json|ya?ml|toml|md|txt|log|diff|patch)\b/,
];

function assertText(text) {
  if (typeof text !== 'string') {
    throw new ConfigError('SOL Pro boundary text must be a string');
  }
}

function countMatches(text, pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  return [...text.matchAll(re)].length;
}

/** Keep remote URLs out of local-path matching; no URL is fetched or opened. */
function maskHttpUrls(text) {
  const urls = [];
  const masked = text.replace(/https?:\/\/[^\s"'`<>|)}\]]+/gi, (url) => {
    const marker = `__LCIM_URL_${urls.length}__`;
    urls.push(url);
    return marker;
  });
  return { text: masked, urls };
}

function restoreHttpUrls(text, urls) {
  return text.replace(/__LCIM_URL_(\d+)__/g, (_marker, index) => urls[Number(index)] ?? _marker);
}

/**
 * Inspect text without returning the sensitive match. The returned metadata
 * is safe to place in a local error/report because it carries only counts and
 * categories, never a credential or path value.
 */
export function inspectProText(text) {
  assertText(text);
  const unredactable = UNREDACTABLE_SECRET_PATTERNS.some((pattern) => pattern.test(text));
  const secretCount = SECRET_REPLACERS.reduce((count, pattern) => count + countMatches(text, pattern), 0);
  const pathText = maskHttpUrls(text).text;
  const localPathCount = LOCAL_PATH_REPLACERS.reduce((count, entry) => count + countMatches(pathText, entry.pattern), 0);
  return Object.freeze({ unredactable, secretCount, localPathCount });
}

/**
 * Redact recognised material before clipboard text is written.
 *
 * A private-key/unredactable marker fails closed rather than risking a
 * partial redaction. The error intentionally never echoes source text.
 */
export function redactProText(text) {
  assertText(text);
  const inspection = inspectProText(text);
  if (inspection.unredactable) {
    throw new ProRedactionError(
      'SOL Pro copy refused before clipboard write: local evidence contains secret material that cannot be safely redacted. Remove it or replace it with a minimal non-sensitive summary locally, then retry.',
      'PRO_UNREDACTABLE_SECRET',
      { category: 'unredactable-secret' },
    );
  }

  let redacted = text;
  let redactedSecrets = 0;
  for (const pattern of SECRET_REPLACERS) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    redacted = redacted.replace(re, (...args) => {
      redactedSecrets += 1;
      // Preserve named assignment labels but never their values.
      if (/^\b((?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd|authorization))\s*([:=])\s*/i.test(args[0])) {
        const label = args[1];
        const separator = args[2];
        return `${label}${separator}${REDACTED_SECRET}`;
      }
      return REDACTED_SECRET;
    });
  }

  const maskedUrls = maskHttpUrls(redacted);
  redacted = maskedUrls.text;
  let redactedPaths = 0;
  for (const { pattern, preserveLeading } of LOCAL_PATH_REPLACERS) {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    const re = new RegExp(pattern.source, flags);
    redacted = redacted.replace(re, (...args) => {
      redactedPaths += 1;
      return preserveLeading ? `${args[1]}${REDACTED_LOCAL_PATH}` : REDACTED_LOCAL_PATH;
    });
  }

  if (REMAINING_SECRET_PATTERNS.some((pattern) => pattern.test(redacted))) {
    throw new ProRedactionError(
      'SOL Pro copy refused before clipboard write: a secret could not be verified as redacted. Reduce or redact the local evidence before retrying.',
      'PRO_SECRET_REDACTION_INCOMPLETE',
      { category: 'secret' },
    );
  }
  if (REMAINING_LOCAL_PATH_PATTERNS.some((pattern) => pattern.test(redacted))) {
    throw new ProRedactionError(
      'SOL Pro copy refused before clipboard write: a local path could not be verified as redacted. Replace it with a path-free excerpt locally, then retry.',
      'PRO_PATH_REDACTION_INCOMPLETE',
      { category: 'local-path' },
    );
  }

  return Object.freeze({
    text: restoreHttpUrls(redacted, maskedUrls.urls),
    redactedSecrets,
    redactedPaths,
  });
}

/** Reject inbound text that would persist a secret/path in a repair artifact. */
export function assertInboundProTextSafe(text) {
  const inspection = inspectProText(text);
  if (inspection.unredactable || inspection.secretCount > 0 || inspection.localPathCount > 0) {
    throw new ProRedactionError(
      'Pasted SOL Pro text was refused because it contains secret or local-path material. Remove that material locally and paste a bounded directive again.',
      'PRO_INBOUND_SENSITIVE_TEXT',
      { category: inspection.unredactable ? 'unredactable-secret' : 'sensitive-text' },
    );
  }
  return true;
}
