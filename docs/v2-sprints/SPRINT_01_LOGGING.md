
# Sprint 01 — Canonical invocation ledger, run lifecycle, and local evidence storage

**Repository:** `/Users/lawrencebois-yan/Documents/LCIM`  
**Dependencies:** Sprint 00  
**Parallel status:** PARALLEL-SAFE in Wave 1

## Objective

Build the controller-owned append-only evidence system so every model call is auditable and periodic workflow reviews do not depend on raw transcripts.

## Owned files/modules

Primary ownership:
- `src/logging/**`
- `src/runtime/**` logging/run-store pieces
- `schemas/event.v2.schema.json`
- `schemas/invocation.v2.schema.json`
- `schemas/run.v2.schema.json`
- `tests/logging/**`

## Required implementation

1. Implement one shared invocation wrapper/lifecycle API used by every future provider adapter.
2. Canonical lifecycle: exactly one START, one COMPLETION, one ASSESSMENT per invocation ID.
3. Store V2 run state under `<git-common-dir>/lcim/runs/<run_id>/`.
4. Implement append-only `events.v2.jsonl` with monotonic sequence and integrity chaining/digests. Historical events cannot be rewritten.
5. Implement crash/orphan reconciliation via explicit reconciliation/supersession events, never mutation.
6. Run finalizer must detect cardinality failures and mark `INCOMPLETE_LEDGER` while preserving patch evidence.
7. Persist compact invocation records suitable for later projection. Record model/provider/role/reasoning, timestamps, status, usage when available, and error/rejection taxonomy fields without secrets.
8. Provide optional compressed raw event/transcript sink locally. Raw data is not committed or included in normal review export.
9. Add a deterministic log reader and validator. Keep reporting/analytics themselves for Sprint 08.

## Explicit non-goals

Fault-test normal success, provider error, timeout, crash after START, crash after COMPLETION, assessment writer failure, duplicate event, orphan reconciliation, two linked worktrees, integrity-chain tampering, and ledger finalization.

## Acceptance criteria

- Do not implement model routing.
- Do not make worker result parsing part of the ledger.
- Do not add audit dashboards/summary metrics beyond minimal validator output.
- Do not store credentials or prompt bodies that fail redaction policy.

## Required tests

- All successful invocation fixtures have exactly 1 START/1 COMPLETION/1 ASSESSMENT.
- Crashes at each lifecycle point produce recoverable/orphan states without deleting evidence.
- Duplicate lifecycle events fail closed or are explicitly reconciled.
- Finalizer detects incomplete lifecycle.
- Run metadata records LCIM version/commit, target base, config digest, schema version.
- Linked worktrees share one Git-common run store.

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
Work in /Users/lawrencebois-yan/Documents/LCIM (or the dedicated worktree created for Sprint 01).

Read docs/v2-sprints/00_MASTER_PLAN.md and this Sprint 01 file completely before editing.

Execute Sprint 01 — Canonical invocation ledger, run lifecycle, and local evidence storage as an implementation task. Inspect the current repository state first and do not assume files/interfaces that are not present. Respect the sprint-owned file boundaries and existing reviewed shared interfaces. Implement the code, schemas, tests, and documentation required by this sprint; run the specified targeted tests plus any directly affected regression tests.

Do not commit, push, merge, open a PR, modify credentials/shell profiles, or upload any repository artifact to ChatGPT. DeepSeek work must use xhigh/MAX. If SOL is genuinely required, compile one precise decision question with explicit pass/fail conditions and bounded evidence; do not ask SOL to generally review the sprint. ChatGPT SOL Pro, if truly required, is manual text-only and must receive no files.

At the end, return the sprint completion report required by the master plan, including exact tests/results and any interface-change request. Do not claim completion when an acceptance criterion is not demonstrated.

```
