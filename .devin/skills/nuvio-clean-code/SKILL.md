---
name: nuvio-clean-code
description: Aplica Clean Code, SOLID pragmático y DRY con las convenciones reales de Nuvio (TypeScript estricto, ESM, Prettier, ESLint). Usar al escribir o revisar código para detectar duplicación, complejidad y malos nombres sin sobreingeniería.
---

# nuvio-clean-code

## Responsabilidad

Que el código sea legible, cohesivo y consistente con el repositorio, sin abstracciones innecesarias.

## Activación

- Mientras se implementa (antes de cada commit).
- Durante el review como checklist de calidad.

## Entradas

- Archivos a crear o modificar y sus vecinos inmediatos (para copiar convenciones).
- `.prettierrc.json`, `eslint.config.mjs`, `tsconfig.base.json`.

## Procedimiento

1. Convenciones del repositorio: TypeScript `strict`, ESM con imports relativos terminados en `.js` (NodeNext), comillas simples, sin trailing commas, ancho 100, nombres en inglés, `_` como prefijo para parámetros no usados.
2. DRY antes de escribir: buscar funciones, esquemas Zod y componentes existentes que resuelvan lo mismo. Reutilizar; extraer solo cuando la regla de negocio se duplicaría (no por similitudes sintácticas pequeñas).
3. Nombres que expresen intención de dominio (`bookingEnd`, `isSlotAvailable`), sin abreviaturas ambiguas.
4. Funciones pequeñas con una responsabilidad; separar cálculo puro de efectos (I/O, reloj, aleatoriedad).
5. Errores explícitos: errores de dominio tipados o resultados discriminados; nunca tragar excepciones; mapear a HTTP solo en presentación.
6. Tipos: evitar `any` y aserciones innecesarias; validar entrada externa con Zod en el borde y trabajar con tipos inferidos.
7. Eliminar código muerto, logs de depuración y comentarios que repiten el código. Comentar solo el "por qué" no evidente.
8. SOLID con criterio: SRP y DIP en límites de I/O; no crear jerarquías ni interfaces especulativas.

## Salidas

Código que pasa `pnpm lint` y `pnpm typecheck` y respeta los puntos anteriores. En review: hallazgos de categoría `maintainability` o `duplication` con evidencia.

## Restricciones

- No reformatear ni renombrar código fuera del alcance de la US.
- No desactivar reglas de lint ni usar `eslint-disable` / `@ts-ignore` sin justificación registrada.

## Criterios de finalización

- Sin duplicación de reglas de negocio, sin código muerto, sin `any` injustificado.
- Lint y typecheck en verde.
