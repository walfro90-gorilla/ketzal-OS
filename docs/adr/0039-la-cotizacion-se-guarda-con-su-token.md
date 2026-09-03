# ADR-0039 — La cotización se guarda con su token; el correo liga cuentas solo si está verificado

- **Estado:** aceptada
- **Fecha:** 2026-09-03
- **Migración:** `b091_cotizacion_reclamada_y_correo_verificado`
- **Sustituye a:** ninguno
- **Toca:** `claim_quote` · `link_my_customers` · `link_profile_customers` ·
  `email_verificado` · `delete_my_draft_order` · `create_marketplace_payment_intent` ·
  `submit_spei_payment` · `generate_marketplace_payment_plan` ·
  `puedo_subir_comprobante` · `list_my_marketplace_orders` · `get_my_trip` ·
  `/cotizacion/[token]` · `/entrar` · `/auth/callback` · `/mis-compras`
- **Relacionadas:** [ADR-0012](0012-identidad-unica-profiles-type.md) (una
  persona = un `profiles`), [ADR-0033](0033-el-cliente-se-convierte-sin-perder-nada.md)
  (el viajero no pierde nada al cambiar de tipo),
  [ADR-0027](0027-acceso-por-contrasena-provisional.md) /
  [ADR-0028](0028-la-invitacion-materializa-la-cuenta.md) (no se toca la
  contraseña de quien ya tiene una), [ADR-0006](0006-ledger-append-only-rpc-only.md)
  (escrituras por RPC), b072 (`bookings.channel` inmutable)

## Contexto

El agente registra un prospecto en `customers`, le cotiza (booking con
`quote_token`) y le manda el link por WhatsApp. El prospecto abre
`/cotizacion/<token>` y ahí se acaba: la página es pública, no expira, su único
CTA es aceptar la política de cancelación, y **no hay forma de que esa
cotización viva en una cuenta de viajero**.

La causa es estructural, no de UI. `/mis-compras` (`list_my_marketplace_orders`,
`get_my_trip`) filtra **solo** por `bookings.marketplace_customer_id = auth.uid()`;
una venta del back-office nace con `customer_id` puesto y
`marketplace_customer_id` null. El puente en el otro sentido ya existía
(`create_marketplace_order` espeja al comprador del portal como fila de
`customers`, con dedup por `uq_customers_supplier_marketplace`), y b056 nombraba
el hueco textualmente: *"un cliente dado de alta por un agente puede no tenerlo…
se cierra ligando ese cliente a un perfil"*.

El fundador pidió dos cosas: que Ketzal le **ofrezca la cuenta** al prospecto
cotizado, y que las cuentas se **liguen por correo**, "agregando la confirmación
por correo si es necesario". Es necesario: `customers.email` lo teclea el agente
sin verificar (y en 3 de 6 clientes reales ni existe), y en el proyecto **"Confirm
email" está apagado** — las 8 cuentas de `auth.users` tienen
`email_confirmed_at = created_at` y `confirmation_sent_at` null. Casar por ese
correo, sin más, permite que quien se registre con el correo de otro se lleve su
cotización.

## Decisión

**Dos puertas. El token liga una cotización; el correo, solo verificado, liga
el expediente. Y lo del back-office se ve, no se opera, desde el portal.**

1. **El token es la capability.** `claim_quote(p_token)` (DEFINER,
   `authenticated`): quien tiene el link se lleva **esa** cotización —
   `bookings.marketplace_customer_id = auth.uid()` y, si está libre y no choca
   con el índice único, también `customers.marketplace_customer_id`. Primer
   reclamo gana; un segundo perfil recibe **error explícito**
   (*"ya está guardada en otra cuenta"*), nunca silencio. Idempotente para el
   dueño. Cancelada e inexistente fallan. No se casa por correo ni por teléfono.
   La oferta vive en la propia cotización: sin sesión, el alta de viajero (el
   mismo `RegistroComprador` del checkout, con el nombre prellenado) y al crearla
   se reclama; con sesión, un botón.

2. **El correo liga solo cuando está verificado.** `link_my_customers()`
   (idempotente, lo llama `/mis-compras` al cargar) liga las filas de
   `customers` cuyo correo coincide con el de la cuenta **si y solo si**
   `email_verificado(uid)`: confirmado tras un envío real
   (`confirmation_sent_at` no nulo) o identidad Google con `email_verified`.
   Una cuenta auto-confirmada — Admin API o "Confirm email" apagado — **no
   liga aunque el correo coincida**: falla cerrado. Una fila por agencia (la
   más antigua), case-insensitive, respetando `uq_customers_supplier_marketplace`,
   y arrastra los bookings de cada fila ligada.

3. **Canal `manual` = solo lectura en el portal.** `delete_my_draft_order`,
   `create_marketplace_payment_intent`, `submit_spei_payment`,
   `generate_marketplace_payment_plan` y `puedo_subir_comprobante` exigen
   `channel = 'portal'`. Sin esto, ligar la cotización dejaba al prospecto
   **borrar el draft del agente** o meterle un plan de pagos encima; y pagar en
   línea una venta manual habría metido dinero del portal en una venta que no
   paga corte a Ketzal (b072) y cuya cobranza lleva el agente. La UI esconde
   lo que el RPC rechazaría (`channel` viaja en `list_my_marketplace_orders` y
   `get_my_trip`); el guard vive en BD.

4. **La confirmación por correo queda cableada, no encendida.** `registrarComprador`
   manda `emailRedirectTo = /auth/callback?next=…` (antes el enlace aterrizaba
   en `/` con un `?code=` que nadie canjeaba), y `/auth/callback` acepta
   `token_hash` además de `code`: se verifica en el servidor y no depende del
   navegador donde se pidió el correo — el prospecto se registra en el webview
   de WhatsApp y confirma desde Gmail sin perder la sesión. **Prender "Confirm
   email" y apuntar la plantilla a `{{ .TokenHash }}` es del fundador**
   (dashboard de Auth; pendiente en la bitácora). Hasta entonces la puerta 2
   está inerte por diseño y la puerta 1 funciona completa.

## Consecuencias

- Reclutar la cuenta cuesta lo que ya costaba mandar la cotización: el link es
  el mismo. El prospecto queda con su cotización, su plan de abonos, `/descubre`
  y `/perfil`. El agente ve la cuenta ligada en `/ventas/[id]`
  (`marketplace_customer_id`), y `eliminarViajero` ya bloquea borrar a quien
  tiene ventas ligadas.
- **Riesgo aceptado:** un link reenviado lo reclama el primero que llegue. Queda
  rastro (`marketplace_customer_id`) y conflicto explícito, no silencio. Hoy no
  hay acción de "desligar"; cuando haga falta es un `update` con guard de agencia.
- **Techos conocidos:**
  - El barrido por correo corre cuando el viajero abre `/mis-compras`, no cuando
    el agente captura al cliente. El espejo del crédito en `/cuentas` (b056)
    sigue sin nombrar a un viajero que nunca ha entrado al portal.
  - Dos filas de `customers` de la misma agencia con el mismo correo: se liga la
    más antigua; la duplicada queda huérfana (`ponytail:` en el SQL). El dedup de
    clientes es otro carril.
  - Las cuentas creadas mientras "Confirm email" estuvo apagado (todas las de
    hoy) **nunca** ligan por correo; solo por token. Es la dirección segura.
  - PKCE (`?code=`) sigue fallando entre navegadores distintos; el arreglo es
    la plantilla con `token_hash`, no código.
- `commissions_summary` etiqueta `'marketplace'` por `marketplace_customer_id
  is not null` en líneas de plataforma; como la plataforma solo devenga en
  canal `portal` (b072), una venta manual ligada no entra ahí. Se deja anotado,
  no se toca.

## Alternativas descartadas

- **Casar por correo o teléfono sin verificar.** Es lo que pedía la intuición
  ("vincular por email") y es el hueco: `customers.email` es dato del agente,
  no prueba de identidad, y con "Confirm email" apagado `email_confirmed_at`
  tampoco prueba nada. El predicado `email_verificado` existe para que prender
  la confirmación sea lo que abre la puerta — no un `if` en la app.
- **Derivar en lectura** (un `OR customers.email = mi correo` en cada RPC del
  viajero). Menos escritura, pero el `OR` tendría que vivir en los ~10 RPC que
  hoy filtran por `marketplace_customer_id` (pedido, viaje, pasajeros, asientos,
  voucher, créditos…) y olvidar uno es un hueco. Escribir la columna que todo
  ya usa es el diff más chico.
- **Trigger en `customers` que ligue al capturar.** Cubriría el techo del
  barrido perezoso, pero corre bajo la sesión del agente y necesita leer
  `auth.users`; es la misma función con más superficie. Se agrega cuando el
  espejo de créditos lo pida.
- **Dejar pagable la venta manual desde el portal.** Tentador (ya está la
  tarjeta con SPEI y MP), pero mezcla la cobranza del agente con la del portal,
  y Border ni siquiera está conectada a Mercado Pago. Decisión del fundador:
  solo lectura; abrir el pago es otra decisión.
- **Un segundo correo o cuenta para el prospecto.** Parte a la persona en dos,
  contra ADR-0012.

## Verificación

`supabase/tests/cotizacion_reclamada.sql` (rollback, 24 aserciones; corre con
`pnpm hard-test cotizacion_reclamada`):

- **Token:** anon falla (1); el link liga booking + cliente aunque el correo no
  esté verificado (2); idempotente (3); segundo perfil recibe error y el dueño no
  cambia (4, 4b); cancelada (5) e inexistente (6) fallan; cliente ya de otro
  perfil: se liga el booking, no se roba el cliente (15); índice único: se liga
  el booking, el cliente queda libre (16).
- **Solo lectura:** `list_my_marketplace_orders` y `get_my_trip` devuelven
  `channel='manual'` (7, 8); borrar (9, 9b), MP (10), SPEI antes de la CLABE
  (11), replanear (12) y subir comprobante (13) se rechazan; el pedido del
  portal sigue borrándose y aceptando comprobante (14).
- **Correo:** auto-confirmado no liga aunque coincida (17); verificado liga una
  fila por agencia, en mayúsculas también, arrastra sus ventas y deja fuera la
  duplicada (18); idempotente (19); sus ventas salen y la duplicada no (20);
  identidad Google `email_verified` cuenta (21); otro perfil no ve la
  cotización reclamada (22).
- Guard anti-vacío: `0 casos corrieron` es rojo.
