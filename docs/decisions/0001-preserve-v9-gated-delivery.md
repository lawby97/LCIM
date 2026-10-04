---
type: decision
description: Continue V9-gated delivery while treating delegated code as provisional until qualified.
status: accepted
date: 2026-09-12
deciders:
  - operator
tags:
  - decision
  - lcim
  - v9
---
# Preserve V9 gated delivery while delegating bounded code drafts

## Context

The Bootstrap candidate needed implementation help while the V9 plan required exact writer lineage, deterministic same-generation validation, independent source review, and controller-owned dispositions. A useful draft could not become accepted source merely because it compiled or passed local tests.

## Decision

Continue the frozen V9 phase order. Delegated implementation may produce bounded provisional files, but those bytes remain provisional until a qualified writer adopts or repairs them, qualified validation runs against the exact resulting generation, independent review completes, and the controller records the required dispositions.

Procedure review remains separate from source review. Offline independent acceptance may qualify a procedure packet without making the packet's candidate source accepted.

## Alternatives considered

### Accept a delegated draft after local tests

Rejected because local tests do not establish qualified writer lineage, complete independent review, or controller acceptance.

### Restart the architecture around the available draft

Rejected because it would abandon the pinned plan and invalidate established predecessor and evidence relationships.

### Continue the accepted plan with bounded delegation

Selected because it permits useful construction work while preserving the acceptance chain and public-safety boundary.

## Consequences

Positive consequences:

- Exact accepted generations remain distinguishable from drafts.
- Provider budgets and physical requests stay auditable.
- Review, repair, recheck, and final-review order remains enforceable.
- Controller dispositions retain a clear evidence basis.

Costs:

- More retained evidence and more explicit transitions are required.
- A locally passing draft may wait for qualified adoption and review.
- Failed packet builds and rejected reviews remain in terminal history.

## Outcome

The strict parser checkpoint followed this decision. Qualified validation passed 190 tests, six ordered Sol decisions passed, no findings survived, and the controller recorded all four required dispositions as PASS. See the [completion report](../specs/001-bootstrap-parser-completion/completion-report.md). The decision remains active for later Bootstrap and C30 work.