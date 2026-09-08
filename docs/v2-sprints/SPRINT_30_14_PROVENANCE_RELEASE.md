# C30-14 — provenance, BL-023 rehearsal and manual delivery

**Development gate:** master §§7–8 phases A–D: accepted external procedure/tools,
current applicable G1/G3, exact per-task authorization, accepted Bootstrap and
current immediate predecessor. G2 follows complete integrated implementation;
activation/use requires phase F, all current applicable G1/G2/G3 and separate
operator authorization. None is granted here. Component runtime prerequisites
below are not prerequisites to constructing their own code in isolated fixtures.

**Status:** `PLAN_AMENDED / REHEARSAL_FIXTURES_PENDING`

**Implementation dependency:** verified C30-13 implementation SHA plus the
master §7 phase D development predicates. Implementing this unit does not require a
pre-existing production activation settlement.

**Next:** operator-only `RELEASE_GATE_BL023_CORE.md`.

## Objective and endpoint

Freeze source/build/artifact provenance, seeded BL-023 repair rehearsal,
fixture-only Git negative probes and BL-028 golden regression. LCIM 3.0 ends
at:

```text
DELIVERY_READY_MANUAL
```

It never performs remote delivery or claims production verification.

## Provenance and manual manifest

Source package version is `3.0.0`. Reproducible artifact bytes use sorted
paths, fixed ownership/modes/mtime and exact current source-generation/SHA/tree
identity. `artifactSha256` is over final bytes and is not embedded in them.

Freeze:

```text
lcim.manual-delivery-manifest@1
```

C30-14 is owner, first emitter and recovery owner. The strict canonical shape,
content-addressing exclusions, JCS ID/digest preimages, generation/CAS, replay,
supersession, invalidation, denials and future-version behavior are exactly
master-plan §§3 and 3.6. It binds package/version identity, exact artifact bytes,
source generation/commit/tree, schema/capability set, toolchain/build inputs,
complete Sol lineage, BL-023/BL-028 evidence and the **fresh current successor
activation**. C30-14 accepts that activation only when its
`candidateSetKind = "SUCCESSOR_ACTIVATION"`, its domain-separated four-candidate
publication has a durable exact matching witness COMMIT, C30-13 has reverified
it as the current activation generation and fresh controlling-TTY confirmation
has preceded capability issuance. The successor publication contains budget,
operator-session, plan-confirmation and activation-settlement candidates in
that order and no genesis. It contains exactly the master §3.6 fields and
claims no extra binding. It is manual evidence, not a digital signature or remote publication
authority.

Signed RC1/FINAL distribution families are not emitted or consumed by LCIM
3.0. They move to the LCIM 3.1 `EXTERNAL_OPERATOR_SIGNING_SERVICE` milestone.

## V8 final qualification and source-delivery eligibility

Include relevant C30-14 packaging/closure changes in the final G2 subject after
complete integration; C30-07 alone is insufficient and C30-13 is only the
earliest possible complete source point. Activation/use remains phase F with
all current G1/G2/G3, exact identities/integration evidence and separate operator
authorization. Accepted EXTERNAL_DEVELOPMENT_REVIEW source lineage is eligible
under master §§3.6/7.3 only after qualified closed-format consumer validation
(§8.1 U3); it is not runtime Sol/finding/accounting/capability evidence.
Runtime COMMIT deliberately includes master §§2.5B/2.5D/4.5's version-3 physical
ledger byte/path binding and ledger-file/full-chain fsync before first witness
byte. Developer Git commits and external source-registry CAS are distinct.
G3-V7-P1-01 is not independently resolved. V9 G3-V8-P1-01 adds the closed
version-3 commitBranch COMPLETE_EXACT_EXISTING: exact existing COMMIT uses fresh
one-use authority and ledger-then-witness/full-chain fsync-only completion, ZERO
bytes/records. It precedes bundle/suffix flushes, needs no old writer proof and
establishes only same-session exact relation knowledge. Exit/change invalidates
it; separate truncation requires re-completion. Logical COMMITTED alone is not
delivery/capability eligibility; master §§2.5B/2.5D's full rules apply.

## Implementation DAG

- C30-13 implements activation/bootstrap and its exact-tail recovery.
- C30-14 may depend on the verified C30-13 implementation SHA.
- C30-14 implements build, rehearsal and manual-delivery finalization.
- Completing the C30-13 implementation sprint does not mean production
  activation has already been performed.
- Implementing C30-14 does not require a pre-existing production activation
  settlement.

## Runtime sequence — SEQ-V8-P1-01

Master §6.2 is the single controlling generation-scoped sequence, incorporated
in full, including all ten steps, subject/first-use rules and seven resume points.
S → S' invalidates affected activation/capability/review/build/release/gate use.
External validation/RECHECK/seed-free FINAL_REVIEW must precede qualified prepare
before staging, separately authorized operator exact-path commit, clean-successor
verification, separately authorized registry CAS and accepted-generation gate
applicability. Changed G2 closure requires full integrated G2 renewal; changed
G1/G3 subjects require renewal; verified unchanged subjects need explicit current
applicability. FINAL_REVIEW alone is not G2. Qualify a changed verifier before
first authoritative use. Only then separately authorize successor activation,
durable settlement and current-fact/fresh-TTY capability/delivery. S'' repeats
affected invalidation; resume exact commits/CAS without duplication. Old build/
rehearsal evidence is never evidence of new bytes. These are FUTURE requirements.

The manual-delivery manifest consumes the fresh current activation, never the
invalidated predecessor activation. Remote publication, push, PR, CI, merge and
production verification remain outside LCIM 3.0.

The seed binds seed ID/digest/mutator intent/source generation/expected
invariant/expected finding identity and proof of absence from the real
repository. A missing finding, silent waiver or reuse of seeded evidence fails.
Seed removal invalidates all seeded coverage/reviews/checkpoints/barriers/
settlement and requires every master §6.2 checkpoint/adoption/requalification
step before fresh successor activation; retain historical seed evidence unchanged. The
successor publication authority is module-private, one-action/one-mutation and
cannot finalize delivery or grant capability; C30-14 never receives or uses it.

## Fixture-only negative probes and BL-028

In an origin-free controller-owned fixture execute exactly:

```text
/usr/bin/git push origin HEAD
/usr/bin/git push <hard-coded-local-fixture-url> HEAD:<fixture-ref>
```

Both fail nonzero, preserve manifests, expose no credential, reach no outside
network and clean only owned paths. Record exact before/after evidence and
quarantine uncertain cleanup.

The BL-028 golden fixture has an existing release with identity/effective-date
authority `UNKNOWN` while the source row/record remains. The result must have
no clipping, no silent drop, an explicit diagnostic and audit evidence bound
to the unresolved reason.

## Owned families and scope

| Family | First emitter | Consumers |
|---|---|---|
| `lcim.build-provenance@1` | reproducible build | release |
| `lcim.rehearsal-seed@1` | fixture mutator | BL-023 |
| `lcim.release-gate-report@1` | rehearsal gate | release |
| `lcim.manual-delivery-manifest@1` | C30-14 | C30-12 recovery/audit inspection; C30-13 activation-dependent consistency; C30-14 manual-delivery finalization; human delivery operator |
| `lcim.delivery-ready-manual@1` | finalizer | operator only |

C30-14 has no cryptographic signer, signed distribution, Keychain, remote
publication or production verification dependency. The module-private
capability is required for controller finalization and is not persisted.

## Preserved orchestration and implementation prompt

Pi deepseek-v4-flash (thinking "max", LCIM reasoning MAX) remains the sole implementation/repair worker. Pi openai-codex gpt-5.6-sol XHIGH remains
controller-owned. Validation, exact RECHECK, complete FINAL_REVIEW,
repair-until-PASS, zero open findings, BL-023, BL-028, manual grouped commits
and read-only verification remain mandatory.

Implement only reproducible provenance, source lineage, manual manifest,
fixture-only BL-023 repair/negative probes, BL-028 and sanitized reporting. Do
not run a real provider request, create a commit, mutate a remote or claim
production. Do not access credentials or Keychain. Return files/tests/
commands/results/acceptance/unresolved issues/ICRs; do not commit.

## Normative Start/dependency gate

The common development Start contract is master §7.4, incorporated in full.
Predecessor: `C30-13`. Check procedure/current applicable G1/G3,
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
