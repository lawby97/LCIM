# LCIM 3.1 — external operator signing service roadmap

**Status:** `NOT_READY` / `DEFERRED_TO_SEPARATE_LCIM_3_1_SECURITY_MILESTONE`

This is a non-implementation roadmap. It has no executable sprint prompt and
cannot change LCIM 3.0. The status vocabulary is:

```text
SIGNER_V4_CONTROLLER_ATTESTATION:
BLOCKED_PENDING_STRONGER_MACOS_EXECUTABLE_ATTESTATION

LCIM_3_0_SIGNER_GATE:
REMOVED_BY_SCOPE_DECISION

LCIM_3_1_EXTERNAL_OPERATOR_SIGNER:
DEFERRED_TO_LCIM_3_1
```

The failed V4 native-controller experiment remains blocked, not deferred. It is
historical feasibility evidence only and must not be revived as a V5 spike.

## Explicit prerequisite milestone

```text
EXTERNAL_OPERATOR_SIGNING_SERVICE
```

The milestone must be separately planned, implemented and independently
reviewed. The service need not run on the same Mac or under the same UID as
LCIM. It owns future cryptographic authority removed from LCIM 3.0:

- `OPERATOR_ROOT` custody, rotation and revocation;
- `OPERATOR_AUTHORIZATION` and authenticated request/response transport;
- signed plan attestations;
- signed budget grants and reauthorizations;
- signed activation;
- signed online ledger-witness and rollback/high-water records;
- signed RC1 and FINAL distribution manifests;
- compromise cutoff, key rotation and recovery;
- hardware, remote-service or separately administered custody options;
- independent audit and recovery;
- stronger process/executable attestation where required.

The milestone must choose and prove request identity, one-use semantics,
expiry, replay handling, authenticated transport, failure/quarantine behavior,
operator presence, key lifecycle, revocation and recovery. It must not reuse
same-Mac/same-UID assumptions from V4.

## Combined V8 boundary (no new 3.1 work)

Master §§7–8 propose adopted external procedure/tools and finite authorization
before Bootstrap construction, G1 before separately authorized real adoption,
current G1/G3/task/current predecessor before C30 development, final G2 after
complete integration and relevant C30-14 closure, then all current applicable
approvals before separately authorized runtime use. No adoption/qualification/
construction is granted here. EXTERNAL_DEVELOPMENT_REVIEW source inputs are
eligible under qualified acceptance, never runtime capabilities/accounting.
G3-V7-P1-01 amends master §§2.5B/2.5D/4.5: private version-3 COMMIT binds physical
ledger bytes/path and both chains; fsync-only ledger prerequisite must complete
before witness COMMIT. It adds no public action/family or cryptographic claim.
G1/G2 pending; G3 CHANGES_REQUIRED_PENDING_FRESH_REREVIEW; U1–U5 unresolved.

## LCIM 3.0 boundary

LCIM 3.0 remains local core orchestration and ends at
`DELIVERY_READY_MANUAL`. It produces reproducible artifact bytes, exact
SHA-256 identity, source commit/tree, schema/capability set, build/toolchain
manifest, independent Sol-review lineage, BL-023 evidence, BL-028 evidence
and a manually inspected content-addressed delivery manifest.

LCIM 3.0 does not push, mutate refs, create PRs, mutate remote CI, merge,
publish hotfixes or perform production verification. Signed RC1/FINAL
distribution envelopes are 3.1 work.

## Local 3.0 authority is not cryptographic authority

The 3.0 root is:

```text
EXPLICIT_OPERATOR_LAUNCH
+
REVIEWED_SOURCE_AND_CONFIG_IDENTITY
+
MODULE_PRIVATE_IN_MEMORY_CAPABILITY
```

The controlling TTY confirmation binds repository, source commit/tree, plan,
configuration, routes, ceilings, operation and reviewed generation. The opaque
capability is module-private, non-serialized, non-persisted, absent after
restart and never exposed to Flash, Sol, validation or target code.

LCIM 3.0 has exactly six public local families:

```text
lcim.local-operator-session@1
lcim.local-plan-confirmation@1
lcim.local-budget-ceiling@1
lcim.local-consistency-witness@1
lcim.local-activation-settlement@1
lcim.manual-delivery-manifest@1
```

Transaction-zero has exactly five publication candidates: four local-record
candidates (budget, operator session, plan confirmation and activation
settlement) plus one non-runnable protocol/run genesis candidate. The
consistency witness is the PREPARE/COMMIT protocol, not a candidate record; the
manual delivery manifest is emitted later by C30-14.

They are integrity-chained local evidence, not digital signatures, signed
grants, independent identity proofs, anti-rollback signatures or secure
monotonic anchors.

## Future work packages

1. operator-root custody, signing and revocation;
2. authenticated signer transport and one-use request protocol;
3. signed plan/budget/activation/witness schemas and ownership;
4. signed distribution manifests and release envelopes;
5. independent audit, recovery and compromise cutoff;
6. stronger executable/process attestation if the threat model requires it;
7. separately administered hardware or remote service options.

Each package requires its own owner matrix, first emitter, consumers, digest
domains, recovery contract, threat model and independent security review.

## Threat-model boundary retained in 3.0

LCIM 3.0 does not claim resistance to hostile same-UID processes, root/kernel
compromise, debugging or memory theft of the live controller, a malicious OS,
full-machine compromise or coordinated rollback of every local authority root.
The 3.0 plan does structurally isolate Flash, Sol, deterministic validation,
target-controlled scripts, target worktrees and model prompts/outputs from
controller-owned authority, provider credentials, request accounting and
Git-control surfaces.

## Readiness

```text
SIGNER_V4_CONTROLLER_ATTESTATION: BLOCKED_PENDING_STRONGER_MACOS_EXECUTABLE_ATTESTATION
LCIM_3_0_SIGNER_GATE: REMOVED_BY_SCOPE_DECISION
LCIM_3_1_EXTERNAL_OPERATOR_SIGNER: DEFERRED_TO_LCIM_3_1
LCIM_3_1_EXTERNAL_OPERATOR_SIGNING_SERVICE: NOT_READY
LCIM_3_0_END_STATE: DELIVERY_READY_MANUAL
```
