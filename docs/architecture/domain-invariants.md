# Invariantes de dominio de Nuvio

Decisiones de negocio vigentes. Toda US debe preservarlas aunque no las mencione. No asumir reglas adicionales sin documentarlas aquí (o en la US) con aprobación del usuario.

| ID | Invariante |
|---|---|
| INV-01 | Multi-tenant: el sistema contempla múltiples peluquerías y los datos de cada una permanecen aislados. |
| INV-02 | Cada peluquería configura el intervalo de inicio de sus turnos. |
| INV-03 | Un cliente puede reservar varios servicios en una misma reserva. |
| INV-04 | La duración de una reserva es la suma de las duraciones de sus servicios. |
| INV-05 | Una reserva pendiente de aprobación bloquea el horario correspondiente. |
| INV-06 | La política de cancelación es de 24 horas. |
| INV-07 | Administradores y profesionales pueden iniciar sesión con Google, a través de Microsoft Entra External ID como plataforma de identidad con Google como proveedor federado. |
| INV-08 | La integración inicial con Google Calendar solamente exporta reservas (no importa ni sincroniza en ambos sentidos). |
| INV-09 | La disponibilidad considera profesionales, servicios, horarios y reservas existentes. |
| INV-10 | Se previenen reservas duplicadas y condiciones de carrera (garantía en la persistencia, no solo en la lógica de aplicación). |

## Preguntas abiertas (resolver en la US que las necesite)

- INV-06: si el límite de 24 h es inclusivo, en qué zona horaria se evalúa y si aplica también a la peluquería.
- INV-05: tiempo máximo que una reserva puede permanecer pendiente antes de liberar el horario.
