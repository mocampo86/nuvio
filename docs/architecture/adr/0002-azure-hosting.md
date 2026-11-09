# ADR-0002: Hosting Azure — SWA Free + Functions Flex Consumption

- Estado: Propuesto
- Fecha: 2026-11-09

## Contexto

US-051 prepara la infraestructura de producción de Nuvio (2 PWAs + API Azure Functions) con restricciones de bajo costo (<USD 30/mes sin base de datos), HTTPS, identidad administrada y despliegue manual protegido por OIDC. Uruguay es el mercado objetivo → Brazil South como región principal.

## Decisión

- **Static Web Apps Free ×2** (`nuvio-client-prod`, `nuvio-admin-prod`) sirviendo los builds de Vite, con SPA fallback vía `staticwebapp.config.json` y llamadas directas HTTPS a la API.
- **Azure Functions Flex Consumption (FC1)** en Brazil South, Node.js 22, identidad administrada para storage del host y telemetría, escala a cero, sin always-ready, `maximumInstanceCount` acotado.
- **StorageV2 Standard_LRS** endurecido (TLS 1.2, sin acceso público ni shared keys).
- **Application Insights workspace-based** (Log Analytics PerGB2018) con retención 30 días, tope diario de emergencia y sampling en `host.json`.
- **Presupuesto mensual** en Bicep pero no desplegado por defecto (`deployBudget=false`).
- Despliegue **manual** (`workflow_dispatch`) con OIDC + Environment `production` aprobado por humano; tokens SWA obtenidos en el job, nunca persistidos.

## Alternativas consideradas

- **SWA Standard** ($9/mes/app): habilita Bring-Your-Own-API (proxy `/api`), SLA y auth integrada. Rechazada por costo inicial; CORS explícito cubre el caso y el upgrade es indoloro.
- **SWA managed functions**: acoplaría la API a cada SPA y duplicaría código; la API es un servicio separado consumido por ambas.
- **Consumption clásico (Linux)**: más barato en grants pero **se retira el 30/09/2028** y es la opción legacy; no tiene sentido iniciar la infraestructura ahí.
- **Premium/Dedicated**: costo fijo siempre-on incompatible con el objetivo de costo.
- **Container Apps**: más control, más complejidad operativa que Flex para una API simple.
- **Storage con connection strings**: descartado por gestión de secretos; la UAI + RBAC es el patrón recomendado.
- **Private networking (VNet)**: incompatible con el costo (Flex lo soporta pero encarece); el acceso al storage queda restringido a Entra porque las shared keys están deshabilitadas.

## Consecuencias

- Costo estimado <USD 2/mes en tráfico bajo; el riesgo de costo es telemetría (mitigado con sampling + tope).
- SWA Free sin SLA y con limitación BYO-API documentada; las PWAs usan `VITE_API_URL` inyectada en build.
- Flex no tiene deployment slots → rollback = redeploy del commit previo (documentado en deployment.md).
- La identidad de despliegue necesita `Contributor` + `User Access Administrator` porque la plantilla crea role assignments.
