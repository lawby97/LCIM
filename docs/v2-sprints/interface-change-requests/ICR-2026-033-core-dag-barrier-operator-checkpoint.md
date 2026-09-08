# ICR-2026-033 — source chain, checkpoint/barrier generations and CAS

- **Date:** 2026-03-09 (V4 stopping-rule scope decision)
- **Origin:** core-plan dependency reconciliation
- **Status:** `PLAN_AMENDED_PENDING_INDEPENDENT_V8_REVIEW` — no gate approval
- **Affected units:** BOOTSTRAP, C30-02, C30-10, C30-11, C30-12 through C30-14

## V7 persistence-consumer reconciliation

G3-V6-P1-01/02/03 remain PLAN_AMENDED_PENDING_G3_REREVIEW_V7, not approval.
Master §2.3C requires the complete pre-operation source/checkpoint proof closure
inside the private v2 publication manifest, never a mutable registry pointer.
§§2.3/2.5D alone define full staging and complete new/reused ancestor durability,
including confirmed exact-existing completion. §3.4C copies the retained
prepared side separately from newly verified current inputs. The fourteen predecessor mappings and grouped barriers remain. V8 deliberately
changes Start contracts and separates qualified external source administration
(master §2.7/§7) from runtime writers; no source registry is created by this edit.

## Exact change

```text
SIGNER_V4_CONTROLLER_ATTESTATION:
BLOCKED_PENDING_STRONGER_MACOS_EXECUTABLE_ATTESTATION

LCIM_3_0_SIGNER_GATE:
REMOVED_BY_SCOPE_DECISION

LCIM_3_1_EXTERNAL_OPERATOR_SIGNER:
DEFERRED_TO_LCIM_3_1
```

Retain Bootstrap Checkpoint V2's exact prepare-before-commit and
verify-after-commit commands and its external source-generation chain. Every
active Start block uses the immediately preceding current verified successor
SHA. Checkpoint, barrier, combined-repair and operator verification records
remain exact-generation/CAS records.

The V4 signer stopping rule does not alter the DAG, repair loop, source
continuity, manual commit boundary or downstream unlock. It removes only the
cryptographic signer prerequisite. Current local plan confirmation/current
budget evidence and the actual C30-13-issued production capability are required
for mutation, not for read-only source identity proof.

Every active Start deliberately changes to master §7.4: check accepted procedure,
current applicable G1/G3, qualified external tools and exact task authorization;
lock **before resolving** predecessor; verify identity/current head/non-supersession,
proof/reviewed commit/tree and accepted source evidence; bind development facts
not runtime records; record source-only admission/consumed generation under the
qualified external owner; externally create/verify checkout; recheck launches/
acceptance; publish only qualified separately authorized registry lock/CAS.
Missing phase predicates deny development; source mismatch is
`DENIED_STALE_OR_UNVERIFIED_SOURCE_CHECKPOINT`. C30-01 consumes
`BOOTSTRAP_CHECKPOINT_V2`; each later C30 consumes the immediately preceding
sprint. A plain SHA dependency is insufficient.

## Owned contracts

C30-10 owns checkpoint generations, barrier execution generations,
combined-barrier repair subjects, exact current sibling inputs,
`APPROVED_WAITING_AT_BARRIER`, deterministic composition, atomic invalidation
and replay/quarantine. The exact order is:

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

`APPROVED_WAITING_AT_BARRIER` never follows barrier FINAL_REVIEW. The operator,
not C30-11, creates Git commits. Standalone Bootstrap supplies the mandatory
verifier/tool/import/schema/canonicalization closure, immutable outputs, registry/
head/CAS initialization/crash recovery, review acceptance, currentness/admission/
consumed handoffs and retained proof export before C30-01. C30-11 integrates/
extends already G1-qualified support; C30-12 integrates lineage/recovery consumers.
AWAITING_OPERATOR_CHECKPOINT_COMMIT is runtime state, not a C30-11 construction
gate. Procedure: clean parent → exact reviewed overlay → prepare before staging
→ operator exact-path commit → clean-successor verify → separate registry CAS.
Prepare/verify preserve source/index/refs but write named external outputs;
no clean-worktree requirement after applying the intended overlay. C30-14 owns
manual delivery, not remote publication.

No checkpoint/barrier consumer requires a signed plan, signed witness, signed
activation or signed distribution envelope. The local consistency witness is
owned by C30-03 and detects local divergence while its journal survives; it is
not an anti-rollback signature or secure monotonic anchor.

## V9 recurring source handoff — SEQ-V8-P1-01

Master §6.2 is incorporated in full: after BL/seed/source change, external review
without stale runtime capability → qualified prepare before staging → separately
authorized operator exact-path commit → clean-successor verify → separately
authorized registry CAS → accepted-generation gate applicability (full integrated
G2 renewed for changed closure; changed G1/G3 renewed; unchanged scope needs
verified carry) → separately authorized successor and durable/current/fresh-TTY
eligibility. FINAL_REVIEW alone is not G2. Qualify changed verifier before its
first authoritative use. S'' invalidates affected S' evidence again. Resume all
seven §6.2 phases by exact proof/current head, never duplicate commit/CAS or
relabel historical build/rehearsal evidence. Initial §§7–8 sequence is unchanged.

## Retained V8 predicates and append-absent durability

Master §§7–8 require procedure/scope acceptance/G3/operator adoption, actual
qualified external tools and finite authorization before isolated Bootstrap
construction; G1 of actual final subject before real adoption; current G1/G3,
task/current predecessor for C30 construction; final G2 after complete integration
including relevant C30-14 closure, not C30-07 alone; then all applicable current
approvals and separate authorization for runtime activation/use. Source reviews
use EXTERNAL_DEVELOPMENT_REVIEW and qualified §7.3 acceptance, never runtime
Sol/finding/accounting/capability records. U1–U5 remain unresolved and dependent
phases denied; no adoption, qualification or construction is granted here.
G3-V7-P1-01 expands COMMIT under §§2.5B/2.5D/4.5: integer private version 3 binds
physical-ledger bytes/path and both full chains; pinned ledger-file/full-chain
fsync precedes first witness byte. Effects are ledger fsync-only, repeated on
fresh-authority recovery, no bundle-derived ledger durability/duplicate COMMIT/
ABANDON of matching ledger. Non-COMMIT stays integer 2. Runtime COMMIT differs
from developer Git commit and external source CAS. G1/G2 pending; G3
CHANGES_REQUIRED_PENDING_FRESH_REREVIEW. G3-V8-P1-01 additionally requires master
§§2.5B/2.5D's branch-bound exact-existing COMMIT completion before bundle/suffix
flushes, ZERO bytes/records and same-session knowledge before use. §15 is active
V9 modeling; §§12–14 are historical; parent G3-V7-P1-01 is not independently resolved.

## Migration and limits

Historical cryptographic records remain historical/3.1 migration inputs and
are not rewritten or consumed as executable LCIM 3.0 authority. A source
change invalidates all descendant validation, Sol coverage, findings,
checkpoints, barriers, local activation settlement and manual delivery
manifests. Regeneration proceeds in dependency order.

LCIM 3.0 does not claim resistance to hostile same-UID processes, root/kernel
compromise, debugging or memory theft of the live controller, malicious OS,
full-machine compromise or coordinated rollback of every local authority root.
