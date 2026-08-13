/**
 * Sprint 08 chronological comparison helpers.
 *
 * Sprint-01 timestamp schemas explicitly permit ISO-8601 offsets as well
 * as Z. Lexical comparisons are therefore unsound: ordering is always by
 * the exact UTC instant.
 *
 * Instants are represented exactly as `{ seconds: bigint, fraction: string }`:
 * - `seconds` is the exact UTC whole-second count since the Unix epoch,
 *   computed structurally (proleptic Gregorian, timezone offset applied)
 *   with pure integer arithmetic — never Date.parse/Date milliseconds,
 *   floating point, or fixed sub-second precision;
 * - `fraction` is every authored fractional digit with trailing zeros
 *   removed, preserving arbitrary precision (`.1` == `.10` == `.100000`).
 *
 * Invalid/non-real timestamps fail closed with a message that does not
 * echo source text.
 */

import { AuditError } from './errors.mjs';

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year, month) {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

/**
 * Exact number of days from the Unix epoch (1970-01-01) to a
 * proleptic-Gregorian civil date: Howard Hinnant's days_from_civil,
 * pure integer arithmetic (every intermediate value is far below 2^53,
 * so Number arithmetic here is exact; the result is converted to BigInt
 * by the caller).
 */
function daysFromCivil(year, month, day) {
  const y = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(y / 400);
  const yoe = y - era * 400; // [0, 399]
  const mp = month + (month > 2 ? -3 : 9);
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1; // [0, 365]
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy; // [0, 146096]
  return era * 146097 + doe - 719468;
}

/**
 * Normalize fraction digits by stripping trailing zeros. The canonical
 * zero fraction is the empty string; every other fraction keeps its
 * leading zeros so values like `.0001` remain distinct from `.001`.
 */
function normalizeFraction(digits) {
  return digits.replace(/0+$/, '');
}

/** Compare normalized arbitrary-precision fractions exactly (equal length, lexical). */
function compareFraction(a, b) {
  const len = Math.max(a.length, b.length);
  const pa = a.padEnd(len, '0');
  const pb = b.padEnd(len, '0');
  if (pa < pb) return -1;
  if (pa > pb) return 1;
  return 0;
}

/**
 * Parse a schema-shaped ISO timestamp into an exact UTC instant
 * `{ seconds: bigint, fraction: string }`. Throws AuditError for any
 * non-real timestamp (fail closed).
 */
export function parseTimestamp(value) {
  if (typeof value !== 'string') throw new AuditError('canonical timestamp is unavailable or invalid');
  const match = ISO.exec(value);
  if (!match) throw new AuditError('canonical timestamp is unavailable or invalid');
  const [, yy, mo, dd, hh, mm, ss, frac, zone] = match;
  const year = Number(yy);
  const month = Number(mo);
  const day = Number(dd);
  const hour = Number(hh);
  const minute = Number(mm);
  const second = Number(ss);
  const zoneValid = zone === 'Z' || (Number(zone.slice(1, 3)) <= 23 && Number(zone.slice(4, 6)) <= 59);
  if (
    month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) ||
    hour > 23 || minute > 59 || second > 59 || !zoneValid
  ) {
    throw new AuditError('canonical timestamp is unavailable or invalid');
  }
  const offsetSeconds = zone === 'Z'
    ? 0
    : (Number(zone.slice(1, 3)) * 3600 + Number(zone.slice(4, 6)) * 60) * (zone[0] === '-' ? -1 : 1);
  const seconds = BigInt(daysFromCivil(year, month, day)) * 86400n
    + BigInt(hour) * 3600n
    + BigInt(minute) * 60n
    + BigInt(second)
    - BigInt(offsetSeconds);
  return { seconds, fraction: frac === undefined ? '' : normalizeFraction(frac) };
}

/**
 * Compare timestamps chronologically by exact UTC instant (whole seconds
 * first, normalized arbitrary-precision fraction second); IDs tie-break
 * only when the instants are genuinely equal.
 */
export function compareTimestampThenId(aTime, aId, bTime, bId) {
  const a = parseTimestamp(aTime);
  const b = parseTimestamp(bTime);
  if (a.seconds !== b.seconds) return a.seconds < b.seconds ? -1 : 1;
  const fraction = compareFraction(a.fraction, b.fraction);
  if (fraction !== 0) return fraction;
  return aId < bId ? -1 : aId > bId ? 1 : 0;
}

/** Compare START-derived invocation states chronologically. */
export function compareStartedStates(a, b) {
  return compareTimestampThenId(a.startedAt, a.invocationId, b.startedAt, b.invocationId);
}

/** Compare run records chronologically by createdAt, then runId. */
export function compareRunsByCreatedAt(a, b) {
  return compareTimestampThenId(a.run.createdAt, a.runId, b.run.createdAt, b.runId);
}
