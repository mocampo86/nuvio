# Configuración y despliegue a producción (US-051)

El workflow `deploy-prod.yml` está **inerte por defecto**: falla explícito hasta completar esta configuración. Todos los comandos son PowerShell para Windows.

## 1. Requisitos previos

- Suscripción de Azure con permiso para crear recursos y asignar roles.
- Azure CLI (`az`) + `az login` con la suscripción correcta (`az account show`).
- `gh auth login` (para configurar GitHub y validar el workflow).
- Node.js 22 y pnpm 9.15.4 (solo para despliegues locales; CI usa los suyos).
- `main` protegido: `node tools/nuvio/cli.mjs protect-main` (PR obligatorio + check `verify`).

## 2. Crear la identidad OIDC para GitHub Actions

El repo fue creado en 2026 → GitHub emite claims `sub` **inmutables basados en IDs**. El subject exacto para `main` es:

```
repo:mocampo86@41837332/nuvio@1448666597:ref:refs/heads/main
```

```powershell
$SUB = (az account show --query id -o tsv)

# App registration + service principal para OIDC
$APPID = az ad app create --display-name nuvio-github-deploy --query appId -o tsv
az ad sp create --id $APPID

# Permisos en el scope donde se desplegará (la suscripción, porque main.bicep crea el RG).
# Contributor recursos + User Access Administrator por los roleAssignments de la plantilla.
az role assignment create --assignee $APPID --role Contributor --scope "/subscriptions/$SUB"
az role assignment create --assignee $APPID --role "User Access Administrator" --scope "/subscriptions/$SUB"

# Credencial federada para main (sub inmutable)
az ad app federated-credential create --id $APPID --parameters '{
  "name": "nuvio-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:mocampo86@41837332/nuvio@1448666597:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'
```

> Verificar el formato de `sub` que emite GitHub para este repo una vez: `gh api repos/mocampo86/nuvio/actions/oidc/customization/sub`. Para repositorios creados después del 15/07/2026 el formato usa IDs inmutables como el de arriba; si el endpoint reporta la plantilla clásica por nombre, ajustar el subject a `repo:mocampo86/nuvio:ref:refs/heads/main`. **No usar `*` ni un subject genérico**.

Variables del repositorio (no secrets; son identificadores no sensibles):

```powershell
gh variable set AZURE_CLIENT_ID -b $APPID
gh variable set AZURE_TENANT_ID -b (az account show --query tenantId -o tsv)
gh variable set AZURE_SUBSCRIPTION_ID -b $SUB
gh variable set AZURE_DEPLOY_ENABLED -b true
```

## 3. Crear el Environment `production`

Repo público → Environments con protección disponibles. En **Settings → Environments → New environment `production`**:

- Required reviewers: un humano (habilita la aprobación manual del deploy).
- Prevent self-review: activado.
- Deployment branches: **solo `main`**.

Sin este paso el job `deploy` falla al no encontrar el Environment.

## 4. Verificar disponibilidad de nombres (los nombres deben ser únicos globalmente)

```powershell
az functionapp list --query "[?name=='nuvio-api-prod']"   # debe devolver []
az staticwebapp list --query "[?name=='nuvio-client-prod' || name=='nuvio-admin-prod']"
```

> Estos comandos solo listan recursos **de tu suscripción** — no detectan nombres tomados por otros tenants (los nombres son globalmente únicos). La verificación real es `az deployment sub what-if`, que falla si el nombre está ocupado globalmente.

Si están ocupados, cambiar los params en `infra/main.prod.bicepparam`.

## 5. Validar y previsualizar

```powershell
bicep build infra/main.bicep
az deployment sub what-if --location brazilsouth `
  --template-file infra/main.bicep --parameters infra/main.prod.bicepparam
```

`what-if` no crea nada y muestra exactamente lo que se aprovisionaría.

## 6. Ejecutar el despliegue

1. En GitHub → Actions → **Deploy production** → Run workflow. El selector de rama muestra todas las ramas que contienen el archivo, pero los jobs solo se ejecutan desde `main` (`if: github.ref == 'refs/heads/main'` + restricción del Environment); un dispatch desde otra rama finaliza sin desplegar nada.
2. El job `preflight` valida `AZURE_DEPLOY_ENABLED`, las variables y que el último CI `verify` en ese commit pasó.
3. El job `deploy` espera la **aprobación del reviewer** del Environment, luego: despliega Bicep → compila → empaqueta la API (`pnpm deploy --prod`) → publica Functions → publica ambas SWA (tokens obtenidos en el job, enmascarados, efímeros) → health check.

## 7. Verificar la API

```powershell
Invoke-RestMethod https://nuvio-api-prod.azurewebsites.net/api/health
# { status: "ok", service: "nuvio-api" }
```

## 8. Recuperación ante un deploy fallido

Flex Consumption **no tiene deployment slots**: el rollback es volver a ejecutar el workflow desde el commit anterior que funcionó (`Run workflow` en ese commit exige que sea `main` — ante urgencia: revert del commit en `main` por PR, el dispatch siempre corre sobre `main` HEAD). La infraestructura Bicep es idempotente; re-ejecutar no duplica recursos.

## 9. Deshabilitar/eliminar recursos (evitar costos)

```powershell
az group delete --name rg-nuvio-prod --yes   # elimina todo lo desplegado
```

Con los grants vigentes el costo real es ≈$0, pero borrar el RG es la forma segura de dejar de facturar.

## 10. Habilitar el presupuesto (opcional, tras aprobación)

Editar `main.prod.bicepparam`: `deployBudget = true`, `budgetContactEmails = ['tu@email']` → PR → merge → el próximo deploy crea `nuvio-monthly-budget`. Recordatorio: **las alertas notifican, no cortan el gasto**.
