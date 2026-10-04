---
title: Original plan and delivery checklist
description: V9 phases, completed parser checkpoint, and remaining MVP obligations.
tags:
  - lcim
  - project
---
# Original plan and delivery checklist

This page tracks progress against the frozen V9 plan. It does not amend the plan or create acceptance authority. Exact retained evidence is indexed in the [evidence register](observations.md), and user policy is recorded in [Decisions and authority](decisions.md).

## Required phase order

| Phase | Required transition | State |
| --- | --- | --- |
| A | Procedure acceptance, applicable G3, operator adoption, and external-tool qualification | Completed for the bounded construction procedure used by the parser checkpoint |
| B | Standalone Bootstrap verifier and minimum source administration | In progress; parser checkpoint accepted, remaining Bootstrap work open |
| C | Independent G1 of final Bootstrap identities, then separate operator adoption | Not complete |
| D | C30-01 through C30-14 in numeric predecessor order | Not started by this candidate |
| E | G2 of complete integrated source, dependencies, and packaging | Not complete |
| F | Current G1/G2/G3, complete evidence, separate activation authority, C30-13 activation, durable matching COMMIT | Not authorized or complete |

G1 is not required before constructing its own Phase B review subject, and G2 is not required before constructing its Phase D subject. Neither exception permits unqualified runtime use. The candidate must not orchestrate its own construction.

## Phase B checklist

- [x] Establish qualified Flash MAX writer and adoption lineage for the strict-parser checkpoint.
- [x] Run qualified deterministic validation against the exact post-writer fifteen-file generation.
- [x] Complete same-generation independent Sol review, repair, validation, exact recheck, complete final review, and controller dispositions.
- [ ] Implement immutable canonical record storage and filesystem durability evidence.
- [ ] Implement closed nested record schemas, reference validation, and acyclic evidence relationships.
- [ ] Implement complete verifier, executable/import/schema/configuration closure, and exact Git source binding.
- [ ] Implement immutable prepare and verify outputs, including prepare before staging.
- [ ] Implement fixture-only registry initialization, owner locks, generations, head CAS, intents, receipts, and crash recovery.
- [ ] Implement source admission, currentness checks, and consumed-generation evidence.
- [ ] Implement finite retained proof-input export and offline verification.
- [ ] Complete adversarial, crash, filesystem, and integration evidence against final identities.
- [ ] Complete U3 external-review acceptance formats and consumer rejection tests.
- [ ] Obtain independent G1 of the actual finished Bootstrap subject.

The first three items were completed through execution 074. Their exact result and limitations are in [Current implementation state](current-state.md) and the [parser completion report](../specs/001-bootstrap-parser-completion/completion-report.md).

## U1–U5 prerequisites

| Prerequisite | Completion requirement | Current interpretation |
| --- | --- | --- |
| U1 | Isolated tools, separated credentials, physical-request/spend controls, and failure/recovery evidence | Satisfied for the bounded parser construction procedure; currentness remains required for later grants |
| U2 | Final Bootstrap schemas, verifier, storage, locks, CAS, recovery, admission, export, and full evidence | Contract accepted; implementation incomplete |
| U3 | Closed external-review formats, safe lineage, independent routes, complete zero-finding coverage, and validated consumers | Parser review path completed; final full-source acceptance and consumers incomplete |
| U4 | Final G2 transitive implementation and integrated negative, crash, and security evidence | Future integrated work |
| U5 | Independently accepted non-live method or separate bounded authority for any otherwise prohibited live effect | No implicit waiver |

## C30, installation, and MVP

After Bootstrap adoption, C30-01 consumes `BOOTSTRAP_CHECKPOINT_V2`; each later C30 sprint consumes its immediate predecessor through C30-14. Final G2 must cover the actual integrated and packaged source. The real Pi extension must then be installed and verified before an installable LCIM 3.0 MVP can be claimed. Runtime activation remains a separate authorized action.

The parser checkpoint is one completed Phase B unit. It is not the full MVP.

## Future product work

The requested model-selection experience must eventually support user choices across local Ollama models, DeepSeek, Grok, and Codex, including available reasoning settings. This requires its own specification after the controlling Bootstrap and C30 foundations are ready.

When a Sol finding survives repair and recheck, a future controller improvement should present the evidence and available actions to the user, then accept a user-entered retry count up to three for the same issue. Each retry must preserve terminal history and reapply current authorization, budget, qualification, validation, and independent-review checks.