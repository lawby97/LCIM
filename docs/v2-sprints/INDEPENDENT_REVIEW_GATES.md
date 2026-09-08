# LCIM 3.0 mandatory independent review gates — targeted V9

**Status:** `READY_FOR_V9_DOCUMENTATION_REVIEW`; development remains
`BLOCKED_PENDING_PHASE_PREREQUISITES_AND_TASK_AUTHORIZATION`.
This planning register grants no adoption, external-tool qualification, source
construction, provider access, credential access, LCIM run, commit, publication
or runtime activation/use. Master §§7–8 control the proposed phase predicates.

## Accepted V4 stopping rule

```text
SIGNER_V4_CONTROLLER_ATTESTATION:
BLOCKED_PENDING_STRONGER_MACOS_EXECUTABLE_ATTESTATION

LCIM_3_0_SIGNER_GATE:
REMOVED_BY_SCOPE_DECISION

LCIM_3_1_EXTERNAL_OPERATOR_SIGNER:
DEFERRED_TO_LCIM_3_1
```

V4 remains blocked historical feasibility evidence, not deferred or repaired.
No new signer/native-attestation spike is authorized. Cryptographic signer
custody and strong same-UID attestation are LCIM 3.1 scope.

## Proposed sequence — not completed phases

| Phase | Required-before predicate |
|---|---|
| A procedure adoption | independent acceptance, applicable G3 approval and operator adoption; actual external-tool qualification remains unmet until evidenced |
| B standalone Bootstrap candidate construction | A, actually qualified external development tools/isolation/spend controls and explicit finite construction authorization; real implementation/testing in isolated candidate storage; G1 cannot precede construction of its own subject; no real source-head publication/activation |
| C G1 and separate Bootstrap adoption | actual final verifier/support/schema/tool identities and complete evidence reviewed by G1; current G1 plus separate operator authorization before qualified prepare/verify and registry lock/CAS accept the real Bootstrap successor |
| D C30 development | current applicable G1/G3, accepted external procedure/tools, explicit per-task authorization, accepted Bootstrap and exact current immediate predecessor; ordered C30-01–14; G2 need not precede construction of its subject |
| E final integrated G2 | actual full transitive implementation/evidence; C30-07 alone insufficient, C30-13 earliest possible complete source point, relevant C30-14 packaging/closure included; schedule after complete integration, not prototype/mock assertions |
| F activation/use | all applicable current G1/G2/G3, exact identities, complete implementation/integration evidence and separate operator authorization; C30-13 alone runs activation and issues capability after required durable matching COMMIT |

This replaces the circular blanket G1/G2/G3-before-all-implementation gate.
Candidate construction is explicitly conditional **real implementation**, not
relabeled preparation. The unfinished runtime does not build/review itself.
Every missing prerequisite denies its dependent phase. Stock/manual Pi or
session counts do not establish enforceable finite upstream-request/spend
controls. Candidate tests use isolated fixtures, synthetic credentials and local
mocks; no production credentials/state or live candidate-provider calls before
qualification. Separately authorized external development-model requests require
accepted tools, isolation and enforceable controls. None is established here.

## Gate G1 — `BOOTSTRAP_CHECKPOINT_V2_REVIEW`

**Status:** `INDEPENDENT_REVIEW_PENDING`

G1 reviews actual final standalone verifier and minimum source-administration
support, full executable/tool/import/schema/canonicalization closure, complete
active guidance, immutable preparation/proof outputs, registry/head/CAS
initialization/crash recovery, review/validation acceptance, currentness,
source-only admission/consumed-generation handoffs and finite retained proof
export for master §2.3C. First availability is **before C30-01**, not C30-11/12.
C30-11 integrates/extends qualified support; C30-12 integrates lineage/recovery
consumers. Changed subject identities require applicable requalification.

The operator procedure is clean parent → exact reviewed overlay → prepare before
staging → operator exact-path local commit → clean-successor verify → separately
authorized registry publication under lock/CAS. Do not demand a clean worktree
after the intended overlay. Prepare/verify are source/index/refs read-only but
explicitly write only named external immutable manifest/proof outputs. Git
commit, source registry CAS and runtime witness COMMIT are distinct operations.

## Gate G2 — `SOL_TRANSPORT_V3_SECURITY_REVIEW`

**Status:** `INDEPENDENT_SECURITY_REVIEW_PENDING`

Review the actual final sealed entry, loader/source manifest, stdin ask, FD-3
ACCOUNTING_AUTHORITY_ONLY, request-dispatch authority, OAuth/model egress
interception, Pi dependency closure, cleanup, credential isolation/scans,
body-bound accounting, crash settlement and negative process/FD evidence.
The transitive integrated implementation and relevant C30-14 closure must exist;
C30-07 design or prototype evidence alone cannot satisfy G2. Any demanded
preapproval live effect is unresolved U5, not permission to execute it.
No authoritative runtime Sol invocation, activation/use or RC delivery precedes
full applicable qualification. EXTERNAL_DEVELOPMENT_REVIEW source reviews are
separate eligible source-qualification inputs under master §7.3, not runtime
Sol calls, findings/accounting events or production capabilities.

## Gate G3 — `LOCAL_AUTHORITY_SCOPE_REVIEW`

**Status:** `CHANGES_REQUIRED_PENDING_FRESH_REREVIEW`

G3 independently reviews the proposed external procedure/authority boundary and
local operator display/binding, private one-use authority, restart behavior,
plan/budget/witness/activation/manual-delivery scope. No local record is a
signature, independent identity proof or remote authority. A future G3 PASS
means LOCAL_AUTHORITY_SCOPE_APPROVED only, not G1/G2, tool readiness, adoption
or construction permission.

| Finding | Amendment status | Controlling contract |
|---|---|---|
| G3-V6-P1-01/02/03 | prior V7 plan-amended status retained, no approval | master §§2.3/2.3C/2.5D retention/sealing/ancestors |
| G3-V7-P1-01 | historical V8 amendment, not independently resolved; combined review CHANGES_REQUIRED | retained append-absent ledger-first path |
| G3-V8-P1-01 | AMENDED_PENDING_INDEPENDENT_V9_REVIEW | master §§2.5B/2.5D/2.7/2.8/4.4/4.5 exact-existing terminal completion |
| SEQ-V8-P1-01 | AMENDED_PENDING_INDEPENDENT_V9_REVIEW | master §6.2 recurring generation-bound adoption/requalification |

Independent combined V8 review returned CHANGES_REQUIRED for exactly the two
V8 findings above. Only those are amended; initial §§7–8 phases remain intact.
V9 adds required commitBranch APPEND_ABSENT or COMPLETE_EXACT_EXISTING to private
version 3; non-COMMIT version 2 forbids it and ledgerCommitPrerequisite. Complete
COMMIT without exact session knowledge offers fresh C30-13 one-use exact-existing
ledger-then-witness/full-chain fsync, ZERO bytes/records, before bundle/suffix
flushes, even with visible bundle. No prior ledger durability or old writer proof
gates issuance. Exit/relevant change loses knowledge; truncation remains separate
and needs re-completion. Logical COMMITTED never implies eligibility. §2.5D's
remaining sealed-bundle/no-suffix/current-fact/qualification/TTY checks still apply.
§6.2 requires accepted successor checkpoint then generation-bound applicability:
full G2 for changed closure, G1/G3 for changed subjects, verified unchanged scope
for carry; changed verifier qualifies before first use; S'' invalidates again.

APPEND_WITNESS_COMMIT's retained APPEND_ABSENT branch keeps raw framed-byte SHA,
integer observationVersion 3, LEDGER_WITHOUT_COMMIT and closed non-null
ledgerCommitPrerequisite (actual physical
ledger path/complete length/SHA) and both complete existing path chains through U.
After matching C30-13 one-use claim and descriptor/name checks, flush exact
ledger file and all containing directories bottom-up through R/U, recheck all
facts/expiry, then first witness COMMIT byte and full witness durability.
Ledger effects are fsync-only; failure prevents COMMIT; process loss requires
fresh confirmation and repeated prerequisite. No old v2 COMMIT, silent rebind,
duplicate COMMIT or ABANDON of matching ledger. Non-COMMIT stays integer 2.
Six public local families, five/four candidates, nine/eight bundle entries and
eight/seven actions remain. Master §15 is the active V9 model; V5/V7/V8 recorded
counts/pins are historical. Frozen V7 and prior packets/captures/validators
remain untouched. No new packet or independent PASS is generated.

## Unresolved prerequisites — master §8.1 register

| ID | Owner | Required before | Missing evidence |
|---|---|---|---|
| U1 | external development tool/operator owner and independent acceptors | B and every D/model launch | actual tool identities, isolation and enforceable finite request/spend-control qualification |
| U2 | standalone Bootstrap/source owner and G1 | candidate contract before B; final G1/C; early handoffs before C30-01 | final schemas/storage/initialization/recovery contract, closure, negative tests and retained proof export |
| U3 | external review/acceptance owner, G1 and C30-13/14 consumers | G1 review-input acceptance, C/D handoffs and F/delivery | closed EXTERNAL_DEVELOPMENT_REVIEW acceptance formats, complete coverage/zero findings/repair lineage and consumer validation |
| U4 | C30-07/13/14 owners and G2 | E then F | actual final transitive V3 source/executable/dependency closure and integrated evidence |
| U5 | demanding gate owner, independent acceptors and operator | dependent evidence phase/approval | accepted non-live evidence alternative or separately approved bounded procedure for otherwise prohibited preapproval live effects |

Accepted source review requires independent Flash author/Sol reviewer with exact
locked routes, immutable source/evidence/tool universe, scan/validation before
review, complete coverage/zero actionable findings, repair → successor validation
→ exact RECHECK → complete FINAL_REVIEW, retained safe inputs/results and
qualified checkpoint acceptance. No production capability or fabricated runtime
records are required. The manually requested Luna documentation edit changes
no future source-worker role. None of U1–U5 is resolved by this edit.

## Current readiness

```text
G1: INDEPENDENT_REVIEW_PENDING
G2: INDEPENDENT_SECURITY_REVIEW_PENDING
G3: CHANGES_REQUIRED_PENDING_FRESH_REREVIEW
POLICY_PROCEDURE_ADOPTION: NOT_GRANTED
EXTERNAL_TOOL_QUALIFICATION: NOT_ESTABLISHED
CANDIDATE_CONSTRUCTION_AUTHORIZATION: NOT_GRANTED
RUNTIME_ACTIVATION_USE: BLOCKED
READINESS: READY_FOR_V9_DOCUMENTATION_REVIEW
```

Historical V8 executions remain master §14, not V9 proof. Both V9 model runs
and the corrected current audit completed; actual results and limitations are
master §16. The two findings are amended pending independent review only.
Readiness is documentation review only. The documented phase graph is a model, not actual tool qualification
or implementation readiness. Actual filesystem/TTY/security qualification and
fresh independent V9 review remain unperformed; the prior V8 CHANGES_REQUIRED
verdict is not erased.

## Bounded threat model and LCIM 3.1

No resistance is claimed to hostile same-UID processes, root/kernel compromise,
live-controller debugging/memory theft, malicious OS, full-machine compromise or
coordinated rollback of every local root. Structural isolation of workers,
reviewers, validation and target code from credentials/accounting/Git-control
surfaces remains mandatory. LCIM 3.1 EXTERNAL_OPERATOR_SIGNING_SERVICE separately
owns future key custody, signatures, revocation/rotation, authenticated transport,
independent audit/recovery and stronger attestation, possibly on another host/UID.
