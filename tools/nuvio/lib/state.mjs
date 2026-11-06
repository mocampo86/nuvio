import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { NuvioError, nowIso, readJson, readText, writeJson, writeText } from './core.mjs';

export const STAGES = [
  'intake',
  'analysis',
  'implementation',
  'validation',
  'review',
  'fix-selection',
  'fixing',
  'ready-for-pr',
  'pr-created',
  'blocked',
  'abandoned'
];

export const NEXT_ACTIONS = {
  intake:
    'Analizar la US (nuvio-requirements + nuvio-architecture), escribir plan.md, registrar criterios con `ac add` y ejecutar `stage analysis`.',
  analysis: 'Completar plan.md y criterios; luego `branch --slug <slug>` para preparar la rama.',
  implementation:
    'Implementar (nuvio-implementation + nuvio-testing), commitear y ejecutar `validate --mode quick` y luego `validate --mode full`.',
  validation:
    'Si la última validación falló, corregir y repetir `validate`. Si pasó en modo full, ejecutar `review-prepare` y /nuvio-review.',
  review:
    'Ejecutar /nuvio-review sobre el paquete preparado y guardar el resultado con `review-save`.',
  'fix-selection':
    'Mostrar review-report.md al usuario y registrar su elección con `select-fixes`.',
  fixing:
    'Aplicar solo los fixes aprobados (/nuvio-fix), commitear, `validate --mode full`, `review-prepare` y /nuvio-review.',
  'ready-for-pr': 'Generar pr-body.md y ejecutar `pr --title "<título>"` (/nuvio-pr).',
  'pr-created': 'PR creado. Revisar CI con `ci-status`. El merge es manual y lo decide el usuario.',
  blocked:
    'Resolver el motivo de bloqueo con el usuario y luego mover la etapa con `stage <etapa>`.',
  abandoned: 'Ejecución abandonada. Iniciar una nueva con /nuvio-us.'
};

export function nuvioDir(root) {
  return path.join(root, '.nuvio');
}

export function runsDir(root, config) {
  return path.join(root, config.runsDir);
}

export function runDir(root, config, runId) {
  return path.join(runsDir(root, config), runId);
}

export function statePath(root, config, runId) {
  return path.join(runDir(root, config, runId), 'state.json');
}

const currentRunFile = (root) => path.join(nuvioDir(root), 'current-run');

export function normalizeUsId(value) {
  const match = /^us[-_ ]?(\d+)$/i.exec(String(value ?? '').trim());
  if (!match) throw new NuvioError(`Identificador de US inválido "${value}". Formato: US-001.`, 2);
  return `US-${match[1].padStart(3, '0')}`;
}

export function slugify(text, maxLength = 40) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}

export function nextUsId(root, config) {
  const dir = path.join(root, config.userStoriesDir);
  const numbers = existsSync(dir)
    ? readdirSync(dir)
        .map((file) => /^US-(\d+)/i.exec(file)?.[1])
        .filter(Boolean)
        .map(Number)
    : [];
  return normalizeUsId(String(Math.max(0, ...numbers) + 1));
}

export function timestampId(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

export function listRuns(root, config) {
  const dir = runsDir(root, config);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((runId) => existsSync(statePath(root, config, runId)))
    .map((runId) => readJson(statePath(root, config, runId)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function setCurrentRun(root, runId) {
  writeText(currentRunFile(root), `${runId}\n`);
}

export function currentRunId(root) {
  const file = currentRunFile(root);
  return existsSync(file) ? readText(file).trim() || null : null;
}

export function loadRun(root, config, runId) {
  const id = runId ?? currentRunId(root);
  if (!id) throw new NuvioError('No hay una ejecución activa. Iniciá una con /nuvio-us.', 2);
  const file = statePath(root, config, id);
  if (!existsSync(file)) throw new NuvioError(`No existe la ejecución ${id}.`, 2);
  return readJson(file);
}

export function saveRun(root, config, state) {
  const updated = { ...state, updatedAt: nowIso() };
  writeJson(statePath(root, config, state.runId), updated);
  return updated;
}

export function setStage(state, stage, note) {
  if (!STAGES.includes(stage))
    throw new NuvioError(`Etapa inválida "${stage}". Válidas: ${STAGES.join(', ')}.`, 2);
  if (state.stage === stage && !note) return state;
  return {
    ...state,
    stage,
    blockedReason: stage === 'blocked' ? (note ?? 'Sin motivo registrado') : null,
    history: [...state.history, { stage, at: nowIso(), ...(note ? { note } : {}) }]
  };
}

export function readSessionId(root) {
  return readJson(path.join(nuvioDir(root), 'session.json'), {}).sessionId ?? null;
}

export function createRunState({ usId, title, config, sessionId, date = new Date() }) {
  const at = date.toISOString();
  return {
    schemaVersion: 1,
    runId: `${usId}-${timestampId(date)}`,
    usId,
    title,
    createdAt: at,
    updatedAt: at,
    stage: 'intake',
    history: [{ stage: 'intake', at }],
    blockedReason: null,
    baseBranch: config.baseBranch,
    branch: null,
    devinSessionIds: sessionId ? [sessionId] : [],
    acceptanceCriteria: [],
    decisions: [],
    authorizations: { migrationEdits: false, testRemoval: false },
    validation: { consecutiveFailures: 0, lastRun: null },
    review: { rounds: 0, reviewedCommit: null },
    fixSelections: [],
    pr: { number: null, url: null, title: null }
  };
}

export function findReusableRun(root, config, usId) {
  return listRuns(root, config)
    .filter((run) => run.usId === usId && run.stage !== 'abandoned')
    .at(-1);
}
