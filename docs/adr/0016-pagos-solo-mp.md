# ADR-0016 — Pagos en línea: solo Mercado Pago; SPEI/efectivo manual con comprobante obligatorio

- Estado: aceptada · Fecha: 2026-07-10 (MP prod) / 2026-08-04 (SPEI manual) · Sustituye: —
- Alcance: `payment_intents`, `confirm_online_payment`, webhook MP, checkout

## Contexto
MP Checkout Pro quedó validado en producción (pago SPEI real end-to-end).
Openpay (BBVA) daría SPEI conciliable sin fee de tarjeta, pero agregar un
segundo procesador duplica webhooks, conciliación y superficie de fallo antes
de tener volumen que lo justifique.

## Decisión
- **Un solo procesador: Mercado Pago.** Nada de scaffolding de Openpay hasta
  decidirlo con datos (el campo `payment_intents.provider` ya existe — el
  cambio futuro no requiere schema).
- **Un solo camino de dinero**: todo cobro en línea o manual confirmado pasa
  por `confirm_online_payment` (+`p_method`), que asienta en el ledger.
- SPEI directo a la CLABE de cada agencia y depósito en efectivo (cajero
  BBVA) son **manuales con comprobante obligatorio** (imagen →
  `receipt_url`), pendientes en `payment_intents`, aprobados por el admin en
  /cobranza.
- **MP Split** cuando la agencia conecta su cuenta OAuth (`mp_accounts`,
  deny-all; tokens JAMÁS en `suppliers.info`): dinero directo al vendedor +
  `marketplace_fee` al cobrar. Sin cuenta conectada: cobro por cuenta de la
  plataforma con payout a 7 días.
- Las devoluciones de MP se ejecutan por la API de MP (vive en la app); el
  MCP las rechaza a propósito (asentar sin mover dinero = mentira contable).

## Consecuencias
- Conciliación y anti-fraude en un solo proveedor; el fee de tarjeta es el
  costo aceptado.
- El comprobante obligatorio + aprobación manual es la defensa contra "ya te
  transferí" falso.

## Verificación
Webhook MP y `confirm_online_payment` son los únicos caminos que insertan
pagos en línea; `payment_intents.provider` = 'mp' en todos los registros.

## Fuentes
CLAUDE.md (pagos, roadmap YAGNI Openpay), b034–b038, b052–b053 (Split),
`docs/OPERACION_VIAJE.md`, memoria `ketzal-pagos-mp-bbva`.
