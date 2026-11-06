---
name: nuvio-github
description: Convenciones Git/GitHub de Nuvio - ramas por US, commits Conventional Commits, títulos de PR, creación idempotente del PR mediante la herramienta (con quality gates), verificación de CI y prohibición de merge automático.
---

# nuvio-github

## Responsabilidad

Gestionar ramas, commits y Pull Requests de forma segura, idempotente y trazable a la US.

## Activación

- Preparación de la rama (etapa 3), commits durante implementación/fixes y creación del PR (etapa 10).

## Entradas

- `state.json` de la ejecución (US, rama, PR existente).
- `pr-body.md` generado por `nuvio-reporting`.

## Procedimiento

1. **Rama**: `node tools/nuvio/cli.mjs branch --slug <slug-en-ingles> [--type feat|fix|refactor|docs|chore]`. Formato resultante: `feat/US-001-booking-creation`. El comando reutiliza la rama si ya existe y se niega a continuar (código 4) si hay cambios locales sin commitear del usuario: en ese caso informar y esperar; no usar stash, reset ni checkout para descartarlos.
2. **Commits**: Conventional Commits en inglés, `tipo(scope): descripción en imperativo` y pie `Refs: US-001`. Scopes habituales: `reservations`, `availability`, `services`, `professionals`, `salons`, `auth`, `calendar`, `api`, `client`, `admin`, `shared`, `database`, `infra`, `ci`, `docs`. Un commit por paso lógico; no commitear si no hay cambios; nunca `--amend` sobre commits ya pusheados.
3. **Título del PR**: `tipo(scope): descripción [US-001]`, p. ej. `feat(reservations): implement booking creation [US-001]` (validado por la herramienta y por CI).
4. **Crear el PR**: `node tools/nuvio/cli.mjs pr` (el título se genera automáticamente a partir del tipo de la rama, el scope opcional y el identificador US; `--title`, `--type` y `--scope` permiten ajustarlo y siempre se valida/regenera antes de llamar a GitHub). El comando ejecuta los quality gates, pushea la rama sin force, detecta PRs existentes para la rama (actualiza en lugar de duplicar; rechaza si ya fue mergeado), crea el PR contra `main` y registra la URL. No usar `gh pr create` directamente porque saltearía los gates y nunca usar el nombre de la rama como título.
5. **CI**: `node tools/nuvio/cli.mjs ci-status` una vez después de crear el PR; informar el estado sin esperar en bucle. Si CI falla, tratarlo como un fallo de validación (etapa 5 de `/nuvio-us`).
6. Si `gh` no está autenticado (código 5): pedir al usuario que ejecute `gh auth login` y luego `/nuvio-pr`.

## Salidas

Rama de la US, commits convencionales y URL del PR registrada en `state.json`.

## Restricciones

- Nunca hacer merge (ni `gh pr merge`, ni API, ni auto-merge), nunca pushear a `main`, nunca force push, nunca borrar ramas remotas. Los hooks del proyecto bloquean estos comandos.
- Nunca commitear secretos ni archivos de `.nuvio/`.

## Criterios de finalización

- PR abierto (o actualizado) con título y descripción válidos, URL informada al usuario y merge pendiente de decisión manual.
