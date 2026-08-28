# ADR-0017 — WhatsApp sin API oficial: Baileys en una box + buzón `wa_session` en la BD

- Estado: aceptada · Fecha: 2026-07-23 (motor) / 2026-08-24 (b069 buzón) · Sustituye: —
- Alcance: `wa-sender/`, `ketzal.wa_session`, `wa_optout`, gate `wa_auto_enabled`

## Contexto
La API oficial de WhatsApp Business cuesta y burocratiza; el volumen inicial
son decenas de recordatorios diarios. La box que corre Baileys está detrás de
NAT: la app en Vercel NO puede llamarla.

## Decisión
- Envío por **Baileys + PM2 en una box propia** con número dedicado; la app
  nunca habla con la box directamente.
- **La BD es el buzón bidireccional**: la box publica `state/qr/last_seen_at`
  y lee `command` en `ketzal.wa_session` (fila única; lectura solo
  superadmin, escritura solo `service_role` + RPC `wa_send_command` con lista
  blanca). Nada de túneles ni webhooks entrantes.
- **Gate `wa_auto_enabled` OFF por default**: prenderlo manda WhatsApps
  reales y exige confirmación explícita con conteo. Ventana hábil MX, cap
  diario, blocklist `wa_optout` (STOP/BAJA entrante), claim atómico + jitter.
- Kinds internos (`viaje_manana_operativo`, `pago_sin_recibo`) NUNCA se
  auto-envían — son para el agente, no para el cliente.
- Todo best-effort: sin service key en la box, el bridge opera como antes
  (por logs); sin latido, la UI dice "servidor sin señal".

## Consecuencias
- Riesgo asumido: Baileys es ingeniería inversa — el número puede ser
  baneado; por eso número dedicado y motor diseñado para subir a la API
  oficial sin rehacerse.
- `last_seen_at` es load-bearing: distingue "desconectado" de "box apagada".

## Verificación
Hard-test b069 (privilegios, comando inválido rechazado); gate OFF ⇒ 0
envíos; runbook vivo en `wa-sender/DEPLOY_STATUS.md`.

## Fuentes
b069 (`db/proposed/b069_wa_session.sql`), `docs/OPERACION_VIAJE.md`, memoria
`wa-autosend-status`.
