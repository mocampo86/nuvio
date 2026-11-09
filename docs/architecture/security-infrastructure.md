# Seguridad de infraestructura (US-051)

## Autenticación CI → Azure: OIDC sin secretos

- `azure/login@v2` con federated credential: **no hay client secrets ni certificados** almacenados en GitHub.
- El credential se fija al `sub` **inmutable** del repo (`repo:mocampo86@41837332/nuvio@1448666597:ref:refs/heads/main`): un fork o repo renombrado no puede reutilizarlo.
- `permissions:` mínimos: `id-token: write` + `contents: read`; `GITHUB_TOKEN` no tiene escritura.
- La identidad OIDC solo puede ejecutarse desde `main` + Environment `production` con aprobación humana.

## Tokens de despliegue de Static Web Apps

Azure OIDC **no reemplaza** el deployment token de SWA (mecanismo propio del servicio). Se obtiene con `az staticwebapp secrets list` **dentro del job autenticado**, se enmascara con `::add-mask::` y muere con el job: nada persiste en GitHub ni en logs. Rotación si se expone: `az staticwebapp secrets reset-api-key`.

## Identidades administradas y RBAC

- Function App: **user-assigned managed identity** única con los roles mínimos requeridos por el host: Storage Blob Data Owner, Storage Queue Data Contributor, Storage Table Data Contributor (solo sobre `st<nuvio>`) y Monitoring Metrics Publisher (solo sobre `appi-nuvio-prod`).
- Sin `allowSharedKeyAccess`: no existen claves de storage que filtrar. Todo acceso a datos es Entra/RBAC auditado.
- La identidad de despliegue (OIDC) recibe `Contributor` + `User Access Administrator` **en el scope de despliegue** porque la plantilla crea role assignments — se documenta el motivo; no es Owner a nivel organización.

## Red y transporte

- HTTPS-only en SWA, Function App y Storage (`supportsHttpsTrafficOnly`, `httpsOnly`).
- TLS mínimo 1.2; FTPS deshabilitado en la Function App (solo deploy via RBAC).
- Blob public access deshabilitado; contenedor `deploymentpackage` `publicAccess: None`.

## CORS

`allowedOrigins` = **exactamente** los dos hostnames de producción de las SWA (outputs del mismo despliegue, nunca `*`), `supportCredentials: false`. Desarrollo local usa `local.settings.json` (gitignored) — separación dev/prod.

## Secretos y datos sensibles

- Cero secretos en el repo: `local.settings.json` está en `.gitignore` y `.funcignore`; ningún app setting contiene claves (la connection string de App Insights sin DisableLocalAuth no permite ingesta porque `DisableLocalAuth: true` exige AAD).
- Logs: `logLevel: Information` (sin Debug/Trace en prod), sampling activo; la API no loguea bodies ni query strings. Sin tokens, contraseñas ni datos personales en telemetría.
- El workflow no imprime tokens: `add-mask` antes de cualquier uso; falla explícito sin exponer variables.

## Protección del pipeline

- `workflow_dispatch` único trigger: ningún PR (propio o de terceros) puede alcanzar credenciales de producción.
- `if: github.ref == 'refs/heads/main'` en ambos jobs + Environment `production` con required reviewers y prevent-self-review.
- `concurrency` serializa despliegues; preflight exige CI verde en el mismo commit.
- `main` sin protección hoy: `node tools/nuvio/cli.mjs protect-main` queda como paso obligatorio de activación — un dispatch malicioso es imposible para quienes no tienen write, y con write igual requiere aprobación del Environment.
