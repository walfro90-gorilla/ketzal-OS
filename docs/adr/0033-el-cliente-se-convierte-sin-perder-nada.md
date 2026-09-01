# ADR-0033 — El cliente se convierte en embajador sin perder nada

- **Fecha:** 2026-09-01
- **Estado:** aceptada
- **Contexto de código:** b087 · `crearEmbajador` · `(travel)/layout.tsx` ·
  `embajador/layout.tsx` · `components/shell/travel-shell.tsx`
- **Relacionadas:** [ADR-0012](0012-identidad-unica-profiles-type.md) (identidad
  única por `profiles.type`), [ADR-0028](0028-la-invitacion-materializa-la-cuenta.md)
  (no se le toca la contraseña a quien ya tiene una),
  [ADR-0021](0021-embajadores-los-paga-quien-recluta.md)

## Contexto

A quien ya te compró es a quien tiene sentido pedirle que te recomiende. Ese
camino **no existía**: `crearEmbajador` llamaba a `admin.createUser` de una, y un
correo con cuenta reventaba con *"No se pudo crear la cuenta (¿correo ya
registrado?)"*. El reclutador no tenía forma de saber si el problema era ese
correo, otro suyo, o un error de dedo — y no había salida, porque la única
alternativa era pedirle al cliente un segundo correo.

La identidad ya era única (`profiles.type` sobre un solo `auth.users`,
ADR-0012), así que la conversión era un `update`, no una cuenta nueva. Faltaba
usarla.

La segunda mitad del problema es de navegación y estaba escondida: `/` manda a
cada persona a su portal, así que el convertido aterriza siempre en
`/embajador`, y ni ese portal ni el shell del viajero tenían un enlace al otro.
Sus compras seguían ahí — verificado, no supuesto: **los RPC del viajero filtran
por `auth.uid()`, ninguno mira `profiles.type`** — pero no había cómo llegar a
ellas.

## Decisión

**Convertir la cuenta que ya existe, y dejar las dos puertas abiertas.**

1. `crearEmbajador` busca primero por `profiles.email`. Si hay cuenta:
   - **viajero** ⇒ se convierte con un `update` (tipo, código, agencia,
     `recruited_by`). **No se le emite contraseña provisional ni se le marca
     `must_change_password`**: entra con la suya (ADR-0028). La acción devuelve
     `credentials: null` y la UI dice explícitamente que no le manden una nueva.
   - **embajador** ⇒ se rechaza diciendo que ya lo es.
   - **agente** o **proveedor** ⇒ se rechaza. Convertirlos destruye el acceso que
     ya tienen: el agente perdería el back-office, y en un proveedor
     `supplier_id` **es** el proveedor, no quién lo reclutó — sobrescribirlo lo
     desconecta de sus servicios.
2. **El convertido conserva `/mis-compras`, sus créditos y su voucher.** No se
   construyó nada para esto: se verificó que nada lo impide y se puso un harness
   encima para que siga siendo verdad.
3. Cada portal enseña la salida al otro: `/embajador` ofrece "Mis compras"
   **solo si de verdad compró algo**, y el shell del viajero ofrece "Ganancias" a
   quien es embajador (o "Mis servicios" al proveedor).

## Consecuencias

- Reclutar a un cliente es teclear su correo en `/comisiones`. No hay segundo
  correo, ni cuenta duplicada, ni contraseña que reenviar.
- Una persona puede ser cliente y embajador a la vez, que es el caso normal:
  el embajador viaja.
- **Un embajador que nunca compró no ve una pestaña vacía.** El enlace se pinta
  desde el dato, no desde el tipo.
- El auto-referido es más probable que antes — el convertido ya es comprador —
  pero está cerrado desde ADR-0029 por `marketplace_customer_id`, y el harness lo
  ejercita justo sobre este escenario.
- **Techo conocido:** la búsqueda es por `profiles.email`. Hoy no existe ni una
  cuenta de auth sin su fila en profiles (0 de 7, verificado); si algún día
  existiera, no se encontraría y volvería a caer en el error de `createUser`. La
  salida sería un RPC `SECURITY DEFINER` sobre `auth.users`, que no se escribió
  porque hoy no compra nada.
- Sigue sin haber camino **inverso** (embajador → viajero). Nadie lo ha pedido;
  cuando haga falta, es el mismo `update` con el candado de no dejar comisiones
  colgando.

## Alternativas descartadas

- **Crear una segunda cuenta con un correo alterno.** Es lo que el reclutador
  hacía a mano hoy. Parte a la persona en dos: sus compras en una identidad y
  sus ganancias en otra, y ninguna vista las vuelve a juntar. Va justo contra
  ADR-0012.
- **Convertir también a agentes y proveedores.** Un `update` de una línea, pero
  destruye acceso existente sin decírselo a nadie. Si algún día se quiere, es una
  decisión de producto con su propia pantalla de confirmación, no un efecto
  secundario de teclear un correo.
- **Emitirle contraseña provisional al convertido "para uniformar el alta".**
  Le rompe el acceso que ya usa, y su cuenta pasa a tener una contraseña que
  alguien más vio. ADR-0027/0028 existen precisamente para el caso contrario:
  la provisional es para quien **no** tiene ninguna.
- **Enseñar siempre el enlace a "Mis compras".** Una pestaña que casi siempre
  está vacía enseña a ignorarla; el día que sí tenga algo, ya nadie la mira.
