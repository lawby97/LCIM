/**
 * LCIM V2 Sprint 01 shared invocation wrapper (lifecycle API).
 *
 * Every future provider adapter drives its model calls through this
 * wrapper: a call is an INVOCATION inside a RUN. The canonical lifecycle is
 * exactly one START, one COMPLETION, one ASSESSMENT per invocation ID
 * (recorded in the append-only ledger); crashes/orphans are closed by
 * explicit RECONCILIATION events, never by mutation.
 *
 * Typical flow (provider adapter / controller):
 *
 *   const store = await RunStore.create({ cwd, targetBaseSha, configDigest });
 *   const inv = await store.startInvocation({
 *     workUnitId, provider, model, role: 'WORKER', reasoningEffort: 'xhigh',
 *   });
 *   await inv.complete({ outcome: 'SUCCESS', usage: { inputTokens, outputTokens, totalTokens } });
 *   await inv.assess({ assessmentResult: 'ACCEPTED' });
 *   await store.finalize();
 *
 * The wrapper never synthesizes worker status and never stores secrets or
 * prompt bodies; it records only the bounded taxonomy fields in the ledger
 * and the compact invocation projection.
 */

/**
 * Lifecycle handle for one invocation. Methods append the corresponding
 * ledger event (fail closed on lifecycle violations) and refresh the
 * compact invocation record.
 */
export class Invocation {
  /** @param {import('../runtime/run-store.mjs').RunStore} store */
  constructor(store, invocationId) {
    this.store = store;
    this.invocationId = invocationId;
  }

  /** Record the COMPLETION event (provider call finished). */
  async complete({ outcome, usage, errorCode, rejectionCode, occurredAt } = {}) {
    return this.store._appendInvocationEvent({
      kind: 'COMPLETION',
      invocationId: this.invocationId,
      outcome,
      usage,
      errorCode,
      rejectionCode,
      occurredAt,
    });
  }

  /** Record the ASSESSMENT event (controller assessment of the invocation). */
  async assess({ assessmentResult, rejectionCode, summary, evidenceRefs, occurredAt } = {}) {
    return this.store._appendInvocationEvent({
      kind: 'ASSESSMENT',
      invocationId: this.invocationId,
      assessmentResult,
      rejectionCode,
      summary,
      evidenceRefs,
      occurredAt,
    });
  }

  /** The current compact invocation record (frozen projection). */
  async record() {
    return this.store.getInvocationRecord(this.invocationId);
  }
}
