# LCIM 3.0 core sprint planning

This directory contains planning-only LCIM 3.0 documentation. The controlling
plan is `00B_MASTER_PLAN_LCIM_3_0_CORE.md`; it incorporates the accepted V4
stopping rule and the local-authority scope decision.

```text
SIGNER_V4_CONTROLLER_ATTESTATION:
BLOCKED_PENDING_STRONGER_MACOS_EXECUTABLE_ATTESTATION

LCIM_3_0_SIGNER_GATE:
REMOVED_BY_SCOPE_DECISION

LCIM_3_1_EXTERNAL_OPERATOR_SIGNER:
DEFERRED_TO_LCIM_3_1

LCIM_3_0_IMPLEMENTATION_START:
BLOCKED_PENDING_PHASE_PREREQUISITES_AND_TASK_AUTHORIZATION
```

The failed V4 experiment remains blocked; its status above is not a deferred
status. V4 evidence is historical and non-authoritative. Do not create V5, repair the
broad Signer V2 design, implement an external signer or add another native
attestation spike.

## Local 3.0 authority

LCIM 3.0 uses the controlling plan's fixture-only non-authority, wholly
read-only A0 computation, one-use C30-13 A1/exact-tail transaction-zero
authority, the C30-13-only one-action
`SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY` for stale committed activation
while capability is absent, and C30-13-only `PRODUCTION_RUNTIME_CAPABILITY`. A0 writes no session, budget, plan,
genesis, activation, ledger, witness or envelope byte. C30-01 owns session and
object-construction semantics but does not publish the bootstrap transaction or
issue production authority. The seventh G3 amendment (master §§2.3/2.3C/2.5D)
requires inline prepared-input capsules in both private v2 manifests, fully
populated staging-directory fsync and one complete ancestor/anchor durability
procedure, including reused paths and confirmed exact-existing completion.
§3.4C v2 evidence copies retained prepared inputs separately from newly observed
current inputs. Eight/seven actions remain; successor never initializes.
No A0 fsync, hidden writer, public family or authority is added. The three
G3-V6-P1 findings retain their prior plan-amended status. V8 G3-V7-P1-01
expands COMMIT to a private integer version-3 physical-ledger byte/path
prerequisite and both complete existing chains; pinned ledger-file/full-chain
fsync and all-facts/expiry recheck precede first witness COMMIT byte. Non-COMMIT
remains integer 2. Effects are ledger fsync-only, repeated after earlier success/
restart; bundle completion supplies no ledger durability. No duplicate COMMIT
or ABANDON of matching ledger. V9 master §§2.5B/2.5D/4.5 additionally require
closed commitBranch COMPLETE_EXACT_EXISTING for readable complete COMMIT:
fresh one-use ledger-then-witness fsync-only completion before bundle/suffix
flushes, ZERO bytes/records, exact same-session knowledge before use. §6.2 is
the single recurring post-BL/source-change checkpoint/adoption/requalification
sequence: qualified prepare before staging, operator commit, verify, separate
registry CAS, exact generation gate applicability/full G2 renewal for changed
closure, then separate successor authorization. FINAL_REVIEW is not G2; qualify
changed verifier before use; S'' invalidates again. §15 is active V9
modeling and §12 recorded pins historical. G1/G2 pending, G3
CHANGES_REQUIRED_PENDING_FRESH_REREVIEW; amendment is not approval.

A controlling-TTY confirmation binds repository, source commit/tree, plan,
configuration, model routes, finite ceilings, operation and reviewed
source-generation identity. The C30-13-issued production capability is module-private, opaque,
non-serialized, non-persisted, unavailable to Flash/Sol/validation/target
code, and absent after restart. Successor publication has exactly four ordered
candidates (budget, operator session, plan confirmation and activation), no new
genesis, uses one-action/one-mutation instances, and cannot grant capability. No public record represents it. It is not cryptographic proof of operator or
process identity.

The six local families are `lcim.local-operator-session@1`,
`lcim.local-plan-confirmation@1`,
`lcim.local-budget-ceiling@1`, `lcim.local-consistency-witness@1`,
`lcim.local-activation-settlement@1` and `lcim.manual-delivery-manifest@1`.
They are controller evidence, not signed grants or digital signatures. No
macOS Keychain dependency is permitted.

Transaction-zero has exactly five publication candidates in order: budget,
operator session, plan confirmation, non-runnable protocol/run genesis, and
activation settlement. This is four local-record candidates plus one non-
runnable genesis candidate. The consistency witness is the PREPARE/COMMIT
publication protocol, not a candidate record; C30-14 emits the manual delivery
manifest later.

## Active serial order

Exactly fourteen active C30 sprint documents remain:

1. `SPRINT_30_01_AUTHORITY_ROOT.md`
2. `SPRINT_30_02_PLAN_DECLARATION.md`
3. `SPRINT_30_03_PROTOCOL_LEDGER.md`
4. `SPRINT_30_04_HARDENED_GIT.md`
5. `SPRINT_30_05_FLASH_TRANSPORT_BUDGET.md`
6. `SPRINT_30_06_ARTIFACT_SCAN.md`
7. `SPRINT_30_07_SOL_CONTRACTS.md`
8. `SPRINT_30_08_FINDING_TRANSACTIONS.md`
9. `SPRINT_30_09_REPAIR_ENGINE.md`
10. `SPRINT_30_10_CHECKPOINT_BARRIER.md`
11. `SPRINT_30_11_OPERATOR_COMMIT_CLI.md`
12. `SPRINT_30_12_RECOVERY_AUDIT_CLI.md`
13. `SPRINT_30_13_ACTIVATION_BOOTSTRAP.md`
14. `SPRINT_30_14_PROVENANCE_RELEASE.md`

Master §§7–8 propose adopted external procedure/scope, applicable G3, qualified
external tools and finite authorization before standalone Bootstrap construction;
G1 of actual final support before separately authorized real adoption; current
G1/G3, task authorization, accepted Bootstrap and current predecessor before
C30 construction; full G2 after complete integration/relevant C30-14 closure,
not C30-07 alone; all current applicable approvals and separate authorization
before runtime use. No adoption/qualification/construction is granted here.

Standalone Bootstrap owns verifier/tool/import/schema closure, immutable outputs,
registry/head/CAS initialization/recovery, review acceptance, source admission/
currentness/consumed evidence and retained proof export before C30-01. C30-11/12
integrate qualified support/consumers. All Start blocks change to master §7.4:
check procedure/G1/G3/tools/task, lock before resolving current predecessor,
verify identity/head/non-supersession/proof/reviewed source, bind development facts
not runtime records, record external source-only admission, externally create
checkout, recheck launches/acceptance, and publish only qualified separately
authorized registry CAS. Stale input denies work; C30-01 consumes
BOOTSTRAP_CHECKPOINT_V2, each later C30 its immediate predecessor.

EXTERNAL_DEVELOPMENT_REVIEW source inputs are eligible for activation/delivery
under master §7.3, not runtime Sol/finding/accounting/capability events. Retain
independent locked roles, immutable inputs/tools, scanning/validation, complete
coverage/zero findings and repair → successor validation → exact RECHECK →
complete FINAL_REVIEW with qualified acceptance. U1–U5 remain unresolved.
Candidate tests use isolated synthetic/local mocks; external model requests
need separately accepted tools/isolation and finite enforceable upstream-request/
spend controls, not stock Pi/session counts. This requested Luna documentation
edit is not authorization as a runtime implementation worker.

## Preserved orchestration

Pi deepseek-v4-flash (thinking "max", LCIM reasoning MAX) remains the sole implementation/repair worker. Pi openai-codex gpt-5.6-sol XHIGH remains a
controller-owned reviewer. Validation precedes review, exact RECHECK is
preserved, complete current-generation FINAL_REVIEW and zero open findings are
required, and repair continues until PASS. Request accounting, declared DAGs,
sibling checkpoints, dependency barriers, combined-barrier repair, manual
grouped commits, read-only verification, BL-023, BL-028 and the
`DELIVERY_READY_MANUAL` endpoint remain unchanged.

## Threat-model boundary

LCIM 3.0 does not claim resistance to hostile same-UID processes, root/kernel
compromise, debugging or memory theft of the live controller, a malicious OS,
full-machine compromise or coordinated rollback of every local authority root.
It does structurally isolate Flash, Sol, deterministic validation,
target-controlled scripts, target worktrees and model prompts/outputs from
controller-owned authority, provider credentials, request accounting and
Git-control surfaces.

`LCIM_3_1_FUTURE_DELIVERY_SECURITY.md` is a separate `NOT_READY` roadmap for
`EXTERNAL_OPERATOR_SIGNING_SERVICE`. It owns future cryptographic signing,
key custody, authenticated transport, revocation, independent audit and
stronger attestation where required. It need not run on the same Mac or UID.

Historical S00–S11 documents and the three old ICR records are not active 3.0
instructions. Exactly five active core ICRs remain: ICR-2026-030 through
ICR-2026-034.
