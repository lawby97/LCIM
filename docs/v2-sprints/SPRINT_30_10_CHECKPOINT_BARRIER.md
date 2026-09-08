# C30-10 — checkpoint/barrier generations and CAS

**Development gate:** master §§7–8 phases A–D: accepted external procedure/tools,
current applicable G1/G3, exact per-task authorization, accepted Bootstrap and
current immediate predecessor. G2 follows complete integrated implementation;
activation/use requires phase F, all current applicable G1/G2/G3 and separate
operator authorization. None is granted here. Component runtime prerequisites
below are not prerequisites to constructing their own code in isolated fixtures.

**Status:** `PLAN_AMENDED / IMPLEMENTATION_TESTS_PENDING`

**Depends on:** C30-09 verified successor source generation.

**Next:** `SPRINT_30_11_OPERATOR_COMMIT_CLI.md`.

## Objective

Consume the complete plan declaration without adding DAG semantics. Own exact
sprint checkpoint generations, barrier execution generations, combined-barrier
repair subjects and barrier events. Creation and invalidation occur in one
atomic transaction under the owner run lock.

## Exact generation bindings

Every checkpoint and barrier successor binds generation/predecessor IDs,
expected lifecycle/transaction/checkpoint/barrier heads, causal operation,
exact source/patch/subject identity, validation/Sol coverage identities, state
and invalidation/supersession reason. Barriers additionally bind template,
exact current sibling generations, common base, deterministic apply order,
overlap/attribution and combined subject.

A stale expected head is a conflict and cannot create a second current
generation.

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
byte replay does not quarantine merely because an operation ID was reused.

## External versus runtime checkpoints

Early source admission/head/CAS and acceptance exist under the qualified
standalone Bootstrap owner before C30-01 (master §7.2). This unit implements
runtime checkpoint/barrier consumers, not first availability of source support.
AWAITING_OPERATOR_CHECKPOINT_COMMIT below is runtime state; it cannot gate
construction of C30-11. Runtime COMMIT uses master §§2.5B/2.5D/4.5's expanded
ledger-fsync prerequisite; developer Git commit/registry CAS are distinct.

## States

```text
CHECKPOINT_REVIEW_PENDING
APPROVED_WAITING_AT_BARRIER
BARRIER_INPUTS_CURRENT
BARRIER_REPAIR_REQUIRED
AWAITING_OPERATOR_CHECKPOINT_COMMIT
BARRIER_COMMITTED
INVALIDATED_SUPERSEDED
QUARANTINED_INTEGRITY_FAILURE
```

Required order is exactly:

1. each sibling independently reaches complete current-generation Sol PASS;
2. each sibling emits its current checkpoint generation;
3. each sibling enters `APPROVED_WAITING_AT_BARRIER`;
4. the controller forms a barrier from the exact current sibling generations
   and common base;
5. composition/apply occurs in the declared deterministic order;
6. deterministic combined validation runs;
7. complete barrier FINAL_REVIEW runs;
8. actionable findings trigger combined repair, successor subject, validation,
   exact RECHECK and a new complete FINAL_REVIEW;
9. zero open actionable findings is established;
10. state enters `AWAITING_OPERATOR_CHECKPOINT_COMMIT`;
11. operator creates the grouped commit manually;
12. read-only verification proves the exact parent/tree/manifest/commit;
13. state becomes `BARRIER_COMMITTED`;
14. only the exact verified grouped commit SHA unlocks downstream work.

Any integrity mismatch, missing predecessor, CAS divergence or torn event
quarantines. Invalidated/quarantined states are terminal for ordinary
transitions. A checkpoint cannot commit alone.

`APPROVED_WAITING_AT_BARRIER` never appears after barrier FINAL_REVIEW.
RECHECK never approves a barrier. Every successor receives scan-PASS,
deterministic validation, exact RECHECK where applicable and complete current-
generation FINAL_REVIEW.

## Owned families

| Family | First emitter | Consumers |
|---|---|---|
| `lcim.sprint-checkpoint@1` | reviewed generation | barriers/operator |
| `lcim.barrier-template@1` | plan declaration | execution |
| `lcim.barrier-execution-generation@1` | resolved inputs | composition/review |
| `lcim.barrier-composition@1` | ordered apply | review/operator |
| `lcim.barrier-combined-repair-subject@1` | combined repair | checkpoint/review |
| `lcim.barrier-event@1` | barrier transaction | audit/recovery |

## Local authority and scope

Controller mutation requires the actual C30-13-issued production capability.
Checkpoint/barrier records consume the **current** `lcim.local-plan-confirmation@1`,
current `lcim.local-budget-ceiling@1`, and committed local consistency evidence;
no signed plan, witness,
activation or distribution family is required. No Keychain or external signer
is used.

## Implementation prompt

Implement only source-bound checkpoint generations, barrier generations,
combined subjects, exact CAS bindings, `APPROVED_WAITING_AT_BARRIER`,
deterministic composition, sibling approval, atomic invalidation and replay/
quarantine. Do not create commits or implement activation/release. Do not
access credentials or Keychain. Return files/tests/commands/results/acceptance/
unresolved issues/ICRs; do not commit.

## Normative Start/dependency gate

The common development Start contract is master §7.4, incorporated in full.
Predecessor: `C30-09`. Check procedure/current applicable G1/G3,
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
