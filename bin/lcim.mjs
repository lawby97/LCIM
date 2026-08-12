#!/usr/bin/env node
/**
 * LCIM V2 CLI skeleton (Sprint 00).
 *
 * Only `--version`/`-v` and `--help`/`-h` exist. All substantive commands
 * (run, audit, review-export, ...) land in Sprint 10; anything else fails
 * closed with a clear message so scripts never silently no-op.
 */

import { getVersionInfo } from '../src/config/version.mjs';

const HELP = `LCIM — Low Cost Implementation Model (V2)

Usage: lcim <command>

Commands:
  --version, -v   Print the LCIM version (VERSION file) and, when available,
                  the LCIM repository Git commit.
  --help, -h      Show this help.

This is the Sprint 00 skeleton. The full CLI (run/audit/review-export and
related commands) is implemented in Sprint 10.
`;

function main(argv) {
  if (argv.length === 0) {
    process.stdout.write(HELP);
    return 0;
  }
  const command = argv[0];
  if (command === '--help' || command === '-h') {
    process.stdout.write(HELP);
    return 0;
  }
  if (command === '--version' || command === '-v') {
    const info = getVersionInfo();
    const commit = info.gitCommitShort ? ` (git ${info.gitCommitShort})` : '';
    process.stdout.write(`LCIM ${info.version}${commit}\n`);
    return 0;
  }
  process.stderr.write(
    `lcim: unknown command '${command}' — the Sprint 00 skeleton only supports --version/--help; full CLI integration lands in Sprint 10.\n`,
  );
  return 1;
}

process.exitCode = main(process.argv.slice(2));
