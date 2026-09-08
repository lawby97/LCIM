# ICR-2026-034 — recovery, local activation, rehearsal and manual delivery

- **Date:** 2026-03-09 (retained lineage; combined V8 documentation amendment)
- **Origin:** frozen V7 baseline; sequencing proposal and G3-V7-P1-01
- **Status:** `AMENDED_PENDING_INDEPENDENT_V9_REVIEW` — G3-V8-P1-01/SEQ-V8-P1-01 definitions/tests complete; no gate approval
- **Affected units:** C30-03, C30-12, C30-13, C30-14 and BL-023

## V9 terminal amendment — G3-V8-P1-01

Master §§2.5B/2.5D/2.7/2.8/4.4/4.5 are incorporated in full. Version 3 requires
commitBranch APPEND_ABSENT or COMPLETE_EXACT_EXISTING; non-COMMIT version 2
forbids it and ledgerCommitPrerequisite. Complete COMMIT, even with eligible
suffix, offers exact-existing completion while session relation knowledge is
absent, before bundle/shared-ancestor/suffix flushes. VISIBLE_VERIFIED bundle
suffices: do not gate its issuer on prior ledger durability or V8 writer proof.
Bind actual existing frame bytes/SHA, PREPARE/full prefix/suffix, ledger path/
length/SHA/owner tip, both chains and branch/operation/kind/bundle/heads/facts/
expiry. Fresh one-use C30-13 authority pins/verifies; fsyncs ledger file/full
R/U chain; rechecks; fsyncs existing witness/full chain; reverifies; consumes/
reclassifies. Append ZERO bytes, create ZERO records. Failure grants no success
and leaves existing bytes unchanged. No missing-ledger reconstruction, duplicate
COMMIT or ABANDON. Exit/relevant change loses knowledge. Bundle completion then
separate suffix truncation follows; truncation invalidates knowledge and needs
fresh terminal completion. Only exact same-session knowledge plus sealed bundle/
no suffix and current qualification/fact/fresh-TTY checks permits capability or
new successor; logical COMMITTED alone does not. §15 tests V9; parent
G3-V7-P1-01 is not independently resolved and V8 CHANGES_REQUIRED remains.

## Retained initial V8 sequence

Master §§7–8 propose independent procedure/scope acceptance, applicable G3 and
operator adoption, then actual qualified external tools/finite authorization
before isolated Bootstrap construction. G1 reviews actual final support before
separately authorized real adoption. Ordered C30 development requires current
G1/G3, accepted procedure/tools, per-task authorization and exact current
predecessor, not prior G2. Full G2 follows complete transitive integration:
C30-07 insufficient, C30-13 earliest possible complete source point, relevant
C30-14 packaging/closure included. Runtime activation/use requires all current
applicable approvals, exact identities/evidence and separate authorization;
C30-13 alone activates/issues capability after required durable matching COMMIT.
Standalone Bootstrap owns early verifier/support/registry/CAS/recovery/acceptance/
admission/proof export before C30-01; C30-11/12 integrate qualified consumers.
Start (§7.4) locks before resolving, binds development facts not runtime records,
records source-only admission, externally creates checkout, rechecks launches/
acceptance and uses separately authorized qualified registry CAS. Git commit,
external registry publication and runtime COMMIT are distinct.

Accepted EXTERNAL_DEVELOPMENT_REVIEW source coverage/zero-finding/lineage is
eligible for activation/source delivery under master §§3.5/3.6/7.3, with qualified
closed-format consumer validation, not runtime Sol/finding/accounting/capability
events. U1–U5 remain unresolved; candidate tests use isolated synthetic/local
mocks and external model requests need accepted tools/isolation/enforceable
finite upstream-request/spend controls, not Pi/session counts. No phase is
authorized by this edit; future Flash/Sol roles remain unchanged.

Retained APPEND_ABSENT branch under master §§2.5B/2.5D/2.7/4.5:
integer observationVersion 3 for APPEND_WITNESS_COMMIT, commitBranch APPEND_ABSENT, classification
LEDGER_WITHOUT_COMMIT, closed non-null ledgerCommitPrerequisite with exactly
absoluteCanonicalLedgerPath, fileByteLength, fileSha256. Bind actual C30-03
physical ledger below R, complete bytes and decoded exact current-tip transaction
identity/sequence/predecessor/resulting head; never caller path or
canonical-transaction.jcs. pathBindings is the sorted duplicate-free union of
both full existing ledger/witness chains through U, no ABSENT. Non-COMMIT stays
integer 2; old version-2 COMMIT and version-3 non-COMMIT reject.
Claim/check matching C30-13 authority, pin files/directories/name links, verify
bytes/tip, fsync exact ledger file then every containing directory bottom-up
through R/U including reused ancestors, with before/after identity checks;
recheck all confirmed facts/PREPARE/heads/bundle/expiry before first witness
byte; then exact COMMIT append/witness/full-chain fsync, verify/consume/reclassify.
Visible exact bytes permit issuance without pre-established ledger durability.
Ledger effects are fsync-only, never create/write/append/truncate/rename/
overwrite/republish/cleanup. Repeat after earlier success; bundle completion
supplies no ledger durability. Failure prevents first COMMIT byte and discards
authority; changed storage takes denial/integrity precedence, no silent rebinding.
Previously observed drift allows completion but denies stale capability; new
facts need fresh confirmation. Exit loses authority/attempt knowledge and repeats
even after flushes but before append. Incomplete witness needs separate
truncation; full-but-unflushed COMMIT uses §2.5D without reappend; matching ledger
never ABANDONs. No new lock-file/receipt/registry writer or action; public fields/
framed-byte SHA unchanged, nine outer steps remain. §15 is active V9 modeling;
§§12–14 recorded results/pins are historical, not V9 execution or approval.

## Retained contracts with V8 reconciliation

Master §§2.3A–2.3B define exact private core/descriptor/manifest content and
publication transaction bindings; §2.5B defines closedClassifiedState; §3.4A
defines binding snapshots/evidence/comparisons; §3.4B defines the single
PREPARE reconstruction rule, with no added PREPARE file. §§4.1/4.3/4.4 define
the ordered parser and recovery; §10 contains executed documentation fixtures.
Historical finding D had INDEPENDENT_REREVIEW_PASS independently of the
V5 calculations; V8 rule 3's expanded COMMIT is pending independent review. Master §2.5C defines genuine-first PRE_JOURNAL observation/initialization,
exact path/source/guidance/TTY/byte bindings and its crash table. §3.4C defines
the immutable eleven-entry evidence package, closed manifest/input capsules,
non-circular digests, frame-derived retrieval and crash/reuse/conflict table.
§4.5 enumerates eight bounded logical actions with per-class eligibility;
§15 executes current V9 terminal/lifecycle coverage; §§11–14 recorded results
and pins remain historical.
Master §2.3C's private v2 manifests retain preparedInputs inline, with exact
shared OwnerInputSide-v2/source/budget proof closure including absence. Private
v2 evidence copies PREPARED from that durable capsule and CURRENT from a new
verified observation, never from an oracle for old S. Historical v1 inputs
cannot authorize new operations. Public formulas and all bundle counts remain;
concrete hashes change and §12 pins them. Master §2.5D alone controls durable
anchor, full new/reused ancestor chain and confirmed exact-existing completion,
including header-only prefix/chain support fsync under PERSIST_PREPARED_BUNDLE.
Its prerequisite and §2.5B's V9 branch-discriminated observation/path bindings
precede all recovery rows below; complete COMMIT without session knowledge must
complete its relation before any bundle/suffix flush, even with a visible package. C30-13 alone issues and writes evidence,
C30-03 owns checked storage/no-lock-file primitives, C30-12 classifies and
verifies read-only. No support write is left to an undefined setup/receipt/
registry/cleanup actor. C30-01 rule 2 permits the narrow evidence prerequisite,
not stale PREPARE/ledger/capability. No independent PASS is claimed.

The three status decisions remain separate:

```text
SIGNER_V4_CONTROLLER_ATTESTATION:
BLOCKED_PENDING_STRONGER_MACOS_EXECUTABLE_ATTESTATION

LCIM_3_0_SIGNER_GATE:
REMOVED_BY_SCOPE_DECISION

LCIM_3_1_EXTERNAL_OPERATOR_SIGNER:
DEFERRED_TO_LCIM_3_1
```

LCIM 3.0 has no cryptographic signer, Keychain or remote-delivery authority.
Preserve classifier-first recovery, source-generation invalidation, repair-
until-PASS, BL-023, BL-028 and the `DELIVERY_READY_MANUAL` endpoint.

## Bootstrap construction and recovery

C30-13 owns wholly read-only A0 and the exact master §§2.3–2.4 order: exactly
four local-record candidates plus one non-runnable protocol/run genesis
candidate; four final pre-activation candidate bytes; `activationProposalCore`; transaction-free and
publication-free `candidateSetCore`; domain-separated `candidateSetDigest`;
final activation ID/digest/bytes after candidate-set insertion; canonical
transaction only after all five final bytes; then the private publication
manifest and self-excluding `publicationBundleDigest`. The activation contains
`candidateSetDigest` and no transaction or private publication identity. The
witness PREPARE and action authorities bind `publicationBundleDigest`. The
consistency witness is the publication protocol rather than a candidate, and
C30-14 emits the manual delivery manifest later.

Before any bundle exists, genuine first initialization uses only the bootstrap
INITIALIZE_WITNESS_JOURNAL instance after §2.5C exact fresh TTY. It publishes
LCIMWJ01, consumes/reclassifies header-only; A0 stays read-only and needs no
production capability. Missing history/successor journals and corrupt final
headers never initialize. Interrupted temps are retained, not reused/cleaned.

Before PREPARE, A1 persists exact `candidate-set-core.jcs`, five candidate files,
`canonical-transaction.jcs`, `publication-manifest.jcs` and `SEALED` under the
controller-private external `bootstrap-prepared/v1` root using only master
§2.3's controlling order for both kinds: write final v2 manifest/capsule and
SEALED, fsync all files, then the fully populated staging directory, no-replace
rename, then §2.5D's entire final-parent-to-anchor durability procedure. The manifest lists
fixed artifact names/order/kinds, lengths, SHA-256 and record identities.
Recovery verifies stored exact bytes rather than regenerating candidate or
transaction bytes. Once PREPARE exists, the sealed bundle is immutable and is
never deleted/reused.

Each bootstrap authority instance binds publication kind `TRANSACTION_ZERO`,
operation, `publicationBundleDigest` (null only for genuine initialization),
classified-state digest, expected heads, exact action/byte digest, expiry and
instance ID. The eight actions are INITIALIZE_WITNESS_JOURNAL,
PERSIST_PREPARED_BUNDLE, APPEND_WITNESS_PREPARE, PUBLISH_LEDGER_TRANSACTION,
APPEND_WITNESS_COMMIT, TRUNCATE_INCOMPLETE_FINAL_FRAME,
PERSIST_ABANDON_EVIDENCE, APPEND_WITNESS_ABANDON; one instance performs one mutation and is consumed.
An uninterrupted initial TTY operation chains instances only after consume,
re-read, reclassify and next-action verification. Restart loses all authority;
every recovery mutation requires fresh TTY.

A sealed bundle with no complete operation frame, no incomplete bytes and no
ledger transaction has exactly two states when expected heads match. B1 is
unexpired with all bound source/semantic/guidance/configuration/routing/plan/
budget facts current: the uninterrupted original TTY operation may continue,
but restart requires fresh TTY; C30-13 issues exactly one
`APPEND_WITNESS_PREPARE` instance binding operation, publication-bundle digest,
empty-witness classified-state digest (§2.5B), expected heads, exact
reconstructed prepareFramedByteDigest (§3.4B), expiry and instance ID; append/fsync PREPARE only, consume
and reclassify. B2 is expired or has any bound-fact drift: fresh TTY permits
exactly one PERSIST_ABANDON_EVIDENCE first; publish/fsync the exact §3.4C
package, consume/reverify. Only then may a separately confirmed
APPEND_WITNESS_ABANDON append/fsync the exact direct frame with
preparedFrameDigest null and matching durable evidence; consume/reclassify. It publishes no stale bytes, is not COMMIT
and creates no ledger transaction.

After identified incomplete-first-frame truncation to empty, consume the
truncation authority, perform no other mutation, re-read and enter exactly B1
or B2; no third empty-witness state exists. B2 permits a new transaction-zero
attempt only with new operation/candidate-set/publication-bundle identities,
unchanged transaction-zero ledger predecessor and durable ABANDON witness
predecessor; the old operation/bundle is never reused.

Current PREPARE/no-ledger publishes only stored transaction, then reclassifies
before separate COMMIT. Expired/drifted PREPARE/no-ledger publishes no stale
bytes and requires separate exact evidence persistence/consumption/reverification
before any PREPARE-bound terminal ABANDON append. Matching-ledger/no-
COMMIT repeats the version-3 ledger-file/full-chain fsync prerequisite before
exact witness COMMIT despite previously observed drift; drift blocks capability and requires
C30-13's successor publication path. Existing COMMIT reports logical result and
offers V9 exact-existing completion until session knowledge is valid, never append.
Missing/corrupt bundle, mismatch/competition or bad complete frame quarantines
and never authorizes ABANDON/COMMIT.

## Durable ABANDON reason semantics

Both `terminalReason` and `terminalReasonEvidenceDigest` are required fields on
every closed witness frame. PREPARE requires both null and
`preparedFrameDigest = null`. COMMIT requires both null and the exact matching
PREPARE frame digest. ABANDON requires a non-null reason, non-null SHA-256
evidence digest and non-null publication-bundle digest; its
`preparedFrameDigest` is null for direct sealed-bundle/no-PREPARE
terminalization and otherwise is the exact PREPARE digest.

The exact enum and simultaneous-cause precedence are:

```text
PUBLICATION_BUNDLE_EXPIRED
REVIEWED_SOURCE_IDENTITY_DRIFT
SEMANTIC_CONTRACT_DRIFT
ACTIVE_GUIDANCE_DRIFT
CONFIGURATION_DRIFT
MODEL_ROUTING_DRIFT
PLAN_DECLARATION_DRIFT
BUDGET_CEILING_DRIFT
```

The first true cause is `terminalReason`. `observedCauseSet` is non-empty,
contains every true cause and no unknown value, and is ordered by that same
precedence. Master §3.4A defines the exact snapshots, comparisons, expiry
boundary, retained inputs and both inner hash formulas. The outer formula
below inherits those complete definitions:

```text
terminalReasonEvidenceDigest =
  SHA-256(
    "LCIM-WITNESS-ABANDON-REASON-EVIDENCE-v1\0"
    || JCS({
      bootstrapOperationId,
      publicationBundleDigest,
      preparedFrameDigest,
      observedCauseSet,
      preparedBindingDigest,
      currentBindingDigest,
      observedAt
    })
  )
```

Both terminal fields are in canonical witness payload bytes, witness record-ID
and record-digest preimages and frame/raw-digest preimages; through the frame
digest they are included in the head digest preimage and bound by the head
digest; replay compares them and recovery evidence retains them plus the
complete observed cause set. Integrity failures never become ABANDON reasons:
missing/corrupt bundle, mismatched transaction, competing head, bad frame or
different durable bytes quarantines. TTY absence, operator decline and timeout
are cause-specific no-mutation pauses, not ABANDON reasons.

## Witness recovery

The C30-03 witness retains `LCIMWJ01`, uint32-big-endian length, 1 MiB maximum,
strict JCS UTF-8, raw digest, external journal and the passed nine-step order.
Every path uses exactly:

1. acquire the controller-ledger owner lock;
2. acquire the local-consistency-witness owner lock;
3. perform expected-head checks and the operation;
4. release the witness lock;
5. release the ledger lock.

No path may acquire these locks in reverse order.

Master §4.1 is the sole ordered byte parser. These labels inherit its exact
stage-local completeness, first-cursor/first-stage precedence and header
preservation rules; §4.3 retains sequence checks:

| Order | Predicate | Exact predicate | Exact result |
|---:|---|---|---|
| 1 | `COMPLETE_BAD_MAGIC_OR_HEADER` | partial existing header, or complete bad magic/non-digit encoding, under master §4.1 step 1 | `INTEGRITY_QUARANTINE_BAD_WITNESS_HEADER` |
| 2 | `COMPLETE_UNSUPPORTED_VERSION` | magic and fixed header encoding are valid, but version is unsupported | `INTEGRITY_QUARANTINE_UNSUPPORTED_WITNESS_VERSION` |
| 3 | `COMPLETE_BAD_LENGTH` | complete unsigned length word is zero, over 1048576, or exceeds the specified offset bound; reject before waiting for payload | `INTEGRITY_QUARANTINE_BAD_WITNESS_LENGTH` |
| 4 | `COMPLETE_BAD_UTF8` | supported header and valid length, but payload is not strict UTF-8 | `INTEGRITY_QUARANTINE_BAD_WITNESS_UTF8` |
| 5 | `COMPLETE_BAD_JCS` | complete strict UTF-8 payload fails JSON syntax, duplicate-key/Unicode/JCS representability or exact canonical encoding; no schema checks here | `INTEGRITY_QUARANTINE_BAD_WITNESS_JCS` |
| 6 | `COMPLETE_BAD_DIGEST` | header, version, length, UTF-8 and JCS are valid, but frame digest does not match | `INTEGRITY_QUARANTINE_BAD_WITNESS_DIGEST` |
| 7 | `COMPLETE_BAD_SCHEMA` | digest is valid, but frame-kind-sensitive field rules, sequence, `terminalReason`, `terminalReasonEvidenceDigest`, `preparedFrameDigest` or other closed-schema semantics are invalid | `INTEGRITY_QUARANTINE_BAD_WITNESS_SCHEMA` |

Unknown/missing fields, enums, wrong types/nullability, terminalReason and
intrinsic identities belong only to class 7. Bad raw digest wins over bad
schema. Known malformed input is never eligible truncation; 'empty' retains
the valid eight-byte header. After byte validation, sequence classes run in
this order: (8) multiple complete terminal frames →
`INTEGRITY_QUARANTINE_MULTIPLE_TERMINAL_FRAMES`; (9) competing current heads or
durable operation identity → `QUARANTINED_WITNESS_REPLAY_CONFLICT`; (10)
predecessor/head mismatch →
`INTEGRITY_QUARANTINE_PREDECESSOR_HEAD_MISMATCH`; (11) COMMIT without exact
matching ledger transaction → `INTEGRITY_QUARANTINE_COMMIT_WITHOUT_LEDGER`;
(12) non-tail divergence → `INTEGRITY_QUARANTINE_NON_TAIL_DIVERGENCE`; (13)
valid terminal state → exact `COMMITTED` or `ABANDONED`; (14) valid exact
recoverable tail → the sole matching one-action recovery row; (15) clean/no-
operation → `CLEAN_NO_OPERATION`.

An incomplete final byte suffix is not a complete frame and is classified only
by the separate incomplete-suffix table. Complete-prefix classes 1–12 retain
precedence; classes 13–15 wait until truncation and re-read. Every invalid
complete frame quarantines, but no normative row or precedence class is named
“any invalid complete frame.” A complete frame is never truncated.

The incomplete cases are mutually exclusive: identified incomplete first frame
truncates only to empty, consumes without another mutation and enters exactly
B1 or B2; unidentified incomplete first frame is
`QUARANTINED_WITNESS_UNIDENTIFIED_INCOMPLETE_FIRST_FRAME`; PREPARE suffix
truncates only to PREPARE; COMMIT suffix first requires V9 relation completion,
then separately truncates only the suffix, invalidates knowledge and requires
fresh exact-existing completion before use; its logical result is
committed after reclassification; ABANDON suffix truncates only to ABANDON and
returns abandoned. Every truncation uses one fresh-TTY-confirmed
`TRUNCATE_INCOMPLETE_FINAL_FRAME` instance, one mutation, consumption and
reclassification; it authorizes no append/ledger mutation.

**GENERAL RECORD/REQUEST CONTEXT**

- same operation ID + byte-identical canonical request: return existing
  committed result;
- same operation ID + different bytes, when no witness-integrity conflict has
  already been established: `DENIED_OPERATION_REPLAY_CONFLICT`.

**WITNESS/LEDGER INTEGRITY CONTEXT**

- competing prepared/committed bytes or competing heads established by the
  precedence-first witness classifier:
  `QUARANTINED_WITNESS_REPLAY_CONFLICT`.

The witness-integrity classifier has precedence only when durable prepared/
committed witness or ledger evidence proves that conflict. ABANDON is terminal.
Ordinary exact tails require actual freshly reissued production capability and
the same one-mutation/reclassification discipline. No recovery row is both
recoverable and corruption.

## Successor activation publication authority

`SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY` is a narrow module-private C30-13
class, not a public family, production capability, signer, general ledger,
provider or Git authority, or persisted token. Eligibility requires all six:
prior activation has durable matching COMMIT; stale bound source/semantic/
guidance/configuration/routing/plan/budget facts prevent capability; production
capability is absent; no current settlement exists;
C30-13 completes read-only successor preflight; fresh controlling-TTY
confirmation binds the exact operation.

The exact ordered public candidates are budget successor, operator-session
successor, plan-confirmation successor and activation-settlement successor; no
new genesis. Budget remains at current finite confirmed ceilings unless a
separately displayed/directly confirmed change follows frozen budget rules;
configuration, Flash, Sol, target code and model output cannot increase it.
Session/plan bind exact current facts and activation binds current source/review.
The activation has `candidateSetKind = "SUCCESSOR_ACTIVATION"` and:

```text
successorCandidateSetDigest = SHA-256(
  "LCIM-SUCCESSOR-ACTIVATION-CANDIDATE-SET-v1\0"
  || JCS(successorCandidateSetCore)
)
successorPublicationBundleDigest = SHA-256(
  "LCIM-SUCCESSOR-ACTIVATION-PUBLICATION-BUNDLE-v1\0"
  || JCS(successorPublicationManifest without
         successorPublicationBundleDigest)
)
```

Construction is candidates 1–3 → activation proposal core → successor
candidate-set core → digest → final activation → canonical transaction →
private manifest → publication-bundle digest. Public candidates contain no
transaction/private-bundle/resulting-head/COMMIT identity. The exact external
immutable bundle is:

```text
successor-activation-prepared/v1/<repositoryId>/<operationId>/
  candidate-set-core.jcs
  01-budget-successor.jcs
  02-operator-session-successor.jcs
  03-plan-confirmation-successor.jcs
  04-activation-settlement-successor.jcs
  canonical-transaction.jcs
  publication-manifest.jcs
  SEALED
```

It has exactly eight entries; its manifest describes six payload artifacts,
with manifest/SEALED separately authenticated. Existing persistence/durability
and stored-byte-only recovery rules apply.

Every successor instance binds publication kind `SUCCESSOR_ACTIVATION`, one
operation, one exact action/byte digest from the eight-action vocabulary except
INITIALIZE_WITNESS_JOURNAL (seven actions; never history reset), permits
one mutation, is consumed/reclassified and disappears at exit. Recovery
mutation requires fresh TTY. It cannot invoke provider/validation, general Git,
unrelated ledger/delivery mutation or grant capability. Pre-ledger drift
ABANDONs and starts a new successor. Published ledger bytes COMMIT despite
drift and are never erased; stale COMMIT starts another successor. Only a
current matching successor COMMIT followed by current-fact reverification/
display and fresh TTY permits C30-13 capability issuance. This is finite and
non-circular.

## Activation schema and commit relationship

Freeze `lcim.local-activation-settlement@1` exactly as master §3.5. Its
pre-commit canonical object binds only pre-publication values, including
expected predecessor ledger/witness heads, expected ledger sequence, publication
operation, `candidateSetKind` and `candidateSetDigest`. It contains no
`publicationBundleDigest`, canonical transaction ID/digest, resulting committed
ledger/witness head or COMMIT frame digest. Those derived values belong to the
verified commit/receipt/recovery observation, which binds activation ID/digest,
canonical transaction identity, publication-bundle identity and sequence.

Exact consumers are: C30-12 recovery/audit/reissue inspection; C30-13
activation/capability issuance; C30-14 manual-delivery finalization. Only C30-13
issues production capability after matching durable current COMMIT. Initial
issuance retains still-current original TTY facts; successor issuance requires
exact current-fact reverification/display and fresh TTY confirmation. The record is local
integrity evidence, not authority or a signature.

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
After relevant change S → S', invalidate affected use; externally validate/
RECHECK/seed-free FINAL_REVIEW without stale runtime capability, then qualified
prepare before staging, separately authorized operator exact-path commit,
clean-successor verify, separately authorized registry CAS and accepted-generation
gate applicability. Renew full G2 for changed integrated source/executable/
dependency/packaging closure and G1/G3 for changed subjects. Verified unchanged
scope needs explicit applicability; uncertainty denies. FINAL_REVIEW is not G2.
Changed verifier qualifies before first use; S'' repeats affected invalidation.
Only accepted/requalified source and separate successor authorization permits
activation, then durable settlement/current-fact/fresh-TTY capability/delivery.
Resume exact commits/CAS without duplication; no old build/rehearsal evidence
is relabeled as new bytes. These are FUTURE requirements, not permission to act.

The manual-delivery manifest consumes the fresh current activation, never the
invalidated predecessor activation. Remote publication, push, PR, CI, merge and
production verification remain outside LCIM 3.0.

## Manual delivery and BL-028

`lcim.manual-delivery-manifest@1` has exactly the master §3.6 closed fields and
is content-addressed manual evidence. Exact consumers are: C30-12 recovery/audit
inspection; C30-13 activation-dependent consistency; C30-14 manual-delivery
finalization; human delivery operator. It grants no remote authority.

BL-023 retains deterministic seed/finding/repair/successor/validation/exact
RECHECK/complete FINAL_REVIEW. Seed removal invalidates seeded activation and
review evidence; all master §6.2 checkpoint/adoption/gate-applicability steps,
successor activation, durable matching COMMIT and fresh capability precede manifest
finalization. BL-028 still requires an existing release with unknown identity/
effective-date authority to remain present with explicit diagnostic and bound
audit evidence; no clipping or silent drop is allowed.

## Removed families, limits and gates

Signed `LEDGER_WITNESS`, `ACTIVATION`, `DISTRIBUTION_RC1` and
`DISTRIBUTION_FINAL` are not emitted or required in LCIM 3.0. Future signed
forms belong to LCIM 3.1. The local witness, activation and manifest are not
signatures, anti-rollback anchors or independent identity proofs.

The bounded threat model excludes hostile same-UID processes, root/kernel
compromise, live-controller debugging/memory theft, malicious OS, full-machine
compromise and coordinated rollback of every local root. All current applicable
G1/G2/G3 and exact reviewed identities remain required for separately authorized
runtime use; master §§7–8 define distinct development predicates. G3 remains `CHANGES_REQUIRED_PENDING_FRESH_REREVIEW`.
