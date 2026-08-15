# LCIM

Low Cost Implementation Model — standalone LCIM V2 controller and CLI.

## Install

Use the versioned LCIM source checkout (the documented installation source is
`/Users/lawrencebois-yan/Documents/LCIM`):

```sh
cd /Users/lawrencebois-yan/Documents/LCIM
npm install
npm link
lcim --version
```

LCIM source remains versioned in this repository. Sprint 11 completed a
controlled, documentation-only self-host trial; publication remains manual and
reviewable-only. See [`docs/v2-final-architecture.md`](docs/v2-final-architecture.md)
for the release-candidate architecture and evidence.

## Target project setup

From an arbitrary target Git worktree:

```sh
lcim setup
lcim status
```

`setup` creates minimal, non-secret project-owned material under `.lcim/`:

- `project.json` — schema-versioned allow-list, semantic contract inputs,
  non-secret provider endpoint descriptors, and optional local command adapters;
- `PROJECT_CAPSULE.md`, `REPO_MAP.md`, `risk-globs.json`, and
  `PROJECT_DECISIONS.md` — bounded project context owned by the target project.

The project file accepts no provider tokens, authentication material, private
keys, or raw secret-bearing fields. Malformed or unsupported configuration is
rejected. Defaults and the supported migration from an unversioned/`"1"`
project file are deterministic. Project configuration is never a runtime
ledger and must not contain runtime evidence.

## Runtime and privacy boundary

All runtime state is local below the target repository's Git common directory:

```text
<git-common-dir>/lcim/
```

This is shared by linked worktrees and remains outside tracked source. It
contains the append-only invocation ledger, worktree registry, controller
facts, patch evidence, raw local debugging material, audit projections, and
manual SOL Pro records. Normal audit/review exports omit raw provider output
and sensitive target source.

On supported macOS hosts, workers are launched only inside a controller-created
Seatbelt deny-by-default boundary. The boundary permits writes only in the
LCIM-created disposable worker worktree, denies network access, isolates Git
credential stores, and records objective probe evidence. If that boundary
cannot be constructed and verified, LCIM fails closed before worker execution.
Sprint-03 base, parent-digest, worktree, scope, remote, and cleanup checks still
run after exit as defense in depth.

## Run lifecycle and model roles

```sh
lcim run
lcim status
```

The controller compiles the semantic contract, applies deterministic routing,
creates an isolated detached worktree at the explicit base, invokes the worker,
parses transport separately from patch evidence, derives Git facts itself,
validates scope/tests/secret checks, and records controller dispositions.
Worker status is communication only; it is never patch readiness, semantic
acceptance, integration, or review approval.

The normal implementation route is DeepSeek V4 Flash through Pi at `XHIGH`.
DeepSeek Pro MAX is escalation-only and requires a machine-readable reason.
Terra and Luna are not normal escalation rungs. Every actual provider call is
wrapped by the canonical START/COMPLETION/ASSESSMENT invocation lifecycle.
SOL is used only for a compiled, bounded decision contract with one question,
explicit pass/fail conditions, bounded evidence, and an exact response shape.
The four roles are CONTRACT_CHECK, DIAGNOSE, RECHECK, and FINAL_REVIEW.

## Candidates and worktrees

LCIM produces `REVIEWABLE_CANDIDATE` records only. It never automatically
commits, pushes, merges, opens a pull request, creates a release, or publishes
to a package registry. Patch identity, changed paths, base SHA, diff checks,
write scope, and parent preservation are controller-derived.

Each worker receives a disposable detached linked worktree. Parallel target
worktrees share only the target Git common runtime store; their workspaces and
base checkpoints remain isolated. A dirty target worktree is preserved.

## Audit and review export

```sh
lcim audit --last 10
lcim review-export --last 10
```

Both operations are local. Audit writes deterministic projections and metrics
under `<git-common-dir>/lcim/audit/`; review export writes sanitized
`REVIEW.md` and projections under `<git-common-dir>/lcim/exports/`. Missing
historical facts remain `UNKNOWN`; canonical ledger events are not changed.
Raw local evidence is not uploaded by LCIM.

## Manual SOL Pro handoff

```sh
lcim pro-copy <local-id>
lcim pro-copy <local-id> --dry-run
```

SOL Pro is manual text only. LCIM uses the reviewed renderer, redaction
boundary, local store, and clipboard adapter. It does not call an online Pro
API, browse, send, open upload dialogs, attach files, or upload patches,
Markdown, logs, archives, JSON packets, or repository files. The hard outbound
text limit is 12,000 characters. A pasted directive is parsed locally and
must bind to its recorded ask, response, finding, and contract identities.

## Recovery and finalization

```sh
lcim recover <run-id>
lcim finalize <run-id>
lcim abort <run-id> --note "bounded local reason"
```

Recovery appends explicit reconciliation events for invocations left after a
crash and then finalizes the run. It never deletes or rewrites historical
ledger evidence. Finalization preserves `INCOMPLETE_LEDGER` when lifecycle
coverage cannot be established.

## Development checks

```sh
npm run test:unit
npm run test:guards
npm run test:smoke
npm run test:integration
npm test
git diff --check
```
