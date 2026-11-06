---
name: nuvio-testing
description: Diseña e implementa tests de Nuvio a partir de los criterios de aceptación (unitarios, integración, casos límite, concurrencia), ejecuta validaciones focalizadas y la suite obligatoria, y registra resultados reales como evidencia.
---

# nuvio-testing

## Responsabilidad

Demostrar con tests ejecutados que cada criterio de aceptación se cumple y que no hay regresiones.

## Activación

- Etapas de implementación y testing de `/nuvio-us`, y tras cada fix.
- En review, para detectar tests faltantes.

## Entradas

- Criterios `AC-n` (`node tools/nuvio/cli.mjs ac list`) y casos límite de `plan.md`.
- Tests existentes del paquete afectado (p. ej. `apps/api/test/health.test.ts`) como referencia de estilo.

## Procedimiento

1. Plan de tests en `plan.md` (sección `## 4. Tests`): por cada AC, al menos un test cuyo nombre empiece con el ID: `it('AC-1: blocks the slot while the booking is pending', ...)`.
2. Unitarios (Vitest) para dominio y casos de uso con dobles de los puertos; sin red ni base de datos.
3. Integración para handlers HTTP invocando la función exportada con un request simulado, como en `apps/api/test/health.test.ts`, y para adaptadores de persistencia cuando exista base de datos local.
4. Casos límite de `nuvio-requirements` y caminos de error (validación, 401/403, 404, 409, otro tenant).
5. Concurrencia cuando la US crea o modifica reservas: disparar solicitudes simultáneas (`Promise.all`) por el mismo horario y verificar que exactamente una se confirma.
6. Ejecución focalizada durante el desarrollo: `pnpm --filter <paquete> exec vitest run <archivo>`; validación rápida: `node tools/nuvio/cli.mjs validate --mode quick` (lint, typecheck, tests de paquetes afectados).
7. Antes del review, con todo commiteado: `node tools/nuvio/cli.mjs validate --mode full` (build, lint, typecheck, suite completa, tests de automatización, auditoría de dependencias, secretos, migraciones y tests eliminados/enfocados).
8. Autocorrección: si falla, leer el log indicado, corregir la causa raíz (no el test), commitear y repetir. La herramienta corta tras el máximo configurado (`maxFixAttempts`, por defecto 3) y deja la ejecución en `blocked`: en ese caso informar al usuario con la evidencia del log y detenerse.
9. Registrar evidencia solo de tests que pasaron en la última validación full: `node tools/nuvio/cli.mjs ac set --id AC-1 --status met --evidence "apps/api/test/x.test.ts › AC-1: ..."`. Un criterio sin test que lo pruebe queda `unmet`.

## Salidas

Tests commiteados, `validation.json` con resultados reales y criterios con evidencia.

## Restricciones

- Nunca usar `.only`, ni agregar `.skip` sin justificación registrada; nunca eliminar tests sin autorización (`authorize --what test-removal`, previa aprobación del usuario).
- No reportar resultados que no surjan de `validation.json` o de una ejecución real.

## Criterios de finalización

- Última validación full en verde sobre el commit actual.
- Todos los AC `met` con evidencia trazable.
