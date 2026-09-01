# ADR-0032 — El corte de comisiones es derivado, acumulativo, y solo paga lo cobrado

- Estado: aceptada · Fecha: 2026-09-01 · Sustituye: —
- Complementa: [ADR-0029](0029-el-embajador-devenga-cuando-la-venta-es-real.md),
  [ADR-0030](0030-un-solo-riel-de-pago-a-personas.md)
- Alcance: `corte_embajadores`, `pagar_corte_embajador`,
  `my_ambassador_payments`, `/comisiones` (b086)

## Contexto

El motor ya devengaba bien (ADR-0029) y ya había un solo riel para pagar
(ADR-0030), pero **no existía el proceso**: nadie sabía a quién le debía cuánto
en una fecha, ni había forma de registrar el pago de una persona desde la app.

El fundador decidió corte **quincenal: día 15 y último del mes**.

## Decisión

**El corte no es una tabla, es una resta a una fecha**: lo devengado hasta el día
X menos lo ya pagado hasta el día X. Las dos mitades ya viven en
`commission_lines` y `expenses`, así que el corte se **deriva** (ADR-0005).

La consecuencia que más importa: **es acumulativo y auto-corregible**. Si se
salta una quincena, la siguiente trae lo pendiente sin que nadie tenga que
acordarse, y no existe un "periodo" que pueda quedar mal cerrado o cerrado dos
veces. La fecha es solo un corte de lectura.

**Solo se paga comisión de ventas con dinero cobrado.** `refund_payment` y
`refund_payment_partial` no reversan la comisión: una venta 100% devuelta que
nadie canceló sigue devengada — ADR-0029 dejó ese hueco abierto a propósito
porque el lugar correcto para cerrarlo es aquí. El corte filtra por
`bookings_with_balance.paid > 0`, que ya descuenta los reembolsos. **Si la
agencia no tiene el dinero, no hay de dónde pagar la comisión.**

**El corte agrupa por (embajador, agencia)**, no solo por persona: ADR-0021 dice
que paga la agencia dueña del viaje, así que un embajador con ventas en dos
agencias tiene dos deudas y cada una la salda su agencia con su propio gasto. El
**bono por reclutar** (b085) va en su propia fila, sin agencia, porque lo paga
Ketzal.

**El guard del monto vive en la BD**, contra el mismo corte que se pinta en
pantalla. Pagar de más dejaría el saldo del embajador en negativo sin que nadie
se entere hasta que él reclame; el RPC lo rechaza diciendo cuánto se debe.

## Lo que esto NO resuelve, a propósito

**El bono queda fuera del ledger.** El ledger espeja hechos (ADR-0011) y el bono
no es una fila sino una derivación: no hay devengo que espejar, así que tampoco
se espeja su pago (`tg_ledger_mirror_expense` ignora los gastos sin agencia). El
ledger cubre comisiones; el bono vive en el portal y en CxP.

Es el precio de haber derivado el bono, que se eligió por cuatro razones más
fuertes (ADR/b085). Queda escrito para que nadie lo lea como un descuento
faltante en `/cuentas`.

## Verificación

`supabase/tests/corte_embajadores.sql` — **8/8**, dentro de una transacción que
revierte. Incluye el caso que motivó el filtro: tres ventas que devengan $900,
una sin cobrar y otra reembolsada completa sin cancelar, y el corte paga **$300**.
