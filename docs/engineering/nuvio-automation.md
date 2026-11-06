# Sistema de desarrollo autónomo de Nuvio (Devin Desktop)

## Arquitectura

| Capa | Implementación | Ubicación |
|---|---|---|
| 1. Project Rules | Reglas siempre activas, breves, que apuntan a las skills | `AGENTS.md` |
| 2. Skills | 10 skills de capacidad (formato `SKILL.md` nativo de Devin) | `.devin/skills/nuvio-*/` |
| 3. Workflows | Skills invocables como comandos `/` que orquestan las de capacidad; estado persistente | `.devin/skills/nuvio-{us,fix,status,resume,pr}/`, `nuvio-review` |
| 4. Quality Gates | CLI Node sin dependencias (local) + GitHub Actions (CI) + hooks y permisos de Devin | `tools/nuvio/`, `.github/workflows/ci.yml`, `.devin/hooks.v1.json`, `.devin/config.json` |

Decisiones:

- Devin Desktop no tiene "workflows" nativos (los de Windsurf no se importan): los workflows son skills con `triggers: [user]`, por lo que `/nuvio-us` etc. **son comandos nativos**.
- El review independiente usa el subagente personalizado `.devin/agents/nuvio-reviewer.md` (contexto propio, solo `read`/`grep`/`glob`). La skill `nuvio-review` lo invoca con `agent: nuvio-reviewer`.
- El adaptador (estado, gates, PR) está en Node.js ESM en vez de PowerShell: Node ya es requisito del proyecto, corre idéntico en Windows y en el runner Linux de CI (una sola fuente de verdad para los gates) y se prueba con `node --test`.
- `/nuvio-us` (`.devin/skills/nuvio-us/SKILL.md`) es la única definición del flujo; los demás comandos reutilizan sus etapas.

## Instalación en Windows

1. Requisitos del proyecto (ver `README.md`): Node.js 22 LTS, pnpm 9.15.4, `pnpm install`.
2. GitHub CLI y autenticación (necesaria para crear PRs):

   ```powershell
   winget install GitHub.cli
   gh auth login        # GitHub.com → HTTPS → navegador
   ```

   La herramienta encuentra `gh` aunque no esté en el PATH de Git Bash (`C:\Program Files\GitHub CLI\gh.exe`).
3. Verificar la configuración:

   ```powershell
   node tools/nuvio/cli.mjs doctor
   pnpm test:automation
   ```

4. En Devin Desktop abrir la carpeta del repositorio. Comprobar con `/hooks` que aparecen `guard-command.mjs` y `session-start.mjs`, y escribir `/nuvio` para ver los comandos.
5. Modo de permisos recomendado: **Accept Edits** (o Smart). `.devin/config.json` pre-aprueba pnpm (build/lint/test), git de lectura/commit y el CLI; bloquea merge, force push, `reset --hard` y escritura de `.env`.
6. Protección de `main` (una sola vez, acción manual del dueño del repo):

   ```powershell
   node tools/nuvio/cli.mjs protect-main --dry-run   # muestra la configuración
   node tools/nuvio/cli.mjs protect-main             # la aplica vía gh api
   ```

   Exige PR, check `verify` en verde y sin force push/borrado. En repos privados del plan Free, GitHub no permite protección de ramas; el comando lo informa.

## Comandos

| Comando Devin | Qué hace |
|---|---|
| `/nuvio-us [US-001 \| texto]` | Flujo completo de una US hasta el PR |
| `/nuvio-review` | Review independiente del paquete preparado (subagente) |
| `/nuvio-fix [REV-001, REV-003 \| todos \| bloqueantes \| ninguno]` | Registra la selección y aplica los fixes |
| `/nuvio-status [todas]` | Estado de la ejecución |
| `/nuvio-resume [runId]` | Reanuda una ejecución interrumpida |
| `/nuvio-pr` | Crea/actualiza el PR tras validar los gates |

CLI subyacente (también usable a mano): `node tools/nuvio/cli.mjs help` o `pnpm nuvio help`.

## Flujo y puntos de intervención

```text
intake → analysis → [rama] → implementation → validation ⟲ (máx. 3 autocorrecciones)
→ review (subagente) → informe → fix-selection [USUARIO] → fixing → validation → review …
→ ready-for-pr → pr-created → merge [USUARIO, manual]
```

El agente solo se detiene para: requisitos ambiguos bloqueantes, selección de fixes, decisiones de seguridad/arquitectura/integridad (migraciones existentes, borrado de tests, dependencias nuevas), cambios locales del usuario que impedirían cambiar de rama, límites de reintentos y autenticación de GitHub.

## Persistencia y recuperación

Cada ejecución vive en `.nuvio/runs/<US>-<timestamp>/` (ignorado por Git; sin credenciales):

| Archivo | Contenido |
|---|---|
| `state.json` | ID, US, etapa e historial, rama, sesiones de Devin, criterios con evidencia, decisiones, autorizaciones, contadores, selecciones de fixes, PR |
| `user-story.md`, `plan.md` | US original y plan |
| `validation.json`, `logs/` | Resultado real de cada check y su salida |
| `review/` | `context.md`, `diff.patch`, `diffstat.txt`, rondas `round-N.json` |
| `findings.json` | Hallazgos con estado (reviewer) y decisión (usuario) |
| `review-report.md`, `pr-body.md` | Informes |

`.nuvio/current-run` apunta a la ejecución activa; `.nuvio/session.json` guarda el ID de sesión de Devin (hook `SessionStart`), que además avisa al abrir una sesión si hay una ejecución pendiente.

Idempotencia: `init` reutiliza la ejecución de la misma US; `branch` reutiliza la rama local o remota; `pr` actualiza el PR abierto de la rama en lugar de duplicarlo y rechaza ramas ya mergeadas; `review-prepare` rechaza revisar dos veces el mismo commit.

## Quality gates

| Gate | Local (`gate`, `pr`) | CI |
|---|---|---|
| Build, lint, typecheck, tests, tests de automatización | `validate --mode full` sobre el commit actual | Sí |
| Auditoría de dependencias (críticas) | Sí | Sí |
| Secretos en líneas agregadas | Sí | Sí |
| Archivos sensibles (`.env`, `local.settings.json`, claves) | Sí | Sí |
| Migraciones existentes modificadas | Sí (salvo `authorize`) | Sí (salvo label `migration-edit-approved`) |
| Tests eliminados / `.only` | Sí (salvo `authorize`) | Sí (salvo label `test-removal-approved`) |
| Título Conventional Commits + `[US-XXX]` | Sí | Sí |
| Review independiente sobre HEAD, sin bloqueantes, fixes aprobados aplicados, decisiones completas | Sí | — |
| Todos los criterios cumplidos con evidencia | Sí | — |
| `review-report.md` con todos los hallazgos; `pr-body.md` con todas las secciones | Sí | — |

Hallazgos forzados como bloqueantes: severidad Critical; categorías `acceptance` y `tenant-isolation`; `security`, `authorization`, `data-integrity` y `concurrency` con severidad High. Un bloqueante rechazado por el usuario impide el PR.

Prohibición de merge en tres niveles: el CLI no tiene operación de merge; `.devin/config.json` niega `gh pr merge` y la herramienta MCP de merge; el hook `guard-command.mjs` bloquea cualquier variante (`gh.exe pr merge`, API `/pulls/N/merge`, auto-merge), además de push a `main`, force push, `reset --hard`, `clean -f`, descartar cambios y commits sobre `main`.

## Configuración

`tools/nuvio/config.json`: `maxFixAttempts` (3), `maxReviewRounds` (3), comandos de validación `quick`/`full`, patrón de migraciones y rama base.

## Ejemplo

Ver [examples/US-000-ejecucion-simulada.md](examples/US-000-ejecucion-simulada.md).

## Solución de problemas

| Síntoma | Acción |
|---|---|
| Código 5 en `pr` | `gh auth login`, luego `/nuvio-pr` |
| Código 4 en `branch`/`resume` | Commitear o guardar tus cambios locales; el agente no los toca |
| Código 3 | Límite de autocorrecciones o rondas de review: revisar el log indicado y decidir; luego `node tools/nuvio/cli.mjs stage <etapa>` |
| Warning de engines con Node 24 | Usar Node 22 LTS como indica `package.json` |
| `/hooks` no muestra los hooks | Reiniciar la sesión de Devin en la raíz del repo |
