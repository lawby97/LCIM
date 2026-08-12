
# Sprint 08 — Audit projections, workflow metrics, REVIEW.md, and local review export

**Repository:** `/Users/lawrencebois-yan/Documents/LCIM`  
**Dependencies:** Sprint 01 integrated  
**Parallel status:** PARALLEL-SAFE in Wave 2

## Objective

Turn canonical V2 evidence into clean periodic workflow-review data so LCIM can be optimized from measured outcomes rather than raw multi-megabyte transcripts.

## Owned files/modules

Primary ownership:
- `src/audit/**`
- `src/reporting/**`
- `schemas/review-summary.v2.schema.json`
- `docs/v2-logging-and-audit.md`
- `tests/audit/**`

## Required implementation

1. Build deterministic projections: `invocations.jsonl`, `work-units.jsonl`, `reviews.jsonl`, `usage.jsonl`, `final.json`, and readable `REVIEW.md` from canonical events/evidence.
2. Metrics include LCIM version/commit, calls by model/role/reasoning, first-pass acceptance, repair acceptance, semantic rejection, transport/schema failures, wrong-base, scope violations, SOL/Sol Pro/Pro escalation rates, calls per accepted work unit, tokens/cost when available, rejected-call waste, rejection taxonomy, SOL findings, findings surviving first repair, ledger completeness, orphan count, normalization count.
3. Add `audit --last N` service/API and `review-export --last N` local exporter; Sprint 10 wires final CLI commands.
4. Normal review export excludes raw transcripts and sensitive target-repo source. It may include hashes/IDs and sanitized bounded examples.
5. Raw logs remain local/compressed for forensic review.
6. Metrics must distinguish model-reported work status, transport/schema status, controller validation, semantic disposition, and final integration.
7. Missing historical facts are represented as unknown, not guessed.

## Explicit non-goals

Use synthetic multi-run fixtures covering accepted first-pass, repair, semantic rejection, transport failure with useful patch, wrong base, Sol finding/recheck, incomplete ledger, unknown usage, and mixed providers. Verify metric reconciliation exactly.

## Acceptance criteria

- Do not mutate canonical events.
- Do not upload review exports.
- Do not include raw business source or secrets in normal review reports.
- Do not make a dashboard/UI; Markdown/JSONL/CLI-readable output is sufficient.

## Required tests

- REVIEW.md can support a workflow review without opening raw transcripts for normal cases.
- Metrics reconcile to canonical lifecycle counts.
- Cost/token metrics show unknown when provider usage unavailable rather than inventing values.
- Rejected-call cost is separately visible.
- Reports clearly separate transport failure from semantic rejection and final adoption.
- Export remains local and sanitized.

## Deliverables

- implementation for this sprint;
- focused tests and fixtures;
- documentation for the new contract/behavior;
- sprint completion report;
- interface-change request only if a shared interface genuinely must change.


## Repository and global constraints

- Canonical working repository: `/Users/lawrencebois-yan/Documents/LCIM`.
- Treat the GitHub repository as public-safe: never commit API keys, Codex/ChatGPT auth, DeepSeek credentials, raw business-repository source excerpts, raw model transcripts, local Sol Pro escalation payloads, or runtime logs.
- Runtime state belongs under the target repository Git common directory, not in the LCIM source tree.
- Do not automatically commit, push, merge, open a PR, modify shell profiles, modify credentials, or upload files to ChatGPT.
- Do not use an in-progress V2 implementation to orchestrate its own construction until Sprint 11 explicitly tests self-hosting. Use the existing known-good V1 controller or a normal Codex/Pi development session.
- DeepSeek implementation policy: Flash `xhigh` through Pi by default; explicit MAX where the provider/integration exposes it and the sprint warrants it. Never deliberately downgrade DeepSeek work to low/medium/high.
- Terra and Luna are not normal escalation rungs.
- SOL is for bounded judgment. Every SOL call must contain one primary decision question, explicit pass/fail conditions, bounded evidence, out-of-scope limits, and an exact response contract.
- ChatGPT SOL Pro is manual and TEXT ONLY. No repository file, Markdown file, log, patch, ZIP, JSON packet, or other attachment may be uploaded to ChatGPT Pro by LCIM.
- Preserve the V1 safety boundaries: isolated worktrees, explicit base SHAs, no worker commits, no worker pushes/merges, no destructive reset/clean, permission gates for external providers, denied-path/secret filtering, exact model discovery, hard budgets, independent validation, and no automatic publication.

## Exact prompt to paste into Codex/Pi

```text
Work in /Users/lawrencebois-yan/Documents/LCIM (or the dedicated worktree created for Sprint 08).

Read docs/v2-sprints/00_MASTER_PLAN.md and this Sprint 08 file completely before editing.

Execute Sprint 08 — Audit projections, workflow metrics, REVIEW.md, and local review export as an implementation task. Inspect the current repository state first and do not assume files/interfaces that are not present. Respect the sprint-owned file boundaries and existing reviewed shared interfaces. Implement the code, schemas, tests, and documentation required by this sprint; run the specified targeted tests plus any directly affected regression tests.

Do not commit, push, merge, open a PR, modify credentials/shell profiles, or upload any repository artifact to ChatGPT. DeepSeek work must use xhigh/MAX. If SOL is genuinely required, compile one precise decision question with explicit pass/fail conditions and bounded evidence; do not ask SOL to generally review the sprint. ChatGPT SOL Pro, if truly required, is manual text-only and must receive no files.

At the end, return the sprint completion report required by the master plan, including exact tests/results and any interface-change request. Do not claim completion when an acceptance criterion is not demonstrated.

```
