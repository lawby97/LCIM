# prompts/deepseek — worker response contracts (Sprint 02)

Sprint 02 owns the worker-facing prompts. The authoritative model-facing
contract is `WORKER_RESPONSE_CONTRACT.md`; `worker.system.md` is the system
prompt that embeds that contract for a copy-paste worker session.

## Files

| File | Purpose |
|---|---|
| `WORKER_RESPONSE_CONTRACT.md` | Authoritative response contract: allowed statuses, allowed fields, forbidden fields, transport shape rules, uncertainty reporting. |
| `worker.system.md` | System prompt for the DeepSeek implementation worker. Self-contained: paste it into the worker session along with the work-unit brief. |

## Policy (locked by Sprint 02)

- Reporting `BLOCKED`, `FAILED`, or `NO_CHANGE` is correct behavior, never
  a failure. No prompt pressure toward success.
- The worker reports only model-owned communication. Objective evidence
  (changed files, patch hashes, base/HEAD SHAs, test logs, exit status,
  secret scans, integration status) is controller-owned and must never
  appear in the response.
- The worker never emits `PATCH_READY` and never reports controller
  dispositions. Only the controller decides patch validity and acceptance.
- The response is exactly ONE JSON object (raw, or inside one json fence).
- Uncertainty must be reported factually (`uncertainty` field), never
  hidden to look successful.

## Usage

1. Resolve the runtime root for the target repository
   (`<git-common-dir>/lcim`; see `src/config/runtime-path.mjs`).
2. Run the worker with `worker.system.md` plus the work-unit brief.
3. Preserve the exact final response text
   (`src/handoff/preserve.mjs`) and assess it
   (`src/handoff/assessment.mjs`).

Prompt files are tracked documentation; they never contain credentials,
model output, or target-repo evidence.
