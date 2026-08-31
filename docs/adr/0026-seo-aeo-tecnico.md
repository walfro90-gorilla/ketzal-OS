# ADR-0026 — SEO/AEO técnico: crawlers de IA permitidos, JSON-LD TouristTrip, code-first sin Cloudflare

- Estado: aceptada · Fecha: 2026-08-31 · Sustituye: —
- Alcance: `app/robots.ts`, `app/sitemap.ts`, `app/llms.txt/route.ts`,
  JSON-LD en `/servicio/[id]` y `/explora`, `src/proxy.ts` (rutas públicas)

## Contexto

El marketplace necesita aparecer en Google **y en las respuestas de asistentes
de IA** ("tours a Creel desde Ciudad Juárez") antes de gastar en ads: el
tráfico orgánico es el piso gratuito del funnel. El sitio no tenía robots.txt,
sitemap, ni datos estructurados — y el proxy mandaba `/robots.txt` y
`/sitemap.xml` a `/login`.

## Decisión

1. **Los crawlers de IA se PERMITEN explícitamente** (GPTBot, OAI-SearchBot,
   ClaudeBot, PerplexityBot, Google-Extended): queremos estar en las
   respuestas. Se les bloquea lo mismo que a todos: back-office, `/api/`, y
   las vistas por token (`/cotizacion/`, `/recibo/`, `/voucher/`, `/estado/`)
   — links privados que no deben indexarse.
2. **`app/sitemap.ts` dinámico** desde `list_public_services` (el RPC anon ya
   existente): home, `/explora`, `/agencias` y cada `/servicio/[id]`
   publicado. Revalida cada hora.
3. **`llms.txt` como route handler** (`app/llms.txt/route.ts`): describe el
   directorio en texto plano citable para asistentes de IA.
4. **JSON-LD code-first**: `TouristTrip` (con `offers` en MXN y salidas
   futuras) en cada ficha publicada, `ItemList` en `/explora`. Serializado
   escapando `<` (un valor con `</script>` no puede cerrar el tag — XSS).
   Contenido fáctico citable: la ficha pública ES la jugada AEO.
5. **Sin Cloudflare**: no da "aparecer en búsquedas de IA" (eso lo dan los
   puntos 1-4) y meterlo exige mover nameservers cuando llegue el dominio
   propio — doble proxy Cloudflare→Vercel es fuente clásica de bugs SSL/caché.
   Vercel ya pone CDN/TLS/bot-protection.
6. **Sin Google Tag Manager** (misma razón que ADR-0025): superficie de
   inyección fuera del repo.

## Consecuencias

- `robots.txt`, `sitemap.xml` y `llms.txt` se agregan a las rutas públicas del
  proxy — hoy redirigen a `/login` y ningún crawler las vería.
- El sitemap emite URLs del dominio activo (`ketzal-os.vercel.app` hasta que
  exista dominio propio); con el dominio real solo cambia
  `NEXT_PUBLIC_SITE_URL`. La verificación en Meta/Search Console espera al
  dominio (prerequisito del fundador, no de código).
- Rich Results Test sobre una ficha publicada es parte del checklist antes de
  campañas (junto con la verificación de medición del ADR-0025).

## Fuentes

`docs/MARKETING_STACK_HUELLA.md`, runbook `marketing-stack.md` de estampida
(descarte de Cloudflare/GTM con el detalle), [ADR-0025](0025-medicion-server-first.md).
