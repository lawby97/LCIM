# BOOTSTRAP — Bootstrap Checkpoint V2 and implementation-source gate

**Status:** `BOOTSTRAP_CHECKPOINT_V2_PROTOTYPE = PROVED_NON_AUTHORITATIVE`;
`INDEPENDENT_REVIEW_PENDING`.

**Reviewed source base:** `a93a3dd24af737e015fe3c138ca61ed9745cdf1d`

This document freezes Bootstrap Checkpoint V2. Any earlier bootstrap-manifest
V1 is retained only as historical superseded planning and is not an active
protocol. This is a planning-only operator gate: it is not an LCIM run and does
not authorize a provider request, credential access, source implementation,
commit, push, merge, PR, or release.

Development and authoritative use have distinct proposed predicates: master
§§7–8 phases A–F and `INDEPENDENT_REVIEW_GATES.md`. A requires independent
procedure/scope acceptance, applicable G3 and operator adoption. B then permits
real isolated Bootstrap candidate implementation/testing only with actually
qualified external tools and explicit finite construction authorization; G1
cannot precede construction of its own subject. G1 reviews actual final support
and evidence, then separate operator authorization permits real Bootstrap
adoption. C30 development requires current G1/G3, accepted procedure/tools,
per-task authorization and accepted exact predecessors, not prior full G2.
Final G2 follows complete integration, including relevant C30-14 closure;
C30-07 alone is insufficient. Activation/use requires all current applicable
G1/G2/G3, exact identities/evidence and separate operator authorization.
None of these phases is approved or authorized by this documentation edit.

## V9 post-change applicability — SEQ-V8-P1-01

The initial Bootstrap/qualification sequence above is unchanged. Master §6.2 is
incorporated in full for recurring BL/seed/source changes: external review while
capability is absent, qualified prepare before staging, separately authorized
operator exact-path commit, clean-successor verify, separately authorized registry
CAS, then accepted-generation applicability/renewal of affected gates before
separate successor authorization. Ordinary FINAL_REVIEW is not G2. Changed
verifier qualifies before its first authoritative use; an applicable still-
qualified verifier may be used, never unqualified self-certification. Unchanged
subjects need verified current applicability, uncertain scope denies. Resume
review/preparation/commit/verification/CAS/qualification/activation by exact proof
and current head without duplicate commits or acceptance; S'' repeats affected
invalidation. U1–U5 remain unmet; these are FUTURE requirements, not permission.

## 1. Exact V2 two-command protocol

The operator prepares the manifest **before** creating the source commit:

```text
prepare --repo <repo> --parent <exact-sha> \
  --candidate-list <file> --out <prepared-manifest>
```

After the operator creates the commit, the operator verifies that exact
successor:

```text
verify --repo <repo> --manifest <prepared-manifest> \
  --commit <exact-successor-sha> [--write-verified <proof>]
```

`prepare` must succeed before any operator staging or commit; `verify` runs
after the commit. Both are read-only **with respect to source, index and refs**.
Prepare explicitly writes only the named external immutable `--out` manifest;
verify explicitly writes only the named standalone `--write-verified` proof
below the Git common directory, outside tracked source. Exclusive output
creation, verification and required file/directory durability are qualified
external-owner effects, not hidden under an unqualified "read-only" label. The exact
`verifiedSuccessorSha` printed or recorded by V2 is the only permitted base for
the next source generation; no hand-copied or prototype SHA is accepted.

The future final source verifier is `bin/lcim-source-checkpoint.mjs`. The
standalone external Bootstrap owner constructs its candidate in phase B, then
G1 qualifies its actual final identity in phase C before real adoption. The
same owner must supply the full tool/import/schema/canonicalization closure,
immutable preparation/proof outputs, source registry/head/CAS initialization
and crash recovery, review/validation acceptance, currentness, source-only
admission/consumed-generation evidence, early handoffs and finite retained
proof-input export for master §2.3C **before C30-01**. None is created now.
C30-11 integrates/extends the already G1-qualified verifier; C30-12 integrates
lineage/recovery consumers. Neither is first availability for an early handoff.
Actual schemas/storage/recovery and external-tool/review-format qualification
remain unresolved under master §8.1 U1–U5; absence denies the dependent phase.

## 2. What `prepare` freezes

The prepared manifest is a complete recursive RFC 8785/JCS identity. It binds:

- absolute Git executable identity and digest;
- repository, worktree, and Git-common identity;
- exact parent commit;
- projected tree;
- complete path/mode/type/object manifest;
- exact changed set;
- complete candidate universe from `--candidate-list`;
- every active-guidance digest;
- verifier path, bytes, mode, and projected object;
- full verifier/tool/import/schema/canonicalization closure and manifest schema identities;
- the complete recursive JCS identity, including nested arrays/objects and
  canonical number/Unicode validation.

The manifest is immutable once prepared. A candidate outside the declared
universe, an unexpected changed path, a changed verifier, or any identity
mismatch invalidates the preparation and requires a new generation.

## 3. What `verify` proves

Verification requires all of the following:

- exact single-parent successor;
- exact expected tree;
- exact expected changed set;
- unchanged active guidance;
- unchanged verifier source bytes, mode, and projected object;
- exact Git executable/repository/worktree/Git-common identity;
- checkout at the supplied successor commit;
- no staged, unstaged, untracked, or ignored material;
- exact candidate-universe and path/mode/type/object agreement;
- a standalone verification proof and exact verified successor SHA.

Any missing guidance path, extra file, staged/untracked/ignored file, wrong
parent/tree, verifier-source change, JCS mismatch, identity mismatch, or dirty
checkout fails closed. The proof is written exclusively and fsynced outside
tracked source. Runtime state remains below `<git-common-dir>/lcim`.

## 4. Bound active-guidance universe

The final source manifest must bind the complete active universe, not only this
file:

```text
AGENTS.md
README.md
docs/v2-model-routing.md
docs/v2-final-architecture.md
docs/v2-sprints/00B_MASTER_PLAN_LCIM_3_0_CORE.md
docs/v2-sprints/BOOTSTRAP_OPERATOR_CHECKPOINT.md
docs/v2-sprints/INDEPENDENT_REVIEW_GATES.md
docs/v2-sprints/README.md
docs/v2-sprints/PROMPT_INDEX.md
docs/v2-sprints/FOURTH_SOL_FINDING_MATRIX.md
docs/v2-sprints/RELEASE_GATE_BL023_CORE.md
docs/v2-sprints/LCIM_3_1_FUTURE_DELIVERY_SECURITY.md
docs/v2-sprints/SPRINT_30_01_AUTHORITY_ROOT.md
docs/v2-sprints/SPRINT_30_02_PLAN_DECLARATION.md
docs/v2-sprints/SPRINT_30_03_PROTOCOL_LEDGER.md
docs/v2-sprints/SPRINT_30_04_HARDENED_GIT.md
docs/v2-sprints/SPRINT_30_05_FLASH_TRANSPORT_BUDGET.md
docs/v2-sprints/SPRINT_30_06_ARTIFACT_SCAN.md
docs/v2-sprints/SPRINT_30_07_SOL_CONTRACTS.md
docs/v2-sprints/SPRINT_30_08_FINDING_TRANSACTIONS.md
docs/v2-sprints/SPRINT_30_09_REPAIR_ENGINE.md
docs/v2-sprints/SPRINT_30_10_CHECKPOINT_BARRIER.md
docs/v2-sprints/SPRINT_30_11_OPERATOR_COMMIT_CLI.md
docs/v2-sprints/SPRINT_30_12_RECOVERY_AUDIT_CLI.md
docs/v2-sprints/SPRINT_30_13_ACTIVATION_BOOTSTRAP.md
docs/v2-sprints/SPRINT_30_14_PROVENANCE_RELEASE.md
docs/v2-sprints/interface-change-requests/README.md
docs/v2-sprints/interface-change-requests/ICR-2026-030-core-protocol-root.md
docs/v2-sprints/interface-change-requests/ICR-2026-031-core-authority-transport-boundary.md
docs/v2-sprints/interface-change-requests/ICR-2026-032-core-sol-repair-budget.md
docs/v2-sprints/interface-change-requests/ICR-2026-033-core-dag-barrier-operator-checkpoint.md
docs/v2-sprints/interface-change-requests/ICR-2026-034-core-recovery-activation-release.md
bin/lcim-source-checkpoint.mjs
```

This is the corrected future active-guidance universe. Its final prepared
manifest must record the exact future digest of every listed file. Bootstrap
V2 has **not** reviewed these amended bytes; G1 must review the final bytes
before preparation is accepted. The list includes every active C30
implementation prompt, every active core ICR, the finding matrix, sprint indexes, ICR index, BL-023 runbook, LCIM 3.1
roadmap, current final architecture, root guidance and all review-gate
documents. A later active prompt or ICR cannot be silently omitted.

The independent review must also confirm that active guidance binds:

- the Pi deepseek-v4-flash (thinking "max", LCIM reasoning MAX) and controller-only Pi openai-codex gpt-5.6-sol/XHIGH routing policy;
- the separate development phases A–F and runtime A0/A1 authority phases,
  C30-01 evidence-only boundary, C30-13 sole
  production issuer, read-only pre-capability API and local authority families;
- Bootstrap Checkpoint V2 and the source-generation chain;
- the FD-3 accounting authority boundary and Sol Transport V3 boundary;
- the non-circular activation ordering;
- the BL-023 seeded finding, negative probes, and BL-028 regression;
- the LCIM 3.0/3.1 scope split, no remote-delivery authority and no cryptographic signer dependency.

## 5. Operator procedure

Future operator-only procedure, **not commands authorized by this edit**:
clean exact parent → exact reviewed candidate overlay → prepare before staging
→ operator exact-path staging/local commit → clean-successor verify → separately
authorized registry publication under the qualified owner's lock/CAS. Current
G1, applicable G3, accepted procedure/tools and exact authorization are required
before real adoption. The overlay is intentionally changed: do not demand a
completely clean worktree after applying it. Reject any staging or changed/
untracked/ignored path outside the exact reviewed overlay.

```bash
set -euo pipefail
: "${LCIM_SOURCE_REPO:?absolute clean source checkout}"
: "${LCIM_SOURCE_CHECKPOINT_DIR:?qualified external source-checkpoint output directory}"
cd "$LCIM_SOURCE_REPO"

/usr/bin/git diff --check
test -z "$(/usr/bin/git status --porcelain=v1 --ignored)" # clean parent ONLY
# External tooling now applies the exact independently reviewed candidate overlay.
# Check its complete path/byte/mode universe and zero staged paths; do NOT demand
# a clean worktree here. Prepare rejects anything outside that exact overlay.

node bin/lcim-source-checkpoint.mjs prepare \
  --repo "$LCIM_SOURCE_REPO" \
  --parent a93a3dd24af737e015fe3c138ca61ed9745cdf1d \
  --candidate-list "$LCIM_SOURCE_CHECKPOINT_DIR/BOOTSTRAP.candidates" \
  --out "$LCIM_SOURCE_CHECKPOINT_DIR/BOOTSTRAP.prepared.json"

# The operator stages only the reviewed candidate paths, never git add -A.
/usr/bin/git add -- <paths from BOOTSTRAP.candidates>
/usr/bin/git diff --cached --check
/usr/bin/git commit --no-verify -m \
  'establish reviewed standalone Bootstrap support and guidance'
BOOTSTRAP_SHA="$(/usr/bin/git rev-parse HEAD)"

node bin/lcim-source-checkpoint.mjs verify \
  --repo "$LCIM_SOURCE_REPO" \
  --manifest "$LCIM_SOURCE_CHECKPOINT_DIR/BOOTSTRAP.prepared.json" \
  --commit "$BOOTSTRAP_SHA" \
  --write-verified "$LCIM_SOURCE_CHECKPOINT_DIR/BOOTSTRAP.verified.json"
# No registry publication is implicit in verify or this Git commit.
# Separately authorized qualified external owner: lock, recheck currentness,
# accept exact proof/review identities and publish the successor using head CAS.
```

The command block is a protocol example only; this planning amendment does not
run it. The candidate list must contain the complete reviewed candidate set,
including the verifier and the active guidance that the operator actually
intends to commit. `prepare` must be rerun if the candidate set or any bound
active guidance changes.

## 6. External implementation-source generation chain

Bootstrap Checkpoint V2 is generation zero of the implementation-source chain.
Each later generation is an immutable
`lcim.implementation-source-generation@1` record binding:

- source-checkpoint generation ID;
- predecessor manifest digest;
- predecessor verified successor SHA;
- exact parent;
- projected/reviewed tree;
- candidate set;
- changed set;
- active-guidance universe and digests;
- verifier identity;
- exact successor SHA;
- expected generation-head CAS;
- review and validation identities.

A source Start block may begin only from the exact verified successor SHA of the
immediately preceding current generation. If an earlier source checkpoint
changes, the qualified external source owner invalidates descendant source
acceptance; validated runtime consumers invalidate every dependent checkpoint,
deterministic validation, Sol coverage, barrier and operator manifest,
activation, RC/build/distribution evidence. It then requires regeneration and
independent review in dependency order. A source-generation head CAS conflict
never creates a second current generation.

## 7. Normative Start/dependency gate

The common development Start contract is master §7.4, incorporated in full,
with `PREDECESSOR_ID` selecting the exact immediate predecessor. Check accepted
procedure/current applicable G1/G3, qualified external tools and exact task
authorization; **lock before resolving** predecessor; verify identity/current
head/non-supersession, proof, reviewed commit/tree and source-review evidence;
bind development guidance/configuration/routing, not fabricated runtime records;
record source-only admission/consumed generation under the qualified external
owner; externally create/verify the development checkout; recheck currentness
before every launch and checkpoint acceptance; publish successors only through
qualified prepare/verify, operator exact-path local commit and separately
authorized registry lock/CAS. Missing prerequisites deny advancement; source
mismatch is `DENIED_STALE_OR_UNVERIFIED_SOURCE_CHECKPOINT`. G2 is not a
construction prerequisite; runtime use still requires all applicable gates.

External reviews require master §7.3 EXTERNAL_DEVELOPMENT_REVIEW provenance,
independent author/reviewer and locked Flash/Sol routes, immutable source/
evidence/tool identities, scan and validation before review, complete coverage
and zero findings, repair → successor validation → exact RECHECK → complete
FINAL_REVIEW, retained safe inputs/results and qualified checkpoint acceptance.
They are source-qualification inputs to activation/source delivery, not runtime
Sol calls, finding/accounting events or capabilities. Closed acceptance formats
and consumer validation remain U3, not assumed implemented.

Candidate tests use isolated synthetic credentials/local mocks only, never
production state or live candidate-provider calls before qualification. External
development-model requests require separately accepted tools/isolation and
finite enforceable upstream-request/spend controls; manual Pi/session counts
are not presumed sufficient. The manually requested Luna documentation edit
does not change the proposed future Flash implementation/Sol review roles.

C30-01 substitutes `BOOTSTRAP_CHECKPOINT_V2`; every later sprint substitutes
the immediately preceding C30 sprint ID. The operator, not Flash and not LCIM,
creates each local source commit. A once-valid SHA that now has a successor or
superseding generation is stale and cannot start any work.

**Development readiness:** `BLOCKED_PENDING_PHASE_PREREQUISITES_AND_TASK_AUTHORIZATION`.
G1/G2 remain pending; G3 remains CHANGES_REQUIRED_PENDING_FRESH_REREVIEW.
Policy adoption/external-tool qualification are not granted; candidate source
construction is not authorized and runtime activation/use is blocked.
Runtime COMMIT is distinct from operator Git commit and registry publication:
master §§2.5B/2.5D/4.5 now bind the closed version-3 physical-ledger prerequisite
and repeat ledger-file/full-chain fsync before the first witness COMMIT byte.
G3-V7-P1-01 is amended pending independent review, with no new runtime action.
