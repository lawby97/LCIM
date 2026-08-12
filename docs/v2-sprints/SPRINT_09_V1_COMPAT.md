
# Sprint 09 — V1 compatibility reader and migration semantics

**Repository:** `/Users/lawrencebois-yan/Documents/LCIM`  
**Dependencies:** Sprints 01 and 02 integrated  
**Parallel status:** PARALLEL-SAFE in Wave 2

## Objective

Preserve historical V1 evidence without rewriting it and allow V2 audit tools to interpret what can be known from V1 runs, explicitly marking facts that cannot be established.

## Owned files/modules

Primary ownership:
- `src/compat/v1/**`
- `schemas/compat/**`
- `tests/compat/v1/**`
- `docs/v2-migration.md` V1 sections
- public-safe V1 fixtures only

## Required implementation

1. Implement read-only parsing for V1 assignment ledger/event format, work-unit handoffs, and available final-response evidence using sanitized fixtures derived from the known V1 schemas/failure patterns.
2. Never rewrite V1 logs or change their historical hashes.
3. Normalize known facts into V2 projection inputs with provenance `V1_COMPAT`.
4. Any unavailable/ambiguous fact becomes `UNKNOWN_V1`, never inferred.
5. Preserve distinctions visible in BL-020: worker claimed PATCH_READY, handoff schema invalid, patch may still have been useful, controller manually integrated, later ledger events missing.
6. Add migration documentation explaining what is and is not comparable between V1 and V2 metrics.
7. Add compatibility version detection and fail clearly on unsupported legacy variants.

## Explicit non-goals

Test a valid V1 lifecycle, incomplete ledger, hash-chain fixture, schema-invalid worker handoff, fenced/prose response, missing test log path, missing later invocation records, unsupported V1 version, and mutation-protection.

## Acceptance criteria

- Do not import raw business-repo source or the large review ZIP into the public LCIM repo.
- Do not fabricate later BL-020 ledger events.
- Do not mutate V1 evidence.
- Do not make V2 behavior depend on V1 parser availability.

## Required tests

- V1 fixtures parse read-only.
- Unknown data is `UNKNOWN_V1`.
- Legacy schema-invalid-but-parseable handoff is represented without pretending it was V2-valid.
- Missing ledger coverage is visible as incomplete/unknown rather than zero activity.
- V1 history remains byte-for-byte unchanged in mutation tests.

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
Work in /Users/lawrencebois-yan/Documents/LCIM (or the dedicated worktree created for Sprint 09).

Read docs/v2-sprints/00_MASTER_PLAN.md and this Sprint 09 file completely before editing.

Execute Sprint 09 — V1 compatibility reader and migration semantics as an implementation task. Inspect the current repository state first and do not assume files/interfaces that are not present. Respect the sprint-owned file boundaries and existing reviewed shared interfaces. Implement the code, schemas, tests, and documentation required by this sprint; run the specified targeted tests plus any directly affected regression tests.

Do not commit, push, merge, open a PR, modify credentials/shell profiles, or upload any repository artifact to ChatGPT. DeepSeek work must use xhigh/MAX. If SOL is genuinely required, compile one precise decision question with explicit pass/fail conditions and bounded evidence; do not ask SOL to generally review the sprint. ChatGPT SOL Pro, if truly required, is manual text-only and must receive no files.

At the end, return the sprint completion report required by the master plan, including exact tests/results and any interface-change request. Do not claim completion when an acceptance criterion is not demonstrated.

```
