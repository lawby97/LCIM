/**
 * LCIM V2 risk-class representation (Sprint 04).
 *
 * Sprint-owned: `src/risk/**` holds contract/risk REPRESENTATION only —
 * vocabularies and small guards. Compiler/validator logic lives in
 * `src/contracts/**`.
 *
 * A risk class classifies the domain a semantic contract governs. The six
 * HIGH_RISK_CLASSES are the classes the sprint requires: a contract in one
 * of these classes MUST NOT proceed with unresolved authoritative
 * semantics — the compiler surfaces `CONTRACT_REVIEW_REQUIRED` instead of
 * inventing facts. `LOW_RISK` is the explicit non-high-risk class used for
 * safe low-risk omission (unresolved semantics there are recorded, never
 * invented, but do not block compilation).
 *
 * The same vocabulary is inlined in `schemas/semantic-contract.v2.schema.json`
 * and `schemas/acceptance-contract.v2.schema.json`; tests enforce lockstep.
 */

import { ConfigError } from '../shared/errors.mjs';

/** The six mandated high-risk classes. */
export const HIGH_RISK_CLASSES = Object.freeze([
  'AUTHORIZATION_SECURITY_PROVIDER',
  'MIGRATION',
  'IDENTITY',
  'FINANCIAL',
  'PRODUCTION_EXECUTION',
  'IRREVERSIBLE_LIFECYCLE_DATA',
]);

/** All supported risk classes: the high-risk set plus the explicit low-risk class. */
export const RISK_CLASSES = Object.freeze([...HIGH_RISK_CLASSES, 'LOW_RISK']);

/** Short human labels for renderers and documentation. */
export const RISK_CLASS_LABELS = Object.freeze({
  AUTHORIZATION_SECURITY_PROVIDER: 'authorization/security/provider',
  MIGRATION: 'migration',
  IDENTITY: 'identity',
  FINANCIAL: 'financial',
  PRODUCTION_EXECUTION: 'production execution',
  IRREVERSIBLE_LIFECYCLE_DATA: 'irreversible lifecycle/data',
  LOW_RISK: 'low risk (no high-risk class applies)',
});

/** @param {string} riskClass */
export function isHighRiskClass(riskClass) {
  return HIGH_RISK_CLASSES.includes(riskClass);
}

/** @param {string} riskClass */
export function isValidRiskClass(riskClass) {
  return RISK_CLASSES.includes(riskClass);
}

/** Fail closed: unknown risk classes are configuration errors, never defaults. */
export function assertRiskClass(riskClass) {
  if (!isValidRiskClass(riskClass)) {
    throw new ConfigError(
      `invalid riskClass: ${JSON.stringify(riskClass)} (expected one of ${RISK_CLASSES.join(', ')})`,
    );
  }
}
