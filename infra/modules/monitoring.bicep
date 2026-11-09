@description('Nombre del workspace de Log Analytics.')
param workspaceName string

@description('Nombre del recurso de Application Insights.')
param appInsightsName string

@description('Región de Azure.')
param location string

@description('Tags comunes del recurso.')
param tags object

@description('Días de retención de logs (mínimo sin sobrecosto para analytics tables: 30-31 días incluidos).')
param retentionInDays int = 30

@description('Tope de ingesta diaria en GB (protección de emergencia ante ingesta inesperada; el sampling del host es el control principal de costos).')
param dailyQuotaGb string = '0.1'

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: workspaceName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: retentionInDays
    workspaceCapping: {
      dailyQuotaGb: json(dailyQuotaGb)
    }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
    Flow_Type: 'Bluefield'
    IngestionMode: 'LogAnalytics'
    // Solo autenticación Entra (identidad administrada de la Function App); sin instrumentation key suelta.
    DisableLocalAuth: true
    RetentionInDays: retentionInDays
  }
}

output appInsightsName string = appInsights.name
output appInsightsId string = appInsights.id
output connectionString string = appInsights.properties.ConnectionString
