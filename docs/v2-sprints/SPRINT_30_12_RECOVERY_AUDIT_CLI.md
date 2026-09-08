# C30-12 — protocol recovery, audit CLI and source-lineage invalidation

**Development gate:** master §§7–8 phases A–D: accepted external procedure/tools,
current applicable G1/G3, exact per-task authorization, accepted Bootstrap and
current immediate predecessor. G2 follows complete integrated implementation;
activation/use requires phase F, all current applicable G1/G2/G3 and separate
operator authorization. None is granted here. Component runtime prerequisites
below are not prerequisites to constructing their own code in isolated fixtures.

**Status:** `PLAN_AMENDED / IMPLEMENTATION_TESTS_PENDING`

**Depends on:** C30-11 verified successor source generation.

**Next:** `SPRINT_30_13_ACTIVATION_BOOTSTRAP.md`.

## Objective

Compose owner recovery, classify before mutation, invalidate descendants in
source-generation order and expose sanitized status/recovery/resume/packet
commands. This unit may not invent new finding states, Sol profiles, budget
rules or Git recovery.

## V9 source ownership and COMMIT recovery — G3-V8-P1-01

Master §§2.5B/2.5D/2.7/2.8/4.4/4.5 are incorporated in full. Required version-3
commitBranch distinguishes APPEND_ABSENT from COMPLETE_EXACT_EXISTING; version-2
non-COMMIT forbids commitBranch and ledgerCommitPrerequisite. Logical COMMITTED
is read-only, not durable eligibility: absent exact session relation knowledge
offers COMPLETE_EXACT_EXISTING, also for a complete COMMIT plus incomplete suffix,
before any bundle/shared-ancestor/suffix flush. VISIBLE_VERIFIED bundle suffices.
Bind actual existing COMMIT frame bytes/SHA, PREPARE/full prefix/suffix, ledger
bytes/tip, both path/descriptor/name chains, branch/operation/kind/bundle/heads/
facts/expiry. Fresh one-use C30-13 authority pins/verifies, fsyncs ledger file/full
chain through R/U, rechecks, fsyncs existing witness/full chain, reverifies and
consumes/reclassifies. Append ZERO bytes, create ZERO records. No prior ledger
durability or historical writer proof gates issuance. Every flush failure grants
no success/use and leaves existing bytes unchanged; missing/corrupt ledger
quarantines without reconstruction. Exit/relevant byte/head/path/fact change
loses completion knowledge. Bundle completion follows; suffix truncation remains
separately authorized, invalidates knowledge and requires terminal re-completion.
Consumers need exact same-session completion plus sealed bundle/no suffix,
current facts/qualifications and existing fresh-TTY checks. Never duplicate
COMMIT or ABANDON matching ledger. §15 covers V9; V8 verdict remains CHANGES_REQUIRED.

C30-12 integrates/extends lineage/recovery consumers of the already G1-qualified
standalone Bootstrap support (master §7.2), required before C30-01; never first
availability of early source-registry/head/CAS/recovery, admission or retained
proof export.

Retained APPEND_ABSENT path from parent G3-V7-P1-01 (not independently resolved):
integer observationVersion 3 for APPEND_WITNESS_COMMIT, commitBranch APPEND_ABSENT, classification
LEDGER_WITHOUT_COMMIT, non-null closed ledgerCommitPrerequisite with exactly
absoluteCanonicalLedgerPath, fileByteLength, fileSha256. Bind actual C30-03
physical ledger below R, complete bytes and exact current-tip transaction/
sequence/predecessor/resulting head, never a caller path or canonical-transaction.jcs.
pathBindings is the sorted duplicate-free union of both complete existing
ledger/witness chains through U, no ABSENT; non-COMMIT stays integer version 2.

Visible exact ledger bytes permit completion issuance without prior durability.
Claim/check matching C30-13 authority, pin both files/directories/name links,
verify ledger bytes/tip, fsync pinned ledger then every containing directory
bottom-up through R/U including reused ancestors with before/after checks;
reverify all confirmed facts, PREPARE prefix, heads, bundle prerequisite and
expiry before first witness write; then append/fsync exact COMMIT and full
witness chain, verify/consume/reclassify. Repeat even after earlier success;
bundle completion gives no ledger durability. Ledger effects are fsync-only,
never create/write/append/truncate/rename/overwrite/republish/cleanup. No
receipt/lock-file/registry writer is implied. Flush failure discards authority
before any COMMIT byte. Changed storage uses defined denial/integrity precedence;
new displayed drift requires fresh confirmation, while already observed drift
allows exact completion but denies stale capability. Exit loses authority and
attempt-local knowledge; recovery repeats the ledger prerequisite even if all
flushes finished before append. Partial witness tails need separate authorized
truncation. Full-but-unflushed COMMIT uses §2.5D, never reappend; matching ledger
never ABANDONs. §15 is active V9 coverage; §§12–14 results/pins remain historical.

## Recovery boundaries

Master §§2.3A–2.3B define exact private core/descriptor/manifest content and
publication transaction bindings; §2.5B defines closedClassifiedState; §3.4A
defines binding snapshots/evidence; §3.4B defines the sole deterministic
PREPARE reconstruction. Recovery checks those complete contracts, never an
abbreviated substitute. No PREPARE file is added to either bundle.
Master §2.5C adds the closed PRE_JOURNAL variant, genuine-first absence
inventory, exact initialization digest/TTY line and complete crash table.
§3.4C defines terminalization, the eleven-entry external evidence package,
closed manifest/input capsules, deterministic frame-derived retrieval and exact
evidence-before-append crash/reuse rules. §4.5's eight-action matrix enumerates
all runtime logical writes; §15 exercises V9 in memory (§§11–14 are
historical recorded models). Master §2.3C's v2 manifest capsule is mandatory: recover PREPARED
streams/proofs from verified persisted operation data, never the new current
configuration. Current observations remain separate; §3.4C copies the prepared
side from the capsule into private v2 evidence. Missing/substituted capsule or
proof bytes quarantine; historical v1 cannot authorize a new operation.
§2.5D alone defines anchor, verified complete ancestor chain, reused paths,
fsync-only exact-existing completion and failure rules; §2.3 alone defines
both bundles' fully populated staging order. After restart a visible complete
bundle first offers fresh PERSIST_PREPARED_BUNDLE completion **unless** a complete
COMMIT prefix requires V9 relation completion before any bundle flush; evidence similarly
needs fresh PERSIST_ABANDON_EVIDENCE completion before ABANDON. Header-only
durability is completed by the former's existing-prefix/chain support flushes,
never A0 or reinitialization. All recovery tables below consume these
prerequisites before their ordinary B1/B2/ledger/terminal action.
C30-12 is read-only
planner/verifier, C30-13 sole issuer and evidence writer, C30-03 storage owner.
No cleanup, receipt, registry or lock-file writer is implied.

Every command classifies protocol first. 3.0 validates the local ledger,
consistency journal and source lineage and replays canonical owner facts.
Historical 2.0/2.1 remains read-only. Malformed/unknown/partial 3.0 is
quarantined. No 3.0 vocabulary is appended to legacy state.

On restart production capability and every prior bootstrap action authority are
absent. C30-12 exposes only the master §2.7 read-only classifier/verifiers,
deterministic recovery planner and reissuance inspection. It classifies the
exact witness/ledger/sealed-bundle state before mutation; verifies every stored
artifact byte, filename, length, SHA-256, ID/digest, manifest/SEALED value,
operation/source identity and head; and never regenerates candidate or
canonical-transaction bytes from prose or current code.

For one classified transaction-zero or successor-publication action it displays
the original operation ID, publication kind, applicable candidate-set and
publication-bundle digests, candidate IDs, current heads and exact action-byte
digest. Only fresh controlling-TTY confirmation may cause C30-13 to issue a new
action-specific authority after restart. Every instance binds publication kind,
one operation, private publication-bundle digest (null only for genuine
PRE_JOURNAL initialization), classified-state digest,
expected heads, one exact action/byte digest, expiry and instance ID; it
performs one mutation, is consumed and is followed by complete
reclassification.

Genuine absent first journal with no prior/partial history offers only
INITIALIZE_WITNESS_JOURNAL under the bootstrap class after fresh exact TTY.
It publishes precisely LCIMWJ01 via checked temporary/no-replace/durability
steps, consumes and reclassifies header-only before ordinary A0/PRE_PERSISTENCE.
Unreadable is not absent; malformed final header quarantines; missing historical
journal never initializes. Successor activation cannot recreate it. Recovery
never reuses/cleans initialization temps or derives authority from files.

The exact terminal rules are:

- **B1 current sealed bundle, empty witness:** exact sealed bundle verifies; no
  complete operation frame or incomplete bytes; no ledger transaction;
  expected heads match; unexpired; all bound source/semantic/guidance/
  configuration/routing/plan/budget facts current. The uninterrupted original
  confirmation may continue, but restart requires fresh TTY. C30-13 issues
  exactly one `APPEND_WITNESS_PREPARE` instance binding operation, publication-
  bundle digest, empty-witness classified-state digest, expected heads, exact
  reconstructed prepareFramedByteDigest (master §3.4B), expiry and instance ID. Append/fsync only
  PREPARE, consume and reclassify; no ledger or COMMIT mutation under it.
- **B2 stale or expired sealed bundle, empty witness:** the same exact sealed-
  bundle/no-frame/no-ledger/head predicate, but expired or at least one bound
  fact drifted. Publish no stale bytes. Fresh TTY permits exactly one
  PERSIST_ABANDON_EVIDENCE; publish/fsync its exact package, consume/re-read/
  reclassify. Only matching durable evidence and still-eligible heads permit a
  separately confirmed APPEND_WITNESS_ABANDON for the exact direct frame
  (preparedFrameDigest null); consume/reclassify ABANDONED. It is not COMMIT and creates no ledger transaction.
- current/unexpired PREPARE with no ledger: publish only exact stored
  `canonical-transaction.jcs`, then reclassify before any separate COMMIT
  authority;
- expired or fact-drifted PREPARE with no ledger: publish no stale bytes; after
  fresh TTY persist exact PREPARE-bound evidence under its separate instance;
  consume/reverify before a separately confirmed exact ABANDON append under
  §3.4C. Missing/invalid durable evidence denies append before mutation;
- matching ledger with COMMIT absent: establish the version-3 pinned ledger
  file/full-chain fsync prerequisite, then append the exact COMMIT despite
  previously observed drift; drift blocks capability and requires C30-13's
  `SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY` after COMMIT;
- matching COMMIT: report logical result; offer fresh exact-existing COMMIT
  completion while session knowledge is absent, before bundle/suffix flushes;
  never append; complete remaining prerequisites before capability/successor; and
- corrupt/missing sealed bundle, mismatched/competing identity or head, bad
  complete frame or other integrity failure: quarantine, never ABANDON/COMMIT.

After identified incomplete-first-frame truncation to the empty verified
prefix, consume the truncation authority, perform no additional mutation,
re-read the bundle and current facts, and enter exactly B1 or B2. No third empty-
witness state exists. Durable B2 ABANDON permits a new transaction-zero attempt
with new operation/candidate-set/publication-bundle identities, unchanged
transaction-zero ledger predecessor and durable ABANDON witness predecessor;
the old operation/bundle are never reused.

C30-12 recognizes the successor publication only when prior activation has a
durable matching COMMIT but bound source/semantic/guidance/configuration/
routing/plan/budget facts are stale, production capability is absent, no current
settlement exists, and C30-13's read-only preflight/fresh TTY completes.
It verifies exactly four ordered candidates (budget, session, plan,
activation), no genesis, the distinct domains
`LCIM-SUCCESSOR-ACTIVATION-CANDIDATE-SET-v1\0` and
`LCIM-SUCCESSOR-ACTIVATION-PUBLICATION-BUNDLE-v1\0`, and the exact eight-entry
external successor bundle. Recovery uses stored bytes only. Each successor
instance binds publication kind `SUCCESSOR_ACTIVATION`, one action and one
mutation from §4.5's eight-action vocabulary excluding
INITIALIZE_WITNESS_JOURNAL (seven actions). Pre-ledger drift ABANDONs; published
ledger bytes COMMIT despite drift; only a current successor COMMIT followed by
current-fact reverification/display and fresh TTY can precede capability
issuance.

No JSON flag, copied object, bearer record or future build value is authority.

## Local consistency witness

C30-12 executes, without changing, the exact framing, CAS, nine-step write
order, classifier and one-result-per-state table in master §§3.4 and 4. Every
path uses exactly:

1. acquire the controller-ledger owner lock;
2. acquire the local-consistency-witness owner lock;
3. perform expected-head checks and the operation;
4. release the witness lock;
5. release the ledger lock.

No path may acquire these locks in reverse order.

Master §4.1 is the normative ordered byte parser; §4.3 owns sequence checks.
These labels inherit its stage-local completeness and first-cursor/first-stage
precedence; header-only prefixes retain all eight header bytes:

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
schema. Eligible EOF and known malformed input are distinct under master §4.1;
truncation never removes the journal header. After byte validation, sequence
classes run in this order: (8) multiple complete terminal frames →
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

The incomplete rows are exact: identified incomplete first frame truncates only
to empty and then enters exactly B1 or B2; unidentified incomplete first frame
is `QUARANTINED_WITNESS_UNIDENTIFIED_INCOMPLETE_FIRST_FRAME`; PREPARE plus
incomplete suffix truncates only to PREPARE; COMMIT plus suffix truncates only
to COMMIT only after V9 ledger-first relation completion, invalidates knowledge
and requires fresh terminal completion before use; ABANDON plus suffix truncates only to
ABANDON and then returns abandoned. Each truncation requires one
`TRUNCATE_INCOMPLETE_FINAL_FRAME` instance, one truncation/fsync, consumption
and reclassification. It performs no ledger, COMMIT or ABANDON mutation.

## Normative ABANDON reason semantics

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
precedence. Master §3.4A supplies the complete snapshot shapes, exact inner
digest formulas, retained evidence, all comparisons and expiry boundary. The
outer formula below inherits those definitions without additions:

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
No state is both recoverable and corruption. The journal detects ordinary
truncation/divergence/incomplete writes while surviving, not coordinated
replacement or full-machine rollback.

## Findings, barriers and source generation

Finding responses use immutable proposal indices, exact prior-open sets,
explicit `UNTOUCHED_NOT_REVIEWED`, separate new proposals and deterministic
IDs. Malformed/incomplete transactions reject atomically. Only the six cause-specific objective nontechnical pauses/quarantine in the
master plan exist; actionable technical findings continue repair until PASS.

Checkpoint/barrier successors bind exact generations, expected heads, source/
patch/subject, validation/Sol coverage, state and invalidation reason. Only
exact current sibling generations form a barrier. Earlier source changes
invalidate all descendant validation, findings/reviews, checkpoints/barriers,
local activation settlement and manual delivery evidence.

## Commands

```text
lcim status --run <run-id> [--json]
lcim recover --run <run-id>
lcim resume --run <run-id> --cause <frozen-cause> --proof <proof-id>
lcim budget increase --run <run-id> --confirmation <operation-id>
lcim resolve-operator-input --run <run-id> --confirmation <operation-id> --resolution <file>
lcim verify-checkpoint-commit --run <run-id> --barrier <id> --manifest <id> --commit <sha>
lcim prepare-manual-delivery --run <run-id> --barrier <id>
lcim finalize-manual-delivery --run <run-id> --settlement <id> --rehearsal <id> --manifest <path>
```

`prepare-manual-delivery` is preliminary and never claims
`DELIVERY_READY_MANUAL`; C30-14 is final. Audit emits only sanitized IDs,
digests, bounded counts, statuses and safe reasons, never raw prompts,
transcripts, source, credentials, private data, patches or runtime packets.

## Owned families

| Family | First emitter | Consumers |
|---|---|---|
| `lcim.recovery-cursor@1` | recovery driver | CLI/audit |
| `lcim.implementation-source-generation@1` | qualified external Bootstrap owner before C30-01; C30-12 integrates lineage/recovery consumer | all source lineage; runtime consumer validates external provenance |
| `lcim.implementation-lineage@1` | invalidation | activation/delivery |
| `lcim.audit-projection@1` | sanitized projection | reports |
| `lcim.manual-delivery-preparation@1` | preliminary command | operator/release |

## Preserved orchestration and scope

Pi deepseek-v4-flash (thinking "max", LCIM reasoning MAX) and Pi openai-codex gpt-5.6-sol XHIGH routing, validation-before-review, exact RECHECK,
repair-until-PASS, zero-open findings, request-level accounting, DAG/CAS and
manual delivery remain unchanged. No cryptographic signer, signed authority,
Keychain or native executable-attestation mechanism is implemented here.

## Normative Start/dependency gate

The common development Start contract is master §7.4, incorporated in full.
Predecessor: `C30-11`. Check procedure/current applicable G1/G3,
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
