# ADR-0045 — Un gate de seguridad no vive en un layout: va en el proxy

- **Estado:** aceptada
- **Fecha:** 2026-09-03
- **Migración:** ninguna (app)
- **Sustituye a:** ninguno (no cambia la decisión de
  [ADR-0027](0027-acceso-por-contrasena-provisional.md); cambia **dónde** se
  hace cumplir)
- **Toca:** `src/proxy.ts` (gate nuevo + reuso del `select` de `profiles`) ·
  `src/app/(ops)/layout.tsx` (el `redirect()` se queda como segunda línea) ·
  `supabase/tests/gate_password_provisional.mjs` (6 casos nuevos)
- **Relacionadas:** [ADR-0027](0027-acceso-por-contrasena-provisional.md) y
  [ADR-0028](0028-la-invitacion-materializa-la-cuenta.md) (el gate),
  [ADR-0043](0043-la-frontera-cliente-servidor-no-se-cruza-con-un-helper.md)
  (el 200 que miente), [ADR-0034](0034-la-verificacion-nombra-su-prueba.md)

## Contexto

`gate_password_provisional.mjs` sólo probaba `/embajador` y `/proveedor` — los
dos **fuera** de `(ops)`. El gate del back-office, que es donde se mueve el
dinero, nunca se había medido. Al escribir esos casos apareció por qué importaba.

Con `must_change_password = true` —la cuenta que el gate existe para bloquear—
un GET a `/dashboard` con cabecera `RSC: 1` (lo que manda el navegador al hacer
**clic** desde el menú) devolvía **200** y un flight de **72 KB** que traía:

- el nombre de la agencia,
- nombres reales de clientes,
- once cifras con formato MXN, entre ellas `$20,024.80`.

El `NEXT_REDIRECT` venía dentro del payload, así que el router del cliente sí
navegaba a `/nueva-password` — **pero los datos ya habían viajado**. Se leen
pidiendo el RSC a mano.

La causa: `(ops)` tiene `loading.tsx`, así que la ruta streamea. El
`redirect()` de `(ops)/layout.tsx` lanza en el render del layout, pero la página
de abajo ya empezó a renderizar y su salida se vacía al flight igual.

`/ventas` y `/clientes` **no** filtraban: depende del instante en que se cancela
el stream de cada página. Esa inconsistencia es lo peor del hallazgo, porque
invita a "arreglar `/dashboard`" en vez de mover el gate — y no deja ningún
invariante por página que se pueda razonar.

Exposición al momento de encontrarlo: **cero cuentas con el flag** (medido). La
ventana se abre en cuanto se recluten embajadores con contraseña provisional.
El modelo de amenaza es el de ADR-0027: esa contraseña se dicta por WhatsApp y
se considera comprometida desde que se emite.

## Decisión

**Un gate de seguridad se hace cumplir en `src/proxy.ts`, que corre antes de
renderizar nada. Un `redirect()` dentro de un layout o una página no es un gate
donde hay streaming: puede redirigir y aun así haber entregado los datos.**

El gate de la contraseña provisional se mueve al proxy, para toda superficie
autenticada (no sólo `(ops)`). El `redirect()` del layout se queda como segunda
línea: si algún día el matcher del proxy no cubre una ruta, sigue habiendo algo.

**El flag se CONSULTA a la BD, no se lee del JWT.** El perfil se lee una vez por
petición autenticada no pública y se reusa para el chequeo de rol de las rutas
admin, que antes hacía su propia consulta.

## Alternativas descartadas

- **`must_change_password` en el `app_metadata` del JWT.** No cuesta una
  consulta, pero hay que sincronizarlo en las cuatro altas cada vez que el flag
  se pone o se quita, y un `app_metadata` desincronizado es un gate que miente.
  Este gate existe justamente porque la credencial se considera comprometida:
  no puede depender de que alguien acordara actualizar una copia.
- **Arreglar `/dashboard`** (quitarle el `loading.tsx`, o mover sus datos).
  Trata el síntoma de la página que hoy filtra y deja a las demás dependiendo
  del timing de su propio stream.
- **Dejarlo en el layout y confiar en el `NEXT_REDIRECT`.** Es exactamente el
  verde que miente: el redirect ocurre y los datos salieron igual.

## Consecuencias

- **Una consulta a `profiles` por navegación autenticada** en rutas no públicas.
  El anónimo no la paga (`isPublic` corta antes), y las rutas admin no la pagan
  dos veces: se reusa la misma lectura.
- `/nueva-password` queda excluida explícitamente o el redirect se muerde la
  cola.
- Sin fila en `profiles` no hay redirect (falla abierto en el proxy); el layout
  de `(ops)` sigue mandando a `/mis-compras` en ese caso.

## Verificación

`supabase/tests/gate_password_provisional.mjs` (12 casos; `pnpm hard-test
gate_password`, necesita `supabase` + la app viva). Los seis nuevos, con la
cuenta convertida en agente de una **agencia real** (sin `supplier_id` el layout
la rebotaría por otro motivo y el caso no probaría este gate):

- `'con provisional, /dashboard manda a /nueva-password'` y sus gemelos de
  `/ventas` y `/clientes` — por URL directa, 307 con `Location`.
- `'con provisional, /dashboard por clic (RSC) tampoco entra'` y sus gemelos —
  exigen **307 a `/nueva-password` Y que el cuerpo no traiga contenido del OS**.
  Las dos mitades: un 200 con `NEXT_REDIRECT` adentro también "redirige", y así
  viajaban los 72 KB.
- `'/nueva-password abre para el agente del back-office (200, sin rebote)'` — si
  rebotara, la cuenta quedaría encerrada.
- `'sin el flag, /dashboard entra normal'` — sin este caso los anteriores
  pasarían por la razón equivocada.

**Probado por mutación** (2026-09-03): anular el gate del proxy
(`if (false && perfil?.must_change_password)`) pone en rojo los tres casos RSC y
**reaparece la fuga** — `/dashboard` vuelve a responder 200 con contenido del OS,
mientras `/ventas` y `/clientes` responden 200 sin él, que es la inconsistencia
por timing descrita arriba. Con el gate puesto: 12/12.
