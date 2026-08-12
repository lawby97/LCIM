
# Sprint 03 — Git worktree, base-SHA, scope, and controller-owned patch evidence

**Repository:** `/Users/lawrencebois-yan/Documents/LCIM`  
**Dependencies:** Sprint 00  
**Parallel status:** PARALLEL-SAFE in Wave 1

## Objective

Make patch identity, worktree isolation, serial bases, allowed write paths, and objective diff evidence deterministic controller responsibilities.

## Owned files/modules

Primary ownership:
- `src/git/**`
- `src/validation/git/**`
- `src/evidence/patch/**`
- `schemas/patch-evidence.v2.schema.json`
- `tests/git/**`

## Required implementation

1. Implement isolated detached worker worktree creation rooted at an explicit `expected_base_sha`.
2. Validate base before spawn, after worker exit, before patch extraction, and before integration handoff.
3. Support serial candidate bases: accepted unit N yields the only allowed base for dependent unit N+1.
4. Write-scope rule is `observed_changed_paths ⊆ allowed_write_paths`. Add optional `must_change_paths` checked separately.
5. Compute controller-owned changed paths, additions/deletions, patch hash, base SHA, worktree HEAD, `git diff --check`, and patch artifact identity.
6. Preserve dirty parent worktree safely; worker may never edit it.
7. Prohibit destructive reset/clean, worker commits, pushes, merges, or modification outside the isolated worktree.
8. Add hooks/interfaces for test/secret validation results without implementing the semantic contract compiler.
9. Ensure cleanup removes only LCIM-created disposable worktrees after evidence is safely persisted and never destroys uncommitted user work.

## Explicit non-goals

Test exact allowed set, strict subset, forbidden path, must-change missing, same-base parallel worktrees, serial stale base, worker-created commit, dirty parent, binary file diff, no-change patch, diff-check failure, and safe cleanup.

## Acceptance criteria

- Do not implement model output parsing.
- Do not implement routing/SOL logic.
- Do not require every allowed write path to change.
- Do not automatically commit accepted patches.

## Required tests

- Valid subset-of-allowed paths succeeds.
- Any path outside allowed set fails closed.
- Missing required `must_change_path` fails.
- Wrong/stale base fails at every specified checkpoint.
- Parent dirty state is preserved.
- Patch hash and changed paths are controller-derived.
- Worker commit/push/merge/destructive commands are blocked/detected according to existing safety model.

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
Work in /Users/lawrencebois-yan/Documents/LCIM (or the dedicated worktree created for Sprint 03).

Read docs/v2-sprints/00_MASTER_PLAN.md and this Sprint 03 file completely before editing.

Execute Sprint 03 — Git worktree, base-SHA, scope, and controller-owned patch evidence as an implementation task. Inspect the current repository state first and do not assume files/interfaces that are not present. Respect the sprint-owned file boundaries and existing reviewed shared interfaces. Implement the code, schemas, tests, and documentation required by this sprint; run the specified targeted tests plus any directly affected regression tests.

Do not commit, push, merge, open a PR, modify credentials/shell profiles, or upload any repository artifact to ChatGPT. DeepSeek work must use xhigh/MAX. If SOL is genuinely required, compile one precise decision question with explicit pass/fail conditions and bounded evidence; do not ask SOL to generally review the sprint. ChatGPT SOL Pro, if truly required, is manual text-only and must receive no files.

At the end, return the sprint completion report required by the master plan, including exact tests/results and any interface-change request. Do not claim completion when an acceptance criterion is not demonstrated.

```
