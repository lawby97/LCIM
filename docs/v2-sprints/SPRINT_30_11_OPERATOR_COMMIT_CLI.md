# C30-11 — operator checkpoint integration of the qualified Bootstrap V2 verifier

**Development gate:** master §§7–8 phases A–D: accepted external procedure/tools,
current applicable G1/G3, exact per-task authorization, accepted Bootstrap and
current immediate predecessor. G2 follows complete integrated implementation;
activation/use requires phase F, all current applicable G1/G2/G3 and separate
operator authorization. None is granted here. Component runtime prerequisites
below are not prerequisites to constructing their own code in isolated fixtures.

**Status:** `PLAN_AMENDED / IMPLEMENTATION_TESTS_PENDING`;
`BOOTSTRAP_CHECKPOINT_V2_INDEPENDENT_REVIEW_PENDING`.

**Development depends on:** exact current accepted C30-10 source checkpoint.
`AWAITING_OPERATOR_CHECKPOINT_COMMIT` is a **runtime operation prerequisite**,
not a prerequisite to implementing C30-11.

**Next:** `SPRINT_30_12_RECOVERY_AUDIT_CLI.md`.

## Manual commit boundary

LCIM emits an immutable candidate list and prepared V2 manifest. The operator
creates the local grouped commit. The read-only V2 verifier proves it. LCIM
never runs `git commit`, moves a user branch or updates a remote.

## Bootstrap Checkpoint V2 integration (not first availability)

Master §7.2 assigns mandatory first availability to the standalone external
Bootstrap owner before C30-01: bin/lcim-source-checkpoint.mjs, full verifier/
tool/import/schema/canonicalization closure, immutable preparation/proof outputs,
registry/head/CAS initialization/crash recovery, review/validation acceptance,
currentness/admission/consumed-generation handoffs and finite retained proof-input
export. C30-11 integrates/extends that **already G1-qualified** support; C30-12
integrates lineage/recovery consumers. Changed identities require applicable
requalification before acceptance. No support is constructed by this edit.

```text
prepare --repo <repo> --parent <exact-sha> \
  --candidate-list <file> --out <prepared-manifest>

verify --repo <repo> --manifest <prepared-manifest> \
  --commit <exact-successor-sha> [--write-verified <proof>]
```

`prepare` is before staging/commit. `verify` is after. The manifest freezes
absolute Git identity, repository/worktree/Git-common identity, parent,
projected tree, complete path/mode/type/object manifest, changed set,
candidate universe, active-guidance digests, verifier identity and recursive
JCS identity.

Verification requires exact single-parent successor/tree/changed set, unchanged
guidance/verifier/Git/repository identity, clean checkout, standalone proof and
exact verified successor SHA. The V2 prototype remains non-authoritative. G1 must qualify the actual final
standalone support and evidence before real Bootstrap adoption, independently
of this later integration.

## Local operator confirmation

The operator confirms the exact checkpoint operation through the controlling
TTY, after the controller displays repository/source/plan/configuration,
barrier, candidates, route and budget facts. The actual C30-13-issued
production capability is required for controller mutation/settlement and
disappears on restart. External prepare/verify are read-only with respect to
source/index/refs but explicitly write their named immutable external manifest/
proof outputs. They do not publish a registry head. The procedure is clean
parent → exact reviewed overlay → prepare before staging → operator exact-path
local commit → clean-successor verify → separately authorized qualified registry
lock/CAS; never require a clean worktree after applying the intended overlay.
Runtime COMMIT instead uses master §§2.5B/2.5D/4.5's ledger-before-witness fsync
contract, not developer Git commit or external source-registry publication. It is not a
signature or independent identity proof.

`lcim.operator-commit-manifest@1` contains manifest, run/plan/source/barrier
identities, parent/tree, ordered patch identities, changed paths/modes,
validation/Sol coverage, zero-open proof, approval lineage and operator policy.

State vocabulary:

```text
AWAITING_OPERATOR_CHECKPOINT_COMMIT
OPERATOR_CHECKPOINT_COMMIT_VERIFIED
BARRIER_COMMITTED
```

## Source continuity and owned families

Every checkpoint binds the source-generation predecessor manifest/SHA, exact
parent/tree/candidate/changed set, active-guidance universe, verifier,
expected-head CAS and review/validation identities. Earlier source changes
invalidate descendants and require regeneration.

| Family | First emitter | Consumers |
|---|---|---|
| `lcim.source-generation-head@1` | qualified standalone Bootstrap source owner before C30-01; C30-11 integrates consumer | external Start blocks/source lineage |
| `lcim.operator-commit-manifest@1` | barrier PASS | operator/verifier |
| `lcim.operator-commit-verification@1` | read-only verifier | unlock/audit |
| `lcim.operator-checkpoint-event@1` | verified settlement | downstream DAG |

## Acceptance and scope

Test prepare-before-commit ordering, candidate changes, active-guidance
changes, extra/staged/untracked/ignored files, nested JCS ordering, wrong
parent/tree, changed verifier, exact identity, clean successor, standalone
proof, source-head CAS and replay. A mismatch blocks downstream activation or
manual delivery.

C30-11 has no cryptographic signer, signed checkpoint, Keychain or native
executable-attestation dependency. It preserves Pi deepseek-v4-flash (thinking "max", LCIM reasoning MAX), Pi openai-codex gpt-5.6-sol XHIGH,
validation-before-review, repair-until-PASS and manual grouped commits.

## Normative Start/dependency gate

The common development Start contract is master §7.4, incorporated in full.
Predecessor: `C30-10`. Check procedure/current applicable G1/G3,
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
