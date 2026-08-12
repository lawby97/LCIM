
# Sprint 10 — Standalone CLI, project adapter, and full V2 integration assembly

**Repository:** `/Users/lawrencebois-yan/Documents/LCIM`  
**Dependencies:** Sprints 01-09 integrated  
**Parallel status:** SERIAL — integration sprint

## Objective

Assemble the independently tested V2 modules into the reusable standalone LCIM CLI used against arbitrary target repositories while keeping source versioned here and runtime state local to each target repo.

## Owned files/modules

Primary ownership:
- `bin/lcim.mjs`
- `src/cli/**`
- `src/controller/**` integration/orchestration
- `src/project/**`
- `src/config/**` final integration
- `README.md`
- top-level package scripts
- integration tests

## Required implementation

1. Wire commands such as `lcim --version`, `lcim setup`, `lcim run`, `lcim status`, `lcim audit --last N`, `lcim review-export --last N`, `lcim pro-copy <id>`, and recovery/finalization helpers.
2. Target-project config is non-secret and minimal, e.g. `.lcim/project.json`, `PROJECT_CAPSULE.md`, `REPO_MAP.md`, `risk-globs.json`, `PROJECT_DECISIONS.md`.
3. Runtime state always resolves under the target repo Git common directory.
4. Controller lifecycle integrates contract compile -> deterministic route -> isolated worker -> independent evidence -> semantic disposition -> precise SOL review/escalation -> candidate state.
5. Preserve no-auto-publication: produce reviewable candidates only.
6. Ensure every provider call goes through Sprint-01 invocation wrapper.
7. Ensure every SOL call goes through Sprint-06 Ask Compiler.
8. Ensure ChatGPT Pro path can only reach Sprint-07 text renderer/clipboard helper.
9. Add configuration migrations/defaults without embedding credentials.
10. README must document installation from `/Users/lawrencebois-yan/Documents/LCIM`, project setup, privacy boundary, parallel worktree behavior, and periodic audit usage.

## Explicit non-goals

Run full suite plus CLI integration against: normal repo, linked worktree, dirty target repo, no project config, external-provider permission denied, successful worker candidate, malformed worker response with useful patch, semantic rejection, SOL diagnosis, Pro-copy dry run, incomplete ledger recovery, and local audit.

## Acceptance criteria

- Do not self-host LCIM V2 yet.
- Do not create/push a GitHub release or npm publish.
- Do not bypass module interfaces with duplicate orchestration logic inside CLI handlers.
- Do not add automatic Git commit/push/PR behavior.

## Required tests

- CLI commands work from at least two independent target-repo fixtures.
- Every invocation is ledgered via shared wrapper.
- Controller, not worker, owns patch readiness.
- Generic SOL ask cannot enter provider path.
- Pro handoff cannot attach/upload files.
- Runtime data stays outside tracked source.
- Full unit/integration suite passes before Sprint 11.

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
Work in /Users/lawrencebois-yan/Documents/LCIM (or the dedicated worktree created for Sprint 10).

Read docs/v2-sprints/00_MASTER_PLAN.md and this Sprint 10 file completely before editing.

Execute Sprint 10 — Standalone CLI, project adapter, and full V2 integration assembly as an implementation task. Inspect the current repository state first and do not assume files/interfaces that are not present. Respect the sprint-owned file boundaries and existing reviewed shared interfaces. Implement the code, schemas, tests, and documentation required by this sprint; run the specified targeted tests plus any directly affected regression tests.

Do not commit, push, merge, open a PR, modify credentials/shell profiles, or upload any repository artifact to ChatGPT. DeepSeek work must use xhigh/MAX. If SOL is genuinely required, compile one precise decision question with explicit pass/fail conditions and bounded evidence; do not ask SOL to generally review the sprint. ChatGPT SOL Pro, if truly required, is manual text-only and must receive no files.

At the end, return the sprint completion report required by the master plan, including exact tests/results and any interface-change request. Do not claim completion when an acceptance criterion is not demonstrated.

```
