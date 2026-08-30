# ADR-0021 — Al embajador lo paga la agencia que lo recluta, no Ketzal

- Estado: aceptada · Fecha: 2026-08-30 · Sustituye parcialmente: la premisa de
  b019 ("Ketzal paga al embajador") para embajadores de agencia
- Alcance: `commission_rules` (policies), `ketzal.profiles.supplier_id` de los
  embajadores, alta y acceso en `(ops)/comisiones`, portal `/embajador` (m005–m007)

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

**Quien recluta, paga.** El admin de agencia da de alta a sus embajadores y les
fija la tarifa; esos embajadores son de su agencia y ella los paga. El
superadmin conserva las reglas de plataforma y puede reclutar para cualquier
agencia (eligiéndola explícitamente: no tiene una propia).

**El embajador tiene dueño.** `crearEmbajador` ahora escribe `supplier_id` con
la agencia de quien lo da de alta. Sin dueño no se puede responder "los
embajadores de mi agencia", ni acotarlos por RLS, ni saber quién les paga. La
regla de comisión se ata al embajador (`scope_profile_id`, como exige
`commission_rules_scope_chk`) y la agencia se resuelve mirando ese perfil, vía
el guard `is_admin_de_embajador()` (DEFINER, con GRANT EXECUTE explícito porque
se evalúa dentro de policies — lección de b063).

**Tarifa híbrida `% + $ por pasajero`**, reusando la basis de b054 en vez de
inventar una nueva.

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
- Un embajador pertenece a UNA agencia. Si alguien fuera embajador de dos, hoy
  necesita dos cuentas. No se resuelve ahora porque no existe el caso.
- La premisa de b019 sigue vigente para embajadores de plataforma (los que
  reclute el superadmin sin agencia); lo que cambia es que dejan de ser el
  único tipo posible.
- El gate de lectura de `commission_rules` ya tiene cuatro ramas. Si crece más,
  conviene un helper único en vez de repetir el `or`.

## Verificación
Harness `supabase/tests/embajadores_rls.sql` — **12/12**, con el camino feliz en
la misma pasada que los ataques: el admin dueño fija y edita la tarifa, la
agencia vecina no ve ni el embajador ni su tarifa ni puede editarla, el agente
raso es rechazado por RLS, el embajador ve la suya pero no la de otro y no puede
subírsela, y el motor calcula el híbrido exacto ($10,000 con 3 pax a 4% + $150 =
$850). El harness distingue `unique_violation` de las demás excepciones a
propósito: así se coló un falso verde durante el desarrollo, y destapó el bug
del índice que corrigió m006. Además, ensayo end-to-end en el navegador
entrando como un embajador real — que fue lo que descubrió m007 y el error de
Server→Client Component del tour.

## Fuentes
m005/m006/m007 (`db/proposed/`), b019 (motor de comisiones), b054 (basis
híbrida), b063 (GRANT EXECUTE en helpers de policy).
