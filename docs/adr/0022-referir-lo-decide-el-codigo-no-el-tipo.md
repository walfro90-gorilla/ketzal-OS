# ADR-0022 — Quién cobra por referir lo decide el código, no `profiles.type`

- Estado: aceptada · Fecha: 2026-08-30 · Complementa: [ADR-0021](0021-embajadores-los-paga-quien-recluta.md)
- Alcance: `attribute_booking_by_ref`, `my_ambassador_earnings`,
  `ketzal.set_referral_code` (nueva), `list_agents_for_commission`,
  `(ops)/comisiones`, `src/lib/domain/embajador.ts` (m010)

## Contexto

Al revisar los cuatro valores de `profiles.type` con el fundador salió que el
enum estaba haciendo **dos trabajos a la vez**:

1. **Dónde entras.** `(ops)/layout.tsx` rebota al embajador a `/embajador`, al
   viajero a `/mis-compras` y al proveedor a `/proveedor`. Es una frontera de
   acceso a datos: el agente ve la cartera de la agencia, el embajador no ve ni
   un cliente. Esa frontera es correcta y no se toca.
2. **Si cobras por referir.** `attribute_booking_by_ref` resolvía el código con
   `where referral_code = v_code and type = 'embajador'`.

Como `type` es un solo valor, las dos cosas quedaban amarradas, y de ahí dos
agujeros medidos en la BD real:

- Un **agente de mostrador** que comparte el link del marketplace no cobra nada.
  Su código no resuelve, la venta cae en `referral_misses` como
  `codigo_inexistente` y nadie se entera. La recomendación se pierde.
- **Nadie puede ser las dos cosas.** Cuando quien opera el mostrador también
  promueve en su Instagram, hay que elegir: o vende, o cobra por referir.

## Decisión

**El acceso lo sigue decidiendo `type`. El cobro por referir lo decide tener
`referral_code` + tarifa.**

- `attribute_booking_by_ref` resuelve códigos de `type in ('embajador','agente')`.
- **La línea emitida sigue siendo `payee_type='embajador'`**, aunque quien
  refirió sea un agente. Referir es una actividad, no un oficio: así la tarifa
  por agencia de ADR-0021, el espejo en el ledger (ADR-0011), el portal y los
  reportes siguen funcionando sin tocarse. Un agente que refiere cobra la tarifa
  de embajadores **de la agencia dueña del viaje**, no su tarifa de agente.
- El código lo asigna el admin de la agencia (o el superadmin) por RPC
  `set_referral_code` — `profiles` es RPC-only-write (ADR-0006).

## El auto-referido se bloquea

Abrir esto crea un abuso obvio: el agente se pasa su propio link, cierra él
mismo la venta y cobra **dos veces** — su línea de `agente` por `sold_by` más la
de `embajador` por `ambassador_id`.

Si `sold_by = ambassador_id`, no se paga la de referido y se escribe un miss
`auto_referido`. Se registra en vez de descartarse en silencio, pero se marca
**no accionable**: el motor hizo justo lo que debía y no hay nada que arreglar.
Cerrar la venta ya se le paga; referírsela a sí mismo no agrega nada.

## Alternativas descartadas

- **Un `type` nuevo (`agente_embajador`)**: multiplica los casos de cada guard
  de acceso para expresar algo que no es una posición, es una actividad.
- **`profiles.type` como arreglo**: toca todos los guards del OS y la RLS, para
  un problema que se resuelve con una columna que ya existe.
- **Pagarle su tarifa de agente al referir**: la venta del marketplace la cierra
  el viajero solo. Pagar la tarifa de "cerrar una venta" a quien no la cerró
  confunde dos trabajos distintos y rompe la comparación entre embajadores.
- **Permitir el auto-referido**: convierte la tarifa de embajador en un bono
  silencioso sobre las ventas propias, que nadie decidió dar.

## Consecuencias

- Un agente puede recomendar y cobrar sin dejar de vender en el mostrador.
- La agencia paga esas ventas con su tarifa de embajadores — si no la tiene
  configurada, siguen cayendo en `referral_misses` como `sin_tarifa_de_la_agencia`.
- `referral_misses` gana dos razones: `auto_referido` y `perfil_inactivo` (el
  código de alguien dado de baja deja de pagar, con su propio motivo en vez de
  disfrazarse de código mal escrito).
- `list_agents_for_commission` devuelve una columna más (`referral_code`).
- `profiles.type='proveedor'` queda como estaba: sin uso (0 filas). Registrar
  prestadores locales (tirolesa, motos, caballos) es `suppliers` + costo en el
  add-on, no un tipo de usuario. Ver el pendiente en `docs/ROADMAP.md`.
