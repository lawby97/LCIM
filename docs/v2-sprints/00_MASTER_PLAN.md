
# LCIM V2 Sprint Master Plan

Repository: `/Users/lawrencebois-yan/Documents/LCIM`

This is the controlling implementation plan for LCIM V2. Each sprint below is intentionally narrow enough to review independently. Sprints marked parallel-safe may be executed concurrently only in separate Git worktrees/branches.

## Why sprints

The V1/BL-020 evidence showed that model capability was not the only failure source: transport/schema mismatch, semantic-contract ambiguity, wrong-base work, incomplete ledger coverage, and overly broad SOL asks all created avoidable retries. V2 therefore separates deterministic controller responsibilities from model responsibilities and builds those pieces behind stable interfaces before integration.

## Locked V2 principles

1. DeepSeek Flash xhigh/MAX is the normal implementation worker.
2. DeepSeek Pro MAX is escalation-only.
3. SOL is a precise decision engine, not a generic reviewer.
4. ChatGPT SOL Pro receives only manually pasted, redacted bounded text—never files.
5. Workers report work status; only the controller may decide `PATCH_VALID`, `SEMANTICALLY_ACCEPTED`, `CANDIDATE_INTEGRATED`, and `REVIEW_APPROVED`.
6. Objective Git/test/evidence facts are controller-owned.
7. Transport validity and patch usefulness are separate states.
8. Run logging is append-only and complete enough for periodic workflow audits.
9. LCIM source is versioned in this standalone repo; run state stays local under each target repo's Git common directory.
10. Every run records LCIM version/commit, target repo SHA, config digest, and schema version.

## Sprint map

| Sprint | Name | Depends on | Parallel-safe |
|---|---|---|---|
| 00 | Foundation, interfaces, public-safe repo baseline | none | No — first |
| 01 | Canonical invocation ledger and run logging | 00 | Yes |
| 02 | Simplified worker contract and transport separation | 00 | Yes |
| 03 | Git/worktree/base/scope controller evidence | 00 | Yes |
| 04 | Semantic contract compiler and negative-test contract | 00 | Yes |
| 05 | Deterministic model routing and escalation state machine | 02, 04 | Yes with 06/08/09 |
| 06 | SOL Ask Compiler and precise review/diagnosis contracts | 02, 04 | Yes with 05/08/09 |
| 07 | Text-only ChatGPT SOL Pro escalation | 01, 06 | Yes once 06 is integrated; may overlap remaining 05/08/09 work |
| 08 | Audit projections, metrics, REVIEW.md and review-export | 01 | Yes with 05/06/09 |
| 09 | V1 compatibility reader and migration semantics | 01, 02 | Yes with 05/06/08 |
| 10 | CLI/project adapter/integration assembly | 01-09 | No |
| 11 | Fault injection, E2E, self-hosting trial, release candidate | 10 | No — final |

## Recommended execution waves

### Wave 0
`Sprint 00` only. Review it and create a human-approved commit before parallel work starts.

### Wave 1 — four-way parallel
Run `01`, `02`, `03`, and `04` concurrently in separate worktrees from the same reviewed Sprint-00 base.

### Wave 2 — four-way parallel
After Wave 1 is integrated, run `05`, `06`, `08`, and `09` concurrently in separate worktrees.

### Wave 2B
As soon as Sprint 06 is integrated (and Sprint 01 is already present), Sprint `07` may run while unfinished Wave-2 branches continue, provided it uses a base containing S01+S06 and its own worktree.

### Wave 3
Integrate the completed core and run Sprint `10` serially.

### Wave 4
Run Sprint `11` serially. This is the only sprint allowed to exercise V2 self-hosting.

## Parallel worktree rule

Never run parallel editing sessions in `/Users/lawrencebois-yan/Documents/LCIM` itself. Use sibling worktrees, e.g.:

```bash
BASE="/Users/lawrencebois-yan/Documents/LCIM"
WT_ROOT="/Users/lawrencebois-yan/Documents/LCIM-v2-worktrees"
mkdir -p "$WT_ROOT"

# Example after Sprint 00 has been reviewed and committed to main:
git -C "$BASE" worktree add "$WT_ROOT/s01" -b lcim-v2/s01-logging main
git -C "$BASE" worktree add "$WT_ROOT/s02" -b lcim-v2/s02-worker-contract main
git -C "$BASE" worktree add "$WT_ROOT/s03" -b lcim-v2/s03-git-safety main
git -C "$BASE" worktree add "$WT_ROOT/s04" -b lcim-v2/s04-semantic-contract main
```

Each session edits only its own worktree. Codex must not commit or push; review and commit each sprint manually before merging it into the integration base.

## Shared interface discipline

Sprint 00 defines shared types/interfaces. Parallel sprints must not casually rewrite those contracts. If a sprint discovers a required cross-sprint interface change, it must:

1. document the exact change under `docs/v2-sprints/interface-change-requests/`;
2. avoid editing another sprint's owned files unless necessary for a build/test fix;
3. keep any unavoidable cross-file change minimal and explicitly list it in the sprint report.

## Required completion report for every sprint

Every sprint ends with:

- files changed;
- tests added/changed;
- commands run and exact results;
- acceptance criteria status;
- unresolved issues/assumptions;
- interface changes requested;
- confirmation that no secrets/runtime evidence were committed;
- confirmation that no commit/push/PR was performed.


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
