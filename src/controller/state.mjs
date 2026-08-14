/**
 * Controller-owned runtime projections for work units, routes, dispositions,
 * findings, and reviewable candidates.
 *
 * These files are local run evidence under <git-common-dir>/lcim/runs and are
 * separate from the Sprint-01 invocation ledger. Canonical ledger events are
 * never rewritten and audit projections never become authority.
 */

import fs from 'node:fs';
import path from 'node:path';
import { appendLineSync, readJsonFile, readJsonlFile, writeJsonAtomic } from '../logging/io.mjs';
import { canonicalJson } from '../logging/digest.mjs';
import { stampRecord } from '../shared/schema-registry.mjs';
import { generateId } from '../shared/ids.mjs';
import { ConfigError } from '../shared/errors.mjs';

export const CONTROLLER_DIR = 'controller';
export const WORK_UNITS_DIR = 'work-units';
export const CONTROLLER_EVENTS_FILE = 'events.jsonl';
export const ROUTES_FILE = 'routes.jsonl';
export const DISPOSITIONS_FILE = 'dispositions.jsonl';
export const REJECTIONS_FILE = 'rejections.jsonl';
export const FINDINGS_FILE = 'findings.jsonl';

function ensureRunDir(runDir) {
  if (typeof runDir !== 'string' || runDir.length === 0 || !path.isAbsolute(runDir)) throw new ConfigError('controller runtime runDir must be an absolute path');
  const dir = path.join(runDir, CONTROLLER_DIR);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function appendRecord(runDir, file, record) {
  const dir = ensureRunDir(runDir);
  appendLineSync(path.join(dir, file), `${canonicalJson(record)}\n`);
  return record;
}

export function appendControllerEvent(runDir, event) {
  if (event === null || typeof event !== 'object' || Array.isArray(event)) throw new ConfigError('controller event must be an object');
  return appendRecord(runDir, CONTROLLER_EVENTS_FILE, { ...event, recordedAt: event.recordedAt ?? new Date().toISOString() });
}

export function persistRouteDecision(runDir, decision) {
  return appendRecord(runDir, ROUTES_FILE, decision);
}

export function persistDisposition(runDir, data) {
  const record = stampRecord('lcim.common.disposition', data);
  return appendRecord(runDir, DISPOSITIONS_FILE, record);
}

export function persistRejection(runDir, data) {
  const record = stampRecord('lcim.common.rejection', data);
  return appendRecord(runDir, REJECTIONS_FILE, record);
}

export function persistFinding(runDir, data = {}) {
  const record = stampRecord('lcim.common.review-finding', {
    findingId: data.findingId ?? generateId('finding'),
    severity: data.severity ?? 'CRITICAL',
    ...(data.invariantRef === undefined ? {} : { invariantRef: data.invariantRef }),
    summary: data.summary,
    evidenceRefs: data.evidenceRefs ?? [],
    createdAt: data.createdAt ?? new Date().toISOString(),
  });
  return appendRecord(runDir, FINDINGS_FILE, record);
}

export function persistWorkUnit(runDir, data) {
  const record = stampRecord('lcim.common.work-unit', data);
  const dir = path.join(ensureRunDir(runDir), WORK_UNITS_DIR);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeJsonAtomic(path.join(dir, `${record.workUnitId}.json`), record);
  return record;
}

export function persistCandidate(runDir, candidate) {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) throw new ConfigError('candidate must be an object');
  const dir = path.join(ensureRunDir(runDir), 'candidates');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const record = Object.freeze({
    schemaName: 'lcim.controller.candidate',
    schemaVersion: '1.0.0',
    ...candidate,
    publication: 'REVIEWABLE_ONLY',
    autoPublished: false,
  });
  writeJsonAtomic(path.join(dir, `${record.workUnitId}.json`), record);
  return record;
}

function readRecords(runDir, file) {
  const target = path.join(runDir, CONTROLLER_DIR, file);
  if (!fs.existsSync(target)) return [];
  const parsed = readJsonlFile(target);
  if (parsed.errors.length > 0) throw new ConfigError(`controller runtime record ${target} is malformed`);
  return parsed.events;
}

export function readControllerState(runDir) {
  const dir = path.join(runDir, CONTROLLER_DIR);
  if (!fs.existsSync(dir)) {
    return Object.freeze({ events: [], routes: [], dispositions: [], rejections: [], findings: [], workUnits: [], candidates: [] });
  }
  const workUnitsDir = path.join(dir, WORK_UNITS_DIR);
  const workUnits = fs.existsSync(workUnitsDir)
    ? fs.readdirSync(workUnitsDir).filter((name) => name.endsWith('.json')).sort().map((name) => readJsonFile(path.join(workUnitsDir, name)))
    : [];
  const candidatesDir = path.join(dir, 'candidates');
  const candidates = fs.existsSync(candidatesDir)
    ? fs.readdirSync(candidatesDir).filter((name) => name.endsWith('.json')).sort().map((name) => readJsonFile(path.join(candidatesDir, name)))
    : [];
  return Object.freeze({
    events: readRecords(runDir, CONTROLLER_EVENTS_FILE),
    routes: readRecords(runDir, ROUTES_FILE),
    dispositions: readRecords(runDir, DISPOSITIONS_FILE),
    rejections: readRecords(runDir, REJECTIONS_FILE),
    findings: readRecords(runDir, FINDINGS_FILE),
    workUnits,
    candidates,
  });
}

export function controllerRuntimeDir(runDir) {
  return path.join(runDir, CONTROLLER_DIR);
}
