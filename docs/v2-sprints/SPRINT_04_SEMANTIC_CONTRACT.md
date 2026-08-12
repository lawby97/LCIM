
# Sprint 04 — Semantic contract compiler, risk facts, and negative acceptance requirements

**Repository:** `/Users/lawrencebois-yan/Documents/LCIM`  
**Dependencies:** Sprint 00  
**Parallel status:** PARALLEL-SAFE in Wave 1

## Objective

Compile exact worker semantics before implementation so models do not invent field names, conflate digests/identities, or test only superficial happy-path behavior.

## Owned files/modules

Primary ownership:
- `src/contracts/**`
- `src/risk/**` contract/risk representation only
- `schemas/semantic-contract.v2.schema.json`
- `schemas/acceptance-contract.v2.schema.json`
- `tests/contracts/**`

## Required implementation

1. Define a semantic contract format containing authoritative source objects, exact field names/casing/enums, exact identities/digest meanings, date/time representations, ownership/lifecycle, allowed transitions, forbidden alternatives, failure behavior, and negative acceptance evidence.
2. Explicitly support `distinct_concepts`/`must_not_conflate` for similarly named IDs/digests/registries.
3. Add high-risk classes: authorization/security/provider, migration, identity, financial, production execution, irreversible lifecycle/data.
4. For high-risk gates, compile negative side-effect requirements where relevant: provider factory/network/DB/lock/mutation counts remain zero before authorization failure.
5. Separate `facts_established` from `unresolved_semantics`. Unresolved high-risk semantics produce `CONTRACT_REVIEW_REQUIRED`; do not invent them.
6. Create contract validation and a compact human-readable renderer used later by routing/SOL.
7. Define a worker-ready repair contract shape: objective, violation, required behavior, must_change, must_not_change, acceptance tests, verification.
8. Add fixtures based on the observed BL-020 error classes: approval field names/casing, decision vs evidence vs membership digests, source/current ticker binding, serial date/time formats, provider construction before persisted authorization.

## Explicit non-goals

Test field casing, enum values, digest conflation, identity binding, missing source of truth, unresolved high-risk fact, safe low-risk omission, negative side-effect contract, invalid contradictory lifecycle, and repair-ticket generation.

## Acceptance criteria

- Do not call SOL in this sprint.
- Do not implement model routing.
- Do not inspect entire business repositories automatically; compile from explicit structured inputs/evidence.
- Do not allow a model to silently fill unresolved authoritative semantics.

## Required tests

- Compiler can represent and validate exact authoritative contracts.
- Distinct digests/identities cannot be represented ambiguously without validation warning/error.
- High-risk unresolved semantics are surfaced as review-required.
- Negative side-effect expectations are first-class acceptance criteria.
- Repair-contract output is bounded and worker-ready.

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
Work in /Users/lawrencebois-yan/Documents/LCIM (or the dedicated worktree created for Sprint 04).

Read docs/v2-sprints/00_MASTER_PLAN.md and this Sprint 04 file completely before editing.

Execute Sprint 04 — Semantic contract compiler, risk facts, and negative acceptance requirements as an implementation task. Inspect the current repository state first and do not assume files/interfaces that are not present. Respect the sprint-owned file boundaries and existing reviewed shared interfaces. Implement the code, schemas, tests, and documentation required by this sprint; run the specified targeted tests plus any directly affected regression tests.

Do not commit, push, merge, open a PR, modify credentials/shell profiles, or upload any repository artifact to ChatGPT. DeepSeek work must use xhigh/MAX. If SOL is genuinely required, compile one precise decision question with explicit pass/fail conditions and bounded evidence; do not ask SOL to generally review the sprint. ChatGPT SOL Pro, if truly required, is manual text-only and must receive no files.

At the end, return the sprint completion report required by the master plan, including exact tests/results and any interface-change request. Do not claim completion when an acceptance criterion is not demonstrated.

```
