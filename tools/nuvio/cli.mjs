#!/usr/bin/env node
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  EXIT,
  NuvioError,
  loadConfig,
  nowIso,
  readJson,
  readText,
  run,
  runShell,
  toPosix,
  writeJson,
  writeText
} from './lib/core.mjs';
import { runDoctor } from './lib/doctor.mjs';
import {
  applySelection,
  evaluateFindings,
  formatFindingsTable,
  mergeReviewRound
} from './lib/findings.mjs';
import {
  branchProtectionPayload,
  ensureGhAuth,
  findPullRequests,
  gh,
  parsePrUrl,
  resolveGh
} from './lib/github.mjs';
import {
  currentBranch,
  diffStat,
  findRepoRoot,
  fullDiff,
  git,
  hasRemote,
  headSha,
  localBranchExists,
  mergeBase,
  remoteBranchExists,
  resolveBaseRef,
  workingTreeChanges
} from './lib/git.mjs';
import { ciGate, formatChecks, loadFindings, localGate, runValidation } from './lib/quality.mjs';
import {
  NEXT_ACTIONS,
  createRunState,
  currentRunId,
  findReusableRun,
  listRuns,
  loadRun,
  nextUsId,
  normalizeUsId,
  readSessionId,
  runDir,
  saveRun,
  setCurrentRun,
  setStage,
  slugify
} from './lib/state.mjs';

const BRANCH_TYPES = ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'chore'];
const AC_STATUSES = ['pending', 'met', 'unmet'];
const DECISION_KINDS = [
  'architecture',
  'design',
  'security',
  'scope',
  'data',
  'testing',
  'requirements',
  'other'
];
const AUTHORIZATIONS = { 'migration-edits': 'migrationEdits', 'test-removal': 'testRemoval' };
const PR_TEMPLATE = '.github/pull_request_template.md';

const OPTIONS = {
  run: { type: 'string' },
  us: { type: 'string' },
  title: { type: 'string' },
  'story-file': { type: 'string' },
  new: { type: 'boolean' },
  slug: { type: 'string' },
  type: { type: 'string' },
  mode: { type: 'string' },
  file: { type: 'string' },
  selection: { type: 'string' },
  id: { type: 'string' },
  text: { type: 'string' },
  status: { type: 'string' },
  evidence: { type: 'string' },
  kind: { type: 'string' },
  what: { type: 'string' },
  reason: { type: 'string' },
  note: { type: 'string' },
  'body-file': { type: 'string' },
  'dry-run': { type: 'boolean' },
  force: { type: 'boolean' },
  ci: { type: 'boolean' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' }
};

const print = (text = '') => process.stdout.write(`${text}\n`);

function requireOption(values, name) {
  if (!values[name]) throw new NuvioError(`Falta la opción --${name}.`, EXIT.usage);
  return values[name];
}

function context(values) {
  const root = findRepoRoot();
  const config = loadConfig();
  return { root, config, values };
}

function withRun(ctx) {
  return { ...ctx, state: loadRun(ctx.root, ctx.config, ctx.values.run) };
}

function persist(ctx, state) {
  return saveRun(ctx.root, ctx.config, state);
}

function runFile(ctx, state, ...segments) {
  return path.join(runDir(ctx.root, ctx.config, state.runId), ...segments);
}

function relative(ctx, file) {
  return toPosix(path.relative(ctx.root, file));
}

function findStoryDoc(ctx, usId) {
  const dir = path.join(ctx.root, ctx.config.userStoriesDir);
  if (!existsSync(dir)) return null;
  const file = readdirSync(dir).find(
    (name) => new RegExp(`^${usId}(\\D|$)`, 'i').test(name) && name.endsWith('.md')
  );
  return file ? path.join(dir, file) : null;
}

function titleFromStory(content) {
  return /^#\s+(?:US-\d+\s*[:-]\s*)?(.+)$/m.exec(content)?.[1]?.trim() ?? null;
}

function printSummary(ctx, state) {
  const evaluation = evaluateFindings(loadFindings(ctx.root, ctx.config, state.runId));
  const ac = state.acceptanceCriteria;
  print(`Ejecución:   ${state.runId}`);
  print(`US:          ${state.usId} - ${state.title}`);
  print(
    `Etapa:       ${state.stage}${state.blockedReason ? ` (motivo: ${state.blockedReason})` : ''}`
  );
  print(`Rama:        ${state.branch ?? '(sin crear)'}`);
  print(`Directorio:  ${relative(ctx, runDir(ctx.root, ctx.config, state.runId))}`);
  print(`Criterios:   ${ac.filter((c) => c.status === 'met').length}/${ac.length} cumplidos`);
  const last = state.validation.lastRun;
  print(
    `Validación:  ${last ? `${last.mode} ${last.passed ? 'OK' : 'FALLÓ'} @ ${last.commit.slice(0, 8)}` : 'sin ejecutar'} (fallos consecutivos: ${state.validation.consecutiveFailures}/${ctx.config.maxFixAttempts})`
  );
  print(
    `Review:      rondas ${state.review.rounds}/${ctx.config.maxReviewRounds}; bloqueantes abiertos ${evaluation.blockingOpen.length}; sin decisión ${evaluation.undecided.length}; aprobados pendientes ${evaluation.approvedPending.length}`
  );
  print(`PR:          ${state.pr.url ?? '(no creado)'}`);
  print(`Siguiente:   ${NEXT_ACTIONS[state.stage]}`);
}

const commands = {
  help() {
    print(`Uso: node tools/nuvio/cli.mjs <comando> [opciones]

Ejecuciones
  init [--us US-001] [--title "..."] [--story-file <md>] [--new]   Crea o reutiliza la ejecución de una US
  status [--run <id>] [--json]                                    Estado y siguiente acción
  list                                                            Lista ejecuciones
  resume [--run <id>]                                             Reactiva una ejecución (rama + sesión)
  stage <etapa> [--note "..."]                                    Cambia la etapa (p. ej. analysis, blocked)
  ac add --id AC-1 --text "..." | ac set --id AC-1 --status met --evidence "..." | ac list
  decision --kind <tipo> --text "..."                             Registra una decisión técnica
  authorize --what migration-edits|test-removal --reason "..."   Registra una autorización explícita del usuario
Git y calidad
  branch [--slug <slug>] [--type feat]                            Crea o reutiliza la rama de la US
  validate --mode quick|full                                      Build/lint/tests/chequeos estáticos (límite de reintentos)
  review-prepare [--force]                                        Prepara el paquete para el review independiente
  review-save --file <json>                                       Guarda hallazgos del reviewer
  findings [--json]                                               Lista hallazgos
  select-fixes --selection "REV-001,REV-003"|all|blocking|none    Registra los fixes aprobados por el usuario
  gate [--ci] [--title "..."]                                     Quality gates previos al PR
GitHub
  pr --title "..." [--body-file <md>] [--dry-run]                 Valida gates, pushea y crea/actualiza el PR (nunca mergea)
  ci-status                                                       Estado de los checks del PR
  protect-main [--dry-run]                                        Configura la protección de main (acción manual)
  doctor                                                          Verifica skills, hooks, configuración y herramientas`);
  },

  init(ctx) {
    const { root, config, values } = ctx;
    const usId = values.us ? normalizeUsId(values.us) : nextUsId(root, config);
    const sessionId = readSessionId(root);
    const existing = values.new ? null : findReusableRun(root, config, usId);
    if (existing) {
      const state = persist(ctx, {
        ...existing,
        devinSessionIds: [
          ...new Set([...existing.devinSessionIds, ...(sessionId ? [sessionId] : [])])
        ]
      });
      setCurrentRun(root, state.runId);
      print(`Reutilizando ejecución existente (idempotente).`);
      printSummary(ctx, state);
      return;
    }
    const storySource = values['story-file']
      ? path.resolve(values['story-file'])
      : findStoryDoc(ctx, usId);
    if (!storySource || !existsSync(storySource)) {
      throw new NuvioError(
        `No se encontró la US ${usId}. Guardala en ${config.userStoriesDir}/${usId}-<slug>.md o pasá --story-file.`,
        EXIT.usage
      );
    }
    const story = readText(storySource);
    const title = values.title ?? titleFromStory(story);
    if (!title) throw new NuvioError('No se pudo inferir el título; pasá --title.', EXIT.usage);
    const state = createRunState({ usId, title, config, sessionId });
    writeText(runFile(ctx, state, 'user-story.md'), story);
    persist(ctx, { ...state, storySource: relative(ctx, storySource) });
    setCurrentRun(root, state.runId);
    print('Ejecución creada.');
    printSummary(ctx, state);
  },

  status(ctx) {
    const { state } = withRun(ctx);
    if (ctx.values.json) return print(JSON.stringify(state, null, 2));
    printSummary(ctx, state);
  },

  list(ctx) {
    const current = currentRunId(ctx.root);
    const runs = listRuns(ctx.root, ctx.config);
    if (runs.length === 0) return print('No hay ejecuciones.');
    for (const run of runs) {
      print(
        `${run.runId === current ? '*' : ' '} ${run.runId}  ${run.stage.padEnd(14)} ${run.branch ?? '-'}  ${run.pr.url ?? ''}`
      );
    }
  },

  resume(ctx) {
    let { state } = withRun(ctx);
    const sessionId = readSessionId(ctx.root);
    state = persist(ctx, {
      ...state,
      devinSessionIds: [...new Set([...state.devinSessionIds, ...(sessionId ? [sessionId] : [])])]
    });
    setCurrentRun(ctx.root, state.runId);
    if (state.branch && currentBranch(ctx.root) !== state.branch) {
      if (git(ctx.root, ['status', '--porcelain', '--untracked-files=no']).stdout.trim()) {
        throw new NuvioError(
          `Hay cambios locales en ${currentBranch(ctx.root)}; no se cambia a ${state.branch} para no sobrescribirlos.`,
          EXIT.unsafeWorkingTree
        );
      }
      git(ctx.root, ['switch', state.branch]);
      print(`Cambiado a la rama ${state.branch}.`);
    }
    printSummary(ctx, state);
  },

  stage(ctx, [stage]) {
    if (!stage) throw new NuvioError('Indicá la etapa.', EXIT.usage);
    const { state } = withRun(ctx);
    const note = ctx.values.note ?? ctx.values.reason;
    const validation =
      state.stage === 'blocked'
        ? { ...state.validation, consecutiveFailures: 0 }
        : state.validation;
    const updated = persist(ctx, setStage({ ...state, validation }, stage, note));
    print(`Etapa: ${updated.stage}. Siguiente: ${NEXT_ACTIONS[updated.stage]}`);
  },

  ac(ctx, [action = 'list']) {
    const { state } = withRun(ctx);
    const criteria = [...state.acceptanceCriteria];
    if (action === 'add') {
      const id = requireOption(ctx.values, 'id').toUpperCase();
      const text = requireOption(ctx.values, 'text');
      const index = criteria.findIndex((c) => c.id === id);
      const entry = { id, text, status: 'pending', evidence: null };
      if (index >= 0) criteria[index] = { ...criteria[index], text };
      else criteria.push(entry);
    } else if (action === 'set') {
      const id = requireOption(ctx.values, 'id').toUpperCase();
      const status = requireOption(ctx.values, 'status');
      if (!AC_STATUSES.includes(status))
        throw new NuvioError(`Estado inválido. Válidos: ${AC_STATUSES.join(', ')}.`, EXIT.usage);
      if (status === 'met' && !ctx.values.evidence)
        throw new NuvioError('Un criterio cumplido requiere --evidence.', EXIT.usage);
      const index = criteria.findIndex((c) => c.id === id);
      if (index < 0) throw new NuvioError(`No existe el criterio ${id}.`, EXIT.usage);
      criteria[index] = {
        ...criteria[index],
        status,
        evidence: ctx.values.evidence ?? criteria[index].evidence
      };
    } else if (action !== 'list') {
      throw new NuvioError('Acción inválida. Usar: ac add | ac set | ac list.', EXIT.usage);
    }
    const updated =
      action === 'list' ? state : persist(ctx, { ...state, acceptanceCriteria: criteria });
    for (const c of updated.acceptanceCriteria)
      print(`${c.id} [${c.status}] ${c.text}${c.evidence ? `\n    evidencia: ${c.evidence}` : ''}`);
  },

  decision(ctx) {
    const { state } = withRun(ctx);
    const kind = requireOption(ctx.values, 'kind');
    if (!DECISION_KINDS.includes(kind))
      throw new NuvioError(`Tipo inválido. Válidos: ${DECISION_KINDS.join(', ')}.`, EXIT.usage);
    const id = `DEC-${String(state.decisions.length + 1).padStart(3, '0')}`;
    persist(ctx, {
      ...state,
      decisions: [
        ...state.decisions,
        { id, kind, text: requireOption(ctx.values, 'text'), at: nowIso() }
      ]
    });
    print(`${id} registrada.`);
  },

  authorize(ctx) {
    const { state } = withRun(ctx);
    const key = AUTHORIZATIONS[requireOption(ctx.values, 'what')];
    if (!key)
      throw new NuvioError(
        `Autorización inválida. Válidas: ${Object.keys(AUTHORIZATIONS).join(', ')}.`,
        EXIT.usage
      );
    const reason = requireOption(ctx.values, 'reason');
    const id = `DEC-${String(state.decisions.length + 1).padStart(3, '0')}`;
    persist(ctx, {
      ...state,
      authorizations: { ...state.authorizations, [key]: true },
      decisions: [
        ...state.decisions,
        { id, kind: 'authorization', text: `${ctx.values.what}: ${reason}`, at: nowIso() }
      ]
    });
    print(`${id}: autorización "${ctx.values.what}" registrada.`);
  },

  branch(ctx) {
    const { root, config, values } = ctx;
    let { state } = withRun(ctx);
    if (!existsSync(runFile(ctx, state, 'plan.md')))
      throw new NuvioError(
        'Falta plan.md: completar el análisis antes de crear la rama.',
        EXIT.usage
      );
    if (state.acceptanceCriteria.length === 0)
      throw new NuvioError(
        'Registrar los criterios de aceptación con "ac add" antes de crear la rama.',
        EXIT.usage
      );
    const type = values.type ?? 'feat';
    if (!BRANCH_TYPES.includes(type))
      throw new NuvioError(
        `Tipo de rama inválido. Válidos: ${BRANCH_TYPES.join(', ')}.`,
        EXIT.usage
      );
    const branch = state.branch ?? `${type}/${state.usId}-${slugify(values.slug ?? state.title)}`;
    const current = currentBranch(root);

    if (current !== branch) {
      const trackedChanges = git(root, [
        'status',
        '--porcelain',
        '--untracked-files=no'
      ]).stdout.trim();
      if (trackedChanges) {
        throw new NuvioError(
          `Hay cambios locales sin commitear en "${current}". No se sobrescriben: commitealos o guardalos y reintentá.\n${trackedChanges}`,
          EXIT.unsafeWorkingTree
        );
      }
      const online =
        hasRemote(root, config.remote) &&
        git(root, ['fetch', config.remote, config.baseBranch], { allowFailure: true }).code === 0;
      if (!online)
        print(
          `Aviso: no se pudo actualizar ${config.remote}/${config.baseBranch}; se usa la referencia local.`
        );
      if (localBranchExists(root, branch)) {
        git(root, ['switch', branch]);
        print(`Rama existente reutilizada: ${branch}`);
      } else if (
        online &&
        git(root, ['fetch', config.remote, branch], { allowFailure: true }).code === 0 &&
        remoteBranchExists(root, config.remote, branch)
      ) {
        git(root, ['switch', '-c', branch, '--track', `${config.remote}/${branch}`]);
        print(`Rama remota reutilizada: ${branch}`);
      } else {
        git(root, ['switch', '-c', branch, resolveBaseRef(root, config)]);
        print(`Rama creada: ${branch} desde ${resolveBaseRef(root, config)}`);
      }
    } else {
      print(`Ya en la rama ${branch}.`);
    }
    state = { ...state, branch };
    if (['intake', 'analysis'].includes(state.stage)) state = setStage(state, 'implementation');
    persist(ctx, state);
  },

  validate(ctx) {
    const { root, config, values } = ctx;
    let { state } = withRun(ctx);
    const mode = values.mode ?? 'quick';
    if (!config.validation[mode])
      throw new NuvioError('Modo inválido: usar quick o full.', EXIT.usage);
    const branch = currentBranch(root);
    if (branch === config.baseBranch || (state.branch && branch !== state.branch)) {
      throw new NuvioError(
        `La validación debe correr en la rama de la ejecución (${state.branch}), no en ${branch}.`,
        EXIT.usage
      );
    }
    print(`Ejecutando validación ${mode}...`);
    const report = runValidation(root, config, state, mode);
    print(formatChecks(report.checks));
    const failures = report.passed ? 0 : state.validation.consecutiveFailures + 1;
    state = {
      ...state,
      validation: {
        consecutiveFailures: failures,
        lastRun: {
          mode,
          at: report.at,
          commit: report.commit,
          dirty: report.dirty,
          passed: report.passed
        }
      }
    };
    if (!['fixing', 'review', 'fix-selection'].includes(state.stage) || report.passed)
      state = setStage(state, 'validation');
    if (failures > config.maxFixAttempts) {
      persist(
        ctx,
        setStage(
          state,
          'blocked',
          `Validación fallida ${failures} veces consecutivas (máximo ${config.maxFixAttempts} autocorrecciones).`
        )
      );
      throw new NuvioError(
        'Límite de autocorrecciones alcanzado. Registrar evidencia y consultar al usuario.',
        EXIT.limitReached
      );
    }
    persist(ctx, state);
    if (!report.passed) {
      throw new NuvioError(
        `Validación ${mode} fallida (autocorrección ${failures}/${config.maxFixAttempts}). Ver logs en ${relative(ctx, runFile(ctx, state, 'logs'))}.`
      );
    }
    if (report.dirty)
      print(
        'Aviso: hay cambios sin commitear; el gate de PR exige validar sobre un commit limpio.'
      );
    print(`Validación ${mode} OK.`);
  },

  'review-prepare'(ctx) {
    const { root, config, values } = ctx;
    let { state } = withRun(ctx);
    const head = headSha(root);
    const last = state.validation.lastRun;
    if (workingTreeChanges(root).length > 0)
      throw new NuvioError('Commitear los cambios antes del review.', EXIT.usage);
    if (!last || last.mode !== 'full' || !last.passed || last.commit !== head) {
      throw new NuvioError(
        'Se requiere una validación full exitosa sobre el commit actual antes del review.',
        EXIT.usage
      );
    }
    if (state.review.reviewedCommit === head && !values.force) {
      throw new NuvioError(
        'Este commit ya fue revisado y no hubo cambios. Usar --force solo si cambió el contexto.',
        EXIT.usage
      );
    }
    if (state.review.rounds >= config.maxReviewRounds) {
      persist(
        ctx,
        setStage(
          state,
          'blocked',
          `Se alcanzó el máximo de ${config.maxReviewRounds} rondas de review.`
        )
      );
      throw new NuvioError(
        'Límite de rondas de review alcanzado; se requiere decisión del usuario.',
        EXIT.limitReached
      );
    }
    const base = mergeBase(root, resolveBaseRef(root, config));
    const round = state.review.rounds + 1;
    writeText(runFile(ctx, state, 'review', 'diff.patch'), fullDiff(root, base));
    writeText(runFile(ctx, state, 'review', 'diffstat.txt'), `${diffStat(root, base)}\n`);
    const dir = relative(ctx, runDir(root, config, state.runId));
    writeText(
      runFile(ctx, state, 'review', 'context.md'),
      [
        `# Paquete de review — ronda ${round}`,
        '',
        `- Ejecución: ${state.runId}`,
        `- US: ${state.usId} - ${state.title}`,
        `- Rama: ${state.branch}`,
        `- Base (merge-base): ${base}`,
        `- Commit revisado: ${head}`,
        '',
        'Leer, en este orden:',
        `1. ${dir}/user-story.md — User Story original y criterios.`,
        `2. ${dir}/plan.md — plan de implementación.`,
        `3. ${dir}/state.json — criterios de aceptación, decisiones y autorizaciones.`,
        `4. ${dir}/validation.json — resultados reales de build/lint/tests/chequeos (generados por la herramienta).`,
        `5. ${dir}/review/diffstat.txt y ${dir}/review/diff.patch — diff completo contra la base.`,
        `6. ${dir}/findings.json — hallazgos y decisiones de rondas anteriores (si existe).`,
        '',
        'Los archivos modificados deben leerse completos en el workspace, no solo el diff.'
      ].join('\n') + '\n'
    );
    state = setStage(
      { ...state, review: { ...state.review, preparedCommit: head, preparedRound: round } },
      'review'
    );
    persist(ctx, state);
    print(`Paquete de review ronda ${round} listo en ${dir}/review/. Ejecutar /nuvio-review.`);
  },

  'review-save'(ctx) {
    const { root, config, values } = ctx;
    let { state } = withRun(ctx);
    const head = headSha(root);
    if (state.review.preparedCommit !== head)
      throw new NuvioError(
        'El HEAD cambió desde review-prepare; preparar el review nuevamente.',
        EXIT.usage
      );
    const input = readJson(path.resolve(requireOption(values, 'file')));
    const incoming = Array.isArray(input) ? input : input.findings;
    if (!Array.isArray(incoming))
      throw new NuvioError('El archivo debe contener { "findings": [...] }.', EXIT.usage);
    const previous = loadFindings(root, config, state.runId);
    const { findings, warnings } = mergeReviewRound(previous, incoming);
    const round = state.review.preparedRound;
    writeJson(runFile(ctx, state, 'review', `round-${round}.json`), input);
    writeJson(runFile(ctx, state, 'findings.json'), {
      round,
      reviewedCommit: head,
      summary: input.summary ?? '',
      findings
    });
    const evaluation = evaluateFindings(findings);
    const rejectedBlocking = evaluation.blockingOpen.filter((f) => f.decision === 'rejected');
    const nextStage =
      evaluation.undecided.length > 0 ||
      rejectedBlocking.length > 0 ||
      evaluation.blockingOpen.some((f) => f.decision === null)
        ? 'fix-selection'
        : evaluation.blockingOpen.length > 0 || evaluation.approvedPending.length > 0
          ? 'fixing'
          : 'ready-for-pr';
    state = setStage(
      { ...state, review: { ...state.review, rounds: round, reviewedCommit: head } },
      nextStage
    );
    persist(ctx, state);
    for (const warning of warnings) print(`Aviso: ${warning}`);
    print(formatFindingsTable(findings));
    print(`\nRonda ${round} guardada. Etapa: ${nextStage}. ${NEXT_ACTIONS[nextStage]}`);
  },

  findings(ctx) {
    const { state } = withRun(ctx);
    const findings = loadFindings(ctx.root, ctx.config, state.runId);
    print(ctx.values.json ? JSON.stringify(findings, null, 2) : formatFindingsTable(findings));
  },

  'select-fixes'(ctx) {
    let { state } = withRun(ctx);
    if (state.stage !== 'fix-selection')
      throw new NuvioError(
        `La selección de fixes corresponde a la etapa fix-selection (actual: ${state.stage}).`,
        EXIT.usage
      );
    const selection = requireOption(ctx.values, 'selection');
    const file = runFile(ctx, state, 'findings.json');
    const stored = readJson(file);
    const result = applySelection(stored.findings, selection);
    writeJson(file, { ...stored, findings: result.findings });
    const nextStage =
      result.approved.length > 0
        ? 'fixing'
        : result.rejectedBlocking.length > 0
          ? 'fix-selection'
          : 'ready-for-pr';
    state = setStage(
      {
        ...state,
        fixSelections: [
          ...state.fixSelections,
          {
            at: nowIso(),
            round: stored.round,
            selection,
            approved: result.approved,
            rejected: result.rejected
          }
        ]
      },
      nextStage
    );
    persist(ctx, state);
    print(`Aprobados: ${result.approved.join(', ') || '(ninguno)'}`);
    print(`Rechazados: ${result.rejected.join(', ') || '(ninguno)'}`);
    if (result.rejectedBlocking.length > 0) {
      print(
        `ATENCIÓN: se rechazaron hallazgos bloqueantes (${result.rejectedBlocking.join(', ')}). El PR no puede quedar listo para revisión hasta resolverlos o acordar una alternativa.`
      );
    }
    print(`Etapa: ${nextStage}. ${NEXT_ACTIONS[nextStage]}`);
  },

  gate(ctx) {
    const { root, config, values } = ctx;
    const title = values.title ?? process.env.NUVIO_PR_TITLE;
    const result = values.ci
      ? ciGate(root, config, { prTitle: title })
      : localGate(root, config, withRun(ctx).state, { prTitle: title });
    print(formatChecks(result.checks));
    if (!result.passed) throw new NuvioError('Quality gates NO superados.');
    print('Quality gates superados.');
  },

  pr(ctx) {
    const { root, config, values } = ctx;
    let { state } = withRun(ctx);
    if (!['ready-for-pr', 'pr-created'].includes(state.stage)) {
      throw new NuvioError(
        `El PR se crea desde la etapa ready-for-pr (actual: ${state.stage}).`,
        EXIT.usage
      );
    }
    const title = values.title ?? state.pr.title;
    if (!title) throw new NuvioError('Falta --title.', EXIT.usage);
    const gate = localGate(root, config, state, { prTitle: title });
    print(formatChecks(gate.checks));
    if (!gate.passed) throw new NuvioError('Quality gates NO superados; no se crea el PR.');

    const bodyFile = path.resolve(values['body-file'] ?? runFile(ctx, state, 'pr-body.md'));
    if (!existsSync(bodyFile))
      throw new NuvioError(`Falta la descripción del PR (${relative(ctx, bodyFile)}).`, EXIT.usage);
    const body = readText(bodyFile);
    const templateFile = path.join(root, PR_TEMPLATE);
    const requiredSections = existsSync(templateFile)
      ? (readText(templateFile).match(/^## .+$/gm) ?? [])
      : [];
    const missing = requiredSections.filter((section) => !body.includes(section));
    if (missing.length > 0)
      throw new NuvioError(
        `La descripción del PR no tiene las secciones: ${missing.join(', ')}.`,
        EXIT.usage
      );
    if (!body.includes(state.usId))
      throw new NuvioError(`La descripción del PR debe referenciar ${state.usId}.`, EXIT.usage);

    if (values['dry-run']) {
      print(
        `[dry-run] Se pushearía ${state.branch} a ${config.remote} y se crearía/actualizaría el PR "${title}" contra ${config.baseBranch}. No se realizó ninguna acción remota.`
      );
      return;
    }
    resolveGh();
    ensureGhAuth(root);
    git(root, ['push', '--set-upstream', config.remote, state.branch]);
    const prs = findPullRequests(root, state.branch);
    if (prs.some((p) => p.state === 'MERGED'))
      throw new NuvioError(
        `La rama ${state.branch} ya tiene un PR mergeado; crear una nueva ejecución.`
      );
    const open = prs.find((p) => p.state === 'OPEN');
    let pr;
    if (open) {
      gh(root, ['pr', 'edit', String(open.number), '--title', title, '--body-file', bodyFile]);
      pr = { url: open.url, number: open.number };
      print(`PR existente actualizado (sin duplicar): ${pr.url}`);
    } else {
      const created = gh(root, [
        'pr',
        'create',
        '--base',
        config.baseBranch,
        '--head',
        state.branch,
        '--title',
        title,
        '--body-file',
        bodyFile
      ]);
      pr = parsePrUrl(created.stdout);
      print(`PR creado: ${pr.url}`);
    }
    state = setStage({ ...state, pr: { ...pr, title } }, 'pr-created');
    persist(ctx, state);
    print('El merge es manual: revisá y decidí en GitHub.');
  },

  'ci-status'(ctx) {
    const { state } = withRun(ctx);
    if (!state.pr.number) throw new NuvioError('La ejecución no tiene PR.', EXIT.usage);
    const result = gh(ctx.root, ['pr', 'checks', String(state.pr.number)], { allowFailure: true });
    print(result.stdout.trim() || result.stderr.trim());
    const meaning = { 0: 'todos los checks pasaron', 8: 'checks pendientes' };
    print(`Resultado: ${meaning[result.code] ?? 'hay checks fallidos o no disponibles'}.`);
  },

  'protect-main'(ctx) {
    const payload = branchProtectionPayload(['verify']);
    if (ctx.values['dry-run']) return print(JSON.stringify(payload, null, 2));
    ensureGhAuth(ctx.root);
    const slug = gh(ctx.root, [
      'repo',
      'view',
      '--json',
      'nameWithOwner',
      '-q',
      '.nameWithOwner'
    ]).stdout.trim();
    const result = gh(
      ctx.root,
      [
        'api',
        '-X',
        'PUT',
        `repos/${slug}/branches/${ctx.config.baseBranch}/protection`,
        '--input',
        '-'
      ],
      {
        input: JSON.stringify(payload),
        allowFailure: true
      }
    );
    if (result.code !== 0) {
      throw new NuvioError(
        `GitHub rechazó la protección (puede requerir GitHub Pro en repos privados o permisos de admin): ${result.stderr.trim() || result.stdout.trim()}`
      );
    }
    print(`Protección de ${ctx.config.baseBranch} configurada en ${slug}.`);
  },

  doctor(ctx) {
    const { errors, skills, agents } = runDoctor(ctx.root, Object.keys(commands));
    print(`Skills: ${skills.length} (${skills.join(', ')})`);
    print(`Agentes: ${agents.join(', ') || '(ninguno)'}`);
    const tools = [
      ['git', () => run('git', ['--version']).stdout.trim()],
      ['node', () => process.version],
      [
        'pnpm',
        () =>
          runShell('pnpm --version', { cwd: ctx.root }).output.trim().split(/\r?\n/).at(-1) ??
          'no encontrado'
      ],
      [
        'gh',
        () =>
          `${resolveGh()} — ${gh(ctx.root, ['auth', 'status'], { allowFailure: true }).code === 0 ? 'autenticado' : 'NO autenticado (gh auth login)'}`
      ]
    ];
    for (const [name, probe] of tools) {
      try {
        print(`${name}: ${probe()}`);
      } catch (error) {
        print(`${name}: ${error.message}`);
      }
    }
    if (errors.length > 0) {
      for (const error of errors) print(`ERROR: ${error}`);
      throw new NuvioError(`${errors.length} problema(s) de configuración.`);
    }
    print('Configuración de automatización válida.');
  }
};

function main(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: OPTIONS,
    allowPositionals: true,
    strict: true
  });
  const [name = 'help', ...rest] = positionals;
  const command = commands[name];
  if (!command || values.help) return commands.help();
  return command(name === 'help' ? {} : context(values), rest);
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exit(error instanceof NuvioError ? error.exitCode : EXIT.failure);
}
