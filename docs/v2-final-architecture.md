# LCIM V2 final architecture (2.0.0-rc.1)

Status: Sprint 11 release-candidate evidence complete. This is the native V2
architecture assembled by S00-S11; V1 evidence remains compatibility-only.

## Controller boundary

LCIM is a standalone CLI. Target configuration is read from `.lcim/`; runtime
state is resolved below the target Git common directory:

```text
<target-git-common-dir>/lcim/
```

LCIM source identity (version and source commit), target base SHA, project
configuration digest, schema version, and run identity are separate facts.
The source checkout and target checkout are never runtime stores.

A run is assembled as:

```text
config -> contract -> route/budget -> isolated worker -> patch/evidence
      -> disposable-copy validation -> semantic disposition
      -> bounded SOL diagnosis/recheck -> reviewable candidate
      -> status/audit/review-export
```

The controller never commits, pushes, merges, opens a PR, publishes, or tags.
Workers report claims; only the controller can set `PATCH_VALID`,
`SEMANTICALLY_ACCEPTED`, `CANDIDATE_INTEGRATED`, or `REVIEW_APPROVED`.

## Routing and invocation lifecycle

- DeepSeek Flash through Pi at `XHIGH` is the normal implementation route.
- DeepSeek Pro MAX and Flash MAX are escalation-only and require an explicit
  machine-readable reason. Terra and Luna are not normal escalation rungs.
- Missing exact capability or endpoint fails closed; no silent downgrade or
  substitution is allowed.
- Semantic rejection routes through bounded SOL diagnosis/repair/recheck and
  ends in `STUCK` when the state-machine budget is exhausted.

Every provider/model invocation has exactly one canonical lifecycle:

```text
START -> COMPLETION -> ASSESSMENT
```

A crash leaves immutable history and appends `RECONCILIATION` evidence during
recovery. The finalizer marks an unprovable ledger `INCOMPLETE_LEDGER`; it
never fabricates completion or edits prior events. Projection counts are
reconciled against the append-only, sequence- and digest-checked ledger.

## Worker boundary and Git safety

The controller independently derives the target base, worktree identity,
changed paths, patch bytes/hash, scope/ref/parent/remote facts, transport
state, validation result, and final disposition. A malformed worker handoff,
crash, timeout, or schema failure cannot erase useful controller-derived patch
evidence.

Workers use controller-created detached worktrees at the exact expected base.
The parent, sibling worktrees, Git administrative paths, runtime, registry,
and evidence stores are outside the writable surface. Parent digests and
post-exit Git checks are defense-in-depth detection.

On supported macOS hosts, execution uses a canonical Seatbelt deny-default
profile. The model has only in-process Pi `read`, `write`, `edit`, and `ls`
tools, and a structural `(deny process-fork)` rule is empirically probed for
EPERM before authorization. Credentials and arbitrary processes are denied.
Network is `DENY_ALL`, or one fresh broker loopback port. Boundary authority is
bound to the run, work unit, invocation, worktree, profile digest, executable,
credential roots, and network policy by a module-private capability. If
construction or verification is unavailable, invocation is refused.

## Provider broker and validation

Provider traffic leaves the model boundary only through a fresh,
controller-owned broker bound to the exact role, provider, model, upstream,
credential, and invocation. Credentials stay in the controller, are
revoked after the invocation, and are never persisted. Only POST
`/v1/chat/completions` is exposed; arbitrary forwarding, CONNECT, worker
routing fields, cross-role models, and untrusted TLS fail closed.

The controller freezes patch bytes and hash before validation. Validation
applies those bytes to a disposable copy of the expected base using a
separate ALLOWED-process boundary with no broker, credentials, or network.
Validation cannot modify the artifact or candidate. Inline expressions such as
`node -e` remain literal arguments; file paths resolve only inside the copy.

## SOL and Pro boundary

Automatic SOL calls use compiled asks with one primary question, explicit
pass/fail conditions, bounded evidence, source/contract digests, out-of-scope
limits, and one of `SOL_CONTRACT_CHECK`, `SOL_DIAGNOSE`, `SOL_FINAL_REVIEW`, or
`SOL_RECHECK`. Responses are bound to the exact ask and repair provenance.
Generic review text cannot enter the provider path.

ChatGPT SOL Pro is manual and text-only. LCIM does not call a Pro API, browse,
upload, attach, or send messages. Only bounded redacted clipboard text may be
copied; the hard limit is 12,000 characters. Secrets, raw packets,
transcripts, file references, paths, or unredactable material fail closed.

## Audit, review, and V1 compatibility

`audit` and `review-export` read canonical runs and emit sanitized projections.
They reconcile lifecycle, invocation, work-unit, review, usage, rejection, and
ledger facts. Missing usage, cost, finding linkage, normalization, semantic
acceptance, or integration facts remain `UNKNOWN`; they are not inferred.
Status is read-only. Recovery/finalize/abort are explicit append-only
controller operations.

The V1 reader is pure and read-only. It verifies historical bytes/hashes,
preserves useful malformed evidence, emits separate `V1_COMPAT` projections,
and uses `UNKNOWN_V1` where history cannot establish a fact. V1 claims are
never silently promoted to native V2 authority and V1 files are never
rewritten.

## Controlled self-host evidence

The final low-risk trial used an isolated target worktree at the exact base
`f369cfa2991fe39c8100c040dda3eae94a76fbb6`. It created one documentation-only
candidate, validated the frozen patch, preserved the candidate through audit
and review export, and finished:

```text
work units 1 | invocations 1 | validation PASS
SEMANTICALLY_ACCEPTED | COMPLETED | REVIEWABLE_CANDIDATE
publication REVIEWABLE_ONLY | autoPublished false
```

The first trial exposed and stopped on an inline-validation argument rewrite
bug. The normal repair was made in `validation-runner.mjs`, regressions were
rerun, and the controlled trial was repeated successfully. No candidate was
published and the parent checkout remained unchanged.
