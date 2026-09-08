# C30-02 — complete plan declaration and local confirmation

**Development gate:** master §§7–8 phases A–D: accepted external procedure/tools,
current applicable G1/G3, exact per-task authorization, accepted Bootstrap and
current immediate predecessor. G2 follows complete integrated implementation;
activation/use requires phase F, all current applicable G1/G2/G3 and separate
operator authorization. None is granted here. Component runtime prerequisites
below are not prerequisites to constructing their own code in isolated fixtures.

**Status:** `PLAN_AMENDED / IMPLEMENTATION_TESTS_PENDING`

**Depends on:** C30-01 verified successor source generation.

**Next:** `SPRINT_30_03_PROTOCOL_LEDGER.md`.

## Objective

Freeze the complete LCIM 3.0 DAG, source-generation head, stage/barrier/base/
unlock semantics and local authority consumption before protocol genesis. This
unit does not append a runtime transaction or invoke a provider.

## Complete declaration

The declaration contains exactly:

```text
planVersion, protocolVersion, repositoryIdentity, sourceGeneration,
localAuthorityFamilies, baseDeclarations, nodes, edges, sprintContracts,
writeScopes, parallelReadyRules, barrierTemplates, commonBaseDeclarations,
deterministicApplyOrders, ownNodeInclusionRules, unlockSets, finalBarrier,
checkpointPolicy, operatorCommitPolicy, activationPolicy, releasePolicy,
modelRoutingPolicy, budgetCeilings
```

Each node freezes node ID, contract digest, write scope, base rule,
dependencies, validation/review profile, checkpoint policy, source-generation
predecessor and unlock set. Each barrier freezes inputs, dependency rule,
common base, deterministic order, own-node inclusion, overlap/attribution,
combined-repair policy and unlock set. Unknown family or consumer combinations
fail closed.

## Local plan confirmation

Freeze:

```text
lcim.local-plan-confirmation@1
```

C30-02 owns constructor/schema semantics; C30-13 publishes the genesis
candidate in its one canonical transaction-zero bootstrap. Read-only successor
preflight constructs a plan-confirmation successor only after the exact budget
and session successors, and C30-13 may publish it only in the exact four-
candidate successor-activation transaction. Neither form may refer to genesis,
activation or later IDs. The exact strict shape, ID/digest domains, JCS
preimages, genesis/predecessor/current-head CAS, replay, supersession, drift
invalidation, denial codes and future-version rule are master §§3.0 and 3.2.

```text
planDeclarationDigest = SHA-256("LCIM-PLAN-DECLARATION-v1\0" || JCS(payload))
planId = "lcim_plan_" || hex(planDeclarationDigest)
```

The domain ends in one byte 00, not backslash-zero. Master §3.4A copies this
existing domain-separated identity into prepared/current binding snapshots and
compares the exact retained owner payload bytes; it does not substitute a raw
hash or regenerate the plan during PREPARE recovery (§3.4B). Successor private
content/equality rules are master §2.3A; no plan or budget semantics change.
Master §2.5C uses this same exact plan/source/guidance identity for the intended
PRE_JOURNAL initialization display without publishing a plan record. §3.4C's
PERSIST_ABANDON_EVIDENCE copies the exact non-secret owner payload stream into
its closed input capsule before terminal append; C30-02 supplies bytes read-only
and gains no persistence authority. The eight-action/per-class matrix is §4.5;
no candidate, public family, ceiling or barrier count changes.

The local confirmation is integrity-chained controller evidence. It is not a
digital signature or independent identity proof. A changed plan, source,
configuration, routing policy or budget invalidates it and requires a new TTY
confirmation. No consumer may require a cryptographic plan attestation.

## Generation and barrier CAS

Every plan and later source generation binds the expected current head,
predecessor manifest digest, predecessor verified successor SHA, exact parent/
tree/candidate/changed set, active-guidance universe, verifier identity,
review/validation identities and expected-head CAS. An earlier source change
invalidates all descendants and requires regeneration from the top.

Only exact current sibling checkpoint generations form a barrier. Creation and
invalidation are one transaction under the owner run lock. Stale or sibling-
successor generations are conflicts.

## Owned interfaces

| Family | First emitter | Consumers | Evidence |
|---|---|---|---|
| `lcim.plan-manifest@1` | C30-02 | protocol/all nodes | immutable declaration replay |
| `lcim.local-plan-confirmation@1` | C30-02 constructor, published in the C30-13 transaction-zero or successor-activation transaction | C30-03 ledger; C30-04 Git; C30-05 accounting; C30-06 artifacts; C30-07 provider/review; C30-08 findings; C30-09 repairs; C30-10 barriers; C30-11 operator checkpoint; C30-12 recovery/audit; C30-13 activation; C30-14 delivery | local integrity chain |
| `lcim.source-generation-head@1` | qualified external Bootstrap source owner before C30-01; C30-02 integrates plan consumer | external Start/source lineage; runtime barriers via explicit consumer validation | exact successor CAS |
| `lcim.activation-check-contract@1` | C30-02 | side-effect APIs | module-private capability requirement |

## Acceptance and recovery

Reject missing nodes/edges, missing own-node inclusion, missing common bases,
nondeterministic order, incomplete barriers, unbound unlocks, future commit
claims, circular identity, changed plan/source/configuration/routing/budget,
unknown local family combinations and stale heads. A changed declaration is a
new plan/version and new operator confirmation, not an in-place edit.

## Preserved orchestration

Pi deepseek-v4-flash (thinking "max", LCIM reasoning MAX) remains the sole implementation/repair worker and Pi openai-codex gpt-5.6-sol XHIGH remains
controller-owned. Validation precedes review; exact RECHECK never approves a
stage; repair repeats until zero open findings. No live candidate-provider request or real credential is used by this unit's
isolated tests. External development-model work is separately gated by §7.

## Implementation prompt

Implement only the complete non-circular plan declaration, source-generation
head, local family consumption, common bases, barriers, apply order, own-node
inclusion, unlocks and local confirmation inputs. Do not implement protocol
transactions/genesis, Git, Flash/Sol transport, scan, findings, budget
execution, repair, checkpoints, activation execution or release. Do not
access credentials or Keychain. Return files/tests/commands/results/acceptance/
unresolved issues/ICRs; do not commit.

## Normative Start/dependency gate

The common development Start contract is master §7.4, incorporated in full.
Predecessor: `C30-01`. Check procedure/current applicable G1/G3,
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
