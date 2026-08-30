# ADR-0021 — Al embajador lo paga la agencia dueña del viaje, con la tarifa que ella fijó

- Estado: aceptada · Fecha: 2026-08-30 · Sustituye: la premisa de b019
  ("Ketzal paga al embajador")
- Alcance: `commission_rules` (check, policies y resolución), `attribute_booking_by_ref`,
  `set_booking_ambassador`, `ketzal.referral_misses`, alta y acceso en
  `(ops)/comisiones`, portal `/embajador` (m005–m008)

## Contexto
Walfre quiere reclutar embajadores reales que compartan viajes con su código.
Al auditar el flujo antes de arrancar, la BD decía que **nunca se había
ejercido**: 0 embajadores, 0 códigos de referido, 0 ventas atribuidas y — lo
que lo bloqueaba todo — **0 reglas de comisión con `payee_type='embajador'`**.
Se podía reclutar a alguien, que trajera una venta, y no cobraba nada.

b019 modeló al embajador como alguien a quien **Ketzal** paga de su corte, y por
eso dejó sus reglas de comisión como superadmin-only. Con tres agencias reales
operando y la intención de reclutar a volumen, ese supuesto se rompe: el
fundador se vuelve el cuello de botella de cada alta y cada tarifa.

## Decisión

**Cualquier embajador vende viajes de cualquier agencia.** No hay límite de
catálogo. El que trae la venta, cobra. `supplier_id` en el perfil del embajador
dice **quién lo reclutó**, no a qué se limita; un embajador directo de Ketzal lo
lleva en null.

**Paga la agencia dueña del viaje, con LA TARIFA QUE ELLA FIJÓ.** Este es el
punto fino. La primera versión de este ADR ataba la tarifa al embajador
(`scope_profile_id`), una sola y global — y con eso una agencia podía acabar
pagando un 10% que nunca acordó, solo porque el embajador venía con esa tarifa
puesta por otro. Con agencias terceras en el SaaS eso es una factura sorpresa y
un problema contractual. En m008 la tarifa pasa a ser **de la agencia**:

- `(payee_type='embajador', scope_supplier_id=<agencia>)` = lo que esa agencia
  paga a **cualquier** embajador que le traiga venta.
- `(payee_type='embajador', scope_profile_id=<embajador>)` = override para un
  embajador concreto (trato especial), y **gana** sobre la de agencia.

`resolve_commission_rule` recibe ahora la agencia de la venta y resuelve en ese
orden. El mismo embajador cobra distinto según de quién sea el viaje, que es
justo lo que se quería.

**Tarifa híbrida `% + $ por pasajero`**, reusando la basis de b054 en vez de
inventar una nueva.

**Ningún referido falla en silencio.** `attribute_booking_by_ref` devolvía null
sin decir nada: el embajador traía la venta, no cobraba, y no había forma de
saber por qué. Ahora deja rastro en `ketzal.referral_misses` con el motivo
(`sin_tarifa_de_la_agencia`, `codigo_inexistente`, `tarifa_da_cero`,
`comisiones_exceden_la_venta`). Lo lee el superadmin, el admin de la agencia y
**el propio embajador**.

**El correo del embajador es obligatorio.** Antes, si no se capturaba, se
sintetizaba `<uuid>@embajador.ketzal.local`: un dominio que no existe, así que
el magic-link de acceso se generaba contra un buzón inalcanzable y **la cuenta
quedaba muerta sin que nadie se enterara**. Ahora falla en el formulario. El
acceso se entrega con un botón de compartir por WhatsApp con el mensaje ya
redactado, que es como realmente se le manda a alguien que no usa correo.

**El embajador ve su propia tarifa** (m007). m005 dejó que el admin la
gobernara, pero nadie podía leerla del otro lado: el portal decía "tu tarifa
todavía no está configurada" aunque estuviera puesta. Solo la suya:
`scope_profile_id = auth.uid()`.

## Consecuencias
- **Una agencia sin tarifa de embajadores configurada no paga nada**, y sus
  viajes no generan comisión aunque un embajador los traiga. Queda registrado en
  `referral_misses` como `sin_tarifa_de_la_agencia` — es el aviso de que hay
  dinero dejándose de ganar por una casilla vacía.
- El portal del embajador ya no muestra "tu tarifa" sino **la de cada agencia**:
  cuánto gana depende del viaje que traiga. Eso hay que explicarlo al reclutar.
- `resolve_commission_rule` pasó de 3 a 4 argumentos. Se dropeó la firma vieja
  para no dejar una sobrecarga ambigua; los otros 4 llamadores siguen llamando
  con 3 args gracias al default.
- El gate de lectura de `commission_rules` ya tiene seis ramas. Si crece más,
  conviene un helper único en vez de repetir el `or`.

## Verificación
Harness `supabase/tests/embajadores_rls.sql`, con el camino feliz en la misma
pasada que los ataques. Lo que prueba el modelo de m008, verificado en la BD
real: **el mismo embajador de Ketzal cobra 4% + $150 en un viaje de Wanderlust y
$200 por pasajero en uno de Border** — cada agencia paga lo suyo; Wanderlust no
puede fijar la tarifa de Border (rechazado por RLS); un embajador de agencia
también cobra de otra agencia (sin límite); el override por persona gana sobre
la de agencia; una agencia sin tarifa no devenga; y el check rechaza la regla
incoherente que lleve los dos scopes a la vez.

El harness distingue `unique_violation` de las demás excepciones a propósito:
así se coló un falso verde durante el desarrollo, y destapó el bug del índice
que corrigió m006 (solo cabía UN embajador con tarifa en toda la plataforma).
Además, ensayo end-to-end en el navegador entrando como un embajador real — que
fue lo que descubrió m007 (no podía leer su propia tarifa) y el error de
Server→Client Component del tour, que el build no ve.

## Fuentes
m005/m006/m007 (`db/proposed/`), b019 (motor de comisiones), b054 (basis
híbrida), b063 (GRANT EXECUTE en helpers de policy).
