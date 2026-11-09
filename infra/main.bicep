// Infraestructura de producción de Nuvio (US-051).
// Alcance: subscription — crea el resource group y despliega los módulos dentro.
// NO desplegar sin aprobación: ver docs/architecture/deployment.md.
targetScope = 'subscription'

@description('Ambiente lógico (tags y convención de nombres).')
param environment string = 'prod'

@description('Región de los recursos regionales (Functions, Storage, monitoreo). Flex Consumption está disponible en brazilsouth.')
param location string = 'brazilsouth'

@description('Región del recurso Static Web Apps. SWA no está disponible en brazilsouth; el contenido se sirve globalmente independientemente de esta ubicación.')
param swaLocation string = 'westus2'

@description('Nombre del resource group.')
param resourceGroupName string = 'rg-nuvio-${environment}'

@description('Nombre de la Function App (único globalmente).')
param functionAppName string = 'nuvio-api-${environment}'

@description('Nombre de la SWA del cliente (único globalmente).')
param clientAppName string = 'nuvio-client-${environment}'

@description('Nombre de la SWA de administración (único globalmente).')
param adminAppName string = 'nuvio-admin-${environment}'

@description('Nombre del workspace de Log Analytics.')
param logAnalyticsName string = 'log-nuvio-${environment}'

@description('Nombre de Application Insights.')
param appInsightsName string = 'appi-nuvio-${environment}'

@description('Nombre del plan de Functions.')
param planName string = 'asp-nuvio-${environment}'

@description('Si crear el presupuesto mensual (default false: preparado pero no desplegado).')
param deployBudget bool = false

@description('Monto mensual del presupuesto en la moneda de la suscripción.')
param budgetAmount int = 30

@description('Emails para alertas de presupuesto.')
param budgetContactEmails string[] = []

@description('Inicio del período de presupuesto (primer día del mes). Por defecto, el mes en curso al momento del despliegue.')
param budgetStartDate string = utcNow('yyyy-MM-01')

var tags = {
  project: 'nuvio'
  environment: environment
  'managed-by': 'bicep'
  us: 'US-051'
}

// Nombre de storage determinista y único por suscripción (3-24 chars, minúsculas, sin guiones).
var storageAccountName = 'st${uniqueString(subscription().id, resourceGroupName, 'nuvio')}'

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  scope: rg
  params: {
    name: storageAccountName
    location: location
    tags: tags
  }
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: rg
  params: {
    workspaceName: logAnalyticsName
    appInsightsName: appInsightsName
    location: location
    tags: tags
  }
}

module clientSwa 'modules/static-web-app.bicep' = {
  name: 'client-swa'
  scope: rg
  params: {
    name: clientAppName
    location: swaLocation
    tags: tags
  }
}

module adminSwa 'modules/static-web-app.bicep' = {
  name: 'admin-swa'
  scope: rg
  params: {
    name: adminAppName
    location: swaLocation
    tags: tags
  }
}

// CORS de la API = dominios de producción de ambas PWAs (sin wildcard).
module api 'modules/function-app.bicep' = {
  name: 'api'
  scope: rg
  params: {
    name: functionAppName
    planName: planName
    location: location
    tags: tags
    storageAccountName: storage.outputs.name
    storageBlobEndpoint: storage.outputs.blobEndpoint
    deploymentContainerName: storage.outputs.deploymentContainerName
    appInsightsName: monitoring.outputs.appInsightsName
    appInsightsConnectionString: monitoring.outputs.connectionString
    corsOrigins: [
      'https://${clientSwa.outputs.defaultHostname}'
      'https://${adminSwa.outputs.defaultHostname}'
    ]
  }
}

module budget 'modules/budget.bicep' = if (deployBudget) {
  name: 'budget'
  scope: rg
  params: {
    amount: budgetAmount
    contactEmails: budgetContactEmails
    startDate: budgetStartDate
  }
}

output resourceGroupName string = rg.name
output storageAccountName string = storage.outputs.name
output clientHostname string = clientSwa.outputs.defaultHostname
output adminHostname string = adminSwa.outputs.defaultHostname
output apiHostname string = api.outputs.defaultHostname
output apiAppName string = api.outputs.name
output clientSwaName string = clientSwa.outputs.name
output adminSwaName string = adminSwa.outputs.name
