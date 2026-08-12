
# Sprint 00 — Foundation, shared interfaces, and public-safe repository baseline

**Repository:** `/Users/lawrencebois-yan/Documents/LCIM`  
**Dependencies:** none  
**Parallel status:** SERIAL — must complete first

## Objective

Create the stable V2 scaffold and shared interfaces that allow later sprints to work in parallel without inventing incompatible contracts. Establish the public-safe source/runtime boundary and freeze V1 observations as characterization requirements without committing the large review packet or business-source excerpts.

## Owned files/modules

Primary ownership:
- `package.json`, lockfile if used
- `VERSION`
- `.gitignore`
- `AGENTS.md`
- `bin/lcim.mjs` skeleton only
- `src/shared/**`
- `src/config/**` baseline only
- `schemas/common/**`
- `docs/v2-architecture.md`
- `docs/v2-security-boundaries.md`
- `docs/v2-sprints/**` installation/documentation
- test harness/bootstrap

## Required implementation

1. Bootstrap a Node ESM project suitable for the existing LCIM JavaScript/MJS lineage.
2. Add `VERSION` with a pre-release value such as `2.0.0-dev.0` and a helper that can also report the LCIM Git commit.
3. Add a minimal `AGENTS.md`: LCIM is the executable controller; AGENTS.md is constitution/entrypoint, not the orcheschestrator itself. Include xhigh/MAX DeepSeek policy, precise SOL asks, text-only Pro boundary, and no auto-publication.
4. Define shared IDs/enums/errors/interfaces for run, invocation, work-unit, controller disposition, review finding, rejection taxonomy, and schema versioning. Keep interfaces small and documented.
5. Define runtime-path resolution based on `git rev-parse --git-common-dir`; runtime logs/state must never live in tracked source directories.
6. Add `.gitignore` and tests/guards preventing credentials, `.env*`, raw transcripts, review ZIPs, local escalation records, and target-repo evidence from accidental tracking.
7. Create a public-safe V1 characterization document summarizing known V1 failure classes: worker self-report not authoritative; schema/transport mismatch; useful patch despite malformed handoff; wrong-base candidates; semantic contract conflation; incomplete ledger; generic SOL review too broad.
8. Add test harness and smoke tests for config/version/runtime path helpers.
9. Do not implement the substantive logging, worker parser, routing, SOL compiler, or audit engine yet; define only the interfaces they need.

## Explicit non-goals

Add focused tests for version reporting, Git common-dir resolution (normal repo + linked worktree fixture), shared enum/schema validation, public-safe path rules, and secret/runtime ignore guards.

## Acceptance criteria

- Do not copy the 1MB review ZIP, business source dumps, raw V1 transcripts, credentials, or local run logs into Git.
- Do not implement all V2 features in this sprint.
- Do not create a remote or change repository visibility.
- Do not self-host V2.

## Required tests

- `npm test` (or the chosen equivalent) succeeds.
- `lcim --version` can report the V2 pre-release version from the local skeleton.
- Runtime-path helper resolves beneath the target repo Git common directory.
- Public-safe/secret fixtures prove forbidden runtime evidence is ignored/rejected.
- Shared lifecycle states explicitly separate worker status from controller disposition.
- No model is required for deterministic route decisions defined later.

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
Work in /Users/lawrencebois-yan/Documents/LCIM (or the dedicated worktree created for Sprint 00).

Read docs/v2-sprints/00_MASTER_PLAN.md and this Sprint 00 file completely before editing.

Execute Sprint 00 — Foundation, shared interfaces, and public-safe repository baseline as an implementation task. Inspect the current repository state first and do not assume files/interfaces that are not present. Respect the sprint-owned file boundaries and existing reviewed shared interfaces. Implement the code, schemas, tests, and documentation required by this sprint; run the specified targeted tests plus any directly affected regression tests.

Do not commit, push, merge, open a PR, modify credentials/shell profiles, or upload any repository artifact to ChatGPT. DeepSeek work must use xhigh/MAX. If SOL is genuinely required, compile one precise decision question with explicit pass/fail conditions and bounded evidence; do not ask SOL to generally review the sprint. ChatGPT SOL Pro, if truly required, is manual text-only and must receive no files.

At the end, return the sprint completion report required by the master plan, including exact tests/results and any interface-change request. Do not claim completion when an acceptance criterion is not demonstrated.

```
