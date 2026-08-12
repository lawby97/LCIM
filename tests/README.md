# LCIM V2 test harness (Sprint 00)

- Runner: `node:test` via `npm test` (`node --test tests/`), Node >= 20,
  zero runtime dependencies.
- Layout:
  - `tests/smoke/` — version + CLI smoke tests (`npm run test:smoke`)
  - `tests/unit/` — ids, enums, errors, schema registry/validation,
    runtime-path (`npm run test:unit`)
  - `tests/guards/` — public-safety ignore guards and tracked-tree scan
    (`npm run test:guards`)
  - `tests/helpers/git-fixture.mjs` — tmp git repo / linked-worktree fixtures
  - `tests/fixtures/records/` — valid/invalid shared-record fixtures;
    filenames `valid-<kind>.json` / `invalid-<kind>-<case>.json` map to
    schema names via `lcim.common.<kind>`
- Rules: tests never write runtime state into the LCIM source tree; all git
  fixtures live under `os.tmpdir()`.
