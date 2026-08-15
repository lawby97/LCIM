# LCIM V2 SOL Ask Compiler and precise decision contracts (Sprint 06)

Status: implemented by Sprint 06 and repaired per SOL review findings SOL-S06-001..010 (see
`docs/v2-sprints/SPRINT_06_SOL_ASK_COMPILER.md`). Sprint 11 fault/E2E gates
exercise compiler bypass resistance and bounded repair behavior for
`2.0.0-rc.1`; see [`v2-final-architecture.md`](v2-final-architecture.md).

Purpose: turn SOL from a broad reviewer into a **bounded decision engine**.
Every SOL call asks exactly ONE primary decision question and returns a
response that can be evaluated or converted directly into one repair
ticket. The ask compiler compiles **explicit structured inputs only** — it
never inspects business repositories, and it rejects generic asks,
multiple independent questions, bundled concerns, and edit requests before
they can reach SOL.

SOL remains a decision engine: it decides, it never edits files, and the
ChatGPT SOL Pro transport is **manual and TEXT ONLY** (Sprint 07 owns the
transport; no files, logs, patches, ZIPs, or packets are ever uploaded).

## Owned modules

| Path | Responsibility |
|---|---|
| `src/sol/contracts/call-types.mjs` | The four call types, type-locked verdict vocabularies, per-type required response shapes, default repair constraints, per-type block keys |
| `src/sol/contracts/ids.mjs` | Sprint-owned id conventions: `lcim_sol_ask_<32hex>` / `lcim_sol_resp_<32hex>` (the frozen Sprint-00 `src/shared/ids.mjs` is untouched) |
| `src/sol/contracts/evidence.mjs` | Deterministic evidence byte accounting, evidence-budget shape guard, truncation-marker shape |
| `src/sol/contracts/registry.mjs` | Sprint-06 schema manifest (`lcim.sol-ask`, `lcim.sol-response`, `lcim.repair-ticket`), loads via the shared Sprint-00 engine |
| `src/sol/contracts/errors.mjs` | `SolAskError` (SOL_ASK_INVALID / BUDGET_EXHAUSTED), `SolResponseError`, `SolRepairTicketError` |
| `src/sol/contracts/validate.mjs` | `validateSolAsk`, `validateSolResponse`, `validateRepairTicket` — schema + conditional rules + cross-document binding |
| `src/sol/ask-compiler/preflight.mjs` | Generic-ask / multi-question / bundled-concern / edit-request rejection (pure text predicates) |
| `src/sol/ask-compiler/evidence-budget.mjs` | Deterministic budget application: FAIL_CLOSED or TRUNCATE_SUMMARIZE (marker, never drops decision-critical evidence) |
| `src/sol/ask-compiler/compiler.mjs` | `compileSolAsk(input)` — preflight, defaults, budgeting, stamping, validation, deep freeze |
| `src/sol/ask-compiler/response.mjs` | `compileSolResponse(input, opts)` — verdict vocabulary, per-type blocks, bounded evidence, ask binding |
| `src/sol/ask-compiler/repair-ticket.mjs` | `compileRepairTicket({ask, response, semanticContract})` — deterministic conversion into the Sprint-04 repair contract + conversion record |
| `src/sol/ask-compiler/render.mjs` | Deterministic bounded prompt rendering via `prompts/sol/<call-type>.md` |
| `prompts/sol/*.md` | Per-call-type SOL ask templates (tracked, public-safe) |
| `schemas/sol-ask.v2.schema.json` | Document schema for compiled asks |
| `schemas/sol-response.v2.schema.json` | Document schema for compiled responses |
| `schemas/repair-ticket.v2.schema.json` | Document schema for the deterministic SOL→repair conversion record |

The shared Sprint-00 contracts (`src/shared/**`, `schemas/common/**`) and
the Sprint-04 contracts (`src/contracts/**`, `schemas/semantic-contract*`,
`schemas/acceptance-contract*`) are **not modified**. The three Sprint-06
schemas are self-contained and stay inside the Sprint-00 engine subset (no
`$ref`/`oneOf`/`format`/`minimum`), so the failure-closed keyword
discipline applies unchanged.

## Call types

| Call type | Primary decision | Verdicts | Per-type block |
|---|---|---|---|
| `SOL_CONTRACT_CHECK` | Are the exact semantics of the referenced authoritative contract(s) sufficiently specified? | `SUFFICIENTLY_SPECIFIED`, `AMENDMENTS_REQUIRED` | `contractCheck` |
| `SOL_DIAGNOSE` | Why does this ONE acceptance criterion fail? | `CAUSE_IDENTIFIED`, `CAUSE_UNRESOLVED` | `diagnose` |
| `SOL_FINAL_REVIEW` | Do the named high-risk invariants hold? | `PASS`, `FAIL` | `finalReview` |
| `SOL_RECHECK` | Is the prior finding resolved by the delta evidence? | `RESOLVED`, `NOT_RESOLVED` | `recheck` |

Every compiled ask carries: call ID/type, exactly one
`singleDecisionQuestion`, `whyNeeded`, authoritative contract bindings
(`contractRefs` — every ref resolves to a supplied validated source),
`establishedFacts`, ONE closed retained evidence universe (`evidence`),
explicit `passCondition` / `failCondition` (+ optional structured
`passEvidenceRefs` / `failEvidenceRefs`), `allowedScope` / `outOfScope`,
`requiredResponseShape`, `repairConstraints`, and `evidenceBudget`. The
verdict vocabularies are **type-locked**: a compiled ask's
`requiredResponseShape.verdicts` must equal the call type's vocabulary
exactly (`RESPONSE_SHAPE_MISMATCH` otherwise) — callers can never redefine
what SOL may answer.

## Preflight rejection (SOL_ASK_INVALID)

`preflightSolRequest({ decisionQuestion, whyNeeded, allowedScope })`
rejects, with `REJECTION_CODE.SOL_ASK_INVALID` (`SolAskError`):

- **generic asks** — `review this`, `look for bugs`, `diagnose
  everything`, `review the whole repo`, `find all bugs`, `are there any
  issues`, `overall quality`, ... (`GENERIC_ASK`);
- **not one primary decision question** — zero or multiple `?`,
  conjunctive interrogatives (`and is ...`, `and whether ...`),
  semicolon/newline-separated SECOND decision clauses (`Is the digest
  binding exact; is the lifecycle complete?` is rejected even with one
  `?`), a question spanning more than one call-type decision domain
  (`CROSS_DOMAIN_QUESTION`), or bundled concerns: two or more of
  architecture/implementation/testing/cleanup/refactoring in one question
  (`MULTIPLE_QUESTIONS`, `BUNDLED_CONCERNS` — the explicit non-goal "do
  not bundle architecture, implementation, testing, and cleanup into one
  decision question"). Question-shape rules apply to the PRIMARY QUESTION
  TEXT ONLY — a benign `?` inside evidence or established-fact prose never
  affects the primary question (SOL-S06-001);
- **edit requests** — `edit the file`, `apply the patch`, `implement the
  fix`, `make the changes`, `change the code`, ... SOL decides; SOL never
  edits files (`EDIT_REQUEST`).

Preflight is a pure function of text; the compiler fails closed on any
rejection, so no generic ask can ever be compiled into a `lcim.sol-ask`.

## The compiled ask document

`schemaName: lcim.sol-ask`, `schemaVersion: 2.0.0`. Top-level fields:

- `askId` — `lcim_sol_ask_<32hex>` (compiler-derived instance identity;
  caller-supplied `askId`/`compiledAt`/schema fields are rejected).
- `callType` + exactly one per-type block (`contractCheck` | `diagnose` |
  `finalReview` | `recheck`) matching the call type.
- `singleDecisionQuestion` — exactly one `?`, no conjunctive
  interrogatives, no semicolon/newline-separated decision clauses, no
  cross-domain vocabulary (preflight, SOL-S06-001).
- `contractRefs` — authoritative contract bindings: `contractKey` +
  REQUIRED `semanticDigest` + `requirementRefs` (sideEffectIds).
  **Every compiled ask resolves EVERY contractRef and EVERY
  requirementRef against the supplied validated Sprint-04 sources
  (`compileSolAsk` requires `opts.sources`)** — no source-free
  authoritative references (SOL-S06-002). Sources are validated with the
  Sprint-04 validator (never repaired/mutated; digests verified).
  CONTRACT_CHECK may bind valid COMPILED or CONTRACT_REVIEW_REQUIRED
  sources (review does not confer implementation authority);
  implementation-facing calls (DIAGNOSE/FINAL_REVIEW/RECHECK) require
  implementation-authoritative COMPILED sources
  (`SOURCE_NOT_IMPLEMENTATION_AUTHORITATIVE`).
- `establishedFacts`, `evidence` — the ONE closed retained evidence
  universe (SOL-S06-003): DIAGNOSE prior evidence and RECHECK delta
  evidence are normalized into this single pool at compile time and
  counted against the SAME budget; the blocks carry refs
  (`priorEvidenceRefs` / `deltaEvidenceRefs`).
- `passCondition` / `failCondition` with structured `passEvidenceRefs`
  / `failEvidenceRefs` — condition evidence dependencies are STRUCTURED
  and mechanically closed (SOL-S06-004 R2): if a condition's prose names
  an evidence-ref token (`ev.*` shape or an exact pool ref), that token
  MUST also appear in the corresponding structured dependency list
  (`CONDITION_EVIDENCE_REF_UNDECLARED` otherwise — a decision condition
  may never depend on evidence that can be silently dropped). Arbitrary
  prose is never parsed for meaning; only syntactic ref-token closure is
  enforced. Declared condition refs resolve to retained non-marker
  evidence, become protectedRefs before budgeting, and may never be
  truncated (`BUDGET_EXHAUSTED` when they cannot fit).
- `requiredResponseShape` — defaults per call type (verdicts + fields);
  verdicts type-locked.
- `repairConstraints` — default `{ maxMustChangeTargets: 1,
  mustNotChangeRequired: true, boundedToRejectedAcceptance: true }`.
- `evidenceBudget` — default `{ maxItems: 16, maxBytes: 8192,
  onOverflow: 'FAIL_CLOSED' }`.
- `compiledAt`.

Per-type blocks:

- `contractCheck: { amendmentsOnly: true, expectedVerdicts }` — asks
  ONLY whether exact semantics are sufficiently specified; amendments are
  the only output besides `SUFFICIENTLY_SPECIFIED`.
- `diagnose: { acceptanceCriterionRef, criterionRequirement,
  priorEvidenceRefs? }` — exactly one criterion (a sideEffectId) that
  must be declared among `contractRefs[].requirementRefs`
  (`CRITERION_NOT_DECLARED`); with sources it must resolve to a source
  negative side-effect item and `criterionRequirement` must quote the
  source requirement verbatim (`CRITERION_UNKNOWN_TO_SOURCE`,
  `CRITERION_REQUIREMENT_MISMATCH`).
- `finalReview: { invariantChecklist, maxAdjacentCriticalDefects: 1 }` —
  NAMED high-risk invariants (`invariantId` unique, `invariant`,
  `lockedRequirementRef` — each must be a declared requirementRef,
  `INVARIANT_REQUIREMENT_UNBOUND`); at most one adjacent critical defect
  outside the checklist is admissible (constant
  `MAX_ADJACENT_CRITICAL_DEFECTS`).
- `recheck: { priorFindingRef, priorAskId, priorResponseId,
  priorFindingDigest, deltaEvidenceRefs, neighboringInvariants,
  mustNotReopen: true }` — trusted provenance (SOL-S06-008):
  `compileSolAsk` requires the validated prior compiled ask+response
  (`opts.prior`); the priorFindingRef must resolve to an actual finding
  of that bound prior response and its exact content digest is frozen
  into the ask (`PRIOR_FINDING_UNKNOWN`, `PRIOR_CHAIN_INVALID`,
  `PRIOR_FINDING_DIGEST_MISMATCH`). Neighboring invariants resolve to a
  closed authoritative set: declared requirementRefs of the ask (bound
  source requirement IDs) — arbitrary caller strings are never neighbors
  (`NEIGHBOR_UNBOUND`). RECHECK evidence is delta-only: the SOL-visible
  evidence universe is exactly the retained delta evidence
  (`RECHECK_NONDELTA_EVIDENCE`). RECHECK responses must not expand or
  mutate that universe (SOL-S06-008 R2): independent response evidence
  duplication is prohibited entirely — `response.evidence` must be empty
  (`RECHECK_RESPONSE_EVIDENCE_FORBIDDEN`) and findings cite ask delta
  evidence directly.

Compiled asks are **deeply immutable** (deep clone + deep freeze), so a
validated ask can never be altered into an unbounded request.

## Evidence budgets (Sprint-06 rule 9)

Byte accounting is deterministic: each evidence item costs
`byteLength(ref) + byteLength(content) + 32` overhead. Budgets are
positive integers (engine subset has no minimum). Overflow behavior:

- `FAIL_CLOSED` — an over-budget packet is rejected with
  `BUDGET_EXHAUSTED`; oversized ambiguous packets are **rejected, never
  silently broadened**.
- `TRUNCATE_SUMMARIZE` — deterministic truncation keeps evidence in
  authored order within the budget, reserving the marker slot up front,
  and appends exactly one `lcim.budget.truncation-marker` as the LAST
  item (`kept N of M evidence items (B of C bytes); dropped items were
  non-decision-critical and are summarized`). `decisionCritical` evidence
  AND evidence referenced by any decision-bearing rule (pass/fail refs,
  prior/delta refs, failure/finding/adjacent refs) is **never dropped**
  (SOL-S06-004): if required decision evidence cannot fit, the compile
  fails closed even under TRUNCATE_SUMMARIZE. The marker is itself
  counted against the budget; a truncation that cannot be recorded also
  fails closed. Truncation never merges, invents, or reorders. The marker
  is NOT substantive evidence: it belongs to no resolvable ordinary
  evidence-ref set and can never satisfy an evidence reference
  (`EVIDENCE_REF_MARKER`).

`validateSolAsk` verifies a compiled document still fits its own budget
(`EVIDENCE_BUDGET_EXCEEDED`) and that any marker is well-formed and last
(`INVALID_TRUNCATION_MARKER`).

## The response document

`schemaName: lcim.sol-response`, `schemaVersion: 2.0.0`. Fields:
`responseId` (`lcim_sol_resp_<32hex>`), `askId` (binding), `callType`,
`verdict` (type-locked vocabulary), `decisionSummary` (bounded), bounded
`evidence`, plus per-type content:

**`compileSolResponse` REQUIRES the actual compiled ask document
(SOL-S06-006)** — `opts.ask` is mandatory; a pattern-valid `askId` alone
is never enough. The response binds exact askId + callType, applies the
exact verdict vocabulary and call-specific block rules, and resolves
every finding/evidence/invariant/ref against that ask. The lower-level
`validateSolResponse(doc, opts)` remains available for static fixtures
but is NOT equivalent to response compilation.

- `amendment.exactAmendments[]` — CONTRACT_CHECK only; each carries
  `contractKey` (must be one of the ask's contractRefs), `target`,
  `current`, `exactAmendment`, `reason`. `SUFFICIENTLY_SPECIFIED` carries
  no amendment; `AMENDMENTS_REQUIRED` must
  (`CONTRACT_CHECK_AMENDMENT_MISMATCH`, `AMENDMENT_CONTRACT_UNKNOWN`).
- `failure` — DIAGNOSE only: `rootCause`, `evidenceRefs` (each must
  resolve to retained NON-MARKER evidence of the ask or response),
  `repair { mustChange, mustNotChange, exactTests, verification }`,
  `falsification`. SOL never authors authority-bearing acceptance
  semantics (SOL-S06-009): the response schema carries no
  objective/violation/requiredBehavior fields — those are derived from
  the source at repair conversion. `CAUSE_IDENTIFIED` requires the
  failure block; `CAUSE_UNRESOLVED` forbids it
  (`DIAGNOSE_FAILURE_MISMATCH`). With the ask+source contract,
  `mustChange` targets stay inside the diagnosed criterion's side-effect
  scope and within `maxMustChangeTargets` (`FAILURE_SCOPE_UNBOUNDED`,
  `FAILURE_TARGET_COUNT_EXCEEDED`), `mustNotChange` is required when the
  ask's repair constraints demand it (`FAILURE_MUST_NOT_CHANGE_MISSING`),
  exact tests may reference only the diagnosed criterion
  (`TEST_CRITERION_UNKNOWN`), and a criterion-bound exact test's
  expectation must equal the source requirement verbatim
  (`TEST_EXPECTATION_MISMATCH`). At most one finding, scoped to the
  criterion (`DIAGNOSE_FINDING_SCOPE`).
- `findings[]` — FINAL_REVIEW: each finding references a NAMED checklist
  invariant (`invariantRef`; `FINAL_REVIEW_UNKNOWN_INVARIANT`), its
  evidence refs resolve to retained NON-MARKER evidence
  (`FINDING_EVIDENCE_UNRESOLVED`), PASS carries none, FAIL requires at
  least one with a CRITICAL basis (`FINAL_REVIEW_PASS_WITH_FINDINGS`,
  `FINAL_REVIEW_FAIL_WITHOUT_FINDINGS`,
  `FINAL_REVIEW_FAIL_WITHOUT_CRITICAL`). RECHECK: RESOLVED carries none,
  NOT_RESOLVED carries the prior finding or a bound neighbor only —
  reopening unrelated findings fails (`RECHECK_RESOLVED_WITH_FINDINGS`,
  `RECHECK_UNRESOLVED_WITHOUT_FINDINGS`, `RECHECK_REOPEN`), and RECHECK
  finding evidence refs resolve within the retained delta evidence
  universe only (`RECHECK_EVIDENCE_UNRESOLVED`).
- `adjacentCriticalDefects[]` — FINAL_REVIEW only, at most one
  (`MAX_ADJACENT_CRITICAL_DEFECTS`), only under FAIL, each with
  `summary`, `evidenceRefs` (resolving to retained NON-MARKER evidence,
  `ADJACENT_EVIDENCE_UNRESOLVED`) and `lockedRequirementRef` (resolving
  to a declared bound requirement of the ask,
  `ADJACENT_REQUIREMENT_UNBOUND`) — free-form text is never proof of
  either (SOL-S06-007); the "at most one adjacent critical defect
  outside checklist only when directly evidenced and violating a locked
  requirement" rule (`FINAL_REVIEW_ADJACENT_WITHOUT_FAIL`).

Response evidence is bounded by the ask's evidence budget (or the
default) with the same truncation rules
(`RESPONSE_EVIDENCE_BUDGET_EXCEEDED`); decision-referenced response
evidence (failure/finding/adjacent refs) is protected from truncation.
The unbounded-recommendation scan applies to ALL model-authored free-text
fields via ONE deterministic structural collector (SOL-S06-007 R2):
decision summary, response evidence content, finding summaries, adjacent
summaries, amendment texts, DIAGNOSE root-cause/falsification prose,
mustChange/mustNotChange descriptions, exact-test name/command/
expectation (commands are model-authored text and are never trusted
merely because they look executable, SOL-S06-007 R3), verification text —
rejected with `UNBOUNDED_RECOMMENDATION`. Never
scanned: schema metadata, controller-generated IDs, enum values,
evidence refs, and source-authoritative text merely referenced verbatim
(criterion-bound exact-test expectations equal the source requirement by
contract and are excluded — source text containing innocent words like
"cleanup" is never treated as model recommendation output).

## Deterministic repair-ticket conversion (Sprint-06 rules 8-10)

FROZEN policy: only `SOL_DIAGNOSE` + `CAUSE_IDENTIFIED` may compile
directly into the worker-ready Sprint-04 repair artifact. CONTRACT_CHECK
amendments, FINAL_REVIEW findings, and RECHECK findings never convert
directly — they require another bounded diagnose/decision flow first.

`compileRepairTicket({ ask, response, sources })` compiles a DIAGNOSE
`CAUSE_IDENTIFIED` failure output **deterministically** into the
Sprint-04 worker-ready repair contract (`lcim.acceptance-contract` via
`buildRepairContract`), plus a conversion record (`lcim.repair-ticket`).
It INDEPENDENTLY revalidates the complete chain
SOURCE -> COMPILED ASK -> COMPILED RESPONSE -> REPAIR CONVERSION
(SOL-S06-009) and never trusts that callers previously invoked
validators:

1. every supplied source is validated with the Sprint-04 validator
   (never repaired/mutated) and must be implementation-authoritative
   (COMPILED);
2. the ask is validated against the sources — every contractRef/
   requirementRef bound, criterion identity/digest binding;
3. the response is validated against that exact ask/source — verdict,
   repair constraints (maxMustChangeTargets, mustNotChangeRequired),
   evidence refs, exact-test binding;
4. `rejectedAcceptanceRefs` = the single diagnosed criterion; the repair
   source is derived from the EXACT ASK BINDING, never from source-array
   order (SOL-S06-009 R2): the UNIQUE contractRef whose requirementRefs
   contains the criterion is resolved by (contractKey, semanticDigest)
   against the supplied sources — zero claiming refs or more than one
   (ambiguous) fail closed (`CRITERION_BINDING_MISSING`,
   `AMBIGUOUS_CRITERION_BINDING`), other supplied sources are ignored
   even if they contain an identical side-effect/criterion, and source
   ordering never affects conversion; the repair `mustChange` targets
   stay inside the criterion's side-effect scope (never widened; the
   Sprint-04 builder enforces the same bound `UNBOUNDED_MUST_CHANGE`);
5. authority-bearing acceptance semantics are SOURCE-DERIVED: the
   repair's objective/violation/requiredBehavior are derived from the
   source requirement text — SOL may supply root cause, smallest bounded
   implementation repair, implementation-local mustChange/mustNotChange
   within permitted scope, and falsification/verification, but never
   rewrites the authoritative acceptance contract. Criterion-bound exact
   tests (expectation verified verbatim against the source requirement)
   are keyed by their deterministic `sideEffectId` and pin the source
   scope/count exactly; other SOL exact tests are implementation
   verification hints and are excluded from the authoritative contract;
6. frozen requirements and negative side effects are preserved by the
   Sprint-04 builder (every source side effect keeps its identity and its
   own acceptance test).

Content-bound identity (SOL-S06-010): `conversionDigest` = sha256 over
the canonical authority-bearing conversion payload
(sourceSemanticDigest, bound ask identity/type/criterion, response
content digest, derived acceptance semantics, normalized bounded repair
content: mustChange/mustNotChange/criterion-bound exact tests/
verification, relevant finding refs). `repairId` is derived from that
digest (`lcim_repair_` + first 32 hex), and `createdAt` is the response's
`compiledAt`. Timestamps/randomness never enter the identity: identical
conversions are idempotent; two same-ID responses with materially
different content produce different content-bound repair IDs.

The `lcim.repair-ticket` record binds the ticket to the exchange:
`ticketId` (= `repairId`), `sourceAskId`, `sourceResponseId`, `callType`
(const `SOL_DIAGNOSE`), `repairId`, `contractKey`,
`sourceSemanticDigest`, `rejectedAcceptanceRefs`, `conversionDigest`,
`compiledAt`. `ticketId === repairId` is enforced
(`TICKET_ID_MISMATCH`).

## Renderers

`renderSolAsk(ask)` renders a compiled ask into the bounded, deterministic
prompt text SOL receives, using `prompts/sol/<call-type>.md`. Rendering is
deterministic (same ask → same text) and ALL-OR-NOTHING (SOL-S06-005):
a valid compiled decision contract is never substring/sliced. If the
COMPLETE render exceeds the supported hard rendered-packet limit
(`SOL_RENDER_MAX_BYTES` = 32768), rendering fails closed with a
structured `SolAskError` (`RENDER_LIMIT_EXCEEDED`) — never a partially
truncated prompt, and no authority-bearing field is silently summarized
(evidence summarization is governed only by the evidence-budget
contract; the retained evidence universe renders exactly once, in full).
Transport to ChatGPT SOL Pro is Sprint 07's territory (manual, TEXT
ONLY).

## Running the tests

```bash
node --test tests/sol/*.test.mjs   # Sprint 06 focused tests
npm test                            # full suite incl. Sprint-00/01/02/03/04/05 regression
```

## Fixtures

`tests/fixtures/sol/` maps the call types and the key failure classes:
valid compiled asks per call type, valid responses per verdict family,
the deterministic repair ticket, and invalid documents (missing
pass/fail, unknown verdict, unbounded failure, recheck reopen, ...).
