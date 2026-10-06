---
title: LCIM project overview
description: What LCIM controls, the accepted parser and record-store milestones, and the path to the MVP.
tags:
  - lcim
  - project
---
# LCIM project overview

LCIM is an executable software-delivery controller. Model routing is one part of its work: it also binds exact source generations, enforces bounded provider grants, separates writer and reviewer roles, validates deterministic evidence, retains terminal history, controls retries, records controller dispositions, and prevents unqualified code from becoming an accepted source checkpoint.

## Current milestone

Two Phase B checkpoints are complete:

- the strict parser checkpoint provides strict JSON and Unicode processing, canonicalization, digest helpers, bounded inputs, and nine test modules;
- the immutable record-store checkpoint adds confined content-addressed persistence, descriptor-anchored staging, verified hard-link publication, durability fsyncs, exact-existing verification, and no-follow verified reads.

The record-store generation passed 190 tests in both isolated and target trees, all focused safety probes, a one-request exact-source OAuth SOL XHIGH decision, and separate independent result review. No finding survived. See [Current implementation state](current-state.md).

These milestones do not make LCIM 3.0 an MVP. Closed schemas and reference checks, the complete verifier, registry CAS and recovery, source admission, proof export, adversarial evidence, final Bootstrap G1, C30-01 through C30-14, final G2, real Pi installation, and separately authorized activation remain open. See the [delivery plan](delivery-plan.md).

## Why the controller is larger than a router

A router can choose a model and send a prompt. LCIM must also answer and prove:

- which exact source and plan authorized the work;
- which qualified route wrote or reviewed each generation;
- how many physical requests and how much authorized spend were consumed;
- whether deterministic tests ran against the same bytes that reviewers saw;
- whether repair, recheck, and final-review order was preserved;
- whether a finding survived and which retry or user decision followed;
- whether the source registry advanced atomically without losing history;
- whether installation and activation used the accepted current generation.

These controls turn model output into an auditable, resumable software lifecycle.

## Project record

- [Current implementation state](current-state.md)
- [Original plan and delivery checklist](delivery-plan.md)
- [Decisions and authority](decisions.md)
- [Evidence register](observations.md)
- [Operations and resumption](operations.md)
- [Parser completion specification](../specs/001-bootstrap-parser-completion/spec.md)
- [Parser completion report](../specs/001-bootstrap-parser-completion/completion-report.md)
- [Record-store checkpoint specification](../specs/002-record-store-checkpoint/spec.md)
- [Record-store checkpoint completion report](../specs/002-record-store-checkpoint/completion-report.md)
