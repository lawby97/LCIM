#!/usr/bin/env node
/** Standalone LCIM V2 CLI. Handlers are adapters over reviewed modules. */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getVersionInfo } from '../src/config/version.mjs';
import {
  cliAbort,
  cliAudit,
  cliFinalize,
  cliProCopy,
  cliRecover,
  cliReviewExport,
  cliRun,
  cliSetup,
  cliStatus,
} from '../src/cli/service.mjs';

const HELP = `LCIM — Low Cost Implementation Model (V2)

Usage: lcim <command> [options]

Commands:
  --version, -v             Print the LCIM version and LCIM source commit.
  --help, -h                Show this help.
  setup                     Create minimal non-secret .lcim project config.
  run                       Run one isolated reviewable work unit.
  status                    Show local controller/runtime status.
  audit --last N           Write a local canonical audit projection.
  review-export --last N   Write a local sanitized REVIEW.md export.
  pro-copy <id>             Copy one bounded manual SOL Pro text exchange.
  recover <run-id>          Reconcile orphaned invocations and finalize.
  finalize <run-id>        Finalize an open run without changing history.
  abort <run-id>           Abort an open run explicitly.

Common options:
  --cwd <dir>               Target Git worktree (default: current directory).
  --json                    Print the result as JSON where supported.

Sprint 10 policy: runtime evidence stays under the target Git common
 directory; workers run in controller-created boundaries; candidates are
 reviewable only and are never committed, pushed, merged, or published.
`;

function valueAfter(args, index, option) {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

function parseArgs(argv) {
  const positionals = [];
  const options = { cwd: process.cwd(), json: false, last: null, force: false, dryRun: false, exchangeSequence: undefined, note: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--cwd' || arg === '-C') {
      options.cwd = valueAfter(argv, i, arg);
      i += 1;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--last') {
      const raw = valueAfter(argv, i, '--last');
      options.last = Number(raw);
      if (!Number.isInteger(options.last) || options.last < 1) throw new Error('--last must be a positive integer');
      i += 1;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--exchange') {
      const raw = valueAfter(argv, i, '--exchange');
      options.exchangeSequence = Number(raw);
      if (!Number.isInteger(options.exchangeSequence) || options.exchangeSequence < 1) throw new Error('--exchange must be a positive integer');
      i += 1;
    } else if (arg === '--note') {
      options.note = valueAfter(argv, i, '--note');
      i += 1;
    } else if (arg.startsWith('-')) {
      throw new Error(`unknown option '${arg}'`);
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, options };
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printResult(value, json, label) {
  if (json) {
    printJson(value);
    return;
  }
  if (value?.outDir) {
    process.stdout.write(`${label}: ${value.outDir}\n`);
    return;
  }
  if (value?.dir) {
    process.stdout.write(`${label}: ${value.dir}\n`);
    return;
  }
  if (value?.runId) {
    process.stdout.write(`run: ${value.runId}\nwork unit: ${value.workUnitId ?? 'n/a'}\ndisposition: ${value.disposition ?? value.lifecycleState ?? 'UNKNOWN'}\n`);
    if (value.candidate) process.stdout.write('candidate: REVIEWABLE_CANDIDATE (no automatic publication)\n');
    if (value.errors?.length) process.stdout.write(`controller notes: ${value.errors.length}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function dispatch(command, parsed) {
  const { positionals, options } = parsed;
  if (command === 'setup') {
    if (positionals.length > 0) throw new Error('setup does not accept positional arguments');
    const result = await cliSetup({ cwd: options.cwd, force: options.force });
    printResult(result, options.json, 'project setup');
    return 0;
  }
  if (command === 'run') {
    if (positionals.length > 0) throw new Error('run does not accept positional arguments');
    const result = await cliRun({ cwd: options.cwd });
    printResult(result, options.json, 'run');
    return result.ok ? 0 : 1;
  }
  if (command === 'status') {
    if (positionals.length > 0) throw new Error('status does not accept positional arguments');
    const result = await cliStatus({ cwd: options.cwd });
    if (options.json) printJson(result);
    else {
      process.stdout.write(`target: ${result.repoDir}\nruntime: ${result.runtimeRoot}\nproject: ${result.project.projectKey} (${result.project.exists ? 'configured' : 'defaults'})\nruns: ${result.runs.length}\n`);
      for (const run of result.runs) process.stdout.write(`- ${run.runId}: ${run.lifecycleState} candidates=${run.candidates.length}\n`);
    }
    return 0;
  }
  if (command === 'audit') {
    if (positionals.length > 0) throw new Error('audit does not accept positional arguments');
    const result = await cliAudit({ cwd: options.cwd, last: options.last });
    printResult({ outDir: result.outDir, result: result.result }, options.json, 'audit');
    return 0;
  }
  if (command === 'review-export') {
    if (positionals.length > 0) throw new Error('review-export does not accept positional arguments');
    const result = await cliReviewExport({ cwd: options.cwd, last: options.last });
    printResult(result, options.json, 'review export');
    return 0;
  }
  if (command === 'pro-copy') {
    const escalationId = positionals[0];
    if (!escalationId || positionals.length > 1) throw new Error('pro-copy requires exactly one local escalation id');
    const result = await cliProCopy({ cwd: options.cwd, escalationId, exchangeSequence: options.exchangeSequence, dryRun: options.dryRun });
    printResult(result, options.json, 'pro-copy');
    return 0;
  }
  if (command === 'recover' || command === 'finalize' || command === 'abort') {
    const runId = positionals[0];
    if (!runId || positionals.length > 1) throw new Error(`${command} requires exactly one run id`);
    const handler = command === 'recover' ? cliRecover : command === 'finalize' ? cliFinalize : cliAbort;
    const result = await handler({ cwd: options.cwd, runId, note: options.note });
    printResult(result, options.json, command);
    return 0;
  }
  throw new Error(`unknown command '${command}' — Sprint 10 CLI integration supports --version/--help, setup, run, status, audit, review-export, pro-copy, and recovery helpers`);
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(HELP);
    return 0;
  }
  if (argv[0] === '--version' || argv[0] === '-v') {
    const info = getVersionInfo();
    const commit = info.gitCommitShort ? ` (git ${info.gitCommitShort})` : '';
    process.stdout.write(`LCIM ${info.version}${commit}\n`);
    return 0;
  }
  try {
    const command = argv.shift();
    return await dispatch(command, parseArgs(argv));
  } catch (error) {
    process.stderr.write(`lcim: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

let invokedAsMain = false;
try {
  invokedAsMain = process.argv[1] !== undefined
    && pathToFileURL(fs.realpathSync(path.resolve(process.argv[1]))).href === import.meta.url;
} catch {
  invokedAsMain = false;
}
if (invokedAsMain) main().then((status) => { process.exitCode = status; });
