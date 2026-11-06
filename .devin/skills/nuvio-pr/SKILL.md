---
name: nuvio-pr
description: Crea o actualiza el Pull Request de la ejecución Nuvio activa después de verificar todos los quality gates. Nunca hace merge.
triggers:
  - user
allowed-tools:
  - read
  - grep
  - glob
  - edit
  - exec
---

# /nuvio-pr — Crear Pull Request

## Responsabilidad

Publicar el PR solo cuando los gates lo permiten, con título y descripción completos.

## Activación

- Etapa 10 de `/nuvio-us`, o el usuario ejecuta `/nuvio-pr` (p. ej. tras autenticar `gh`).

## Entradas

- Ejecución activa en etapa `ready-for-pr` o `pr-created`.

## Procedimiento

1. `node tools/nuvio/cli.mjs gate`. Si falla, informar qué gate falla y volver a la etapa de `.devin/skills/nuvio-us/SKILL.md` que lo resuelve; no intentar sortearlo.
2. Si falta o está desactualizado `.nuvio/runs/<runId>/pr-body.md`, generarlo con `nuvio-reporting`.
3. Definir el título según `nuvio-github` y ejecutar `node tools/nuvio/cli.mjs pr --title "<título>"`.
4. Informar la URL del PR y el resultado de `node tools/nuvio/cli.mjs ci-status`.

## Salidas

URL del PR registrada y comunicada.

## Restricciones

- Nunca usar `gh pr create` ni `gh pr merge` directamente. Nunca hacer merge.

## Criterios de finalización

- PR abierto/actualizado y URL informada, o motivo concreto por el que los gates lo impiden.
