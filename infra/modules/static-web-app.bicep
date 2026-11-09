@description('Nombre del Static Web App (único globalmente).')
param name string

@description('Región del recurso SWA. Nota: SWA no está disponible en todas las regiones (p. ej. brazilsouth); el contenido se sirve desde la red global independientemente de esta ubicación.')
param location string

@description('Tags comunes del recurso.')
param tags object

resource staticSite 'Microsoft.Web/staticSites@2024-04-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    // Sin provider/repositoryUrl/repositoryToken: el despliegue se hace por CLI con
    // deployment token obtenido en el job OIDC. No se genera workflow automático de GitHub.
    stagingEnvironmentPolicy: 'Disabled'
    allowConfigFileUpdates: true
  }
}

output name string = staticSite.name
output defaultHostname string = staticSite.properties.defaultHostname
