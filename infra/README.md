# Infraestructura (US-051)

Bicep de producción de Nuvio. **No crear recursos sin aprobación** — el despliegue real requiere completar los pasos de [`docs/architecture/deployment.md`](../docs/architecture/deployment.md).

## Estructura

| Archivo | Contenido |
|---|---|
| `main.bicep` | Orquestador a scope de suscripción: resource group + módulos + outputs. |
| `main.prod.bicepparam` | Parámetros de producción (deployBudget=false por defecto). |
| `modules/static-web-app.bicep` | Static Web App Free (se instancia dos veces). |
| `modules/function-app.bicep` | Plan Flex Consumption + Function App Node 22 + UAI + role assignments. |
| `modules/storage.bicep` | StorageV2 LRS endurecido + contenedor `deploymentpackage`. |
| `modules/monitoring.bicep` | Log Analytics + Application Insights (AAD-only, 30 días, tope diario). |
| `modules/budget.bicep` | Presupuesto mensual con alertas (condicionado por `deployBudget`). |

## Validación local (sin crear recursos)

```powershell
# Bicep CLI
bicep build infra/main.bicep
# o con Azure CLI
az bicep build --file infra/main.bicep
```

## Despliegue (requiere aprobación y configuración previa)

```powershell
# Vista previa sin crear nada
az deployment sub what-if --location brazilsouth `
  --template-file infra/main.bicep `
  --parameters infra/main.prod.bicepparam

# Despliegue (solo tras aprobación)
az deployment sub create --name nuvio-infra-prod --location brazilsouth `
  --template-file infra/main.bicep `
  --parameters infra/main.prod.bicepparam
```

El principal que despliega necesita `Contributor` **y** `User Access Administrator` (o `Owner`) en el resource group, porque la plantilla crea role assignments para la identidad administrada de la Function App.
