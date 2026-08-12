/**
 * LCIM V2 worker-handoff parser (Sprint 02).
 *
 * STRICT PARSE FIRST, then recorded syntactic normalization ONLY for:
 *   1. one JSON code fence (```json or plain ```), or
 *   2. one uniquely identifiable JSON object embedded in harmless
 *      prefix/suffix prose.
 *
 * A fenced object is acceptable ONLY when the surrounding prefix/suffix
 * contains no other independently parseable JSON object: a second
 * parseable object anywhere outside the fence makes the transport
 * ambiguous (INV-S02-03, SOL-S02-002). The ambiguity check is purely
 * syntactic — it never inspects semantic worker meaning.
 *
 * Everything else fails with TransportParseError (TRANSPORT_MALFORMED):
 * malformed JSON, empty responses, multiple JSON objects (ambiguous),
 * multiple code fences, unclosed fences, fences tagged with a non-JSON
 * language, and a fenced object with another parseable JSON object in the
 * surrounding text.
 *
 * The parser NEVER invents missing semantic fields, NEVER rewrites types,
 * and NEVER repairs malformed content to satisfy the schema — normalization
 * is purely syntactic and is recorded on the parse result so the
 * controller can audit exactly what was accepted and how. A malformed
 * response is a recoverable evidence defect: callers keep the worktree and
 * the raw response intact (see src/handoff/preserve.mjs).
 *
 * Public-safety: error messages and details NEVER embed the raw model
 * text. The raw response is preserved byte-exact locally
 * (src/handoff/preserve.mjs) and referenced, never inlined.
 */

import { TransportParseError } from '../shared/errors.mjs';

/** Recorded syntactic normalization kinds. */
export const NORMALIZATION = Object.freeze(['none', 'fence', 'prose-wrapped']);

const FENCE_LINE = /^```[ \t\r]*([A-Za-z0-9_+-]*)[ \t\r]*$/;

/**
 * Parse a raw worker response.
 *
 * @param {string} raw - exact final model response text.
 * @returns {{value: unknown, normalization: 'none'|'fence'|'prose-wrapped',
 *            extraction: {method: string, ...offsets}}} parsed payload.
 * @throws {TransportParseError} when the text is not a string, is empty,
 *         is malformed JSON, or does not contain exactly one identifiable
 *         JSON object/fence.
 */
export function parseWorkerResponse(raw) {
  if (typeof raw !== 'string') {
    throw new TransportParseError(
      'worker response is not text; no transport payload to parse',
      { normalization: null, reason: 'not-a-string' },
    );
  }
  if (raw.trim() === '') {
    throw new TransportParseError(
      'worker response is empty; no transport payload to parse',
      { normalization: null, reason: 'empty' },
    );
  }

  const { unclosed, fences } = extractFences(raw);
  if (unclosed) {
    throw new TransportParseError(
      'worker response contains an unclosed code fence; the JSON payload is not identifiable',
      { normalization: null, reason: 'unclosed-fence' },
    );
  }
  if (fences.length > 1) {
    throw new TransportParseError(
      'worker response contains multiple code fences; the JSON payload is ambiguous',
      { normalization: null, reason: 'multiple-fences', fenceCount: fences.length },
    );
  }

  if (fences.length === 1) {
    const fence = fences[0];
    if (fence.tag !== '' && fence.tag.toLowerCase() !== 'json') {
      throw new TransportParseError(
        'worker response uses a non-JSON code fence; only a json fence (or an untagged fence) is accepted',
        { normalization: null, reason: 'non-json-fence', tag: fence.tag },
      );
    }
    const parsed = tryParseJson(fence.content);
    if (!parsed.ok) {
      throw new TransportParseError(
        'worker response fence content is not valid JSON',
        { normalization: 'fence', reason: 'fence-content-invalid' },
      );
    }
    // SOL-S02-002: the fenced object is uniquely identifiable only when
    // the surrounding prefix/suffix contain no other independently
    // parseable JSON object. A second parseable object anywhere outside
    // the fence makes the transport ambiguous; we never choose the fenced
    // object merely because it is fenced, and we never merge objects.
    const lines = raw.split('\n');
    const prefixText = lines.slice(0, fence.startLine).join('\n');
    const suffixText = lines.slice(fence.endLine + 1).join('\n');
    const outside =
      findJsonObjectCandidate(prefixText, 'prefix') ??
      findJsonObjectCandidate(suffixText, 'suffix');
    if (outside) {
      throw new TransportParseError(
        'worker response contains another JSON object outside the code fence; the payload is ambiguous',
        {
          normalization: null,
          reason: 'ambiguous-json-outside-fence',
          location: outside.location,
        },
      );
    }
    return {
      value: parsed.value,
      normalization: 'fence',
      extraction: {
        method: 'fence',
        startLine: fence.startLine,
        endLine: fence.endLine,
        content: fence.content,
      },
    };
  }

  // No fence: strict parse of the raw text first.
  const strict = tryParseJson(raw);
  if (strict.ok) {
    return { value: strict.value, normalization: 'none', extraction: { method: 'strict' } };
  }

  // One uniquely identifiable JSON object with harmless prefix/suffix prose.
  const unique = findUniqueJsonObject(raw);
  if (unique.ok) {
    return {
      value: unique.value,
      normalization: 'prose-wrapped',
      extraction: {
        method: 'prose-wrapped',
        start: unique.start,
        end: unique.end,
        content: unique.content,
      },
    };
  }

  throw new TransportParseError(
    'worker response is not valid JSON and no unique JSON object could be identified',
    { normalization: 'none', reason: unique.reason },
  );
}

/**
 * Extract fenced code blocks. Returns { unclosed, fences } where each fence
 * is { tag, content, startLine, endLine } (endLine = closing fence line).
 * A fence is opened by a line matching ```[tag] and closed by ```.
 */
function extractFences(text) {
  const lines = text.split('\n');
  const fences = [];
  let openLine = -1;
  let tag = '';
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(FENCE_LINE);
    if (!match) continue;
    if (openLine === -1) {
      openLine = i;
      tag = match[1];
    } else {
      fences.push({
        tag,
        content: lines.slice(openLine + 1, i).join('\n'),
        startLine: openLine,
        endLine: i,
      });
      openLine = -1;
      tag = '';
    }
  }
  return { unclosed: openLine !== -1, fences };
}

/**
 * Locate exactly one parseable JSON object in prose.
 *
 * Scans for maximal balanced-brace spans (string-aware: braces inside JSON
 * string literals are ignored). A span counts as a candidate when its text
 * parses as JSON; the response is accepted only when exactly one candidate
 * exists AND its value is a plain object (arrays/primitives in prose are
 * not an acceptable worker handoff). Zero candidates => malformed; two or
 * more => ambiguous (both remain invalid per the Sprint 02 contract).
 */
function findUniqueJsonObject(text) {
  const spans = findBalancedObjectSpans(text);
  const candidates = [];
  for (const [start, end] of spans) {
    const content = text.slice(start, end + 1);
    const parsed = tryParseJson(content);
    if (parsed.ok) {
      candidates.push({ start, end, content, value: parsed.value });
    }
  }
  if (candidates.length === 0) {
    return { ok: false, reason: 'no-json-object-found' };
  }
  if (candidates.length > 1) {
    return { ok: false, reason: 'ambiguous-multiple-json-objects', count: candidates.length };
  }
  const [only] = candidates;
  if (only.value === null || typeof only.value !== 'object' || Array.isArray(only.value)) {
    return { ok: false, reason: 'unique-json-value-is-not-an-object' };
  }
  return { ok: true, ...only };
}

/**
 * Find the first balanced-brace span in `text` that parses as JSON.
 * Returns null when the region contains no independently parseable JSON
 * object candidate. Purely syntactic (INV-S02-03): harmless prose brace
 * fragments that do not parse as JSON never match, so they cannot create
 * false ambiguity. The fence's own content is never part of `text`.
 */
function findJsonObjectCandidate(text, location) {
  for (const [start, end] of findBalancedObjectSpans(text)) {
    const content = text.slice(start, end + 1);
    if (tryParseJson(content).ok) {
      return { location, start, end };
    }
  }
  return null;
}

/** Find maximal balanced-brace spans, ignoring braces inside JSON strings. */
function findBalancedObjectSpans(text) {
  const spans = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === '}') {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          spans.push([start, i]);
          start = -1;
        }
      }
    }
  }
  return spans;
}

function tryParseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}
