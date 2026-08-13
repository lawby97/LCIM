# LCIM V2 Semantic Contract Compiler (Sprint 04)

Status: implemented by Sprint 04 (see `docs/v2-sprints/SPRINT_04_SEMANTIC_CONTRACT.md`).

Purpose: compile **exact worker semantics** before implementation so models do
not invent field names, conflate digests/identities, or test only superficial
happy-path behavior. The compiler consumes **explicit structured inputs only** —
it never inspects business repositories automatically.

## Owned modules

| Path | Responsibility |
|---|---|
| `src/risk/classes.mjs` | Risk-class representation: the six `HIGH_RISK_CLASSES` + `LOW_RISK`; `isHighRiskClass`, `assertRiskClass` |
| `src/risk/side-effects.mjs` | Negative side-effect scope vocabulary (`provider_factory`, `network`, `database`, `lock`, `mutation`), fail-closed spec guard, and the deterministic content-bound `sideEffectId` derivation |
| `src/contracts/digest.mjs` | Deterministic semantic content identity: canonicalization, sha256, `computeSemanticDigest` |
| `src/contracts/deep-freeze.mjs` | Deterministic deep clone + recursive deep freeze for compiled contract documents |
| `src/contracts/registry.mjs` | Sprint-04 schema manifest (`lcim.semantic-contract`, `lcim.acceptance-contract`), loads via the shared Sprint-00 engine |
| `src/contracts/status.mjs` | `CONTRACT_COMPILE_STATUS` and `computeCompileStatus` (high-risk unresolved => `CONTRACT_REVIEW_REQUIRED`) |
| `src/contracts/compiler.mjs` | `compileSemanticContract(input)` — normalize, derive `sideEffectId`s and `semanticDigest`, stamp, compute status, validate, deep-freeze; `isAuthoritative` (full validation + digest) |
| `src/contracts/validate.mjs` | `validateSemanticContract`, `validateAcceptanceContract` — schema + conditional semantic rules + digest/side-effect identity verification + exact cross-document carry |
| `src/contracts/render.mjs` | Compact bounded human-readable renderers (used later by routing/SOL) |
| `src/contracts/repair.mjs` | Authority-bound worker-ready repair/acceptance contract builder (`buildRepairContract`) — rejected acceptance references, bounded `mustChange`, `frozenSemantics` carry, `sourceSemanticDigest` binding |
| `schemas/semantic-contract.v2.schema.json` | Document schema for compiled semantic contracts |
| `schemas/acceptance-contract.v2.schema.json` | Document schema for worker-ready repair contracts |

The shared Sprint-00 contracts (`src/shared/**`, `schemas/common/**`) are
**not modified**. The two Sprint-04 schemas are self-contained and stay inside
the Sprint-00 engine subset (no `$ref`/`oneOf`/`format`/`minimum`), so the
failure-closed keyword discipline applies unchanged.

## The semantic contract document

`schemaName: lcim.semantic-contract`, `schemaVersion: 2.0.0`. Top-level fields:

- `contractKey` — stable key, e.g. `bl020.provider-construction-before-authz`.
  A human/domain key only; it is **not** content identity.
- `compileStatus` — `COMPILED` or `CONTRACT_REVIEW_REQUIRED` (computed, never
  hand-set).
- `riskClass` — one of `RISK_CLASSES` (six high-risk classes + `LOW_RISK`).
- `semanticDigest` — deterministic content identity (64 hex sha256) of ALL
  authority-bearing semantic content (see "Semantic content identity").
- `sourceObjects` — authoritative source objects (kind: schema/record/config/
  fixture/documentation/evidence; `key`, `ref`, `path`, `authority`). Concepts
  reference them by `sourceObjectKey`; a reference to an undeclared source
  object is an error, a missing reference is a warning.
- `concepts` — the authoritative units: `name`, `kind`
  (field/record/digest/identity/registry/ticker/timestamp/enum/provider/
  mutation/gate), exact `authoritativeFieldNames` (case-sensitive),
  `authoritativeEnum`, `digestMeaning`, `identityMeaning`,
  `dateTimeRepresentation`, `ownership`, `lifecycle` + `allowedTransitions`,
  `forbiddenAlternatives`, `failureBehavior`.
- `distinctConcepts` — `must_not_conflate` pairs: `conceptA`, `conceptB`,
  `mustNotConflate`, `severity` (WARNING/CRITICAL), optional `warnIfSameValue`
  and `alsoDistinctFrom`.
- `negativeSideEffects` — first-class negative acceptance criteria:
  `gate`, `scope`, `requirement`, `expectedCount` (integer >= 0), optional
  `evidenceKind`, plus the derived content-bound identity `sideEffectId`
  (`se_` + 64 hex).
- `factsEstablished` — established facts with evidence (`fact`, `evidence`).
- `unresolvedSemantics` — questions that remain open (`question`, `riskClass`,
  `impact`, `requiredBy`). **Never invented answers**: an unresolved entry
  carrying an answer-like field is rejected.
- `compileWarnings` — warnings surfaced during compilation (missing
  digest/identity meaning, missing source of truth, forbidden-alternative
  overlap).

## Compile status rule (no invention)

`computeCompileStatus(unresolvedSemantics)`:

- any entry with `riskClass` in `HIGH_RISK_CLASSES` =>
  `CONTRACT_REVIEW_REQUIRED`;
- otherwise (including `LOW_RISK` entries) => `COMPILED`.

`validateSemanticContract` recomputes the status and fails closed
(`STATUS_MISMATCH`) if the document disagrees — high-risk unresolved
semantics can never hide under `COMPILED`.

`isAuthoritative(contract)` is true **only** when the object is a complete,
schema-valid, semantically valid semantic contract whose recomputed
compile status is `COMPILED` and whose `semanticDigest` is internally valid
(recomputed digest matches). A caller-supplied `compileStatus` alone never
establishes authority; invalid/malformed objects simply return `false`
(`isAuthoritative` never mutates or repairs its input).

Compiled output is **deeply immutable**: `compileSemanticContract` deep-
clones the caller's input and recursively freezes every nested object and
array (concepts, source objects, distinct concepts, unresolved items,
negative side effects, lifecycle/status material, digest). Post-validation
mutation attempts fail in strict mode and can never create a `COMPILED` +
unresolved HIGH-RISK contradiction. `buildRepairContract` output is deeply
immutable the same way.

Safe low-risk omission: a `LOW_RISK` unresolved question is recorded verbatim
in the document and does not block compilation; it is never answered,
dropped, or promoted.

## Semantic content identity (`semanticDigest`)

`schemaName`/`schemaVersion`, `contractKey`, `title`, and prose are not
content identity. The compiler derives `semanticDigest` from a canonical
representation of ALL authority-bearing semantic content (see
`src/contracts/digest.mjs`):

- `contractKey` (namespace/context) and `riskClass`;
- `sourceObjects` (authoritative identity/reference data);
- `concepts` — names, kinds, authoritative field names/enums, digest and
  identity meanings, date/time representations, ownership, lifecycle and
  allowed transitions, forbidden alternatives, source binding, failure
  behavior;
- `distinctConcepts` / `must_not_conflate` relationships;
- `negativeSideEffects` including `sideEffectId` (requirement, count,
  evidence expectation);
- `factsEstablished` and `unresolvedSemantics` (including risk class).

Canonicalization is deterministic: object keys are sorted recursively (key
insertion order never matters); set-like top-level collections are sorted by
canonical serialization; scalar sub-lists keep their authored order.
Excluded: `compiledAt` (timestamp), `compileWarnings` (derived), `title`
(prose), and the digest itself. The digest never depends on timestamps,
random ids, or renderer prose. `validateSemanticContract` recomputes and
verifies the digest (`DIGEST_MISMATCH` fails closed); a caller-supplied
digest is rejected by the compiler and never authoritative.

`contractKey` and `semanticDigest` are **not** the same thing: `contractKey`
may repeat across materially different contracts; `semanticDigest` cannot.
Acceptance/repair contracts carry `sourceSemanticDigest` and validation
binds them to the exact source content — never merely `contractKey`.

## Ambiguity rules (C5)

Distinct digests/identities cannot be represented ambiguously:

- duplicate concept names => error (`DUPLICATE_CONCEPT`);
- duplicate source-object keys => error (`DUPLICATE_SOURCE_KEY`) — a
  concept referencing the key could not know which source object supplies
  authority; the ambiguity is rejected, never resolved by picking a
  winner, merging, or inspecting external repositories;
- duplicate negative side-effect identities => error
  (`DUPLICATE_SIDE_EFFECT_ID`); a carried `sideEffectId` that does not
  match the deterministic identity derived from the spec content => error
  (`SIDE_EFFECT_ID_MISMATCH`);
- `semanticDigest` not equal to the digest recomputed from the content =>
  error (`DIGEST_MISMATCH`);
- `distinctConcepts` referencing unknown concepts or a self-pair => error
  (`UNKNOWN_DISTINCT_REF`, `SELF_DISTINCT_PAIR`);
- a `must_not_conflate` pair whose concepts share a `digestMeaning` or
  `identityMeaning` => error (`AMBIGUOUS_MEANING`);
- the same authoritative field name claimed by two concepts => error
  (`FIELD_NAME_OVERLAP`);
- a digest/identity concept without its meaning, a concept without a source
  object, or a forbidden alternative claimed by two concepts => warnings
  (`MISSING_DIGEST_MEANING`, `MISSING_IDENTITY_MEANING`,
  `MISSING_SOURCE_OF_TRUTH`, `FORBIDDEN_ALTERNATIVE_OVERLAP`);
- transitions referencing states outside the declared lifecycle => error
  (`INVALID_TRANSITION_STATE`).

## Negative side effects

For high-risk gates the compiler carries negative side-effect requirements:
side-effect scopes whose counts must remain zero (e.g. before an
authorization failure is handled). Scopes: `provider_factory`, `network`,
`database`, `lock`, `mutation`. `expectedCount` must be an integer >= 0
(`INVALID_SIDE_EFFECT_COUNT` otherwise).

**Identity.** Every requirement carries a deterministic, content-bound
`sideEffectId` (`se_` + sha256 of the canonical spec content) derived by
the compiler (`src/risk/side-effects.mjs`). `gate::scope` is NOT an
identity: two requirements may legitimately share `gate::scope` while
remaining independently identified. It is impossible for two distinct
requirements to share an identity, and identical duplicate requirements
collide and fail. Array indices are never used.

**Exact carry.** `buildRepairContract` copies every source
`negativeSideEffects` entry verbatim (identity, gate, scope, requirement,
`expectedCount`, `evidenceKind`) and generates one acceptance test per
entry keyed by `negativeSideEffectId` and pinning
`expectedSideEffectCount`. `validateAcceptanceContract(doc,
{semanticContract})` fails closed if any source spec is dropped
(`SIDE_EFFECT_NOT_CARRIED`), altered in transit
(`SIDE_EFFECT_CARRY_MISMATCH`), invented
(`SIDE_EFFECT_NOT_FROM_SOURCE`), or lacks its own acceptance-test entry
(`SIDE_EFFECT_TEST_MISSING` / `SIDE_EFFECT_TEST_MISMATCH`). Two distinct
requirements can never collapse onto one acceptance item merely because
`gate::scope` matches.

**Unambiguous cardinality (R2-002).** Carried side effects and their test
references must be unique per identity: each `sideEffectId` may appear in
the repair's `negativeSideEffects` exactly once (`DUPLICATE_CARRIED_SIDE_EFFECT`
— an exact duplicate is still ambiguous and fails; there is no
first/last-wins behavior), and each source side effect must be referenced
by exactly one acceptance-test entry (`DUPLICATE_SIDE_EFFECT_TEST` —
duplicate references, identical or conflicting, fail). `gate::scope` is
still never identity: two distinct side effects sharing `gate::scope` with
different deterministic `sideEffectId`s remain independently carried and
tested.

## Repair/acceptance contract

`schemaName: lcim.acceptance-contract`, `schemaVersion: 2.0.0`. Built by
`buildRepairContract({ semanticContract, rejectedAcceptanceRefs,
objective, violation, requiredBehavior, mustChange, mustNotChange,
acceptanceTests, verification, findingRefs?, createdAt? })`:

- the source must be **authoritative**: `isAuthoritative(semanticContract)`
  (complete, schema-valid, semantically valid, `COMPILED`, digest-valid).
  Malformed, schema-invalid, semantically invalid, non-`COMPILED`, and
  `CONTRACT_REVIEW_REQUIRED` sources are rejected;
- the cross-document validator enforces the **same authority gate**
  directly (R2-001): `validateAcceptanceContract(doc,
  {semanticContract})` rejects a non-authoritative source with
  `SOURCE_NOT_AUTHORITATIVE` before any key/digest/carry relationship is
  trusted — a hand-constructed repair document can never bypass the
  builder's authority requirement through the direct validator path, even
  when `contractKey`, `sourceSemanticDigest`, carries, and tests all match;
- `rejectedAcceptanceRefs` (>= 1, unique) explicitly names the source
  acceptance items that failed, as `sideEffectId`s that must resolve to
  source negative side-effect items;
- `mustChange` targets are **bounded** to the repair scope derived from
  the rejected acceptance items (their side-effect scopes); unrelated
  targets fail closed (`UNBOUNDED_MUST_CHANGE`). This is semantic repair
  scope, not Sprint-03 file scope;
- `sourceSemanticDigest` binds the repair to the exact source content
  (`SOURCE_DIGEST_INVALID` / `SOURCE_DIGEST_MISMATCH` fail closed);
- `frozenSemantics` mechanically carries the preserved source requirements
  verbatim — source objects, concepts, `distinctConcepts` /
  `must_not_conflate`, non-rejected negative side effects, established
  facts, and low-risk unresolved items — as constraints
  (`FROZEN_REQUIREMENT_MISMATCH` fails closed if tampered);
- `repairId` follows the shared LCIM ID convention: `lcim_repair_<32 hex>`
  (generated/validated in `src/contracts/repair.mjs`; the frozen
  `src/shared/ids.mjs` is untouched). `repairId` is a repair instance id,
  never the source semantic identity;
- `contractKey` must match the source semantic contract;
- `mustChange` (>= 1 entry), `mustNotChange`, `acceptanceTests` (>= 1),
  `verification` (>= 1), `negativeSideEffects` (exact carry);
- the repair never asks the worker to decide unresolved authoritative
  semantics, semantic acceptance, provider/model choice, routing, or Git
  state;
- output is deeply frozen, stamped, validated, and bounded (schema caps on
  every field; renderers additionally hard-cap at `RENDER_MAX_LENGTH`).

## Renderers

`renderSemanticContract(contract)` and `renderAcceptanceContract(repair)`
produce compact, deterministic, public-safe text (no credentials, no
transcripts, no business-repository excerpts) for later routing/SOL use.
`renderSemanticContract` shows `semanticDigest` and each side effect's
`sideEffectId`. `renderAcceptanceContract` clearly separates **REPAIR
TARGETS** (rejected acceptance items + bounded `mustChange`) from **FROZEN
REQUIREMENTS** (must-not-change constraints carried from the source) and
tags every carried side effect as `REJECTED TARGET` or `FROZEN`.

## Running the tests

```bash
node --test tests/contracts/*.test.mjs   # Sprint 04 focused tests (95)
npm test                                  # full suite incl. Sprint-00 regression
```

## BL-020 characterization fixtures

`tests/fixtures/contracts/` maps the observed BL-020 error classes (see
`docs/v1-characterization.md` C5):

- `bl020-approval-field-casing.json` — approval field names/casing;
- `bl020-decision-evidence-membership-digests.json` — decision vs evidence vs
  membership digests;
- `bl020-source-current-ticker-binding.json` — source/current ticker binding;
- `bl020-serial-date-time-format.json` — serial date/time formats;
- `bl020-provider-construction-before-authz.json` — provider construction
  before persisted authorization (with the full negative side-effect
  contract).

Plus `valid-*` / `invalid-*` fixtures covering ambiguity, status mismatch,
contradictory lifecycles, invented answers, unknown source objects,
duplicate source keys, side-effect count violations, and digest/identity
binding.
