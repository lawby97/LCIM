# LCIM V2.0.1 — automatic GPT-5.6 Sol XHIGH review: controller-side Pi openai-codex transport

Status: implemented for `2.0.1` on branch `codex/v2.0.1-sol-xhigh-oauth`.

This feature adds an **automatic** SOL channel — GPT-5.6 Sol (`gpt-5.6-sol`)
at XHIGH through Pi's `openai-codex` provider, authenticated with Pi's
existing OAuth store (`~/.pi/agent/auth.json`).

## 1. Transport architecture (V2.0.1 repair)

Pi is a **trusted CONTROLLER-SIDE provider client for SOL only**. The
openai-codex Pi process is spawned by the controller directly — the same
trust domain as the controller-owned provider broker — and is **never**
placed inside the DeepSeek worker execution boundary. There is no
`CODEX_OAUTH` Seatbelt mode: the worker boundary is byte-for-byte the
2.0.0 boundary (`DENY_ALL` for local/validation, `BROKER_ONLY` for
external DeepSeek), and DeepSeek/validation security is unchanged.

```text
DeepSeek Flash XHIGH            -> controller validation
   -> SOL_CONTRACT_CHECK / SOL_DIAGNOSE / SOL_FINAL_REVIEW / SOL_RECHECK
   -> CONTROLLER-SIDE Pi (openai-codex, gpt-5.6-sol, xhigh)   [this doc]
   -> bounded repair/finding -> back to DeepSeek -> Sol recheck when required
```

The controller-side invocation pins every surface the SOL model or Pi
could otherwise influence:

| Surface | Pin |
|---|---|
| Provenance (SOL-S11-001) | Production Pi comes **only** from LCIM's own exact dependency `@earendil-works/pi-coding-agent@0.84.1`, resolved from the controller module tree and verified against `package-lock.json` version and integrity. `LCIM_SOL_PI_CLI`, PATH, `npm`, `which`, repository configuration, target-tree `PI_CODING_AGENT_DIR` overrides, and arbitrary canonical-looking package layouts are rejected. The only alternative is the explicit node:test fixture seam (`piBin`, opaque consumed authority, non-authoritative). |
| Identity pinning | `process.execPath`, the Pi CLI, reviewed package metadata/exports, exact lockfile manifest, and every closure file (`relative path`, `size`, SHA-256) are pinned. LCIM copies that manifest into a controller-owned read-only execution surface and executes **that copy only** through pinned ESM and CommonJS resolution guards that reject resolutions outside copied `node_modules`. Extra/missing/transitive files, target-ancestor modules, symlink/package/layout substitution, or same-size rewrite fail closed. |
| Working directory | A fresh controller-owned empty directory under the run store (`<runDir>/controller/sol-transport/invocations/<invocationId>/cwd`), never the target repository or a worktree. |
| Environment | Strict allowlist (see §3). No inherited `process.env`. |
| Pi config surface | RUN-SCOPED isolated `PI_CODING_AGENT_DIR` (`<runDir>/controller/sol-transport/store/agent`) containing ONLY `auth.json` (mode 0600) with ONLY the `openai-codex` oauth entry (§4) — plus, at most, the EXACT verified Pi 0.84.1 offline startup surface `models-store.json` (regular file, mode 0600, content exactly `{}`, no extra keys; anything else fails closed). No `models.json`, no `settings.json`, no `SYSTEM.md`/`APPEND_SYSTEM.md`, no extensions/skills/prompt-templates/sessions. |
| Model surface | `--print --no-session --no-context-files --no-extensions --no-skills --no-prompt-templates --no-tools --no-approve` — the SOL model has zero tools and no repository/user context. |
| System prompt | Controller loads the pinned `prompts/sol/system.system.md` text from the LCIM package and supplies it only through Pi's supported `--system-prompt` mechanism; argv evidence records its digest, never its text. |
| Prompt content | ONLY the compiled Sprint-06 SOL ask (the same ask compiler as the classic channel). Generic prompts are refused. |
| Credential scope | Token bytes exist only as in-memory trusted transport state and in the isolated `auth.json`; the surface is removed with observed-success semantics (§5, §7). |

## 2. Channel selection and routing (2.0.1 repair)

Routing resolves the SOL channel from the routing config endpoints
(`src/providers/capabilities/discovery.mjs` → `resolveSolChannel`):

- only `sol-xhigh` configured → classic channel (unchanged behaviour);
- only `gpt-5.6-sol` configured → codex channel;
- neither → `FAIL_NO_SUBSTITUTE` / `PROVIDER_UNAVAILABLE` (as today);
- **both** configured → fail closed with `SOL_CHANNEL_AMBIGUOUS` (a
  `RoutingError`; no route record is produced).

The codex channel additionally requires the **controller-owned OAuth
availability fact** (`src/providers/oauth.mjs`): the real Pi agent
directory (`PI_CODING_AGENT_DIR` or `~/.pi/agent`) must contain a readable
`auth.json` with an `openai-codex` entry of type `oauth` carrying an access
token. Missing/unusable store fails closed with `FAIL_NO_SUBSTITUTE` /
`CODEX_OAUTH_UNAVAILABLE` before any spawn. Only existence/type/expiry
facts are derived at routing time — never token material.

Every automatic codex SOL decision first resolves exact
`discoverSolCodexRoute` (provider channel `pi`, model `gpt-5.6-sol`, XHIGH,
role) — no silent substitute, no downgrade, mirroring SOL-S05-003.

### sol.command has NO SOL decision authority (SOL-S11-002)

A configured `sol.command` (repository project configuration) can NEVER
grant SOL decision authority on **either** channel. `emitSol` fails closed
with the distinct `SOL_COMMAND_MASQUERADE` identity (no route record, no
spawn) whenever `config.sol.command` is set without a controller-minted
seam authorization — and the project configuration schema restricts the
`sol` block to exactly `command/args/timeoutMs`, so a repository can never
smuggle the authorization marker. The classic **broker/API** channel
(`sol.command` unset) is unchanged.

**Test/local fixture execution** uses controller-internal test mechanisms
guarded by an opaque module-private identity capability
(`src/controller/test-seams.mjs` → `mintSolTestSeam()` /
`consumeSolTestSeam()`):

- `runController({ solTransportOptions: { piBin, systemPrompt }, testCapability })`
  — fixture Pi CLI / system prompt for the codex transport;
- `runController({ solCommand, testCapability })` — a local fixture
  command for the classic channel.

A normal caller cannot construct, clone, or reuse a valid capability
(the authority is consumed by object identity and tracked in private
WeakSets), and any run that used a seam is marked
**non-authoritative**: it is structurally incapable of producing
`REVIEW_APPROVED` (enforced at disposition, not merely documented). The
same gating applies to the lower-level `runner` seam of
`invokeBoundedProvider`: a caller-supplied runner is honored only for a
non-authoritative (test-capability) transport. `runController` snapshots
all public authority-affecting inputs synchronously before its first
await, rejects accessor/prototype-backed data and public `project`
injection, and deep-freezes normalized copies; mutation races cannot
upgrade transport, command, routing, or review authority.

## 3. Strict environment allowlist

`buildSolTransportEnv` (src/controller/sol-transport.mjs) never inherits
arbitrary environment variables. Only a fixed base set may pass through
(`HOME`, `PATH`, `TMPDIR`, `TMP`, `TEMP`, `LANG`, `LC_ALL`, `LC_CTYPE`,
`NO_COLOR`, `TERM`, `SYSTEMROOT`, `COMSPEC`), and even those are
controller-overridden (`HOME`, `TMPDIR`, `PATH`). Everything else is
rebuilt from the allowlist:

- `PATH` is pinned to `/usr/bin:/bin:/usr/sbin:/sbin` (no user dirs, no
  repo dirs, no `.local/bin` shadow surface);
- `HOME`/`TMPDIR`/`TMP`/`TEMP` point into the controller-owned transport
  surface;
- `PI_CODING_AGENT_DIR` is pinned to the run-scoped isolated agent
  directory;
- the only other `PI_*` variables are the controller pins `PI_OFFLINE=1`,
  `PI_SKIP_VERSION_CHECK=1`, `PI_TELEMETRY=0` (every other `PI_*`
  variable — `PI_OAUTH_CALLBACK_HOST`, `PI_SHARE_VIEWER_URL`,
  `PI_CODING_AGENT_SESSION_DIR`, … — is stripped, so no environment can
  redirect Pi's OAuth/endpoint behaviour);
- `LCIM_INVOCATION_MARKER` carries the per-invocation marker for the
  controller-owned process supervisor and for crash-recovery termination.

Stripped by construction (documented in `STRIPPED_ENV_FAMILIES` and
asserted by tests): `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`
(+ lowercase forms), `NODE_EXTRA_CA_CERTS`, `SSL_CERT_FILE`,
`SSL_CERT_DIR`, `NODE_OPTIONS`, `NODE_REPL_EXTERNAL_MODULE`, `NODE_PATH`, every
remaining `PI_*`, every credential-shaped variable (`*API*`, `*TOKEN*`,
`*SECRET*`, `*PASSWORD*`, `*CREDENTIAL*`, `*AUTH*`, `*COOKIE*`,
`*PRIVATE*KEY*`), `SSH_AUTH_SOCK`, and the `*PROXY*` family.

## 4. Run-scoped isolated Pi agent store and OAuth refresh continuity

`acquireCodexSolStore` creates (once per run)
`<runDir>/controller/sol-transport/store/agent/auth.json` — mode **0600**,
containing **only** the `openai-codex` oauth entry copied from the real Pi
store (the entry is read in-process; other providers' credentials never
leave the real store). Every SOL invocation of the run reuses this store,
so Pi's OWN refresh/rotation persists across sequential SOL calls
(DIAGNOSE → repair → FINAL_REVIEW → RECHECK): the next invocation loads
the refreshed credential, never the stale original. The controller retains
one in-memory store handle per run with immutable original and current Codex
entry baselines; an existing disk directory is never re-acquired by
rebuilding authority from live auth.json. Per-invocation
surfaces (`cwd/`, `home/`, `tmp/`, marker) are created fresh for each
invocation under `invocations/<invocationId>/`.

Nothing else is created or copied: no `models.json`, no `settings.json`,
no `SYSTEM.md`/`APPEND_SYSTEM.md`, no extensions/skills/prompt-templates/
sessions. The controller never creates `models-store.json`; REAL Pi 0.84.1
offline startup does create exactly ONE such file — `models-store.json`,
mode 0600, content exactly `{}` (verified empirically against the pinned
package; the file is the offline FileModelsStore placeholder). Surface
inspection permits ONLY that exact-expected shape (regular file, mode
0600, empty object, no symlink, no extra keys, no provider/base-url/model
override content) and verifies it after exit; any non-empty or
authority-bearing `models-store.json` fails closed
(`models-store-invalid`). Pi starts from its built-in provider catalogue
with a hardcoded `https://chatgpt.com/backend-api` base URL; there is no
user-supplied config file that could redirect the OAuth bearer endpoint.

### OAuth refresh

The isolated store is **writable by Pi**, so Pi's own OAuth refresh works
exactly as designed: Pi's `FileAuthStorageBackend` acquires
`proper-lockfile` on `auth.json` (creating `auth.json.lock`), reads the
entry, calls `refreshOpenAICodexToken` against `https://auth.openai.com/
oauth/token`, and rewrites `auth.json` with the refreshed tokens. LCIM
never invents OAuth refresh logic.

### Read-only real store (sixth-review scope simplification)

The real Pi auth store is **READ-ONLY INPUT AUTHORITY** for 2.0.1. LCIM
never writes back / reconciles a refreshed credential into the user's real
`~/.pi/agent/auth.json` (or the `PI_CODING_AGENT_DIR` override):

1. the provider-scoped `openai-codex` entry is read from the real store;
2. copied into the controller-owned run-scoped isolated auth surface
   (marker-before-credentials, ancestors fsynced);
3. every SOL invocation of the run reuses that same isolated store;
4. Pi may refresh/rotate credentials inside that run-scoped store;
5. later `SOL_RECHECK` calls in the same run use the refreshed isolated
   state (within-run continuity);
6. at run cleanup the isolated credential surface is deleted;
7. a refreshed token is NEVER written back to the real auth.json — the
   `reconcileCodexSolStoreRefresh` write path was REMOVED entirely (the
   `auth.json.lock` protocol on the real store is never touched);
8. a later LCIM run that cannot authenticate with the real source
   credential fails closed with an explicit RE-AUTHENTICATION REQUIRED
   status and instruction (`pi /login` selecting ChatGPT Plus/Pro Codex,
   or `pi auth print-bearer-token --provider openai-codex`);
9. no LCIM execution path mutates real Pi credentials: the store retains
   an acquisition snapshot (canonical path, inode, byte SHA-256) and
   `verifyRealAuthSourceUnchanged()` proves byte-identical state at run
   end (an external concurrent Pi refresh is reported, never repaired).

Cross-run OAuth refresh persistence is intentionally deferred to a future
separately reviewed feature.

## 5. Credential discipline and canary (SOL-S11-003)

The controller handles credential material **only as trusted transport
state**:

- token values exist in memory for the invocation duration and on disk
  only in the isolated `auth.json`;
- they never enter prompts, model-visible evidence, invocation records,
  controller events, audit, review export, error messages, or
  stdout/stderr persistence;
- **raw Codex stdout/stderr is NEVER persisted as runtime evidence** —
  transport output stays in memory until the transport acceptance gate
  and every credential check pass; only the validated canonical SOL
  response artifact may be persisted, and only after all checks;
- after the Pi process exits and quiescence is proven, the isolated
  auth.json is reloaded (`refreshFromDisk`) so any **refreshed/rotated**
  access/refresh credential joins the sensitive-value set;
- the output canary scans **raw output bytes AND parsed canonical response
  values** for every sensitive value in every practical representation:
  raw, Unicode-escaped (including every ASCII byte as `\u00XX`), base64
  (standard, URL-safe, unpadded), hex (lower/upper), URL-encoded (mixed
  case), punctuation-fragmented forms, stdout+stderr combinations, and
  bounded parsed-field concatenations. Attribution is `STDOUT`, `STDERR`,
  `MULTIPLE`, or `UNKNOWN` only when proven; sub-eight-character credential
  values are refused before setup.
- **output truncation and every bounded-output error fail closed** — a
  truncated capture can never be treated as complete output;
- error text is static — no bytes are ever echoed.

If any representation of any sensitive value appears, the invocation
fails closed with the static identity `TRANSPORT_CREDENTIAL_LEAK`:
stdout/stderr are discarded (never persisted as raw output), the response
is never compiled, the ledger stays within the frozen Sprint-00 rejection
taxonomy (`TRANSPORT_MALFORMED`), and the distinct identity is carried by
the controller event and the transport evidence.

## 6. Transport acceptance gate (SOL-S11-004)

Before ANY Codex SOL response may be parsed into an authoritative
assessment, the controller requires exact positive proofs (missing,
undefined, or wrong values fail closed):

- `status === 0`, `error === null`, `timedOut === false`,
  `truncated === false`, and `processCompleted === true`;
- `identityVerifiedBeforeSpawn === true` and
  `identityVerifiedAfterExit === true`;
- `processAbsenceVerified === true` and `quiescenceVerified === true`
  (fresh controller-pinned process-table proof of root, descendants,
  process group, and invocation marker absence);
- `surfaceVerified === true`, `credentialScanPassed === true`, and
  `cleanupVerified === true`;
- production `reviewAuthority === AUTHORITATIVE`.

Ordering is strict: process exit/identity/quiescence → surface inspection →
raw credential scan → verified cleanup → pre-parse gate → JSON parse →
parsed-scalar credential scan → final gate → compile/persist canonical
response. Test fixtures may exercise this flow under an explicit
non-authoritative gate override, but can never gain production review
authority. A provider result carrying valid SOL JSON alongside any failed
proof is rejected and no response artifact is persisted.

## 7. Crash-resilient cleanup (SOL-S11-006)

- Every controller-owned surface (run store + per-invocation dirs) is
  marked **before credential bytes are written**. LCIM fsyncs the marker
  file and containing directory before creating `auth.json`. The marker
  binds schema version, canonical path, run/invocation IDs, invocation
  marker, credential path (store), aggregate transport identity, and
  node/CLI/closure identity hashes; malformed or unknown markers are never
  deleted.
- The durable STORE marker lives OUTSIDE the credential subtree
  (`<runDir>/controller/sol-transport/markers/<runId>.json`, fifth-review
  rule): a crash during recursive credential removal can never leave
  credential bytes without a marker. Cleanup order is: (1) positively
  terminate/verify Pi process absence, (2) delete the credential/auth/
  model-store subtree, (3) fsync the parent and verify subtree absence,
  (4) ONLY THEN remove the durable external marker, (5) fsync the marker
  parent. A crash at any earlier point leaves the marker present so
  recovery re-runs the removal; a marker-only leftover is swept too.
- Removal is marked ONLY after the removal was **observed** to succeed; a
  failed removal throws and fails the invocation/run closed
  (`SOL_TRANSPORT_CLEANUP_FAILED`) — successful cleanup is never
  inferred.
- The run-scoped credential store is removed at run end; an exception
  path still removes it in the finalizer. `finalize`, `abort`, and recovery
  all sweep marker-bound Pi processes/OAuth surfaces and refuse
  terminalization when positive cleanup proof is unavailable.
- `lcim recover <run-id>` sweeps every marker-recognized surface of the
  run: orphaned Pi processes whose environment still carries an
  invocation marker are terminated (SIGTERM → grace → SIGKILL → fresh
  canonical absolute-`ps` process-table verification), then the surfaces
  are removed. Unmarked
  (unrecognized) directories are never deleted.
- Startup reconciliation (`reconcileStaleSolTransportSurfaces`) sweeps
  every TERMINAL run's leftovers under the runtime root before a new run
  starts; failure to reconcile fails the new run closed. OPEN runs (potentially
  live in another session) are never touched.

## 8. Observed security evidence (SOL-S11-005)

Transport evidence (`sol-transport/evidence/<invocationId>.json`, schema
`1.4.0`) records ONLY **observed** non-secret facts, never asserted ones:

- post-exit agent-directory and invocation-surface layout: actual entries,
  modes, `authJsonOnly`, `authJsonMode`, validated `auth.json.lock` state,
  cwd/home/tmp emptiness, `unexpectedFiles`, the validated
  `modelsStore` shape (exact Pi 0.84.1 offline `{}` 0600 only), presence
  flags for models.json/settings.json/SYSTEM.md/APPEND_SYSTEM.md/
  extensions/skills/prompt-templates/sessions/tools — any unexpected
  authority-bearing file fails closed (`SOL_TRANSPORT_SURFACE_VIOLATION`);
- entrypoint identity: node/CLI realpaths, stat identities, SHA-256
  hashes, package name/version, `identityVerifiedAfterExit`;
- sanitized argv (the prompt argument replaced by its SHA-256 digest) and
  the prompt digest — never prompt content;
- env allowlist keys and pins, OAuth availability facts, refreshed-
  credential facts, leak outcome/channel, cleanup outcome (observed
  removed/error), and `reviewAuthority` (`AUTHORITATIVE` vs
  `TEST_SEAM_NON_AUTHORITATIVE`).

## 9. Fail-closed matrix

| Condition | Result |
|---|---|
| no SOL endpoint configured | `FAIL_NO_SUBSTITUTE` / `PROVIDER_UNAVAILABLE` |
| only `sol-xhigh` endpoint | classic channel (unchanged) |
| only `gpt-5.6-sol` endpoint, OAuth store usable | codex channel route records |
| only `gpt-5.6-sol` endpoint, no OAuth store | `FAIL_NO_SUBSTITUTE` / `CODEX_OAUTH_UNAVAILABLE` |
| both endpoints configured | `RoutingError` `SOL_CHANNEL_AMBIGUOUS` (no record) |
| `sol.command` configured (repository) | `SOL_COMMAND_MASQUERADE` on BOTH channels (no record, no spawn) |
| seam (`solCommand`/`solTransportOptions`/runner) without minted capability | `ConfigError` before any routing/spawn |
| seam used + HIGH_RISK completion | REJECTED `SOL_TEST_SEAM_NON_AUTHORITATIVE` (REVIEW_APPROVED impossible) |
| codex route without controller-prepared transport | `ProviderBrokerError` before any spawn |
| Pi not resolvable from a controller-trusted source | `ConfigError` before any spawn |
| entrypoint or copied dependency-closure identity changed (verify→replace, substitution) | spawn refused / result rejected fail-closed |
| credential material in output (any representation) | fail closed `TRANSPORT_CREDENTIAL_LEAK`; nothing persisted |
| timedOut / transport error / truncation / missing completion | fail closed `SOL_TRANSPORT_REJECTED`; no response compiled |
| unexpected agent-dir files after exit | fail closed `SOL_TRANSPORT_SURFACE_VIOLATION` |
| isolated auth store unreadable after exit | fail closed `SOL_OAUTH_RELOAD_FAILED` |
| real auth missing/corrupt/unusable (read-only source) | fail closed `CODEX_OAUTH_UNAVAILABLE` + RE-AUTHENTICATION REQUIRED; store never created/repaired/written |
| rotation observed inside the isolated store | within-run continuity only; NEVER written back (write-back removed) |
| real store changed by an external actor | reported by `verifyRealAuthSourceUnchanged` (never repaired, never reverted) |
| transport surface removal fails | invocation/run fails closed `SOL_TRANSPORT_CLEANUP_FAILED` |
| stale surfaces at startup / recover | swept (marker-recognized) + orphan processes terminated; sweep failure fails closed |

## 10. Invocation lifecycle (unchanged)

Every Sol call keeps the controller invocation lifecycle
START → COMPLETION → ASSESSMENT (exactly one of each per invocation id),
the controller-owned process supervisor (quiescence verification with
process-lifetime evidence; for the trusted codex transport the supervisor
is PRIMARY — `childCreationStructurallyDenied: false` — while the classic
SOL route keeps the no-descendant MODEL boundary and the supervisor as
DEFENSE IN DEPTH), and the bounded repair/finding pipeline:

- semantic rejection → `SOL_DIAGNOSE`
- high-risk accepted work → `SOL_FINAL_REVIEW`
- surviving repaired finding → `SOL_RECHECK`
- unresolved contract → `SOL_CONTRACT_CHECK`

A Sol finding still produces the existing bounded repair contract and
routes back to DeepSeek.

## 11. Route-decision schema

The route-decision record family gained a new **immutable schema version
`2.1.0`** (`schemas/route-decision.v2.1.schema.json`) for the codex
channel additions (`targetModel gpt-5.6-sol`, `reasonCode
CODEX_OAUTH_UNAVAILABLE`, FAIL_NO_SUBSTITUTE code constraint). The
`2.0.0` schema file is byte-identical to the 2.0.0 release and its
semantics are unchanged; records are validated against the schema named by
their own `schemaVersion`. See `ICR-2026-002-route-decision-sol-codex.md`.

## 12. Local-only note

This document describes the production transport. All tests use fixture
CLIs and fixture token values; no real provider network call and no real
credential is ever exercised by the test suite, and the integration suite
never depends on the user's real OAuth store.
