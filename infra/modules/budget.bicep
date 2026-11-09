// Presupuesto mensual con alertas por email a scope de resource group.
// Se despliega SOLO si deployBudget=true en el archivo de parámetros (default false):
// así la plantilla queda preparada sin crear presupuestos reales sin aprobación.
// IMPORTANTE: las alertas de presupuesto notifican pero NO detienen el consumo.
@description('Monto mensual del presupuesto en la moneda de la suscripción.')
param amount int

@description('Emails que reciben las alertas de presupuesto.')
param contactEmails string[]

@description('Fecha de inicio del período del presupuesto (ISO 8601, primer día del mes).')
param startDate string

resource budget 'Microsoft.Consumption/budgets@2023-05-01' = {
  name: 'nuvio-monthly-budget'
  properties: {
    timeGrain: 'Monthly'
    category: 'Cost'
    amount: amount
    timePeriod: {
      startDate: startDate
    }
    notifications: {
      actual80: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 80
        contactEmails: contactEmails
        contactGroups: []
        contactRoles: []
      }
      forecasted100: {
        enabled: true
        operator: 'GreaterThan'
        threshold: 100
        thresholdType: 'Forecasted'
        contactEmails: contactEmails
        contactGroups: []
        contactRoles: []
      }
    }
  }
}

output name string = budget.name
