# LCIM V2 — V1 compatibility reader and migration semantics (Sprint 09)

Status: implemented by Sprint 09 (`docs/v2-sprints/SPRINT_09_V1_COMPAT.md`).
Owned modules: `src/compat/v1/**`, `schemas/compat/**`,
`tests/compat/v1/**`, `tests/fixtures/compat/v1/**`, the V1 sections of
this document.

## 1. Purpose

Preserve historical LCIM V1 evidence **without rewriting it** and let V2
audit/migration tooling interpret **only the facts that can actually be
established** from V1 evidence. Unknown or ambiguous historical information
remains `UNKNOWN_V1`. The reader never reconstructs, invents, or infers
missing history merely to make V1 look like V2.

The reader is a pure, read-only, string-in/object-out API
(`src/compat/v1/index.mjs`): version detection -> parsing ->
compatibility projection. It never touches the file system, never writes,
never repairs, never appends invented events, and never alters historical
hashes.

## 2. Supported V1 compatibility version(s)

One supported variant: **`v1.0`**, covering three historical evidence
forms:

| form | supported encoding | schema |
|---|---|---|
| V1 assignment ledger / event format | JSONL (one event per line) or JSON array; events `ASSIGNMENT \| HANDOFF \| CONTROLLER_ACTION`, integrity-chained (`seq`, `prevDigest`, `digest`) | `lcim.v1.ledger-event` |
| V1 work-unit handoffs | strict JSON, one JSON code fence, or one uniquely identifiable prose-wrapped JSON object (the reviewed Sprint-02 grammar, reused read-only) | `lcim.v1.handoff` |
| Available V1 final-response evidence | same payload grammar; also "reference-only" evidence (text unavailable) | interpreted via `interpretV1FinalResponse` |

The variant is a **deterministic, documented reconstruction of the known
V1 evidence classes** (failure classes C1–C7 in
`docs/v1-characterization.md`, the V1 worker-reportable facts in
`docs/worker-contract.md` section 2, and the BL-020 fixture patterns in
`tests/fixtures/handoffs/`). It is **not** claimed to be the exact byte
format of any private BL-020 archive. The reader is versioned; a future
supported variant bump would extend the detector and these tables.

The V1 worker status vocabulary of the variant is
`WORK_COMPLETE | BLOCKED | FAILED | NO_CHANGE | PATCH_READY`. The V1
handoff payload allows the known V1 worker-reportable fields that V2
forbids: legacy `evidence` (string or array), `changedFiles`, `lineCount`,
`patchHash`, `baseSha`, `headSha`, `testLogPath`, `testExitStatus`,
`secretScan`, `integrationStatus`, `patchReady`. In V1 these are **worker
claims**, never controller facts.

The ledger chain convention: `digest` = sha256 over the canonical JSON of
the event excluding its own `digest` field (keys sorted, no whitespace);
`prevDigest` = digest of the previous event; GENESIS = 64 zero hex chars
for seq 1; seq strictly increasing from 1.

## 3. Version detection

`detectV1Version(text)` classifies deterministically into exactly one of:

| state | meaning | behavior |
|---|---|---|
| `SUPPORTED_V1` | supported v1.0 ledger or handoff/response payload | parse + project |
| `UNSUPPORTED_LEGACY_VARIANT` | looks like V1-family evidence but is a variant this reader does not support (unsupported `v1Version`, unknown event kinds, unmarked ledger-like data, unknown worker-status vocabulary with no other V1 markers) | fail closed with `UnsupportedV1VersionError` (`V1_UNSUPPORTED_VERSION`) |
| `NOT_V1` | not recognizable V1 evidence (native V2 `lcim.event` records, unrelated JSON, unparseable text, non-text) | fail with `V1CompatError` (`V1_COMPAT_INVALID`) |

Rules (documented, deterministic, pure):

- Ledger form is recognized by its marker (`schemaName:
  lcim.v1.ledger-event` and/or `v1Version`); a `1.0`-marked ledger is
  supported only when every event kind is in the variant vocabulary.
  Ledger-like data **without** the supported marker is
  `UNSUPPORTED_LEGACY_VARIANT` — never best-effort parsed.
- Payload form is recognized by its vocabulary: `workerStatus` in the V1
  vocabulary, or any known V1 legacy field, is a strong marker. An unknown
  status with V1 context fields (`workUnitId`/`summary`) is still the
  supported variant — the instance is then schema-invalid
  (parseable-but-historically-invalid). An unknown status with **no** V1
  markers is `UNSUPPORTED_LEGACY_VARIANT`.
- Detection is by evidence **form**, not origin: a payload that also
  satisfies the V2 worker-result schema is still a supported V1 handoff
  form when read through this reader. Provenance is applied by the caller
  (`V1_COMPAT`), never implied by the bytes.
- The requested source kind (`auto | ledger | handoff | response`) must
  match the detected form; any mismatch fails closed ("refusing to
  reinterpret").

## 4. Immutability and read-only handling

V1 historical evidence is immutable input. Sprint 09 NEVER:

- rewrites a V1 ledger or normalizes a V1 file in place;
- repairs a malformed historical handoff in place;
- alters historical hashes (digests are recomputed only to **verify**;
  a mismatch is reported as `V1ChainIntegrityError`
  (`V1_HASH_CHAIN_BROKEN`), never corrected);
- appends invented events or synthesizes later invocation records;
- overwrites old evidence with V2 structures.

Parsing and normalization produce **separate compatibility/projection
output only** (`lcim.v1.projection`), never modifications of the source.
Every projection records `sourceDigest` (sha256 of the exact source
bytes) and `sourceByteCount`, so any later mutation of the V1 evidence is
detectable. Mutation-protection tests
(`tests/compat/v1/mutation.test.mjs`) prove byte-for-byte that every
fixture is unchanged after detection, parsing, and projection, and that
no files are created.

## 5. Provenance: `V1_COMPAT`

Every normalized fact lives in a projection record whose `provenance` is
pinned to **`V1_COMPAT`**: the fact originated from V1 compatibility
interpretation, not from a native V2 canonical ledger. A `V1_COMPAT` fact
never implies native V2 validity and never implies any V2 controller
decision. Native V2 behavior never depends on this reader: nothing outside
`src/compat/v1/**` imports it.

## 6. `UNKNOWN_V1` semantics

The reserved sentinel `UNKNOWN_V1` marks facts that cannot be established
from V1 evidence. Facts are either the exact value established by the
evidence, the sentinel, or absent. They are NEVER:

- `false` (e.g. "not integrated", "not rejected", "no patch");
- `0` (e.g. zero later events, zero tokens, zero cost);
- `''` (empty strings are rejected by the compat schema rule);
- `accepted` / `rejected` / `integrated` / `complete`;
- any invented path, hash, id, or count.

### KNOWN_ZERO vs UNKNOWN_V1

| situation | result |
|---|---|
| Worker provided an empty `evidence`/`changedFiles` list | KNOWN_ZERO claim (`evidenceRefCount: 0`, `changedFileCount: 0`) — the claim itself is knowable |
| Evidence field present but wrong-typed | `UNKNOWN_V1` (not countable, never guessed) |
| `testLogPath` missing/null | `UNKNOWN_V1` — a missing log reference is unavailable evidence, never "no tests" or "tests failed" |
| `testExitStatus` missing/null | `UNKNOWN_V1`, never 0 or "failed" |
| No later ledger events for a work unit | `UNKNOWN_V1` counts; `coverage.incomplete: true` |
| No controller integration evidence | `UNKNOWN_V1`, never "not integrated" |
| No semantic review record | `UNKNOWN_V1`, never "no findings" |
| No usage/cost record | `UNKNOWN_V1`, never 0 tokens / $0 |
| Response evidence unavailable (ref only) | `parseable: UNKNOWN_V1` — unavailable evidence is never called malformed |

## 7. What V1 facts ARE comparable to V2

- **Worker status claims** — the four V2 worker statuses
  (`WORK_COMPLETE | BLOCKED | FAILED | NO_CHANGE`) are a subset of the V1
  vocabulary; a V1 worker claim in that subset maps losslessly to
  `workerClaim.v2WorkerStatus` (still a claim, provenance `V1_COMPAT`).
- **Work-unit ids** — recorded verbatim; `workUnitIdV2PatternCompatible`
  records whether the id matches the V2 `lcim_wu_…` pattern (a syntactic
  match only).
- **Transport parseability and normalization** — `parseable`,
  `normalization` (`none | fence | prose-wrapped`) are transport facts.
- **Historical schema validity** — `historicallySchemaValid` records
  validity against the supported V1 handoff schema, explicitly NOT V2
  validity.
- **Worker-provided evidence reference counts** — when the worker actually
  provided the lists.

## 8. What V1 facts are NOT comparable to V2

- **Controller dispositions** — `controller.v2Disposition` is pinned to
  `UNKNOWN_V1` by schema. V1 evidence can never establish
  `PATCH_VALID | SEMANTICALLY_ACCEPTED | CANDIDATE_INTEGRATED |
  REVIEW_APPROVED | REJECTED | REVIEW_REQUIRED`. Even a recorded V1
  `REJECTION` or `MANUAL_INTEGRATION` action is a historical V1
  controller action, never a V2 disposition.
- **`PATCH_READY`** — a V1 worker status with no V2 worker-status
  equivalent and no disposition meaning.
- **Patch validity/usefulness** — only `MANUAL_INTEGRATION` establishes
  `USEFUL`; everything else is `UNKNOWN_V1`.
- **Integration state** — `manualIntegrationObserved` is `true` only when
  a `MANUAL_INTEGRATION` action exists, else `UNKNOWN_V1` (never
  `false`). Schema-pinned to `true | UNKNOWN_V1`.
- **Base SHAs** — a V1 `baseShaClaim` is a worker/assignment **claim**,
  never the V2 controller-owned `expectedBaseSha` fact (failure class C4).
- **Usage/cost** — pinned to `UNKNOWN_V1` (V1 kept no usage records).
- **Later invocation records** — pinned to `UNKNOWN_V1` (failure class C6:
  V1 logging was incomplete by design).
- **Semantic review findings** — pinned to `UNKNOWN_V1`.

## 9. Why missing V1 ledger coverage cannot be interpreted as zero activity

V1 logging was an afterthought (failure class C6): the ledger's silence
after a work-unit handoff is a **coverage gap**, not a record of "nothing
happened". A V1 controller may well have manually integrated the work, run
more invocations, or assessed the unit without recording it. The projection
therefore records `coverage.laterLedgerCoverageKnown: false`,
`coverage.incomplete: true`, `laterEventCount: UNKNOWN_V1` — never `0`.

## 10. Why worker `PATCH_READY` is not equivalent to V2 controller acceptance

`PATCH_READY` is a historical **worker self-report** (failure class C1:
worker self-reports are not authoritative). V2 controller dispositions are
decided only by the controller on native V2 evidence. The projection keeps
the claim verbatim (`workerClaim.status: "PATCH_READY"`,
`statusInV1Vocabulary: true`) with `v2WorkerStatus: UNKNOWN_V1` and
`controller.v2Disposition: UNKNOWN_V1`. It is never translated into
`PATCH_VALID`, `SEMANTICALLY_ACCEPTED`, `CANDIDATE_INTEGRATED`, or
`REVIEW_APPROVED`, and it never establishes patch usefulness by itself.

## 11. Why a schema-invalid handoff does not prove patch uselessness

Transport validity and patch usefulness are separate states (failure
classes C2/C3). A parseable-but-historically-schema-invalid handoff is
represented as `parseable: true`, `historicallySchemaValid: false`
(`SCHEMA_MISMATCH`) — never as "no patch" or "failed implementation". The
projection carries `patch.preserved: true` (schema-pinned) and keeps
`patch.usefulness` independent: `UNKNOWN_V1` by default, `USEFUL` only
when independent evidence (a recorded `MANUAL_INTEGRATION` controller
action) establishes it. The BL-020 distinction is preserved end-to-end:
invalid handoff + manual integration => the patch was still useful.

## 12. What migration does NOT do

- Does not rewrite V1 history or convert V1 files in place.
- Does not fabricate missing events, later invocations, or outcomes.
- Does not import private/raw BL-020 artifacts, review ZIPs, transcripts,
  or credentials (fixtures are public-safe synthetic).
- Does not make V2 runtime behavior depend on the V1 parser (nothing
  outside `src/compat/v1/**` imports it).
- Does not implement Sprint-08 audit logic, Sprint-10 CLI integration,
  Sprint-07 ChatGPT transport, or a migration UI.
- Does not auto-publish converted data.
- Does not emit V2 metrics from V1 evidence lacking the required state
  distinctions (see sections 8–11).

## 13. Unsupported legacy behavior

Any legacy evidence that is not the documented v1.0 variant fails
**clearly and safely**:

- unsupported `v1Version` (e.g. `0.9`) -> `UnsupportedV1VersionError`;
- unknown event kinds in a `1.0`-marked ledger -> `UnsupportedV1VersionError`;
- ledger-like data without the supported marker -> `UnsupportedV1VersionError`
  (never best-effort parsed);
- unknown worker-status vocabulary without other V1 markers ->
  `UnsupportedV1VersionError`;
- native V2 `lcim.event` records or unrelated JSON -> `V1CompatError`
  (not V1 evidence);
- broken historical chains (tamper, altered digest, torn chain,
  non-monotonic seq) -> `V1ChainIntegrityError` (deterministic, read-only,
  never repaired);
- kind mismatches (a ledger requested as a handoff or vice versa) ->
  `V1CompatError`.

Error messages never embed raw response text or event bodies; only
bounded identifiers (seq, line numbers, event kinds, versions, reason
codes) appear.

## 14. Public safety

The reader is public-safe by construction: it takes text in memory, emits
structured records, and never persists anything. Fixtures under
`tests/fixtures/compat/v1/` are synthetic placeholders (fake ids, fake
paths, `archive://bl020-public-ref/...` references are never resolved).
No secrets, credentials, transcripts, business source, or large archives
are imported or committed.

## 15. V2 stable-release migration path

For `2.0.0`, retain V1 files as immutable historical evidence and run the
pure compatibility reader separately. Create native V2 `.lcim/project.json`
configuration using only non-secret project inputs, then start a fresh native
V2 run. Do not rewrite V1 files, synthesize a V2 ledger from missing history,
or promote V1 worker claims into controller dispositions. Native V2 audit and
review exports report unavailable historical facts as `UNKNOWN`/`UNKNOWN_V1`
and remain local, sanitized, and reviewable-only.
