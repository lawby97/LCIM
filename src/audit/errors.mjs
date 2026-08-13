/**
 * LCIM V2 Sprint 08 audit error taxonomy.
 *
 * Audit-level failures (invalid `last` selections, unreadable runtime
 * stores, projection write failures) fail closed with AuditError. Per-run
 * canonical defects (corrupt ledger, invalid run record) do NOT throw —
 * they are reported deterministically inside the audit result
 * (selection.invalidRunIds / selection.errors) so one bad run can never
 * fabricate or silently drop evidence from the rest of the audit.
 */

import { LcimError } from '../shared/errors.mjs';

/** The audit service/API failed closed. */
export class AuditError extends LcimError {
  constructor(message, details = null) {
    super(message, 'AUDIT_FAILED', details);
  }
}
