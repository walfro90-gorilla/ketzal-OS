# ADR-0064 — El vencimiento lo pone el viaje, no el deudor; y no se publica un servicio incompleto

- **Estado:** aceptada
- **Fecha:** 2026-09-09
- **Migración:** `b109_plan_de_abonos_anclado_al_viaje`, `b110_no_publicar_incompleto`
- **Sustituye a:** ninguno (extiende la compuerta de [b076/b077])
- **Toca:** `ketzal.generate_marketplace_payment_plan` · `ketzal.tg_require_complete_to_publish`
  (reemplaza a `tg_require_commission_to_publish`) · `comprar/[serviceId]/pago-bloque.tsx` ·
  `comprar/actions.ts`
- **Relacionadas:** [ADR-0005](0005-dinero-derivado.md) (el dinero se deriva),
  [ADR-0006](0006-ledger-append-only-rpc-only.md) (el guard vive en la BD),
  [ADR-0013](0013-mcp-usuario-real.md) (el MCP opera el OS como usuario real)

## Contexto

El fundador reportó que en la compra en línea el viajero podía **elegir la
fecha límite de su plan de pagos** en un `<input type="date">`. Es el deudor
poniéndole fecha a su propia deuda.

Medido antes de tocar nada (2026-09-09), el reporte resultó ser más angosto y
más interesante de lo que parecía: el campo YA era condicional —solo aparecía
cuando el pedido no tenía `travel_date`— y la fecha ya salía sola en los
servicios con salida. De 7 servicios publicados, 6 tenían salidas. El único sin
**ninguna** fecha (0 salidas, `available_from`/`available_to`/`duration_days`
todos null) era "TEST pago en línea $50", un fixture de las pruebas de cobro.

O sea: el hueco no era "el viajero siempre elige", era "cuando el catálogo está
incompleto, el viajero elige". Eso abre las dos decisiones de este ADR.

## Decisión

### 1. Sin fecha de viaje no hay plan de abonos (b109)

`generate_marketplace_payment_plan` hacía `coalesce(v_travel, p_final_date)`.
Ahora `v_final := v_travel` y punto: si no hay, rebota. Se vende de contado o
se coordina con la agencia.

`p_final_date` **se conserva en la firma y se ignora**. Quitarlo rompería a
cualquier cliente viejo a media publicación, y el parámetro nunca fue legítimo:
ignorarlo devuelve la conducta correcta en vez de un error.

**Se descartó caer a `services.available_to`.** Significa "hasta cuándo se
vende", no cuándo se viaja; anclar ahí un vencimiento de dinero es inventar una
fecha con cara de dato. Además hoy 0 servicios lo tienen lleno, así que el
fallback habría sido código muerto que aparenta cobertura.

**No se tocó `generate_payment_plan`** (el del back-office): ahí el agente sí
fija el plazo con el cliente enfrente, y esa es su facultad. El defecto era del
portal.

### 2. No se publica un servicio incompleto (b110)

Exige nombre, agencia, al menos un precio, destino y foto de portada. **Vive en
la BD, no en el formulario**, porque publicar es un `UPDATE` de una columna y el
MCP lo hace con `ketzal_publicar_servicio` sin pasar por React: un candado en el
cliente no lo detiene (ADR-0013).

**Extiende la compuerta que ya existía** (`tg_require_commission_to_publish`,
b076/b077) en vez de sumar un segundo trigger: dos compuertas sobre la misma
transición se desincronizan, y el operador vería un error a la vez en lugar de
la lista de lo que falta. La función se renombró a `tg_require_complete_to_publish`
porque el nombre viejo mentía en cuanto dejó de ser solo de comisión.

**Qué NO se exige, y por qué:**

- **Salidas.** Vender sin salida es un modo soportado a propósito ("sin salidas,
  el servicio se vende sin tope"). Exigirlas aquí mataría una vía de venta real.
  El plan de abonos sin fecha lo ataja b109, que es donde está el dinero — la
  compuerta protege la vitrina, no la cartera.
- **Descripción.** La tienen los 7 publicados y su ausencia no rompe ninguna
  pantalla. Exigir lo que no duele solo estorba.

**Solo en la transición a publicado**, conservando la semántica de b076: una
fila ya pública no se re-valida. Exigir el invariante en toda fila publicada
dejaría sin poder editar justamente al servicio que hay que completar.
Despublicar siempre se puede.

### 3. El mensaje de la compuerta ahora llega al operador

Los dos `raise` son **P0001** (raise pelón), no `check_violation`. `safeError`
(`src/lib/errors.ts`) solo deja pasar el mensaje cuando el código es P0001; con
23514 el operador recibía "No se pudo completar la acción. Intenta de nuevo."

Esto **arregla un bug que la compuerta de comisión traía desde b076**: llevaba
desde entonces impidiendo publicar sin decir por qué. Un guard que no explica
obliga a adivinar, y adivinar sobre el catálogo público sale caro.

## Consecuencias

- Un servicio sin salidas **se sigue vendiendo**, de contado. No se le quitó
  mercado a nadie; se le quitó al comprador la facultad de fijar su plazo.
- La compuerta **no retro-aplica**: "TEST pago en línea $50" sigue publicado e
  incompleto hasta que alguien lo despublique. Es fixture de pruebas y ya
  cumplió; queda a decisión del fundador.
- El trigger cambió de nombre. Ningún código lo referencia por nombre; el
  snapshot lo recoge en el pase de Rick.

## Verificación

- `supabase/tests/plan_abonos_fecha_viaje.sql` — 6 aserciones: el plan ancla en
  la fecha del viaje; la venta guarda ese vencimiento; **mandar `p_final_date`
  NO lo mueve** (el bug reportado, fijado); sin salida rebota con mensaje
  legible; tampoco cede con fecha del comprador; y el pedido queda **sin**
  calendario de pagos, no a medias.
- `supabase/tests/publicar_completo.sql` — 8 aserciones: publica lo completo;
  rechaza lo incompleto **nombrando lo que falta**; deja la fila en privado;
  el errcode es P0001 (el único que la app no enmascara); rechaza sin precio;
  deja editar una fila ya publicada; y deja despublicar siempre.
- **Probado por mutación**, que es lo que le da valor a lo anterior: al devolver
  el `coalesce(v_travel, p_final_date)` el harness cae con
  *"[5 el comprador se puso su propio vencimiento]"*; al debilitar la compuerta
  a solo-comisión cae con *"[2 publicó un servicio incompleto]"* y
  *"[6 publicó sin precio]"*.
- El harness cazó además un defecto real del trigger recién escrito:
  `text[] || 'literal'` es ambiguo y Postgres lo resuelve por
  `anyarray || anyarray`, reventando con *"malformed array literal"*. El
  `apply` de la migración no lo detecta porque el error es de ejecución.
