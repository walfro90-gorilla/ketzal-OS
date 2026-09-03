# ADR-0040 — Un solo dominio público: los links a clientes salen de `origenPublico()` y el host viejo redirige

- **Estado:** aceptada
- **Fecha:** 2026-09-03
- **Migración:** ninguna (infra + app)
- **Sustituye a:** ninguno
- **Toca:** `src/lib/site-url.ts` (`SITE_URL`, `origenPublico`) · `next.config.ts`
  (`redirects`) · link de referido, viajes para compartir, cotización, compartir
  WhatsApp, ficha, voucher (link y QR), estado de cuenta y Checkout Pro desde la
  venta · canonicals de las páginas públicas · proyecto Vercel `ketzal-os`
  (dominios `ketzal.tours`, `os.ketzal.tours`, `www.ketzal.tours`)
- **Relacionadas:** [ADR-0025](0025-medicion-server-first.md) (el
  `event_source_url` y la verificación de dominio en Meta piden dominio real),
  [ADR-0026](0026-seo-aeo-tecnico.md) (sitemap/robots/canonical desde
  `SITE_URL`), [ADR-0031](0031-atribucion-del-embajador-last-touch-en-cookie.md)
  (la cookie `kz_ref` se planta en el host donde se aterriza)

## Contexto

Hasta el 2026-09-03 producción vivía en `ketzal-os.vercel.app`. El fundador
compró `ketzal.tours` y pidió conectarlo junto con `os.ketzal.tours`. Un dominio
propio no es cosmética: la verificación de dominio de Meta, la propiedad de
dominio en Search Console y la marca en los anuncios lo exigen
(prerequisito 1 de `docs/MARKETING_STACK_HUELLA.md`).

Al conectar dos hosts a un mismo proyecto apareció el problema de fondo: **siete
sitios armaban el link que se le manda a un cliente con el host donde estaba
parado quien lo generaba** (`window.location.origin` o el header `host`): el
link de referido del embajador, sus viajes para compartir, la cotización desde
el back-office, el botón "Compartir por WhatsApp" de cotización/estado/recibo,
compartir la ficha, el link y el QR del voucher, el estado de cuenta y el
Checkout Pro desde la venta. Un agente en `os.ketzal.tours` —o en el
`ketzal-os.vercel.app` que su PWA instalado sigue abriendo— le mandaba ese host
al cliente. Y los links ya repartidos (cotizaciones por WhatsApp, `?ref=` de
embajadores, QRs impresos) apuntaban al host viejo.

## Decisión

**Hay UN dominio público, `https://ketzal.tours`, y todo link que va a un
cliente sale de ahí; el host viejo redirige.**

1. **`origenPublico(actual)`** (`src/lib/site-url.ts`): devuelve
   `NEXT_PUBLIC_SITE_URL` si existe; si no, el origen actual (local/preview,
   donde el puerto varía); si no, `SITE_URL`. Todo link a cliente pasa por ahí.
   `NEXT_PUBLIC_SITE_URL=https://ketzal.tours` vive en Vercel (Production): con
   dos dominios no se deja que Vercel elija cuál es "producción" — esa variable
   decide sitemap, canonical, OG, `event_source_url` de Meta y los links.
2. **`ketzal-os.vercel.app` → `https://ketzal.tours` con 308** y query intacta
   (`next.config.ts` `redirects`, `has: host`). **`/api` y `/_next` quedan
   fuera**: el webhook y el redirect URI de OAuth de Mercado Pago se registraron
   con el host viejo y no siguen redirects. Los links ya repartidos siguen
   abriendo, en el dominio nuevo, con su `?ref=`.
3. **`os.ketzal.tours` sirve todo** (no se decidió ruteo por host); las páginas
   públicas llevan `alternates.canonical` al apex para que no cuenten como
   copia. **`www.ketzal.tours`** existe y redirige 308 al apex (configurado en
   el proyecto Vercel), porque la gente lo teclea y un CNAME al parking servía
   anuncios de Namecheap bajo la marca.
4. **Los nameservers se quedan en el registrador.** Solo se agregan registros
   (`A @`, `A os` → `76.76.21.21`; `CNAME www` → `cname.vercel-dns.com`). Los
   TXT de Meta y Google van al mismo panel cuando existan las cuentas.

## Consecuencias

- Un embajador que navega en `localhost`, `os.` o el `vercel.app` viejo copia
  y comparte `https://ketzal.tours/explora?ref=CODE`; la cookie de atribución
  se planta al aterrizar en el apex, así que el redirect no pierde comisiones.
- **Lo que toca al fundador:** reinstalar el PWA desde `ketzal.tours` (el
  instalado desde el host viejo ahora aterriza fuera de su scope y se abre en
  el navegador — el modal de instalar lo ofrece); agregar
  `https://ketzal.tours/api/mp/oauth/callback` a la app de Mercado Pago antes
  de conectar una agencia desde el dominio nuevo (o conectar desde el
  `vercel.app`, que para `/api` no redirige); Site URL y Redirect URLs de
  Supabase Auth con los dos hosts (hecho el 2026-09-03).
- **Techo conocido:** el resolver de la red del fundador cacheó el parking 30
  minutos y "no alcanzaba el dominio" cuando ya servía; verificar con
  `dig @1.1.1.1` y `curl --resolve`, no con el navegador.
- Los tests que usan `ketzal-os.vercel.app` como fixture de cadena
  (`payloads.test.ts`, `embajador.test.ts`) no cambian: prueban funciones puras.

## Alternativas descartadas

- **Dejar `window.location.origin`** ("funciona igual en local que en prod").
  Funcionaba cuando había un solo host; con `os.` y el PWA viejo es una
  lotería que el cliente reciba el dominio de la marca.
- **Cambiar nameservers a Vercel.** Más registros bajo control de un tercero
  para nada: con `A`/`CNAME` Vercel verifica y emite certificados igual, y el
  correo/subdominios futuros se quedan donde ya está el resto del negocio.
- **Redirigir también `/api`.** Rompe el webhook de pagos en curso y el OAuth
  de MP hasta que se re-registre; el costo de dejarlos en el host viejo es cero.
- **Ruteo por host ahora** (apex = vitrina, `os.` = back-office). Es una
  decisión de producto pendiente; mientras, el canonical evita el daño SEO.

## Verificación

- `src/lib/site-url.test.ts`: `origenPublico` prefiere `NEXT_PUBLIC_SITE_URL`;
  sin ella devuelve el origen actual; sin ninguno, `SITE_URL`; una cadena vacía
  no cuenta como origen.
- `supabase/tests/dominio_redirect.mjs` (`pnpm hard-test dominio_redirect`,
  contra el servidor local): con `Host: ketzal-os.vercel.app`, `/explora?ref=QA`
  → 308 a `https://ketzal.tours/explora?ref=QA` y `/` → 308 al apex;
  `/api/track` con el host viejo NO redirige; el mismo path con otro host no
  redirige.
- En vivo (2026-09-03, bitácora): navegador real con embajador efímero en
  `localhost` → link de referido y botones de WhatsApp en `https://ketzal.tours`;
  `curl` en prod: host viejo 308 con el `ref`, `/api/track` 405, canonicals en
  apex y `os.`, `www` 308.
