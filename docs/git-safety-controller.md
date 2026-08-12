# LCIM V2 Git Safety Controller (Sprint 03)

Status: implemented in Sprint 03 (Wave 1, parallel-safe). This document is the
contract/behavior reference for the Sprint 03 owned modules:

- `src/git/**` — worktree lifecycle, git facts, snapshots, registry, pipeline
- `src/validation/git/**` — base-SHA checkpoints, write-scope rule, worker safety
- `src/evidence/patch/**` — controller-owned patch evidence + persistence
- `schemas/patch-evidence.v2.schema.json` — the patch-evidence record schema
- `tests/git/**` — focused tests and fixtures

Sprint 03 makes patch identity, worktree isolation, serial bases, allowed
write paths, and objective diff evidence **deterministic controller
responsibilities**. It implements no model output parsing, no routing/SOL
logic, no semantic contract compiler, and no automatic commit/integration.

## 1. Work-unit contract (shared, Sprint 00)

The shared `lcim.common.work-unit` record already carries the Sprint 03
fields; this sprint implements their enforcement:

| Field | Meaning (enforced here) |
|---|---|
| `expectedBaseSha` | 40-hex base the worker worktree MUST sit on at all four checkpoints |
| `allowedWritePaths` | write-scope allow-list: `observed_changed_paths ⊆ allowed_write_paths` |
| `mustChangePaths` | optional; every listed path must appear among the observed changed paths (checked separately from the scope rule) |

## 2. Isolated detached worker worktree

`createIsolatedWorktree()` (`src/git/worktree.mjs`) spawns the worker
worktree with `git worktree add --detach <root>/<name> <expectedBaseSha>`:

- **Detached**: no branch is checked out, so the worker cannot move a branch
  through ordinary commits.
- **Outside the parent**: the target must live under a disposable worktree
  root and never inside the parent work tree (`rev-parse --show-toplevel`
  guard). All path comparisons use a single canonical (realpath) prefix, so
  `/var` vs `/private/var` cannot bypass the check.
- **Rooted at the base**: the created worktree HEAD is verified to equal
  `expectedBaseSha` after creation.
- **Registered**: every creation is appended to the LCIM worktree registry
  (`<git-common-dir>/lcim/worktrees/registry.jsonl`, append-only events
  `CREATED`/`REMOVED`). Cleanup only ever removes worktrees keyed by a
  controller-retained `worktreeId` with an open registry lifecycle — never
  by path alone (section 7b).
- **Controller-created ownership marker (SOL-S03-FINAL-001)**: at creation,
  `createIsolatedWorktree()` writes a controller-generated ownership marker
  (`lcim-ownership.json`, random `markerId` `lcim_mk_<32hex>`, binding
  schema/version, worktreeId, workUnitId, canonical worktree path, and
  expected/base SHA) into THE LINKED WORKTREE'S OWN per-worktree Git admin
  directory — resolved through `git rev-parse --absolute-git-dir` and
  verified via the admin dir's own git-written `commondir`/`gitdir` files
  (exactly this worktree's identity; never the common Git directory, never
  a sibling worktree's gitdir, never the checked-out tree, never a tracked
  file, never a caller-supplied path). The registry `CREATED` event
  references the marker identity, but registry data alone can never
  synthesize the marker inside a foreign worktree's gitdir.
- **Unique physical paths**: the default worktree directory name derives
  from the fresh controller-owned `worktreeId` (`lcim-wt-<32hex>`), so
  identities never intentionally reuse paths.

## 3. Base-SHA checkpoints

`validateBaseAtCheckpoint()` (`src/validation/git/base.mjs`) enforces the
base at the four required checkpoints. Every violation throws
`BaseMismatchError` with objective details (observed SHAs, ahead/behind
counts); unverifiable states fail closed.

| Checkpoint | Rule |
|---|---|
| `PRE_SPAWN` | `expectedBaseSha` must be a commit in the repository (canonical 40-hex). When `serialBaseSha` is supplied, `expectedBaseSha` must equal it. |
| `POST_EXIT` | worker worktree HEAD must still equal `expectedBaseSha` (no commits/resets/merges) |
| `PRE_EXTRACT` | same rule, immediately before evidence collection (defense in depth: the collector re-verifies) |
| `PRE_INTEGRATION` | BOTH the integration target (parent) HEAD and the worker worktree HEAD must equal `expectedBaseSha` |

**Serial candidate bases**: `nextSerialBase(acceptedUnit)` — the accepted
head of unit N is the *only* allowed base for dependent unit N+1. Passing
the stale (predecessor's) base to `PRE_SPAWN` with the accepted head as
`serialBaseSha` fails with a serial-base violation.

## 4. Write-scope rule

`src/validation/git/scope.mjs`:

- `checkWriteScope({ changedPaths, allowedWritePaths })` —
  `observed ⊆ allowed`; throws `ScopeViolationError` listing every
  out-of-scope path.
- `checkMustChange({ changedPaths, mustChangePaths })` — optional, separate;
  throws listing every unchanged required path.
- `validateScope(...)` — both rules, write scope first.
- `normalizeScopePath(p)` — fail-closed normalization: relative posix paths
  only; absolute paths, `..` escapes, empty/`.` paths, and backslashes are
  rejected (`PathSafetyError`). Trailing slashes are stripped (`src/` ==
  `src`). The rule is **exact set inclusion** after normalization: allowing
  `src/` does NOT allow `src/a.mjs`; a controller wanting directory scope
  must list every path.

**`allowedWritePaths` is REQUIRED (SOL-S03-003 repair).** The pipeline's
`collectAndPersistEvidence()` fails closed — `ScopeViolationError` — when it
is omitted, `null`, or not an array: a changed patch can never be handed off
without an allow-list decision. The objective patch evidence is still
persisted BEFORE the rejection, so every scope failure (including
missing/malformed allow-lists) carries its persisted evidence identity.
`must_change_paths` remains a separate optional requirement.

## 5. Controller-owned patch evidence

`collectPatchEvidence()` (`src/evidence/patch/collector.mjs`) computes every
objective fact from git:

- `changedPaths` — sorted unique paths from
  `git diff --name-status -z --no-renames <base>` plus untracked files.
  Untracked files are registered with `git add -N` (intent-to-add) in the
  disposable worktree index so the canonical patch covers ALL changed paths.
- `additions` / `deletions` — git name-status mapping (A/C/R add, D/R-old delete).
- `patchText` — canonical artifact:
  `git -c core.quotepath=false diff --no-ext-diff --no-textconv --full-index
  --binary --no-renames <base>` (byte-exact; binary diffs round-trip through
  `git apply`).
- `patchHash` — sha256 hex over the canonical patch bytes.
- `patchId` — `lcim_patch_` + first 32 hex chars of `patchHash` (patch
  artifact identity is derived from the hash; the schema/stamper enforces
  this).
- `evidenceId` — fresh `lcim_ev_<32hex>` per observation (CONTEXTUAL
  identity, independent of patch content).
- `worktreeId` — the controller-retained disposable worktree identity the
  observation was collected from (required input to the collector).
- `diffCheck` — `git diff --check <base>` exit status + diagnostics
  (`clean: false` is evidence of a whitespace-error patch, never silently
  accepted — and never a reason to skip recording).
- `baseSha`, `worktreeHead` — both verified to equal `expectedBaseSha`
  (PRE_EXTRACT) at collection time.

Determinism switches: `--no-renames`, `--no-ext-diff`, `--no-textconv`,
`core.quotepath=false`; no external diff drivers, no config-dependent rename
heuristics.

### Schema and persistence

- `schemas/patch-evidence.v2.schema.json` (sprint-owned; validated by
  `src/evidence/patch/schema.mjs` through the shared Sprint-00 engine;
  NOT registered in the shared `schemas/common` manifest).
- `stampPatchEvidence()` enforces the patchId↔patchHash identity rule and
  validates; `validatePatchEvidence()` for read paths.
- `persistPatchEvidence()` writes under
  `<git-common-dir>/lcim/evidence/patch/`, guarded by
  `assertNoTrackedFilesUnder()` (runtime state never lives in tracked
  space).

**Identity separation (SOL-S03-002 repair).** Three identities are kept
apart and are never conflated:

| Identity | Value | Meaning |
|---|---|---|
| CONTENT | `patchId`/`patchHash` | sha256 over the canonical controller-collected patch bytes; identical bytes share ONE immutable artifact `<patchId>.patch` |
| OBSERVATION | `evidenceId` (`lcim_ev_<32hex>`) | unique per contextual controller observation; every observation gets its own immutable record `<evidenceId>.json` |
| WORKTREE | `worktreeId` (`lcim_wt_<32hex>`) | the disposable worktree the observation was collected from; recorded inside the record |

Two work units with identical patch bytes therefore receive distinct,
immutable record references. Publication is exclusive (`wx`): an existing
record path fails closed (never truncated/overwritten), and a content
artifact is reused only after its existing bytes verify to the same
`patchHash` (mismatch fails closed). The supplied patch bytes must hash to
`record.patchHash` before anything is written. `loadPatchEvidence()` and
`resolveEvidenceRef()` (used by the dirty-cleanup gate, section 7) validate
records against the schema and re-verify artifact hashes on every read.
Records are bound to `worktreeId`/`workUnitId`/`baseSha` at collection time
(`collectPatchEvidence()` requires the controller-retained `worktreeId`).

### Sprint 04 hook interface

`attachValidationResults()` (`src/evidence/patch/hooks.mjs`) attaches
bounded, public-safe hook records to the evidence record's
`validationResults` array:

```json
{ "kind": "test" | "secret-scan",
  "outcome": "PASS" | "FAIL" | "NOT_RUN",
  "summary": "bounded summary",
  "evidenceRef": "optional ref" }
```

`NOT_RUN` is first-class — never synthesize PASS/FAIL for a hook that did
not run. The semantic contract compiler itself is Sprint 04's responsibility.

## 6. Worker-safety detection surface

`checkWorkerSafety()` (`src/validation/git/safety.mjs`) compares
pre-spawn snapshots (captured AFTER worktree creation, BEFORE the worker)
with post-exit state. First violation throws `WorktreeSafetyError`:

1. **HEAD moved** — worktree HEAD != base (also the POST_EXIT checkpoint).
2. **Refs changed** — `git for-each-ref` snapshot diff (branches/tags/remote
   tracking refs). A push to a configured remote also creates a local
   remote-tracking ref, so pushes are caught here.
3. **Forbidden reflog ops** — new HEAD reflog entries naming
   commit/merge/rebase/pull/cherry-pick/reset/clean/push/fetch/am/revert.
   A worker commit followed by `git reset --hard <base>` is still detected
   (the reflog never forgets).
4. **Config changed** — `git config --local --list` snapshot diff (e.g. a
   remote added in preparation for a push).
5. **Remote refs (SOL-S03-004 repair)** — per-remote PUSH-RELEVANT URL
   accounting: the fetch URL (`remote.<name>.url`) AND every pushurl
   (`remote.<name>.pushurl`) are snapshot SEPARATELY, each with the FULL
   advertised-ref set (`git ls-remote <url>`, every namespace — not just
   `--heads --tags`). A push to a custom namespace
   (`refs/lcim-safety-test/custom`) changes the advertised refs and is
   detected. Any push-relevant URL that is unreachable is recorded
   UNVERIFIABLE, and **an unverifiable remote fails the candidate closed**
   (with or without a push attempt): an unverifiable remote is never proof
   that no push occurred while push capability exists.
6. **Parent preserved (SOL-S03-003 repair)** — parent HEAD sha, porcelain
   status, AND cryptographic content digests: sha256 digests of the
   worktree-layer bytes of dirty tracked files, index (staged) blob
   digests, and untracked user file digests + modes. A byte change that
   leaves the porcelain shape identical (" M foo.txt" with different
   bytes) is still detected and fails closed. Only digests + path/type
   metadata are stored — never raw user contents.

**LIMITATION — detection is NOT prevention (BLOCKED findings).** Sprint 03
has NO controller-owned worker execution boundary: there is no mechanism in
this sprint that BLOCKS a worker process from opening other filesystem paths
or from successfully pushing when credentials/network exist. The
`git push origin HEAD:refs/lcim-safety-test/custom` attempt with an
unreachable fetch URL and a reachable push URL SUCCEEDS at the git level;
Sprint 03 only guarantees the candidate then deterministically fails safety
and cannot proceed. Genuine write/push confinement requires the worker
execution boundary requested in:

- `docs/v2-sprints/interface-change-requests/ICR-2026-001-worker-execution-confinement.md`
  (filesystem write confinement, INV-S03-05), and
- `docs/v2-sprints/interface-change-requests/ICR-2026-002-worker-push-confinement.md`
  (push/network/credential confinement, INV-S03-06), consumed by Sprint 10.

Until that boundary exists, LCIM V2 must not claim INV-S03-05/06 are
fully enforceable (SOL_S03_REPAIR: BLOCKED for those two findings).

## 7. Cleanup guarantees

`removeIsolatedWorktree()`:

- requires the **controller-retained `worktreeId`** — cleanup is
  IDENTITY-bound, never path-based (SOL-S03-006 repair); a path alone is
  never accepted;
- resolves the id against the strictly validated registry: the id must have
  an open (CREATED, not yet REMOVED) lifecycle, and any supplied path must
  equal the canonical registered path for that id;
- refuses the main/parent worktree;
- refuses when ANY other active registry record claims the same path
  (stale ownership never removes a replacement);
- requires the current Git linked-worktree administrative identity to match
  (registered with git, HEAD == registered base);
- requires the genuine controller-created ownership marker (SOL-S03-FINAL-001):
  the marker must exist inside the exact per-worktree Git admin directory
  (resolved through git, cross-verified via its `commondir`/`gitdir` files),
  be structurally exact, and bind to EVERY registered identity — marker
  identity, worktreeId, workUnitId, base SHA, and canonical path. The
  registry lifecycle and the independent marker must AGREE before any
  `git worktree remove --force` may run; a forged registry event (even a
  clean, detached, same-base foreign worktree with plausible metadata) is
  refused, the foreign worktree stays untouched, and no REMOVED event is
  appended;
- requires VERIFIED PERSISTED EVIDENCE when the worktree is dirty
  (SOL-S03-005 repair): every evidence ref must resolve under the
  canonical Git-common LCIM evidence store, the contextual record must
  validate and self-identify, the referenced patch artifact must exist
  with a matching hash, and the evidence must bind to the EXACT
  worktreeId, workUnitId, and baseSha of the registry record. Arbitrary
  strings, nonexistent/foreign paths, another work unit's evidence, wrong
  base, and hash mismatches all fail closed;
- a worktree whose directory is already gone (SOL-S03-R3-001) is cleaned
  up ONLY after genuine LCIM ownership is proven: the exact per-worktree
  Git admin directory is derived from REPOSITORY-OWNED Git metadata
  (`git worktree list --porcelain` registration plus enumeration of
  `<common>/worktrees/*`, cross-checked through git-written
  `commondir`/`gitdir`/`HEAD` files — never a registry/worker/caller-
  supplied path), the registration HEAD must equal the registered base,
  and the controller-created ownership marker must exist inside that exact
  derived admin directory and bind to every registered identity. Only then
  is the stale registration removed — scoped to the exact verified
  registration (`git worktree remove --force <verified path>`, never a
  global `git worktree prune` that could touch sibling registrations) —
  and REMOVED appended. If ownership cannot be proven (no registration, no
  admin directory, missing/malformed/mismatched marker), cleanup FAILS
  CLOSED: no prune, no removal, no REMOVED, registry bytes untouched — a
  forged registry event plus a vanished checkout directory can never
  authorize destructive cleanup of a foreign registration. A missing
  directory cannot contain user work, but it also cannot manufacture LCIM
  ownership; an unverifiable stale lifecycle stays quarantined for
  manual/recovery intervention;
- never destroys uncommitted *user* work: user worktrees are never in the
  registry, the parent worktree is never touched, and no destructive command
  is ever run against the parent.

## 7b. Registry discipline (SOL-S03-006 / SOL-S03-007 repairs)

`src/git/worktree-registry.mjs`:

- **Strict event validation**: every JSONL line must carry valid
  `worktreeId`/`workUnitId`/absolute `worktreePath`/40-hex `baseSha`/known
  `event`/ISO `at` and only the known optional fields; unknown fields,
  bad shapes, and malformed lines fail closed (never skipped).
- **Transition validation**: per id, exactly `CREATED` then at most one
  `REMOVED`; a second CREATED, an event after REMOVED, or REMOVED without
  CREATED is an impossible transition and fails closed. Ids are never
  reused.
- **Pre-append tentative-sequence validation (SOL-S03-FINAL-002)**:
  `recordWorktreeEvent()` validates the COMPLETE tentative lifecycle
  (strictly validated existing events + the proposed event) under the
  registry lock BEFORE any byte is written. Duplicate CREATED, REMOVED for
  an unknown id, duplicate REMOVED, CREATED after REMOVED, malformed
  events, and invalid field shapes all throw with the registry bytes
  EXACTLY unchanged (fail before write — never append-then-rollback, never
  truncate/rewrite, never silently ignore). A corrupt transition can
  therefore never be persisted, not even transiently.
- **Optional `markerId` field**: CREATED events reference the
  controller-created ownership marker identity (validated `lcim_mk_<32hex>`
  when present); the registry is a reference to the marker, never a
  substitute for it.
- **One active record per path**: CREATED at a path with an open lifecycle
  fails closed, so stale ownership can never authorize removal of a
  replacement worktree.
- **Unique physical paths**: the default worktree name derives from the
  fresh controller-owned `worktreeId` (`lcim-wt-<32hex>`), so identities
  never intentionally reuse paths.
- **Registry lock**: all registry mutations and read-check-append cycles
  are serialized through `<git-common-dir>/lcim/worktrees/.registry.lock`
  (exclusive-create with stale-lock breaking, bounded retries) — concurrent
  controller processes never interleave or corrupt lines, without globally
  serializing unrelated worker execution.

## 8. Pipeline

`src/git/pipeline.mjs` composes the lifecycle for one work unit:

```
prepareWorkerWorktree()       PRE_SPAWN + creation + snapshots
inspectWorkerExit()           POST_EXIT + worker-safety checks
collectAndPersistEvidence()   PRE_EXTRACT + collection + persistence +
                              REQUIRED allow-list scope rule (evidence
                              persisted BEFORE any scope rejection)
validateIntegrationHandoff()  PRE_INTEGRATION
cleanupWorkerWorktree()       identity-bound registry-verified removal
                              (worktreeId required; dirty cleanup needs
                              verified matching persisted evidence)
```

The pipeline decides NO dispositions, routes nothing, parses no model
output, and never commits/integrates a patch (those are Sprint 10
controller responsibilities). Scope violations surface as
`ScopeViolationError` (mapped by the controller to rejection
`SCOPE_VIOLATION`; base mismatches map to `WRONG_BASE`).

## 9. Non-goals respected

Sprint 03 does not: test-exactness or secret scanning (only the hook
interface), semantic contract compilation (Sprint 04), routing/SOL (Sprints
05/06), integration/commit of accepted patches (Sprint 10), or model output
parsing (Sprint 02). No shared Sprint-00 interface was changed; the
patch-evidence schema is sprint-local.

## 10. Required-test mapping

| Required test | Where |
|---|---|
| Valid subset-of-allowed paths succeeds | `tests/git/scope.test.mjs`, `tests/git/pipeline.test.mjs`, `tests/git/repair-scope.test.mjs` |
| Any path outside allowed set fails closed | `tests/git/scope.test.mjs`, `tests/git/pipeline.test.mjs`, `tests/git/repair-scope.test.mjs` |
| Missing required must_change_path fails | `tests/git/scope.test.mjs`, `tests/git/pipeline.test.mjs` |
| Wrong/stale base fails at every checkpoint | `tests/git/base-checkpoints.test.mjs` |
| Parent dirty state is preserved | `tests/git/base-checkpoints.test.mjs`, `tests/git/safety.test.mjs` |
| Parent byte changes with identical porcelain detected | `tests/git/repair-parent-digest.test.mjs` |
| Patch hash and changed paths are controller-derived | `tests/git/evidence.test.mjs` |
| Worker commit/push/merge/destructive commands blocked/detected | `tests/git/safety.test.mjs` |
| Mandatory allow-list (omitted/null/malformed fail closed) | `tests/git/repair-scope.test.mjs` |
| Contextual evidence identity (immutable, collision-free) | `tests/git/repair-evidence-identity.test.mjs` |
| Evidence-bound dirty cleanup | `tests/git/repair-dirty-cleanup.test.mjs` |
| Identity-bound ownership / forged registry rejection | `tests/git/repair-ownership.test.mjs` |
| Registry concurrency / path-reuse fault tests | `tests/git/repair-registry-concurrency.test.mjs` |
| Push/remote fail-closed defense in depth | `tests/git/repair-remote-safety.test.mjs` |
| Same-base parallel worktrees | `tests/git/worktree.test.mjs` |
| Serial stale base | `tests/git/base-checkpoints.test.mjs`, `tests/git/pipeline.test.mjs` |
| Binary file diff / no-change patch / diff-check failure | `tests/git/evidence.test.mjs` |
| Safe cleanup | `tests/git/worktree.test.mjs`, `tests/git/evidence.test.mjs` |

## 11. SOL repair status

After the first SOL review, all seven SOL-S03 findings were repaired within
Sprint 03 scope EXCEPT the two prevention layers that require a reviewed
worker execution boundary (see section 6):

- SOL-S03-001 mandatory write-scope validation — fixed (fail closed on
  omitted/null/malformed allow-list; evidence persisted first).
- SOL-S03-002 immutable contextual patch evidence — fixed (content vs
  observation identity separation, exclusive immutable publication,
  verified artifact reuse).
- SOL-S03-003 parent/foreign write safety — DETECTION fixed (content
  digests); PREVENTION not enforceable in Sprint 03 → ICR-2026-001 →
  SOL_S03_REPAIR: BLOCKED for this finding.
- SOL-S03-004 push/remote safety — DETECTION fixed (all-refs per-URL
  snapshots, pushurl separation, unverifiable ⇒ fail closed); PREVENTION
  not enforceable in Sprint 03 → ICR-2026-002 → SOL_S03_REPAIR: BLOCKED
  for this finding.
- SOL-S03-005 evidence-bound dirty cleanup — fixed.
- SOL-S03-006 identity-bound worktree ownership — fixed.
- SOL-S03-007 registry concurrency / path reuse — fixed.
- SOL-S03-R3-001 — missing-directory/prune path ownership bypass — fixed:
  the vanished-checkout cleanup path now derives the per-worktree Git admin
  directory from repository-owned Git metadata (porcelain registration +
  `<common>/worktrees/*` enumeration, cross-checked via git-written
  `commondir`/`gitdir`/`HEAD` files) and verifies the controller-created
  ownership marker inside it — plus marker identity, worktreeId,
  workUnitId, base, and canonical path bindings — before ANY prune/
  removal/REMOVED. Unverifiable ownership fails closed (no prune, no
  removal, no REMOVED, registry bytes untouched), and removal of a
  verified stale registration is scoped to the exact registration
  (`git worktree remove --force <verified path>`) instead of a global
  `git worktree prune`.

Final consistency repair (SOL-S03-FINAL-001 / SOL-S03-FINAL-002, applied
after the final SOL review):

- SOL-S03-FINAL-001 — worktree ownership no longer rests on registry data
  alone: a controller-created ownership marker (random `markerId`, binding
  worktreeId/workUnitId/base/path) is written into the linked worktree's
  OWN per-worktree Git admin directory at creation, and cleanup requires
  the registry lifecycle AND the exact marker to agree on every identity
  before any `git worktree remove --force`. A forged registry event alone
  can never manufacture LCIM ownership of a foreign worktree (clean
  detached same-base foreign worktrees included). Marker is ADDITIONAL
  evidence — it replaces none of the existing registry/git/base/evidence
  checks.
- SOL-S03-FINAL-002 — `recordWorktreeEvent()` validates the complete
  tentative lifecycle (existing + proposed) under the registry lock before
  appending: duplicate CREATED, unknown-id REMOVED, duplicate REMOVED,
  post-REMOVED events, and malformed shapes are rejected with the registry
  bytes byte-for-byte unchanged (fail before write).

The authoritative sprint specification (`docs/v2-sprints/SPRINT_03_GIT_SAFETY.md`)
was NOT modified; the interface-change requests above are the required
mechanism for the missing capability.
