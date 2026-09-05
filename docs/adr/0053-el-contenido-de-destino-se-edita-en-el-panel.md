# ADR-0053 — El contenido de destino vive en tabla y se edita en el panel; la lista la sigue mandando el catálogo

- **Estado:** aceptada
- **Fecha:** 2026-09-05
- **Migración:** `b095_destinos_contenido_editable` (+ `b095b` con dos correcciones que encontró el harness)
- **Sustituye a:** el archivo `src/lib/marketing/destinos-contenido.ts`, eliminado
- **Toca:** `ketzal.destinos` (tabla nueva) · `ketzal.list_destinos_publicos()` ·
  `src/app/(ops)/destinos/**` (panel) · `src/app/viajes/data.ts` ·
  `src/app/viajes/[destino]/page.tsx` · `src/components/shell/nav-items.ts` ·
  `src/lib/access.ts` · `src/app/robots.ts`
- **Relacionadas:** [ADR-0051](0051-una-pagina-por-destino-generada-del-catalogo.md)
  (las páginas por destino), [ADR-0004](0004-tenancy-rls-por-agencia.md) (RLS),
  [ADR-0037](0037-el-admin-de-agencia-ve-a-sus-embajadores.md) (un guard
  DEFINER que devuelve de más no lo reporta nadie)

## Contexto

ADR-0051 dejó el contenido editorial de cada destino en un archivo del repo, con
un `ponytail:` que nombraba su propio disparador: *"el día que sean muchos, o que
Meny necesite editarlos sin pasar por un deploy"*. **El disparador se cumplió en
un día**: el fundador pidió un panel de administración para esas secciones.

Además pidió que el contenido se investigara, y que el mapa del índice sea de
México, mostrando los destinos extranjeros aparte pero visibles.

## Decisión

**El contenido editorial vive en `ketzal.destinos` y se edita en el panel; la
LISTA de destinos la sigue mandando el catálogo publicado.**

1. **La llave es el `slug`, no un uuid.** Es el mismo que `slugDestino()` calcula
   de la ciudad de destino del catálogo. Así la tabla y las páginas hablan de lo
   mismo sin una tabla de correspondencia.
2. **El panel no crea destinos.** Lista lo que el catálogo produce y llena su
   contenido. Una fila cuyo destino ya no tiene viajes se marca **huérfana** y
   solo entonces se puede borrar: desaparecer en silencio es peor que sobrar.
3. **Borrador y publicado.** Nada llega a la vitrina hasta que alguien lo
   publica. El texto investigado se sembró **como borrador**, a propósito.
4. **El público no toca la tabla.** RLS solo-superadmin para leer y escribir; el
   visitante lee `list_destinos_publicos()` (DEFINER), que filtra por `publicado`
   y **no devuelve columnas internas**.
5. **`pais` decide el mapa.** Lo que no es México se mostrará aparte, como fuera
   del mapa, en lugar de forzarlo dentro de uno donde no cabe (el catálogo tiene
   Medellín).
6. **El texto investigado no se publica solo.** Se puede documentar lo
   verificable —dónde está, distancia, qué visitar, temporada— pero el fundador
   y sus agencias son quienes han estado. Investigar produce un borrador; validar
   y publicar es de ellos.

## Consecuencias

- Editar un destino ya no necesita un despliegue.
- Un destino sin contenido publicado simplemente no pinta la sección: la página
  sigue siendo válida con solo los datos del catálogo.
- **Le toca al fundador**: revisar y publicar los cuatro borradores sembrados
  (`creel`, `ciudad-valles`, `mazatlan`, `medellin`), y completar la distancia
  real desde Ciudad Juárez, que solo conoce quien opera la ruta.
- El mapa del índice queda para su propio carril: necesita las coordenadas (ya
  hay columnas y están sembradas) y un trazo de México con licencia
  comprobada.

## Alternativas descartadas

- **Dejarlo en el archivo del repo.** Era lo correcto ayer con cuatro destinos y
  dejó de serlo en cuanto se pidió edición sin deploy. El `ponytail:` existía
  justamente para reconocer ese momento sin discutirlo de nuevo.
- **Administrar la lista de destinos a mano.** Duplicaría la verdad: el catálogo
  ya dice a dónde se viaja. Un destino escrito a mano sin viajes es una página
  vacía indexable, que ADR-0051 ya rechazó.
- **Lectura pública directa de la tabla con RLS.** Obliga a un GRANT a `anon` y
  a que la policy acierte sobre cada columna; el repo ya se quemó con eso
  (ADR-0006). El RPC expone exactamente lo que debe.
- **Publicar el texto investigado directamente.** Contenido genérico es lo que un
  buscador trata como relleno, y afirmar de primera mano lo que no se vivió es
  justo lo que ADR-0051 prohibió.

## Verificación

- `supabase/tests/destinos_contenido.sql` (`pnpm hard-test destinos_contenido`,
  12 aserciones, fixtures propias y revertidas): el RPC devuelve el publicado y
  **no el borrador**, y no expone `publicado`/`created_at`/`updated_at`; el
  **anónimo** no lee la tabla ni escribe; un **admin de agencia** no ve ninguna
  fila ni puede escribir; el **superadmin** lee, escribe, y al publicar el
  destino aparece en el RPC; media coordenada se rechaza; `que_visitar` que no
  sea arreglo se rechaza; y `updated_at` se mueve al editar.
- **Dos bugs reales que encontró ese harness**, y que una revisión a ojo no
  habría visto:
  1. El CHECK de coordenadas aceptaba **media coordenada**. Con `lat` puesta y
     `lng` nula, `lng between -180 and 180` es NULL y `true and NULL` es NULL —
     que un CHECK **acepta**. La rama ahora exige explícitamente que las dos sean
     NOT NULL.
  2. El trigger sellaba `updated_at` con `now()`, que es la hora de la
     **transacción**: editar una fila recién creada dejaba el sello idéntico.
     Ahora usa `clock_timestamp()`.
- `paginas_destino.mjs` 20/20, `aeo_superficie.mjs` 24/24 y `paginas_legales.mjs`
  17/17 siguen en verde tras mover el contenido del archivo a la BD, y
  `/destinos` responde 307 a `/login` sin sesión.
