# ICR-2026-031 — local authority, Flash accounting and Git boundary

- **Date:** 2026-03-09 (V4 stopping-rule scope decision)
- **Origin:** V4 controller-identity feasibility result and Pi/Git planning
- **Status:** `PLAN_AMENDED_PENDING_INDEPENDENT_V8_REVIEW` — no gate approval
- **Affected units:** C30-01, C30-04, C30-05, C30-06 and C30-14

## Combined V8 development and runtime boundary

Master §§7–8 replace blanket G2-before-construction: adopted procedure/scope/G3,
qualified external tools and finite authorization before isolated Bootstrap
construction; G1 of actual support before separately authorized real adoption;
current G1/G3, accepted procedure/tools, task authorization and exact current
predecessor for C30 development; final G2 after complete integration/relevant
C30-14 closure; all current applicable approvals and separate authorization for
runtime use. Bootstrap source support/head/CAS/recovery/proof export exists before
C30-01; C30-11/12 integrate consumers. Start locks before resolving and records
external source-only admission, not runtime session/accounting/capability.
EXTERNAL_DEVELOPMENT_REVIEW inputs qualify source under master §7.3; candidate
tests use isolated synthetic/local mocks and external model requests require
accepted tools/isolation and finite enforceable upstream-request/spend controls,
not stock Pi/session counts. U1–U5 remain unresolved; nothing is authorized here.
G3-V7-P1-01 expands runtime COMMIT under §§2.5B/2.5D/4.5: integer private version
3 binds complete physical ledger bytes/path and both chains, pinned ledger-file/
full-chain fsync precedes first witness byte. Non-COMMIT stays integer 2;
ledger effects are fsync-only, failure prevents COMMIT and fresh recovery repeats.
No new action/accounting authority or bundle-derived ledger durability. G1/G2
pending; G3 CHANGES_REQUIRED_PENDING_FRESH_REREVIEW. V9 §§2.5B/2.5D add closed
commitBranch COMPLETE_EXACT_EXISTING, fresh ledger-then-witness fsync-only
completion before bundle/suffix flushes and same-session eligibility; §6.2 adds
recurring generation-bound checkpoint adoption/gate applicability before use.
§15 is active V9 modeling; §13 is historical V8,
§12 recorded pins/results historical. Developer Git commit/registry CAS differ
from runtime COMMIT. Future Flash/Sol roles are unchanged by Luna documentation.

## Retained V7 persistence-consumer contract

G3-V6-P1-01/02/03 remain PLAN_AMENDED_PENDING_G3_REREVIEW_V7, not approval.
Master §§2.3/2.3C/2.5D exclusively govern inline prepared retention in private
v2 manifests, fully populated staging order and new/reused ancestor durability,
including confirmed exact-existing completion. §3.4C uses the same prepared
owner side in v2 evidence. These effects stay inside the existing C30-13
one-use actions; no transport, credential, routing, accounting or production
authority is added. §12 is modeled conformance, not runtime security evidence.

## Exact change

The three status decisions remain separate:

```text
SIGNER_V4_CONTROLLER_ATTESTATION:
BLOCKED_PENDING_STRONGER_MACOS_EXECUTABLE_ATTESTATION

LCIM_3_0_SIGNER_GATE:
REMOVED_BY_SCOPE_DECISION

LCIM_3_1_EXTERNAL_OPERATOR_SIGNER:
DEFERRED_TO_LCIM_3_1
```

The failed V4 result is a scope boundary, not repaired or relabeled deferred in
LCIM 3.0. No native runtime authorization, cryptographic signer IPC or Keychain
dependency is introduced.

Flash remains controller-owned. The controller creates the sealed child and
owns the FD-3 `ACCOUNTING_AUTHORITY_ONLY` channel. FD 3 is never a credential,
OAuth, bearer or direct ledger/budget FD. One reserved credit is recorded per
actual upstream provider request, with unchanged conservative settlement:
`NEVER_CHARGEABLE`, `POSSIBLY_CHARGEABLE`, `DEFINITELY_CHARGEABLE`.

## Local authority replacement

The operator explicitly launches or resumes through a controlling TTY. During
read-only A0, C30-01 computes session candidate bytes after the budget candidate
but publishes nothing. C30-13 displays repository/source/semantic/guidance/
configuration/routes/ceilings/operation and all candidate/bundle identities.
After confirmation, its one-use A1 transaction publishes session evidence with
the other candidates. C30-13 alone creates production capability after a durable matching current
activation/witness COMMIT. Initial issuance retains the still-current original
TTY facts; successor issuance requires current-fact reverification/display and
fresh TTY.
None of the transaction-zero authority, successor-publication authority or
production capability is serialized, persisted, placed in argv/environment or
exposed to Flash, Sol, validation or target code. Restart loses all three and requires classifier-first exact recovery or fresh
ordinary reissuance. Master §§2.5C/3.4C/4.5 add INITIALIZE_WITNESS_JOURNAL
(bootstrap genuine-first only, never successor) and PERSIST_ABANDON_EVIDENCE
(only exact eligible terminalization). The eight-action vocabulary does not
expand provider, Git, accounting or production authority. All support writes
are bounded named effects; evidence is immutable outside target/bundle and
must be durable before separately authorized ABANDON. It is never a bearer.

The local budget family is:

```text
lcim.local-budget-ceiling@1
```

The complete classes and strict schema are master-plan §3.3. Under the run lock,
availability is ceiling minus definitely chargeable, possibly chargeable and
outstanding reserved counts. One actual upstream request reserves one credit.
NEVER releases; POSSIBLY and DEFINITELY permanently consume; uncertainty never
restores. Increases require direct TTY confirmation and unsafe decreases are
refused. Flash, Sol, target code and configuration cannot increase it.

## Git and fixture probes

C30-04 remains the owner of absolute Git identity, read-only profiles,
disposable mutator ownership, intent/observation/settlement and fixture-only
negative probes. The local capability is required for controller-led Git
mutation; it is not a credential or remote authority.

The probes remain origin-absent `/usr/bin/git push origin HEAD` and a
hard-coded controller-owned deny-only/unreachable fixture URL. Both must fail
nonzero, preserve exact manifests, expose no credential, reach no outside
network and clean only owned paths.

## Ownership and consumers

| Family | Owner / first emitter | Consumers |
|---|---|---|
| `lcim.local-operator-session@1` | C30-01 constructor, published in the C30-13 transaction-zero or successor-activation transaction | C30-02 plan; C30-03 ledger/bootstrap precheck; C30-05 accounting; C30-07 provider/review; C30-10 barriers; C30-11 operator checkpoint; C30-12 recovery/audit; C30-13 activation; C30-14 delivery; all production API guards |
| `lcim.local-budget-ceiling@1` | C30-05 constructor, published in the C30-13 transaction-zero or successor-activation transaction | C30-05 accounting; C30-07 provider/review; C30-08 findings; C30-09 repairs; C30-10 barriers; C30-11 operator checkpoint; C30-12 recovery/audit; C30-13 activation; C30-14 delivery |
| `lcim.git-process-proof@1` | C30-04 | Git readers/mutators |
| `lcim.git-mutator-intent@1` | C30-04 | observation/settlement |
| `lcim.git-mutator-observation@1` | C30-04 | settlement/recovery |
| `lcim.git-mutator-settlement@1` | C30-04 | checkpoints/audit |

No consumer requires a removed signed authority family. Pi package/SRI,
controller-owned broker, child confinement, no credential access, Git identity,
request accounting and cleanup remain ordinary implementation work. Sol
Transport V3 remains a separate independent security-review gate.

## Migration and limits

The old signed authority families are moved to the LCIM 3.1 external operator
signing-service roadmap and are not emitted by C30-04/05. Existing historical
records are not rewritten. The local consistency witness and local plan
confirmation are defined by ICR-030 and consumed only after their owners emit
them.

The 3.0 threat model excludes hostile same-UID processes, root/kernel
compromise, live-controller debugging/memory theft, malicious OS,
full-machine compromise and coordinated rollback of every local root.
