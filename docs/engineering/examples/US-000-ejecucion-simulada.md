# Ejemplo: ejecución simulada (US ficticia, no implementar)

## Entrada del usuario

```text
/nuvio-us
US-001: Crear reserva con múltiples servicios
Como cliente quiero reservar uno o más servicios con un profesional para asegurar mi turno.
AC-1 Given una peluquería con intervalo de 15 min, When elijo corte (30) + barba (20) a las 10:00,
     Then la reserva queda pendiente y ocupa 10:00–10:50.
AC-2 Given una reserva pendiente 10:00–10:50, When otro cliente pide 10:30 con el mismo profesional,
     Then recibe 409 y el horario no se duplica.
```

## Secuencia que ejecuta el agente

```text
node tools/nuvio/cli.mjs init --us US-001 --story-file docs/user-stories/US-001-crear-reserva.md
node tools/nuvio/cli.mjs stage analysis
  (plan.md; ac add AC-1, AC-2; decision --kind requirements "Supuesto: horario en zona de la peluquería")
node tools/nuvio/cli.mjs branch --slug booking-creation        → feat/US-001-booking-creation
  (implementación + tests; commits feat(reservations): ...)
node tools/nuvio/cli.mjs validate --mode quick
node tools/nuvio/cli.mjs validate --mode full                  → FAIL typecheck (autocorrección 1/3) → fix → OK
node tools/nuvio/cli.mjs ac set --id AC-1 --status met --evidence "packages/domain/test/booking.test.ts › AC-1: ..."
node tools/nuvio/cli.mjs review-prepare
  /nuvio-review (subagente)  → JSON
node tools/nuvio/cli.mjs review-save --file .nuvio/runs/<runId>/review/round-1.input.json
```

## Informe al usuario (etapa 8)

```text
| ID      | Severidad | Bloquea | Título                                        |
| REV-001 | High      | Sí      | Doble reserva posible bajo concurrencia       |
| REV-002 | Low       | No      | Nombre ambiguo en helper de duración          |
Informe: .nuvio/runs/US-001-20261106-120000/review-report.md
¿Qué fixes aplico? [Aplicar todos] [Solo bloqueantes] [Rechazar todos] [IDs…]
```

Usuario: `Solo bloqueantes` →

```text
node tools/nuvio/cli.mjs select-fixes --selection blocking     → aprobado REV-001, rechazado REV-002
  (fix + test de concurrencia; commit fix(reservations): address REV-001 ...)
node tools/nuvio/cli.mjs validate --mode full                  → OK
node tools/nuvio/cli.mjs review-prepare ; /nuvio-review ; review-save   → REV-001 fixed → ready-for-pr
node tools/nuvio/cli.mjs pr --title "feat(reservations): implement booking creation [US-001]"
  → PR creado: https://github.com/<owner>/nuvio/pull/<n>   (merge manual)
```

## Verificación local del flujo sin GitHub

`pnpm test:automation` ejecuta `tools/nuvio/test/workflow.test.mjs`, que recorre este ciclo completo en un repositorio Git temporal con remoto local (rama, cambios locales protegidos, límite de autocorrección, detección de secretos, review en dos rondas, selección de fixes, gates y `pr --dry-run`) sin publicar nada.
