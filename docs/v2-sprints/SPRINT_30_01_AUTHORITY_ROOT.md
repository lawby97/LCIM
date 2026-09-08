# C30-01 — local operator authority root and capability boundary

**Development gate:** master §§7–8 phases A–D: accepted external procedure/tools,
current applicable G1/G3, exact per-task authorization, accepted Bootstrap and
current immediate predecessor. G2 follows complete integrated implementation;
activation/use requires phase F, all current applicable G1/G2/G3 and separate
operator authorization. None is granted here. Component runtime prerequisites
below are not prerequisites to constructing their own code in isolated fixtures.

**Status:** `PLAN_AMENDED / LOCAL_AUTHORITY_SCOPE_REVIEW_PENDING`

**Depends on:** Bootstrap Checkpoint V2 independent review and its verified
successor source generation.

**Next:** `SPRINT_30_02_PLAN_DECLARATION.md`.

## Scope amendment

The V4 result was `BLOCKED_PENDING_STRONGER_MACOS_EXECUTABLE_ATTESTATION`.
The stopping rule is accepted. C30-01 does not implement cryptographic signer
custody, signed runtime authorization, signer IPC, Keychain access or strong
same-UID executable attestation. No V5 signer experiment is created; G3 documentation rereview V7 is distinct.

C30-01 owns the local-operator-session pure constructor and the internal
authority-object construction primitive. It does **not** publish bootstrap
records or issue production authority. Master-plan §§2–2.8 control A0, A1,
bootstrap and successor-activation recovery, the four module-private authority
classes and the closed API matrix.

## Explicit operator launch

The controller accepts a run or resume only after a direct controlling-TTY
launch. It displays and binds:

```text
repositoryIdentity
sourceCommit
sourceTree
planIdentity
configurationDigest
modelRoutingDigest
finiteUpstreamRequestCeilings
intendedOperation
reviewedSourceGeneration
activationOrBuildIdentity
controllerProcessIdentity
controllerSessionIdentity
```

The operator confirms the exact displayed operation. Confirmation is a local
observation and is not cryptographic proof of operator or process identity.

## Authority construction boundary

In transaction-zero A0, C30-01 computes candidate session bytes/ID/digest in
memory and writes nothing. The session depends on the already computed budget
candidate and may not refer to a plan, genesis or activation ID. After exact TTY
confirmation, C30-13's A1 transaction publishes it with the other four
candidates. During read-only successor preflight C30-01 instead constructs the
session successor after the exact budget successor, binds current facts and
`authorityClass = "SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY"`, and still
writes nothing; C30-13 may publish it only in the exact four-candidate successor
transaction. The record is evidence only.

C30-01's primitive can construct opaque module-private objects only when called
from an allowed owner path: fixture authority for tests, or C30-13's exact
one-use bootstrap/production issuance paths. It constructs
`GENESIS_ACTIVATION_BOOTSTRAP_AUTHORITY` only with all bindings in master
§2.5 and mode `INITIAL_PUBLICATION` or `RESUME_EXACT_TAIL` (including V9
exact-existing terminal completion, not a new action/mode), and
`SUCCESSOR_ACTIVATION_PUBLICATION_AUTHORITY` only with all eligibility,
publication-kind, action and byte bindings in master §2.5A. Fixture authority
is never accepted by production APIs. C30-13 remains the sole issuer of both
publication-authority classes and `PRODUCTION_RUNTIME_CAPABILITY`; every
production provider, ledger, Git, ordinary recovery, activation-dependent and
finalization API requires the actual production object. No authority class has
a public or serializable capability schema.

## Owned family

Freeze:

```text
lcim.local-operator-session@1
```

The strict shape, JCS preimages, ID/digest domains, CAS, replay,
supersession, invalidation, denial codes and version behavior are exactly
master-plan §§3.0 and 3.1. C30-01 owns constructor semantics; C30-13 publishes genesis in the transaction-
zero bootstrap and later successors only in successor-activation
transactions. Exact consumers are: C30-02 plan; C30-03
ledger/bootstrap precheck; C30-05 accounting; C30-07 provider/review; C30-10
barriers; C30-11 operator checkpoint; C30-12 recovery/audit; C30-13 activation;
C30-14 delivery; all production API guards. The record contains no bearer token
or reconstructable capability and is evidence only.

## Removed authority families

The following are not emitted or consumed by LCIM 3.0: cryptographic
`AUTHORITY_ROOT`, `PLAN_ATTESTATION`, `LEDGER_WITNESS`,
`BUDGET_AUTHORIZATION`, `BUDGET_REAUTHORIZATION`, `ACTIVATION`,
`DISTRIBUTION_RC1` and `DISTRIBUTION_FINAL`. They are LCIM 3.1 roadmap
families owned by `EXTERNAL_OPERATOR_SIGNING_SERVICE`.

No active C30 consumer may require one of those families. No replacement is a
digital signature, signed grant, anti-rollback signature, secure monotonic
anchor or independent identity proof.

## Local threat model

LCIM 3.0 does not claim resistance to hostile same-UID processes, root/kernel
compromise, debugging or memory theft of the live controller, malicious OS,
full-machine compromise or coordinated rollback of every local authority root.
The local capability is bounded process-local authority only.

LCIM 3.0 does structurally isolate Flash, Sol, deterministic validation,
target-controlled scripts, target worktrees and model prompts/outputs from
controller-owned authority, provider credentials, request accounting and
Git-control surfaces.

## Acceptance and recovery

Tests must cover all four module-private authority classes, the A0 no-write
surface, transaction-zero and successor literal-bundle whitelists,
actual-object production guards and every cause-specific outcome in master
§2.8. Crash recovery starts with production capability and all publication
authorities absent, classifies read-only, and may construct an exact one-action
resume instance only for the original operation/bytes after fresh TTY
confirmation.

Master §2.5B defines the complete frozen authorization observation, §3.4A
defines prepared/current binding snapshots and exact stale-fact comparisons,
§3.4B defines PREPARE reconstruction and its full framed-byte authority digest,
and §§2.3A–2.3B close successor content bindings. C30-01 consumes these exact
definitions. Historical finding D was INDEPENDENT_REREVIEW_PASS under its
prior scope. V8 deliberately amends guard rule 3 for G3-V7-P1-01; that change
is pending independent review, not covered by the historical PASS.

The unchanged eight/seven-action vocabulary and per-class matrix are master
§§2.5/4.5. V7 guards additionally require §2.3C's v2 manifest/retained prepared
capsule and §2.5D's shared durability prerequisite. V9 complete COMMIT without
session relation knowledge first offers APPEND_WITNESS_COMMIT exact-existing
completion, even with a VISIBLE_VERIFIED bundle or suffix; only afterward may
bundle/shared-ancestor or suffix flushes run. Other visible complete bundles
first offer confirmed PERSIST_PREPARED_BUNDLE, never stale PREPARE/ledger/use. This
metadata-only prerequisite also completes interrupted header-only durability;
it does not revive initialization. V8 non-COMMIT observations remain integer
version 2; APPEND_WITNESS_COMMIT requires integer version 3 with non-null closed
ledgerCommitPrerequisite, required commitBranch (APPEND_ABSENT or
COMPLETE_EXACT_EXISTING) and complete existing ledger/witness pathBindings
union (§2.5B). Non-COMMIT forbids both COMMIT-only members. No old version-2 COMMIT or version-3 non-COMMIT is accepted.
INITIALIZE_WITNESS_JOURNAL uses only the bootstrap class's genuine PRE_JOURNAL
variant (§2.5C), with null publicationBundleDigest and no invented prefix,
bundle or capability prerequisite. The constructor verifies exact intended
path/repository/run/source/guidance/confirmation bindings and initialization
byte digest; successor class cannot initialize. PERSIST_ABANDON_EVIDENCE uses
only eligible stale B2/PREPARE_ONLY, binding every §3.4C package artifact via
the exact manifest and closed observation. It grants no append or capability.
C30-13 alone issues both new one-use memory-only actions; C30-12 classifies,
C30-03 supplies bounded no-lock-file storage primitives. §2.5C/§3.4C crash
rules, §2.3's fully populated staging order and §12 T1/T2/T3 in-memory
counterexamples are required acceptance coverage (§11 is historical). No support
write is delegated to an unnamed setup, retention or cleanup actor.

C30-01 owns these exact authority-construction and guard distinctions:

1. Before ledger publication, expired or drifted facts deny
   `APPEND_WITNESS_PREPARE` for stale bytes,
   `PUBLISH_LEDGER_TRANSACTION` for stale bytes, and every production-
   capability issuance.
2. When no ledger transaction exists, those facts may authorize only the narrow
   exact terminalization path: fresh-TTY PERSIST_ABANDON_EVIDENCE, consume and
   reverify matching durable evidence/current heads, then a separately confirmed
   APPEND_WITNESS_ABANDON instance. Evidence persistence is only that prerequisite;
   stale PREPARE, stale ledger publication and capability issuance remain denied.
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
5. Integrity mismatch still quarantines and never authorizes ABANDON or COMMIT.

C30-13 remains the sole issuer of transaction-zero bootstrap-authority
instances, successor-activation publication-authority instances and production
capability. Already committed state first requires §2.5D's exact same-session
relation completion and sealed bundle/no suffix; only then ordinary read-only
reissuance with current qualifications/facts and fresh TTY. Stale committed state
uses the successor path. No generic denial, bearer fallback, serialized
authority or ordinary C30-01 production issuance is allowed.

No macOS Keychain dependency is permitted. No external signer is implemented.

## V9 COMMIT guard reconciliation — G3-V8-P1-01

Master §§2.5B/2.5D/2.7/2.8/4.4/4.5 are incorporated in full. COMMITTED is a
logical report, not durability. Its nextAction is APPEND_WITNESS_COMMIT with
commitBranch COMPLETE_EXACT_EXISTING until exact owner-session completion;
INCOMPLETE_TAIL with complete COMMIT uses the same priority. Version 3 binds
existing terminal/PREPARE/full prefix/suffix, ledgerCommitPrerequisite, both
chains, operation/kind/bundle/heads, displayed facts/expiry and branch. Use the
**existing frame bytes/SHA**, not a reconstructed timestamp. Claim fresh C30-13
one-use authority; pin/verify; fsync ledger file/full chain through R/U;
recheck; fsync existing witness/full chain; reverify; consume/reclassify.
Append ZERO bytes, create ZERO records. VISIBLE_VERIFIED bundle is permitted:
completion precedes bundle flushing and separately authorized truncation;
truncation invalidates knowledge and requires repeated terminal completion.
Every flush failure denies success/use and changes no existing bytes. Exit
loses authority/knowledge; every new session repeats. Relevant byte/head/path/
fact change invalidates reliance. Only exact same-session completion plus sealed
bundle/no suffix, current qualifications/facts and fresh-TTY consumer rules
allows capability/new successor. No prior ledger durability or writer proof
is an issuance gate; missing/corrupt ledger quarantines without reconstruction.

Retained APPEND_ABSENT branch (G3-V7-P1-01 parent, not independently resolved):

Master §§2.5B/2.5D/2.7/4.5 control G3-V7-P1-01: ledgerCommitPrerequisite has
exactly absoluteCanonicalLedgerPath, fileByteLength and fileSha256; bind the
actual C30-03 physical ledger below R, complete bytes/current tip and both
complete existing path chains through U, no ABSENT. Claim one matching C30-13
instance, pin descriptors/name links, verify bytes/transaction/head, fsync the
ledger file then all containing directories bottom-up through R/U, recheck all
confirmed facts/expiry before the first witness byte, then append/fsync exact
COMMIT and full witness chain. Ledger effects are fsync-only, never content
writes/republish/cleanup. Repeat after earlier reported success; bundle
completion supplies no ledger durability. Flush failure discards authority
before any COMMIT byte; integrity precedence and displayed-drift denial remain.
Exit loses authority/knowledge; fresh confirmation repeats the prerequisite.
Incomplete tails need separate truncation; full COMMIT is never reappended and
matching ledger never ABANDONed. §15 models V9; §§12–14 pins/results remain historical.

## Implementation prompt

Implement only C30-01 local operator launch/session confirmation and the
module-private in-memory capability seam. Preserve Pi deepseek-v4-flash (thinking "max", LCIM reasoning MAX), controller-owned
Pi openai-codex gpt-5.6-sol XHIGH, validation-before-review, repair-until-PASS, exact RECHECK, zero
open findings and all worker non-mutation rules. Do not implement plan
semantics, protocol ledger, Git, transport, scanning, findings, repair,
activation execution or release. Do not access credentials or Keychain. Return
files/tests/commands/results/acceptance/unresolved issues/ICRs; do not commit.

## Normative Start/dependency gate

The common development Start contract is master §7.4, incorporated in full.
Predecessor: `BOOTSTRAP_CHECKPOINT_V2`. Check procedure/current applicable G1/G3,
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
