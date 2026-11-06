---
name: nuvio-review
description: Code review independiente de solo lectura (subagente nuvio-reviewer) del cambio de la ejecución Nuvio activa contra la US, el plan, los resultados reales de validación y el diff completo. Devuelve hallazgos JSON clasificados por severidad; quien lo invoca los guarda con "node tools/nuvio/cli.mjs review-save".
argument-hint: "[runId opcional]"
agent: nuvio-reviewer
triggers:
  - user
  - model
---

# nuvio-review

## Responsabilidad

Revisar de forma independiente y sin modificar código: bugs, criterios de aceptación, arquitectura, duplicación, seguridad, concurrencia y tests faltantes.

## Activación

- Etapa 6 de `/nuvio-us` (después de `node tools/nuvio/cli.mjs review-prepare`).
- Invocación manual `/nuvio-review` con un paquete de review preparado.

## Entradas

1. Leer `.nuvio/current-run` para obtener el `runId` (o usar el argumento recibido). Directorio: `.nuvio/runs/<runId>/`.
2. Leer `review/context.md` y, en el orden indicado allí: `user-story.md`, `plan.md`, `state.json`, `validation.json`, `review/diffstat.txt`, `review/diff.patch` y `findings.json` (rondas anteriores, si existe).
3. Leer completos los archivos modificados listados en el diff y lo necesario a su alrededor.
4. Checklists de referencia (leerlos como archivos): `.devin/skills/nuvio-security/SKILL.md`, `.devin/skills/nuvio-architecture/SKILL.md`, `.devin/skills/nuvio-clean-code/SKILL.md`, `.devin/skills/nuvio-testing/SKILL.md` y `docs/architecture/domain-invariants.md`.

## Procedimiento

1. Para cada criterio `AC-n`: verificar en el código y en los tests que se cumple. Un criterio sin implementación o sin test que lo pruebe es un hallazgo `acceptance`.
2. Verificar en `validation.json` que la validación es `full`, `passed: true` y corresponde al commit revisado. Cualquier fallo o warning relevante (`.skip`, migración autorizada) se analiza.
3. Revisar el diff completo: bugs y casos límite, invariantes de dominio, concurrencia y reservas duplicadas, aislamiento entre tenants, autenticación/autorización, validación de entradas, manejo de errores, dirección de dependencias y lógica en capas incorrectas, duplicación, complejidad, cambios fuera de alcance, migraciones, documentación desactualizada.
4. Rondas posteriores: para cada hallazgo previo, verificar en el código si quedó corregido (`status: "fixed"`) o sigue abierto (`"open"`), conservando su ID. Los hallazgos nuevos continúan la numeración (`REV-` + máximo previo + 1). No reabrir hallazgos rechazados por el usuario salvo que el cambio los haya agravado.
5. Severidad: Critical (pérdida/filtración de datos, acceso entre tenants, corrupción, US inutilizable), High (bug funcional o de seguridad con impacto real, criterio incumplido), Medium (riesgo acotado, test faltante relevante, deuda que complica la próxima US), Low (mejora menor).
6. `blocking: true` cuando impide aprobar el PR. La herramienta fuerza como bloqueantes: Critical; categorías `acceptance` y `tenant-isolation`; `security`, `authorization`, `data-integrity` y `concurrency` con severidad High.

## Salidas

Responder **solo** con este JSON (sin texto adicional ni bloque de código):

```json
{
  "summary": "Resumen de 2-4 frases del estado del cambio.",
  "acceptance": [{ "id": "AC-1", "verdict": "met|unmet", "evidence": "archivo › test" }],
  "findings": [
    {
      "id": "REV-001",
      "severity": "Critical|High|Medium|Low",
      "category": "acceptance|bug|security|authorization|tenant-isolation|data-integrity|concurrency|architecture|duplication|tests|scope|performance|maintainability|documentation",
      "file": "apps/api/src/functions/bookings.ts",
      "location": "L42-L57",
      "title": "Título corto",
      "description": "Qué está mal.",
      "evidence": "Cita o referencia concreta del código o del resultado de validación.",
      "impact": "Consecuencia para usuarios, datos o mantenimiento.",
      "recommendedFix": "Cambio concreto propuesto.",
      "rationale": "Por qué este fix es el adecuado.",
      "blocking": true,
      "status": "open|fixed"
    }
  ]
}
```

## Restricciones

- No modificar archivos ni ejecutar comandos (perfil de solo lectura).
- No basarse en resúmenes del implementador: toda conclusión debe tener evidencia en el código, los tests o `validation.json`.
- Sin hallazgos de estilo que no impacten legibilidad o convenciones del repositorio. Sin duplicar el mismo problema en varios IDs.

## Criterios de finalización

- Todos los AC evaluados, todos los hallazgos previos reverificados y JSON válido con todos los campos obligatorios.
