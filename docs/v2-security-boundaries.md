# LCIM V2 Security Boundaries (Sprint 00)

This document fixes the public-safe boundary for the LCIM repository and the
external-provider boundaries for later sprints. The GitHub LCIM repository is
**public-safe**: nothing sensitive or runtime-local may ever be tracked there.

## 1. Public-safe repository

Never commit to the LCIM repository (this repo):

- API keys, tokens, secrets of any kind; Codex/ChatGPT/DeepSeek credentials;
- `.env` / `.env.*` files (a tracked `.env.example` is the only allow-listed
  exception);
- raw model transcripts (any `*.transcript.*`);
- review ZIPs/packets and review exports;
- local escalation records and SOL payloads;
- target-repo evidence (diffs, test logs, business-repository source excerpts);
- runtime logs / run state (canonical root: `<git-common-dir>/lcim`).

## 2. Runtime boundary

- Runtime state belongs under the **target repository's Git common
  directory**: `<git-common-dir>/lcim` (`src/config/runtime-path.mjs`).
- The Git common directory is never part of the tracked working tree, and
  linked worktrees share one store.
- `assertNoTrackedFilesUnder()` fails closed if tracked files ever appear
  under a runtime path; the ignore guards (`tests/guards/`) prove forbidden
  artifact classes are ignored even if someone writes them into the source
  tree by mistake.

## 3. Guard rails implemented at Sprint 00

- `.gitignore` baseline covering credentials, `.env*`, transcripts, review
  ZIPs/packets, escalation records, SOL payloads, target-repo evidence,
  runtime logs, and run-state names (pattern classes asserted by
  `tests/guards/ignore-guards.test.mjs`).
- Behavioral guard: a fresh git repo seeded with forbidden files shows
  `git status --porcelain` empty before and after `git add -A`, and every
  file matches `git check-ignore`.
- Tracked-tree scan (`tests/guards/public-safe.test.mjs`): every tracked file
  is checked against the forbidden-name rules; zero violations.
- Error records (`lcim.common.error` schema) carry only public-safe
  code/message/details — never credentials, transcripts, or raw model output.

## 4. External-provider boundaries (later sprints; fixed policy now)

- Permission gates are required before any external provider is called
  (Sprint 03+); no automatic provider invocation.
- Denied-path / secret filtering and exact model discovery fail closed rather
  than silently substituting models (Sprint 03/05).
- ChatGPT SOL Pro is **manual and TEXT ONLY**: no repository file, Markdown
  file, log, patch, ZIP, JSON packet, or other artifact may be uploaded
  (Sprint 07 owns the transport).
- SOL is a bounded decision engine: one primary question, explicit pass/fail
  conditions, bounded evidence, out-of-scope limits, exact response contract
  (Sprint 06). No generic reviews.
- Hard budgets with stop/fail states; no silent budget overrun (Sprint 05).

## 5. Credentials policy

- LCIM stores no credentials. Configuration referencing providers must use
  environment-provided secrets outside this repository; `.env*` files are
  ignored and never tracked.
- Workers never modify credentials or shell profiles.
