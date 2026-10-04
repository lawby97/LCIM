---
title: Operations and resumption
description: How to resume after the accepted parser checkpoint and maintain the OpenKnowledge record.
tags:
  - lcim
  - project
---
# Operations and resumption

Resume work from the accepted parser checkpoint on branch `codex/lcim-u2-bootstrap-candidate`. The source checkpoint contains six modules and nine tests. Its qualified validation, six Sol decisions, final assessment, and four controller dispositions are indexed in the [evidence register](observations.md#2026-10-04-qualified-parser-completion-and-controller-acceptance).

## Resume sequence

1. Confirm the branch and clean working state before starting a new implementation unit.
2. Treat the fifteen parser checkpoint files as the accepted predecessor generation.
3. Read the [delivery plan](delivery-plan.md) and start the next unchecked Phase B item: immutable canonical record storage with filesystem durability evidence.
4. Define the new unit's owned files and any required interfaces before implementation.
5. Use only current, qualified provider routes and a finite grant.
6. Retain deterministic validation, independent review, repair/recheck, and controller dispositions for the new exact generation.
7. Update the [current state](current-state.md), [evidence register](observations.md), and a unit completion report before commit.

Do not reopen the accepted parser generation merely to repeat review. If the next unit discovers a real cross-unit defect or requires a change under `src/shared/**` or `schemas/common/**`, record the need as an interface-change request before altering stable shared contracts.

## Cost and request handling

DeepSeek work proceeds autonomously within an active qualified grant. Do not stop solely to ask whether existing account credits may be used. Stop provider calls on provider denial, grant expiry, the physical-request ceiling, the USD ceiling, or a controller safety failure. Never purchase, top up, or alter credentials automatically.

Codex source review remains OAuth-only with no API billing, paid credit purchase, top-up, or reset redemption.

## Public-repository boundary

Keep the repository public-safe. Never add credentials, environment files, raw model transcripts, immutable review packets, local escalation records, provider responses, or target-repository runtime evidence. Record only safe summaries and content digests in repository documentation.

## Documentation discipline

All in-scope Markdown is managed through OpenKnowledge. Update evidence claims with source links, keep lifecycle statuses current, and run a full OpenKnowledge audit before committing documentation. The [parser completion report](../specs/001-bootstrap-parser-completion/completion-report.md) is the pattern for bounded implementation-unit reports.