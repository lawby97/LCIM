/**
 * Shared V2.0.1 codex-SOL test seam helpers (integration suites).
 *
 * The GPT-5.6 Sol codex channel runs Pi as a TRUSTED CONTROLLER-SIDE
 * provider client. Tests never invoke the real Pi and never depend on the
 * real OAuth store: this helper installs a fixture Pi CLI (a
 * controller-owned seam binary) and a fixture OAuth store, and mints the
 * controller-internal test capability every seam requires. Seam runs are
 * non-authoritative: they can never produce REVIEW_APPROVED.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mintSolTestSeam } from '../../src/controller/test-seams.mjs';
import { CODEX_OAUTH_PROVIDER, PI_AUTH_FILE } from '../../src/providers/oauth.mjs';

/**
 * Fixture pi CLI script. Validates the transport contract from inside the
 * invocation (canonical absolute entrypoint, controller-owned cwd,
 * allowlist env, isolated agent dir with ONLY the openai-codex auth entry)
 * and emits a canned SOL response parsed from the compiled ask.
 *
 * - `tokenEcho` echoes the access token (adversarial leak fixture);
 * - `refreshOnRun` rewrites the isolated auth.json with refreshed fixture
 *   tokens (Pi-rotation simulation) unless they are already present, and
 *   records `refreshObserved` in the dump;
 * - the fixture auto-detects the compiled ask's call type: SOL_DIAGNOSE
 *   -> CAUSE_IDENTIFIED, SOL_FINAL_REVIEW -> configurable PASS/FAIL, and
 *   SOL_RECHECK -> configurable RESOLVED/NOT_RESOLVED (a `recheckVerdicts`
 *   array consumes one verdict per recheck call, so a multi-defect
 *   lifecycle can resolve one defect and leave another open);
 * - `adjacentCriticalDefect` adds an accepted adjacentCriticalDefect to a
 *   FAIL final review (locked to a declared bound requirement of the
 *   ask), exercising the fifth-review adjacent-defect lifecycle;
 * - `oversizedValue` emits a parsed response whose canonical value
 *   exceeds the credential-scan budget (incomplete canonical scan
 *   fail-closed fixture);
 * - `holdAfterOutput` keeps the process alive after emitting the response
 *   (timeout acceptance-gate fixture);
 * - `dumpFile` records observed facts.
 *
 * Never produces production review authority.
 */
export function codexFixturePiScript({ tokenEcho = false, dumpFile = null, refreshOnRun = false, authFailure = false, holdAfterOutput = false, surfacePoison = false, finalReviewVerdict = 'PASS', recheckVerdict = 'RESOLVED', recheckVerdicts = null, adjacentCriticalDefect = false, oversizedValue = false } = {}) {
  const dump = dumpFile === null ? '' : `
const dumpTarget = ${JSON.stringify(dumpFile)};
const fsx = require('node:fs');
const observed = {
  argv0: process.argv[1],
  cwd: process.cwd(),
  home: process.env.HOME,
  path: process.env.PATH,
  agentDir: process.env.PI_CODING_AGENT_DIR,
  proxyVars: Object.keys(process.env).filter((k) => /PROXY/i.test(k)),
  piVars: Object.keys(process.env).filter((k) => /^PI_/i.test(k)),
  nodeOptions: process.env.NODE_OPTIONS ?? null,
  agentEntries: fsx.readdirSync(process.env.PI_CODING_AGENT_DIR),
  authKeys: Object.keys(JSON.parse(fsx.readFileSync(path.join(process.env.PI_CODING_AGENT_DIR, ${JSON.stringify(PI_AUTH_FILE)}), 'utf8'))),
};
fsx.mkdirSync(path.dirname(dumpTarget), { recursive: true });
fsx.writeFileSync(dumpTarget, JSON.stringify(observed));
`;
  const echo = tokenEcho ? `process.stdout.write(process.env.PI_CODING_AGENT_DIR + ' auth access: ' + JSON.parse(require('node:fs').readFileSync(require('node:path').join(process.env.PI_CODING_AGENT_DIR, ${JSON.stringify(PI_AUTH_FILE)}), 'utf8'))[${JSON.stringify(CODEX_OAUTH_PROVIDER)}].access + '\\n');` : '';
  const refresh = refreshOnRun ? `
const fsr = require('node:fs');
const authPath = require('node:path').join(process.env.PI_CODING_AGENT_DIR, ${JSON.stringify(PI_AUTH_FILE)});
const store = JSON.parse(fsr.readFileSync(authPath, 'utf8'));
const alreadyRefreshed = store[${JSON.stringify(CODEX_OAUTH_PROVIDER)}].access === 'refreshed-access-token-1234567890';
${dumpFile === null ? '' : `if (dumpTarget && fsx.existsSync(dumpTarget)) {
  const prior = JSON.parse(fsx.readFileSync(dumpTarget, 'utf8'));
  prior.refreshObserved = alreadyRefreshed;
  fsx.writeFileSync(dumpTarget, JSON.stringify(prior));
}`}
if (!alreadyRefreshed) {
  store[${JSON.stringify(CODEX_OAUTH_PROVIDER)}] = { ...store[${JSON.stringify(CODEX_OAUTH_PROVIDER)}], access: 'refreshed-access-token-1234567890', refresh: 'refreshed-refresh-token-1234567890', expires: Date.now() + 7200000 };
  fsr.writeFileSync(authPath, JSON.stringify(store), { mode: 0o600 });
}
` : '';
  const poisonSurface = surfacePoison ? `require('node:fs').writeFileSync(path.join(process.env.PI_CODING_AGENT_DIR, 'models.json'), '{}');` : '';
  const hold = holdAfterOutput ? `setInterval(() => {}, 60000);` : '';
  const recheckPick = recheckVerdicts === null
    ? `${JSON.stringify(recheckVerdict)}`
    : `(recheckCalls < ${JSON.stringify(recheckVerdicts)}.length ? ${JSON.stringify(recheckVerdicts)}[recheckCalls] : ${JSON.stringify(recheckVerdict)})`;
  const adjacentBlock = adjacentCriticalDefect ? `
    const lockedRequirementRef = prompt.match(/\\(locked: (se_[0-9a-f]{64})\\)/)?.[1];
    const adjacentEvidenceRef = prompt.match(/- \\[([^\\]]+)\\]/)?.[1];
    if (!lockedRequirementRef || !adjacentEvidenceRef) throw new Error('fixture could not bind the adjacent critical defect to the rendered ask');
` : '';
  const adjacentField = adjacentCriticalDefect ? `,
      adjacentCriticalDefects: [{ summary: 'a directly evidenced adjacent critical defect outside the named checklist', evidenceRefs: [adjacentEvidenceRef], lockedRequirementRef }]` : '';
  const oversizedBlock = oversizedValue ? `
    process.stdout.write('{"huge":"' + 'X'.repeat(17 * 1024 * 1024) + '"}');
` : '';
  return `#!/usr/bin/env node
'use strict';
const path = require('node:path');
// The compiled Sprint-06 ask arrives as the single positional message
// (matching the real Pi CLI contract); stdin carries no prompt.
const prompt = process.argv[process.argv.length - 1];
if (${JSON.stringify(authFailure)}) {
  process.stderr.write('OpenAI Codex token refresh failed (400): invalid_grant; re-authentication required\\n');
  process.exit(1);
}
${dump}
${echo}
${refresh}
${poisonSurface}
const callType = (prompt.match(/SOL call: (SOL_[A-Z_]+)/) || [])[1] || 'SOL_DIAGNOSE';
const askId = prompt.match(/Ask id: (lcim_sol_ask_[0-9a-f]+)/)[1];
if (callType === 'SOL_FINAL_REVIEW') {
  if (${JSON.stringify(finalReviewVerdict)} === 'FAIL') {
    const invariantRef = prompt.match(/- ([A-Za-z0-9:_-]+): .*\\(locked:/)?.[1];
    const evidenceRef = prompt.match(/- \\[([^\\]]+)\\]/)?.[1];
    if (!invariantRef || !evidenceRef) throw new Error('fixture could not bind FINAL_REVIEW finding to rendered ask');
${adjacentBlock}
    process.stdout.write(JSON.stringify({
      askId,
      callType: 'SOL_FINAL_REVIEW',
      verdict: 'FAIL',
      decisionSummary: 'the named invariant has a directly evidenced critical failure',
      evidence: [],
      findings: [{ findingId: 'lcim_finding_' + 'f'.repeat(32), severity: 'CRITICAL', invariantRef, summary: 'the named controller gate remains unsatisfied', evidenceRefs: [evidenceRef] }]${adjacentField}
    }));
  } else {
    process.stdout.write(JSON.stringify({ askId, callType: 'SOL_FINAL_REVIEW', verdict: 'PASS', decisionSummary: 'every named invariant holds', evidence: [], findings: [] }));
  }
} else if (callType === 'SOL_RECHECK') {
  // The fixture Pi runs as a FRESH process per invocation, so the recheck
  // counter must persist on disk (the run-scoped isolated agent dir),
  // never in process memory.
  // Store the counter OUTSIDE the inspected agent dir (the store parent
  // persists across invocations; the agent surface must stay clean).
  const recheckCounterFile = require('node:path').join(require('node:path').dirname(process.env.PI_CODING_AGENT_DIR), '.lcim-recheck-count');
  const recheckCalls = Number(require('node:fs').existsSync(recheckCounterFile) ? require('node:fs').readFileSync(recheckCounterFile, 'utf8') : 0) || 0;
  require('node:fs').writeFileSync(recheckCounterFile, String(recheckCalls + 1));
  const verdictForThisCall = ${recheckPick};
  if (verdictForThisCall === 'NOT_RESOLVED') {
    const findingId = prompt.match(/Prior finding[^\\n]*?(lcim_finding_[0-9a-f]{32})/)?.[1] || ('lcim_finding_' + 'f'.repeat(32));
    const evidenceRef = prompt.match(/- \\[([^\\]]+)\\]/)?.[1];
    process.stdout.write(JSON.stringify({ askId, callType: 'SOL_RECHECK', verdict: 'NOT_RESOLVED', decisionSummary: 'the exact prior finding survives the bounded repair', evidence: [], findings: [{ findingId, severity: 'CRITICAL', invariantRef: findingId, summary: 'the exact controller gate remains unsatisfied', evidenceRefs: evidenceRef ? [evidenceRef] : [] }] }));
  } else {
    process.stdout.write(JSON.stringify({ askId, callType: 'SOL_RECHECK', verdict: 'RESOLVED', decisionSummary: 'the prior bounded finding is resolved by the repair delta', evidence: [] }));
  }
} else {
  const criterion = prompt.match(/Criterion \\(sideEffectId\\): (se_[0-9a-f]{64})/)[1];
  const requirement = prompt.match(/Criterion requirement \\(authoritative, verbatim\\): (.*)/)[1];
  const evidence = prompt.match(/Prior evidence \\(refs into the single bounded evidence universe\\): (.*)/)[1].split(',')[0].trim();
${oversizedBlock}
  process.stdout.write(JSON.stringify({
    askId,
    callType: 'SOL_DIAGNOSE',
    verdict: 'CAUSE_IDENTIFIED',
    decisionSummary: 'one bounded cause identified',
    evidence: [],
    failure: {
      rootCause: 'the bounded controller gate was not satisfied',
      evidenceRefs: [evidence],
      repair: {
        mustChange: [{ target: 'mutation', change: 'restore the bounded controller gate' }],
        mustNotChange: [{ target: 'contract', reason: 'preserve locked semantics' }],
        exactTests: [{ name: 'criterion test', expectation: requirement, acceptanceCriterionRef: criterion }],
        verification: [{ method: 'controller check', expectation: 'the criterion is satisfied' }]
      },
      falsification: 'a passing controller gate would disprove this cause'
    }
  }));
}
${hold}
`;
}

/** Write a fixture pi CLI script and register cleanup. */
export function writeCodexFixturePi(t, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-pi-fixture-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'fixture-pi.cjs');
  fs.writeFileSync(file, codexFixturePiScript(options), { mode: 0o755 });
  return file;
}

/** Install a fixture Pi OAuth store (temp dir; never the real store). */
export function withCodexOAuthStore(t, { tokenValue = 'fixture-access-token-value', refreshValue = 'fixture-refresh-token-value' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lcim-integration-oauth-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, PI_AUTH_FILE),
    JSON.stringify({
      [CODEX_OAUTH_PROVIDER]: {
        type: 'oauth',
        access: tokenValue,
        refresh: refreshValue,
        expires: Date.now() + 3_600_000,
        accountId: 'fixture-account',
      },
    }),
  );
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  t.after(() => {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
  });
  return dir;
}

/**
 * Sixth-review rule: the real Pi auth store is READ-ONLY input authority.
 * Snapshot the REAL store bytes before a run; assert byte-identical after
 * the run so every LCIM test path proves it never wrote back a refreshed
 * credential.
 */
export function snapshotRealAuthBytes(t) {
  const { PI_CODING_AGENT_DIR } = process.env;
  const file = path.join(PI_CODING_AGENT_DIR, PI_AUTH_FILE);
  return {
    file,
    before: fs.readFileSync(file, 'utf8'),
    assertUnchanged() {
      const after = fs.readFileSync(file, 'utf8');
      if (after !== this.before) {
        throw new Error('REAL PI AUTH STORE WAS MODIFIED: LCIM must never write back refreshed credentials (read-only input authority)');
      }
    },
  };
}

/**
 * Full codex seam bundle: fixture OAuth store + fixture pi CLI + minted
 * test capability. Returns `{ piBin, testCapability }` for
 * `runController({ solTransportOptions: { piBin, testCapability } })`.
 */
export function codexSeam(t, { tokenEcho = false, dumpFile = null, refreshOnRun = false, authFailure = false, holdAfterOutput = false, surfacePoison = false, finalReviewVerdict = 'PASS', recheckVerdict = 'RESOLVED', recheckVerdicts = null, adjacentCriticalDefect = false, oversizedValue = false, tokenValue } = {}) {
  withCodexOAuthStore(t, { ...(tokenValue !== undefined ? { tokenValue } : {}) });
  const piBin = writeCodexFixturePi(t, { tokenEcho, dumpFile, refreshOnRun, authFailure, holdAfterOutput, surfacePoison, finalReviewVerdict, recheckVerdict, recheckVerdicts, adjacentCriticalDefect, oversizedValue });
  return { piBin, testCapability: mintSolTestSeam() };
}
