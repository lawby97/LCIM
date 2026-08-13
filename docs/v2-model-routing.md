# LCIM V2 Deterministic Model Routing and Escalation (Sprint 05)

Status: implemented by Sprint 05 (see `docs/v2-sprints/SPRINT_05_ROUTING.md`),
with the SOL-S05-001..005 repair integrated.

Purpose: implement the routing policy **deterministically and cheaply** so
ordinary work does not spend SOL tokens deciding what model to use, while
semantic rejection escalates promptly instead of wasting equivalent retries.
Every decision is a controller-owned, machine-readable audit record.

## Owned modules

| Path | Responsibility |
|---|---|
| `src/routing/policy.mjs` | `decideRoute(ctx)` — the deterministic routing decision (stamped `lcim.route-decision` record) |
| `src/routing/state.mjs` | Escalation state machine: `ESCALATION_STATE`, `ESCALATION_EVENT`, `TRANSITIONS`, `nextState()` (fail closed on undefined transitions) |
| `src/routing/stuck.mjs` | Controller-owned STUCK criteria: `STUCK_CRITERIA`, `evaluateStuckCriteria(ctx)` |
| `src/routing/budget.mjs` | Hard per-run/per-unit call budgets: `createBudgetTracker()` |
| `src/routing/reasons.mjs` | `ROUTE_DECISION`, `ROUTE_REASON_CODE`, `STUCK_REASON_CODES`, `ESCALATION_BASIS` vocabularies |
| `src/routing/registry.mjs` | Route-decision schema manifest + `validateRouteDecision` / `stampRouteDecision` (conditional semantic rules) |
| `src/routing/ids.mjs` | `lcim_route_<32hex>` decision IDs |
| `src/routing/errors.mjs` | `RoutingError`, `RouteStateError`, `ProviderDiscoveryError`, `BudgetExhaustedError` |
| `src/providers/capabilities/metadata.mjs` | Canonical model capability metadata (ladder, roles, reasoning levels) |
| `src/providers/capabilities/discovery.mjs` | Exact provider/model discovery; explicit substitution paths only; `discoverSolRoute` |
| `schemas/route-decision.v2.schema.json` | The audit record schema (`lcim.route-decision` 2.0.0) |

The shared Sprint-00 contracts (`src/shared/**`, `schemas/common/**`) are
**not modified**. `src/routing/**` and `src/providers/capabilities/**` are
sprint-owned; the route-decision schema is self-contained and stays inside
the Sprint-00 engine subset (no `$ref`/`oneOf`/`format`/`minimum`), so the
failure-closed keyword discipline applies unchanged. Read-only imports from
Sprint 00/04: `src/shared/errors.mjs`, `src/shared/enums.mjs`
(`REJECTION_CODE.BUDGET_EXHAUSTED`), `src/risk/classes.mjs`
(`isHighRiskClass`), `src/contracts/validate.mjs`
(`validateSemanticContract`), `src/contracts/status.mjs`
(`computeCompileStatus`), `src/contracts/deep-freeze.mjs`.

## 1. Decision precedence (SOL-S05-001)

Hard controller facts are evaluated in a fixed order and can **never** be
bypassed by earlier acceptance or escalation branches. Contradictory
combinations fail closed (`RoutingError` / `RouteStateError`) instead of
defaulting:

1. **exhausted budget** → `STOP_BUDGET`;
2. **validated CONTRACT_REVIEW_REQUIRED** → `ROUTE_SOL_CONTRACT_CHECK`
   (never implementation);
3. **hard STUCK** → `STOP_STUCK` (surviving SOL finding, same-AC-after-
   repair, semantic contradiction, contract-change attempt, conflation,
   no falsifiable explanation, scope broadening, provider capability —
   never bypassed by completion or escalation);
4. **required SOL recheck** (open finding after one repair, no recheck
   yet) → `ROUTE_SOL_RECHECK`;
5. **semantic rejection** → `ROUTE_SOL_DIAGNOSE`;
6. **required HIGH_RISK final review** — an accepted high-risk result
   whose final review is not PROVEN (state inside the SOL-review flow
   **and** a PASSED `solReview` outcome **and**, for a recheck PASS,
   final-review finding provenance) → `ROUTE_SOL_FINAL_REVIEW`; a generic
   diagnose/repair-origin recheck PASS can never complete HIGH_RISK work;
7. explicit escalation requests (Pro MAX / Flash MAX);
8. SOL outcome states (review verdicts, resolved contract-check /
   diagnosis outcomes);
9. failure handling (one bounded Flash repair; Pro MAX / no-hypothesis
   failures stop STUCK);
10. ordinary completion and the default bounded route.

The precedence matrix is pinned by `tests/routing/precedence.test.mjs`
(surviving finding + accepted result → STUCK; due recheck + accepted
result → recheck; semantic rejection + accepted result → diagnose;
same-AC STUCK + valid Pro escalation → STUCK; forged review proof outside
the review flow cannot complete).

## 2. The default bounded route (requirement 1)

`ROUTE_IMPLEMENT_FLASH` — DeepSeek V4 Flash through Pi with reasoning
**XHIGH** — is the default for every normal bounded task. `XHIGH` is the
floor (`MIN_REASONING_LEVEL`); a route is **never** below it.

Explicit **MAX** is used only where supported and justified, without
downgrade:

- `ROUTE_IMPLEMENT_FLASH_MAX` — Flash with MAX reasoning; allowed only for
  basis `CONTRACT_LOCKED_DIFFICULT_TASK` (contract-locked unusually
  difficult implementation with an explicit recorded reason);
- `ROUTE_IMPLEMENT_PRO_MAX` — DeepSeek Pro MAX, escalation-only.

Every MAX/Pro MAX route carries a machine-readable
`escalationJustification { basis, detail }`; the schema's conditional rules
and `validateRouteDecision()` enforce this — a MAX route without a
justification cannot validate (fail closed).

Model selection is driven by structured routing context only (validated
contract status, failure history, rejection codes, SOL finding/outcome
history, explicit escalation requests, discovery results). Vague task-size
adjectives are never a routing input.

## 3. DeepSeek Pro MAX is escalation-only (requirements 2, SOL-S05-002)

`ROUTE_IMPLEMENT_PRO_MAX` is chosen **only** when the controller passes an
explicit escalation request `ctx.escalation = { model: 'deepseek-pro-max',
basis, detail }` with one of the three locked bases
(`ESCALATION_BASIS`):

1. `SOL_DIRECTED_REPAIR` — SOL directed a difficult repair;
2. `CONFIRMED_CAPABILITY_FAILURE` — a model capability failure was
   confirmed (provider/model cannot perform the required capability);
3. `CONTRACT_LOCKED_DIFFICULT_TASK` — contract-locked unusually difficult
   implementation with an explicit recorded reason.

Pro MAX can **never** appear as an ordinary exact substitute or optional
fallback: `capabilityEqual` includes the escalation-only status (Pro MAX is
never capability-equal to Flash), `resolveImplementationModel` refuses
escalation-only substitutes/fallbacks explicitly, and the schema rule
rejects any non-`ROUTE_IMPLEMENT_PRO_MAX` decision targeting
`deepseek-pro-max` (manually stamped bypasses fail validation). After Pro
MAX, no Flash repair is allowed (a repair below the top escalation rung
would be a downgrade): a credible failure there stops the unit STUCK with
`REPAIR_LIMIT_REACHED`.

## 4. Terra and Luna are disabled (requirement 3)

`terra` and `luna` are **not** on `DEFAULT_IMPLEMENTATION_LADDER`
(`['deepseek-v4-flash']`) and are `disabledByDefault: true`. They may appear
only as an **optional capability fallback when explicitly configured**:
`config.enableOptionalFallbacks: ['terra', ...]` (plus an explicit
endpoint). Any such fallback route is recorded with `substituteOf` +
reason code `CAPABILITY_FALLBACK_CONFIGURED` — never silently. Terra is
never reintroduced as an architecture default.

## 5. SOL xhigh roles and exact SOL discovery (requirements 4, SOL-S05-003)

SOL is a role-based decision engine (`sol-xhigh`, provider `sol`) with
exactly four roles:

| Decision | Role | When |
|---|---|---|
| `ROUTE_SOL_CONTRACT_CHECK` | `SOL_CONTRACT_CHECK` | validated contract compile status is `CONTRACT_REVIEW_REQUIRED` (high-risk unresolved semantics) — never implementation |
| `ROUTE_SOL_DIAGNOSE` | `SOL_DIAGNOSE` | semantic rejection (immediate escalation) |
| `ROUTE_SOL_FINAL_REVIEW` | `SOL_FINAL_REVIEW` | accepted result on a HIGH_RISK_CLASS contract whose final review is not yet proven |
| `ROUTE_SOL_RECHECK` | `SOL_RECHECK` | an open SOL finding that survived one targeted repair |

Every automatic `ROUTE_SOL_*` decision first resolves exact sol-xhigh
availability/capability via `discoverSolRoute(role, config)`: a configured
`sol-xhigh` endpoint, provider `sol`, model `sol-xhigh`, XHIGH reasoning
capability, and the required role. Missing/unavailable/invalid fails closed
with `FAIL_NO_SUBSTITUTE` (`PROVIDER_UNAVAILABLE` / `CAPABILITY_GAP_NO_SUBSTITUTE`)
— never a silent substitute, never a reasoning downgrade. `sol-pro`
(ChatGPT SOL Pro, text-only) is reserved for Sprint 07 and is **not
routable** from Sprint 05. The actual ask compiler is Sprint 06; Sprint 05
pins only the routing contract (roles, targets, discovery, transitions).

## 6. Controller-owned STUCK criteria (requirement 5)

`evaluateStuckCriteria(ctx)` returns the triggered criteria in definition
order; any trigger produces `STOP_STUCK` with the criterion's reason code
(a hard stop — never a silent retry, never a downgrade).

Two criteria are **derived deterministically** from objective history:

- `SAME_AC_FAILED_AFTER_REPAIR` — one targeted repair was already
  dispatched and the same acceptance reference fails again (a
  `rejectedAcceptanceRefs` value appearing in ≥ 2 failures);
- `SOL_FINDING_SURVIVES_ONE_REPAIR` — an open SOL finding has been through
  one repair **and** one recheck and is still open.

Six criteria consume explicit structured controller observations
(`ctx.stuckEvidence`), built by the controller from objective evidence:

- `SUBSTANTIVE_SEMANTIC_CONTRADICTION` — the result substantively
  contradicts established facts in the semantic contract;
- `MODEL_ATTEMPTS_CONTRACT_CHANGE` — the model tries to change the
  contract instead of implementing against it;
- `CONFLATES_DISTINCT_CONCEPTS` — the model conflates explicitly distinct
  concepts (`must_not_conflate` pairs);
- `NO_FALSIFIABLE_EXPLANATION` — no falsifiable explanation can be formed
  (also derived from `failureHistory[].credibleHypothesis === false`);
- `SCOPE_BROADENS_WITHOUT_EVIDENCE` — scope broadens without evidence;
- `PROVIDER_LACKS_CAPABILITY` — the provider/model lacks the required
  capability.

`REPAIR_LIMIT_REACHED` is the bounded-repair enforcement guard: it fires
when a failure occurs where no further bounded repair is permitted (e.g.
after Pro MAX), so the "at most one bounded Flash repair" guarantee cannot
be violated by any context shape.

## 7. Semantic rejection escalates immediately (requirement 6)

A rejection with one of `SEMANTIC_REJECTION_CODES` — `SEMANTIC_CONFLATION`,
`UNRESOLVED_SEMANTICS`, `UNSUPPORTED_CLAIM` — routes directly to
`ROUTE_SOL_DIAGNOSE` from any awaiting state, consuming **zero**
implementation budget, and outranks ordinary completion (an accepted
result alongside a semantic rejection still escalates). The policy never
forces multiple equivalent DeepSeek retries for a semantic rejection.
Non-semantic rejection codes (`WRONG_BASE`, `SCOPE_VIOLATION`, transport
defects, …) do not trigger escalation; re-dispatching after such a
rejection with no other routing event is an undefined transition and fails
closed with `RouteStateError` (the controller disposes such units, it does
not re-route them). This fail-closed behavior is accepted design.

## 8. Semantic-contract authority (SOL-S05-004)

When `ctx.semanticContract` is supplied it is **always** validated with
the Sprint-04 validator (`validateSemanticContract`): schema, semantic
rules (compileStatus vs recomputed status, side-effect identities,
semanticDigest, concept/field rules). Routing facts are derived only from
the validated document:

- `compileStatus` is recomputed from the validated `unresolvedSemantics`
  via `computeCompileStatus` — a forged `COMPILED` claim with high-risk
  unresolved semantics can never pass;
- `riskClass` is read from the validated document (a shallow caller copy
  that disagrees with the content fails digest validation);
- malformed / schema-invalid / semantically-invalid contracts fail closed
  with `RoutingError`; the document is never mutated or repaired;
- a valid `CONTRACT_REVIEW_REQUIRED` contract routes to SOL contract check
  (it is intentionally non-authoritative for implementation but valid
  routing input);
- a valid `COMPILED` contract follows normal risk policy.

`contractReviewRequired` remains the explicit controller fact **only when
no semanticContract is supplied**. When a contract is supplied, a
contradictory flag (`true` on a validated COMPILED contract, or `false` on
a validated review-required contract) fails closed instead of overriding
validated source semantics.

## 9. Exact discovery, fail rather than silently substitute (requirement 7)

`discoverModel(key, config)` resolves a model **only** when (a) the key is
in the canonical metadata registry, (b) an explicit endpoint is configured,
and (c) disabled-by-default models were explicitly enabled. Anything else
throws `ProviderDiscoveryError`; the policy then emits
`FAIL_NO_SUBSTITUTE` (`PROVIDER_UNAVAILABLE` when no endpoint was
configured, `CAPABILITY_GAP_NO_SUBSTITUTE` otherwise) and records the stop
state `FAILED_NO_SUBSTITUTE`.

Substitution is never silent. The only permitted substitution paths are
explicit in configuration and recorded on the decision (`substituteOf` +
reason code):

1. `config.exactSubstitutes[modelKey]` — capability-equal replacement
   (same roles, same supported reasoning, same escalation-only status;
   `capabilityEqual`); recorded as `EXACT_SUBSTITUTE_CONFIGURED`;
2. `config.enableOptionalFallbacks` — Terra/Luna optional fallback;
   recorded as `CAPABILITY_FALLBACK_CONFIGURED`.

Escalation-only models (deepseek-pro-max) are refused in both paths. The
schema forbids `substituteOf` with any other reason code.

## 10. Escalation state machine (requirement 8 / state machine)

States: `ROUTING_READY`, `AWAITING_IMPLEMENTATION`, `AWAITING_REPAIR`,
`AWAITING_SOL_CONTRACT_CHECK`, `AWAITING_SOL_DIAGNOSE`,
`AWAITING_SOL_FINAL_REVIEW`, `AWAITING_SOL_RECHECK`, `AWAITING_PRO_MAX`,
and the terminal states `UNIT_COMPLETE`, `STOPPED_STUCK`,
`STOPPED_BUDGET`, `FAILED_NO_SUBSTITUTE`.

Key transitions (the full matrix is in `src/routing/state.mjs` and pinned
by `tests/routing/state-machine.test.mjs`):

- `ROUTING_READY --TASK_READY--> AWAITING_IMPLEMENTATION`
- `ROUTING_READY --CONTRACT_REVIEW_REQUIRED--> AWAITING_SOL_CONTRACT_CHECK`
- `AWAITING_SOL_CONTRACT_CHECK --SOL_CHECK_RESOLVED--> AWAITING_IMPLEMENTATION`
- `AWAITING_SOL_CONTRACT_CHECK --CONTRACT_REVIEW_REQUIRED--> AWAITING_SOL_CONTRACT_CHECK`
  (resolved outcome still unresolved: re-check)
- `AWAITING_SOL_DIAGNOSE --SOL_DIAGNOSIS_READY--> AWAITING_IMPLEMENTATION`
- `AWAITING_IMPLEMENTATION --FAILURE_FIRST_CREDIBLE--> AWAITING_REPAIR`
  (exactly one bounded repair)
- `AWAITING_IMPLEMENTATION --SEMANTIC_REJECTION--> AWAITING_SOL_DIAGNOSE`
- `AWAITING_IMPLEMENTATION --SOL_FINDING_SURVIVED_REPAIR--> AWAITING_SOL_RECHECK`
  (diagnose/repair-origin finding after implementation)
- `AWAITING_IMPLEMENTATION --RESULT_ACCEPTED_HIGH_RISK--> AWAITING_SOL_FINAL_REVIEW`
- `AWAITING_SOL_FINAL_REVIEW --FAILURE_FIRST_CREDIBLE--> AWAITING_REPAIR`
  (localized final-review finding: one bounded repair)
- `AWAITING_REPAIR --SOL_FINDING_SURVIVED_REPAIR--> AWAITING_SOL_RECHECK`
- `AWAITING_SOL_RECHECK / AWAITING_SOL_FINAL_REVIEW --SOL_REVIEW_PASSED--> UNIT_COMPLETE`
- `AWAITING_SOL_RECHECK --RESULT_ACCEPTED_HIGH_RISK--> AWAITING_SOL_FINAL_REVIEW`
  (recheck passed but HIGH_RISK final review not yet proven)
- `AWAITING_SOL_* --PRO_MAX_JUSTIFIED--> AWAITING_PRO_MAX`
- `* --STUCK--> STOPPED_STUCK`, `* --BUDGET_EXHAUSTED--> STOPPED_BUDGET`,
  `* --CAPABILITY_GAP | PROVIDER_UNAVAILABLE--> FAILED_NO_SUBSTITUTE`
  (from every non-terminal state)

An undefined `(state, event)` pair throws `RouteStateError` — routing never
silently defaults an unknown transition, and terminal states absorb every
event (any further decision attempt fails closed).

## 11. SOL outcome flows (SOL-S05-005)

The SOL states are driven by structured **controller-owned** outcome facts
(never by worker/SOL response text; later orchestration populates them):

- `AWAITING_SOL_CONTRACT_CHECK` — the controller supplies the resolved
  validated contract: a valid `COMPILED` contract transitions through
  `SOL_CHECK_RESOLVED` and implementation proceeds; a still
  review-required contract re-enters contract check; no outcome fails
  closed.
- `AWAITING_SOL_DIAGNOSE` — the controller supplies
  `solDiagnosis = { status: 'RESOLVED' }`: `SOL_DIAGNOSIS_READY` and a
  bounded implementation route; no outcome fails closed.
- `AWAITING_SOL_FINAL_REVIEW` — the controller supplies
  `solReview = { verdict: 'PASSED' }` (complete via `SOL_REVIEW_PASSED`)
  or `{ verdict: 'FINDING', findingIds: [...] }` (exactly one bounded
  Flash repair via `FAILURE_FIRST_CREDIBLE`); no outcome fails closed.
- `AWAITING_SOL_RECHECK` — `solReview` verdict `PASSED` completes **only when**
  the recheck is tied, via controller-owned provenance, to a finding produced
  by a prior mandatory SOL FINAL_REVIEW; verdict `FINDING` (or an open
  finding with `repairCycles ≥ 1` and `rechecks ≥ 1`) stops STUCK with
  `SOL_FINDING_SURVIVES_ONE_REPAIR`.
- After terminal completion no further decision is possible (terminal
  states absorb every event).

### Final-review provenance (SOL-S05-001)

A SOL recheck is a distinct role that may originate from semantic diagnose
or ordinary repair paths as well as from the mandatory HIGH_RISK SOL
FINAL_REVIEW. For HIGH_RISK work, a generic recheck PASS is **not**
sufficient for completion: it routes to `ROUTE_SOL_FINAL_REVIEW` instead.
Completion from `AWAITING_SOL_RECHECK` is permitted only when the
controller-owned `solReview.findingIds` reference finding record(s) in
`ctx.solFindings` whose `origin` is `FINAL_REVIEW` (closed vocabulary
`SOL_FINDING_ORIGIN = ['FINAL_REVIEW', 'DIAGNOSE']`). Missing/invalid
provenance, a DIAGNOSE-origin finding, or a recheck originating from an
ordinary repair can never prove final-review satisfaction; a surviving
final-review finding still stops STUCK. No free-form model text or worker
output is authoritative anywhere in this mechanism.

## 12. Hard call budgets (requirement 9)

`createBudgetTracker({ unitCalls, runCalls })` enforces two hard caps:

- per-unit (reset with `resetUnit()` when a new work unit starts) and
- per-run (persists across units, so many small units can never silently
  exceed the run cap).

The routing policy consults `budget.isExhausted()` **before** every
decision: an exhausted budget yields `STOP_BUDGET` (reason
`BUDGET_EXHAUSTED`, state `STOPPED_BUDGET`) instead of any route.
`budget.consume()` is the belt-and-braces gate for dispatch layers: it
throws `BudgetExhaustedError` past a limit and consumption is atomic
(neither counter moves when the consume fails). Every decision records the
budget snapshot (`runCallsConsumed/Limit`, `unitCallsConsumed/Limit`) for
audit.

## 13. The route-decision record (requirement 8 / audit)

`schemaName: lcim.route-decision`, `schemaVersion: 2.0.0`. Every decision
records: `decisionId`, `runId?`, `workUnitId`, `decision`, `reasonCode`,
`state` → `nextState`, `decidedAt`, `budget` snapshot, `evidenceRefs`,
plus (per decision kind) `targetProvider`, `targetModel`, `targetRole`,
`reasoningLevel`, `substituteOf`, `escalationJustification`.

Conditional semantic rules (enforced in `src/routing/registry.mjs`
`validateRouteDecision`, mirroring the Sprint-00 REJECTED-disposition
rule):

- Pro MAX: justification required, basis locked, reasoning `MAX`, target
  `deepseek-pro-max`; Flash MAX: justification required, basis
  `CONTRACT_LOCKED_DIFFICULT_TASK`, reasoning `MAX`; plain Flash: reasoning
  `XHIGH` (MAX cannot dodge justification via the plain decision);
- `deepseek-pro-max` may appear **only** on `ROUTE_IMPLEMENT_PRO_MAX`
  (escalation-only; manual Flash/Pro-MAX stamps fail validation);
- implementation decisions require an implementation-capable model on
  provider `pi` with role `IMPLEMENT`/`REPAIR`; SOL decisions require
  `sol-xhigh` on provider `sol` with a SOL role (and reasoning `XHIGH`);
- `STOP_STUCK` requires a STUCK reason code; `STOP_BUDGET` requires
  `BUDGET_EXHAUSTED`; `substituteOf` requires a substitution reason code;
- terminal decisions carry no target/reasoning/escalation fields;
- budget counts are non-negative integers.

Records are stamped, validated, and deeply frozen by `stampRouteDecision` —
they are controller-authored audit records and can never be altered into
an inconsistent state.

## 14. Reason code catalog

Implementation reasons: `NORMAL_BOUNDED_TASK`, `REPAIR_TARGETED_FIRST`,
`MAX_JUSTIFIED`, `PRO_MAX_ESCALATION`, `EXACT_SUBSTITUTE_CONFIGURED`,
`CAPABILITY_FALLBACK_CONFIGURED`.

Escalation/stop reasons: `SEMANTIC_REJECTION_ESCALATION`,
`UNRESOLVED_HIGH_RISK_CONTRACT`, `SOL_RECHECK_AFTER_REPAIR`,
`SOL_FINAL_REVIEW`, `CAPABILITY_GAP_NO_SUBSTITUTE`, `PROVIDER_UNAVAILABLE`,
`BUDGET_EXHAUSTED`, `RESULT_ACCEPTED`.

STUCK reasons: `SAME_AC_FAILED_AFTER_REPAIR`,
`SUBSTANTIVE_SEMANTIC_CONTRADICTION`, `MODEL_ATTEMPTS_CONTRACT_CHANGE`,
`CONFLATES_DISTINCT_CONCEPTS`, `NO_FALSIFIABLE_EXPLANATION`,
`SCOPE_BROADENS_WITHOUT_EVIDENCE`, `SOL_FINDING_SURVIVES_ONE_REPAIR`,
`PROVIDER_LACKS_CAPABILITY`, `REPAIR_LIMIT_REACHED`.

## 15. Integration points

- Sprint 06 consumes the four SOL role targets and compiles the actual
  asks; Sprint 05 never writes SOL prompt text.
- Sprint 07 (ChatGPT SOL Pro, text-only) stays out of the routable set
  until its transport exists; the schema already reserves `sol-pro`.
- Sprint 08 consumes `lcim.route-decision` records (reason codes + budget
  snapshots) for audit projections.
- Sprint 10 (CLI) drives `decideRoute` with the routing context (including
  the controller-owned `solReview` / `solDiagnosis` outcome facts) and
  applies `budget.consume()` at dispatch time.

## 16. Public-safety notes

The route-decision record contains only routing metadata (targets, reason
codes, budgets, bounded justification details ≤ 300 chars). It never
carries credentials, prompts, transcripts, or target-repo evidence.
Endpoints in tests use `example.invalid` domains; endpoint content is
configuration, never credentials.
