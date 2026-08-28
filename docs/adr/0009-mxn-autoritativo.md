# ADR-0009 — MXN es la moneda autoritativa; USD solo se anota y se deriva

- Estado: aceptada · Fecha: 2026-07-22 (F6) · Sustituye: —
- Alcance: `bookings.currency/exchange_rate`, todos los documentos públicos, reportes

## Contexto
Vender en USD con TC manual era necesario (frontera), pero un motor
bi-moneda duplica cada invariante de dinero. Una venta USD mal etiquetada ya
mostró montos MXN con símbolo USD en documentos.

## Decisión
- El motor es **100% MXN**: al vender en USD, el FORM convierte con el TC
  manual y manda MXN al RPC de venta existente. `create_booking_with_items`
  no sabe de divisas.
- La venta solo ANOTA `currency='USD'` + `exchange_rate` (CHECK: USD ⇒ TC
  not null y >0; MXN ⇒ TC null). El USD mostrado se deriva (mxn/tc).
- Payments, reportes, cobranza, invariantes: todo MXN, siempre. Documentos
  públicos muestran MXN + nota "pactada en USD al TC $X" cuando aplica.
- Si el TC ya tiene abonos COMPLETED, no se cambia (`set_booking_currency`
  lo bloquea).

## Consecuencias
- Un solo camino de dinero que auditar; la conversión vive en el borde (UI).
- No hay revaluación cambiaria — el TC se congela al pactar. Si algún día se
  necesita multi-divisa real, es ADR nuevo.

## Verificación
CHECK `bookings_currency_rate_chk` en la BD; tests de `domain/currency.ts`
(round2/toMxn/toUsd); documentos públicos vía `get_public_doc_currency`.

## Fuentes
F6 (`014_currency_usd.sql`, `016` nota en documentos), CLAUDE.md F6,
`src/lib/domain/currency.ts`.
