---
name: nuvio-architecture
description: Ubica cada cambio de Nuvio en la capa correcta (dominio, aplicación, infraestructura, presentación), verifica dependencias y acoplamiento, propone el cambio mínimo y registra decisiones arquitectónicas (ADR). Usar al planificar, implementar y revisar.
---

# nuvio-architecture

## Responsabilidad

Garantizar Clean Architecture pragmática: dominio independiente, dependencias hacia adentro, cambios mínimos y decisiones trazables.

## Activación

- Etapa de análisis (diseño del cambio) y antes de crear paquetes, capas, puertos o dependencias nuevas.
- Durante el review como checklist arquitectónico.

## Entradas

- Sección de requisitos de `plan.md`.
- `docs/architecture/README.md` (capas y ubicación de código) y `docs/architecture/adr/`.
- Solo el código afectado: localizarlo con búsquedas dirigidas, sin recorrer todo el repositorio.

## Procedimiento

1. Buscar implementaciones existentes relacionadas (entidades, esquemas Zod en `packages/shared`, handlers en `apps/api/src/functions`, componentes) antes de proponer código nuevo.
2. Asignar cada cambio a una capa según `docs/architecture/README.md`:
   - Dominio: entidades, value objects, reglas e invariantes. Sin frameworks, sin I/O.
   - Aplicación: casos de uso y puertos (interfaces) que el dominio necesita del exterior.
   - Infraestructura: adaptadores (persistencia, Google, Azure) que implementan puertos.
   - Presentación: handlers HTTP de Azure Functions y componentes React; solo traducen entrada/salida.
3. Verificar la dirección de dependencias: presentación → aplicación → dominio; infraestructura → aplicación/dominio. Ningún import de `@azure/functions`, React o drivers de base de datos en dominio/aplicación.
4. Definir interfaces solo en límites reales (persistencia, servicios externos, reloj si hay lógica temporal testeable). No crear interfaces con una única implementación trivial sin límite de I/O.
5. Cambios de base de datos: describir esquema, índices, restricciones de unicidad para prevenir reservas duplicadas, migración nueva y compatibilidad. Las migraciones existentes no se editan.
6. Detectar acoplamiento: lógica de negocio en handlers/componentes/repositorios, dependencias circulares entre paquetes, tipos de infraestructura filtrándose al dominio.
7. Si la decisión es significativa (nuevo paquete o capa, nuevo servicio Azure, nuevo patrón transversal, cambio de modelo de datos, costo recurrente), escribir `docs/architecture/adr/NNNN-titulo.md` (contexto, decisión, alternativas, consecuencias) y registrar `node tools/nuvio/cli.mjs decision --kind architecture --text "..."`.
8. Si la decisión implica costo, cambio de stack o riesgo de seguridad/integridad no resoluble con la documentación, consultar al usuario antes de implementar.

## Salidas

Sección `## 2. Arquitectura` de `plan.md`: tabla de componentes afectados (archivo, capa, cambio), flujo de dependencias, cambios de datos/migraciones, puertos nuevos y ADRs.

## Restricciones

- Cambio mínimo que satisfaga la US; sin refactors no relacionados.
- No introducir capas, paquetes o abstracciones que la US no necesite (KISS/YAGNI).
- No cambiar el stack sin aprobación.

## Criterios de finalización

- Cada archivo a tocar tiene capa y justificación.
- No hay dependencias hacia afuera desde el dominio.
- Decisiones significativas registradas.
