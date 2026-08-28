# ADR-0010 — Cancelación: política congelada en la venta con evidencia; crédito antes que devolución

- Estado: aceptada · Fecha: 2026-08-04 (b047–b051) · Sustituye: —
- Alcance: `bookings.cancellation_policy`, `credits`, `cancel_booking_v2`, `refund_payment*`

## Contexto
Mercado Pago NO cubre servicios en su Protección al Vendedor: la defensa
anti-contracargo es probar que el cliente aceptó una política. Y una política
que cambia después de la venta no defiende nada.

## Decisión
- La política **se congela en la venta** (snapshot jsonb en
  `bookings.cancellation_policy`, cascada suppliers.info → app_settings) y la
  **aceptación deja evidencia** (`policy_accepted_at/meta`: canal, ip/ua o
  token).
- Pena en efectivo = `max(tramo% × total, enganche)` (tramos 10/25/50/75/100
  por cercanía a la salida, tope el total). `waive` solo con motivo
  (cancelación de la agencia / fuerza mayor, espejo NOM).
- **Modo crédito = pena 0**: se promueve el crédito sobre la devolución. El
  crédito es UNIVERSAL (canjeable en cualquier viaje de Ketzal por la misma
  persona), saldo derivado de `payments.credit_id`, expiración lazy; lo
  aplica el titular o la agencia EMISORA — nunca una agencia ajena.
- Un pago admite UNA devolución ligada (`uq_payments_refund_of`); un abono
  con método `credito` no se devuelve en efectivo.

## Consecuencias
- Defensa documental ante contracargos y PROFECO.
- El crédito retiene el dinero en el ecosistema; la deuda inter-agencias por
  canje cruzado sale derivada del ledger (ADR-0011).
- Costo: cualquier cambio de política solo aplica a ventas nuevas.

## Verificación
`preview_cancellation` vs `cancel_booking_v2` coinciden; hard-tests de
b047–b051; página pública `/politica-cancelacion` refleja la default.

## Fuentes
`docs/PLAN_CANCELACIONES.md` (decisiones cerradas §8),
`docs/POLITICA_CANCELACION.md` (marco legal), b047–b051.
