# ICR-2026-002 — Worker push/network/credential confinement (remote safety)

- **ICR id**: ICR-2026-002
- **Date**: 2026-08-12
- **Originating sprint/branch**: Sprint 03 — Git/worktree/base/scope controller evidence (SOL-S03-004)
- **Review status**: approved

## Affected interface(s)

- Sprint 00 shared interfaces: none modified by this request.
- New: a **worker push/network/credential confinement capability** in the
  controller-owned worker execution boundary (same boundary contract as
  ICR-2026-001; this request covers the network/credential half).
- Consumed by Sprint 10 (adapter) and Sprint 11 (E2E), and by the Sprint
  03-owned remote-safety validator as the primary authorization layer.

## Exact change

The worker execution boundary must make **push capability unavailable by
construction** for the worker process, e.g.:

- no network access for the worker (or an explicit allow-list that excludes
  all configured remotes), AND/OR
- no Git credential material and no credential helper access in the worker
  environment, AND/OR
- repository configuration visible to the worker contains no remote
  URL/pushurl (an isolated copy/overlay), AND
- the enforcement is structural (platform sandbox/container/jail or a
  verified configuration overlay the worker cannot alter), NOT environment
  variables or config values the worker can trivially override or unset.

The interface must also specify:

- fail-closed semantics: if push capability cannot be proven unavailable,
  the controller must not run the candidate (or the candidate must fail
  safety deterministically);
- objective, controller-verifiable enforcement evidence (e.g. sandbox
  audit log, network-deny records) persisted with the run evidence.

## Rationale

Sprint 03 invariant INV-S03-06 (SOL-S03-004) requires that **worker push
capability is unavailable by construction**, or the candidate fails closed.
Current Sprint 03 reality:

- A linked worktree shares the repository's remote configuration; the worker
  may inherit remote URLs, pushurl, any credentials available to Git, and
  network access. Sprint 03 contains no worker execution boundary, so none
  of these are restricted.
- The demonstrated defect is real: with an unreachable fetch URL and a
  reachable push URL, `git push origin HEAD:refs/lcim-safety-test/custom`
  SUCCEEDS at the git level (the Sprint 03 regression test
  `S03-004-1` proves this on a local fixture). Post-hoc `ls-remote`
  comparison is detection, not prevention; an unreachable remote is not
  proof that no push occurred while push capability exists.
- Environment variables or config values are insufficient: a worker can
  trivially unset/override them.

Sprint 03 therefore implements (and tests) only the defense-in-depth half:

- full advertised-ref snapshots per push-relevant URL (fetch URL AND
  pushurls separately), covering every namespace including custom refs
  (not just `--heads --tags`);
- fail-closed: any unverifiable push-relevant URL makes the candidate fail
  safety, even with no push attempt;
- pushes to reachable remotes are detected via full-ref comparison.

The prevention half cannot be honestly claimed without the execution
boundary, so it is requested here rather than faked.

## Affected sprints

- Sprint 10 (adapter) — constructs the confinement (network deny, credential
  isolation) and owns process spawning.
- Sprint 11 — acceptance proof (E2E push attempts must be blocked).
- Sprint 03 remote validator — becomes defense in depth under the primary
  authorization layer.
- Sprint 05/06 — consume run/worker reports only.

## Migration

- New interface only; no existing schema/record changes. Sprint 03 keeps its
  deterministic fail-closed candidate behavior (unverifiable ⇒ unsafe).

## Security / fail-closed semantics

- If the boundary cannot prove push capability unavailable, the candidate
  fails closed — never "trust the worker".
- No caller-supplied "sandboxed" boolean is accepted as proof.
- Remote comparison remains active as defense in depth (all refs, all
  push-relevant URLs, pushurl separate from fetch URL).

## Required acceptance proof

Construct (local fixtures only, no external service):

- unreachable fetch URL,
- reachable push URL,
- push-capable custom namespace.

Attempt `git push <remote> HEAD:refs/lcim-safety-test/custom`:

- the push itself is blocked/unavailable by the controller execution
  boundary (primary), OR the candidate deterministically fails safety and
  cannot proceed (fail-closed fallback while the boundary is absent);
- post-boundary: the same attempt must be BLOCKED at the boundary level and
  the boundary's enforcement evidence recorded.
