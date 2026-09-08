# LCIM

> **LCIM 3.0 active-guidance notice.** The controlling protocol-3.0 plan is
> [`docs/v2-sprints/00B_MASTER_PLAN_LCIM_3_0_CORE.md`](docs/v2-sprints/00B_MASTER_PLAN_LCIM_3_0_CORE.md).
> The V2/2.0/2.1 operational description below is historical and
> non-authoritative for protocol 3.0. LCIM 3.0 exclusively uses Pi
> `deepseek-v4-flash` at thinking level `max` / policy reasoning `MAX` and
> controller-owned Pi openai-codex `gpt-5.6-sol` at `XHIGH`; it permits no Pro
> MAX, Luna, Terra, optional fallback, `STUCK`, or technical-no-progress outcome
> for an actionable technical finding. One credit equals one actual upstream
> request. Proposed development predicates are master §§7–8: adopted procedure,
> actual qualified external tools and finite authorization before isolated Bootstrap
> construction; G1 reviews that actual subject before separately authorized real
> adoption; current G1/G3, task authorization and exact predecessor before C30
> construction; full G2 after complete integration including relevant C30-14 closure.
> Activation/use still requires all current applicable G1/G2/G3 and separate
> operator authorization. No procedure adoption, tool readiness or construction
> permission is granted. The requested Luna documentation edit is not a runtime
> worker-role claim; future source implementation remains Flash/Sol.

```text
SIGNER_V4_CONTROLLER_ATTESTATION:
BLOCKED_PENDING_STRONGER_MACOS_EXECUTABLE_ATTESTATION

LCIM_3_0_SIGNER_GATE:
REMOVED_BY_SCOPE_DECISION

LCIM_3_1_EXTERNAL_OPERATOR_SIGNER:
DEFERRED_TO_LCIM_3_1
```

LCIM 3.0 freezes exactly six public local families:
`lcim.local-operator-session@1`, `lcim.local-plan-confirmation@1`,
`lcim.local-budget-ceiling@1`, `lcim.local-consistency-witness@1`,
`lcim.local-activation-settlement@1` and
`lcim.manual-delivery-manifest@1`. Transaction-zero publishes exactly five
candidates: four local-record candidates (budget, operator session, plan
confirmation and activation settlement) plus one non-runnable protocol/run
genesis candidate. The witness is the PREPARE/COMMIT protocol, not a candidate;
the manual delivery manifest is emitted later by C30-14. A stale committed
activation cannot reissue production capability; while capability is absent,
C30-13 may use only the module-private one-action
`SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY` to publish exactly four successors
(budget, operator session, plan confirmation and activation), with no new
genesis. Initial issuance retains the still-current original TTY confirmation; successor
issuance requires a current matching COMMIT, current-fact reverification/
display and fresh controlling-TTY confirmation.

Independent combined V8 review returned CHANGES_REQUIRED for G3-V8-P1-01 and
SEQ-V8-P1-01. Targeted V9 below is a documentation amendment, not approval.
Standalone Bootstrap support is required before C30-01; C30-11/12 integrate
qualified support/consumers. External Start locks before resolving the current
predecessor, admits source-only facts and uses external checkouts/qualified CAS.
EXTERNAL_DEVELOPMENT_REVIEW source inputs are eligible under master §7.3, not
runtime calls/accounting/capabilities. Actual tools/isolation/spend controls,
Bootstrap contracts, closed review formats, final G2 closure and prohibited-live-
evidence conflicts remain U1–U5; absence denies dependent phases.
Master §§2.3/2.3C require private v2 publication manifests with inline retained
prepared inputs and a fully populated staging-directory fsync. §2.5D is the
single anchor/ancestor durability contract, including reused paths and confirmed
exact-existing completion. §3.4C copies prepared ABANDON inputs from that
capsule and current inputs from a separate verified observation; evidence must
be durably persisted before the separate append. Eight/seven one-use actions
remain (§4.5); initialization is genuine-first bootstrap only. A0 is read-only,
evidence is never capability. G3-V7-P1-01 expands COMMIT to integer private
observationVersion 3 with closed physical-ledger path/length/SHA prerequisite
and both full existing path chains through U. Non-COMMIT remains integer 2.
Under one matching C30-13 authority, pinned exact ledger-file/full-chain fsync
must succeed, then facts/expiry reverify, before first witness COMMIT byte;
ledger effects are fsync-only. Repeat after earlier success/restart with fresh
authority; no bundle-derived ledger durability, duplicate COMMIT or ABANDON of
matching ledger. That is the retained APPEND_ABSENT path. V9 §§2.5B/2.5D add
required commitBranch COMPLETE_EXACT_EXISTING for readable complete COMMIT:
fresh one-use authority fsyncs ledger/full chain before existing witness/full
chain, ZERO bytes/records, before bundle/suffix flushes. Logical COMMITTED is not
eligibility; exact same-session completion and all separate consumer checks are
required. Exit/change loses knowledge; no historical writer proof/prior durability
gates completion issuance. §6.2's post-change path adds qualified prepare before
staging, separately authorized operator commit, verify, separate registry CAS
and exact accepted-generation gate applicability/full G2 renewal for changed
closure before successor authorization. Changed verifier qualifies before use;
S'' invalidates again; no stale FINAL_REVIEW/G2 or build evidence substitutes.
§15 is active V9 modeling; V5/V7/V8 counts/pins remain historical. Independent
V8 verdict CHANGES_REQUIRED and unresolved parent G3-V7-P1-01 are preserved. G1/G2 pending, G3
CHANGES_REQUIRED_PENDING_FRESH_REREVIEW; construction and runtime use BLOCKED.

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

Historically in V2, the normal implementation route was DeepSeek V4 Flash
through Pi at `XHIGH`, with Pro MAX escalation and other legacy routing
concepts. Those routes are not active for protocol 3.0 and must not be used.
Every historical provider call was wrapped by the canonical
START/COMPLETION/ASSESSMENT invocation lifecycle.
SOL is used only for a compiled, bounded decision contract with one question,
explicit pass/fail conditions, bounded evidence, and an exact response shape.
The four roles are CONTRACT_CHECK, DIAGNOSE, RECHECK, and FINAL_REVIEW.

### Automatic SOL channel (V2.0.1)

Automatic SOL routing is CODEX-ONLY (fifth-review rule): configure
`endpoints["gpt-5.6-sol"]` in `.lcim/project.json` (GPT-5.6 Sol at XHIGH
through Pi's native `openai-codex` provider, using Pi's existing OAuth
store `~/.pi/agent/auth.json` — LCIM runs Pi as a trusted controller-side
transport with a run-scoped isolated agent directory containing only the
openai-codex OAuth entry (mode 0600, removed at run end); `pi /login`
must have an active ChatGPT Plus/Pro Codex session). Every SOL role
(CONTRACT_CHECK, DIAGNOSE, FINAL_REVIEW, RECHECK) routes through the
SAME strict gate: exactly openai-codex / gpt-5.6-sol / XHIGH.

The classic `sol-xhigh` channel has NO production authority in 2.1
(configuring `endpoints["sol-xhigh"]` fails closed with
`SOL_CHANNEL_CLASSIC_NO_AUTHORITY`); it survives only as immutable 2.0.0
historical semantics for old-record validation. Route-decision records
use the immutable schema version 2.1.0 and feed the same Sprint-06
ask/response/repair pipeline. The real Pi auth store is READ-ONLY input
authority: LCIM copies the provider-scoped `openai-codex` entry into a
run-scoped isolated surface, reuses it for every SOL call of the run
(within-run refresh continuity), deletes it at cleanup, and NEVER writes
a refreshed token back to `~/.pi/agent/auth.json`; a later run with a
missing/stale credential fails closed with an explicit
re-authentication-required instruction (`pi /login`). See
[`docs/v2-codex-sol-oauth.md`](docs/v2-codex-sol-oauth.md) for the full
controller-side transport pins and fail-closed matrix.

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
