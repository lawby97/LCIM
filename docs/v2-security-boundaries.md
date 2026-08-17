# LCIM V2 Security Boundaries (Sprint 00, final stable-release reference)

The `2.0.0` release gates exercise these boundaries end to end. The
consolidated final architecture is [`v2-final-architecture.md`](v2-final-architecture.md).
`2.0.1` adds the automatic GPT-5.6 Sol codex SOL channel through a
**controller-side** Pi transport; see
[`v2-codex-sol-oauth.md`](v2-codex-sol-oauth.md).

This document fixes the public-safe boundary for the LCIM repository and the
external-provider boundaries for later sprints. The GitHub LCIM repository is
**public-safe**: nothing sensitive or runtime-local may ever be tracked there.

## 1. Public-safe repository

Never commit to the LCIM repository (this repo):

- API keys, tokens, secrets of any kind; Codex/ChatGPT/DeepSeek credentials;
- `.env` / `.env.*` files (a tracked `.env.example` is the only allow-listed
  exception);
- raw model transcripts (any `*.transcript.*`);
- review ZIPs/packets and review exports;
- local escalation records and SOL payloads;
- target-repo evidence (diffs, test logs, business-repository source excerpts);
- runtime logs / run state (canonical root: `<git-common-dir>/lcim`).

## 2. Runtime boundary

- Runtime state belongs under the **target repository's Git common
  directory**: `<git-common-dir>/lcim` (`src/config/runtime-path.mjs`).
- The Git common directory is never part of the tracked working tree, and
  linked worktrees share one store.
- `assertNoTrackedFilesUnder()` fails closed if tracked files ever appear
  under a runtime path; the ignore guards (`tests/guards/`) prove forbidden
  artifact classes are ignored even if someone writes them into the source
  tree by mistake.

## 3. Guard rails implemented at Sprint 00

- `.gitignore` baseline covering credentials, `.env*`, transcripts, review
  ZIPs/packets, escalation records, SOL payloads, target-repo evidence,
  runtime logs, and run-state names (pattern classes asserted by
  `tests/guards/ignore-guards.test.mjs`).
- Behavioral guard: a fresh git repo seeded with forbidden files shows
  `git status --porcelain` empty before and after `git add -A`, and every
  file matches `git check-ignore`.
- Tracked-tree scan (`tests/guards/public-safe.test.mjs`): every tracked file
  is checked against the forbidden-name rules; zero violations.
- Error records (`lcim.common.error` schema) carry only public-safe
  code/message/details — never credentials, transcripts, or raw model output.

## 4. External-provider boundaries (later sprints; fixed policy now)

- Permission gates are required before any external provider is called
  (Sprint 03+); no automatic provider invocation.
- Denied-path / secret filtering and exact model discovery fail closed rather
  than silently substituting models (Sprint 03/05).
- ChatGPT SOL Pro is **manual and TEXT ONLY**: no repository file, Markdown
  file, log, patch, ZIP, JSON packet, or other artifact may be uploaded
  (Sprint 07 owns the transport).
- SOL is a bounded decision engine: one primary question, explicit pass/fail
  conditions, bounded evidence, out-of-scope limits, exact response contract
  (Sprint 06). No generic reviews.
- Hard budgets with stop/fail states; no silent budget overrun (Sprint 05).

### 4.1 V2.0.1: the GPT-5.6 Sol codex channel is a controller-side transport, not a sandbox mode

The automatic GPT-5.6 Sol channel (`gpt-5.6-sol`) runs Pi's NATIVE
`openai-codex` provider as a **trusted controller-side provider client**
(the same trust domain as the controller-owned provider broker). It is
NEVER placed inside the DeepSeek worker execution boundary, and there is
no `CODEX_OAUTH` Seatbelt mode — the boundary's network modes are exactly
the 2.0.0 pair (`DENY_ALL`, `BROKER_ONLY`); a stale `codexOAuth: true`
option is refused loudly.

The controller-side invocation is pinned as follows (full detail in
`docs/v2-codex-sol-oauth.md`):

- PROVENANCE: the Pi entrypoint comes ONLY from LCIM's own pinned
  dependency tree — dependency-resolved from the controller package
  (`import.meta.resolve`), verified against the reviewed exact lockfile
  closure, or the capability-gated fixture seam (node:test only). The
  legacy `LCIM_SOL_PI_CLI` override and arbitrary canonical-looking
  layouts are explicitly REJECTED. **`npm`, `which`, inherited PATH and
  repository configuration are never used** — a PATH-shadowed npm/pi or
  a fake canonical-looking package in a PATH-controlled location can
  never receive the isolated OAuth credential;
- IDENTITY PINNING: node + Pi CLI are realpath'd and pinned by stat
  identity plus SHA-256, re-verified immediately before every spawn and
  after exit (verify→replace races, symlink/package/layout substitution
  and same-size in-place rewrites fail closed);
- controller-owned empty working directory (never the target repository);
- strict environment allowlist: proxy variables (`HTTP_PROXY`,
  `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY` + lowercase), custom trust roots
  (`NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`, `SSL_CERT_DIR`), `NODE_OPTIONS`,
  every un-pinned `PI_*` variable, and the credential-shaped family are
  stripped by construction;
- repository/user Pi resources excluded: `--no-approve`,
  `--no-context-files`, `--no-extensions`, `--no-skills`,
  `--no-prompt-templates`, `--no-tools`, `--no-session`, `--print`, and a
  controller-pinned `--system-prompt`;
- RUN-SCOPED isolated `PI_CODING_AGENT_DIR` (`<runDir>/controller/
  sol-transport/store/agent`) containing ONLY `auth.json` (mode 0600)
  with ONLY the `openai-codex` oauth entry — no `models.json`/
  `settings.json`/`SYSTEM.md`/extensions/skills/templates/sessions. The
  ONE exception is the exact verified Pi 0.84.1 offline startup surface:
  real Pi creates `models-store.json` (mode 0600, content exactly `{}`),
  which inspection permits ONLY in that exact shape and fails closed on
  any non-empty/authority-bearing content (`models-store-invalid`). The
  directory is writable by Pi so Pi's own OAuth refresh works (lock file
  + token rewrite) and rotation persists across the run's sequential SOL
  invocations. The real Pi auth store is READ-ONLY INPUT AUTHORITY
  (sixth-review scope simplification): LCIM copies the provider-scoped
  `openai-codex` entry in, observes refresh ONLY inside the isolated
  store (within-run continuity), deletes the isolated surface at cleanup,
  and NEVER writes a refreshed token back — the write-back/reconciliation
  path was removed entirely; a later run with a missing/corrupt/stale
  real credential fails closed with an explicit RE-AUTHENTICATION
  REQUIRED instruction (`pi /login`), and the real store is proven
  byte-identical via `verifyRealAuthSourceUnchanged()`;
- the SOL model receives ONLY the compiled Sprint-06 ask, zero tools, and
  no repository context;
- `sol.command` (repository configuration) has NO SOL decision authority
  (`SOL_COMMAND_MASQUERADE` fails closed at routing); the CLASSIC
  `sol-xhigh` channel has NO production authority in 2.1 at all — every
  automatic SOL role is EXACTLY openai-codex / gpt-5.6-sol / XHIGH
  through the strict Codex transport gate
  (`SOL_CHANNEL_CLASSIC_NO_AUTHORITY` fails closed when the legacy
  endpoint is configured; the classic execution branch is structurally
  refused). The classic route survives only as immutable 2.0.0 historical
  semantics for old-record validation. Test fixtures run only through
  capability-gated, NON-AUTHORITATIVE controller-internal seams
  (`runController({ solCommand | solTransportOptions,
  processSupervisorOptions.processTable, testCapability })`) that can
  never produce REVIEW_APPROVED;
- credential canary: any credential byte — raw, JSON/unicode-escaped
  (including MIXED raw + `\u00XX` sequences), base64/base64url (including
  per-chunk and cross-field fragments), hex (including `0x`-prefixed and
  mixed-case), URL-encoded, interleaved across parsed fields, alternating
  between stdout/stderr, fragmented, short, or refreshed/rotated — in
  provider output (raw bytes, ordered channel fragments, or parsed
  canonical values) fails the invocation closed
  (`TRANSPORT_CREDENTIAL_LEAK`) with nothing persisted and no byte ever
  echoed; raw codex stdout/stderr is never persisted. The canonical
  scanning layer recursively normalizes reversible representations BEFORE
  matching (unicode-unescape, URL-decode, base64/hex reconstruction,
  bounded-gap ordered subsequence, and a bounded two-stream interleaving
  search for alternating channel pieces), without inserting field names
  or artificial gaps, and the benign-output corpus must keep passing;
- transport acceptance gate: status 0, no error, no timeout, completion,
  no truncation, quiescence, identity and cleanup checks all required
  before any response may be compiled;
- crash-resilient cleanup: removal is marked only after observed success,
  cleanup failure fails closed, stale surfaces are marker-recognizable
  and swept by `recover`/startup reconciliation (orphaned Pi processes
  terminated by invocation marker). The durable STORE marker lives
  OUTSIDE the credential subtree (`markers/<runId>.json`) and cleanup
  order is: process absence → subtree removal → fsync parent + verify
  absence → ONLY THEN marker removal → fsync marker parent, so a crash at
  any transition leaves the marker for recovery (every transition is
  crash-simulated in tests);
- atomic transport lifecycle (sixth-review rule): transport surface
  creation/acquisition, marked transport registration, store removal,
  finalize, abort, recovery terminalization, and cleanup/sweep are
  serialized under ONE authoritative per-run lifecycle lock (an in-process
  reentrant mutex PLUS an OWNER-VERIFIED cross-process run-dir lock);
  creation additionally requires the authoritative run.json to be OPEN,
  so a run can never transition terminal while a new marked transport
  surface appears concurrently (create-vs-finalize/abort/recover races are
  tested). The cross-process lock is an append-only owner queue: each
  contender appends an immutable `ACQUIRE { pid, nonce,
  processStartedAt }` and waits for every earlier owner to append its own
  matching `RELEASE` or become verifiably dead. No owner or stale observer
  deletes/replaces shared state, so an old owner cannot delete a successor;
  torn/malformed/unverifiable state fails closed — the stealable 60-second
  mtime lock and ownerless-delete race were removed;
- no caller-supplied process table can prove production process absence:
  raw `processTable` input is absent from production run/finalize/abort/
  recover APIs. A node:test table is captured only inside an opaque
  capability, snapshotted once, and sealed to one exact run ID; reuse and
  rebinding are refused and the run stays permanently non-authoritative.
  The authoritative terminal transition always repeats canonical process
  inspection, and an unreadable process table is UNKNOWN (never an empty
  survivor list; UNKNOWN never serializes as []);
- fail-closed proof evidence (sixth-review ordering): the immutable
  exact-invocation TRANSPORT_PROOF record is persisted AND fsynced BEFORE
  provider output is parsed; the evidence writer validates that a
  gatePassed claim implies every individual proof (inconsistent claims
  are refused); a separate SEMANTIC_ACCEPTANCE record is persisted after
  successful parsing and SOL compilation (referencing the transport
  proof, recording finalAcceptance + canonical scan state); evidence
  persistence failure fails every transport closed
  (`SOL_TRANSPORT_EVIDENCE_FAILED`), and rejected output cannot create a
  semantic-acceptance binding;
- credential scan completeness (sixth-review rule): every search/view
  bound reached (canonical view budget, subsequence text/state bounds,
  interleaving text/state/secret/view-pair bounds, base64/hex/bytewise/
  numeric run caps, parsed-join
  budget) yields an explicit scanState INCOMPLETE with recorded reasons —
  the caller fails closed (`SOL_CREDENTIAL_SCAN_INCOMPLETE`) and
  `credentialScanPassed` is never true for an incomplete analysis; "not
  detected" is never returned for an incomplete analysis; new
  reconstructions: independently padded per-byte/per-chunk base64/
  base64url, numeric byte arrays, punctuated hex, and nested encodings;
- marker durability (sixth-review rule): every NEW ancestor directory is
  created top-down and both it and its containing parent are fsynced
  immediately BEFORE the marker file; the marker file
  itself is fsynced and its parent is fsynced; only then may the isolated
  auth/model-store creation proceed (marker-ancestor durability tested);
- adjacentCriticalDefects are authoritative open defect records (stable
  deterministic identity, evidence + locked-requirement binding,
  repair-bound, exactly rechecked, explicitly resolved or left
  open/STUCK); completion/REVIEW_APPROVED is forbidden while ANY
  accepted adjacent critical defect remains open;
- observed evidence: post-exit agent-dir layout/modes, identity
  verification, sanitized argv and prompt digest are recorded — never
  asserted facts.

DeepSeek worker invocations remain `BROKER_ONLY` (loopback broker pin
only) and validation remains `DENY_ALL` — exactly as in 2.0.0.

## 5. Credentials policy

- LCIM stores no credentials. Configuration referencing providers must use
  environment-provided secrets outside this repository; `.env*` files are
  ignored and never tracked.
- Workers never modify credentials or shell profiles.
- V2.0.1: the codex SOL channel's credential is **Pi-owned** (Pi's
  `openai-codex` OAuth store), and the real Pi auth store is READ-ONLY
  INPUT AUTHORITY (sixth-review scope simplification). LCIM never
  persists credential bytes outside the run-scoped isolated `auth.json`
  (mode 0600, removed with observed-success semantics), never reports
  token material — only availability facts (`CODEX_OAUTH_UNAVAILABLE`
  with an explicit RE-AUTHENTICATION REQUIRED instruction) and a
  byte-free leak outcome (`TRANSPORT_CREDENTIAL_LEAK`). When Pi rotates
  the credential inside the isolated surface, the refresh is used ONLY
  for within-run continuity (later SOL_RECHECK calls); it is NEVER
  written back — cross-run refresh persistence is deferred to a future
  separately reviewed feature, and every LCIM test path proves the real
  store byte-identical before/after.
