---
name: nuvio-implementation
description: Implementa una User Story de Nuvio siguiendo el plan aprobado, dentro del alcance, respetando capas, validaciones, manejo de errores, migraciones aditivas y documentación. Usar en la etapa de implementación y al aplicar fixes aprobados.
---

# nuvio-implementation

## Responsabilidad

Producir el cambio completo y mínimo que satisface los criterios de aceptación, compatible con el código existente.

## Activación

- Etapa de implementación de `/nuvio-us`.
- Aplicación de fixes aprobados en `/nuvio-fix`.

## Entradas

- `plan.md` (requisitos, arquitectura, plan de tests) y criterios en `state.json`.
- Para fixes: `findings.json` (solo hallazgos con `decision: "approved"` o bloqueantes autorizados).

## Procedimiento

1. Confirmar que se está en la rama de la ejecución (`git branch --show-current`), nunca en `main`.
2. Implementar de adentro hacia afuera: dominio → aplicación → infraestructura → presentación, siguiendo `nuvio-architecture`, `nuvio-clean-code` y, si corresponde, `nuvio-design-patterns`.
3. Validar toda entrada externa en el borde con esquemas Zod (reutilizar o ampliar `packages/shared`). Las invariantes de negocio viven en el dominio, no en el handler.
4. Seguridad desde el diseño: aplicar `nuvio-security` en autenticación, autorización, tenant y datos sensibles.
5. Errores: errores de dominio explícitos; los handlers traducen a códigos HTTP coherentes (400 validación, 401/403 acceso, 404, 409 conflicto de reserva) sin exponer detalles internos.
6. Concurrencia en reservas: la prevención de duplicados se garantiza en la persistencia (restricción única, transacción o control optimista), no solo con una lectura previa.
7. Migraciones: solo archivos nuevos, hacia adelante y compatibles con datos existentes. Editar o eliminar una migración existente requiere aprobación del usuario y `node tools/nuvio/cli.mjs authorize --what migration-edits --reason "..."`.
8. Nuevas dependencias de runtime: preferir lo existente; si es imprescindible, consultar al usuario y usar una versión publicada hace al menos 7 días con rango acotado (`pnpm add`).
9. Actualizar documentación afectada (README, `docs/architecture`, ADR) y guardar la US en `docs/user-stories/` si aún no está versionada.
10. Commitear en pasos lógicos según `nuvio-github`, sin mezclar cambios no relacionados.

## Salidas

Código, tests (vía `nuvio-testing`), migraciones y documentación commiteados en la rama de la US.

## Restricciones

- Sin funcionalidades fuera de alcance ni refactors extensos no relacionados.
- No modificar ni eliminar tests existentes para que pasen; si un test existente contradice la US, consultar al usuario.
- No tocar `.env`, `apps/api/local.settings.json` ni secretos.

## Criterios de finalización

- Todos los criterios tienen implementación y test asociado.
- `node tools/nuvio/cli.mjs validate --mode quick` pasa y el árbol de trabajo está commiteado.
