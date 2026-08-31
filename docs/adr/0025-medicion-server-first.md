# ADR-0025 — Medición server-first: conversiones desde donde se confirma el dinero, pixel solo para audiencias

- Estado: aceptada · Fecha: 2026-08-31 · Sustituye: —
- Alcance: `src/lib/marketing/*`, `/api/track`, `/api/mp/webhook`,
  `crearPedido`/`pagarConBrickMarketplace`/`resolverSpei`,
  `bookings.attribution`, `ketzal.funnel_events`
- Origen: port del stack probado en vivo en estampida (ADR-17 de ese repo,
  transferido en `docs/MARKETING_STACK_HUELLA.md`)

## Contexto

Para vender el marketplace con ads (Meta + Google) hacen falta dos cosas que
Ketzal no tenía: reportar conversiones a las plataformas (sin eso no optimizan
ni miden ROAS) y acumular audiencias de remarketing. La audiencia real vive en
móvil y webviews (Messenger, Instagram) — comprobado con tráfico real en
estampida — donde los scripts de tracking del cliente mueren por adblockers o
restricciones del webview. Además el pago en Ketzal puede confirmarse días
después de la visita (SPEI con comprobante, plan de pagos): ninguna página del
navegador ve ese momento.

## Decisión

**La fuente de verdad de una conversión es el servidor, no el navegador.**

1. **`Purchase` sale de los caminos que confirman dinero** — todos convergen en
   `confirm_online_payment`: el webhook de MP, la confirmación inline del
   Payment Brick y el approve de SPEI/efectivo en Cobranza. Un helper único
   (`sendPurchaseEvents(bookingId)`) envía a Meta Conversions API y GA4
   Measurement Protocol. Solo pedidos del marketplace
   (`marketplace_customer_id` presente) y solo en el **primer** abono
   confirmado de la venta: la conversión es la venta, no cada abono del plan
   de pagos. `event_id` (Meta) y `transaction_id` (GA4) = `booking_id` —
   dedupe y reintentos idempotentes gratis.
2. **`InitiateCheckout`/`begin_checkout` al crear el pedido**, vía `after()`
   de `next/server` — cero latencia añadida al comprador.
3. **El pixel de Meta en el cliente manda SOLO `PageView`** (y solo en la
   superficie pública del marketplace, no en el back-office): construye
   públicos de remarketing por URL y planta las cookies `_fbp`/`_fbc`. Sin
   `Purchase` en el cliente no hay dedupe que coordinar.
4. **Captura al crear el pedido** — el único momento en que el navegador del
   comprador habla con nuestro servidor: IP (primer valor de
   `x-forwarded-for`), user-agent, cookies `_fbp`/`_fbc` (validadas con
   `^fb\.1\.\d+\.[\w.-]+$`) + la atribución first-touch que el cliente
   persistió en localStorage (~30 días): `utm_*`, `fbclid`, `gclid`, landing.
   Todo viaja en `bookings.attribution` (jsonb, escrito por service role
   acotado al pedido del comprador) hacia el `user_data` del CAPI.
5. **`user_data` mínimo obligatorio**: `external_id = sha256(booking_id)`.
   Meta RECHAZA eventos sin ningún customer information parameter (error
   2804050 — mordió en producción en estampida). **Sin email/teléfono
   hasheado** hasta que el aviso de privacidad lo cubra (decisión abierta,
   dueño: Wal).
6. **Env-gated total, nunca lanza**: sin
   `NEXT_PUBLIC_META_PIXEL_ID`/`META_CAPI_TOKEN`/`NEXT_PUBLIC_GA_ID`/`GA4_API_SECRET`
   es no-op silencioso. `Promise.allSettled`, timeout 3s por request, log
   booleano sin secretos. Una conversión fallida jamás afecta el 200 del
   webhook. Quitar las vars de Vercel apaga la medición sin tocar código.
7. **Funnel propio en Postgres, sin terceros**: `ketzal.funnel_events`
   deny-all (RLS sin policies, sin GRANT — el patrón `mp_accounts`) +
   `POST /api/track` (validación por allowlist, service role, responde 204,
   fire-and-forget). Eventos: `checkout_open`, `order_created`,
   `pago_metodo`. El pedido y el pago ya viven en la BD; el funnel captura
   lo que la BD no ve (llegó al checkout y no pidió; eligió método y no pagó).
8. **Atribución visible en `/cuentas`** (finanzas de plataforma): fuente →
   pedidos → pagados → $.

## Alternativas descartadas (análisis ya pagado en estampida — no re-evaluar)

- **Conversiones client-side** (pixel manda Purchase): muere en
  webviews/adblockers y el navegador puede afirmar compras que el webhook
  nunca confirmó; en Ketzal además el pago confirmado ni siquiera pasa por el
  navegador (SPEI, planes).
- **CAPI Gateway de Meta** (relay de paga en AWS): pagar por duplicar ~60
  líneas que corren en nuestro servidor con mejor contexto.
- **Google Tag Manager**: superficie de inyección de scripts fuera del repo,
  sin revisión de PR. Code-first.
- **PostHog/analytics de terceros para el funnel**: una tabla + un route
  handler lo cubren; el dato queda en nuestra BD.

## Consecuencias

- La conversión se reporta aunque el comprador haya cerrado el navegador (el
  SPEI se aprueba días después en Cobranza): la ve el servidor, no una página.
- El matching degrada con gracia: pixel bloqueado ⇒ `external_id` + IP/UA
  (aceptado por Meta, matching débil). El OK del aviso de privacidad sube ese
  piso con email hasheado.
- GA4 une la compra por `transaction_id` con un `client_id` derivado del
  `booking_id` — no une compra a sesión de navegador. Si eso importa, guardar
  el `client_id` real de gtag en el pedido (v2, anotado en el código).
- Abonos posteriores al primero NO generan `Purchase` (decisión: la venta es
  una conversión, no N). El valor reportado es el `total` de la venta en MXN.
- `bookings.attribution` es evidencia de marketing, no dinero: columna jsonb
  nullable, solo la escribe service role al crear el pedido.

## Verificación

- Unit tests del shape exacto de los 4 payloads (`payloads.test.ts`).
- Hard test de `/api/track` contra la BD real con limpieza verificada.
- Antes de gastar en ads (checklist en el runbook): test event CAPI →
  `events_received: 1`; GA4 DebugView; pestaña Network (fbevents.js + beacon
  `/tr/` + cookie `_fbp`) — el pixel NO aparece en `curl` del HTML
  (`next/script` inyecta tras hidratar).

## Fuentes

`docs/MARKETING_STACK_HUELLA.md` (transferencia completa, lecciones de
producción), ADR-17 + runbook `marketing-stack.md` del repo estampida,
[ADR-0016](0016-pagos-solo-mp.md) (los caminos de dinero),
[ADR-0004](0004-tenancy-rls-por-agencia.md) (por qué deny-all).
