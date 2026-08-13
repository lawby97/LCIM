# prompts/sol — SOL ask templates (Sprint 06)

Sprint 06 owns the SOL-facing prompts. These templates render a compiled
`lcim.sol-ask` document into the bounded, deterministic text SOL actually
receives (see `src/sol/ask-compiler/render.mjs`). Each template is
call-type specific and embeds the exact decision contract: one primary
decision question, explicit pass/fail conditions, allowed scope,
out-of-scope, required response shape, repair constraints, and the
evidence budget.

## Files

| File | Call type | Primary decision |
|---|---|---|
| `contract-check.md` | `SOL_CONTRACT_CHECK` | Are the exact semantics of the referenced contracts sufficiently specified? |
| `diagnose.md` | `SOL_DIAGNOSE` | Why does this ONE acceptance criterion fail? |
| `final-review.md` | `SOL_FINAL_REVIEW` | Do the named high-risk invariants hold? |
| `recheck.md` | `SOL_RECHECK` | Is the prior finding resolved by the delta evidence? |

## Policy (locked by Sprint 06)

- Every template asks exactly ONE primary decision question with explicit
  pass/fail conditions, bounded evidence, out-of-scope limits, and an
  exact response contract. Generic asks (`review this`, `look for bugs`,
  `diagnose everything`) never reach SOL — the ask compiler preflights
  them away.
- SOL decides; SOL never edits files. No template asks SOL to edit,
  implement, or apply anything.
- No template bundles architecture, implementation, testing, and cleanup
  into one question.
- Templates are tracked documentation; they never contain credentials,
  model output, or target-repo evidence.
- Transport of the rendered ask to ChatGPT SOL Pro is Sprint 07's
  territory (manual, TEXT ONLY, no files).
