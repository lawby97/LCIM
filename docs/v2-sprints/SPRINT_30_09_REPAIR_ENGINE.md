# C30-09 — durable repair-until-PASS engine

**Development gate:** master §§7–8 phases A–D: accepted external procedure/tools,
current applicable G1/G3, exact per-task authorization, accepted Bootstrap and
current immediate predecessor. G2 follows complete integrated implementation;
activation/use requires phase F, all current applicable G1/G2/G3 and separate
operator authorization. None is granted here. Component runtime prerequisites
below are not prerequisites to constructing their own code in isolated fixtures.

**Status:** `PLAN_AMENDED / IMPLEMENTATION_TESTS_PENDING`

**Depends on:** C30-08 verified successor source generation.

**Next:** `SPRINT_30_10_CHECKPOINT_BARRIER.md`.

## Exact order

The only valid source-change sequence is:

```text
Flash repair
→ scan-PASS successor patch/subject
→ deterministic validation
→ exact-finding Sol RECHECK
→ complete current-generation Sol FINAL_REVIEW
→ repair-result settlement
→ repeat until PASS
```

Validation is settled before RECHECK. Every source change creates a successor
source/subject generation and invalidates affected coverage. RECHECK closes
only exact supplied findings and never changes sprint, barrier, checkpoint,
activation or delivery state. Complete FINAL_REVIEW is the stage result.

## Generation and finding integration

Repair intent binds predecessor source generation, finding IDs, lineage, write
scope and behavior. The successor binds predecessor subject/source manifest,
exact patch/changed set, scan and validation identities, review coverage and
expected generation-head CAS. Omitted prior dispositions, duplicate proposals,
invalid transitions or stale heads reject atomically. `UNTOUCHED_NOT_REVIEWED`
remains open.

**GENERAL RECORD/REQUEST CONTEXT**

- same operation ID + byte-identical canonical request: return existing
  committed result;
- same operation ID + different bytes, when no witness-integrity conflict has
  already been established: `DENIED_OPERATION_REPLAY_CONFLICT`.

**WITNESS/LEDGER INTEGRITY CONTEXT**

- competing prepared/committed bytes or competing heads established by the
  precedence-first witness classifier:
  `QUARANTINED_WITNESS_REPLAY_CONFLICT`.

The witness-integrity classifier has precedence only when durable prepared/
committed witness or ledger evidence proves that conflict. Ordinary different-
byte replay does not quarantine merely because an operation ID was reused. A
finding surviving repair remains `REPAIR_REQUIRED`; missing output is never
clean.

## Recovery and pause policy

Every **runtime repair** state change is a canonical local ledger transaction.
External source repair/acceptance uses master §7.3 and never fabricates these
runtime events or capabilities to build this component. Crash recovery
reloads intent/reservation/artifact/validation/review facts and never blind-
retries or treats missing output as clean. An actionable technical finding is
repaired through successor/validation/exact RECHECK/complete FINAL_REVIEW until
PASS; it cannot become STUCK, technical-no-progress or deferred. Pauses require
frozen cause-specific proof of budget exhaustion, operator input, provider
credential unavailability, provider transport unavailability or local worktree
conflict; integrity failure quarantines.

The actual C30-13-issued production capability is required for mutation and is
absent after restart. Read-only recovery planning precedes C30-13 reissue.

## Owned families

| Family | First emitter | Consumers |
|---|---|---|
| `lcim.repair-result@1` | post-sequence settlement | checkpoint/recovery |
| `lcim.coverage-invalidation@1` | source/evidence change | review/checkpoint |
| `lcim.repair-generation@1` | repair successor | scan/Sol/checkpoint |

## Preserved orchestration and scope

Pi deepseek-v4-flash (thinking "max", LCIM reasoning MAX) remains the sole implementation/repair worker; Pi openai-codex gpt-5.6-sol XHIGH remains
controller-owned; validation, exact RECHECK, complete FINAL_REVIEW, zero open
findings and repair-until-PASS are unchanged. The local budget ceiling is
controller evidence, not a signed authority. No signer, Keychain, provider
credential or executable-attestation mechanism is implemented here.

## Implementation prompt

Implement only durable Flash repair order, source/subject successor
 generation, coverage invalidation, exact finding transitions,
RECHECK/FINAL_REVIEW sequencing, result settlement and crash/no-progress
recovery. Do not invent signed authority or implement checkpoints, activation
or release. Do not access credentials or Keychain. Return files/tests/
commands/results/acceptance/unresolved issues/ICRs; do not commit.

## Normative Start/dependency gate

The common development Start contract is master §7.4, incorporated in full.
Predecessor: `C30-08`. Check procedure/current applicable G1/G3,
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
