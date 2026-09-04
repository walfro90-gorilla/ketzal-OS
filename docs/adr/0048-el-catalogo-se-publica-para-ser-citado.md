# ADR-0048 — El catálogo se publica para ser citado: marca en la portada, fechas en la ficha, catálogo vivo en `llms.txt` y aviso a Bing

- **Estado:** aceptada
- **Fecha:** 2026-09-04
- **Migración:** ninguna (app)
- **Sustituye a:** ninguno (extiende [ADR-0026](0026-seo-aeo-tecnico.md), que sigue vigente)
- **Toca:** `src/lib/marketing/jsonld.ts` (`marcaJsonLd`, `departureTime`) ·
  `src/app/page.tsx` · `src/app/llms.txt/route.ts` ·
  `src/lib/marketing/indexnow.ts` + `src/app/indexnow-key.txt/route.ts` (nuevos) ·
  `src/app/(ops)/servicios/actions.ts` (`setServicioPublicado`) · `src/proxy.ts`
- **Relacionadas:** [ADR-0026](0026-seo-aeo-tecnico.md) (robots/sitemap/JSON-LD),
  [ADR-0040](0040-un-solo-dominio-publico-para-los-links.md) (`SITE_URL` decide
  el host que se publica), [ADR-0045](0045-el-gate-de-seguridad-no-vive-en-un-layout.md)
  (por qué una ruta pública se declara en `proxy.ts`)

## Contexto

El fundador preguntó cómo lograr que ChatGPT, Gemini o Claude recomienden
Ketzal cuando alguien pregunta por tours. Medido contra producción, la base de
ADR-0026 ya estaba viva: `robots.txt` invita a GPTBot, OAI-SearchBot, ClaudeBot,
PerplexityBot y Google-Extended; la ficha emite `TouristTrip`; la vitrina emite
`ItemList`; existe `llms.txt`.

Tres huecos reales, y uno de contexto que conviene dejar escrito:

1. **La portada no declaraba nada.** Ningún dato estructurado ataba el nombre
   "Ketzal" al dominio ni al logo, así que para un buscador la marca y el sitio
   no eran la misma entidad.
2. **La ficha no publicaba fechas.** Después del precio, la pregunta es "¿qué
   fechas hay?", y el dato estaba en la página pero no en el JSON-LD.
3. **`llms.txt` era estático.** Describía el marketplace en abstracto; un
   asistente cita hechos —nombre, destino, precio, agencia—, no adjetivos.
4. **Contexto honesto:** con 5 tours publicados, 4 rutas y cero menciones de
   terceros, ningún asistente va a recomendar Ketzal por más schema que se
   agregue. Lo que decide es estar en el índice, tener contenido con forma de
   respuesta y que alguien más te corrobore (Google Business Profile, reseñas).
   Esto es el piso técnico, no la estrategia.

## Decisión

**Todo hecho publicable se emite en un formato que una máquina pueda citar, y
cuando el catálogo cambia se avisa en vez de esperar al crawler.**

1. **`marcaJsonLd`** en la portada: `Organization` + `WebSite` en un `@graph`,
   atados por `@id` (el `WebSite.publisher` apunta a la `Organization`). El logo
   sale de `getBrandLogo()`; sin logo no se emite la propiedad vacía.
2. **`departureTime`** en `TouristTrip` y `availabilityStarts` en su `Offer`,
   ambos con la salida **más próxima** de las vendibles. Sin salidas no se
   inventa fecha y la disponibilidad baja a `LimitedAvailability`.
3. **`llms.txt` sirve el catálogo vivo**: una línea por tour publicado con
   nombre, destino, precio en MXN, agencia y URL de ficha, leída al momento de
   servir. Sin catálogo se omite la sección — nunca se afirma "no hay viajes",
   porque eso también es citable.
4. **IndexNow** al publicar o despublicar un servicio, dentro de `after()` para
   no meterle latencia a la acción. Avisa a Bing —y con él a la búsqueda de
   ChatGPT—, además de Yandex y Seznam; Google no participa y sigue por sitemap.
   Es **env-gated** por `INDEXNOW_KEY`: sin ella el aviso es no-op y
   `/indexnow-key.txt` responde 404.
5. **La clave de IndexNow se publica a propósito.** Su contenido en
   `/indexnow-key.txt` ES la credencial, y así es como el buscador comprueba que
   quien avisa controla el dominio. Va por env sólo para poder rotarla sin
   desplegar.

## Consecuencias

- Publicar un tour deja de ser "y ahora a esperar semanas": Bing recibe el aviso
  en el mismo minuto.
- `llms.txt` deja de poder mentir: si se despublica un tour, desaparece de la
  lista en la siguiente hora (el `cache-control` es de 3600 s).
- **Lo que le toca al fundador**, y sin ello lo anterior rinde poco: dar de alta
  el dominio en Bing Webmaster Tools, poner `INDEXNOW_KEY` en Vercel, y abrir
  ficha de Google Business Profile por agencia con reseñas reales.
- **Pendiente decidido pero no construido:** páginas por ruta y destino,
  generadas del catálogo, que respondan en texto la pregunta que la gente
  escribe de verdad ("tours a Creel desde Ciudad Juárez precio"). Es contenido
  público y cambia el SEO del sitio: va en su propio carril con su ADR.

## Alternativas descartadas

- **Emitir un `Offer` por salida** en vez de una sola con la próxima fecha.
  Infla el JSON-LD sin que ningún consumidor lo aproveche hoy; la fecha próxima
  es la que contesta la pregunta.
- **Un archivo estático `public/llms.txt`.** Se pudre en cuanto cambia el
  catálogo, y un dato viejo citado por un asistente es peor que no tenerlo.
- **Dejar la clave de IndexNow fuera de env, escrita en el repo.** Rotarla
  exigiría un deploy; y aunque no es un secreto, un valor de infra fijado en
  código es justo lo que ADR-0024 evita.
- **Pingear también a Google.** No existe: Google retiró el ping de sitemap y no
  participa en IndexNow. Prometerlo sería una verificación que no se puede medir.

## Verificación

- `src/lib/marketing/jsonld.test.ts`: `departureTime` es la salida **más
  próxima**, no la primera de la lista; sin salidas no hay fecha y la
  disponibilidad baja; con precio 0 no se emite `offers`; `marcaJsonLd` ata
  `WebSite.publisher` al `@id` de la `Organization` y omite `logo` si no hay;
  `serializeJsonLd` escapa `<` para que un valor no cierre el `<script>`.
- `supabase/tests/aeo_superficie.mjs` (`pnpm hard-test aeo_superficie`, contra
  el servidor): anónimo puro, 24 aserciones — la portada declara
  `Organization`+`WebSite` atados por `@id`; la ficha declara `TouristTrip` con
  agencia, precio MXN y, si dice `InStock`, con fecha de próxima salida;
  `llms.txt` enlaza una ficha real con precio y agencia; `robots.txt` sigue
  nombrando a los cinco crawlers de IA; **ningún bloque JSON-LD del sitio queda
  sin parsear**; y `/indexnow-key.txt` es 404 sin clave o la sirve en texto
  plano, nunca un redirect a `/login`.
- Medido por mutación el 2026-09-04: quitar `/indexnow-key.txt` de las rutas
  públicas de `proxy.ts` pone ese caso en rojo con `307 → /login`. Fue un bug
  real encontrado por esta prueba, de la misma familia que el de `/privacidad`.
