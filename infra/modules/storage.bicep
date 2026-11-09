@description('Nombre de la Storage Account (3-24 caracteres, minúsculas, único global).')
param name string

@description('Región de Azure.')
param location string

@description('Tags comunes del recurso.')
param tags object

@description('Nombre del contenedor que recibe el paquete de despliegue de Functions (Flex Consumption).')
param deploymentContainerName string = 'deploymentpackage'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: name
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    // El host de Functions accede con identidad administrada (Entra/RBAC); no se permiten claves compartidas.
    allowSharedKeyAccess: false
    // Sin VNet: el acceso requiere Entra ID porque allowSharedKeyAccess=false. Reducir a una VNet
    // privada requeriría una SKU/plan de mayor costo; decisión documentada en el ADR-0002.
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: deploymentContainerName
  properties: {
    publicAccess: 'None'
  }
}

output name string = storage.name
output id string = storage.id
output blobEndpoint string = storage.properties.primaryEndpoints.blob
output deploymentContainerName string = deploymentContainer.name
