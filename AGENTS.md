# AGENTS.md — LCIM V2 constitution (Sprint 00 baseline)

LCIM is the executable controller. AGENTS.md is the constitution and entrypoint
for agents and workers in this repository — it is **not** the orchestrator
itself. The controlling implementation plan is
`docs/v2-sprints/00_MASTER_PLAN.md`; sprint-scoped prompts live in
`docs/v2-sprints/<SPRINT_FILE>.md`.

## Roles and authority

- Workers (model agents) report work status and evidence; they never decide
  controller dispositions. Only the controller may decide `PATCH_VALID`,
  `SEMANTICALLY_ACCEPTED`, `CANDIDATE_INTEGRATED`, and `REVIEW_APPROVED`
  (see `src/shared/enums.mjs`).
- Objective Git/test/evidence facts are controller-owned.
- Workers never commit, push, merge, open PRs, modify credentials or shell
  profiles, or publish anything automatically.
- Work only in your own worktree/branch on an explicit base SHA. Never edit
  another sprint's owned files except for minimal build/test fixes, and list
  any such change in the sprint report.

## DeepSeek policy

- Default implementation worker: DeepSeek Flash with **xhigh/MAX** reasoning
  through Pi. Never deliberately downgrade to low/medium/high.
- DeepSeek Pro MAX is escalation-only: SOL-directed difficult repair,
  confirmed model-capability failure, or a contract-locked unusually difficult
  task with an explicit recorded reason.
- Terra and Luna are not normal escalation rungs.

## SOL policy

- SOL is a precise decision engine, not a generic reviewer. Every SOL call
  contains one primary decision question, explicit pass/fail conditions,
  bounded evidence, out-of-scope limits, and an exact response contract.
- No generic asks such as "review this sprint" or "look for bugs".
- ChatGPT SOL Pro is manual and **TEXT ONLY**: no repository files, Markdown
  attachments, logs, patches, ZIPs, JSON packets, or other artifacts may be
  uploaded to ChatGPT Pro by LCIM.

## Public safety

- This repository is public-safe. Never commit: API keys, DeepSeek/Codex/ChatGPT
  credentials, `.env*` files, raw model transcripts, review ZIPs/packets, local
  escalation records/SOL payloads, or target-repo evidence.
- Runtime state lives under `<git-common-dir>/lcim`, never in tracked source
  directories (see `src/config/runtime-path.mjs` and
  `docs/v2-security-boundaries.md`).

## Shared interface discipline

- Sprint 00 shared contracts (`src/shared/**`, `schemas/common/**`) are stable.
- A sprint that discovers a required cross-sprint interface change must
  document it under `docs/v2-sprints/interface-change-requests/` and avoid
  casually rewriting shared contracts.

## Completion reports

- Every sprint ends with the completion report required by the master plan:
  files changed, tests added/changed, commands and exact results, acceptance
  criteria status, unresolved issues, interface-change requests, and
  confirmation that no secrets/runtime evidence were committed and no
  commit/push/PR was performed.
