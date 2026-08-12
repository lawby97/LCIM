# LCIM V2 Logging Contract (Sprint 01)

Status: implemented by Sprint 01 (canonical invocation ledger, run lifecycle,
local evidence storage). Owner: Sprint 01. Consumers: every later sprint that
calls a model provider (02, 05, 06, 07), the audit projections (08), the V1
compatibility reader (09), and the CLI integration (10).

This document is the authoritative description of the Sprint-01 contract.
Machine-readable contracts are the three sprint-owned schemas:
`schemas/event.v2.schema.json`, `schemas/invocation.v2.schema.json`,
`schemas/run.v2.schema.json` (record families `lcim.event`, `lcim.invocation`,
`lcim.run` — versioned independently at **1.0.0**; the frozen Sprint-00
`lcim.common.*` family stays at 2.0.0 and is not modified).

## 1. Run store layout

Runtime state lives under the **target repository's Git common directory** —
never in tracked space (see `src/config/runtime-path.mjs` and
`docs/v2-security-boundaries.md`). Linked worktrees share one Git-common
store.

```
<git-common-dir>/lcim/
  runs/<runId>/
    run.json                  lcim.run record (OPEN at creation; finalizer/
                              abort() transitions it; anchored to the ledger)
    events.v2.jsonl           append-only, integrity-chained ledger
    invocations/<invId>.json  compact invocation projections (per invocation)
    raw/raw.jsonl.gz          optional compressed raw sink (best-effort)
    .lcim.lock/               transient advisory lock (never persisted data)
```

- `<runId>` is `lcim_run_<32 hex>` (shared ID format, `src/shared/ids.mjs`).
- The ledger file name `events.v2.jsonl` is fixed by this sprint.
- Files are written atomically (temp + fsync + rename) except the ledger
  append, which is a single `write + fsync` on an append-only fd.

## 2. Run record (`lcim.run`, file `run.json`)

Created OPEN with the master-plan principle-10 header fields:

| field | meaning |
|---|---|
| `runId` | `lcim_run_<32hex>` |
| `lifecycleState` | `OPEN` → `COMPLETED` / `INCOMPLETE_LEDGER` / `ABORTED` (shared `RUN_STATUS`) |
| `lcimVersion` / `lcimCommit` | LCIM identity from `VERSION` + LCIM repo HEAD (anchored to the LCIM source root — never the target repo's HEAD) |
| `targetBaseSha` | controller-owned target repository base (Sprint 03 derives it) |
| `configDigest` | sha256 of the effective config (controller-provided) |
| `schemaVersion` / `storeVersion` | record-family version (`1.0.0`) and store layout version (`1`) |
| `createdAt` / `finalizedAt` / `abortedAt` / `abortNote` | lifecycle timestamps; `abortNote` is bounded (≤500 chars), public-safe |
| `finalSummary` | written by the finalizer: event/invocation counts, `lastSeq`, `ledgerDigest`, `incompleteInvocationIds` |

`finalSummary.ledgerDigest` anchors the ledger end: after finalization,
truncating or rewriting any ledger event is detected by `open()` and the
validator.

## 3. Append-only ledger (`events.v2.jsonl`, `lcim.event`)

One line per event, canonical JSON (keys sorted, no whitespace). Common
fields: `schemaName`, `schemaVersion`, `runId`, `seq` (monotonic from 1),
`kind` (`START | COMPLETION | ASSESSMENT | RECONCILIATION`), `invocationId`,
`workUnitId`, `occurredAt` (ISO-8601), `prevDigest`, `digest`.

### Integrity chaining

- `digest` = sha256 of the canonical JSON of the event **excluding its own
  `digest` field**.
- `prevDigest` = `digest` of the previous line; event 1 uses GENESIS =
  64 zero hex chars.
- Rewriting any historical event breaks every subsequent digest. The
  deterministic reader recomputes the whole chain; `open()` fails closed on
  any mismatch (tamper, torn tail, truncation of a finalized run).

### Canonical lifecycle (state machine, fail closed)

Exactly **one START, one COMPLETION, one ASSESSMENT** per invocation ID:

| event | requires | results in |
|---|---|---|
| `START` | no prior events for the invocation | `STARTED` |
| `COMPLETION` | `STARTED` | `COMPLETED` |
| `ASSESSMENT` | `COMPLETED` | `ASSESSED` |
| `RECONCILIATION` | `STARTED` or `COMPLETED` | `ORPHANED` (no replacement) / `SUPERSEDED` (replacement) |

Any other transition (duplicate START, COMPLETION without START, duplicate
COMPLETION/ASSESSMENT, reconciliation of an ASSESSED/already-reconciled
invocation) throws `LedgerIntegrityError` and **never touches the file**.
A duplicate found in an existing file fails `open()` closed.

Kind-specific fields (enforced by `validateEventInstance`):

- `START` requires `provider`, `model`, `role` (`WORKER | SOL | SOL_PRO`),
  `reasoningEffort` (free-form string; the DeepSeek policy values such as
  `xhigh`/`MAX` are recorded verbatim, never downgraded silently).
- `COMPLETION` requires `outcome`
  (`SUCCESS | FAILURE | TIMEOUT | TRANSPORT_ERROR | CANCELED`); optional
  `usage` (`inputTokens`/`outputTokens`/`totalTokens`, non-negative
  integers), `errorCode` (uppercase code), `rejectionCode` (shared
  rejection taxonomy).
- `ASSESSMENT` requires `assessmentResult` (`ACCEPTED | REJECTED`);
  `REJECTED` **requires** a valid `rejectionCode` (mirrors the Sprint-00
  disposition rule). Optional bounded `summary` (≤500 chars) and
  `evidenceRefs` (≤50 refs).
- `RECONCILIATION` requires `reconciliationReason`
  (`CRASH_AFTER_START | CRASH_AFTER_COMPLETION | DUPLICATE_LIFECYCLE |
  OTHER`); optional `replacementInvocationId` (must differ from the
  superseded invocation and must already have a START in this run) and
  bounded `note`.

Missing events are **not** integrity errors: an invocation left `STARTED` or
`COMPLETED` is an incomplete-but-valid ledger. The finalizer decides
`COMPLETED` vs `INCOMPLETE_LEDGER` from the resulting states.

## 4. Compact invocation records (`lcim.invocation`)

`invocations/<invocationId>.json` persists one compact record per
invocation: `status`, `provider`, `model`, `role`, `reasoningEffort`,
`startedAt`/`completedAt`/`assessedAt`/`reconciledAt`, `outcome`, `usage`,
`errorCode`, `rejectionCode`, `assessmentResult`, `summary`, `evidenceRefs`,
`reconciliationReason`, `supersededByInvocationId`.

- The ledger is **authoritative**; the record is a **projection** rewritten
  atomically on each lifecycle transition (the ledger itself is never
  mutated).
- The reader/validator compares every record field against the
  ledger-derived state; any mismatch (including a missing record or a record
  without events) is an error, and `finalize()` refuses to run.
- This record is DISTINCT from the frozen shared `lcim.common.invocation`
  header (which carries the optional `workerStatus` and is owned by the
  worker contract). Sprint 01 never synthesizes a `workerStatus`; provider/
  model/role/reasoning are the ledger's invocation identity fields.

## 5. Crash/orphan reconciliation

A crash at any lifecycle point is recovered by **explicit
RECONCILIATION events — never by mutation**:

1. Reopen the store (`RunStore.open` — validates the whole chain first).
2. `store.reconcileOrphans()` reconciles every `STARTED`/`COMPLETED`
   invocation with `CRASH_AFTER_START`/`CRASH_AFTER_COMPLETION`; or
   `store.reconcileInvocation({ invocationId, reason,
   replacementInvocationId, note })` for an explicit supersession.
3. The superseded invocation becomes `ORPHANED` (or `SUPERSEDED` when a
   replacement invocation — started first — is named).

All evidence (ledger lines, projection records) is preserved byte-for-byte.

## 6. Run finalizer and abort

`store.finalize()` (controller-only, serialized by the run lock):

1. Re-reads and fully validates the ledger (parse, chain, transitions).
2. Verifies every projection against the ledger.
3. Computes completeness: every invocation must be `ASSESSED` (1/1/1) or
   explicitly reconciled (`ORPHANED`/`SUPERSEDED`).
4. Writes `run.json` with `lifecycleState = COMPLETED` (no incomplete
   invocations) or `INCOMPLETE_LEDGER` (incomplete ids listed in
   `finalSummary.incompleteInvocationIds`) and the ledger-end anchor.
5. Closes the raw sink. Never deletes, rewrites, or repairs any event —
   patch evidence is preserved by construction.

`store.abort({ note })` marks the run `ABORTED` (bounded public-safe note)
and refuses further appends. After finalization/abort every append, and
`finalize()`/`abort()` themselves, fail closed with
`LedgerFinalizedError`.

## 7. Optional raw sink

`RunStore.create(..., { options: { enableRawSink: true } })` opens
`raw/raw.jsonl.gz` (gzip stream). Every ledger line is mirrored into it and
future adapters can append raw transcript lines via `store.appendRaw(line)`.

- Local-only, best-effort, **per-session** (a gzip stream cannot be resumed
  after a crash); closed by `finalize`/`abort`/`close`.
- Never authoritative, never validated, never part of review export
  (Sprint 08), never committed (it lives under `<git-common-dir>/lcim`).

## 8. Deterministic reader and validator

- `readLedger(runDir)` parses `events.v2.jsonl` deterministically (same
  file → same events, same order).
- `validateLedger(events)` recomputes the chain (seq, prevDigest, digest),
  validates every event (schema + kind rules) and all transitions.
- `validateRunStore(runDir)` additionally validates `run.json`, the
  projections, and the run-record/ledger consistency (COMPLETED ⇒ no
  incomplete invocations; INCOMPLETE_LEDGER ⇒ exactly the recorded
  incomplete ids; ABORTED ⇒ completeness-exempt; finalized ⇒ ledger end
  matches `finalSummary`).
- `formatValidationReport(result)` emits the minimal summary/errors output.
  Projections, metrics, and dashboards are Sprint 08.

## 9. Shared invocation wrapper API

Every future provider adapter drives model calls through
`src/logging/invocation.mjs`:

```js
const store = await RunStore.create({ cwd, targetBaseSha, configDigest });
const inv = await store.startInvocation({
  workUnitId, provider, model, role: 'WORKER', reasoningEffort: 'xhigh',
});
await inv.complete({ outcome: 'SUCCESS', usage: { inputTokens, outputTokens, totalTokens } });
await inv.assess({ assessmentResult: 'ACCEPTED' });
await store.finalize();
```

Errors: `LedgerIntegrityError` (violations, tamper, projections),
`LedgerFinalizedError` (append after final state), `LedgerWriteError`
(I/O failure), `RunStoreError` (store-level failures), `RawSinkError`
(best-effort sink failures), `ConfigError` (invalid API inputs).

## 10. Public-safety invariants

- Ledger events and records carry **no secrets, no prompt bodies, no raw
  model output** — the schemas allow only the bounded taxonomy fields
  (`additionalProperties: false` everywhere).
- Raw transcripts go to the optional local sink only — never to the ledger,
  never to Git, never to review export.
- All runtime state lives under `<git-common-dir>/lcim`; the tracked tree
  stays public-safe (guards in `tests/guards/`).

## 11. Versioning and change discipline

- Sprint-01 record families are versioned 1.0.0, independently of the
  frozen `lcim.common.*` family (2.0.0). A compatible extension bumps the
  affected family's minor version; an incompatible change requires an
  interface-change request under `docs/v2-sprints/interface-change-requests/`
  (e.g. a `storeVersion` bump for layout changes).
- Sprint 01 modifies no shared Sprint-00 file.
