# C30-06 — changed-set scan, safe artifacts and source handoff

**Development gate:** master §§7–8 phases A–D: accepted external procedure/tools,
current applicable G1/G3, exact per-task authorization, accepted Bootstrap and
current immediate predecessor. G2 follows complete integrated implementation;
activation/use requires phase F, all current applicable G1/G2/G3 and separate
operator authorization. None is granted here. Component runtime prerequisites
below are not prerequisites to constructing their own code in isolated fixtures.

**Status:** `PLAN_AMENDED / IMPLEMENTATION_TESTS_PENDING`

**Depends on:** C30-05 verified successor source generation.

**Next:** `SPRINT_30_07_SOL_CONTRACTS.md`.

## Objective

No patch, subject, validation evidence or Sol evidence is persisted until the
exact changed set and all changed bytes pass the bounded scanner. This unit
consumes the exact current generation and cannot invent a base SHA.

## Changed-set enumeration

Use NUL-delimited, no-rename, no-ext-diff, no-textconv profiles for base tree,
index, staged, unstaged, tracked and ordinary untracked files. Independently
walk the disposable worktree with `lstat` to catch ignored files and special
entries. Treat renames as delete plus add.

Reject symlink, submodule/mode 160000, FIFO, socket, device, special entry,
binary change, NUL content and invalid UTF-8 before persistence.

## Safe scan

After worker quiescence, lstat each path/component, open regular files with
`O_RDONLY|O_NOFOLLOW`, fstat, stream bounded bytes, compare descriptor/path
identity, size/mode/mtime, then re-enumerate the changed set. Node/no-`openat`
protection is bounded to controller-owned quiescent worktrees with no-follow
and identity rechecks; LCIM 3.0 does not claim hostile same-UID-writer
resistance.

Scan raw diff and changed bytes in canonical path order using strict UTF-8 and
bounded raw/normalized/Unicode/base64/base64url/hex/numeric representations.
`PASS` requires complete EOF/path/snapshot, no match and no error. `DETECTED`
is a proven match. `INCOMPLETE` covers unsupported/bound/TOCTOU/decoder/
timeout failure.

## Persistence and cleanup

```text
scan changed bytes
→ synthesize patch through temporary base-seeded index
→ verify temporary-index blob IDs equal scanned digests
→ scan exact resulting patch
→ persist only unchanged PASS Buffer
→ exclusive create + digest/size/manifest digest + file/parent fsync
```

`DETECTED` and `INCOMPLETE` write only secret-free metadata; raw bytes are
discarded. Cleanup uses C30-04 ownership intent and snapshots. Failed or
uncertain cleanup quarantines and blocks recovery.

## Source-generation handoff

Subjects and validation bind current generation ID, predecessor manifest/verified
SHA, exact parent/tree/candidate/changed set, active-guidance universe,
verifier identity, expected head CAS and review/validation identities. Earlier
source changes invalidate all descendants.

## Owned families

| Family | First emitter | Consumers |
|---|---|---|
| `lcim.implementation-intent@1` | candidate declaration | Flash/Sol/repair |
| `lcim.patch-artifact@1` | scan PASS | Sol/repair/barrier |
| `lcim.subject-generation@1` | materialization | review/checkpoint |
| `lcim.validation-evidence@1` | validator | Sol/checkpoint |
| `lcim.scan-evidence@1` | scanner | quarantine/audit |
| `lcim.quarantine-record@1` | cleanup | recovery/audit |

## Preserved orchestration

Pi deepseek-v4-flash (thinking "max", LCIM reasoning MAX), controller-owned Pi openai-codex gpt-5.6-sol XHIGH, validation-before-review,
repair-until-PASS, exact RECHECK, zero-open-finding advancement, source DAG
and manual delivery endpoint remain unchanged. C30-06 does not require a
cryptographic signer, signed plan, signed budget, Keychain or executable
attestation.

## Implementation prompt

Implement only changed-set enumeration, safe reads, bounded secret scan,
PASS/DETECTED/INCOMPLETE, scan-before-persistence, immutable artifacts,
secret-free quarantine, source-generation binding and ownership cleanup/
recovery. Do not implement Sol Transport V3, findings, budget, repair,
checkpoints, activation or release. Do not access credentials or Keychain.
Return files/tests/commands/results/acceptance/unresolved issues/ICRs; do not
commit.

## Normative Start/dependency gate

The common development Start contract is master §7.4, incorporated in full.
Predecessor: `C30-05`. Check procedure/current applicable G1/G3,
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
