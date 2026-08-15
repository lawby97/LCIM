# LCIM V2 Logging and Audit (Sprint 08)

Status: Sprint-08 deterministic audit projections, metrics, REVIEW.md, and
local review export, completed by Sprint 10 CLI integration and exercised by
Sprint 11 release gates. Audit consumes canonical run stores; it **never
mutates** their ledger/events/projections. The `2.0.0` architecture is
summarized in [`v2-final-architecture.md`](v2-final-architecture.md).

## 1. Canonical input and normal-export boundary

Sprint 08 reads validated Sprint-01 run stores below:

```text
<git-common-dir>/lcim/runs/<runId>/
  run.json
  events.v2.jsonl
  invocations/<invocationId>.json
  raw/raw.jsonl.gz               forensic-only; never read into exports
```

Each candidate run is validated with `validateRunStore()` before use. A
per-run read/parse/structural failure becomes a deterministic invalid-run
entry; valid runs continue to project. Failure to resolve the target Git
runtime root or enumerate the top-level runs directory remains a whole-audit
failure.

The ledger is canonical forensic evidence, not normal report content. Its
bounded strings are **not automatically safe** for normal export:
Sprint-01 schemas permit arbitrary provider/model/reasoning strings,
assessment summaries, evidence refs, reconciliation notes, and ISO offsets.
Therefore Sprint 08 has one output-sanitization boundary:

- LCIM IDs, fixed enums, hashes, and validated timestamps pass unchanged.
- Known public provider/model/reasoning labels pass unchanged.
- Any other provider/model/reasoning value becomes a deterministic opaque
  SHA-256-derived label (`provider_<16hex>`, `model_<16hex>`, or
  `reasoning_<16hex>`), preserving count grouping without exposing text.
- `summary` is omitted/null in normal output.
- Evidence refs pass only as full hashes or recognized LCIM IDs; arbitrary
  refs are omitted.
- Canonical validation/read errors are exported only as a fixed code and a
  detail digest, never their raw path/message text.
- Normal exports never copy raw transcripts, target source, target paths,
  secrets, prompt bodies, or reconciliation prose.

Raw logs remain local/compressed under the canonical run store for forensic
review. Sprint 08 does not parse raw sink contents for normal projections and
never copies them into audit/export output.

## 2. Strict local output namespaces

Outputs may be written only under the target repository Git-common runtime
root:

```text
<git-common-dir>/lcim/
  audit/<selection>/              audit()
  exports/<selection>/            reviewExport()
```

`outDir` is a descendant selector inside its own namespace only:

- audit output: `<runtimeRoot>/audit/**`
- review export: `<runtimeRoot>/exports/**`

Relative paths resolve inside the namespace; absolute paths are allowed only
when already below it. Namespace roots themselves, `../` escapes, target
working trees, LCIM source trees, other repositories, run directories,
invocation directories, non-directories, and symlink/dangling-symlink escapes
are rejected before any projection write. Existing components are inspected
with `lstat`; post-create real paths must still remain below the real
namespace root.

## 3. Projection files

`audit()` writes the following local files atomically (canonical sorted JSON
for JSONL):

- `invocations.jsonl` — one sanitized `lcim.invocation`-shaped record per
  canonical invocation. Free text (`summary`, `errorCode`) is omitted.
- `work-units.jsonl` — one derived implementation-oriented record per
  `(runId, workUnitId)`.
- `reviews.jsonl` — one sanitized, schema-validated `lcim.review-summary`
  record per SOL/SOL_PRO call.
- `usage.jsonl` — one record per invocation, including usage availability,
  optional known per-call cost, explicit rejected waste, and separately
  classified non-rejected/non-accepted calls.
- `final.json` — selection, sanitized invalid-run errors, per-run canonical
  counts/hashes, metrics, reconciliation, and explicit unknown facts.
  `generatedAt` is `null`: an export wall-clock is not canonical evidence,
  so omitting it keeps identical selected history byte-deterministic.

`reviewExport()` writes a local export directory containing these five files
plus `REVIEW.md`. It does not upload, publish, attach, or transmit anything.

## 4. State separation and implementation acceptance

Sprint-08 work-unit states preserve independent facts:

| dimension | source / rule |
|---|---|
| model-reported work status | `UNKNOWN`: Sprint-01 intentionally does not record Sprint-02 worker status |
| transport/schema status | provider outcome plus `TRANSPORT_MALFORMED` / `SCHEMA_MISMATCH` taxonomy |
| controller validation | controller ASSESSMENT facts, including `MIXED` when accepted/rejected assessments coexist |
| semantic disposition | `SEMANTIC_REJECTED` only when a semantic rejection taxonomy is explicit; otherwise `UNKNOWN` |
| final integration | `UNKNOWN`: `CANDIDATE_INTEGRATED` / `REVIEW_APPROVED` are not canonical Sprint-01 facts |

In particular, controller `ACCEPTED` does **not** imply semantic acceptance.
A transport failure with a useful accepted patch therefore remains:

```text
transport/schema: TRANSPORT_FAILURE
controller validation: ACCEPTED
semantic disposition: UNKNOWN
final integration: UNKNOWN
```

Implementation acceptance is WORKER-only. SOL/SOL_PRO calls are review calls,
not implementation acceptance. A work unit is implementation `ACCEPTED` only
if a WORKER invocation has an explicit ACCEPTED assessment. `firstPassAccepted`
is `true`/`false` only if the first chronological WORKER invocation was
explicitly assessed; it is `null` when no WORKER exists or that first attempt
is orphaned/unassessed. `repairAccepted` is true only for an explicit
chronological sequence:

```text
REJECTED WORKER assessment -> later ACCEPTED WORKER assessment
```

It is never calculated as `accepted - firstPassAccepted`.

## 5. Review summaries and unavailable finding linkage

`schemas/review-summary.v2.schema.json` defines the Sprint-08-local
`lcim.review-summary` family at **1.0.0**. This independent versioning is
intentional and remains separate from filename naming and frozen common
schemas.

Sprint-01 does not record finding IDs, review/recheck relationships, repair
linkage, finding resolution/survival, or finding severity. Sprint 08 therefore
represents these as unavailable:

```text
findingDelivered: null
recheckOf: null
survivedRepair: null
```

The aggregate `metrics.solFindings` is likewise:

```text
availability: UNKNOWN
reason: NO_CANONICAL_FINDING_LINKAGE
findings/rechecks/survivedFirstRepair/resolvedByRepair: null
```

It never infers findings from summary prose, review order, work-unit
proximity, or intervening WORKER calls. A review that has not completed or
was reconciled after START emits `outcome: null`, which is valid under the
review-summary schema.

## 6. Usage, cost, and rejected-call waste

Usage reflects only recorded provider usage. Aggregate token totals are
`COMPUTED` only when every selected invocation has authoritative usage.
Otherwise token totals are `UNKNOWN` with `MISSING_USAGE` and only named
`knownInputTokenSubtotal`, `knownOutputTokenSubtotal`,
`knownTotalTokenSubtotal`, `knownUsageCallCount`, and `totalCallCount` are
reported. A known subtotal is never presented as a complete total.

Aggregate cost is `COMPUTED` only when every selected invocation has:

1. authoritative usage, and
2. applicable provider/model pricing.

Otherwise aggregate `cost` is:

```text
availability: UNKNOWN
usd: null
reason: MISSING_USAGE | MISSING_PRICING | MISSING_USAGE_AND_PRICING
knownCostSubtotal, knownUsageCallCount, pricedCallCount, totalCallCount
```

The subtotal is never presented as total spend.

`rejectedWaste` means only an explicit `assessmentResult === REJECTED`.
Orphaned, incomplete, failed-unassessed, and other unassessed calls are
separate `nonRejectedNonAccepted` categories, never mislabeled as rejected
facts.

## 7. Chronology and `--last N`

Sprint-01 timestamp schemas permit `Z` **and** numeric ISO offsets. Sprint 08
parses real calendar timestamps to epoch milliseconds rather than sorting
strings. Invalid/nonfinite calendar values fail closed for that run. Equal
instants use stable IDs as deterministic tie-breaks.

This chronology is used for:

- run selection (`--last N`, `createdAt` then run ID);
- first WORKER attempt;
- repair sequence determination;
- review projection ordering.

## 8. Metrics

Metrics include LCIM historical identity, calls by model/role/reasoning,
implementation first-pass/repair acceptance, transport/schema outcomes,
semantic rejection, wrong-base/scope counts, escalation rates, calls per
accepted implementation work unit, token/cost availability, explicit rejected
waste, rejection taxonomy, ledger completeness, orphan count, and
normalization availability.

`normalizationCount` remains `UNKNOWN` with
`NO_CANONICAL_NORMALIZATION_FACT`: Sprint-02 parser normalization is not
persisted into the Sprint-01 ledger. Empty history reports LCIM identity as:

```text
version: UNKNOWN
commit: null
availability: false
reason: NO_HISTORICAL_RUNS
```

`MIXED` appears only when two or more differing canonical historical
version/commit identities are actually selected.

## 9. Independent reconciliation

`reconciliation.ok: true` means projection identities and classifications
reconcile to independently loaded canonical state maps, not merely to other
projection-derived counts. It compares:

- exact invocation identity multisets plus lifecycle/role/assessment facts
  vs canonical START-derived states;
- exact usage identity multisets vs canonical START identities;
- exact review identity multisets and SOL/SOL_PRO role membership;
- exact work-unit identity multisets;
- work-unit implementation status, first-pass/repair classification, and
  aggregate outcome metric buckets vs independently classified canonical
  WORKER assessments;
- START / COMPLETION / ASSESSMENT / RECONCILIATION lifecycle counts vs the
  ledger summaries;
- rejected assessment states vs projection and taxonomy counts.

Duplicate-one/omit-one corruption with equal cardinality therefore fails
reconciliation.

## 10. APIs

```js
await audit({ cwd, last, pricing, outDir });
await reviewExport({ cwd, last, pricing, outDir });
```

- `last`: `null` for all runs, or a positive integer.
- `pricing`: `{ provider: { model: { inputPerMillion, outputPerMillion }}}`.
- `outDir`: optional descendant within the strict corresponding namespace.

Sprint 10 wires final CLI commands. Sprint 08 does not change
`bin/lcim.mjs`, does not create a dashboard/UI, and does not implement
ChatGPT Pro transport.

## 11. Tests and change discipline

Focused tests under `tests/audit/**` use a synthetic multi-run fixture and
adversarial regressions for sanitization, namespace escape prevention,
acceptance sequencing, cost completeness, unknown review linkage, incomplete
SOL reviews, reconciliation corruption, unreadable runs, offset timestamps,
prototype-like dimension strings, and LCIM historical identity states.

No shared Sprint-00/Sprint-01 interface is modified. If a future producer
needs canonical semantic acceptance, finding identity/recheck linkage,
normalization, or final integration facts, that producer must add a reviewed
interface through the owning sprint/ICR process; Sprint 08 will continue to
report `UNKNOWN` until then.
