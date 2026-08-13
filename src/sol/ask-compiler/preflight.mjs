/**
 * LCIM V2 SOL ask preflight (Sprint 06).
 *
 * SOL is a precise decision engine. Before any ask is compiled, the raw
 * request is preflighted and REJECTED when it is:
 *
 * - a generic ask (`review this`, `look for bugs`, `diagnose everything`,
 *   `review the whole repo`, `find all bugs`, `are there any issues`,
 *   `overall quality`, ...) — code GENERIC_ASK;
 * - an edit request: SOL decides, SOL never edits files. Imperative edit
 *   phrasing (`edit the file`, `apply the patch`, `implement the fix`,
 *   `make the changes`, `change the code`, ...) — code EDIT_REQUEST;
 * - not ONE primary decision question: zero or multiple `?`,
 *   conjunctive interrogatives (`and is ...`, `and whether ...`),
 *   semicolon/newline-separated second decision clauses, bundled
 *   concerns (architecture + implementation + testing + cleanup in one
 *   question), or a question spanning more than one call-type decision
 *   domain — codes MULTIPLE_QUESTIONS / BUNDLED_CONCERNS /
 *   CROSS_DOMAIN_QUESTION.
 *
 * Rejection precedence: generic-ask phrasing, then edit requests (SOL
 * never edits files — the most specific hard boundary), then
 * question-shape violations.
 *
 * Question-shape rules are applied to the PRIMARY QUESTION TEXT ONLY.
 * Evidence/fact prose is never scanned for `?` — a benign question mark
 * inside evidence or established-fact prose cannot affect the primary
 * question. Preflight is a pure function of text:
 * `preflightSolRequest` returns `{ valid: true }` or
 * `{ valid: false, rejection: { code, reason, matched } }`. The ask
 * compiler additionally FAILS CLOSED on rejection (SolAskError), so no
 * generic ask can ever reach SOL.
 *
 * These rules are deterministic and intentionally do not pretend to be
 * full NLP: they reject clear clause-level and vocabulary-level
 * multi-decision signals and accept everything else as a single
 * question.
 */

/** Generic-ask phrasing: open-ended review requests are not SOL calls. */
export const GENERIC_ASK_PATTERNS = Object.freeze([
  /\breview\s+this\b/i,
  /\breview\s+the\s+(entire|whole|full|complete|all)\s+(repo|repository|codebase|project|code|task|sprint|module)\b/i,
  /\breview\s+everything\b/i,
  /\blook\s+for\s+bugs\b/i,
  /\bfind\s+(all\s+)?(bugs|issues|problems|defects)\b/i,
  /\bdiagnose\s+everything\b/i,
  /\bgeneral\s+review\b/i,
  /\boverall\s+(quality|health|code\s+quality)\b/i,
  /\bany\s+other\s+(issues|problems|bugs|defects)\b/i,
  /\bare\s+there\s+any\s+(issues|problems|bugs|defects)\b/i,
]);

/**
 * Bundled-concern words: an ask may never bundle architecture,
 * implementation, testing, and cleanup into one decision question
 * (explicit Sprint-06 non-goal). Two or more distinct concern words in
 * one question => rejection.
 */
export const BUNDLED_CONCERN_WORDS = Object.freeze([
  'architecture',
  'implementation',
  'testing',
  'cleanup',
  'refactoring',
]);

/** Conjunctive interrogatives: `... and is ...`, `... and whether ...`. */
export const CONJUNCTIVE_QUESTION_PATTERNS = Object.freeze([
  /\band\s+whether\b/i,
  /\b(and|&)\s+(is|are|does|do|should|can|must|will)\b/i,
  /\b(whether|is\s+it|does\s+it|should\s+it|can\s+it)\b[^?]{0,160}\b(whether|is\s+it|does\s+it|should\s+it|can\s+it)\b/i,
]);

/** Edit-request phrasing: SOL decides; SOL never edits files. */
export const EDIT_REQUEST_PATTERNS = Object.freeze([
  /\b(edit|modify|rewrite|implement|write|create|update|change|fix|apply)\s+(the\s+)?(code|file|files|function|method|class|module|repo|repository|patch|implementation|source)\b/i,
  /\bapply\s+(this|the)\s+patch\b/i,
  /\b(implement|write|create|make)\s+(the\s+)?(fix|solution|change|changes|edit|edits|repair)\b/i,
  /\bmake\s+(the\s+)?(code|file|files|implementation)\b/i,
]);

/**
 * Clause separators for the single-decision clause rule: a
 * semicolon/newline-separated SECOND decision clause is a second
 * independent decision, even when the text carries only one `?`.
 */
const DECISION_CLAUSE_SEPARATORS = /[;\n\r\u2028\u2029]+/;

/** Decision-clause starters: an interrogative/decision clause begins with one of these. */
const DECISION_CLAUSE_STARTER = new RegExp(
  [
    '^\\s*(whether|is|are|does|do|should|can|could|must|will|would|may)\\b',
    '^\\s*(why|how|what|when|where|who)\\s+(is|are|does|do|did|was|were|should|can|could|must|will|would|have|has|had)\\b',
  ].join('|'),
  'i',
);

/**
 * Per-call-type decision domains (generous, deterministic anchors).
 * A question matching the anchors of MORE THAN ONE call type bundles
 * independent decision domains and is rejected (CROSS_DOMAIN_QUESTION).
 * Anchors are intentionally broad-but-distinct; the guard only fires on
 * clear cross-domain vocabulary.
 */
export const CALL_TYPE_QUESTION_DOMAINS = Object.freeze({
  SOL_CONTRACT_CHECK: Object.freeze([
    /\bsufficiently specified\b/i,
    /\bexact semantics\b/i,
    /\bsemantics\b/i,
    /\bspecified\b/i,
    /\bunambiguous\b/i,
  ]),
  SOL_DIAGNOSE: Object.freeze([/\bwhy\b/i, /\broot cause\b/i]),
  SOL_FINAL_REVIEW: Object.freeze([/\binvariant/i, /\bchecklist\b/i, /\bfinal review\b/i]),
  SOL_RECHECK: Object.freeze([/\bfinding/i, /\bresolved\b/i, /\brecheck\b/i, /\bdelta\b/i]),
});

/** Rejection codes used by preflight (all map to REJECTION_CODE.SOL_ASK_INVALID). */
export const SOL_PREFLIGHT_CODES = Object.freeze([
  'GENERIC_ASK',
  'MULTIPLE_QUESTIONS',
  'BUNDLED_CONCERNS',
  'CROSS_DOMAIN_QUESTION',
  'EDIT_REQUEST',
]);

function countQuestionMarks(text) {
  return (text.match(/\?/g) ?? []).length;
}

/** Match a single primary question shape: exactly one interrogative `?`. */
export function isSingleQuestion(text) {
  return typeof text === 'string' && countQuestionMarks(text) === 1;
}

/**
 * Split a question into clauses on `;` / newline separators.
 * @param {string} question
 * @returns {string[]} trimmed clauses
 */
export function splitDecisionClauses(question) {
  if (typeof question !== 'string') return [];
  return question
    .split(DECISION_CLAUSE_SEPARATORS)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
}

/** True when a clause is a decision/interrogative clause, not an appositive. */
function isDecisionClause(clause) {
  return DECISION_CLAUSE_STARTER.test(clause);
}

/** @returns {{code: string, matched: string}|null} first generic-ask pattern hit */
export function detectGenericAsk(text) {
  if (typeof text !== 'string') return null;
  for (const re of GENERIC_ASK_PATTERNS) {
    const m = text.match(re);
    if (m !== null) return { code: 'GENERIC_ASK', matched: re.source };
  }
  return null;
}

/**
 * Deterministic single-question shape check. Applied to the PRIMARY
 * QUESTION TEXT ONLY — never to evidence/fact prose.
 *
 * Rejects: zero or multiple `?`; conjunctive interrogatives; a second
 * decision clause after `;`/newline (e.g. "Is the digest binding exact;
 * is the lifecycle complete?"); bundled concerns.
 *
 * Accepts a single question whose appositive tail happens to contain a
 * `?` as the terminator ("Is the digest binding exact; that is, derived
 * from canonical content?") because the tail clause is not a decision
 * clause.
 *
 * @param {string} question
 * @returns {{code: string, matched: string}|null}
 */
export function detectMultipleQuestions(question) {
  if (typeof question !== 'string') return { code: 'MULTIPLE_QUESTIONS', matched: '<non-string question>' };
  const marks = countQuestionMarks(question);
  if (marks === 0) {
    return { code: 'MULTIPLE_QUESTIONS', matched: 'no question mark (the ask must be one primary decision question)' };
  }
  if (marks > 1) {
    return { code: 'MULTIPLE_QUESTIONS', matched: `${marks} question marks in one single_decision_question` };
  }
  for (const re of CONJUNCTIVE_QUESTION_PATTERNS) {
    const m = question.match(re);
    if (m !== null) return { code: 'MULTIPLE_QUESTIONS', matched: re.source };
  }
  // Semicolon/newline-separated second decision clause (SOL-S06-001).
  const clauses = splitDecisionClauses(question);
  const decisionClauses = clauses.filter(isDecisionClause);
  if (decisionClauses.length > 1) {
    return {
      code: 'MULTIPLE_QUESTIONS',
      matched: `${decisionClauses.length} decision clauses separated by ';'/newline: "${clauses.join(' | ')}"`,
    };
  }
  const concerns = BUNDLED_CONCERN_WORDS.filter((w) => new RegExp(`\\b${w}\\b`, 'i').test(question));
  if (concerns.length >= 2) {
    return { code: 'BUNDLED_CONCERNS', matched: `bundled concerns: ${concerns.join(', ')}` };
  }
  return null;
}

/**
 * Call-type-specific question-shape validation (SOL-S06-001): reject a
 * question that carries decision vocabulary from more than one call-type
 * domain. Deterministic anchor sets; only clear cross-domain vocabulary
 * triggers.
 * @param {string} question
 * @param {string} callType
 * @returns {{code: string, matched: string}|null}
 */
export function detectCrossDomainQuestion(question, callType) {
  if (typeof question !== 'string' || typeof callType !== 'string') return null;
  if (!(callType in CALL_TYPE_QUESTION_DOMAINS)) return null;
  const domains = Object.entries(CALL_TYPE_QUESTION_DOMAINS).filter(([name]) => name !== callType);
  const own = CALL_TYPE_QUESTION_DOMAINS[callType].some((re) => re.test(question));
  if (!own) return null;
  const crossed = domains.filter(([, anchors]) => anchors.some((re) => re.test(question))).map(([name]) => name);
  if (crossed.length > 0) {
    return {
      code: 'CROSS_DOMAIN_QUESTION',
      matched: `question bundles decision domains of ${[callType, ...crossed].join(' + ')}`,
    };
  }
  return null;
}

/** @returns {{code: string, matched: string}|null} first edit-request pattern hit */
export function detectEditRequest(text) {
  if (typeof text !== 'string') return null;
  for (const re of EDIT_REQUEST_PATTERNS) {
    const m = text.match(re);
    if (m !== null) return { code: 'EDIT_REQUEST', matched: re.source };
  }
  return null;
}

/**
 * Preflight a raw SOL request (decision question + surrounding text).
 * @param {object} input - { decisionQuestion, whyNeeded?, allowedScope?,
 *   callType? }
 * @returns {{ valid: true } | { valid: false, rejection: { code, reason, matched } }}
 */
export function preflightSolRequest({ decisionQuestion, whyNeeded = '', allowedScope = [], callType }) {
  const question = typeof decisionQuestion === 'string' ? decisionQuestion : '';
  const context = `${whyNeeded} ${question} ${Array.isArray(allowedScope) ? allowedScope.join(' ') : ''}`;

  const generic = detectGenericAsk(context);
  if (generic !== null) {
    return {
      valid: false,
      rejection: {
        code: generic.code,
        reason: `generic SOL ask rejected: '${generic.matched}' — SOL is a precise decision engine, never a generic reviewer`,
        matched: generic.matched,
      },
    };
  }

  const edit = detectEditRequest(context);
  if (edit !== null) {
    return {
      valid: false,
      rejection: {
        code: edit.code,
        reason: `SOL never edits files: '${edit.matched}' — SOL decides the bounded question; implementation belongs to the worker`,
        matched: edit.matched,
      },
    };
  }

  const multi = detectMultipleQuestions(question);
  if (multi !== null) {
    return {
      valid: false,
      rejection: {
        code: multi.code,
        reason: `single primary decision question required: ${multi.matched}`,
        matched: multi.matched,
      },
    };
  }

  const cross = detectCrossDomainQuestion(question, callType);
  if (cross !== null) {
    return {
      valid: false,
      rejection: {
        code: cross.code,
        reason: `single primary decision question required: ${cross.matched}`,
        matched: cross.matched,
      },
    };
  }

  return { valid: true };
}
