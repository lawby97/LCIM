
# Sprint 05 — Deterministic model routing and escalation state machine

**Repository:** `/Users/lawrencebois-yan/Documents/LCIM`  
**Dependencies:** Sprints 02 and 04 integrated  
**Parallel status:** PARALLEL-SAFE in Wave 2

## Objective

Implement the low-cost routing policy deterministically so ordinary work does not spend SOL tokens deciding what model to use, while semantic rejection escalates promptly instead of wasting equivalent retries.

## Owned files/modules

Primary ownership:
- `src/routing/**`
- `src/providers/capabilities/**` discovery/capability metadata
- `schemas/route-decision.v2.schema.json`
- `docs/v2-model-routing.md`
- `tests/routing/**`

## Required implementation

1. Default bounded implementation route: DeepSeek V4 Flash xhigh through Pi; use explicit MAX only where supported/justified without downgrade.
2. DeepSeek Pro MAX is escalation-only: SOL-directed difficult repair, confirmed model-capability failure, or contract-locked unusually difficult implementation with explicit reason.
3. Terra and Luna are disabled from the default ladder; retain optional capability fallback only if configured.
4. SOL xhigh roles: bounded contract check, bounded diagnose, final high-risk review, recheck. The actual ask compiler is Sprint 06.
5. Define controller-owned STUCK criteria: same AC fails after one targeted repair; substantive semantic contradiction; model tries to change contract; conflates explicitly distinct concepts; cannot form falsifiable explanation; scope broadens without evidence; SOL finding survives one repair; provider lacks capability.
6. Semantic rejection may escalate immediately—do not force multiple equivalent DeepSeek retries.
7. Implement exact provider/model discovery and fail rather than silently substitute.
8. Route decisions record reason codes and budgets for later audit.
9. Add hard per-run/per-unit call budgets and stop/fail states; no silent budget overrun.

## Explicit non-goals

Test every route reason, semantic rejection, same-AC retry, scope broadening, unresolved contract, capability failure, Sol finding surviving repair, provider unavailable, invalid downgrade, Pro escalation justification, and budget exhaustion.

## Acceptance criteria

- Do not implement SOL prompt text.
- Do not implement ChatGPT Pro clipboard transport.
- Do not make model selection based on vague task-size adjectives alone.
- Do not reintroduce Terra as architecture default.

## Required tests

- Normal bounded task routes to Flash xhigh/MAX policy.
- High-risk unresolved contract routes to SOL contract check rather than implementation.
- First localized failure with credible hypothesis gets at most one bounded Flash repair.
- Semantic rejection escalates without wasteful repeats.
- Pro MAX usage always has a machine-readable justification.
- No silent provider/model substitution.
- Call-budget overrun fails closed.

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
Work in /Users/lawrencebois-yan/Documents/LCIM (or the dedicated worktree created for Sprint 05).

Read docs/v2-sprints/00_MASTER_PLAN.md and this Sprint 05 file completely before editing.

Execute Sprint 05 — Deterministic model routing and escalation state machine as an implementation task. Inspect the current repository state first and do not assume files/interfaces that are not present. Respect the sprint-owned file boundaries and existing reviewed shared interfaces. Implement the code, schemas, tests, and documentation required by this sprint; run the specified targeted tests plus any directly affected regression tests.

Do not commit, push, merge, open a PR, modify credentials/shell profiles, or upload any repository artifact to ChatGPT. DeepSeek work must use xhigh/MAX. If SOL is genuinely required, compile one precise decision question with explicit pass/fail conditions and bounded evidence; do not ask SOL to generally review the sprint. ChatGPT SOL Pro, if truly required, is manual text-only and must receive no files.

At the end, return the sprint completion report required by the master plan, including exact tests/results and any interface-change request. Do not claim completion when an acceptance criterion is not demonstrated.

```
