---
title: Decisions and authority
description: User decisions, model roles, spending limits, continuation policy, and approval boundaries.
tags:
  - lcim
  - project
---
# Decisions and authority

This page records explicit user decisions from the project conversation. It summarizes authority but does not replace immutable grants, currentness checks, or retained controller evidence.

## Preserve the original plan

The user requires implementation to follow the original V9 phase order without deviation. Documentation, diagnostic tests, provisional drafts, and procedure acceptance cannot substitute for qualified source acceptance or runtime activation. The [delivery plan](delivery-plan.md) preserves the remaining sequence.

## Independent acceptance

A fresh, independent, read-only Astra/Codex agent may review an immutable procedure packet offline. The reviewer must not be the implementation agent and must return a clear PASS or FAIL. If a retained V9 G3 result cannot be located quickly, another fresh independent read-only agent may reproduce that review against planning commit `d0810f907f43e9ff706b63bb2116e93baeb31bca`. Offline procedure review requires no provider request.

## Model roles

Implementation and repair use qualified Pi DeepSeek Flash at MAX. Independent source decisions use qualified Pi `openai-codex / gpt-5.6-sol / XHIGH`. Root Astra performs external orchestration, documentation, deterministic verification, controller decisions, and permitted read-only procedure review. Controller dispositions remain controller-owned.

## Authentication and billing

Codex uses OAuth only. The `chatgpt.com/backend-api/codex/responses` path is the OAuth transport endpoint; it does not authorize API-key billing. Codex API billing, automatic credit purchases, paid top-ups, and reset-credit redemption are disabled unless the user separately changes that policy.

DeepSeek may consume the credits already present in the account. Cost alone is not a reason to pause and ask permission. Within an active qualified grant, work proceeds until completion, a controller safety boundary, the physical-request ceiling, the USD ceiling, grant expiry, or provider denial. A zero balance or provider refusal ends further requests safely; it does not create permission to purchase or top up credits.

## Qualified-grant defaults

| Setting | Default |
| --- | --- |
| Maximum physical Flash upstream requests | 50, user-modifiable per qualified grant |
| Maximum physical Sol upstream requests | 50, user-modifiable per qualified grant |
| Maximum additional DeepSeek spend | USD 20 per qualified grant |
| Duration | At most 24 hours per qualified grant, user-modifiable within that bound |
| Codex billing | OAuth entitlement only; zero additional API spend |

Failed, empty, interrupted, or uncertain physical requests remain consumed. A retry does not refund or refill a slot.

## Continuation behavior

The controller may retry the same surviving issue only when the active authorization and grant allow it. The user-facing default maximum is three, the user may enter a lower retry count, and no same-issue flow may exceed three attempts. Every retry must use retained evidence, preserve the failed history, and reapply writer, validation, review, budget, and currentness gates.

When the retry limit is reached or a finding survives, the future user interface must show the evidence and prompt the user to choose among correcting the contract, changing permitted scope, supplying authoritative information, accepting the limitation, abandoning the candidate, or starting a materially different work unit with fresh authority. The prompt must also show the remaining retry allowance and let the user choose how many of those retries to authorize.

The user has authorized autonomous continuation for this goal when the only possible question is cost-related. The user also authorized committing and pushing the completed unit after its required verification and documentation. This does not authorize runtime activation, credential changes, purchases, top-ups, reset redemption, destructive history edits, or publication of private evidence.

## Future provider selection

The intended product should let the user select supported models and reasoning settings across:

- local Ollama models;
- DeepSeek models;
- Grok models;
- Codex models through approved authentication.

That capability remains future product work and does not change the locked roles used to construct the current Bootstrap checkpoint.