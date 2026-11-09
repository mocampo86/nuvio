// Parámetros de producción (US-051).
// NO ejecutar un despliegue real sin aprobación: ver docs/architecture/deployment.md.
// deployBudget=false y sin emails: el presupuesto no se crea hasta configurarlo conscientemente.
using 'main.bicep'

param environment = 'prod'
param location = 'brazilsouth'
// SWA no está disponible en brazilsouth; el contenido se sirve desde la red global.
param swaLocation = 'westus2'

param resourceGroupName = 'rg-nuvio-prod'
param functionAppName = 'nuvio-api-prod'
param clientAppName = 'nuvio-client-prod'
param adminAppName = 'nuvio-admin-prod'
param logAnalyticsName = 'log-nuvio-prod'
param appInsightsName = 'appi-nuvio-prod'
param planName = 'asp-nuvio-prod'

// Presupuesto: definido pero NO desplegado por defecto.
param deployBudget = false
param budgetAmount = 30
param budgetContactEmails = []
param budgetStartDate = '2026-12-01'
