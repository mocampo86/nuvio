---
name: nuvio-fix
description: Registra la selección de fixes del review (IDs, todos o solo bloqueantes) para la ejecución Nuvio activa, aplica únicamente los aprobados, revalida, re-revisa y continúa hasta el PR.
argument-hint: "[REV-001, REV-003 | todos | bloqueantes | ninguno]"
triggers:
  - user
allowed-tools:
  - read
  - grep
  - glob
  - edit
  - exec
---

# /nuvio-fix — Aplicar fixes seleccionados

## Responsabilidad

Aplicar exactamente los fixes aprobados por el usuario y retomar el ciclo validación → review → PR.

## Activación

- El usuario responde a la selección de fixes o ejecuta `/nuvio-fix <selección>`.
- Etapa 9 de `/nuvio-us`.

## Entradas

- Selección del usuario (argumento) y `.nuvio/runs/<runId>/findings.json`.

## Procedimiento

1. `node tools/nuvio/cli.mjs status`. Si la etapa es `fix-selection` y hay argumento, registrar: `node tools/nuvio/cli.mjs select-fixes --selection "<argumento>"` (`todos` → `all`, `bloqueantes` → `blocking`, `ninguno` → `none`). Si es `fix-selection` sin argumento, ejecutar la etapa 8 de `.devin/skills/nuvio-us/SKILL.md`.
2. Con etapa `fixing`: `node tools/nuvio/cli.mjs findings --json` y tomar solo los hallazgos abiertos con `decision: "approved"` y los bloqueantes aprobados.
3. Por cada uno, aplicar el fix recomendado (o la alternativa registrada en `decision`) con `nuvio-implementation`, agregando o ajustando tests que prueben la corrección (`nuvio-testing`). No tocar hallazgos rechazados.
4. Commitear: `fix(<scope>): address REV-00X <resumen>` con pie `Refs: <US>`.
5. Continuar con las etapas 5 → 10 de `.devin/skills/nuvio-us/SKILL.md` (validate full, review-prepare, nuvio-review, review-save, informe y PR).

## Salidas

Commits con los fixes, nueva ronda de review registrada y, si todo pasa, PR creado o actualizado.

## Restricciones

- Nunca aplicar fixes rechazados ni ampliar el alcance con mejoras no seleccionadas.
- Si un fix aprobado requiere una decisión nueva (seguridad, arquitectura, migración), consultar antes de implementarlo.

## Criterios de finalización

- Todos los hallazgos aprobados quedan `fixed` en la ronda siguiente, o la ejecución se detiene en un punto de intervención justificado.
