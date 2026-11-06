---
name: nuvio-security
description: Checklist de seguridad de Nuvio (autenticación Google, autorización por rol, aislamiento entre peluquerías, validación de entradas, datos personales, secretos, dependencias y configuración Azure). Usar al diseñar, implementar y revisar cualquier cambio.
---

# nuvio-security

## Responsabilidad

Detectar y prevenir vulnerabilidades relevantes, con foco en el aislamiento multi-tenant y la protección de datos de clientes.

## Activación

- Análisis (sección de seguridad del plan), implementación de endpoints, persistencia o integraciones, y siempre en el review.

## Entradas

- `plan.md`, diff y archivos modificados, `validation.json` (chequeo `secret-scan` y `dependency-audit`).

## Procedimiento

Revisar cada punto que aplique al cambio:

1. **Autenticación**: administradores y profesionales con Google. El ID token se verifica en servidor (firma, `aud`, `iss`, expiración); nunca confiar en claims enviados por el cliente. Endpoints `authLevel: 'anonymous'` solo si son públicos por diseño (p. ej. health, reservas de clientes) y justificados.
2. **Autorización**: denegar por defecto; verificar rol y pertenencia a la peluquería en cada caso de uso, no solo en la UI.
3. **Aislamiento entre tenants**: el identificador de peluquería se deriva del principal autenticado o del recurso validado, nunca de un parámetro libre; toda consulta de repositorio filtra por tenant; existe un test que intenta acceder a datos de otra peluquería y falla.
4. **Validación de entrada**: esquemas Zod en el borde con límites de longitud y formato; fechas en ISO 8601 con zona explícita; rechazar campos desconocidos cuando corresponda.
5. **Datos sensibles**: minimizar datos personales (nombre, teléfono, email); no loguearlos ni devolverlos a quien no corresponde; errores sin stack traces ni detalles internos.
6. **Secretos**: solo en configuración de Azure (App Settings / Key Vault) o archivos locales ignorados; nunca en código, tests, fixtures ni logs. El gate `secret-scan` debe estar en verde.
7. **Inyección y XSS**: consultas parametrizadas; nada de `dangerouslySetInnerHTML` con datos de usuario.
8. **Abuso**: endpoints públicos de reserva con límites razonables y protección ante creación masiva; idempotencia en operaciones repetibles.
9. **Integraciones Google**: scopes mínimos (exportación a Calendar únicamente de eventos); tokens de refresco cifrados y por profesional.
10. **Dependencias y configuración**: sin vulnerabilidades críticas (`dependency-audit`), sin CORS `*` con credenciales, sin modos debug en producción.

Severidad: **Critical** = explotable y afecta datos de otros tenants, credenciales o integridad; **High** = falla de control de acceso o validación con impacto real; **Medium** = defensa en profundidad ausente; **Low** = endurecimiento menor.

## Salidas

- En análisis: sección `## 5. Seguridad` de `plan.md` con riesgos y controles.
- En review: hallazgos categoría `security`, `authorization` o `tenant-isolation` con evidencia.
- Decisiones relevantes: `node tools/nuvio/cli.mjs decision --kind security --text "..."`.

## Restricciones

- Nunca mostrar el valor de un secreto detectado; referenciar archivo y línea.
- Un problema crítico de seguridad o de aislamiento no puede aceptarse como riesgo para habilitar el PR.

## Criterios de finalización

- Todos los puntos aplicables verificados con evidencia; sin hallazgos de seguridad bloqueantes abiertos.
