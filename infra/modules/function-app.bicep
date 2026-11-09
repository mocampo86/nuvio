@description('Nombre de la Function App (único globalmente).')
param name string

@description('Nombre del plan (serverfarm).')
param planName string

@description('Región de Azure. Flex Consumption está disponible en brazilsouth.')
param location string

@description('Tags comunes del recurso.')
param tags object

@description('Nombre de la Storage Account del host (AzureWebJobsStorage y paquete de despliegue).')
param storageAccountName string

@description('Endpoint blob de la Storage Account.')
param storageBlobEndpoint string

@description('Nombre del contenedor del paquete de despliegue.')
param deploymentContainerName string

@description('Nombre del Application Insights existente (scope del role assignment).')
param appInsightsName string

@description('Connection string de Application Insights.')
param appInsightsConnectionString string

@description('Orígenes permitidos en CORS (dominios de las dos SWA).')
param corsOrigins string[]

@description('Memoria por instancia en MB. 2048 es el default recomendado por Microsoft.')
@allowed([512, 2048, 4096])
param instanceMemoryMB int = 2048

@description('Máximo de instancias; evita cargos inesperados. 40 es el mínimo documentado para Bicep/ARM.')
@minValue(40)
@maxValue(1000)
param maximumInstanceCount int = 40

// Identidad administrada asignada por usuario: la misma para storage del host,
// paquete de despliegue y telemetría (mínimo privilegio, sin claves).
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${name}-identity'
  location: location
  tags: tags
}

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: appInsightsName
}

// Roles requeridos por el host de Functions para AzureWebJobsStorage basado en identidad.
// Referencia: https://learn.microsoft.com/azure/azure-functions/functions-reference?pivots=programming-language-csharp#connecting-to-host-storage-with-an-identity
var roles = [
  'b7e6dc6d-f1e8-4753-8033-0f276bb0955b' // Storage Blob Data Owner
  '974c5e8b-45b9-4653-ba55-5f855dd0fb88' // Storage Queue Data Contributor
  '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3' // Storage Table Data Contributor
]

resource storageRoleAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for roleId in roles: {
  name: guid(storage.id, identity.id, roleId)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleId)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}]

// Monitoring Metrics Publisher: permite a la identidad enviar telemetría con AAD (DisableLocalAuth).
resource metricsPublisherRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(appInsights.id, identity.id, 'metrics-publisher')
  scope: appInsights
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '3913510d-42f4-4e42-8a64-420c390055eb')
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: planName
  location: location
  tags: tags
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  properties: {
    reserved: true // Linux
  }
}

resource functionApp 'Microsoft.Web/sites@2024-04-01' = {
  name: name
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storageBlobEndpoint}${deploymentContainerName}'
          authentication: {
            type: 'UserAssignedIdentity'
            userAssignedIdentityResourceId: identity.id
          }
        }
      }
      scaleAndConcurrency: {
        instanceMemoryMB: instanceMemoryMB
        maximumInstanceCount: maximumInstanceCount
        // Sin alwaysReady: escala a cero; el cold start es aceptable para la API inicial.
      }
      runtime: {
        name: 'node'
        version: '22'
      }
    }
    siteConfig: {
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      cors: {
        allowedOrigins: corsOrigins
        supportCredentials: false
      }
      appSettings: [
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'AzureWebJobsStorage__accountName'
          value: storageAccountName
        }
        {
          name: 'AzureWebJobsStorage__credential'
          value: 'managedidentity'
        }
        {
          name: 'AzureWebJobsStorage__clientId'
          value: identity.properties.clientId
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsightsConnectionString
        }
        {
          name: 'APPLICATIONINSIGHTS_AUTHENTICATION_STRING'
          value: 'ClientId=${identity.properties.clientId};Authorization=AAD'
        }
      ]
    }
  }
}

output name string = functionApp.name
output defaultHostname string = functionApp.properties.defaultHostName
output identityPrincipalId string = identity.properties.principalId
