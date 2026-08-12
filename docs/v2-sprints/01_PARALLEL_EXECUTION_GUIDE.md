
# LCIM V2 Parallel Execution Guide

Repository: `/Users/lawrencebois-yan/Documents/LCIM`

## Safe parallel groups

### Group A — after Sprint 00
- Sprint 01 — logging
- Sprint 02 — worker contract
- Sprint 03 — Git/worktree/base/scope
- Sprint 04 — semantic contract compiler

These are intentionally separated by module ownership.

### Group B — after Group A is integrated
- Sprint 05 — routing
- Sprint 06 — SOL Ask Compiler
- Sprint 08 — audit/reporting
- Sprint 09 — V1 compatibility

### Conditional overlap
Sprint 07 may begin as soon as a base containing Sprint 01 + Sprint 06 exists. It does not need to wait for 05/08/09 to finish, but it must run in its own worktree.

### Must remain serial
- Sprint 00
- Sprint 10
- Sprint 11

## Suggested worktree creation

After the prerequisite base is committed:

```bash
BASE="/Users/lawrencebois-yan/Documents/LCIM"
WT_ROOT="/Users/lawrencebois-yan/Documents/LCIM-v2-worktrees"
mkdir -p "$WT_ROOT"

# Replace <base-ref> with the reviewed integration commit/branch.
git -C "$BASE" worktree add "$WT_ROOT/sXX" -b lcim-v2/sXX-name <base-ref>
```

Do not share one worktree between concurrent sessions.

## Integration order

For Group A, merge/rebase manually in this order unless conflicts suggest otherwise:

1. S01 logging
2. S02 worker contract
3. S03 Git safety
4. S04 semantic contract

Then run the complete test suite and create the Wave-1 integration commit.

For Group B:

1. S05 routing
2. S06 SOL Ask Compiler
3. S07 Pro text handoff (when ready)
4. S08 audit
5. S09 V1 compatibility

Then run the full suite before Sprint 10.

## Conflict policy

A parallel sprint must not resolve a semantic conflict by inventing a new shared contract. If two sprints need incompatible interface changes, stop that integration, compare both requests, make one explicit architectural decision, then update the shared interface and rebase both branches.

## Model policy during sprint development

Use DeepSeek Flash xhigh/MAX for implementation. Use SOL only for one bounded question when a contract/semantic decision cannot be established mechanically. Do not use ChatGPT SOL Pro unless the issue meets the V2 STUCK criteria, and if used, only paste bounded redacted text—never attach files.

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
