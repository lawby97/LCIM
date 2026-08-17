# Sprint 11 / V2.0.1 SOL transport repair — sixth Sol XHIGH review completion report

**Branch:** `codex/v2.0.1-sol-xhigh-oauth`

**Base HEAD:** `e4dda2ea813169635f79ff727ccecff3a056357d`

**Candidate:** `2.0.1`
**Status:** ready for the seventh Sol XHIGH review; not committed or published

## Scope simplification (sixth-review mandate)

**ALL write-back / reconciliation of refreshed openai-codex credentials
into the user's real Pi auth store was REMOVED.** For 2.0.1 the real Pi
auth store is READ-ONLY input authority:

1. read the provider-scoped `openai-codex` entry from the real store;
2. copy it into the controller-owned run-scoped isolated auth surface
   (marker-before-credentials; every new ancestor directory created and
   fsynced before the marker file; marker file + parent fsynced; only
   then the isolated `auth.json`);
3. every SOL invocation of the run reuses that same isolated store;
4. Pi may refresh/rotate credentials inside that run-scoped store;
5. later `SOL_RECHECK` calls in the same run use the refreshed isolated
   state (within-run continuity);
6. at run cleanup the isolated credential surface is deleted;
7. a refreshed token is NEVER written back — `reconcileCodexSolStoreRefresh`
   and the whole `auth.json.lock` write path on the real store were
   deleted (the API no longer exists);
8. a later run that cannot authenticate with the real source credential
   fails closed with an explicit `CODEX_OAUTH_UNAVAILABLE` +
   RE-AUTHENTICATION REQUIRED instruction (`pi /login` selecting ChatGPT
   Plus/Pro Codex, or `pi auth print-bearer-token --provider
   openai-codex`);
9. no LCIM execution path mutates real Pi credentials — the store keeps
   an acquisition snapshot (canonical path, inode, byte SHA-256) and
   `verifyRealAuthSourceUnchanged()` proves byte-identical state at run
   end (an external concurrent Pi refresh is reported, never repaired).

Cross-run OAuth refresh persistence is intentionally deferred to a future
separately reviewed feature.

## Sixth-review findings — resolution summary

- **A. Owner-verified cross-process locking.** The stealable 60-second
  mtime directory lock was replaced by a persistent append-only owner
  queue. Each contender appends one immutable `ACQUIRE` record
  `{ pid, nonce, processStartedAt }` using one `O_APPEND` write+fsync and
  enters only after every earlier owner either appended its own matching
  `RELEASE` or is verifiably dead (`ESRCH` or canonical-`ps` start-epoch
  mismatch). No owner or stale observer deletes/replaces lock state, so a
  delayed old owner cannot delete a successor. Torn/malformed or otherwise
  unverifiable state fails closed. The unified outer lifecycle mutex holds
  this cross-process lock for creation, registration, invocation/store
  removal, sweep, finalize, abort and recover terminalization (and ledger
  appends use it directly). Same-process and real multi-process races are
  tested.
- **B. Process-table seams are one-shot, run-bound, permanently
  non-authoritative.** Raw process tables were removed from production
  `runController` and finalize/abort/recover APIs. A table can exist only
  inside an opaque node:test capability; `claimSolTestProcessTable`
  snapshots it once and seals its identity to one exact run ID. Reuse or
  rebinding is refused. The authoritative terminal transition always
  repeats process absence with canonical inspection, never the test table.
- **C. Credential scanning exposes COMPLETE/INCOMPLETE.** Every search/
  view bound (canonical view budget, subsequence text/state bounds,
  interleaving text/state/secret/view-pair bounds, base64/hex/bytewise/numeric run caps,
  parsed-join budget) yields `scanState: 'INCOMPLETE'` with recorded
  reasons; the caller fails closed (`SOL_CREDENTIAL_SCAN_INCOMPLETE`,
  `credentialScanPassed` never true for incomplete analysis) — "not
  detected" is never returned for an incomplete analysis. New
  reconstructions: independently padded per-byte/per-chunk base64/
  base64url, numeric byte arrays, punctuated hex (`0x61,0x62`, `61-62`,
  `61:62`), nested encodings, ordered fragments across fields/streams,
  and the interleaving secret bound raised to 4096 chars (real
  openai-codex refresh tokens are long). Every incomplete limit is
  tested.
- **D. Marker durability.** Every NEW ancestor directory is created
  top-down and both it and its containing parent are fsynced immediately
  BEFORE the marker file; the marker file is fsynced
  (writeDurableMarker) and its parent is fsynced; only then may the
  isolated auth/model-store creation proceed. Source-order + behavioral
  tests.
- **E. Transport proof ordering.** The immutable exact-invocation
  TRANSPORT_PROOF record is persisted AND fsynced BEFORE provider output
  is parsed; the evidence writer validates that `gatePassed` implies every
  individual proof (inconsistent claims refused); a separate
  SEMANTIC_ACCEPTANCE record is persisted after successful parsing and
  SOL compilation (referencing the transport proof, recording
  finalAcceptance, semanticAccepted, raw + canonical scan states and
  reasons); evidence persistence failure fails every transport closed.
  Rejected/malformed output cannot create a semantic-acceptance record.
  Proof-before-parse is tested behaviorally and by source order.
- **F. Unknown state stays UNKNOWN.** Unreadable process tables and
  marker sweeps serialize UNKNOWN as `null`, never `[]` (supervisor
  evidence, `terminateProcessesByMarker`, sweep failures) and fail
  closed.
- **G. Preserved behavior.** 2.1 production SOL is Codex-only
  (openai-codex / gpt-5.6-sol / XHIGH for all four SOL roles); 2.0
  schema/evidence immutable; adjacentCriticalDefects remain
  authoritative; FINAL_REVIEW → DeepSeek repair → exact SOL_RECHECK;
  exact Pi 0.84.1 empty 0600 models-store support; DeepSeek BROKER_ONLY;
  validation DENY_ALL.

## Files changed

- `src/logging/io.mjs` — owner-verified append-only cross-process lock
  queue (`ACQUIRE`/`RELEASE`, pid start-identity, no shared-state deletion,
  UNKNOWN/torn-state fail closure; injectable timeouts for tests).
- `src/controller/sol-transport.mjs` — removed the entire refresh
  write-back/reconciliation path (`reconcileCodexSolStoreRefresh`, the
  real-store `auth.json.lock` protocol, `markRefreshAccepted`/
  `markRefreshRejected`/`reconciliationState`); real store is read-only
  with acquisition snapshot + `verifyRealAuthSourceUnchanged()`;
  scanner COMPLETE/INCOMPLETE + reasons + new encodings (per-byte padded
  base64/base64url, numeric byte arrays, punctuated hex) + plausible-text
  view filtering + linear run-bound detection (no regex stack
  exhaustion); marker ancestor durability (`mkdirParentsFsynced`);
  transport-proof writer validates gatePassed⇒proofs, fsyncs, records
  phase + raw scan state; new `persistSolSemanticAcceptance`.
- `src/controller/orchestrator.mjs` — transport proof persisted + fsynced
  BEFORE parse (fail closed authoritative); semantic-acceptance record
  after compilation; INCOMPLETE scans fail closed
  (`SOL_CREDENTIAL_SCAN_INCOMPLETE`); removed reconcile + markRefresh
  call sites; real-auth read-only verification event at run end;
  sealed one-shot run-bound process-table claim.
- `src/controller/test-seams.mjs` — opaque process-table capture plus
  `claimSolTestProcessTable` (one-shot and exact-run-bound).
- `src/providers/oauth.mjs` — RE-AUTHENTICATION REQUIRED instruction on
  the unavailable path.
- `src/runtime/run-store.mjs` — finalize/abort reject caller process
  inspection and use the unified cross-process lifecycle lock.
- Tests — new `tests/unit/owner-lock.test.mjs`; rewritten
  `tests/unit/oauth-reconciliation-hardening.test.mjs` (read-only
  guarantees, byte-identical before/after, next-run stale credential);
  extended `tests/unit/fifth-review-hardening.test.mjs` (scan
  COMPLETE/INCOMPLETE limits, per-byte base64/base64url, numeric byte
  arrays, punctuated hex, nested encodings, marker ancestor durability,
  proof-before-parse); extended `tests/unit/codex-transport.test.mjs`
  (read-only authoritative store, no reconciliation API);
  `tests/integration/s10-r8-codex-oauth.test.mjs` (evidence split
  TRANSPORT_PROOF/SEMANTIC_ACCEPTANCE, real-auth byte-identical
  assertions, incomplete-scan evidence states, real authentication-failure
  re-auth instruction without source-store mutation);
  `tests/integration/terminal-sol-transport-gate.test.mjs` (one-shot
  seam reuse refusal); `tests/e2e/release-workflow.test.mjs` +
  `tests/fault-injection/matrix.test.mjs` (fixture OAuth stores — tests
  never depend on the machine's real Pi credentials);
  `tests/integration/codex-seam.mjs` (`snapshotRealAuthBytes` helper).
- Docs — `README.md`, `docs/v2-codex-sol-oauth.md`,
  `docs/v2-security-boundaries.md`,
  `docs/v2-sprints/interface-change-requests/ICR-2026-002-route-decision-sol-codex.md`,
  this report.

No shared contract under `src/shared/**` or `schemas/common/**` was
changed.

## Verification

| Command | Exact result |
|---|---:|
| `npm ci --dry-run --ignore-scripts` | **PASS** |
| `npm run test:unit` | **171 passed, 0 failed** |
| `npm run test:guards` | **6 passed, 0 failed** |
| `npm run test:smoke` | **9 passed, 0 failed** |
| `npm run test:integration` | **104 passed, 0 failed** |
| `npm test` | **1156 passed, 0 failed** |
| `git diff --check` | **PASS** |

Sixth-review required coverage (all added and passing):

- lock stale-owner/successor races (dead owner, pid reuse, live owner,
  torn/UNKNOWN queue, delayed stale release, same-process and real
  multi-process serialization);
- process-table seam reuse across runs refused (one-shot, run-bound);
- all incomplete scan limits (view/subsequence text+state/interleaving
  text+state+secret+view-pair/base64 run/bytewise/hex/numeric/join)
  reported INCOMPLETE;
- per-byte padded base64/base64url; numeric byte arrays; punctuated hex;
  nested encodings; ordered fragments across fields/streams;
- marker ancestor durability (create+fsync before marker before
  credentials);
- proof persistence BEFORE parse (transport proof + semantic acceptance
  split; gatePassed⇒proofs validation);
- real Pi auth store byte-identical before/after every LCIM test path;
- within-run refreshed credential continuity (no write-back);
- next-run stale/invalid credential fails closed without modifying auth.

## Acceptance status

- Real Pi auth store is read-only input authority; write-back removed;
  re-auth instruction on failure; byte-identical proven: **PASS**.
- Owner-verified cross-process locking replaces the stealable lock:
  **PASS**.
- Process-table seams one-shot, run-bound, permanently
  non-authoritative: **PASS**.
- Credential scan COMPLETE/INCOMPLETE with fail-closed semantics and all
  new encodings: **PASS**.
- Marker ancestor durability: **PASS**.
- Transport proof persisted+fsynced before parse; semantic acceptance
  record after compile; gatePassed⇒proofs validated: **PASS**.
- UNKNOWN never serialized as []: **PASS**.
- All preserved behavior (Codex-only 2.1, 2.0 immutability, adjacent
  defects, repair→recheck, models-store, BROKER_ONLY, DENY_ALL): **PASS**.

## Unresolved issues / assumptions

- Live ChatGPT OAuth/API execution was not exercised; all provider tests
  use non-authoritative local fixtures with fixture OAuth stores (the
  machine's real Pi auth store is never read or modified by tests).
- The interleaving search is bounded (4096-char secrets, 256KB text,
  200K states); reaching a bound is INCOMPLETE and fails closed.

## Interface changes and safety confirmation

- ICR-2026-002 updated (read-only real store note).
- No credentials, `.env` files, raw model transcripts, review payloads,
  target-repository evidence, or runtime artifacts were added to source.
- No commit, push, merge, PR, tag, release, npm publication, credential
  modification, or shell-profile modification was performed.
- No real OAuth live transport was run.
