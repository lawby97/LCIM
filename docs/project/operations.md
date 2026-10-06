---
title: Operations and resumption
description: How to resume after the accepted record-store checkpoint and maintain the OpenKnowledge record.
tags:
  - lcim
  - project
---
# Operations and resumption

Resume work from the accepted record-store checkpoint on branch `codex/lcim-u2-record-store-source-stage`. The checkpoint adds `src/source-checkpoint/record-store.mjs` to the accepted parser predecessor. Its isolated and target validation, exact-source SOL PASS, and independent result review are indexed in the [evidence register](observations.md#2026-10-06-record-store-checkpoint-completion).

## Resume sequence

1. Confirm the branch, expected base, and clean tracked state before starting a new implementation unit.
2. Treat the accepted parser files, nine unchanged tests, and the record-store source as fixed predecessor bytes.
3. Read the [delivery plan](delivery-plan.md) and start the next unchecked Phase B item: closed nested record schemas, reference validation, and acyclic evidence relationships.
4. Define the unit's owned files and any required interfaces before implementation.
5. Use only current qualified routes with finite grants: DeepSeek Flash MAX for implementation/repair and OAuth `gpt-5.6-sol` XHIGH for exact-source decisions.
6. Retain deterministic validation, independent review, repair/recheck, and controller dispositions for the new exact generation.
7. Update the [current state](current-state.md), [evidence register](observations.md), and a unit completion report before operator integration.
8. Run focused tests, applicable repository checks, public-safety scans, and a full OpenKnowledge audit before commit and push.

Do not reopen either accepted generation merely to repeat review. If the next unit discovers a real cross-unit defect or requires a change under `src/shared/**` or `schemas/common/**`, record the need as an interface-change request before altering stable shared contracts.

## Blocked and surviving-finding flow

A same-issue retry may occur only within current authority and the configured limit, which defaults to three and cannot exceed three. Every retry preserves terminal history and reapplies writer, validation, review, budget, and currentness gates.

The future operator interface should display the surviving evidence and prompt the user to choose whether to correct the contract, change permitted scope, supply authoritative information, accept the limitation, abandon the candidate, or create a materially different work unit with fresh authority. It should also accept a user-selected retry count up to three.

## Cost and request handling

DeepSeek work proceeds autonomously within an active qualified grant. Do not stop solely to ask whether existing account credits may be used. Stop provider calls on provider denial, grant expiry, the physical-request ceiling, the USD ceiling, or a controller safety failure. Never purchase, top up, or alter credentials automatically.

Codex source review remains OAuth-only with no API billing, paid credit purchase, top-up, or reset redemption.

## Public-repository boundary

Keep the repository public-safe. Never add credentials, environment files, raw model transcripts, immutable review packets, local escalation records, provider responses, account identifiers, or target-repository runtime evidence. Record only safe summaries and content digests in repository documentation.

## Documentation discipline

All in-scope Markdown is managed through OpenKnowledge. Update evidence claims with local source links, keep lifecycle statuses current, and run a full OpenKnowledge audit before committing documentation. The [record-store completion report](../specs/002-record-store-checkpoint/completion-report.md) is the current pattern for bounded implementation-unit reports.
