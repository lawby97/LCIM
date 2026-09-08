# C30-07 — Sol Transport V3, core profiles and request accounting

**Development gate:** master §§7–8 phases A–D: accepted external procedure/tools,
current applicable G1/G3, exact per-task authorization, accepted Bootstrap and
current immediate predecessor. G2 follows complete integrated implementation;
activation/use requires phase F, all current applicable G1/G2/G3 and separate
operator authorization. None is granted here. Component runtime prerequisites
below are not prerequisites to constructing their own code in isolated fixtures.

**Status:** `SOL_TRANSPORT_V3_INDEPENDENT_SECURITY_REVIEW_PENDING`;
`IMPLEMENTATION_PENDING`.

**Depends on:** C30-06 verified successor source generation.

**Next:** `SPRINT_30_08_FINDING_TRANSACTIONS.md`.

## New authority boundary

Sol Transport V3 changes executable-entry identity, loader allowlist,
immutable source manifest, stdin ask, FD-3 ownership, request-dispatch
authority, OAuth/model egress interception and process teardown. The first
authoritative V3 invocation and first authoritative C30 Sol call require the
dedicated independent security review **of the complete final integrated
subject**. C30-07 alone cannot supply full G2: actual transitive dependencies
must exist, C30-13 integration is the earliest possible complete source point,
and relevant C30-14 packaging/closure changes belong in the final subject.
Schedule G2 after complete integration (master §7 phase E). Design/prototype/
mock assertions alone are not approval. Source review during construction is
EXTERNAL_DEVELOPMENT_REVIEW under qualified external tools and master §7.3,
not an authoritative runtime Sol call and not dependent on production capability.

The V4 signer stopping rule is accepted. C30-07 has no cryptographic signer,
signed plan/budget/runtime authorization, signer IPC, Keychain dependency or
strong same-UID executable-attestation claim. Every production Sol dispatch
requires the actual in-memory `PRODUCTION_RUNTIME_CAPABILITY` issued solely by
C30-13; C30-01 confirmation/session evidence is not dispatch authority.

## Required V3 command and demonstrated API

The sealed command is:

```text
<pinned-node> --require <guard> --experimental-loader <loader> \
  <sealed-controller-sol-agent-entry.mjs>
```

The demonstrated API shape is `openaiCodexProvider()`,
`ModelRuntime.registerNativeProvider(wrappedNative)`, native `stream`/
`streamSimple` delegation and a custom `fetch` that reserves immediately
before actual dispatch, binds the exact body, emits controlled evidence,
forces SSE and `maxRetries: 0`, and rejects malformed/transient output without
internal retry.

## Shared FD-3 boundary

The controller creates one inherited full-duplex anonymous pipe on child FD 3.
Only controller and direct sealed child own the endpoints; the channel key is
delivered only over FD 3. It is `ACCOUNTING_AUTHORITY_ONLY`, never a provider
credential/OAuth/bearer FD or direct ledger/budget access. The broker verifies
run/invocation/session/model/ordinal/request/body bindings and durably records
`DISPATCH_STARTED` before the upstream socket. Crash settlement remains
`NEVER_CHARGEABLE`, `POSSIBLY_CHARGEABLE` or `DEFINITELY_CHARGEABLE`.

## Profiles and call matrix

| Call | Profile | Result |
|---|---|---|
| `SOL_CONTRACT_CHECK` | `CORE_CONTRACT` | sufficient/amendments |
| `SOL_DIAGNOSE` | `SPRINT_CANDIDATE` or `DEPENDENCY_BARRIER` | cause/unresolved |
| `SOL_RECHECK` | exact inherited profile | resolved/not resolved |
| `SOL_FINAL_REVIEW` | candidate/barrier profile | PASS/FAIL |

Asks bind implementation intent, current subject, scan-PASS patch,
deterministic validation, semantic contract, profile and closed evidence
universe. Repairs bind origin/successor generations, repair intent, successor
artifacts and exact inherited profile. RECHECK names exact supplied finding IDs
and never approves a stage.

Coverage pages and response contracts retain bounded page chains, complete
current-generation coverage, immutable proposal indices, exact prior-open
sets, explicit `UNTOUCHED_NOT_REVIEWED` and separate new proposals. Malformed,
duplicated, omitted or incomplete response data rejects atomically.

## Owned families

| Family | First emitter | Consumers |
|---|---|---|
| `lcim.sol-transport-v3-manifest@1` | sealed-entry preparation | review/transport |
| `lcim.sol-core-profile@3` | profile freeze | ask compiler |
| `lcim.sol-core-ask@3` | controller compiler | V3 adapter |
| `lcim.sol-core-response@3` | response compiler | findings/repair |
| `lcim.sol-core-coverage@1` | page aggregator | checkpoint/barrier |
| `lcim.sol-transport-proof@2` | cleanup/security proof | response/audit |

## Acceptance and recovery

Cover exact V3 entry/loader/source identity, stdin ask, FD-3 ownership and
reopen denial, native provider registration, body-bound reserve-before-fetch,
SSE/no-retry, no tools/extensions/context/session surfaces, credential scans,
dispatch ordering, crash settlement, cleanup and retained-mechanism review.
Any authority/source/manifest change invalidates V3 evidence.

## Preserved orchestration and implementation prompt

Pi deepseek-v4-flash (thinking "max", LCIM reasoning MAX) remains the sole implementation/repair worker; Pi openai-codex gpt-5.6-sol XHIGH is
controller-owned; validation precedes RECHECK and FINAL_REVIEW; repair repeats
until zero open findings. Implement only V3 profiles/transport/accounting and
cleanup. Do not implement findings, repair, checkpoints, activation or release.
Do not make a real provider request, access credentials or Keychain. Return
files/tests/commands/results/acceptance/unresolved issues/ICRs; do not commit.

## Normative Start/dependency gate

The common development Start contract is master §7.4, incorporated in full.
Predecessor: `C30-06`. Check procedure/current applicable G1/G3,
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
