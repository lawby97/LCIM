# LCIM V2 Architecture (Sprint 00 baseline)

Status: Sprint 00 foundation; **Sprint 01 implemented** (canonical invocation
ledger, run lifecycle, local evidence storage — see
`docs/v2-logging-contract.md`). Substantive subsystems (worker parsing,
routing, SOL compilation, audit) are NOT implemented yet — only the
interfaces they need.

## 1. Design principles (locked)

1. Deterministic controller responsibilities are separated from model
   responsibilities and built behind stable interfaces before integration.
2. Workers report status; only the controller decides `PATCH_VALID`,
   `SEMANTICALLY_ACCEPTED`, `CANDIDATE_INTEGRATED`, `REVIEW_APPROVED`.
3. Transport validity and patch usefulness are separate states: a malformed
   handoff must never destroy an underlying useful isolated patch.
4. Objective Git/test/evidence facts are controller-owned.
5. Runtime state lives under the target repo's Git common directory — never
   in tracked source directories.
6. Every run records LCIM version/commit, target repo SHA, config digest, and
   schema version.

## 2. Layer map

| Layer | Owner sprint | Sprint-00 status |
|---|---|---|
| Shared IDs/enums/errors/interfaces + schema registry | 00 | Implemented (`src/shared/**`, `schemas/common/**`) |
| Config baseline: version + runtime-path helpers | 00 | Implemented (`src/config/**`) |
| CLI skeleton (`--version`/`--help`) | 00 (full CLI: 10) | Implemented (`bin/lcim.mjs`) |
| Canonical invocation ledger / run store | 01 | Implemented (`src/logging/**`, `src/runtime/run-store.mjs`; contract: `docs/v2-logging-contract.md`) |
| Worker contract, safe parsing, transport separation | 02 | Not implemented; worker vocabulary fixed |
| Git worktree/base/scope controller | 03 | Not implemented; runtime-path helper fixed |
| Semantic contract compiler / risk facts | 04 | Not implemented; rejection taxonomy fixed |
| Deterministic routing / escalation | 05 | Not implemented; no model required for route decisions |
| SOL ask compiler / decision contracts | 06 | Not implemented; review-finding record fixed |
| Text-only ChatGPT SOL Pro transport | 07 | Not implemented |
| Audit projections, REVIEW.md, review-export | 08 | Not implemented; finding/rejection records fixed |
| V1 compatibility reader / migration | 09 | Not implemented |
| CLI/project adapter integration | 10 | Not implemented |
| Fault injection, E2E, self-hosting trial | 11 | Not implemented |

## 3. Shared contracts (Sprint 00)

### 3.1 Schema registry and versioning

- Manifest: `src/shared/schema-registry.mjs` (`SCHEMA_MANIFEST`,
  `SCHEMA_VERSION = "2.0.0"`).
- Files: `schemas/common/common-<kind>.v2.schema.json` (see
  `schemas/common/README.md` for the registry table).
- Every shared record carries `schemaName` + `schemaVersion`; `stampRecord()`
  fills and validates them and freezes the record. Callers cannot mislabel a
  record.
- **Schema version is failure-closed**: every registered common schema locks
  `schemaVersion` to exactly `"2.0.0"` via `const` (enforced by
  `tests/unit/schema-registry.test.mjs`). A record claiming any other
  version — e.g. `9.9.9` — cannot validate against the 2.0.0 registry.
- Validation engine: `src/shared/schema/validate.mjs` — a dependency-free
  subset of JSON Schema (type/required/properties/additionalProperties/items/
  enum/const/pattern/minLength/maxLength/minItems/maxItems). Anything outside
  the subset (including `$ref`, `oneOf`, `format`, `minimum`/`maximum`)
  **fails closed** with `SchemaEngineError` rather than silently validating
  differently.
- The engine also validates the **schema definition itself** before any
  instance is validated: every supported keyword rejects value forms outside
  the supported subset with `SchemaEngineError` (e.g. non-boolean
  `additionalProperties`, boolean/null/primitive `items`, malformed
  `type`/`required`/`enum`/`pattern`/bounds, non-string metadata). Nothing is
  silently coerced or skipped; sub-schemas in `properties`/`items` are
  checked recursively.
- A later sprint may replace the engine behind the same `validateAgainstSchema`
  signature via an interface-change request.

### 3.2 State separation (worker status vs controller disposition)

`src/shared/enums.mjs`:

- `WORKER_STATUS` = `WORK_COMPLETE | BLOCKED | FAILED | NO_CHANGE` — the only
  vocabulary a worker may report. `PATCH_READY` is forbidden; no controller
  disposition appears here.
- `CONTROLLER_DISPOSITION` = `PATCH_VALID | SEMANTICALLY_ACCEPTED |
  CANDIDATE_INTEGRATED | REVIEW_APPROVED | REJECTED | REVIEW_REQUIRED` —
  controller-decided only. `CONTROLLER_ONLY_DISPOSITIONS` lists the four
  disposition states only the controller may decide.
- `RUN_STATUS` = `OPEN | COMPLETED | INCOMPLETE_LEDGER | ABORTED`
- `INVOCATION_EVENT_KIND` = `START | COMPLETION | ASSESSMENT | RECONCILIATION`
  (Sprint 01 lifecycle: exactly one START, one COMPLETION, one ASSESSMENT per
  invocation; reconciliation/supersession events never mutate history).
- `WORK_UNIT_STATUS` = `CREATED | IN_PROGRESS | BLOCKED | COMPLETED | FAILED`
- `REVIEW_FINDING_SEVERITY` = `INFO | WARNING | CRITICAL`
- `REJECTION_CODE` — controller-owned rejection taxonomy (see
  `docs/v1-characterization.md` for the V1-class mapping).

### 3.3 IDs

`src/shared/ids.mjs`: `lcim_run_<32hex>`, `lcim_inv_<32hex>`,
`lcim_wu_<32hex>`, `lcim_finding_<32hex>`. `generateId()` /
`isValidId()`; the same string patterns are inlined in the record schemas
(no `$ref` in the Sprint-00 subset).

### 3.4 Errors

`src/shared/errors.mjs` — `LcimError` base plus `ConfigError`,
`SchemaValidationError`, `SchemaEngineError`, `TransportParseError` (reserved
for Sprint 02), `PublicSafetyError`, `RuntimePathError`. Wire/persisted shape:
`lcim.common.error` schema; `toErrorRecord()` stamps and validates it.

### 3.5 Records

Run header (`lcim.common.run`), invocation header (`lcim.common.invocation`),
work unit (`lcim.common.work-unit`), controller disposition
(`lcim.common.disposition`), review finding (`lcim.common.review-finding`),
rejection (`lcim.common.rejection`), error (`lcim.common.error`), enum
registry snapshot (`lcim.common.enums`), envelope (`lcim.common.envelope`).
Field lists: `src/shared/interfaces.mjs` (`REQUIRED_FIELDS` must equal each
schema's `required` array — enforced by tests).

- `lcim.common.invocation` — `workerStatus` is **optional**. Absence means
  "no valid worker status was received" (e.g. START/timeout/provider
  error/crash/orphan before any valid handoff). The controller must **never
  synthesize** a worker status merely because execution failed, timed out,
  crashed, or produced an invalid handoff; when present, `workerStatus` is
  strictly constrained to `WORKER_STATUS`.
- `lcim.common.disposition` — conditional semantic rule, enforced in the
  authoritative `validateCommonRecord()` path
  (`src/shared/schema-registry.mjs`): if `disposition == 'REJECTED'`,
  `reasonCode` **must** exist and be a valid rejection-taxonomy code (the
  taxonomy enum is enforced by the schema's `reasonCode` enum). For all
  non-rejected/positive dispositions `reasonCode` remains optional.

## 4. Runtime boundary

- `src/config/runtime-path.mjs` resolves the Git common directory with
  `git rev-parse --git-common-dir` (handles relative output and linked
  worktrees; throws `RuntimePathError` outside a work tree).
- Canonical runtime root: `<git-common-dir>/lcim` — by construction inside
  `.git`, never tracked.
- Run store (Sprint 01): `<git-common-dir>/lcim/runs/<run_id>/` with
  `run.json` (lcim.run), the append-only integrity-chained ledger
  `events.v2.jsonl` (lcim.event), compact invocation projections
  `invocations/<invId>.json` (lcim.invocation), and the optional compressed
  raw sink `raw/raw.jsonl.gz`. See `docs/v2-logging-contract.md`.
- Linked worktrees share one Git-common run store.
- `assertNoTrackedFilesUnder()` fails closed if any tracked file appears
  under a runtime path.

## 5. Versioning

- `VERSION` file: `2.0.0-dev.0` (pre-release).
- `package.json` version matches `VERSION`.
- `src/config/version.mjs`: `readVersion()`, `readGitCommit()` (LCIM repo
  HEAD; null when unavailable), `getVersionInfo()` (version + commit +
  `SCHEMA_VERSION`).
- LCIM git-commit discovery is anchored to the LCIM package/source root
  (the directory containing `VERSION`/`package.json`, derived from the
  module's own location) — it never uses the caller's/current working
  directory, so invoking LCIM from inside another Git repository cannot
  report the target repo's HEAD as the LCIM commit. LCIM identity and the
  target repository base identity (`targetBaseSha`, recorded in the run
  record) remain separate facts.
- `lcim --version` prints `LCIM 2.0.0-dev.0 (git <short-sha>)` from the local
  skeleton.

## 6. Test harness

`node:test` (Node >= 20), zero runtime dependencies, `npm test` runs
`node --test tests/`:

- `tests/smoke/` — version + CLI smoke tests
- `tests/unit/` — ids, enums, errors, schema registry/validation, runtime-path
- `tests/guards/` — .gitignore behavior + tracked-tree public-safety scan
- `tests/helpers/git-fixture.mjs` — temp git repo / linked-worktree fixtures
- `tests/fixtures/records/` — valid/invalid shared-record fixtures

All git fixtures live in `os.tmpdir()`; tests never write runtime state into
the LCIM source tree.

## 7. Interface change discipline

Shared Sprint-00 contracts are stable. A later sprint that discovers a
required cross-sprint change must file it under
`docs/v2-sprints/interface-change-requests/` (see that README), keep
cross-file edits minimal, and list them in its sprint report.
