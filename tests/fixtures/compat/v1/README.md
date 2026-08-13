# tests/fixtures/compat/v1 — Sprint 09 synthetic V1 evidence fixtures

All fixtures are **public-safe synthetic/sanitized** reconstructions of the
known V1 evidence classes (docs/v1-characterization.md,
docs/worker-contract.md section 2, Sprint-02 BL-020 fixture patterns). No
raw business-repository source, no BL-020 archive data, no model
transcripts, no credentials, no local runtime paths.

Ledger fixtures carry a real integrity chain (digest = sha256 over the
canonical JSON of the event excluding its own `digest` field; GENESIS = 64
zeros). They are **immutable input**: tests prove byte-for-byte that the
reader never modifies them. Fixture files use `.txt`/`.json` extensions —
`.jsonl` is forbidden by the public-safe guard — but the `.txt` ledger
files are JSONL (one event per line) and `valid-lifecycle.json` is the
JSON-array encoding of the same variant.

## Ledger fixtures (`ledger/`)

| file | encoding | required historical case |
|---|---|---|
| `valid-lifecycle.json` | JSON array | 1. VALID V1 LIFECYCLE + 3. HASH-CHAIN (valid) |
| `incomplete-ledger.txt` | JSONL | 2. INCOMPLETE LEDGER (wu-0002 lacks later events while the ledger continues) |
| `hash-chain.txt` | JSONL | 3. HASH-CHAIN (valid, REJECTION later action) |
| `hash-chain-tampered.txt` | JSONL | 3. HASH-CHAIN (tampered content -> deterministic failure) |
| `schema-invalid-handoff-manual-integration.txt` | JSONL | 4. SCHEMA-INVALID WORKER HANDOFF + BL-020 distinction (patch useful via manual integration) |
| `missing-later-invocations.txt` | JSONL | 8. MISSING LATER INVOCATION RECORDS |
| `handoff-response-ref-only.txt` | JSONL | response text unavailable (ref only) -> UNKNOWN_V1 |
| `unsupported-v1-version.txt` | JSONL | 9. UNSUPPORTED V1 VERSION (v1Version 0.9) |
| `unsupported-event-kind.txt` | JSONL | 9. UNSUPPORTED V1 VERSION (unknown eventKind) |
| `unmarked-ledger-like.txt` | JSONL | 9. UNSUPPORTED (no version marker) |

## Handoff fixtures (`handoff/`)

| file | required historical case |
|---|---|
| `valid-v1-handoff.txt` | supported V1 handoff, V1-valid, V2-invalid (legacy `evidence`) |
| `patch-ready-handoff.txt` | worker PATCH_READY claim (never promoted) |
| `schema-invalid-status.txt` | 4. SCHEMA-INVALID WORKER HANDOFF (unknown status) |
| `schema-invalid-type.txt` | 4. SCHEMA-INVALID WORKER HANDOFF (wrong type) |
| `missing-test-log-path.txt` | 7. MISSING TEST LOG PATH (null -> UNKNOWN_V1) |
| `legacy-evidence-array.txt` | legacy evidence array + objective-evidence claims |

## Final-response fixtures (`response/`)

| file | required historical case |
|---|---|
| `fenced-response.txt` | 5. FENCED RESPONSE |
| `prose-wrapped-response.txt` | 6. PROSE-WRAPPED RESPONSE |
| `malformed-response.txt` | unparseable -> NOT_V1 / transport defect |

Work-unit ids `wu-00xx` are free-form V1 ids; `lcim_wu_...` ids match the
V2 id pattern (recorded via `workUnitIdV2PatternCompatible`, which is a
syntactic match only). Embedded response texts are deliberately small,
fake, public-safe placeholders.
