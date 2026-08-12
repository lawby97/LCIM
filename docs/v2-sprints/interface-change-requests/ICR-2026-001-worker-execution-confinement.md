# ICR-2026-001 — Controller-owned worker execution boundary with filesystem write confinement

- **ICR id**: ICR-2026-001
- **Date**: 2026-08-12
- **Originating sprint/branch**: Sprint 03 — Git/worktree/base/scope controller evidence (SOL-S03-003)
- **Review status**: approved

## Affected interface(s)

- Sprint 00 shared interfaces: none modified by this request (the request is
  for a NEW controller-owned interface).
- New: a controller-owned **worker execution boundary** (run/sandbox contract)
  consumed by Sprint 10 (CLI/project adapter) and Sprint 11 (E2E/self-host),
  and by the Sprint 03-owned safety validator as the primary enforcement
  layer.
- Related runtime layout: `<git-common-dir>/lcim/` registry and evidence
  stores must be outside the worker's writable surface.

## Exact change

A new shared interface (module/schema family, e.g.
`src/shared/execution-boundary` + `schemas/common/worker-execution.v2.schema.json`)
that a controller uses to run a worker process with **enforced filesystem
write confinement**:

- the worker process may write ONLY inside its disposable worktree
  directory (and an explicit scratch root if the contract allows one);
- writes to the parent/main worktree, sibling/foreign worktrees, the
  repository's administrative paths (`.git`, git-common-dir, including
  `<git-common-dir>/lcim/worktrees/` registry and
  `<git-common-dir>/lcim/evidence/`), and any other configured path are
  BLOCKED by the boundary (not merely detected afterwards);
- the boundary must be effective against the worker's own code (e.g.
  platform sandbox/container/seccomp/jail or equivalent), not a
  caller-supplied boolean, not cwd convention, and not prompt
  instructions;
- the interface returns objective enforcement evidence (what was blocked,
  exit status, resource accounting) that the controller can persist;
- fail-closed: if the boundary cannot be constructed or verified, the
  controller refuses to spawn the worker.

## Rationale

Sprint 03 invariant INV-S03-05 (SOL-S03-003) requires two layers:

- **A. Prevention**: the worker execution boundary must prevent writes to
  the parent/main worktree, sibling/foreign worktrees, and arbitrary
  repository administrative paths. LCIM V2 Sprint 03 contains **no worker
  execution boundary at all**: `createIsolatedWorktree()` creates a linked
  worktree and snapshots state; nothing in Sprint 00–03 runs the worker
  process. A normal linked worktree/CWD does not by itself prevent a process
  from opening another filesystem path, cwd confinement is NOT filesystem
  write confinement, and prompt instructions are NOT confinement.
- **B. Detection**: the Sprint 03 content-digest parent snapshot (implemented
  in this repair: sha256 digests of dirty tracked files, staged blobs, and
  untracked user files) is defense in depth only; it cannot be claimed as
  prevention.

Without the boundary interface, Sprint 03 cannot truthfully guarantee
INV-S03-05. Inventing a provider-specific sandbox inside Sprint 03 would
violate the sprint boundaries (Sprint 10 owns the adapter) and would bypass
the shared-interface review the master plan requires.

Note (also part of the confinement issue, per SOL-S03-006): while no
boundary exists, a worker with OS-level access to `<git-common-dir>/lcim/`
could forge registry/evidence files; the identity-bound registry and
evidence verification implemented in Sprint 03 makes forged-but-malformed
data fail closed, but full forgery resistance requires this boundary.

## Affected sprints

- Sprint 10 (integration adapter) — primary consumer; owns process spawning
  and the sandbox construction.
- Sprint 11 (E2E, fault injection, self-host) — acceptance proof harness.
- Sprint 03 safety validator — becomes the detection layer under the
  boundary's enforcement layer.
- Sprint 05/06 (routing/SOL) — consume worker execution reports only; no
  contract change.

## Migration

- New interface only; no existing schema/record is changed. Sprint 03
  keeps its fail-closed detection behavior until the boundary exists.
- Sprint 03's `checkWorkerSafety()` documents that detection is not
  prevention; the boundary interface is the required primary layer.

## Security / fail-closed semantics

- Missing/unconstructible boundary ⇒ controller refuses to spawn the
  worker (no degraded "sandboxed=true" flag accepted from callers).
- The boundary's enforcement evidence must be controller-verifiable
  (objective, replayable), not worker-reported.
- The worker never holds credentials or repository config needed to widen
  its own confinement.

## Required acceptance proof

1. Parent has a dirty tracked file with known bytes A.
2. Worker attempts to replace it with bytes B while preserving the porcelain
   shape (` M file` unchanged).
3. The write is actually BLOCKED by the execution boundary; parent bytes
   remain A; worker exits (possibly non-zero with a blocked-write record).
4. Post-exit `checkWorkerSafety()` remains valid.
5. Defense in depth still holds: if parent bytes change despite the
   boundary, the content-digest comparison fails closed.
6. A sibling/foreign worktree and the registry/evidence stores are
   write-blocked the same way.
