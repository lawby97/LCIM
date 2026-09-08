# C30-04 — hardened Git process, source handoff and mutator probes

**Development gate:** master §§7–8 phases A–D: accepted external procedure/tools,
current applicable G1/G3, exact per-task authorization, accepted Bootstrap and
current immediate predecessor. G2 follows complete integrated implementation;
activation/use requires phase F, all current applicable G1/G2/G3 and separate
operator authorization. None is granted here. Component runtime prerequisites
below are not prerequisites to constructing their own code in isolated fixtures.

**Status:** `PLAN_AMENDED / IMPLEMENTATION_TESTS_PENDING`

**Development depends on:** exact current accepted C30-03 source checkpoint.
Local consistency witness is a runtime dependency, not source admission.

**Next:** `SPRINT_30_05_FLASH_TRANSPORT_BUDGET.md`.

## Scope

This unit establishes the runtime Git/process substrate before any runtime
LCIM worktree or production worker invocation. Development checkouts and early
handoffs use already qualified external Bootstrap tooling (master §§2.7/7.2),
not this unfinished runtime or C30-13 capability. It creates no user commit, branch, remote,
provider request or release artifact. The operator's source commit remains
outside LCIM implementation authority.

The V4 signer stopping rule is accepted. C30-04 has no cryptographic signer,
signed authority record, signer IPC, native runtime authorization or Keychain
dependency. Controller-led Git mutation requires the actual C30-13-issued
`PRODUCTION_RUNTIME_CAPABILITY`; C30-01 confirmation alone is evidence and
never production authority. The capability is never a Git credential or remote
authority.

## Git identity and profiles

Pin absolute `/usr/bin/git` identity (path/realpath/device/inode/size/mtime/
SHA-256) and revalidate before spawn and after exit. Isolate HOME/XDG, Git
config, hooks, filters, helpers, signing, proxies, CA, SSH and askpass.

`git-read-only-v1` permits only reviewed local read argument shapes for
`rev-parse`, `rev-list`, `merge-base`, `cat-file`, `show-ref`, `diff`, `status`,
`log`, read-only config, worktree listing and object metadata. It rejects
arbitrary `-c`, remote verbs, apply, refs, commits and worktree mutation.

`git-mutator-v1` permits only controller-owned disposable worktree create/remove,
disposable patch application and private LCIM ref CAS updates. Every mutation
is intent → observation → settlement with `SUCCEEDED`, `NOT_APPLIED` or
`UNCERTAIN`. Ownership markers and pre-existing byte digests prevent deleting
user data. External GC/worktree changes are conflicts.

## Fixture-only negative probes

In a controller-owned origin-free disposable fixture:

```text
/usr/bin/git push origin HEAD
/usr/bin/git push <hard-coded-local-fixture-url> HEAD:<fixture-ref>
```

Both must fail nonzero. Before/after local and target-bare ref/object
manifests must be byte-identical, no credential may be available, no network
outside the fixture namespace may be reachable, and cleanup may remove only
owned paths. Uncertain cleanup quarantines.

## Owned interfaces

| Family | First emitter | Consumers |
|---|---|---|
| `lcim.git-process-proof@1` | C30-04 | all Git users |
| `lcim.git-mutator-intent@1` | pre-action intent | observation |
| `lcim.git-mutator-observation@1` | post-action observation | settlement |
| `lcim.git-mutator-settlement@1` | outcome settlement | checkpoints/recovery |

## Acceptance and recovery

Tests reject executable replacement, argument smuggling, config/helper/proxy/
SSH surfaces, unowned cleanup, user ref movement, remote verbs, CAS races,
external GC and uncertain crash windows. Acceptance includes both fixture-only
negative probes, exact manifests and cleanup. A crash before action is
`NOT_APPLIED` only with process evidence; after the action boundary requires
observation and may be `UNCERTAIN`.

Pi deepseek-v4-flash (thinking "max", LCIM reasoning MAX), Pi openai-codex gpt-5.6-sol XHIGH, validation/review order, repair-until-PASS and manual
commit boundaries are preserved. The 3.0 threat model excludes hostile
same-UID processes, root/kernel compromise, live-controller debugging/memory
theft, malicious OS, full-machine compromise and coordinated rollback of every
local root.

## Implementation prompt

Implement only the pinned Git identity, closed read-only profile, disposable
mutator profile, source-generation handoff, ownership and
intent/observation/settlement recovery, local-capability requirement and
fixture-only negative probes. Do not implement Flash/Sol transport, scan,
findings, budget, repair, checkpoints, activation or release. Do not access
credentials or Keychain. Return files/tests/commands/results/acceptance/
unresolved issues/ICRs; do not commit.

## Normative Start/dependency gate

The common development Start contract is master §7.4, incorporated in full.
Predecessor: `C30-03`. Check procedure/current applicable G1/G3,
qualified external tools and exact task authorization; **lock before resolving**
the current predecessor; verify identity/head/non-supersession, proof, reviewed
commit/tree and accepted source evidence; bind development guidance/configuration/
routing, not fabricated runtime records; record source-only admission and consumed
generation under the qualified external owner; externally create/verify checkout;
recheck currentness before launches and checkpoint acceptance; publish successors
only through qualified prepare/verify, operator exact-path local commit and
separately authorized registry lock/CAS. Missing phase prerequisites deny work;
source mismatch is `DENIED_STALE_OR_UNVERIFIED_SOURCE_CHECKPOINT`.
External review eligibility is master §7.3 EXTERNAL_DEVELOPMENT_REVIEW, never
runtime Sol/finding/accounting/capability records. Candidate tests are isolated
synthetic/local mocks; external model requests require separately accepted tools,
isolation and finite enforceable upstream-request/spend controls, not session counts.
G2 is not required to construct its subject; runtime activation/use remains blocked.
