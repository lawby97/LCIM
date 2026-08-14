/** Strict parser for the plain-text SOL Pro response directive. */

import { assertInboundProTextSafe, ProRedactionError } from '../../redaction/pro-boundary.mjs';
import { resolveCriterionBinding } from '../contracts/validate.mjs';
import { ProIdentityError, ProResponseError } from './errors.mjs';
import { PRO_DIRECTIVE_END, PRO_DIRECTIVE_START, contractBindingText } from './render.mjs';

export const MAX_PRO_DIRECTIVE_CHARACTERS = 12_000;

const COMMON_FIELDS = new Set([
  'ESCALATION_ID',
  'RESPONSE_BINDING_ID',
  'FINDING_ID',
  'ASK_ID',
  'CONTRACT_BINDINGS',
  'CALL_TYPE',
  'VERDICT',
  'DECISION_SUMMARY',
]);

const TYPE_FIELDS = Object.freeze({
  SOL_DIAGNOSE: new Set(['FINDING', 'ROOT_CAUSE', 'FAILURE_EVIDENCE_REFS', 'MUST_CHANGE', 'MUST_NOT_CHANGE', 'EXACT_TEST', 'VERIFY', 'FALSIFICATION']),
  SOL_CONTRACT_CHECK: new Set(['AMENDMENT']),
  SOL_FINAL_REVIEW: new Set(['FINDING', 'ADJACENT']),
  SOL_RECHECK: new Set(['FINDING']),
});

const REPEATED_FIELDS = new Set(['MUST_CHANGE', 'MUST_NOT_CHANGE', 'EXACT_TEST', 'VERIFY', 'AMENDMENT']);

function malformed() {
  return new ProResponseError();
}

function required(fields, name) {
  const values = fields.get(name) ?? [];
  if (values.length !== 1 || values[0].length === 0) throw malformed();
  return values[0];
}

function optionalMany(fields, name) {
  return fields.get(name) ?? [];
}

function absent(fields, names) {
  for (const name of names) {
    if ((fields.get(name) ?? []).length > 0) throw malformed();
  }
}

function splitList(value, { requiredItems = false } = {}) {
  if (value === '-' || value === '') {
    if (requiredItems) throw malformed();
    return [];
  }
  const values = value.split(',').map((item) => item.trim());
  if (values.some((item) => item.length === 0)) throw malformed();
  return values;
}

function splitPipe(value, count) {
  const values = value.split('|').map((item) => item.trim());
  if (values.length !== count || values.some((item) => item.length === 0)) throw malformed();
  return values;
}

function parseFields(text) {
  if (typeof text !== 'string' || text.length === 0 || text.length > MAX_PRO_DIRECTIVE_CHARACTERS) throw malformed();
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  const lines = normalized.split('\n');
  if (lines.length < 4 || lines[0] !== PRO_DIRECTIVE_START || lines.at(-1) !== PRO_DIRECTIVE_END) throw malformed();
  const fields = new Map();
  for (const entry of lines.slice(1, -1)) {
    const match = /^([A-Z_]+): (.*)$/.exec(entry);
    if (match === null || match[2].includes('\u0000')) throw malformed();
    const [, name, value] = match;
    if (!COMMON_FIELDS.has(name) && !Object.values(TYPE_FIELDS).some((allowed) => allowed.has(name))) throw malformed();
    const existing = fields.get(name) ?? [];
    if (!REPEATED_FIELDS.has(name) && existing.length > 0) throw malformed();
    fields.set(name, [...existing, value]);
  }
  return fields;
}

function assertIdentity(fields, record, exchange, ask) {
  if (
    required(fields, 'ESCALATION_ID') !== record.escalationId ||
    required(fields, 'RESPONSE_BINDING_ID') !== exchange.responseBindingId ||
    required(fields, 'FINDING_ID') !== record.findingId ||
    required(fields, 'ASK_ID') !== ask.askId ||
    required(fields, 'CONTRACT_BINDINGS') !== contractBindingText(ask) ||
    required(fields, 'CALL_TYPE') !== ask.callType
  ) {
    throw new ProIdentityError();
  }
}

function assertAllowedFields(fields, callType) {
  const allowed = new Set([...COMMON_FIELDS, ...(TYPE_FIELDS[callType] ?? [])]);
  if (!TYPE_FIELDS[callType]) throw malformed();
  for (const name of fields.keys()) {
    if (!allowed.has(name)) throw malformed();
  }
}

function parseDiagnose(fields, ask, sources, common) {
  const verdict = common.verdict;
  const special = ['FINDING', 'ROOT_CAUSE', 'FAILURE_EVIDENCE_REFS', 'MUST_CHANGE', 'MUST_NOT_CHANGE', 'EXACT_TEST', 'VERIFY', 'FALSIFICATION'];
  if (verdict === 'CAUSE_UNRESOLVED') {
    absent(fields, special);
    return common;
  }
  if (verdict !== 'CAUSE_IDENTIFIED') throw malformed();

  const binding = resolveCriterionBinding(ask, sources);
  if (binding.error !== undefined) {
    throw new ProResponseError('Pasted SOL Pro directive cannot bind the diagnosed criterion to the local authoritative contract.', 'PRO_AUTHORITY_UNBOUND');
  }
  const [severity, summary, findingRefs] = splitPipe(required(fields, 'FINDING'), 3);
  const failureEvidenceRefs = splitList(required(fields, 'FAILURE_EVIDENCE_REFS'), { requiredItems: true });
  const mustChange = optionalMany(fields, 'MUST_CHANGE').map((value) => ({
    target: binding.spec.scope,
    change: value.trim(),
  }));
  if (mustChange.length === 0 || mustChange.some((item) => item.change.length === 0)) throw malformed();
  const mustNotChange = optionalMany(fields, 'MUST_NOT_CHANGE').map((value) => {
    const [target, reason] = splitPipe(value, 2);
    return { target, reason };
  });
  const exactTests = optionalMany(fields, 'EXACT_TEST').map((value) => {
    const [name, command] = splitPipe(value, 2);
    return {
      name,
      ...(command === '-' ? {} : { command }),
      expectation: binding.spec.requirement,
      acceptanceCriterionRef: ask.diagnose.acceptanceCriterionRef,
    };
  });
  const verification = optionalMany(fields, 'VERIFY').map((value) => {
    const [method, expectation] = splitPipe(value, 2);
    return { method, expectation };
  });
  if (exactTests.length === 0 || verification.length === 0) throw malformed();

  return {
    ...common,
    findings: [
      {
        findingId: common.findingId,
        severity,
        invariantRef: ask.diagnose.acceptanceCriterionRef,
        summary,
        evidenceRefs: splitList(findingRefs, { requiredItems: true }),
      },
    ],
    failure: {
      rootCause: required(fields, 'ROOT_CAUSE'),
      evidenceRefs: failureEvidenceRefs,
      repair: { mustChange, mustNotChange, exactTests, verification },
      falsification: required(fields, 'FALSIFICATION'),
    },
  };
}

function parseContractCheck(fields, common) {
  if (common.verdict === 'SUFFICIENTLY_SPECIFIED') {
    absent(fields, ['AMENDMENT']);
    return common;
  }
  if (common.verdict !== 'AMENDMENTS_REQUIRED') throw malformed();
  const amendments = optionalMany(fields, 'AMENDMENT').map((value) => {
    const [contractKey, target, current, exactAmendment, reason] = splitPipe(value, 5);
    return { contractKey, target, current, exactAmendment, reason };
  });
  if (amendments.length === 0) throw malformed();
  return { ...common, amendment: { exactAmendments: amendments } };
}

function parseReviewFinding(value, findingId) {
  const [severity, invariantRef, summary, refs] = splitPipe(value, 4);
  return {
    findingId,
    severity,
    invariantRef,
    summary,
    evidenceRefs: splitList(refs, { requiredItems: true }),
  };
}

function parseFinalReview(fields, common) {
  const findings = optionalMany(fields, 'FINDING').map((value) => parseReviewFinding(value, common.findingId));
  const adjacentValues = optionalMany(fields, 'ADJACENT');
  if (adjacentValues.length > 1) throw malformed();
  const adjacent = adjacentValues.map((value) => {
    const [summary, refs, lockedRequirementRef] = splitPipe(value, 3);
    return { summary, evidenceRefs: splitList(refs, { requiredItems: true }), lockedRequirementRef };
  });
  if (common.verdict === 'PASS') {
    if (findings.length > 0 || adjacent.length > 0) throw malformed();
    return common;
  }
  if (common.verdict !== 'FAIL' || findings.length === 0) throw malformed();
  return { ...common, findings, ...(adjacent.length > 0 ? { adjacentCriticalDefects: adjacent } : {}) };
}

function parseRecheck(fields, common) {
  const findings = optionalMany(fields, 'FINDING').map((value) => parseReviewFinding(value, common.findingId));
  if (common.verdict === 'RESOLVED') {
    if (findings.length > 0) throw malformed();
    return common;
  }
  if (common.verdict !== 'NOT_RESOLVED' || findings.length !== 1) throw malformed();
  return { ...common, findings };
}

/**
 * Parse a manually pasted directive into raw Sprint-06 response input. This
 * function never accepts a model-authored response identifier; the local
 * Sprint-06 response compiler derives the canonical response identity later.
 */
export function parseProDirective({ text, record, exchange, ask, sources }) {
  try {
    assertInboundProTextSafe(text);
  } catch (err) {
    if (err instanceof ProRedactionError) {
      throw new ProResponseError('Pasted SOL Pro directive contains sensitive text and was refused locally.', 'PRO_RESPONSE_SENSITIVE_TEXT');
    }
    throw err;
  }
  const fields = parseFields(text);
  assertIdentity(fields, record, exchange, ask);
  assertAllowedFields(fields, ask.callType);
  const common = {
    askId: ask.askId,
    callType: ask.callType,
    verdict: required(fields, 'VERDICT'),
    decisionSummary: required(fields, 'DECISION_SUMMARY'),
    evidence: [],
    // Kept only while parsing so the stable outer finding can be inserted in
    // call-specific response fields. It is removed before Sprint-06 compile.
    findingId: record.findingId,
  };

  let parsed;
  switch (ask.callType) {
    case 'SOL_DIAGNOSE':
      parsed = parseDiagnose(fields, ask, sources, common);
      break;
    case 'SOL_CONTRACT_CHECK':
      parsed = parseContractCheck(fields, common);
      break;
    case 'SOL_FINAL_REVIEW':
      parsed = parseFinalReview(fields, common);
      break;
    case 'SOL_RECHECK':
      parsed = parseRecheck(fields, common);
      break;
    default:
      throw malformed();
  }
  const { findingId: _findingId, ...rawResponse } = parsed;
  return rawResponse;
}
