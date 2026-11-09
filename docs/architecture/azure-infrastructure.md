# Infraestructura Azure de producción (US-051)

Definición Bicep de la infraestructura de producción. **Ningún recurso fue creado** durante la implementación; este documento describe qué se desplegará y por qué.

## Diagrama de recursos

```
Suscripción (brazilsouth, salvo SWA)
└── rg-nuvio-prod
    ├── nuvio-client-prod   Static Web App (Free)      → apps/client
    ├── nuvio-admin-prod    Static Web App (Free)      → apps/admin
    ├── asp-nuvio-prod      Plan Flex Consumption (FC1, Linux)
    ├── nuvio-api-prod      Function App v4, Node 22   → apps/api
    │   └── <nuvio-api-prod>-identity  User-assigned managed identity
    ├── st<uniqueString>    StorageV2 Standard_LRS
    ├── log-nuvio-prod      Log Analytics (PerGB2018)
    ├── appi-nuvio-prod     Application Insights (workspace-based, AAD-only)
    └── nuvio-monthly-budget  Presupuesto mensual (opcional, deployBudget)
```

Los nombres de SWA y Function App deben ser únicos globalmente; el storage se deriva de `uniqueString(subscription, rg)`. Si un nombre está ocupado se parametriza otro (ver deployment.md → verificar disponibilidad).

## Decisiones clave (ver ADR-0002)

- **Static Web Apps Free ×2**: HTTPS, dominio `*.azurestaticapps.net`, distribución global, SPA fallback a `index.html` vía `staticwebapp.config.json` en `apps/*/public/`.
  - **Limitaciones del plan Free**: sin SLA; **no permite vincular la Function App externa como API administrada** ("Bring Your Own API" requiere Standard); los ambientes de staging existen pero se deshabilitan (`stagingEnvironmentPolicy: 'Disabled'`).
  - **Consecuencia**: las PWAs llaman a la API por su URL HTTPS directa (`https://nuvio-api-prod.azurewebsites.net`, inyectada como `VITE_API_URL` en el build) y la Function App configura CORS con los dos orígenes exactos de las SWA. Sin wildcard.
  - **Región**: SWA no está disponible en `brazilsouth`. La `location` del recurso solo fija el plano de control; el contenido se sirve desde la red global de SWA. Se usa `westus2` (parametrizable).
- **Azure Functions Flex Consumption**: plan recomendado por Microsoft para nuevas cargas serverless. Linux, escala a cero, sin instancias always-ready, Node.js 22 (LTS, igual que el proyecto). El plan Linux Consumption clásico **se retira el 30/09/2028**, por lo que no se evaluó como opción duradera; Flex tiene además control de concurrencia y tamaño de instancia.
  - Flex **no soporta deployment slots**: el rollback es re-desplegar el commit anterior (ver deployment.md).
  - `maximumInstanceCount` acotado a 40 (mínimo admitido por ARM) como protección ante escalado desmedido.
  - Paquete desplegado en `deploymentpackage` del storage del host vía identidad administrada.
- **Storage del host con identidad administrada**: `AzureWebJobsStorage__accountName` + UAI con los roles mínimos que el host requiere (Storage Blob Data Owner, Storage Queue Data Contributor, Storage Table Data Contributor). Sin connection strings ni `allowSharedKeyAccess`.
- **Observabilidad**: Application Insights basado en workspace, `DisableLocalAuth` (solo AAD vía Monitoring Metrics Publisher), retención 30 días, tope de ingesta diaria de emergencia (0.1 GB) y sampling en `host.json` (máx. 20 ítems/seg; `Request` excluido del sampling para no perder trazabilidad).
- **Presupuesto**: módulo `budget.bicep` condicionado por `deployBudget` (default `false`). Monto y emails por parámetro. **Las alertas notifican pero no detienen el consumo.**

## Compatibilidad (AC-14)

| Componente | Elección | Compatibilidad verificada |
|---|---|---|
| Functions runtime | v4 (`FUNCTIONS_EXTENSION_VERSION=~4`, bundle `[4.*,5.0.0)`) | Único soportado actualmente. |
| Node.js | 22 (`runtime.version` + engines del repo) | Node 22 LTS soportado en Flex Consumption; mismo Node en CI y `.nvmrc`. |
| Plan | Flex Consumption (FC1) | Disponible en Brazil South; recomendado; Consumption Linux se retira 2028. |
| TypeScript | Compilado a JS (`tsc -b` → `dist/src`) en CI | El paquete desplegado solo contiene JS + `host.json` + deps de producción. |

## Seguridad aplicada

HTTPS-only en los tres servicios, TLS ≥1.2, FTPS deshabilitado, acceso público anónimo a blobs deshabilitado, claves compartidas de storage deshabilitadas, App Insights sin instrumentation key local, CORS restringido a dos orígenes explícitos sin credenciales, identidad administrada en lugar de secretos, y ningún endpoint administrativo adicional. Detalle en [`security-infrastructure.md`](./security-infrastructure.md).

## Costos

Ver [`azure-cost-estimate.md`](./azure-cost-estimate.md) — estimación < USD 2/mes en tráfico bajo.
