/** Sprint-07 local/manual handoff errors. */

import { LcimError } from '../../shared/errors.mjs';

export class ProHandoffError extends LcimError {
  constructor(message, code = 'PRO_HANDOFF_FAILED', details = null) {
    super(message, code, details);
  }
}

export class ProIdentityError extends ProHandoffError {
  constructor(message = 'Pasted SOL Pro directive does not bind to the expected local escalation identity.') {
    super(message, 'PRO_IDENTITY_MISMATCH');
  }
}

export class ProResponseError extends ProHandoffError {
  constructor(message = 'Pasted SOL Pro directive is malformed or does not satisfy the bounded response contract.', code = 'PRO_RESPONSE_MALFORMED') {
    super(message, code);
  }
}
