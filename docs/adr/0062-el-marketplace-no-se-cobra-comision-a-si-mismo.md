# ADR-0062 — El marketplace no se cobra `application_fee` a sí mismo

- Estado: aceptada · Fecha: 2026-09-09 · Sustituye: —
- Alcance: `src/lib/mp-split.ts` (`resolverSplitMp`, `mismaCuentaMp`,
  `platformMpUserId`), pago con Brick (`src/app/comprar/actions.ts`).
- Implementado en: **PR #180** (el guard) + **PR #179** (log del motivo de MP).
- Relacionadas: [ADR-0016](0016-pagos-solo-mp.md) (pagos solo MP),
  [ADR-0019](0019-comision-plataforma-obligatoria-para-publicar.md) (comisión de
  plataforma), split de cobro (b053), [ADR-0006](0006-ledger-append-only-rpc-only.md)
  (registro ≠ custodia), [ADR-0034](0034-la-verificacion-nombra-su-prueba.md).

## Contexto

El split "activado 2026-08-10" (b053: el checkout usa el token del vendedor +
`application_fee` para que Ketzal separe su comisión al cobrar) nunca había
movido dinero real. Al probar el primer pago con tarjeta, MP respondió **HTTP
400 code 2059 — "You cannot use application_fee with this payment"**. El motivo
no llegaba a los logs porque la rama de error en `pagarConBrickMarketplace`
descartaba el cuerpo de MP (corregido en PR #179, que loguea
`status/status_detail/message/cause` — nunca la tarjeta ni el token).

La causa medida: hay **una sola** cuenta MP conectada (Wanderlust,
`mp_user_id 479630144`), y esa cuenta es **la misma** que la dueña del token de
plataforma (`MP_ACCESS_TOKEN`) — todo cuelga del único usuario MP del fundador.
MP no deja separar `application_fee` cuando el cobrador y el marketplace son la
misma cuenta: no puedes cobrarte una comisión a ti mismo.

## Decisión

**`application_fee` solo se manda entre cuentas MP distintas.** `resolverSplitMp`
pide **una vez** el id de cuenta de la plataforma (`GET /users/me` con
`MP_ACCESS_TOKEN`, memoizado por instancia, el token nunca se imprime) y lo
compara con el `mp_user_id` del vendedor vía `mismaCuentaMp`. Si son la misma
cuenta ⇒ **cobro directo con el token de plataforma, sin split ni
`application_fee`**. Si son distintas ⇒ split con comisión, sin cambios.

**Esto NO toca el devengo de la comisión** (ADR-0019): el motor sigue posteando
la comisión de Ketzal en el ledger aunque MP no la separe al cobrar — el dinero
ya cayó en el mismo bolsillo, y *registro ≠ custodia* (ADR-0006). Lo único que
cambia es la **separación en MP al momento del cargo**, que en un self-sale es
imposible y además redundante.

## Verificación

- `src/lib/mp-split.test.ts` — asserts sobre `mismaCuentaMp` (misma cuenta con
  tipos distintos ⇒ `true`; distintas o `null` ⇒ `false`), que es el punto de
  decisión que apaga `application_fee`.
- En vivo (2026-09-09): `payment_intents` recibió su **primera** fila `approved`
  — booking `7ed11e89-430f-49aa-8672-4e6e13004af7`, $50.00, **`split=false`**,
  `mp_payment_id 178047162986`; cero `[pago MP] creación falló` tras el fix.

## Alternativas descartadas

- **Reintentar sin `application_fee` al ver 2059:** perdería la comisión en
  silencio si el 2059 llegara por otra causa en una venta de cuenta ajena.
  El guard por identidad de cuenta es explícito.
- **Guardar el id de plataforma en `app_settings`:** otra fuente de verdad que
  envejece si se rota el token; `/users/me` es la autoridad y se memoiza.

## Pendiente

El camino de `application_fee`/split real **sigue sin probarse**: hoy el caso del
fundador cae en cobro directo. Requiere conectar una agencia con una cuenta MP
**distinta** de la marketplace.
