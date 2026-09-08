# LCIM 3.0 Core Orchestration — controlling local-authority plan

**Status:** `READY_FOR_V9_DOCUMENTATION_REVIEW`

Combined V8 proposes explicit development-versus-qualification sequencing
(§§7–8) and expands APPEND_WITNESS_COMMIT's ledger durability effects
(§§2.5B/2.5D/2.7/4.5, G3-V7-P1-01). Prior V7 prepared-input/sealing/ancestor
repairs remain applicable; their recorded fixture evidence is historical.
§§13–14 retain historical V8 model/results and their limitations, not V9 proof.
§15 is active V9 coverage; §16 records its actual executions. V8 independent
review returned CHANGES_REQUIRED for G3-V8-P1-01 and SEQ-V8-P1-01; only these
two findings are under this bounded amendment. The initial §§7–8 sequence stays.
No G1/G2/G3 PASS, policy adoption, external-tool readiness, source construction
authorization or runtime activation/use is supplied by this amendment.

**Source base:** `a93a3dd24af737e015fe3c138ca61ed9745cdf1d`

This file is the controlling LCIM 3.0 plan. Earlier V2/2.0/2.1 plans and routing
records are historical, non-authoritative inputs for protocol 3.0. This is a
bounded documentation amendment. It authorizes no implementation, provider
invocation, signer experiment, LCIM run, commit, push, merge, PR, activation,
release, publication or remote delivery.

## 1. Locked scope and orchestration

LCIM 3.0 is local core orchestration and ends at `DELIVERY_READY_MANUAL`.
Cryptographic authority and remote delivery are deferred to LCIM 3.1
`EXTERNAL_OPERATOR_SIGNING_SERVICE`. Preserve exactly:

```text
SIGNER_V4_CONTROLLER_ATTESTATION:
BLOCKED_PENDING_STRONGER_MACOS_EXECUTABLE_ATTESTATION

LCIM_3_0_SIGNER_GATE:
REMOVED_BY_SCOPE_DECISION

LCIM_3_1_EXTERNAL_OPERATOR_SIGNER:
DEFERRED_TO_LCIM_3_1
```

The only routes for LCIM 3.0 are:

```text
WORKER_PROVIDER: Pi
WORKER_MODEL: deepseek-v4-flash
PI_THINKING_LEVEL: max
LCIM_POLICY_REASONING: MAX
REVIEWER_PROVIDER: Pi openai-codex
REVIEWER_MODEL: gpt-5.6-sol
REVIEWER_REASONING: XHIGH
```

No Pro MAX, Luna, Terra, optional model fallback, substitution or escalation
ladder is permitted. Flash is the sole implementation/repair worker and cannot
invoke Sol. Sol is controller-owned. One credit is one actual upstream provider
request, never a process or logical call.

```text
Flash implementation -> deterministic validation -> complete current-generation FINAL_REVIEW
finding -> Flash repair -> clean successor subject -> deterministic validation
        -> exact-finding RECHECK -> complete current-generation FINAL_REVIEW
        -> repeat until PASS
```

RECHECK cannot approve a sprint, barrier, activation, checkpoint, delivery or
release. Every actionable technical finding must be repaired until PASS; it
cannot be deferred, converted to `STUCK`, or assigned
`PAUSED_TECHNICAL_NO_PROGRESS`. A pause is allowed only for a frozen,
cause-specific objective nontechnical condition: `BUDGET_EXHAUSTED`,
`OPERATOR_INPUT_REQUIRED`, `PROVIDER_CREDENTIAL_UNAVAILABLE`,
`PROVIDER_TRANSPORT_UNAVAILABLE`, `LOCAL_WORKTREE_CONFLICT`, or
`INTEGRITY_QUARANTINE`.

## 2. Exact bootstrap construction and authority phases

### 2.1 `NON_AUTHORITATIVE_FIXTURE_AUTHORITY`

This object is opaque and module-private and exists only in tests/fixtures. It
cannot access production provider credentials, mutate authoritative protocol-3
state, be promoted or converted into production authority, or be accepted by a
production API.

### 2.2 Phase A0 — read-only bootstrap preflight

Before any authoritative protocol-3 record exists, C30-13 coordinates the
owners' pure constructors. At a genuinely absent journal, A0 first constructs
only §2.5C's read-only PRE_JOURNAL observation; the separate confirmed A1
initialization action supplies the verified header before the full candidate
workflow below. Neither step needs persisted candidates or capability. A0 may only:

1. identify the repository, run and current source-checkpoint generation;
2. verify source commit/tree and the source-checkpoint registry head;
3. verify the semantic contract and active guidance;
4. verify configuration and the two locked model routes;
5. compute the finite budget candidate;
6. finalize the exact JCS bytes for budget, operator session, plan confirmation
   and non-runnable protocol/run genesis in that order;
7. construct the activation proposal core and candidate-set core, compute
   `candidateSetDigest`, insert `candidateSetKind = "TRANSACTION_ZERO"` and that
   digest into the activation settlement, and only then compute the activation
   record ID/digest and final bytes;
8. after all five final candidate byte strings exist, construct the canonical
   transaction and compute its transaction ID/digest;
9. freeze the complete safe prepared-input capsule (§2.3C) from the already
   verified owner streams/proofs, construct the private v2 publication manifest
   including that capsule, and compute `publicationBundleDigest`; and
10. display the complete operation to the controlling operator.

A0 may create transient memory and read-only observations. It writes no local
session, plan, budget, genesis, activation, ledger, witness, prepared
publication bundle, registry state, capability or other authoritative byte.
TTY input in A0 is an observation, not publication. Thus there is no requirement
for a production capability before the records needed to issue one exist.

### 2.3 Candidate-set identity and byte-complete private publication bundle

There are two semantically distinct bootstrap digests. The public activation
candidate binds `candidateSetDigest`. The private C30-13 recovery/publication
envelope and witness PREPARE bind `publicationBundleDigest`. No field or digest
is overloaded for both roles.

First finalize exact RFC 8785/JCS UTF-8 bytes for these four candidates:

1. `lcim.local-budget-ceiling@1`;
2. `lcim.local-operator-session@1`;
3. `lcim.local-plan-confirmation@1`;
4. the non-runnable protocol/run genesis candidate.

Construct `activationProposalCore` from every activation field known before
candidate-set binding, excluding `candidateSetDigest`, `recordId`,
`recordDigest`, every transaction ID/digest, `publicationBundleDigest`, every
resulting ledger/witness head and every COMMIT frame digest. `generationId` is
not yet a field known at this stage: it is inserted later as the required alias
of the computed `recordId`. The core has no placeholder for an excluded or
unknown value.

Construct the closed `candidateSetCore` with `schemaName`
`lcim.genesis-activation-candidate-set-core`, integer `schemaVersion` 1,
`bootstrapOperationId`, repository/run identity, reviewed source generation,
source commit/tree, semantic-contract/active-guidance/configuration/routing
digests, expected predecessor ledger and witness heads, expected ledger
sequence, and exactly four ordered exact-byte candidate descriptors plus one
exact-byte `activationProposalCore` descriptor. Each descriptor carries a
fixed ordinal/family-or-kind, unpadded canonical UTF-8 Base64 bytes,
`byteLength` and lowercase `sha256`; decoded bytes must equal the named exact
JCS bytes. It contains no `candidateSetDigest`, no `publicationBundleDigest`
and no transaction ID or transaction digest.

Compute exactly:

```text
candidateSetDigest = SHA-256(
  "LCIM-GENESIS-ACTIVATION-CANDIDATE-SET-v1\0"
  || JCS(candidateSetCore)
)
```

Insert `candidateSetKind = "TRANSACTION_ZERO"` and `candidateSetDigest` into
the activation settlement. Compute its
`recordId`, equal `generationId`, `recordDigest` and exact JCS bytes under the
unchanged activation family ID/digest domains. Only now do all five final
candidate byte strings exist.

After those five bytes are final, construct the canonical controller
transaction from those exact bytes in the required candidate order. Its core
may name final candidate IDs/digests, exact candidate byte lengths and SHA-256
values. Compute `canonicalTransactionId` and `canonicalTransactionDigest` only
under the controller-transaction domains in C30-03. No candidate refers to
either transaction identity or to `publicationBundleDigest`.

Then construct the private closed publication manifest with `schemaName`
`lcim.genesis-activation-publication-bundle`, integer `schemaVersion` 2,
required inline `preparedInputs` (§2.3C), `bootstrapOperationId`, repository/run/reviewed-source identities, source
commit/tree, semantic-contract/active-guidance/configuration/routing digests,
expected predecessor ledger/witness heads, expected ledger sequence,
`candidateSetDigest`, exact canonical transaction ID/digest, immutable
`createdAt`/`expiresAt`, and ordered immutable artifact descriptors. The
`publicationBundleDigest` field is absent from its preimage. Compute exactly:

```text
publicationBundleDigest = SHA-256(
  "LCIM-GENESIS-ACTIVATION-PUBLICATION-BUNDLE-v1\0"
  || JCS(publicationManifest without publicationBundleDigest)
)
```

Insert `publicationBundleDigest` into the final private manifest. The manifest,
the action-specific bootstrap authorities and the witness PREPARE frame bind
that value. No public candidate record does.

The prepared publication bundle is an immutable controller-owned directory at
an absolute private root outside the target repository, Git common directory
and run directory:

```text
<controller-private-root>/bootstrap-prepared/v1/<repositoryId>/<bootstrapOperationId>/
  candidate-set-core.jcs
  01-budget.jcs
  02-operator-session.jcs
  03-plan-confirmation.jcs
  04-non-runnable-genesis.jcs
  05-activation-settlement.jcs
  canonical-transaction.jcs
  publication-manifest.jcs
  SEALED
```

Every `.jcs` file contains the exact UTF-8 bytes published or hashed, never a
pretty-printed or regenerated equivalent. `publication-manifest.jcs` contains
exactly seven ordered immutable artifact descriptors for
`candidate-set-core.jcs`, candidates 01–05 and `canonical-transaction.jcs`.
Each descriptor has only fixed relative `filename`, integer `ordinal`,
`familyOrKind`, `byteLength`, lowercase `sha256`, and `recordId`/
`recordDigest` (their exact values where applicable and JSON null otherwise).
The manifest itself is authenticated by `publicationBundleDigest`; `SEALED` is
not an artifact descriptor and contains exactly the 64 lowercase hexadecimal
UTF-8 bytes of that digest, with no newline. This avoids a manifest self-digest
cycle while listing every immutable artifact.

C30-13 persists either kind as one `PERSIST_PREPARED_BUNDLE` mutation.
This is the **controlling internal persistence order**, not §4.2's outer
PREPARE → ledger → COMMIT protocol:

1. Under the confirmed instance and §2.5D, verify/create only the bounded
   ancestors and exclusively create verified sibling staging.
2. Write and check every exact payload artifact (seven/six).
3. Write/check the final v2 `publication-manifest.jcs`, including `preparedInputs`.
4. Write/check `SEALED`, exactly the kind-specific bundle identity alias.
5. Successfully fsync **every** required file, including manifest and SEALED.
6. Successfully fsync the **fully populated staging directory**, after all
   manifest/SEALED entries exist. An earlier directory fsync cannot replace this.
7. Atomically publish by same-filesystem **no-replace** rename, retaining descriptors.
8. Complete §2.5D's final-parent → every ancestor → durable-anchor flushes,
   including reused ancestors, and its existing-witness-prefix prerequisite.
9. Only after verification of all required success results report durable
   persistence; consume, reread and reclassify before a later action.

No artifact is altered after sealing. Any required file or directory fsync
failure prevents success, recoverable SEALED acceptance and downstream PREPARE,
ledger or evidence/ABANDON authorization. A visible complete package is not
ready; §2.5D defines the same action's exact-existing completion and restart.

Read and recovery reject every missing or unexpected path, non-fixed filename,
filename traversal, symbolic-link substitution, byte-length mismatch, SHA-256
mismatch, manifest mismatch, operation-ID mismatch or source-identity mismatch.
Recovery reads and verifies the stored bytes; it never regenerates candidate or
canonical-transaction bytes from prose, current source or current code. Once a
witness PREPARE exists, its sealed bundle is never deleted, rewritten or
reused. This private envelope is not a seventh public local-authority family.

### 2.3A Closed private publication preimages (both publication kinds)

This subsection supplies literal content schemas, not another public family.
All objects here are closed: every listed member is required, every other
member is forbidden, and null is forbidden except where expressly allowed.
Use §3.0 scalar types, RFC 8785 JCS UTF-8 without BOM/newline, and lowercase
64-hex SHA-256 output. In every domain in this plan, `\0` denotes **one byte
00**, not bytes 5c 30; equivalently `ASCII(domain text before \0) || hex(00)`.
Base64 means RFC 4648 standard alphabet `A–Z a–z 0–9 + /`, no padding,
whitespace or alternate spellings; decode then re-encode to check canonicality.
Byte lengths count decoded bytes, not Base64 characters. Artifact bytes are
1..9007199254740991 bytes; descriptor arrays have exactly the lengths below,
in ordinal order, with unique ordinals and no duplicate filename or descriptor.

**Shared binding members H.** H is notation for the following exhaustive
member list inserted at the top level, not a serialized `H` member:

| Literal member | Type, source and equality |
|---|---|
| `publicationKind` | `TRANSACTION_ZERO` or `SUCCESSOR_ACTIVATION`, selected once in A0 |
| `bootstrapOperationId` (transaction zero only), `operationId` (successor only) | §3.0 operation ID, the one frozen TTY operation; the other spelling is forbidden |
| `repositoryId`, `runId` | §3.0 IDs from verified A0 repository/run identity |
| `journalId` | §3.4 journal ID, computed by §4.1 from the retained, owner-verified canonical journal path, repository and run |
| `reviewedSourceGenerationId` | §3.0 source ID; equals activation `sourceGenerationId` and session/plan `reviewedSourceGenerationId` |
| `sourceCommit`, `sourceTree` | §3.0 Git IDs; equal session, plan and activation values |
| `semanticContractDigest`, `activeGuidanceDigest`, `configurationDigest`, `modelRoutingDigest` | §3.0 digests, equal session/plan/activation; configuration/routing also equal budget |
| `planDeclarationDigest` | §3.0 digest, equal budget/session/plan |
| `budgetPredecessor` | null at budget genesis; otherwise the complete verified §3.3 predecessor budget record, not the proposed successor |
| `expectedPredecessorLedgerHead` | digest; copied from verified ledger head before this operation |
| `expectedPredecessorWitnessHead` | digest or null for a header-only journal; copied from verified witness head before this operation |
| `expectedLedgerSequence` | count, the verified next ledger sequence; equals activation value |
| `createdAt`, `expiresAt` | timestamps fixed in A0; `createdAt < expiresAt`; `createdAt` equals activation `preparedAt` and transaction `preparedAt`; never refreshed during replay |

For either kind every candidate's common `operationId`, session/plan/budget
`ttyConfirmationOperationId`, and activation `bootstrapOperationId` and
`operatorConfirmationOperationId` equal the H operation ID. No alternate
operation alias may be added. Candidate repository/run values equal H. Budget
`sourceGenerationId` equals H reviewed source. `budgetPredecessor` is verified
under §§3.0/3.3 and equals the unique pre-operation current budget; candidate
budget predecessor/head equal its `recordId` (both null if it is null).
Successor session, plan and activation predecessor/head pairs equal their
respective unique committed current records before the operation. Their exact
prior records and matching transaction/COMMIT proofs are retained and verified;
these pairs are never fabricated from the proposed record. Budget continuity,
including consumed/reserved floors and separate confirmation for an increase,
is still §3.3. An equality ceiling uses `DECREASE`, never `INITIAL`.

**Activation projection.** `activationProposalCore` is exactly the §3.5 closed
activation object with exactly `candidateSetDigest`, `recordId`, `recordDigest`
and `generationId` removed. All other common and activation fields are required
with their §3.0/§3.5 types, including `candidateSetKind` fixed to H publication
kind. There are no additions or null placeholders. The excluded transaction,
private publication, resulting-head and COMMIT fields are not §3.5 members and
are forbidden even in this projection. Its budget/session/plan generation IDs
and digests equal the earlier final candidates; its review, zero-finding and
capability-manifest bindings are the verified immutable A0 inputs in §3.5.

**Core descriptor.** Exactly `ordinal` (integer 1..5), `familyOrKind` (the
literal in the ordering below), `bytesBase64` (canonical encoding of exact JCS
bytes), `byteLength` (positive count), `sha256` (SHA-256 of those decoded bytes).
The byte content, length and hash must all agree. It has no filename, record
identity or self-digest field.

`candidateSetCore` contains exactly `schemaName =
"lcim.genesis-activation-candidate-set-core"`, `schemaVersion = 1`, H, and
`candidates` (five core descriptors): ordinals 1–3 are respectively
`lcim.local-budget-ceiling@1`, `lcim.local-operator-session@1`,
`lcim.local-plan-confirmation@1`; ordinal 4 is
`NON_RUNNABLE_PENDING_ACTIVATION_COMMIT` (the exact C30-03 non-runnable genesis
candidate); ordinal 5 is `activationProposalCore` (the projection above).

`successorCandidateSetCore` has exactly the same structure with these exhaustive
substitutions: schemaName `lcim.successor-activation-candidate-set-core`;
H kind `SUCCESSOR_ACTIVATION` and H operation spelling `operationId`; exactly
four `candidates` descriptors, ordinals 1–3 for the final successor budget,
session and plan with the same family literals, and ordinal 4 for
`activationProposalCore`. Remove the genesis descriptor, add nothing else.
The approved candidate-set domains in §§2.3/2.5A hash the **entire core**, with
no exclusions. No core contains either candidate-set digest or any transaction
or publication-bundle identity. Insert the resulting digest into the final
activation and derive its ordinary identities under §§3.0/3.5.

**Publication descriptor.** Exactly `filename`, `ordinal`, `familyOrKind`,
`byteLength`, `sha256`, `recordId`, `recordDigest`. Filename is the fixed relative
ASCII literal below (no slash, traversal, alias or symlink). Ordinal is integer
0..6. Length/hash authenticate the exact stored artifact bytes. For public
candidates, recordId/digest have §3.0 types and must verify from those bytes.
Both identity members are null for a core, transaction or non-runnable genesis
artifact; transaction identity is authenticated separately below. No Base64
member appears in a publication descriptor.

`publicationManifest` contains exactly `schemaName =
"lcim.genesis-activation-publication-bundle"`, `schemaVersion = 2`, H,
`preparedInputs` (required §2.3C capsule), `candidateSetDigest`, `canonicalTransactionId` (§3.4 transaction ID pattern),
`canonicalTransactionDigest` (digest), `artifacts` (seven publication
descriptors), and final `publicationBundleDigest`. Ordered artifacts are:

| Ordinal | filename | familyOrKind |
|---:|---|---|
| 0 | `candidate-set-core.jcs` | `lcim.genesis-activation-candidate-set-core@1` |
| 1 | `01-budget.jcs` | `lcim.local-budget-ceiling@1` |
| 2 | `02-operator-session.jcs` | `lcim.local-operator-session@1` |
| 3 | `03-plan-confirmation.jcs` | `lcim.local-plan-confirmation@1` |
| 4 | `04-non-runnable-genesis.jcs` | `NON_RUNNABLE_PENDING_ACTIVATION_COMMIT` |
| 5 | `05-activation-settlement.jcs` | `lcim.local-activation-settlement@1` |
| 6 | `canonical-transaction.jcs` | `lcim.controller-transaction@1` |

`successorPublicationManifest` normatively inherits that exact structure with
this exhaustive substitution/removal list and no additions: schemaName becomes
`lcim.successor-activation-publication-bundle`; H uses successor kind/operation
spelling; candidateSetDigest equals successorCandidateSetDigest; the final
self-identity member is named `successorPublicationBundleDigest`, not
`publicationBundleDigest`; `artifacts` has exactly six entries: ordinal 0
`candidate-set-core.jcs` / `lcim.successor-activation-candidate-set-core@1`,
ordinals 1–3 `01-budget-successor.jcs`, `02-operator-session-successor.jcs`,
`03-plan-confirmation-successor.jcs` with the same public family literals,
ordinal 4 `04-activation-settlement-successor.jcs` /
`lcim.local-activation-settlement@1`, ordinal 5 `canonical-transaction.jcs` /
`lcim.controller-transaction@1`. There is no genesis descriptor.

H must be byte-value equal in the core and manifest. Manifest candidate-set
identity must equal the domain hash of the stored core and final activation's
binding. Earlier candidate bytes must equal decoded core descriptors; projecting
the final activation must reproduce the core's proposal bytes exactly. Manifest
transaction ID/digest must verify against the exact stored transaction, which
must name the same final candidate bytes in order. Validate all these equalities
before declaring any bundle verified. Missing/unknown fields or broken internal
bindings are a corrupt bundle, not fact drift. Future schema versions reject.

Hash the manifest after removing **only its kind-specific final self-identity
member**, using the applicable approved domain. Insert the digest and JCS encode
the final manifest. For successor witness/authority consumers,
`publicationBundleDigest := successorPublicationManifest.successorPublicationBundleDigest`
is an exact value alias, **not another hash**, and does not add a field to the
manifest or public candidates. `SEALED` is exactly the ASCII bytes of that
alias, 64 bytes without newline. The final manifest is authenticated by this
self-excluding formula; SEALED is compared to it. Neither gets an artifact
descriptor. The counts remain nine/eight directory entries and seven/six payload
artifacts. No PREPARE file is present.

### 2.3B Existing controller-transaction publication projection

For the two publication kinds only, freeze the existing C30-03
`lcim.controller-transaction@1` core to exactly: `schemaName` (that name without
@1), `schemaVersion` (integer 1), `protocolVersion` (string `3.0`),
`operationId`, `repositoryId`, `runId` (manifest/H IDs), `sequence` (H expected
ledger sequence), `predecessorHead` (H expected ledger head), `preparedAt`
(H createdAt), `events`, `payloadDigest`. No other core members are permitted.
`events` is exactly five (transaction zero) or four (successor) ordered closed
objects, each containing only `eventKind` (literal GENESIS for transaction zero,
SUCCESSOR_ACTIVATION for successor) and `candidate`. Each candidate is the
§2.3A core descriptor for a **final** candidate, extended with required
`recordId` and `recordDigest` (verified §3.0 values for public records, both null
for the existing non-runnable genesis). Thus the last event contains final
activation bytes, not proposal bytes. `payloadDigest = hex(SHA-256(JCS(events)))`.
The events' bytes must equal the stored final artifacts. No new family or
ordinary-transaction semantics are introduced by this publication projection.

Derive and insert exactly transactionId, transactionDigest and headDigest using
C30-03's existing formulas, with domain bytes explicitly:
ASCII(`LCIM-CONTROLLER-TX-ID-v1`) || 00 || JCS(core);
ASCII(`LCIM-CONTROLLER-TX-DIGEST-v1`) || 00 || JCS(core plus transactionId);
ASCII(`LCIM-CONTROLLER-TX-HEAD-v1`) || 00 ||
JCS([predecessorHead,sequence,transactionDigest]). All hashes are lowercase hex;
transactionId is `lcim_tx_` plus the first hash. These three are the only
non-core final members. Final bytes are JCS of that object, without newline.
The candidate-set/manifest SHA-256 descriptors hash exact final bytes. Recovery
verifies this projection; it does not rebuild or rewrite stored transactions.

### 2.3C V7 retained prepared-input capsule and proof closure

**Explicit private-format amendment.** For both kinds, publication manifest
schemaVersion is now exactly **2**, with the one added required member
`preparedInputs`. Schema names, `/v1/` storage layout, artifact order, nine/eight
filenames and seven/six descriptors stay fixed. Candidate-set cores remain v1;
H and all public schemas, field semantics and hash algorithms stay unchanged.
The existing `...PUBLICATION-BUNDLE-v1` domain hashes the entire **v2** manifest
minus only its final kind-specific self-identity member, including the capsule
and version. The domain suffix is an algorithm identifier, not schemaVersion.
The existing raw final-manifest SHA authority binding authenticates these
expanded bytes. Concrete bundle, witness and evidence hashes consequently
change; §12 records historical V7 pins, not current V8 execution results.
§15 exercises the current V9 model without relabeling those pins.

The capsule is a recursively closed object with exactly:

| Member | Required type / equality |
|---|---|
| schemaName, schemaVersion | `lcim.prepared-input-capsule`, integer 1 |
| preparedBindingSnapshot | exact complete §3.4A PREPARED snapshot; operation alias mapped from H; every field equals H |
| ownerInputs | the shared OwnerInputSide-v2 below, verified against that snapshot |

No member is nullable except snapshot.budgetPredecessor under §3.4A. Object
members use RFC 8785 ordering, not insertion order. Scalars use §3.0. Each
byte stream uses §3.4C's closed octets descriptor, canonical unpadded RFC 4648
Base64, decoded byteLength integer 0..9007199254740991 and raw lowercase SHA-256;
all three must agree. Boolean lengths, noncanonical encodings and overflow
reject. Nonempty is required except explicitly empty ledger streams below.
Total decoded bytes and final JCS length must fit that same bound. Reject
resource-limit excess before publication; never truncate or omit inputs.

**Shared OwnerInputSide-v2.** This is exactly the seven-member prepared/current
owner side used in §3.4C, not a new public record: `semanticContract`,
`activeGuidance`, `configuration`, `modelRouting`, `planDeclaration`,
`sourceCheckpointEvidence`, `budgetPredecessorEvidence`. The first five are
nonempty octets of the exact §3.4A owner streams (resolved **non-secret**
configuration, exact supplied multi-file stream, locked routes, canonical plan
payload). Recompute the four raw identities and C30-02 plan-domain identity;
compare to the snapshot, H and every applicable candidate. No reconstruction
from pathnames, digests, unresolved environment variables or current settings
is permitted. No ambient environment dump, credentials or raw transcripts are
allowed. If required input cannot safely be retained, deny before publication.

The last two members are **non-null** octets containing the following exact
JCS proof archive (including budget genesis absence, superseding V6's null
budget-evidence convention). This freezes the previously under-specified
transitive stream boundary without changing any source/budget owner algorithm.

**ProofArchive-v1 encoding.** Exactly `schemaName` = `lcim.owner-proof-archive`,
`schemaVersion` = integer 1, `purpose` = `SOURCE_CHECKPOINT` or
`BUDGET_PREDECESSOR`, `binding` = the entire corresponding §3.4A snapshot,
`roots`, `inputs`. No nulls except within binding. `inputs` is an array of
1..9007199254740991 closed objects `{key, content, requires}`. Key is a unique
NFC nonempty owner-input identifier, at most 4096 UTF-8 bytes, no NUL, slash,
backslash, `.` or `..`; it is a logical lookup name, **never a filesystem path**.
Content is an octets descriptor of exact raw owner input bytes. Requires is an
array of 0..input-count distinct keys. Inputs are ordered by UTF-8 key bytes;
requires and roots by UTF-8 key bytes, distinct. Roots has 1..input-count keys.
Every referenced key must exist, the graph must be acyclic, and every input
must be reachable from a root. Missing, extra, ambiguous or unused inputs reject.
No leaf may be a retrieval URI, hash-only stand-in or unsupported assertion.

For SOURCE_CHECKPOINT roots are exactly `checkpoint-manifest`,
`checkpoint-proof`, `source-registry`. They contain the complete owner-format
Bootstrap Checkpoint V2 prepared manifest, verified proof and source-generation
registry prefix/current-head observation, respectively. Their transitive inputs
include the full referenced checkpoint/registry lineage, review/validation
inputs, Git commit/tree/blob objects and path/mode/changed/candidate-universe
observations, verifier/guidance bytes and executable-identity input bytes needed
by BOOTSTRAP_OPERATOR_CHECKPOINT §§2–4/6 and master §7. Git object names alone
are not objects. For BUDGET_PREDECESSOR roots are exactly `ledger-prefix` and
`witness-prefix`: complete pre-operation owner ledger stream (may be empty)
and complete verified witness prefix (at least LCIMWJ01), with every referenced
budget record, transaction, COMMIT, prior bundle and selected evidence input
needed by C30-03 and §§3.0/3.3/4 in their existing raw encodings. Verify all
identities/lineage and unique current predecessor; at genesis verify absence
from those complete prefixes, not null evidence or an assertion of absence.
Other contents are nonempty. Binding includes operation/repository/run/kind,
source generation/commit/tree, times and all owner identities, not this
operation's future transaction/head. For the prepared side, recomputed ledger head/next sequence and witness
head/journal identity from those prefixes must equal H's expected predecessor
ledger head/sequence, expected predecessor witness head and journalId. A
header-only prefix has null head; no prepared proof prefix may contain a frame
or transaction of this operation. Cross-check budget CAS/record identities
against those same prefixes and every copied source/owner identity against its
retained input bytes. Current budget proof excludes only this operation's own
exact transaction as §3.4A specifies; compare its recomputed heads to the
retained current observation, not H's old heads.

An owner verifier must run against this finite retained input map: each input
read resolves to exactly its key/content; its actual dependency reads must equal
requires and its entry inputs equal roots. Verify original owner encodings,
identity algorithms and semantic/lineage rules, not merely archive hashes.
External fallback reads (including current registry/Git paths) are forbidden
for PREPARED verification. An unavailable leaf, unsupported owner encoding,
unknown dependency or incomplete closure denies publication; there is no
unchecked opaque-proof escape. Filesystem/OS observations are retained as the
owner's original non-secret observation bytes; they prove the observation,
not timeless OS state or independent cryptographic truth. Current observation
still independently performs the live owner checks.

**Acyclic construction and retention prerequisite.** Collect/verify complete
prepared streams and pre-operation proofs before freezing the capsule. They
may refer to earlier immutable operations, never this capsule's resulting
bundle identity, this operation's future PREPARE/COMMIT or its resulting ledger
state. Snapshot → streams/proof closure → capsule → v2 manifest → bundle
identity → PREPARE is acyclic. C30-13's existing PERSIST_PREPARED_BUNDLE is the
only writer of the inline capsule, as an explicit content-contract amendment,
not an extra logical action. Full verification and §2.3/§2.5D durability of the
capsule **and** bundle are prerequisites to recoverable SEALED, PREPARE and
later pre-ledger terminalization. A0/classifiers never fsync.

**Deterministic recovery.** Use the existing kind/repository/operation path in
§2.3 or §2.5A; verify the exact manifest/SEALED, descriptor set, capsule and all
cross-bindings. Read `preparedInputs.ownerInputs` only from those persisted
bytes; derive P from its verified snapshot/bytes. S' is a separate new verified
owner observation producing C. §3.4C copies the prepared side byte-value-exact
from the capsule and current side from that observation. Retain published
bundles/capsules indefinitely, including no-PREPARE and abandoned operations;
no cleanup, mutation, replacement or registry retrieval service is authorized.
Missing/substituted capsule or proof bytes quarantine a selected operation;
unavailable current observations deny classification, not invented drift.

V1 publication manifests and V1 evidence packages, and §§10–11 fixtures, are
**historical only**. Do not silently widen their closed schemas, rewrite them,
upgrade their hashes or authorize a new operation/continued publication with
them. Historical terminal records can be inspected read-only without granting
capability or claiming V7 conformance. A nonterminal old bundle lacks V7's
prerequisite and is quarantined for unsupported prepared-input retention, not
repaired from S'. Future versions and v2-without-capsule reject.

### 2.4 Acyclic candidate-record dependency graph

The literal construction order is:

| Order | Candidate | May depend on | Prohibited dependency |
|---:|---|---|---|
| 1 | `lcim.local-budget-ceiling@1` | verified repository/run/source, plan-declaration proposal, configuration/routing and TTY operation proposal | session, plan-confirmation, genesis, activation, candidate-set, transaction or publication-bundle identity |
| 2 | `lcim.local-operator-session@1` | order 1 budget ID/digest and verified A0 facts | plan-confirmation, genesis, activation, candidate-set, transaction or publication-bundle identity |
| 3 | `lcim.local-plan-confirmation@1` | order 1 budget and order 2 session IDs/digests | genesis, activation, candidate-set, transaction or publication-bundle identity |
| 4 | non-runnable protocol/run genesis candidate | orders 1–3, expected predecessor ledger/witness heads and reviewed source | resulting heads, activation, candidate-set, transaction or publication-bundle identity |
| core | `activationProposalCore` | every pre-binding activation field | `candidateSetDigest`, record identity, transaction/publication identity, resulting heads and COMMIT digest |
| set | `candidateSetCore` | exact order 1–4 bytes and exact activation-proposal-core bytes, with lengths/SHA-256 | its own digest, transaction identity or publication-bundle identity |
| 5 | `lcim.local-activation-settlement@1` | orders 1–4, expected predecessor heads/sequence, `candidateSetKind = "TRANSACTION_ZERO"` and `candidateSetDigest` | transaction/publication identity, resulting heads or COMMIT digest |
| transaction | canonical controller transaction | all five final exact candidate byte strings | no candidate may refer back to it |
| private manifest | publication envelope | candidate set, all exact artifacts and final transaction identity | `publicationBundleDigest` in its own preimage |

Transaction zero uses the all-zero ledger predecessor; its witness predecessor
is null only for the first attempt, otherwise the prior durable ABANDON head. The genesis candidate is explicitly
`NON_RUNNABLE_PENDING_ACTIVATION_COMMIT`. No record refers to an ID derived from
a later record, and the public activation candidate never depends on the later
private publication-envelope identity.

### 2.5 Phase A1 — action-specific one-use bootstrap publication

For ordinary candidate publication, after A0 displays every bound fact,
including both digest identities, exact controlling-TTY confirmation starts one
bootstrap operation. Genuine first initialization instead uses §2.5C's
complete pre-journal display (no bundle/digest/capability prerequisite). C30-13 may issue
only opaque, module-private, action-specific
`GENESIS_ACTIVATION_BOOTSTRAP_AUTHORITY` instances. Every instance binds
exactly:

- `publicationKind = "TRANSACTION_ZERO"`;
- `bootstrapOperationId`;
- `publicationBundleDigest` (null only for INITIALIZE_WITNESS_JOURNAL, which
  requires no bundle; otherwise the existing exact digest);
- expected classified-state digest;
- expected ledger head;
- expected witness head;
- one exact action;
- the exact artifact, frame or transaction byte digest for that action;
- expiry; and
- a unique authority instance ID.

The exact eight-action vocabulary is (eligibility is not universal):

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

Initialization is transaction-zero genuine first creation only (§2.5C).
Evidence persistence is only an eligible exact pre-ledger terminalization
(§3.4C). Neither new action is production capability or a new authority class.

The expected classified-state digest is
`SHA-256("LCIM-BOOTSTRAP-CLASSIFIED-STATE-v1\0" || JCS(closedClassifiedState))`.
The exact action-byte binding is: final `publication-manifest.jcs` byte SHA-256
for persistence (which, through `publicationBundleDigest`, binds every listed
artifact); exact framed PREPARE bytes for PREPARE; exact stored
`canonical-transaction.jcs` bytes for ledger publication; exact framed COMMIT
bytes for COMMIT; exact incomplete suffix bytes plus target verified length for
truncation; and exact framed ABANDON bytes for ABANDON. These six existing
byte-digest algorithms remain unchanged; §2.3C explicitly expands persistence
content; V8 §2.5B expands COMMIT's private observation and §2.5D deliberately
expands APPEND_WITNESS_COMMIT beyond witness-only effects to ledger-file and
full ledger-chain fsync before witness append. Its framed-byte SHA algorithm
and every public field remain unchanged. Initialization binds §2.5C's
initializationActionByteDigest; evidence persistence binds §3.4C's exact final
evidence-manifest.jcs SHA-256. ABANDON additionally requires matching durable
retrievable evidence, bound through the classified observation, before any write.

One mutation means one explicitly bounded logical publication operation,
including only the enumerated internal filesystem effects in §§2.5C/3.4C/4.5,
not one business operation per syscall. One authority instance authorizes
exactly one action and one such mutation. It is
consumed after that mutation; any denial, mismatch or quarantine discards it.
No instance can authorize PREPARE plus ledger plus COMMIT, truncation plus an
append, or any other combined mutation. It is never serialized, persisted,
copied, configured, placed in argv/environment or exposed to a model.

For uninterrupted initial publication, the one TTY-confirmed operation may
cause C30-13 to issue the next in-memory action authority only after the prior
authority was consumed, state was re-read, state was reclassified, and the
exact next expected heads/action were verified. The action sequence is
`PERSIST_PREPARED_BUNDLE`, `APPEND_WITNESS_PREPARE`,
`PUBLISH_LEDGER_TRANSACTION`, then `APPEND_WITNESS_COMMIT`, with the passed
nine-step durability order preserved. After process exit no authority survives;
every recovery mutation requires fresh controlling-TTY confirmation.

The bootstrap authority cannot dispatch providers, mutate general Git, perform
an ordinary recovery mutation, finalize, authorize unrelated/changed bytes or
change an operation, predecessor, source generation or identity. Publication
contains exactly five candidates: four local-record candidates (budget,
operator session, plan confirmation and activation settlement) plus one
non-runnable protocol/run genesis candidate. The consistency witness is the
PREPARE/COMMIT publication protocol, not a transaction-zero candidate record;
the manual delivery manifest is emitted later by C30-14. The five candidates
become visible together only after matching COMMIT verifies.

### 2.5A Successor-activation publication authority

`SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY` is the second and only other
module-private C30-13 publication-authority class. It is not a public schema
family, production capability, signer, general ledger authority, provider
or Git authority, or persisted bearer token. Starting a **new** successor
operation requires all six predicates below, plus §6.2's accepted generation and
current subject-scoped qualifications. Recovery of an already selected valid
operation instead uses §§2.5B/2.5D: its matching class may complete exact existing
ledger/COMMIT bytes while capability is absent, including a current terminal.
Issuance for that durability repair requires verified matching history, not
pre-established ledger durability, a stale-only terminal, historical V8 writer
proof or a new source qualification. It grants neither a new successor nor use.
For starting a new successor, the six predicates are:

1. a prior activation transaction has a durable exact matching witness COMMIT;
2. that activation cannot issue or reissue production capability because its
   bound source, semantic, guidance, configuration, routing, plan or budget
   facts are no longer current;
3. production capability is absent;
4. no current activation settlement already exists;
5. C30-13 completes a read-only successor-activation preflight; and
6. the operator confirms the exact successor operation through the controlling
   TTY.

Every successor publication has exactly four public candidates in this exact
order:

1. successor `lcim.local-budget-ceiling@1`;
2. successor `lcim.local-operator-session@1`;
3. successor `lcim.local-plan-confirmation@1`;
4. successor `lcim.local-activation-settlement@1`.

It contains no new run genesis. The budget successor preserves the current
finite confirmed ceilings unless a separately displayed and directly confirmed
budget change is included. An unchanged/non-increasing successor uses the
existing `reason = "DECREASE"` safety path (equality is allowed); an increase uses the
existing `INCREASE` path and separate direct confirmation. Configuration,
Flash, Sol, target code and model output cannot increase a ceiling, and all existing local-budget rules still
apply. The session and plan successors bind the exact current facts; the
activation successor binds the exact current source and review generation.

The two successor identities are distinct and domain-separated:

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

The successor activation has `candidateSetKind = "SUCCESSOR_ACTIVATION"` and
`candidateSetDigest = successorCandidateSetDigest`; its witness/authority
`publicationBundleDigest` binding equals
`successorPublicationBundleDigest`. Transaction-zero activation
has `candidateSetKind = "TRANSACTION_ZERO"` and its already-approved
transaction-zero `candidateSetDigest`. No public successor candidate contains a
canonical transaction ID/digest, `successorPublicationBundleDigest`, resulting
ledger/witness head or COMMIT-frame digest. Construction is literal and
acyclic: (1) final candidates 1–3; (2) `activationProposalCore`; (3)
`successorCandidateSetCore`; (4) `successorCandidateSetDigest`; (5) final
activation candidate; (6) canonical transaction; (7) private successor
publication manifest; (8) `successorPublicationBundleDigest`.

The exact private directory is outside the target repository, Git common
directory and run directory:

```text
<controller-private-root>/successor-activation-prepared/v1/<repositoryId>/<operationId>/
  candidate-set-core.jcs
  01-budget-successor.jcs
  02-operator-session-successor.jcs
  03-plan-confirmation-successor.jcs
  04-activation-settlement-successor.jcs
  canonical-transaction.jcs
  publication-manifest.jcs
  SEALED
```

These are exactly eight entries. The private manifest describes exactly the
six payload artifacts (`candidate-set-core.jcs`, candidates 01–04 and
`canonical-transaction.jcs`); the manifest and `SEALED` are authenticated
separately. The transaction-zero exclusive-create, checked-write,
§2.3 fully populated staging order, §2.3C v2 inline retention and §2.5D
shared durability/exact-existing completion rules apply to this kind too.
Recovery uses only verified retained prepared bytes, separately from current inputs.

`SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY` accepts seven of §2.5's eight
actions: every action except INITIALIZE_WITNESS_JOURNAL. It must never recreate
a missing historical journal. Every instance binds publication kind `SUCCESSOR_ACTIVATION`, one
operation, one exact action-byte digest, the applicable private publication-
bundle digest, classified-state digest, expected ledger/witness heads, expiry
and authority instance ID. It permits one action and one mutation, is consumed
after that mutation, requires re-read and reclassification before another
instance, and disappears on process exit. Every recovery mutation requires
fresh controlling-TTY confirmation. It cannot dispatch Flash or Sol, execute
validation, perform general Git mutation, publish an unrelated transaction,
finalize delivery, grant production authority or issue the production
capability.

If successor facts drift before ledger publication, §3.4C requires a fresh-TTY
PERSIST_ABANDON_EVIDENCE instance, durable exact evidence, consumption and
reclassification before a separate APPEND_WITNESS_ABANDON instance can
terminalize the exact successor. A new successor operation is then required. If the exact successor
ledger transaction is already published, recovery uses APPEND_ABSENT only if
COMMIT is absent; otherwise COMPLETE_EXACT_EXISTING establishes its relation
without append (§2.5D), despite previously observed drift. It never erases or
abandons that transaction. A new successor for stale activation additionally
requires §6.2's accepted current source and affected gate applicability.

After a successor matching COMMIT is durable, C30-13 must (1) reverify the
exact current source, review, plan, budget, ledger and witness facts; (2) verify
that the committed activation is the current activation generation; (3)
display those exact facts; and (4) obtain fresh controlling-TTY confirmation.
Only then may it issue `PRODUCTION_RUNTIME_CAPABILITY`. This finite path uses no
production authority to create or authorize itself.

### 2.5B Closed authorization observation: `closedClassifiedState`

This private value is a closed discriminated union: PRE_JOURNAL uses exactly
§2.5C's pre-journal shape; every other classification uses the post-journal
shape below after §§4.1/4.3/4.4 validation and bundle verification, before an
authority instance exists. No absent journal is passed to the byte parser or
represented by a fabricated verified prefix. It is not a public record
or authority. V9 explicitly amends the private union by **nextAction**:
non-COMMIT variants (including PRE_JOURNAL) require `observationVersion` =
integer 2 and forbid both `ledgerCommitPrerequisite` and `commitBranch`.
Only nextAction `APPEND_WITNESS_COMMIT` requires integer 3 and exactly two
additional members: non-null closed `ledgerCommitPrerequisite` and `commitBranch`
(the literal `APPEND_ABSENT` or `COMPLETE_EXACT_EXISTING`). The alternatives and
owner-session predicates are closed by the priority table below. Old v3 COMMIT
without commitBranch, version-2 COMMIT, version-3 non-COMMIT and Boolean/future
versions reject. This is an explicit private-shape change, not a new public
schema or a silent interpretation of old observations. All variants
require `pathBindings` = §2.5D's closed path observation array. V6 shapes are
historical, not issuable. All applicable listed members are required, no others
are allowed at any nesting level, and only explicit nullable members may be null. Use §3.0 scalar
types and exact JCS. There are no authority instance IDs, capability objects,
TTY bearer values or resulting authority digests in this preimage.

| Literal member | Complete type / source |
|---|---|
| `classification` | one of `PRE_PERSISTENCE`, `SEALED_NO_PREPARE`, `PREPARE_ONLY`, `LEDGER_WITHOUT_COMMIT`, `COMMITTED`, `ABANDONED`, `INCOMPLETE_TAIL`, selected by the table below |
| `publicationKind` | exactly `TRANSACTION_ZERO` or `SUCCESSOR_ACTIVATION`, from verified manifest |
| `operationId`, `repositoryId`, `runId` | §3.0 IDs from manifest (map its transaction-zero bootstrapOperationId to operationId) |
| `observedAt` | one frozen classifier observation timestamp, not a timestamp taken on each reread |
| `preparedBindingDigest`, `currentBindingDigest` | exact §3.4A snapshot digests at that observation |
| `observedCauseSet` | §3.4A computed ordered array, 0..8 distinct reason literals; empty is allowed here but not for ABANDON evidence |
| `bundle` | closed object defined below, never null |
| `ledger` | closed object defined below, never null |
| `witness` | closed object defined below, never null |
| `nextAction` | exactly one eligible §2.5 action name, or null only for terminal/no-action states in the table |
| `terminalization` | null except an eligible stale SEALED_NO_PREPARE/PREPARE_ONLY proposal; otherwise the closed §3.4C object |

`bundle` has exactly: `storage` (`MEMORY_VERIFIED`, `VISIBLE_VERIFIED` or
`SEALED_VERIFIED`), `destination` (`VERIFIED_ABSENT` or `EXACT_PRESENT`),
`candidateSetDigest`, `publicationBundleDigest`, `manifestSha256`,
`transactionDigest`, `transactionSha256`, `expectedPredecessorLedgerHead`
(all digests); `transactionId` (transaction ID); `manifestByteLength`,
`transactionByteLength` (positive counts); `expectedLedgerSequence` (count);
`expectedPredecessorWitnessHead` (digest or null); `expiresAt` (timestamp).
Every value is copied or computed from the verified §2.3A bundle: sha256 fields
hash the final exact manifest/transaction bytes, lengths count those bytes,
transaction identity is C30-03's, and expected heads/sequence are the immutable
pre-operation values. MEMORY_VERIFIED means all exact prospective stored bytes
have been verified in A0 memory, but no directory exists; process loss at this
stage cannot recover those bytes and cannot authorize persistence of a newly
invented replacement operation. MEMORY_VERIFIED requires VERIFIED_ABSENT.
VISIBLE_VERIFIED requires EXACT_PRESENT and every v2 entry/capsule verified,
but no session-local completed §2.5D durability verification. SEALED_VERIFIED
requires EXACT_PRESENT, every entry/capsule verified and successful §2.5D
completion in this session. Existence/readability/SEALED bytes alone do not
establish durability. Restart loses this session knowledge.

`ledger` has exactly `headDigest` (digest), `nextSequence` (count), and
`transactionPresent` (Boolean). They come from the locked verified ledger
prefix. False requires head/next sequence equal bundle expected ledger
head/sequence; true requires exact byte equality with the stored transaction,
head equal that transaction's derived `headDigest`, and nextSequence equal its
sequence + 1. A conflicting transaction or head is quarantine, not either
Boolean value. The empty ledger has zero head and nextSequence 0.

`witness` has exactly `journalId` (§3.4 ID), `verifiedPrefixByteLength` (count
at least 8), `verifiedPrefixSha256` (SHA-256 of the exact header plus all verified
complete frames), `nextSequence` (count), `headDigest` (digest or null),
`currentGenerationId` (record ID or null), `prepare`, `terminal`, and
`incompleteSuffix`. Journal identity equals manifest journalId. Next sequence
is 0 at a header-only prefix, otherwise last verified sequence + 1; head and
current generation are respectively null/null there, otherwise last verified
headDigest/recordId. The prefix facts come from §4.1, never a guessed boundary.

`prepare` is null if no complete PREPARE for this operation exists; otherwise
it has exactly `recordId` (record ID), `frameDigest`, `headDigest`,
`framedByteSha256` (digests), `sequence` (count), `framedByteLength` (positive
count). These are copied/computed from the exact verified PREPARE frame;
framed bytes exclude the once-only journal header. `terminal` is null if no
complete terminal exists; otherwise it has these same six members plus
`frameKind` (`COMMIT` or `ABANDON`), from that verified exact terminal frame.
Matching operation/transaction/bundle and preparedFrameDigest are checked by
§3.4. Direct ABANDON permits null prepare; COMMIT does not.

`incompleteSuffix` is null at an exact frame boundary; otherwise it has exactly
`stage` (`LENGTH`, `PAYLOAD`, `DIGEST`), `byteLength` (positive count) and
`sha256` (digest). Length/hash cover **all bytes from the start of the incomplete
frame**, including any length word, not merely the unfinished stage. §4.1
supplies the eligible stage. These bytes and the exact prefix are retained.
Header failure or known bad length/syntax is never this object.

**V9 priority:** after integrity validation, a complete matching COMMIT prefix
with no exact same-session relation-completion knowledge offers COMMIT completion
**before** bundle completion or suffix truncation. Merely reporting COMMITTED is
read-only and implies neither durability nor capability. Knowledge means only
§2.5D's owner-private completion key, never a caller Boolean, serialized field,
readable bytes or a durable-map oracle. Table predicates are validated by the
issuer/consumers against that owner memory; they add no knowledge member to the
observation. All COMMIT alternatives require prepare, ledger and both existing
chains. All non-COMMIT rows are version 2 and forbid both COMMIT-only members.

| classification | Required stage facts | nextAction |
|---|---|---|
| COMMITTED or INCOMPLETE_TAIL with complete matching COMMIT prefix | VISIBLE_VERIFIED or SEALED_VERIFIED exact bundle; prepare/COMMIT and exact current-tip ledger present; head is COMMIT head; suffix null iff COMMITTED, otherwise exactly the identified incomplete suffix; relation knowledge absent/invalid | APPEND_WITNESS_COMMIT, version 3, commitBranch COMPLETE_EXACT_EXISTING; never append; this row wins over bundle/truncation rows |
| PRE_PERSISTENCE | MEMORY_VERIFIED; no operation prepare/terminal/suffix; ledger absent; heads match; no causes | PERSIST_PREPARED_BUNDLE |
| any otherwise valid post-journal stage with complete v2 VISIBLE_VERIFIED bundle, except the priority COMMIT-completion row | no integrity conflict; if a complete COMMIT exists its exact relation knowledge must still be valid before any flush, including shared ancestors | PERSIST_PREPARED_BUNDLE exact-existing fsync-only completion (§2.5D), even with drift; consume/reclassify |
| SEALED_NO_PREPARE | after completion: SEALED_VERIFIED; no operation prepare/terminal/suffix; ledger absent; witness head equals bundle expected head | APPEND_WITNESS_PREPARE if no causes (B1); B2 uses PERSIST_ABANDON_EVIDENCE with MEMORY_VERIFIED evidence, APPEND_WITNESS_ABANDON only with DURABLE_VERIFIED evidence |
| PREPARE_ONLY | SEALED_VERIFIED; prepare present, terminal/suffix null; ledger absent; witness head is prepare head | PUBLISH_LEDGER_TRANSACTION if no causes; otherwise the same evidence-storage split as B2 |
| LEDGER_WITHOUT_COMMIT | SEALED_VERIFIED; prepare present, terminal/suffix null; ledger present; witness head is prepare head | APPEND_WITNESS_COMMIT, version 3, commitBranch APPEND_ABSENT, even with causes |
| COMMITTED | SEALED_VERIFIED; prepare and COMMIT present, suffix null; ledger present; witness head is terminal head; exact same-session relation knowledge valid | null; logical result only, all separate capability/successor checks still required |
| ABANDONED | SEALED_VERIFIED; ABANDON present, suffix null; ledger absent; witness head is terminal head | null |
| INCOMPLETE_TAIL after priority completion/bundle rows | SEALED_VERIFIED; eligible suffix present; complete prefix absent, PREPARE-only, ledger-without-COMMIT, COMMITTED or ABANDONED with the same presence rules; complete COMMIT additionally requires valid relation knowledge | TRUNCATE_INCOMPLETE_FINAL_FRAME only; suffix-only write invalidates relation knowledge; consume/reclassify, then repeat exact-existing COMMIT completion if terminal COMMIT remains |

For no-operation prefixes (including post-ABANDON new attempts), prior
operations may exist: preserve their verified last head/generation/sequence,
not null or zero placeholders. The reconstructed operation PREPARE must start
at bundle.expectedPredecessorWitnessHead; no-operation, PREPARE and terminal
relationships must pass §4.3. `classification` is the stage label above, not a
new parser outcome; all quarantine/TTY denials return no authority observation.
A stale unpersisted memory proposal also offers no persistence authority; it
must be discarded before a new A0 operation. TTY absence/decline/timeout still
append nothing. No other state is eligible for these publication authorities.

**Closed private COMMIT variants (G3-V8-P1-01).** In addition to every
post-journal member above, observationVersion=3 requires exactly `commitBranch`
and `ledgerCommitPrerequisite`. The prerequisite still has exactly these members:

| `ledgerCommitPrerequisite` member | Required type / verified equality |
|---|---|
| `absoluteCanonicalLedgerPath` | actual C30-03 owner-bound physical ledger path below R, canonical under §2.5C; never caller-selected, a bundle path or `canonical-transaction.jcs` |
| `fileByteLength` | positive safe integer 1..9007199254740991, excluding Boolean; length of the complete observed physical ledger file/prefix |
| `fileSha256` | lowercase SHA-256 of those complete physical bytes, not just the transaction payload |

The C30-03 owner decodes that complete prefix and verifies the exact expected
transaction at its **current tip**: byte equality to the stored canonical
transaction, transaction ID/digest, sequence, predecessor and resulting head;
ledger.headDigest/nextSequence and all bundle/PREPARE bindings must agree.
There is no unread or unbound physical suffix. The COMMIT `pathBindings` is
the sorted duplicate-free **union of both complete existing ledger and witness
file/directory chains through R and U**, using exactly §2.5D's 1..64 entries,
closed metadata shape, bounds and no-follow checks. No ABSENT entry is allowed.
Visible exact ledger bytes establish eligibility for this completion action;
pre-established ledger durability is **not** an issuance prerequisite. The
bundle must be exact and capsule-verified. APPEND_ABSENT still requires
SEALED_VERIFIED; COMPLETE_EXACT_EXISTING permits VISIBLE_VERIFIED so its issuer
never waits for the witness-flushing bundle action. It verifies the actual
existing COMMIT bytes (not make-a-new-frame reconstruction), matching PREPARE,
full prefix and any identified suffix. Existing terminal.framedByteSha256/length,
frameDigest, recordId, sequence/head and preparedFrameDigest relation bind those
exact bytes. Action-byte SHA is that existing raw framed-byte SHA, excluding the
header. No new timestamp or observation ID is inserted into the stored frame.
The newly frozen observation's observedAt is separate. Both branch literals are
included in the complete classified-state digest; terminalization is null in
both. §2.5D defines branch effects and same-session eligibility.

The exact existing digest is lowercase hex SHA-256 of
`ASCII("LCIM-BOOTSTRAP-CLASSIFIED-STATE-v1") || hex(00) || JCS(closedClassifiedState)`
for **both** publication kinds, with no exclusions. Retain the canonical
observation and §3.4A input evidence for the displayed action. A verification
reread reuses its observedAt; any changed byte, head or bound fact rejects that
observation rather than replacing a timestamp or operation under an instance.
A separate live expiry check immediately before mutation may deny a now-expired
PREPARE/ledger action; it does not rewrite the frozen observation. A new action
requires consume/discard, fresh classification and the applicable TTY rules.
Terminalization/COMMIT/truncation use a newly confirmed unexpired authority
instance even if bundle expiry caused ABANDON; bundle expiry never extends.

Action-byte digests for frame appends are SHA-256 of the exact length word,
payload and raw digest, excluding the journal header. PREPARE bytes are solely
§3.4B's reconstruction. Persistence/ledger hashes are those in bundle above.
For truncation the exact byte binding is SHA-256 of
`ASCII("LCIM-WITNESS-TRUNCATION-v1") || hex(00) || JCS({journalId,
verifiedPrefixByteLength,verifiedPrefixSha256,incompleteSuffixByteLength,
incompleteSuffixSha256})`; every value is the corresponding witness member
(the last two from incompleteSuffix). No resulting authority or authority
digest participates. Each instance still permits only one mutation.

### 2.5C Authorized genuine first journal initialization

**Storage and lock contract (no setup writer).** Let U be the OS-resolved
canonical controller-user home and R = U + `/.lcim-private`, outside the target,
Git common directory and run directory. For new journals the canonical target
is `R/witness/v1/<repositoryId>/<runId>/witness.journal`. Existing journals
retain their already bound canonical paths and §4.1 journal-ID formula; path
migration is not initialization. Paths are absolute NFC strings without NUL,
empty components, `.`/`..`, symlinks or aliases; verify each existing ancestor
by descriptor, identity, owner and permissions, and recheck under locks. R and
its descendants are controller-owned, directories mode 0700, files mode 0600,
no target-writable ancestor. Missing descendants may be created only by the
named action below. A0 creates no directories.

The two owner locks are kernel advisory exclusive locks on read-only opened
**existing directory descriptors**, first U's canonical parent (ledger owner),
then U (witness owner); the inodes must differ. This deliberately coarse
per-home serialization applies to every owner path using these stores,
including classification and normal publication. Unlock in reverse order.
Opening/locking creates no file and writes no lock record. If the platform
cannot lock these descriptors or the existing home/path cannot be verified,
fail closed before mutation; no lock-file fallback. Directory creation beneath
R never provides another lock endpoint. These operations require neither an
installed empty journal nor a production capability; no setup command,
fixture authority, receipt, registry or provisioning write is on this path.
C30-03 owns storage/lock mechanics, C30-12 read-only recovery planning, C30-13
sole issuance and orchestration; C30-01 guards the object constructor.

**Closed pre-journal observation.** `closedClassifiedState` with classification
PRE_JOURNAL has exactly the following members (all required; §3.0 scalars/JCS;
no null except the literals explicitly printed). This replaces, rather than
partially populates, the post-journal shape:

| Member | Complete type and value/source |
|---|---|
| classification | literal PRE_JOURNAL |
| publicationKind | literal TRANSACTION_ZERO |
| operationId, repositoryId, runId | §3.0 IDs, frozen intended operation and verified repository/run identity, not persisted record claims |
| observedAt | frozen §3.0 UTC timestamp |
| controllerHome, controllerPrivateRoot, absoluteCanonicalJournalPath | canonical paths U, R and the exact derived target above |
| intendedJournalId | §4.1 journal-ID formula over repositoryId/runId/absoluteCanonicalJournalPath; intended, not an observed persisted ID |
| sourceBindings | exactly reviewedSourceGenerationId, sourceCommit, sourceTree, semanticContractDigest, activeGuidanceDigest, configurationDigest, modelRoutingDigest, planDeclarationDigest; §3.0 source/Git/digest types; current §7 verified source and exact §3.4A owner input identities |
| confirmationBindings | exactly controllerProcessIdentity (positive process ID count), controllerSessionIdentity (`^session_[0-9a-f]{32}$`), ttyConfirmationOperationId (equals operationId), intendedOperation (literal INITIALIZE_WITNESS_JOURNAL); memory-only local observations |
| absence | exactly journal (literal VERIFIED_ABSENT), ledger (literal VERIFIED_ABSENT), priorUse (literal VERIFIED_NONE), preparedBundles (literal VERIFIED_NONE), terminalEvidence (literal VERIFIED_NONE) |
| observedJournalId, verifiedPrefixByteLength, verifiedPrefixSha256, witnessHead, publicationBundleDigest, productionCapability | each literal null; no byte prefix, bundle or capability exists |
| ledgerHead, ledgerNextSequence | literal 64-zero digest and integer 0, logical empty-ledger facts justified by absence.ledger, not a persisted ledger record |
| nextAction | literal INITIALIZE_WITNESS_JOURNAL |

VERIFIED_ABSENT means descriptor-relative no-follow lookup returns ENOENT at
the expected leaf or a verified missing descendant, with every existing ancestor
readable and bound; never EACCES, I/O failure, unavailable mount or unknown
path. VERIFIED_NONE requires a complete read-only inventory of the canonical
repository/run ledger, witness, both prepared-bundle namespaces, evidence
namespace, and existing protocol/run/source-owner references to journal use.
No transaction, PREPARE, terminal, activation, sealed or partial publication
bundle, run marker or reference may imply this journal was previously used.
A run may be an intended new run with no persisted record. Historical uses of
other runs do not count. Missing journal with any such evidence is
INTEGRITY_QUARANTINE_MISSING_HISTORICAL_JOURNAL, including partially published
history and successor activation. Unreadable/unavailable inventory gives
DENIED_WITNESS_OBSERVATION_UNAVAILABLE, not PRE_JOURNAL. Coordinated removal of
all roots remains outside the threat model, not claimed detectable absence.

The only excluded inventory entries are unselected initialization temporary
files under the exact target parent, named `.init-<opId>-<digest>-<nonce>.tmp`
(opId pattern §3.0, digest lowercase 64 hex, nonce 32 lowercase hex), owned 0600
regular no-link files containing a byte prefix of LCIMWJ01 of length 0..8.
They prove **no publication**, cannot authenticate an old confirmation, and
are never reused, published, edited or removed. Unknown/malformed entries deny
classification; no silent cleanup. This explicit orphan rule makes fresh
initialization possible after interrupted staging without an intent writer.

**Bytes and confirmation.** `initializationPlan` is exactly
`{observation: <the complete PRE_JOURNAL object>, headerHex: "4c43494d574a3031"}`.
It is a private memory-only closed preimage, not a public record. Freeze:

```text
initializationActionByteDigest = hex(SHA-256(
  ASCII("LCIM-WITNESS-INITIALIZATION-ACTION-v1") || 00 || JCS(initializationPlan)))
```

No member is excluded. It binds all source/guidance/operation/path facts and
exactly eight final header bytes, ASCII LCIMWJ01. It excludes candidate bytes,
publication bundles, frames, ledger writes, evidence, receipts, cleanup and
capability issuance by **not permitting those effects**, not by hiding them in
a hash omission. The classified-state digest remains §2.5B's domain over this
complete variant. Display the full observation, digest, byte digest, target,
header hex and permitted effects. Accept only the exact line
`CONFIRM <operationId> INITIALIZE_WITNESS_JOURNAL <classifiedStateDigest> <initializationActionByteDigest>`
plus LF from the controlling TTY, before timeout; no stdin/config/model input.
C30-13 then issues one genuine bootstrap-class object; expected witness head
is null with VERIFIED_ABSENT semantics, publicationBundleDigest is null, and
expiry is confirmation time + 300 seconds. It is unique, opaque, memory-only,
one-use and lost on exit. Recheck current source/guidance, exact observation,
absence and bindings under both locks immediately before the first write.
Decline/timeout/missing TTY use §2.8 denials. No existing bundle or production
capability is required. The initialization display does not confirm candidate
publication: the normal complete A0 display/confirmation is still required.

**One bounded initialization mutation.** Under that instance only: use the
single §2.5D verified-chain procedure for R/witness/v1/repository/run,
including every reused ancestor, not only this attempt's mkdir results.
A path appearing after confirmation invalidates the bound path observation.
Choose a fresh nonce and exclusively create the above temporary file in the
final parent, checked mode 0600. Write only the eight header bytes (checked
write loop; errors abort, never report success on a short write). Fsync file,
fsync parent; verify exact eight bytes. Publish by atomic **no-replace** rename
on the same filesystem, never overwriting any destination; then complete the
entire §2.5D final-parent-to-U chain. Rename is only visibility; successful file
and entire-chain flushes plus identity rechecks are the durability point. If unsupported, deny without emulating via overwrite.
No other file content, lock file, intent, receipt or cleanup write is allowed.
On error consume/discard the instance; leave owned staging untouched. A
published final file is never truncated/replaced by initialization. No-overwrite
also applies if an identical header appears: fail this attempt before touching
it, consume/discard, classify the existing file read-only. Never infer that a
competing creator's bytes were written by this operation.

After success consume, re-read and parse. Header-only facts are prefix length
8, SHA-256 of LCIMWJ01, sequence 0, null witness head/current generation,
prepare/terminal/suffix null. A0 may now verify the five-candidate memory bundle
and construct PRE_PERSISTENCE with terminalization null, then obtain a separate
PERSIST_PREPARED_BUNDLE instance. A0 remains wholly read-only. PREPARE still
appends only its §3.4B frame and never the header. An uninterrupted candidate
proposal may be retained only if still exact/current; after loss of unpersisted
bytes start a new confirmed A0 operation, never reconstruct old candidates.

| Crash/restart observed fact | Sole outcome, authority and replay rule |
|---|---|
| no file created (possibly only checked empty ancestors) | complete fresh absence inventory, new observation/operation/nonce and fresh TTY; new initialization instance; no cleanup |
| partial owned temporary header, including zero bytes | retain unselected temp; same fresh-attempt rule; never complete or publish it |
| complete temporary header before publication | retain it; same fresh-attempt rule; no exact-temp recovery is offered |
| rename occurred, operation has not returned (including before parent fsync) | crash may expose absent or complete final header; absent follows fresh inventory; complete follows read-only existing-header row; live durability is not assumed before parent fsync |
| verified existing header-only final journal | no initialization action; use existing eight-byte prefix; new current A0 display and normal publication authority (a surviving header is an observed byte fact, not an initialization success receipt; the separately confirmed PERSIST_PREPARED_BUNDLE action fsyncs the verified existing witness prefix and entire §2.5D chain before declaring its bundle durable; no header rewrite or revived initialization, and never A0) |
| existing journal with frames | ordinary byte/sequence classification; never initialization, even if a new operation has no frames |
| partial/malformed final header, including zero-length file | existing §4.1 BAD_WITNESS_HEADER/unsupported-version quarantine; never fresh initialization or truncation |
| absent journal but prior/partial publication history exists | INTEGRITY_QUARANTINE_MISSING_HISTORICAL_JOURNAL; no write |
| competing creator or final destination appears | no-replace failure/discard; classify winner read-only; conflict uses existing integrity rules |
| wrong path, repository/run or source/confirmation binding | DENIED_DISPLAYED_FACT_DRIFT before write; unavailable/unreadable is its distinct denial above |

No restart recovers authority from a filename, header or persisted evidence.
There is deliberately no temporary cleanup, reuse or exact-temp publication
recovery action; the exhaustive allowed fresh-attempt facts above are sufficient.

### 2.5D Single directory-chain durability contract (V9)

This procedure alone governs initialization, both publication-bundle kinds,
ABANDON evidence, and their applicable retries/exact-existing completion. It
also gives the exact meaning of required witness/ledger parent durability in
§4.2/§4.5. No shorthand `sync-parent` or `sync-package` implies recursion.

**Anchor and bounds.** U is §2.5C's OS-resolved canonical controller home,
identified by canonical NFC absolute path **and** open-descriptor
(deviceId, inodeId, ownerUid). The installation/OS storage contract must
already guarantee U's inode and every link from filesystem root to U durable;
these are pre-existing home infrastructure, not action-created state. This is
an explicit environmental prerequisite, not inferred from existence, mode,
read success or a previous attempt. U must be controller-owned with no
group/other write, its ancestors trusted and not target-writable; no symlinks,
mount substitution or aliases. The storage profile must guarantee successful
file fsync persists that file's content, successful directory fsync persists
**only that directory's own entries**, atomic same-filesystem no-replace
rename, and durable anchor survival. Unsupported flush/locking/no-replace,
unavailable anchor or inability to establish that storage profile gives
DENIED_STORAGE_DURABILITY_UNAVAILABLE, no mutation/authority fallback. This
amendment does not provision a home or claim platform verification.

R = U/.lcim-private. The action-owned chain begins at the **link R in U** and
ends at the object: journal/ledger file or package directory. Enumerate U,
R, and every intervening directory of the exact §2.5C journal, §2.3/§2.5A bundle
or §3.4C evidence path. Evidence's longest parent chain is U → R →
abandon-evidence → v1 → repositoryId → runId → operationId →
terminalReasonEvidenceDigest, ending with the package directory named by
abandonFramedByteDigest. Bundle parent chains end at repositoryId; journal at
runId. Ledger uses only its C30-03 bound canonical owner path beneath R; no
caller-selected path. Reject other roots, filesystem crossings or unbounded
chains. A package staging directory is a fresh sibling, not a new ancestor.

**Bound observation and descriptor checks.** `pathBindings` in the V9
classified union is an array of 1..64 unique closed entries sorted by UTF-8
absolute `path`, containing exactly `{path, kind, deviceId, inodeId, ownerUid,
mode}`. Path is a canonical §2.5C path; kind is ABSENT, DIRECTORY or FILE.
Device/inode/UID are integer counts, inode positive; mode is the exact
four-octal-digit string (R descendants 0700 directories/0600 files). Those
four metadata values are null iff ABSENT. Include U, each action's entire
bounded chain, final destination, and the existing witness chain/file when
it is a durability prerequisite. Missing descendants each have ABSENT;
verify the first missing link through its existing parent, not by trusting an
unresolved pathname. A0 opens no-follow descriptor-relative (openat/fstatat or
verified equivalent), checks ownership/type/mode, file link count = 1, and
records inode identity; no fsync occurs in A0. Recheck the identical observation
under §2.5C locks before mutation; an appeared/disappeared/replaced destination
or ancestor, even equal bytes/mode, discards the instance and reclassifies.
Before/after each flush and rename recheck pinned descriptor identity and its
containing-directory name link. No chmod/chown/overwrite/symlink following.
Exclusive mkdir accepts only the confirmed missing path; EEXIST requires a
fresh observation, not optimistic continuation. Staging uses a fresh exclusive
0700 directory/0600 files and no-replace destination; incomplete staging is
retained unselected, never cleaned or reused.

**Exact flush procedure.** Verify/create ancestors top-down. Before any
published-object durability claim:

1. Successfully fsync each required file through its verified descriptor.
2. For directory packages, fsync the fully populated staging directory after
   all entries exist (§2.3); initialization instead fsyncs its temporary file
   and containing parent before rename as §2.5C specifies.
3. Perform no-replace publication. For exact-existing completion there is no
   mkdir, content write or rename: verify/fsync every equal file and the fully
   populated **final** directory instead.
4. Fsync the final parent, then each containing directory bottom-up through R
   **and U**, once per chain occurrence (shared ancestors may be deduplicated
   only after the last relevant namespace change). This flushes the link naming
   the object, then the link naming each intermediate directory, finally R's
   link in U. Include every **new and reused** directory regardless of who or
   which attempt created it. A child fsync never persists its name in its parent.
5. Reverify exact files, all entries and descriptor/name identities. Only all
   successful required flushes and stable identities establish DURABLE_VERIFIED
   (bundle spelling SEALED_VERIFIED). No content/entry existence heuristic.

A file flush does not persist its directory entry. A directory flush does not
flush file contents, grandchildren or its own link in its parent. Earlier
staging flushes cannot cover later manifest/SEALED entries. Failed/unsupported
required fsync stops the action, consumes/discards authority, records no success
and permits no downstream action. Leave visible bytes untouched; integrity
failure quarantines, storage failure denies durability. Retry is always fresh
observation/TTY/one-use instance and repeats **all** required file/chain flushes.

**Action-owned effects and completion.** INITIALIZE_WITNESS_JOURNAL alone
creates first-use header/staging/ancestors and flushes that chain; never acts
on an existing header or historical journal. PERSIST_PREPARED_BUNDLE owns the
§2.3 sequence, inline capsule and chain; it additionally verifies/fsyncs the
**existing** witness prefix and witness chain before bundle success (no header
content write or journal creation). **Branch-specific V9 ordering:** if that
prefix contains a complete matching COMMIT for the selected operation/current
tip, this action is not eligible until
COMPLETE_EXACT_EXISTING has completed its ledger-then-witness relation in this
session. No package file, shared U/R ancestor or witness flush may happen first.
The initial observation offers COMMIT with a VISIBLE_VERIFIED bundle instead.
After that action consumes/reclassifies, bundle completion may proceed only
while the exact relation key still matches. This prevents even shared-ancestor
bundle flushes from making an old witness reachable ahead of ledger completion. This explicitly covers header-only
continuation after interrupted initialization before any PREPARE or later
ledger/evidence publication. PERSIST_ABANDON_EVIDENCE owns only its eleven-entry
package/chain, fresh or exact-existing, and requires a durable verified bundle.
These are support effects of the named single logical mutation, not extra
writes or actions. PREPARE/ABANDON append and truncation own only their exact
existing witness content effect plus its fsync and existing chain flushes.
A complete-COMMIT-plus-suffix first takes COMPLETE_EXACT_EXISTING (it may fsync
the whole existing witness including the bound incomplete suffix, but removes
nothing). Then complete the bundle if needed, separately authorize suffix-only
truncation, consume/invalidate relation knowledge, and reobserve/repeat
COMPLETE_EXACT_EXISTING on the exact remaining terminal prefix. No truncation
flush can precede that initial ledger completion. Other suffix paths retain
their existing bundle → separate truncation → reclassification order.
**COMMIT is deliberately expanded** by the ledger prerequisite below, not
witness-only. Ledger publication owns only its exact transaction/storage chain; before publication
it fsyncs/verifies the exact existing PREPARE prefix and witness chain so a
visible unflushed PREPARE cannot authorize durable ledger state. No append or
truncation creates a journal/parent. No action writes a lock file, receipt,
registry, history reset or cleanup, or touches unrelated paths through U.

Restart discards memory inputs/authorities and all session-local durability
knowledge, not necessarily visible bytes. An otherwise valid complete v2 bundle
is VISIBLE_VERIFIED/EXACT_PRESENT. If a complete matching COMMIT is present,
first offer fresh-TTY COMPLETE_EXACT_EXISTING under APPEND_WITNESS_COMMIT,
then the same PERSIST_PREPARED_BUNDLE **fsync-only** completion. Otherwise the
bundle action remains first. Its exact final manifest SHA and retained bytes
are bound; both required completions precede capability/successor eligibility.
This completion may run despite drift or existing matching PREPARE/ledger/
terminal; it cannot publish stale ledger bytes or append anything. An exact
matching ledger still requires COMMIT despite drift after this prerequisite.
After consumption/reclassification the ordinary stage rules apply. Terminal
history may be inspected read-only without claiming new durability/capability.
Missing/corrupt selected bundle/capsule quarantines; partial final directories
are not exact-existing completion. Incomplete staging cannot recover an
operation; retain it and require a new operation when its inputs were lost.
Evidence completion is §3.4C's same PERSIST_ABANDON_EVIDENCE action, never an
ABANDON append side effect. Its restart also resets DURABLE_VERIFIED; even an
identical readable package must complete these flushes before append issuance.
A fresh absent-destination attempt and an exact-existing attempt bind distinct
observations; appearing equal bytes invalidate the former. No persisted
receipt is needed or permitted and no old confirmation is revived.

**COMMIT APPEND_ABSENT branch — retained V8 ledger prerequisite.** Under the matching one-use
C30-13 authority and fixed ledger-owner then witness-owner lock order:

1. Claim the instance once; verify class, action, operation, publication kind,
   bundle identity, complete classified-state digest, exact COMMIT framed-byte
   SHA, expected heads and unexpired authority.
2. Pin and verify both files and every directory descriptor/name link in the
   version-3 path union. No lookup may silently substitute a different inode.
3. Read/verify complete physical ledger bytes through that pinned descriptor,
   their length/SHA and owner-decoded transaction/tip bindings (§2.5B).
4. Fsync **that exact physical ledger file** through its pinned descriptor.
5. Fsync every verified containing ledger directory bottom-up through R **and
   U**, including reused ancestors, checking descriptor and name-link identity
   before and after each flush. A prior successful publication is no exemption.
6. Before the **first witness byte**, reverify all confirmed bytes, paths,
   witness PREPARE prefix, heads, bundle durability prerequisite, displayed
   source/configuration facts and unexpired authority. Previously observed
   stale facts are allowed here; newly changed displayed facts require discard,
   fresh observation/confirmation and a new instance, never silent rebinding.
7. Only then append the exact matching COMMIT through the pinned witness
   descriptor, fsync that witness and its complete existing chain through U,
   verify completion, consume and fully reclassify.

Ledger effects under this action are **fsync-only**: no create, content write,
append, truncate, rename, overwrite, republish or cleanup of ledger storage.
No new lock-file, receipt, registry or generic filesystem writer is permitted.
The complete observation binds these expanded effects beyond witness content;
the raw COMMIT framed-byte SHA and public witness fields do not change.
Repeat this entire ledger prerequisite even if PUBLISH_LEDGER_TRANSACTION
previously reported success. Successful final verification records the exact
post-append relation key described below in this session, not a receipt.
PERSIST_PREPARED_BUNDLE establishes bundle/existing-witness durability only,
**no ledger-durability conclusion**; its complete-COMMIT prerequisite is above.

A required ledger file/directory flush failure discards the instance, gives
DENIED_STORAGE_DURABILITY_UNAVAILABLE and prevents the first COMMIT byte.
Unavailable/unreadable observation denies; missing, wrong or changed physical
storage is never silently rebound: known integrity conflicts retain §4's
precedence/quarantine, otherwise changed displayed identities/bytes give
DENIED_DISPLAYED_FACT_DRIFT and require fresh observation. All failure paths
leave visible ledger bytes untouched and grant no capability.

**COMMIT COMPLETE_EXACT_EXISTING branch — G3-V8-P1-01.** Under the same fixed
ledger-owner then witness-owner locks, fresh version-3 branch-bound observation,
TTY confirmation and matching C30-13-issued one-use authority:

1. Claim and validate that instance once, including class/action/branch,
   operation/repository/run/kind/bundle, full classified digest, exact existing
   COMMIT framed-byte SHA, heads, displayed facts and expiry.
2. Pin and verify both full existing path chains and descriptors/name links;
   verify every selected bundle/capsule byte, physical ledger path/length/SHA and
   owner-decoded transaction/tip, PREPARE, existing COMMIT, complete prefix and
   identified suffix (if present). VISIBLE_VERIFIED is sufficient here.
3. Fsync the exact existing matching physical ledger file.
4. Fsync its full containing-directory chain bottom-up through R and U,
   including reused ancestors, with before/after pinned identity/link checks.
5. Reverify all confirmed bytes/identities/heads/facts and unexpired authority.
6. Fsync the already-existing exact witness file through its pinned descriptor,
   then its complete chain through R/U with the same checks. This flushes the
   whole file including any bound eligible suffix; no prefix-only imaginary
   fsync, reconstruction, timestamp replacement or byte write occurs.
7. Reverify the complete bound relation and expiry; record success only after
   every flush/check succeeded. No historical writer assertion is needed.
8. Consume, re-read and reclassify. Append ZERO bytes, create ZERO records,
   and do not rewrite/truncate/replace any ledger or witness content or names.

**Session-local completion key / consumers.** Only successful APPEND_ABSENT
post-append verification or COMPLETE_EXACT_EXISTING verification creates owner-
private knowledge keyed to operation/repository/run/kind, exact bundle/capsule
identity and bytes, complete physical ledger bytes/decoded tip, exact PREPARE/
COMMIT/full witness bytes (including any suffix), heads, both complete descriptor/
name-link chains and displayed current-binding facts. It excludes ephemeral
observedAt/nextAction/storage labels to avoid a self-referential key. It is not
an observation member, persisted record, bearer object or proof from a caller.
Reverify that entire key before reliance; a later relevant byte/head/path/fact
change invalidates it, including suffix truncation. Equal bytes at another inode
are different. Package-only flushes with all bound identities/bytes unchanged
do not invalidate it. Owner memory may record completion solely from successful
checks/fsync returns, never by inspecting hidden durable storage state.

Only valid same-session knowledge **plus** SEALED_VERIFIED bundle, no suffix,
all current source/checkpoint/review/qualification facts and applicable fresh-TTY
rules can satisfy capability or new-successor eligibility. Logical class 13
COMMITTED alone never suffices. This establishes durability **now**, not prior
V8 writer behavior and not authenticity for otherwise invalid data. Missing or
corrupt ledger, wrong owner encoding/transaction, conflicting heads, bad complete
frames, missing/corrupt bundle or unsupported schemas retain existing denial/
quarantine precedence; never reconstruct a ledger to legitimize a COMMIT.

Process exit discards all authorities and completion knowledge even if every
flush returned success. A new session repeats with fresh observation/TTY/authority
on unchanged readable bytes. Every required ledger **or witness** flush failure
records no success, discards the instance, leaves all existing bytes unchanged
in this no-append branch and denies capability/new successor. Earlier successful
flushes are not reusable authority. Interruption before/after any step follows
this same restart path. If machine loss removes COMMIT, the surviving valid
state follows APPEND_ABSENT; if it removes matching ledger, quarantine, not
reconstruction. Never duplicate COMMIT or ABANDON matching published ledger.
Previously observed drift permits exact completion but still blocks stale use.

### 2.6 `PRODUCTION_RUNTIME_CAPABILITY`

This is an opaque, unexported, module-private in-memory object. C30-13 is its
sole issuer. Initial issuance occurs only after the exact bootstrap transaction
and matching witness COMMIT are durable and verified, every issued bootstrap
authority instance has been consumed, and the controlling-TTY facts still
match. Reissuance after an already committed current activation requires
§2.5D's applicable durability prerequisites first; the subsequent reissuance
itself is read-only reverification and fresh TTY confirmation, not another
publication authority or witness append. If that committed activation's bound facts are stale, reissuance is
forbidden and §2.5A's successor publication and current matching COMMIT are
required first.

The actual object is required by every production provider dispatch,
authoritative ordinary ledger mutation, Git mutation, ordinary recovery
mutation, activation-dependent action and finalization boundary. It disappears
at process exit and cannot be serialized, persisted, reconstructed, copied,
passed in argv/environment, supplied by project configuration, or represented
by model output. There is no public capability schema.

C30-01 owns the session constructor and authority-object construction primitive,
but ordinary C30-01 confirmation issues evidence only. Only the C30-13 owner
path may call the primitive for A1, successor-activation publication or
production issuance. A persisted
`lcim.protocol-capability-manifest@1`, if implemented, is non-authoritative and
describes only required component/schema versions.

### 2.7 Exact API/authority matrix

| Surface | Required authority | Allowed effect |
|---|---|---|
| classify protocol/run/witness/ledger/sealed-publication-bundle state | none | read only |
| verify repository/source/semantic/guidance/configuration/routing facts | none | read only |
| compute candidates, IDs, digests, transaction and publication manifest | none | memory only |
| display the prepared operation and collect TTY observation | none | no authoritative write |
| verify ledger/witness prefixes, sealed bytes and current activation | none | read only |
| compute deterministic recovery plan or reissuance eligibility | none | read only |
| initialize genuinely absent first journal | bootstrap class INITIALIZE_WITNESS_JOURNAL only | §2.5C bounded ancestor/temp/header/no-replace publication; no frame/bundle/ledger/capability |
| persist exact terminal evidence | eligible publication class PERSIST_ABANDON_EVIDENCE only | §3.4C immutable external package publication; no append or bundle alteration |
| persist the sealed prepared bundle | matching publication authority's `PERSIST_PREPARED_BUNDLE` instance | one atomic directory persistence mutation only |
| append PREPARE | matching publication authority's `APPEND_WITNESS_PREPARE` instance | one exact frame append/fsync only |
| publish canonical transaction | matching publication authority's `PUBLISH_LEDGER_TRANSACTION` instance | one exact ledger transaction mutation only |
| append absent COMMIT or complete exact existing COMMIT relation | matching publication authority's `APPEND_WITNESS_COMMIT` instance; closed version-3 observation and commitBranch | §2.5D ledger-file/full-chain fsync then witness durability; APPEND_ABSENT alone appends exact bytes; COMPLETE_EXACT_EXISTING is fsync-only on both files/chains, ZERO bytes/records; same-session knowledge only after all checks |
| truncate an identified incomplete suffix | matching publication authority's `TRUNCATE_INCOMPLETE_FINAL_FRAME` instance | one exact truncation/fsync only; then reclassify |
| append terminal ABANDON | matching publication authority's `APPEND_WITNESS_ABANDON` instance after matching durable evidence verifies | one exact frame append/fsync only; no evidence writes |
| production provider/Git/ordinary-ledger/recovery/activation/finalization operation | matching actual production-capability object | declared production effect |

Production APIs reject fixture, either publication-authority class, serialized,
copied, configured and model-produced values. A0 and ordinary capability-
absent **runtime** APIs are read-only except the exact one-action transaction-zero
and successor-publication instances in §§2.5 and 2.5A. This is not a prohibition
on separately authorized external development/source administration (§§7–8).

**Separate external source-administration boundary.** The operator-controlled
external owner, not the unfinished LCIM runtime or a publication authority,
constructs isolated candidates, creates/verifies development checkouts, records
source-only admission/consumed-generation evidence, writes named immutable
preparation/proof outputs and, only with qualification and separate operator
authorization, publishes source-registry successors under lock/CAS. These are
explicit development effects under §7's phase predicates, never runtime ledger,
witness, session, finding, accounting or capability records. Prepare/verify
are read-only with respect to source/index/refs, **not** their explicitly named
external output writes. Developer Git commits are operator-only; source-registry
publication is a separate authorization; neither is runtime witness COMMIT.
No runtime action in the table grants those external permissions.

C30-01 owns construction guards with this exact stale-fact distinction.
§2.5D's confirmed metadata-only exact-existing completion is evaluated **before**
these ordinary stage rules; it is not stale candidate/ledger publication:

1. Before ledger publication, expired or drifted facts deny
   `APPEND_WITNESS_PREPARE` for stale bytes,
   `PUBLISH_LEDGER_TRANSACTION` for stale bytes and any production-capability
   issuance.
2. When no ledger transaction exists, those facts may authorize only the narrow
   exact terminalization path: fresh-TTY PERSIST_ABANDON_EVIDENCE, consume and
   reverify durable evidence/current heads, then a separately confirmed and
   issued APPEND_WITNESS_ABANDON. Evidence persistence is only its prerequisite,
   never stale PREPARE, stale ledger publication or capability issuance.
3. When exact matching physical ledger bytes are visible at the current tip,
   previously observed drift does not deny `APPEND_WITNESS_COMMIT`. Its closed
   version-3 observation authorizes §2.5D's ledger-file/full-chain fsync
   prerequisite **before the first witness byte** for APPEND_ABSENT, or ledger-
   then-witness fsync-only COMPLETE_EXACT_EXISTING on a complete COMMIT prefix.
   The latter precedes bundle/suffix flushes and may use VISIBLE_VERIFIED;
   neither historical writer proof nor ledger durability precedes issuance.
   Do not require ledger durability before issuing its completion action;
   newly changed displayed facts discard the instance and require fresh confirmation.
4. After that COMMIT, drift requires C30-13's
   `SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY` path.
5. Integrity mismatch quarantines and never authorizes ABANDON or COMMIT.

C30-13 remains the sole issuer of transaction-zero bootstrap-authority
instances, successor-activation publication-authority instances and production
capability.

### 2.8 Publication recovery and terminal outcomes

After a crash, production capability and every prior action authority are
absent. Recovery uses only the closed read-only surface to re-read and classify
the witness/ledger/sealed-bundle state under §4 precedence, verifies every
stored artifact byte/length/SHA-256/ID/digest and identity binding, and displays
exactly one proposed action. Every recovery mutation requires fresh
controlling-TTY confirmation and a newly issued action-specific authority of
the matching publication class. After its one mutation, the instance is
consumed and full reclassification occurs before any further authority issues.

A recovery authority can never regenerate or change candidate/transaction
bytes, either digest identity, operation, predecessor, source identity or
sequence. These mutually exclusive states are normative after the §2.5D durability
priority prerequisites: complete COMMIT without session relation knowledge first
offers COMPLETE_EXACT_EXISTING, even with a VISIBLE_VERIFIED bundle or eligible
suffix. Then complete the bundle; separately truncate a suffix and repeat relation
completion if necessary. Without complete COMMIT, VISIBLE_VERIFIED first offers
PERSIST_PREPARED_BUNDLE fsync-only completion, not B1/B2 authorization. Every
“sealed bundle verifies” below means capsule-verified **and** SEALED_VERIFIED:

| Classified publication state | Sole result / next action |
|---|---|
| no controlling TTY | `DENIED_NO_CONTROLLING_TTY`; append nothing; this is not an ABANDON reason |
| operator decline | `DENIED_OPERATOR_DECLINED`; append nothing; this is not an ABANDON reason |
| confirmation timeout | `DENIED_CONFIRMATION_TIMEOUT`; append nothing; this is not an ABANDON reason |
| displayed bytes/heads change after confirmation | `DENIED_DISPLAYED_FACT_DRIFT`; discard authority and reclassify |
| **B1 — current sealed bundle, empty witness:** exact sealed bundle exists and verifies; no complete witness frame exists for the operation; no incomplete witness bytes remain; no ledger transaction exists; expected ledger/witness heads match; bundle is unexpired; all bound source/semantic/guidance/configuration/routing/plan/budget facts remain current | in the uninterrupted process the still-current original TTY-confirmed operation may continue; after process loss/restart fresh TTY is mandatory; C30-13 issues exactly one `APPEND_WITNESS_PREPARE` instance; append/fsync exactly one §3.4B reconstructed PREPARE, consume, re-read and reclassify; no ledger or COMMIT mutation under that instance |
| **B2 — stale or expired sealed bundle, empty witness:** exact sealed bundle exists and verifies; no complete witness frame exists for the operation (and therefore no PREPARE); no incomplete bytes remain; no ledger transaction exists; expected heads match; bundle is expired or at least one bound source/semantic/guidance/configuration/routing/plan/budget fact drifted | publish no stale candidate/transaction bytes; follow §3.4C: first separately confirmed PERSIST_ABANDON_EVIDENCE, consume/reverify; only matching DURABLE_VERIFIED evidence permits a separately confirmed APPEND_WITNESS_ABANDON for the exact direct frame (preparedFrameDigest null); consume/reclassify |
| PREPARE exists; ledger absent; exact sealed bundle valid; bundle and all bound facts current | after fresh TTY, issue exactly one `PUBLISH_LEDGER_TRANSACTION` instance for exact stored `canonical-transaction.jcs`; publish only that transaction, consume, then reclassify before any COMMIT authority |
| PREPARE exists; ledger absent; exact sealed bundle valid; bundle expired or any bound fact drifted | publish no stale bytes; §3.4C first persists exact PREPARE-bound evidence under its own confirmed PERSIST_ABANDON_EVIDENCE instance; consume/reverify; separately confirmed APPEND_WITNESS_ABANDON only with matching durable evidence and still-eligible heads; consume/reclassify |
| exact matching physical ledger transaction is visible; COMMIT absent | after fresh TTY and version-3 byte/path/head verification, issue exactly one APPEND_WITNESS_COMMIT; repeat §2.5D pinned ledger-file/full-chain fsync prerequisite, recheck, then append/fsync exact matching witness COMMIT even with previously observed drift; failure prevents the first COMMIT byte; drift blocks capability and requires §2.5A after COMMIT |
| matching COMMIT already exists | report logical COMMITTED read-only; absent exact session knowledge offers fresh-TTY APPEND_WITNESS_COMMIT/COMPLETE_EXACT_EXISTING before bundle or suffix flushes; ZERO appended bytes; consume/reclassify, complete remaining prerequisites under §2.5D, then separate current-fact/qualification/TTY consumer checks |
| matching ABANDON already exists | `ABANDONED`; return existing abandoned result and append nothing |
| mismatched transaction, competing head/identity, missing/corrupt bundle, invalid complete frame or different durable bytes | quarantine under the cause-specific §4 integrity result; append nothing; never ABANDON or COMMIT an integrity failure |

The B1 authority binds `bootstrapOperationId`, `publicationBundleDigest`, the
empty-witness classified-state digest, expected ledger head, expected witness
head, §3.4B prepareFramedByteDigest, expiry and authority instance ID.
It authorizes only that one PREPARE append/fsync. B2 first binds/publishes the
§3.4C evidence package under its own instance. Only afterward does the B2 append
instance bind exact direct-ABANDON frame bytes and authorize only that append/fsync.

After an identified incomplete first operation frame is truncated to the
verified prefix with no frames for this operation (retaining the header and
any prior-operation frames), the truncation authority is consumed and no additional mutation
occurs. The controller re-reads the exact sealed bundle and current facts and
must enter exactly B1 or B2. No third empty-witness state is permitted.

ABANDON is terminal. After B2 or a stale PREPARE/no-ledger transaction-zero
operation reaches durable ABANDON, a new transaction-zero attempt is permitted
only with a new `bootstrapOperationId`, new `candidateSetDigest` and new
`publicationBundleDigest`. Its ledger predecessor is unchanged because no
ledger transaction was published; its witness predecessor is the durable
ABANDON head. Direct empty-witness ABANDON is not a COMMIT and creates no ledger
transaction. The old operation/bundle can never be reused. A successor
publication abandoned before ledger similarly requires a new successor
operation and preserves the current ledger predecessor.

If the exact matching ledger transaction already exists, ABANDON is forbidden:
recovery completes COMMIT despite drift. A stale transaction-zero or successor
COMMIT then enters §2.5A; it is never erased. Exact valid tails are never mapped
to corruption, and structural/durable identity corruption has precedence over
recovery eligibility.

## 3. Six valid closed local-authority schema contracts

### 3.0 Common validation, identity and lifecycle rules

All six families are strict closed JSON objects. Every common field and every
family-specific field listed below is required. No additional/unknown property
is accepted. The universal forbidden names are `capability`,
`productionCapability`, `bootstrapAuthority`, `fixtureAuthority`, `privateKey`,
`credential`, `token`, `signature`, `signedGrant` and `remoteAuthority`; because
the schemas are closed, these and every other unlisted name are rejected.
Duplicate JSON keys, invalid Unicode, non-NFC strings, non-integer JSON numbers,
unknown enum values, unknown schema names and unknown/future versions are
rejected before identity computation.

Common required fields:

| Field | Exact type and constraint |
|---|---|
| `schemaName` | family literal named by the subsection |
| `schemaVersion` | integer literal `1` |
| `recordKind` | family literal named by the subsection |
| `recordId`, `generationId` | string matching `^rec_[0-9a-f]{64}$`; values must be equal |
| `recordDigest` | string matching `^[0-9a-f]{64}$` |
| `predecessorGenerationId`, `expectedCurrentHead` | both null at that family's genesis; otherwise both `^rec_[0-9a-f]{64}$` and equal to the unique prior current generation |
| `operationId` | string matching `^op_[0-9a-f]{32}$` |

Shared exact scalar types are: digest = `^[0-9a-f]{64}$`; Git object ID =
`^(?:[0-9a-f]{40}|[0-9a-f]{64})$`; repository ID =
`^repo_[0-9a-f]{64}$`; run ID = `^run_[0-9a-f]{32}$`; source-generation ID =
`^srcgen_[0-9a-f]{64}$`; timestamp =
`^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$`
and must be a real UTC instant; count = integer 0..9007199254740991.
Strings not otherwise constrained are NFC UTF-8, 1..1024 bytes. Arrays retain
listed order and are closed, duplicate-free, and at most 4096 entries.

The six `json` fences in §§3.1–3.6 are the authoritative examples. Each fence
is one physical UTF-8 line with no insignificant whitespace or duplicate key.
For these examples every object key and string value is ASCII and every number
is an integer. RFC 8785's UTF-16 member-name order therefore equals Python's
`sort_keys=True` order for these keys, and no floating-point or non-ASCII
escaping rule can differ. Consequently recursive `json.dumps(value,
ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)`
is byte-equivalent to the required JCS serialization for these six examples;
arrays retain their displayed semantic order.

For family `F`, `P` is exact RFC 8785/JCS UTF-8 of the complete object after
removing exactly `recordId`, `recordDigest` and `generationId`; `recordId =
"rec_" + hex(SHA-256(ID_DOMAIN || P))`; that value is inserted into both
`recordId` and `generationId`; `Q` is exact JCS UTF-8 after removing only
`recordDigest`; and `recordDigest = hex(SHA-256(DIGEST_DOMAIN || Q))`. There is
no activation-family insertion exception: the final activation already
contains `candidateSetKind` and `candidateSetDigest` before these ordinary family
preimages are computed. No other common or family field is excluded. Domain strings are
literal UTF-8 including the final NUL byte denoted `\0`.

Publication is under the family owner's lock with expected-current-head CAS.
The replay rule is identical in every mirror:

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
committed witness or ledger evidence proves that conflict. An ordinary reused
operation ID with different request bytes is denied, not quarantined, when that
durable integrity evidence does not exist.

The remaining common lifecycle is: failed expected-current-head CAS is
`DENIED_CURRENT_HEAD_CONFLICT`; competing current heads are
`INTEGRITY_QUARANTINE`; a valid successor supersedes exactly its predecessor;
only the unique valid unreplaced head is current; bound-fact drift invalidates
current use but never edits history and requires a CAS successor; and an
unknown/future version is `DENIED_UNKNOWN_SCHEMA_VERSION` and requires a
reviewed new family version, consumer update and ICR.

The exact consumer matrix is normative:

| Family | Owner / first emitter | Exact consumers | Recovery owner |
|---|---|---|---|
| `lcim.local-operator-session@1` | C30-01 constructor, published in the C30-13 transaction-zero or successor-activation transaction | C30-02 plan; C30-03 ledger/bootstrap precheck; C30-05 accounting; C30-07 provider/review; C30-10 barriers; C30-11 operator checkpoint; C30-12 recovery/audit; C30-13 activation; C30-14 delivery; all production API guards | C30-01 semantics; C30-12 inspects; C30-13 reissues authority |
| `lcim.local-plan-confirmation@1` | C30-02 constructor, published in the C30-13 transaction-zero or successor-activation transaction | C30-03 ledger; C30-04 Git; C30-05 accounting; C30-06 artifacts; C30-07 provider/review; C30-08 findings; C30-09 repairs; C30-10 barriers; C30-11 operator checkpoint; C30-12 recovery/audit; C30-13 activation; C30-14 delivery | C30-02 semantics; C30-12 inspects |
| `lcim.local-budget-ceiling@1` | C30-05 constructor, published in the C30-13 transaction-zero or successor-activation transaction | C30-05 accounting; C30-07 provider/review; C30-08 findings; C30-09 repairs; C30-10 barriers; C30-11 operator checkpoint; C30-12 recovery/audit; C30-13 activation; C30-14 delivery | C30-05 semantics; C30-12 reconstructs counts |
| `lcim.local-consistency-witness@1` | C30-03; C30-13 transaction-zero and successor PREPARE/terminal frames bind their private publication-bundle digest | C30-03 controller ledger; C30-05 accounting; C30-08 findings; C30-09 repairs; C30-10 barriers; C30-11 operator checkpoint; C30-12 recovery/audit; C30-13 activation; C30-14 delivery | C30-03 semantics; C30-12 verifies exact sealed bytes/classifies; C30-13 alone issues both classes of one-action recovery authority |
| `lcim.local-activation-settlement@1` | C30-13; transaction-zero and successor candidates bind only their domain-separated `candidateSetDigest` and `candidateSetKind` | C30-12 recovery/audit/reissue inspection; C30-13 activation/capability issuance; C30-14 manual-delivery finalization | C30-13; C30-12 read-only inspection; receipt relates the later transaction/private publication identity without inserting it |
| `lcim.manual-delivery-manifest@1` | C30-14 | C30-12 recovery/audit inspection; C30-13 activation-dependent consistency; C30-14 manual-delivery finalization; human delivery operator | C30-14; C30-12 read-only inspection |

### 3.1 `lcim.local-operator-session@1`

ID domain: `LCIM-LOCAL-OPERATOR-SESSION-ID-v1\0`. Digest domain:
`LCIM-LOCAL-OPERATOR-SESSION-DIGEST-v1\0`. `recordKind` is
`LOCAL_OPERATOR_SESSION`.

In addition to common fields, all and only these fields are required:

| Field | Exact type / value |
|---|---|
| `repositoryId`, `runId`, `reviewedSourceGenerationId` | shared ID patterns |
| `sourceCommit`, `sourceTree` | Git object ID |
| `planDeclarationDigest`, `semanticContractDigest`, `activeGuidanceDigest`, `configurationDigest`, `modelRoutingDigest`, `budgetCeilingDigest` | digest |
| `budgetCeilingGenerationId` | record ID |
| `intendedOperation` | `START`, `RESUME`, `RECOVER`, `ACTIVATE`, `FINALIZE` or `PREPARE_DELIVERY` |
| `controllerProcessId` | `^pid_[1-9][0-9]{0,19}$` |
| `controllerSessionId` | `^session_[0-9a-f]{32}$` |
| `ttyConfirmationOperationId` | operation ID; at bootstrap equals `operationId` |
| `observedAt` | timestamp |
| `authorityClass` | `GENESIS_ACTIVATION_BOOTSTRAP_AUTHORITY`, `SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY` or `PRODUCTION_RUNTIME_CAPABILITY` |

```json
{"activeGuidanceDigest":"0000000000000000000000000000000000000000000000000000000000000000","authorityClass":"GENESIS_ACTIVATION_BOOTSTRAP_AUTHORITY","budgetCeilingDigest":"0000000000000000000000000000000000000000000000000000000000000000","budgetCeilingGenerationId":"rec_0000000000000000000000000000000000000000000000000000000000000000","configurationDigest":"0000000000000000000000000000000000000000000000000000000000000000","controllerProcessId":"pid_1","controllerSessionId":"session_00000000000000000000000000000000","expectedCurrentHead":null,"generationId":"rec_0000000000000000000000000000000000000000000000000000000000000000","intendedOperation":"ACTIVATE","modelRoutingDigest":"0000000000000000000000000000000000000000000000000000000000000000","observedAt":"2026-03-09T00:00:00.000Z","operationId":"op_00000000000000000000000000000000","planDeclarationDigest":"0000000000000000000000000000000000000000000000000000000000000000","predecessorGenerationId":null,"recordDigest":"0000000000000000000000000000000000000000000000000000000000000000","recordId":"rec_0000000000000000000000000000000000000000000000000000000000000000","recordKind":"LOCAL_OPERATOR_SESSION","repositoryId":"repo_0000000000000000000000000000000000000000000000000000000000000000","reviewedSourceGenerationId":"srcgen_0000000000000000000000000000000000000000000000000000000000000000","runId":"run_00000000000000000000000000000000","schemaName":"lcim.local-operator-session","schemaVersion":1,"semanticContractDigest":"0000000000000000000000000000000000000000000000000000000000000000","sourceCommit":"0000000000000000000000000000000000000000","sourceTree":"0000000000000000000000000000000000000000","ttyConfirmationOperationId":"op_00000000000000000000000000000000"}
```

Genesis is the first session for a repository/run. A later TTY-confirmed
session supersedes it. Repository/source/digest/process/session/TTY drift is
cause-specifically `DENIED_BOUND_FACT_DRIFT`; TTY absence, decline and timeout
use the §2.8 codes. The record is evidence, never authority.

### 3.2 `lcim.local-plan-confirmation@1`

ID domain: `LCIM-LOCAL-PLAN-CONFIRMATION-ID-v1\0`. Digest domain:
`LCIM-LOCAL-PLAN-CONFIRMATION-DIGEST-v1\0`. `recordKind` is
`LOCAL_PLAN_CONFIRMATION`.

Additional required fields:

| Field | Exact type / value |
|---|---|
| `repositoryId`, `runId`, `reviewedSourceGenerationId` | shared ID patterns |
| `sourceCommit`, `sourceTree` | Git object ID |
| `planDeclarationDigest`, `semanticContractDigest`, `activeGuidanceDigest`, `configurationDigest`, `modelRoutingDigest`, `budgetCeilingDigest`, `operatorSessionDigest` | digest |
| `budgetCeilingGenerationId`, `operatorSessionGenerationId` | record ID |
| `ttyConfirmationOperationId` | operation ID; at bootstrap equals `operationId` |
| `confirmedAt` | timestamp |
| `status` | literal `CONFIRMED` |

```json
{"activeGuidanceDigest":"0000000000000000000000000000000000000000000000000000000000000000","budgetCeilingDigest":"0000000000000000000000000000000000000000000000000000000000000000","budgetCeilingGenerationId":"rec_0000000000000000000000000000000000000000000000000000000000000000","configurationDigest":"0000000000000000000000000000000000000000000000000000000000000000","confirmedAt":"2026-03-09T00:00:00.000Z","expectedCurrentHead":null,"generationId":"rec_1111111111111111111111111111111111111111111111111111111111111111","modelRoutingDigest":"0000000000000000000000000000000000000000000000000000000000000000","operationId":"op_00000000000000000000000000000000","operatorSessionDigest":"0000000000000000000000000000000000000000000000000000000000000000","operatorSessionGenerationId":"rec_0000000000000000000000000000000000000000000000000000000000000000","planDeclarationDigest":"0000000000000000000000000000000000000000000000000000000000000000","predecessorGenerationId":null,"recordDigest":"1111111111111111111111111111111111111111111111111111111111111111","recordId":"rec_1111111111111111111111111111111111111111111111111111111111111111","recordKind":"LOCAL_PLAN_CONFIRMATION","repositoryId":"repo_0000000000000000000000000000000000000000000000000000000000000000","reviewedSourceGenerationId":"srcgen_0000000000000000000000000000000000000000000000000000000000000000","runId":"run_00000000000000000000000000000000","schemaName":"lcim.local-plan-confirmation","schemaVersion":1,"semanticContractDigest":"0000000000000000000000000000000000000000000000000000000000000000","sourceCommit":"0000000000000000000000000000000000000000","sourceTree":"0000000000000000000000000000000000000000","status":"CONFIRMED","ttyConfirmationOperationId":"op_00000000000000000000000000000000"}
```

The first confirmation is genesis. Repository/source/plan/semantic/guidance/
configuration/routing/budget/session drift is `DENIED_BOUND_FACT_DRIFT` and
requires a C30-02 successor after a new TTY confirmation.

### 3.3 `lcim.local-budget-ceiling@1`

ID domain: `LCIM-LOCAL-BUDGET-CEILING-ID-v1\0`. Digest domain:
`LCIM-LOCAL-BUDGET-CEILING-DIGEST-v1\0`. `recordKind` is
`LOCAL_BUDGET_CEILING`.

Additional required fields:

| Field | Exact type / value |
|---|---|
| `repositoryId`, `runId`, `sourceGenerationId` | shared ID patterns |
| `planDeclarationDigest`, `configurationDigest`, `modelRoutingDigest` | digest |
| `ceilings` | exactly six closed entries in the order shown in the example; every entry has only `requestClass` (the corresponding literal) and `confirmedCeiling` (integer 0..9007199254740991); no duplicate class |
| `ttyConfirmationOperationId` | operation ID; at bootstrap equals `operationId` |
| `reason` | `INITIAL`, `INCREASE` or `DECREASE` |
| `observedAt` | timestamp |

```json
{"ceilings":[{"confirmedCeiling":0,"requestClass":"FLASH_IMPLEMENTATION"},{"confirmedCeiling":0,"requestClass":"FLASH_REPAIR"},{"confirmedCeiling":0,"requestClass":"SOL_CONTRACT_CHECK"},{"confirmedCeiling":0,"requestClass":"SOL_DIAGNOSE"},{"confirmedCeiling":0,"requestClass":"SOL_RECHECK"},{"confirmedCeiling":0,"requestClass":"SOL_FINAL_REVIEW"}],"configurationDigest":"0000000000000000000000000000000000000000000000000000000000000000","expectedCurrentHead":null,"generationId":"rec_0000000000000000000000000000000000000000000000000000000000000000","modelRoutingDigest":"0000000000000000000000000000000000000000000000000000000000000000","observedAt":"2026-03-09T00:00:00.000Z","operationId":"op_00000000000000000000000000000000","planDeclarationDigest":"0000000000000000000000000000000000000000000000000000000000000000","predecessorGenerationId":null,"reason":"INITIAL","recordDigest":"0000000000000000000000000000000000000000000000000000000000000000","recordId":"rec_0000000000000000000000000000000000000000000000000000000000000000","recordKind":"LOCAL_BUDGET_CEILING","repositoryId":"repo_0000000000000000000000000000000000000000000000000000000000000000","runId":"run_00000000000000000000000000000000","schemaName":"lcim.local-budget-ceiling","schemaVersion":1,"sourceGenerationId":"srcgen_0000000000000000000000000000000000000000000000000000000000000000","ttyConfirmationOperationId":"op_00000000000000000000000000000000"}
```

Under the owner-verified run lock, for each class:

```text
availableCredits = confirmedCeiling
                 - definitelyChargeableCount
                 - possiblyChargeableCount
                 - outstandingReservedCount
```

Reserve exactly one credit only when availability is at least one. Otherwise
return `DENIED_BUDGET_CEILING_EXCEEDED`. `NEVER_CHARGEABLE` releases;
`POSSIBLY_CHARGEABLE` and `DEFINITELY_CHARGEABLE` permanently consume one.
Uncertainty never restores credit. Settlement replay returns the existing
settlement; conflicting settlement is `DENIED_REQUEST_SETTLEMENT_CONFLICT`.

Genesis and an increase require fresh TTY confirmation. A decrease is accepted
only when every new ceiling is at least definitely + possibly + outstanding;
otherwise `DENIED_CEILING_BELOW_CONSUMED_OR_RESERVED`. Bound drift denies
dispatch with `DENIED_BOUND_FACT_DRIFT` until a valid successor exists.

### 3.4 `lcim.local-consistency-witness@1`

ID domain: `LCIM-LOCAL-CONSISTENCY-WITNESS-ID-v1\0`; record-digest domain:
`LCIM-LOCAL-CONSISTENCY-WITNESS-DIGEST-v1\0`; frame-digest domain:
`LCIM-LOCAL-CONSISTENCY-WITNESS-FRAME-v1\0`; head-digest domain:
`LCIM-LOCAL-CONSISTENCY-WITNESS-HEAD-v1\0`. `recordKind` is
`LOCAL_CONSISTENCY_WITNESS_FRAME`.

Additional required fields:

| Field | Exact type / value |
|---|---|
| `journalId` | `^journal_[0-9a-f]{64}$` |
| `repositoryId`, `runId` | shared ID patterns |
| `sequence` | integer 0..9007199254740991; starts at 0 and increments by one |
| `frameKind` | `PREPARE`, `COMMIT` or `ABANDON` |
| `predecessorWitnessHead` | null only at sequence 0; otherwise digest |
| `expectedPredecessorLedgerHead` | digest; 64 zeroes only for transaction-zero genesis |
| `expectedLedgerSequence` | integer 0..9007199254740991 |
| `intendedTransactionId` | `^lcim_tx_[0-9a-f]{64}$` |
| `intendedTransactionDigest`, `publicationBundleDigest` | digest; for transaction-zero or successor PREPARE/terminal frames the latter is the applicable private publication-envelope identity |
| `preparedFrameDigest` | null for PREPARE; exact matching PREPARE `frameDigest` for COMMIT; for ABANDON, null only when directly terminalizing a sealed bundle with no durable PREPARE, otherwise the exact matching PREPARE `frameDigest` |
| `terminalReason` | null for PREPARE/COMMIT; for ABANDON, one non-null exact closed reason literal listed below |
| `terminalReasonEvidenceDigest` | null for PREPARE/COMMIT; for ABANDON, a non-null digest computed below |
| `observationId` | `^obs_[0-9a-f]{32}$` |
| `observedAt` | timestamp |
| `frameDigest`, `headDigest` | digest |

```json
{"expectedCurrentHead":null,"expectedLedgerSequence":0,"expectedPredecessorLedgerHead":"0000000000000000000000000000000000000000000000000000000000000000","frameDigest":"0000000000000000000000000000000000000000000000000000000000000000","frameKind":"PREPARE","generationId":"rec_0000000000000000000000000000000000000000000000000000000000000000","headDigest":"0000000000000000000000000000000000000000000000000000000000000000","intendedTransactionDigest":"0000000000000000000000000000000000000000000000000000000000000000","intendedTransactionId":"lcim_tx_0000000000000000000000000000000000000000000000000000000000000000","journalId":"journal_0000000000000000000000000000000000000000000000000000000000000000","observationId":"obs_00000000000000000000000000000000","observedAt":"2026-03-09T00:00:00.000Z","operationId":"op_00000000000000000000000000000000","predecessorGenerationId":null,"predecessorWitnessHead":null,"preparedFrameDigest":null,"publicationBundleDigest":"0000000000000000000000000000000000000000000000000000000000000000","recordDigest":"0000000000000000000000000000000000000000000000000000000000000000","recordId":"rec_0000000000000000000000000000000000000000000000000000000000000000","recordKind":"LOCAL_CONSISTENCY_WITNESS_FRAME","repositoryId":"repo_0000000000000000000000000000000000000000000000000000000000000000","runId":"run_00000000000000000000000000000000","schemaName":"lcim.local-consistency-witness","schemaVersion":1,"sequence":0,"terminalReason":null,"terminalReasonEvidenceDigest":null}
```

`frameDigest` is SHA-256(frame domain || JCS of the complete object excluding
exactly `recordId`, `recordDigest`, `generationId`, `frameDigest` and
`headDigest`). `headDigest` is SHA-256(head domain || (64 zero bytes for
sequence 0, otherwise decoded `predecessorWitnessHead`) || decoded
`frameDigest`). These are computed before the common record ID/digest.
PREPARE and its terminal frame have identical operation/transaction/
publication-bundle/predecessor-ledger/expected-sequence facts. COMMIT and a
PREPARE-bound ABANDON name the exact PREPARE frame digest; direct sealed-bundle/
no-PREPARE ABANDON is the sole null exception. For both publication kinds, PREPARE construction and reconstruction use only
§3.4B's exhaustive field-source table, after the kind-specific publication
identity has been inserted into the manifest. There is no stored PREPARE file;
append/durability time belongs to the receipt. A matching COMMIT is constructed from the durable exact PREPARE, stored
transaction bytes and classified heads. A PREPARE/no-ledger ABANDON is likewise
bound to that exact PREPARE; a sealed-bundle/no-PREPARE ABANDON is constructed
directly from the current witness head and has `preparedFrameDigest = null`.
Recovery never varies the operation, transaction, publication-bundle or
available PREPARE binding.

The frame-kind rules are exact:

- PREPARE: `terminalReason = null`, `terminalReasonEvidenceDigest = null`, and
  `preparedFrameDigest = null`.
- COMMIT: `terminalReason = null`, `terminalReasonEvidenceDigest = null`, and
  `preparedFrameDigest` is the exact matching PREPARE frame digest.
- ABANDON: `terminalReason` is non-null in the closed enum below,
  `terminalReasonEvidenceDigest` is a non-null SHA-256 digest,
  `publicationBundleDigest` is non-null, and `preparedFrameDigest` is null only
  for direct sealed-bundle/no-PREPARE terminalization; otherwise it is the exact
  matching PREPARE frame digest for a PREPARE/no-ledger operation.

The required `terminalReason` vocabulary and deterministic simultaneous-cause
precedence are, in exact first-true order:

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

`observedCauseSet` is a non-empty ordered array in that same precedence order,
contains every true cause and no unknown value, and selects its first element
as `terminalReason`. It binds the complete observed cause set, not only the
selected first cause. Freeze:

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

`preparedBindingDigest` and `currentBindingDigest` are defined completely in
§3.4A; its retained inputs and comparisons are normative. Both terminal fields are
required members of every canonical witness payload. Therefore they are bound
by the witness record-ID and record-digest preimages, the frame-digest preimage
and raw 32-byte frame digest; through that `frameDigest` they are included in
the head digest preimage and bound by `headDigest`; replay compares
the exact canonical bytes including both fields, and recovery evidence includes
them.

Integrity failures never become ABANDON reasons. A missing/corrupt bundle,
mismatched transaction, competing head, bad frame or different durable bytes
quarantines. No controlling TTY, operator decline or confirmation timeout is a
cause-specific pause with no mutation and is not an ABANDON reason. All exact
recovery and quarantine outcomes are in §4.

### 3.4A Closed binding snapshots and ABANDON evidence

`preparedBindingSnapshot` and `currentBindingSnapshot` use exactly this shared
shape. All listed members are required, unknown members forbidden recursively.
Use §3.0 types; no null except budgetPredecessor. There is no serialized role
member, capability, credential, secret, terminal field, witness head or digest
of the containing snapshot.

| Literal member | Type | Prepared source | Currently observed source |
|---|---|---|---|
| `operationId`, `repositoryId`, `runId` | §3.0 IDs | verified manifest (map bootstrapOperationId when needed) | same immutable operation/repository/run, verified against observation context; a mismatch is integrity failure, not drift |
| `publicationKind` | TRANSACTION_ZERO or SUCCESSOR_ACTIVATION | verified manifest | same immutable manifest kind |
| `createdAt`, `expiresAt` | timestamps, createdAt < expiresAt | immutable manifest | identical values, not new clock readings |
| `reviewedSourceGenerationId` | source ID | manifest | current unique verified source-checkpoint registry generation at observedAt |
| `sourceCommit`, `sourceTree` | Git IDs | manifest | commit/tree of that currently verified source generation |
| `semanticContractDigest`, `activeGuidanceDigest`, `configurationDigest`, `modelRoutingDigest`, `planDeclarationDigest` | digests | manifest values, cross-checked to §2.3A candidates | identity-checked current semantic contract, active guidance, effective configuration, locked routing and plan-declaration inputs at observedAt, respectively |
| `budgetPredecessor` | null or complete closed §3.3 record | manifest's pre-operation current budget record (null only if none) | unique current committed budget before this operation, or null if none; exclude this operation's own exact transaction even after publication |

The only nested array is the six-entry budget `ceilings`, with §3.3 literal
requestClass order, bounds and no duplicate class; the entire nested record
obeys §§3.0/3.3, including its IDs/domains, CAS and all required members. Do not
compare an unpublished proposed budget's ID to its predecessor: the candidate
budget is authenticated by the bundle; these snapshots compare its expected
predecessor to the current predecessor. Any intervening confirmed budget
successor (including a ceiling change with the same plan/source) causes drift.
After this operation publishes, exclude only its own exact four/five candidates
when determining the pre-operation heads; another operation is never excluded.

The observedAt used for comparison is one retained §3.0 UTC instant, at least
createdAt, sampled by the read-only classifier with locked/identity-checked
inputs. Failed observation, ambiguous current heads, missing required evidence
or corrupt bytes quarantine or deny classification; never substitute null or
all-zero values to force a drift reason. The five current digest values are
**copied identities**, not new snapshot helpers: retain their exact owner
input bytes and identity computation evidence. For the first four binding fields,
the digest is lowercase hex SHA-256 of the exact retained non-secret owner
input byte string, with no domain prefix, exclusions or implicit reserialization:
semanticContractDigest uses the semantic-contract input bytes;
activeGuidanceDigest uses the active-guidance-universe input bytes;
configurationDigest uses the resolved configuration input bytes (not credential
values or unresolved environment references); modelRoutingDigest uses the
locked routing input bytes. For planDeclarationDigest preserve C30-02's **existing**
Local plan confirmation formula: lowercase hex SHA-256 of
ASCII(`LCIM-PLAN-DECLARATION-v1`) || 00 || the exact retained canonical JCS
plan-declaration payload bytes supplied by C30-02. Do not replace that domain
with a raw-byte hash. The payload is that owner-supplied byte string, not a
new snapshot helper or a reconstruction from current configuration.
Each input is a nonempty finite octet string of at most the §3.0
count bound, captured before preparing candidates and recaptured from the same
owner surface for current observation. The byte-string identity is the boundary
here, not a second undefined JSON helper or a hash-pattern-only assertion. If
an owner internally serializes multiple files, the **exact serialized stream
it supplied to the candidate constructor** is retained; do not invent a new
serialization when verifying that stream. Its currentness additionally requires
the §7 owner/source checks; a correct SHA alone does not prove currentness.
The nested budget uses its **different**, explicitly domain-separated public
record identity formulas in §§3.0/3.3. Source generation/commit/tree verification uses the Bootstrap V2
checkpoint and current-successor checks in §7; budget record identities use
§§3.0/3.3. No input is accepted merely because its string matches a hash pattern.

Freeze the two formulas with no exclusions, lowercase hex output:

```text
preparedBindingDigest = hex(SHA-256(ASCII("LCIM-WITNESS-PREPARED-BINDING-v1") || hex(00) || JCS(preparedBindingSnapshot)))
currentBindingDigest = hex(SHA-256(ASCII("LCIM-WITNESS-CURRENT-BINDING-v1") || hex(00) || JCS(currentBindingSnapshot)))
```

Let P/C denote the two verified objects, and t the observedAt instant. The eight
Boolean tests, in the existing order, are exactly:

1. PUBLICATION_BUNDLE_EXPIRED iff `t >= P.expiresAt` (equality is expired;
   `createdAt <= t < expiresAt` is unexpired).
2. REVIEWED_SOURCE_IDENTITY_DRIFT iff any of reviewedSourceGenerationId,
   sourceCommit or sourceTree differs between P and C.
3. SEMANTIC_CONTRACT_DRIFT iff semanticContractDigest differs.
4. ACTIVE_GUIDANCE_DRIFT iff activeGuidanceDigest differs.
5. CONFIGURATION_DRIFT iff configurationDigest differs.
6. MODEL_ROUTING_DRIFT iff modelRoutingDigest differs.
7. PLAN_DECLARATION_DRIFT iff planDeclarationDigest differs.
8. BUDGET_CEILING_DRIFT iff JCS(P.budgetPredecessor) differs byte-for-byte from
   JCS(C.budgetPredecessor), including null versus a verified record.

String equality is exact Unicode value equality after the required canonical
validation; timestamps are compared as real UTC instants, never local strings.
Filter the fixed eight-element vocabulary by these tests without sorting by
observation arrival time. Preserve **every** true reason, once, in that order;
select its first element. Empty causes cannot construct ABANDON. Integrity
validation precedes all tests. Simultaneous expiry/source/configuration/budget
changes do not hide one another. Review/zero-finding/capability-manifest checks
remain independent activation issuance guards, not invented ninth reasons.

The outer §3.4 evidence object has exactly its seven printed members.
`bootstrapOperationId` is the snapshot operationId for **either** kind;
publicationBundleDigest is the §2.3A alias; preparedFrameDigest is null for
verified direct ABANDON, otherwise the raw-verified original PREPARE's §3.4
frameDigest; observedCauseSet and both inner digests are computed above;
observedAt is t, equal the ABANDON payload's observedAt. Its JCS bytes follow
both snapshot encodings/hashes and precede construction of the ABANDON payload,
frame/head and record identities. Output is lowercase hex SHA-256 with the
already-approved outer domain, including one trailing 00 byte.

Retain the exact snapshot JCS bytes, canonical seven-member evidence object,
ordered causes, t, sealed bundle, original PREPARE if present, canonical ABANDON
frame, and exact non-secret source/contract/guidance/configuration/routing/plan/
budget observation evidence. Verify retained identities by recomputing both
inner formulas and the outer formula, matching the witness evidence field,
then recomputing frame/head/record identities and replaying the comparisons.
The sole persistence writer/authority, closed package, retrieval, durability
and retention contract is §3.4C, replacing the formerly unspecified owner
retention step. Evidence is outside the publication bundle and target paths,
not a public family, bearer capability, signer or runtime-security proof.

### 3.4B Deterministic PREPARE reconstruction (no PREPARE file)

There is exactly one construction rule for initial and replayed PREPARE. Inputs
are the verified stored §2.3A manifest, core, candidate and transaction bytes;
the retained owner-verified canonical journal path whose §4.1 identity equals
manifest.journalId; and exact verified predecessor ledger/witness observations
matching the manifest expected heads/sequence. At a header-only witness, the
predecessor frame is absent; otherwise retain its exact bytes and verify its
frame/head/record identity and journal prefix under §§3.4/4.1/4.3. These inputs
are immutable for this operation. Read-only reconstruction is the only allowed
reconstruction exception: it never regenerates or rewrites any stored artifact.
A head mismatch quarantines under §4.3; it cannot be repaired by changing the
operation, expected head, sequence, journal path, observation or timestamp.

| Every required PREPARE payload member | Exact source / construction |
|---|---|
| schemaName, schemaVersion, recordKind | literals `lcim.local-consistency-witness`, integer 1, `LOCAL_CONSISTENCY_WITNESS_FRAME` |
| operationId | manifest operation ID via §2.3A kind-specific spelling |
| repositoryId, runId, journalId | manifest values, cross-checked to verified context |
| frameKind | literal PREPARE |
| expectedPredecessorLedgerHead, expectedLedgerSequence | immutable manifest values, equal verified predecessor ledger head/next sequence and stored transaction predecessorHead/sequence |
| intendedTransactionId, intendedTransactionDigest | manifest canonicalTransactionId/canonicalTransactionDigest, independently verified from stored transaction bytes |
| publicationBundleDigest | §2.3A kind-specific manifest identity alias |
| sequence | 0 at header-only journal; otherwise verified matching predecessor frame.sequence + 1; reject count overflow |
| predecessorWitnessHead | manifest expectedPredecessorWitnessHead, equal verified prefix head (null iff sequence 0) |
| predecessorGenerationId, expectedCurrentHead | both null iff sequence 0; otherwise both the verified predecessor witness frame.recordId |
| observationId | `"obs_" + first32hex(SHA-256(ASCII("LCIM-BOOTSTRAP-WITNESS-OBS-v1") || hex(00) || JCS([operationId,publicationBundleDigest,"PREPARE"])))`; first32hex means first 32 lowercase hexadecimal characters (16 bytes); same existing domain for both kinds |
| observedAt | immutable manifest.createdAt, not replay/append time |
| preparedFrameDigest, terminalReason, terminalReasonEvidenceDigest | each literal null |
| frameDigest | §3.4 formula over the above 22 base members, excluding exactly the five derived identity members |
| headDigest | §3.4 head formula; sequence 0 uses **64 raw zero bytes**, otherwise 32 decoded predecessor digest bytes; append 32 decoded frameDigest bytes |
| recordId, generationId | §3.0 witness ID formula after inserting frameDigest and headDigest; equal values |
| recordDigest | §3.0 witness digest formula after inserting both recordId and generationId |

The completed payload has exactly the common and §3.4 members (27 total);
JCS encode it, require length 1..1048576, prefix its four-byte unsigned
big-endian length, append the **32 decoded bytes of frameDigest**. This framed
byte string contains no journal header. `prepareFramedByteDigest` means exactly
lowercase hex SHA-256 of that entire framed byte string (length + payload +
trailer), with **no domain prefix and no exclusions**. This is the exact action
byte digest of the one APPEND_WITNESS_PREPARE authority instance; it is neither
frameDigest nor a stored manifest member. Under expected-head checks that
instance appends only these bytes, fsyncs, consumes and requires reclassification.

If a PREPARE is already durable, reconstruction from its original predecessor
must equal its exact framed bytes; otherwise quarantine replay conflict. It is
not appended again. Current heads decide eligibility separately and cannot
alter reconstruction inputs. Append/durability times are receipt observations,
not public PREPARE fields. No fresh random ID, process ID, wall clock or ambient
configuration participates. §10 executes a discard-and-rebuild fixture from
serialized verified inputs and compares every byte and identity.

### 3.4C Durable terminal evidence publication (P1-2)

C30-13 is the sole issuer **and package writer**, using C30-03's storage/lock
primitives; C30-12 only classifies/verifies/plans recovery. This private,
immutable controller-owned package is not a seventh public local family, a
publication-bundle entry, a terminal event or a serializable authority. No
worker, reviewer, target code or configuration receives a capability from it.

**Non-circular construction and exact content.** Use §3.0 scalar types, §2.3A
canonical unpadded Base64 and JCS, and the existing snapshot/reason/frame
formulas unchanged. All objects here are closed recursively. An `octets`
descriptor has exactly `bytesBase64` (canonical string), `byteLength` (count),
`sha256` (raw byte SHA-256 digest), all mutually verified. Empty octets are
allowed only where stated. No digest alone substitutes for input bytes.

Construct in this order: verified P/C snapshots and owner inputs → two binding
digests → exact seven-member evidence object and terminalReasonEvidenceDigest
→ exact ABANDON payload and framed bytes → proposal observation → package
payload descriptors → package manifest identity → final manifest → SEALED.
No evidence-package identity enters a public frame or the seven-member object.
For a **new** ABANDON proposal, use the PREPARE §3.4B immutable manifest fields
for operation/repository/run/journal/intended transaction/expected ledger facts,
frameKind ABANDON, the current verified witness prefix's next sequence/head/
record generation, preparedFrameDigest per §3.4, observedAt from §3.4A, and
terminalReason/terminalReasonEvidenceDigest from the computed evidence.
`observationId = "obs_" + first32hex(SHA-256(ASCII("LCIM-BOOTSTRAP-WITNESS-OBS-v1")
|| 00 || JCS([operationId,publicationBundleDigest,"ABANDON"])))`.
Derive all frame/head/record identities under §3.4 and frame exactly as §3.4B.
This makes newly calculated proposals deterministic without changing any public
formula; retained older valid frames (including §10's V5 calculation bytes)
are verified byte-for-byte, never rewritten to change observationId.

`abandonProposalObservation` is exactly the **13 original post-journal members**
listed in §2.5B, with `terminalization`, V7 `observationVersion` and
`pathBindings` omitted, nextAction fixed to
PERSIST_ABANDON_EVIDENCE, classification SEALED_NO_PREPARE or PREPARE_ONLY,
nonempty exact observedCauseSet, verified sealed bundle and no ledger/terminal/
suffix. It retains observedAt, both binding digests and exact pre-append heads.
It cannot include an evidence-package digest or storage outcome. Its digest is
`hex(SHA-256(ASCII("LCIM-ABANDON-PROPOSAL-OBSERVATION-v1") || 00 ||
JCS(abandonProposalObservation)))`, named `proposalObservationDigest`, with no
exclusions. This projection is not an independently issuable authority state.

The final package contains exactly **eleven entries**, nine payload artifacts
in this order, then evidence-manifest.jcs and SEALED; no subdirectories:

| Ordinal / fixed filename | Exact bytes and verification |
|---|---|
| 0 prepared-binding.jcs | exact §3.4A preparedBindingSnapshot JCS |
| 1 current-binding.jcs | exact §3.4A currentBindingSnapshot JCS |
| 2 reason-evidence.jcs | exact seven-member §3.4 evidence object JCS; no added field |
| 3 proposal-observation.jcs | exact abandonProposalObservation JCS above |
| 4 owner-inputs.jcs | the closed input capsule below, JCS |
| 5 publication-bundle.jcs | closed `{publicationKind, entries}` capsule; kind matches operation; entries contains exactly nine/eight ordered objects `{filename, bytesBase64, byteLength, sha256}`, including original manifest and SEALED in their §2.3/§2.5A directory order; every embedded byte equals the original stored artifact and passes §2.3A verification; not a rewrite or extra bundle entry |
| 6 ledger-prefix.bin | exact complete locked pre-append controller-ledger byte stream, verified under C30-03; zero bytes only at verified empty ledger; head/sequence and absence of this transaction match proposal |
| 7 witness-prefix.bin | exact locked verified journal prefix, header plus all complete frames, at least 8 bytes, no suffix; §4 byte/sequence verification matches proposal and available PREPARE |
| 8 abandon.frame | exact framed ABANDON bytes (length/payload/raw trailer, no header), matching all proposal/evidence/transaction/predecessor bindings |

`owner-inputs.jcs` has exactly `{prepared, current}`, each exactly
§2.3C's **OwnerInputSide-v2**, with its non-null complete source/budget proof
archives and absence evidence. This is a precise shared schema, not another
abbreviated owner encoding. Prepared must be byte-value-equal (JCS equality)
to the verified persisted manifest.preparedInputs.ownerInputs, and
prepared-binding.jcs equal its retained preparedBindingSnapshot. Obtain no
prepared byte from the new current environment or a global input oracle.
Current is copied from the newly verified owner observation; verify both sides
against their own snapshots and the unchanged §3.4A identities. This expands
the private evidence package to schemaVersion **2**, with unchanged schemaName,
domain, eleven filenames and nine descriptors; version 1 is historical only
(§2.3C). The package contains an exact copy of the original v2 bundle, not an
upgraded bundle. Live currentness is still rechecked before issuance/append;
retention is not eternal currentness or authority.

`evidenceManifestCore` contains exactly:

| Member | Complete type/source |
|---|---|
| schemaName, schemaVersion | literals `lcim.abandon-evidence-package`, integer 2 (private format only) |
| publicationKind, operationId, repositoryId, runId, journalId | verified operation's §2.3A/§3.4 IDs/kind |
| absoluteCanonicalJournalPath | owner-verified canonical path whose §4.1 journalId matches |
| publicationBundleDigest | existing manifest identity alias |
| preparedFrameDigest | null for direct proposal, otherwise exact PREPARE frameDigest |
| terminalReasonEvidenceDigest, proposalObservationDigest | digests computed above |
| abandonFramedByteDigest | raw SHA-256 of artifact 8, no domain/exclusions |
| observedAt | exact evidence/ABANDON/observation timestamp, never publication time |
| expectedLedgerHead, expectedWitnessHead | pre-append proposal ledger.headDigest and witness.headDigest (witness nullable only at header-only prefix) |
| expectedLedgerNextSequence, expectedWitnessNextSequence | counts from the proposal's locked prefixes |
| artifacts | exactly nine ordered closed descriptors `{ordinal, filename, byteLength, sha256}`; ordinal 0..8 and fixed filename above, raw SHA-256/length of exact artifact; positive lengths except ledger-prefix.bin may be 0 |

Every value must match the artifact content, not just its scalar pattern.
`evidencePackageDigest = hex(SHA-256(ASCII("LCIM-ABANDON-EVIDENCE-PACKAGE-v1")
|| 00 || JCS(evidenceManifestCore)))`. The final manifest is exactly that core
plus evidencePackageDigest. This **single self-identity member** is excluded
when verifying its hash; nothing else is excluded. SEALED contains exactly
64 ASCII lowercase hex bytes of evidencePackageDigest, no newline. Manifest
and SEALED have no payload descriptors, avoiding self-reference.
`persistAbandonEvidenceByteDigest` is raw SHA-256 of exact final
`evidence-manifest.jcs` bytes, with no domain/exclusions. Through the manifest
identity/descriptors it binds every artifact. The evidence action writes only
this exact package, never ABANDON, a publication bundle or a ledger transaction.

**Deterministic retrieval and retention.** With R as §2.5C, the final location is:

```text
R/abandon-evidence/v1/<repositoryId>/<runId>/<operationId>/<terminalReasonEvidenceDigest>/<abandonFramedByteDigest>/
```

A durable frame supplies repository/run/operation/evidence digest; hash its
exact framed bytes to obtain the last component. No receipt, mutable index or
process memory is needed. Verify path, journal identity, closed member/entry
sets, no symlinks/traversal/extra paths, every byte/length/hash, both snapshots,
seven-member evidence, reason order, source/budget proofs, original bundle,
ledger/witness prefix and ABANDON equality. Missing, substituted, inconsistent
or unexpected bytes reject. After a matching durable ABANDON, any unavailable,
missing or corrupt selected package is
INTEGRITY_QUARANTINE_MISSING_OR_CORRUPT_ABANDON_EVIDENCE; never reconstruct it
from current facts or remove the terminal. Apply this evidence integrity
prerequisite after §4's classes 1–12 and before terminal/recovery acceptance,
also when a complete ABANDON prefix has an incomplete suffix. It does not
change byte-parser precedence or any public frame schema.

All published packages are retained indefinitely and never overwritten,
mutated, deleted, repurposed or garbage-collected by these actions, including
unselected proposals. Originals of the nine/eight-entry publication bundles
retain existing immutability rules. Copies make the terminal evidence
self-contained; verification of active history still checks its original
required bundle. No persisted file conveys permission to mutate.

**Reachability and order.** In §2.5B the new `terminalization` object contains
exactly `proposalObservationDigest`, `terminalReasonEvidenceDigest`,
`abandonFramedByteDigest`, `evidencePackageDigest` (digests), `storage`
(MEMORY_VERIFIED or DURABLE_VERIFIED), and `destination` (VERIFIED_ABSENT or
EXACT_PRESENT). Destination is a locked no-follow observed fact: VERIFIED_ABSENT
requires no final package; EXACT_PRESENT requires every exact final byte to
verify. DURABLE_VERIFIED additionally requires EXACT_PRESENT. A changed
destination after confirmation invalidates the observation, including an equal
package appearing; discard/reclassify before any new mutation or fsync-only
completion. This distinguishes absent publication from exact-existing recovery
without an unbound persistence-mode choice. It is non-null only for the eligible
stale stages above; null in every other post-journal state. Compute the package
from the projection **before** adding this object. Its storage is an observed
fact, never an intent. For MEMORY_VERIFIED require exact in-memory package and
verified absence of the final package; nextAction PERSIST_ABANDON_EVIDENCE.
For DURABLE_VERIFIED require retrievable immutable package whose exact bytes
and bindings verify; nextAction APPEND_WITNESS_ABANDON. A final package that is
merely visible but not yet durability-established offers no append authority.
After reopening a surviving complete package following restart, durability can
be established only by a fresh exact PERSIST_ABANDON_EVIDENCE instance's
verification/fsync completion (no content rewrite); until then storage is
MEMORY_VERIFIED for this sole completion path. The closed object contains no
third storage value; this case requires exact existing bytes, not absence.
For this completion case MEMORY_VERIFIED means content verified but durability
not established in the current controller session; it never claims the final
path is absent. The object binds the same exact proposal/package identity and
the action may only verify/fsync those equal existing bytes. A separate
storage-intent/receipt file is neither needed nor authorized.

1. Read-only classify and calculate the complete exact proposal/package.
2. Display the operation, source/guidance facts, reason/time/preimages, target
   location, heads, package identity, action and both exact byte digests.
   Require controlling-TTY line `CONFIRM <operationId> PERSIST_ABANDON_EVIDENCE
   <classifiedStateDigest> <persistAbandonEvidenceByteDigest>` (one line + LF).
3. C30-13 issues one matching publication-class PERSIST_ABANDON_EVIDENCE object,
   binding the existing operation/bundle/heads, full classified digest and exact
   manifest byte digest. Expiry is this confirmation time + 300 seconds,
   independent of expired bundle time; no old authority is revived.
4. Under §2.5C's locks, recheck all eligibility/bytes/path/current inputs.
   Use **only §2.5D's shared procedure**, with sibling staging
   `.evidence-<abandonFramedByteDigest>-<nonce>.tmp` (nonce 32 hex), nine payloads,
   final v2 manifest, SEALED, all file fsyncs, fully populated staging fsync,
   no-replace rename, and the complete final-parent-to-U chain. Reused ancestors
   are included. Exact-existing completion uses the same procedure's file/final
   directory/entire-chain flushes without content writes. Any required flush
   failure prevents DURABLE_VERIFIED and append issuance. Appeared/replaced
   destination or ancestor discards/reclassifies; no overwrite even of equal bytes.
5. Consume/discard that instance; no frame append under it.
6. Re-read all persisted package bytes and current ledger/witness/source inputs;
   preserve the frozen observedAt and proposal bytes. Reclassify.
7. Only if still eligible and DURABLE_VERIFIED, display and freshly confirm
   `CONFIRM <operationId> APPEND_WITNESS_ABANDON <classifiedStateDigest>
   <abandonFramedByteDigest>` as one line + LF. C30-13 issues a **separate**
   one-use append instance. Its old raw framed-byte binding remains unchanged;
   the classified digest additionally binds the matching durable package.
   Recheck under both locks immediately before mutation; missing/invalid
   matching evidence fails before the first append byte.
8. Append/fsync only the exact ABANDON frame and required witness-parent fsync
   under the existing append effect; never persist evidence under this object.
9. Consume and reclassify ABANDONED, verifying deterministic retained evidence.

Fresh-TTY restart rules are mandatory for **each** recovery mutation, including
fsync-only durability completion or truncation. Authority is process-local and
one-use; crashes discard every live instance. All support effects above belong
to this single package publication, not unnamed auxiliary business operations.
No staging cleanup/deletion/receipt/registry/lock-file write is authorized.

**Reuse and conflict rules.** An unappended proposal can be selected again only
if every package byte, observation input, reason vector, timestamp, frame and
expected ledger/witness prefix is identical and live eligibility still holds.
Recompute causes also at the live instant: crossing a previously unobserved
expiry boundary changes the cause vector and requires a new proposal. Fresh
confirmation and new authority are always required after restart. Incomplete
staging is never reused: retain it and publish an identical recomputed/retained
proposal under a fresh nonce only if all the above verifies. A changed
observation creates a **new** package key (new evidence/frame digest), timestamp
and authority; it cannot overwrite old evidence or change bytes under an old
instance. If the exact old bytes cannot be recovered, calculate a new proposal
read-only from verified live inputs and confirm it, never pretend it is replay.

Unselected packages/staging are harmless retained evidence, not terminal
witness conflicts, not a reason to force ABANDON, and not a license for garbage
collection. Different bytes at the selected prospective key deny that proposal
without rewriting history. Once a frame selects it, missing/corrupt evidence
is the integrity quarantine above. Durable competing frames/heads still use
§4's witness conflicts. Once the matching ledger transaction exists, **never
ABANDON**: unselect any proposal and complete its exact COMMIT despite drift.
A different ledger transaction/head quarantines under existing rules, never
becomes an ABANDON cause.

| Crash/restart boundary or observation | Sole recovery outcome |
|---|---|
| proposal only in memory | no evidence/frame write occurred; discard memory; reobserve and newly confirm exact proposal |
| incomplete evidence staging | retain untouched, no append eligibility; verify live inputs, fresh evidence instance/new staging nonce or new proposal |
| final package visible before durability completion | no append; fresh confirmed exact PERSIST durability completion as above, consume/reverify |
| evidence durable, ABANDON absent | after restart: fresh confirmed PERSIST_ABANDON_EVIDENCE exact-existing §2.5D completion first; consume/reclassify, then separate fresh append confirmation if still eligible; else retain unselected |
| durable evidence, incomplete ABANDON append | existing exact suffix classification; fresh TRUNCATE_INCOMPLETE_FINAL_FRAME only, consume/reclassify; separately confirm append only if proposal still eligible and evidence verifies |
| ABANDON durable, process exits before returning | deterministic retrieval verifies selected package; return ABANDONED read-only, no duplicate append |
| ABANDON present, evidence missing/corrupt | INTEGRITY_QUARANTINE_MISSING_OR_CORRUPT_ABANDON_EVIDENCE, including a suffix-bearing terminal prefix; no repair writes |
| proposal superseded before append | discard authority, retain old package/staging unselected; reobserve/new bytes/new key/new TTY; no stale PREPARE/ledger/capability |
| matching ledger published after evidence persistence | deny append before mutation; complete exact COMMIT under separate existing rule, even after drift |
| changed competing ledger/witness head | existing integrity conflict quarantine; no terminalization/overwrite; unselected evidence alone is not the conflict |

### 3.5 `lcim.local-activation-settlement@1`

ID domain: `LCIM-LOCAL-ACTIVATION-SETTLEMENT-ID-v1\0`. Digest domain:
`LCIM-LOCAL-ACTIVATION-SETTLEMENT-DIGEST-v1\0`. `recordKind` is
`LOCAL_ACTIVATION_SETTLEMENT`.

Additional required fields:

| Field | Exact type / value |
|---|---|
| `repositoryId`, `runId`, `sourceGenerationId` | shared ID patterns |
| `sourceCommit`, `sourceTree` | Git object ID |
| `semanticContractDigest`, `activeGuidanceDigest`, `configurationDigest`, `modelRoutingDigest`, `planConfirmationDigest`, `budgetCeilingDigest`, `operatorSessionDigest`, `reviewCoverageDigest`, `zeroOpenFindingDigest`, `capabilityManifestDigest`, `expectedPredecessorLedgerHead`, `candidateSetDigest` | digest |
| `candidateSetKind` | `TRANSACTION_ZERO` or `SUCCESSOR_ACTIVATION` |
| `expectedPredecessorWitnessHead` | null only when the witness journal is empty for first activation; otherwise digest |
| `planConfirmationGenerationId`, `budgetCeilingGenerationId`, `operatorSessionGenerationId` | record ID |
| `reviewCoverageStatus` | literal `COMPLETE_CURRENT_GENERATION_SOL_PASS` |
| `zeroOpenFindingCount` | integer literal `0` |
| `capabilityManifestName` | literal `lcim.protocol-capability-manifest` |
| `capabilityManifestVersion` | integer literal `1` |
| `expectedLedgerSequence` | integer 0..9007199254740991 |
| `bootstrapOperationId`, `operatorConfirmationOperationId` | operation ID; both equal common `operationId` for initial bootstrap |
| `durableIssuancePrecondition` | literal `REQUIRES_MATCHING_COMMIT` |
| `preparedAt` | timestamp observed in A0 |

```json
{"activeGuidanceDigest":"0000000000000000000000000000000000000000000000000000000000000000","bootstrapOperationId":"op_00000000000000000000000000000000","budgetCeilingDigest":"0000000000000000000000000000000000000000000000000000000000000000","budgetCeilingGenerationId":"rec_0000000000000000000000000000000000000000000000000000000000000000","candidateSetDigest":"0000000000000000000000000000000000000000000000000000000000000000","candidateSetKind":"TRANSACTION_ZERO","capabilityManifestDigest":"0000000000000000000000000000000000000000000000000000000000000000","capabilityManifestName":"lcim.protocol-capability-manifest","capabilityManifestVersion":1,"configurationDigest":"0000000000000000000000000000000000000000000000000000000000000000","durableIssuancePrecondition":"REQUIRES_MATCHING_COMMIT","expectedCurrentHead":null,"expectedLedgerSequence":0,"expectedPredecessorLedgerHead":"0000000000000000000000000000000000000000000000000000000000000000","expectedPredecessorWitnessHead":null,"generationId":"rec_2222222222222222222222222222222222222222222222222222222222222222","modelRoutingDigest":"0000000000000000000000000000000000000000000000000000000000000000","operationId":"op_00000000000000000000000000000000","operatorConfirmationOperationId":"op_00000000000000000000000000000000","operatorSessionDigest":"0000000000000000000000000000000000000000000000000000000000000000","operatorSessionGenerationId":"rec_0000000000000000000000000000000000000000000000000000000000000000","planConfirmationDigest":"1111111111111111111111111111111111111111111111111111111111111111","planConfirmationGenerationId":"rec_1111111111111111111111111111111111111111111111111111111111111111","predecessorGenerationId":null,"preparedAt":"2026-03-09T00:00:00.000Z","recordDigest":"2222222222222222222222222222222222222222222222222222222222222222","recordId":"rec_2222222222222222222222222222222222222222222222222222222222222222","recordKind":"LOCAL_ACTIVATION_SETTLEMENT","repositoryId":"repo_0000000000000000000000000000000000000000000000000000000000000000","reviewCoverageDigest":"0000000000000000000000000000000000000000000000000000000000000000","reviewCoverageStatus":"COMPLETE_CURRENT_GENERATION_SOL_PASS","runId":"run_00000000000000000000000000000000","schemaName":"lcim.local-activation-settlement","schemaVersion":1,"semanticContractDigest":"0000000000000000000000000000000000000000000000000000000000000000","sourceCommit":"0000000000000000000000000000000000000000","sourceGenerationId":"srcgen_0000000000000000000000000000000000000000000000000000000000000000","sourceTree":"0000000000000000000000000000000000000000","zeroOpenFindingCount":0,"zeroOpenFindingDigest":"0000000000000000000000000000000000000000000000000000000000000000"}
```

Source-review eligibility is §7.3: accepted EXTERNAL_DEVELOPMENT_REVIEW
coverage and zero-finding proofs are valid source-qualification inputs, not
runtime Sol events; closed acceptance formats/consumer verification must exist
before use (§8.1 U3). No production capability is required to review the code
that will implement activation. Runtime activation itself requires phase F.

The activation canonical preimage contains only pre-publication facts. It binds
`expectedPredecessorLedgerHead`, `expectedPredecessorWitnessHead`,
`expectedLedgerSequence`, `bootstrapOperationId`, `candidateSetKind` and
`candidateSetDigest`. The retained `bootstrapOperationId` field equals the
publication operation ID for both transaction-zero and successor activations;
the candidate-set kind selects the applicable digest domain. Its closed schema
contains no `publicationBundleDigest`, transaction ID,
transaction digest, resulting `committedLedgerHead`, resulting
`committedWitnessHead` or COMMIT frame digest.

After publication, the verified commit/receipt or recovery observation binds
the activation `recordId`/`recordDigest`, canonical transaction ID/digest,
`publicationBundleDigest`, resulting `committedLedgerHead`, resulting
`committedWitnessHead`, exact COMMIT `frameDigest` and sequence. Those derived
values are not inserted into or used to derive the activation record. Initial
and successor capability issuance requires this exact relation **and** §2.5D's
same-session exact completion, sealed bundle/no suffix and current qualifications/
facts/TTY. After source change, §6.2 requires accepted checkpoint and generation-
bound gate applicability before successor preflight; FINAL_REVIEW alone is not G2.

Genesis is the first activation. A source/plan/budget/session/review/manifest or
predecessor-head change requires a successor. Missing current review is
`DENIED_INCOMPLETE_CURRENT_REVIEW`; open findings are
`DENIED_OPEN_FINDINGS`; a predecessor/CAS conflict is the common head conflict;
a receipt mismatch is `INTEGRITY_QUARANTINE_ACTIVATION_COMMIT_MISMATCH`.

### 3.6 `lcim.manual-delivery-manifest@1`

ID domain: `LCIM-MANUAL-DELIVERY-MANIFEST-ID-v1\0`. Digest domain:
`LCIM-MANUAL-DELIVERY-MANIFEST-DIGEST-v1\0`. `recordKind` is
`MANUAL_DELIVERY_MANIFEST`.

Additional required fields:

| Field | Exact type / value |
|---|---|
| `repositoryId`, `runId`, `reviewedSourceGenerationId` | shared ID patterns |
| `packageName` | 1..214 bytes, `^(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*$` |
| `packageVersion` | 1..128 bytes and matches `^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\\.(?:0|[1-9][0-9]*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$` (canonical SemVer 2.0.0) |
| `packageIdentity` | exact `packageName + "@" + packageVersion` |
| `sourceCommit`, `sourceTree` | Git object ID |
| `artifactSha256`, `schemaCapabilitySetDigest`, `toolchainBuildInputManifestDigest`, `solReviewLineageDigest`, `bl023EvidenceDigest`, `bl028EvidenceDigest`, `activationSettlementDigest`, `contentAddressingPayloadDigest` | digest |
| `artifactByteCount` | count |
| `schemaCapabilitySet` | nonempty ordered duplicate-free array of closed objects containing only `componentName` (NFC 1..128 bytes), `componentVersion` (`^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$`) and `componentDigest` (digest) |
| `solReviewLineage` | nonempty causal ordered duplicate-free array of closed objects containing only `reviewOperationId` (operation ID), `profile` (`SPRINT_CANDIDATE`, `DEPENDENCY_BARRIER`, `ACTIVATION` or `DELIVERY`), `subjectGenerationId` (source-generation ID), `responseDigest` (digest) and `verdict` (literal `PASS`) |
| `solReviewLineageStatus` | literal `COMPLETE_CURRENT_GENERATION_PASS` |
| `activationSettlementGenerationId` | record ID of the fresh current activation |
| `contentAddressingExclusions` | exactly `recordId`, `recordDigest`, `generationId`, `predecessorGenerationId`, `expectedCurrentHead`, `operationId`, `createdAt` in that order |
| `createdAt` | timestamp |
| `deliveryState` | literal `DELIVERY_READY_MANUAL` |

```json
{"activationSettlementDigest":"2222222222222222222222222222222222222222222222222222222222222222","activationSettlementGenerationId":"rec_2222222222222222222222222222222222222222222222222222222222222222","artifactByteCount":0,"artifactSha256":"0000000000000000000000000000000000000000000000000000000000000000","bl023EvidenceDigest":"0000000000000000000000000000000000000000000000000000000000000000","bl028EvidenceDigest":"0000000000000000000000000000000000000000000000000000000000000000","contentAddressingExclusions":["recordId","recordDigest","generationId","predecessorGenerationId","expectedCurrentHead","operationId","createdAt"],"contentAddressingPayloadDigest":"0000000000000000000000000000000000000000000000000000000000000000","createdAt":"2026-03-09T00:00:00.000Z","deliveryState":"DELIVERY_READY_MANUAL","expectedCurrentHead":null,"generationId":"rec_3333333333333333333333333333333333333333333333333333333333333333","operationId":"op_33333333333333333333333333333333","packageIdentity":"lcim@3.0.0","packageName":"lcim","packageVersion":"3.0.0","predecessorGenerationId":null,"recordDigest":"3333333333333333333333333333333333333333333333333333333333333333","recordId":"rec_3333333333333333333333333333333333333333333333333333333333333333","recordKind":"MANUAL_DELIVERY_MANIFEST","repositoryId":"repo_0000000000000000000000000000000000000000000000000000000000000000","reviewedSourceGenerationId":"srcgen_0000000000000000000000000000000000000000000000000000000000000000","runId":"run_00000000000000000000000000000000","schemaCapabilitySet":[{"componentDigest":"0000000000000000000000000000000000000000000000000000000000000000","componentName":"core","componentVersion":"1.0.0"}],"schemaCapabilitySetDigest":"0000000000000000000000000000000000000000000000000000000000000000","schemaName":"lcim.manual-delivery-manifest","schemaVersion":1,"solReviewLineage":[{"profile":"DELIVERY","responseDigest":"0000000000000000000000000000000000000000000000000000000000000000","reviewOperationId":"op_00000000000000000000000000000000","subjectGenerationId":"srcgen_0000000000000000000000000000000000000000000000000000000000000000","verdict":"PASS"}],"solReviewLineageDigest":"0000000000000000000000000000000000000000000000000000000000000000","solReviewLineageStatus":"COMPLETE_CURRENT_GENERATION_PASS","sourceCommit":"0000000000000000000000000000000000000000","sourceTree":"0000000000000000000000000000000000000000","toolchainBuildInputManifestDigest":"0000000000000000000000000000000000000000000000000000000000000000"}
```

For LCIM source delivery, §7.3 permits accepted EXTERNAL_DEVELOPMENT_REVIEW
lineage as source-qualification input, subject to qualified closed-format and
currentness validation (§8.1 U3). This eligibility adds no public field or
runtime invocation/accounting fiction and grants no delivery capability.
Final delivery also requires the full recurring §6.2 acceptance/requalification
path and §2.5D same-session durable successor relation, sealed bundle/no suffix,
current-fact/fresh-TTY capability checks. Preserve BL-023/BL-028 and bind renewed
build/release evidence to exact bytes; never reuse stale S evidence for S'.

The two array digests are SHA-256 over their exact JCS arrays. The lineage lists
every current-generation Sol review in causal order and every entry is PASS.
`contentAddressingPayloadDigest` is SHA-256 of exact JCS after removing exactly
the seven names listed in `contentAddressingExclusions` plus
`contentAddressingPayloadDigest` itself. Those exclusions apply only to that
payload; common ID/digest preimages are unchanged.

The first package/version manifest is genesis. Artifact/source/review/BL/
activation/schema/build-input change requires a successor. Same package/version
with different bytes uses CAS and never overwrites. A stale activation is
`DENIED_STALE_ACTIVATION_SETTLEMENT`; incomplete review is
`DENIED_INCOMPLETE_CURRENT_REVIEW`; BL failure is `DENIED_RELEASE_GATE_EVIDENCE`.
It grants no remote authority.

## 4. Complete witness write, replay and recovery protocol

### 4.1 Framing and dual-lock order

The journal is outside the target repository, Git common directory and run
directory. `journalId = "journal_" + SHA-256("LCIM-LOCAL-WITNESS-JOURNAL-v1\0"
|| JCS({repositoryId,runId,absoluteCanonicalJournalPath}))`. The existing byte representation is fixed by the following **ordered parser**.
All intervals are half-open byte offsets. The header occurs once per journal,
never per frame. An absent journal uses §2.5C's explicit PRE_JOURNAL
observation and authorized initialization, not this parser; an existing
zero-length file is a partial header, not a clean journal.

1. Let N be the byte count. Header interval [0,8): offsets 0..5 are exactly
   hex `4c43494d574a` (ASCII `LCIMWJ`); offsets 6,7 are two ASCII decimal digits
   `30`..`39`, encoding unsigned version `10*(b6-48)+(b7-48)`. Supported version
   is exactly 1, spelled `01`. N < 8 returns
   INTEGRITY_QUARANTINE_BAD_WITNESS_HEADER (partial header; never truncatable).
   With 8 bytes, bad magic/non-digit encoding returns that same class-1 result.
   Otherwise any version except 01 returns class 2
   INTEGRITY_QUARANTINE_UNSUPPORTED_WITNESS_VERSION, including `LCIMWJ02`.
   Do not wait for a frame to reject a bad/unsupported header.
2. Set cursor c = 8. If c = N, the byte parse is complete: retain the header
   even if there are zero frames. If 0 < N-c < 4, return eligible incomplete
   LENGTH with verified prefix [0,c). Otherwise decode exactly [c,c+4) as
   `L = b[c]*16777216 + b[c+1]*65536 + b[c+2]*256 + b[c+3]`, with every byte an
   unsigned integer 0..255. The result is 0..4294967295. Immediately reject
   L = 0 or L > 1048576 as class 3 INTEGRITY_QUARANTINE_BAD_WITNESS_LENGTH,
   even at EOF immediately after this word. No payload/digest is needed for
   that decision. Thus `LCIMWJ01 || 00100001 || EOF` has only BAD_WITNESS_LENGTH.
3. Define payload [c+4,c+4+L), raw digest [c+4+L,c+4+L+32), and next cursor
   c+4+L+32 using mathematical nonnegative integer arithmetic, not signed
   32-bit arithmetic. Lengths/offsets in retained facts must fit the §3.0 count
   bound; reject a declared interval that would exceed 9007199254740991 as
   class 3, without overflow or allocation. If the payload interval is short
   at EOF, return eligible incomplete PAYLOAD; do not inspect an unfinished
   payload for syntax. Only [0,c) is the verified prefix.
4. Once all L payload bytes exist, validate strict UTF-8: reject invalid lead/
   continuation bytes, overlong encodings, encoded surrogates, truncated code
   points and values above U+10FFFF as class 4 BAD_WITNESS_UTF8. No digest bytes
   are needed to make this decision. A BOM decodes but fails the next stage.
5. Parse one JSON value consuming exactly the payload. Invalid JSON grammar,
   trailing tokens, BOM, duplicate object keys at any depth, unpaired escaped
   surrogates, or values not representable by RFC 8785 fail class 5
   BAD_WITNESS_JCS. Re-encode RFC 8785 and compare every payload byte; whitespace,
   noncanonical escaping/key order/number spelling fail class 5. This stage
   owns syntax and canonical representation only: **not** unknown fields,
   enums, wrong field types, nullability, non-NFC schema strings, fractional
   but canonically representable numbers, or terminal rules. Those are class 7.
6. Only after UTF-8 and JCS pass, if fewer than 32 trailer bytes exist, return
   eligible incomplete DIGEST with prefix [0,c). Otherwise compute the §3.4
   frame-domain SHA-256. To make this computation total before schema checking,
   for any JSON object remove exactly recordId, recordDigest, generationId,
   frameDigest and headDigest if present; for a nonobject use the value itself.
   Hash its JCS bytes under the frame domain. Compare the computed 32 bytes to
   the raw trailer. Mismatch is class 6 BAD_WITNESS_DIGEST. A wrong/missing
   payload frameDigest member is not a syntax failure and is checked next.
7. With a matching trailer, validate the **closed witness schema** §§3.0/3.4:
   exact required member set, unknown fields, schemaName/version/recordKind,
   all types/formats/bounds/NFC/nullability/enums, frameKind-sensitive terminal
   and preparedFrameDigest rules, intrinsic sequence-0/null relationships,
   equality of payload frameDigest to the computed digest, and derived
   head/record/generation identity formulas. Any failure is class 7
   BAD_WITNESS_SCHEMA. In particular canonical digest-valid ABANDON with an
   unknown terminalReason has only INTEGRITY_QUARANTINE_BAD_WITNESS_SCHEMA.
   Predecessor links to other records and actual ledger relationships are
   sequence checks, not this intrinsic schema stage.
8. Retain this complete frame, set c to the exact next cursor and repeat step 2.
   Do not infer L from the remaining journal: remaining bytes start the next
   frame. There is no independent 'complete payload length' other than L.
   At EOF run §4.3 sequence checks on all complete prefix frames. If an eligible
   suffix exists, classes 1–12/integrity prerequisites still have precedence;
   only then does §4.4 decide identified truncation versus quarantine. Never
   truncate a complete frame, known malformed input or journal header.

Byte-stage errors are first by byte cursor, then by the stage order above;
a later byte-stage failure cannot mask an earlier byte-stage failure. Sequence
classes 8–12 run only after byte validation of the complete prefix, so a byte
failure has precedence over a cross-record sequence failure. Header classes
1/2 run once. Stage-local
completeness is intentional: complete bad length wins over absent payload;
complete bad syntax wins over absent digest; digest failure wins over bad
schema. Eligible suffix is a parser intermediate, **not mutation authority**.
A valid complete prefix must also pass sequence/identity checks and the sealed
bundle identification rules before truncation is offered. A header-only prefix
has length 8, not 0; 'empty witness' means no operation frames, not no header.

Every operation uses this literal lock order:

1. acquire the controller-ledger owner lock;
2. acquire the local-consistency-witness owner lock;
3. perform expected-head checks and the operation;
4. release the witness lock;
5. release the ledger lock.

No code path may acquire those two locks in reverse order. §2.5C fixes their
no-file-write descriptor implementation; §2.5D alone defines all required
ancestor/parent durability effects.

### 4.2 Nine-step publication order

After §2.5C has supplied a verified journal header (never inside PREPARE), under
both locks and expected-head CAS, every ordinary, genesis and activation
transaction uses exactly:

1. validate current ledger and witness heads;
2. persist, seal and fsync the byte-complete immutable transaction/publication bundle under the exact §2.3 order;
3. append and fsync witness PREPARE;
4. fsync witness parent directory where required;
5. publish the exact ledger transaction atomically;
6. fsync ledger file and parent directory;
7. under APPEND_WITNESS_COMMIT repeat §2.5D's pinned exact ledger-file/full-chain fsync prerequisite and final rechecks, then append and fsync matching witness COMMIT;
8. fsync witness parent directory;
9. expose the transaction only after matching COMMIT verifies.

A matching COMMIT is the sole logical completion point. There remain exactly
nine outer steps; step 7's **internal effects deliberately expand**. Visible
ledger bytes after interrupted step 5 or 6 may qualify for step 7 completion;
step 2 supplies no ledger durability. All parent-durability
terms mean §2.5D's complete verified chain. Its existing-prefix completion
prerequisites apply before ledger publication; §2.3's internal persistence
order cannot be weakened by this summary. Initialization precedes these steps
and §3.4C is the separate pre-ledger terminalization branch, not an extra entry
in a publication bundle.

### 4.3 Precedence-ordered mutually exclusive classifier

§4.1 is the sole normative byte-parser algorithm. The seven existing class
names are retained as diagnostic labels, not seven predicates evaluated over
all remaining bytes at once. In particular the historical COMPLETE prefix on
the header label does not make a partial header an operation frame.

| Order | Class | Exact result (INTEGRITY_QUARANTINE_ prefix) | Evaluation point |
|---:|---|---|---|
| 1 | COMPLETE_BAD_MAGIC_OR_HEADER | INTEGRITY_QUARANTINE_BAD_WITNESS_HEADER | §4.1 step 1, including partial existing header |
| 2 | COMPLETE_UNSUPPORTED_VERSION | INTEGRITY_QUARANTINE_UNSUPPORTED_WITNESS_VERSION | step 1 after complete valid encoding |
| 3 | COMPLETE_BAD_LENGTH | INTEGRITY_QUARANTINE_BAD_WITNESS_LENGTH | steps 2–3, complete length word, before waiting for payload |
| 4 | COMPLETE_BAD_UTF8 | INTEGRITY_QUARANTINE_BAD_WITNESS_UTF8 | step 4, complete payload |
| 5 | COMPLETE_BAD_JCS | INTEGRITY_QUARANTINE_BAD_WITNESS_JCS | step 5, complete strict UTF-8 payload |
| 6 | COMPLETE_BAD_DIGEST | INTEGRITY_QUARANTINE_BAD_WITNESS_DIGEST | step 6, complete trailer after canonical JSON |
| 7 | COMPLETE_BAD_SCHEMA | INTEGRITY_QUARANTINE_BAD_WITNESS_SCHEMA | step 7, digest-valid payload |

No generic forbidden-values category exists. All closed-schema restrictions
(including unknown fields, enums, wrong types/nulls and terminalReason) belong
only to class 7. First cursor/first failed stage selects exactly one result.

Only after classes 1–7 pass may the sequence-level classifier evaluate these
classes in this exact order. Class 10 includes journal sequence continuity
(start 0, increment by one), predecessorGenerationId/expectedCurrentHead equal
to the preceding recordId, and predecessorWitnessHead equal to its headDigest.
The parser's class 7 checks only intrinsic formats/null rules and identity
formulas, not those cross-record links. In witness-integrity context unknown
public schema versions quarantine at class 7; the general §3.0 request-level
DENIED_UNKNOWN_SCHEMA_VERSION is not a competing parser outcome:

| Order | Sequence-level class | Exact result |
|---:|---|---|
| 8 | multiple complete terminal frames | `INTEGRITY_QUARANTINE_MULTIPLE_TERMINAL_FRAMES` |
| 9 | competing current heads or durable operation identity | `QUARANTINED_WITNESS_REPLAY_CONFLICT` |
| 10 | predecessor/head mismatch | `INTEGRITY_QUARANTINE_PREDECESSOR_HEAD_MISMATCH` |
| 11 | COMMIT without the exact matching ledger transaction | `INTEGRITY_QUARANTINE_COMMIT_WITHOUT_LEDGER` |
| 12 | non-tail ledger/witness divergence | `INTEGRITY_QUARANTINE_NON_TAIL_DIVERGENCE` |
| 13 | valid terminal state | exact matching COMMIT reports logical `COMMITTED`, with §2.5B/§2.5D's exact-existing action when completion knowledge is absent; never automatic durable/use eligibility; valid direct or PREPARE-bound ABANDON with no ledger returns `ABANDONED` |
| 14 | valid exact recoverable tail | enter the sole applicable §4.4 one-action row; no mutation occurs during classification |
| 15 | clean/no-operation state | `CLEAN_NO_OPERATION`; append nothing |

A required sealed bundle is verified before a potential state may enter class
14. A missing/corrupt required bundle has the existing sole result
`INTEGRITY_QUARANTINE_MISSING_OR_CORRUPT_PREPARED_BUNDLE`; mismatched bundle or
transaction identity is class 9 or 12 as applicable. Ordinary same-operation
different-byte reuse without durable integrity evidence remains
`DENIED_OPERATION_REPLAY_CONFLICT` outside witness-integrity precedence.

An incomplete final byte suffix is not a complete frame and is classified only
by §4.4's separate incomplete-suffix table. For a suffix-bearing stream,
classes 1–12 still validate all complete prefix frames and sequence integrity,
but classes 13–15 are not selected until the suffix is removed and the stream
is re-read. A complete frame is never treated as an incomplete suffix merely
because its semantics are invalid, and truncation may never remove a complete
frame.

ABANDON is terminal. No ledger publication or COMMIT may follow it. Duplicate
identical ABANDON appends nothing; any additional complete terminal frame is
class 8. Integrity failures never select ABANDON. No state is both recoverable
and corruption.

### 4.4 Exact one-action tail and incomplete-suffix tables

Every publication mutation row uses one action-specific instance of the
matching `GENESIS_ACTIVATION_BOOTSTRAP_AUTHORITY` or
`SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY`. It binds publication kind,
operation, private publication-bundle digest, classified-state digest, expected
heads, action, exact action-byte digest, expiry and instance ID. One instance
permits one action and one mutation, is consumed by that mutation, and is
followed by full re-read/reclassification. No row permits a second mutation.

The incomplete-suffix table is separate from complete-frame classes 1–15:

| Incomplete-suffix state | Exact authority action | Fresh TTY | Sole mutation | Mandatory result |
|---|---|---|---|---|
| no complete operation frame; identified incomplete first frame; exact sealed bundle identifies operation | `TRUNCATE_INCOMPLETE_FINAL_FRAME` | required | truncate/fsync only to the verified prefix (retain the 8-byte header and any prior-operation frames) | consume truncation authority; no other mutation; re-read bundle/current facts; enter exactly B1 or B2 below |
| no complete operation frame; incomplete first-frame bytes; no exact sealed bundle identifies operation | none | no mutation offered | none | `QUARANTINED_WITNESS_UNIDENTIFIED_INCOMPLETE_FIRST_FRAME` |
| valid PREPARE prefix plus incomplete final bytes | `TRUNCATE_INCOMPLETE_FINAL_FRAME` | required | truncate/fsync only to PREPARE head | consume and reclassify; no ledger/COMMIT/ABANDON under truncation authority |
| valid COMMIT prefix plus incomplete final bytes | first APPEND_WITNESS_COMMIT/COMPLETE_EXACT_EXISTING if relation knowledge absent; then bundle completion if needed; only then separate `TRUNCATE_INCOMPLETE_FINAL_FRAME` | required separately | completion fsyncs only; truncation removes only the identified suffix, never a complete frame | truncation consumes and invalidates relation knowledge; reclassify COMMITTED and freshly repeat exact-existing completion before use; never append |
| valid ABANDON prefix plus incomplete final bytes | `TRUNCATE_INCOMPLETE_FINAL_FRAME` | required | truncate/fsync only to ABANDON head | consume and reclassify to existing `ABANDONED`; append nothing |

After identified incomplete-first-frame truncation, no third empty-witness
fact category is permitted: B2's MEMORY_VERIFIED/DURABLE_VERIFIED evidence
substates only split its authorized next action. The state must satisfy exactly
one of these disjoint class-14 rows:

| Valid exact recoverable tail | Exact authority action | Fresh TTY | Sole mutation | Post-mutation result |
|---|---|---|---|---|
| **B1 — current sealed bundle, empty witness:** exact sealed bundle verifies; no complete frame for the operation; no incomplete bytes; no ledger transaction; expected ledger/witness heads match; unexpired; all bound source/semantic/guidance/configuration/routing/plan/budget facts current | exactly one `APPEND_WITNESS_PREPARE` | uninterrupted still-current original confirmation may continue; after process loss/restart required | append/fsync exactly one §3.4B reconstructed PREPARE frame only | consume; re-read/reclassify; no ledger or COMMIT mutation under this authority |
| **B2 — stale or expired sealed bundle, empty witness:** exact sealed bundle verifies; no operation frame/suffix/ledger; heads match; expired or bound fact drift | PERSIST_ABANDON_EVIDENCE if evidence MEMORY_VERIFIED; APPEND_WITNESS_ABANDON only if DURABLE_VERIFIED (§3.4C) | required separately per action | either publish/fsync exact evidence package OR append/fsync exact direct ABANDON (preparedFrameDigest null), never both under one instance | consume/reclassify after each; evidence alone stays B2, only durable ABANDON reaches ABANDONED |
| PREPARE; ledger absent; exact sealed bundle valid; all bound facts current and bundle unexpired | exactly one `PUBLISH_LEDGER_TRANSACTION` | required after restart | publish/fsync exact stored `canonical-transaction.jcs` only | consume/reclassify; separate later COMMIT instance required |
| PREPARE; ledger absent; exact sealed bundle valid; expired or bound fact drift | PERSIST_ABANDON_EVIDENCE if evidence MEMORY_VERIFIED; APPEND_WITNESS_ABANDON only if DURABLE_VERIFIED | required separately per action | either §3.4C exact evidence publication OR exact PREPARE-bound ABANDON append/fsync | consume/reclassify each; only durable frame reaches ABANDONED; old operation/bundle never reusable |
| exact matching physical ledger bytes visible at current tip; COMMIT absent | exactly one APPEND_WITNESS_COMMIT, version-3 observation | required after restart | §2.5D ledger-file/full-chain fsync-only prerequisite, all-facts recheck, then exact witness COMMIT append/full durability | failure prevents first witness byte; consume/reclassify COMMITTED despite previously observed drift; stale activation requires §2.5A |

For B1, the authority additionally binds the empty-witness classified-state
digest (§2.5B) and exact prepareFramedByteDigest (§3.4B). B2's independent
evidence and append instances bind respectively the exact evidence manifest
and direct-ABANDON bytes, with §3.4C's durable-evidence prerequisite. B2 never publishes stale candidate or transaction bytes;
its direct ABANDON is not COMMIT and creates no ledger transaction. A later
transaction-zero attempt requires new bootstrap-operation, candidate-set and
publication-bundle identities, the unchanged transaction-zero ledger
predecessor, and the durable ABANDON witness predecessor.

Classes 1–12 and integrity prerequisites offer no mutation and retain their
exact cause-specific quarantine outcomes, including
`INTEGRITY_QUARANTINE_MISSING_OR_CORRUPT_PREPARED_BUNDLE`. Class 13 returns the
existing logical terminal result without append, but §2.5B offers the closed
exact-existing COMMIT action until session relation completion succeeds (before
bundle/suffix flushes); nextAction is not unconditionally null. Integrity
mismatch never authorizes ABANDON or COMMIT.

For uninterrupted initial publication, the original TTY confirmation may chain
normal action instances only under consume → re-read → reclassify → verify-next-
head/action. After exit, every mutation above requires fresh TTY. Successor
publication follows the same discipline without production capability;
ordinary production recovery still requires the actual freshly reissued
`PRODUCTION_RUNTIME_CAPABILITY` and the same one-mutation split.

The journal detects accidental truncation while it survives, ledger/journal
divergence and incomplete local writes. It does not resist coordinated
replacement, same-UID attack or full-machine rollback.

### 4.5 Mutation coverage and class eligibility (V9)

Every durability/parent-fsync term in this table means §2.5D's complete
verified chain, including reused ancestors. §2.3 is the single controlling
fully-populated-directory order for both bundles. Before the ordinary stage
eligibility below, a complete COMMIT with no valid relation knowledge first
requires COMPLETE_EXACT_EXISTING, even if bundle VISIBLE_VERIFIED or suffix
present. Only then may bundle/suffix completion flush witness/shared ancestors.
Otherwise VISIBLE_VERIFIED requires PERSIST_PREPARED_BUNDLE exact-existing
completion; it has no content writes and remains one action.
The v2 capsule and private observation versions are mandatory (§§2.3C/2.5B).

C30-13 remains the sole issuer. Bootstrap class permits eight actions subject
to each state; successor class permits seven, **never initialization**. Fixture
class permits none on real storage; production capability is not accepted as a
substitute for these narrow bootstrap/successor action instances. Ordinary
production owner APIs retain their existing separate guards. A0/C30-12 planning
are read-only. Every row consumes/discards its one opaque instance, re-reads
and reclassifies before another. Rows enumerate internal effects of one logical
operation; none grants incidental receipt/log/registry/cleanup writes.

| Operation | Issuer / eligible state | Exact inputs/bytes | Allowed internal effects | Durability point → next state | Crash recovery |
|---|---|---|---|---|---|
| INITIALIZE_WITNESS_JOURNAL | C30-13 bootstrap only; PRE_JOURNAL genuine absence | §2.5C initializationPlan domain digest; exact LCIMWJ01 header | checked missing ancestors, exclusive owned temporary file, checked header write, file/directory fsyncs, no-replace rename, parent fsync; no lock-file/content side writes | final parent fsync → verified header-only; A0 then PRE_PERSISTENCE | §2.5C table; never reset history or reuse temps |
| PERSIST_PREPARED_BUNDLE | C30-13 matching class; current PRE_PERSISTENCE or exact VISIBLE_VERIFIED; complete COMMIT requires §2.5D relation completion before any effect | same raw final publication manifest SHA, v2 capsule and nine/eight entries; existing prefix bound in version-2 observation | §2.3 full staging/full-chain order plus existing-witness completion only after §2.5D priority; exact-existing fsync-only; no ledger/header/evidence content writes | exact bundle SEALED_VERIFIED → reclassify actual stage, not necessarily SEALED_NO_PREPARE; no ledger durability inferred | exact-existing completion with branch ordering; no regenerated candidate/transaction bytes |
| APPEND_WITNESS_PREPARE | C30-13 matching class; B1 | unchanged prepareFramedByteDigest (§3.4B) | only exact frame append, witness/file and required parent fsync; no header, bundle or evidence writes | durable frame → PREPARE_ONLY | suffix truncation separately authorized; consume/reclassify |
| PUBLISH_LEDGER_TRANSACTION | C30-13 matching class; current PREPARE_ONLY | unchanged stored canonical-transaction.jcs SHA | existing exact atomic ledger publication, file/parent fsync only | ledger durable → LEDGER_WITHOUT_COMMIT | exact matching COMMIT, even after drift |
| APPEND_WITNESS_COMMIT | C30-13 matching class; §2.5B closed APPEND_ABSENT or COMPLETE_EXACT_EXISTING (including complete-COMMIT suffix prefix), visible exact tip sufficient | unchanged raw exact COMMIT framed-byte SHA; version-3 digest includes commitBranch, ledgerCommitPrerequisite, PREPARE/terminal/prefix/suffix and union pathBindings | pinned ledger file/full-chain fsync, final recheck, then witness file/full-chain fsync; only APPEND_ABSENT appends; COMPLETE_EXACT_EXISTING appends ZERO bytes/creates ZERO records and precedes bundle/suffix flushes | after all checks store exact owner-session relation key; COMMITTED logical status alone is insufficient; remaining bundle/suffix/current-fact/qualification/TTY prerequisites still gate use | exit/failure discards instance/knowledge; fresh completion repeats every flush; truncate separately after prerequisite, invalidate and re-complete; no duplicate COMMIT or ABANDON |
| TRUNCATE_INCOMPLETE_FINAL_FRAME | C30-13 matching class; identified eligible INCOMPLETE_TAIL; complete-COMMIT prefix requires prior exact relation completion and sealed bundle | unchanged §2.5B domain/prefix/suffix digest, version 2 | exact suffix truncation/fsync only, never header or complete frame | consume/invalidate relation knowledge; reclassify; complete terminal COMMIT requires fresh fsync-only completion | no append or ledger flush under truncation; new confirmation/instance |
| PERSIST_ABANDON_EVIDENCE | C30-13 matching class; eligible stale B2/PREPARE_ONLY, evidence MEMORY_VERIFIED | §3.4C final evidence-manifest.jcs raw SHA binding all eleven entries, proposal/current heads | checked missing ancestors, exclusive staging/files, exact payload/manifest/SEALED writes/fsyncs, full directory fsync, no-replace rename, parent fsync; or exact-existing fsync-only completion | package durable → same stage, evidence DURABLE_VERIFIED; no witness event | §3.4C table; retain unselected staging/packages, no cleanup |
| APPEND_WITNESS_ABANDON | C30-13 matching class; eligible stale B2/PREPARE_ONLY, evidence DURABLE_VERIFIED | unchanged exact frame SHA; matching package bound by classified-state digest | only exact frame append and witness/required parent fsync; evidence precondition verified before first byte | frame durable → ABANDONED with retrievable evidence | §3.4C table; missing/corrupt selected evidence quarantines |

For support paths, all checked ancestors of the **existing** bundle or ledger
targets remain within their named persistence/publication operation under
§2.5D, including reused unflushed links and explicitly authorized existing
witness-prefix completion. These are bounded metadata effects; §2.3C expands bundle content and V8
§2.5B/§2.5D expand COMMIT's private observation and ledger-fsync effects.
No public field or COMMIT framed-byte SHA algorithm is changed. Append/truncation never create their
journal or parents. All locking is the no-file-write primitive in §2.5C.
No disk receipt/log is required to return success or reclassify these actions;
status receipts are memory/read-only projections. There is no new writer left
to an unspecified provisioning or retention service.

## 5. One barrier order

Every dependency barrier, including BL-023, uses exactly:

1. each sibling independently reaches complete current-generation Sol PASS;
2. each sibling emits its current checkpoint generation;
3. each sibling enters `APPROVED_WAITING_AT_BARRIER`;
4. the controller forms a barrier from the exact current sibling generations
   and common base;
5. composition/apply occurs in the declared deterministic order;
6. deterministic combined validation runs;
7. complete barrier FINAL_REVIEW runs;
8. actionable findings trigger combined repair, successor subject, validation,
   exact RECHECK and a new complete FINAL_REVIEW;
9. zero open actionable findings is established;
10. state enters `AWAITING_OPERATOR_CHECKPOINT_COMMIT`;
11. operator creates the grouped commit manually;
12. read-only verification proves the exact parent/tree/manifest/commit;
13. state becomes `BARRIER_COMMITTED`;
14. only the exact verified grouped commit SHA unlocks downstream work.

`APPROVED_WAITING_AT_BARRIER` never appears after barrier FINAL_REVIEW.

## 6. Implementation DAG and runtime activation/delivery

### 6.1 Implementation DAG

Development uses §7 phases A–D, not a G2-before-construction blanket gate.
Final G2 is phase E after complete integration and relevant C30-14 closure.
Phase F alone authorizes runtime activation/use with current G1/G2/G3 and
separate operator authorization. External source review eligibility is §7.3.

- C30-13 implements activation/bootstrap and its exact-tail recovery.
- C30-14 may depend on the verified C30-13 implementation SHA.
- C30-14 implements build, rehearsal and manual-delivery finalization.
- Completing the C30-13 implementation sprint does not mean production
  activation has already been performed.
- Implementing C30-14 does not require a pre-existing production activation
  settlement.

### 6.2 Generation-scoped runtime and post-BL requalification sequence (V9)

This is the **single controlling sequence** for SEQ-V8-P1-01; runtime/release
mirrors incorporate it in full instead of retaining a skipping numbered list.
All effects described are FUTURE protocol requirements, not instructions or
authorization to commit, publish a source generation, invoke a provider or
activate during this amendment. §§7–8's initial A–F construction/qualification
sequence is unchanged. It first supplies accepted generation S, current exact
G1/G2/G3 subjects, complete C30-01–14 integration and verified build/schema inputs.
Only separate operator authorization then permits C30-13 activation, same-session
durable settlement (§2.5D), current-fact/TTY capability issuance and the RC/manual
installation/BL-023 rehearsal. Any relevant source change, including a seeded
repair or seed removal S → S', takes the following recurring path:

1. Invalidate reliance on affected activation/capability, source-review,
   checkpoint descendants, build/release and gate evidence. Retain all historical
   evidence unchanged and identify exact changed subjects, not global PASS flags.
2. While runtime capability is absent, use the explicitly authorized external
   development-review procedure (§7.3), qualified tools/isolation/finite controls
   and locked Flash/Sol roles. No stale runtime capability or fabricated runtime
   review/accounting record is a prerequisite to reviewing its replacement.
3. For the exact candidate S', complete clean deterministic validation,
   applicable exact RECHECK and a complete seed-free FINAL_REVIEW with zero
   actionable findings. Ordinary FINAL_REVIEW is **not G2** or source adoption.
4. With an applicable **currently qualified verifier**, prepare the exact reviewed
   overlay against the clean accepted parent **before staging**, retaining the
   immutable manifest/proof under the existing external contract (§7.2/Bootstrap).
5. The operator separately authorizes and creates the exact-path local commit;
   no worker/controller runtime or publication authority creates this Git commit.
6. Verify the clean successor commit/parent/tree against that prepared reviewed
   subject with an applicable qualified verifier. Reject outside changes, stale
   proof, unreviewed bytes and mismatched tools; preserve source/index/refs.
7. Separately authorize the qualified external source-registry owner to accept
   the exact verified successor under lock/CAS. Git commit alone is not acceptance.
8. For this **accepted generation**, independently establish applicability of
   every affected gate. Renew **full integrated G2** if any of its exact reviewed
   source/executable/dependency/packaging closure changed; renew G1/G3 if their
   subjects changed. Verified unchanged in-scope subjects may carry only with an
   explicit current applicability decision for S'. Missing, uncertain, failed,
   wrong-generation or stale applicability denies use; a PASS for S is not PASS
   for a changed S' subject. Reverify/regenerate affected build/release evidence
   for these bytes; no old rehearsal/build result is relabeled as new evidence.
9. Only accepted current source identity, all current required qualifications,
   verified build/schema inputs and **separate operator successor authorization**
   permit C30-13 read-only successor preflight/TTY and the existing four-candidate,
   seven-action successor path (§2.5A), while capability is absent.
10. Require durable successor settlement through §§2.5B/2.5D, reverify exact current
    generation/facts, display and obtain existing fresh-TTY confirmation before
    capability and C30-14 final-delivery eligibility. Only current seed-free
    activation plus all BL-023/BL-028/release/provenance requirements permits
    `lcim.manual-delivery-manifest@1` and `DELIVERY_READY_MANUAL`.

**Subject applicability / first use.** The external acceptance owner compares
exact input identities and dependency closures with independent gate owners:
G1 verifier/support/schema/tool/source-administration subject; G2 full integrated
reviewed source/executables/dependencies/packaging subject; G3 procedure/guidance/
authority-scope subject. Calling a change "seed removal" exempts nothing.
Unchanged subjects are not automatically rerun, but carry-forward must bind old
approval, unchanged in-scope identities, accepted target generation and current
applicability. Unknown closure is denial. Any changed verifier must be qualified
**before its first authoritative prepare/verify/CAS use**, using §7's external
procedure to qualify the actual changed subject; it cannot produce the checkpoint
needed for its own qualification. Use an applicable still-qualified verifier or
stop until the changed one is independently qualified. Candidate qualification
and later applicability to the accepted generation are distinct decisions.
U1–U5 remain explicit unmet prerequisites; no tools are assumed qualified.

**Repeated change and interruption.** A repair during requalification creates
S'' and restarts step 1 for affected descendants/subjects, including decisions
already obtained for S'. This is a lifecycle over generations, not a cycle in
§8.2's single-generation initial DAG. The following resume points use retained
exact evidence and the existing qualified external recovery/authorization rules;
no new records/registry implementation are specified here:

| Last retained phase | Required resume verification / next step |
|---|---|
| reviewed candidate | revalidate exact candidate/parent, complete review/RECHECK/seed absence and tool applicability; missing/stale proof repeats review, never assumes PASS; then step 4 |
| prepared manifest | verify immutable manifest/review/parent/overlay and qualified verifier identity before staging; changed overlay invalidates preparation/review; then separately authorized step 5 |
| operator commit | inspect exact existing commit/parent/tree and prepared subject; if matching, do not duplicate commit, proceed to step 6; uncertain/partial staging follows existing checkpoint recovery, no automatic commit |
| verified successor | reverify exact proof, clean successor and current registry predecessor under owner lock; then separately authorized CAS (step 7) |
| registry CAS | resolve current accepted head/proof under lock: exact accepted successor returns the existing acceptance, not another CAS generation; absent acceptance needs fresh authorization; conflict/supersession denies |
| qualification decision | reverify accepted generation, each exact subject/approval and carry applicability; only missing/changed subjects need renewal; no persisted global G2 Boolean survives a changed subject; then separately authorized step 9 |
| successor activation | inspect existing publication state; §§2.5B/2.5D/4.4 govern fresh one-use completion/truncation, not new publication or duplicate COMMIT; process loss loses capability/knowledge and requires completion plus current qualification/fact/fresh-TTY checks |

Each resume also checks accepted-parent/current-head non-supersession and task/
operator authorization; an unprovable handoff denies, not an invented completed
step. Remote publication, push, PR, CI, merge and production verification remain
outside LCIM 3.0.

```lifecycle-v9
{"version":9,"steps":["invalidate","external-review","validate-recheck-final","prepare-before-stage","operator-commit","verify-successor","registry-cas","gate-applicability","successor-authorization","durable-current-tty"],"gates":["G1","G2","G3"],"resume":["reviewed-candidate","prepared-manifest","operator-commit","verified-successor","registry-cas","qualification-decision","successor-activation"]}
```

## 7. External development procedure and exact source-checkpoint handoff

### 7.1 Proposed phase predicates — not completed phases

This is a proposed normative sequence. This documentation amendment grants no
policy/procedure adoption, qualification, construction or runtime permission.
The former blanket G1/G2/G3-before-all-implementation predicate is replaced,
not retained as a second gate. Candidate construction/testing is **real
implementation**, explicitly permitted only conditionally below, not renamed
preparation. Never require the unfinished LCIM runtime to build or review itself.

| Phase | Required-before predicate and permitted effect |
|---|---|
| A — documentation/procedure adoption | independent acceptance of amended external procedure/authority scope, applicable G3 approval and operator adoption; actual external-tool qualification remains unmet until separately evidenced; this edit supplies none |
| B — standalone Bootstrap candidate construction | A, actually accepted/qualified external development tools/isolation/spend controls, and explicit finite construction authorization; external operator-controlled workflow may implement/test the final verifier and minimum source-administration support in isolated candidate storage; **G1 not required before constructing its own review subject**; no real checkpoint/head publication or runtime activation |
| C — G1 qualification and separate Bootstrap adoption | G1 reviews actual final verifier/support/schema/tool identities and complete evidence after B; only current G1 approval plus separate operator authorization permits qualified prepare/verify and registry CAS to accept the real Bootstrap successor |
| D — C30 development | current applicable G1/G3 qualification, accepted external procedure/tools, explicit per-task authorization, accepted Bootstrap and exact current immediate predecessor; C30-01 through C30-14 remain dependency-ordered; **G2 not required before constructing its review subject**; no runtime activation |
| E — final integrated qualification | full G2 waits for actual transitive implementation and evidence; C30-07 alone is insufficient; C30-13 integration is the earliest possible complete source point, with all relevant C30-14 packaging/closure changes included in the final subject; schedule final qualification after complete integration, not at C30-07; design/prototype/mock assertions alone are not full G2 approval |
| F — activation/use | all applicable current G1/G2/G3 approvals, complete implementation/integration evidence, exact current source/executable/dependency/configuration identities and separate operator authorization; C30-13 alone performs runtime activation and issues capability only after the required durable matching COMMIT; development completion is not activation |

Candidate tests use isolated fixtures, synthetic credentials and local mock
endpoints only. No production credentials/state or live candidate-provider
calls before qualification. External development-model requests, if separately
authorized, use separately accepted external tools, isolation and finite
**enforceable upstream-request and spend controls**; stock/manual Pi and session
counts are not assumed to enforce these controls. No numeric budgets or tool
readiness are asserted here. Locked future source roles remain Flash
implementation/repair (`deepseek-v4-flash`, Pi `max`, policy `MAX`) and independent
Sol review (`openai-codex` / `gpt-5.6-sol`, `XHIGH`), externally orchestrated until
runtime qualification. This manually requested Luna **DOCUMENTATION** edit is
not an authorized runtime implementation-worker claim or route exception.

### 7.2 Standalone Bootstrap ownership before C30-01

The external Bootstrap owner must construct and qualify **before any mandatory
pre-C30 handoff**: future `bin/lcim-source-checkpoint.mjs`; full verifier/tool/
import/schema/canonicalization closure; immutable preparation/proof outputs;
source-generation registry/head/CAS including initialization and crash recovery;
review/validation acceptance; currentness, source-only admission and consumed-
generation evidence; early handoffs; and finite retained proof-input export
needed by §2.3C's prepared-input capsule. These are future implementation
responsibilities, **not files or a registry to create now**. Candidate stores
are not authoritative source heads. The external owner must not depend on
C30-01 session records, C30-03 runtime journals, C30-05 accounting, C30-07 review
transport or C30-13 capability for this development workflow.

C30-11 integrates/extends the **already G1-qualified** verifier and its runtime
checkpoint consumers; C30-12 integrates lineage/recovery consumers. Neither
is first availability of mandatory Bootstrap support. Their changes invalidate
applicable qualification and require review/requalification before authoritative
acceptance. AWAITING_OPERATOR_CHECKPOINT_COMMIT is a **runtime operation
prerequisite**, not a prerequisite to implementing C30-11.

The operator procedure is: clean exact parent → exact reviewed candidate
overlay → prepare **before staging** → operator exact-path staging/local commit
→ clean-successor verify → separately authorized registry publication under
lock/CAS. The intended overlay is not a dirty-worktree failure: prepare rejects
anything **outside** that exact overlay and any staging, not the intended
changes. Prepare/verify read source/index/refs without mutation but explicitly
write their named external immutable manifest/proof outputs; registry/head
writes belong only to the separately authorized qualified source owner.

### 7.3 External review eligibility and source-qualification consumers

Accepted source reviews carry **EXTERNAL_DEVELOPMENT_REVIEW** provenance.
Eligibility requires independent author/reviewer roles and the exact locked
routes; immutable complete source/evidence universe and tool identities;
scanning and deterministic validation before review; complete coverage with
zero actionable findings; and repair → successor scan/validation → exact
RECHECK → new complete FINAL_REVIEW until PASS. RECHECK alone never accepts
source. Retain safe exact inputs/results and validation/coverage/repair lineage;
qualified external checkpoint acceptance must verify all bindings/currentness.
"Run Pi" or a manual PASS statement is not an acceptance procedure.

These are **source-qualification inputs**, not runtime Sol calls, runtime
finding/accounting events or production capabilities. Source reviews do not
need production capability and must never fabricate runtime records to qualify
LCIM's own implementation. C30-13 activation and C30-14 source delivery may
consume accepted external coverage/zero-finding/response lineage through the
qualified external acceptance/proof contract. In §§3.5/3.6, the existing
reviewCoverageStatus/solReviewLineageStatus literals describe accepted complete
Sol source qualification, not proof a runtime invocation occurred. Their
existing digest/ID fields resolve to the exact accepted coverage, zero-finding
and Sol response inputs with EXTERNAL_DEVELOPMENT_REVIEW provenance retained
in the external acceptance proof; no public field/family is added. Consumers
must validate that provenance, subject/tool identities, complete coverage and
currentness, and reject unrecognized formats or bare digests. Runtime review
inputs, when used, still require actual qualified runtime authority/accounting;
external inputs cannot impersonate them. The closed external acceptance
formats and consumer validation remain an unresolved prerequisite (§8.1), not
an invented implemented schema or a claim of accepted reviews.

### 7.4 Common development Start contract


Exactly fourteen active C30 sprint documents remain, C30-01 through C30-14,
in numeric implementation order. Exactly five active core ICRs remain,
ICR-2026-030 through ICR-2026-034. C30-01A/C30-01B do not exist and must not be
created.

Every active sprint contains the following normative Start/dependency block,
with only `PREDECESSOR_ID` replaced by its immediately preceding checkpoint
identifier:

## Normative Start/dependency gate

Before any development worker, reviewer, validation or provider launch:

1. verify the accepted external procedure, applicable current G1/G3 qualification,
   qualified external tools/isolation/request-spend controls and exact task authorization;
2. acquire the qualified external source-registry owner lock **before resolving**
   `PREDECESSOR_ID`'s current source-checkpoint generation;
3. verify predecessor sprint identity, generation, current head and non-supersession;
4. verify exact reviewed commit/tree, immutable checkpoint proof and complete
   accepted source review/validation evidence;
5. bind current development guidance, semantic/task contract, configuration and
   locked routing identities, **not fabricated runtime session/plan/budget records**;
6. record source-only admission and the consumed generation under the qualified
   external owner; create/verify the development checkout through external tooling
   at that exact current commit, then release the lock;
7. recheck currentness under that lock before every launch and checkpoint acceptance;
   deny stale/non-current/unverified/superseded/mismatched inputs before work;
8. accept successor source only through qualified prepare/verify, operator-created
   exact-path local commit and **separately authorized registry publication under lock/CAS**.

Unavailable procedure, qualification, tools or task authorization denies development
advancement. Source mismatch is `DENIED_STALE_OR_UNVERIFIED_SOURCE_CHECKPOINT`.
No runtime capability, runtime finding/accounting event or runtime publication
record substitutes for external admission. G2 is not a C30 construction prerequisite;
authoritative runtime use still requires all applicable current G1/G2/G3 approvals.

The C30-01 predecessor is `BOOTSTRAP_CHECKPOINT_V2`; C30-02 through C30-14 use
the immediately preceding C30 sprint ID. The external registry owner lock and
current-successor check prevent a formerly valid but superseded SHA from
starting work.

## 8. Independent review gates

The gates are independent, identity-bound review decisions, not source-building
permissions. §7's conditional phase predicates control development; runtime
activation/use requires all applicable current approvals and separate operator
authorization. G1 remains INDEPENDENT_REVIEW_PENDING; G2 remains
INDEPENDENT_SECURITY_REVIEW_PENDING; G3 remains
CHANGES_REQUIRED_PENDING_FRESH_REREVIEW. Independent combined V8 review returned
CHANGES_REQUIRED for G3-V8-P1-01 and SEQ-V8-P1-01. Their bounded V9 amendments do
not independently resolve parent G3-V7-P1-01 or change that historical verdict.
A future G3 PASS
records LOCAL_AUTHORITY_SCOPE_APPROVED only; it cannot approve G1/G2, tools,
construction tasks or operator adoption. Frozen V7 and every earlier packet,
capture and validator remain immutable; no packet is generated by this edit.

### 8.1 Unresolved prerequisite register — absence denies dependent phases

| Prerequisite | Accountable future owner | Required before | Evidence needed (not supplied here) |
|---|---|---|---|
| U1 actual external tool identities, isolation and spend-control qualification | external development operator/tool owner; independent procedure/security acceptors | B construction and every external development-model request; D launches | exact executable/import/configuration/routes, isolation probes, credential/state separation, enforceable finite upstream-request/spend control and failure/recovery evidence; stock/manual Pi/session counts insufficient |
| U2 final Bootstrap schemas/storage/recovery contract and evidence | standalone Bootstrap/source-administration owner; G1 reviewers | candidate contract accepted before B tests; final identities/complete evidence before G1 and C real adoption; all mandatory support before C30-01 | closed schemas, full verifier/tool/import/canonicalization closure, immutable output/storage/initialization/lock/CAS/crash tests, currentness/admission/consumed-generation and retained proof export |
| U3 closed external-review acceptance formats and consumer validation | external review/acceptance owner with G1; C30-13/14 consumer owners | G1 acceptance of actual source-review evidence, C source adoption and D handoffs; validated consumers before F/source delivery | exact immutable safe inputs/results, independent roles/routes, complete coverage/zero findings, repair/validation/RECHECK/FINAL_REVIEW lineage, EXTERNAL_DEVELOPMENT_REVIEW provenance and rejection tests |
| U4 actual final G2 source/executable/dependency closure | C30-07 transport owner, C30-13 integration and C30-14 packaging owners; independent G2 reviewers | E final G2, then F activation/use | actual transitive final implementation, sealed entry/loader/FD-3/egress/accounting/cleanup identities, integrated negative/crash/security evidence; C30-07/design/prototype/mock assertions alone insufficient |
| U5 gate evidence demanding prohibited preapproval live effects | demanding gate owner with independent procedure/security acceptors and operator | any phase needing that evidence; certainly before its approval/use | explicit identification of the conflict and independently accepted non-live evidence method or separately approved bounded procedure; no waiver, concealed live effects or circular runtime self-qualification |

Every entry is unresolved. No actual tool, numeric budget, test result or
approval is fabricated. Applicable G1/G3 must remain current across candidate
changes; G2 must cover the final integrated subject including relevant C30-14
changes. A qualification loss denies the affected dependent phase.

### 8.2 PHASE DEPENDENCY GRAPH (declared documentation model)

The following finite graph encodes §7's proposed ordering. `requires` names
independently evidenced, **current** predicates, not accomplished facts.
C30-XX nodes represent development **and accepted source checkpoints**; completion
requires the source-only acceptance protocol, not runtime activation. Edges
never require G1 before B or G2 before D. G2 is scheduled after C30-14 closes
integration; C30-13 is the earliest possible complete source point, not proof
that packaging leaves its final closure unchanged. §13 tests missing predicates
and edges as a model of this declared graph, not arbitrary prose correctness,
actual external-tool qualification or implementation readiness.

```phase-graph-v8
{"A":{"after":[],"requires":["independentProcedureAcceptance","applicableG3","operatorAdoption"]},"B":{"after":["A"],"requires":["externalToolsQualified","finiteConstructionAuthorization","candidateContractAccepted"]},"G1":{"after":["B"],"requires":["finalBootstrapIdentities","completeBootstrapEvidence","closedReviewAcceptance","independentG1Approval"]},"BOOTSTRAP_ADOPTED":{"after":["A","G1"],"requires":["currentG1G3","operatorBootstrapAuthorization","qualifiedPrepareVerify","registryCAS"]},"C30-01":{"after":["BOOTSTRAP_ADOPTED"],"requires":["currentG1G3","acceptedProcedure","externalToolsQualified","taskAuthorization","exactCurrentPredecessor","acceptedSourceReview","qualifiedCheckpointCAS"]},"C30-02":{"after":["BOOTSTRAP_ADOPTED","C30-01"],"requires":["currentG1G3","acceptedProcedure","externalToolsQualified","taskAuthorization","exactCurrentPredecessor","acceptedSourceReview","qualifiedCheckpointCAS"]},"C30-03":{"after":["BOOTSTRAP_ADOPTED","C30-02"],"requires":["currentG1G3","acceptedProcedure","externalToolsQualified","taskAuthorization","exactCurrentPredecessor","acceptedSourceReview","qualifiedCheckpointCAS"]},"C30-04":{"after":["BOOTSTRAP_ADOPTED","C30-03"],"requires":["currentG1G3","acceptedProcedure","externalToolsQualified","taskAuthorization","exactCurrentPredecessor","acceptedSourceReview","qualifiedCheckpointCAS"]},"C30-05":{"after":["BOOTSTRAP_ADOPTED","C30-04"],"requires":["currentG1G3","acceptedProcedure","externalToolsQualified","taskAuthorization","exactCurrentPredecessor","acceptedSourceReview","qualifiedCheckpointCAS"]},"C30-06":{"after":["BOOTSTRAP_ADOPTED","C30-05"],"requires":["currentG1G3","acceptedProcedure","externalToolsQualified","taskAuthorization","exactCurrentPredecessor","acceptedSourceReview","qualifiedCheckpointCAS"]},"C30-07":{"after":["BOOTSTRAP_ADOPTED","C30-06"],"requires":["currentG1G3","acceptedProcedure","externalToolsQualified","taskAuthorization","exactCurrentPredecessor","acceptedSourceReview","qualifiedCheckpointCAS"]},"C30-08":{"after":["BOOTSTRAP_ADOPTED","C30-07"],"requires":["currentG1G3","acceptedProcedure","externalToolsQualified","taskAuthorization","exactCurrentPredecessor","acceptedSourceReview","qualifiedCheckpointCAS"]},"C30-09":{"after":["BOOTSTRAP_ADOPTED","C30-08"],"requires":["currentG1G3","acceptedProcedure","externalToolsQualified","taskAuthorization","exactCurrentPredecessor","acceptedSourceReview","qualifiedCheckpointCAS"]},"C30-10":{"after":["BOOTSTRAP_ADOPTED","C30-09"],"requires":["currentG1G3","acceptedProcedure","externalToolsQualified","taskAuthorization","exactCurrentPredecessor","acceptedSourceReview","qualifiedCheckpointCAS"]},"C30-11":{"after":["BOOTSTRAP_ADOPTED","C30-10"],"requires":["currentG1G3","acceptedProcedure","externalToolsQualified","taskAuthorization","exactCurrentPredecessor","acceptedSourceReview","qualifiedCheckpointCAS"]},"C30-12":{"after":["BOOTSTRAP_ADOPTED","C30-11"],"requires":["currentG1G3","acceptedProcedure","externalToolsQualified","taskAuthorization","exactCurrentPredecessor","acceptedSourceReview","qualifiedCheckpointCAS"]},"C30-13":{"after":["BOOTSTRAP_ADOPTED","C30-12"],"requires":["currentG1G3","acceptedProcedure","externalToolsQualified","taskAuthorization","exactCurrentPredecessor","acceptedSourceReview","qualifiedCheckpointCAS"]},"C30-14":{"after":["BOOTSTRAP_ADOPTED","C30-13"],"requires":["currentG1G3","acceptedProcedure","externalToolsQualified","taskAuthorization","exactCurrentPredecessor","acceptedSourceReview","qualifiedCheckpointCAS"]},"G2":{"after":["C30-14"],"requires":["actualTransitiveV3Closure","completeIntegrationEvidence","finalPackagingClosure","independentG2Approval","lawfulGateEvidence"]},"ACTIVATION":{"after":["G1","G2","C30-14"],"requires":["currentG1G2G3","exactCurrentIdentities","completeIntegrationEvidence","operatorActivationAuthorization"]},"CAPABILITY":{"after":["ACTIVATION"],"requires":["C30-13Issuer","durableMatchingCOMMIT","currentConfirmedFacts"]}}
```

## 9. Finding matrix and readiness

INDEPENDENT_REREVIEW_PASS rows below retain their **historical prior-scope
attribution** only. They do not accept V8's changed phase policy, Start contracts
or COMMIT effects. No G1/G2/G3 PASS is created by this documentation amendment.

| Finding | Status |
|---|---|
| prior A — acyclic two-digest bootstrap identity | `INDEPENDENT_REREVIEW_PASS` |
| prior B — byte-complete persisted recovery bundle | `INDEPENDENT_REREVIEW_PASS` |
| prior C — one mutation per authority instance | `INDEPENDENT_REREVIEW_PASS` |
| prior D — non-deadlocking PREPARE termination | `INDEPENDENT_REREVIEW_PASS` |
| prior E — exhaustive incomplete-frame classification | `INDEPENDENT_REREVIEW_PASS` |
| prior F — canonical JCS examples | `INDEPENDENT_REREVIEW_PASS` |
| prior G — replay precedence mirrors | `INDEPENDENT_REREVIEW_PASS` |
| prior H — separated signer status vocabulary | `INDEPENDENT_REREVIEW_PASS` |
| prior I — six families/five bootstrap candidates | `INDEPENDENT_REREVIEW_PASS` |
| prior NEW-01 bootstrap construction/recovery authority | `INDEPENDENT_REREVIEW_PASS` |
| prior NEW-02 six closed local schemas | `INDEPENDENT_REREVIEW_PASS` |
| prior NEW-03 exhaustive witness recovery | `INDEPENDENT_REREVIEW_PASS` |
| G3-V6-P1-01 — prepared preimages retained (§2.3C) | `PLAN_AMENDED_PENDING_G3_REREVIEW_V7` |
| G3-V6-P1-02 — complete reused-ancestor durability (§2.5D) | `PLAN_AMENDED_PENDING_G3_REREVIEW_V7` |
| G3-V6-P1-03 — fully populated staging order (§2.3) | `PLAN_AMENDED_PENDING_G3_REREVIEW_V7` |
| V5 P1-1/P1-2 — initialization/evidence, now with V7 persistence prerequisites | `PLAN_AMENDED_PENDING_G3_REREVIEW_V7` |
| V5 A/B/C — public calculations retained; private formats explicitly amended in §§2.3C/2.5B/3.4C | `PLAN_AMENDED_PENDING_G3_REREVIEW_V7` |
| historical latest D — prior C30-01 stale-fact reconciliation | `INDEPENDENT_REREVIEW_PASS` (prior attribution only; V8 rule 3 deliberately amended) |
| G3-V7-P1-01 — physical ledger durability before witness COMMIT | prior V8 amendment retained; independent combined V8 verdict CHANGES_REQUIRED, not independently resolved here |
| G3-V8-P1-01 — complete-terminal durability completion | `AMENDED_PENDING_INDEPENDENT_V9_REVIEW` |
| SEQ-V8-P1-01 — post-BL checkpoint adoption and requalification | `AMENDED_PENDING_INDEPENDENT_V9_REVIEW` |
| development-versus-qualification sequencing | `PROPOSED_POLICY_PENDING_ADOPTION_AND_QUALIFICATION` |
| V5 E — ordered byte parser preserved (§§4.1/4.3/4.4) | `PLAN_AMENDED_PENDING_G3_REREVIEW_V7` |
| NEW-04 active guidance | `INDEPENDENT_REREVIEW_PASS` |
| NEW-05 barrier order | `INDEPENDENT_REREVIEW_PASS` |
| NEW-06 review-gate order | `INDEPENDENT_REREVIEW_PASS` |
| seed-free successor activation before manual delivery / BL-023 ordering | `INDEPENDENT_REREVIEW_PASS` |
| exact per-sprint source handoff | `INDEPENDENT_REREVIEW_PASS` |
| `SIGNER_V4_CONTROLLER_ATTESTATION` | `BLOCKED_PENDING_STRONGER_MACOS_EXECUTABLE_ATTESTATION` |
| `LCIM_3_0_SIGNER_GATE` | `REMOVED_BY_SCOPE_DECISION` |
| `LCIM_3_1_EXTERNAL_OPERATOR_SIGNER` | `DEFERRED_TO_LCIM_3_1` |
| G1 | `INDEPENDENT_REVIEW_PENDING` |
| G2 | `INDEPENDENT_SECURITY_REVIEW_PENDING` |
| G3 | `CHANGES_REQUIRED_PENDING_FRESH_REREVIEW` |
| LCIM implementation | `BLOCKED` |

```text
READINESS: READY_FOR_V9_DOCUMENTATION_REVIEW
```

## 10. Fifth-amendment executable documentation fixtures (historical calculations)

All concrete private v1 bundle/PREPARE/state examples and pins in §§10–11 are
historical, **not V7 conformance or issuance inputs**. The fixture-v5 fence stays
byte-identical to retain public calculations, reason combinations and parser
regressions; no missing v2 capsule is bypassed in active §12 verification.

**Preserved V5 calculation baseline:** this fence and its pinned outputs remain
byte-identical to V5. Its 13-field classified objects are historical projections,
not current issuance observations: §2.5B now adds terminalization, and stale
nextAction first selects evidence persistence. §11 executes the V6 transitions;
no V5 state fixture authorizes an ABANDON without durable evidence.

These are in-memory contract calculations, not LCIM implementation, authority
issuance, filesystem durability, runtime security or G3 approval. No provider,
credential, package, production module or external service is used. The six
§3 JSON examples remain **illustrative identities**: their syntax/JCS is
checked, but their all-zero/repeated IDs are not claimed verified. The fixtures
below replace identities by computed nonzero values. `inputs` supplies synthetic
owner-binding values by hashing the non-secret labels shown here; these labels
are **not** real plan declarations, source proofs or current review evidence,
and their label hashes are not claimed C30-02 plan-identity verification.
The verified unit inputs for PREPARE are the canonical stored byte strings,
descriptors, transaction identities and identity-checked matching predecessor
observations, not verification of all external leaf-value provenance.
Source/review truth, full historical
source/ledger lineage and real controlling-TTY/durability checks remain
**documentation reasoning**, not executed evidence.

The fixture canonicalizer supports only ASCII strings/member names, null,
Booleans, nonnegative safe integers, arrays and string-keyed objects. On that
domain its recursive sorted compact JSON is JCS-equivalent; it is **not a
complete generic RFC 8785 implementation**. Parser fixtures exercise only that
canonical domain plus the explicit malformed inputs. Non-ASCII normalization,
full ECMAScript number serialization and resource-limit runtime behavior are
not tested. All emitted JSON lines are complete canonical input/preimage
objects, not abbreviated descriptors; all emitted hex is exact bytes, not an
illustration. Large inputs use exact repetition/slicing expressions, not an
unspecified payload. Reproduce with this exact read-only command from the
worktree (the only executed code fence is the named one in this current master):

```bash
python3 - <<'PY'
from pathlib import Path
s = Path('docs/v2-sprints/00B_MASTER_PLAN_LCIM_3_0_CORE.md').read_text()
code = s.split('```python fixture-v5\n', 1)[1].split('\n```', 1)[0]
exec(compile(code, '<documentation-fixture-v5>', 'exec'), {'SOURCE': s})
PY
```

```python fixture-v5
import base64, copy, hashlib, json, re

def H(b):
    return hashlib.sha256(b).hexdigest()

def J(x):
    def check(v):
        if v is None or type(v) is bool:
            return
        if type(v) is int:
            assert 0 <= v <= 9007199254740991
        elif type(v) is str:
            assert v.isascii()
        elif type(v) is list:
            for a in v: check(a)
        elif type(v) is dict:
            for k, a in v.items():
                assert type(k) is str and k.isascii()
                check(a)
        else:
            raise AssertionError('outside fixture JCS domain')
    check(x)
    return json.dumps(x, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()

def DH(domain, x):
    return H(domain.encode('ascii') + bytes([0]) + J(x))

def exact(x, names):
    assert type(x) is dict and set(x) == set(names.split())

def reject(f, x):
    try: f(x)
    except (AssertionError, KeyError, ValueError, TypeError): return
    raise AssertionError('negative case accepted')

def emit(name, x):
    b = x if type(x) is bytes else J(x)
    print(name, b.decode('ascii'))
    print(name + '_SHA256', H(b))

raw_examples = re.findall(r'```json\n([^\n]+)\n```', SOURCE)
T = [json.loads(x) for x in raw_examples]
assert len(T) == 6
for raw,x in zip(raw_examples,T): assert J(x) == raw.encode('utf-8')
print('PUBLIC_FAMILY_CANONICAL_EXAMPLES', len(T), 'syntax only')

repo = 'repo_' + H(b'fixture repository')
run = 'run_' + H(b'fixture run')[:32]
op = 'op_' + H(b'successor operation')[:32]
oldop = 'op_' + H(b'predecessor operation')[:32]
created = '2026-03-09T00:00:00.000Z'
expires = '2026-03-09T00:01:00.000Z'
path = '/controller-fixture/witness.journal'
journal = 'journal_' + DH('LCIM-LOCAL-WITNESS-JOURNAL-v1',
    dict(repositoryId=repo, runId=run, absoluteCanonicalJournalPath=path))
inputs = {k: H(('fixture ' + k).encode()) for k in (
    'semanticContractDigest', 'activeGuidanceDigest', 'configurationDigest',
    'modelRoutingDigest', 'planDeclarationDigest', 'reviewCoverageDigest',
    'zeroOpenFindingDigest', 'capabilityManifestDigest')}
source = 'srcgen_' + H(b'fixture source generation')
commit, tree = H(b'fixture commit'), H(b'fixture tree')
ids = {'recordId', 'generationId', 'recordDigest'}

def finish(x):
    x = {k: v for k, v in x.items() if k not in ids}
    tag = x['schemaName'].replace('lcim.', '').upper()
    rid = 'rec_' + DH(tag.replace('LOCAL-', 'LCIM-LOCAL-', 1)
        .replace('MANUAL-', 'LCIM-MANUAL-', 1) + '-ID-v1', x)
    x.update(recordId=rid, generationId=rid)
    x['recordDigest'] = DH(tag.replace('LOCAL-', 'LCIM-LOCAL-', 1)
        .replace('MANUAL-', 'LCIM-MANUAL-', 1) + '-DIGEST-v1', x)
    return x

def record_check(x):
    t = next(a for a in T if a['schemaName'] == x['schemaName'])
    assert set(x) == set(t) and x == finish(x)
    assert x['schemaVersion'] == 1
    assert x['expectedCurrentHead'] == x['predecessorGenerationId']
    for k, v in x.items():
        if k.endswith('Digest'): assert re.fullmatch('[0-9a-f]{64}', v)
        if k in ('recordId', 'generationId'):
            assert re.fullmatch('rec_[0-9a-f]{64}', v)
    if x['schemaName'] == 'lcim.local-budget-ceiling':
        assert len(x['ceilings']) == 6
        for a, b in zip(x['ceilings'], T[2]['ceilings']):
            exact(a, 'requestClass confirmedCeiling')
            assert a['requestClass'] == b['requestClass']
            assert type(a['confirmedCeiling']) is int and 0 <= a['confirmedCeiling'] <= 9007199254740991
        assert x['reason'] in ('INITIAL', 'INCREASE', 'DECREASE')

# Fixed predecessor budget is a complete, identity-checked public record.
budget0 = copy.deepcopy(T[2])
budget0.update(repositoryId=repo, runId=run, operationId=oldop,
    ttyConfirmationOperationId=oldop, sourceGenerationId=source, observedAt=created,
    **{k: inputs[k] for k in ('planDeclarationDigest','configurationDigest','modelRoutingDigest')})
for a in budget0['ceilings']: a['confirmedCeiling'] = 12
budget0 = finish(budget0); record_check(budget0)
# Prior session/plan/activation heads are fixed synthetic input observations.
prior = ['rec_' + H(('prior ' + k).encode()) for k in ('session', 'plan', 'activation')]

def candidate(i):
    x = copy.deepcopy(T[i])
    for k in inputs:
        if k in x: x[k] = inputs[k]
    for k, v in dict(repositoryId=repo, runId=run, operationId=op,
        sourceGenerationId=source, reviewedSourceGenerationId=source,
        sourceCommit=commit, sourceTree=tree, observedAt=created,
        confirmedAt=created, preparedAt=created, ttyConfirmationOperationId=op,
        bootstrapOperationId=op, operatorConfirmationOperationId=op).items():
        if k in x: x[k] = v
    return x

b = candidate(2)
b.update(predecessorGenerationId=budget0['recordId'], expectedCurrentHead=budget0['recordId'],
    reason='DECREASE', ceilings=copy.deepcopy(budget0['ceilings']))
b = finish(b)
s = candidate(0)
s.update(predecessorGenerationId=prior[0], expectedCurrentHead=prior[0],
    budgetCeilingGenerationId=b['recordId'], budgetCeilingDigest=b['recordDigest'],
    authorityClass='SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY',
    controllerSessionId='session_' + H(b'fixture session')[:32])
s = finish(s)
p = candidate(1)
p.update(predecessorGenerationId=prior[1], expectedCurrentHead=prior[1],
    budgetCeilingGenerationId=b['recordId'], budgetCeilingDigest=b['recordDigest'],
    operatorSessionGenerationId=s['recordId'], operatorSessionDigest=s['recordDigest'])
p = finish(p)
for x in (b, s, p): record_check(x)

# Matching predecessor observations are unit inputs, not an asserted full history.
# Identity verification below checks the exact predecessor frame and ledger bytes.
oldtxcore = dict(schemaName='lcim.controller-transaction', schemaVersion=1,
    protocolVersion='3.0', operationId=oldop, repositoryId=repo, runId=run,
    sequence=6, predecessorHead=H(b'prior ledger prefix'), preparedAt=created,
    events=[], payloadDigest=H(J([])))
def txfinish(x):
    x = copy.deepcopy(x)
    x['transactionId'] = 'lcim_tx_' + DH('LCIM-CONTROLLER-TX-ID-v1', x)
    x['transactionDigest'] = DH('LCIM-CONTROLLER-TX-DIGEST-v1', x)
    x['headDigest'] = DH('LCIM-CONTROLLER-TX-HEAD-v1',
        [x['predecessorHead'], x['sequence'], x['transactionDigest']])
    return x
oldtx = txfinish(oldtxcore)
assert oldtx == txfinish(oldtxcore)
# This is an ordinary predecessor identity fixture, not a new publication projection.
WKEYS = set(T[3]); derived = ids | {'frameDigest', 'headDigest'}
def witness(x):
    x = {k: v for k, v in x.items() if k not in derived}
    x['frameDigest'] = DH('LCIM-LOCAL-CONSISTENCY-WITNESS-FRAME-v1', x)
    prev = bytes(64) if x['sequence'] == 0 else bytes.fromhex(x['predecessorWitnessHead'])
    x['headDigest'] = H(b'LCIM-LOCAL-CONSISTENCY-WITNESS-HEAD-v1\x00' + prev + bytes.fromhex(x['frameDigest']))
    return finish(x)
def frame(x):
    q = J(x)
    return len(q).to_bytes(4, 'big') + q + bytes.fromhex(x['frameDigest'])
oldw = copy.deepcopy(T[3])
oldw.update(repositoryId=repo, runId=run, journalId=journal, operationId=oldop,
    intendedTransactionId=oldtx['transactionId'], intendedTransactionDigest=oldtx['transactionDigest'],
    publicationBundleDigest=H(b'prior publication'), expectedLedgerSequence=6,
    expectedPredecessorLedgerHead=oldtx['predecessorHead'], observedAt=created,
    observationId='obs_' + H(b'prior observation')[:32])
oldprepare = witness(oldw)
oldw.update(frameKind='COMMIT', sequence=1, predecessorWitnessHead=oldprepare['headDigest'],
    predecessorGenerationId=oldprepare['recordId'], expectedCurrentHead=oldprepare['recordId'],
    preparedFrameDigest=oldprepare['frameDigest'])
oldw = witness(oldw)
oldprefix = b'LCIMWJ01' + frame(oldprepare) + frame(oldw)

A = candidate(4)
A.update(predecessorGenerationId=prior[2], expectedCurrentHead=prior[2],
    candidateSetKind='SUCCESSOR_ACTIVATION',
    budgetCeilingGenerationId=b['recordId'], budgetCeilingDigest=b['recordDigest'],
    operatorSessionGenerationId=s['recordId'], operatorSessionDigest=s['recordDigest'],
    planConfirmationGenerationId=p['recordId'], planConfirmationDigest=p['recordDigest'],
    expectedPredecessorLedgerHead=oldtx['headDigest'], expectedLedgerSequence=7,
    expectedPredecessorWitnessHead=oldw['headDigest'])
proposal = {k: v for k, v in A.items() if k not in ids | {'candidateSetDigest'}}
Hfields = dict(publicationKind='SUCCESSOR_ACTIVATION', operationId=op,
    repositoryId=repo, runId=run, journalId=journal, reviewedSourceGenerationId=source,
    sourceCommit=commit, sourceTree=tree, budgetPredecessor=budget0,
    expectedPredecessorLedgerHead=oldtx['headDigest'], expectedLedgerSequence=7,
    expectedPredecessorWitnessHead=oldw['headDigest'], createdAt=created, expiresAt=expires,
    **{k: inputs[k] for k in ('semanticContractDigest','activeGuidanceDigest',
        'configurationDigest','modelRoutingDigest','planDeclarationDigest')})

def desc(n, kind, x):
    q = J(x)
    return dict(ordinal=n, familyOrKind=kind, bytesBase64=base64.b64encode(q).decode().rstrip('='),
        byteLength=len(q), sha256=H(q))

def desc_check(d):
    exact(d, 'ordinal familyOrKind bytesBase64 byteLength sha256')
    q = base64.b64decode(d['bytesBase64'] + '=' * (-len(d['bytesBase64']) % 4), validate=True)
    assert base64.b64encode(q).decode().rstrip('=') == d['bytesBase64']
    assert len(q) == d['byteLength'] and H(q) == d['sha256']
    assert J(json.loads(q)) == q

core = dict(schemaName='lcim.successor-activation-candidate-set-core', schemaVersion=1,
    **Hfields, candidates=[desc(i+1, x['schemaName']+'@1', x) for i,x in enumerate((b,s,p))]
        + [desc(4, 'activationProposalCore', proposal)])
for d in core['candidates']: desc_check(d)
setdigest = DH('LCIM-SUCCESSOR-ACTIVATION-CANDIDATE-SET-v1', core)
A['candidateSetDigest'] = setdigest; A = finish(A); record_check(A)
assert {k:v for k,v in A.items() if k not in ids|{'candidateSetDigest'}} == proposal
finals = [b,s,p,A]
events = []
for i,x in enumerate(finals):
    d = desc(i+1, x['schemaName']+'@1', x)
    d.update(recordId=x['recordId'], recordDigest=x['recordDigest'])
    events.append(dict(eventKind='SUCCESSOR_ACTIVATION', candidate=d))
txcore = dict(schemaName='lcim.controller-transaction', schemaVersion=1, protocolVersion='3.0',
    operationId=op, repositoryId=repo, runId=run, sequence=7, predecessorHead=oldtx['headDigest'],
    preparedAt=created, events=events, payloadDigest=H(J(events)))
tx = txfinish(txcore)
names = ['candidate-set-core.jcs','01-budget-successor.jcs','02-operator-session-successor.jcs',
    '03-plan-confirmation-successor.jcs','04-activation-settlement-successor.jcs','canonical-transaction.jcs']
objects = [core] + finals + [tx]
artifacts = []
for i,(name,x) in enumerate(zip(names,objects)):
    artifacts.append(dict(filename=name, ordinal=i, familyOrKind=x['schemaName']+'@1',
        byteLength=len(J(x)), sha256=H(J(x)), recordId=x.get('recordId'), recordDigest=x.get('recordDigest')))
mcore = dict(schemaName='lcim.successor-activation-publication-bundle', schemaVersion=1,
    **Hfields, candidateSetDigest=setdigest, canonicalTransactionId=tx['transactionId'],
    canonicalTransactionDigest=tx['transactionDigest'], artifacts=artifacts)
bundleid = DH('LCIM-SUCCESSOR-ACTIVATION-PUBLICATION-BUNDLE-v1', mcore)
manifest = dict(mcore, successorPublicationBundleDigest=bundleid)
stored = {n:J(x).decode() for n,x in zip(names,objects)}
stored.update({'publication-manifest.jcs':J(manifest).decode(), 'SEALED':bundleid})
assert len(stored) == 8 and len(artifacts) == 6 and len(finals) == 4

HKEYS = 'publicationKind operationId repositoryId runId journalId reviewedSourceGenerationId sourceCommit sourceTree budgetPredecessor expectedPredecessorLedgerHead expectedLedgerSequence expectedPredecessorWitnessHead createdAt expiresAt semanticContractDigest activeGuidanceDigest configurationDigest modelRoutingDigest planDeclarationDigest'

def verify_store(z):
    assert set(z) == set(names + ['publication-manifest.jcs','SEALED'])
    m = json.loads(z['publication-manifest.jcs'])
    assert set(m) == set(HKEYS.split()) | {'schemaName','schemaVersion','candidateSetDigest','canonicalTransactionId','canonicalTransactionDigest','artifacts','successorPublicationBundleDigest'}
    assert m['schemaName']=='lcim.successor-activation-publication-bundle' and m['schemaVersion']==1 and m['publicationKind']=='SUCCESSOR_ACTIVATION'
    assert J(m).decode() == z['publication-manifest.jcs']
    mc = {k:v for k,v in m.items() if k != 'successorPublicationBundleDigest'}
    assert DH('LCIM-SUCCESSOR-ACTIVATION-PUBLICATION-BUNDLE-v1',mc) == z['SEALED'] == m['successorPublicationBundleDigest']
    assert len(m['artifacts']) == 6
    for i,d in enumerate(m['artifacts']):
        exact(d, 'filename ordinal familyOrKind byteLength sha256 recordId recordDigest')
        assert d['ordinal'] == i and d['filename'] == names[i]
        q = z[names[i]].encode(); assert len(q) == d['byteLength'] and H(q) == d['sha256']
        obj=json.loads(q); assert J(obj)==q
        assert d['familyOrKind']==obj['schemaName']+'@1'
        assert d['recordId']==obj.get('recordId') and d['recordDigest']==obj.get('recordDigest')
    c = json.loads(z[names[0]])
    assert set(c) == set(HKEYS.split()) | {'schemaName','schemaVersion','candidates'}
    assert c['schemaName']=='lcim.successor-activation-candidate-set-core' and c['schemaVersion']==1
    assert DH('LCIM-SUCCESSOR-ACTIVATION-CANDIDATE-SET-v1',c) == m['candidateSetDigest']
    for k in HKEYS.split(): assert c[k] == m[k]
    assert len(c['candidates'])==4
    for i,d in enumerate(c['candidates']):
        desc_check(d); assert d['ordinal']==i+1
        assert d['familyOrKind']==(['lcim.local-budget-ceiling@1','lcim.local-operator-session@1','lcim.local-plan-confirmation@1','activationProposalCore'][i])
    for i in range(3): assert base64.b64decode(c['candidates'][i]['bytesBase64']+'='*(-len(c['candidates'][i]['bytesBase64'])%4)) == z[names[i+1]].encode()
    a = json.loads(z[names[4]]); record_check(a)
    assert a['candidateSetDigest'] == m['candidateSetDigest']
    assert J({k:v for k,v in a.items() if k not in ids|{'candidateSetDigest'}}) == base64.b64decode(c['candidates'][3]['bytesBase64']+'='*(-len(c['candidates'][3]['bytesBase64'])%4))
    t = json.loads(z[names[5]])
    assert t == txfinish({k:v for k,v in t.items() if k not in ('transactionId','transactionDigest','headDigest')})
    assert t['transactionId'] == m['canonicalTransactionId'] and t['transactionDigest'] == m['canonicalTransactionDigest']
    assert t['predecessorHead'] == m['expectedPredecessorLedgerHead'] and t['sequence'] == m['expectedLedgerSequence']
    assert len(t['events'])==4 and t['payloadDigest']==H(J(t['events']))
    for i,e in enumerate(t['events']):
        exact(e,'eventKind candidate')
        assert e['eventKind'] == 'SUCCESSOR_ACTIVATION'
        x = json.loads(z[names[i+1]]); record_check(x)
        assert e['candidate'] == dict(desc(i+1,x['schemaName']+'@1',x),recordId=x['recordId'],recordDigest=x['recordDigest'])
    return m
verify_store(stored)

# Literal member-complete snapshot objects; values resolve only to the fixed inputs above.
P = dict(operationId=op, repositoryId=repo, runId=run, publicationKind='SUCCESSOR_ACTIVATION',
    createdAt=created, expiresAt=expires, reviewedSourceGenerationId=source,
    sourceCommit=commit, sourceTree=tree, semanticContractDigest=inputs['semanticContractDigest'],
    activeGuidanceDigest=inputs['activeGuidanceDigest'], configurationDigest=inputs['configurationDigest'],
    modelRoutingDigest=inputs['modelRoutingDigest'], planDeclarationDigest=inputs['planDeclarationDigest'],
    budgetPredecessor=budget0)
C = dict(operationId=op, repositoryId=repo, runId=run, publicationKind='SUCCESSOR_ACTIVATION',
    createdAt=created, expiresAt=expires, reviewedSourceGenerationId='srcgen_'+H(b'changed source'),
    sourceCommit=H(b'changed commit'), sourceTree=H(b'changed tree'),
    semanticContractDigest=inputs['semanticContractDigest'], activeGuidanceDigest=inputs['activeGuidanceDigest'],
    configurationDigest=H(b'changed configuration'), modelRoutingDigest=inputs['modelRoutingDigest'],
    planDeclarationDigest=inputs['planDeclarationDigest'], budgetPredecessor=budget0)
SNAP = 'operationId repositoryId runId publicationKind createdAt expiresAt reviewedSourceGenerationId sourceCommit sourceTree semanticContractDigest activeGuidanceDigest configurationDigest modelRoutingDigest planDeclarationDigest budgetPredecessor'
def snapcheck(x):
    exact(x,SNAP)
    assert x['publicationKind'] in ('TRANSACTION_ZERO','SUCCESSOR_ACTIVATION')
    assert x['createdAt'] < x['expiresAt']
    for k in ('operationId','repositoryId','runId','publicationKind','createdAt','expiresAt'):
        assert x[k] == P[k]
    if x['budgetPredecessor'] is not None: record_check(x['budgetPredecessor'])
    J(x)
reasons = ['PUBLICATION_BUNDLE_EXPIRED','REVIEWED_SOURCE_IDENTITY_DRIFT','SEMANTIC_CONTRACT_DRIFT',
    'ACTIVE_GUIDANCE_DRIFT','CONFIGURATION_DRIFT','MODEL_ROUTING_DRIFT','PLAN_DECLARATION_DRIFT','BUDGET_CEILING_DRIFT']
def causes(p,c,t):
    snapcheck(p); snapcheck(c); assert t >= p['createdAt']
    tests = [t >= p['expiresAt'], any(p[k]!=c[k] for k in ('reviewedSourceGenerationId','sourceCommit','sourceTree'))]
    tests += [p[k]!=c[k] for k in ('semanticContractDigest','activeGuidanceDigest','configurationDigest','modelRoutingDigest','planDeclarationDigest')]
    tests += [J(p['budgetPredecessor'])!=J(c['budgetPredecessor'])]
    return [r for r,v in zip(reasons,tests) if v]
assert causes(P,P,'2026-03-09T00:00:59.999Z') == []
assert causes(P,P,expires) == [reasons[0]]
assert causes(P,C,expires) == [reasons[0],reasons[1],reasons[4]]
assert causes(P,P,'2026-03-09T00:01:00.001Z') == [reasons[0]]
# Exhaust all simultaneous combinations with actual differing input values.
for mask in range(256):
    q=copy.deepcopy(P)
    keys=['reviewedSourceGenerationId','semanticContractDigest','activeGuidanceDigest','configurationDigest','modelRoutingDigest','planDeclarationDigest']
    for bit,k in enumerate(keys,1):
        if mask & (1<<bit): q[k]=('srcgen_' if bit==1 else '')+H(('changed '+k).encode())
    if mask & 128: q['budgetPredecessor']=b
    t=expires if mask & 1 else created
    assert causes(P,q,t)==[r for bit,r in enumerate(reasons) if mask & (1<<bit)]
print('CAUSE_COMBINATIONS',256,'PASS')
pd = DH('LCIM-WITNESS-PREPARED-BINDING-v1',P)
cd = DH('LCIM-WITNESS-CURRENT-BINDING-v1',C)
evidence = dict(bootstrapOperationId=op, publicationBundleDigest=bundleid, preparedFrameDigest=None,
    observedCauseSet=causes(P,C,expires), preparedBindingDigest=pd, currentBindingDigest=cd, observedAt=expires)
ed = DH('LCIM-WITNESS-ABANDON-REASON-EVIDENCE-v1',evidence)

# PREPARE after serialized memory loss: no global transient value enters reconstruct.
verified_input = J(dict(stored=stored, predecessorWitness=oldw, predecessorLedger=oldtx,
    absoluteCanonicalJournalPath=path))
def reconstruct(raw):
    v = json.loads(raw); m = verify_store(v['stored'])
    w,l = v['predecessorWitness'], v['predecessorLedger']
    assert w == witness(w)
    assert l == txfinish({k:a for k,a in l.items() if k not in ('transactionId','transactionDigest','headDigest')})
    assert w['headDigest'] == m['expectedPredecessorWitnessHead']
    assert l['headDigest'] == m['expectedPredecessorLedgerHead'] and l['sequence']+1 == m['expectedLedgerSequence']
    assert w['intendedTransactionId'] == l['transactionId'] and w['intendedTransactionDigest'] == l['transactionDigest']
    assert m['journalId'] == 'journal_'+DH('LCIM-LOCAL-WITNESS-JOURNAL-v1',dict(repositoryId=m['repositoryId'],runId=m['runId'],absoluteCanonicalJournalPath=v['absoluteCanonicalJournalPath']))
    q = dict(schemaName='lcim.local-consistency-witness',schemaVersion=1,recordKind='LOCAL_CONSISTENCY_WITNESS_FRAME',
        operationId=m['operationId'],repositoryId=m['repositoryId'],runId=m['runId'],journalId=m['journalId'],
        frameKind='PREPARE',sequence=w['sequence']+1,predecessorWitnessHead=w['headDigest'],
        predecessorGenerationId=w['recordId'],expectedCurrentHead=w['recordId'],
        expectedPredecessorLedgerHead=m['expectedPredecessorLedgerHead'],expectedLedgerSequence=m['expectedLedgerSequence'],
        intendedTransactionId=m['canonicalTransactionId'],intendedTransactionDigest=m['canonicalTransactionDigest'],
        publicationBundleDigest=m['successorPublicationBundleDigest'],preparedFrameDigest=None,
        terminalReason=None,terminalReasonEvidenceDigest=None,observedAt=m['createdAt'],
        observationId='obs_'+DH('LCIM-BOOTSTRAP-WITNESS-OBS-v1',[m['operationId'],m['successorPublicationBundleDigest'],'PREPARE'])[:32])
    return witness(q)
prep = reconstruct(verified_input); saved = frame(prep); del prep
# A fresh globals namespace contains only immutable schema constants/libraries
# and pure functions. It has NO candidate, core, manifest, Hfields, inputs, op,
# clock, prior observations or prepared frame. Only verified_input crosses over.
import types
replay = {k:globals()[k] for k in ('__builtins__','base64','copy','hashlib','json','re','ids','derived','names','T','HKEYS')}
for name in ('H','J','DH','exact','finish','record_check','desc','desc_check','txfinish','witness','verify_store','reconstruct'):
    replay[name] = types.FunctionType(globals()[name].__code__,replay,name)
prep = replay['reconstruct'](bytes(verified_input)); assert saved == frame(prep)
assert len(prep) == 27
changed = json.loads(verified_input); changed['predecessorLedger']['headDigest'] = H(b'changed head')
reject(reconstruct,J(changed))
print('PREPARE_REPEAT_BYTE_IDENTICAL',len(saved),H(saved))

# Complete representative authorization observations, including terminal tails.
def summary(x):
    return dict(recordId=x['recordId'],frameDigest=x['frameDigest'],headDigest=x['headDigest'],sequence=x['sequence'],
        framedByteLength=len(frame(x)),framedByteSha256=H(frame(x)))
commitw = dict(prep,frameKind='COMMIT',sequence=3,predecessorWitnessHead=prep['headDigest'],
    predecessorGenerationId=prep['recordId'],expectedCurrentHead=prep['recordId'],preparedFrameDigest=prep['frameDigest'])
commitw = witness(commitw)
ab = dict(prep,frameKind='ABANDON',terminalReason=reasons[0],terminalReasonEvidenceDigest=ed,observedAt=expires)
ab = witness(ab) # direct ABANDON, no PREPARE in this alternate history
bounde = dict(evidence,preparedFrameDigest=prep['frameDigest'])
boundab = witness(dict(commitw,frameKind='ABANDON',terminalReason=reasons[0],
    terminalReasonEvidenceDigest=DH('LCIM-WITNESS-ABANDON-REASON-EVIDENCE-v1',bounde),observedAt=expires))

def state(stage, stale=False, suffix=None):
    hasp = stage in ('PREPARE_ONLY','LEDGER_WITHOUT_COMMIT','COMMITTED')
    terminal = commitw if stage=='COMMITTED' else ab if stage=='ABANDONED' else None
    lw = terminal or (prep if hasp else oldw)
    prefix = oldprefix + (saved if hasp else b'') + (frame(terminal) if terminal else b'')
    present = stage in ('LEDGER_WITHOUT_COMMIT','COMMITTED')
    current = C if stale else P; t = expires if stale else created
    action = dict(PRE_PERSISTENCE='PERSIST_PREPARED_BUNDLE',SEALED_NO_PREPARE='APPEND_WITNESS_PREPARE',
        PREPARE_ONLY='PUBLISH_LEDGER_TRANSACTION',LEDGER_WITHOUT_COMMIT='APPEND_WITNESS_COMMIT',COMMITTED=None,ABANDONED=None)[stage]
    if stale and stage in ('SEALED_NO_PREPARE','PREPARE_ONLY'): action='APPEND_WITNESS_ABANDON'
    x = dict(classification='INCOMPLETE_TAIL' if suffix else stage,publicationKind='SUCCESSOR_ACTIVATION',
        operationId=op,repositoryId=repo,runId=run,observedAt=t,preparedBindingDigest=pd,
        currentBindingDigest=DH('LCIM-WITNESS-CURRENT-BINDING-v1',current),observedCauseSet=causes(P,current,t),
        bundle=dict(storage='MEMORY_VERIFIED' if stage=='PRE_PERSISTENCE' else 'SEALED_VERIFIED',candidateSetDigest=setdigest,
            publicationBundleDigest=bundleid,manifestSha256=H(J(manifest)),transactionDigest=tx['transactionDigest'],
            transactionSha256=H(J(tx)),expectedPredecessorLedgerHead=oldtx['headDigest'],transactionId=tx['transactionId'],
            manifestByteLength=len(J(manifest)),transactionByteLength=len(J(tx)),expectedLedgerSequence=7,
            expectedPredecessorWitnessHead=oldw['headDigest'],expiresAt=expires),
        ledger=dict(headDigest=tx['headDigest'] if present else oldtx['headDigest'],nextSequence=8 if present else 7,transactionPresent=present),
        witness=dict(journalId=journal,verifiedPrefixByteLength=len(prefix),verifiedPrefixSha256=H(prefix),
            nextSequence=lw['sequence']+1,headDigest=lw['headDigest'],currentGenerationId=lw['recordId'],
            prepare=summary(prep) if hasp else None,terminal=dict(summary(terminal),frameKind=terminal['frameKind']) if terminal else None,
            incompleteSuffix=dict(stage='LENGTH',byteLength=len(suffix),sha256=H(suffix)) if suffix else None),
        nextAction='TRUNCATE_INCOMPLETE_FINAL_FRAME' if suffix else action)
    return x
states = [state('PRE_PERSISTENCE'),state('SEALED_NO_PREPARE'),state('SEALED_NO_PREPARE',True),
    state('PREPARE_ONLY'),state('PREPARE_ONLY',True),state('LEDGER_WITHOUT_COMMIT',True),state('COMMITTED'),state('ABANDONED',True)]
states += [state(s, s=='ABANDONED', b'\x00\x00') for s in ('SEALED_NO_PREPARE','PREPARE_ONLY','LEDGER_WITHOUT_COMMIT','COMMITTED','ABANDONED')]
def statecheck(x):
    # Check exact shapes AND equality against the verified byte-derived observation.
    exact(x,'classification publicationKind operationId repositoryId runId observedAt preparedBindingDigest currentBindingDigest observedCauseSet bundle ledger witness nextAction')
    exact(x['bundle'],'storage candidateSetDigest publicationBundleDigest manifestSha256 transactionDigest transactionSha256 expectedPredecessorLedgerHead transactionId manifestByteLength transactionByteLength expectedLedgerSequence expectedPredecessorWitnessHead expiresAt')
    exact(x['ledger'],'headDigest nextSequence transactionPresent')
    exact(x['witness'],'journalId verifiedPrefixByteLength verifiedPrefixSha256 nextSequence headDigest currentGenerationId prepare terminal incompleteSuffix')
    for k in ('prepare','terminal'):
        if x['witness'][k] is not None:
            exact(x['witness'][k],'recordId frameDigest headDigest sequence framedByteLength framedByteSha256'+(' frameKind' if k=='terminal' else ''))
    if x['witness']['incompleteSuffix'] is not None: exact(x['witness']['incompleteSuffix'],'stage byteLength sha256')
    m=x['bundle']; l=x['ledger']; w=x['witness']; st=x['classification']
    assert x['publicationKind']=='SUCCESSOR_ACTIVATION' and x['operationId']==op
    assert x['repositoryId']==repo and x['runId']==run and m['publicationBundleDigest']==bundleid
    assert m['manifestSha256']==H(J(manifest)) and m['transactionSha256']==H(J(tx))
    assert m['expectedPredecessorLedgerHead']==oldtx['headDigest'] and m['expectedLedgerSequence']==7
    assert l['headDigest']==(tx['headDigest'] if l['transactionPresent'] else oldtx['headDigest'])
    assert l['nextSequence']==(8 if l['transactionPresent'] else 7)
    t=x['observedAt']; current=C if x['currentBindingDigest']==cd else P
    assert x['preparedBindingDigest']==pd and x['currentBindingDigest']==DH('LCIM-WITNESS-CURRENT-BINDING-v1',current)
    assert x['observedCauseSet']==causes(P,current,t)
    pw=w['prepare']; tw=w['terminal']; tail=w['incompleteSuffix']
    if pw is not None: assert pw==summary(prep)
    terminal=None if tw is None else commitw if tw['frameKind']=='COMMIT' else ab
    if tw is not None: assert tw==dict(summary(terminal),frameKind=terminal['frameKind'])
    lw=terminal or (prep if pw else oldw)
    prefix=oldprefix+(saved if pw else b'')+(frame(terminal) if terminal else b'')
    assert w['journalId']==journal and w['headDigest']==lw['headDigest']
    assert w['currentGenerationId']==lw['recordId'] and w['nextSequence']==lw['sequence']+1
    assert w['verifiedPrefixByteLength']==len(prefix) and w['verifiedPrefixSha256']==H(prefix)
    if tw:
        assert l['transactionPresent']==(tw['frameKind']=='COMMIT')
        assert (pw is not None)==(tw['frameKind']=='COMMIT')
        natural='COMMITTED' if tw['frameKind']=='COMMIT' else 'ABANDONED'; action=None
    elif pw:
        natural='LEDGER_WITHOUT_COMMIT' if l['transactionPresent'] else 'PREPARE_ONLY'
        action='APPEND_WITNESS_COMMIT' if l['transactionPresent'] else ('APPEND_WITNESS_ABANDON' if x['observedCauseSet'] else 'PUBLISH_LEDGER_TRANSACTION')
    else:
        assert not l['transactionPresent']
        natural='PRE_PERSISTENCE' if m['storage']=='MEMORY_VERIFIED' else 'SEALED_NO_PREPARE'
        action='PERSIST_PREPARED_BUNDLE' if natural=='PRE_PERSISTENCE' else ('APPEND_WITNESS_ABANDON' if x['observedCauseSet'] else 'APPEND_WITNESS_PREPARE')
    if tail:
        assert tail==dict(stage='LENGTH',byteLength=2,sha256=H(b'\x00\x00'))
        assert m['storage']=='SEALED_VERIFIED' and st=='INCOMPLETE_TAIL' and x['nextAction']=='TRUNCATE_INCOMPLETE_FINAL_FRAME'
    else:
        assert st==natural and x['nextAction']==action
        if st=='PRE_PERSISTENCE': assert not x['observedCauseSet']
for i,x in enumerate(states):
    statecheck(x); emit('CLASSIFIED_'+str(i),x)
    print('CLASSIFIED_DIGEST_'+str(i),DH('LCIM-BOOTSTRAP-CLASSIFIED-STATE-v1',x))
    for key in x:
        y=copy.deepcopy(x); del y[key]; reject(statecheck,y)
    y=copy.deepcopy(x); y['authorityInstanceId']='not allowed'; reject(statecheck,y)
    y=copy.deepcopy(x); y['ledger']['headDigest']=H(b'changed ledger'); reject(statecheck,y)

# Exact byte-parser fixtures. Outcomes shortened only for display: B_* expands
# to INTEGRITY_QUARANTINE_*; I_* is eligible parser stage, not permission to mutate.
def schemaw(x):
    assert type(x) is dict and set(x)==WKEYS
    assert x['schemaName']=='lcim.local-consistency-witness' and type(x['schemaVersion']) is int and x['schemaVersion']==1
    assert x['recordKind']=='LOCAL_CONSISTENCY_WITNESS_FRAME'
    for k in ('sequence','expectedLedgerSequence'):
        assert type(x[k]) is int and 0<=x[k]<=9007199254740991
    for k in ('frameDigest','headDigest','recordDigest','expectedPredecessorLedgerHead','intendedTransactionDigest','publicationBundleDigest'):
        assert type(x[k]) is str and re.fullmatch('[0-9a-f]{64}',x[k])
    for k,prefix,n in [('recordId','rec_',64),('generationId','rec_',64),('operationId','op_',32),('repositoryId','repo_',64),('runId','run_',32),('journalId','journal_',64),('observationId','obs_',32),('intendedTransactionId','lcim_tx_',64)]:
        assert type(x[k]) is str and re.fullmatch(prefix+'[0-9a-f]{'+str(n)+'}',x[k])
    for k in ('expectedCurrentHead','predecessorGenerationId'):
        assert x[k] is None or re.fullmatch('rec_[0-9a-f]{64}',x[k])
    assert x['expectedCurrentHead']==x['predecessorGenerationId']
    assert (x['predecessorWitnessHead'] is None)==(x['sequence']==0)
    assert (x['expectedCurrentHead'] is None)==(x['sequence']==0)
    if x['predecessorWitnessHead'] is not None: assert re.fullmatch('[0-9a-f]{64}',x['predecessorWitnessHead'])
    assert re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z',x['observedAt'])
    assert x['frameKind'] in ('PREPARE','COMMIT','ABANDON')
    if x['frameKind']=='ABANDON':
        assert x['terminalReason'] in reasons and re.fullmatch('[0-9a-f]{64}',x['terminalReasonEvidenceDigest'])
    else: assert x['terminalReason'] is None and x['terminalReasonEvidenceDigest'] is None
    if x['frameKind']=='PREPARE': assert x['preparedFrameDigest'] is None
    if x['frameKind']=='COMMIT': assert x['preparedFrameDigest'] is not None
    if x['preparedFrameDigest'] is not None: assert re.fullmatch('[0-9a-f]{64}',x['preparedFrameDigest'])
    assert x==witness(x)
def pairs(a):
    d={}
    for k,v in a:
        assert k not in d
        d[k]=v
    return d

def parse(z):
    if len(z)<8 or z[:6]!=b'LCIMWJ' or not all(48<=v<=57 for v in z[6:8]): return 'B_BAD_WITNESS_HEADER'
    if z[6:8]!=b'01': return 'B_UNSUPPORTED_WITNESS_VERSION'
    c=8; frames=[]
    while c<len(z):
        if len(z)-c<4: return 'I_LENGTH'
        L=int.from_bytes(z[c:c+4],'big',signed=False)
        if not 1<=L<=1048576: return 'B_BAD_WITNESS_LENGTH'
        if len(z)<c+4+L: return 'I_PAYLOAD'
        q=z[c+4:c+4+L]
        try: text=q.decode('utf-8','strict')
        except UnicodeError: return 'B_BAD_WITNESS_UTF8'
        try:
            x=json.loads(text,object_pairs_hook=pairs)
            assert J(x)==q
        except (ValueError,AssertionError): return 'B_BAD_WITNESS_JCS'
        if len(z)<c+4+L+32: return 'I_DIGEST'
        corex={k:v for k,v in x.items() if k not in derived} if type(x) is dict else x
        if bytes.fromhex(DH('LCIM-LOCAL-CONSISTENCY-WITNESS-FRAME-v1',corex))!=z[c+4+L:c+4+L+32]: return 'B_BAD_WITNESS_DIGEST'
        try: schemaw(x)
        except (AssertionError,ValueError,TypeError): return 'B_BAD_WITNESS_SCHEMA'
        frames.append(x); c+=4+L+32
    return 'BYTE_VALID_'+str(len(frames))

magic=b'LCIMWJ01'
def raw(q, tail=bytes(32)): return magic+len(q).to_bytes(4,'big')+q+tail
unknown=witness(dict(ab,terminalReason='UNKNOWN_REASON'))
cases=[('supported',magic,'BYTE_VALID_0'),('unsupported',b'LCIMWJ02','B_UNSUPPORTED_WITNESS_VERSION'),
    ('invalid encoding',b'LCIMWJ0x','B_BAD_WITNESS_HEADER'),('partial header',b'LCIMWJ0','B_BAD_WITNESS_HEADER'),
    ('empty existing file',b'','B_BAD_WITNESS_HEADER'),('partial length',magic+b'\x00\x10','I_LENGTH'),
    ('zero length',magic+bytes(4),'B_BAD_WITNESS_LENGTH'),('maximum at EOF',magic+(1048576).to_bytes(4,'big'),'I_PAYLOAD'),
    ('over maximum at EOF',magic+(1048577).to_bytes(4,'big'),'B_BAD_WITNESS_LENGTH'),
    ('uint32 maximum',magic+bytes.fromhex('ffffffff'),'B_BAD_WITNESS_LENGTH'),
    ('short payload',magic+saved[:8],'I_PAYLOAD'),('short digest',magic+saved[:-1],'I_DIGEST'),
    ('valid frame',magic+frame(oldprepare),'BYTE_VALID_1'),('concatenated',oldprefix,'BYTE_VALID_2'),
    ('invalid utf8',raw(b'\xff'),'B_BAD_WITNESS_UTF8'),('malformed JSON',raw(b'{'),'B_BAD_WITNESS_JCS'),
    ('noncanonical JSON',raw(b'{ }'),'B_BAD_WITNESS_JCS'),('duplicate key',raw(b'{"x":1,"x":1}'),'B_BAD_WITNESS_JCS'),
    ('bad digest',magic+saved[:-1]+bytes([saved[-1]^1]),'B_BAD_WITNESS_DIGEST'),
    ('unknown terminalReason',magic+frame(unknown),'B_BAD_WITNESS_SCHEMA'),
    ('bad digest and schema',magic+frame(unknown)[:-1]+bytes([frame(unknown)[-1]^1]),'B_BAD_WITNESS_DIGEST'),
    ('eligible suffix',magic+saved+b'\x00\x00','I_LENGTH'),
    ('known bad suffix',magic+saved+(1048577).to_bytes(4,'big'),'B_BAD_WITNESS_LENGTH'),
    ('bad syntax absent digest',raw(b'{')[:-32],'B_BAD_WITNESS_JCS'),
    ('maximum complete malformed payload',raw(b' '*1048576),'B_BAD_WITNESS_JCS')]
for key in ('terminalReason','operationId'):
    q=dict(prep); del q[key]; q=witness(q)
    cases.append(('missing '+key,magic+frame(q),'B_BAD_WITNESS_SCHEMA'))
for key,value in [('extra',1),('sequence','2'),('terminalReason','UNKNOWN_REASON')]:
    q=witness(dict(prep,**{key:value})) if key!='sequence' else None
    if q is None:
        # Digest-valid wrong type: head formula not executed for malformed schema.
        q=dict(prep,sequence='2'); q['frameDigest']=DH('LCIM-LOCAL-CONSISTENCY-WITNESS-FRAME-v1',{k:v for k,v in q.items() if k not in derived})
    cases.append(('schema '+key,magic+frame(q),'B_BAD_WITNESS_SCHEMA'))
for name,z,expected in cases:
    actual=parse(z); assert actual==expected,(name,expected,actual)
    print('PARSER',name,'bytes='+str(len(z)),'sha256='+H(z),'expected='+expected,'actual='+actual)
    if len(z)<80: print('INPUT_HEX',z.hex())
for x in (oldprepare,oldw,prep,commitw,ab,boundab): schemaw(x)
# Sequence evidence checks for the concrete concatenation, not a generic replay engine.
assert commitw['sequence']==prep['sequence']+1 and commitw['predecessorWitnessHead']==prep['headDigest']
assert commitw['preparedFrameDigest']==prep['frameDigest'] and commitw['intendedTransactionId']==tx['transactionId']

# Negative binding/shape checks, including changed bytes and predecessor facts.
negative=0
for key in P:
    q=copy.deepcopy(P); del q[key]; reject(snapcheck,q); negative+=1
q=dict(P,secret='forbidden'); reject(snapcheck,q); negative+=1
q=copy.deepcopy(C); q['budgetPredecessor']['ceilings'][0]['extra']=1; reject(snapcheck,q); negative+=1
q=copy.deepcopy(P); q['budgetPredecessor']=b
assert causes(P,q,created)==[reasons[7]]
for key in stored:
    q=dict(stored); del q[key]; reject(verify_store,q); negative+=1
q=dict(stored,PREPARE='forbidden'); reject(verify_store,q); negative+=1
q=dict(stored); q[names[1]]+=' '; reject(verify_store,q); negative+=1
q=copy.deepcopy(core['candidates'][0]); q['unknown']=1; reject(desc_check,q); negative+=1
q=copy.deepcopy(core['candidates'][0]); q['sha256']=H(b'wrong binding'); reject(desc_check,q); negative+=1
q=dict(manifest,operationId=oldop); z=dict(stored); z['publication-manifest.jcs']=J(q).decode(); reject(verify_store,z); negative+=1
# Reauthenticate an adversarial manifest so rejection tests schema/equality,
# not merely its outer hash. This is a negative in-memory fixture, not recovery.
def reseal_bad_manifest(m):
    z=dict(stored)
    mc={k:v for k,v in m.items() if k!='successorPublicationBundleDigest'}
    h=DH('LCIM-SUCCESSOR-ACTIVATION-PUBLICATION-BUNDLE-v1',mc)
    z['SEALED']=h; z['publication-manifest.jcs']=J(dict(mc,successorPublicationBundleDigest=h)).decode()
    return z
for key in manifest:
    if key=='successorPublicationBundleDigest': continue
    q=copy.deepcopy(manifest); del q[key]
    reject(verify_store,reseal_bad_manifest(q)); negative+=1
q=dict(manifest,unknown='closed schema'); reject(verify_store,reseal_bad_manifest(q)); negative+=1
q=dict(manifest,operationId=oldop); reject(verify_store,reseal_bad_manifest(q)); negative+=1
q=copy.deepcopy(manifest); q['artifacts'][0]['unknown']=1
reject(verify_store,reseal_bad_manifest(q)); negative+=1
q=copy.deepcopy(manifest); q['artifacts'][0],q['artifacts'][1]=q['artifacts'][1],q['artifacts'][0]
reject(verify_store,reseal_bad_manifest(q)); negative+=1
for mode in ('missing','unknown'):
    c=copy.deepcopy(core)
    if mode=='missing': del c['createdAt']
    else: c['transactionId']='forbidden later dependency'
    q=copy.deepcopy(manifest); cb=J(c)
    q['candidateSetDigest']=DH('LCIM-SUCCESSOR-ACTIVATION-CANDIDATE-SET-v1',c)
    q['artifacts'][0].update(byteLength=len(cb),sha256=H(cb))
    z=reseal_bad_manifest(q); z[names[0]]=cb.decode()
    reject(verify_store,z); negative+=1
print('CLASSIFIED_SHAPE_BINDING_NEGATIVES',sum(len(x)+2 for x in states),'PASS')
print('NEGATIVE_BINDING_SHAPE_CASES',negative,'PASS')
print('PARSER_CASES',len(cases),'PASS')
for name,x in [('PREPARED_SNAPSHOT',P),('CURRENT_SNAPSHOT',C),('ABANDON_EVIDENCE',evidence),
    ('PREPARE_PAYLOAD',prep),('SUCCESSOR_PROPOSAL',proposal),('SUCCESSOR_CORE',core),('SUCCESSOR_MANIFEST_PREIMAGE',mcore),('SUCCESSOR_FINAL_MANIFEST',manifest)]: emit(name,x)
print('PREPARE_FRAMED_HEX',saved.hex())
print('VERIFIED_INPUT_SHA256',H(verified_input))
print('INNER_PREPARED',pd,'INNER_CURRENT',cd,'OUTER_ABANDON',ed)
print('PREPARE_IDENTITIES',prep['recordId'],prep['recordDigest'],prep['frameDigest'],prep['headDigest'])
print('SUCCESSOR_DIGESTS',setdigest,tx['transactionId'],tx['transactionDigest'],bundleid)
print('DEPENDENCY_ORDER','earlier candidates -> proposal -> core hash -> final activation -> transaction -> manifest -> bundle hash')
# Pinned calculated outputs: changing a preimage must not silently bless itself.
assert pd=='965645c157d7a96bf7068054e0077395c431fd8a002bdd498ba0de364f08c8b3'
assert cd=='2c4ec7b25ef569393ab291b414ee899049011862873dd23e0903b5fc5049c1eb'
assert ed=='bfb1b9e752a94dcb79c71f99ffceffbfb4e3af537841baa73d71f7d829cec131'
assert H(saved)=='e2d913f82b0d46b2588a2a811a48d48234a9ab8e3abd390cf9b66439f3dfe591'
assert setdigest=='ff17a379d2311691ebbe4c204c8e2306608e05bbe28fed7638260245bd6d0290'
assert bundleid=='51dc9b520d346b567c083b74236ee033f5be3a7bf9c2d7d556cb39372abeea73'
for tag,actual in [('snapshot-v5-prepared',P),('snapshot-v5-current',C),('prepare-v5-payload',prep)]:
    literal=SOURCE.split('```'+tag+'\n',1)[1].split('\n```',1)[0].encode()
    assert literal==J(actual)
expected_states='''9bc8a754ebd26d333a86c8bf1c99892fea05a2f44d1bcb063bf42bc6c3c8e474
3d8d22e4e86537da5d715bdd2635a679b3d9c53454319c7814105c76181e5e53
1e972bc241a3de7a4f9520c18de7d78426608564e139819d0a523f4aeb649a5c
6481c8f5c4dd0c94616cfc2282f109505035b1350f1ba4c2c11aef76975b9933
7ab73a05791f8e6cc9e77bf08a72877d69010df7597bdd374d7175c80537c81a
cde1e1df2948e39ed26ab9b158c959711e6ed70b10b2c41800d05a725fffc7ae
7202f16bac35d8f463381bb320d49c23f90a593156f5c4efbf0706fd7a7115e1
b2bfc312550190e69f50ce9fed883e09da70c05c2b8f9d5654c1f17ae7d382c5
565bd637b3cc28c6acdb8cc49bfbc9e920e8fc8ecedbf5454c898ba85351ec88
e3b11c53d64be1860c322ae8da8cd8e6ac728461e994ca17b5abb05b6cb3b6e9
24da2c25a87c0e7660bbf331435bc21b561bfdd2d962d7ae637653821d4fcb63
4daa64d564d986d99dd2d16fe373a2d28ba8ecf934b6eec54ef2cbda60086095
c60276d035f29a7497468fbdf552609c170d6a84c8d2b9aea04014f9539ac233'''.splitlines()
assert [DH('LCIM-BOOTSTRAP-CLASSIFIED-STATE-v1',x) for x in states]==expected_states
print('PINNED_OUTPUTS_AND_LITERAL_BYTES PASS')
```

### 10.1 Literal binding inputs, PREPARE bytes and computed results

The following single-line objects are **literal canonical bytes** (exclude only
the Markdown fence and its terminating newline). The executable fixture asserts
equality to its computed inputs/payload; it does not accept a matching phrase.
The budget record embedded below has computed §3.3 identity, not an all-zero
illustration. P/C retain the same operation, envelope times and budget predecessor;
C has changed source identity and configuration. At exactly expiresAt,
observedCauseSet is the ordered three-member array
`["PUBLICATION_BUNDLE_EXPIRED","REVIEWED_SOURCE_IDENTITY_DRIFT","CONFIGURATION_DRIFT"]`;
selected terminalReason is PUBLICATION_BUNDLE_EXPIRED. The seven-member outer
preimage is the complete `evidence` expression in §10; its only nullable member
here is preparedFrameDigest. `bounde` separately exercises the PREPARE-bound
variant and the resulting ABANDON frame identities.

```snapshot-v5-prepared
{"activeGuidanceDigest":"2ae38e69a08b02f6d603778bd5d8823717ac6643736917c12f39b46e4eabbb3f","budgetPredecessor":{"ceilings":[{"confirmedCeiling":12,"requestClass":"FLASH_IMPLEMENTATION"},{"confirmedCeiling":12,"requestClass":"FLASH_REPAIR"},{"confirmedCeiling":12,"requestClass":"SOL_CONTRACT_CHECK"},{"confirmedCeiling":12,"requestClass":"SOL_DIAGNOSE"},{"confirmedCeiling":12,"requestClass":"SOL_RECHECK"},{"confirmedCeiling":12,"requestClass":"SOL_FINAL_REVIEW"}],"configurationDigest":"432a1b1b69889ff1eaf7ffd39cea68243a45e723d5bfa51def2ee4051de30480","expectedCurrentHead":null,"generationId":"rec_8cb51e97fc5c2d342961524b8e7eb41d44afc7295d65c2022e35d03a4e8977b5","modelRoutingDigest":"af994df942239fb9cfcc354d3780a9f366e7eeb439abf06a75c5b05584366b1e","observedAt":"2026-03-09T00:00:00.000Z","operationId":"op_daed26cc0588185791dccbad038c8542","planDeclarationDigest":"e3975d1a2b91dea5f93c168c73e7e0bd6242011590af87f11423940d197080d3","predecessorGenerationId":null,"reason":"INITIAL","recordDigest":"b137da5987ce5f8378d36eaf3e12443ce6129af34a0e37c736435f312a6b1b12","recordId":"rec_8cb51e97fc5c2d342961524b8e7eb41d44afc7295d65c2022e35d03a4e8977b5","recordKind":"LOCAL_BUDGET_CEILING","repositoryId":"repo_2cece8e06ca4cbdfba904a92dcd6bbdb89bfb2eb3a509c0d9dfe11043a99d1c8","runId":"run_257cf98b198f88e578e086d936c23f62","schemaName":"lcim.local-budget-ceiling","schemaVersion":1,"sourceGenerationId":"srcgen_ff06e90e88e628861db64c3a2b06824f7da1dc37deaa61aeff0f8f1e25ace11a","ttyConfirmationOperationId":"op_daed26cc0588185791dccbad038c8542"},"configurationDigest":"432a1b1b69889ff1eaf7ffd39cea68243a45e723d5bfa51def2ee4051de30480","createdAt":"2026-03-09T00:00:00.000Z","expiresAt":"2026-03-09T00:01:00.000Z","modelRoutingDigest":"af994df942239fb9cfcc354d3780a9f366e7eeb439abf06a75c5b05584366b1e","operationId":"op_0ee4ab862e1a79a84fdba95c11d0ea4a","planDeclarationDigest":"e3975d1a2b91dea5f93c168c73e7e0bd6242011590af87f11423940d197080d3","publicationKind":"SUCCESSOR_ACTIVATION","repositoryId":"repo_2cece8e06ca4cbdfba904a92dcd6bbdb89bfb2eb3a509c0d9dfe11043a99d1c8","reviewedSourceGenerationId":"srcgen_ff06e90e88e628861db64c3a2b06824f7da1dc37deaa61aeff0f8f1e25ace11a","runId":"run_257cf98b198f88e578e086d936c23f62","semanticContractDigest":"cc62ba95f26cb0e05899a49048dbeafd29afea1e547bc804c276883e7bc1c1cd","sourceCommit":"01ad22eac43ce2773504a7e218661ebe5957a5769f2b5e79d1b2b2dabb5c7eea","sourceTree":"2626e7e41a587604f62594ee4581c533fbd1d8e0be5b6edc9e9b7eea132a6b73"}
```

```snapshot-v5-current
{"activeGuidanceDigest":"2ae38e69a08b02f6d603778bd5d8823717ac6643736917c12f39b46e4eabbb3f","budgetPredecessor":{"ceilings":[{"confirmedCeiling":12,"requestClass":"FLASH_IMPLEMENTATION"},{"confirmedCeiling":12,"requestClass":"FLASH_REPAIR"},{"confirmedCeiling":12,"requestClass":"SOL_CONTRACT_CHECK"},{"confirmedCeiling":12,"requestClass":"SOL_DIAGNOSE"},{"confirmedCeiling":12,"requestClass":"SOL_RECHECK"},{"confirmedCeiling":12,"requestClass":"SOL_FINAL_REVIEW"}],"configurationDigest":"432a1b1b69889ff1eaf7ffd39cea68243a45e723d5bfa51def2ee4051de30480","expectedCurrentHead":null,"generationId":"rec_8cb51e97fc5c2d342961524b8e7eb41d44afc7295d65c2022e35d03a4e8977b5","modelRoutingDigest":"af994df942239fb9cfcc354d3780a9f366e7eeb439abf06a75c5b05584366b1e","observedAt":"2026-03-09T00:00:00.000Z","operationId":"op_daed26cc0588185791dccbad038c8542","planDeclarationDigest":"e3975d1a2b91dea5f93c168c73e7e0bd6242011590af87f11423940d197080d3","predecessorGenerationId":null,"reason":"INITIAL","recordDigest":"b137da5987ce5f8378d36eaf3e12443ce6129af34a0e37c736435f312a6b1b12","recordId":"rec_8cb51e97fc5c2d342961524b8e7eb41d44afc7295d65c2022e35d03a4e8977b5","recordKind":"LOCAL_BUDGET_CEILING","repositoryId":"repo_2cece8e06ca4cbdfba904a92dcd6bbdb89bfb2eb3a509c0d9dfe11043a99d1c8","runId":"run_257cf98b198f88e578e086d936c23f62","schemaName":"lcim.local-budget-ceiling","schemaVersion":1,"sourceGenerationId":"srcgen_ff06e90e88e628861db64c3a2b06824f7da1dc37deaa61aeff0f8f1e25ace11a","ttyConfirmationOperationId":"op_daed26cc0588185791dccbad038c8542"},"configurationDigest":"8b32da2fdff39d0406dd70a692563577f118c48a2f91d7c44dde759d5df8a1ad","createdAt":"2026-03-09T00:00:00.000Z","expiresAt":"2026-03-09T00:01:00.000Z","modelRoutingDigest":"af994df942239fb9cfcc354d3780a9f366e7eeb439abf06a75c5b05584366b1e","operationId":"op_0ee4ab862e1a79a84fdba95c11d0ea4a","planDeclarationDigest":"e3975d1a2b91dea5f93c168c73e7e0bd6242011590af87f11423940d197080d3","publicationKind":"SUCCESSOR_ACTIVATION","repositoryId":"repo_2cece8e06ca4cbdfba904a92dcd6bbdb89bfb2eb3a509c0d9dfe11043a99d1c8","reviewedSourceGenerationId":"srcgen_0b07de62d81d8cd6203eaf31acb4f06429f057b59e9c2f88eae2ff59a47b250d","runId":"run_257cf98b198f88e578e086d936c23f62","semanticContractDigest":"cc62ba95f26cb0e05899a49048dbeafd29afea1e547bc804c276883e7bc1c1cd","sourceCommit":"3745597e9ba6facaf27eb72398c6c3e65e950681e9f7efe7e3abe167a79f995c","sourceTree":"b9e7bc0fbae418fdba7bf9f16dc6de94bdf3b75427d0522bcb225db71ddc5fc3"}
```

Computed prepared/current inner digests (domain bytes plus the exact lines):
`965645c157d7a96bf7068054e0077395c431fd8a002bdd498ba0de364f08c8b3` /
`2c4ec7b25ef569393ab291b414ee899049011862873dd23e0903b5fc5049c1eb`.
Computed outer ABANDON evidence digest:
`bfb1b9e752a94dcb79c71f99ffceffbfb4e3af537841baa73d71f7d829cec131`.

The reconstructed PREPARE is exactly this 1706-byte payload. Its framed byte
string is exactly `hex(000006aa) || UTF8(the following line) ||
hex(39cb1780273ce3bcd570de4a066bb737b7fc3a07a54a711f9974a8b8c478f2d9)`.
This expression defines every byte (1742 total), without a journal header.
The fixture also prints its full hex. Its full framed SHA-256, and thus its
APPEND_WITNESS_PREPARE action binding, is
`e2d913f82b0d46b2588a2a811a48d48234a9ab8e3abd390cf9b66439f3dfe591`.
Discarding the constructed frame and replaying in a fresh namespace containing
only schema constants/pure functions and the serialized verified inputs yields
exactly those same bytes. Changing the expected predecessor observation rejects.

```prepare-v5-payload
{"expectedCurrentHead":"rec_d219546eeb2cc7ee4f53284ff85d2d3f31af0eeb14f7ab403ef6b91377bdbc6c","expectedLedgerSequence":7,"expectedPredecessorLedgerHead":"3e04a67a63c08022d29fd36cf77588577aba067867cb43ae15c468c8bcb23d48","frameDigest":"39cb1780273ce3bcd570de4a066bb737b7fc3a07a54a711f9974a8b8c478f2d9","frameKind":"PREPARE","generationId":"rec_13de1c7adc11897a6d887ed7e8ce8d5430adac38a43fed88973a16e05a3932ec","headDigest":"e0ea60540557b63d77e0fbb184d7221146f87ea72af949bfa234c165b914f31b","intendedTransactionDigest":"91a9ecd9640c4f1c95186e89a36c3d52bc0d13e0ccb57c0bc7f706656b5cbe76","intendedTransactionId":"lcim_tx_4b4ca7a28c5b624adf50985e4b75f939c75bafed3be45ab568b76817982251f0","journalId":"journal_80dd58a4fe6d405153d15a5c16ab810d7e8197143f8aaad4192d6a0aae22abe2","observationId":"obs_344a9ea2aef1b935a41af32e7d7db654","observedAt":"2026-03-09T00:00:00.000Z","operationId":"op_0ee4ab862e1a79a84fdba95c11d0ea4a","predecessorGenerationId":"rec_d219546eeb2cc7ee4f53284ff85d2d3f31af0eeb14f7ab403ef6b91377bdbc6c","predecessorWitnessHead":"3bb41bd3fe1da4f5136e0ba35feab2b9a54151e9524557534b8a24eaebcdef37","preparedFrameDigest":null,"publicationBundleDigest":"51dc9b520d346b567c083b74236ee033f5be3a7bf9c2d7d556cb39372abeea73","recordDigest":"3cdbef6cd2cbdaaf3d60b3e3f394447d26a3cc9a659d78eeedb52428f8736fc6","recordId":"rec_13de1c7adc11897a6d887ed7e8ce8d5430adac38a43fed88973a16e05a3932ec","recordKind":"LOCAL_CONSISTENCY_WITNESS_FRAME","repositoryId":"repo_2cece8e06ca4cbdfba904a92dcd6bbdb89bfb2eb3a509c0d9dfe11043a99d1c8","runId":"run_257cf98b198f88e578e086d936c23f62","schemaName":"lcim.local-consistency-witness","schemaVersion":1,"sequence":2,"terminalReason":null,"terminalReasonEvidenceDigest":null}
```

### 10.2 Classified-state and successor result index

The preserved V5 `state` constructor enumerates every member of its **former
13-member projection**, not the V6 authority observation. §2.5B's added
terminalization and §2.5C's distinct PRE_JOURNAL shape are exercised in §11;
its only arguments are the literal stage/staleness/suffix values shown in the
`states` list. It emits all 13 complete canonical objects. `expected_states`
pins their exact domain digests in that same order: pre-persistence; B1; B2;
current PREPARE; stale PREPARE; ledger-without-COMMIT despite drift; COMMITTED;
ABANDONED; then eligible incomplete LENGTH suffix `0000` after each of
no-operation/PREPARE/ledger-without-COMMIT/COMMIT/ABANDON prefixes. Missing root
fields, extra authority-instance field and changed ledger head are rejected
for every object. The field-source/hash relationships are computed and checked;
this is not a Boolean declaration of eligibility or a full runtime classifier.

The complete concrete successor core and manifest are the `core` and `mcore`
expressions in §10 (Hfields is an exhaustively enumerated member map). The
fixture emits their entire canonical byte strings, including every descriptor
and embedded Base64, and verifies each decoded artifact. Exact preimages are
ASCII(`LCIM-SUCCESSOR-ACTIVATION-CANDIDATE-SET-v1`) || 00 || J(core), and
ASCII(`LCIM-SUCCESSOR-ACTIVATION-PUBLICATION-BUNDLE-v1`) || 00 || J(mcore).
Computed results, also pinned in executable assertions:

| Identity | Computed value |
|---|---|
| successorCandidateSetDigest | `ff17a379d2311691ebbe4c204c8e2306608e05bbe28fed7638260245bd6d0290` |
| canonicalTransactionId | `lcim_tx_4b4ca7a28c5b624adf50985e4b75f939c75bafed3be45ab568b76817982251f0` |
| canonicalTransactionDigest | `91a9ecd9640c4f1c95186e89a36c3d52bc0d13e0ccb57c0bc7f706656b5cbe76` |
| successorPublicationBundleDigest = witness publicationBundleDigest | `51dc9b520d346b567c083b74236ee033f5be3a7bf9c2d7d556cb39372abeea73` |
| final manifest raw-byte SHA-256 | `bc107b4b6ec9402163514a8326662810969bc7a707ed6137f6f8c46b66f7d587` |

Concrete manifest descriptor example (the full six-entry list is emitted from
`artifacts`; the core uses a different five-member descriptor, not this one):

```text
{"byteLength":1566,"familyOrKind":"lcim.local-budget-ceiling@1","filename":"01-budget-successor.jcs","ordinal":1,"recordDigest":"a781618a6f1be72668479129b48a82bb45c4f67a5691b463f35c05943746d3a1","recordId":"rec_c97014597283ae95ebf68059e22ca345fda4e178056e136a06dff934da2d899d","sha256":"9ffb54cb6a0e837f32c99af1a9b6d4ff46201f75413a4a56369f17b590f41d53"}
```

The dependency order is exercised as assignments, not asserted by phrase:
final budget/session/plan → proposal → candidate-set digest → final activation
identity → transaction identities → manifest → bundle identity. Changing a
stored byte, operation binding, missing/unknown member, descriptor or SEALED
value rejects. Reauthenticated bad manifests also reject schema/equality
violations rather than succeeding merely because SHA-256 matches.

### 10.3 Parser result interpretation and executed limits

Every `cases` tuple gives exact input bytes (literal bytes, hex, or fully defined
slice/repetition of a fixed frame), an expected result and an equality assertion
against the computed result. `B_X` expands to `INTEGRITY_QUARANTINE_X`.
`I_LENGTH`, `I_PAYLOAD`, `I_DIGEST` are **eligible byte-parser intermediates**;
§4.4 still requires identified sealed operation, verified prefix and fresh TTY
before any mutation. `BYTE_VALID_n` means n frames passed byte/intrinsic-schema
stages; it does not claim all historical sequence/source/ledger checks passed.
The valid concatenation uses the sequence-0 PREPARE and matching sequence-1
COMMIT prefix, not the later sequence-2 frame without its predecessors.
The fixture separately verifies the successor PREPARE→COMMIT sequence links and
exact transaction relation. The full seven-result table is normative §4.3;
all sequence-level quarantine combinations remain documentation reasoning.

For `4c43494d574a303100100001` (oversized length + immediate EOF), expected and
actual are INTEGRITY_QUARANTINE_BAD_WITNESS_LENGTH. For canonical digest-valid
unknown ABANDON reason, both are INTEGRITY_QUARANTINE_BAD_WITNESS_SCHEMA; with
a bad trailer as well, both are INTEGRITY_QUARANTINE_BAD_WITNESS_DIGEST.
A partial existing header never reaches I_LENGTH. All input hashes/lengths and
expected/actual outcomes are printed by the exact command, not a phrase scan.

The unfiltered command above was executed, followed by a compact-output form
using `contextlib.redirect_stdout(io.StringIO())` around the same exec and
printing result lines. During strengthening of isolated replay, two such runs
failed (missing standard builtin `set`, then library `copy`); both namespace
omissions were fixed and the complete command rerun. No failed run is counted
as passing. The final executed counts and limitations are recorded in the
finding matrix and final amendment report. No old V4 validator, production
LCIM, model, package install, credential access, durability/security test or
independent review was executed. No review packet was generated.

## 11. Sixth-amendment executable in-memory transition model (historical, defective)

**Not controlling and not executed as V7 conformance.** V6's permanent STREAMS
oracle, conflated namespace/content and recursive sync-package/sync-parent
semantics conceal G3-V6-P1-01/02/03. Its counts/traces and the prose below are
historical observations only. §12 replaces the active persistence model with
separate process exit/power loss and nonrecursive inode/entry durability.
No V6 authority state or private v1 package authorizes a new V7 operation.

This is an executable **documentation abstraction**, not a filesystem or LCIM
implementation. It uses dictionaries for visible/durable storage, opaque Python
object identity for simulated authority, and synthetic verified owner inputs.
It does not call any production module, open a runtime file, model real TTYs,
prove full source/budget history or assert real filesystem durability. The
synthetic source-proof stream and non-runnable genesis payload are owner-boundary
unit inputs, not an executable public schema or implementation of those owners.
The V5 fence remains byte-identical; its state projections are calculation
regressions, never V6 issuance states. V6 builds actual header/frame/package
bytes, derives state from modeled storage, and checks closed observation and
package bindings. Directory/lock/fsync effects are explicit trace operations.

A crash discards all authorities, selections, confirmations and memory bundles,
including the operation identity: recovery reads it from the retained final
bundle, or a new launcher input supplies a fresh intended operation when none
was persisted. Installed home/repository/run context, scripted clock/owner
oracle inputs and the test's trace counter are outside simulated process memory;
none is authority. Evidence lookup uses the terminal frame's own IDs/digests.
`survive_visible=True` explores possible survival of **already written** but
unflushed bytes/namespace changes; it never invents a write or seeds a header.
The other branch retains only explicit modeled durability points. This is a
finite transition model, not a claim that either is a real filesystem's complete
crash behavior. External drift/ledger observations are labeled read-only oracle
changes, not controller writes. All controller store writes pass the action
engine. Traces retain exact before/after file length+SHA identities, byte bindings,
instance IDs, classifications, durability facts and every logical/internal
write; payloads are fully reproducible from the literal constructors below.
The command prints case results derived from assertions and trace identities;
set TRACE_ALL to True to emit every complete trace from the same execution.

```bash
python3 - <<'PY'
from pathlib import Path
import contextlib, io
s = Path('docs/v2-sprints/00B_MASTER_PLAN_LCIM_3_0_CORE.md').read_text()
ns = {'SOURCE': s, 'TRACE_ALL': False}
out = io.StringIO()
with contextlib.redirect_stdout(out):
    exec(compile(s.split('```python fixture-v5\n',1)[1].split('\n```',1)[0], '<v5-calculations>', 'exec'), ns)
for line in out.getvalue().splitlines():
    if line.startswith(('PUBLIC_', 'CAUSE_', 'PREPARE_REPEAT', 'CLASSIFIED_SHAPE_', 'NEGATIVE_', 'PARSER_CASES', 'PINNED_')):
        print(line)
exec(compile(s.split('```python fixture-v6\n',1)[1].split('\n```',1)[0], '<v6-transitions>', 'exec'), ns)
PY
```

```python fixture-v6
# Uses only the pure V5 hash/JCS/public-record/frame helpers executed above.
INIT='INITIALIZE_WITNESS_JOURNAL'; BUNDLE='PERSIST_PREPARED_BUNDLE'
PREP='APPEND_WITNESS_PREPARE'; LEDGER='PUBLISH_LEDGER_TRANSACTION'
COMMIT='APPEND_WITNESS_COMMIT'; TRUNC='TRUNCATE_INCOMPLETE_FINAL_FRAME'
EVID='PERSIST_ABANDON_EVIDENCE'; ABANDON='APPEND_WITNESS_ABANDON'
ACTIONS=(INIT,BUNDLE,PREP,LEDGER,COMMIT,TRUNC,EVID,ABANDON)
HEADER=b'LCIMWJ01'; ZERO='0'*64
ENAMES=['prepared-binding.jcs','current-binding.jcs','reason-evidence.jcs',
    'proposal-observation.jcs','owner-inputs.jcs','publication-bundle.jcs',
    'ledger-prefix.bin','witness-prefix.bin','abandon.frame']
BNAMES=['candidate-set-core.jcs','01-budget.jcs','02-operator-session.jcs',
    '03-plan-confirmation.jcs','04-non-runnable-genesis.jcs',
    '05-activation-settlement.jcs','canonical-transaction.jcs','publication-manifest.jcs','SEALED']
STREAMS={k:('V6 exact nonsecret '+k).encode() for k in
    ('semanticContract','activeGuidance','configuration','modelRouting')}
STREAMS['planDeclaration']=J({'fixturePlan':'five initial candidates'})
SOURCE_FACTS=dict(reviewedSourceGenerationId=source,sourceCommit=commit,sourceTree=tree)
BINDKEYS=dict(semanticContract='semanticContractDigest',activeGuidance='activeGuidanceDigest',
    configuration='configurationDigest',modelRouting='modelRoutingDigest',planDeclaration='planDeclarationDigest')
def binding_inputs(streams):
    return dict(SOURCE_FACTS,**{v:(H(b'LCIM-PLAN-DECLARATION-v1\x00'+streams[k])
        if k=='planDeclaration' else H(streams[k])) for k,v in BINDKEYS.items()})
def vector(p,c,t):
    checks=[t>=p['expiresAt'],any(p[k]!=c[k] for k in SOURCE_FACTS)]
    checks += [p[k]!=c[k] for k in BINDKEYS.values()]
    checks += [J(p['budgetPredecessor'])!=J(c['budgetPredecessor'])]
    return [r for r,v in zip(reasons,checks) if v]
def octets(q):
    return dict(bytesBase64=base64.b64encode(q).decode().rstrip('='),byteLength=len(q),sha256=H(q))
def decode_octets(x):
    exact(x,'bytesBase64 byteLength sha256')
    q=base64.b64decode(x['bytesBase64']+'='*(-len(x['bytesBase64'])%4),validate=True)
    assert octets(q)==x
    return q

def initial_bundle(m):
    f=binding_inputs(STREAMS)
    def rec(i):
        q=copy.deepcopy(T[i])
        for k,v in dict(f,repositoryId=repo,runId=run,operationId=m.op,
            ttyConfirmationOperationId=m.op,bootstrapOperationId=m.op,
            operatorConfirmationOperationId=m.op,observedAt=created,confirmedAt=created,
            preparedAt=created,sourceGenerationId=source).items():
            if k in q:q[k]=v
        q.update(predecessorGenerationId=None,expectedCurrentHead=None)
        return q
    b0=finish(rec(2)); s0=rec(0)
    s0.update(budgetCeilingGenerationId=b0['recordId'],budgetCeilingDigest=b0['recordDigest'],
        authorityClass='GENESIS_ACTIVATION_BOOTSTRAP_AUTHORITY')
    s0=finish(s0); p0=rec(1)
    p0.update(budgetCeilingGenerationId=b0['recordId'],budgetCeilingDigest=b0['recordDigest'],
        operatorSessionGenerationId=s0['recordId'],operatorSessionDigest=s0['recordDigest'])
    p0=finish(p0)
    # Opaque non-runnable C30-03 owner input, not a new executable genesis schema.
    g0=dict(kind='NON_RUNNABLE_PENDING_ACTIVATION_COMMIT',repositoryId=repo,runId=run,
        operationId=m.op,budgetId=b0['recordId'],sessionId=s0['recordId'],planId=p0['recordId'])
    a0=rec(4); a0.update(candidateSetKind='TRANSACTION_ZERO',expectedLedgerSequence=0,
        expectedPredecessorLedgerHead=ZERO,expectedPredecessorWitnessHead=None,
        budgetCeilingGenerationId=b0['recordId'],budgetCeilingDigest=b0['recordDigest'],
        operatorSessionGenerationId=s0['recordId'],operatorSessionDigest=s0['recordDigest'],
        planConfirmationGenerationId=p0['recordId'],planConfirmationDigest=p0['recordDigest'])
    ap={k:v for k,v in a0.items() if k not in ids|{'candidateSetDigest'}}
    hf=dict(f,publicationKind='TRANSACTION_ZERO',bootstrapOperationId=m.op,repositoryId=repo,
        runId=run,journalId=m.jid,budgetPredecessor=None,expectedPredecessorLedgerHead=ZERO,
        expectedPredecessorWitnessHead=None,expectedLedgerSequence=0,createdAt=created,expiresAt=expires)
    kinds=['lcim.local-budget-ceiling@1','lcim.local-operator-session@1','lcim.local-plan-confirmation@1',
        'NON_RUNNABLE_PENDING_ACTIVATION_COMMIT','activationProposalCore']
    c0=dict(hf,schemaName='lcim.genesis-activation-candidate-set-core',schemaVersion=1,
        candidates=[desc(i+1,k,x) for i,(k,x) in enumerate(zip(kinds,[b0,s0,p0,g0,ap]))])
    sd=DH('LCIM-GENESIS-ACTIVATION-CANDIDATE-SET-v1',c0)
    a0=finish(dict(a0,candidateSetDigest=sd)); finals0=[b0,s0,p0,g0,a0]
    for x in (b0,s0,p0,a0):record_check(x)
    kinds[-1]='lcim.local-activation-settlement@1'
    ev=[dict(eventKind='GENESIS',candidate=dict(desc(i+1,k,x),recordId=x.get('recordId'),
        recordDigest=x.get('recordDigest'))) for i,(k,x) in enumerate(zip(kinds,finals0))]
    t0=txfinish(dict(schemaName='lcim.controller-transaction',schemaVersion=1,protocolVersion='3.0',
        operationId=m.op,repositoryId=repo,runId=run,sequence=0,predecessorHead=ZERO,
        preparedAt=created,events=ev,payloadDigest=H(J(ev))))
    objs=[c0]+finals0+[t0]; fk=['lcim.genesis-activation-candidate-set-core@1']+kinds+['lcim.controller-transaction@1']
    ad=[dict(filename=n,ordinal=i,familyOrKind=k,byteLength=len(J(x)),sha256=H(J(x)),
        recordId=x.get('recordId'),recordDigest=x.get('recordDigest'))
        for i,(n,k,x) in enumerate(zip(BNAMES,fk,objs))]
    mc=dict(hf,schemaName='lcim.genesis-activation-publication-bundle',schemaVersion=1,
        candidateSetDigest=sd,canonicalTransactionId=t0['transactionId'],
        canonicalTransactionDigest=t0['transactionDigest'],artifacts=ad)
    bid=DH('LCIM-GENESIS-ACTIVATION-PUBLICATION-BUNDLE-v1',mc)
    mf=dict(mc,publicationBundleDigest=bid)
    return dict(zip(BNAMES,[J(x) for x in objs]+[J(mf),bid.encode()]))

def frames(z):
    assert z[:8]==HEADER
    out=[]; c=8
    while c<len(z):
        if len(z)-c<4:return out,z[c:]
        n=int.from_bytes(z[c:c+4],'big'); assert 1<=n<=1048576
        if len(z)-c<4+n+32:return out,z[c:]
        q=z[c:c+4+n+32]; w=json.loads(q[4:-32]); schemaw(w); assert frame(w)==q
        out.append(w); c+=len(q)
    return out,b''

def make_frame(m,kind,e=None):
    mf=m.manifest(); ws,tail=frames(m.live[m.jp]); assert not tail
    last=ws[-1] if ws else None; pw=next((w for w in ws if w['frameKind']=='PREPARE'),None)
    q=dict(schemaName='lcim.local-consistency-witness',schemaVersion=1,recordKind='LOCAL_CONSISTENCY_WITNESS_FRAME',
        operationId=m.op,repositoryId=repo,runId=run,journalId=m.jid,frameKind=kind,
        sequence=len(ws),predecessorWitnessHead=last['headDigest'] if last else None,
        predecessorGenerationId=last['recordId'] if last else None,expectedCurrentHead=last['recordId'] if last else None,
        expectedPredecessorLedgerHead=ZERO,expectedLedgerSequence=0,intendedTransactionId=mf['canonicalTransactionId'],
        intendedTransactionDigest=mf['canonicalTransactionDigest'],publicationBundleDigest=mf['publicationBundleDigest'],
        preparedFrameDigest=pw['frameDigest'] if pw and kind!='PREPARE' else None,
        terminalReason=e['observedCauseSet'][0] if e else None,
        terminalReasonEvidenceDigest=DH('LCIM-WITNESS-ABANDON-REASON-EVIDENCE-v1',e) if e else None,
        observedAt=e['observedAt'] if e else mf['createdAt'],
        observationId='obs_'+DH('LCIM-BOOTSTRAP-WITNESS-OBS-v1',[m.op,mf['publicationBundleDigest'],kind])[:32])
    return witness(q)

class Model:
    def __init__(self):
        self.op='op_'+H(b'V6 cold operation')[:32]; self.home='/controller-fixture'
        self.root=self.home+'/.lcim-private'; self.jp=self.root+'/witness/v1/'+repo+'/'+run+'/witness.journal'
        self.jid='journal_'+DH('LCIM-LOCAL-WITNESS-JOURNAL-v1',dict(repositoryId=repo,runId=run,absoluteCanonicalJournalPath=self.jp))
        self.bp=self.root+'/bootstrap-prepared/v1/'+repo+'/'+self.op
        self.lp=self.root+'/ledger/'+run; self.live={}; self.durable={}; self.mem=None
        self.current=dict(STREAMS); self.now=created; self.auth={}; self.serial=0; self.trace=[]
        self.proposal=None; self.known=set(); self.production=False; self.external_ledger=None
        self.prior_use=False; self.unavailable=False; self.ownerclass='bootstrap'
        self.bound_repo=repo; self.bound_run=run
    def bundle(self):
        return {n:self.live[self.bp+'/'+n] for n in BNAMES} if self.bp+'/SEALED' in self.live else self.mem
    def manifest(self):return json.loads(self.bundle()['publication-manifest.jcs'])
    def ledger_bytes(self):return self.external_ledger or self.live.get(self.lp,b'')
    def stage(self):
        if self.jp not in self.live:
            if self.unavailable:return 'DENIED_WITNESS_OBSERVATION_UNAVAILABLE'
            if self.prior_use or self.ledger_bytes() or any('/bootstrap-prepared/' in p or '/abandon-evidence/' in p for p in self.live):
                return 'INTEGRITY_QUARANTINE_MISSING_HISTORICAL_JOURNAL'
            return 'PRE_JOURNAL'
        parsed=parse(self.live[self.jp])
        if parsed.startswith('B_'):return 'INTEGRITY_QUARANTINE_'+parsed[2:]
        ws,tail=frames(self.live[self.jp])
        if any(w['frameKind']=='ABANDON' for w in ws):
            try:self.verify_package(self.retrieve(ws[-1]),terminal=True)
            except (AssertionError,KeyError,ValueError):return 'INTEGRITY_QUARANTINE_MISSING_OR_CORRUPT_ABANDON_EVIDENCE'
        if tail:return 'INCOMPLETE_TAIL'
        if ws and ws[-1]['frameKind'] in ('COMMIT','ABANDON'):return 'COMMITTED' if ws[-1]['frameKind']=='COMMIT' else 'ABANDONED'
        if self.ledger_bytes():return 'LEDGER_WITHOUT_COMMIT'
        if ws:return 'PREPARE_ONLY'
        if self.bp+'/SEALED' in self.live:return 'SEALED_NO_PREPARE'
        return 'PRE_PERSISTENCE' if self.mem else 'HEADER_ONLY'
    def snap(self,current=False):
        mf=self.manifest()
        return dict(operationId=self.op,repositoryId=repo,runId=run,publicationKind='TRANSACTION_ZERO',
            createdAt=mf['createdAt'],expiresAt=mf['expiresAt'],budgetPredecessor=None,
            **binding_inputs(self.current if current else STREAMS))
    def reason_vector(self,t):return vector(self.snap(),self.snap(True),t)
    def preobs(self):
        return dict(classification='PRE_JOURNAL',publicationKind='TRANSACTION_ZERO',operationId=self.op,
            repositoryId=self.bound_repo,runId=self.bound_run,observedAt=self.now,controllerHome=self.home,controllerPrivateRoot=self.root,
            absoluteCanonicalJournalPath=self.jp,intendedJournalId=self.jid,sourceBindings=binding_inputs(self.current),
            confirmationBindings=dict(controllerProcessIdentity=1,controllerSessionIdentity='session_'+H(b'V6 session')[:32],
                ttyConfirmationOperationId=self.op,intendedOperation=INIT),
            absence=dict(journal='VERIFIED_ABSENT',ledger='VERIFIED_ABSENT',priorUse='VERIFIED_NONE',
                preparedBundles='VERIFIED_NONE',terminalEvidence='VERIFIED_NONE'),
            observedJournalId=None,verifiedPrefixByteLength=None,verifiedPrefixSha256=None,witnessHead=None,
            publicationBundleDigest=None,productionCapability=None,ledgerHead=ZERO,ledgerNextSequence=0,nextAction=INIT)
    def baseobs(self,t):
        mf=self.manifest(); z=self.live[self.jp]; ws,tail=frames(z); last=ws[-1] if ws else None
        pw=next((w for w in ws if w['frameKind']=='PREPARE'),None)
        tw=last if last and last['frameKind']!='PREPARE' else None
        present=bool(self.ledger_bytes()); tx0=json.loads(self.bundle()['canonical-transaction.jcs'])
        if present:assert self.ledger_bytes()==J(tx0)
        return dict(classification=self.stage(),publicationKind='TRANSACTION_ZERO',operationId=self.op,
            repositoryId=repo,runId=run,observedAt=t,preparedBindingDigest=DH('LCIM-WITNESS-PREPARED-BINDING-v1',self.snap()),
            currentBindingDigest=DH('LCIM-WITNESS-CURRENT-BINDING-v1',self.snap(True)),observedCauseSet=self.reason_vector(t),
            bundle=dict(storage='SEALED_VERIFIED' if self.bp+'/SEALED' in self.live else 'MEMORY_VERIFIED',
                candidateSetDigest=mf['candidateSetDigest'],publicationBundleDigest=mf['publicationBundleDigest'],
                manifestSha256=H(J(mf)),manifestByteLength=len(J(mf)),transactionId=tx0['transactionId'],
                transactionDigest=tx0['transactionDigest'],transactionSha256=H(J(tx0)),transactionByteLength=len(J(tx0)),
                expectedPredecessorLedgerHead=ZERO,expectedPredecessorWitnessHead=None,expectedLedgerSequence=0,expiresAt=expires),
            ledger=dict(headDigest=tx0['headDigest'] if present else ZERO,nextSequence=1 if present else 0,transactionPresent=present),
            witness=dict(journalId=self.jid,verifiedPrefixByteLength=len(z)-len(tail),verifiedPrefixSha256=H(z[:-len(tail)] if tail else z),
                nextSequence=len(ws),headDigest=last['headDigest'] if last else None,currentGenerationId=last['recordId'] if last else None,
                prepare=summary(pw) if pw else None,terminal=dict(summary(tw),frameKind=tw['frameKind']) if tw else None,
                incompleteSuffix=dict(stage='LENGTH',byteLength=len(tail),sha256=H(tail)) if tail else None),nextAction=None)
    def evidence_key(self,w):
        return self.root+'/abandon-evidence/v1/'+w['repositoryId']+'/'+w['runId']+'/'+w['operationId']+'/'+w['terminalReasonEvidenceDigest']+'/'+H(frame(w))
    def retrieve(self,w):
        key=self.evidence_key(w)
        return {p[len(key)+1:]:v for p,v in self.live.items() if p.startswith(key+'/') and not p.endswith('/')}
    def package(self,t):
        o=self.baseobs(t); o['nextAction']=EVID
        assert o['classification'] in ('SEALED_NO_PREPARE','PREPARE_ONLY') and o['observedCauseSet'] and not self.ledger_bytes()
        p,c=self.snap(),self.snap(True); pw=o['witness']['prepare']
        e=dict(bootstrapOperationId=self.op,publicationBundleDigest=self.manifest()['publicationBundleDigest'],
            preparedFrameDigest=pw['frameDigest'] if pw else None,observedCauseSet=o['observedCauseSet'],
            preparedBindingDigest=o['preparedBindingDigest'],currentBindingDigest=o['currentBindingDigest'],observedAt=t)
        w=make_frame(self,'ABANDON',e)
        def capsule(stream):
            return dict({k:octets(v) for k,v in stream.items()},sourceCheckpointEvidence=octets(J(SOURCE_FACTS)),budgetPredecessorEvidence=None)
        owner=dict(prepared=capsule(STREAMS),current=capsule(self.current))
        bc=dict(publicationKind='TRANSACTION_ZERO',entries=[dict(filename=n,**octets(self.bundle()[n])) for n in BNAMES])
        values=[J(p),J(c),J(e),J(o),J(owner),J(bc),self.ledger_bytes(),self.live[self.jp],frame(w)]
        files=dict(zip(ENAMES,values)); ds=[dict(ordinal=i,filename=n,byteLength=len(files[n]),sha256=H(files[n])) for i,n in enumerate(ENAMES)]
        mc=dict(schemaName='lcim.abandon-evidence-package',schemaVersion=1,publicationKind='TRANSACTION_ZERO',
            operationId=self.op,repositoryId=repo,runId=run,journalId=self.jid,absoluteCanonicalJournalPath=self.jp,
            publicationBundleDigest=e['publicationBundleDigest'],preparedFrameDigest=e['preparedFrameDigest'],
            terminalReasonEvidenceDigest=w['terminalReasonEvidenceDigest'],proposalObservationDigest=DH('LCIM-ABANDON-PROPOSAL-OBSERVATION-v1',o),
            abandonFramedByteDigest=H(frame(w)),observedAt=t,expectedLedgerHead=o['ledger']['headDigest'],
            expectedWitnessHead=o['witness']['headDigest'],expectedLedgerNextSequence=o['ledger']['nextSequence'],
            expectedWitnessNextSequence=o['witness']['nextSequence'],artifacts=ds)
        d=DH('LCIM-ABANDON-EVIDENCE-PACKAGE-v1',mc)
        files.update({'evidence-manifest.jcs':J(dict(mc,evidencePackageDigest=d)),'SEALED':d.encode()})
        return files
    def verify_package(self,f,terminal=False):
        assert set(f)==set(ENAMES+['evidence-manifest.jcs','SEALED'])
        mf=json.loads(f['evidence-manifest.jcs']); assert J(mf)==f['evidence-manifest.jcs']
        exact(mf,'schemaName schemaVersion publicationKind operationId repositoryId runId journalId absoluteCanonicalJournalPath publicationBundleDigest preparedFrameDigest terminalReasonEvidenceDigest proposalObservationDigest abandonFramedByteDigest observedAt expectedLedgerHead expectedWitnessHead expectedLedgerNextSequence expectedWitnessNextSequence artifacts evidencePackageDigest')
        mc={k:v for k,v in mf.items() if k!='evidencePackageDigest'}
        assert DH('LCIM-ABANDON-EVIDENCE-PACKAGE-v1',mc)==mf['evidencePackageDigest']==f['SEALED'].decode()
        assert mf['artifacts']==[dict(ordinal=i,filename=n,byteLength=len(f[n]),sha256=H(f[n])) for i,n in enumerate(ENAMES)]
        p,c,e,o,owner,bc=[json.loads(f[n]) for n in ENAMES[:6]]
        assert all(J(x)==f[n] for x,n in zip((p,c,e,o,owner,bc),ENAMES))
        assert p==self.snap() and e['preparedBindingDigest']==DH('LCIM-WITNESS-PREPARED-BINDING-v1',p)
        assert e['currentBindingDigest']==DH('LCIM-WITNESS-CURRENT-BINDING-v1',c)
        exact(e,'bootstrapOperationId publicationBundleDigest preparedFrameDigest observedCauseSet preparedBindingDigest currentBindingDigest observedAt')
        assert e['bootstrapOperationId']==self.op and e['publicationBundleDigest']==self.manifest()['publicationBundleDigest']
        exact(owner,'prepared current')
        for role,snapshot in [('prepared',p),('current',c)]:
            x=owner[role]; exact(x,'semanticContract activeGuidance configuration modelRouting planDeclaration sourceCheckpointEvidence budgetPredecessorEvidence')
            bs={k:decode_octets(x[k]) for k in BINDKEYS}
            assert binding_inputs(bs)=={k:snapshot[k] for k in binding_inputs(bs)}
            assert decode_octets(x['sourceCheckpointEvidence'])==J(SOURCE_FACTS) and x['budgetPredecessorEvidence'] is None
        assert bc==dict(publicationKind='TRANSACTION_ZERO',entries=[dict(filename=n,**octets(self.bundle()[n])) for n in BNAMES])
        for a in bc['entries']:decode_octets({k:v for k,v in a.items() if k!='filename'})
        w=json.loads(f['abandon.frame'][4:-32]); schemaw(w); assert frame(w)==f['abandon.frame']
        assert mf['abandonFramedByteDigest']==H(frame(w)) and mf['terminalReasonEvidenceDigest']==w['terminalReasonEvidenceDigest']==DH('LCIM-WITNESS-ABANDON-REASON-EVIDENCE-v1',e)
        assert mf['proposalObservationDigest']==DH('LCIM-ABANDON-PROPOSAL-OBSERVATION-v1',o)
        assert w['observedAt']==e['observedAt']==o['observedAt']==mf['observedAt']
        assert w['terminalReason']==e['observedCauseSet'][0] and w['preparedFrameDigest']==e['preparedFrameDigest']
        assert mf['journalId']==self.jid and mf['absoluteCanonicalJournalPath']==self.jp and mf['operationId']==self.op
        assert mf['schemaName']=='lcim.abandon-evidence-package' and type(mf['schemaVersion']) is int and mf['schemaVersion']==1
        assert mf['repositoryId']==repo and mf['runId']==run and mf['publicationKind']=='TRANSACTION_ZERO'
        exact(o,'classification publicationKind operationId repositoryId runId observedAt preparedBindingDigest currentBindingDigest observedCauseSet bundle ledger witness nextAction')
        assert o['nextAction']==EVID and o['classification'] in ('SEALED_NO_PREPARE','PREPARE_ONLY')
        assert o['operationId']==self.op and o['repositoryId']==repo and o['runId']==run
        assert e['observedCauseSet']==vector(p,c,e['observedAt'])==o['observedCauseSet']
        assert o['preparedBindingDigest']==e['preparedBindingDigest'] and o['currentBindingDigest']==e['currentBindingDigest']
        for a,b in [('expectedLedgerHead','headDigest'),('expectedLedgerNextSequence','nextSequence')]:assert mf[a]==o['ledger'][b]
        for a,b in [('expectedWitnessHead','headDigest'),('expectedWitnessNextSequence','nextSequence')]:assert mf[a]==o['witness'][b]
        assert mf['publicationBundleDigest']==e['publicationBundleDigest'] and mf['preparedFrameDigest']==e['preparedFrameDigest']
        assert o['witness']['verifiedPrefixSha256']==H(f['witness-prefix.bin']) and f['ledger-prefix.bin']==b''
        prefix,suffix=frames(f['witness-prefix.bin']); assert not suffix
        assert w['sequence']==len(prefix) and w['predecessorWitnessHead']==(prefix[-1]['headDigest'] if prefix else None)
        assert w['intendedTransactionId']==self.manifest()['canonicalTransactionId']
        if terminal:
            assert self.live[self.jp].startswith(f['witness-prefix.bin']+f['abandon.frame'])
        else:
            assert not self.ledger_bytes() and c==self.snap(True) and self.reason_vector(self.now)==e['observedCauseSet']
            assert o==dict(self.baseobs(e['observedAt']),nextAction=EVID)
            assert f['witness-prefix.bin']==self.live[self.jp]
            assert f==self.package(e['observedAt'])
        return mf
    def select(self):
        if self.proposal is not None:
            self.verify_package(self.proposal); return self.proposal
        # After crash recover exact retained proposal bytes, never a bearer object.
        for p in sorted(self.live):
            if p.endswith('/evidence-manifest.jcs') and '/.evidence-' not in p:
                key=p.rsplit('/',1)[0]; f={n:self.live.get(key+'/'+n,b'') for n in ENAMES+['evidence-manifest.jcs','SEALED']}
                try:self.verify_package(f)
                except (AssertionError,KeyError,ValueError):continue
                self.proposal=f; return f
        self.proposal=self.package(self.now); return self.proposal
    def observation(self):
        st=self.stage()
        if st=='PRE_JOURNAL':return self.preobs()
        assert st not in ('HEADER_ONLY',) and not st.startswith(('INTEGRITY_','DENIED_'))
        o=self.baseobs(self.now); term=None
        action={'PRE_PERSISTENCE':BUNDLE,'SEALED_NO_PREPARE':PREP,'PREPARE_ONLY':LEDGER,
            'LEDGER_WITHOUT_COMMIT':COMMIT,'COMMITTED':None,'ABANDONED':None,'INCOMPLETE_TAIL':TRUNC}[st]
        if st=='PRE_PERSISTENCE':assert not o['observedCauseSet']
        if st in ('SEALED_NO_PREPARE','PREPARE_ONLY') and o['observedCauseSet']:
            f=self.select(); mf=self.verify_package(f); o=self.baseobs(mf['observedAt'])
            w=json.loads(f['abandon.frame'][4:-32]); key=self.evidence_key(w)
            present=any(p.startswith(key+'/') for p in self.live)
            if present:self.verify_package(self.retrieve(w))
            durable=present and key in self.known and all(self.durable.get(key+'/'+n)==q for n,q in f.items())
            term={k:mf[k] for k in ('proposalObservationDigest','terminalReasonEvidenceDigest','abandonFramedByteDigest','evidencePackageDigest')}
            term['destination']='EXACT_PRESENT' if present else 'VERIFIED_ABSENT'
            term['storage']='DURABLE_VERIFIED' if durable else 'MEMORY_VERIFIED'; action=ABANDON if durable else EVID
        o.update(nextAction=action,terminalization=term); return o
    def binding(self,action):
        if action==INIT:return DH('LCIM-WITNESS-INITIALIZATION-ACTION-v1',dict(observation=self.preobs(),headerHex=HEADER.hex()))
        if action==BUNDLE:return H(self.bundle()['publication-manifest.jcs'])
        if action in (PREP,COMMIT):return H(frame(make_frame(self,'PREPARE' if action==PREP else 'COMMIT')))
        if action==LEDGER:return H(self.bundle()['canonical-transaction.jcs'])
        if action in (EVID,ABANDON):return H(self.select()['evidence-manifest.jcs' if action==EVID else 'abandon.frame'])
        w=self.observation()['witness']; sf=w['incompleteSuffix']
        return DH('LCIM-WITNESS-TRUNCATION-v1',dict(journalId=self.jid,verifiedPrefixByteLength=w['verifiedPrefixByteLength'],
            verifiedPrefixSha256=w['verifiedPrefixSha256'],incompleteSuffixByteLength=sf['byteLength'],incompleteSuffixSha256=sf['sha256']))
    def issue(self,action,tty=True,issuer='C30-13'):
        assert tty and issuer=='C30-13' and not self.production and not self.auth and self.ownerclass in ('bootstrap','successor')
        assert action in ACTIONS and not (self.ownerclass=='successor' and action==INIT)
        if self.ownerclass=='successor':
            assert self.manifest()['publicationKind']=='SUCCESSOR_ACTIVATION' and self.prior_use
        o=self.observation(); assert o['nextAction']==action
        token=object(); self.serial+=1
        self.auth[token]=(self.serial,action,self.op,DH('LCIM-BOOTSTRAP-CLASSIFIED-STATE-v1',o),self.binding(action),self.now)
        return token
    def view(self):
        def fs(d):return {p:dict(byteLength=len(q),sha256=H(q)) for p,q in sorted(d.items())}
        return dict(stage=self.stage(),visible=fs(self.live),durable=fs(self.durable),
            memoryBundle=fs(self.mem) if self.mem else None,productionCapability=self.production,
            operationId=self.op,repositoryId=self.bound_repo,runId=self.bound_run,journalPath=self.jp,
            currentInputs={k:octets(v) for k,v in self.current.items()},observedAt=self.now,
            externalLedgerObservation=octets(self.external_ledger) if self.external_ledger else None,
            memoryProposal=fs(self.proposal) if self.proposal else None,
            authorityIds=sorted(v[0] for v in self.auth.values()),knownDurableEvidence=sorted(self.known))
    def effects(self,action):
        # Tuples are enumerated internal operations of ONE logical publication.
        out=[('lock-ledger',self.home.rsplit('/',1)[0] or '/',b''),('lock-witness',self.home,b'')]
        def parents(p):
            parts=p.strip('/').split('/')
            for i in range(2,len(parts)):
                q='/'+'/'.join(parts[:i])+'/'
                if q not in self.live:out.extend([('mkdir',q,b''),('fsync',q,b'')])
        def publish(key,files,tag):
            parents(key); nonce=format(self.serial,'032x')
            tmp=key.rsplit('/',1)[0]+'/.'+tag+'-'+(key.rsplit('/',1)[1]+'-' if tag=='evidence' else '')+nonce+'.tmp'
            if all(self.live.get(key+'/'+n)==v for n,v in files.items()):
                out.append(('sync-package',key,J({n:octets(v) for n,v in files.items()}))); return
            assert not any(p.startswith(key+'/') and not p.endswith('/') for p in self.live)
            out.append(('mkdir',tmp+'/',b''))
            for n,q in files.items():out.extend([('write',tmp+'/'+n,q),('fsync',tmp+'/'+n,b'')])
            out.extend([('fsync',tmp+'/',b''),('rename-dir',tmp,key.encode()),('sync-package',key,J({n:octets(v) for n,v in files.items()}))])
        if action==INIT:
            parents(self.jp); tmp=self.jp.rsplit('/',1)[0]+'/.init-'+self.op+'-'+self.binding(INIT)+'-'+format(self.serial,'032x')+'.tmp'
            out.extend([('create',tmp,b''),('write',tmp,HEADER[:4]),('write',tmp,HEADER),('fsync',tmp,b''),
                ('sync-parent',tmp,b''),('rename-file',tmp,self.jp.encode()),('sync-parent',self.jp,b'')])
        elif action==BUNDLE:publish(self.bp,self.bundle(),'bundle')
        elif action==EVID:
            f=self.select(); w=json.loads(f['abandon.frame'][4:-32]); publish(self.evidence_key(w),f,'evidence')
        elif action in (PREP,COMMIT,ABANDON):
            q=self.select()['abandon.frame'] if action==ABANDON else frame(make_frame(self,'PREPARE' if action==PREP else 'COMMIT'))
            out.extend([('append',self.jp,q[:2]),('append',self.jp,q[2:]),('fsync',self.jp,b''),('sync-parent',self.jp,b'')])
        elif action==LEDGER:
            parents(self.lp); tmp=self.lp+'.transaction-'+format(self.serial,'032x')+'.tmp'
            out.extend([('create',tmp,b''),('write',tmp,self.bundle()['canonical-transaction.jcs']),('fsync',tmp,b''),
                ('rename-file',tmp,self.lp.encode()),('sync-parent',self.lp,b'')])
        elif action==TRUNC:
            ws,tail=frames(self.live[self.jp]); out.extend([('truncate',self.jp,self.live[self.jp][:-len(tail)]),('fsync',self.jp,b'')])
        return out+[('unlock-witness',self.home,b''),('unlock-ledger',self.home.rsplit('/',1)[0] or '/',b'')]
    def run(self,token,action,byte_digest=None,operation=None,stop=None,extra=None):
        before=self.view(); writes=[]; original_live=dict(self.live); original_durable=dict(self.durable)
        try:
            a=self.auth[token]; assert a[1]==action and a[2]==(operation or self.op)==self.op
            assert a[3]==DH('LCIM-BOOTSTRAP-CLASSIFIED-STATE-v1',self.observation())
            assert a[4]==(byte_digest or self.binding(action))==self.binding(action)
            assert a[5]==self.now # fixture clock step invalidates; production uses explicit 300s expiry
            if action==INIT:
                assert self.jp not in self.live and self.ownerclass=='bootstrap'
                assert self.bound_repo==repo and self.bound_run==run
                assert self.jp==self.root+'/witness/v1/'+repo+'/'+run+'/witness.journal'
            if action==ABANDON:
                f=self.retrieve(json.loads(self.select()['abandon.frame'][4:-32])); self.verify_package(f)
                assert self.observation()['terminalization']['storage']=='DURABLE_VERIFIED' and not self.ledger_bytes()
            effects=self.effects(action); assert extra is None # undeclared effect rejected BEFORE all writes
        except (AssertionError,KeyError,ValueError):
            self.auth.pop(token,None); assert self.live==original_live and self.durable==original_durable
            self.trace.append(dict(action=action,instance=None,before=before,after=self.view(),effects=[],result='DENIED'))
            raise AssertionError('authority/state/byte/effect denial')
        del self.auth[token]
        for i,(kind,p,q) in enumerate(effects):
            if stop==i:break
            if kind in ('mkdir','create'):assert p not in self.live; self.live[p]=q
            elif kind=='write':self.live[p]=q
            elif kind=='append':self.live[p]+=q
            elif kind=='truncate':self.live[p]=q
            elif kind=='fsync':self.durable[p]=self.live[p]
            elif kind=='rename-file':
                target=q.decode(); assert target not in self.live; self.live[target]=self.live.pop(p)
            elif kind=='rename-dir':
                target=q.decode()
                for n in list(self.live):
                    if n.startswith(p+'/'):self.live[target+n[len(p):]]=self.live.pop(n)
            elif kind=='sync-parent':
                parent=p.rsplit('/',1)[0]+'/'
                for n in list(self.durable):
                    if n.startswith(parent) and n not in self.live:del self.durable[n]
                for n in self.live:
                    if n.startswith(parent):self.durable[n]=self.live[n]
            elif kind=='sync-package':
                for n in self.live:
                    if n.startswith(p+'/'):self.durable[n]=self.live[n]
                if action==EVID:self.known.add(p)
            else:assert kind.startswith(('lock-','unlock-'))
            writes.append(dict(kind=kind,path=p,byteLength=len(q),sha256=H(q),bytesHex=q.hex()))
        self.trace.append(dict(action=action,instance=a[0],issuer='C30-13',authorityClass=self.ownerclass,
            operationBinding=a[2],classifiedStateDigest=a[3],binding=a[4],confirmationTime=a[5],
            expiryRule='confirmation + 300 seconds; fixture clock-step rejection is stricter',before=before,after=self.view(),effects=writes,
            result='INTERRUPTED' if stop is not None and stop<len(effects) else 'CONSUMED'))
    def step(self,a):self.run(self.issue(a),a)
    def crash(self,survive_visible=False):
        before=self.view()
        if survive_visible:self.durable=dict(self.live) # possible persistence of already written bytes, not a write
        self.live=dict(self.durable); self.mem=None; self.auth={}; self.proposal=None; self.known=set(); self.production=False
        self.op=None; self.bp=None
        for p0,q0 in self.live.items():
            if re.search(r'/bootstrap-prepared/v1/repo_[0-9a-f]{64}/op_[0-9a-f]{32}/publication-manifest\.jcs$',p0):
                mf0=json.loads(q0); assert mf0['repositoryId']==self.bound_repo and mf0['runId']==self.bound_run
                self.op=mf0['bootstrapOperationId']; self.bp=p0.rsplit('/',1)[0]; break
        if self.op is None:
            self.op='op_'+H(('fresh launcher input '+str(self.serial)).encode())[:32]
            self.bp=self.root+'/bootstrap-prepared/v1/'+repo+'/'+self.op
        self.trace.append(dict(action='CRASH',surviveVisible=survive_visible,before=before,after=self.view(),effects=[]))
    def prepare(self):assert self.stage()=='HEADER_ONLY'; self.mem=initial_bundle(self)
    def drift(self):self.current=dict(STREAMS,configuration=b'V6 changed nonsecret configuration'); self.now=expires; self.proposal=None

results=[]; trace_models=[]
def check(name,f):
    try:f(); results.append((name,None)); print('CASE',name,'OK')
    except Exception as e:results.append((name,type(e).__name__+': '+str(e))); print('CASE',name,'FAIL',repr(e))
def denied(m,f):
    before=dict(m.live); durable=dict(m.durable)
    try:f()
    except (AssertionError,KeyError,ValueError):assert m.live==before and m.durable==durable; return
    raise AssertionError('negative accepted')
def cold():
    m=Model(); assert m.live==m.durable=={} and m.mem is None and not m.production and m.proposal is None
    m.step(INIT); assert m.live[m.jp]==HEADER and m.durable[m.jp]==HEADER
    m.prepare(); assert m.stage()=='PRE_PERSISTENCE'; return m
def stale(bound=False):
    m=cold(); m.step(BUNDLE)
    if bound:m.step(PREP)
    m.drift(); assert m.observation()['nextAction']==EVID; return m

def initial_path():
    m=cold()
    for a in (BUNDLE,PREP,LEDGER,COMMIT):m.step(a)
    assert m.stage()=='COMMITTED' and len(m.bundle())==9 and len(json.loads(m.bundle()['canonical-transaction.jcs'])['events'])==5
    assert not m.production; trace_models.append(('A_cold_start',m))
check('A authorized cold start through matching COMMIT',initial_path)

def init_boundary(i,survive):
    m=Model(); tok=m.issue(INIT); m.run(tok,INIT,stop=i); m.crash(survive)
    assert not m.auth and m.mem is None and not m.production
    if m.jp not in m.live:
        assert m.stage()=='PRE_JOURNAL'
        oldop0=m.op; m.op='op_'+H(('fresh confirmed attempt '+m.op+str(m.serial)).encode())[:32]
        m.bp=m.root+'/bootstrap-prepared/v1/'+repo+'/'+m.op
        assert m.op!=oldop0; m.step(INIT)
    else:assert m.stage()=='HEADER_ONLY'; denied(m,lambda:m.issue(INIT))
    assert m.live[m.jp]==HEADER; trace_models.append(('B_init_'+str(i)+'_'+str(survive),m))
probe=Model(); tok=probe.issue(INIT); boundaries=len(probe.effects(INIT))+1
for i in range(boundaries):
    for survive in (False,True):check('B init boundary '+str(i)+' survive='+str(survive),lambda i=i,survive=survive:init_boundary(i,survive))

def terminal_path(bound):
    m=stale(bound); f=dict(m.select()); m.step(EVID)
    assert m.stage() in ('SEALED_NO_PREPARE','PREPARE_ONLY') and m.observation()['nextAction']==ABANDON
    m.crash(); assert m.select()==f and not m.auth
    m.step(EVID) # fresh exact fsync completion; no content rewrite
    assert m.select()==f; m.step(ABANDON); m.crash(); assert m.stage()=='ABANDONED'
    assert m.retrieve(json.loads(f['abandon.frame'][4:-32]))==f
    trace_models.append(('C_D_'+str(bound),m))
for bnd in (False,True):check('C/D evidence before direct/bound ABANDON '+str(bnd),lambda bnd=bnd:terminal_path(bnd))

def negative_authority(kind,action):
    m=Model() if action==INIT else stale()
    if action==ABANDON:m.step(EVID)
    token=m.issue(action)
    args=dict(token=token,action=action)
    if kind=='missing':args['token']=None
    elif kind=='copied':args['token']=object()
    elif kind=='wrong-action':args['action']=PREP
    elif kind=='wrong-byte':args['byte_digest']=H(b'wrong bytes')
    elif kind=='wrong-operation':args['operation']='op_'+'f'*32
    elif kind=='expired':m.now='2026-03-09T00:06:00.000Z'
    elif kind=='auxiliary':args['extra']=('write','/receipt',b'unauthorized')
    elif kind=='reused':m.run(token,action)
    denied(m,lambda:m.run(**args)); trace_models.append(('E_'+action+'_'+kind,m))
for action in (INIT,EVID,ABANDON):
    for kind in ('missing','copied','wrong-action','wrong-byte','wrong-operation','expired','auxiliary','reused'):
        check('E/I '+action+' '+kind,lambda kind=kind,action=action:negative_authority(kind,action))

def forbid_early():
    m=stale(); denied(m,lambda:m.issue(ABANDON)); m.step(EVID); t=m.issue(ABANDON)
    f=m.select(); w=json.loads(f['abandon.frame'][4:-32]); key=m.evidence_key(w)
    del m.live[key+'/owner-inputs.jcs']; denied(m,lambda:m.run(t,ABANDON))
    assert m.stage()=='SEALED_NO_PREPARE'; trace_models.append(('F_missing_evidence',m))
check('F no durable ABANDON without matching durable evidence',forbid_early)

def history(kind):
    m=cold()
    if kind=='frames':m.step(BUNDLE); m.step(PREP)
    elif kind=='missing-history':m.step(BUNDLE); del m.live[m.jp]; del m.durable[m.jp]
    elif kind=='malformed':m.live[m.jp]=m.durable[m.jp]=b'LCIM' # explicit corruption oracle, not initialization
    elif kind=='successor':m=Model(); m.ownerclass='successor'
    elif kind=='unreadable':m=Model(); m.unavailable=True
    elif kind=='prior-reference':m=Model(); m.prior_use=True
    denied(m,lambda:m.issue(INIT)); trace_models.append(('G_'+kind,m))
for kind in ('header-only','frames','missing-history','malformed','successor','unreadable','prior-reference'):
    check('G '+kind,lambda kind=kind:history(kind))

def changed_binding(kind):
    m=Model(); token=m.issue(INIT)
    if kind=='path':m.jp+='.wrong'
    elif kind=='operation':m.op='op_'+'a'*32
    elif kind=='source':m.current=dict(STREAMS,activeGuidance=b'new guidance')
    elif kind=='repository':m.bound_repo='repo_'+'b'*64
    elif kind=='run':m.bound_run='run_'+'c'*32
    else:m.live[m.jp]=m.durable[m.jp]=HEADER # competing creator observation
    denied(m,lambda:m.run(token,INIT)); trace_models.append(('G_binding_'+kind,m))
for kind in ('path','operation','source','repository','run','competing-creator'):
    check('G initialization binding '+kind,lambda kind=kind:changed_binding(kind))

def ledger_wins():
    m=stale(True); m.step(EVID); t=m.issue(ABANDON)
    m.external_ledger=m.bundle()['canonical-transaction.jcs'] # newly observed exact external transaction, no model store write
    denied(m,lambda:m.run(t,ABANDON)); assert m.observation()['nextAction']==COMMIT
    m.step(COMMIT); assert m.stage()=='COMMITTED'; trace_models.append(('H_ledger_precedence',m))
check('H newly observed matching ledger requires COMMIT despite drift',ledger_wins)

def evidence_boundary(i,survive):
    m=stale(); t=m.issue(EVID); m.run(t,EVID,stop=i); m.crash(survive)
    assert m.stage()=='SEALED_NO_PREPARE'; denied(m,lambda:m.issue(ABANDON))
    m.step(EVID); m.step(ABANDON); assert m.stage()=='ABANDONED'
    trace_models.append(('D_evidence_'+str(i)+'_'+str(survive),m))
ep=stale(); t=ep.issue(EVID); eboundaries=len(ep.effects(EVID))+1
for i in range(eboundaries):
    for survive in (False,True):check('D evidence boundary '+str(i)+' survive='+str(survive),lambda i=i,survive=survive:evidence_boundary(i,survive))

def append_boundary(i):
    m=stale(True); m.step(EVID); t=m.issue(ABANDON); m.run(t,ABANDON,stop=i); m.crash(True)
    if m.stage()=='INCOMPLETE_TAIL':m.step(TRUNC)
    if m.stage()!='ABANDONED':m.step(EVID); m.step(ABANDON)
    assert m.stage()=='ABANDONED'; trace_models.append(('D_append_'+str(i),m))
ap=stale(True); ap.step(EVID); t=ap.issue(ABANDON)
for i in range(len(ap.effects(ABANDON))+1):check('D append boundary '+str(i),lambda i=i:append_boundary(i))

def package_negative(kind):
    m=stale(); f=dict(m.select())
    if kind=='missing':del f['owner-inputs.jcs']
    elif kind=='unexpected':f['receipt']=b'not permitted'
    elif kind=='substituted':f['current-binding.jcs']=f['prepared-binding.jcs']
    else:
        mf=json.loads(f['evidence-manifest.jcs']); mf['operationId']='op_'+'e'*32
        mc={k:v for k,v in mf.items() if k!='evidencePackageDigest'}; d=DH('LCIM-ABANDON-EVIDENCE-PACKAGE-v1',mc)
        f['evidence-manifest.jcs']=J(dict(mc,evidencePackageDigest=d)); f['SEALED']=d.encode()
    denied(m,lambda:m.verify_package(f))
for kind in ('missing','unexpected','substituted','reauthenticated-wrong-operation'):
    check('F evidence '+kind,lambda kind=kind:package_negative(kind))

def corrupt_terminal():
    m=stale(); m.step(EVID); f=m.select(); m.step(ABANDON)
    w=json.loads(f['abandon.frame'][4:-32]); key=m.evidence_key(w)
    m.live[key+'/reason-evidence.jcs']=b'corrupt'; m.durable=dict(m.live)
    m.crash(); assert m.stage()=='INTEGRITY_QUARANTINE_MISSING_OR_CORRUPT_ABANDON_EVIDENCE'
    denied(m,lambda:m.issue(ABANDON)); trace_models.append(('D_corrupt_terminal',m))
check('D ABANDON with corrupt evidence quarantines',corrupt_terminal)

def superseded():
    m=stale(); m.step(EVID); old=dict(m.select()); oldkey=m.evidence_key(json.loads(old['abandon.frame'][4:-32])); t=m.issue(ABANDON)
    m.current=dict(m.current,activeGuidance=b'changed again'); m.proposal=None
    denied(m,lambda:m.run(t,ABANDON)); m.step(EVID); new=m.select()
    assert old!=new and all(m.live[oldkey+'/'+n]==q for n,q in old.items())
    m.step(ABANDON); assert m.stage()=='ABANDONED'; trace_models.append(('D_superseded',m))
check('D changed proposal retains old unselected immutable package',superseded)

def issuer_negative(action,kind):
    m=Model() if action==INIT else stale()
    if action==ABANDON:m.step(EVID)
    if kind=='fixture-class':m.ownerclass='fixture'
    if kind=='successor-wrong-kind':m.ownerclass='successor'
    if kind=='production':m.production=True
    denied(m,lambda:m.issue(action,tty=kind!='no-tty',issuer='C30-12' if kind=='wrong-issuer' else 'C30-13'))
for action in (INIT,EVID,ABANDON):
    for kind in ('no-tty','wrong-issuer','fixture-class','successor-wrong-kind','production'):
        check('E issuer '+action+' '+kind,lambda action=action,kind=kind:issuer_negative(action,kind))

def validate_observation(m,o):
    expected=m.observation(); assert set(o)==set(expected)
    if o['classification']=='PRE_JOURNAL':
        exact(o['sourceBindings'],'reviewedSourceGenerationId sourceCommit sourceTree semanticContractDigest activeGuidanceDigest configurationDigest modelRoutingDigest planDeclarationDigest')
        exact(o['confirmationBindings'],'controllerProcessIdentity controllerSessionIdentity ttyConfirmationOperationId intendedOperation')
        exact(o['absence'],'journal ledger priorUse preparedBundles terminalEvidence')
        assert all(o[k] is None for k in ('observedJournalId','verifiedPrefixByteLength','verifiedPrefixSha256','witnessHead','publicationBundleDigest','productionCapability'))
    elif o['terminalization'] is not None:
        exact(o['terminalization'],'proposalObservationDigest terminalReasonEvidenceDigest abandonFramedByteDigest evidencePackageDigest storage destination')
        assert (o['nextAction']==ABANDON)==(o['terminalization']['storage']=='DURABLE_VERIFIED')
    assert o==expected

def observation_negatives():
    count=0
    for m in (Model(),stale(False),stale(True)):
        o=m.observation(); validate_observation(m,o)
        for k in o:
            bad=copy.deepcopy(o); del bad[k]; denied(m,lambda bad=bad:validate_observation(m,bad)); count+=1
        bad=copy.deepcopy(o); bad['authorityInstanceId']='forbidden'; denied(m,lambda:validate_observation(m,bad)); count+=1
        if o['classification']=='PRE_JOURNAL':
            bad=copy.deepcopy(o); bad['verifiedPrefixByteLength']=8; denied(m,lambda:validate_observation(m,bad)); count+=1
        else:
            for k in o['terminalization']:
                bad=copy.deepcopy(o); del bad['terminalization'][k]; denied(m,lambda bad=bad:validate_observation(m,bad)); count+=1
    print('V6_OBSERVATION_NEGATIVES',count,'rejected')
check('E closed pre-journal and terminalization observation negatives',observation_negatives)

def final_header_negative(q,expected):
    m=Model(); m.live[m.jp]=m.durable[m.jp]=q # explicit corrupt-existing-file observation
    assert m.stage()==expected; denied(m,lambda:m.issue(INIT))
for n in range(8):
    check('G final partial header length '+str(n),lambda n=n:final_header_negative(HEADER[:n],'INTEGRITY_QUARANTINE_BAD_WITNESS_HEADER'))
check('G unsupported final version preserves parser class',lambda:final_header_negative(b'LCIMWJ02','INTEGRITY_QUARANTINE_UNSUPPORTED_WITNESS_VERSION'))

def effect_audit():
    count=0; lock={'lock-ledger','lock-witness','unlock-witness','unlock-ledger'}
    allowed={INIT:{'mkdir','create','write','fsync','sync-parent','rename-file'},
        BUNDLE:{'mkdir','write','fsync','rename-dir','sync-package'},EVID:{'mkdir','write','fsync','rename-dir','sync-package'},
        PREP:{'append','fsync','sync-parent'},COMMIT:{'append','fsync','sync-parent'},ABANDON:{'append','fsync','sync-parent'},
        LEDGER:{'mkdir','create','write','fsync','rename-file','sync-parent'},TRUNC:{'truncate','fsync'}}
    for _,m in trace_models:
        seen=set()
        for tr in m.trace:
            if tr.get('instance') is None:
                assert tr['effects']==[]; continue
            assert tr['instance'] not in seen; seen.add(tr['instance'])
            a=tr['action']; chunks=[]
            for effect in tr['effects']:
                count+=1; k,p=effect['kind'],effect['path']; q=bytes.fromhex(effect['bytesHex'])
                assert k in allowed[a]|lock and len(q)==effect['byteLength'] and H(q)==effect['sha256']
                if k in lock:assert q==b''; continue
                assert p.startswith(m.root+'/') or p==m.root+'/'
                assert not any('/'+x in p for x in ('receipt','registry','lockfile'))
                if k=='write':
                    if a==INIT:assert '/.init-' in p and HEADER.startswith(q)
                    elif a in (BUNDLE,EVID):
                        catalog=tr['before']['memoryBundle' if a==BUNDLE else 'memoryProposal']
                        assert p.rsplit('/',1)[1] in catalog and catalog[p.rsplit('/',1)[1]]==dict(byteLength=len(q),sha256=H(q))
                    else:assert a==LEDGER and H(q)==tr['binding']
                if k=='append':assert p==m.jp; chunks.append(q)
                if k=='truncate':assert a==TRUNC and p==m.jp and q.startswith(HEADER)
                if k=='rename-file':assert q.decode()==(m.jp if a==INIT else m.lp)
                if k=='rename-dir':assert a in (BUNDLE,EVID) and ('/bootstrap-prepared/' if a==BUNDLE else '/abandon-evidence/') in q.decode()
            if chunks and tr['result']=='CONSUMED':assert H(b''.join(chunks))==tr['binding']
    print('V6_INTERNAL_EFFECTS_AUDITED',count,'all action-bounded; zero undeclared writes')
check('I independent trace effect/instance/byte allowlist audit',effect_audit)

failures=[x for x in results if x[1] is not None]
for name,m in trace_models:
    raw=J(m.trace); transitions=[x['before']['stage']+'>'+x['action']+'>'+x['after']['stage'] for x in m.trace]
    print('TRACE',name,'events='+str(len(m.trace)),'sha256='+H(raw),' | '.join(transitions))
    if globals().get('TRACE_ALL',False):print('TRACE_EXACT',name,raw.decode())
print('V6_RESULTS',len(results),'executed',len(results)-len(failures),'succeeded',len(failures),'failed')
print('V6_BOUNDARIES','initialization='+str(boundaries*2),'evidence='+str(eboundaries*2))
print('V6_ACTION_COVERAGE',sorted({x['action'] for _,m in trace_models for x in m.trace if x.get('instance') is not None}))
print('V6_INIT_HEADER_SHA256',H(HEADER))
assert not failures,failures
```

## 12. Seventh-amendment persistence conformance model (historical V7)

Recorded V7 results/pins below are historical, not V8 executions. V7's
witness-only COMMIT and version-2 COMMIT observations are superseded by
§§2.5B/2.5D; the V7 fence stays byte-identical. §13's inspected V8 fixture
selectively reuses retained T1/T2/T3 helpers and strengthens targeted failure
checks, rather than claiming these old pins prove COMMIT repair.

Historically this fence replaced §11 for persistence conformance. It executes T1/T2/T3
counterexamples, not just more V6 cases. It imports only §10's pure calculation
helpers; §11 is not executed. V5 private objects remain historical and are
rejected by the active verifier. Fixture owner encodings below are **synthetic
owner-boundary inputs**, not actual Bootstrap V2/Git provenance or a production
C30-03 ledger codec. They have explicit complete dependency maps, and successor
budget proofs recursively contain the preceding model bundle/transaction/COMMIT.
No proof leaf or original S is available to recovery outside retained bytes.
The test driver may retain expected S for comparison; recovery never reads it.

Assumptions: a durable pre-installed U anchor, stable inode identities, reliable
successful file and directory fsync with the nonrecursive semantics in §2.5D,
atomic no-replace sibling rename, serialized owner actions. Five distinct kinds
of state are represented: process memory/authorities, visible file contents,
durable file contents, visible directory entries, durable directory entries.
Process exit clears only the first; power loss then reloads only reachable
flushed inodes/entries/contents. File fsync cannot persist its name; directory
fsync cannot persist its parent link or child contents. No recursive sync helper
exists. Fault injection and namespace substitution are labeled harness effects.
This is not a real filesystem crash, TTY, security, generic JCS, full source
provenance or complete runtime implementation test; none was run.

Exact execution command (standard library, all fixture definitions stay here):

```bash
python3 - <<'PY'
from pathlib import Path
import contextlib, io
s = Path('docs/v2-sprints/00B_MASTER_PLAN_LCIM_3_0_CORE.md').read_text()
ns = {'SOURCE': s}
out = io.StringIO()
with contextlib.redirect_stdout(out):
    exec(compile(s.split('```python fixture-v5\n', 1)[1].split('\n```', 1)[0], '<v5-calculations>', 'exec'), ns)
for line in out.getvalue().splitlines():
    if line.startswith(('PUBLIC_', 'CAUSE_', 'PREPARE_REPEAT', 'CLASSIFIED_SHAPE_', 'NEGATIVE_', 'PARSER_CASES', 'PINNED_')):
        print(line)
exec(compile(s.split('```python fixture-v7\n', 1)[1].split('\n```', 1)[0], '<v7-persistence>', 'exec'), ns)
PY
```

```python fixture-v7
from datetime import datetime, timedelta
INIT='INITIALIZE_WITNESS_JOURNAL'; BUNDLE='PERSIST_PREPARED_BUNDLE'
PREP='APPEND_WITNESS_PREPARE'; LEDGER='PUBLISH_LEDGER_TRANSACTION'
COMMIT='APPEND_WITNESS_COMMIT'; TRUNC='TRUNCATE_INCOMPLETE_FINAL_FRAME'
EVID='PERSIST_ABANDON_EVIDENCE'; ABANDON='APPEND_WITNESS_ABANDON'
ACTIONS=(INIT,BUNDLE,PREP,LEDGER,COMMIT,TRUNC,EVID,ABANDON)
HEADER=b'LCIMWJ01'; ZERO='0'*64; HOME='/controller-fixture'; ROOT=HOME+'/.lcim-private'
BK=dict(semanticContract='semanticContractDigest',activeGuidance='activeGuidanceDigest',
    configuration='configurationDigest',modelRouting='modelRoutingDigest',planDeclaration='planDeclarationDigest')
SK=('reviewedSourceGenerationId','sourceCommit','sourceTree')
SNAP='operationId repositoryId runId publicationKind createdAt expiresAt reviewedSourceGenerationId sourceCommit sourceTree semanticContractDigest activeGuidanceDigest configurationDigest modelRoutingDigest planDeclarationDigest budgetPredecessor'
HBASE='publicationKind repositoryId runId journalId reviewedSourceGenerationId sourceCommit sourceTree budgetPredecessor expectedPredecessorLedgerHead expectedLedgerSequence expectedPredecessorWitnessHead createdAt expiresAt semanticContractDigest activeGuidanceDigest configurationDigest modelRoutingDigest planDeclarationDigest'
EN=['prepared-binding.jcs','current-binding.jcs','reason-evidence.jcs','proposal-observation.jcs',
    'owner-inputs.jcs','publication-bundle.jcs','ledger-prefix.bin','witness-prefix.bin','abandon.frame']
def stamp(n):
    return (datetime(2026,3,9)+timedelta(seconds=n)).isoformat(timespec='milliseconds')+'Z'
def octs(b):return dict(bytesBase64=base64.b64encode(b).decode().rstrip('='),byteLength=len(b),sha256=H(b))
def un(x,empty=False):
    exact(x,'bytesBase64 byteLength sha256'); assert type(x['byteLength']) is int
    assert (0 if empty else 1)<=x['byteLength']<=9007199254740991
    b=base64.b64decode(x['bytesBase64']+'='*(-len(x['bytesBase64'])%4),validate=True)
    assert octs(b)==x; return b

def external(configuration=b'S: resolved nonsecret configuration'):
    # Constructor used only by the launcher/test driver, never recovery.
    return dict(streams=dict(semanticContract=b'nonsecret semantic contract',activeGuidance=b'complete synthetic guidance',
        configuration=configuration,modelRouting=b'Flash max/MAX; controller Sol XHIGH',
        planDeclaration=J({'fixturePlan':'bounded local activation'})),
        commit=b'synthetic exact commit object',tree=b'synthetic exact tree object',verifier=b'synthetic owner verifier input')
def facts(ext):
    q={v:H(b'LCIM-PLAN-DECLARATION-v1\x00'+ext['streams'][k]) if k=='planDeclaration' else H(ext['streams'][k]) for k,v in BK.items()}
    q.update(sourceCommit=H(ext['commit']),sourceTree=H(ext['tree']),reviewedSourceGenerationId='srcgen_'+H(ext['verifier']))
    return q

def wsparse(z):
    assert z[:8]==HEADER; out=[]; at=8
    while at<len(z):
        assert len(z)-at>=4; n=int.from_bytes(z[at:at+4],'big'); assert 1<=n<=1048576
        raw=z[at:at+4+n+32]; w=json.loads(raw[4:-32]); assert len(raw)==4+n+32
        schemaw(w); assert frame(w)==raw and w['sequence']==len(out)
        assert w['predecessorWitnessHead']==(out[-1]['headDigest'] if out else None)
        out.append(w); at+=len(raw)
    return out

def txparse(z):
    out=[]; at=0
    while at<len(z):
        n=int.from_bytes(z[at:at+4],'big'); q=z[at+4:at+4+n]; assert n==len(q)>0
        x=json.loads(q); assert J(x)==q
        assert x==txfinish({k:v for k,v in x.items() if k not in ('transactionId','transactionDigest','headDigest')})
        assert x['sequence']==len(out) and x['predecessorHead']==(out[-1]['headDigest'] if out else ZERO)
        out.append(x); at+=4+n
    return out

def archive(p,purpose,contents,deps,roots):
    return octs(J(dict(schemaName='lcim.owner-proof-archive',schemaVersion=1,purpose=purpose,binding=p,roots=sorted(roots),
        inputs=[dict(key=k,content=octs(contents[k]),requires=sorted(deps.get(k,[]))) for k in sorted(contents)])))
def amap(x,p,purpose):
    a=json.loads(un(x)); exact(a,'schemaName schemaVersion purpose binding roots inputs')
    assert a['schemaName']=='lcim.owner-proof-archive' and type(a['schemaVersion']) is int and a['schemaVersion']==1
    assert a['binding']==p and a['purpose']==purpose and J(a)==un(x)
    assert 1<=len(a['inputs'])<=9007199254740991
    keys=[v['key'] for v in a['inputs']]; assert keys==sorted(set(keys))
    for v in a['inputs']:
        exact(v,'key content requires'); k=v['key']
        assert type(k) is str and 1<=len(k.encode())<=4096 and not any(c in k for c in '/\\\x00') and k not in ('.','..')
        assert v['requires']==sorted(set(v['requires'])) and set(v['requires'])<=set(keys)
    roots=['checkpoint-manifest','checkpoint-proof','source-registry'] if purpose=='SOURCE_CHECKPOINT' else ['ledger-prefix','witness-prefix']
    assert a['roots']==roots
    d={v['key']:v for v in a['inputs']}; seen=set()
    def visit(k,stack):
        assert k not in stack and k in d
        for child in d[k]['requires']:visit(child,stack|{k})
        seen.add(k)
    for k in roots:visit(k,set())
    assert seen==set(keys)
    return {k:un(v['content'],empty=k=='ledger-prefix') for k,v in d.items()}, {k:v['requires'] for k,v in d.items()}

def bundle_copy(files,kind):return dict(publicationKind=kind,entries=[dict(filename=n,**octs(b)) for n,b in files.items()])
def unbundle(c):
    exact(c,'publicationKind entries'); f={}
    for e in c['entries']:
        exact(e,'filename bytesBase64 byteLength sha256'); assert e['filename'] not in f
        f[e['filename']]=un({k:v for k,v in e.items() if k!='filename'})
    assert list(f)==bnames(c['publicationKind']); return f

def owner_side(p,ext,ledger,witness_bytes,priorbundles):
    sf={k:p[k] for k in SK}
    manifest0=J(dict(sf,commitSha256=H(ext['commit']),treeSha256=H(ext['tree']),verifierSha256=H(ext['verifier'])))
    registry0=J(dict(repositoryId=p['repositoryId'],runId=p['runId'],source=sf,manifestSha256=H(manifest0)))
    proof0=J(dict(manifestSha256=H(manifest0),registrySha256=H(registry0)))
    content={'checkpoint-manifest':manifest0,'source-registry':registry0,'checkpoint-proof':proof0,
        'git-commit':ext['commit'],'git-tree':ext['tree'],'verifier':ext['verifier']}
    deps={'checkpoint-manifest':['git-commit','git-tree','verifier'],'source-registry':['checkpoint-manifest'],
        'checkpoint-proof':['checkpoint-manifest','source-registry']}
    budget={'ledger-prefix':ledger,'witness-prefix':witness_bytes}
    for i,f in enumerate(priorbundles):budget['bundle-'+format(i,'08d')]=J(bundle_copy(f,json.loads(f['publication-manifest.jcs'])['publicationKind']))
    bd={'ledger-prefix':sorted(k for k in budget if k.startswith('bundle-')),'witness-prefix':[]}
    return dict({k:octs(ext['streams'][k]) for k in BK},
        sourceCheckpointEvidence=archive(p,'SOURCE_CHECKPOINT',content,deps,['checkpoint-manifest','checkpoint-proof','source-registry']),
        budgetPredecessorEvidence=archive(p,'BUDGET_PREDECESSOR',budget,bd,['ledger-prefix','witness-prefix']))

def verify_side(side,p):
    exact(p,SNAP); exact(side,' '.join(BK)+' sourceCheckpointEvidence budgetPredecessorEvidence')
    for k,v in BK.items():
        q=un(side[k]); assert p[v]==(H(b'LCIM-PLAN-DECLARATION-v1\x00'+q) if k=='planDeclaration' else H(q))
        if k=='planDeclaration':assert J(json.loads(q))==q
    c,d=amap(side['sourceCheckpointEvidence'],p,'SOURCE_CHECKPOINT')
    assert set(c)=={'checkpoint-manifest','checkpoint-proof','source-registry','git-commit','git-tree','verifier'}
    assert d=={'checkpoint-manifest':['git-commit','git-tree','verifier'],'checkpoint-proof':['checkpoint-manifest','source-registry'],
        'source-registry':['checkpoint-manifest'],'git-commit':[],'git-tree':[],'verifier':[]}
    sf={k:p[k] for k in SK}
    assert p['sourceCommit']==H(c['git-commit']) and p['sourceTree']==H(c['git-tree']) and p['reviewedSourceGenerationId']=='srcgen_'+H(c['verifier'])
    assert c['checkpoint-manifest']==J(dict(sf,commitSha256=H(c['git-commit']),treeSha256=H(c['git-tree']),verifierSha256=H(c['verifier'])))
    assert c['source-registry']==J(dict(repositoryId=p['repositoryId'],runId=p['runId'],source=sf,manifestSha256=H(c['checkpoint-manifest'])))
    assert c['checkpoint-proof']==J(dict(manifestSha256=H(c['checkpoint-manifest']),registrySha256=H(c['source-registry'])))
    c,d=amap(side['budgetPredecessorEvidence'],p,'BUDGET_PREDECESSOR')
    txs=txparse(c['ledger-prefix']); w=wsparse(c['witness-prefix']); budgets=[]; priorfiles=[]
    assert set(c)=={'ledger-prefix','witness-prefix'}|{'bundle-'+format(i,'08d') for i in range(len(txs))}
    assert d['ledger-prefix']==sorted(k for k in c if k.startswith('bundle-')) and d['witness-prefix']==[]
    for i,t in enumerate(txs):
        key='bundle-'+format(i,'08d'); assert d[key]==[]
        f=unbundle(json.loads(c[key])); m=verify_bundle(f); priorfiles.append(f)
        assert f['canonical-transaction.jcs']==J(t) and t['operationId']!=p['operationId']
        assert t['repositoryId']==p['repositoryId'] and t['runId']==p['runId']
        prep0=[v for v in w if v['operationId']==t['operationId'] and v['frameKind']=='PREPARE']
        commits=[v for v in w if v['operationId']==t['operationId'] and v['frameKind']=='COMMIT']
        assert len(prep0)==len(commits)==1 and commits[0]['preparedFrameDigest']==prep0[0]['frameDigest']
        assert commits[0]['intendedTransactionDigest']==t['transactionDigest'] and commits[0]['publicationBundleDigest']==bid(m)
        budgets.append(json.loads(f[bnames(m['publicationKind'])[1]]))
    assert p['budgetPredecessor']==(budgets[-1] if budgets else None)
    return c['ledger-prefix'],c['witness-prefix'],priorfiles

def bnames(kind):
    assert kind in ('TRANSACTION_ZERO','SUCCESSOR_ACTIVATION')
    middle=['01-budget.jcs','02-operator-session.jcs','03-plan-confirmation.jcs','04-non-runnable-genesis.jcs','05-activation-settlement.jcs'] if kind=='TRANSACTION_ZERO' else ['01-budget-successor.jcs','02-operator-session-successor.jcs','03-plan-confirmation-successor.jcs','04-activation-settlement-successor.jcs']
    return ['candidate-set-core.jcs']+middle+['canonical-transaction.jcs','publication-manifest.jcs','SEALED']
def prefix(kind):return 'genesis' if kind=='TRANSACTION_ZERO' else 'successor'
def domain(kind,what):return 'LCIM-'+prefix(kind).upper()+'-ACTIVATION-'+what+'-v1'
def idkey(kind):return 'publicationBundleDigest' if kind=='TRANSACTION_ZERO' else 'successorPublicationBundleDigest'
def opkey(kind):return 'bootstrapOperationId' if kind=='TRANSACTION_ZERO' else 'operationId'
def bid(m):return m[idkey(m['publicationKind'])]
def psnap(m):return {k:(m[opkey(m['publicationKind'])] if k=='operationId' else m[k]) for k in SNAP.split()}
def seal_manifest(m):
    m=copy.deepcopy(m); k=idkey(m['publicationKind']); m.pop(k,None)
    m[k]=DH(domain(m['publicationKind'],'PUBLICATION-BUNDLE'),m); return m

def build_bundle(kind,operation,jid,ext,ledger,wbytes,priorfiles,clock):
    txs=txparse(ledger); ws=wsparse(wbytes); old=[]
    if priorfiles:
        f=priorfiles[-1]; old=[json.loads(f[n]) for n in bnames(json.loads(f['publication-manifest.jcs'])['publicationKind'])[1:-3]]
    hf=dict(facts(ext),publicationKind=kind,repositoryId=repo,runId=run,journalId=jid,
        budgetPredecessor=old[0] if old else None,expectedPredecessorLedgerHead=txs[-1]['headDigest'] if txs else ZERO,
        expectedLedgerSequence=len(txs),expectedPredecessorWitnessHead=ws[-1]['headDigest'] if ws else None,
        createdAt=stamp(clock),expiresAt=stamp(clock+60),**{opkey(kind):operation})
    def rec(i,priorrec=None):
        q=copy.deepcopy(T[i])
        updates=dict(facts(ext),repositoryId=repo,runId=run,operationId=operation,ttyConfirmationOperationId=operation,
            bootstrapOperationId=operation,operatorConfirmationOperationId=operation,sourceGenerationId=hf['reviewedSourceGenerationId'],
            observedAt=stamp(clock),confirmedAt=stamp(clock),preparedAt=stamp(clock))
        for k,v in updates.items():
            if k in q:q[k]=v
        q.update(predecessorGenerationId=priorrec['recordId'] if priorrec else None,expectedCurrentHead=priorrec['recordId'] if priorrec else None)
        return q
    b0=rec(2,old[0] if old else None); b0.update(reason='DECREASE' if old else 'INITIAL')
    for c in b0['ceilings']:c['confirmedCeiling']=12
    b0=finish(b0); s0=rec(0,old[1] if old else None)
    s0.update(budgetCeilingGenerationId=b0['recordId'],budgetCeilingDigest=b0['recordDigest'],
        authorityClass='GENESIS_ACTIVATION_BOOTSTRAP_AUTHORITY' if kind=='TRANSACTION_ZERO' else 'SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY')
    s0=finish(s0); p0=rec(1,old[2] if old else None)
    p0.update(budgetCeilingGenerationId=b0['recordId'],budgetCeilingDigest=b0['recordDigest'],operatorSessionGenerationId=s0['recordId'],operatorSessionDigest=s0['recordDigest'])
    p0=finish(p0); a0=rec(4,old[-1] if old else None)
    a0.update(candidateSetKind=kind,budgetCeilingGenerationId=b0['recordId'],budgetCeilingDigest=b0['recordDigest'],
        operatorSessionGenerationId=s0['recordId'],operatorSessionDigest=s0['recordDigest'],planConfirmationGenerationId=p0['recordId'],planConfirmationDigest=p0['recordDigest'],
        **{k:hf[k] for k in ('expectedPredecessorLedgerHead','expectedLedgerSequence','expectedPredecessorWitnessHead')})
    finals0=[b0,s0,p0]
    if kind=='TRANSACTION_ZERO':finals0.append(dict(kind='NON_RUNNABLE_PENDING_ACTIVATION_COMMIT',repositoryId=repo,runId=run,operationId=operation))
    ap={k:v for k,v in a0.items() if k not in ids|{'candidateSetDigest'}}
    kinds=[x.get('schemaName','NON_RUNNABLE_PENDING_ACTIVATION_COMMIT')+('@1' if 'schemaName' in x else '') for x in finals0]
    co=dict(hf,schemaName='lcim.'+prefix(kind)+'-activation-candidate-set-core',schemaVersion=1,
        candidates=[desc(i+1,k,x) for i,(k,x) in enumerate(zip(kinds+['activationProposalCore'],finals0+[ap]))])
    sd=DH(domain(kind,'CANDIDATE-SET'),co); a0=finish(dict(a0,candidateSetDigest=sd)); finals0.append(a0); kinds.append('lcim.local-activation-settlement@1')
    ev=[dict(eventKind='GENESIS' if kind=='TRANSACTION_ZERO' else kind,candidate=dict(desc(i+1,k,x),recordId=x.get('recordId'),recordDigest=x.get('recordDigest'))) for i,(k,x) in enumerate(zip(kinds,finals0))]
    tx0=txfinish(dict(schemaName='lcim.controller-transaction',schemaVersion=1,protocolVersion='3.0',operationId=operation,
        repositoryId=repo,runId=run,sequence=len(txs),predecessorHead=hf['expectedPredecessorLedgerHead'],preparedAt=hf['createdAt'],events=ev,payloadDigest=H(J(ev))))
    objects=[co]+finals0+[tx0]; files=dict(zip(bnames(kind)[:-2],[J(x) for x in objects]))
    ad=[dict(filename=n,ordinal=i,familyOrKind=k,byteLength=len(files[n]),sha256=H(files[n]),recordId=x.get('recordId'),recordDigest=x.get('recordDigest'))
        for i,(n,k,x) in enumerate(zip(files,[co['schemaName']+'@1']+kinds+['lcim.controller-transaction@1'],objects))]
    p=psnap(hf); side=owner_side(p,ext,ledger,wbytes,priorfiles); verify_side(side,p)
    cap=dict(schemaName='lcim.prepared-input-capsule',schemaVersion=1,preparedBindingSnapshot=p,ownerInputs=side)
    m=seal_manifest(dict(hf,schemaName='lcim.'+prefix(kind)+'-activation-publication-bundle',schemaVersion=2,preparedInputs=cap,
        candidateSetDigest=sd,canonicalTransactionId=tx0['transactionId'],canonicalTransactionDigest=tx0['transactionDigest'],artifacts=ad))
    files.update({'publication-manifest.jcs':J(m),'SEALED':bid(m).encode()}); verify_bundle(files); return files

def verify_bundle(f):
    m=json.loads(f['publication-manifest.jcs']); kind=m['publicationKind']; ns=bnames(kind)
    assert list(f)==ns and J(m)==f['publication-manifest.jcs']
    exact(m,HBASE+' '+opkey(kind)+' schemaName schemaVersion preparedInputs candidateSetDigest canonicalTransactionId canonicalTransactionDigest artifacts '+idkey(kind))
    assert type(m['schemaVersion']) is int and m['schemaVersion']==2 and m['schemaName']=='lcim.'+prefix(kind)+'-activation-publication-bundle'
    assert m==seal_manifest(m) and f['SEALED']==bid(m).encode()
    cap=m['preparedInputs']; exact(cap,'schemaName schemaVersion preparedBindingSnapshot ownerInputs')
    assert cap['schemaName']=='lcim.prepared-input-capsule' and type(cap['schemaVersion']) is int and cap['schemaVersion']==1
    assert cap['preparedBindingSnapshot']==psnap(m)
    led,wp,_=verify_side(cap['ownerInputs'],psnap(m)); txs=txparse(led); ws=wsparse(wp)
    assert m['expectedPredecessorLedgerHead']==(txs[-1]['headDigest'] if txs else ZERO) and m['expectedLedgerSequence']==len(txs)
    assert m['expectedPredecessorWitnessHead']==(ws[-1]['headDigest'] if ws else None)
    assert all(w['journalId']==m['journalId'] and w['operationId']!=m[opkey(kind)] for w in ws)
    co=json.loads(f[ns[0]]); exact(co,HBASE+' '+opkey(kind)+' schemaName schemaVersion candidates')
    assert co['schemaName']=='lcim.'+prefix(kind)+'-activation-candidate-set-core' and co['schemaVersion']==1
    for k in (HBASE+' '+opkey(kind)).split():assert co[k]==m[k]
    assert DH(domain(kind,'CANDIDATE-SET'),co)==m['candidateSetDigest']
    finals0=[json.loads(f[n]) for n in ns[1:-3]]; assert len(finals0)==(5 if kind=='TRANSACTION_ZERO' else 4)
    assert len(co['candidates'])==len(finals0) and len(m['artifacts'])==len(ns)-2
    kinds=[]
    for i,x in enumerate(finals0):
        k=x['schemaName']+'@1' if 'schemaName' in x else 'NON_RUNNABLE_PENDING_ACTIVATION_COMMIT'; kinds.append(k)
        assert x['operationId']==m[opkey(kind)] and x['repositoryId']==m['repositoryId'] and x['runId']==m['runId']
        if 'schemaName' in x:
            record_check(x)
            for field in list(BK.values())+list(SK):
                if field in x:assert x[field]==m[field]
            if 'sourceGenerationId' in x:assert x['sourceGenerationId']==m['reviewedSourceGenerationId']
        proj={k:v for k,v in x.items() if k not in ids|{'candidateSetDigest'}} if i==len(finals0)-1 else x
        assert co['candidates'][i]==desc(i+1,'activationProposalCore' if i==len(finals0)-1 else k,proj)
    a=finals0[-1]; assert a['candidateSetDigest']==m['candidateSetDigest'] and a['candidateSetKind']==kind
    assert finals0[0]['predecessorGenerationId']==(m['budgetPredecessor']['recordId'] if m['budgetPredecessor'] else None)
    t=json.loads(f['canonical-transaction.jcs']); assert t==txfinish({k:v for k,v in t.items() if k not in ('transactionId','transactionDigest','headDigest')})
    exact(t,'schemaName schemaVersion protocolVersion operationId repositoryId runId sequence predecessorHead preparedAt events payloadDigest transactionId transactionDigest headDigest')
    assert t['schemaName']=='lcim.controller-transaction' and t['schemaVersion']==1 and t['protocolVersion']=='3.0'
    assert t['operationId']==m[opkey(kind)] and t['repositoryId']==m['repositoryId'] and t['runId']==m['runId'] and t['preparedAt']==m['createdAt']
    assert (t['transactionId'],t['transactionDigest'],t['sequence'],t['predecessorHead'])==(m['canonicalTransactionId'],m['canonicalTransactionDigest'],m['expectedLedgerSequence'],m['expectedPredecessorLedgerHead'])
    assert t['events']==[dict(eventKind='GENESIS' if kind=='TRANSACTION_ZERO' else kind,candidate=dict(desc(i+1,k,x),recordId=x.get('recordId'),recordDigest=x.get('recordDigest'))) for i,(k,x) in enumerate(zip(kinds,finals0))]
    assert t['payloadDigest']==H(J(t['events']))
    objects=[co]+finals0+[t]
    assert m['artifacts']==[dict(filename=n,ordinal=i,familyOrKind=k,byteLength=len(f[n]),sha256=H(f[n]),recordId=x.get('recordId'),recordDigest=x.get('recordDigest'))
        for i,(n,k,x) in enumerate(zip(ns,[co['schemaName']+'@1']+kinds+['lcim.controller-transaction@1'],objects))]
    return m

class Interrupted(Exception):pass
class FlushFailure(Exception):pass
class Store:
    def __init__(self):
        self.ve={1:{}}; self.de={1:{}}; self.vf={}; self.df={}; self.meta={1:('DIRECTORY',1,1,1000,'0700')}; self.synced={1}; self.serial=1
        self.trace=[]; self.active=None; self.allowed=set(); self.fail=None; self.stop=None; self.effects=0
    def lookup(self,path,durable=False):
        assert path==HOME or path.startswith(HOME+'/'); i=1; entries=self.de if durable else self.ve
        for part in path[len(HOME):].strip('/').split('/') if path!=HOME else []:
            i=entries[i][part]
        return i
    def has(self,p):
        try:self.lookup(p); return True
        except KeyError:return False
    def parent(self,p):return p.rsplit('/',1)[0]
    def chain(self,p):
        out=[]
        while p!=HOME:out.append(p); p=self.parent(p)
        return [HOME]+list(reversed(out))
    def read(self,p):return self.vf[self.lookup(p)]
    def effect(self,op,p,fn):
        assert self.active in ACTIONS and p in self.allowed,(self.active,op,p)
        assert op in ({'mkdir','create','write','fsync-file','fsync-dir','rename'} if self.active in (INIT,BUNDLE,EVID,LEDGER) else {'write','fsync-file','fsync-dir'})
        if self.stop==self.effects:raise Interrupted()
        if self.fail==(op,p) or self.fail==op or self.fail==(op,p,self.effects):raise FlushFailure(op)
        fn(); self.effects+=1; self.trace.append((self.active,op,p))
    def create(self,p,directory):
        def f():
            par=self.lookup(self.parent(p)); name=p.rsplit('/',1)[1]; assert name not in self.ve[par]
            self.serial+=1; i=self.serial; self.ve[par][name]=i
            self.meta[i]=('DIRECTORY' if directory else 'FILE',1,i,1000,'0700' if directory else '0600')
            if directory:self.ve[i]={}
            else:self.vf[i]=b''
        self.effect('mkdir' if directory else 'create',p,f)
    def write(self,p,b):self.effect('write',p,lambda:self.vf.__setitem__(self.lookup(p),b))
    def fsfile(self,p):
        def f():i=self.lookup(p); self.df[i]=self.vf[i]; self.synced.add(i)
        self.effect('fsync-file',p,f) # NO directory-entry effect
    def fsdir(self,p):
        def f():i=self.lookup(p); self.de[i]=dict(self.ve[i]); self.synced.add(i)
        self.effect('fsync-dir',p,f) # NO parent-link or child-content effect
    def rename(self,src,dst):
        assert dst in self.allowed and self.parent(src)==self.parent(dst)
        def f():
            par=self.lookup(self.parent(src)); assert dst.rsplit('/',1)[1] not in self.ve[par]
            self.ve[par][dst.rsplit('/',1)[1]]=self.ve[par].pop(src.rsplit('/',1)[1])
        self.effect('rename',src,f)
    def bindings(self,paths):
        out=[]
        for p in sorted(set(paths)):
            if self.has(p):
                k,dev,ino,uid,mode=self.meta[self.lookup(p)]; assert uid==1000 and mode==('0700' if k=='DIRECTORY' else '0600')
                out.append(dict(path=p,kind=k,deviceId=dev,inodeId=ino,ownerUid=uid,mode=mode))
            else:out.append(dict(path=p,kind='ABSENT',deviceId=None,inodeId=None,ownerUid=None,mode=None))
        return out
    def durable(self,p,files=None):
        try:
            i=self.lookup(p,True); assert i==self.lookup(p) and i in self.synced
            if files is None:return self.df.get(i)==self.vf[i]
            assert set(self.de[i])==set(files)
            return all(self.lookup(p+'/'+n,True) in self.synced and self.df.get(self.lookup(p+'/'+n,True))==b for n,b in files.items())
        except (KeyError,AssertionError):return False
    def paths(self):
        out=[]
        def walk(p,i):
            out.append(p)
            for n,j in self.ve.get(i,{}).items():walk(p+'/'+n,j)
        walk(HOME,1); return out
    def power_loss(self):
        self.ve={i:dict(d) for i,d in self.de.items()}; self.vf=dict(self.df)
        # Unflushed inode metadata cannot make a newly created entry survive.
        for d in self.ve.values():
            for n,i in list(d.items()):
                if i not in self.synced:del d[n]
        self.active=None

class V7:
    def __init__(self):
        self.fs=Store(); self.jp=ROOT+'/witness/v1/'+repo+'/'+run+'/witness.journal'; self.lp=ROOT+'/ledger/v1/'+repo+'/'+run+'/ledger'
        self.jid='journal_'+DH('LCIM-LOCAL-WITNESS-JOURNAL-v1',dict(repositoryId=repo,runId=run,absoluteCanonicalJournalPath=self.jp))
        self.clock=0; self.ext=external(); self.op='op_'+H(b'V7 initial operation')[:32]; self.kind='TRANSACTION_ZERO'; self.bp=self.bpath()
        self.mem=None; self.auth={}; self.known=set(); self.selected=None; self.seq=0; self.anchor_supported=True
    def bpath(self):return ROOT+('/bootstrap-prepared/v1/' if self.kind=='TRANSACTION_ZERO' else '/successor-activation-prepared/v1/')+repo+'/'+self.op
    def ledger(self):return self.fs.read(self.lp) if self.fs.has(self.lp) else b''
    def files(self,p,names):
        assert set(self.fs.ve[self.fs.lookup(p)])==set(names)
        return {n:self.fs.read(p+'/'+n) for n in names}
    def bundle(self):
        f=self.files(self.bp,bnames(self.kind)) if self.fs.has(self.bp) else self.mem
        assert f is not None; verify_bundle(f); return f
    def mf(self):return verify_bundle(self.bundle())
    def priorfiles(self):
        prior=[]
        for t in txparse(self.ledger()):
            if t['operationId']==self.op:continue
            paths=[p for p in self.fs.paths() if p.endswith('/publication-manifest.jcs') and json.loads(self.fs.read(p)).get(opkey(json.loads(self.fs.read(p))['publicationKind']))==t['operationId']]
            assert len(paths)==1; path0=paths[0].rsplit('/',1)[0]; kind=json.loads(self.fs.read(paths[0]))['publicationKind']
            prior.append(self.files(path0,bnames(kind)))
        return prior
    def prepare(self):
        self.mem=build_bundle(self.kind,self.op,self.jid,self.ext,self.ledger(),self.fs.read(self.jp),self.priorfiles(),self.clock)
    def snapshot(self,current=False):
        m=self.mf(); p=copy.deepcopy(m['preparedInputs']['preparedBindingSnapshot'])
        if current:
            p.update(facts(self.ext)); prior=self.priorfiles()
            p['budgetPredecessor']=json.loads(prior[-1][bnames(json.loads(prior[-1]['publication-manifest.jcs'])['publicationKind'])[1]]) if prior else None
        return p
    def causes(self,p,c,t):
        checks=[t>=p['expiresAt'],any(p[k]!=c[k] for k in SK)]+[p[k]!=c[k] for k in BK.values()]+[p['budgetPredecessor']!=c['budgetPredecessor']]
        return [r for r,v in zip(reasons,checks) if v]
    def makeframe(self,kind,e=None):
        m=self.mf(); ws=wsparse(self.fs.read(self.jp)); prev=ws[-1] if ws else None
        prep0=next((w for w in ws if w['operationId']==self.op and w['frameKind']=='PREPARE'),None)
        q=dict(schemaName='lcim.local-consistency-witness',schemaVersion=1,recordKind='LOCAL_CONSISTENCY_WITNESS_FRAME',operationId=self.op,
            repositoryId=repo,runId=run,journalId=self.jid,frameKind=kind,sequence=len(ws),predecessorWitnessHead=prev['headDigest'] if prev else None,
            predecessorGenerationId=prev['recordId'] if prev else None,expectedCurrentHead=prev['recordId'] if prev else None,
            expectedPredecessorLedgerHead=m['expectedPredecessorLedgerHead'],expectedLedgerSequence=m['expectedLedgerSequence'],
            intendedTransactionId=m['canonicalTransactionId'],intendedTransactionDigest=m['canonicalTransactionDigest'],publicationBundleDigest=bid(m),
            preparedFrameDigest=prep0['frameDigest'] if prep0 and kind!='PREPARE' else None,terminalReason=e['observedCauseSet'][0] if e else None,
            terminalReasonEvidenceDigest=DH('LCIM-WITNESS-ABANDON-REASON-EVIDENCE-v1',e) if e else None,
            observedAt=e['observedAt'] if e else m['createdAt'],observationId='obs_'+DH('LCIM-BOOTSTRAP-WITNESS-OBS-v1',[self.op,bid(m),kind])[:32])
        return witness(q)
    def baseobs(self):
        m=self.mf(); wbytes=self.fs.read(self.jp); ws=wsparse(wbytes); ours=[w for w in ws if w['operationId']==self.op]
        pw=next((w for w in ours if w['frameKind']=='PREPARE'),None); tw=next((w for w in ours if w['frameKind'] in ('COMMIT','ABANDON')),None)
        txs=txparse(self.ledger()); present=any(t['operationId']==self.op for t in txs)
        if present:assert J(txs[-1])==self.bundle()['canonical-transaction.jcs']
        else:assert (txs[-1]['headDigest'] if txs else ZERO)==m['expectedPredecessorLedgerHead']
        storage='SEALED_VERIFIED' if self.bp in self.known else 'VISIBLE_VERIFIED' if self.fs.has(self.bp) else 'MEMORY_VERIFIED'
        st='COMMITTED' if tw and tw['frameKind']=='COMMIT' else 'ABANDONED' if tw else 'LEDGER_WITHOUT_COMMIT' if present else 'PREPARE_ONLY' if pw else 'SEALED_NO_PREPARE' if self.fs.has(self.bp) else 'PRE_PERSISTENCE'
        p,c=self.snapshot(),self.snapshot(True); tx0=json.loads(self.bundle()['canonical-transaction.jcs'])
        def sm(w):return dict(recordId=w['recordId'],frameDigest=w['frameDigest'],headDigest=w['headDigest'],framedByteSha256=H(frame(w)),sequence=w['sequence'],framedByteLength=len(frame(w)))
        return dict(classification=st,publicationKind=self.kind,operationId=self.op,repositoryId=repo,runId=run,observedAt=stamp(self.clock),
            preparedBindingDigest=DH('LCIM-WITNESS-PREPARED-BINDING-v1',p),currentBindingDigest=DH('LCIM-WITNESS-CURRENT-BINDING-v1',c),observedCauseSet=self.causes(p,c,stamp(self.clock)),
            bundle=dict(storage=storage,destination='EXACT_PRESENT' if self.fs.has(self.bp) else 'VERIFIED_ABSENT',candidateSetDigest=m['candidateSetDigest'],publicationBundleDigest=bid(m),
                manifestSha256=H(J(m)),manifestByteLength=len(J(m)),transactionDigest=tx0['transactionDigest'],transactionSha256=H(J(tx0)),transactionByteLength=len(J(tx0)),transactionId=tx0['transactionId'],
                expectedPredecessorLedgerHead=m['expectedPredecessorLedgerHead'],expectedLedgerSequence=m['expectedLedgerSequence'],expectedPredecessorWitnessHead=m['expectedPredecessorWitnessHead'],expiresAt=m['expiresAt']),
            ledger=dict(headDigest=txs[-1]['headDigest'] if txs else ZERO,nextSequence=len(txs),transactionPresent=present),
            witness=dict(journalId=self.jid,verifiedPrefixByteLength=len(wbytes),verifiedPrefixSha256=H(wbytes),nextSequence=len(ws),headDigest=ws[-1]['headDigest'] if ws else None,
                currentGenerationId=ws[-1]['recordId'] if ws else None,prepare=sm(pw) if pw else None,terminal=dict(sm(tw),frameKind=tw['frameKind']) if tw else None,incompleteSuffix=None),nextAction=None)
    def ekey(self,f):
        w=json.loads(f['abandon.frame'][4:-32]); return ROOT+'/abandon-evidence/v1/'+repo+'/'+run+'/'+self.op+'/'+w['terminalReasonEvidenceDigest']+'/'+H(f['abandon.frame'])
    def package(self):
        o=self.baseobs(); o['nextAction']=EVID; assert o['bundle']['storage']=='SEALED_VERIFIED' and not o['ledger']['transactionPresent'] and o['observedCauseSet']
        p,c=self.snapshot(),self.snapshot(True); pw=o['witness']['prepare']
        e=dict(bootstrapOperationId=self.op,publicationBundleDigest=bid(self.mf()),preparedFrameDigest=pw['frameDigest'] if pw else None,observedCauseSet=o['observedCauseSet'],
            preparedBindingDigest=o['preparedBindingDigest'],currentBindingDigest=o['currentBindingDigest'],observedAt=o['observedAt'])
        w=self.makeframe('ABANDON',e); prepared=copy.deepcopy(self.mf()['preparedInputs']['ownerInputs'])
        # The current observation is separate. Prepared recovery reads ONLY persisted capsule bytes.
        verify_side(prepared,p)
        current=owner_side(c,self.ext,self.ledger(),self.fs.read(self.jp),self.priorfiles()); verify_side(current,c)
        vals=[J(p),J(c),J(e),J(o),J(dict(prepared=prepared,current=current)),J(bundle_copy(self.bundle(),self.kind)),self.ledger(),self.fs.read(self.jp),frame(w)]
        f=dict(zip(EN,vals)); mc=dict(schemaName='lcim.abandon-evidence-package',schemaVersion=2,publicationKind=self.kind,operationId=self.op,repositoryId=repo,runId=run,journalId=self.jid,
            absoluteCanonicalJournalPath=self.jp,publicationBundleDigest=bid(self.mf()),preparedFrameDigest=e['preparedFrameDigest'],terminalReasonEvidenceDigest=w['terminalReasonEvidenceDigest'],
            proposalObservationDigest=DH('LCIM-ABANDON-PROPOSAL-OBSERVATION-v1',o),abandonFramedByteDigest=H(frame(w)),observedAt=e['observedAt'],expectedLedgerHead=o['ledger']['headDigest'],
            expectedWitnessHead=o['witness']['headDigest'],expectedLedgerNextSequence=o['ledger']['nextSequence'],expectedWitnessNextSequence=o['witness']['nextSequence'],
            artifacts=[dict(ordinal=i,filename=n,byteLength=len(f[n]),sha256=H(f[n])) for i,n in enumerate(EN)])
        d=DH('LCIM-ABANDON-EVIDENCE-PACKAGE-v1',mc); f.update({'evidence-manifest.jcs':J(dict(mc,evidencePackageDigest=d)),'SEALED':d.encode()}); return f
    def verify_evidence(self,f):
        assert list(f)==EN+['evidence-manifest.jcs','SEALED']; m=json.loads(f['evidence-manifest.jcs'])
        exact(m,'schemaName schemaVersion publicationKind operationId repositoryId runId journalId absoluteCanonicalJournalPath publicationBundleDigest preparedFrameDigest terminalReasonEvidenceDigest proposalObservationDigest abandonFramedByteDigest observedAt expectedLedgerHead expectedWitnessHead expectedLedgerNextSequence expectedWitnessNextSequence artifacts evidencePackageDigest')
        assert m['schemaVersion']==2 and m['schemaName']=='lcim.abandon-evidence-package'
        assert J(m)==f['evidence-manifest.jcs'] and m['evidencePackageDigest']==f['SEALED'].decode()==DH('LCIM-ABANDON-EVIDENCE-PACKAGE-v1',{k:v for k,v in m.items() if k!='evidencePackageDigest'})
        assert m['artifacts']==[dict(ordinal=i,filename=n,byteLength=len(f[n]),sha256=H(f[n])) for i,n in enumerate(EN)]
        p,c,e,o,owners,bc=[json.loads(f[n]) for n in EN[:6]]; exact(owners,'prepared current')
        assert unbundle(bc)==self.bundle() and p==self.snapshot() and owners['prepared']==self.mf()['preparedInputs']['ownerInputs']
        verify_side(owners['prepared'],p); verify_side(owners['current'],c)
        assert e['preparedBindingDigest']==DH('LCIM-WITNESS-PREPARED-BINDING-v1',p) and e['currentBindingDigest']==DH('LCIM-WITNESS-CURRENT-BINDING-v1',c)
        assert self.causes(p,c,e['observedAt'])==e['observedCauseSet']==o['observedCauseSet']
        assert m['operationId']==self.op and m['publicationBundleDigest']==bid(self.mf()) and m['journalId']==self.jid
        assert m['publicationKind']==self.kind and m['repositoryId']==repo and m['runId']==run and m['absoluteCanonicalJournalPath']==self.jp
        exact(e,'bootstrapOperationId publicationBundleDigest preparedFrameDigest observedCauseSet preparedBindingDigest currentBindingDigest observedAt')
        assert e['bootstrapOperationId']==self.op and e['publicationBundleDigest']==bid(self.mf())
        assert o['operationId']==self.op and o['publicationKind']==self.kind and o['repositoryId']==repo and o['runId']==run
        assert o['preparedBindingDigest']==e['preparedBindingDigest'] and o['currentBindingDigest']==e['currentBindingDigest']
        assert o['witness']['verifiedPrefixSha256']==H(f['witness-prefix.bin']) and o['witness']['verifiedPrefixByteLength']==len(f['witness-prefix.bin'])
        txs=txparse(f['ledger-prefix.bin']); assert all(t['operationId']!=self.op for t in txs)
        assert m['expectedLedgerHead']==o['ledger']['headDigest']==(txs[-1]['headDigest'] if txs else ZERO)
        assert m['expectedLedgerNextSequence']==o['ledger']['nextSequence']==len(txs)
        w=json.loads(f['abandon.frame'][4:-32]); schemaw(w); assert frame(w)==f['abandon.frame']
        assert w['operationId']==self.op and w['repositoryId']==repo and w['runId']==run and w['journalId']==self.jid and w['publicationBundleDigest']==bid(self.mf())
        assert w['frameKind']=='ABANDON' and w['terminalReason']==e['observedCauseSet'][0]
        assert w['preparedFrameDigest']==m['preparedFrameDigest']==e['preparedFrameDigest']
        assert w['observedAt']==m['observedAt']==e['observedAt']==o['observedAt']
        assert w['intendedTransactionId']==self.mf()['canonicalTransactionId'] and w['intendedTransactionDigest']==self.mf()['canonicalTransactionDigest']
        assert w['expectedLedgerSequence']==self.mf()['expectedLedgerSequence'] and w['expectedPredecessorLedgerHead']==self.mf()['expectedPredecessorLedgerHead']
        assert w['predecessorWitnessHead']==o['witness']['headDigest']==m['expectedWitnessHead'] and w['sequence']==o['witness']['nextSequence']==m['expectedWitnessNextSequence']
        assert m['abandonFramedByteDigest']==H(frame(w)) and w['terminalReasonEvidenceDigest']==m['terminalReasonEvidenceDigest']==DH('LCIM-WITNESS-ABANDON-REASON-EVIDENCE-v1',e)
        assert m['proposalObservationDigest']==DH('LCIM-ABANDON-PROPOSAL-OBSERVATION-v1',o)
        assert wsparse(f['witness-prefix.bin'])==wsparse(self.fs.read(self.jp))[:w['sequence']]
        return m
    def selection(self):
        if self.selected is None:self.selected=self.package()
        self.verify_evidence(self.selected); return self.selected
    def observation(self):
        assert self.anchor_supported
        if not self.fs.has(self.jp):
            assert self.kind=='TRANSACTION_ZERO' and not self.ledger() and not any('/publication-manifest.jcs' in p for p in self.fs.paths())
            o=dict(classification='PRE_JOURNAL',publicationKind=self.kind,operationId=self.op,repositoryId=repo,runId=run,observedAt=stamp(self.clock),controllerHome=HOME,controllerPrivateRoot=ROOT,
                absoluteCanonicalJournalPath=self.jp,intendedJournalId=self.jid,sourceBindings=facts(self.ext),confirmationBindings=dict(controllerProcessIdentity=1,controllerSessionIdentity='session_'+'1'*32,ttyConfirmationOperationId=self.op,intendedOperation=INIT),
                absence=dict(journal='VERIFIED_ABSENT',ledger='VERIFIED_ABSENT',priorUse='VERIFIED_NONE',preparedBundles='VERIFIED_NONE',terminalEvidence='VERIFIED_NONE'),
                observedJournalId=None,verifiedPrefixByteLength=None,verifiedPrefixSha256=None,witnessHead=None,publicationBundleDigest=None,productionCapability=None,ledgerHead=ZERO,ledgerNextSequence=0,nextAction=INIT)
            paths=self.fs.chain(self.jp)
        else:
            o=self.baseobs(); st=o['classification']; term=None
            action={'PRE_PERSISTENCE':BUNDLE,'SEALED_NO_PREPARE':PREP,'PREPARE_ONLY':LEDGER,'LEDGER_WITHOUT_COMMIT':COMMIT,'COMMITTED':None,'ABANDONED':None}[st]
            if o['bundle']['storage']=='VISIBLE_VERIFIED':action=BUNDLE
            elif st=='PRE_PERSISTENCE':assert not o['observedCauseSet']
            elif st in ('SEALED_NO_PREPARE','PREPARE_ONLY') and o['observedCauseSet']:
                f=self.selection(); m=self.verify_evidence(f); key=self.ekey(f); present=self.fs.has(key)
                if present:assert self.files(key,list(f))==f
                term={k:m[k] for k in ('proposalObservationDigest','terminalReasonEvidenceDigest','abandonFramedByteDigest','evidencePackageDigest')}
                durable=key in self.known and self.fs.durable(key,f)
                term.update(storage='DURABLE_VERIFIED' if durable else 'MEMORY_VERIFIED',destination='EXACT_PRESENT' if present else 'VERIFIED_ABSENT'); action=ABANDON if durable else EVID
            o.update(nextAction=action,terminalization=term)
            dest=self.bp if action==BUNDLE else self.ekey(self.selection()) if action in (EVID,ABANDON) else self.lp if action==LEDGER else self.jp
            paths=self.fs.chain(dest)+self.fs.chain(self.jp)
        o.update(observationVersion=2,pathBindings=self.fs.bindings(paths)); return o
    def binding(self,a):
        if a==INIT:return DH('LCIM-WITNESS-INITIALIZATION-ACTION-v1',dict(observation=self.observation(),headerHex=HEADER.hex()))
        if a==BUNDLE:return H(self.bundle()['publication-manifest.jcs'])
        if a==LEDGER:return H(self.bundle()['canonical-transaction.jcs'])
        if a in (EVID,ABANDON):return H(self.selection()['evidence-manifest.jcs' if a==EVID else 'abandon.frame'])
        return H(frame(self.makeframe('PREPARE' if a==PREP else 'COMMIT')))
    def issue(self,a,tty=True,issuer='C30-13'):
        assert tty and issuer=='C30-13' and not self.auth and a in ACTIONS and (self.kind=='TRANSACTION_ZERO' or a!=INIT)
        o=self.observation(); assert o['nextAction']==a
        token=object(); self.auth[token]=(a,self.op,DH('LCIM-BOOTSTRAP-CLASSIFIED-STATE-v1',o),self.binding(a),self.clock+300); return token
    def run(self,token,a,defect=None):
        auth=self.auth.pop(token,None); assert auth and auth[:2]==(a,self.op) and self.clock<auth[4]
        assert auth[2]==DH('LCIM-BOOTSTRAP-CLASSIFIED-STATE-v1',self.observation()) and auth[3]==self.binding(a)
        f=self.fs; f.active=a; f.effects=0; self.seq+=1
        dest=self.jp if a==INIT else self.bp if a==BUNDLE else self.ekey(self.selection()) if a==EVID else self.lp if a==LEDGER else self.jp
        files=self.bundle() if a==BUNDLE else self.selection() if a==EVID else None
        tmp=f.parent(dest)+'/.stage-'+format(self.seq,'032x'); existed=f.has(dest)
        f.allowed=set(f.chain(dest)+f.chain(self.jp)+[tmp])
        if files:f.allowed.update(tmp+'/'+n for n in files); f.allowed.update(dest+'/'+n for n in files)
        newdirs=[]
        def ancestors(p):
            for d in f.chain(f.parent(p))[1:]:
                if not f.has(d):f.create(d,True); newdirs.append(d)
        def chainflush(p):
            dirs=list(reversed(f.chain(f.parent(p))))
            if defect=='reused-ancestors':dirs=[d for d in dirs if d==f.parent(p) or d in newdirs]
            for d in dirs:f.fsdir(d)
        def witness_complete():f.fsfile(self.jp); chainflush(self.jp)
        try:
            if a in (INIT,BUNDLE,EVID):
                if a==BUNDLE:witness_complete()
                if a==EVID:assert self.bp in self.known and f.durable(self.bp,self.bundle())
                if existed:
                    assert a!=INIT
                    for n in files:f.fsfile(dest+'/'+n)
                    f.fsdir(dest); chainflush(dest)
                else:
                    ancestors(dest)
                    if a==INIT:
                        f.create(tmp,False); f.write(tmp,HEADER); f.fsfile(tmp); f.fsdir(f.parent(tmp)); f.rename(tmp,dest); chainflush(dest)
                    else:
                        f.create(tmp,True)
                        for n,b0 in files.items():
                            f.create(tmp+'/'+n,False); f.write(tmp+'/'+n,b0)
                            if defect=='early-directory' and n==list(files)[-3]:
                                for early in list(files)[:-2]:f.fsfile(tmp+'/'+early)
                                f.fsdir(tmp)
                        for n in files:f.fsfile(tmp+'/'+n)
                        if defect!='early-directory':f.fsdir(tmp)
                        f.rename(tmp,dest); chainflush(dest)
                if files:assert f.durable(dest,files), 'durable-publication invariant failed'
                else:assert f.durable(dest), 'durable-header invariant failed'
                if a==BUNDLE:assert f.durable(self.jp)
                self.known.add(dest)
            elif a==LEDGER:
                assert self.bp in self.known and not self.observation()['observedCauseSet']; witness_complete(); ancestors(dest)
                q=self.bundle()['canonical-transaction.jcs']; z=self.ledger()+len(q).to_bytes(4,'big')+q
                if not f.has(dest):f.create(dest,False)
                f.write(dest,z); f.fsfile(dest); chainflush(dest); assert f.durable(dest)
            else:
                assert a in (PREP,COMMIT,ABANDON) and self.bp in self.known
                if a==ABANDON:
                    ef=self.selection(); key=self.ekey(ef); assert key in self.known and f.durable(key,ef); self.verify_evidence(self.files(key,list(ef))); q=ef['abandon.frame']
                else:q=frame(self.makeframe('PREPARE' if a==PREP else 'COMMIT'))
                f.write(dest,f.read(dest)+q); f.fsfile(dest); chainflush(dest); assert f.durable(dest)
        finally:f.active=None
    def step(self,a,**kw):return self.run(self.issue(a),a,**kw)
    def process_exit(self):
        self.mem=None; self.auth={}; self.known=set(); self.selected=None; self.op=None; self.bp=None; self.kind=None
        self.fs.active=None; self.fs.fail=None; self.fs.stop=None
    def recover(self):
        candidates=[]
        for p in self.fs.paths():
            if p.endswith('/publication-manifest.jcs') and '/.stage-' not in p:
                m=json.loads(self.fs.read(p)); candidates.append((m['createdAt'],p,m))
        assert candidates
        _,p,m=max(candidates); self.kind=m['publicationKind']; self.op=m[opkey(self.kind)]; self.bp=p.rsplit('/',1)[0]
        assert m['repositoryId']==repo and m['runId']==run and m['journalId']==self.jid; self.bundle()
    def drift(self):self.ext=external(b"S': new resolved nonsecret configuration"); self.clock+=10; self.selected=None

V7_RESULTS=[]; V7_PINS={}
def case(name,fn):
    fn(); V7_RESULTS.append(name); print('V7_CASE',name,'PASS')
def no(fn):
    try:fn()
    except (AssertionError,KeyError,ValueError,TypeError,FlushFailure):return
    raise AssertionError('negative accepted')
def cold(kind='TRANSACTION_ZERO'):
    m=V7(); m.step(INIT); m.prepare()
    if kind=='SUCCESSOR_ACTIVATION':
        for a in (BUNDLE,PREP,LEDGER,COMMIT):m.step(a)
        m.clock=20; m.ext=external(b'S: successor resolved nonsecret configuration'); m.kind=kind
        m.op='op_'+H(b'V7 successor operation')[:32]; m.bp=m.bpath(); m.mem=None; m.prepare()
    return m

def t1(kind,bound):
    m=cold(kind); expected=un(m.mf()['preparedInputs']['ownerInputs']['configuration']); original=m.bundle()
    prepare_hash=H(frame(m.makeframe('PREPARE')))
    m.step(BUNDLE)
    if bound:m.step(PREP)
    m.process_exit(); assert m.mem is None and not m.auth; m.drift(); m.recover()
    # No permanent prepared-input oracle: only stored manifest is read by recovery.
    assert un(m.mf()['preparedInputs']['ownerInputs']['configuration'])==expected!=m.ext['streams']['configuration']
    no(lambda:m.issue(PREP)); no(lambda:m.issue(ABANDON)); m.step(BUNDLE) # exact-existing completion after exit
    ef=m.selection(); owners=json.loads(ef['owner-inputs.jcs'])
    assert un(owners['prepared']['configuration'])==expected and un(owners['current']['configuration'])==m.ext['streams']['configuration']
    assert json.loads(ef['reason-evidence.jcs'])['observedCauseSet']==['CONFIGURATION_DRIFT']
    no(lambda:m.issue(LEDGER)); no(lambda:m.issue(ABANDON)); m.step(EVID); assert m.fs.durable(m.ekey(ef),ef)
    m.step(ABANDON); assert m.baseobs()['classification']=='ABANDONED'
    key=m.ekey(ef); m.process_exit(); m.fs.power_loss(); m.recover(); m.verify_evidence(m.files(key,list(ef)))
    assert m.bundle()==original
    pin=dict(bundleIdentity=bid(m.mf()),manifestSha256=H(original['publication-manifest.jcs']),candidateSetDigest=m.mf()['candidateSetDigest'],
        transactionDigest=m.mf()['canonicalTransactionDigest'],prepareFramedSha256=prepare_hash,abandonFramedSha256=H(ef['abandon.frame']),
        evidencePackageDigest=json.loads(ef['evidence-manifest.jcs'])['evidencePackageDigest'],evidenceManifestSha256=H(ef['evidence-manifest.jcs']))
    V7_PINS[kind+('-bound' if bound else '-direct')]=pin
    # V6 hash-only publication cannot retrieve a destroyed preimage, even if resealed.
    bad=copy.deepcopy(original); mm=json.loads(bad['publication-manifest.jcs']); del mm['preparedInputs']; mm['schemaVersion']=1
    mm=seal_manifest(mm); bad['publication-manifest.jcs']=J(mm); bad['SEALED']=bid(mm).encode(); no(lambda:verify_bundle(bad))
    print('V7_T1',kind,bound,'lost-S recovered from durable capsule; old hash-only form rejected; evidence then ABANDON')
for kind in ('TRANSACTION_ZERO','SUCCESSOR_ACTIVATION'):
    for bound in (False,True):case('T1 '+kind+' '+str(bound),lambda kind=kind,bound=bound:t1(kind,bound))

def interrupted_ancestor(which,defective=False):
    m=V7() if which=='initialization' else cold(); action=INIT if which=='initialization' else EVID
    if action==EVID:m.step(BUNDLE); m.drift(); m.selection()
    target=m.jp if action==INIT else m.ekey(m.selection())
    # Stop immediately after first mkdir, before ANY parent-directory flush.
    t=m.issue(action); original=m.fs.create
    def cut(p,d):
        original(p,d)
        if d:raise Interrupted()
    m.fs.create=cut
    try:m.run(t,action)
    except Interrupted:pass
    m.fs.create=original; visible=m.fs.paths(); intermediate=next(p for p in reversed(visible) if not p.endswith('/witness.journal') and p!=HOME)
    m.process_exit()
    if action==INIT:m.kind='TRANSACTION_ZERO'; m.op='op_'+H(b'V7 retry initialization')[:32]; m.bp=m.bpath()
    else:m.recover(); m.step(BUNDLE)
    assert m.fs.has(intermediate)
    if defective:
        no(lambda:m.step(action,defect='reused-ancestors')); m.process_exit(); m.fs.power_loss()
        assert not m.fs.has(target); print('V7_T2 defective',which,'lost ancestor link after later power loss'); return
    m.step(action); expected=m.fs.read(target) if action==INIT else m.selection()
    m.process_exit(); m.fs.power_loss()
    if action==INIT:assert m.fs.read(target)==HEADER
    else:assert m.files(target,list(expected))==expected
    print('V7_T2 repaired',which,'reused ancestor survived later power loss')
for which in ('initialization','evidence'):
    for defective in (True,False):case('T2 '+which+' defective='+str(defective),lambda which=which,defective=defective:interrupted_ancestor(which,defective))

def exact_completion(which,defective=False):
    m=cold(); m.step(BUNDLE)
    if which=='evidence':m.drift(); action=EVID; ef=m.selection(); key=m.ekey(ef)
    else:
        m= cold(); action=BUNDLE; ef=m.bundle(); key=m.bp
    # Interrupt after rename, before final-parent/ancestor flush. Files and final directory are visible.
    old=m.fs.rename
    def cut(src,dst):old(src,dst); raise Interrupted()
    m.fs.rename=cut
    try:m.step(action)
    except Interrupted:pass
    m.fs.rename=old; assert m.fs.has(key) and not m.fs.durable(key,ef)
    m.process_exit(); m.recover(); before=len(m.fs.trace)
    if action==EVID:m.step(BUNDLE)
    if defective:
        no(lambda:m.step(action,defect='reused-ancestors'))
        m.process_exit(); m.fs.power_loss(); assert not m.fs.has(key)
        print('V7_T2 defective exact-existing',which,'missing reused ancestor links lost'); return
    m.step(action)
    effects=m.fs.trace[before:]; assert all(k in ('fsync-file','fsync-dir') for _,k,_ in effects)
    assert m.fs.durable(key,ef); m.process_exit(); m.fs.power_loss(); assert m.files(key,list(ef))==ef
    print('V7_T2 exact-existing',which,'all reused links flushed, no mkdir/content/rename')
for which in ('bundle','evidence'):
    for defective in (True,False):case('T2 exact-existing '+which+' defective='+str(defective),lambda which=which,defective=defective:exact_completion(which,defective))

def header_continuation():
    m=V7(); old=m.fs.rename
    def cut(src,dst):old(src,dst); raise Interrupted()
    m.fs.rename=cut
    try:m.step(INIT)
    except Interrupted:pass
    m.fs.rename=old; assert m.fs.read(m.jp)==HEADER and not m.fs.durable(m.jp)
    m.process_exit(); m.kind='TRANSACTION_ZERO'; m.op='op_'+H(b'header continuation')[:32]; m.bp=m.bpath()
    no(lambda:m.issue(INIT)); m.prepare(); m.step(BUNDLE); assert m.fs.durable(m.jp)
    m.process_exit(); m.fs.power_loss(); assert m.fs.read(m.jp)==HEADER
case('T2 header-only completed by BUNDLE, never reinitialize',header_continuation)

def t3(kind):
    m=cold(kind); f=m.bundle(); key=m.bp
    no(lambda:m.step(BUNDLE,defect='early-directory'))
    assert m.fs.has(key) and not m.fs.durable(key,f); no(lambda:m.issue(PREP))
    m.process_exit(); m.fs.power_loss()
    assert m.fs.has(key) and not m.fs.has(key+'/publication-manifest.jcs') and not m.fs.has(key+'/SEALED')
    m=cold(kind); f=m.bundle(); key=m.bp; m.step(BUNDLE); assert m.fs.durable(key,f)
    m.process_exit(); m.fs.power_loss(); assert m.files(key,list(f))==f
    print('V7_T3',kind,'old order lost manifest/SEALED entries; repaired complete directory survived')
for kind in ('TRANSACTION_ZERO','SUCCESSOR_ACTIVATION'):case('T3 '+kind,lambda kind=kind:t3(kind))

def retention_negatives():
    for kind in ('TRANSACTION_ZERO','SUCCESSOR_ACTIVATION'):
        m=cold(kind); good=m.bundle()
        def bad(change):
            f=copy.deepcopy(good); mf=json.loads(f['publication-manifest.jcs']); change(mf); mf=seal_manifest(mf)
            f['publication-manifest.jcs']=J(mf); f['SEALED']=bid(mf).encode(); no(lambda:verify_bundle(f))
        bad(lambda x:x.pop('preparedInputs'))
        bad(lambda x:x['preparedInputs']['ownerInputs'].pop('configuration'))
        bad(lambda x:x['preparedInputs']['ownerInputs'].__setitem__('configuration',octs(b'substituted prepared bytes')))
        bad(lambda x:x['preparedInputs']['preparedBindingSnapshot'].__setitem__('operationId','op_'+'e'*32))
        bad(lambda x:x['preparedInputs'].__setitem__('unknown',1))
        bad(lambda x:x.__setitem__('schemaVersion',3))
        for corruption in ('binding','leaf','cycle','hash','length','null'):
            def change(mf,corruption=corruption):
                side=mf['preparedInputs']['ownerInputs']; ar=json.loads(un(side['sourceCheckpointEvidence']))
                if corruption=='binding':ar['binding']['runId']='run_'+'f'*32
                if corruption=='leaf':ar['inputs']=[i for i in ar['inputs'] if i['key']!='git-tree']
                if corruption=='cycle':ar['inputs'][0]['requires']=[ar['inputs'][0]['key']]
                if corruption=='hash':ar['inputs'][0]['content']['sha256']=ZERO
                if corruption=='length':ar['inputs'][0]['content']['byteLength']=True
                if corruption=='null':side['budgetPredecessorEvidence']=None; return
                side['sourceCheckpointEvidence']=octs(J(ar))
            bad(change)
        def future_prefix(mf):
            side=mf['preparedInputs']['ownerInputs']; ar=json.loads(un(side['budgetPredecessorEvidence']))
            for node in ar['inputs']:
                if node['key']=='witness-prefix':node['content']=octs(m.fs.read(m.jp)+frame(m.makeframe('PREPARE')))
            side['budgetPredecessorEvidence']=octs(J(ar))
        bad(future_prefix) # valid frame bytes, but forbidden future/operation/head proof binding
        # Safe-retention rejection occurs before a bundle can be constructed/published.
        ext=external(); del ext['tree']; no(lambda:build_bundle(kind,m.op,m.jid,ext,m.ledger(),m.fs.read(m.jp),[],m.clock))
    print('V7_NEGATIVE retained input: 28 closed-format/byte/proof/availability rejections')
case('negative prepared/proof content and bindings',retention_negatives)

def authority_negatives():
    count=0
    for action in (INIT,BUNDLE,PREP,EVID,ABANDON):
        for neg in ('missing','expired','reused','wrong-action','wrong-issuer','no-tty','ancestor-identity','destination-identity','anchor'):
            m=V7() if action==INIT else cold()
            if action in (PREP,EVID,ABANDON):m.step(BUNDLE)
            if action in (EVID,ABANDON):m.drift()
            if action==ABANDON:m.step(EVID)
            if neg in ('wrong-issuer','no-tty'):
                no(lambda:m.issue(action,tty=neg!='no-tty',issuer='C30-12' if neg=='wrong-issuer' else 'C30-13')); count+=1; continue
            t=m.issue(action); before=len(m.fs.trace)
            if neg=='missing':t=object()
            if neg=='expired':m.clock+=300
            if neg=='reused':m.run(t,action); before=len(m.fs.trace)
            if neg=='ancestor-identity':
                # Harness-only inode replacement, equal metadata/content; bound inode identity must reject.
                i=m.fs.lookup(HOME); k,dev,ino,uid,mode=m.fs.meta[i]; m.fs.meta[i]=(k,dev,ino+1000,uid,mode)
            if neg=='destination-identity':
                o=m.observation(); p=o['pathBindings'][-1]['path']
                if m.fs.has(p):
                    i=m.fs.lookup(p); k,dev,ino,uid,mode=m.fs.meta[i]; m.fs.meta[i]=(k,dev,ino+2000,uid,mode)
                else:
                    par=m.fs.parent(p)
                    while not m.fs.has(par):p=par; par=m.fs.parent(p)
                    m.fs.serial+=1; i=m.fs.serial; m.fs.ve[m.fs.lookup(par)][p.rsplit('/',1)[1]]=i
                    m.fs.ve[i]={}; m.fs.meta[i]=('DIRECTORY',1,i,1000,'0700')
            if neg=='anchor':m.anchor_supported=False
            no(lambda:m.run(t,PREP if neg=='wrong-action' and action!=PREP else EVID if neg=='wrong-action' else action))
            assert len(m.fs.trace)==before; count+=1
    m=V7(); m.kind='SUCCESSOR_ACTIVATION'; no(lambda:m.issue(INIT)); count+=1
    print('V7_NEGATIVE authority',count,'rejected before effect')
case('negative authority, anchor, destination and ancestor identity',authority_negatives)

def flush_negatives():
    count=0
    for kind in ('TRANSACTION_ZERO','SUCCESSOR_ACTIVATION'):
        for action in (BUNDLE,EVID):
            probe=cold(kind)
            if action==EVID:probe.step(BUNDLE); probe.drift()
            start=len(probe.fs.trace); probe.step(action)
            flushes=[(op,p,i) for i,(a,op,p) in enumerate(probe.fs.trace[start:]) if op in ('fsync-file','fsync-dir')]
            for failure in flushes:
                m=cold(kind)
                if action==EVID:m.step(BUNDLE); m.drift()
                m.fs.fail=failure; no(lambda:m.step(action)); m.fs.fail=None
                assert m.bp not in m.known if action==BUNDLE else m.ekey(m.selection()) not in m.known
                no(lambda:m.issue(PREP if action==BUNDLE else ABANDON)); count+=1
    for fail in ('fsync-file','fsync-dir'):
        m=V7(); m.fs.fail=fail; no(lambda:m.step(INIT)); assert m.jp not in m.known; count+=1
    print('V7_NEGATIVE required file/directory fsync failures',count)
case('negative every bundle/evidence required fsync and initialization fsync',flush_negatives)

def evidence_negatives():
    m=cold(); m.step(BUNDLE); m.drift(); ef=m.selection(); no(lambda:m.issue(ABANDON)); m.step(EVID)
    t=m.issue(ABANDON); key=m.ekey(ef); i=m.fs.lookup(key+'/owner-inputs.jcs'); m.fs.vf[i]=b'substituted'
    before=len(m.fs.trace); no(lambda:m.run(t,ABANDON)); assert len(m.fs.trace)==before
    for n in EN+['evidence-manifest.jcs','SEALED']:
        f=copy.deepcopy(ef); del f[n]; no(lambda:m.verify_evidence(f))
    m=cold(); m.step(BUNDLE); m.step(PREP); m.step(LEDGER); m.drift()
    assert m.observation()['nextAction']==COMMIT; no(lambda:m.issue(ABANDON)); m.step(COMMIT); assert m.baseobs()['classification']=='COMMITTED'
    print('V7_NEGATIVE missing/substituted evidence rejected; matching ledger COMMIT wins despite drift')
case('negative early/missing ABANDON and ledger precedence',evidence_negatives)

def evidence_restart():
    m=cold('SUCCESSOR_ACTIVATION'); m.step(BUNDLE); m.step(PREP); m.drift(); ef=m.selection(); key=m.ekey(ef); m.step(EVID)
    before=(copy.deepcopy(m.fs.ve),dict(m.fs.vf),copy.deepcopy(m.fs.de),dict(m.fs.df))
    m.process_exit(); assert before==(m.fs.ve,m.fs.vf,m.fs.de,m.fs.df) and m.mem is None and not m.auth
    m.recover(); no(lambda:m.issue(ABANDON)); m.step(BUNDLE); no(lambda:m.issue(ABANDON))
    assert m.selection()==ef; start=len(m.fs.trace); m.step(EVID)
    assert all(k in ('fsync-file','fsync-dir') for _,k,_ in m.fs.trace[start:])
    m.step(ABANDON); m.process_exit(); m.fs.power_loss(); m.recover(); m.verify_evidence(m.files(key,list(ef)))
case('process exit preserves visible bytes but loses all durability/authority knowledge',evidence_restart)

def read_only_and_isolated_recovery():
    m=cold(); m.step(BUNDLE); m.step(PREP); m.process_exit(); m.ext=external(b'new CURRENT, never original S'); m.recover(); m.step(BUNDLE)
    before=len(m.fs.trace); m.observation(); m.bundle(); m.snapshot(); m.selection(); assert len(m.fs.trace)==before
    # PREPARED snapshot retrieval has no current-owner access at all.
    m.ext=None; before=len(m.fs.trace); p=m.snapshot(); assert p==m.mf()['preparedInputs']['preparedBindingSnapshot']; assert len(m.fs.trace)==before
    assert 'STREAMS' not in V7.snapshot.__code__.co_names and 'external' not in V7.recover.__code__.co_names
case('read-only classification and prepared retrieval without current environment',read_only_and_isolated_recovery)

print('V7_PINS',J(V7_PINS).decode())
print('V7_RESULTS',len(V7_RESULTS),'passed; T1/T2/T3 defective failures explicitly asserted')
# Literal aggregate pin is filled from the executed active inputs; not historical v1 hashes.
V7_PIN_SHA256 = '62785656de8a5f3baf0d60d43672d1e2bc591ca7e8b305f4ce5b5e5a11f28dd8'
assert H(J(V7_PINS))==V7_PIN_SHA256, ('ACTIVE_PIN_RECOMPUTE',H(J(V7_PINS)))
```

## 13. Historical combined V8 in-memory documentation model

Historical attribution: the runner, fixture and recorded outcomes below remain
unchanged. V8 did not cover fresh complete-terminal completion or post-change
adoption/requalification; independent review returned CHANGES_REQUIRED. Its
terminal assumptions and single-generation coverage are not active V9 proof.
Do not execute the superseded runner/audit as current V9 validation.

Version: `COMBINED_V8_MODEL_1`. This is a finite model of the documented COMMIT
repair and declared PHASE DEPENDENCY GRAPH, not arbitrary prose correctness,
actual external-tool qualification, implementation readiness, real filesystem
security/durability or a runtime implementation. Synthetic owner codecs/JCS
retain §12's limitations. The model pins inode descriptors **and** name links;
file contents and directory entries have separate visible/durable maps.
Process exit does not lose visible bytes; machine loss reloads durable state.
Authority/attempt knowledge never survives exit. Harness faults are labeled,
checked for reachability and caught by exact exception/code, not broad rejection.

The inspected runner executes unchanged V5 calculations/parser regressions as
**historical applicable regressions**, loads only the inspected V7 definitions
before `V7_RESULTS=[]` (not its historical tests/pins), then executes fixture-v8.
It reuses pure bundle/proof/frame helpers and the abstract storage map, not LCIM
modules. V8 overrides COMMIT and models atomic physical ledger visibility before
flush. Other retained persistence procedures are tested independently. In the
model, complete COMMIT durability after restart can be established only through
explicit existing-witness completion with the already ordered V8 ledger
prerequisite, never by reappend or a bundle-derived ledger conclusion. No claim
is made about unsupported historical runtime writer provenance.

Exact current execution command (no output files):

```bash
python3 - <<'PY'
from pathlib import Path
import contextlib, io
s = Path('docs/v2-sprints/00B_MASTER_PLAN_LCIM_3_0_CORE.md').read_text()
def fence(tag): return s.split('```python '+tag+'\n',1)[1].split('\n```',1)[0]
ns = {'SOURCE': s}; out = io.StringIO()
with contextlib.redirect_stdout(out):
    exec(compile(fence('fixture-v5'), '<historical-v5-regressions>', 'exec'), ns)
for line in out.getvalue().splitlines():
    if line.startswith(('PUBLIC_', 'CAUSE_', 'PREPARE_REPEAT', 'CLASSIFIED_SHAPE_', 'NEGATIVE_', 'PARSER_CASES', 'PINNED_')):
        print('HISTORICAL_REGRESSION', line)
exec(compile(fence('fixture-v7').split('V7_RESULTS=[];',1)[0], '<inspected-v7-model-definitions>', 'exec'), ns)
exec(compile(fence('fixture-v8'), '<combined-v8-model-1>', 'exec'), ns)
PY
```

```python fixture-v8
# All storage effects below operate on in-memory maps, never filesystem paths.
from collections import Counter
class V8Denial(Exception): pass
class V8FlushFailure(Exception): pass
class V8ProcessLoss(Exception): pass
COUNTS=Counter(); TARGETS=[]
def require(ok, code):
    if not ok: raise V8Denial(code)
def raises_exact(fn, cls, code):
    try: fn()
    except cls as e:
        assert e.args == (code,), (type(e).__name__, e.args, code)
        return
    raise AssertionError(('expected injected failure not raised', cls.__name__, code))
def sd8(o): return DH('LCIM-BOOTSTRAP-CLASSIFIED-STATE-v1',o)
def prefix8(z):
    result=parse(z)
    require(not result.startswith('B_'),'INTEGRITY_WITNESS')
    at=8
    while at<len(z):
        if len(z)-at<4: break
        n=int.from_bytes(z[at:at+4],'big')
        if len(z)-at<4+n+32: break
        at+=4+n+32
    return z[:at],wsparse(z[:at]),z[at:],result

def bundle8(f):
    m=json.loads(f['publication-manifest.jcs'])
    require(type(m.get('schemaVersion')) is int and m['schemaVersion']==2 and
        'preparedInputs' in m,'RETAINED_CAPSULE_REQUIRED')
    return verify_bundle(f)

# Attempt-local pure verification memo: key contains EVERY supplied raw byte.
# It cannot retrieve missing files, supply an owner input, or assert durability/
# currentness. Clear at model creation and process exit; no cache survives loss.
_verify_bundle_uncached=verify_bundle
_bundle_cache={}
def verify_bundle(files):
    key=tuple(files.items())
    if key not in _bundle_cache: _bundle_cache[key]=_verify_bundle_uncached(files)
    return copy.deepcopy(_bundle_cache[key])

class V8(V7):
    def __init__(self):
        _bundle_cache.clear()
        super().__init__()
        # events/reached/publications are harness counters, not runtime receipts.
        self.events=[]; self.reached=[]; self.hook=None; self.failpoint=None
        self.pins=None; self.publications=0; self.issuer='C30-13'
    def point(self,label):
        self.events.append(label)
        if self.hook: self.hook(label)
    def owner_txs(self):
        try: return txparse(self.ledger())
        except (AssertionError,KeyError,ValueError,TypeError):
            raise V8Denial('INTEGRITY_LEDGER') from None
    def baseobs(self):
        m=self.mf(); wb,ws,suffix,result=prefix8(self.fs.read(self.jp))
        ours=[w for w in ws if w['operationId']==self.op]
        pw=next((w for w in ours if w['frameKind']=='PREPARE'),None)
        terminals=[w for w in ours if w['frameKind'] in ('COMMIT','ABANDON')]
        require(len(terminals)<=1,'MULTIPLE_TERMINALS'); tw=terminals[0] if terminals else None
        txs=self.owner_txs(); present=any(t['operationId']==self.op for t in txs)
        if present:
            require(J(txs[-1])==self.bundle()['canonical-transaction.jcs'],'INTEGRITY_LEDGER')
        else:
            require((txs[-1]['headDigest'] if txs else ZERO)==m['expectedPredecessorLedgerHead'],'INTEGRITY_LEDGER')
        if tw and tw['frameKind']=='COMMIT': require(present,'COMMIT_WITHOUT_LEDGER')
        if tw and tw['frameKind']=='ABANDON': require(not present,'ABANDON_WITH_LEDGER')
        storage='SEALED_VERIFIED' if self.bp in self.known else 'VISIBLE_VERIFIED' if self.fs.has(self.bp) else 'MEMORY_VERIFIED'
        st='COMMITTED' if tw and tw['frameKind']=='COMMIT' else 'ABANDONED' if tw else 'LEDGER_WITHOUT_COMMIT' if present else 'PREPARE_ONLY' if pw else 'SEALED_NO_PREPARE' if self.fs.has(self.bp) else 'PRE_PERSISTENCE'
        if suffix: st='INCOMPLETE_TAIL'
        p,c=self.snapshot(),self.snapshot(True); tx0=json.loads(self.bundle()['canonical-transaction.jcs'])
        def sm(w): return dict(recordId=w['recordId'],frameDigest=w['frameDigest'],headDigest=w['headDigest'],framedByteSha256=H(frame(w)),sequence=w['sequence'],framedByteLength=len(frame(w)))
        return dict(classification=st,publicationKind=self.kind,operationId=self.op,repositoryId=repo,runId=run,observedAt=stamp(self.clock),
            preparedBindingDigest=DH('LCIM-WITNESS-PREPARED-BINDING-v1',p),currentBindingDigest=DH('LCIM-WITNESS-CURRENT-BINDING-v1',c),observedCauseSet=self.causes(p,c,stamp(self.clock)),
            bundle=dict(storage=storage,destination='EXACT_PRESENT' if self.fs.has(self.bp) else 'VERIFIED_ABSENT',candidateSetDigest=m['candidateSetDigest'],publicationBundleDigest=bid(m),
                manifestSha256=H(J(m)),manifestByteLength=len(J(m)),transactionDigest=tx0['transactionDigest'],transactionSha256=H(J(tx0)),transactionByteLength=len(J(tx0)),transactionId=tx0['transactionId'],
                expectedPredecessorLedgerHead=m['expectedPredecessorLedgerHead'],expectedLedgerSequence=m['expectedLedgerSequence'],expectedPredecessorWitnessHead=m['expectedPredecessorWitnessHead'],expiresAt=m['expiresAt']),
            ledger=dict(headDigest=txs[-1]['headDigest'] if txs else ZERO,nextSequence=len(txs),transactionPresent=present),
            witness=dict(journalId=self.jid,verifiedPrefixByteLength=len(wb),verifiedPrefixSha256=H(wb),nextSequence=len(ws),headDigest=ws[-1]['headDigest'] if ws else None,currentGenerationId=ws[-1]['recordId'] if ws else None,
                prepare=sm(pw) if pw else None,terminal=dict(sm(tw),frameKind=tw['frameKind']) if tw else None,incompleteSuffix=dict(stage=result[2:],byteLength=len(suffix),sha256=H(suffix)) if suffix else None),nextAction=None)
    def observation(self):
        if self.fs.has(self.jp) and prefix8(self.fs.read(self.jp))[2]:
            o=self.baseobs(); o.update(nextAction=BUNDLE if o['bundle']['storage']=='VISIBLE_VERIFIED' else TRUNC,terminalization=None,
                observationVersion=2,pathBindings=self.fs.bindings(self.fs.chain(self.bp if o['bundle']['storage']=='VISIBLE_VERIFIED' else self.jp)+self.fs.chain(self.jp)))
        else: o=super().observation()
        if o['nextAction']==COMMIT:
            require(o['classification']=='LEDGER_WITHOUT_COMMIT','CLASSIFICATION')
            require(o['witness']['prepare'] is not None,'PREPARE_REQUIRED')
            physical=self.fs.read(self.lp)
            o.update(observationVersion=3,ledgerCommitPrerequisite=dict(absoluteCanonicalLedgerPath=self.lp,fileByteLength=len(physical),fileSha256=H(physical)),
                pathBindings=self.fs.bindings(self.fs.chain(self.lp)+self.fs.chain(self.jp)))
        return o
    def validate_observation(self,o):
        self.point('validate-observation')
        iscommit=o.get('nextAction')==COMMIT
        require(type(o.get('observationVersion')) is int and o['observationVersion']==(3 if iscommit else 2),'VERSION')
        expected=self.observation()
        require(set(o)==set(expected),'FIELD_CLOSURE')
        if iscommit:
            require(o['classification']=='LEDGER_WITHOUT_COMMIT','CLASSIFICATION')
            p=o.get('ledgerCommitPrerequisite')
            require(type(p) is dict and set(p)=={'absoluteCanonicalLedgerPath','fileByteLength','fileSha256'},'LEDGER_FIELD_CLOSURE')
            require(p['absoluteCanonicalLedgerPath']==self.lp and self.lp.startswith(ROOT+'/') and not self.lp.endswith('canonical-transaction.jcs'),'OWNER_PATH')
            require(type(p['fileByteLength']) is int and 1<=p['fileByteLength']<=9007199254740991,'LEDGER_LENGTH')
            require(type(p['fileSha256']) is str and re.fullmatch('[0-9a-f]{64}',p['fileSha256']) is not None,'LEDGER_SHA')
            paths=o['pathBindings']
            require(type(paths) is list and 1<=len(paths)<=64,'PATH_BOUNDS')
            for b0 in paths:
                require(type(b0) is dict and set(b0)=={'path','kind','deviceId','inodeId','ownerUid','mode'},'PATH_CLOSURE')
                require(b0['kind'] in ('DIRECTORY','FILE'),'NO_ABSENT')
                require(all(type(b0[k]) is int and 0<=b0[k]<=9007199254740991 for k in ('deviceId','inodeId','ownerUid')) and b0['inodeId']>0,'PATH_SCALAR')
            require(paths==expected['pathBindings'],'PATH_UNION')
        else: require('ledgerCommitPrerequisite' not in o,'FIELD_CLOSURE')
        # Preserve observedAt, not a new timestamp under the same authority.
        expected['observedAt']=o['observedAt']
        require(J(o)==J(expected),'DISPLAYED_FACT_DRIFT')
    def binding(self,a):
        if a==TRUNC:
            w=self.observation()['witness']; sf=w['incompleteSuffix']
            return DH('LCIM-WITNESS-TRUNCATION-v1',dict(journalId=self.jid,verifiedPrefixByteLength=w['verifiedPrefixByteLength'],verifiedPrefixSha256=w['verifiedPrefixSha256'],incompleteSuffixByteLength=sf['byteLength'],incompleteSuffixSha256=sf['sha256']))
        return super().binding(a)
    def authority_class(self):
        return 'GENESIS_ACTIVATION_BOOTSTRAP_AUTHORITY' if self.kind=='TRANSACTION_ZERO' else 'SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY'
    def issue(self,a,tty=True,issuer='C30-13',observation=None):
        if a in (LEDGER,ABANDON) and self.fs.has(self.lp):
            require(not any(t['operationId']==self.op for t in self.owner_txs()),'MATCHING_LEDGER_NO_REPUBLISH_OR_ABANDON')
        if a not in (COMMIT,TRUNC): return super().issue(a,tty,issuer)
        require(tty,'NO_TTY'); require(issuer=='C30-13','WRONG_ISSUER'); require(not self.auth,'OUTSTANDING_AUTHORITY')
        o=self.observation() if observation is None else observation
        self.validate_observation(o); require(o['nextAction']==a,'WRONG_ACTION')
        token=object(); self.auth[token]=dict(action=a,operation=self.op,kind=self.kind,ownerclass=self.authority_class(),
            bundle=bid(self.mf()),observation=copy.deepcopy(o),state=sd8(o),bytes=self.binding(a),expiry=self.clock+300)
        return token
    def pin(self,o):
        f=self.fs; self.pins={}
        for b0 in o['pathBindings']:
            p=b0['path']; require(f.has(p),'DISPLAYED_PATH_DRIFT'); i=f.lookup(p)
            self.pins[p]=(i,tuple(b0[k] for k in ('kind','deviceId','inodeId','ownerUid','mode')))
        self.verify_pins()
    def verify_pins(self):
        f=self.fs
        for p,(i,meta) in self.pins.items():
            require(f.has(p) and f.lookup(p)==i and f.meta.get(i)==meta,'DISPLAYED_PATH_DRIFT')
    def flush_pinned(self,p,label,action):
        f=self.fs; i=self.pins[p][0]; self.point('before:'+label); self.verify_pins()
        op='fsync-file' if f.meta[i][0]=='FILE' else 'fsync-dir'
        self.reached.append((op,p)); self.point('reached:'+label)
        if self.failpoint==(op,p): raise V8FlushFailure(label)
        if op=='fsync-file': f.df[i]=f.vf[i]
        else: f.de[i]=dict(f.ve[i])
        f.synced.add(i); f.trace.append((action,op,p))
        self.point('after:'+label); self.verify_pins()
    def recheck(self,a):
        require(self.clock<a['expiry'],'EXPIRED_AUTHORITY')
        self.verify_pins(); self.validate_observation(a['observation'])
        require(a['bytes']==self.binding(a['action']),'WRONG_BYTES')
    def run(self,token,a,defect=None,extra=None):
        if a not in (COMMIT,TRUNC): return super().run(token,a,defect)
        authority=self.auth.pop(token,None)
        if authority is None:
            self.auth.clear(); raise V8Denial('MISSING_OR_REUSED_AUTHORITY')
        self.point('claimed')
        try:
            require(authority['action']==a,'WRONG_ACTION')
            require(authority['ownerclass']==self.authority_class(),'WRONG_CLASS')
            require(authority['operation']==self.op,'WRONG_OPERATION')
            require(authority['kind']==self.kind,'WRONG_KIND')
            require(authority['bundle']==bid(self.mf()),'WRONG_BUNDLE')
            require(authority['state']==sd8(authority['observation']),'WRONG_STATE')
            require(self.clock<authority['expiry'],'EXPIRED_AUTHORITY')
            require(extra is None,'FORBIDDEN_LEDGER_EFFECT')
            self.pin(authority['observation']); self.recheck(authority)
            f=self.fs; before=f.read(self.jp); wi=self.pins[self.jp][0]
            if a==TRUNC:
                wb,ws,suffix,_=prefix8(before); require(bool(suffix),'NO_INCOMPLETE_SUFFIX')
                self.point('before:truncation'); self.recheck(authority)
                f.vf[wi]=wb; f.trace.append((TRUNC,'truncate',self.jp))
            else:
                li=self.pins[self.lp][0]; p=authority['observation']['ledgerCommitPrerequisite']
                physical=f.vf[li]
                require(len(physical)==p['fileByteLength'] and H(physical)==p['fileSha256'],'INTEGRITY_LEDGER')
                txs=self.owner_txs(); require(J(txs[-1])==self.bundle()['canonical-transaction.jcs'],'INTEGRITY_LEDGER')
                # Explicit defective comparator, never the corrected action's default.
                if defect!='witness-only':
                    self.flush_pinned(self.lp,'ledger-file',COMMIT)
                    for d in reversed(f.chain(f.parent(self.lp))): self.flush_pinned(d,'ledger-dir:'+d,COMMIT)
                self.point('before:witness'); self.recheck(authority)
                q=frame(self.makeframe('COMMIT'))
                f.vf[wi]+=q[:2]; f.trace.append((COMMIT,'append',self.jp)); self.point('after:witness-partial')
                self.verify_pins(); require(self.clock<authority['expiry'],'EXPIRED_AUTHORITY')
                f.vf[wi]+=q[2:]; f.trace.append((COMMIT,'append',self.jp)); self.point('after:witness-complete')
            self.flush_pinned(self.jp,'witness-file',a)
            for d in reversed(f.chain(f.parent(self.jp))): self.flush_pinned(d,'witness-dir:'+d,a)
            require(f.durable(self.jp),'WITNESS_NOT_DURABLE')
            self.point('complete'); self.baseobs()
        finally:
            self.auth.clear(); self.pins=None; self.fs.active=None
    def process_exit(self):
        super().process_exit(); self.pins=None; self.hook=None; self.failpoint=None
        _bundle_cache.clear()
    def atomic_visible_ledger(self,window):
        # HARNESS: earlier PUBLISH_LEDGER_TRANSACTION stopped after atomic visibility.
        # Not an effect allowed to APPEND_WITNESS_COMMIT. Successor replaces one
        # physical inode at the bound ledger name; complete old prefix is retained.
        f=self.fs; f.active=LEDGER; tmp=f.parent(self.lp)+'/.candidate-ledger'
        f.allowed=set(f.chain(self.lp)+[tmp])
        for d in f.chain(f.parent(self.lp))[1:]:
            if not f.has(d): f.create(d,True)
        old=self.ledger(); q=self.bundle()['canonical-transaction.jcs']; z=old+len(q).to_bytes(4,'big')+q
        f.create(tmp,False); f.write(tmp,z); par=f.lookup(f.parent(self.lp)); inode=f.lookup(tmp)
        f.ve[par][self.lp.rsplit('/',1)[1]]=inode; del f.ve[par][tmp.rsplit('/',1)[1]]
        f.trace.append((LEDGER,'atomic-visible',self.lp)); self.publications+=1
        # file window: visible before file fsync; link window: file durable but
        # immediate containing directory's new name link is not (reused on successor).
        if window=='unflushed-link': f.fsfile(self.lp)
        for d in reversed(f.chain(f.parent(self.lp))):
            if window=='unflushed-link' and d==f.parent(self.lp): continue
            f.fsdir(d)
        f.active=None; assert f.read(self.lp)==z and not f.durable(self.lp)
        return z

def cold8(kind='TRANSACTION_ZERO'):
    m=V8(); m.step(INIT); m.prepare()
    if kind=='SUCCESSOR_ACTIVATION':
        for a in (BUNDLE,PREP,LEDGER,COMMIT): m.step(a)
        m.clock=20; m.ext=external(b'S: successor resolved nonsecret configuration'); m.kind=kind
        m.op='op_'+H(b'V8 successor operation')[:32]; m.bp=m.bpath(); m.mem=None; m.prepare()
    return m

def ready8(kind,window):
    m=cold8(kind); m.step(BUNDLE); m.step(PREP); z=m.atomic_visible_ledger(window)
    assert m.observation()['nextAction']==COMMIT and m.observation()['observationVersion']==3
    return m,z

def restart8(m):
    visible=(copy.deepcopy(m.fs.ve),dict(m.fs.vf)); m.process_exit()
    assert visible==(m.fs.ve,m.fs.vf) and not m.auth and not m.known and m.pins is None
    m.recover(); start=len(m.fs.trace); m.step(BUNDLE)
    assert not any(p==m.lp or p.startswith(ROOT+'/ledger/') for _,_,p in m.fs.trace[start:])

def matching8(m,z):
    return m.fs.has(m.lp) and m.fs.read(m.lp)==z

def once8(m):
    ws=wsparse(m.fs.read(m.jp)); ours=[w for w in ws if w['operationId']==m.op]
    assert [w['frameKind'] for w in ours]==['PREPARE','COMMIT']
    assert ours[-1]['preparedFrameDigest']==ours[0]['frameDigest']
    assert m.publications==1

KINDS=('TRANSACTION_ZERO','SUCCESSOR_ACTIVATION'); WINDOWS=('unflushed-file','unflushed-link')
for kind in KINDS:
    for window in WINDOWS:
        for defective in (True,False):
            m,z=ready8(kind,window); restart8(m)
            assert not m.fs.durable(m.lp) # bundle completion did not repair ledger
            t=m.issue(COMMIT); start=len(m.fs.trace)
            m.run(t,COMMIT,defect='witness-only' if defective else None); once8(m)
            effects=m.fs.trace[start:]
            assert all(p==m.jp if k=='append' else k in ('fsync-file','fsync-dir') for _,k,p in effects)
            m.process_exit(); m.fs.power_loss(); m.recover()
            if defective:
                assert not matching8(m,z)
                # Losing the whole successor physical file also loses its old
                # prefix: predecessor integrity fails before terminal acceptance.
                expected_failure='INTEGRITY_LEDGER' if kind=='SUCCESSOR_ACTIVATION' and window=='unflushed-file' else 'COMMIT_WITHOUT_LEDGER'
                raises_exact(m.baseobs,V8Denial,expected_failure)
                COUNTS['defective_lost_ledger']+=1
            else:
                assert matching8(m,z); once8(m); assert m.fs.durable(m.lp)
                COUNTS['corrected_preserved_ledger']+=1
            print('V8_SCENARIO',kind,window,'DEFECT_REPRODUCED_LOST_LEDGER' if defective else 'CORRECTED_LEDGER_AND_EXACTLY_ONE_COMMIT')

# Every new required ledger flush fails at its own reached boundary, before append.
for kind in KINDS:
    for window in WINDOWS:
        probe,_=ready8(kind,window)
        required=[('fsync-file',probe.lp,'ledger-file')]+[('fsync-dir',d,'ledger-dir:'+d) for d in reversed(probe.fs.chain(probe.fs.parent(probe.lp)))]
        for op0,path0,label in required:
            m,z=ready8(kind,window); restart8(m); before=m.fs.read(m.jp); m.failpoint=(op0,path0); m.reached=[]
            token=m.issue(COMMIT); event_start=len(m.events)
            raises_exact(lambda:m.run(token,COMMIT),V8FlushFailure,label)
            assert m.reached[-1]==(op0,path0) and m.fs.read(m.jp)==before and not m.auth
            assert 'before:witness' not in m.events[event_start:]
            TARGETS.append([kind,window,'flush-failure',label]); COUNTS['ledger_flush_failures_reached']+=1
            m.failpoint=None; m.step(COMMIT); once8(m)
        labels=[side+':'+label for _,_,label in required for side in ('before','after')]+['before:witness']
        for label in labels:
            m,z=ready8(kind,window); before=m.fs.read(m.jp); token=m.issue(COMMIT); hit=[]
            def stop(point):
                if point==label: hit.append(point); raise V8ProcessLoss(label)
            m.hook=stop
            raises_exact(lambda:m.run(token,COMMIT),V8ProcessLoss,label)
            assert hit==[label] and not m.auth and m.fs.read(m.jp)==before
            restart8(m); raises_exact(lambda:m.run(token,COMMIT),V8Denial,'MISSING_OR_REUSED_AUTHORITY')
            start=len(m.fs.trace); m.step(COMMIT)
            effects=m.fs.trace[start:]; first_append=next(i for i,(_,op0,_) in enumerate(effects) if op0=='append')
            actual=[(op0,p) for a,op0,p in effects[:first_append] if a==COMMIT]
            assert actual==[(a,b) for a,b,_ in required] # repeat every flush before append, no cached knowledge
            m.process_exit(); m.fs.power_loss(); m.recover(); assert matching8(m,z); once8(m)
            TARGETS.append([kind,window,'process-loss',label]); COUNTS['process_boundaries_reached']+=1

# Wrong/missing/reused/expired/class/action/operation/bundle/state/exact-byte authority.
for kind in KINDS:
    for mode,code in [('missing','MISSING_OR_REUSED_AUTHORITY'),('reused','MISSING_OR_REUSED_AUTHORITY'),('expired','EXPIRED_AUTHORITY'),
        ('ownerclass','WRONG_CLASS'),('action','WRONG_ACTION'),('operation','WRONG_OPERATION'),('kind','WRONG_KIND'),('bundle','WRONG_BUNDLE'),('state','WRONG_STATE'),('bytes','WRONG_BYTES')]:
        m,z=ready8(kind,'unflushed-file'); t=m.issue(COMMIT)
        if mode=='missing': t=object()
        elif mode=='reused': m.run(t,COMMIT)
        elif mode=='expired': m.clock+=300
        else: m.auth[t][mode]='wrong'
        before=(dict(m.fs.vf),copy.deepcopy(m.fs.ve),len(m.fs.trace))
        raises_exact(lambda:m.run(t,COMMIT),V8Denial,code)
        assert before==(m.fs.vf,m.fs.ve,len(m.fs.trace)) and not m.auth
        COUNTS['authority_denials']+=1
    for kwargs,code in [({'tty':False},'NO_TTY'),({'issuer':'C30-12'},'WRONG_ISSUER')]:
        m,z=ready8(kind,'unflushed-file'); before=len(m.fs.trace)
        raises_exact(lambda:m.issue(COMMIT,**kwargs),V8Denial,code)
        assert len(m.fs.trace)==before and not m.auth; COUNTS['authority_denials']+=1

# Matching publication is never republished or ABANDONed, even before COMMIT.
for kind in KINDS:
    for window in WINDOWS:
        m,z=ready8(kind,window); m.drift(); before=len(m.fs.trace)
        for action in (LEDGER,ABANDON):
            raises_exact(lambda:m.issue(action),V8Denial,'MATCHING_LEDGER_NO_REPUBLISH_OR_ABANDON')
            assert len(m.fs.trace)==before and not m.auth
            COUNTS['no_duplicate_publication_or_abandon_denials']+=1
        m.step(COMMIT); once8(m)

# Closed variant/type/field/path tests hit the intended validator check.
for kind in KINDS:
    m,z=ready8(kind,'unflushed-file'); good=m.observation(); assert sd8(good)!=sd8(dict(good,observationVersion=2))
    bads=[]
    for ver in (2,True,4): bads.append((dict(good,observationVersion=ver),'VERSION'))
    for k in good:
        q=copy.deepcopy(good); del q[k]
        bads.append((q,'VERSION' if k in ('observationVersion','nextAction') else 'FIELD_CLOSURE'))
    q=copy.deepcopy(good); q['unknown']=1; bads.append((q,'FIELD_CLOSURE'))
    q=copy.deepcopy(good); q['classification']='COMMITTED'; bads.append((q,'CLASSIFICATION'))
    for value in (None,{},dict(good['ledgerCommitPrerequisite'],extra=1)):
        q=copy.deepcopy(good); q['ledgerCommitPrerequisite']=value; bads.append((q,'LEDGER_FIELD_CLOSURE'))
    for k in good['ledgerCommitPrerequisite']:
        q=copy.deepcopy(good); del q['ledgerCommitPrerequisite'][k]; bads.append((q,'LEDGER_FIELD_CLOSURE'))
    for path0 in ('relative','/caller/ledger',m.bp+'/canonical-transaction.jcs',m.lp+'/../ledger'):
        q=copy.deepcopy(good); q['ledgerCommitPrerequisite']['absoluteCanonicalLedgerPath']=path0; bads.append((q,'OWNER_PATH'))
    for length in (0,-1,True,9007199254740992):
        q=copy.deepcopy(good); q['ledgerCommitPrerequisite']['fileByteLength']=length; bads.append((q,'LEDGER_LENGTH'))
    q=copy.deepcopy(good); q['ledgerCommitPrerequisite']['fileSha256']='A'*64; bads.append((q,'LEDGER_SHA'))
    for mode in ('duplicate','omit','reorder','absent','extra','scalar'):
        q=copy.deepcopy(good); paths=q['pathBindings']; code='PATH_UNION'
        if mode=='duplicate': paths.append(copy.deepcopy(paths[-1]))
        if mode=='omit': paths.pop()
        if mode=='reorder': paths.reverse()
        if mode=='absent': paths[0]['kind']='ABSENT'; code='NO_ABSENT'
        if mode=='extra': paths[0]['extra']=1; code='PATH_CLOSURE'
        if mode=='scalar': paths[0]['inodeId']=True; code='PATH_SCALAR'
        bads.append((q,code))
    q=copy.deepcopy(good); q['ledger']['nextSequence']+=1; bads.append((q,'DISPLAYED_FACT_DRIFT'))
    q=copy.deepcopy(good); q['witness']['verifiedPrefixSha256']=ZERO; bads.append((q,'DISPLAYED_FACT_DRIFT'))
    q=copy.deepcopy(good); q['ledgerCommitPrerequisite']['fileSha256']=ZERO; bads.append((q,'DISPLAYED_FACT_DRIFT'))
    for q,code in bads:
        before=len(m.fs.trace); seen=len(m.events)
        raises_exact(lambda q=q:m.validate_observation(q),V8Denial,code)
        assert 'validate-observation' in m.events[seen:] and len(m.fs.trace)==before
        COUNTS['closed_observation_denials']+=1
    n=cold8(kind); n.step(BUNDLE); noncommit=n.observation()
    assert noncommit['observationVersion']==2 and 'ledgerCommitPrerequisite' not in noncommit
    raises_exact(lambda:n.validate_observation(dict(noncommit,observationVersion=3)),V8Denial,'VERSION')
    raises_exact(lambda:n.validate_observation(dict(noncommit,ledgerCommitPrerequisite=good['ledgerCommitPrerequisite'])),V8Denial,'FIELD_CLOSURE')
    COUNTS['closed_observation_denials']+=2

# Equal-byte descriptor and name substitutions: mutate only from the harness.
def substitute(m,path0,mode):
    f=m.fs; i=f.lookup(path0)
    if mode=='descriptor':
        k,dev,ino,uid,perm=f.meta[i]; f.meta[i]=(k,dev,ino+100000,uid,perm)
    else:
        f.serial+=1; j=f.serial; k,dev,ino,uid,perm=f.meta[i]; f.meta[j]=(k,dev,j,uid,perm)
        if k=='FILE': f.vf[j]=f.vf[i]
        else: f.ve[j]=dict(f.ve[i])
        f.ve[f.lookup(f.parent(path0))][path0.rsplit('/',1)[1]]=j
for kind in KINDS:
    probe,_=ready8(kind,'unflushed-file'); paths=[b['path'] for b in probe.observation()['pathBindings']]
    for mode in ('descriptor','name'):
        for path0 in paths:
            if mode=='name' and path0==HOME: continue # anchor has no modeled parent; descriptor case covers it
            m,z=ready8(kind,'unflushed-file'); t=m.issue(COMMIT); wb=m.fs.read(m.jp); hits=[]
            def change(point):
                if point=='after:ledger-file':
                    hits.append(point); substitute(m,path0,mode)
            m.hook=change
            raises_exact(lambda:m.run(t,COMMIT),V8Denial,'DISPLAYED_PATH_DRIFT')
            assert hits==['after:ledger-file'] and m.fs.read(m.jp)==wb and not m.auth
            COUNTS['equal_byte_substitutions_reached']+=1
    for mode,code in [('bytes','INTEGRITY_LEDGER'),('source','DISPLAYED_FACT_DRIFT'),('expiry','EXPIRED_AUTHORITY'),('missing','DISPLAYED_PATH_DRIFT')]:
        m,z=ready8(kind,'unflushed-file'); t=m.issue(COMMIT); wb=m.fs.read(m.jp); hits=[]
        def change(point):
            if point=='before:witness':
                hits.append(point)
                if mode=='bytes': m.fs.vf[m.fs.lookup(m.lp)]=z[:-1]+bytes([z[-1]^1])
                elif mode=='source': m.drift()
                elif mode=='expiry': m.clock+=300
                else: del m.fs.ve[m.fs.lookup(m.fs.parent(m.lp))][m.lp.rsplit('/',1)[1]]
        m.hook=change
        raises_exact(lambda:m.run(t,COMMIT),V8Denial,code)
        assert hits==['before:witness'] and m.fs.read(m.jp)==wb and not m.auth
        COUNTS['late_changed_facts_reached']+=1
    m,z=ready8(kind,'unflushed-link'); m.drift(); o=m.observation()
    assert o['observedCauseSet']==['CONFIGURATION_DRIFT'] and o['nextAction']==COMMIT
    m.step(COMMIT); once8(m); assert m.baseobs()['observedCauseSet'] # still denies stale capability
    COUNTS['stale_before_confirmation_completed']+=1
    for effect in ('create','write','append','truncate','rename','overwrite','republish','cleanup'):
        m,z=ready8(kind,'unflushed-file'); t=m.issue(COMMIT); before=len(m.fs.trace)
        raises_exact(lambda:m.run(t,COMMIT,extra=(effect,m.lp)),V8Denial,'FORBIDDEN_LEDGER_EFFECT')
        assert len(m.fs.trace)==before and not m.auth; COUNTS['forbidden_ledger_effect_denials']+=1

# Incomplete/full-but-unflushed witness recovery, separate process vs machine loss.
for kind in KINDS:
    for window in WINDOWS:
        for cut in ('after:witness-partial','after:witness-complete'):
            for power_first in (False,True):
                m,z=ready8(kind,window); t=m.issue(COMMIT); hits=[]
                def stop(point):
                    if point==cut: hits.append(point); raise V8ProcessLoss(cut)
                m.hook=stop; raises_exact(lambda:m.run(t,COMMIT),V8ProcessLoss,cut)
                assert hits==[cut] and m.fs.durable(m.lp) and not m.auth
                if power_first:
                    m.process_exit(); m.fs.power_loss(); m.recover(); m.step(BUNDLE)
                else: restart8(m)
                o=m.observation()
                if o['classification']=='INCOMPLETE_TAIL':
                    before=m.fs.read(m.lp); t=m.issue(TRUNC); start=len(m.fs.trace); m.run(t,TRUNC)
                    assert m.fs.read(m.lp)==before and not any(k=='append' for _,k,_ in m.fs.trace[start:])
                    assert m.observation()['nextAction']==COMMIT
                    COUNTS['separate_truncations']+=1
                if m.observation()['nextAction']==COMMIT: m.step(COMMIT)
                else:
                    assert m.baseobs()['classification']=='COMMITTED'
                    raises_exact(lambda:m.issue(COMMIT),V8Denial,'WRONG_ACTION')
                    COUNTS['existing_full_commit_no_reappend']+=1
                once8(m); m.process_exit(); m.fs.power_loss(); m.recover(); assert matching8(m,z); once8(m)
                COUNTS['witness_recovery_boundaries_reached']+=1

# Applicable T1: retained S, separate current S', both kinds/direct and PREPARE-bound.
for kind in KINDS:
    for bound in (False,True):
        m=cold8(kind); original=m.bundle(); expected=un(m.mf()['preparedInputs']['ownerInputs']['configuration'])
        m.step(BUNDLE)
        if bound: m.step(PREP)
        m.process_exit(); m.drift(); m.recover(); m.step(BUNDLE)
        ef=m.selection(); owners=json.loads(ef['owner-inputs.jcs'])
        assert un(owners['prepared']['configuration'])==expected!=un(owners['current']['configuration'])
        assert m.observation()['nextAction']==EVID
        m.step(EVID); key=m.ekey(ef); assert m.fs.durable(key,ef); m.step(ABANDON)
        m.process_exit(); m.fs.power_loss(); m.recover(); m.verify_evidence(m.files(key,list(ef)))
        assert m.bundle()==original
        bad=copy.deepcopy(original); mf=json.loads(bad['publication-manifest.jcs']); del mf['preparedInputs']; mf['schemaVersion']=1; mf=seal_manifest(mf)
        bad['publication-manifest.jcs']=J(mf); bad['SEALED']=bid(mf).encode()
        raises_exact(lambda:bundle8(bad),V8Denial,'RETAINED_CAPSULE_REQUIRED')
        COUNTS['T1_retention_paths']+=1

# Applicable T2: reached interruption, wrong chain actually loses object at power loss.
for which in ('initialization','evidence'):
    for defective in (True,False):
        m=V8() if which=='initialization' else cold8(); a=INIT if which=='initialization' else EVID
        if a==EVID: m.step(BUNDLE); m.drift(); m.selection()
        target=m.jp if a==INIT else m.ekey(m.selection()); original_create=m.fs.create; hit=[]
        def cut_create(p,d):
            original_create(p,d)
            if d: hit.append(p); raise V8ProcessLoss('after:mkdir')
        m.fs.create=cut_create
        raises_exact(lambda:m.step(a),V8ProcessLoss,'after:mkdir'); assert len(hit)==1
        m.fs.create=original_create; m.process_exit()
        if a==INIT:
            m.kind='TRANSACTION_ZERO'; m.op='op_'+H(b'V8 init retry')[:32]; m.bp=m.bpath()
        else: m.recover(); m.step(BUNDLE)
        assert m.fs.has(hit[0]); start=len(m.fs.trace)
        if defective:
            raises_exact(lambda:m.step(a,defect='reused-ancestors'),AssertionError,'durable-header invariant failed' if a==INIT else 'durable-publication invariant failed')
            assert any(op0=='rename' for _,op0,_ in m.fs.trace[start:])
            m.process_exit(); m.fs.power_loss(); assert not m.fs.has(target)
        else:
            m.step(a); m.process_exit(); m.fs.power_loss(); assert m.fs.has(target)
        COUNTS['T2_interrupted_ancestor_paths']+=1
for which in ('bundle','evidence'):
    for defective in (True,False):
        m=cold8(); a=BUNDLE if which=='bundle' else EVID
        if a==EVID: m.step(BUNDLE); m.drift(); files=m.selection(); key=m.ekey(files)
        else: files=m.bundle(); key=m.bp
        original_rename=m.fs.rename; hit=[]
        def cut_rename(src,dst):
            original_rename(src,dst); hit.append(dst); raise V8ProcessLoss('after:rename')
        m.fs.rename=cut_rename
        raises_exact(lambda:m.step(a),V8ProcessLoss,'after:rename'); assert hit==[key]
        m.fs.rename=original_rename; m.process_exit(); m.recover()
        if a==EVID: m.step(BUNDLE)
        start=len(m.fs.trace)
        if defective: raises_exact(lambda:m.step(a,defect='reused-ancestors'),AssertionError,'durable-publication invariant failed')
        else: m.step(a)
        assert all(op0 in ('fsync-file','fsync-dir') for _,op0,_ in m.fs.trace[start:])
        m.process_exit(); m.fs.power_loss()
        if defective: assert not m.fs.has(key)
        else: assert m.files(key,list(files))==files
        COUNTS['T2_exact_existing_paths']+=1
for kind in KINDS:
    m=cold8(kind); f=m.bundle(); key=m.bp; start=len(m.fs.trace)
    raises_exact(lambda:m.step(BUNDLE,defect='early-directory'),AssertionError,'durable-publication invariant failed')
    assert any(op0=='rename' for _,op0,_ in m.fs.trace[start:]) and m.fs.has(key)
    m.process_exit(); m.fs.power_loss()
    assert m.fs.has(key) and not m.fs.has(key+'/publication-manifest.jcs') and not m.fs.has(key+'/SEALED')
    m=cold8(kind); f=m.bundle(); key=m.bp; m.step(BUNDLE); m.process_exit(); m.fs.power_loss()
    assert m.files(key,list(f))==f; COUNTS['T3_sealing_paths']+=1

# T2 header-only continuation and T1 recovery without access to current inputs.
m=V8(); rename0=m.fs.rename; reached_header=[]
def stop_header(src,dst):
    rename0(src,dst); reached_header.append(dst); raise V8ProcessLoss('header-visible')
m.fs.rename=stop_header
raises_exact(lambda:m.step(INIT),V8ProcessLoss,'header-visible')
assert reached_header==[m.jp] and m.fs.read(m.jp)==HEADER and not m.fs.durable(m.jp)
m.fs.rename=rename0; m.process_exit(); m.kind='TRANSACTION_ZERO'
m.op='op_'+H(b'V8 header continuation')[:32]; m.bp=m.bpath(); m.prepare(); m.step(BUNDLE)
assert m.fs.durable(m.jp); m.process_exit(); m.fs.power_loss(); m.recover()
assert m.fs.read(m.jp)==HEADER; COUNTS['T2_header_continuation']+=1
m=cold8(); m.step(BUNDLE); m.step(PREP); m.process_exit(); m.ext=external(b'only CURRENT remains'); m.recover(); m.step(BUNDLE)
start=len(m.fs.trace); m.observation(); m.snapshot(); m.selection(); assert len(m.fs.trace)==start
m.ext=None; _bundle_cache.clear(); assert m.snapshot()==m.mf()['preparedInputs']['preparedBindingSnapshot']
assert len(m.fs.trace)==start; COUNTS['T1_read_only_isolated_prepared_retrieval']+=1

# Strengthen retained bundle/evidence fsync faults: prove actual target was reached.
for kind in KINDS:
    for a in (BUNDLE,EVID):
        probe=cold8(kind)
        if a==EVID: probe.step(BUNDLE); probe.drift()
        start=len(probe.fs.trace); probe.step(a)
        flushes=[(op0,p,i) for i,(_,op0,p) in enumerate(probe.fs.trace[start:]) if op0 in ('fsync-file','fsync-dir')]
        for failure in flushes:
            m=cold8(kind)
            if a==EVID: m.step(BUNDLE); m.drift()
            original_effect=m.fs.effect; hit=[]
            def monitor(op0,p,fn):
                if (op0,p,m.fs.effects)==failure: hit.append(failure)
                return original_effect(op0,p,fn)
            m.fs.effect=monitor; m.fs.fail=failure
            raises_exact(lambda:m.step(a),FlushFailure,failure[0])
            assert hit==[failure] and not m.auth
            assert m.bp not in m.known if a==BUNDLE else m.ekey(m.selection()) not in m.known
            COUNTS['retained_flush_failures_reached']+=1

# Every initialization file/directory flush is also reached and fails closed.
probe=V8(); probe.step(INIT)
init_flushes=[(op0,p,i) for i,(_,op0,p) in enumerate(probe.fs.trace) if op0 in ('fsync-file','fsync-dir')]
for failure in init_flushes:
    m=V8(); original_effect=m.fs.effect; hit=[]
    def monitor_init(op0,p,fn):
        if (op0,p,m.fs.effects)==failure: hit.append(failure)
        return original_effect(op0,p,fn)
    m.fs.effect=monitor_init; m.fs.fail=failure
    raises_exact(lambda:m.step(INIT),FlushFailure,failure[0])
    assert hit==[failure] and not m.auth and m.jp not in m.known
    COUNTS['initialization_flush_failures_reached']+=1

# Declared phase graph: abstract current predicates are synthetic, never approvals.
graph=json.loads(SOURCE.split('```phase-graph-v8\n',1)[1].split('\n```',1)[0])
def ancestors8(n,stack=()):
    assert n not in stack
    return set(graph[n]['after']).union(*(ancestors8(p,stack+(n,)) for p in graph[n]['after']))
def advance8(n,done,facts):
    require(ancestors8(n)<=done,'MISSING_PHASE_DEPENDENCY')
    require(all(facts.get(p) is True for p in graph[n]['requires']),'MISSING_PHASE_PREREQUISITE')
    return done|{n}
order=list(graph); done=set()
for node in order:
    g=graph[node]; assert set(g)=={'after','requires'} and len(g['after'])==len(set(g['after']))
    facts0={p:True for p in g['requires']}
    for p in g['requires']:
        bad=dict(facts0); del bad[p]
        raises_exact(lambda:advance8(node,done,bad),V8Denial,'MISSING_PHASE_PREREQUISITE'); COUNTS['phase_missing_predicate_denials']+=1
    for dep in ancestors8(node):
        raises_exact(lambda:advance8(node,done-{dep},facts0),V8Denial,'MISSING_PHASE_DEPENDENCY'); COUNTS['phase_missing_dependency_denials']+=1
    done=advance8(node,done,facts0); COUNTS['phase_advancements_modeled']+=1
assert 'G1' not in ancestors8('B') and 'B' in ancestors8('G1') and 'G1' in ancestors8('BOOTSTRAP_ADOPTED')
for i in range(1,15):
    n='C30-'+format(i,'02d'); expected='BOOTSTRAP_ADOPTED' if i==1 else 'C30-'+format(i-1,'02d')
    assert expected in graph[n]['after'] and 'G2' not in ancestors8(n)
assert {'C30-07','C30-13','C30-14'}<=ancestors8('G2') and {'G1','G2'}<=ancestors8('ACTIVATION')
raises_exact(lambda:advance8('G2',{'C30-07'},{p:True for p in graph['G2']['requires']}),V8Denial,'MISSING_PHASE_DEPENDENCY')
raises_exact(lambda:advance8('B',{'A'},{}),V8Denial,'MISSING_PHASE_PREREQUISITE')
COUNTS['phase_explicit_nonreadiness_denials']+=2
print('V8_TARGETED_FAILURE_EVIDENCE',J(TARGETS).decode())
print('V8_RESULTS',J(dict(COUNTS)).decode())
print('V8_MODEL_LIMITS in-memory synthetic codecs/ASCII JCS/storage assumptions; no LCIM/filesystem/security/tool qualification; graph model only')
```

## 14. Historical combined V8 execution record

The following is the preserved V8 execution record, not V9 readiness or an
independent approval. The two blocking V8 findings and V9 results are §§9/15–16.

The exact §13 command was inspected and executed. Final expanded
COMBINED_V8_MODEL_1 run completed with all assertions satisfied:

| Executed V8 check | Actual result |
|---|---|
| initial/successor × visible-unflushed-file/file-flushed-unflushed-link | 4 defective witness-only COMMIT histories actually lost matching ledger after process exit/recovery/later power loss; 4 corrected histories retained exact ledger and exactly one matching COMMIT |
| every ledger-under-COMMIT required flush | 28 injected failures reached: 2 kinds × 2 windows × (1 pinned file + 6 containing directories through U); zero first COMMIT bytes after failure |
| process loss before/after each new flush and before append | 60 reached boundaries; authority/knowledge discarded, recovery repeated every prerequisite; later power loss retained corrected matching state |
| authority guards | 24 exact denials for missing/reused/expired/wrong class/action/operation/kind/bundle/state/bytes/issuer/TTY |
| closed private observation | 96 version/field/path/type/byte/head denials, including old v2 COMMIT, v3 non-COMMIT, forbidden/absent/duplicate/missing/reordered path entries |
| pinned descriptor/name substitution | 46 reached equal-byte substitutions across ledger/witness files and complete chains; no COMMIT append |
| drift/storage/expiry at final recheck | 8 reached failures; 2 already-stale-before-confirmation completions preserved drift and denied stale eligibility |
| forbidden ledger content effects | 16 exact denials covering create/write/append/truncate/rename/overwrite/republish/cleanup |
| matching ledger republish/ABANDON attempts | 8 exact denials; no duplicate publication or terminal ABANDON |
| incomplete/full-but-unflushed witness recovery | 16 reached loss cases; 4 separately authorized truncations and 4 existing-full-COMMIT returns without reappend |
| applicable T1 retention | 4 initial/successor × direct/PREPARE-bound paths; old capsule-less form denied; 1 additional read-only recovery without current-input access |
| applicable T2 ancestor/completion | 4 interrupted-ancestor and 4 exact-existing paths (defective loss/corrected survival), plus 1 header-only completion; no content write during exact-existing package completion |
| applicable T3 sealing | both kinds: defective early directory flush lost manifest/SEALED; corrected final-populated flush retained complete packages |
| retained persistence failure reachability | 83 bundle/evidence and 8 initialization file/directory flush targets reached and denied success |
| declared phase graph | 21 synthetic advancements; 124 missing-predicate, 210 missing-transitive-dependency and 2 explicit nonreadiness denials; construction precedes G1, G1 precedes adoption, accepted predecessors precede C30, full dependencies precede G2, current qualifications precede activation |

Counts are named checks, not a claimed additive test total. TARGETS prints all
88 ledger-flush/process-loss labels with kind/window; exact exceptions plus
reachability and no-first-byte assertions prove the intended faults were reached.
No unrelated assertion can satisfy those new negative tests. File fsync persists
only content; directory fsync only its own entries. Process exit and machine
loss are separate; descriptors/name links are pinned and rechecked. An
attempt-local pure-verification memo requires every exact input byte and is
cleared on process exit; it cannot retrieve missing prepared inputs or establish
durability/currentness.

Historical applicable V5 regressions were separately labeled and rerun: 6 public
canonical syntax examples (illustrative IDs), 256 cause combinations, 195 old
state-shape negatives, 61 binding negatives, 30 parser cases and unchanged
1742-byte PREPARE SHA e2d913f82b0d46b2588a2a811a48d48234a9ab8e3abd390cf9b66439f3dfe591.
These are not relabeled V8 private pins. V5/V6/V7 fixture fences and prior
validators remain byte-identical; V6/V7 historical suites/audits were not run
unchanged. The inspected V7 definitions only supply the retained abstract helpers.

Execution history: the first V8 run failed because the defective successor
whole-file-loss case reached predecessor integrity denial before the test's
expected COMMIT-without-ledger denial. The expected precedence was corrected,
not bypassed; lost matching ledger is still asserted. The next run timed out
at 180 seconds and is **not** counted as passing. Exact-byte attempt-local memoization
was added, then a full run passed; after strengthening explicit no-republish/
ABANDON, header continuation, isolated retrieval and initialization-flush tests,
the full expanded run passed. The first current audit passed structural checks
but found one extra blank EOF line here; it was removed before rerun. No failed
or timed-out run is presented as a successful completed test.

Limitations/unexecuted: real filesystem durability, actual directory locks/TTYs,
credential isolation/security, generic Unicode/ECMAScript-number JCS, full real
Bootstrap/Git/proof codecs, live provider/process/FD tests, arbitrary crash
schedules, actual external tools/spend controls, LCIM implementation/integration,
G1/G2/G3 independent review and policy/operator adoption. No production module,
provider, credential, external service, runtime journal, evidence package or
source registry was used or created. The phase graph is only a model of the
documented graph, not qualification or implementation readiness.

Current documentation audit: see FOURTH_SOL_FINDING_MATRIX.md, audit-v8; final
before/after hashes and full 32-path scope are printed by that read-only command.
The current documentation audit completed cleanly: all 32 amendment-only paths,
zero staged changes, seven tracked and 25 untracked documentation paths; tracked,
staged and all untracked whitespace checks clean. Seven unrelated structural
blocks, six public examples and five historical fixture/audit fences remain
byte-identical; all fourteen Start blocks deliberately change and retain exact
predecessor mappings; C30-01 rule 3 changes while rules 1/2/4/5 remain intact.

**READINESS: READY_FOR_COMBINED_V8_DOCUMENTATION_REVIEW.** Documentation amendment
and declared model/audit checks are complete. This means documentation-review
readiness only: G1 INDEPENDENT_REVIEW_PENDING; G2 INDEPENDENT_SECURITY_REVIEW_PENDING;
G3 CHANGES_REQUIRED_PENDING_FRESH_REREVIEW. Policy/procedure adoption is NOT_GRANTED,
external-tool qualification NOT_ESTABLISHED, candidate construction authorization
NOT_GRANTED, runtime activation/use BLOCKED. Stop at documentation review; no
source implementation, reviewer invocation, packet, staging, commit, push or
activation is authorized.

## 15. Active targeted V9 in-memory documentation model

Version: `TARGETED_V9_MODEL_1`. This is a finite executable model of the two
amended contracts, not an LCIM module or production schema implementation.
The synthetic owner codec is deliberately small/ASCII-only; V5's unchanged
public calculations/parser examples run separately as historical regressions.
V7/V8 fixtures/pins and old audit fences remain unchanged and attributed;
their terminal assumptions are not current V9 tests. Initial phase-graph-v8 is
preserved; lifecycle-v9 models recurring generations, not a false DAG cycle.

Storage below separates visible/durable file bytes and each directory's own
entries. Only the harness sets crash windows or reads durable maps to check
outcomes. The recovering owner sees ordinary readable bytes, pinned identities
and successful flush returns, never a durability oracle. Initial terminal bytes
are constructed by the harness, **not** by a successful V8 writer. Completion
knowledge and authorities begin empty. Bundle bytes may already be durable,
but their session verification is absent; no ledger/witness relation is assumed.
The three windows deliberately remove ledger content durability, a ledger name
link, or ledger content plus witness reachability. Exact-existing completion
must actually fix these states through the documented priority sequence.

Exact inspected runner (no output files; execute only after inspecting both
selected fixture bodies):

```bash
python3 - <<'PY'
from pathlib import Path
import contextlib, io
s=Path('docs/v2-sprints/00B_MASTER_PLAN_LCIM_3_0_CORE.md').read_text()
def fence(t): return s.split('```python '+t+'\n',1)[1].split('\n```',1)[0]
ns={'SOURCE':s}; historical=io.StringIO()
with contextlib.redirect_stdout(historical):
    exec(compile(fence('fixture-v5'),'<historical-v5-regressions>','exec'),ns)
for line in historical.getvalue().splitlines():
    if line.startswith(('PUBLIC_','CAUSE_','PREPARE_REPEAT','CLASSIFIED_SHAPE_','NEGATIVE_','PARSER_CASES','PINNED_')): print('HISTORICAL_REGRESSION',line)
exec(compile(fence('fixture-v9'),'<targeted-v9-model-1>','exec'),{'SOURCE':s})
PY
```

```python fixture-v9
# Pure in-memory documentation model; no filesystem mutation or LCIM imports.
import copy, hashlib, json, re
from collections import Counter
J=lambda x:json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=True).encode()
H=lambda b:hashlib.sha256(b).hexdigest()
C='APPEND_WITNESS_COMMIT'; B='PERSIST_PREPARED_BUNDLE'; T='TRUNCATE_INCOMPLETE_FINAL_FRAME'
A='APPEND_ABSENT'; E='COMPLETE_EXACT_EXISTING'; U='/model-home'; R=U+'/.lcim-private'
RESULT=Counter(); TARGETS=[]
class Denial9(Exception): pass
class Flush9(Exception): pass
class Exit9(Exception): pass
def need(p,c):
    if not p: raise Denial9(c)
def exact_failure(fn,cls,code):
    try: fn()
    except cls as e:
        assert e.args==(code,), (e.args,code)
        return
    raise AssertionError(('target not rejected',code))
def parent(p): return p.rsplit('/',1)[0]
def chain(p):
    out=[p]
    while out[-1]!=U: out.append(parent(out[-1]))
    return list(reversed(out))

class Store9:
    def __init__(self):
        self.names={U:1}; self.meta={1:('DIRECTORY',1,1,1000,'0700')}
        self.vf={}; self.ve={1:{}}; self.df={}; self.de={1:{}}; self.serial=1; self.trace=[]
    def lookup(self,p):
        i=1
        for part in p[len(U):].strip('/').split('/'):
            if not part: continue
            need(i in self.ve and part in self.ve[i],'MISSING_PATH')
            i=self.ve[i][part]
        return i
    def has(self,p):
        try: self.lookup(p); return True
        except Denial9 as e:
            assert e.args==('MISSING_PATH',); return False
    def add(self,p,data=None): # HARNESS setup only, never called by recovery
        if self.has(p): return
        self.add(parent(p)); self.serial+=1; i=self.serial
        self.ve[self.lookup(parent(p))][p.rsplit('/',1)[1]]=i
        self.meta[i]=('DIRECTORY' if data is None else 'FILE',1,i,1000,'0700' if data is None else '0600')
        if data is None: self.ve[i]={}
        else: self.vf[i]=data
    def read(self,p): return self.vf[self.lookup(p)]
    def bindings(self,paths):
        return [dict(zip(('path','kind','deviceId','inodeId','ownerUid','mode'),(p,*self.meta[self.lookup(p)]))) for p in sorted(set(paths))]
    def flush(self,p,descriptor=None): # successful syscall writes durable state, never queries it
        i=self.lookup(p) if descriptor is None else descriptor; k=self.meta[i][0]
        if k=='FILE': self.df[i]=self.vf[i]
        else: self.de[i]=dict(self.ve[i])
        self.trace.append(('fsync-file' if k=='FILE' else 'fsync-dir',p))
    def power_loss(self): # HARNESS machine loss, not owner recovery
        self.vf=dict(self.df); self.ve=copy.deepcopy(self.de)
    def substitute(self,p,mode): # HARNESS equal-byte descriptor/name substitution
        i=self.lookup(p); k,d,ino,uid,perm=self.meta[i]
        if mode=='descriptor': self.meta[i]=(k,d,ino+10000,uid,perm); return
        self.serial+=1; n=self.serial; self.meta[n]=(k,d,n,uid,perm)
        if k=='FILE': self.vf[n]=self.vf[i]
        else: self.ve[n]=dict(self.ve[i])
        self.ve[self.lookup(parent(p))][p.rsplit('/',1)[1]]=n

def envelope(x):
    b=J(x); return len(b).to_bytes(4,'big')+b+hashlib.sha256(b).digest()
def decode(z,header=b''):
    need(z.startswith(header),'BAD_HEADER'); at=len(header); frames=[]
    while at<len(z):
        start=at
        if len(z)-at<4: return frames,z[start:]
        n=int.from_bytes(z[at:at+4],'big'); need(0<n<=1048576,'BAD_LENGTH')
        if len(z)-at<4+n+32: return frames,z[start:]
        b=z[at+4:at+4+n]; raw=z[at:at+4+n+32]
        need(raw[-32:]==hashlib.sha256(b).digest(),'BAD_DIGEST')
        try: x=json.loads(b)
        except (ValueError,UnicodeError): raise Denial9('BAD_JSON') from None
        need(J(x)==b,'BAD_JCS'); frames.append((x,raw)); at+=len(raw)
    return frames,b''

class Owner9:
    # Receives visible storage only. No method reads df/de, power_loss or a durable predicate.
    def __init__(self,store,kind,op,bundle_files,txs,prepare,commit):
        self.fs=store; self.kind=kind; self.op=op; self.expected_files=bundle_files
        self.expected_txs=txs; self.prepare_bytes=prepare; self.append_bytes=commit
        self.lp=R+'/ledger/v1/repo/run/ledger'; self.wp=R+'/witness/v1/repo/run/witness'
        self.bp=R+'/bundle/v1/repo/'+op
        self.auth={}; self.known_bundle=None; self.relation=None; self.clock=1; self.facts='CURRENT'
        self.pins=None; self.hook=None; self.fail=None; self.reached=[]; self.events=[]
        self.checks=dict(sourceAccepted=True,qualifications=True,currentFacts=True,freshTTY=True,operatorAuthorization=True)
    def point(self,p):
        self.events.append(p)
        if self.hook: self.hook(p)
    def verify(self):
        for name,b in self.expected_files.items():
            need(self.fs.has(self.bp+'/'+name),'MISSING_BUNDLE')
            need(self.fs.read(self.bp+'/'+name)==b,'CORRUPT_BUNDLE')
        need(self.fs.has(self.lp),'MISSING_LEDGER')
        need(self.fs.lookup(self.lp) in self.fs.vf,'MISSING_LEDGER')
        txs,tail=decode(self.fs.read(self.lp)); need(not tail,'INVALID_OWNER_ENCODING')
        for i,(tx,_) in enumerate(txs):
            need(set(tx)=={'schemaVersion','operationId','sequence','predecessor','payload'},'OWNER_SCHEMA')
            need(type(tx['schemaVersion']) is int and tx['schemaVersion']==1,'OWNER_SCHEMA')
            need(type(tx['sequence']) is int and tx['sequence']==i,'OWNER_SEQUENCE')
            need(tx['predecessor']==(H(txs[i-1][1]) if i else '0'*64),'LEDGER_HEAD_CONFLICT')
        need([x for x,_ in txs]==self.expected_txs,'WRONG_TRANSACTION_TIP')
        need(self.fs.has(self.wp),'MISSING_WITNESS')
        frames,suffix=decode(self.fs.read(self.wp),b'LCIMWJ01')
        for i,(w,raw) in enumerate(frames):
            need(set(w)=={'schemaVersion','operationId','kind','sequence','predecessor','prepareSha','transactionSha','at'},'WITNESS_SCHEMA')
            need(type(w['schemaVersion']) is int and w['schemaVersion']==1,'WITNESS_SCHEMA')
            need(type(w['sequence']) is int and w['sequence']==i,'WITNESS_SEQUENCE')
            need(w['predecessor']==(H(frames[i-1][1]) if i else None),'WITNESS_HEAD_CONFLICT')
        ours=[(w,raw) for w,raw in frames if w['operationId']==self.op]
        need(ours and ours[0][1]==self.prepare_bytes,'PREPARE_RELATION')
        need(frames[-1][0]['operationId']==self.op,'CONFLICTING_HEADS')
        need(len(ours)<=2,'MULTIPLE_TERMINALS')
        terminal=ours[-1] if len(ours)==2 else None
        if terminal:
            w,raw=terminal; need(w['kind']=='COMMIT','NO_ABANDON_MATCHING_LEDGER')
            need(w['prepareSha']==H(self.prepare_bytes) and w['transactionSha']==H(txs[-1][1]),'COMMIT_RELATION')
        return frames,suffix,terminal
    def key(self):
        frames,suffix,terminal=self.verify()
        paths=self.fs.bindings(chain(self.lp)+chain(self.wp))
        return H(J([self.kind,self.op,self.facts,H(J({k:H(v) for k,v in self.expected_files.items()})),
            H(self.fs.read(self.lp)),H(self.fs.read(self.wp)),paths])) if terminal else None
    def known(self):
        if self.relation is not None and self.relation!=self.key(): self.relation=None
        return self.relation is not None
    def bundle_known(self):
        return self.known_bundle==self.fs.bindings(chain(self.bp)+[self.bp+'/'+n for n in self.expected_files])
    def observation(self):
        frames,suffix,terminal=self.verify(); has=terminal is not None
        classified='INCOMPLETE_TAIL' if suffix else 'COMMITTED' if has else 'LEDGER_WITHOUT_COMMIT'
        storage='SEALED_VERIFIED' if self.bundle_known() else 'VISIBLE_VERIFIED'
        if has and not self.known(): action=C; branch=E
        elif storage=='VISIBLE_VERIFIED': action=B; branch=None
        elif suffix: action=T; branch=None
        elif not has: action=C; branch=A
        else: action=None; branch=None
        def sm(pair):
            w,b=pair; d=H(b)
            return dict(recordId='rec_'+d,frameDigest=d,headDigest=d,framedByteSha256=d,sequence=w['sequence'],framedByteLength=len(b))
        prefix=self.fs.read(self.wp)[:len(self.fs.read(self.wp))-len(suffix)]
        tx=self.expected_txs[-1]; mf=self.expected_files['publication-manifest.jcs']; bid=H(mf)
        paths=chain(self.lp)+chain(self.wp) if action==C else chain(self.wp)+(chain(self.bp) if action==B else [])
        o=dict(classification=classified,publicationKind=self.kind,operationId=self.op,repositoryId='repo',runId='run',observedAt=self.clock,
            preparedBindingDigest=H(b'PREPARED'),currentBindingDigest=H(self.facts.encode()),observedCauseSet=[] if self.facts=='CURRENT' else ['CONFIGURATION_DRIFT'],
            bundle=dict(storage=storage,destination='EXACT_PRESENT',candidateSetDigest=H(b'candidates'),publicationBundleDigest=bid,manifestSha256=bid,
                transactionDigest=H(J(tx)),transactionSha256=H(J(tx)),transactionId='tx_'+H(J(tx)),manifestByteLength=len(mf),transactionByteLength=len(J(tx)),
                expectedPredecessorLedgerHead=tx['predecessor'],expectedLedgerSequence=tx['sequence'],expectedPredecessorWitnessHead=frames[-2 if has else -1][0]['predecessor'],expiresAt=300),
            ledger=dict(headDigest=H(envelope(tx)),nextSequence=len(self.expected_txs),transactionPresent=True),
            witness=dict(journalId='journal',verifiedPrefixByteLength=len(prefix),verifiedPrefixSha256=H(prefix),nextSequence=len(frames),headDigest=H(frames[-1][1]),
                currentGenerationId='rec_'+H(frames[-1][1]),prepare=sm(next(p for p in frames if p[1]==self.prepare_bytes)),terminal=dict(sm(terminal),frameKind='COMMIT') if has else None,
                incompleteSuffix=dict(stage='LENGTH',byteLength=len(suffix),sha256=H(suffix)) if suffix else None),
            nextAction=action,terminalization=None,observationVersion=3 if action==C else 2,pathBindings=self.fs.bindings(paths))
        if action==C: o.update(commitBranch=branch,ledgerCommitPrerequisite=dict(absoluteCanonicalLedgerPath=self.lp,fileByteLength=len(self.fs.read(self.lp)),fileSha256=H(self.fs.read(self.lp))))
        return o
    def validate(self,o):
        self.point('validate'); expected=self.observation(); iscommit=o.get('nextAction')==C
        need(type(o.get('observationVersion')) is int and o['observationVersion']==(3 if iscommit else 2),'VERSION')
        need(set(o)==set(expected),'FIELD_CLOSURE')
        if iscommit:
            need(o['commitBranch'] in (A,E) and o['commitBranch']==expected['commitBranch'],'BRANCH')
            need(o['classification']==expected['classification'],'CLASSIFICATION')
            p=o['ledgerCommitPrerequisite']
            need(type(p) is dict and set(p)=={'absoluteCanonicalLedgerPath','fileByteLength','fileSha256'},'LEDGER_FIELDS')
            need(p['absoluteCanonicalLedgerPath']==self.lp,'LEDGER_PATH')
            need(type(p['fileByteLength']) is int and 0<p['fileByteLength']<=9007199254740991,'LEDGER_LENGTH')
            need(type(p['fileSha256']) is str and re.fullmatch('[0-9a-f]{64}',p['fileSha256']) is not None,'LEDGER_SHA')
        paths=o['pathBindings']; need(type(paths) is list and 1<=len(paths)<=64,'PATH_BOUNDS')
        for b in paths:
            need(type(b) is dict and set(b)=={'path','kind','deviceId','inodeId','ownerUid','mode'},'PATH_FIELDS')
            need(b['kind'] in ('FILE','DIRECTORY'),'NO_ABSENT')
            need(all(type(b[k]) is int and b[k]>=0 for k in ('deviceId','inodeId','ownerUid')) and b['inodeId']>0,'PATH_SCALAR')
        need(paths==expected['pathBindings'],'PATH_BINDING')
        expected['observedAt']=o['observedAt']; need(J(o)==J(expected),'DISPLAYED_DRIFT')
    def byte_binding(self,action):
        if action==C:
            _,_,terminal=self.verify()
            return H(terminal[1] if terminal else self.append_bytes)
        if action==B: return H(self.expected_files['publication-manifest.jcs'])
        w=self.observation()['witness']; sf=w['incompleteSuffix']
        return H(b'LCIM-WITNESS-TRUNCATION-v1\0'+J(dict(journalId=w['journalId'],verifiedPrefixByteLength=w['verifiedPrefixByteLength'],
            verifiedPrefixSha256=w['verifiedPrefixSha256'],incompleteSuffixByteLength=sf['byteLength'],incompleteSuffixSha256=sf['sha256'])))
    def issue(self,action,tty=True,issuer='C30-13',observation=None):
        need(tty,'NO_TTY'); need(issuer=='C30-13','ISSUER'); need(not self.auth,'OUTSTANDING')
        o=self.observation() if observation is None else observation; self.validate(o)
        need(action==o['nextAction'] and action in (C,B,T),'WRONG_ACTION')
        token=object(); self.auth[token]=dict(action=action,branch=o.get('commitBranch'),kind=self.kind,operation=self.op,
            owner='genesis' if self.kind=='TRANSACTION_ZERO' else 'successor',observation=copy.deepcopy(o),
            digest=H(b'LCIM-BOOTSTRAP-CLASSIFIED-STATE-v1\0'+J(o)),bytes=self.byte_binding(action),expiry=self.clock+300)
        return token
    def pin(self,o):
        self.pins={b['path']:(self.fs.lookup(b['path']),tuple(b[k] for k in ('kind','deviceId','inodeId','ownerUid','mode'))) for b in o['pathBindings']}
        self.check_pins()
    def check_pins(self):
        for p,(i,meta) in self.pins.items():
            need(self.fs.has(p) and self.fs.lookup(p)==i and self.fs.meta[i]==meta,'IDENTITY_DRIFT')
    def recheck(self,a):
        need(self.clock<a['expiry'],'EXPIRED'); self.check_pins(); self.validate(a['observation'])
        need(a['bytes']==self.byte_binding(a['action']),'ACTION_BYTES')
    def flush(self,p,label):
        self.point('before:'+label); self.check_pins(); self.reached.append(label); self.point('reached:'+label)
        if self.fail==label: raise Flush9(label)
        # COMMIT always flushes the pinned descriptor, not a replacement pathname.
        self.fs.flush(p,self.pins[p][0] if p in self.pins else self.fs.lookup(p))
        self.point('after:'+label); self.check_pins()
    def relation_flushes(self):
        return [(self.lp,'ledger-file')]+[(p,'ledger-dir:'+p) for p in reversed(chain(parent(self.lp)))]+[(self.wp,'witness-file')]+[(p,'witness-dir:'+p) for p in reversed(chain(parent(self.wp)))]
    def run(self,token,action,extra=None):
        a=self.auth.pop(token,None)
        if a is None: self.auth.clear(); raise Denial9('MISSING_OR_REUSED')
        try:
            self.point('claimed'); need(a['action']==action,'ACTION'); need(a['branch']==a['observation'].get('commitBranch'),'AUTH_BRANCH')
            need(a['kind']==self.kind,'KIND'); need(a['operation']==self.op,'OPERATION')
            need(a['owner']==('genesis' if self.kind=='TRANSACTION_ZERO' else 'successor'),'CLASS')
            need(a['digest']==H(b'LCIM-BOOTSTRAP-CLASSIFIED-STATE-v1\0'+J(a['observation'])),'STATE_DIGEST')
            need(extra is None,'FORBIDDEN_EFFECT'); self.pin(a['observation']); self.recheck(a)
            if action==C:
                required=self.relation_flushes(); split=next(i for i,(p,_) in enumerate(required) if p==self.wp)
                for p,label in required[:split]: self.flush(p,label)
                self.point('recheck-before-witness'); self.recheck(a)
                if a['branch']==A:
                    self.fs.vf[self.fs.lookup(self.wp)]+=self.append_bytes; self.fs.trace.append(('append',self.wp))
                    self.point('after-append')
                for p,label in required[split:]: self.flush(p,label)
                self.point('final-recheck'); need(self.clock<a['expiry'],'EXPIRED'); self.check_pins(); self.verify()
                if a['branch']==E: self.recheck(a)
                self.relation=self.key()
            elif action==B:
                # Priority checked by observation before ANY bundle/shared-ancestor/witness flush.
                for name in self.expected_files: self.flush(self.bp+'/'+name,'bundle-file:'+name)
                for p in reversed(chain(self.bp)): self.flush(p,'bundle-dir:'+p)
                for p in reversed(chain(self.wp)): self.flush(p,'bundle-witness:'+p)
                self.recheck(a)
                self.known_bundle=self.fs.bindings(chain(self.bp)+[self.bp+'/'+n for n in self.expected_files])
            else:
                frames,suffix,_=self.verify(); need(bool(suffix),'NO_SUFFIX')
                self.fs.vf[self.fs.lookup(self.wp)]=self.fs.read(self.wp)[:-len(suffix)]; self.fs.trace.append(('truncate',self.wp)); self.relation=None
                for p in reversed(chain(self.wp)): self.flush(p,'truncate-witness:'+p)
                self.verify()
            self.point('completed')
        except (Denial9,Flush9,Exit9):
            self.relation=None; raise
        finally: self.auth.clear(); self.pins=None
    def step(self,a): self.run(self.issue(a),a)
    def recover_all(self):
        for _ in range(6):
            a=self.observation()['nextAction']
            if a is None: return
            self.step(a)
        raise AssertionError('nonterminating recovery')
    def process_exit(self):
        self.auth.clear(); self.relation=None; self.known_bundle=None; self.pins=None; self.hook=None; self.fail=None
    def eligible(self,consumer):
        self.verify(); need(self.known(),'RELATION_NOT_COMPLETED'); need(self.bundle_known(),'BUNDLE_NOT_COMPLETED')
        need(not self.verify()[1],'INCOMPLETE_SUFFIX')
        if consumer=='capability': need(self.facts=='CURRENT','STALE_ACTIVATION_FACTS')
        for k,v in self.checks.items(): need(v is True,'CONSUMER:'+consumer+':'+k)
        return True

# Harness builds complete readable logical state WITHOUT running Owner9's writer.
def terminal9(kind='TRANSACTION_ZERO',window='ledger-content',suffix=False,absent=False,generation='fixture-generation'):
    store=Store9(); count=1 if kind=='TRANSACTION_ZERO' else 2; txs=[]; frames=[]
    for i in range(count):
        op='initial' if i==0 else 'successor'
        tx=dict(schemaVersion=1,operationId=op,sequence=i,predecessor=H(envelope(txs[-1])) if txs else '0'*64,payload='candidate-'+op+'-'+generation)
        txs.append(tx)
        p=dict(schemaVersion=1,operationId=op,kind='PREPARE',sequence=len(frames),predecessor=H(frames[-1]) if frames else None,prepareSha=None,transactionSha=H(envelope(tx)),at='original-prepare')
        prep=envelope(p); frames.append(prep)
        com=envelope(dict(p,kind='COMMIT',sequence=len(frames),predecessor=H(prep),prepareSha=H(prep),at='original-existing-commit'))
        frames.append(com)
    names=['candidate-set-core.jcs']+(['01-budget.jcs','02-session.jcs','03-plan.jcs','04-genesis.jcs','05-activation.jcs'] if count==1 else ['01-budget.jcs','02-session.jcs','03-plan.jcs','04-activation.jcs'])+['canonical-transaction.jcs','publication-manifest.jcs','SEALED']
    files={n:('immutable-'+n).encode() for n in names}; files['canonical-transaction.jcs']=J(txs[-1])
    files['publication-manifest.jcs']=J(dict(schemaVersion=2,sourceGeneration=generation,preparedInputs=dict(configuration='PREPARED'),entries={n:H(b) for n,b in files.items() if n not in ('publication-manifest.jcs','SEALED')}))
    files['SEALED']=H(files['publication-manifest.jcs']).encode()
    m=Owner9(store,kind,op,files,txs,prep,com)
    store.add(m.lp,b''.join(envelope(t) for t in txs))
    store.add(m.wp,b'LCIMWJ01'+b''.join(frames[:-1] if absent else frames)+(b'\x00\x00' if suffix else b''))
    for n,b in files.items(): store.add(m.bp+'/'+n,b)
    # HARNESS only: explicit durability windows; not knowledge exposed to owner.
    store.df=dict(store.vf); store.de=copy.deepcopy(store.ve)
    if window in ('ledger-content','witness-link'): store.df.pop(store.lookup(m.lp))
    if window=='ledger-link': store.de[store.lookup(parent(m.lp))].pop(m.lp.rsplit('/',1)[1])
    if window=='witness-link': store.de[store.lookup(parent(m.wp))].pop(m.wp.rsplit('/',1)[1])
    assert not m.auth and m.relation is None and m.known_bundle is None
    return m

KINDS=('TRANSACTION_ZERO','SUCCESSOR_ACTIVATION'); WINDOWS=('ledger-content','ledger-link','witness-link')
def content(m): return dict(m.fs.vf),copy.deepcopy(m.fs.ve)
def once(m):
    frames,suffix,terminal=m.verify(); ours=[w['kind'] for w,b in frames if w['operationId']==m.op]
    assert ours==['PREPARE','COMMIT'] and terminal and not suffix

def old_terminal_bypass(m):
    # Explicit V8 comparator: bundle action flushes existing witness, class 13 then
    # offers nextAction=null with no action capable of flushing the ledger.
    for n in m.expected_files: m.fs.flush(m.bp+'/'+n)
    for p in reversed(chain(m.bp)): m.fs.flush(p)
    for p in reversed(chain(m.wp)): m.fs.flush(p)
    return dict(classification='COMMITTED',nextAction=None,capability=False)

for kind in KINDS:
    for window in WINDOWS:
        m=terminal9(kind,window); visible=content(m); old=old_terminal_bypass(m)
        assert old==dict(classification='COMMITTED',nextAction=None,capability=False) and visible==content(m)
        assert not any(p==m.lp or p.startswith(R+'/ledger/') for _,p in m.fs.trace)
        m.process_exit(); m.fs.power_loss()
        exact_failure(m.verify,Denial9,'MISSING_LEDGER'); RESULT['old_terminal_deadend_and_bypass']+=1
        m=terminal9(kind,window); before=content(m); assert m.observation()['nextAction']==C and m.observation()['commitBranch']==E
        for consumer in ('capability','successor'):
            exact_failure(lambda:m.eligible(consumer),Denial9,'RELATION_NOT_COMPLETED')
        for premature in (B,T): exact_failure(lambda:m.issue(premature),Denial9,'WRONG_ACTION')
        assert not m.fs.trace
        t=m.issue(C); o=copy.deepcopy(m.auth[t]['observation']); existing=m.verify()[2][1]; m.run(t,C)
        assert content(m)==before and all(op.startswith('fsync-') for op,p in m.fs.trace)
        assert m.verify()[2][1]==existing and o['witness']['terminal']['framedByteSha256']==H(existing)
        assert m.observation()['nextAction']==B and m.known()
        exact_failure(lambda:m.eligible('capability'),Denial9,'BUNDLE_NOT_COMPLETED')
        m.step(B); once(m); assert m.observation()['nextAction'] is None
        for consumer in ('capability','successor'):
            assert m.eligible(consumer)
            for k in m.checks:
                m.checks[k]=False; exact_failure(lambda:m.eligible(consumer),Denial9,'CONSUMER:'+consumer+':'+k); m.checks[k]=True
                RESULT['separate_consumer_checks']+=1
        m.process_exit(); assert m.relation is None and not m.auth
        exact_failure(lambda:m.eligible('successor'),Denial9,'RELATION_NOT_COMPLETED')
        m.fs.power_loss(); once(m); assert content(m)==before
        assert m.observation()['commitBranch']==E; m.recover_all(); assert m.eligible('capability')
        RESULT['corrected_exact_existing_survives']+=1
        print('V9_TERMINAL',kind,window,'OLD_DEADEND_AND_LOST_LEDGER; CORRECTED_ZERO_APPEND_AND_SURVIVAL')

for kind in KINDS:
    for window in WINDOWS:
        probe=terminal9(kind,window); required=probe.relation_flushes()
        for path,label in required:
            m=terminal9(kind,window); before=content(m); m.fail=label; t=m.issue(C)
            exact_failure(lambda:m.run(t,C),Flush9,label)
            assert m.reached[-1]==label and content(m)==before and not m.auth and m.relation is None
            for consumer in ('capability','successor'): exact_failure(lambda:m.eligible(consumer),Denial9,'RELATION_NOT_COMPLETED')
            m.fail=None; m.recover_all(); once(m); m.process_exit(); m.fs.power_loss(); once(m)
            TARGETS.append([kind,window,'flush',label]); RESULT['terminal_flush_targets_reached']+=1
        for side in ('before','after'):
            for path,label in required:
                m=terminal9(kind,window); before=content(m); point=side+':'+label; hit=[]; t=m.issue(C)
                def cut(p):
                    if p==point: hit.append(p); raise Exit9(point)
                m.hook=cut; exact_failure(lambda:m.run(t,C),Exit9,point)
                assert hit==[point] and before==content(m) and not m.auth and m.relation is None
                m.process_exit(); exact_failure(lambda:m.run(t,C),Denial9,'MISSING_OR_REUSED')
                m.reached=[]; m.recover_all(); assert m.reached[:len(required)]==[x for _,x in required]
                assert all(x.startswith('bundle-') for x in m.reached[len(required):])
                m.process_exit(); m.fs.power_loss(); once(m)
                TARGETS.append([kind,window,'exit',point]); RESULT['terminal_process_targets_reached']+=1

# Private schema/branch/digest closure: exact validator stage is asserted.
for kind in KINDS:
    m=terminal9(kind); good=m.observation(); bads=[]
    for ver in (2,True,4): bads.append((dict(good,observationVersion=ver),'VERSION'))
    for k in ('commitBranch','ledgerCommitPrerequisite','witness','pathBindings'):
        o=copy.deepcopy(good); del o[k]; bads.append((o,'FIELD_CLOSURE'))
    bads += [(dict(good,commitBranch=A),'BRANCH'),(dict(good,commitBranch='other'),'BRANCH'),(dict(good,unknown=1),'FIELD_CLOSURE'),(dict(good,classification='LEDGER_WITHOUT_COMMIT'),'CLASSIFICATION')]
    for val in (None,{},dict(good['ledgerCommitPrerequisite'],extra=1)):
        o=copy.deepcopy(good); o['ledgerCommitPrerequisite']=val; bads.append((o,'LEDGER_FIELDS'))
    for k,v,c in [('absoluteCanonicalLedgerPath',m.bp+'/canonical-transaction.jcs','LEDGER_PATH'),('fileByteLength',True,'LEDGER_LENGTH'),('fileByteLength',0,'LEDGER_LENGTH'),('fileSha256','A'*64,'LEDGER_SHA')]:
        o=copy.deepcopy(good); o['ledgerCommitPrerequisite'][k]=v; bads.append((o,c))
    for mode,c in [('omit','PATH_BINDING'),('duplicate','PATH_BINDING'),('reverse','PATH_BINDING'),('absent','NO_ABSENT'),('extra','PATH_FIELDS'),('scalar','PATH_SCALAR')]:
        o=copy.deepcopy(good); paths=o['pathBindings']
        if mode=='omit': paths.pop()
        if mode=='duplicate': paths.append(copy.deepcopy(paths[-1]))
        if mode=='reverse': paths.reverse()
        if mode=='absent': paths[0]['kind']='ABSENT'
        if mode=='extra': paths[0]['extra']=1
        if mode=='scalar': paths[0]['inodeId']=True
        bads.append((o,c))
    for key in ('prepare','terminal'):
        o=copy.deepcopy(good); o['witness'][key]=None; bads.append((o,'DISPLAYED_DRIFT'))
    o=copy.deepcopy(good); o['witness']['verifiedPrefixSha256']='0'*64; bads.append((o,'DISPLAYED_DRIFT'))
    for o,c in bads:
        before=content(m); start=len(m.events); exact_failure(lambda:m.validate(o),Denial9,c)
        assert m.events[start]=='validate' and before==content(m) and not m.fs.trace; RESULT['closed_variant_denials']+=1
    m.step(C); o=m.observation(); assert o['observationVersion']==2
    for q,c in [(dict(o,observationVersion=3),'VERSION'),(dict(o,commitBranch=E),'FIELD_CLOSURE'),(dict(o,ledgerCommitPrerequisite=good['ledgerCommitPrerequisite']),'FIELD_CLOSURE')]:
        exact_failure(lambda:m.validate(q),Denial9,c); RESULT['closed_variant_denials']+=1
    for field,code in [('missing','MISSING_OR_REUSED'),('reused','MISSING_OR_REUSED'),('expiry','EXPIRED'),('branch','AUTH_BRANCH'),('owner','CLASS'),('operation','OPERATION'),('kind','KIND'),('action','ACTION'),('digest','STATE_DIGEST'),('bytes','ACTION_BYTES')]:
        m=terminal9(kind); t=m.issue(C)
        if field=='missing': t=object()
        elif field=='reused': m.run(t,C)
        elif field=='expiry': m.clock+=300
        else: m.auth[t][field]='wrong'
        before=content(m); start=len(m.fs.trace); exact_failure(lambda:m.run(t,C),Denial9,code)
        assert content(m)==before and len(m.fs.trace)==start and not m.auth; RESULT['authority_denials']+=1
    for kwargs,code in [({'tty':False},'NO_TTY'),({'issuer':'C30-12'},'ISSUER')]:
        m=terminal9(kind); exact_failure(lambda:m.issue(C,**kwargs),Denial9,code); assert not m.fs.trace; RESULT['authority_denials']+=1

# Equal-byte substitutions hit after a real ledger flush, before witness flush.
for kind in KINDS:
    probe=terminal9(kind)
    for mode in ('descriptor','name'):
        for p in [b['path'] for b in probe.observation()['pathBindings']]:
            if mode=='name' and p==U: continue
            m=terminal9(kind); before=(m.fs.read(m.lp),m.fs.read(m.wp)); hit=[]; t=m.issue(C)
            def inject(point):
                if point=='after:ledger-file': hit.append(point); m.fs.substitute(p,mode)
            m.hook=inject; exact_failure(lambda:m.run(t,C),Denial9,'IDENTITY_DRIFT')
            assert hit==['after:ledger-file'] and before==(m.fs.read(m.lp),m.fs.read(m.wp)) and m.relation is None and not m.auth
            assert 'witness-file' not in m.reached; RESULT['identity_substitutions_reached']+=1
    for mode,code in [('ledger-bytes','BAD_DIGEST'),('witness-bytes','BAD_DIGEST'),('heads','WITNESS_HEAD_CONFLICT'),('facts','DISPLAYED_DRIFT'),('expiry','EXPIRED')]:
        m=terminal9(kind); t=m.issue(C); hit=[]
        def inject(point):
            if point=='recheck-before-witness':
                hit.append(point)
                if mode in ('ledger-bytes','witness-bytes'):
                    p=m.lp if mode=='ledger-bytes' else m.wp; i=m.fs.lookup(p); m.fs.vf[i]=m.fs.vf[i][:-1]+bytes([m.fs.vf[i][-1]^1])
                elif mode=='heads':
                    frames,suffix,_=m.verify(); w=copy.deepcopy(frames[-1][0]); w['predecessor']='0'*64
                    m.fs.vf[m.fs.lookup(m.wp)]=b'LCIMWJ01'+b''.join(b for _,b in frames[:-1])+envelope(w)
                elif mode=='facts': m.facts='NEW'
                else: m.clock+=300
        m.hook=inject; exact_failure(lambda:m.run(t,C),Denial9,code)
        assert hit==['recheck-before-witness'] and 'witness-file' not in m.reached and m.relation is None and not m.auth; RESULT['changed_binding_targets_reached']+=1
    for mode,code in [('missing','MISSING_LEDGER'),('corrupt','BAD_DIGEST'),('owner','OWNER_SCHEMA'),('transaction','WRONG_TRANSACTION_TIP'),('commit','COMMIT_RELATION'),('schema','WITNESS_SCHEMA')]:
        m=terminal9(kind)
        if mode=='missing': del m.fs.ve[m.fs.lookup(parent(m.lp))][m.lp.rsplit('/',1)[1]]
        elif mode=='corrupt': m.fs.vf[m.fs.lookup(m.lp)]=m.fs.read(m.lp)[:-1]+b'!'
        elif mode in ('owner','transaction'):
            txs=copy.deepcopy(m.expected_txs); txs[-1]['schemaVersion' if mode=='owner' else 'payload']=99 if mode=='owner' else 'other'
            m.fs.vf[m.fs.lookup(m.lp)]=b''.join(envelope(t) for t in txs)
        else:
            frames,_,_=m.verify(); w=copy.deepcopy(frames[-1][0]); w['prepareSha' if mode=='commit' else 'schemaVersion']='0'*64 if mode=='commit' else 99
            m.fs.vf[m.fs.lookup(m.wp)]=b'LCIMWJ01'+b''.join(b for _,b in frames[:-1])+envelope(w)
        before=content(m); exact_failure(lambda:m.issue(C),Denial9,code)
        assert before==content(m) and not m.fs.trace and not m.auth; RESULT['integrity_without_reconstruction']+=1
    for effect in ('append-ledger','append-witness','rewrite','truncate','replace','create','republish','ABANDON'):
        m=terminal9(kind); before=content(m); t=m.issue(C)
        exact_failure(lambda:m.run(t,C,extra=effect),Denial9,'FORBIDDEN_EFFECT'); assert before==content(m) and not m.fs.trace
        RESULT['forbidden_content_effects']+=1
    # Completed cache cannot survive relevant changes, even equal bytes at new identity.
    for mode in ('identity','head','facts'):
        m=terminal9(kind); m.recover_all(); assert m.eligible('capability')
        if mode=='identity': m.fs.substitute(m.lp,'name')
        elif mode=='facts': m.facts='CHANGED'
        else: m.fs.vf[m.fs.lookup(m.wp)]+=b'\x00\x00'
        assert not m.known(); exact_failure(lambda:m.eligible('capability'),Denial9,'RELATION_NOT_COMPLETED'); RESULT['completed_key_invalidation']+=1

# A name race after the pre-flush check must still flush the old pinned descriptor,
# never the newly substituted inode; post-check denies success. Durable maps here
# are inspected only by the HARNESS, not by Owner9 or recovery.
for kind in KINDS:
    for which in ('ledger','witness'):
        m=terminal9(kind); p=m.lp if which=='ledger' else m.wp; old_inode=m.fs.lookup(p); token=m.issue(C); hit=[]
        label='reached:'+which+'-file'
        def race(point):
            if point==label: hit.append(point); m.fs.substitute(p,'name')
        m.hook=race; exact_failure(lambda:m.run(token,C),Denial9,'IDENTITY_DRIFT')
        assert hit==[label] and old_inode in m.fs.df and m.fs.lookup(p) not in m.fs.df
        assert m.relation is None and not m.auth; RESULT['pinned_descriptor_flush_targets']+=1
        TARGETS.append([kind,'descriptor-flush-race',label])
    for mode,code in [('identity','IDENTITY_DRIFT'),('facts','DISPLAYED_DRIFT'),('expiry','EXPIRED')]:
        m=terminal9(kind); token=m.issue(C); hit=[]
        def late(point):
            if point=='final-recheck':
                hit.append(point)
                if mode=='identity': m.fs.substitute(m.lp,'name')
                elif mode=='facts': m.facts='LATE'
                else: m.clock+=300
        m.hook=late; exact_failure(lambda:m.run(token,C),Denial9,code)
        assert hit==['final-recheck'] and 'witness-dir:'+U in m.reached and not m.auth and m.relation is None
        RESULT['final_recheck_targets_reached']+=1; TARGETS.append([kind,'final-recheck',mode])

# Actual prescribed surrounding sequence, including the earlier-flush hazards.
for kind in KINDS:
    m=terminal9(kind,'witness-link',suffix=True); before=m.fs.read(m.wp); steps=[]
    while m.observation()['nextAction'] is not None:
        a=m.observation()['nextAction']; steps.append((a,m.observation().get('commitBranch'))); start=len(m.fs.trace); m.step(a)
        if a==C: assert all(k.startswith('fsync-') for k,p in m.fs.trace[start:])
        if a==T: assert m.relation is None and m.observation()['commitBranch']==E
    assert steps==[(C,E),(B,None),(T,None),(C,E)] and m.fs.read(m.wp)==before[:-2]
    assert sum(k=='truncate' for k,p in m.fs.trace)==1 and not any(k=='append' for k,p in m.fs.trace)
    once(m); assert m.eligible('capability'); m.process_exit(); m.fs.power_loss(); once(m); RESULT['complete_suffix_prescribed_sequence']+=1
    # Applicable V8 absent-COMMIT ordering, plus partial suffix recovery.
    for suffix in (False,True):
        m=terminal9(kind,suffix=suffix,absent=True); m.step(B)
        if suffix: m.step(T)
        assert m.observation()['commitBranch']==A; start=len(m.fs.trace); m.step(C); once(m)
        effects=m.fs.trace[start:]; idx=next(i for i,(k,p) in enumerate(effects) if k=='append')
        assert [p for k,p in effects[:idx]]==[p for p,l in m.relation_flushes() if l.startswith('ledger')]
        assert sum(k=='append' for k,p in effects)==1; m.process_exit(); m.fs.power_loss(); once(m); RESULT['append_absent_regression']+=1
    # Process loss immediately after complete append, before any witness flush.
    m=terminal9(kind,absent=True); m.step(B); t=m.issue(C); hit=[]
    def cut(point):
        if point=='after-append': hit.append(point); raise Exit9(point)
    m.hook=cut; exact_failure(lambda:m.run(t,C),Exit9,'after-append'); assert hit==['after-append']
    m.process_exit(); assert m.observation()['commitBranch']==E; start=len(m.fs.trace); m.recover_all()
    assert not any(k=='append' for k,p in m.fs.trace[start:]); once(m); RESULT['append_exit_then_exact_completion']+=1
    # Retained prepared bytes remain independent of current facts, without owner environment lookup.
    m=terminal9(kind); original=m.expected_files['publication-manifest.jcs']; m.facts='CHANGED'; m.recover_all()
    assert m.fs.read(m.bp+'/publication-manifest.jcs')==original and json.loads(original)['preparedInputs']['configuration']=='PREPARED'
    exact_failure(lambda:m.eligible('capability'),Denial9,'STALE_ACTIVATION_FACTS'); RESULT['retained_input_regression']+=1
    for forbidden in ('PUBLISH_LEDGER_TRANSACTION','APPEND_WITNESS_ABANDON'):
        before=content(m); exact_failure(lambda:m.issue(forbidden),Denial9,'WRONG_ACTION'); assert before==content(m) and not m.auth
        RESULT['no_republish_or_abandon']+=1

# Every witness flush in the surrounding BUNDLE/TRUNCATION actions is also targeted.
for kind in KINDS:
    for action,prefix in ((B,'bundle-witness:'),(T,'truncate-witness:')):
        probe=terminal9(kind,suffix=action==T); targets=[prefix+p for p in reversed(chain(probe.wp))]
        for label in targets:
            m=terminal9(kind,suffix=action==T); m.step(C)
            if action==T: m.step(B)
            before=m.fs.read(m.wp); m.fail=label; token=m.issue(action)
            exact_failure(lambda:m.run(token,action),Flush9,label)
            assert m.reached[-1]==label and not m.auth and m.relation is None
            assert m.fs.read(m.wp)==(before if action==B else before[:-2])
            m.process_exit(); assert m.observation()['commitBranch']==E
            m.recover_all(); once(m); m.process_exit(); m.fs.power_loss(); once(m)
            TARGETS.append([kind,'surrounding-witness-flush',action,label]); RESULT['surrounding_flush_targets_reached']+=1

# Recurring accepted generations: approvals are exact subjects plus target-generation applicability.
LIFE=json.loads(SOURCE.split('```lifecycle-v9\n',1)[1].split('\n```',1)[0]); STEPS=LIFE['steps']; GATES=LIFE['gates']
PREDICATES={
 'invalidate':['affectedEvidenceInvalidated'], 'external-review':['externalAuthorization','qualifiedTools'],
 'validate-recheck-final':['validation','applicableRecheck','seedFreeFinalReview'],
 'prepare-before-stage':['unstagedExactOverlay','qualifiedVerifier'], 'operator-commit':['operatorAuthorization','exactPaths'],
 'verify-successor':['cleanExactSuccessor','qualifiedVerifier'], 'registry-cas':['registryAuthorization','qualifiedRegistry'],
 'gate-applicability':['allRequiredGateDecisions'], 'successor-authorization':['operatorAuthorization','currentBuildEvidence'],
 'durable-current-tty':['durableSettlement','currentFacts','freshTTY']}
class Lifecycle9:
    def __init__(self):
        self.gen='S'; self.head='S'; self.parent=None; self.subjects=dict(G1='verifier-v1',G2='full-source-S',G3='scope-v1')
        self.approvals={g:('S',s,'PASS') for g,s in self.subjects.items()}; self.decisions={g:('S',s,'renew') for g,s in self.subjects.items()}
        self.approval_history=[copy.deepcopy(self.approvals)]; self.decision_history=[copy.deepcopy(self.decisions)]
        self.records={}; self.done=set(STEPS); self.active='S'; self.capability=True; self.build='S'; self.review='S'
        self.verifier='v1'; self.qualified_verifiers={'v1'}; self.verifier_applicable=True
        self.commits={}; self.acceptances={}; self.counts=Counter(); self.visited=[]; self.terminal=None
    def change(self,g,subjects):
        self.parent=self.head; self.gen=g; self.subjects=dict(subjects); self.done=set(); self.records[g]={}; self.decisions={}
        self.active=None; self.capability=False; self.build=None; self.review=None; self.terminal=None
    def signature(self): return H(J([self.gen,self.parent,self.subjects]))
    def decide(self,g,mode='renew',passed=True,full=True,verified=True):
        self.visited.append('decide:'+g); need(self.head==self.gen,'NOT_ACCEPTED_GENERATION'); need(passed,'GATE_FAILED:'+g)
        old=self.approvals.get(g); target=self.subjects[g]
        if mode=='carry': need(verified and old is not None and old[1]==target and old[2]=='PASS','CARRY_NOT_VERIFIED:'+g)
        else:
            need(g!='G2' or full,'NOT_FULL_INTEGRATED_G2'); self.approvals[g]=(self.gen,target,'PASS')
            self.approval_history.append(copy.deepcopy(self.approvals))
        self.decisions[g]=(self.gen,target,mode); self.decision_history.append(copy.deepcopy(self.decisions))
    def gate_current(self):
        for g in GATES:
            d=self.decisions.get(g); need(d is not None and d[:2]==(self.gen,self.subjects[g]),'GATE_APPLICABILITY:'+g)
            need(self.approvals.get(g,(None,None,None))[1:]==(self.subjects[g],'PASS'),'GATE_APPROVAL:'+g)
    def do(self,step,facts=None):
        self.visited.append(step); i=STEPS.index(step); need(set(STEPS[:i])<=self.done,'MISSING_STEP:'+step)
        facts={p:True for p in PREDICATES[step]} if facts is None else facts
        for p in PREDICATES[step]: need(facts.get(p) is True,'PREDICATE:'+step+':'+p)
        if step in ('prepare-before-stage','verify-successor'):
            need(self.verifier in self.qualified_verifiers and self.verifier_applicable,'VERIFIER_FIRST_USE')
        if step=='validate-recheck-final': self.review=self.gen; self.build=self.gen
        if step=='operator-commit':
            value=(self.gen,self.parent,self.signature())
            if self.gen in self.commits: need(self.commits[self.gen]==value,'COMMIT_MISMATCH')
            else: self.commits[self.gen]=value; self.counts['commits']+=1
        if step=='registry-cas':
            need(self.gen in self.commits,'NO_COMMIT'); need(self.head in (self.parent,self.gen),'REGISTRY_CONFLICT')
            if self.head==self.gen: need(self.acceptances.get(self.gen)==self.signature(),'ACCEPTANCE_MISMATCH')
            else: self.head=self.gen; self.acceptances[self.gen]=self.signature(); self.counts['CAS']+=1
        if step=='gate-applicability':
            need(self.head==self.gen,'NOT_ACCEPTED_GENERATION')
            self.gate_current()
        if step=='successor-authorization':
            need(self.head==self.gen and self.review==self.gen,'WRONG_GENERATION'); need(self.build==self.gen,'STALE_BUILD')
            self.gate_current(); self.active=self.gen; self.terminal=terminal9('SUCCESSOR_ACTIVATION',generation=self.gen)
        if step=='durable-current-tty':
            self.gate_current(); need(self.head==self.gen and self.review==self.gen and self.build==self.gen,'WRONG_GENERATION')
            need(self.terminal is not None,'NO_SUCCESSOR'); self.terminal.eligible('capability')
            need(json.loads(self.terminal.fs.read(self.terminal.bp+'/publication-manifest.jcs'))['sourceGeneration']==self.gen,'WRONG_SETTLEMENT_GENERATION')
            need(self.active==self.gen,'STALE_ACTIVATION'); self.capability=True
        self.done.add(step); self.records[self.gen][step]=self.signature()
    def interrupt(self):
        self.done=set(); self.capability=False
        if self.terminal: self.terminal.process_exit()
    def resume(self):
        self.visited.append('resume'); self.done=set()
        for step in STEPS:
            if step not in self.records[self.gen]: break
            need(self.records[self.gen][step]==self.signature(),'RESUME_PROOF')
            self.done.add(step)
        need(self.head in (self.parent,self.gen),'RESUME_HEAD')
        if 'registry-cas' in self.done: need(self.head==self.gen and self.acceptances.get(self.gen)==self.signature(),'RESUME_CAS')
        if 'gate-applicability' in self.done:
            self.gate_current()
        if 'durable-current-tty' in self.done: self.done.remove('durable-current-tty') # fresh completion/TTY, not a cached capability

def changed9(all_subjects=False):
    m=Lifecycle9(); assert m.active=='S' and m.capability and m.approvals['G2']==('S','full-source-S','PASS')
    s=dict(m.subjects,G2='full-source-Sprime')
    if all_subjects: s.update(G1='verifier-v2',G3='scope-v2')
    m.change('Sprime',s); assert m.active is None and not m.capability and m.review is None and m.build is None
    assert m.approvals['G2'][0]=='S'; return m

def advance_to(m,limit):
    for step in STEPS[:limit]:
        if step in m.done: continue
        if step=='gate-applicability':
            for g in GATES:
                if g not in m.decisions: m.decide(g,'carry' if m.approvals[g][1]==m.subjects[g] else 'renew')
        if step=='durable-current-tty': m.terminal.recover_all()
        m.do(step)

# Defective same-subject boolean permits activation after ordinary review; corrected denies.
m=changed9(); advance_to(m,3)
old_global_G2=m.approvals['G2'][2]=='PASS'; old_final=m.review==m.gen
assert old_global_G2 and old_final and m.head=='S'
exact_failure(lambda:m.do('successor-authorization'),Denial9,'MISSING_STEP:successor-authorization')
assert m.visited[-1]=='successor-authorization' and m.active is None; RESULT['old_post_change_skip_reproduced']+=1

for i,step in enumerate(STEPS):
    m=changed9(); advance_to(m,i)
    for p in PREDICATES[step]:
        n=copy.deepcopy(m); facts={q:True for q in PREDICATES[step]}; del facts[p]
        exact_failure(lambda:n.do(step,facts),Denial9,'PREDICATE:'+step+':'+p)
        assert n.visited[-1]==step and step not in n.done; RESULT['lifecycle_predicate_denials']+=1
    for prior in STEPS[:i]:
        n=copy.deepcopy(m); n.done.remove(prior)
        exact_failure(lambda:n.do(step),Denial9,'MISSING_STEP:'+step); assert n.visited[-1]==step
        TARGETS.append(['Sprime','missing-step',step,prior]); RESULT['lifecycle_dependency_denials']+=1
m=changed9(); advance_to(m,7)
for g in GATES:
    exact_failure(lambda:m.decide(g,passed=False),Denial9,'GATE_FAILED:'+g); assert m.visited[-1]=='decide:'+g
    RESULT['failed_gate_denials']+=1
exact_failure(lambda:m.decide('G2',full=False),Denial9,'NOT_FULL_INTEGRATED_G2')
exact_failure(lambda:m.decide('G2','carry'),Denial9,'CARRY_NOT_VERIFIED:G2')
exact_failure(lambda:m.decide('G1','carry',verified=False),Denial9,'CARRY_NOT_VERIFIED:G1')
for g in GATES:
    n=copy.deepcopy(m)
    for other in GATES: n.decide(other,'carry' if other!='G2' else 'renew')
    for wrong in (None,('S',n.subjects[g],'renew'),('Sprime','wrong-subject','renew')):
        n.decisions[g]=wrong
        exact_failure(lambda:n.do('gate-applicability'),Denial9,'GATE_APPLICABILITY:'+g)
        assert n.visited[-1]=='gate-applicability' and n.active is None; RESULT['generation_gate_denials']+=1
m=changed9(True); advance_to(m,7)
for g in ('G1','G3'):
    exact_failure(lambda:m.decide(g,'carry'),Denial9,'CARRY_NOT_VERIFIED:'+g); RESULT['changed_G1_G3_denials']+=1
advance_to(m,10); assert m.capability and m.active==m.head=='Sprime'; assert m.counts=={'commits':1,'CAS':1}; RESULT['accepted_requalified_successor']+=1

# Verifier cannot create the authoritative checkpoint needed for its own qualification.
for applicable in (False,True):
    m=changed9(True); advance_to(m,3); m.verifier='v2'; m.verifier_applicable=applicable
    exact_failure(lambda:m.do('prepare-before-stage'),Denial9,'VERIFIER_FIRST_USE'); assert m.visited[-1]=='prepare-before-stage'
    m.qualified_verifiers.add('v2') # HARNESS independent prior-to-use qualification, not self-produced checkpoint
    if applicable: m.do('prepare-before-stage')
    else: exact_failure(lambda:m.do('prepare-before-stage'),Denial9,'VERIFIER_FIRST_USE')
    RESULT['verifier_first_use_denials']+=1
for g in GATES:
    m=changed9(); advance_to(m,9); m.terminal.recover_all(); del m.approvals[g]
    exact_failure(lambda:m.do('durable-current-tty'),Denial9,'GATE_APPROVAL:'+g)
    assert m.visited[-1]=='durable-current-tty' and not m.capability; RESULT['qualification_withdrawal_denials']+=1
m=changed9(); advance_to(m,9); m.terminal=terminal9('SUCCESSOR_ACTIVATION',generation='S'); m.terminal.recover_all()
exact_failure(lambda:m.do('durable-current-tty'),Denial9,'WRONG_SETTLEMENT_GENERATION'); RESULT['wrong_settlement_generation_denied']+=1
m=changed9(); advance_to(m,8); m.build='S'
exact_failure(lambda:m.do('successor-authorization'),Denial9,'STALE_BUILD'); RESULT['old_build_evidence_denial']+=1

# Repeated source change DURING partial qualification; preserve history, not stale approvals.
m=changed9(); advance_to(m,7); m.decide('G2'); old=copy.deepcopy(m.records['Sprime']); old_decision=m.decisions['G2']
history=copy.deepcopy((m.approval_history,m.decision_history))
m.change('Sdoubleprime',dict(m.subjects,G2='full-source-Sdoubleprime'))
assert history==(m.approval_history,m.decision_history)
assert m.records['Sprime']==old and not m.decisions and not m.capability and m.head=='Sprime'
advance_to(m,7); m.decisions['G2']=old_decision
for g in ('G1','G3'): m.decide(g,'carry')
exact_failure(lambda:m.do('gate-applicability'),Denial9,'GATE_APPLICABILITY:G2')
m.decisions.pop('G2'); advance_to(m,10); assert m.head==m.active=='Sdoubleprime' and m.capability
assert m.counts=={'commits':2,'CAS':2}; RESULT['repeated_change_requalified']+=1

# Seven named resume points, plus interruption after side effect before phase acknowledgment.
resume_index=dict(zip(LIFE['resume'],(3,4,5,6,7,8,9)))
for name,idx in resume_index.items():
    m=changed9(); advance_to(m,idx); before=dict(m.counts); m.interrupt(); m.resume(); advance_to(m,10)
    assert m.head==m.active=='Sprime' and m.capability and m.counts=={'commits':1,'CAS':1}
    for step in ('operator-commit','registry-cas'):
        if step in STEPS[:idx]:
            n=copy.deepcopy(m); c=dict(n.counts); n.do(step); assert dict(n.counts)==c
    RESULT['named_resume_points']+=1; TARGETS.append(['Sprime','resume',name])
for step in ('operator-commit','registry-cas'):
    m=changed9(); idx=STEPS.index(step); advance_to(m,idx+1)
    del m.records[m.gen][step] # HARNESS crash after committed/CAS effect, before phase acknowledgment
    m.interrupt(); m.resume(); before=dict(m.counts); m.do(step); assert dict(m.counts)==before
    advance_to(m,10); assert m.capability and m.counts=={'commits':1,'CAS':1}; RESULT['unacknowledged_effect_resume']+=1
m=changed9(); advance_to(m,8); m.interrupt(); m.records[m.gen]['prepared-manifest' if 'prepared-manifest' in m.records[m.gen] else 'prepare-before-stage']='wrong'
exact_failure(m.resume,Denial9,'RESUME_PROOF'); RESULT['corrupt_resume_denial']+=1

# Initial graph regression only: no new global booleans are carried into lifecycle9.
graph=json.loads(SOURCE.split('```phase-graph-v8\n',1)[1].split('\n```',1)[0]); done=set()
for node,entry in graph.items():
    assert set(entry['after'])<=done; done.add(node)
assert graph['B']['after']==['A'] and graph['G1']['after']==['B'] and graph['G2']['after']==['C30-14']
assert 'G1' in graph['BOOTSTRAP_ADOPTED']['after'] and 'G2' in graph['ACTIVATION']['after']
RESULT['initial_graph_nodes_preserved']=len(done)
print('V9_TARGETS',J(TARGETS).decode())
print('V9_RESULTS',J(dict(RESULT)).decode())
print('V9_LIMITS synthetic ASCII owner/frame/checkpoint codecs; only in-memory fsync assumptions and generation model; no real crash/security/G1/G2/tool qualification')
```

## 16. V9 execution record

The inspected §15 runner completed twice: the initial full V9 model, then the
expanded pinned-descriptor/final-recheck model. Both passed all their assertions;
no V9 model run failed or timed out. Final fixture SHA-256:
`ef15aef195e0dcb36df50faf7d7cddb781c19c88584f61337e763812fe409498`.
The exact executed model command is §15; the exact current read-only audit
command/body is FOURTH_SOL_FINDING_MATRIX.md, audit-v9. These are documentation
fixtures, not new executable test/source files or runtime evidence.

| Actual completed check | Result |
|---|---|
| initial/successor × ledger-content/ledger-link/witness-link windows | 6 old terminal dead-ends/bypasses reproduced and lost matching ledger after machine loss; 6 corrected same-input histories survived with exact existing COMMIT and ZERO appended bytes/records |
| every exact-existing ledger/witness file/directory fsync | 84 targets reached (2 kinds × 3 windows × 14 flushes); exact Flush9 label, discarded instance/no knowledge, no content/name changes and denied consumers asserted |
| before/after every required terminal flush | 168 Exit9 targets reached; unchanged visible content, authority/knowledge loss, fresh repeat of all required flushes and later machine survival asserted |
| surrounding bundle/truncation witness flushes | 28 targets reached; failures deny success, then restart returns to ledger-first completion, not an earlier witness-only bypass |
| no-append descriptor/name checks | 46 equal-byte substitutions reached; 4 additional name races after pre-flush check proved the pinned old inode, not the replacement pathname, was flushed; no success granted |
| displayed binding/final verification | 10 byte/head/fact/expiry changes reached before witness flush; 6 late identity/fact/expiry faults reached after witness flushes and denied final completion; 6 completed-key invalidations |
| closed private observation/authority | 60 closure/branch/version/path denials; 24 exact authority denials; no broad rejection helper counts unrelated exceptions |
| integrity/effects | 12 missing/corrupt/wrong-owner/transaction/COMMIT/schema denials without reconstruction; 16 forbidden content-effect denials; 4 explicit republish/ABANDON denials |
| complete-COMMIT suffix path | both kinds executed exact-existing COMMIT → bundle → separately authorized truncation → exact-existing COMMIT, never duplicate frame; all remaining consumer checks retained |
| separate consumer prerequisites | 60 per-consumer current-source/qualification/fact/TTY/operator denials, plus pre-completion/bundle/suffix/cache-loss checks; only current complete relation plus separate checks eligible |
| applicable regressions | 4 absent-COMMIT/partial-suffix paths preserve ledger-before-append; 2 exits after complete append recover no-append; 2 retained-prepared-input/current-fact separation paths; 21 initial graph nodes preserved |
| post-change defect | old S G2 Boolean plus ordinary S' FINAL_REVIEW reproduced the skipped adoption/qualification path; corrected successor authorization denied |
| mandatory lifecycle requirements | 20 missing-predicate and 45 missing-earlier-step denials; 9 missing/wrong-generation/wrong-subject gate denials; 3 failed gate, 2 changed G1/G3 carry denials; explicit non-full-G2/uncertain-carry denials |
| first use / current evidence | 2 verifier first-use denial scenarios, stale build denial, wrong settlement-generation denial and 3 qualification-withdrawal denials before capability |
| recurring successful generations | accepted/requalified S' then another source change during qualification requiring accepted/requalified S''; historical approval/decision/review evidence preserved, no stale flags reused |
| interruption/resume | all 7 named resume points; 2 unacknowledged commit/CAS effects returned existing exact result without duplication; corrupt resume proof denied |

Counters name checks and are not an additive test total. The emitted V9_TARGETS
lists exact kind/window/path/phase targets. Each claimed injection asserts its
reached label and exact exception/reason before outcome checks. The no-append
branch compares complete visible file/namespace maps; only fsync trace effects
are permitted. File fsync and directory-entry fsync are separate; recovering
Owner9 never reads durable maps (also checked structurally by audit-v9).

Unchanged V5 calculations/parser tests were explicitly rerun as **historical
regressions**: 6 public syntax examples, 256 cause combinations, 195 historical
shape negatives, 61 binding negatives, 30 parser cases, and unchanged 1742-byte
PREPARE SHA e2d913f82b0d46b2588a2a811a48d48234a9ab8e3abd390cf9b66439f3dfe591.
V7/V8 models/pins are preserved, not relabeled as V9 evidence; their superseded
suites/audits were not run as current V9 checks.

The first current audit stopped on the phrase "prepare before staging" split
across two lines in C30-14. Current prose assertions now normalize whitespace
while requiring the complete ordered phrase; no contract or historical validator
was weakened. Rerun passed: original exact 32-path set, 22 amended/10 unchanged,
7 tracked plus 25 pre-existing untracked documents, zero staged changes;
tracked/staged/all untracked whitespace clean. Eight protected structural blocks,
all fourteen Start blocks/initial phases/U1–U5, public examples, action/candidate/
bundle counts, V8 execution attribution and seven historical fixture/audit fences
are preserved. Frozen V8 capture/manifest/document hashes remain exact. A final
read-only targeted stale-clause scan found only contextual negative/historical
references, not an active skipping runtime list or terminal-only dead-end.

**Limitations / unexecuted:** synthetic ASCII owner/frame/checkpoint codecs and
modeled eligibility predicates, not complete production schema/Unicode-JCS/Git/
proof implementations. No real filesystem/power-loss/TTY/locks, security/tool
isolation, transport/FD/provider tests, G1/G2/G3 review, package installation,
real checkpoint/registry/evidence/journal, source implementation or runtime use
was executed. Storage support and actual subject/tool applicability remain future
qualified inputs; U1–U5 remain unmet. The fixture tests the specified finite
states/targets, not every arbitrary crash/interleaving or adversarial OS.

G3-V8-P1-01 and SEQ-V8-P1-01: AMENDED_PENDING_INDEPENDENT_V9_REVIEW.
Parent G3-V7-P1-01 is not independently resolved. Independent combined V8 verdict
CHANGES_REQUIRED remains historical. No bounded definition ambiguity is left
identified; actual qualification/adoption evidence is not supplied by the model.

READINESS: READY_FOR_V9_DOCUMENTATION_REVIEW — bounded documentation amendment
and declared checks only. G1 INDEPENDENT_REVIEW_PENDING; G2
INDEPENDENT_SECURITY_REVIEW_PENDING; G3 CHANGES_REQUIRED_PENDING_FRESH_REREVIEW;
policy adoption NOT_GRANTED; external-tool qualification NOT_ESTABLISHED;
candidate construction authorization NOT_GRANTED; runtime activation/use BLOCKED.
No packet, model invocation, implementation, staging, commit, source publication
or activation is authorized. Stop at documentation review.
