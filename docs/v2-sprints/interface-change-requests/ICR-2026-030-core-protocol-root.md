# ICR-2026-030 — local authority, plan confirmation and protocol root

- **Date:** 2026-03-09 (retained lineage; combined V8 documentation amendment)
- **Origin:** frozen V7 baseline; sequencing proposal and G3-V7-P1-01
- **Status:** `AMENDED_PENDING_INDEPENDENT_V9_REVIEW` — G3-V8-P1-01 definitions/tests complete; no gate approval
- **Affected units:** BOOTSTRAP, C30-01, C30-02, C30-03, C30-11 through C30-14

## V9 terminal amendment — G3-V8-P1-01

Master §§2.5B/2.5D/2.7/2.8/4.4/4.5 are incorporated in full. Version 3 adds
required commitBranch APPEND_ABSENT or COMPLETE_EXACT_EXISTING; non-COMMIT
version 2 forbids it and ledgerCommitPrerequisite. COMMITTED (or complete COMMIT
plus eligible suffix) without exact session relation knowledge offers the
exact-existing branch **before bundle/shared-ancestor/suffix flushes**, with
VISIBLE_VERIFIED bundle allowed. Bind exact existing COMMIT bytes/SHA, PREPARE/
full prefix/suffix, physical ledger path/length/SHA/owner tip, both existing
chains, branch/operation/kind/bundle/heads/facts/expiry. Fresh C30-13 one-use
authority pins/verifies; fsyncs ledger file/full R/U chain; rechecks; fsyncs
existing witness/full chain; reverifies; consumes/reclassifies. Append ZERO
bytes, create ZERO records; do not reconstruct frame timestamps or missing ledger.
No prior ledger durability/historical writer proof gates issuance. Every flush
failure leaves bytes unchanged and denies success/use. Exit/relevant change
invalidates memory knowledge. Then complete bundle; separately truncate suffix,
invalidate and repeat completion. Logical COMMITTED alone never allows capability/
new successor: same-session key, sealed bundle/no suffix, current qualifications/
facts/fresh-TTY checks all apply. Parent G3-V7-P1-01 is not independently resolved;
V8 verdict CHANGES_REQUIRED remains historical. §15 is active V9 coverage.

## Retained initial V8 sequence

Master §§7–8 replace the circular blanket gate with proposed phases A–F:
procedure/scope independent acceptance, applicable G3 and operator adoption;
qualified external tools and finite authorization before real isolated Bootstrap
construction; G1 of actual final support/evidence before separately authorized
real adoption; current G1/G3/accepted procedure/tools/task/current predecessor
for ordered C30 development; final G2 after complete transitive integration and
relevant C30-14 closure, not C30-07 alone; all current applicable approvals and
separate authorization before C30-13 activation/use. None is granted here.
Bootstrap owns mandatory verifier/tool/import/schema closure, immutable outputs,
registry/head/CAS initialization/recovery, source review/admission/currentness/
consumed handoffs and retained proof export before C30-01. C30-11/12 integrate
qualified support/consumers, not first availability. Start (§7.4) locks before
resolving current predecessor, binds development facts, admits source-only input,
externally creates checkout, rechecks launches/acceptance and uses separately
authorized qualified CAS. Git commit, external registry and runtime COMMIT differ.
EXTERNAL_DEVELOPMENT_REVIEW qualifies source under §7.3, not runtime Sol/finding/
accounting/capability records; U1–U5 remain unresolved. Candidate tests are isolated
synthetic/local mocks; external model requests need accepted tools/isolation and
finite enforceable upstream-request/spend controls, not Pi/session counts.

Retained APPEND_ABSENT branch from G3-V7-P1-01: master §§2.5B/2.5D/2.7/4.5
require integer observationVersion 3 for COMMIT, commitBranch APPEND_ABSENT,
LEDGER_WITHOUT_COMMIT, closed non-null ledgerCommitPrerequisite with exactly
absoluteCanonicalLedgerPath, fileByteLength, fileSha256. The actual physical
C30-03 ledger below R (not caller path/canonical-transaction.jcs) binds complete
bytes and decoded current-tip transaction identity/sequence/predecessor/resulting
head. pathBindings is the sorted duplicate-free union of both full existing
ledger/witness chains through U, no ABSENT; non-COMMIT stays integer 2.
Claim matching one-use C30-13 authority, pin/check files/directories/name links,
verify bytes/tip, fsync pinned ledger file then every containing directory
bottom-up through R/U including reused ancestors with before/after checks;
reverify all confirmed facts/PREPARE/heads/bundle/expiry before first witness
byte; then exact COMMIT append and full witness durability, consume/reclassify.
Ledger effects are fsync-only, never create/write/append/truncate/rename/
overwrite/republish/cleanup. Visible exact bytes suffice for issuance, not
pre-established durability. Repeat after earlier success; bundle completion
supplies no ledger durability. Flush failure discards authority before COMMIT;
changed storage uses denial/integrity precedence, never silent rebinding.
Already observed drift allows completion but blocks capability; newly changed
facts require fresh confirmation. Exit loses authority/knowledge and repeats
the prerequisite, even after flushes but before append. Incomplete witness
needs separate truncation; full-but-unflushed COMMIT uses §2.5D without reappend;
matching ledger never ABANDONs. No new action/public field/writer; framed SHA
unchanged, nine outer steps remain. §15 models V9; §§12–14 pins/results are historical.

## Retained contracts with V8 reconciliation

Normative closure is master §§2.3A–2.3B (private core/descriptor/manifest and
publication transaction projection), §2.5B (closedClassifiedState), §3.4A
(binding snapshots, comparisons and inner/outer evidence hashes), §3.4B
(exhaustive deterministic PREPARE field-source rule), and §§4.1/4.3/4.4
(ordered parser and recovery). No PREPARE file is added. Latest finding D's
C30-01 stale/pre-ledger ABANDON/post-ledger COMMIT distinctions had a prior
INDEPENDENT_REREVIEW_PASS; V8's amended rule 3 is not covered by that attribution. Master §10 holds executed documentation fixtures,
not production or G3 evidence. Master §2.5C retains the closed PRE_JOURNAL
variant, intended versus persisted identities, genuine-first absence checks,
exact initialization byte digest/TTY line, checked no-replace header publication
and exhaustive restart table. §3.4C defines the independently authorized
immutable eleven-entry evidence package, closed manifest/descriptor/input
capsules, digests, frame-derived retrieval and evidence-before-append recovery.
§4.5 enumerates every bounded logical write and per-class eligibility; §11
is historical; §15 executes current V9 coverage while §§12–14's
recorded V7/V8 models and pins remain historical. Master §2.3C
explicitly versions private publication manifests and evidence packages to 2:
inline preparedInputs capsule, shared OwnerInputSide-v2 and complete source/
budget proof archives including absence. Prepared ABANDON bytes come from
that durable capsule; current bytes from a separate verified observation.
Public schemas/domains and nine/eight filenames, seven/six descriptors stay
fixed; concrete private/witness/evidence hashes change. Historical v1 cannot
authorize new publication. §2.5D is the sole anchor/entire-chain procedure,
including reused ancestors, existing-prefix header continuation under BUNDLE,
confirmed exact-existing fsync-only completion and failure rules. §2.3 is the
single fully populated staging order for both kinds. These prerequisites and
§2.5B's action-discriminated version-2/non-COMMIT and version-3/COMMIT
pathBindings precede every recovery row below;
visible complete bytes are not durable authority. C30-13 is sole issuer and evidence writer, C30-03
storage owner, C30-12 read-only verifier/planner. No setup/receipt/lock-file/
cleanup writer, persisted authority, new bundle entry or public family exists.
C30-01 guard rule 2 now permits only evidence persistence as the narrow
prerequisite to separately authorized ABANDON; rules 1/2/4/5 retain their
V7 text, while V8 deliberately changes rule 3's ledger-durability completion.

The three status decisions remain separate:

```text
SIGNER_V4_CONTROLLER_ATTESTATION:
BLOCKED_PENDING_STRONGER_MACOS_EXECUTABLE_ATTESTATION

LCIM_3_0_SIGNER_GATE:
REMOVED_BY_SCOPE_DECISION

LCIM_3_1_EXTERNAL_OPERATOR_SIGNER:
DEFERRED_TO_LCIM_3_1
```

Cryptographic signer custody, signed runtime authorization and strong same-UID
executable attestation remain outside LCIM 3.0. No V5 signer experiment, signer implementation, Keychain dependency or source
code is authorized by this ICR; G3 documentation rereview V7 is distinct.

The bootstrap is now exact and acyclic:

- A0 is wholly read-only. It finalizes exact bytes for budget, session, plan and
  non-runnable genesis; constructs `activationProposalCore` and a transaction-
  free/publication-free `candidateSetCore`; hashes the candidate-set domain;
  inserts `candidateSetDigest` into activation; computes activation identity;
  and only after all five final candidate bytes constructs the canonical
  transaction.
- The public activation contains `candidateSetDigest` and no private
  `publicationBundleDigest` or transaction ID/digest.
- After the transaction is final, C30-13 constructs the private
  `lcim.genesis-activation-publication-bundle@2` manifest including §2.3C's
  already verified preparedInputs capsule, excluding
  `publicationBundleDigest` from its own domain preimage, computes that digest,
  then inserts it. The witness PREPARE and action authorities bind this private
  identity; no public candidate does.
- The byte-complete sealed directory is controller-private, outside target/
  Git-common/run storage, and contains exact candidate-set core, five candidate
  files, canonical transaction, publication manifest and SEALED bytes. Its
  manifest lists every immutable artifact's fixed filename, ordinal, family/
  kind, byte length, SHA-256 and record identity where applicable. Persistence
  follows only master §2.3's full order: final manifest/capsule and SEALED
  entries precede the fully populated staging-directory fsync, then no-replace
  rename and §2.5D's final-parent/entire-ancestor-chain flushes. After
  PREPARE it is never deleted or rewritten; recovery verifies stored bytes and
  never regenerates candidate/transaction bytes.
- A1 uses action-specific, opaque, one-use bootstrap-authority instances. Every
  instance binds publication kind `TRANSACTION_ZERO`, operation,
  `publicationBundleDigest` (null only for genuine initialization), classified-
  state digest, expected heads, one action/byte digest, expiry and instance ID.
  The eight actions are INITIALIZE_WITNESS_JOURNAL, PERSIST_PREPARED_BUNDLE,
  APPEND_WITNESS_PREPARE, PUBLISH_LEDGER_TRANSACTION, APPEND_WITNESS_COMMIT,
  TRUNCATE_INCOMPLETE_FINAL_FRAME, PERSIST_ABANDON_EVIDENCE,
  APPEND_WITNESS_ABANDON. Each authorizes
  one mutation and is consumed. The initial TTY operation can chain instances
  only after consume/re-read/reclassify/verify-next-action; restart loses all
  instances and every recovery mutation requires fresh TTY.
- Publication retains PREPARE → canonical ledger transaction → matching COMMIT.
  Production capability issues only after durable matching current COMMIT and
  all action-authority consumption. Initial issuance retains still-current
  original TTY facts; successor issuance requires exact current-fact
  reverification/display and fresh TTY confirmation.

The acyclic candidate order is literal:

1. `lcim.local-budget-ceiling@1` — genesis predecessor/head null; no session or
   plan-confirmation reference;
2. `lcim.local-operator-session@1` — may reference only the earlier budget;
3. `lcim.local-plan-confirmation@1` — may reference the earlier budget/session;
4. non-runnable protocol/run genesis — uses all-zero ledger predecessor and
   null witness predecessor only at transaction zero and no resulting head;
5. `lcim.local-activation-settlement@1` — uses earlier candidates, expected
   predecessor heads/sequence, `candidateSetKind = "TRANSACTION_ZERO"` and
   `candidateSetDigest`.

These are exactly four local-record candidates plus one non-runnable
protocol/run genesis candidate. The consistency witness is the PREPARE/COMMIT
protocol, not a candidate, and C30-14 emits the manual delivery manifest later.
No record references an ID derived from a later record. The activation contains
no transaction/publication identity, resulting ledger/witness head or COMMIT
frame digest; those appear only in verified post-publication evidence.

## Restart and exact-tail authority

After a crash all authorities are absent. C30-12 classifies/verifies read-only
and C30-13 may issue only one fresh-TTY-confirmed action authority per row:

| Exact bootstrap state | Sole action/mutation | Reclassification result |
|---|---|---|
| PRE_JOURNAL genuine first absence; no bundle/capability/history | bootstrap INITIALIZE_WITNESS_JOURNAL only, exact fresh TTY and §2.5C bounded effects | consume/reclassify verified LCIMWJ01 header-only, then ordinary A0/PRE_PERSISTENCE; never initialize history/successor |
| B1 current sealed bundle; no complete operation frame/incomplete bytes/ledger; expected heads match; unexpired; all bound facts current | `APPEND_WITNESS_PREPARE`: append/fsync exactly one §3.4B reconstructed PREPARE only; uninterrupted current original TTY may continue, restart requires fresh TTY | consume/re-read/reclassify; no ledger or COMMIT mutation under it |
| B2 exact sealed bundle; no PREPARE/incomplete bytes/ledger; expected heads match; expired or any bound fact drifted | PERSIST_ABANDON_EVIDENCE with MEMORY_VERIFIED evidence; only after durable publication/consume/reverification, separately confirmed APPEND_WITNESS_ABANDON with DURABLE_VERIFIED evidence (direct frame, preparedFrameDigest null) | evidence publication stays B2; only durable frame reaches ABANDONED; then new transaction-zero attempt uses new IDs, unchanged ledger predecessor and ABANDON witness head |
| current valid PREPARE; ledger absent | `PUBLISH_LEDGER_TRANSACTION`: publish stored transaction only | reclassify before separate COMMIT authority |
| expired/drifted PREPARE; ledger absent | first separate PERSIST_ABANDON_EVIDENCE, consume/reverify; APPEND_WITNESS_ABANDON only after matching DURABLE_VERIFIED PREPARE-bound evidence (§3.4C) | evidence publication stays PREPARE_ONLY; only durable frame terminalizes; then new attempt uses new IDs, unchanged ledger predecessor and ABANDON witness head |
| matching physical ledger visible; COMMIT absent | APPEND_WITNESS_COMMIT: version-3 ledger-file/full-chain fsync prerequisite, final recheck, then exact witness append/full durability despite previously observed drift | failure prevents first witness byte; committed result denies stale capability and requires C30-13 SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY |
| matching COMMIT | fresh APPEND_WITNESS_COMMIT/COMPLETE_EXACT_EXISTING if exact session relation knowledge absent, before bundle/suffix flushing | ZERO appended bytes; logical result plus remaining §2.5D prerequisites, never automatic capability |
| identified incomplete first/PREPARE/COMMIT/ABANDON suffix | `TRUNCATE_INCOMPLETE_FINAL_FRAME`: suffix only; complete COMMIT first requires V9 relation/bundle completion | consume/invalidate knowledge/reclassify; complete COMMIT requires fresh exact-existing completion; no append/ledger mutation; incomplete-first enters B1/B2 |
| unidentified incomplete first frame | none | `QUARANTINED_WITNESS_UNIDENTIFIED_INCOMPLETE_FIRST_FRAME` |
| invalid complete frame, multiple terminal frames, corruption/competition | none | cause-specific quarantine |

For B1, the one instance binds operation, publication-bundle digest, empty-
witness classified-state digest (§2.5B), expected ledger/witness heads, exact
reconstructed prepareFramedByteDigest (§3.4B), expiry and instance ID. No authority combines
truncation, PREPARE, ledger publication, COMMIT or ABANDON. The old operation/
bundle cannot be reused after ABANDON. If ledger bytes already exist, ABANDON
is forbidden and COMMIT must complete despite drift. A valid exact tail is
never conflated with corruption.

## Exact local family matrix

| Family | Owner / first emitter | Exact consumers | Recovery owner |
|---|---|---|---|
| `lcim.local-operator-session@1` | C30-01 constructor, published in the C30-13 transaction-zero or successor-activation transaction | C30-02 plan; C30-03 ledger/bootstrap precheck; C30-05 accounting; C30-07 provider/review; C30-10 barriers; C30-11 operator checkpoint; C30-12 recovery/audit; C30-13 activation; C30-14 delivery; all production API guards | C30-01 semantics; C30-12 inspects; C30-13 reissues authority |
| `lcim.local-plan-confirmation@1` | C30-02 constructor, published in the C30-13 transaction-zero or successor-activation transaction | C30-03 ledger; C30-04 Git; C30-05 accounting; C30-06 artifacts; C30-07 provider/review; C30-08 findings; C30-09 repairs; C30-10 barriers; C30-11 operator checkpoint; C30-12 recovery/audit; C30-13 activation; C30-14 delivery | C30-02 semantics; C30-12 inspects |
| `lcim.local-budget-ceiling@1` | C30-05 constructor, published in the C30-13 transaction-zero or successor-activation transaction | C30-05 accounting; C30-07 provider/review; C30-08 findings; C30-09 repairs; C30-10 barriers; C30-11 operator checkpoint; C30-12 recovery/audit; C30-13 activation; C30-14 delivery | C30-05 semantics; C30-12 reconstructs counts |
| `lcim.local-consistency-witness@1` | C30-03; C30-13 transaction-zero/successor PREPARE and terminal frames bind their private publication-bundle digest | C30-03 controller ledger; C30-05 accounting; C30-08 findings; C30-09 repairs; C30-10 barriers; C30-11 operator checkpoint; C30-12 recovery/audit; C30-13 activation; C30-14 delivery | C30-12 verifies sealed bytes/classifies; C30-13 alone issues both classes of one-action recovery authority |
| `lcim.local-activation-settlement@1` | C30-13; public candidate binds `candidateSetKind` and its domain-separated `candidateSetDigest` only | C30-12 recovery/audit/reissue inspection; C30-13 activation/capability issuance; C30-14 manual-delivery finalization | C30-13; C30-12 read-only; receipt relates later transaction/publication identity |
| `lcim.manual-delivery-manifest@1` | C30-14 | C30-12 recovery/audit inspection; C30-13 activation-dependent consistency; C30-14 manual-delivery finalization; human delivery operator | C30-14; C30-12 read-only inspection |

Master §3 is the sole authoritative closed field/type/pattern/enum/bound table
and contains one valid JSON example per family. Unknown properties and the
listed authority/credential/signature fields are forbidden. Master §3 also
controls exact JCS payloads, ID/digest domains/exclusions, noncircular insertion,
genesis/predecessor/current-head CAS, general replay, witness-integrity replay
precedence, conflict, supersession, invalidation, cause-specific denials,
recovery and future-version rejection.

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
precedence. Master §3.4A supplies both complete snapshot shapes, all eight
comparisons, exact expiry, retained evidence and inner digest formulas. The
outer formula below inherits them without another undefined helper:

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

## Successor activation publication

`SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY` is a narrow module-private C30-13
class, not a public family, production capability, signer, general ledger,
provider or Git authority, or persisted token. It exists only when a prior
activation has durable matching COMMIT but stale bound source/semantic/
guidance/configuration/routing/plan/budget facts prevent capability, production
capability is absent, no current settlement exists, read-only
C30-13 preflight passes and fresh controlling-TTY confirmation binds the exact
successor operation.

The exact ordered candidate set is budget successor, operator-session successor,
plan-confirmation successor and activation-settlement successor, with no new
genesis. Budget ceilings remain finite/current unless separately displayed and
directly changed under frozen budget rules; no configuration/model/target may
increase them. The other successors bind exact current facts/source/review. The
activation uses `candidateSetKind = "SUCCESSOR_ACTIVATION"` and:

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

Construction is final candidates 1–3 → activation proposal core → successor
candidate-set core → candidate-set digest → final activation → canonical
transaction → private manifest → publication-bundle digest. Public candidates
contain no transaction/private-bundle/resulting-head/COMMIT identity. The exact
external immutable bundle has eight entries:

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

The manifest describes six payload artifacts; manifest/SEALED are authenticated
separately. Existing exclusive-create/write/fsync/rename/parent-fsync/sealing
and stored-byte-only recovery rules apply.

The successor authority uses seven of the eight actions, excluding
INITIALIZE_WITNESS_JOURNAL; it never recreates a missing historical journal. Every instance binds publication
kind `SUCCESSOR_ACTIVATION`, one operation, one action and exact byte digest,
permits one mutation, is consumed, requires re-read/reclassification and is
lost at exit; recovery mutation requires fresh TTY. It cannot invoke providers/
validation, perform general Git/unrelated ledger/delivery mutation or grant
production authority. Pre-ledger drift ABANDONs and requires a new successor.
Published ledger bytes always receive exact COMMIT despite drift; stale COMMIT
requires another successor. Only current matching successor COMMIT followed by
current-fact reverification/display and fresh TTY permits C30-13 production-
capability issuance. This path is non-circular and uses no production authority
to create itself.

## Complete witness reconciliation

The witness retains `LCIMWJ01`, uint32-big-endian framing, 1 MiB maximum,
strict JCS UTF-8 payload, raw digest and an external journal. Every transaction
uses the passed nine-step PREPARE → ledger → COMMIT order. Every path uses
exactly:

1. acquire the controller-ledger owner lock;
2. acquire the local-consistency-witness owner lock;
3. perform expected-head checks and the operation;
4. release the witness lock;
5. release the ledger lock.

No path may acquire these locks in reverse order.

Master §4.1 is the sole ordered byte parser. These diagnostic labels inherit
its stage-local completeness, first-cursor/first-stage precedence and header
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
schema; known malformed input is not eligible truncation. The header-only
verified prefix has length 8, not 0. After byte validation, sequence classes
run in this order: (8) multiple complete terminal frames →
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
“any invalid complete frame.” A complete frame is never truncated. Identified
incomplete first-frame bytes truncate only to empty, consume without another
mutation, then enter exactly B1 or B2; other identified suffixes truncate only
to PREPARE/COMMIT/ABANDON, consume and reclassify.

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
committed witness or ledger evidence proves that conflict. ABANDON is terminal;
ledger/COMMIT after it and multiple complete terminal frames quarantine.
Ordinary exact tails require the actual production capability after exact
reissuance and the same one-mutation/reclassification discipline.

## Removed-family reconciliation

| Old family | LCIM 3.0 disposition | Replacement/owner | LCIM 3.1 disposition |
|---|---|---|---|
| `AUTHORITY_ROOT` | removed from executable authority | local session evidence / C30-01 | external operator root |
| `PLAN_ATTESTATION` | not emitted or consumed | local plan confirmation / C30-02 | signed plan attestation |
| `LEDGER_WITNESS` | not emitted or consumed | local consistency witness / C30-03 | signed online witness |
| `BUDGET_AUTHORIZATION` / `BUDGET_REAUTHORIZATION` | not emitted or consumed | local budget ceiling / C30-05 | signed grant/reauthorization |
| `ACTIVATION` | local settlement only | local activation settlement / C30-13 | signed activation |
| `DISTRIBUTION_RC1` / `DISTRIBUTION_FINAL` | manual packet only | manual delivery manifest / C30-14 | signed distribution envelopes |

No local family is a signature, signed grant, anti-rollback signature, secure
monotonic anchor or independent identity proof. The bounded local threat model,
locked Flash MAX/Sol XHIGH routing, validation-before-review, exact RECHECK,
repair-until-PASS, barrier order, manual commit and no-remote-mutation contracts
remain required. Master §§7–8 distinguish construction from final qualification;
all current applicable G1/G2/G3 still gate separately authorized runtime use.
G1/G2 pending; G3 CHANGES_REQUIRED_PENDING_FRESH_REREVIEW.
