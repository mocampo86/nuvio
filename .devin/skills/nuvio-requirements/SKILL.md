---
name: nuvio-requirements
description: Interpreta una User Story de Nuvio, extrae actores, reglas, criterios Given/When/Then verificables, casos límite, ambigüedades y alcance. Usar al analizar cualquier US antes de diseñar o implementar.
---

# nuvio-requirements

## Responsabilidad

Convertir la User Story en requisitos verificables y acotados, sin inventar reglas de negocio.

## Activación

- Etapa de análisis de `/nuvio-us` o `/nuvio-resume`.
- Cuando el usuario pide aclarar o refinar una US.
- Cuando el reviewer reporta un criterio de aceptación incumplido y hay que reinterpretarlo.

## Entradas

- `.nuvio/runs/<runId>/user-story.md` (copia fiel de la US).
- `docs/architecture/domain-invariants.md` (reglas de negocio vigentes).
- Otras US en `docs/user-stories/` solo si la US las referencia o depende de ellas.

## Procedimiento

1. Identificar ID, título, actor principal (cliente, profesional, administrador de peluquería), objetivo y valor.
2. Numerar los criterios de aceptación como `AC-1..n`. Reescribir cada uno en forma Given/When/Then sin cambiar su significado. Si un criterio no es verificable, proponer la versión verificable y marcarla como supuesto.
3. Cruzar la US con `domain-invariants.md`: listar qué invariantes toca (aislamiento por peluquería, intervalos, suma de duraciones, bloqueo por reserva pendiente, cancelación 24 h, concurrencia, etc.). Las invariantes aplican aunque la US no las mencione.
4. Extraer reglas de negocio explícitas y dependencias (otras US, autenticación, datos existentes, integraciones).
5. Enumerar casos límite relevantes. Checklist mínimo: límites exactos de tiempo (p. ej. cancelación a exactamente 24 h), zona horaria, inicio/fin de jornada, intervalo de turnos de la peluquería, servicios múltiples, reservas pendientes, solapamientos, solicitudes concurrentes, datos de otro tenant, entradas inválidas o vacías, permisos por rol.
6. Clasificar cada ambigüedad:
   - **Bloqueante**: cambia comportamiento observable, modelo de datos o seguridad y no se deduce de la documentación → preguntar al usuario con opciones concretas (herramienta de preguntas) y esperar.
   - **No bloqueante**: existe una interpretación conservadora coherente con las invariantes → adoptarla y registrarla: `node tools/nuvio/cli.mjs decision --kind requirements --text "Supuesto: ..."`.
7. Definir el alcance: qué entra y qué queda explícitamente fuera (funcionalidades futuras).
8. Registrar cada criterio: `node tools/nuvio/cli.mjs ac add --id AC-1 --text "Given ... When ... Then ..."`.

## Salidas

Sección `## 1. Requisitos` de `.nuvio/runs/<runId>/plan.md` con: actores, criterios AC-n, invariantes afectadas, reglas, dependencias, casos límite, supuestos, preguntas resueltas y fuera de alcance. Criterios registrados en `state.json`.

## Restricciones

- No asumir reglas que no estén en la US ni en `domain-invariants.md`.
- No ampliar el alcance ni anticipar US futuras.
- No preguntar lo que ya está documentado; agrupar todas las preguntas bloqueantes en una sola consulta.

## Criterios de finalización

- Todo criterio tiene ID, forma Given/When/Then y es verificable con un test.
- No quedan ambigüedades bloqueantes abiertas.
- Alcance y fuera de alcance explícitos.

## Ejemplo

```text
AC-2: Given una peluquería con intervalo de 15 min y un cliente que elige corte (30 min) + barba (20 min)
      When solicita una reserva a las 10:00
      Then la reserva ocupa 10:00–10:50 y el siguiente inicio disponible es 11:00
Invariantes: suma de duraciones, intervalo configurable.
Caso límite: un turno que termina exactamente al cierre de la jornada es válido.
```
