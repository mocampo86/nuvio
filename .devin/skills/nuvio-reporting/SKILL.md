---
name: nuvio-reporting
description: Genera los informes Markdown de una ejecución Nuvio (review-report.md, pr-body.md y resumen final) a partir de los datos reales de state.json, validation.json, findings.json, plan.md y el diff.
---

# nuvio-reporting

## Responsabilidad

Documentar de forma fiel y trazable qué se hizo, cómo se validó, qué se encontró y qué decidió el usuario.

## Activación

- Etapa 7 de `/nuvio-us` (después de cada `review-save`): `review-report.md`.
- Etapa 10 (antes de `pr`): `pr-body.md`.
- Al finalizar o bloquearse una ejecución: resumen final para el usuario.

## Entradas

- `.nuvio/runs/<runId>/state.json`, `plan.md`, `validation.json`, `findings.json`, `review/diffstat.txt`.
- Plantillas: `docs/engineering/templates/review-report.md` y `.github/pull_request_template.md`.

## Procedimiento

1. Leer los datos; no recalcular ni reinterpretar resultados de tests: copiar estado, duración y nombre de cada check de `validation.json`.
2. `review-report.md`: completar la plantilla en `.nuvio/runs/<runId>/review-report.md`. Incluir **todos** los hallazgos de `findings.json` con su ID (el gate verifica que figuren), agrupados por severidad, con archivo/ubicación, descripción, evidencia, impacto, fix recomendado, justificación, si bloquea, estado y decisión del usuario.
3. `pr-body.md`: completar todas las secciones `##` de `.github/pull_request_template.md` (el comando `pr` rechaza descripciones incompletas) en `.nuvio/runs/<runId>/pr-body.md`. Referenciar el ID de la US. Los hallazgos rechazados no bloqueantes se listan como "aceptados" con su riesgo.
4. Archivos modificados: tomar la lista de `review/diffstat.txt` (o `git diff --stat <base>...HEAD`).
5. Resumen final al usuario: estado, URL del PR (si existe), tests ejecutados con resultado, hallazgos corregidos/aceptados, riesgos residuales y próximos pasos.

## Salidas

`review-report.md`, `pr-body.md` y el resumen final en el chat.

## Restricciones

- Nunca incluir secretos, tokens, datos personales ni rutas absolutas de la máquina del usuario.
- No declarar como cumplido nada que no tenga evidencia; los resultados fallidos se informan tal cual.
- Concisión: tablas y listas; sin repetir el diff.

## Criterios de finalización

- Los informes contienen todas las secciones de sus plantillas y todos los IDs de hallazgos.
