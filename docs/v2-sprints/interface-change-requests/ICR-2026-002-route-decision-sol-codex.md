# ICR-2026-002 — route-decision schema: GPT-5.6 Sol codex SOL channel (new immutable schema version 2.1.0)

- **Date**: 2026-08-15 (updated 2026-08-16 after the controller-side
  transport repair; updated 2026-08-17 after the fifth Sol XHIGH review:
  the 2.1.0 SOL target is now EXACTLY `gpt-5.6-sol` / provider `pi` /
  XHIGH — the classic `sol-xhigh` target is valid ONLY on immutable
  2.0.0 records and has no 2.1 production authority; updated 2026-08-18
  after the sixth Sol XHIGH review: the real Pi auth store is READ-ONLY
  input authority — refresh write-back reconciliation was REMOVED and
  deferred to a future separately reviewed feature)
- **Originating sprint/branch**: LCIM V2.0.1 — `codex/v2.0.1-sol-xhigh-oauth`
- **Status**: pending (worker-reported; controller-owned disposition)

## Summary

V2.0.1 adds automatic GPT-5.6 Sol XHIGH review through Pi's
`openai-codex` provider (controller-side Pi transport — see
`docs/v2-codex-sol-oauth.md`). The route-decision record must be able to
name the exact dispatch target (`pi` / `gpt-5.6-sol`) and the exact
fail-closed reason for an unusable Pi OAuth store
(`CODEX_OAUTH_UNAVAILABLE`).

**Sol review finding (MEDIUM)**: the first V2.0.1 draft mutated the
`2.0.0` schema semantics in place (adding enum values to
`schemas/route-decision.v2.schema.json` and new conditional rules in
`src/routing/registry.mjs`) without a schema-version bump. This ICR now
specifies the corrected approach: the `2.0.0` schema file and semantics
are **untouched** (byte-identical to the 2.0.0 release), and the changes
live in a **new immutable schema version `2.1.0`**.

## Affected interface(s)

- `schemas/route-decision.v2.1.schema.json` — NEW immutable schema version
  `2.1.0` for the `lcim.route-decision` record family (added; the existing
  `schemas/route-decision.v2.schema.json` is NOT modified).
- `src/routing/registry.mjs` (`ROUTE_SCHEMA_MANIFEST`, `loadRouteSchema`,
  `validateRouteDecision`, `stampRouteDecision`, `ROUTE_SCHEMA_VERSION`)
  — version dispatch: every record is validated against the schema named
  by its OWN `schemaVersion`; conditional rules are version-aware.
- `src/routing/reasons.mjs` (`ROUTE_REASON_CODE`) — gains
  `CODEX_OAUTH_UNAVAILABLE` (2.1.0 vocabulary; the 2.0.0 schema's
  reasonCode enum is unchanged and the lockstep tests assert both).
- `src/providers/capabilities/metadata.mjs` / `discovery.mjs` (model
  registry and discovery surface, Sprint 05 owned) — `gpt-5.6-sol` model
  spec and `discoverSolCodexRoute` / `resolveSolChannel`.

## Exact change (2.1.0 only; 2.0.0 semantics unchanged)

1. NEW `schemas/route-decision.v2.1.schema.json`:
   - `schemaVersion` const `"2.1.0"`, `$id`
     `https://lcim.local/schemas/route-decision.v2.1.schema.json`;
   - `targetModel` enum gains `"gpt-5.6-sol"` (GPT-5.6 Sol, the V2.0.1
     automatic SOL channel through Pi's native `openai-codex` provider).
     Before: `["deepseek-v4-flash", "deepseek-pro-max", "sol-xhigh",
     "terra", "luna"]`. After: `["deepseek-v4-flash", "deepseek-pro-max",
     "sol-xhigh", "gpt-5.6-sol", "terra", "luna"]`.
   - `reasonCode` enum gains `"CODEX_OAUTH_UNAVAILABLE"` (FAIL_NO_SUBSTITUTE
     reason when Pi's openai-codex OAuth store is missing/unusable).
   - `targetProvider` enum is unchanged (`["pi", "sol", "sol-pro"]`);
     `targetRole`, `reasoningLevel`, and all other fields are unchanged.
2. `src/routing/registry.mjs` conditional rules, version-aware:
   - 2.1.0: SOL decisions may target either
     `{ provider: 'sol', model: 'sol-xhigh' }` (classic) or
     `{ provider: 'pi', model: 'gpt-5.6-sol' }` (codex).
   - 2.1.0: `FAIL_NO_SUBSTITUTE` reasonCode is constrained to
     `PROVIDER_UNAVAILABLE | CAPABILITY_GAP_NO_SUBSTITUTE |
     CODEX_OAUTH_UNAVAILABLE`.
   - 2.0.0 records keep the ORIGINAL rules: SOL decisions require
     `sol-xhigh` on provider `sol` only; FAIL_NO_SUBSTITUTE has no extra
     reasonCode restriction. A 2.0.0-stamped record containing codex
     fields is INVALID (the 2.0.0 semantics were never mutated).
   - `stampRouteDecision` stamps new records with `ROUTE_SCHEMA_VERSION =
     '2.1.0'`; unknown `schemaVersion` values fail closed.

## Rationale

V2.0.1 adds automatic GPT-5.6 Sol XHIGH review through Pi's existing
openai-codex OAuth authentication. The route-decision record must name the
exact dispatch target (`pi` / `gpt-5.6-sol`) and the exact fail-closed
reason for an unusable Pi OAuth store, so audits can prove which channel
was used and why. No alternative record type exists, and adding a second
schema family would break audit projection consumers. Sol review
(2026-08-16) required the schema-semantics change to be a proper immutable
version bump with compatibility tests rather than an in-place mutation of
`2.0.0` semantics — this ICR follows repository conventions (immutable
versioned schemas, version-keyed validation, compatibility tests).

## Affected sprints / consumers

- Sprint 05 routing (`policy.mjs`, `registry.mjs`) — owned by this change.
- Audit/reporting consumers of `lcim.route-decision` (Sprint 08): read
  `targetProvider`/`targetModel`/`reasonCode` generically; additive enum
  values and the new version are safe.
- Schema lockstep tests (`tests/routing/schema.test.mjs`) — updated with
  the 2.1.0 enums, the 2.0.0 immutability assertions, and the
  cross-version compatibility tests.

## Migration

None required for existing records. `2.0.0` route-decision records remain
valid and are validated against the immutable `2.0.0` schema (classic SOL
target unchanged; the classic channel remains the default when
configured). New records are stamped `2.1.0`. A `2.0.0` record can never
carry codex fields (validation fails), and a `2.1.0` record is only valid
under the `2.1.0` schema — relabeling is a version change, not a
backfill.

## Review status

Pending.
