# ADR-0001: Capas de Clean Architecture en el monorepo

- Estado: Propuesto (pendiente de confirmación del responsable del producto)
- Fecha: 2026-11-06

## Contexto

El monorepo (US-050) tiene `apps/api` (Azure Functions), dos PWAs y los paquetes `shared` (Zod) y `database` (vacío). Las próximas US introducen lógica de negocio (disponibilidad, reservas, cancelaciones) que debe ser testeable sin Azure ni base de datos y reutilizable por la API.

## Decisión

- Crear `packages/domain` (dominio + casos de uso + puertos) cuando la primera US con lógica de negocio lo requiera, organizado por contexto.
- `packages/database` implementa los puertos de persistencia; `apps/api/src/infrastructure` aloja adaptadores de servicios externos; `apps/api/src/functions` solo contiene handlers.
- `packages/shared` queda para contratos (esquemas Zod de DTO) compartidos con las PWAs.

## Alternativas consideradas

- Lógica en los handlers de Azure Functions: más simple al inicio, pero acopla el negocio al runtime y dificulta testear concurrencia y disponibilidad.
- Un paquete por capa (`domain`, `application`): más separación formal sin beneficio actual; se puede dividir más adelante.

## Consecuencias

- Tests unitarios rápidos del dominio sin infraestructura.
- Un paquete adicional en el workspace cuando aparezca la primera regla de negocio.
