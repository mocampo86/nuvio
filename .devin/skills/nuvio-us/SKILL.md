---
name: nuvio-us
description: Workflow principal de Nuvio. Desarrolla una User Story completa de forma autónoma - análisis, rama, implementación, tests con autocorrección, review independiente, informe, selección de fixes por el usuario, correcciones y creación automática del PR (sin merge).
argument-hint: "[US-001 | texto completo de la User Story]"
triggers:
  - user
allowed-tools:
  - read
  - grep
  - glob
  - edit
  - exec
---

# /nuvio-us — Desarrollo autónomo de una User Story

Este archivo es la fuente única del flujo. `/nuvio-resume`, `/nuvio-fix` y `/nuvio-pr` reutilizan sus etapas. `CLI` significa `node tools/nuvio/cli.mjs`.

## Responsabilidad

Llevar una US desde su texto hasta un Pull Request listo para revisión, deteniéndose solo en los puntos de intervención definidos en `AGENTS.md`.

## Activación

El usuario ejecuta `/nuvio-us` con un ID (`/nuvio-us US-001`), con el texto completo de la US o sin argumentos.

## Entradas

- ID, título, descripción, criterios Given/When/Then y reglas adicionales (pegados en un mensaje o en `docs/user-stories/<ID>-*.md`).
- Configuración: `tools/nuvio/config.json` (`maxFixAttempts`, `maxReviewRounds`).

## Procedimiento

Antes de cada etapa, ejecutar `node tools/nuvio/cli.mjs status` solo si hay dudas del estado; no repetir etapas completadas. Avanzar sin pedir confirmaciones salvo en los puntos marcados con **PARAR**.

### Etapa 1 — User Story

1. Si no se recibió nada: pedir en una sola pregunta que pegue la US completa (ID si existe, título, descripción, criterios Given/When/Then, reglas adicionales) o indique su ID. **PARAR** hasta la respuesta.
2. Si se recibió solo un ID: buscar `docs/user-stories/<ID>-*.md`. Si no existe, pedir el texto (**PARAR**).
3. Si se recibió el texto: si no trae ID, usar el siguiente libre (el mayor de `docs/user-stories/` + 1). Guardarlo en `docs/user-stories/<ID>-<slug>.md` siguiendo `docs/engineering/templates/user-story.md` sin alterar el contenido del usuario.
4. `node tools/nuvio/cli.mjs init --us <ID> --story-file docs/user-stories/<archivo>.md`. Si informa "Reutilizando ejecución existente", continuar en la etapa que indique (`/nuvio-resume`).

### Etapa 2 — Análisis

1. `node tools/nuvio/cli.mjs stage analysis`.
2. Aplicar `nuvio-requirements`, luego `nuvio-architecture`, `nuvio-security` (riesgos) y `nuvio-design-patterns` si hay variación o límites de I/O.
3. Escribir `.nuvio/runs/<runId>/plan.md` con las secciones: `## 1. Requisitos`, `## 2. Arquitectura`, `## 3. Pasos de implementación`, `## 4. Tests`, `## 5. Seguridad`, `## 6. Base de datos y migraciones`, `## 7. Riesgos y fuera de alcance`.
4. Registrar cada criterio con `ac add` y cada supuesto o decisión con `decision`.
5. Si hay ambigüedades bloqueantes: `node tools/nuvio/cli.mjs stage blocked --note "<pregunta>"`, preguntar con opciones concretas y **PARAR**. Con la respuesta, registrar la decisión y `stage analysis`.

### Etapa 3 — Rama

`node tools/nuvio/cli.mjs branch --slug <slug>` (ver `nuvio-github`). Código 4 = cambios locales del usuario: informar los archivos y **PARAR** sin tocarlos.

### Etapa 4 — Implementación

Aplicar `nuvio-implementation` (con `nuvio-clean-code`, `nuvio-design-patterns`, `nuvio-security`) y `nuvio-testing` para los tests. Incluir el archivo de la US en el primer commit. Commits según `nuvio-github`.

### Etapa 5 — Validación y autocorrección

1. Durante el desarrollo: `node tools/nuvio/cli.mjs validate --mode quick`.
2. Con todo commiteado: `node tools/nuvio/cli.mjs validate --mode full`.
3. Si falla: leer el log que indica la salida, corregir la causa raíz, commitear y repetir. Nunca modificar o eliminar tests para que pasen.
4. Código 3 (límite de autocorrecciones): informar al usuario qué falla, la evidencia (ruta del log y extracto) y qué se intentó. **PARAR**.
5. Con la validación full en verde, actualizar cada criterio con `ac set --status met --evidence "<archivo › test>"`.

### Etapa 6 — Review independiente

1. `node tools/nuvio/cli.mjs review-prepare`.
2. Invocar la skill `nuvio-review` (se ejecuta como subagente de solo lectura `nuvio-reviewer`, con contexto propio). No le pases conclusiones propias: el subagente lee la US, el plan, `validation.json` y el diff por su cuenta.
3. Guardar el JSON devuelto tal cual en `.nuvio/runs/<runId>/review/round-<N>.input.json` y ejecutar `node tools/nuvio/cli.mjs review-save --file .nuvio/runs/<runId>/review/round-<N>.input.json`. Si el JSON es inválido, pedir al mismo subagente una única corrección del formato.
4. Si el subagente no está disponible (subagentes deshabilitados), ejecutar el procedimiento de `.devin/skills/nuvio-review/SKILL.md` en línea sin editar archivos y advertir en el informe que el review no fue independiente.

### Etapa 7 — Informe

Aplicar `nuvio-reporting` para generar `.nuvio/runs/<runId>/review-report.md`.

### Etapa 8 — Aprobación de fixes

Según la etapa que dejó `review-save`:

- `ready-for-pr`: sin hallazgos pendientes → etapa 10.
- `fixing`: todos los hallazgos abiertos ya tienen decisión → etapa 9.
- `fix-selection`:
  1. En rondas ≥2, si todos los hallazgos sin decisión son bloqueantes introducidos por los fixes aprobados, ejecutar `select-fixes --selection blocking` sin preguntar e informarlo. Si no:
  2. Mostrar la tabla de `node tools/nuvio/cli.mjs findings` (ID, severidad, bloquea, título) y la ruta de `review-report.md`.
  3. Preguntar con opciones: "Aplicar todos" (`all`), "Solo bloqueantes" (`blocking`, rechaza los no bloqueantes), "Rechazar todos" (`none`), o IDs libres (`REV-001, REV-003`). **PARAR**.
  4. `node tools/nuvio/cli.mjs select-fixes --selection "<respuesta>"`.
  5. Si se rechazó un hallazgo bloqueante: explicar por qué bloquea, proponer una alternativa y **PARAR**. Si el usuario acepta una alternativa, registrarla con `decision` y aprobar ese ID con `select-fixes --selection "<ID>"`. Si no, la ejecución queda en `fix-selection`: no se crea el PR y no se declara aprobada.

### Etapa 9 — Fixes

Aplicar `/nuvio-fix`: solo los hallazgos `approved` y los bloqueantes aprobados; commitear (`fix(scope): address REV-00X` + `Refs: <US>`); volver a la etapa 5 (validate full) y luego a la etapa 6. La herramienta impide reviews repetidos sin cambios y corta tras `maxReviewRounds` (código 3 → informar y **PARAR**).

### Etapa 10 — Pull Request

1. Aplicar `nuvio-reporting` para `.nuvio/runs/<runId>/pr-body.md` y `nuvio-github` para el título.
2. `node tools/nuvio/cli.mjs pr --title "<tipo(scope): descripción [US-XXX]>"`. Sin pedir confirmación: el comando valida los quality gates y crea o actualiza el PR. Si los gates fallan, volver a la etapa correspondiente.
3. Código 5 (gh no instalado/autenticado): pedir `gh auth login` y luego `/nuvio-pr`. **PARAR**.
4. `node tools/nuvio/cli.mjs ci-status` una vez y entregar el resumen final (`nuvio-reporting`) con la URL del PR. El merge lo decide el usuario.

## Salidas

Rama, commits, `plan.md`, `validation.json`, `findings.json`, `review-report.md`, `pr-body.md` y PR en GitHub; todo registrado en `.nuvio/runs/<runId>/state.json`.

## Restricciones

- Nunca merge, push a `main`, force push ni descartar cambios del usuario.
- No ejecutar etapas ya completadas sin cambios que lo justifiquen; leer solo el contexto necesario.
- No crear el PR con hallazgos bloqueantes abiertos, fixes aprobados sin aplicar, criterios sin evidencia o validación desactualizada (el comando `pr` lo impide).

## Criterios de finalización

- Etapa `pr-created` con URL informada, o una parada justificada en un punto de intervención con el motivo registrado (`blocked` / `fix-selection`).

## Ejemplo

```text
/nuvio-us US-001
→ análisis (3 AC, 1 supuesto registrado) → rama feat/US-001-booking-creation
→ validate full OK (2.º intento) → review ronda 1: REV-001 High (bloquea), REV-002 Low
→ usuario: "Solo bloqueantes" → fix REV-001 → validate full OK → review ronda 2: REV-001 fixed
→ PR: feat(reservations): implement booking creation [US-001] → URL
```
