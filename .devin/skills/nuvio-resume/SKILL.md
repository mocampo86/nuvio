---
name: nuvio-resume
description: Reanuda una ejecución Nuvio interrumpida desde la etapa registrada, recuperando rama y contexto sin repetir pasos completados ni duplicar ramas, commits o PRs.
argument-hint: "[runId]"
triggers:
  - user
allowed-tools:
  - read
  - grep
  - glob
  - edit
  - exec
---

# /nuvio-resume — Reanudar ejecución

## Responsabilidad

Recuperar el contexto persistido y continuar el flujo de `/nuvio-us` exactamente donde quedó.

## Activación

- El usuario ejecuta `/nuvio-resume` (el hook de inicio de sesión avisa si hay una ejecución activa).

## Entradas

- `runId` opcional; si no se indica, la ejecución activa (`.nuvio/current-run`).

## Procedimiento

1. `node tools/nuvio/cli.mjs resume [--run <runId>]`: reactiva la ejecución, registra la sesión de Devin y vuelve a la rama de la US. Código 4: hay cambios locales en otra rama; informar y **parar** sin tocarlos.
2. Recuperar contexto mínimo: `plan.md` y, según la etapa, `validation.json`, `findings.json` o `review-report.md`. No releer todo el repositorio.
3. Verificar coherencia: `git status` y `git log --oneline -5`. Si hay cambios sin commitear de la propia ejecución, revisarlos y commitearlos antes de validar.
4. Continuar en la etapa de `.devin/skills/nuvio-us/SKILL.md` que corresponda a la etapa registrada:

| Etapa registrada | Continuar en |
|---|---|
| `intake` | Etapa 2 |
| `analysis` | Etapa 2 (completar lo faltante del plan) o 3 |
| `implementation` | Etapa 4 |
| `validation` | Etapa 5 (o 6 si la última validación full pasó sobre HEAD) |
| `review` | Etapa 6, paso 2 (paquete ya preparado) |
| `fix-selection` | Etapa 8 |
| `fixing` | Etapa 9 |
| `ready-for-pr` | Etapa 10 |
| `pr-created` | Informar URL y `ci-status`; si CI falló, etapa 5 |
| `blocked` | Mostrar el motivo y resolverlo con el usuario; luego `stage <etapa>` |

## Salidas

La ejecución avanza desde su etapa registrada.

## Restricciones

- No crear una ejecución nueva, ni ramas o PRs adicionales para la misma US.
- No repetir validaciones o reviews si HEAD no cambió.

## Criterios de finalización

- Se retomó la etapa correcta y el flujo continúa según `/nuvio-us`.
