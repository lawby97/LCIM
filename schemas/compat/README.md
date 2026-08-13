# schemas/compat — Sprint 09 V1-compatibility schemas

Sprint 09 owns these families (version `1.0.0`, independent of the frozen
Sprint-00 `lcim.common.*` family at `2.0.0` and of the Sprint-01/02
families). They are validated with the same shared Sprint-00 engine
(`src/shared/schema/validate.mjs`), so the failure-closed subset discipline
applies unchanged. No shared file is modified.

## Registry

| schemaName | file | version |
|---|---|---|
| `lcim.v1.ledger-event` | `v1-ledger-event.v1.schema.json` | 1.0.0 |
| `lcim.v1.handoff` | `v1-handoff.v1.schema.json` | 1.0.0 |
| `lcim.v1.projection` | `v1-projection.v1.schema.json` | 1.0.0 |

The manifest in `src/compat/v1/schemas.mjs` is authoritative; this table is
documentation.

## Semantics

- `lcim.v1.ledger-event` — one event of the SUPPORTED V1 assignment-ledger
  variant (v1Version `'1.0'`): `ASSIGNMENT | HANDOFF | CONTROLLER_ACTION`,
  integrity-chained via `prevDigest`/`digest` (sha256 over the canonical
  JSON of the event excluding its own `digest`; GENESIS = 64 zeros).
  Kind-specific rules are enforced in `src/compat/v1/ledger.mjs`.
- `lcim.v1.handoff` — the historical V1 worker handoff payload. It
  deliberately ALLOWS what V2 forbids: `PATCH_READY` status, the legacy
  `evidence` field (string or array), and the V1 objective-evidence fields
  (all worker CLAIMS, never controller facts).
- `lcim.v1.projection` — the normalized V2-compatible projection output.
  `provenance` is pinned to `V1_COMPAT`; unavailable facts are the reserved
  sentinel `UNKNOWN_V1`; V2 controller dispositions, usage/cost, review
  findings, and later invocation records are pinned to `UNKNOWN_V1` by
  schema. Empty strings are rejected by the code-side rule in
  `src/compat/v1/schemas.mjs`.

## Reserved sentinel

`UNKNOWN_V1` is a reserved literal. A fact is either the exact value
established by V1 evidence, the sentinel `UNKNOWN_V1`, or absent — it is
never an invented default (`false`, `0`, `''`, `accepted`, `rejected`,
`integrated`, `complete`, …).

See `docs/v2-migration.md` for the full compatibility contract.
