
# Sprint 06 — SOL Ask Compiler and precise decision contracts

**Repository:** `/Users/lawrencebois-yan/Documents/LCIM`  
**Dependencies:** Sprints 02 and 04 integrated  
**Parallel status:** PARALLEL-SAFE in Wave 2

## Objective

Turn SOL from a broad reviewer into a bounded decision engine. Every SOL call must ask one primary question and return a response that can be evaluated or converted directly into one repair ticket.

## Owned files/modules

Primary ownership:
- `src/sol/ask-compiler/**`
- `src/sol/contracts/**`
- `prompts/sol/**`
- `schemas/sol-ask.v2.schema.json`
- `schemas/sol-response.v2.schema.json`
- `schemas/repair-ticket.v2.schema.json`
- `docs/v2-sol-contract.md`
- `tests/sol/**` ask-compiler tests

## Required implementation

1. Implement call types: `SOL_CONTRACT_CHECK`, `SOL_DIAGNOSE`, `SOL_FINAL_REVIEW`, `SOL_RECHECK`.
2. Every compiled ask contains: call ID/type, one `single_decision_question`, why needed, authoritative contract IDs/requirements, established facts, bounded evidence, explicit pass condition, explicit fail condition, allowed scope, out-of-scope, required response shape, repair constraints, evidence budget.
3. Reject generic asks such as `review this`, `look for bugs`, `diagnose everything`, or prompts with multiple independent primary questions.
4. CONTRACT_CHECK asks only whether exact semantics are sufficiently specified and returns exact amendments if not.
5. DIAGNOSE asks why one specific acceptance criterion fails and returns root cause/evidence/smallest safe repair/must-change/must-not-change/exact tests/falsification.
6. FINAL_REVIEW compiles a named high-risk invariant checklist. Allow at most one adjacent critical defect outside checklist only when directly evidenced and violating a locked requirement.
7. RECHECK is delta-only around one prior finding and explicitly named neighboring invariants; it must not reopen the entire task.
8. SOL failure output compiles deterministically into the Sprint-04 repair-ticket schema.
9. Add evidence-budget truncation/summarization rules that preserve exact decision evidence and reject oversized ambiguous packets rather than silently broadening them.

## Explicit non-goals

Test generic ask rejection, multiple-question rejection, each call type, evidence over-budget, omitted pass/fail, unsupported scope expansion, repair-ticket conversion, adjacent-critical exception, and recheck that tries to reopen unrelated findings.

## Acceptance criteria

- Do not implement ChatGPT Pro online/manual transport; Sprint 07 owns that.
- Do not ask SOL to edit files.
- Do not allow generic cleanup/refactoring recommendations in bounded review output.
- Do not bundle architecture, implementation, testing, and cleanup into one decision question.

## Required tests

- Generic SOL asks fail preflight.
- Every valid ask has exactly one primary decision question and explicit pass/fail.
- DIAGNOSE output yields one worker-ready repair ticket.
- FINAL_REVIEW uses named invariants instead of open-ended review.
- RECHECK consumes prior finding + delta evidence only.
- Evidence budgets fail closed when required decision evidence cannot fit.

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
Work in /Users/lawrencebois-yan/Documents/LCIM (or the dedicated worktree created for Sprint 06).

Read docs/v2-sprints/00_MASTER_PLAN.md and this Sprint 06 file completely before editing.

Execute Sprint 06 — SOL Ask Compiler and precise decision contracts as an implementation task. Inspect the current repository state first and do not assume files/interfaces that are not present. Respect the sprint-owned file boundaries and existing reviewed shared interfaces. Implement the code, schemas, tests, and documentation required by this sprint; run the specified targeted tests plus any directly affected regression tests.

Do not commit, push, merge, open a PR, modify credentials/shell profiles, or upload any repository artifact to ChatGPT. DeepSeek work must use xhigh/MAX. If SOL is genuinely required, compile one precise decision question with explicit pass/fail conditions and bounded evidence; do not ask SOL to generally review the sprint. ChatGPT SOL Pro, if truly required, is manual text-only and must receive no files.

At the end, return the sprint completion report required by the master plan, including exact tests/results and any interface-change request. Do not claim completion when an acceptance criterion is not demonstrated.

```
