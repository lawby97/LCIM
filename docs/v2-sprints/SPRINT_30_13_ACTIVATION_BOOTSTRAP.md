# C30-13 — local activation settlement and capability issuance

**Development gate:** master §§7–8 phases A–D: accepted external procedure/tools,
current applicable G1/G3, exact per-task authorization, accepted Bootstrap and
current immediate predecessor. G2 follows complete integrated implementation;
activation/use requires phase F, all current applicable G1/G2/G3 and separate
operator authorization. None is granted here. Component runtime prerequisites
below are not prerequisites to constructing their own code in isolated fixtures.

**Status:** `PLAN_AMENDED / IMPLEMENTATION_PENDING`

**Implementation dependency:** C30-12 verified implementation successor SHA,
plus master §7 phase D development predicates. This dependency does not require
a pre-existing production activation settlement.

**Next:** `SPRINT_30_14_PROVENANCE_RELEASE.md`.

## Objective

Implement the only LCIM 3.0 A0/A1 transaction-zero bootstrap, successor-
activation publication, exact-tail recovery and production-capability issuance
path. Sprint completion proves the
implementation; it does not perform production activation. No cryptographic
signer, Keychain or independent operator identity proof is used.

## Local activation family

Freeze:

```text
lcim.local-activation-settlement@1
```

C30-13 is the first emitter. Its strict fields match master §3.5 exactly: the
common record/generation/CAS fields; repository/run/source generation,
commit/tree; semantic, guidance, configuration and routing digests; plan,
budget and operator-session generation IDs/digests; review-coverage digest and
literal current-generation PASS status; zero-finding digest/count; capability-
manifest name/version/digest; expected predecessor ledger/witness heads;
expected ledger sequence; bootstrap and operator-confirmation operation IDs;
`candidateSetKind`; `candidateSetDigest`; literal `REQUIRES_MATCHING_COMMIT`;
and `preparedAt`. Transaction zero uses `TRANSACTION_ZERO`; successor
publication uses `SUCCESSOR_ACTIVATION`.

The activation contains no private `publicationBundleDigest`, canonical
transaction ID/digest, resulting ledger/witness head or COMMIT frame digest.
Those later values belong only to verified publication/receipt/recovery
evidence. The public candidate never depends on the private publication
envelope. The record is integrity-chained local evidence, not a signature,
signed activation, independent identity proof or remote publication authority.

## V9 qualification inputs and COMMIT effects — G3-V8-P1-01

Master §§2.5B/2.5D/2.7/2.8/4.4/4.5 are incorporated in full. Required version-3
commitBranch is APPEND_ABSENT or COMPLETE_EXACT_EXISTING; non-COMMIT version 2
forbids it and ledgerCommitPrerequisite. Complete matching COMMIT (including an
eligible suffix prefix) without exact session relation knowledge offers the
exact-existing branch before bundle/shared-ancestor/suffix flushes. It accepts
VISIBLE_VERIFIED bundle, requires no historical writer proof or prior ledger
durability, and binds existing COMMIT frame bytes/SHA, PREPARE/full prefix/suffix,
ledger/tip, both complete chains, branch/operation/kind/bundle/heads/facts/expiry.
Fresh one-use C30-13 authority pins/verifies, fsyncs ledger file/full R/U chain,
rechecks, fsyncs existing witness/full chain, reverifies, consumes/reclassifies.
Append ZERO bytes, create ZERO records; no rewriting, duplicate COMMIT or ABANDON.
Failure leaves existing bytes unchanged and denies success/use. Completion is
owner-session memory tied to exact identities, lost on exit or relevant change.
Complete bundle afterward; separately truncate suffix, invalidate and repeat
terminal completion. Logical COMMITTED alone never allows capability/successor:
sealed bundle/no suffix and current generation/qualifications/facts/fresh TTY
are also required. Invalid/missing ledger quarantines without reconstruction.
Parent G3-V7-P1-01 is not independently resolved; V8 verdict remains CHANGES_REQUIRED.

C30-13 integration is the earliest possible complete G2 source point, not full
G2 by itself: include relevant C30-14 packaging/closure changes and schedule
final G2 after complete integration (master §7 phase E). Phase F runtime
activation requires all current applicable G1/G2/G3, exact complete identities/
evidence and separate operator authorization. C30-13 alone runs activation,
then issues capability only after the required durable matching COMMIT.
Accepted EXTERNAL_DEVELOPMENT_REVIEW coverage/zero-finding/source lineage is
eligible under master §7.3/§8.1 U3, with qualified closed-format consumer
validation, not runtime Sol calls/finding/accounting events or capability.

The retained APPEND_ABSENT path requires integer observationVersion 3 for
APPEND_WITNESS_COMMIT, commitBranch APPEND_ABSENT, LEDGER_WITHOUT_COMMIT and
non-null closed ledgerCommitPrerequisite: exactly
absoluteCanonicalLedgerPath, fileByteLength and fileSha256. Bind actual owner
physical ledger below R, complete bytes, exact tip transaction identity/sequence/
predecessor/resulting head and the sorted duplicate-free union of both complete
existing ledger/witness chains through U, no ABSENT. Never caller-selected or
canonical-transaction.jcs. Non-COMMIT remains integer 2; old v2 COMMIT rejects.

Under matching one-use C30-13 authority/fixed locks: claim and check all bindings/
expiry; pin descriptors/name links; verify physical ledger bytes and decoded tip;
fsync that exact file; fsync every containing directory bottom-up through R/U,
reused ancestors included with before/after identity checks; reverify all
confirmed facts, witness PREPARE prefix, heads, bundle prerequisite and expiry
before first witness byte; then append exact COMMIT, fsync witness/full chain,
verify, consume/reclassify. Visible exact ledger bytes permit issuance without
pre-established durability. Repeat the ledger prerequisite after earlier
reported success; bundle completion supplies no ledger-durability conclusion.
Ledger effects are fsync-only, never create/write/append/truncate/rename/
overwrite/republish/cleanup, with no lock-file/receipt/registry writer.
Flush failure prevents first COMMIT byte and discards authority; storage drift
uses defined denial/integrity precedence, never silent rebinding. Previously
observed drift allows exact completion but blocks stale capability; newly changed
displayed facts require fresh confirmation. Exit loses authority and durability
knowledge; repeat even after ledger flushes but before append. Partial witness
tails need separate truncation; full-but-unflushed COMMIT uses §2.5D without
reappend; matching published ledger never ABANDONs. §15 is active V9 testing;
§§12–14 pins/results remain historical. Public fields/framed-byte SHA are unchanged;
nine outer steps remain, but COMMIT's internal effects deliberately expand.

## Preconditions

Master §§2.3A–2.3B are the exhaustive core/descriptor/manifest/transaction
contracts for both publication kinds. §2.5B defines closedClassifiedState;
§3.4A defines both binding snapshots and exact ABANDON comparisons/digests;
§3.4B is the sole deterministic PREPARE reconstruction rule. These normative
references govern every construction and recovery below; neither bundle gains
a PREPARE file. `successorPublicationBundleDigest` is exactly the witness and
authority publicationBundleDigest value alias, never an additional hash.
Master §2.3C additionally versions both private manifests to 2 and requires
inline prepared-input retention, seven-member OwnerInputSide-v2 and complete
source/budget proof archives, including absence. §3.4C v2 evidence copies its
prepared side from those persisted bytes and current side from a new verified
observation. Historical v1 inputs cannot authorize new publication. §2.5B's V8
action-discriminated observationVersion/pathBindings and §2.5D durability gate precede every recovery
row below: readable complete bundles/evidence are not ready after restart until
their same confirmed persistence action completes the full flush contract.
PERSIST_PREPARED_BUNDLE also completes existing header/prefix-chain durability;
with complete COMMIT it must wait for V9 exact relation completion, even for
shared ancestor flushes. It never writes header content or revives initialization.

A0 is read-only. It verifies the complete current implementation/source,
semantic/guidance/configuration/routes, reviews, zero findings and finite
ceilings, then freezes exactly:

1. final JCS bytes for budget → session → plan → non-runnable genesis;
2. `activationProposalCore`, excluding candidate-set/record/transaction/
   publication/resulting-head/COMMIT identities;
3. `candidateSetCore`, containing exact descriptors for candidates 1–4 and the
   activation core plus all bound identities/expected heads/sequence, but no
   candidate-set/transaction/publication identity;
4. `candidateSetDigest = SHA-256("LCIM-GENESIS-ACTIVATION-CANDIDATE-SET-v1\0"
   || JCS(candidateSetCore))`;
5. final activation ID/digest/JCS after inserting
   `candidateSetKind = "TRANSACTION_ZERO"` and `candidateSetDigest`;
6. one canonical transaction after all five final candidate byte strings; and
7. the private `lcim.genesis-activation-publication-bundle@2` manifest including
   the already verified §2.3C prepared-input capsule; the unchanged self-excluding
   hash algorithm now authenticates these expanded bytes.

The private manifest binds final transaction ID/digest and exact length/SHA-256
for every artifact. The public activation never binds publication or
transaction identity. These are exactly five bootstrap publication candidates:
four local-record candidates (budget, session, plan and activation) plus one
non-runnable protocol/run genesis candidate. The witness is the publication
protocol, not a candidate; C30-14 emits the manual delivery manifest later. A0
displays all facts and writes no authoritative byte.

If no journal exists, first use only master §2.5C's PRE_JOURNAL observation,
exact TTY display/line and INITIALIZE_WITNESS_JOURNAL bootstrap instance to
publish LCIMWJ01 through its checked no-replace temporary/parent protocol.
No prepared bundle, production capability or fabricated eight-byte prefix is
required. Consume/reclassify header-only; A0 still writes nothing. Existing
frames or evidence of historical journal use prohibit initialization; corrupt
final headers quarantine. All initialization restart outcomes are §2.5C.

After normal complete A0 display and direct TTY confirmation, A1 persists the byte-complete private
bundle at controller-private
`bootstrap-prepared/v1/<repositoryId>/<bootstrapOperationId>/`, outside target,
Git-common and run directories. It contains `candidate-set-core.jcs`, five
numbered candidate `.jcs` files, `canonical-transaction.jcs`,
`publication-manifest.jcs` and `SEALED`. Every `.jcs` is exact UTF-8. The
manifest lists fixed filename/ordinal/family-or-kind/byteLength/SHA-256 and
record identity where applicable. Persistence for **both kinds** uses only the
controlling master §2.3 order: final manifest/capsule and SEALED entries must
exist before the required fully populated staging-directory fsync. §2.5D
alone defines the verified anchor/complete ancestor flushes, including reused
paths, and confirmed exact-existing fsync-only completion. Sealed artifacts
are never altered. Recovery rejects missing/unexpected/traversing/mismatched files and
never regenerates candidate or transaction bytes. After PREPARE, no delete or
rewrite is allowed.

C30-13 issues only action-specific module-private publication authorities.
Transaction zero uses `GENESIS_ACTIVATION_BOOTSTRAP_AUTHORITY`; the separate
successor path below uses `SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY`. Every
instance binds publication kind, one operation, its private publication-bundle
digest (null only for §2.5C initialization), classified-state digest, expected ledger/witness heads, exact action,
exact artifact/frame/transaction byte digest, expiry and unique authority
instance ID. The enum is exactly:

```text
INITIALIZE_WITNESS_JOURNAL
PERSIST_PREPARED_BUNDLE
APPEND_WITNESS_PREPARE
PUBLISH_LEDGER_TRANSACTION
APPEND_WITNESS_COMMIT
TRUNCATE_INCOMPLETE_FINAL_FRAME
PERSIST_ABANDON_EVIDENCE
APPEND_WITNESS_ABANDON
```

Master §4.5 is the bounded logical mutation/effect matrix: bootstrap has eight
state-restricted actions; successor seven, excluding initialization. §3.4C
freezes the eleven-entry external immutable evidence package, descriptor/hash
construction, frame-derived retrieval key, controller writer and durability
protocol. PERSIST_ABANDON_EVIDENCE authorizes only that package, and ABANDON
append writes only its existing exact frame after matching durable evidence
verifies. No action object is persisted or exposed to models/target code.

One instance performs one mutation and is consumed. The initial TTY operation
may receive the next action authority only after consume, re-read, reclassify
and exact next-head/action verification. No authority covers PREPARE + ledger + COMMIT. C30-13 is the sole issuer of
transaction-zero instances, successor-publication instances and
`PRODUCTION_RUNTIME_CAPABILITY`. Initial capability follows exact current
settlement, matching durable COMMIT, all action-authority consumption and the
still-current original TTY-confirmed facts. Successor capability additionally
requires exact current-fact reverification/display and fresh TTY confirmation.
Provider dispatch and all ordinary production mutations
require that actual object.

## State, restart and ABANDON ordering

A restart returns with production capability and all action authorities absent.
C30-12 first performs closed read-only classification; every recovery mutation
requires fresh TTY confirmation and one new one-action authority.

- **B1 current sealed bundle, empty witness:** exact bundle verifies; no complete
  operation frame or incomplete bytes; no ledger transaction; expected heads
  match; unexpired; all bound source/semantic/guidance/configuration/routing/
  plan/budget facts current. The uninterrupted original TTY operation may
  continue; restart requires fresh TTY. C30-13 issues exactly one
  `APPEND_WITNESS_PREPARE` instance binding operation, publication-bundle
  digest, empty-witness classified-state digest (§2.5B), expected heads,
  reconstructed prepareFramedByteDigest (§3.4B), expiry and instance ID. Append/fsync only PREPARE,
  consume, re-read and reclassify; no ledger/COMMIT mutation under it.
- **B2 stale or expired sealed bundle, empty witness:** the same no-frame/no-
  ledger/head predicate, but expired or at least one bound fact drifted. Fresh
  TTY first permits one PERSIST_ABANDON_EVIDENCE instance. Publish/fsync exact
  §3.4C evidence, consume/reverify current heads and retained bytes, then obtain
  separate fresh-TTY APPEND_WITNESS_ABANDON authority. Append/fsync only the
  exact direct frame with preparedFrameDigest null; consume/reclassify ABANDONED.
  Publish no candidate/transaction bytes. It is not COMMIT and creates no
  ledger transaction.
- PREPARE, no ledger, exact bundle valid/current: exactly one
  `PUBLISH_LEDGER_TRANSACTION` instance publishes exact stored transaction;
  consume and reclassify before a separate COMMIT instance.
- PREPARE, no ledger, bundle expired or any bound fact drifted: publish no stale
  bytes; first persist exact PREPARE-bound evidence under its own fresh-TTY
  PERSIST_ABANDON_EVIDENCE instance, consume/reverify; a separately confirmed
  APPEND_WITNESS_ABANDON appends only the matching frame if still eligible.
- Matching ledger, no COMMIT: exactly one `APPEND_WITNESS_COMMIT` instance
  completes COMMIT even after drift. Drift blocks production capability and
  requires the successor-publication path below.
- Matching COMMIT: report logical result; when relation knowledge is absent
  offer fresh COMPLETE_EXACT_EXISTING before bundle/suffix flushes, never append;
  complete all remaining §2.5D prerequisites before capability/successor use.
- Corrupt/missing bundle, mismatched transaction/frame, competing identity/head
  or bad complete frame: quarantine; never ABANDON or COMMIT.

After identified incomplete-first-frame truncation to the empty verified
prefix, consume the truncation authority, perform no additional mutation,
re-read the exact bundle/current facts and enter exactly B1 or B2. No third
empty-witness state exists. Other incomplete suffixes truncate only to their
verified PREPARE/COMMIT/ABANDON prefix, consume and reclassify; complete-COMMIT
suffixes first require V9 relation completion, then separate truncation invalidates
knowledge and requires fresh terminal completion. No truncation instance
authorizes append or ledger mutation.

B2 or PREPARE/no-ledger ABANDON permits a new transaction-zero attempt only
with new operation/candidate-set/publication-bundle identities, unchanged
transaction-zero ledger predecessor and durable ABANDON witness predecessor.
The old operation/bundle are never reused.

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
precedence. Both snapshot schemas, inner formulas, retained inputs, all
comparisons and exact expiry boundary are master §3.4A. The outer formula below
inherits those complete definitions:

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

## Disjoint complete-frame classifier

Master §4.1 is the normative ordered byte parser; §4.3 owns sequence checks.
These diagnostic labels inherit its stage-local completeness and exact
first-cursor/first-stage precedence:

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
schema. Eligible EOF is exactly master §4.1 and never includes a known invalid
header/version/length; a header-only prefix retains eight bytes. After byte
validation, sequence classes run in this order: (8) multiple complete terminal frames →
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

## Successor activation publication authority

`SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY` is a narrow module-private C30-13
class, not a public family, production capability, signer, general ledger,
provider or Git authority, or persisted token. Starting a new successor (not
completing an existing selected relation) requires master §6.2's accepted source
and exact current gate applicability, and: prior
activation has durable matching COMMIT; stale bound source/semantic/guidance/
configuration/routing/plan/budget facts prevent capability; capability is
absent; no current activation exists; C30-13 completes read-only
successor preflight; and fresh controlling-TTY confirmation binds the exact
operation.

The successor candidate set is exactly, in order: (1) budget successor, (2)
operator-session successor, (3) plan-confirmation successor, (4) activation-
settlement successor; it contains no genesis. Budget ceilings are preserved
unless a separately displayed/directly confirmed change obeys all frozen budget
rules; configuration, Flash, Sol, target code and model output cannot increase
them. Session/plan bind exact current facts; activation binds exact current
source/review generation.

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

Construction is candidates 1–3, activation proposal core, candidate-set core,
candidate-set digest, final activation, canonical transaction, private manifest,
publication-bundle digest. Public candidates contain no transaction/private-
bundle/resulting-head/COMMIT identity. The exact external immutable bundle is:

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

These are exactly eight entries. Its manifest describes the six payload
artifacts; manifest/SEALED are authenticated separately. Transaction-zero
persistence/durability and stored-byte-only recovery rules apply unchanged.

Every successor instance binds publication kind `SUCCESSOR_ACTIVATION`, one
operation, one action and one exact byte digest from the eight-action vocabulary
except INITIALIZE_WITNESS_JOURNAL (seven eligible actions);
it permits one mutation, is consumed, requires re-read/reclassification and
disappears at exit. Recovery mutation requires fresh TTY. The class cannot
invoke models/validation, perform general Git or unrelated ledger mutation,
finalize delivery or grant production authority.

Pre-ledger drift ABANDONs the exact successor and requires a new successor
operation. Once the exact ledger transaction exists, COMMIT completes despite
drift; history is never erased/abandoned, and stale COMMIT requires another
successor. After current matching COMMIT, C30-13 reverifies exact current source,
review, plan, budget, ledger and witness facts, verifies current activation
generation, displays them and obtains fresh TTY. Only then may it issue
production capability. No production authority creates itself.

## Descendant invalidation

A changed source generation, patch, validation, Sol coverage, finding, review,
checkpoint, barrier, operator manifest or manual-delivery identity invalidates
activation and dependent descendants. Regeneration starts from the preceding
verified source successor. Exact current checkpoint/barrier generations and
CAS are required.

## Owned families

| Family | First emitter | Consumers |
|---|---|---|
| `lcim.local-activation-settlement@1` | C30-13; transaction-zero/successor candidate binds public `candidateSetKind` and domain-separated `candidateSetDigest` only | C30-12 recovery/audit/reissue inspection; C30-13 activation/capability issuance; C30-14 manual-delivery finalization |
| `lcim.protocol-capability-manifest@1` | C30-13 verifier | non-authoritative component/schema version compatibility only |
| `lcim.activation-invalidation@1` | descendant source change | recovery/delivery |

The activation schema's exact shape/domains/CAS/replay/supersession/recovery/
version rules are master-plan §§3 and 3.5. No schema represents the production
capability object.

`lcim.local-consistency-witness@1` is consumed from C30-03 by: C30-03
controller ledger; C30-05 accounting; C30-08 findings; C30-09 repairs; C30-10
barriers; C30-11 operator checkpoint; C30-12 recovery/audit; C30-13 activation;
C30-14 delivery. It records local head observations outside target/Git-common/
run directories and is not a cryptographic witness or anti-rollback anchor.

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
After S → S', external validation/RECHECK/seed-free FINAL_REVIEW is followed by
qualified prepare before staging, separately authorized operator exact-path
commit, clean-successor verification, separately authorized registry CAS, and
accepted-generation applicability/renewal of full G2 and changed G1/G3 subjects.
FINAL_REVIEW alone is not G2. Only then separate successor authorization and
§2.5D durable settlement/current-fact/fresh-TTY checks permit capability/delivery.
Changed verifiers qualify before authoritative use; uncertain carry denies.
S'' restarts affected invalidation/requalification. Resume verified existing
commits/CAS without duplication under their existing authorization/recovery
contracts. These are FUTURE requirements; no effect is authorized here.

The manual-delivery manifest consumes the fresh current activation, never the
invalidated predecessor activation. Remote publication, push, PR, CI, merge and
production verification remain outside LCIM 3.0.

## Acceptance and implementation prompt

Test A0's complete no-write property, transaction-zero and successor acyclic
digests, both exact stored bundles/persistence boundaries, all eight actions
with per-class eligibility (successor never initializes), §15 V9 terminal/lifecycle and retained regressions plus
crash traces, evidence-before-ABANDON and all §3.4C recovery/reuse/conflict cases,
one action/one bounded logical mutation, B1/B2 and incomplete-first
reclassification, terminal-reason enum/evidence/preimages, seven disjoint
complete-frame predicates, stale pre-ledger ABANDON/new-operation rules,
ledger-published COMMIT despite drift, and no capability before current matching
COMMIT/current-fact reverification/display/fresh TTY. Also test ordinary-API
denial, restart absence, current-source CAS, descendant invalidation, replay
precedence and resulting-head exclusions.
Implement only local bootstrap/settlement, private capability issuance, exact-
tail reissue and invalidation. Do not invent signer custody,
perform runtime activation while implementing, implement remote delivery or
claim production verification. Do not access credentials or Keychain. Return
files/tests/commands/results/acceptance/unresolved issues/ICRs; do not commit.

## Normative Start/dependency gate

The common development Start contract is master §7.4, incorporated in full.
Predecessor: `C30-12`. Check procedure/current applicable G1/G3,
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
