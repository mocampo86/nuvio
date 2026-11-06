# Nuvio — Reglas para agentes

Nuvio es una plataforma SaaS multi-tenant de reservas para peluquerías y profesionales (producción prevista en Microsoft Azure). Prioridades: seguridad, bajo costo, mantenibilidad, simplicidad.

## Stack y comandos (fuente: `package.json`)

- Monorepo pnpm 9.15.4, Node.js 22 LTS, TypeScript estricto, ESM.
- `apps/client`, `apps/admin`: React 18 + Vite + Tailwind. `apps/api`: Azure Functions v4. `packages/shared`: esquemas Zod. `packages/database`: capa de datos (aún vacía).
- Verificación: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:automation`.
- Usar pnpm (nunca npm/yarn). No cambiar el stack sin aprobación explícita del usuario.
- Código e identificadores en inglés; documentación, User Stories e informes en español.

## Cómo se desarrolla una User Story

- Toda US se desarrolla con `/nuvio-us` (guía: `docs/engineering/nuvio-automation.md`). Estado y artefactos: `node tools/nuvio/cli.mjs` (ejecuciones en `.nuvio/runs/`, no versionado).
- Skills por responsabilidad: `nuvio-requirements`, `nuvio-architecture`, `nuvio-clean-code`, `nuvio-design-patterns`, `nuvio-implementation`, `nuvio-testing`, `nuvio-security`, `nuvio-review`, `nuvio-reporting`, `nuvio-github`. Invocar la skill correspondiente en lugar de improvisar el procedimiento.
- Reglas de negocio que siempre deben preservarse: `docs/architecture/domain-invariants.md`. Arquitectura y capas: `docs/architecture/README.md`.

## Reglas no negociables

- Nunca trabajar, commitear ni pushear sobre `main`. Nunca force push. Nunca hacer merge de un PR: el merge es siempre manual.
- Nunca sobrescribir ni descartar cambios locales del usuario.
- Nunca versionar ni imprimir secretos, tokens o credenciales (`.env`, `apps/api/local.settings.json`).
- No modificar, saltear ni eliminar tests para que pasen. No debilitar quality gates, reglas de lint ni configuraciones de seguridad.
- Mantener el alcance de la US: sin funcionalidades futuras ni refactors no relacionados.
- Todo dato de negocio está aislado por peluquería (tenant); el tenant se deriva del principal autenticado, nunca de la entrada del cliente.

## Cuándo consultar al usuario (y solo entonces)

- Requisito funcional ambiguo o bloqueante.
- Selección de fixes del review.
- Decisión de seguridad, arquitectura, integridad de datos, migración incompatible, eliminación de tests o nueva dependencia relevante.
- Merge del Pull Request.
