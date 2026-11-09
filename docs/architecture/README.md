# Arquitectura

US-050 inicializa un monorepo con dos PWAs React, una API Azure Functions y paquetes compartidos.
No se aprovisiona infraestructura ni se conecta una base de datos en esta etapa.

## Capas (Clean Architecture pragmática)

Guía vigente según [ADR-0001](adr/0001-clean-architecture-layering.md). Las capas se crean cuando la primera US las necesita; no se generan carpetas vacías por adelantado.

| Capa | Contenido | Ubicación |
|---|---|---|
| Dominio | Entidades, value objects, invariantes, errores de dominio. Sin frameworks ni I/O. | `packages/domain/src/<contexto>/` |
| Aplicación | Casos de uso y puertos (interfaces de repositorios y servicios externos). | `packages/domain/src/<contexto>/application/` |
| Infraestructura | Adaptadores: persistencia (`packages/database`), Entra External ID (Google federado), Google Calendar, Azure. | `packages/database/src/`, `apps/api/src/infrastructure/` |
| Presentación | Handlers HTTP de Azure Functions; componentes React. Solo traducen entrada/salida. | `apps/api/src/functions/`, `apps/client/src/`, `apps/admin/src/` |
| Contratos compartidos | Esquemas Zod y tipos de los DTO entre API y PWAs. | `packages/shared/src/` |

Reglas:

- Dependencias hacia adentro: presentación → aplicación → dominio; infraestructura implementa puertos de aplicación.
- `packages/domain` no importa `@azure/functions`, React, drivers de base de datos ni SDKs externos.
- La composición (inyección de dependencias) se hace en el borde: cada handler arma su caso de uso con los adaptadores concretos.
- Todo puerto de persistencia recibe y filtra por el identificador de peluquería (tenant).

Contextos previstos: `reservations`, `availability`, `catalog` (servicios), `staff` (profesionales), `salons`, `identity`.

## Infraestructura de producción (US-051)

- [azure-infrastructure.md](azure-infrastructure.md) — recursos, decisiones y compatibilidad (SWA Free, Flex Consumption, Node 22).
- [azure-cost-estimate.md](azure-cost-estimate.md) — costos estimados y riesgos.
- [deployment.md](deployment.md) — activación OIDC, Environment y despliegue manual protegido.
- [security-infrastructure.md](security-infrastructure.md) — identidades, tokens, CORS y protección del pipeline.

## Decisiones

Registro en [`adr/`](adr/). Reglas de negocio invariantes: [domain-invariants.md](domain-invariants.md).
