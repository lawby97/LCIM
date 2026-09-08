# C30-05 — Pi Flash transport and local request budget

**Development gate:** master §§7–8 phases A–D: accepted external procedure/tools,
current applicable G1/G3, exact per-task authorization, accepted Bootstrap and
current immediate predecessor. G2 follows complete integrated implementation;
activation/use requires phase F, all current applicable G1/G2/G3 and separate
operator authorization. None is granted here. Component runtime prerequisites
below are not prerequisites to constructing their own code in isolated fixtures.

**Status:** `FLASH_REQUEST_ACCOUNTING = IMPLEMENTABLE_PROTOTYPE_PROVED`;
`IMPLEMENTATION_PENDING`.

**Depends on:** C30-04 verified successor source generation.

**Next:** `SPRINT_30_06_ARTIFACT_SCAN.md`.

The local prototype is non-authoritative evidence. Production implementation
requires the sealed entry, sandbox, immutable families, crash tests and
independent review named by the master plan.

## External development boundary

Master §7.3 EXTERNAL_DEVELOPMENT_REVIEW/source admission is not this runtime
FD-3 or budget ledger. External request/spend controls must be independently
accepted before development-model use; this candidate cannot qualify itself by
spawning stock/manual Pi or counting sessions. Candidate tests use only isolated
synthetic credentials/local mocks. Runtime COMMIT follows the expanded master
§§2.5B/2.5D/4.5 ledger-fsync-before-witness contract, no new accounting action.

## Pinned Pi contract

Use exactly:

```text
@earendil-works/pi-coding-agent@0.84.1
integrity: sha512-ncAqFrG+iybuPGOhMiZoEHkEzTpJgz3guYD32pD+M7ucc0WeHmauP6wa7qwP8V/KWvsZDVNa5XGsdZ7fkC7w7A==
closure: 19066 files
closure SHA-256: 57462f26cac81ce9a68e60c704c6d3e6ca41d11f01254ee5c9b00ee560da85a8
```

Exact npm/closure verification is a hard prerequisite. Flash uses the
controller-owned broker and only the non-credential
`lcim-no-credential-v1` sentinel model configuration.

## Flash isolation

The sealed child uses an in-memory resource/session/settings construction:

```text
no extensions, skills, prompt templates, themes, context files or persistence
only read, write, edit and ls
model network disabled
provider credential retained by controller broker
```

The model route is fixed to `deepseek-v4-flash`, Pi thinking `max`, request
thinking enabled and reasoning effort `max`. Flash is the sole implementation
and repair worker; it cannot invoke Sol or nested providers.

## FD-3 accounting boundary

The controller creates one inherited full-duplex anonymous pipe on child FD 3
and combines it with the invocation-scoped loopback provider broker. Only the
controller and direct sealed child own the endpoints. The inherited OS handle
plus recorded direct-child PID authenticates the peer; the channel key is
provided only over FD 3.

FD 3 is `ACCOUNTING_AUTHORITY_ONLY`. It is never a provider credential, OAuth,
bearer or direct ledger/budget FD. `runConstrainedProcess()` owns creation,
inheritance, close-on-error, child exit and teardown. Production denies
`/dev/fd` reopening and process fork. The channel closes before broker
teardown.

## Local budget ceiling

C30-05 owns the pure constructor/schema semantics for:

```text
lcim.local-budget-ceiling@1
```

During read-only transaction-zero A0 it is the first candidate: genesis
predecessor/head are null and it references no session or plan-confirmation
record. C30-13 publishes it in the one A1 bootstrap transaction. During read-
only successor preflight it is again first, now as an exact CAS successor with
no session/plan reference, and C30-13 may publish it only in the four-candidate
successor-activation transaction. It preserves current finite ceilings through
the existing non-increasing `reason = "DECREASE"` safety path (equality
allowed) unless a
separately displayed/directly confirmed change uses the existing budget rules.
The strict schema, digest/ID preimages, generation/CAS, replay, supersession,
recovery and denial behavior are master §§3.0 and 3.3. The complete request-class vocabulary is
`FLASH_IMPLEMENTATION`, `FLASH_REPAIR`,
`SOL_CONTRACT_CHECK`, `SOL_DIAGNOSE`, `SOL_RECHECK`, `SOL_FINAL_REVIEW`.
Genesis and every increase require TTY confirmation; an unsafe decrease is
refused. Flash, Sol, target code and project configuration cannot increase
ceilings. There is no signed budget grant or reauthorization in LCIM 3.0.

## Per-request accounting

Every upstream request receives a fresh durable reservation and body-bound,
single-use 30-second authorization, even on a reusable channel. Bind:

```text
runId, providerInvocationId, piSessionId, channelId, requestId, ordinal,
exactModel, relationshipKind, continuationOf, retryOf, requestBodyDigest,
contextDigest
```

The controller performs:

```text
authenticate child/channel
→ validate lineage and ordinal
→ reserve one credit under owner lock
→ append and fsync reservation
→ issue body-bound authorization
→ broker verifies authorization and actual body
→ durably record DISPATCH_STARTED before upstream socket
→ settle after observation/recovery
```

Reject cross-run/invocation/session/model, skipped/repeated ordinal, replayed
request ID/authorization, body mismatch, expiry and unauthenticated child.

Settlement is:

```text
before dispatch begins                         → NEVER_CHARGEABLE
after dispatch begins, receipt unknown        → POSSIBLY_CHARGEABLE
a response/upstream receipt is observed       → DEFINITELY_CHARGEABLE
```

Under the owner-verified run lock, `availableCredits = confirmedCeiling -
definitelyChargeableCount - possiblyChargeableCount -
outstandingReservedCount`; reserve one only when availability is at least one.
One credit equals one actual upstream request. `NEVER_CHARGEABLE` releases;
`POSSIBLY_CHARGEABLE` and `DEFINITELY_CHARGEABLE` permanently consume. Startup
recovery settles uncertainty conservatively and never restores uncertain
credit. The next dispatch is denied if reservation would exceed the ceiling.

## Owned families

| Family | First emitter | Consumers |
|---|---|---|
| `lcim.pi-transport-identity@1` | closure/adapter proof | request evidence |
| `lcim.flash-transport-proof@1` | controller invocation | audit/repair |
| `lcim.local-budget-ceiling@1` | C30-05 constructor, published in the C30-13 transaction-zero or successor-activation transaction | C30-05 accounting; C30-07 provider/review; C30-08 findings; C30-09 repairs; C30-10 barriers; C30-11 operator checkpoint; C30-12 recovery/audit; C30-13 activation; C30-14 delivery |
| `lcim.request-reservation@1` | controller/channel | settlement |
| `lcim.request-authorization@1` | controller after reservation | broker |
| `lcim.dispatch-evidence@1` | broker before socket | settlement/audit |
| `lcim.request-settlement@1` | receipt/recovery | audit/recovery |
| `lcim.resume-proof@2` | cause-specific verifier | repair/recovery |

## Acceptance and recovery

Cover exact package/closure identity, resource isolation, model/MAX mapping,
FD-3 ownership/reopen denial, reservation/body binding, lineage/ordinal/replay
denials, `DISPATCH_STARTED` ordering, all three crash settlements, broker
teardown, credential absence and process cleanup. Numeric ceilings are local
operator choices and may only be lowered without new confirmation.

## Scope limits and implementation prompt

The V4 stopping rule removes cryptographic signer custody, signer IPC, native
runtime authorization and strong same-UID executable attestation from this
unit. No Keychain access is permitted. Implement only the pinned Pi adapter,
isolated Flash setup, controller broker route, sealed child, FD-3 accounting,
local budget ceiling, body binding, sandbox denial and teardown. Do not
implement Sol Transport V3, findings, repair, checkpoints, activation or
release. Return files/tests/commands/results/acceptance/unresolved issues/ICRs;
do not commit.

## Normative Start/dependency gate

The common development Start contract is master §7.4, incorporated in full.
Predecessor: `C30-04`. Check procedure/current applicable G1/G3,
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
