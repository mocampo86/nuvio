---
name: nuvio-design-patterns
description: Evalúa si un patrón de diseño (Repository, Adapter, Strategy, Specification, Factory, etc.) resuelve un problema concreto de la US de Nuvio, justifica su uso o recomienda la alternativa más simple.
---

# nuvio-design-patterns

## Responsabilidad

Decidir con evidencia si un patrón aporta valor hoy, evitando abstracciones especulativas.

## Activación

- Al planificar un cambio que introduce variación, un límite de I/O o reglas combinables.
- En review, cuando se detecta un patrón innecesario o la falta de uno que elimina duplicación real.

## Entradas

- Diseño propuesto en `plan.md` y el código afectado.

## Procedimiento

1. Formular el problema concreto (p. ej. "la persistencia debe poder testearse sin base de datos").
2. Proponer la solución más simple (función, módulo, objeto literal).
3. Considerar un patrón solo si se cumple al menos una condición **actual**: existe un límite de I/O; existen ≥2 variantes reales del comportamiento en esta US; existen ≥3 reglas combinables; la construcción de un agregado debe garantizar invariantes complejas.
4. Guía en el contexto de Nuvio:
   - Repository: puerto de persistencia en aplicación, implementado en infraestructura, siempre filtrado por tenant.
   - Adapter: integraciones Google (Sign-In, exportación a Calendar) y servicios Azure.
   - Specification: composición de reglas de disponibilidad (horario, profesional, servicio, reservas existentes) cuando son ≥3 y se combinan.
   - Strategy: solo con variantes reales configurables; la política de cancelación actual es única (24 h), no justifica Strategy.
   - Factory: creación de una reserva con validación de invariantes si el constructor se vuelve complejo.
5. Si se adopta un patrón, registrar la justificación: `node tools/nuvio/cli.mjs decision --kind design --text "Patrón X para Y porque Z; alternativa simple descartada porque W"`.

## Salidas

Decisión documentada (patrón adoptado o descartado) en la sección de arquitectura de `plan.md`.

## Restricciones

- No introducir patrones "por si acaso" ni por uniformidad.
- No crear interfaces con una sola implementación salvo en límites de I/O.

## Criterios de finalización

- Cada patrón usado tiene problema, justificación y alternativa descartada.
