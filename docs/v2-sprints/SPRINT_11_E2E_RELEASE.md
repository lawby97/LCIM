
# Sprint 11 — Fault injection, end-to-end workflow, controlled self-hosting, and V2 release candidate

**Repository:** `/Users/lawrencebois-yan/Documents/LCIM`  
**Dependencies:** Sprint 10  
**Parallel status:** SERIAL — final sprint

## Objective

Prove V2 as a complete controller under failure, run a controlled self-hosting exercise only after all preceding tests pass, and produce a reviewable `2.0.0-rc.1` candidate without publishing it.

## Owned files/modules

Primary ownership:
- `tests/fault-injection/**`
- `tests/e2e/**`
- `tests/self-host/**`
- final docs/version/migration updates only
- no broad production refactors unless required by demonstrated defect

## Required implementation

1. Build end-to-end fixtures covering the exact V1/BL-020 failure classes and V2 invariants.
2. Fault inject provider crash, model timeout, malformed output, schema failure, useful patch with bad handoff, semantic rejection, wrong base, scope violation, ledger writer failure, controller crash at lifecycle boundaries, SOL finding surviving repair, oversized Pro payload, secret in Pro payload, and recovery.
3. Verify every model invocation has START/COMPLETION/ASSESSMENT or is explicitly reconciled; finalizer catches any incompleteness.
4. Verify zero-side-effect negative tests for authorization/provider-style gates in a generic fixture.
5. Run audit across E2E fixtures and verify metrics exactly reconcile to known truth.
6. Run a controlled self-hosting trial: use the completed V2 controller on one small, low-risk change to the LCIM repo itself in an isolated worktree. V2 must not commit/push/merge. Compare its ledger, candidate evidence, and audit report to expected values.
7. If self-hosting finds a defect, fix it with normal development workflow, rerun tests, then repeat the trial; do not let an unvalidated V2 recursively repair itself.
8. Set version to `2.0.0-rc.1` only when all release criteria pass.
9. Produce final architecture/routing/logging/SOL/privacy/migration docs and a release-readiness report. Do not publish/tag automatically.

## Explicit non-goals

Run the entire test suite, fault matrix, E2E fixtures, public-safe repository scan, secret scan, packaging/install smoke test, two-target-repo test, and one controlled self-host scenario. Record exact counts/results in the release-readiness report.

## Acceptance criteria

- No real business repository as the first self-host target.
- No automatic GitHub release, tag, npm publish, commit, push, merge, or PR.
- No weakening tests to get green.
- No use of ChatGPT Pro file attachments.

## Required tests

- All unit/integration/fault/E2E tests pass.
- The self-host trial completes with correct isolated worktree behavior and complete ledger.
- Audit metrics reconcile exactly to the self-host trial.
- No secret/runtime artifact is tracked.
- No generic SOL ask can bypass compiler.
- Pro path is demonstrably text-only and hard-budgeted.
- V1 evidence remains immutable/read-only.
- Release-readiness report has no unresolved P0/P1 issue.
- Version is `2.0.0-rc.1` only if every criterion is demonstrated.

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
Work in /Users/lawrencebois-yan/Documents/LCIM (or the dedicated worktree created for Sprint 11).

Read docs/v2-sprints/00_MASTER_PLAN.md and this Sprint 11 file completely before editing.

Execute Sprint 11 — Fault injection, end-to-end workflow, controlled self-hosting, and V2 release candidate as an implementation task. Inspect the current repository state first and do not assume files/interfaces that are not present. Respect the sprint-owned file boundaries and existing reviewed shared interfaces. Implement the code, schemas, tests, and documentation required by this sprint; run the specified targeted tests plus any directly affected regression tests.

Do not commit, push, merge, open a PR, modify credentials/shell profiles, or upload any repository artifact to ChatGPT. DeepSeek work must use xhigh/MAX. If SOL is genuinely required, compile one precise decision question with explicit pass/fail conditions and bounded evidence; do not ask SOL to generally review the sprint. ChatGPT SOL Pro, if truly required, is manual text-only and must receive no files.

At the end, return the sprint completion report required by the master plan, including exact tests/results and any interface-change request. Do not claim completion when an acceptance criterion is not demonstrated.

```
