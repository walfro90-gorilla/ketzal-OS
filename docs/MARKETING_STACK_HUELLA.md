# Huella — Stack de marketing de estampida, para portar a Ketzal

> Documento de transferencia escrito por el agente de la sesión de estampida
> (2026-08-31). En estampida este stack está CONSTRUIDO, ACTIVO y VERIFICADO EN
> VIVO (eventos llegando a Meta y GA4 con tráfico real). Esto no es una receta
> ciega: es la arquitectura + las lecciones caras. El agente de Ketzal adapta a
> sus propias reglas (ADRs, schema `ketzal`, RPC-only-write, worktrees).
>
> Fuente completa en el repo de estampida (`~/Desktop/codes/estampida`):
> `docs/adr/0017-medicion-server-first.md`, `docs/runbooks/marketing-stack.md`,
> `docs/bitacora.md` (entradas 2026-08-30/31).

<contexto>
Objetivo: medición de conversiones para ads (Meta + Google), remarketing por
pixel, SEO/AEO técnico (aparecer en Google y en respuestas de chats de IA), y
funnel propio — todo antes de gastar un peso en campañas.

Por qué server-first: la audiencia real vive en móvil y webviews (Messenger,
Instagram), donde los scripts del cliente mueren por adblockers o restricciones
del webview. Comprobado con corredores reales en estampida. La fuente de verdad
de una compra es el servidor (webhook de MP / confirmación de abono), nunca el
navegador.
</contexto>

<arquitectura decision="ADR-17 de estampida — copiar la decisión, adaptar los hooks">
1. **Purchase sale del servidor**, de los únicos lugares que confirman dinero.
   En estampida: webhook de MP + approve de pago offline. En Ketzal el agente
   debe mapear sus equivalentes (webhook MP del marketplace, confirmación de
   abono/comprobante SPEI-efectivo). Se envía a:
   - Meta Conversions API: `POST graph.facebook.com/v21.0/{dataset_id}/events`
   - GA4 Measurement Protocol: `POST google-analytics.com/mp/collect`
2. **`event_id` (Meta) y `transaction_id` (GA4) = id de la orden/venta.**
   Dedupe y reintentos idempotentes gratis.
3. **`InitiateCheckout`/`begin_checkout` al crear la orden**, vía `after()` de
   `next/server` — cero latencia añadida al comprador.
4. **El pixel de Meta en el cliente manda SOLO `PageView`.** Su trabajo:
   audiencias de remarketing por URL visitada + plantar cookies `_fbp`/`_fbc`.
   Sin Purchase en el cliente no hay dedupe que coordinar.
5. **Captura al crear la orden** (único momento en que el navegador del
   comprador habla con el servidor): IP (`x-forwarded-for` primer valor),
   user-agent, cookies `_fbp`/`_fbc` validadas con regex `^fb\.1\.\d+\.[\w.-]+$`.
   Viajan en el jsonb de atribución de la orden hacia el `user_data` del CAPI.
6. **`user_data` mínimo obligatorio**: `external_id = sha256(order_id)`.
   Meta RECHAZA eventos sin ningún customer information parameter
   (error subcode **2804050** — nos mordió en producción). Sin email hasheado
   hasta que el aviso de privacidad lo cubra.
7. **Env-gated total, nunca lanza**: todas las vars `.optional()`; sin vars =
   no-op silencioso con log booleano "configurado/falta". `Promise.allSettled`,
   timeout 3s por request, una conversión fallida jamás afecta el 200 del
   webhook. Quitar las vars de Vercel apaga la medición sin tocar código.
8. **Atribución primer-touch**: cliente captura `utm_* + fbclid + gclid +
   landing + first_touch_at` en la PRIMERA visita, persiste en localStorage
   ~30 días (try/catch), y lo manda al crear la orden. `fbclid` sin cookie
   `_fbc` se convierte server-side: `fbc = fb.1.{timestamp_ms}.{fbclid}`.
9. **Funnel propio en Postgres** (sin PostHog ni terceros): tabla
   `funnel_events` deny-all + `POST /api/track` (zod, service-role, responde
   204, fire-and-forget desde el cliente — nunca rompe el wizard). Eventos:
   apertura del wizard, pasos, método de pago elegido, orden creada.
10. **Tarjeta de atribución** en el panel de finanzas de la plataforma:
    fuente → órdenes creadas → pagadas → $.
</arquitectura>

<alternativas-descartadas motivo="no re-evaluar, ya se pagó el análisis">
- Conversiones client-side (pixel manda Purchase): muere en webviews/adblockers
  y el navegador puede afirmar compras que el webhook nunca confirmó.
- CAPI Gateway de Meta (relay de paga en AWS): paga por duplicar ~60 líneas.
- Google Tag Manager: superficie de inyección de scripts fuera del repo, sin
  revisión de PR. Code-first.
- Cloudflare "para búsquedas de IA": no da eso (lo dan robots.txt + llms.txt +
  JSON-LD) y exige mover nameservers. En Ketzal aplica igual si el dominio
  final carga DNS con correo/subdominos.
</alternativas-descartadas>

<mapa-de-codigo repo="estampida" nota="leer estos archivos como referencia; portar adaptando">
- `lib/conversion-payloads.ts` — builders PUROS de payloads Meta/GA4 (testeables
  sin red): `buildMetaPurchase`, `buildMetaInitiateCheckout`, `buildGa4Purchase`,
  `buildGa4BeginCheckout`. client_id de GA4 = hash estable derivado del order_id.
- `lib/server/conversions.ts` — `sendPurchaseEvents(orderId)` /
  `sendCheckoutEvents(orderId)`: UNA query a la orden (joins evento/org),
  construye payloads, envía a ambas plataformas, allSettled, nunca lanza.
- `lib/env.ts` — grupo `trackingEnv()`: `NEXT_PUBLIC_GA_ID`, `GA4_API_SECRET`,
  `NEXT_PUBLIC_META_PIXEL_ID`, `META_CAPI_TOKEN`, `META_TEST_EVENT_CODE`,
  todos `.optional()`.
- `components/meta-pixel.tsx` — snippet fbq vía `next/script` afterInteractive,
  `init` + `PageView`, navegaciones SPA con `usePathname` (ref que salta el
  primer render para no duplicar el PageView inicial).
- GA4 cliente: `@next/third-parties/google` (`<GoogleAnalytics gaId=...>`),
  montado en el layout root gated por la env.
- `app/api/track/route.ts` + migración `funnel_events` — deny-all; en Ketzal
  respetar ADR-0006 (RPC-only-write) y el doble revoke de Supabase
  (`PUBLIC` de Postgres Y `anon/authenticated` del ALTER DEFAULT PRIVILEGES —
  son independientes; verificar contra `information_schema`, no contra el grant).
- `lib/attribution.ts` + `components/attribution-capture.tsx` — primer touch.
- `app/api/orders/route.ts` — captura IP/UA/fbp/fbc + `after(() =>
  sendCheckoutEvents(...))`.
- Hooks de Purchase: webhook MP dentro del bloque `status === "approved"` y
  el approve offline tras confirmar `paid` — SIEMPRE después de que el dinero
  esté confirmado en BD, nunca antes.
- SEO/AEO: `app/robots.ts` (allow explícito a GPTBot, OAI-SearchBot, ClaudeBot,
  PerplexityBot, Google-Extended; disallow de rutas privadas/API),
  `app/sitemap.ts` (dinámico desde la vista pública), `app/llms.txt/route.ts`
  (route handler; en Ketzal SÍ existe `public/`, pero route handler permite
  contenido dinámico), `lib/jsonld.ts` (`serializeJsonLd` escapa `<` — XSS).
  JSON-LD en estampida: `SportsEvent` + `ItemList`. En Ketzal el tipo correcto
  es **`TouristTrip`** (o `Product` con `offers`) por salida publicada, e
  `ItemList` en la vitrina. La jugada AEO: contenido fáctico citable
  ("tours a Creel desde Ciudad Juárez" respondido por Ketzal).
- Tests: unit de payloads (shape exacto) + hard test de `/api/track` contra BD
  real con limpieza verificada.
</mapa-de-codigo>

<lecciones-caras nota="cada una costó horas de diagnóstico en vivo">
1. **Error Meta 2804050**: evento sin customer information parameter se
   rechaza. `external_id = sha256(order_id)` SIEMPRE, incondicional.
2. **Vercel "Sensitive" env vars no se pueden descargar**: `vercel env pull`
   escribe el literal `[SENSITIVE]` (11 chars) y el runtime local rompe.
   El token CAPI va como variable normal (igual nunca sale del servidor).
3. **Meta Events Manager "Probar eventos" solo muestra eventos que llegan CON
   la pestaña abierta**, y los test events (con `test_event_code`) JAMÁS
   cuentan en "Eventos totales". Un "0" ahí no significa que no funcione.
4. **El pixel NO aparece en `curl` del HTML**: `next/script` afterInteractive
   inyecta tras hidratar. Verificación correcta = pestaña Network del
   navegador: request a `connect.facebook.net/.../fbevents.js` + beacon a
   `facebook.com/tr/` + cookie `_fbp` plantada.
5. **GA4: una cuenta de Analytics POR PRODUCTO** (patrón de Wal). Si una
   propiedad nació en la cuenta equivocada, se MUEVE (Admin → Mover propiedad;
   conserva `G-ID` y API secrets) — nunca recrear.
6. **Token CAPI**: se genera en Events Manager → Configuración → Conversions
   API → Generar token. Es un `EAA...` de ~200 chars. "Cannot parse access
   token" = el valor guardado no es el token (revisar qué se pegó).
7. **Verificar el flujo end-to-end con un script de test event** (payload real
   con `test_event_code`) ANTES de esperar tráfico orgánico: responde
   `events_received: 1` y se ve en Probar eventos.
</lecciones-caras>

<prerequisitos-ketzal bloqueantes="decisiones de Wal, no de código">
1. **Dominio propio.** Hoy prod es `ketzal-os.vercel.app`. Para verificación de
   dominio en Meta, Search Console de dominio, y marca en los ads, hace falta
   dominio real (p.ej. `ketzal.mx`). Con el dominio: SOLO se agregan 2 TXT
   (`facebook-domain-verification=` y `google-site-verification=`), nada más
   se toca del DNS.
2. **Aviso de privacidad** en el marketplace cubriendo cookies/pixel/CAPI.
   Hasta entonces: sin email hasheado en `user_data` (igual que estampida).
3. **Identidad del anuncio**: los ads deben salir desde la página de Facebook
   de la agencia (Wanderlust ya tiene audiencia) vía acceso partner desde el
   Business Portfolio de Ketzal. La medición (dataset/pixel) es SIEMPRE de
   Ketzal — ese dato es de la plataforma.
</prerequisitos-ketzal>

<cuentas paso-a-paso="Wal las crea a mano; el agente prepara valores exactos">
Patrón: cuentas a nombre del negocio con 2FA, nunca personales. Un Business
Portfolio propio para Ketzal (separado de Estampida Run — un ban no debe
contagiar productos).

Meta (~1h): Business Portfolio → verificar dominio (TXT) → Dataset/Pixel en
Events Manager → token CAPI → cuenta publicitaria MXN + método de pago.
Google (~1h): cuenta GA4 nueva "ketzal" → propiedad + data stream → copiar
`G-XXXX` → API secret de Measurement Protocol → Search Console (propiedad de
DOMINIO) → sitemap. Google Ads después, si se corre search.

Env vars en Vercel (Wal a mano, nunca por shell):
`NEXT_PUBLIC_GA_ID`, `GA4_API_SECRET`, `NEXT_PUBLIC_META_PIXEL_ID`
(= Dataset ID), `META_CAPI_TOKEN`, `META_TEST_EVENT_CODE` (opcional, pruebas).

MCPs útiles en la sesión de Ketzal (Wal los agrega con `!`):
`claude mcp add --transport http meta-ads https://mcp.facebook.com/ads`
(oficial de Meta: crear campañas/audiencias/leer datasets desde Claude) y el
MCP de Google Analytics. El de Meta pide OAuth en el navegador al conectar.
</cuentas>

<orden-de-ejecucion paralelo="código no espera cuentas — todo env-gated">
1. Contrato primero: shape del jsonb de atribución en la orden (utm + fbclid +
   gclid + fbp + fbc + ip + ua + landing + first_touch_at).
2. SEO/AEO (robots/sitemap/llms.txt/JSON-LD) — independiente total.
3. Cliente: attribution capture + pixel PageView + gtag + funnel_events.
4. Servidor: payloads + conversions + hooks en webhook/confirmación + after().
5. Tarjeta de atribución en finanzas.
6. Verificación EN VIVO antes de gastar: test event CAPI (`events_received:1`),
   GA4 DebugView + Tiempo real, Network tab (fbevents.js + /tr/), Rich Results
   Test sobre una salida, sitemap aceptado en Search Console.
7. Solo entonces: primera campaña chica ($100-200 MXN/día) optimizada a
   Purchase. El pixel necesita ~2 semanas de datos para optimizar bien →
   prender medición YA aunque los ads esperen.
</orden-de-ejecucion>
