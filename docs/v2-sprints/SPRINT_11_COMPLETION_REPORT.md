# Sprint 11 completion and release-readiness report

**Branch:** `lcim-v2/s11-e2e-release`
**Required base preserved:** `f369cfa2991fe39c8100c040dda3eae94a76fbb6`
**Release candidate:** `2.0.0-rc.1`
**Status:** READY FOR HUMAN REVIEW; not published

## Files changed

### Sprint 11 implementation and tests

- `tests/fault-injection/helpers.mjs`
- `tests/fault-injection/matrix.test.mjs`
- `tests/e2e/release-workflow.test.mjs`
- `tests/e2e/package-smoke.test.mjs`
- `tests/e2e/two-target-isolation.test.mjs`
- `tests/e2e/release-boundaries.test.mjs`
- `tests/e2e/public-safety.test.mjs`
- `tests/self-host/controlled-trial.mjs`

### Demonstrated production repairs

- `src/controller/orchestrator.mjs` — an evidence collector error, including
  `SCOPE_VIOLATION`, now fails closed and cannot produce `PATCH_VALID`.
- `src/controller/validation-runner.mjs` — inline `node -e`, `--eval`, `-p`,
  and `--print` arguments remain literal instead of being rewritten as paths.

### Release/docs/version surfaces

- `VERSION`, `package.json`, and `package-lock.json` -> `2.0.0-rc.1`.
- `README.md`, `docs/v2-architecture.md`, `docs/v2-migration.md`.
- `docs/v2-final-architecture.md`, `docs/v2-model-routing.md`,
  `docs/v2-logging-and-audit.md`, `docs/v2-sol-contract.md`,
  `docs/v2-sol-pro-text-boundary.md`, and `docs/v2-security-boundaries.md`.
- `tests/smoke/cli.test.mjs`, `tests/smoke/version.test.mjs`,
  `tests/unit/version-git.test.mjs`, audit version assertions, and synthetic
  record fixtures were updated for the release candidate.

No shared reviewed interface under `src/shared/**` or `schemas/common/**` was
changed.

## Exact verification

All commands were run from the repository root after the final version update
unless noted otherwise.

| Command | Result |
|---|---:|
| `npm test` | **996 passed, 0 failed** |
| `node --test tests/fault-injection/matrix.test.mjs` | **16 passed, 0 failed** |
| `node --test tests/e2e/release-workflow.test.mjs` | **3 passed, 0 failed** |
| `node --test tests/e2e/package-smoke.test.mjs` | **1 passed, 0 failed** |
| `node --test tests/e2e/two-target-isolation.test.mjs` | **1 passed, 0 failed** |
| `node --test tests/e2e/release-boundaries.test.mjs` | **4 passed, 0 failed** |
| `node --test tests/e2e/public-safety.test.mjs` | **2 passed, 0 failed** |
| all fault/E2E files together | **27 passed, 0 failed** |
| `npm pack --dry-run --json` | `lcim-2.0.0-rc.1.tgz`, 438 files, no archive written |
| `git diff --check` | **PASS** |
| final branch/HEAD check | branch `lcim-v2/s11-e2e-release`; HEAD remains the required base SHA |

The public-safety tests found no forbidden tracked artifact names, runtime files,
or credential-shaped values. The runtime-path assertion confirms runtime state
is below the Git common directory and outside tracked source.

## Controlled self-host evidence

The trial was run only after the prerequisite suites and used an isolated
LCIM target worktree at the exact required base. The low-risk candidate was a
single documentation file, `docs/self-host-candidate-note.md`.

The first trial stopped closed with `SCOPE_VIOLATION`: validation had rewritten
the inline Node expression as a filesystem path. This was a concrete defect,
so the trial was not accepted as evidence. It was repaired through the normal
development workflow, the regression/fault/E2E suites were rerun, and the
trial was repeated successfully. The final controlled result was:

```text
work units: 1
invocations: 1
START/COMPLETION/ASSESSMENT: complete
validation: PASS
disposition: SEMANTICALLY_ACCEPTED
lifecycle: COMPLETED
candidate: REVIEWABLE_CANDIDATE
publication: REVIEWABLE_ONLY
autoPublished: false
patch evidence: immutable and hash verified
parent checkout: unchanged
audit reconciliation: PASS
```

Audit and review export preserved the frozen candidate. The candidate was not
committed, pushed, merged, published, or left in the target checkout. Prior
failed local trial evidence remains append-only under the Git common-directory
runtime store and is not tracked or included in this repository.

## Acceptance criteria

- Fault injection for crashes, timeouts, malformed/schema output, bad scope or
  base, secret payloads, semantic repair, ledger failure, lifecycle recovery,
  SOL survival/STUCK, and immutable validation: **PASS**.
- Complete START/COMPLETION/ASSESSMENT or explicit reconciliation: **PASS**.
- CLI workflow, linked worktree, audit/review export, package install, two-target
  isolation, boundary denial, Pro redaction/12,000-character limit, and V1
  immutability: **PASS**.
- Public-safe repository and secret scans: **PASS**.
- Controlled self-host trial with no automatic publication: **PASS**.
- Version is exactly `2.0.0-rc.1`: **PASS**.
- Unresolved P0/P1 issues: **NONE**.

## Interface changes and safety confirmation

- Interface-change request: **NONE**; no shared reviewed contract required a
  change.
- No credentials, secrets, raw model transcripts, review packets, Pro payloads,
  target-repository evidence, or runtime artifacts were committed.
- No commit, push, merge, PR, tag, release publication, or npm publication was
  performed.
- Human review and any later publication decision remain outside LCIM.
