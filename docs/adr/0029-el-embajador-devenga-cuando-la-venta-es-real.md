# ADR-0029 — El embajador devenga cuando la venta es real, no cuando es una cotización

- Estado: aceptada · Fecha: 2026-09-01 · Sustituye: —
- Alcance: `attribute_booking_by_ref`, `set_booking_ambassador`,
  `tg_commission_snapshot`, `trg_commission_snapshot` (b079)

## Contexto

Antes de encender el programa de embajadores se auditó el motor contra la BD
**viva** (el snapshot del repo está desfasado). El embajador era el **único** de
los cuatro beneficiarios que devengaba fuera del molde: plataforma, agencia y
agente nacen en `tg_commission_snapshot` cuando el booking deja de ser borrador;
el embajador nacía dentro de `attribute_booking_by_ref`, que se llama justo
después de crear el pedido — es decir, **en `draft`**.

De esa asimetría salían tres daños, los tres verificados:

**1. Deuda fantasma en el ledger.** `tg_ledger_mirror_commission` postea el
asiento en cuanto nace la línea. Una cotización que nadie paga dejaba
`+embajador / −agencia` vivos para siempre: los drafts no se cancelan, así que
b073 nunca los reversa. El saldo de `/cuentas` divergía del portal del embajador.

**2. Pedido imborrable.** `commission_lines.booking_id` es FK **sin cascade** y
el trigger `no_mutar` prohíbe DELETE sobre `commission_lines`. Entonces
`delete_my_draft_order` (b068) truena con `23503` para **cualquier** draft que
llegó con `?ref`: el comprador no podía borrar su propio pedido. Nunca.

**3. Auto-referido abierto.** El guard de m010 es `b.sold_by = v_amb`, pero
`create_marketplace_order` inserta `sold_by = null` — al comprador del portal lo
identifica `marketplace_customer_id`. Un embajador podía comprar su propio viaje
con su código y pagarse comisión a sí mismo. (ADR-0022 enuncia el principio;
el código implementaba una versión más angosta que solo cubría al agente que
cierra la venta en el back-office.)

## Decisión

**La atribución se separa del devengo.**

- `attribute_booking_by_ref` y `set_booking_ambassador` **validan** y escriben
  `bookings.ambassador_id`. Ya no insertan dinero. Devuelven el id del embajador
  atribuido (antes devolvían el de la `commission_line`; ningún llamador usaba el
  valor).
- `tg_commission_snapshot` gana un **cuarto bloque**, gemelo del de `'agente'`,
  que crea la línea cuando el booking llega a `reserved`/`confirmed`/`paid`. El
  `not exists` lo hace idempotente.
- Los `referral_misses` se reparten según dónde se decide la cosa: los de "no hay
  a quién pagarle" (`codigo_inexistente`, `perfil_inactivo`, `auto_referido`) se
  quedan en la atribución; los de "no hay dinero"
  (`sin_tarifa_de_la_agencia`, `tarifa_da_cero`, `comisiones_exceden_la_venta`) se
  mudan al trigger, con guard para no duplicarse en cada cambio de estado.
- El guard de auto-referido cubre también al comprador del portal:
  `or b.marketplace_customer_id = v_amb`, en las dos funciones.

**El trigger pasa a `AFTER INSERT OR UPDATE OF status, ambassador_id`.** La
palabra `ambassador_id` **no es opcional**: la venta del back-office nace ya en
`reserved`, así que el trigger corre en el INSERT cuando `ambassador_id` todavía
es null, y sin ese `UPDATE OF` el `set_booking_ambassador` posterior no lo
volvería a disparar — esa venta jamás devengaría. El harness lo prueba
explícitamente.

## Alternativas descartadas

- **Dejar el devengo en draft y expirar los drafts** (cancelarlos para que b073
  reverse). Resuelve la deuda fantasma pero no el pedido imborrable ni la
  asimetría, y agrega un proceso de expiración que hoy no existe.
- **Un `if FOUND` que no queme nada**: no aplica aquí; el problema no era un
  update vacío sino el momento del devengo.
- **Poner `ON DELETE CASCADE` en la FK de `commission_lines`**: haría borrable el
  dinero por la puerta de atrás, contra ADR-0006 (append-only con enforcement en
  BD). El pedido imborrable se arregla no creando la línea todavía, no
  aflojando el candado.

## Cómo se prueba sin dejar rastro

`supabase/tests/embajador_devengo.sql` corre 9 aserciones dentro de un `DO` block
que **termina con `raise exception`**. Esa excepción aborta el bloque, así que
Postgres revierte cada insert — incluidas las `commission_lines`, que `no_mutar`
prohíbe **borrar** pero no impide **revertir**. El resultado viaja en el mensaje
de la excepción.

Es feo a propósito: es la única forma de que ningún camino —ni un fallo a media
prueba— deje dinero de mentiras en producción. El precedente del repo
(`carreras_dinero.mjs`) limpiaba con `delete from ketzal.commission_lines`
completo, que era seguro con la BD vacía de 2026-08-19 y **hoy borraría ventas
reales**. `comisiones_motor.sql`, que sí usaba transacción + rollback, lleva sin
poder correr desde b025: siembra `ketzal.marketplace_customers`, tabla eliminada
por el refactor de identidad.

## Lo que esto NO resuelve

- **Un reembolso sin cancelación no reversa la comisión**: `refund_payment` y
  `refund_payment_partial` no tocan `commission_lines`. Una venta 100% devuelta
  que nadie cancela sigue contando como ganancia del embajador. Se resuelve en el
  corte de pago (filtro por pagos netos > 0), no aquí.
- **Sigue sin haber ninguna tarifa de embajador configurada** (`commission_rules`
  tiene cero filas con `payee_type='embajador'`). Con este ADR el motor ya
  devenga bien; sin tarifa, devenga cero. Es captura del fundador.
