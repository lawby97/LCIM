# schemas/common — Sprint 00 shared schemas

These are the frozen shared contracts of LCIM V2. Later sprints extend the
registry (see `src/shared/schema-registry.mjs`) with their own schemas, e.g.
`schemas/event.v2.schema.json` (Sprint 01) — they must NOT casually rewrite
these common contracts. A required cross-sprint change is filed under
`docs/v2-sprints/interface-change-requests/`.

## Schema family version

The whole `lcim.common.*` family is version `2.0.0` (constant
`SCHEMA_VERSION` in `src/shared/schema-registry.mjs`). Every record carries
`schemaName` + `schemaVersion`; `stampRecord()` fills and validates them.
`schemaVersion` is **failure-closed**: every registered common schema locks
it to exactly `"2.0.0"` via `const`, so a record claiming any other version
(e.g. `9.9.9`) fails validation against the 2.0.0 registry.

## Record notes

- `lcim.common.invocation` — `workerStatus` is **optional**; absence means
  "no valid worker status was received" (START/timeout/provider error/crash/
  orphan before any valid handoff). The controller must never synthesize a
  worker status merely because execution failed, timed out, crashed, or
  produced an invalid handoff. When present it is strictly constrained to
  `WORKER_STATUS`.
- `lcim.common.disposition` — if `disposition == 'REJECTED'`, `reasonCode`
  is required and must be a valid rejection-taxonomy code. This conditional
  semantic rule is enforced in the authoritative `validateCommonRecord()`
  path (`src/shared/schema-registry.mjs`); `reasonCode` stays optional for
  non-rejected/positive dispositions.

## Naming rules

- File: `common-<kind>.v2.schema.json`; schema name: `lcim.common.<kind>`.
- `$id` values are local-only identifiers (`https://lcim.local/...`) and are
  never dereferenced over the network.
- Each schema is self-contained: no `$ref`/`$defs` — the Sprint-00 validation
  engine (`src/shared/schema/validate.mjs`) supports a documented subset of
  JSON Schema and fails closed on anything else.
- `$comment` documents ownership and intent; enum values must match
  `src/shared/enums.mjs` (tests enforce this). The enums snapshot schema
  pins exact item values so schema-level drift fails closed.

## Registry

| schemaName | file | version |
|---|---|---|
| `lcim.common.envelope` | `common-envelope.v2.schema.json` | 2.0.0 |
| `lcim.common.enums` | `common-enums.v2.schema.json` | 2.0.0 |
| `lcim.common.run` | `common-run.v2.schema.json` | 2.0.0 |
| `lcim.common.invocation` | `common-invocation.v2.schema.json` | 2.0.0 |
| `lcim.common.work-unit` | `common-work-unit.v2.schema.json` | 2.0.0 |
| `lcim.common.disposition` | `common-disposition.v2.schema.json` | 2.0.0 |
| `lcim.common.review-finding` | `common-review-finding.v2.schema.json` | 2.0.0 |
| `lcim.common.rejection` | `common-rejection.v2.schema.json` | 2.0.0 |
| `lcim.common.error` | `common-error.v2.schema.json` | 2.0.0 |

The manifest in `src/shared/schema-registry.mjs` is authoritative; this table
is documentation. `tests/unit/schema-registry.test.mjs` verifies manifest,
files, `$id`s, required-field lists, and code/schema enum lockstep.
