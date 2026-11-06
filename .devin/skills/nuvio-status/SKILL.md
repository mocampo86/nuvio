---
name: nuvio-status
description: Muestra el estado de la ejecución Nuvio activa (o de todas) - etapa, rama, criterios, validación, hallazgos, PR y siguiente acción. Solo lectura.
argument-hint: "[runId | todas]"
triggers:
  - user
  - model
allowed-tools:
  - read
  - exec
---

# /nuvio-status — Estado de ejecuciones

## Responsabilidad

Informar el estado real de las ejecuciones sin modificar nada.

## Activación

El usuario ejecuta `/nuvio-status`, o el agente necesita conocer el estado antes de continuar.

## Entradas

- Argumento opcional: `runId` o `todas`.

## Procedimiento

1. Con `todas`: `node tools/nuvio/cli.mjs list`.
2. Si no: `node tools/nuvio/cli.mjs status [--run <runId>]`.
3. Si hay hallazgos: `node tools/nuvio/cli.mjs findings`.
4. Resumir en pocas líneas: etapa, motivo de bloqueo si existe, criterios cumplidos, última validación, hallazgos pendientes, URL del PR y siguiente acción sugerida (comando a ejecutar).

## Salidas

Resumen de estado en el chat.

## Restricciones

- Solo lectura: no cambiar etapas, archivos ni ramas.

## Criterios de finalización

- El usuario conoce el estado y el siguiente paso.
