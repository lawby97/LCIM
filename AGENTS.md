# AGENTS.md — LCIM 3.0 active agent constitution

The controlling implementation plan is
`docs/v2-sprints/00B_MASTER_PLAN_LCIM_3_0_CORE.md`. The S00–S11 and V2/2.0/2.1
plans remain historical evidence only and are non-authoritative for protocol
3.0 wherever they conflict with that plan.

## Locked roles and routing

- Sole implementation/repair worker: Pi `deepseek-v4-flash`, Pi thinking level
  lowercase `max`, LCIM policy reasoning `MAX`.
- Sole reviewer: controller-owned Pi `openai-codex` / `gpt-5.6-sol`, reasoning
  `XHIGH`.
- No Pro MAX, Luna, Terra, optional fallback, model substitution or escalation
  ladder is permitted for LCIM 3.0.
- One credit is one actual upstream provider request, not one spawned process or
  logical call.
- Workers report status/evidence but never decide controller dispositions or
  invoke Sol/nested providers.

Every candidate receives deterministic validation and a complete
current-generation FINAL_REVIEW. Every actionable finding receives Flash
repair, a clean successor subject, deterministic validation, exact-finding
RECHECK, and a new complete FINAL_REVIEW; repeat until PASS. RECHECK cannot
approve a sprint, barrier, checkpoint, activation, delivery or release.
Actionable technical findings cannot become `STUCK`,
`PAUSED_TECHNICAL_NO_PROGRESS`, or deferred work.

A pause is allowed only with frozen cause-specific proof of
`BUDGET_EXHAUSTED`, `OPERATOR_INPUT_REQUIRED`,
`PROVIDER_CREDENTIAL_UNAVAILABLE`, `PROVIDER_TRANSPORT_UNAVAILABLE`,
`LOCAL_WORKTREE_CONFLICT`, or `INTEGRITY_QUARANTINE`.

## Proposed V8 development versus runtime policy

Master §§7–8 govern conditional future phases: independent procedure/scope
acceptance, applicable G3 and operator adoption; actually qualified external
tools and explicit finite authorization before isolated Bootstrap construction
(G1 reviews the actual constructed subject); current G1 plus separate operator
adoption/CAS before real Bootstrap; current applicable G1/G3, accepted procedure/
tools, per-task authorization and exact current immediate predecessor before
C30 development; full G2 after complete transitive integration and relevant
C30-14 closure, not C30-07 alone; all current applicable G1/G2/G3 and separate
operator authorization before activation/use. Candidate construction is real
implementation, not preparation. Nothing here adopts policy, qualifies tools or
authorizes construction. Do not require unfinished LCIM to build/review itself.

Standalone Bootstrap owns full verifier/support/schema/tool closure, immutable
outputs, registry/head/CAS initialization/recovery, source admission/currentness/
consumed handoffs and retained proof export before C30-01. C30-11 integrates
qualified support; C30-12 integrates consumers. Start locks before resolving
current predecessor, verifies exact proof/source, binds development facts rather
than runtime records, records external source-only admission, externally creates
checkout and rechecks launches/acceptance; registry CAS is separately authorized.
Prepare/verify preserve source/index/refs but write named external outputs.
Operator Git commit, registry publication and runtime COMMIT are distinct.

EXTERNAL_DEVELOPMENT_REVIEW requires independent Flash/Sol roles, locked routes,
immutable inputs/tools, scan/validation, complete coverage/zero findings and
repair → successor validation → exact RECHECK → complete FINAL_REVIEW, retained
safe results and qualified acceptance. It is eligible source-qualification input
to activation/delivery, never runtime Sol/finding/accounting/capability evidence.
U1–U5 in master §8.1 remain unresolved. Candidate tests use isolated synthetic
credentials/local mocks; external model requests need accepted tools/isolation
and finite enforceable upstream-request/spend controls, not stock Pi/session
counts. This manually requested Luna DOCUMENTATION edit is not authorization
for Luna as a runtime implementation worker; future source roles stay locked.

## Authority and safety

Bootstrap A0 is wholly read-only. It computes public `candidateSetDigest`
before activation identity, constructs the canonical transaction only after all
five candidate bytes, and then computes private `publicationBundleDigest`.
After controlling-TTY confirmation, C30-13 alone issues action-specific,
module-private transaction-zero authorities and, only for a stale committed
activation while capability is absent, successor-activation publication
authorities. Each binds publication kind, classified state/heads, one of
`INITIALIZE_WITNESS_JOURNAL`, `PERSIST_PREPARED_BUNDLE`,
`APPEND_WITNESS_PREPARE`, `PUBLISH_LEDGER_TRANSACTION`,
`APPEND_WITNESS_COMMIT`, `TRUNCATE_INCOMPLETE_FINAL_FRAME`,
`PERSIST_ABANDON_EVIDENCE` or `APPEND_WITNESS_ABANDON`, and one exact
byte digest; it authorizes one bounded logical publication mutation and is
consumed. Master §§2.5C/3.4C/4.5 enumerate all internal effects: initialization
is bootstrap genuine first creation only (never successor/history reset), and
ABANDON requires separate durable immutable evidence publication before its
separately confirmed append. Neither PREPARE nor ABANDON append writes the
header/evidence. No auxiliary lock-file, receipt or cleanup writer is implied;
retained evidence is never authority. The seventh amendment's master §2.3C
requires v2 private manifests with inline verified prepared-input capsules;
§2.3's fully populated staging fsync and §2.5D's complete anchor/ancestor chain
(including reused paths) govern durability. Visible packages require the same
confirmed persistence action's fsync-only completion after restart. Prepared
ABANDON inputs come from the persisted capsule, current inputs from a separate
verified observation. §§10–12 recorded fixtures/pins are historical where superseded; §13 tests V8.
The retained APPEND_ABSENT COMMIT branch requires APPEND_WITNESS_COMMIT,
integer observationVersion 3, commitBranch APPEND_ABSENT, LEDGER_WITHOUT_COMMIT and non-null closed
ledgerCommitPrerequisite (actual C30-03 physical path, complete positive safe
length/SHA), with both full existing ledger/witness path chains through U.
Non-COMMIT stays integer 2. Claim matching one-use C30-13 authority, pin/check
bytes/descriptors/name links, fsync exact ledger file and all containing
ancestors bottom-up through R/U, recheck facts/expiry before first witness byte,
then append/fsync exact COMMIT and full witness chain. Ledger effects are
fsync-only, repeated after earlier success; bundle completion gives no ledger
durability. Flush failure prevents COMMIT; exit requires fresh confirmation/
repetition; no duplicate COMMIT or ABANDON of matching ledger. Newly displayed
drift discards authority; already observed drift allows completion but denies
stale capability. Master §§2.5B/2.5D/2.7/4.5 control. G1/G2 remain pending;
G3 CHANGES_REQUIRED_PENDING_FRESH_REREVIEW; amendment is not approval.
V9 G3-V8-P1-01 explicitly adds commitBranch COMPLETE_EXACT_EXISTING in the
closed private version-3 union; non-COMMIT version 2 forbids both COMMIT members.
Complete matching COMMIT without exact session knowledge offers this fresh
C30-13 one-use fsync-only action before bundle/shared-ancestor/suffix flushes,
even with readable VISIBLE_VERIFIED bundle. Bind existing frame bytes/SHA,
PREPARE/prefix/suffix, ledger/tip, both chains, operation/kind/bundle/heads/facts/
expiry/branch; fsync ledger/full chain, recheck, then existing witness/full chain,
reverify/consume. ZERO bytes/records; no historical writer proof/prior durability
gates issuance, no missing-ledger reconstruction. Exit/change loses knowledge;
separate suffix truncation requires re-completion. Logical COMMITTED alone never
permits capability/successor: §2.5D's full remaining consumer rules still apply.
V9 SEQ-V8-P1-01 uses the single master §6.2 path after source change: external
review without stale capability, qualified prepare before staging, separately
authorized operator commit, verify, separately authorized registry CAS, exact
generation gate applicability/full G2 renewal for changed closure (G1/G3 when
changed), then separately authorized successor/durable/current/fresh-TTY use.
Changed verifier qualifies before first use; uncertain carry denies; S'' repeats
affected invalidation; resume exact commit/CAS without duplication. V8 independent
verdict remains CHANGES_REQUIRED, parent G3-V7-P1-01 not independently resolved.
§15 tests V9; no policy/tool/construction/runtime authorization is granted.
State is re-read and
reclassified before another instance. Restart loses all authorities and every
recovery mutation requires fresh TTY confirmation. C30-01 owns session/object-
construction semantics but does not publish or issue production authority.
C30-13 alone issues opaque in-memory `PRODUCTION_RUNTIME_CAPABILITY` after the
matching current activation transaction/witness COMMIT is durable. Initial
issuance retains the still-current original TTY facts; successor issuance
requires current-fact reverification/display and fresh TTY confirmation. Every
publication-authority instance permits one action and one mutation and cannot
grant capability; other pre-capability **runtime** operations are read-only.
The separate external development/source-administration boundary is master §2.7. A stale
committed activation returns to current authority through exactly four ordered
successor candidates (budget, session, plan, activation), no genesis, without
using production authority to create itself.

Workers never commit, push, merge, open PRs, modify credentials or shell
profiles, mutate remotes, publish, or perform remote delivery. Work in the
explicit worktree/base and obey sprint-owned file scope.

Never commit secrets, credentials, `.env*`, raw model transcripts, review
packets, runtime evidence, or target-repository evidence. Runtime state belongs
outside tracked source. Cross-sprint interface changes require an ICR.

Every completion report lists changed files, tests/commands/results,
acceptance status, unresolved nontechnical pauses, ICRs, and confirms no
commit/push/PR or secret/runtime-evidence publication.
