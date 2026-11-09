# Estimación de costos Azure (US-051)

> **Importante**: los importes son **precios públicos retail** de Brazil South consultados el 2026-11-09 vía la [Azure Retail Prices API](https://prices.azure.com/api/retail/prices) y páginas oficiales de pricing. Son estimaciones, no cotización: el precio real depende de la oferta de la suscripción (aún sin definir), el tipo de cambio y la fecha. **Pendiente de confirmar con la oferta final** usando el [Azure Pricing Calculator](https://azure.microsoft.com/pricing/calculator/) con la sesión de la suscripción iniciada.

## Precios unitarios verificados (Brazil South, USD, retail)

| Servicio | Medidor | Gratis incluido | Precio después del tramo gratis |
|---|---|---|---|
| Functions Flex Consumption | On Demand GB-s | 100.000 GB-s/mes | $0,000037/GB-s |
| Functions Flex Consumption | Ejecuciones | 250.000/mes | $0,000004/10 ejec (≈$0,40/millón) |
| Functions Flex Consumption | Always Ready (baseline) | — | $0,000005/GB-s + ejecuciones (no se usa) |
| Functions Consumption clásico (comparativa) | GB-s / ejecuciones | 400.000 GB-s + 1M ejec | $0,000016/GB-s + $0,20/millón — **retira 2028** |
| Storage Standard Hot LRS | Datos | — | $0,0326/GB/mes (primer tramo) |
| Storage | Operaciones | — | ~$0,07/10k escrituras, ~$0,0056/10k lecturas |
| Log Analytics (base de App Insights) | Ingesta Analytics | 5 GB/mes | $4,6/GB |
| Log Analytics | Retención | 30-31 días incluidos | ~$0,2/GB/mes extra |
| Static Web Apps | Free tier | Plan completo + 100 GB ancho de banda/suscripción | Sin upgrade automático: se deja de servir o requiere Standard (~$9/mes) |
| Bandwidth (Functions egress) | Transferencia | ~100 GB | $0,12/GB siguiente tramo |
| Presupuestos/alertas | — | Gratis | — |

## Escenarios

### Tráfico bajo (objetivo inicial, sin base de datos)

| Concepto | Estimación mensual |
|---|---|
| 2 SWA Free | $0 |
| Flex Consumption (<100k GB-s, <250k ejec) | $0 (dentro del grant) |
| Storage (<10 GB, <1M ops) | < $0,50 |
| App Insights/Log Analytics (<5 GB ingeridos) | $0–$0,50 |
| Bandwidth | $0 |
| **Total estimado** | **< USD 2/mes** — muy por debajo del objetivo de USD 30 |

Nota: los grants de Functions aplican por suscripción en ofertas pagas; en algunas ofertas (p. ej. Azure for Students / Sponsorship) pueden no aplicar — **pendiente de confirmar con la oferta**. Incluso sin grant, el uso proyectado es < $5/mes.

### Crecimiento (ejemplo orientativo: 1M ejecuciones/mes, 200 ms, 2048 MB)

- Ejecuciones: 750.000 billables × $0,40/M ≈ **$0,30**
- GB-s: (1M × 0,2 s × 2 GB − 100k gratis) ≈ 300k GB-s × $0,000037 ≈ **$11**
- Telemetría (10 GB ingeridos): 5 GB × $4,6 ≈ **$23** ← principal variable
- Resto: < $2
- **Total ≈ USD 35-40/mes** — la telemetría domina; se controla con sampling (ya configurado), `dailyQuotaGb` de emergencia y revisión de `logLevel`.

## Riesgos de cargos inesperados

1. **Verbosa telemetría**: es la principal fuente de costo variable. Mitigado con sampling + tope diario, pero el tope **corta** la ingesta (pérdida de logs ese día) — revisar si se alcanza.
2. **Bandwidth SWA Free**: superar 100 GB deja de servir el sitio (no cobra). Riesgo de disponibilidad, no de costo.
3. **Always Ready accidental**: si alguien configura instancias always-ready hay costo fijo de baseline aun sin tráfico. La plantilla no las crea; vigilar cambios manuales en el portal.
4. **El presupuesto no detiene consumo**: las alertas son notificaciones. No hay límite de gasto automático en Azure.
5. **Storage**: costo casi nulo, pero los contadores de Functions generan transacciones constantes (insignificantes a esta escala).
6. **Servicios que cobran sin tráfico**: ninguno en este diseño — no hay recursos always-on. Log Analytics solo cobra por lo ingerido (y Functions siempre genera algo de telemetría al despertar).

## Alternativas de reducción de costo (futuras)

- Mantener sampling más agresivo o filtrar tipos de telemetría si los costos de ingesta crecen.
- `instanceMemoryMB` 512 MB (parametrizado en el módulo) reduce GB-s por ejecución, con más cold starts.
- SWA Standard solo si hace falta BYO API, SLA o auth integrada (~$9/mes/app).
- La base de datos se presupuesta aparte en **US-052**.
