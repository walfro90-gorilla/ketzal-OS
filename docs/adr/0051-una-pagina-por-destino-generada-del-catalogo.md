# ADR-0051 — Una página por destino, generada del catálogo; ni blog ni /explora filtrado

- **Estado:** aceptada
- **Fecha:** 2026-09-05
- **Migración:** `b094_listado_publico_con_origen_y_salidas` (aditiva)
- **Sustituye a:** ninguno (implementa el pendiente que dejó
  [ADR-0048](0048-el-catalogo-se-publica-para-ser-citado.md))
- **Toca:** `ketzal.list_public_services()` (aditivo) ·
  `src/lib/marketing/destinos.ts` (nuevo, puro) · `src/app/viajes/page.tsx` y
  `src/app/viajes/[destino]/page.tsx` (nuevos) · `src/app/explora/data.ts`
  (tipo) · `src/app/sitemap.ts` · `src/proxy.ts` ·
  `src/components/public/public-footer.tsx`
- **Relacionadas:** [ADR-0026](0026-seo-aeo-tecnico.md),
  [ADR-0048](0048-el-catalogo-se-publica-para-ser-citado.md) (marca, fechas y
  `llms.txt`), [ADR-0040](0040-un-solo-dominio-publico-para-los-links.md)

## Contexto

El fundador preguntó si convenía abrir un blog con "toda la metadata posible"
para aparecer en buscadores y en asistentes de IA. Dos correcciones y una
propuesta salieron de ahí:

- **Más metadatos no posicionan.** Google ignora las etiquetas de palabras clave
  desde 2009, y declarar datos estructurados que no correspondan a lo visible es
  motivo de acción manual por marcado engañoso. Los datos estructurados solo
  pueden afirmar lo que el visitante ve.
- **El cuello de botella no es contenido, es autoridad.** Un dominio de una
  semana con diez URLs no rankea aunque publique cincuenta artículos.
- **Lo que falta es contenido con forma de respuesta.** El sitio tenía fichas de
  producto, no páginas que contestaran "tours a Creel desde Ciudad Juárez
  precio", que es lo que la gente escribe cuando ya quiere ir.

## Decisión

**Una página por destino, generada del catálogo publicado, con hechos y sin
prosa inventada.** `/viajes` como índice y `/viajes/[destino]` por cada ciudad
con al menos un viaje publicado.

1. **Se genera, no se escribe.** El contenido sale de
   `list_public_services()`: cuántos viajes, desde qué precio, próxima salida,
   cuántas salidas programadas, qué agencia opera y desde dónde sale. Si el dato
   no está en el catálogo, la página no lo afirma.
2. **No es un `/explora` filtrado.** Por eso la migración b094 agrega, de forma
   **aditiva**, `city_from`, `state_from`, `next_departure` y
   `departures_count`: sin origen ni fechas la página sería contenido casi
   duplicado, que en SEO resta en vez de sumar.
3. **El título nombra el origen SOLO si todos los viajes salen del mismo lugar.**
   Con dos orígenes distintos, "desde X" sería falso, y el título es justo lo que
   un buscador cita.
4. **Un destino sin viajes no existe como URL.** Devuelve 404, nunca un 200
   vacío indexable, y desaparece solo del sitemap.
5. **No quedan huérfanas**: se enlazan desde el pie público y desde el índice.
   Una URL a la que solo llega el sitemap posiciona peor.
6. **No se abre un blog.** El día que los fines de semana de campamento generen
   crónicas con fotos reales, ese contenido nace de operar y no de escribir por
   obligación; un blog abandonado a los tres artículos señala abandono, igual
   que una página de Facebook sin publicar desde 2025.

## Consecuencias

- El sitemap pasó de 10 a 15 URLs, y crece solo con cada destino nuevo.
- Las páginas son dinámicas con `revalidate` de una hora: el catálogo se lee con
  el cliente de Supabase, que usa cookies, así que no se pueden prerenderizar en
  el build (no hay `generateStaticParams` por eso).
- b094 es aditiva y verificada como tal: `/explora`, el sitemap y `llms.txt`
  leen claves por nombre y siguieron funcionando sin cambios.
- **Lo que sigue pendiente y no lo resuelve esta página:** la autoridad del
  dominio. Un enlace desde `bordertravels.com`, que ya existe y tiene años,
  vale más que cualquier página nueva; igual el perfil de Google Business por
  agencia. Está anotado en `docs/PLAN_COMERCIAL.md`.

## Alternativas descartadas

- **Un blog.** Compite contra blogs de viaje con autoridad, tarda meses, exige
  volumen sostenido y no convierte. Se retoma cuando el contenido sea subproducto
  de operar (crónicas con fotos reales de los tours).
- **Páginas por ruta origen-destino** (`creel-desde-ciudad-juarez`). Hoy los
  cinco viajes salen del mismo origen, así que cada ruta sería idéntica a su
  destino: URLs duplicadas sin contenido distinto. Se retoma si aparece un
  segundo origen real.
- **Rellenar con descripciones del destino.** Sería inventar prosa turística que
  ni el fundador escribió ni el catálogo respalda, y es exactamente lo que
  convierte una página útil en relleno.
- **Prerenderizar con `generateStaticParams`.** Imposible sin un cliente sin
  cookies; se descartó antes que agregar un segundo cliente de Supabase solo
  para el build.

## Verificación

- `src/lib/marketing/destinos.test.ts` (13 casos): el slug quita acentos y no
  deja guiones colgando; se agrupa por destino tomando el precio **más bajo** y
  la salida **más próxima**, no las del primer viaje; se descarta lo que no tiene
  ciudad de destino; un precio 0 no cuenta como "desde"; el orden es por salida
  más próxima y los sin fecha van al final; y `tituloDestino` **no dice "desde"**
  cuando hay dos orígenes o ninguno.
- `supabase/tests/paginas_destino.mjs` (`pnpm hard-test paginas_destino`, 20
  aserciones, anónimo puro): el índice y una página de destino abren **sin
  sesión** por URL directa y con `RSC: 1`; traen el título, la agencia, el precio
  en pesos y la referencia a una ficha; el HTML declara un `ItemList` que parsea;
  el contenido corresponde al slug de la URL; **un destino inexistente da 404**;
  y el pie enlaza `/viajes`.
- Medido por mutación el 2026-09-05: quitar `/viajes` de las rutas públicas de
  `proxy.ts` pone el harness en rojo con `307 → /login`. Es la tercera vez que
  esa familia de bug aparece, después de `/privacidad` y `/indexnow-key.txt`.
- Que b094 sea aditiva se verificó corriendo los tres consumidores tras
  aplicarla: `/explora` responde 200, `llms.txt` sigue listando los 5 tours y
  `aeo_superficie.mjs` quedó en 24/24.
