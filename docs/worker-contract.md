# LCIM V2 Worker Contract (Sprint 02)

Status: implemented by Sprint 02 (`docs/v2-sprints/SPRINT_02_WORKER_CONTRACT.md`).
Owned modules: `src/workers/**`, `src/handoff/**`,
`schemas/worker-result.v2.schema.json`, `prompts/deepseek/**`,
`tests/workers/**`, `tests/fixtures/handoffs/**`.

This document defines the simplified worker contract and the safe-parsing /
transport-separation behavior of LCIM V2. It addresses V1 failure classes
C1 (worker self-report not authoritative), C2 (schema/transport mismatch),
and C3 (useful patch despite malformed handoff) from
`docs/v1-characterization.md`.

## 1. What a worker may report

Workers report only model-owned communication:

- `workUnitId` (the id echoed from the work unit brief);
- `workerStatus` — strictly one of `WORK_COMPLETE`, `BLOCKED`, `FAILED`,
  `NO_CHANGE` (shared Sprint-00 `WORKER_STATUS` vocabulary);
- a bounded `summary`;
- `acceptanceClaims` with `claim` + `evidenceRefs` (array of references);
- `remainingIssues`, `reviewRisks` (bounded string lists);
- `uncertainty` (factual uncertainty statement).

`PATCH_READY` is **not** a worker status and never appears in the V2
contract. Workers never report controller dispositions (`PATCH_VALID`,
`SEMANTICALLY_ACCEPTED`, `CANDIDATE_INTEGRATED`, `REVIEW_APPROVED`, …) in
either direction, and they never emit envelope metadata (`schemaName`,
`schemaVersion`, LCIM version/commit, config digests) — the controller
stamps records.

Machine-readable contract: `schemas/worker-result.v2.schema.json`
(schema `lcim.worker-result`, version `2.0.0`, Sprint-02-owned, validated
by the shared Sprint-00 engine). Code mirror: `src/workers/contract.mjs`.

## 2. Objective evidence is controller-owned (removed from worker responsibility)

The following V1 worker-reportable facts are **absent** from the worker
schema and rejected as additional properties (`additionalProperties:
false`); they belong to the controller (Sprint 03 owns the git/test/secret
evidence, Sprint 01 the ledger, Sprint 05 routing):

- changed-file lists, line counts, patch hashes;
- base/HEAD SHAs (`baseSha`, `headSha`, `expectedBaseSha`);
- test-log paths, test exit status/exit codes;
- secret-scan results; integration status;
- the legacy V1 `evidence` field (string or array) — replaced by
  `acceptanceClaims[].evidenceRefs` (array of strings);
- any patch-observation or controller-validation state.

`src/workers/contract.mjs` (`WORKER_FORBIDDEN_FIELDS`) documents each
field with the reason it is forbidden; `listObjectiveEvidenceViolations()`
produces precise diagnostics. Validation only records validity — it never
repairs a wrong response.

## 3. Work-unit worker-facing portion

Of the shared `lcim.common.work-unit` record
(`schemas/common/common-work-unit.v2.schema.json`, frozen at Sprint 00),
only `workUnitId` is worker-facing. `expectedBaseSha`, `allowedWritePaths`,
and `mustChangePaths` are controller-owned (Sprint 03 owns base/scope
enforcement) and are never handed to or reported by the worker. No change
to the shared schema was required.

## 4. Parse and normalization

Strict parse first, then **recorded syntactic normalization** only for:

1. **strict JSON** — the raw text parses as JSON → `normalization: 'none'`;
2. **one JSON fence** — exactly one fenced block, tagged `json` or
   untagged, whose content parses as JSON → `normalization: 'fence'`;
   a fenced object is acceptable ONLY when the surrounding prefix/suffix
   contains no other independently parseable JSON object (a second
   parseable object anywhere outside the fence makes the transport
   ambiguous — the fenced object is never preferred merely because it is
   fenced);
3. **one prose-wrapped object** — exactly one uniquely identifiable JSON
   object embedded in harmless prefix/suffix prose →
   `normalization: 'prose-wrapped'` (string-aware balanced-brace scan;
   the candidate must parse and be a plain object).

Everything else fails with `TransportParseError` (`TRANSPORT_MALFORMED`):
malformed/truncated JSON, empty responses, multiple JSON objects
(ambiguous), a fenced object with another parseable JSON object in the
surrounding text, multiple code fences, unclosed fences, and non-JSON
fence tags. The ambiguity checks are purely syntactic transport
validation: the parser never inspects semantic worker meaning, never
chooses one object arbitrarily, and never merges or repairs objects. The
parser never invents missing semantic fields and never rewrites types to
satisfy the schema; normalization is purely syntactic and recorded on the
parse result for audit. `src/handoff/parse.mjs`.

BL-020 fixture patterns live in `tests/fixtures/handoffs/` and cover:
strict JSON, fenced JSON, prose-wrapped JSON, legacy `evidence` string/array
mismatch, null log path, malformed JSON, multiple objects, correct BLOCKED,
worker-says-success, and objective-evidence smuggling.

## 5. Transport validity and patch usefulness are separate states

Six independent states (`src/handoff/states.mjs`):

1. `RESPONSE_RECEIVED` — transport evidence: a non-empty raw response
   text was received (`responseReceived`). Absence of a response is NOT
   evidence of timeout, crash, provider error, or orphan — those are
   objective controller/provider facts and are never inferred from
   transport;
2. `MODEL_PROCESS_COMPLETED` — objective controller/provider observation
   (`modelProcessCompleted`), supplied explicitly to `assessHandoff()`.
   `null` (unknown) until supplied. Response presence is transport
   evidence and never proves process completion; an empty/missing
   response never proves failure. The two facts are never conflated;
3. `RESPONSE_PARSED` — parse succeeded (with recorded normalization);
4. `RESPONSE_SCHEMA_VALID` — parsed payload satisfies the worker schema;
5. `PATCH_OBSERVED` — controller observed worktree/patch evidence
   (Sprint 03 owns the evidence; Sprint 02 guarantees the state is never
   derived from transport validity);
6. `CONTROLLER_VALIDATED` — controller disposition decided (Sprint 03+).

`assessHandoff()` (`src/handoff/assessment.mjs`) produces an immutable
assessment carrying all six states. Guarantees:

- response presence is transport evidence; `modelProcessCompleted` is an
  explicit controller/provider fact (`true`, `false`, or `null` for
  unknown) accepted as an option to `assessHandoff()` and never derived
  from `rawResponse` — non-boolean supplied values fail closed;
- no worker status, worker failure, patch absence, controller rejection,
  timeout, crash, or provider failure is ever synthesized from response
  presence or absence;
- a malformed or missing handoff never marks the underlying isolated patch
  nonexistent: `patchPreserved` is always `true`, `patchObserved` stays
  `null` until the controller explicitly calls `recordPatchObservation()`,
  and the assessment never touches the worktree;
- a parsed-but-schema-invalid payload is `SCHEMA_MISMATCH`; an unparseable
  payload is `TRANSPORT_MALFORMED` — both are recoverable evidence defects
  (rejection taxonomy, `docs/v1-characterization.md` C2/C3);
- `workerStatus` is recorded verbatim only for schema-valid payloads;
  a `WORK_COMPLETE` report is a claim, not an acceptance decision.

## 6. Raw-response preservation

The exact final raw response is preserved byte-for-byte at
`<runtimeRoot>/handoffs/<workUnitId>/raw-response.txt` (runtime root =
`<git-common-dir>/lcim`, `src/config/runtime-path.mjs`; never tracked).
`src/handoff/preserve.mjs`. Normal reports reference the path
(`rawResponseRef` via `summarizeForReport()`) but never embed or commit the
raw content; the preserved file lives under the Git common directory so it
can never be tracked by mistake.

## 7. Prompt policy (no success pressure)

`prompts/deepseek/`:

- `WORKER_RESPONSE_CONTRACT.md` — authoritative model-facing contract;
- `worker.system.md` — system prompt embedding the contract;
- `README.md` — index and usage.

Prompts explicitly permit `BLOCKED`/`FAILED`/`NO_CHANGE`, require factual
uncertainty reporting, forbid `PATCH_READY`/dispositions/objective-evidence
fields, and mandate exactly one JSON object. Tests in
`tests/workers/prompt-contract.test.mjs` prove the prompts contain no
forced-success language.

## 8. Interface-change status

No shared Sprint-00 interface was changed. The worker-result schema is
Sprint-02-owned and deliberately lives outside the `lcim.common.*` family
(it is model-facing transport, not a controller record); it is validated
with the existing shared engine. No interface-change request was filed.
