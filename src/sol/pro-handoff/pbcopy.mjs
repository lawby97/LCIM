/**
 * The one local side effect in the Sprint-07 handoff: write already-checked
 * plain text to the macOS clipboard. The adapter is injectable so tests never
 * require a system clipboard.
 */

import { spawnSync } from 'node:child_process';
import { ConfigError } from '../../shared/errors.mjs';
import { ProHandoffError } from './errors.mjs';

export class MacosPbcopyAdapter {
  constructor({ spawnSyncImpl = spawnSync } = {}) {
    if (typeof spawnSyncImpl !== 'function') {
      throw new ConfigError('spawnSyncImpl must be a function');
    }
    this.spawnSyncImpl = spawnSyncImpl;
  }

  writeText(text) {
    if (typeof text !== 'string') {
      throw new ConfigError('clipboard text must be a string');
    }
    let result;
    try {
      result = this.spawnSyncImpl('pbcopy', [], {
        input: text,
        encoding: 'utf8',
        stdio: ['pipe', 'ignore', 'pipe'],
      });
    } catch {
      throw new ProHandoffError(
        'Clipboard write failed; no SOL Pro text was sent. Check the local clipboard utility and retry.',
        'PRO_CLIPBOARD_FAILED',
      );
    }
    if (result?.error || result?.status !== 0) {
      throw new ProHandoffError(
        'Clipboard write failed; no SOL Pro text was sent. Check the local clipboard utility and retry.',
        'PRO_CLIPBOARD_FAILED',
      );
    }
    return Object.freeze({ characters: text.length });
  }
}

/** A test-only friendly in-memory implementation of the clipboard contract. */
export class MemoryClipboardAdapter {
  constructor() {
    this.writes = [];
  }

  writeText(text) {
    if (typeof text !== 'string') throw new ConfigError('clipboard text must be a string');
    this.writes.push(text);
    return Object.freeze({ characters: text.length });
  }
}
