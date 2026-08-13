/**
 * LCIM V2 compact human-readable contract renderer (Sprint 04).
 *
 * Produces bounded, deterministic, public-safe text used later by routing
 * and SOL ask compilation. Renderers never include credentials, transcripts,
 * or business-repository source excerpts — only the contract fields
 * themselves. Output is hard-capped; a truncated render is still valid.
 */

import { RISK_CLASS_LABELS } from '../risk/classes.mjs';

/** Hard cap on rendered output length (defensive; schema bounds already limit input). */
export const RENDER_MAX_LENGTH = 8000;

function line(buf, text = '') {
  buf.push(text);
}

function cap(buf) {
  const out = buf.join('\n');
  if (out.length <= RENDER_MAX_LENGTH) return out;
  return `${out.slice(0, RENDER_MAX_LENGTH - 24)}\n... [truncated: ${out.length} chars total]`;
}

/**
 * Render a compiled semantic contract as compact human-readable text.
 * @param {object} contract - validated `lcim.semantic-contract` document
 * @returns {string}
 */
export function renderSemanticContract(contract) {
  const buf = [];
  line(buf, `SEMANTIC CONTRACT: ${contract.contractKey}`);
  line(buf, `status: ${contract.compileStatus}   risk: ${contract.riskClass} (${RISK_CLASS_LABELS[contract.riskClass] ?? '?'})`);
  line(buf, `title: ${contract.title}`);
  line(buf, `semanticDigest: ${contract.semanticDigest}`);
  line(buf, `compiledAt: ${contract.compiledAt}`);

  line(buf, 'sourceObjects:');
  for (const s of contract.sourceObjects ?? []) {
    line(buf, `  - ${s.key} [${s.kind}] ${s.ref}${s.path ? ` ${s.path}` : ''} (${s.authority})`);
  }

  line(buf, 'concepts:');
  for (const c of contract.concepts ?? []) {
    const parts = [
      `- ${c.name} [${c.kind}]`,
      `fields=${JSON.stringify(c.authoritativeFieldNames)}`,
    ];
    if (c.authoritativeEnum) parts.push(`enum=${JSON.stringify(c.authoritativeEnum)}`);
    if (c.digestMeaning) parts.push(`digest=${c.digestMeaning}`);
    if (c.identityMeaning) parts.push(`identity=${c.identityMeaning}`);
    if (c.dateTimeRepresentation) parts.push(`datetime=${c.dateTimeRepresentation}`);
    if (c.lifecycle) parts.push(`lifecycle=${JSON.stringify(c.lifecycle)}`);
    if (c.forbiddenAlternatives?.length) parts.push(`forbidden=${JSON.stringify(c.forbiddenAlternatives)}`);
    if (c.sourceObjectKey) parts.push(`source=${c.sourceObjectKey}`);
    if (c.failureBehavior) parts.push(`failure=${c.failureBehavior}`);
    line(buf, parts.join('  '));
  }

  if ((contract.distinctConcepts ?? []).length > 0) {
    line(buf, 'distinctConcepts (must_not_conflate):');
    for (const d of contract.distinctConcepts) {
      line(buf, `  - ${d.conceptA} != ${d.conceptB} [${d.severity}] ${d.mustNotConflate}`);
    }
  }

  if ((contract.negativeSideEffects ?? []).length > 0) {
    line(buf, 'negativeSideEffects:');
    for (const s of contract.negativeSideEffects) {
      line(buf, `  - before ${s.gate}: ${s.scope} count = ${s.expectedCount} (${s.requirement}) [${s.sideEffectId}]`);
    }
  }

  line(buf, `factsEstablished: ${(contract.factsEstablished ?? []).length}`);
  for (const f of contract.factsEstablished ?? []) {
    line(buf, `  - ${f.fact} (evidence: ${f.evidence})`);
  }

  line(buf, `unresolvedSemantics: ${(contract.unresolvedSemantics ?? []).length}`);
  for (const u of contract.unresolvedSemantics ?? []) {
    line(buf, `  - [${u.riskClass}] ${u.question}${u.impact ? ` (impact: ${u.impact})` : ''}`);
  }

  if ((contract.compileWarnings ?? []).length > 0) {
    line(buf, `compileWarnings: ${contract.compileWarnings.length}`);
    for (const w of contract.compileWarnings) {
      line(buf, `  - [${w.code}] ${w.message}`);
    }
  }

  return cap(buf);
}

/**
 * Render a worker-ready repair/acceptance contract as compact text.
 * @param {object} repair - validated `lcim.acceptance-contract` document
 * @returns {string}
 */
export function renderAcceptanceContract(repair) {
  const buf = [];
  line(buf, `REPAIR CONTRACT: ${repair.repairId}  (contract: ${repair.contractKey})`);
  line(buf, `sourceSemanticDigest: ${repair.sourceSemanticDigest}`);
  line(buf, `objective: ${repair.objective}`);
  line(buf, `violation: ${repair.violation}`);
  line(buf, `requiredBehavior: ${repair.requiredBehavior}`);

  line(buf, 'REPAIR TARGETS (rejected acceptance items):');
  for (const r of repair.rejectedAcceptanceRefs ?? []) {
    line(buf, `  - rejected acceptance item: ${r}`);
  }
  line(buf, 'mustChange (bounded to rejected acceptance items):');
  for (const m of repair.mustChange ?? []) {
    line(buf, `  - ${m.target}: ${m.change}`);
  }
  if ((repair.mustNotChange ?? []).length > 0) {
    line(buf, 'mustNotChange:');
    for (const m of repair.mustNotChange) {
      line(buf, `  - ${m.target}: ${m.reason}`);
    }
  }

  const frozen = repair.frozenSemantics ?? {};
  line(buf, 'FROZEN REQUIREMENTS (must not change):');
  line(buf, `  sourceObjects: ${(frozen.sourceObjects ?? []).length} preserved`);
  line(buf, `  concepts: ${(frozen.concepts ?? []).length} preserved`);
  if ((frozen.distinctConcepts ?? []).length > 0) {
    line(buf, '  distinctConcepts (must_not_conflate):');
    for (const d of frozen.distinctConcepts) {
      line(buf, `    - ${d.conceptA} != ${d.conceptB} [${d.severity}] ${d.mustNotConflate}`);
    }
  }
  if ((frozen.unresolvedSemantics ?? []).length > 0) {
    line(buf, '  unresolvedSemantics (stay unresolved, never invent an answer):');
    for (const u of frozen.unresolvedSemantics) {
      line(buf, `    - [${u.riskClass}] ${u.question}${u.impact ? ` (impact: ${u.impact})` : ''}`);
    }
  }
  if ((frozen.factsEstablished ?? []).length > 0) {
    line(buf, '  factsEstablished:');
    for (const f of frozen.factsEstablished) {
      line(buf, `    - ${f.fact} (evidence: ${f.evidence})`);
    }
  }

  line(buf, 'acceptanceTests:');
  for (const t of repair.acceptanceTests ?? []) {
    const parts = [`  - ${t.name}`, `expect=${t.expectation}`];
    if (t.command) parts.push(`cmd=${t.command}`);
    if (t.negativeSideEffectId) {
      parts.push(`side-effect(${t.negativeSideEffectScope})=${t.expectedSideEffectCount}`);
    }
    line(buf, parts.join('  '));
  }

  if ((repair.negativeSideEffects ?? []).length > 0) {
    line(buf, 'negativeSideEffects (authoritative carry):');
    const rejected = new Set(repair.rejectedAcceptanceRefs ?? []);
    for (const s of repair.negativeSideEffects) {
      const tag = rejected.has(s.sideEffectId) ? 'REJECTED TARGET' : 'FROZEN';
      line(buf, `  - before ${s.gate}: ${s.scope} count = ${s.expectedCount} (${s.requirement}) [${s.sideEffectId}] [${tag}]`);
    }
  }

  line(buf, 'verification:');
  for (const v of repair.verification ?? []) {
    line(buf, `  - ${v.method}: ${v.expectation}`);
  }

  return cap(buf);
}
