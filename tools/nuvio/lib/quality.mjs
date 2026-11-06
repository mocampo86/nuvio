import { existsSync } from 'node:fs';
import path from 'node:path';
import { checkPrTitle, staticChecks } from './checks.mjs';
import { nowIso, readJson, readText, runShell, tail, writeJson, writeText } from './core.mjs';
import { evaluateFindings } from './findings.mjs';
import {
  addedLines,
  changedFiles,
  currentBranch,
  headSha,
  mergeBase,
  resolveBaseRef,
  workingTreeChanges
} from './git.mjs';
import { runDir } from './state.mjs';

function check(name, failures, summary = '') {
  return {
    name,
    status: failures.length > 0 ? 'fail' : 'pass',
    required: true,
    details: failures,
    summary
  };
}

export function collectDiff(root, config, { includeWorkingTree }) {
  const base = mergeBase(root, resolveBaseRef(root, config));
  return {
    base,
    files: changedFiles(root, base, { includeWorkingTree }),
    lines: addedLines(root, base, { includeWorkingTree })
  };
}

export function runValidation(root, config, state, mode) {
  const dir = runDir(root, config, state.runId);
  const dirty = workingTreeChanges(root).length > 0;
  const diff = collectDiff(root, config, { includeWorkingTree: true });
  const checks = config.validation[mode].map((step) => {
    const command = step.command.replaceAll('{base}', diff.base);
    const execution = runShell(command, { cwd: root });
    const log = path.join('logs', `${mode}-${step.name}.log`);
    writeText(path.join(dir, log), `$ ${command}\n\n${execution.output}`);
    return {
      name: step.name,
      command,
      status: execution.code === 0 ? 'pass' : 'fail',
      required: step.required !== false,
      exitCode: execution.code,
      durationMs: execution.durationMs,
      log,
      outputTail: execution.code === 0 ? '' : tail(execution.output)
    };
  });
  checks.push(...staticChecks({ ...diff, config, authorizations: state.authorizations }));
  const passed = checks.every((c) => c.status !== 'fail' || !c.required);
  const report = { mode, at: nowIso(), commit: headSha(root), dirty, passed, checks };
  writeJson(path.join(dir, 'validation.json'), report);
  return report;
}

export function ciGate(root, config, { prTitle }) {
  const diff = collectDiff(root, config, { includeWorkingTree: false });
  const checks = staticChecks({ ...diff, config, authorizations: ciAuthorizations() });
  if (prTitle !== undefined) checks.push(checkPrTitle(prTitle));
  return { passed: checks.every((c) => c.status !== 'fail'), checks };
}

function ciAuthorizations() {
  return {
    migrationEdits: process.env.NUVIO_ALLOW_MIGRATION_EDITS === 'true',
    testRemoval: process.env.NUVIO_ALLOW_TEST_REMOVAL === 'true'
  };
}

export function loadFindings(root, config, runId) {
  return readJson(path.join(runDir(root, config, runId), 'findings.json'), { findings: [] })
    .findings;
}

export function localGate(root, config, state, { prTitle } = {}) {
  const dir = runDir(root, config, state.runId);
  const head = headSha(root);
  const branch = currentBranch(root);
  const checks = [];

  checks.push(
    check('git-state', [
      ...(branch === config.baseBranch
        ? [`Se está en ${config.baseBranch}; se requiere una rama de trabajo.`]
        : []),
      ...(state.branch && branch !== state.branch
        ? [`Rama actual ${branch} distinta de la rama de la ejecución ${state.branch}.`]
        : []),
      ...(workingTreeChanges(root).length > 0 ? ['Hay cambios sin commitear.'] : [])
    ])
  );

  const diff = collectDiff(root, config, { includeWorkingTree: false });
  checks.push(...staticChecks({ ...diff, config, authorizations: state.authorizations }));

  const validation = readJson(path.join(dir, 'validation.json'), null);
  checks.push(
    check('validation', [
      ...(!validation ? ['No hay validación registrada.'] : []),
      ...(validation && validation.mode !== 'full'
        ? ['La última validación no fue en modo full.']
        : []),
      ...(validation && validation.commit !== head
        ? ['La última validación no corresponde al commit actual.']
        : []),
      ...(validation && validation.dirty
        ? ['La última validación se ejecutó con cambios sin commitear.']
        : []),
      ...(validation && !validation.passed
        ? validation.checks.filter((c) => c.status === 'fail').map((c) => `Falló ${c.name}.`)
        : [])
    ])
  );

  checks.push(
    check('review-current', [
      ...(state.review.rounds === 0 ? ['No se ejecutó el review independiente.'] : []),
      ...(state.review.rounds > 0 && state.review.reviewedCommit !== head
        ? ['Hay cambios posteriores al último review; se requiere un nuevo review.']
        : [])
    ])
  );

  const findings = loadFindings(root, config, state.runId);
  const evaluation = evaluateFindings(findings);
  checks.push(
    check('review-findings', [
      ...evaluation.blockingOpen.map((f) => `${f.id} (${f.severity}) bloqueante sin resolver.`),
      ...evaluation.approvedPending.map(
        (f) => `${f.id} aprobado por el usuario pero no corregido.`
      ),
      ...evaluation.undecided.map((f) => `${f.id} sin decisión del usuario.`)
    ])
  );

  checks.push(
    check('acceptance-criteria', [
      ...(state.acceptanceCriteria.length === 0
        ? ['No hay criterios de aceptación registrados.']
        : []),
      ...state.acceptanceCriteria
        .filter((ac) => ac.status !== 'met' || !ac.evidence)
        .map((ac) => `${ac.id} no está cumplido con evidencia (estado: ${ac.status}).`)
    ])
  );

  const reportFile = path.join(dir, 'review-report.md');
  const report = existsSync(reportFile) ? readText(reportFile) : null;
  checks.push(
    check('review-report', [
      ...(report === null ? ['Falta review-report.md.'] : []),
      ...(report === null
        ? []
        : findings
            .filter((f) => !report.includes(f.id))
            .map((f) => `${f.id} no figura en review-report.md.`))
    ])
  );

  if (prTitle !== undefined) checks.push(checkPrTitle(prTitle));

  return { passed: checks.every((c) => c.status !== 'fail' || !c.required), checks, evaluation };
}

export function formatChecks(checks) {
  const icon = { pass: 'OK  ', warn: 'WARN', fail: 'FAIL', skip: 'SKIP' };
  return checks
    .map((c) => {
      const lines = [
        `[${icon[c.status]}] ${c.name}${c.durationMs !== undefined ? ` (${Math.round(c.durationMs / 1000)}s)` : ''}`
      ];
      for (const detail of c.details ?? []) lines.push(`        - ${detail}`);
      if (c.outputTail) lines.push(c.outputTail.replace(/^/gm, '        | '));
      if (c.log && c.status === 'fail') lines.push(`        log: ${c.log}`);
      return lines.join('\n');
    })
    .join('\n');
}
