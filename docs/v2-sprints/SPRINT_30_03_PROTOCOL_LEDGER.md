# C30-03 — protocol ledger, local consistency witness and genesis

**Development gate:** master §§7–8 phases A–D: accepted external procedure/tools,
current applicable G1/G3, exact per-task authorization, accepted Bootstrap and
current immediate predecessor. G2 follows complete integrated implementation;
activation/use requires phase F, all current applicable G1/G2/G3 and separate
operator authorization. None is granted here. Component runtime prerequisites
below are not prerequisites to constructing their own code in isolated fixtures.

**Status:** `PLAN_AMENDED / IMPLEMENTATION_TESTS_PENDING`

**Development depends on:** exact current accepted C30-02 source checkpoint.
Current local plan confirmation is a runtime prerequisite, not source admission.

**Next:** `SPRINT_30_04_HARDENED_GIT.md`.

## Objective

Implement the protocol-3.0 byte root, non-circular genesis state machine,
local consistency witness and exhaustive read-only legacy dispatch. No provider
request, worktree creation or Git mutator is permitted.

## V9 COMMIT durability owner — G3-V8-P1-01

Master §§2.5B/2.5D/2.7/2.8/4.4/4.5 are incorporated in full. Version 3 now
requires commitBranch APPEND_ABSENT or COMPLETE_EXACT_EXISTING; non-COMMIT
version 2 forbids commitBranch and ledgerCommitPrerequisite. Complete matching
COMMIT (also as an incomplete-suffix prefix) without exact session knowledge
offers COMPLETE_EXACT_EXISTING before bundle/shared-ancestor/suffix flushes,
even with VISIBLE_VERIFIED bundle. Bind the exact existing COMMIT frame bytes/
SHA and PREPARE/full prefix/suffix, physical ledger/tip and both chains, selected
branch, operation/kind/bundle/heads/facts/expiry. Fresh one-use C30-13 authority
pins/verifies, fsyncs ledger file and full chain through R/U, reverifies, fsyncs
existing witness/full chain, reverifies and consumes/reclassifies. Append ZERO
bytes, create ZERO records; no rewrite/reconstruction/ABANDON. Every failed flush
leaves bytes unchanged and denies success/use. No historical V8 writer proof or
pre-established ledger durability is required for issuance. Owner-session exact
relation knowledge is lost on exit or relevant byte/head/path/fact change.
Then complete bundle if needed; separately truncate eligible suffix, invalidate
knowledge and repeat terminal completion. Logical COMMITTED alone never permits
capability/new successor: sealed bundle/no suffix, current qualification/facts
and existing fresh-TTY checks also apply. Missing/corrupt ledger quarantines,
never reconstructed. §15 is active coverage; prior V8 verdict CHANGES_REQUIRED.

Retained APPEND_ABSENT path (parent G3-V7-P1-01 not independently resolved):

Master §§2.5B/2.5D/2.7/4.5 control: APPEND_WITNESS_COMMIT alone uses integer
observationVersion 3, commitBranch APPEND_ABSENT, LEDGER_WITHOUT_COMMIT and non-null closed
ledgerCommitPrerequisite with exactly absoluteCanonicalLedgerPath,
fileByteLength and fileSha256. The actual owner-bound physical ledger below R
is not caller-selected or canonical-transaction.jcs. Verify complete physical
bytes/length/SHA and decode the exact current-tip transaction ID/digest,
sequence, predecessor and resulting head. Bind the sorted duplicate-free union
of both complete existing ledger/witness chains through U, no ABSENT entries;
non-COMMIT remains integer version 2. Old version-2 COMMIT rejects.

Under one matching C30-13 instance and fixed locks: claim/check all authority
bindings and expiry; pin files/directories/name links; verify ledger bytes/tip;
fsync that pinned ledger file; fsync every containing directory bottom-up through
R/U, reused ancestors included, with before/after identity checks; reverify all
confirmed facts, PREPARE prefix, heads, bundle prerequisite and expiry before
any witness write; then exact COMMIT append/witness/full-chain fsync, verify,
consume/reclassify. Visible bytes suffice for eligibility, not durability.
Ledger effects are fsync-only: no create/write/append/truncate/rename/overwrite/
republish/cleanup. Repeat even after earlier publication success; bundle
completion supplies no ledger durability. No lock-file/receipt/registry writer.
Flush failure discards authority before first COMMIT byte; changed storage
uses defined denial/integrity precedence, not silent rebinding. Already observed
drift allows completion but blocks capability; newly changed displayed facts
require fresh observation/confirmation. Exit loses authority and attempt-local
knowledge; fresh recovery repeats the prerequisite, even after all flushes but
before append. Incomplete witness tails require separate authorized truncation;
full-but-unflushed COMMIT follows §2.5D without reappend, and matching published
ledger is never ABANDONed. §15 is active V9 coverage; §§12–14 pins/results are historical.

## Transaction identity

Master §§2.3A–2.3B now freeze the exhaustive publication core, descriptors,
transaction projection and successor manifest. §3.4A freezes binding snapshots;
§3.4B is the only PREPARE reconstruction rule; §2.5B freezes the authorization
observation. These are normative owner contracts, not new public families.
Every domain below ends in one actual NUL byte (00), not literal backslash-zero.
Master §2.5C additionally owns the closed PRE_JOURNAL observation, exact
LCIMWJ01 initialization digest/effects, genuine-first absence inventory and
crash table. C30-03 implements its checked filesystem/no-lock-file primitives
only under C30-13's bootstrap INITIALIZE_WITNESS_JOURNAL instance. Successor
class never initializes; a malformed final header or missing historical
journal quarantines. Consume/reclassify header-only before PRE_PERSISTENCE.
A0 never writes. §3.4C defines the independently authorized immutable evidence
package, its eleven entries, closed descriptors/input capsules/digests,
frame-derived retrieval and crash/reuse rules. C30-13 writes only that package
under PERSIST_ABANDON_EVIDENCE; C30-12 verifies/plans read-only. The eight-action
bounded logical-effect matrix is §4.5; §15 supplies active V9 transition
coverage. §§10–12 recorded fixtures/pins are historical where superseded. Master §2.3C requires
private v2 manifests with inline prepared-input capsules and shared complete
OwnerInputSide-v2 proof closures; evidence package schemaVersion is also 2.
Prepared evidence is copied from that persisted capsule, never current inputs.
Master §2.5D is the **sole** anchor/entire-chain durability procedure for new
and reused ancestors, retries and exact-existing completion. §2.3 is the sole
fully populated staging order for both bundles. Header-only continuation is
completed by confirmed PERSIST_PREPARED_BUNDLE's existing-witness-prefix/chain
fsyncs, not initialization or A0. Visible complete bundles/evidence need their
respective confirmed persistence completion before later action issuance,
except V9 complete-COMMIT relation completion must precede the bundle flushes.
PREPARE remains header-excluding; PREPARE/ABANDON append and truncation retain
their exact content/existing-chain effects. V8 deliberately expands COMMIT to
include ledger durability prerequisites below; no public schema or framed-byte
SHA algorithm changes.

For `core`, exclude exactly `transactionId`, `transactionDigest` and
`headDigest`; include operation ID, run ID, protocol version, sequence,
predecessor head, schema/version, payload digest, events and the A0
`preparedAt` observation. Publication/commit time is a derived receipt
observation and is not inserted into the precomputed transaction core.

```text
identityPreimage = ASCII("LCIM-CONTROLLER-TX-ID-v1\0") || JCS(core)
transactionId = "lcim_tx_" || hex(SHA-256(identityPreimage))

digestPreimage = ASCII("LCIM-CONTROLLER-TX-DIGEST-v1\0") ||
                 JCS(core with transactionId inserted)
transactionDigest = hex(SHA-256(digestPreimage))

headPreimage = ASCII("LCIM-CONTROLLER-TX-HEAD-v1\0") ||
               JCS([predecessorHead, sequence, transactionDigest])
headDigest = hex(SHA-256(headPreimage))
```

Transaction zero uses sequence 0, a 64-zero predecessor head and fixed
`GENESIS` events. For bootstrap, this canonical transaction is constructed only
after exact final bytes exist for all five candidates. It may bind their final
IDs/digests and exact byte lengths/SHA-256 values; no candidate may contain the
canonical transaction ID/digest or private `publicationBundleDigest`.

## Local consistency witness

Freeze:

```text
lcim.local-consistency-witness@1
```

C30-03 is owner and first emitter. The journal location, `LCIMWJ01` identity,
uint32-big-endian length, 1 MiB maximum, strict JCS UTF-8 payload, raw digest,
closed frame object, frame/head/record preimages, expected-head CAS, replay and
all recovery outcomes are exactly master §§3.4 and 4. C30-12 executes recovery
but cannot alter those semantics.

Every code path uses the literal dual-lock order:

1. acquire the controller-ledger owner lock;
2. acquire the local-consistency-witness owner lock;
3. perform expected-head checks and the operation;
4. release the witness lock;
5. release the ledger lock.

No path may acquire these locks in reverse order.

Master §4.1 is the normative ordered byte parser; §4.3 owns sequence checks.
The following diagnostic labels inherit those stage-local evaluation points,
first-cursor/first-stage precedence and exact outcomes:

| Order | Predicate | Exact predicate | Exact result |
|---:|---|---|---|
| 1 | `COMPLETE_BAD_MAGIC_OR_HEADER` | partial existing header, or complete bad magic/non-digit encoding, under master §4.1 step 1 | `INTEGRITY_QUARANTINE_BAD_WITNESS_HEADER` |
| 2 | `COMPLETE_UNSUPPORTED_VERSION` | magic and fixed header encoding are valid, but version is unsupported | `INTEGRITY_QUARANTINE_UNSUPPORTED_WITNESS_VERSION` |
| 3 | `COMPLETE_BAD_LENGTH` | complete unsigned length word is zero, over 1048576, or exceeds the specified offset bound; reject before waiting for payload | `INTEGRITY_QUARANTINE_BAD_WITNESS_LENGTH` |
| 4 | `COMPLETE_BAD_UTF8` | supported header and valid length, but payload is not strict UTF-8 | `INTEGRITY_QUARANTINE_BAD_WITNESS_UTF8` |
| 5 | `COMPLETE_BAD_JCS` | complete strict UTF-8 payload fails JSON syntax, duplicate-key/Unicode/JCS representability or exact canonical encoding; no schema checks here | `INTEGRITY_QUARANTINE_BAD_WITNESS_JCS` |
| 6 | `COMPLETE_BAD_DIGEST` | header, version, length, UTF-8 and JCS are valid, but frame digest does not match | `INTEGRITY_QUARANTINE_BAD_WITNESS_DIGEST` |
| 7 | `COMPLETE_BAD_SCHEMA` | digest is valid, but frame-kind-sensitive field rules, sequence, `terminalReason`, `terminalReasonEvidenceDigest`, `preparedFrameDigest` or other closed-schema semantics are invalid | `INTEGRITY_QUARANTINE_BAD_WITNESS_SCHEMA` |

All unknown/missing fields, enums, wrong types, nullability, terminalReason
rules and intrinsic identities are class 7 only; bad raw digest wins over bad
schema. Eligible EOF and header preservation are exactly master §4.1, not a
choice between truncation and malformed input. After the byte stages pass,
sequence classes are evaluated in this order: (8) multiple complete terminal frames →
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

The journal detects accidental ledger truncation while it survives, local
ledger/journal divergence and incomplete local writes. Divergence quarantines.
It is not a digital signature, signed witness, anti-rollback signature or
monotonic secure anchor. It does not claim resistance to coordinated same-user
replacement, full-machine rollback, backup restore, machine migration or
replacement/deletion of every local authority root.

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
precedence. Master §3.4A defines both complete snapshots, their exact inner
hashes, retained evidence, all eight comparisons and the expiry boundary. The
following outer formula inherits that section without any undefined helper:

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

## Genesis, activation and bootstrap handoff

C30-13 A0 writes nothing and freezes the master §§2.3–2.4 acyclic identity:
final exact JCS bytes for budget → session → plan → non-runnable genesis;
`activationProposalCore`; transaction-free/publication-free `candidateSetCore`;
`candidateSetDigest`; final activation bytes with
`candidateSetKind = "TRANSACTION_ZERO"`; then and only then the canonical
transaction; then the private publication manifest and
`publicationBundleDigest`. The activation binds only the transaction-zero
`candidateSetKind`/`candidateSetDigest`; it contains no transaction or private
publication-envelope identity. Witness
PREPARE binds `publicationBundleDigest`.

Before PREPARE, C30-13 persists the exact candidate-set core, five candidate
files, canonical transaction, manifest and SEALED marker in the controller-
private immutable `bootstrap-prepared/v1/<repositoryId>/<bootstrapOperationId>/`
directory outside target/Git-common/run storage, under the exact write/check/
fsync/rename order in master §2.3. Recovery verifies those bytes and never
regenerates candidate or transaction bytes. After PREPARE the sealed directory
is never deleted or rewritten.

If that sealed bundle has no complete operation frame, no incomplete bytes and
no ledger transaction, expected heads must match and exactly one of two states
applies. B1 (unexpired and every bound fact current) issues exactly one
`APPEND_WITNESS_PREPARE` instance binding operation, publication-bundle digest,
empty-witness classified-state digest (master §2.5B), expected heads, exact
reconstructed prepareFramedByteDigest (master §3.4B), expiry and instance ID; it appends/fsyncs only PREPARE,
consumes and reclassifies. The uninterrupted original TTY operation may
continue; restart requires fresh TTY. B2 (expired or any bound fact drifted)
requires fresh TTY and exactly one PERSIST_ABANDON_EVIDENCE instance first;
it publishes/fsyncs §3.4C's exact package, consumes/reverifies. Only then may a
separately confirmed APPEND_WITNESS_ABANDON append the exact direct frame with
preparedFrameDigest null, consume/reclassify ABANDONED. No ledger transaction
is published and no evidence write occurs under the append instance. After identified incomplete-
first-frame truncation to empty, consume the truncation authority, perform no
other mutation, re-read, and enter exactly B1 or B2; no third state exists.

Every bootstrap authority instance binds publication kind `TRANSACTION_ZERO`,
operation, `publicationBundleDigest` (null only for PRE_JOURNAL initialization),
classified-state digest, expected
ledger/witness heads, exactly one action, exact action-byte digest, expiry and
unique instance ID. The exact actions are `INITIALIZE_WITNESS_JOURNAL`,
`PERSIST_PREPARED_BUNDLE`, `APPEND_WITNESS_PREPARE`,
`PUBLISH_LEDGER_TRANSACTION`, `APPEND_WITNESS_COMMIT`,
`TRUNCATE_INCOMPLETE_FINAL_FRAME`, `PERSIST_ABANDON_EVIDENCE` and
`APPEND_WITNESS_ABANDON`. One instance performs one mutation and is consumed;
PREPARE + ledger + COMMIT is never one authority. An uninterrupted initial TTY
operation can receive the next authority only after consume, re-read,
reclassify and exact next-head/action verification. Restart loses all
authorities, and each recovery mutation requires fresh TTY confirmation.

Publication preserves the passed nine-step PREPARE → ledger → COMMIT order and
matching COMMIT as the sole logical completion. A current valid PREPARE-only
tail publishes only stored `canonical-transaction.jcs`, then reclassifies before
a separate COMMIT authority. An expired/drifted PREPARE-only tail publishes no
stale bytes and requires §3.4C's separate durable evidence action before any
terminal ABANDON append; a new transaction-zero attempt
then uses new operation/candidate-set/publication-bundle identities, the same
zero ledger predecessor and the ABANDON witness head. If matching ledger bytes
already exist, recovery completes COMMIT despite drift; drift blocks capability
and requires the successor-publication path below. Corruption, a competing
identity/head or a missing/corrupt required sealed bundle quarantines. Ordinary
production APIs require the actual C30-13-issued
`PRODUCTION_RUNTIME_CAPABILITY`.

C30-03 also consumes the C30-13-only
`SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY`. It exists only after a prior
activation has durable matching COMMIT but stale bound facts, with production
capability absent, no current settlement, read-only C30-13 preflight and exact
fresh TTY confirmation. Every successor transaction has exactly four public
candidates in order: budget successor, operator-session successor, plan-
confirmation successor and activation-settlement successor; no genesis. The
activation has `candidateSetKind = "SUCCESSOR_ACTIVATION"` and the domain-
separated `successorCandidateSetDigest`; public candidates contain no
transaction, private-bundle, resulting-head or COMMIT identity.

Construction is candidates 1–3 → activation proposal core → successor
candidate-set core →
`SHA-256("LCIM-SUCCESSOR-ACTIVATION-CANDIDATE-SET-v1\0" ||
JCS(successorCandidateSetCore))` → final activation → canonical transaction →
private manifest →
`SHA-256("LCIM-SUCCESSOR-ACTIVATION-PUBLICATION-BUNDLE-v1\0" ||
JCS(successorPublicationManifest without successorPublicationBundleDigest))`.
The external immutable
`successor-activation-prepared/v1/<repositoryId>/<operationId>/` directory has
exactly `candidate-set-core.jcs`, four numbered successor candidates,
`canonical-transaction.jcs`, `publication-manifest.jcs` and `SEALED` (eight
entries; six payload artifacts described by the manifest). Stored-byte-only and
transaction-zero persistence/durability rules apply unchanged.

Every successor authority instance binds publication kind
`SUCCESSOR_ACTIVATION`, one operation/action/exact byte digest and permits one
mutation from the eight-action vocabulary except INITIALIZE_WITNESS_JOURNAL
(seven eligible actions). It is consumed, then state is re-read
and reclassified; restart loses it and recovery mutation requires fresh TTY.
Drift before ledger requires ABANDON and a new successor operation. Existing
exact ledger bytes require COMMIT despite drift, never ABANDON/erasure; stale
COMMIT requires another successor. Only after a current successor COMMIT,
current-fact reverification/display and fresh TTY may C30-13 issue production
capability. The successor authority itself cannot grant capability or perform
provider, validation, general Git, unrelated ledger or delivery effects.

## Legacy classifier

Classification is read-only and occurs before status/recovery/finalization:

```text
PROTOCOL_3_0: canonical protocol manifest, exact source/schema facts and TX0
LEGACY_2_0: no protocol manifest; exact historical 2.0 records
LEGACY_2_1: no protocol manifest; exact historical 2.1 records
MALFORMED_OR_UNKNOWN: every partial, mixed, invalid or unsupported form
```

Legacy runs remain untouched. Migration is a separate external decision; no
3.0 state is appended to legacy state. A partial 3.0 marker is malformed, not
legacy fallback.

## Owned families

| Family | First emitter | Consumers |
|---|---|---|
| `lcim.protocol-manifest@1` | genesis | classifier/recovery |
| `lcim.controller-transaction@1` | C30-03 | all core |
| `lcim.run-lifecycle-event@1` | genesis/lifecycle | recovery/audit/CLI |
| `lcim.local-consistency-witness@1` | C30-03 | C30-03 controller ledger; C30-05 accounting; C30-08 findings; C30-09 repairs; C30-10 barriers; C30-11 operator checkpoint; C30-12 recovery/audit; C30-13 activation; C30-14 delivery |
| `lcim.legacy-classification@1` | classifier | every entry point |
| `lcim.legacy-migration-decision@1` | operator | migration tool |

No cryptographic witness or signed activation family is emitted or consumed by
LCIM 3.0. Those are LCIM 3.1 roadmap concerns.

## Acceptance and recovery

Test every master §4 row with exactly its sole result, action, one mutation,
post-mutation reclassification and fsync boundary, plus bootstrap ordinary-API
denial, restart absence, exact legacy cases and malformed quarantine.

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
ledger/COMMIT after ABANDON and every multiple-complete-terminal state
quarantine. An invalid complete frame is never truncated. An identified
incomplete suffix may be truncated only to its verified empty/PREPARE/COMMIT/
ABANDON prefix under one truncation authority, followed by reclassification and
no second mutation.

## Preserved orchestration and limits

Pi deepseek-v4-flash (thinking "max", LCIM reasoning MAX), Pi openai-codex gpt-5.6-sol XHIGH, validation-before-review, exact RECHECK,
repair-until-PASS, zero-open-finding advancement and all manual Git boundaries
remain unchanged. LCIM 3.0 excludes hostile same-UID processes, root/kernel
compromise, live-controller debugging/memory theft, malicious OS,
full-machine compromise and coordinated rollback of every local root.

## Implementation prompt

Implement only transaction identity, the exact non-circular state machine,
atomic genesis, local consistency journal, narrow local bootstrap seam, exact
legacy classifier and migration decision. Do not implement Git, Flash/Sol
transport, scan, findings, budget, repair, checkpoint, activation capability
issuance or release. Do not access credentials or Keychain. Return files/tests/
commands/results/acceptance/unresolved issues/ICRs; do not commit.

## Normative Start/dependency gate

The common development Start contract is master §7.4, incorporated in full.
Predecessor: `C30-02`. Check procedure/current applicable G1/G3,
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
