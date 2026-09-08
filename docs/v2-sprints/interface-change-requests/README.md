# Interface-change requests

ICRs document cross-sprint interface changes. They do not approve themselves;
all active core ICRs remain unapproved; targeted V9 mirrors amend only
G3-V8-P1-01/SEQ-V8-P1-01 with completed declared tests, pending independent review. Historical V8
amendment attribution is not approval; independent applicable
review and operator decisions remain required; master §§7–8 distinguish development predicates
from runtime qualification. Every
immutable family semantic change requires a new family version and ICR.

## Active core ICRs

Exactly five active core ICRs remain:

| ICR | Scope |
|---|---|
| `ICR-2026-030-core-protocol-root.md` | local authority, plan confirmation and protocol root |
| `ICR-2026-031-core-authority-transport-boundary.md` | local authority/transport boundary, Flash accounting and Git probes |
| `ICR-2026-032-core-sol-repair-budget.md` | Sol Transport V3, request accounting, findings and repair |
| `ICR-2026-033-core-dag-barrier-operator-checkpoint.md` | source chain, checkpoint/barrier generations and CAS |
| `ICR-2026-034-core-recovery-activation-release.md` | recovery, local activation, BL-023, BL-028 and manual delivery |

The controlling document is
[`../00B_MASTER_PLAN_LCIM_3_0_CORE.md`](../00B_MASTER_PLAN_LCIM_3_0_CORE.md).
The 3.1 roadmap is `NOT_READY` and is not an implementation dependency for
3.0.

## Locked amendment

The V4 result was `BLOCKED_PENDING_STRONGER_MACOS_EXECUTABLE_ATTESTATION`.
The signer stopping rule is accepted:

```text
SIGNER_V4_CONTROLLER_ATTESTATION:
BLOCKED_PENDING_STRONGER_MACOS_EXECUTABLE_ATTESTATION

LCIM_3_0_SIGNER_GATE:
REMOVED_BY_SCOPE_DECISION

LCIM_3_1_EXTERNAL_OPERATOR_SIGNER:
DEFERRED_TO_LCIM_3_1
```

No active ICR requires cryptographic signer custody, signed plan/budget/
witness/activation/distribution records, signer IPC, native controller runtime
authorization or strong same-UID executable attestation. No macOS Keychain
dependency is permitted. No V5 signer or additional native attestation spike
is planned. The seventh amendment is a local persistence repair, not a spike.
ICR-030/034 mirror master §§2.3/2.3C/2.5D/3.4C: inline retained prepared inputs
in private v2 manifests; fully populated staging fsync; one complete new/reused
ancestor/anchor procedure and confirmed exact-existing completion; v2 evidence
before separately confirmed ABANDON. Eight/seven actions, nine/eight bundle
filenames, seven/six payload descriptors and eleven evidence entries remain.
The V7 findings retain their historical plan-amended attribution. Combined V8
adds G3-V7-P1-01 pending independent review: master §§2.5B/2.5D/2.7/4.5 expand
COMMIT to integer private version 3, closed physical-ledger path/length/SHA,
both full existing chains and ledger-file/full-chain fsync before first witness
byte. Non-COMMIT stays integer 2; effects are ledger fsync-only, repeated with
fresh authority after exit. No bundle-derived ledger durability, duplicate
COMMIT or ABANDON of matching ledger. C30-01 rule 3 deliberately changes.

All five ICRs adopt the proposed master §§7–8 boundary: accepted procedure/G3/
operator adoption and qualified external tools/finite authorization before
Bootstrap construction, G1 before real adoption, current G1/G3/task/exact
predecessor for C30 development, final G2 after complete integration/relevant
C30-14 closure, then all applicable approvals for separately authorized use.
Bootstrap support exists before C30-01; C30-11/12 integrate qualified consumers.
Start blocks lock before resolving, admit source-only facts and use qualified
external tooling/CAS. EXTERNAL_DEVELOPMENT_REVIEW is eligible source qualification
under §7.3, not runtime calls/events/capabilities. U1–U5 remain unresolved.
G3 remains CHANGES_REQUIRED_PENDING_FRESH_REREVIEW, G1/G2 pending; procedure/
tools/construction not granted and runtime use BLOCKED.

## Targeted V9 references

Master §§2.5B/2.5D/2.7/2.8/4.4/4.5 and ICR-030/034 close the version-3
commitBranch alternatives, including COMPLETE_EXACT_EXISTING before bundle/
suffix flushes, ZERO appended bytes/records and exact same-session eligibility.
Master §6.2 and ICR-033/034 require recurring post-change checkpoint adoption
and generation-bound gate applicability/full G2 renewal for changed closure;
FINAL_REVIEW alone is not G2. §15 tests V9; V8 CHANGES_REQUIRED remains historical
and parent G3-V7-P1-01 is not independently resolved. No future effects authorized.

## Local families, ownership and consumers

| Family | Owner / first emitter | Exact consumers | Recovery owner |
|---|---|---|---|
| `lcim.local-operator-session@1` | C30-01 constructor, published in the C30-13 transaction-zero or successor-activation transaction | C30-02 plan; C30-03 ledger/bootstrap precheck; C30-05 accounting; C30-07 provider/review; C30-10 barriers; C30-11 operator checkpoint; C30-12 recovery/audit; C30-13 activation; C30-14 delivery; all production API guards | C30-01 semantics; C30-12 inspects; C30-13 reissues authority |
| `lcim.local-plan-confirmation@1` | C30-02 constructor, published in the C30-13 transaction-zero or successor-activation transaction | C30-03 ledger; C30-04 Git; C30-05 accounting; C30-06 artifacts; C30-07 provider/review; C30-08 findings; C30-09 repairs; C30-10 barriers; C30-11 operator checkpoint; C30-12 recovery/audit; C30-13 activation; C30-14 delivery | C30-02 semantics; C30-12 inspects |
| `lcim.local-budget-ceiling@1` | C30-05 constructor, published in the C30-13 transaction-zero or successor-activation transaction | C30-05 accounting; C30-07 provider/review; C30-08 findings; C30-09 repairs; C30-10 barriers; C30-11 operator checkpoint; C30-12 recovery/audit; C30-13 activation; C30-14 delivery | C30-05 semantics; C30-12 reconstructs counts |
| `lcim.local-consistency-witness@1` | C30-03; C30-13 transaction-zero/successor PREPARE and terminal frames bind their private publication-bundle digest | C30-03 controller ledger; C30-05 accounting; C30-08 findings; C30-09 repairs; C30-10 barriers; C30-11 operator checkpoint; C30-12 recovery/audit; C30-13 activation; C30-14 delivery | C30-12 verifies sealed bytes/classifies; C30-13 alone issues transaction-zero and successor one-action recovery authorities |
| `lcim.local-activation-settlement@1` | C30-13; public candidate binds `candidateSetKind` and its domain-separated `candidateSetDigest` only | C30-12 recovery/audit/reissue inspection; C30-13 activation/capability issuance; C30-14 manual-delivery finalization | C30-13; C30-12 read-only; receipt relates later transaction/publication identity |
| `lcim.manual-delivery-manifest@1` | C30-14 | C30-12 recovery/audit inspection; C30-13 activation-dependent consistency; C30-14 manual-delivery finalization; human delivery operator | C30-14; C30-12 read-only inspection |

`PRODUCTION_RUNTIME_CAPABILITY` remains an opaque C30-13-only in-memory object
with no record schema. The separate
`SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY` is also module-private and
C30-13-only: it publishes exactly four ordered successor candidates (budget,
session, plan, activation), no genesis, under one-action/one-mutation instances
only when stale committed activation cannot issue capability and capability is
absent. It cannot dispatch providers, mutate general Git, finalize delivery or
grant capability. These are exactly six public local families. The initial
bootstrap has exactly five candidates: four local-record candidates (budget,
operator session, plan confirmation and activation settlement) plus one non-
runnable protocol/run genesis candidate. The consistency witness is the
PREPARE/COMMIT protocol, not a candidate; C30-14 emits the manual delivery
manifest later. All six records are local controller-owned integrity evidence,
not signatures, capabilities or independent identity proofs. Their
exact closed schemas are in master §3; owners, consumers, recovery, digest
domains and future-version rules are reconciled in the five ICRs.

## Historical ICRs

`ICR-2026-001-worker-execution-confinement.md`,
`ICR-2026-002-route-decision-sol-codex.md` and
`ICR-2026-002-worker-push-confinement.md` are historical V2 records, not active
3.0 instructions.

## Required format

Each ICR states ID/date/origin, affected interfaces, exact change, rationale,
affected units, migration, threat-model limitations, amendment mirrors and
review status. A pending ICR never authorizes implementation.
