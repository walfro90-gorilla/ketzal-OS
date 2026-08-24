# Contenido dinámico — posts, imágenes y video desde el MCP

> Plan (no construido). Conversación del 2026-08-19/20 documentada para no
> perderla. Nada de esto está en el código todavía; ver **Pendientes** al final.

## El problema real

El catálogo ya está publicado, pero no hay demanda entrante: 10 salidas futuras,
**cero asientos vendidos** (verificado 2026-08-19). Falta la capa que convierte
el dato del OS en algo que la gente vea — posts, tarjetas, video corto.

## Principio: el dato primero, el arte después

Lo que vende no es la foto bonita: es la **urgencia**, y esa ya vive en la BD.
`ketzal_salidas` da fecha, cupo, asientos tomados y lugares libres;
`ketzal_servicios` da precio, `includes`/`excludes` y `photos` (jsonb).

> "Quedan 6 lugares para Creel del 30 dic, $2,399" pega más que cualquier render.

Aplica textual la regla que ya está en los prompts del MCP
(`mcp/src/prompts.ts`): **ningún número se calcula, todos se leen del sistema**.
En marketing pesa más, no menos — un precio publicado es una oferta, y una fecha
o un cupo inventados por el LLM son publicidad engañosa con nombre y RFC atrás.
El LLM redacta; jamás produce cifra, fecha ni disponibilidad.

## Tres niveles, de menos a más obra

Se suben en orden. Si el nivel 0 no se usa en dos semanas, no se construyó nada.

### Nivel 0 — un prompt más, cero código nuevo

Un prompt en `mcp/src/prompts.ts` (`/mcp__ketzal__post_del_dia`) que lea las
salidas con cupo libre y devuelva 2-3 captions con hook, hashtags y CTA a la
ficha pública. El humano copia y pega. ~30 líneas, mismo patrón que
`cierre_del_dia`.

### Nivel 1 — la tool que falta

`ketzal_promocionables`: **una** llamada que devuelve lo vendible —
`published = true` + salida futura + lugares libres > 0 — con precio, fotos,
URL pública, nombre de la agencia y la urgencia ya derivada (días restantes,
% de ocupación).

Hoy eso son tres tools encadenadas más un join a mano: `ketzal_salidas` no trae
el nombre de la agencia ni el precio, y `ketzal_servicios` no trae salidas en
modo lista. Es la misma carencia que obligó a salir por SQL directo el
2026-08-19 para listar salidas + agencia.

Con esa tool, cualquier LLM o agente (no solo Claude Code) puede generar
contenido correcto sin encadenar nada.

### Nivel 2 — publicar solo, cuando el volumen lo pida

Cron de Vercel → lee promocionables → AI SDK redacta → publica → asienta en
`system_log`. **Publicar es el pedazo caro**: Meta Graph API pide app review y
tokens de 60 días que hay que renovar. Buffer o Metricool por API salen más
baratos que integrar Meta directo. Se hace al final, o no se hace.

## Imágenes: renderizar, no generar

El stack ya es Next.js en Vercel ⇒ **`next/og` (Satori)**: una ruta
`/og/salida/[id].png` que componga foto real del servicio + precio + fecha +
lugares libres + logo de la agencia. Costo ~cero, milisegundos, y la misma
tarjeta sirve para redes, WhatsApp y el link preview del catálogo.

Es el mejor retorno por línea de código de todo este documento.

**IA generativa de imágenes para destinos reales: no.** Un render de las
Barrancas del Cobre que no son las Barrancas del Cobre es publicidad engañosa.
Sirve para fondos o texturas, nunca para el producto.

## Video: slideshow, no generativo

Fotos reales + Ken Burns + texto grande + música, 9:16, 15-20 s. `ffmpeg` para
el camino corto, Remotion si se quiere versionar en el repo. El LLM aporta el
guion y el orden de las tomas, no el pixel. TTS si hace falta voz.

Veo/Sora/Kling cuestan por clip y devuelven un lugar que no existe: mismo
problema legal que las imágenes, con factura.

## Palanca gratis que ya está en el schema

`reviews`, `ratings` y `wishlists` existen y están vacías. Un servicio con
reseñas es contenido que no se escribe y convierte mejor que copy nuevo. No es
accionable hasta que haya operación real, pero es la fuente de contenido de
verdad cuando la haya.

## Pendientes

- [ ] **N0** — prompt `post_del_dia` en `mcp/src/prompts.ts`
- [ ] **N1** — tool `ketzal_promocionables` (lo vendible en una llamada, con
      agencia, precio, fotos, URL y urgencia derivada)
- [ ] **OG** — ruta `/og/salida/[id].png` con `next/og`
- [ ] **Video** — plantilla slideshow 9:16 desde `photos` (ffmpeg o Remotion)
- [ ] **Bug de catálogo detectado 2026-08-19**: "Creel y Barrancas del Cobre" y
      "Huasteca Potosina en Avión" se publicaron con `available_from` /
      `available_to` en **marzo 2026** — ya vencidos. Si ese rango gatea la
      compra en la ficha pública, se ven pero no se venden. Verificar antes de
      empujar tráfico a esas fichas. El MCP no edita servicios: se corrige en la
      app web.

## Fuera de alcance por ahora (YAGNI)

- Generación de video o imagen con IA para destinos reales (riesgo legal, costo)
- Integración directa con Meta Graph API antes de tener volumen
- Calendario editorial, aprobaciones, multi-cuenta: es un producto aparte
