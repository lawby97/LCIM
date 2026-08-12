# V1 failure characterization (public-safe)

Purpose: freeze the observed V1/BL-020 failure classes as **characterization
requirements** for V2 without committing the large review packet, business
source excerpts, or raw transcripts. This document is public-safe: it contains
no business-repository source, no raw model transcripts, and no credentials.
Each class maps to the V2 interface element that addresses it and to the
test/guard that must keep it addressed.

The classes below are the canonical list from the V2 master plan
(`docs/v2-sprints/00_MASTER_PLAN.md` "Why sprints"). They are frozen here;
later sprints reference them by the `REJECTION_CODE` / design element names.

## C1 — Worker self-report is not authoritative

- Observation: a worker's own success/status claims were treated as fact.
- Why it failed: model claims are not objective evidence; they conflate
  intent with verified state.
- V2 requirement: workers report only `WORKER_STATUS`
  (`WORK_COMPLETE | BLOCKED | FAILED | NO_CHANGE`); they never emit
  `PATCH_READY` and never decide dispositions. Only the controller decides
  `PATCH_VALID | SEMANTICALLY_ACCEPTED | CANDIDATE_INTEGRATED |
  REVIEW_APPROVED`.
- Owning sprints: 00 (vocabulary/state separation), 02 (worker contract),
  05 (routing), 03 (controller-owned evidence).
- Guard: `tests/unit/enums.test.mjs` — worker status vocabulary is disjoint
  from controller dispositions; schema `lcim.common.invocation` rejects
  `PATCH_READY`; `lcim.common.disposition` rejects worker statuses.
- Rejection code: `UNSUPPORTED_CLAIM`.

## C2 — Schema/transport mismatch

- Observation: the model's handoff did not match the schema the controller
  expected, and the mismatch was treated as total failure of the work.
- Why it failed: transport validity and patch usefulness were conflated.
- V2 requirement: strict parse first; one JSON fence or one uniquely
  identifiable JSON object with recorded normalization; malformed transport
  is a recoverable evidence defect, never automatic destruction of an
  isolated patch.
- Owning sprints: 00 (vocabulary), 02 (parser/normalization).
- Rejection codes: `TRANSPORT_MALFORMED`, `SCHEMA_MISMATCH`.

## C3 — Useful patch despite malformed handoff

- Observation: the worktree contained a useful patch even when the handoff
  was malformed; discarding everything on transport failure lost real work.
- Why it failed: no separation between "response parsed/valid" and "patch
  observed/validated".
- V2 requirement: model-process completion, response parsed, response schema
  valid, patch observed, and controller validation are separate states; a
  malformed response never erases worktree/patch evidence.
- Owning sprints: 00 (state separation), 02 (worker contract), 03 (patch
  evidence), 01 (ledger preserves patch evidence on `INCOMPLETE_LEDGER`).
- Guard: Sprint-02 negative fixtures; disposition vocabulary supports
  `PATCH_VALID` independent of transport state.

## C4 — Wrong-base candidates

- Observation: candidate patches were produced against the wrong base
  (stale/incorrect HEAD) and were hard to detect after the fact.
- Why it failed: base identity was not a deterministic controller fact.
- V2 requirement: isolated worktrees rooted at an explicit
  `expected_base_sha`, validated before spawn, after worker exit, before
  patch extraction, and before integration handoff; serial candidate bases.
- Owning sprints: 00 (`expectedBaseSha` in `lcim.common.work-unit`), 03
  (git controller).
- Rejection code: `WRONG_BASE`.

## C5 — Semantic contract conflation

- Observation: similarly named IDs/digests/registries (e.g., approval fields,
  decision vs evidence vs membership digests, source/current ticker binding)
  were conflated, producing wrong "correct" work.
- Why it failed: no authoritative semantic contract with exact field names,
  casing, enum values, identities, and forbidden alternatives.
- V2 requirement: a semantic contract compiler with
  `distinct_concepts`/`must_not_conflate`, high-risk classes, and
  `facts_established` vs `unresolved_semantics`; unresolved high-risk
  semantics produce `REVIEW_REQUIRED`/`CONTRACT_REVIEW_REQUIRED`, never
  invention.
- Owning sprints: 00 (taxonomy + `REVIEW_REQUIRED` disposition), 04
  (compiler), 06 (SOL contract check).
- Rejection codes: `SEMANTIC_CONFLATION`, `UNRESOLVED_SEMANTICS`.

## C6 — Incomplete ledger

- Observation: model calls/decisions were not fully recorded, so periodic
  review could not reconstruct what happened; run records were missing
  version/base/config/schema metadata.
- Why it failed: logging was an afterthought and not append-only/auditable.
- V2 requirement: canonical append-only invocation ledger with monotonic
  sequence, integrity chaining, exactly one START/COMPLETION/ASSESSMENT per
  invocation, crash/orphan reconciliation via explicit events (never
  mutation), and run metadata recording LCIM version/commit, target base,
  config digest, and schema version.
- Owning sprints: 00 (run header schema, `INCOMPLETE_LEDGER` status), 01
  (ledger), 08 (audit projections).
- Rejection codes/statuses: `INCOMPLETE_LEDGER` (run status and rejection
  code).

## C7 — Generic SOL review too broad

- Observation: SOL was asked to "review the sprint"/"look for bugs" — broad
  asks produced unfocused, low-precision output and wasted escalation tokens.
- Why it failed: no bounded decision contract for SOL calls.
- V2 requirement: every SOL call is compiled with one primary decision
  question, explicit pass/fail conditions, bounded evidence, out-of-scope
  limits, and an exact response contract; generic asks fail preflight.
- Owning sprints: 00 (finding/rejection vocabulary), 06 (ask compiler), 07
  (text-only Pro transport), 05 (routing reason codes).
- Rejection code: `SOL_ASK_INVALID`; finding severity vocabulary supports
  `CRITICAL`/`WARNING`/`INFO` with named invariants.

## Characterization test hooks (Sprint 00)

| Class | Hook (implemented at Sprint 00) |
|---|---|
| C1 | enums disjointness; schema rejects `PATCH_READY` as worker status |
| C2/C3 | rejection codes exist; disposition/transport state separation documented and schema-checked |
| C4 | `expectedBaseSha` required field in work-unit schema |
| C5 | `SEMANTIC_CONFLATION`/`UNRESOLVED_SEMANTICS` codes; `REVIEW_REQUIRED` disposition |
| C6 | `INCOMPLETE_LEDGER` status; run header fields (lcimVersion/lcimCommit/targetBaseSha/configDigest) required |
| C7 | `SOL_ASK_INVALID` code; finding/invariant vocabulary |

Sprints 01–09 add the behavioral fixtures that exercise each hook end to end.
