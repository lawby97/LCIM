# C30-08 — atomic finding proposals, transitions and repair intents

**Development gate:** master §§7–8 phases A–D: accepted external procedure/tools,
current applicable G1/G3, exact per-task authorization, accepted Bootstrap and
current immediate predecessor. G2 follows complete integrated implementation;
activation/use requires phase F, all current applicable G1/G2/G3 and separate
operator authorization. None is granted here. Component runtime prerequisites
below are not prerequisites to constructing their own code in isolated fixtures.

**Status:** `PLAN_AMENDED / IMPLEMENTATION_TESTS_PENDING`

**Depends on:** C30-07 verified successor source generation.

**Next:** `SPRINT_30_09_REPAIR_ENGINE.md`.

## Objective

Make every Sol response disposition atomic and make repair intent a durable
pre-dispatch fact. No finding state, transition, lifecycle head or repair
selection is emitted partially or after Flash repair begins.

## Proposal and identity contract

`proposalIndex` is the immutable zero-based response-array position. Duplicate
content remains distinct because indices differ. No sort, deduplication or
reindexing occurs before identity derivation.

```text
findingId = "lcim_finding_" || hex(SHA-256(
  "LCIM-FINDING-ID-v1\\0" || JCS([operationId, proposalIndex])))

findingEventId = "lcim_finding_event_" || hex(SHA-256(
  "LCIM-FINDING-EVENT-ID-v1\\0" ||
  JCS([operationId, proposalIndex, priorFindingId, disposition, priorState])))
```

The pre-commit intent fixes operation ID, ordered prior-open set,
response/profile/subject/source-generation identities, proposal indices,
content/event IDs and expected heads.

Every prior-open finding appears exactly once. Omitted, duplicated, extra,
reordered or unknown IDs reject the entire transaction. An exact RECHECK subset
may name only supplied IDs; open findings outside it receive explicit
`UNTOUCHED_NOT_REVIEWED` and remain open. New proposals are separate and may
not claim a prior ID.

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
committed witness or ledger evidence proves that conflict. Reusing an operation
ID with different ordinary request bytes does not by itself quarantine.

## Transition contract

The complete allowed transition union is:

```text
REPAIR_REQUIRED → REPAIR_IN_FLIGHT
REPAIR_REQUIRED → PAUSED_BUDGET_EXHAUSTED | PAUSED_OPERATOR_INPUT_REQUIRED
REPAIR_REQUIRED → PAUSED_PROVIDER_CREDENTIAL_UNAVAILABLE | PAUSED_PROVIDER_TRANSPORT_UNAVAILABLE
REPAIR_REQUIRED → PAUSED_LOCAL_WORKTREE_CONFLICT | QUARANTINED_INTEGRITY_FAILURE
REPAIR_REQUIRED → REPAIR_REQUIRED              [UNTOUCHED_NOT_REVIEWED]
REPAIR_IN_FLIGHT → AWAITING_RECHECK | REPAIR_REQUIRED
REPAIR_IN_FLIGHT → the same six cause-specific nontechnical pause/quarantine states
AWAITING_RECHECK → CLOSED | REPAIR_REQUIRED
AWAITING_RECHECK → the same six cause-specific nontechnical pause/quarantine states
PAUSED_* → REPAIR_REQUIRED                         [cause-specific RESUME]
any nonterminal → QUARANTINED_INTEGRITY_FAILURE
CLOSED or QUARANTINED_INTEGRITY_FAILURE → no ordinary transition
```

No actionable technical finding may enter a pause, `STUCK`, technical-no-
progress or deferred state. `CLOSED` requires exact RECHECK and complete
current-generation FINAL_REVIEW PASS. `UNTOUCHED_NOT_REVIEWED` is never a pass or closure. Every unlisted pair
is `TERMINAL_INVALID`: reject atomically, write no partial transition and
preserve prior state or quarantine when integrity evidence exists.

## Atomic contents and repair intent

One response settlement contains complete prior dispositions, separate new
finding content, deterministic events, resulting states and resulting heads.

`lcim.repair-intent@1` is emitted only after the finding transaction. It binds
operation/run/plan/node/source generation, selected findings, originating
ask/response/profile, origin subject, required behavior, must-change/must-not-
change, allowed write scope, validation profile, budget class and predecessor
head. It contains no patch delta, future subject, validation result, RECHECK,
FINAL_REVIEW or settlement.

## Owned families

| Family | First emitter | Consumers |
|---|---|---|
| `lcim.finding-content@1` | finding transaction | repair/audit |
| `lcim.finding-transition@1` | finding transaction | repair/checkpoint |
| `lcim.finding-transaction-intent@1` | pre-commit intent | recovery |
| `lcim.repair-intent@1` | pre-dispatch selection | repair |

## Preserved orchestration and scope

Pi deepseek-v4-flash (thinking "max", LCIM reasoning MAX) remains the sole implementation/repair worker. Pi openai-codex gpt-5.6-sol XHIGH remains
controller-owned. Validation precedes RECHECK; complete FINAL_REVIEW and zero
open findings remain required; repair repeats until PASS. The local budget
ceiling is consumed as controller evidence, not a signed grant. No signer,
Keychain, provider credential or native attestation is implemented here.

## Acceptance and implementation prompt

Test proposal indexing, prior-set completeness, explicit untouched handling,
separate new proposals, all allowed transitions, invalid transition rejection,
replay/conflict, quarantine and pre-dispatch repair intent. Implement only
these contracts. Do not implement repair execution, budget transport,
checkpoints, activation or release. Do not access credentials or Keychain.
Return files/tests/commands/results/acceptance/unresolved issues/ICRs; do not
commit.

## Normative Start/dependency gate

The common development Start contract is master §7.4, incorporated in full.
Predecessor: `C30-07`. Check procedure/current applicable G1/G3,
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
