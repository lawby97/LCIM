
# Sprint 02 — Simplified worker contract, safe parsing, and patch/transport separation

**Repository:** `/Users/lawrencebois-yan/Documents/LCIM`  
**Dependencies:** Sprint 00  
**Parallel status:** PARALLEL-SAFE in Wave 1

## Objective

Remove objective controller facts from model handoffs and make malformed transport a recoverable evidence defect rather than automatic destruction of a useful isolated patch.

## Owned files/modules

Primary ownership:
- `src/workers/**`
- `src/handoff/**`
- `schemas/worker-result.v2.schema.json`
- `schemas/work-unit.v2.schema.json` worker-facing portions
- `prompts/deepseek/**` worker response contracts
- `tests/workers/**`

## Required implementation

1. Worker statuses are only `WORK_COMPLETE`, `BLOCKED`, `FAILED`, `NO_CHANGE` (or equally narrow documented equivalents). Worker must never authoritatively emit `PATCH_READY`.
2. Worker response schema contains only model-owned communication: IDs, bounded summary, acceptance claims with evidence refs, remaining issues, review risks.
3. Remove changed-file lists, line counts, patch hashes, HEAD/base claims, test-log paths, test exit status, secret scan, and integration status from worker responsibility.
4. Implement strict parse first, then recorded syntactic normalization only for: one JSON fence, or one uniquely identifiable JSON object with harmless prefix/suffix prose. Never invent missing semantic fields or rewrite types to satisfy schema.
5. Separate states: model process completion, response parsed, response schema valid, patch observed, controller validation. A malformed response must not erase the worktree/patch evidence.
6. Preserve exact raw final response locally for debugging; normal reports reference it but do not commit it.
7. Update worker prompts to avoid pressure toward success; explicitly permit BLOCKED/FAILED and require factual uncertainty reporting.

## Explicit non-goals

Use fixtures mirroring BL-020 patterns: strict JSON, fenced JSON, prose-wrapped JSON, `evidence` string vs array legacy mismatch, null log path, malformed JSON, multiple objects, correct BLOCKED, worker says success while controller fixture later fails.

## Acceptance criteria

- Do not inspect Git diffs or decide path/base validity; Sprint 03 owns that.
- Do not decide semantic acceptance.
- Do not route to models.
- Do not repair a semantically wrong response just to make schema validation pass.

## Required tests

- Worker cannot claim `PATCH_READY` in the V2 schema.
- Strict JSON, fenced JSON, and one unique prose-wrapped JSON object behave as specified and record normalization.
- Ambiguous multiple JSON objects and malformed JSON remain invalid.
- Invalid/missing handoff does not mark the underlying isolated patch nonexistent.
- Objective evidence fields from V1 are absent from the worker schema.
- Prompt tests demonstrate no forced-success language.

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
Work in /Users/lawrencebois-yan/Documents/LCIM (or the dedicated worktree created for Sprint 02).

Read docs/v2-sprints/00_MASTER_PLAN.md and this Sprint 02 file completely before editing.

Execute Sprint 02 — Simplified worker contract, safe parsing, and patch/transport separation as an implementation task. Inspect the current repository state first and do not assume files/interfaces that are not present. Respect the sprint-owned file boundaries and existing reviewed shared interfaces. Implement the code, schemas, tests, and documentation required by this sprint; run the specified targeted tests plus any directly affected regression tests.

Do not commit, push, merge, open a PR, modify credentials/shell profiles, or upload any repository artifact to ChatGPT. DeepSeek work must use xhigh/MAX. If SOL is genuinely required, compile one precise decision question with explicit pass/fail conditions and bounded evidence; do not ask SOL to generally review the sprint. ChatGPT SOL Pro, if truly required, is manual text-only and must receive no files.

At the end, return the sprint completion report required by the master plan, including exact tests/results and any interface-change request. Do not claim completion when an acceptance criterion is not demonstrated.

```
