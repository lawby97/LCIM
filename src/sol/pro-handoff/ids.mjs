/** Sprint-07 local protocol identifiers. They are not controller dispositions. */

import { randomBytes } from 'node:crypto';

export const PRO_ESCALATION_ID_PREFIX = 'lcim_sol_pro_esc_';
export const PRO_RESPONSE_BINDING_ID_PREFIX = 'lcim_sol_pro_resp_';
export const PRO_ESCALATION_ID_PATTERN = /^lcim_sol_pro_esc_[0-9a-f]{32}$/;
export const PRO_RESPONSE_BINDING_ID_PATTERN = /^lcim_sol_pro_resp_[0-9a-f]{32}$/;

export function generateProEscalationId() {
  return `${PRO_ESCALATION_ID_PREFIX}${randomBytes(16).toString('hex')}`;
}

export function generateProResponseBindingId() {
  return `${PRO_RESPONSE_BINDING_ID_PREFIX}${randomBytes(16).toString('hex')}`;
}

export function isValidProEscalationId(value) {
  return typeof value === 'string' && PRO_ESCALATION_ID_PATTERN.test(value);
}

export function isValidProResponseBindingId(value) {
  return typeof value === 'string' && PRO_RESPONSE_BINDING_ID_PATTERN.test(value);
}
