/** Public Sprint-07 manual text boundary surface (not a Sprint-10 CLI). */

export {
  PRO_COPY_DEFAULT_MAX_CHARACTERS,
  createProEscalation,
  createProFollowUp,
  prepareProCopyText,
  proCopy,
  proCopyFollowUp,
  copyProText,
  ingestPastedProResponse,
  parsePastedProResponse,
  manualProCopyInstructions,
  enforceCharacterLimit,
} from './service.mjs';
export {
  ProEscalationStore,
  resolveProRuntimeRoot,
  resolveProEscalationDir,
  resolveProEscalationRecordPath,
} from './store.mjs';
export { MacosPbcopyAdapter, MemoryClipboardAdapter } from './pbcopy.mjs';
export {
  PRO_ESCALATION_ID_PREFIX,
  PRO_RESPONSE_BINDING_ID_PREFIX,
  generateProEscalationId,
  generateProResponseBindingId,
  isValidProEscalationId,
  isValidProResponseBindingId,
} from './ids.mjs';
export { ProHandoffError, ProIdentityError, ProResponseError } from './errors.mjs';
export { parseProDirective, MAX_PRO_DIRECTIVE_CHARACTERS } from './directive.mjs';
