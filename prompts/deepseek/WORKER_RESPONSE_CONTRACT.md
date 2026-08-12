# Worker response contract (model-facing, authoritative)

This is the contract for the JSON object you return at the end of a work
unit. It is enforced by the controller's schema validation; anything else
makes your response transport-invalid. Reporting difficulty is fully
acceptable — the controller distinguishes "no valid status received" from
an explicit `BLOCKED`/`FAILED` report and treats both without penalty.

## 1. Status vocabulary

Your `workerStatus` must be exactly one of:

| Status | Meaning |
|---|---|
| `WORK_COMPLETE` | You finished the requested work as far as you could and you are handing it over. This is NOT a claim that the result is accepted — acceptance is decided only by the controller. |
| `BLOCKED` | You could not proceed because of an external dependency, missing input, or an environment problem. |
| `FAILED` | You attempted the work and it did not complete; say why in `summary` and list what remains in `remainingIssues`. |
| `NO_CHANGE` | The work unit required no change, or everything requested was already in place. |

There is no other status. In particular, never use `PATCH_READY` — that is
not a worker status, and you never claim patch readiness. You also never
report controller decisions (patch validity, semantic acceptance,
integration, review approval) in either direction.

## 2. Response shape

Return exactly ONE JSON object — either as the entire response, or inside a
single fenced block:

```json
{
  "workUnitId": "lcim_wu_<32 hex>",
  "workerStatus": "WORK_COMPLETE | BLOCKED | FAILED | NO_CHANGE",
  "summary": "bounded, factual summary (max 2000 chars)",
  "acceptanceClaims": [
    {
      "claim": "a specific claim you make about the work (max 500 chars)",
      "evidenceRefs": ["reference to evidence you can point at (max 500 chars each)"]
    }
  ],
  "remainingIssues": ["anything left undone or unresolved"],
  "reviewRisks": ["risks a reviewer should look at"],
  "uncertainty": "anything you are not sure about, stated factually"
}
```

Rules:

- Only `workUnitId`, `workerStatus`, `summary`, `acceptanceClaims`,
  `remainingIssues`, `reviewRisks`, `uncertainty` are allowed. No other
  top-level field is permitted — the schema rejects additional fields.
- `workUnitId`, `workerStatus`, `summary` are required.
- `acceptanceClaims` items contain exactly `claim` (string) and
  `evidenceRefs` (array of strings).
- All strings are bounded; keep summaries and lists tight.
- If you are uncertain about anything, say so in `uncertainty` and in
  `remainingIssues`/`reviewRisks`. Never hide uncertainty to look
  successful. Never invent claims or evidence refs you cannot support.
- If you did not complete the work, `BLOCKED` or `FAILED` with a factual
  summary and `remainingIssues` is the correct, expected response.

## 3. Transport shape

- Strict JSON only, or one JSON fence (```json ... ```), or one JSON object
  with harmless prose before/after it. Never more than one JSON object;
  never multiple fenced blocks; never truncated JSON.
- Do not wrap the object in code fences of other languages.

## 4. Never include (controller-owned / legacy fields)

These are controller-owned objective facts or legacy V1 fields. Including
them makes the response schema-invalid:

- changed-file lists, line counts, patch hashes, diffs;
- base/HEAD SHAs or any Git identity claims;
- test-log paths, test exit status, exit codes;
- secret-scan results, integration status;
- controller dispositions of any kind;
- envelope metadata (schema names, versions, LCIM version, config digests);
- the legacy `evidence` field (string or array) — use
  `acceptanceClaims[].evidenceRefs` instead.

You do not inspect Git state to report these facts; the controller does
that itself.
