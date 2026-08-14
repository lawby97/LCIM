/** Sprint-07 local-record schema loader and semantic checks. */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError } from '../../shared/errors.mjs';
import { validateAgainstSchema } from '../../shared/schema/validate.mjs';
import { isValidId } from '../../shared/ids.mjs';
import {
  isValidProEscalationId,
  isValidProResponseBindingId,
} from './ids.mjs';

export const PRO_ESCALATION_SCHEMA_NAME = 'lcim.sol-pro-escalation';
export const PRO_ESCALATION_SCHEMA_VERSION = '2.0.0';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(HERE, '../../../schemas/sol-pro-escalation.v2.schema.json');
let cachedSchema;

export function loadProEscalationSchema() {
  if (cachedSchema !== undefined) return cachedSchema;
  try {
    cachedSchema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  } catch (err) {
    throw new ConfigError(`cannot load SOL Pro escalation schema: ${err.message}`);
  }
  return cachedSchema;
}

function push(errors, pathName, message) {
  errors.push({ path: pathName, message });
}

/** Validate the local-only envelope; SOL documents are revalidated on use. */
export function validateProEscalation(record) {
  const result = validateAgainstSchema(record, loadProEscalationSchema());
  const errors = [...result.errors];
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return { valid: false, errors };
  }
  if (!isValidProEscalationId(record.escalationId)) {
    push(errors, 'escalationId', 'must be a valid SOL Pro escalation identifier');
  }
  if (!isValidId('finding', record.findingId)) {
    push(errors, 'findingId', 'must be a valid controller finding identifier');
  }
  const exchanges = Array.isArray(record.exchanges) ? record.exchanges : [];
  for (const [index, exchange] of exchanges.entries()) {
    if (exchange?.sequence !== index + 1) {
      push(errors, `exchanges[${index}].sequence`, 'exchange sequence must be contiguous and start at one');
    }
    if (exchange?.kind !== (index === 0 ? 'INITIAL' : 'FOLLOW_UP')) {
      push(errors, `exchanges[${index}].kind`, 'the first exchange is INITIAL and later exchanges are FOLLOW_UP');
    }
    if (!isValidProResponseBindingId(exchange?.responseBindingId)) {
      push(errors, `exchanges[${index}].responseBindingId`, 'must be a valid local response-binding identifier');
    }
    if (exchange?.canonicalResponse !== null && exchange?.compiledAsk === null) {
      push(errors, `exchanges[${index}].canonicalResponse`, 'a response cannot exist without its compiled ask');
    }
    if ((exchange?.repairTicket !== null || exchange?.repairContract !== null) && exchange?.canonicalResponse === null) {
      push(errors, `exchanges[${index}]`, 'a repair conversion cannot exist without a canonical response');
    }
  }
  return { valid: errors.length === 0, errors };
}
