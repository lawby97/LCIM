# LCIM V2 manual SOL Pro text boundary (Sprint 07)

Sprint 07 implements a deliberately narrow manual handoff for bounded SOL
judgment. It is not a provider client, a browser driver, a file-transfer
feature, or a controller-execution path.

## Local-only record

`ProEscalationStore` writes each exchange only under the target repository Git
common directory:

```text
<git-common-dir>/lcim/sol-pro/escalations/<escalation-id>/record.json
```

It uses `resolveRuntimeRoot()` / `assertNoTrackedFilesUnder()` from the
existing runtime boundary and the Sprint-01 atomic JSON + lock helpers. The
record contains local evidence, compiler inputs, sources, compiled asks,
parsed replies, and any repair conversion. It is never written below the LCIM
source tree. `schemas/sol-pro-escalation.v2.schema.json` describes only the
public, evidence-free local-record envelope; it is not an authority record.

## Preparing text

The public service is exported from `src/sol/pro-handoff/index.mjs`:

```js
const record = await createProEscalation({
  cwd: targetRepository,
  findingId,
  askInput,       // raw bounded Sprint-06 input
  sources,        // validated Sprint-04 semantic sources
  context,        // optional task / prior attempt / controller rejection
});

await proCopy({
  cwd: targetRepository,
  escalationId: record.escalationId,
  clipboard,      // production: MacosPbcopyAdapter; tests: a mock
  output,
});
```

`proCopy()` does the following, in this order:

1. loads the local record;
2. validates/compiles the ask with the existing Sprint-06 `compileSolAsk()`;
3. renders bounded plain text (the initial exchange uses the existing
   Sprint-06 renderer);
4. redacts recognised credentials and local paths;
5. rejects an unredactable secret, file reference, raw local packet, oversized
   excerpt, or text over the hard limit;
6. writes exactly that one text string to the injected `writeText()` adapter;
7. prints manual paste instructions only.

The hard limit is exactly **12,000 JavaScript string characters** and is an
**absolute hard maximum** (`PRO_COPY_DEFAULT_MAX_CHARACTERS = 12_000`), not
merely a default. Any custom `maxCharacters` option must be a positive
integer no greater than 12,000, and the absolute cap is re-enforced
immediately before every clipboard write as a final defense. A 12,000-character
packet is accepted; a 12,001-character packet is rejected before `pbcopy` is
called. There is no slicing or silent shortening. Failure messages identify
only the local action needed (reduce an excerpt or remove sensitive material);
they do not echo the prohibited content.

Production `MacosPbcopyAdapter` invokes local `pbcopy` with text on stdin.
Tests use `MemoryClipboardAdapter` or an injected `spawnSync` mock, so tests
do not require a system clipboard.

## What the online text contains

The initial text is the compiled Sprint-06 one-question decision contract plus
compact manual-exchange bindings and an exact line-oriented response grammar.
It contains only:

- task and one primary decision question;
- locked contract key/digest bindings and relevant context;
- bounded code/diff/test/log-summary excerpts already retained by the SOL ask;
- a prior attempt or controller rejection when the local context says it is
  needed; and
- the exact response directive format.

It does not contain a repository, transcript, full diff, full log, raw LCIM
packet, local path, credential, or local artifact reference. The boundary
accepts text excerpts only; an explicit local file reference is refused rather
than read or transferred.

No implementation in `src/sol/pro-handoff/**` performs remote sending,
provider/API calls, browser driving, local-artifact transfer, repair execution,
or publication. The clipboard result must be pasted by a human into the
intended conversation.

## Stable identity and follow-ups

Each record has a stable `ESCALATION_ID` and controller-owned `FINDING_ID`.
Each exchange also has a one-use `RESPONSE_BINDING_ID`; this is a manual
protocol nonce, **not** the canonical Sprint-06 response ID. The latter is
generated only after the local response compiler accepts the directive.

`createProFollowUp()` permits only `SOL_RECHECK` input after a locally bound
prior response. It reuses the existing Sprint-06 recheck compiler and requires:

- the same stable escalation/finding identifiers;
- exact binding to the immediately prior local ask/response/finding;
- unchanged initial contract key/digest bindings; and
- a non-empty delta evidence set with no top-level old evidence.

Follow-ups accept **no supplemental free-form context**; the compact follow-up
task is derived from the compiled RECHECK ask, so first-exchange evidence,
attempt prose, or rejection prose can never be replayed through a context
field. Every initial supplemental context field (task / previousAttempt /
controllerRejection) passes the same outbound excerpt safety policy as
evidence before it can reach clipboard text.

The follow-up renderer intentionally does not invoke the full first-exchange
renderer. Its clipboard text carries compact identifiers, minimal locked
contract context, the recheck question, and **new or changed evidence only**.
It does not assume a conversation retains state.

## Pasting a reply back

The human must paste only a strict line-oriented block beginning with
`LCIM_SOL_PRO_DIRECTIVE_V1` and ending with
`END_LCIM_SOL_PRO_DIRECTIVE_V1`. The copied text supplies the exact field
names and allowed fields for the call type. Every directive must repeat:

```text
ESCALATION_ID: <exact local escalation id>
RESPONSE_BINDING_ID: <exact exchange nonce>
FINDING_ID: <exact controller finding id>
ASK_ID: <exact compiled ask id>
CONTRACT_BINDINGS: <exact key@digest bindings>
CALL_TYPE: <exact compiled call type>
VERDICT: <type-locked verdict>
DECISION_SUMMARY: <one bounded line>
```

`ingestPastedProResponse()` fails closed on malformed grammar, a wrong
response-binding/escalation/finding/ask/contract identifier, sensitive pasted
text, an already-recorded exchange, or an invalid Sprint-06 response. It does
not treat pasted text as a controller decision.

For a valid `SOL_DIAGNOSE` / `CAUSE_IDENTIFIED` directive, the service calls
existing `compileSolResponse()` and then existing `compileRepairTicket()`.
That preserves the Sprint-06/Sprint-04 source → ask → response → repair chain:
source-derived acceptance semantics, exact source/digest binding, bounded
scope, and deterministic repair identity. The returned result is labelled
`REQUIRES_CONTROLLER_VALIDATION`; it neither grants a controller disposition
nor executes a worker or repair.

## Tests

```bash
node --test tests/sol-pro/*.test.mjs
node --test tests/sol/*.test.mjs
npm test
```

The focused tests cover mocked `pbcopy`, runtime-only record placement,
redaction, file-like evidence refusal, exact 12k behavior, absence of remote
or browser/artifact-transfer code, first exchange, delta-only follow-up,
wrong identifiers, malformed reply refusal, and existing repair-ticket
conversion.
