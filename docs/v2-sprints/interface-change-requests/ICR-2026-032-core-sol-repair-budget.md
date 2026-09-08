# ICR-2026-032 — Sol Transport V3, accounting, findings and local budget

- **Date:** 2026-03-09 (V4 stopping-rule scope decision)
- **Origin:** Sol transport/Pi planning and V4 controller-identity result
- **Status:** `PLAN_AMENDED_PENDING_INDEPENDENT_V8_REVIEW` — no gate approval
- **Affected units:** C30-05, C30-07, C30-08, C30-09 and C30-12

## Combined V8 development and qualification boundary

Master §§7–8 propose adopted procedure/G3/operator acceptance and actual external
tool/isolation/spend qualification plus finite authorization before Bootstrap
construction; G1 of actual final support before separate real adoption; current
G1/G3, accepted tools/procedure, exact task authorization and current predecessor
for C30 development. Full G2 needs actual transitive integration: C30-07 alone
is insufficient, C30-13 earliest possible complete source point, relevant C30-14
packaging/closure included, qualification scheduled after complete integration.
Mocks/design assertions alone are not full G2. All applicable current gates and
separate operator authorization remain required for activation/runtime use.
EXTERNAL_DEVELOPMENT_REVIEW source inputs (master §7.3) are not runtime Sol
calls, finding/accounting events or production capabilities. Qualified external
acceptance must validate independent locked routes, immutable input/tool universe,
scan/validation, coverage/zero findings and repair → successor validation → exact
RECHECK → complete FINAL_REVIEW. Candidate tests are isolated synthetic/local
mocks; external model requests need accepted isolation and finite enforceable
upstream-request/spend controls, not Pi/session counts. U1–U5 remain unresolved;
source construction not authorized. Standalone Bootstrap supplies early support;
Start (§7.4) locks before resolving and admits source-only facts under qualified
external tooling/CAS, not these unfinished runtime components.

G3-V7-P1-01 deliberately expands COMMIT under §§2.5B/2.5D/4.5 to integer private
version 3, complete physical-ledger byte/path and both-chain binding, then pinned
ledger-file/full-chain fsync before witness append. Non-COMMIT stays integer 2;
ledger effects are fsync-only, fresh recovery repeats and failure prevents COMMIT.
No new runtime request/action/budget authority or bundle-derived ledger durability.
G1/G2 pending; G3 CHANGES_REQUIRED_PENDING_FRESH_REREVIEW. V9 master §6.2 adds
recurring accepted-generation gate applicability/full G2 renewal for changed
closure, not ordinary FINAL_REVIEW, before successor authorization. Master
§§2.5B/2.5D close exact-existing COMMIT ledger-then-witness fsync-only completion
before bundle/suffix flushes and same-session eligibility. §15 is active V9
modeling; §12 pins/results remain historical, not runtime security evidence.

## Retained V7 persistence-consumer contract

G3-V6-P1-01/02/03 remain PLAN_AMENDED_PENDING_G3_REREVIEW_V7, not approval.
Master §2.3C retains complete pre-operation budget lineage/absence and non-secret
owner streams in private v2 publication manifests; §3.4C copies that prepared
side into v2 terminal evidence, separately from current observation. §§2.3/2.5D
alone govern full staging and complete new/reused ancestor durability and
confirmed exact-existing completion. This adds no request, budget authority,
action, route or repair exception; accounting and repair-until-PASS stay fixed.

## Exact change

```text
SIGNER_V4_CONTROLLER_ATTESTATION:
BLOCKED_PENDING_STRONGER_MACOS_EXECUTABLE_ATTESTATION

LCIM_3_0_SIGNER_GATE:
REMOVED_BY_SCOPE_DECISION

LCIM_3_1_EXTERNAL_OPERATOR_SIGNER:
DEFERRED_TO_LCIM_3_1
```

Keep Sol Transport V3 as a new authority boundary requiring independent
security review. The changed sealed entry, loader/source manifest, stdin ask,
FD-3 accounting ownership, request-dispatch authority, OAuth/model egress
interception, Pi closure and cleanup remain in scope. The first authoritative
V3 invocation and first authoritative C30 Sol call remain blocked until review
passes.

The V4 signer result is accepted and removed from 3.0 scope. No cryptographic
signer custody, signed runtime authorization, signer IPC, Keychain dependency
or strong same-UID executable-attestation claim is added.

## Local budget contract

Replace signed budget authority with:

```text
lcim.local-budget-ceiling@1
```

C30-05 owns constructor/schema semantics; C30-13 publishes the genesis
candidate in the bootstrap transaction; C30-12 reconstructs counts without
restoring uncertainty. Master §3.3 controls the closed schema, complete
Flash/Sol class vocabulary, domains, CAS, replay, supersession, invalidation,
denials and future versions. Exact consumers are: C30-05 accounting; C30-07
provider/review; C30-08 findings; C30-09 repairs; C30-10 barriers; C30-11
operator checkpoint; C30-12 recovery/audit; C30-13 activation; C30-14 delivery.

One credit equals one actual upstream provider request. Under the run lock,
`available = confirmed - definitely - possibly - outstanding`; reserve only
when at least one remains. `NEVER_CHARGEABLE` releases its reservation;
`POSSIBLY_CHARGEABLE` and `DEFINITELY_CHARGEABLE` permanently consume it.
Uncertainty never restores credit and over-ceiling dispatch is denied.

## Sol, finding and repair consumers

C30-07 owns the closed Sol profiles, asks, responses, coverage and transport
boundary. C30-08 owns proposal-indexed finding/event IDs, exact prior-open
sets, explicit `UNTOUCHED_NOT_REVIEWED`, separate new proposals, atomic
transitions, replay and quarantine. C30-09 owns Flash repair order,
successor generation, exact RECHECK, complete FINAL_REVIEW and repair-until-
PASS. C30-12 owns classifier-first recovery and sanitized audit.

No consumer may require a signed plan, budget, witness, activation or
distribution record. Local plan confirmation and consistency witness are
consumed only as controller-owned integrity evidence from C30-02/C30-03.

## Removed-family reconciliation

| Old family | LCIM 3.0 | Replacement | Future owner |
|---|---|---|---|
| `PLAN_ATTESTATION` | not emitted/required | local plan confirmation | LCIM 3.1 signer |
| `BUDGET_AUTHORIZATION` | not emitted/required | local budget ceiling | C30-05 in 3.0; signed grant in 3.1 |
| `BUDGET_REAUTHORIZATION` | not emitted/required | TTY ceiling increase | C30-05 in 3.0; signed reauthorization in 3.1 |
| signed Sol/runtime authorization | not emitted/required | C30-13-only in-memory production capability | C30-13 |

The local replacements are not signatures, signed grants or independent
identity proofs.

## Preserved model architecture and limits

Pi deepseek-v4-flash (thinking "max", LCIM reasoning MAX) remains the sole implementation/repair worker. Pi openai-codex gpt-5.6-sol XHIGH remains
controller-owned. Validation precedes review; RECHECK does not approve stages;
repair continues through a clean successor, validation, exact RECHECK and a
new complete FINAL_REVIEW until PASS. No actionable technical finding may be
STUCK, technically paused or deferred; only frozen objective nontechnical
causes may pause. No real provider request is
introduced by this ICR.

The bounded threat model excludes hostile same-UID processes, root/kernel
compromise, debugging or memory theft of the live controller, malicious OS,
full-machine compromise and coordinated rollback of every local root.
