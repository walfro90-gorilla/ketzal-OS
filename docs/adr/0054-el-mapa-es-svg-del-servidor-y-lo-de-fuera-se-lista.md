# ADR-0054 — El mapa de destinos es SVG del servidor con trazo de dominio público, y lo que no cabe en México se lista aparte

- **Estado:** aceptada
- **Fecha:** 2026-09-05
- **Migración:** `b096_mapa_destinos`
- **Sustituye a:** ninguno
- **Toca:** `ketzal.list_destinos_mapa()` (nuevo) · `src/lib/marketing/mapa-mexico.ts`
  (nuevo) · `src/components/public/mapa-destinos.tsx` (nuevo) ·
  `src/app/viajes/page.tsx` · `src/app/viajes/data.ts`
- **Relacionadas:** [ADR-0051](0051-una-pagina-por-destino-generada-del-catalogo.md)
  (las páginas por destino), [ADR-0053](0053-el-contenido-de-destino-se-edita-en-el-panel.md)
  (dónde viven las coordenadas), [ADR-0026](0026-seo-aeo-tecnico.md)

## Contexto

El fundador pidió un mapa de México en el índice de destinos, con la idea de
usar three.js y puntos por destino. Se descartó three.js con números: la
librería pesa del orden de 150 KB comprimida antes de la geometría, el
marketplace se abre con datos móviles, un lienzo no aporta nada rastreable y sin
una lista paralela queda inservible con lector de pantalla — todo para **cuatro**
destinos.

Aparecieron además dos problemas que no eran de tecnología sino de datos:

- **Un destino del catálogo está en Colombia** (Medellín). Un mapa de México no
  puede contenerlo.
- **Las coordenadas viven en `ketzal.destinos`**, cuya lectura pública filtra por
  `publicado` (ADR-0053). Con ese filtro el mapa quedaba vacío hasta que alguien
  publicara la prosa: dos cosas distintas atadas al mismo interruptor.

## Decisión

**SVG renderizado en el servidor, con trazo derivado de datos de dominio público,
y lo que no cae dentro del lienzo se lista aparte en vez de forzarlo.**

1. **El contorno se deriva de Natural Earth** (`ne_110m_admin_0_countries`),
   que es **dominio público** y no exige atribución ni contagia licencia. Se
   descartaron los SVG de Wikimedia por ser **CC-BY-SA** (atribución y
   compartir-igual sobre una página comercial) y los bancos de vectores por no
   poder verificar la licencia. El polígono trae 170 puntos y queda en ~2 KB de
   `path` servido en el HTML: **cero dependencias nuevas, cero JavaScript**.
2. **Cada punto es un `<a>` real.** Se navega con teclado, lo lee un lector de
   pantalla y lo rastrea un buscador. Un `<canvas>` no hace ninguna de las tres.
3. **`proyectar()` devuelve `null` fuera del lienzo**, y esos destinos se pintan
   como una lista "Fuera de México" con su país. No se recorta ni se acomoda con
   calzador un punto que no pertenece al mapa.
4. **Las coordenadas NO dependen de `publicado`** (b096, `list_destinos_mapa()`).
   `publicado` gobierna el TEXTO editorial; la existencia del destino y dónde
   queda ya son públicas por el catálogo, que le da su propia página. Atarlas al
   mismo interruptor dejaba el mapa vacío sin motivo.
5. **Un destino sin coordenadas no es un punto**, y uno sin viajes publicados no
   se dibuja: el mapa es un índice del catálogo, no un atlas.

## Consecuencias

- El mapa cuesta ~2 KB y funciona sin JavaScript, en cualquier teléfono.
- Agregar un destino al mapa es teclear su latitud y longitud en el panel; no
  hay que tocar código.
- El ancho del SVG está topado para que no empuje las tarjetas fuera de la
  primera pantalla, algo que solo se vio mirando la captura.
- **Techo aceptado:** la proyección es equirectangular con corrección por la
  latitud media. Ubica bien a esta escala y no pretende ser cartografía; si
  algún día el mapa fuera la navegación principal, ahí sí se justifica una
  librería.
- Los destinos internacionales viven fuera del mapa por diseño. Si algún día
  fueran mayoría, la decisión se revisa con un ADR nuevo.

## Alternativas descartadas

- **three.js.** Descrito arriba: peso, nada rastreable, inaccesible sin lista
  paralela, y cuatro destinos.
- **SVG de Wikimedia Commons.** El archivo evaluado (`Mexico_Map.svg`, 148 KB)
  es CC-BY-SA 3.0: obliga a atribuir y a compartir igual. No para una página
  comercial que se puede evitar.
- **Una librería de mapas con teselas.** Peticiones a un tercero en cada carga,
  peso, y un mapa interactivo que nadie pidió para señalar cuatro puntos.
- **Dibujar un contorno a mano.** Sale inexacto y se nota; peor que no tenerlo.
- **Meter Medellín en el mapa de México.** Sería mentir sobre dónde está.

## Verificación

- `src/lib/marketing/mapa-mexico.test.ts` (6 casos): el trazo es cerrado y pesa
  menos de 6 KB; las cuatro ciudades mexicanas caen **dentro** del lienzo; el
  **norte queda arriba** (Ciudad Juárez sobre Creel, Creel sobre Mazatlán) y el
  **este a la derecha** (Ciudad Valles a la derecha de Creel) — anclas que
  cualquiera puede comprobar mirando un mapa; Medellín, Nueva York y Santiago
  devuelven `null` en vez de un punto forzado; y valores imposibles no revientan.
- `supabase/tests/paginas_destino.mjs` (24 aserciones, anónimo): el índice trae
  el mapa **como SVG del servidor** con el trazo inline, sus puntos son enlaces
  a destinos, y lleva descripción para lectores de pantalla. Si el mapa se
  moviera a JavaScript del cliente, esas aserciones salen en rojo.
