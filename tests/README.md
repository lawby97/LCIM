# LCIM V2 test harness (Sprint 00)

- Runner: `node:test` via `npm test` (`node --test tests/`), Node >= 20,
  zero runtime dependencies.
- Layout:
  - `tests/smoke/` — version + CLI smoke tests (`npm run test:smoke`)
  - `tests/unit/` — ids, enums, errors, schema registry/validation,
    runtime-path (`npm run test:unit`)
  - `tests/logging/` — Sprint 01: lifecycle, crash/orphan reconciliation,
    duplicate fail-closed, integrity-chain tampering, run metadata,
    linked-worktree shared store, finalizer, raw sink, sprint schemas
  - `tests/guards/` — public-safety ignore guards and tracked-tree scan
    (`npm run test:guards`)
  - `tests/helpers/git-fixture.mjs` — tmp git repo / linked-worktree fixtures
  - `tests/helpers/logging-fixture.mjs` — Sprint 01 run-store fixtures
  - `tests/fixtures/records/` — valid/invalid shared-record fixtures;
    filenames `valid-<kind>.json` / `invalid-<kind>-<case>.json` map to
    schema names via `lcim.common.<kind>`
  - `tests/fixtures/logging/` — Sprint 01 event/invocation/run fixtures
    plus `scenario/` ledger-chain scenarios (validated digests)
- Rules: tests never write runtime state into the LCIM source tree; all git
  fixtures live under `os.tmpdir()`.
