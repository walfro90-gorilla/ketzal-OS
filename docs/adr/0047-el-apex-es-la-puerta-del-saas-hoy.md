# ADR-0047 — `ketzal.tours/` es la puerta del SaaS hoy; el marketplace conserva sus rutas; el flip a `os.` tiene disparador

- **Estado:** propuesta (el fundador confirma o ajusta el disparador)
- **Fecha:** 2026-09-03
- **Migración:** ninguna
- **Sustituye a:** ninguno. Precisa el punto 3 de
  [ADR-0040](0040-un-solo-dominio-publico-para-los-links.md) ("`os.` sirve
  todo; ruteo por host sin decidir"): las rutas siguen sirviéndose en ambos
  hosts; lo que se decide es **qué muestra la raíz** de cada uno y qué enlaza
  la home.
- **Toca (en los PRs del rediseño, no en este):** `src/components/marketing/landing.tsx`
  (la home deja de enlazar `/explora` salvo una puerta en el footer) ·
  `src/proxy.ts` (`os.ketzal.tours/` anónimo → `/login`)
- **Relacionadas:** [ADR-0002](0002-estrategia-dos-tiempos.md) (OS primero,
  marketplace por rebanadas), [ADR-0026](0026-seo-aeo-tecnico.md) (el SEO de
  `/explora` y `/servicio/*` vive en el apex)

## Contexto

La spec del rediseño (§2) dice que `ketzal.tours` es el sitio del producto para
agencias y no vende viajes al consumidor. Hoy sí los vende: `/explora`,
`/servicio/[id]`, `/comprar/`, `/agencias` y `/entrar` viven en el apex, y los
links ya repartidos (QR de vouchers, `?ref` de embajadores, cotizaciones,
recibos) apuntan ahí por `origenPublico()`. El fundador planteó la alternativa
inversa: SaaS en `os.ketzal.tours`, viajeros en `ketzal.tours`.

Hechos que pesan:

- **Quién teclea la raíz.** Agencias prospecto, evaluadores del censo de
  startups y agentes que entran a trabajar. El viajero llega por deep-link que
  le mandó su agencia; no busca `ketzal.tours` en la barra.
- **Qué hay detrás del marketplace hoy** (medido 2026-09-03): 5 servicios
  publicados de 2 agencias, 0 ventas reales, fotos sin verificar. Es la parte
  más débil del producto y sería la primera pantalla del censo.
- **SEO.** La autoridad del dominio la juntan hoy `/explora` y `/servicio/*`
  (JSON-LD, sitemap, canonical). Una home SaaS en el apex la hereda; en un
  subdominio arranca de cero.
- **El flip es barato si se diseña para él:** la home es un componente
  (`<Landing/>`) y "qué host sirve qué raíz" es una regla en `proxy.ts`.

## Decisión

1. **Hoy `ketzal.tours/` muestra la home del SaaS** (la de la spec). Es la
   estrategia de dos tiempos aplicada al dominio: la puerta enseña el negocio
   que existe.
2. **El marketplace conserva sus rutas en el apex** con su propio shell de
   viajero. Nada de lo repartido se rompe; el SEO acumulado se queda.
3. **La home no le habla al viajero.** Nav y hero sin enlaces a `/explora`. Una
   sola puerta discreta en el footer ("¿Buscas un viaje? Ver salidas") para
   quien cae en la raíz por error.
4. **`os.ketzal.tours/` anónimo manda a `/login`.** Los agentes memorizan
   "`os.` es mi oficina"; la landing no se duplica en el subdominio (ya era
   canonical al apex por ADR-0040).
5. **El flip** (marketplace en la raíz del apex, SaaS en `os.`) se hace cuando
   el fundador lo decida; disparador propuesto: **≥ 5 agencias con inventario
   publicado y fotos, o la primera venta B2C orgánica.** Al dispararse: ADR
   nuevo que sustituya a este, y el cambio es una regla de host en `proxy.ts`
   más el `canonical`.

## Alternativas descartadas

- **B ahora: SaaS en `os.`, marketplace en la raíz.** Enseña 5 salidas sin
  fotos a quien evalúa la startup, y arranca el SEO del SaaS en un subdominio.
  Correcto a futuro, prematuro hoy.
- **Mover la vitrina a un dominio o subdominio por agencia** (`wanderlust.ketzal.tours`).
  Rompe `origenPublico()` (regla de oro 9) y todo link ya repartido; exige
  wildcard DNS y cookies por host. Es un proyecto, no una decisión de home.
- **Home mixta** (mitad SaaS, mitad viajes). Es lo que hay hoy y la spec la
  rechaza: la home responde en cinco segundos qué es y para quién.

## Consecuencias

- Mientras dure, `/explora` es alcanzable por URL, footer y deep-links, no
  desde la nav de la home.
- El PR que implemente el punto 4 agrega su caso a un harness existente
  (`GET /` con `Host: os.ketzal.tours` sin sesión → 307 a `/login`); este ADR
  no afirma ese invariante hasta entonces.
- La métrica del disparador se lee en la BD (`services.published` por agencia,
  `bookings` con `channel = 'portal'`), no se estima.

## Verificación

Este ADR decide contenido y dirección; no introduce invariante de runtime.
El invariante del punto 4 nombra su prueba en el PR que lo implemente
(ADR-0034).
