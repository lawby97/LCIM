
# Sprint 07 — Manual text-only ChatGPT SOL Pro escalation boundary

**Repository:** `/Users/lawrencebois-yan/Documents/LCIM`  
**Dependencies:** Sprints 01 and 06 integrated  
**Parallel status:** CONDITIONALLY PARALLEL — may start once 01+06 base exists

## Objective

Implement a hard privacy/transport boundary: ChatGPT SOL Pro escalation is manually pasted bounded text only. LCIM must not upload or attach repository artifacts.

## Owned files/modules

Primary ownership:
- `src/sol/pro-handoff/**`
- `src/redaction/**` Pro-boundary-specific extensions only
- `schemas/sol-pro-escalation.v2.schema.json`
- `docs/v2-sol-pro-text-boundary.md`
- `tests/sol-pro/**`

## Required implementation

1. Persist local escalation evidence under Git-common runtime storage for audit, never in tracked source.
2. Implement `pro-copy` service that loads local evidence, applies secret/path redaction, invokes the SOL Ask Compiler, enforces a default 12,000-character hard text limit, renders plain text, and writes to the macOS clipboard (`pbcopy`) through a testable adapter.
3. It prints manual UI instructions only. It must never open an upload dialog, attach a file, call an OpenAI API, or send automatically.
4. Online payload contains only task, single question, locked contract, minimal code/diff excerpts, minimal failure/test evidence, previous attempt/controller rejection, and exact response format.
5. Never include full repository, full transcript, full diff, full log, raw JSON packet, or file attachment.
6. Support same-conversation follow-ups by recording escalation/finding IDs and rendering delta-only subsequent text.
7. Manual pasted-back response parser validates the expected SOL Pro directive and converts it to a repair ticket only if IDs/contract match.
8. Oversized or unredactable evidence fails closed and tells the user what must be reduced locally.

## Explicit non-goals

Mock `pbcopy`; test secret fixtures, local paths, file-like evidence, exact 12k boundary, oversized input, unredactable secret, no network calls, no attachment calls, first escalation, delta follow-up, wrong response ID, malformed Pro response, and repair-ticket conversion.

## Acceptance criteria

- No OpenAI Responses/API fallback.
- No automated browser sending.
- No attachment/file upload path.
- No copying local file paths unnecessarily into the online payload.
- Do not assume online conversation state is guaranteed; include compact identifiers/contract context needed for correctness.

## Required tests

- `pro-copy` produces clipboard text only.
- Static/dynamic tests prove there is no file-attachment/upload API in this path.
- Secret and local-path redaction occurs before clipboard write.
- Default 12k character limit is enforced.
- Oversized evidence fails closed.
- Follow-up request contains only delta evidence plus identifiers.
- Returned directive must match expected escalation/finding IDs before acceptance.

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
Work in /Users/lawrencebois-yan/Documents/LCIM (or the dedicated worktree created for Sprint 07).

Read docs/v2-sprints/00_MASTER_PLAN.md and this Sprint 07 file completely before editing.

Execute Sprint 07 — Manual text-only ChatGPT SOL Pro escalation boundary as an implementation task. Inspect the current repository state first and do not assume files/interfaces that are not present. Respect the sprint-owned file boundaries and existing reviewed shared interfaces. Implement the code, schemas, tests, and documentation required by this sprint; run the specified targeted tests plus any directly affected regression tests.

Do not commit, push, merge, open a PR, modify credentials/shell profiles, or upload any repository artifact to ChatGPT. DeepSeek work must use xhigh/MAX. If SOL is genuinely required, compile one precise decision question with explicit pass/fail conditions and bounded evidence; do not ask SOL to generally review the sprint. ChatGPT SOL Pro, if truly required, is manual text-only and must receive no files.

At the end, return the sprint completion report required by the master plan, including exact tests/results and any interface-change request. Do not claim completion when an acceptance criterion is not demonstrated.

```
