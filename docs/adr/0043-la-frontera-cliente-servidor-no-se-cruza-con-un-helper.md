# ADR-0043 — La frontera cliente/servidor no se cruza con un helper, y un 200 no prueba que la página funcione

- **Estado:** aceptada
- **Fecha:** 2026-09-03
- **Migración:** `b093_las_cuentas_efimeras_no_salen_en_las_listas.sql`
- **Sustituye a:** ninguno
- **Toca:** `src/components/data/format.ts` (`fmtFecha`) ·
  `src/app/(ops)/usuarios/usuarios-list.tsx` · `src/app/(ops)/usuarios/[id]/page.tsx` ·
  `src/components/data/stat-tile.tsx` (nuevo) · `ketzal.list_users` ·
  `ketzal.list_team` · `ketzal.es_cuenta_efimera` (nueva) ·
  `supabase/tests/expediente_usuario.mjs` (nuevo)
- **Relacionadas:** [ADR-0023](0023-fixtures-efimeras-en-los-hard-tests.md)
  (las cuentas efímeras), [ADR-0034](0034-la-verificacion-nombra-su-prueba.md)
  (la verificación nombra su prueba), [ADR-0037](0037-el-admin-de-agencia-ve-a-sus-embajadores.md)
  (una pantalla que miente en vacío)

## Contexto

El fundador reportó que abrir el expediente de un usuario desde `/usuarios`
fallaba: *"no se encuentra, al parecer no existe o no está ruteado"*.

La primera ronda de medición dijo que no había nada roto: los 9 perfiles de
producción respondían **200** al expediente, con superadmin y con admin de
agencia, en local y en producción; los logs de Vercel no traían un solo 4xx en
665 respuestas. Todo verde y el bug seguía ahí.

Estaba ahí porque **el 200 era mentira**. La página tiraba una excepción de
servidor y Next devolvía su pantalla *"This page couldn't load"* con status 200
en el camino RSC. Sólo se vio abriéndola en un navegador de verdad:

```
Attempted to call fmtFecha() from the server but fmtFecha is on the client.
```

`fmtFecha` vivía dentro de `usuarios-list.tsx`, que es `'use client'`, y el
expediente —Server Component— la importaba y la **llamaba**. Existía así desde
b066 (2026-08-23): la sección nunca había funcionado y nadie lo notó, porque
`/usuarios` sí abría y nada en CI mira una página renderizada.

Encima había un segundo camino al mismo síntoma: las cuentas efímeras de los
hard-tests (`qa.efimero.…`, [ADR-0023](0023-fixtures-efimeras-en-los-hard-tests.md))
salían en `/usuarios` y en `/equipo` como cualquier persona. Viven segundos: a
quien le diera clic a una después de que la fixture la borró, `user_account_detail`
le devolvía null y la página tiraba un 404 mudo — *"esa cuenta no existe"*.

## Decisión

**1. Un módulo `'use client'` no exporta funciones que un Server Component
llame.** Los formateadores compartidos viven en `src/components/data/format.ts`,
que no declara `'use client'` y por eso lo pueden importar los dos lados —para
eso nació. `fmtFecha` se mudó ahí.

**2. Un harness de página verifica CONTENIDO, no status.** Comprobar `200` no
distingue una página renderizada de la pantalla de error de Next. Se exige que
el HTML traiga lo que la página pinta de verdad, y se pide la página de las dos
formas en que un usuario llega: URL directa y clic desde la lista (cabecera
`RSC: 1`).

**3. Las cuentas efímeras no salen en las listas de gente.** Un predicado
compartido, `ketzal.es_cuenta_efimera(text)`, en `list_users` y en `list_team`
(b093). El prefijo es criterio seguro: `_fixtures.mjs` lo eligió para que
"ninguna cuenta real pueda llevarlo jamás", y el barrido de restos ya borra por
él.

**4. El expediente explica en vez de dar un 404 mudo.** Un id que no existe —o
que no es del alcance de quien pregunta— pinta una tarjeta que lo dice y ofrece
volver a la lista. **No se distingue** "no existe" de "no es de tu alcance": el
RPC devuelve null en los dos casos y separarlos delataría de quién hay cuenta en
otra agencia. La puerta de la sección (`assertAdmin`) sigue dando 404 a quien no
es admin.

## Alternativas descartadas

- **Re-exportar `fmtFecha` desde un archivo servidor que importe el cliente.**
  Mueve el problema: el módulo cliente se sigue arrastrando al bundle del
  servidor. La función es pura; su lugar es el módulo que ya es de los dos.
- **Marcar `usuarios-list.tsx` como servidor.** Es un componente con estado y
  eventos; no puede serlo.
- **Filtrar las cuentas efímeras en cada pantalla.** Dos pantallas hoy y la
  siguiente que se escriba se olvida. El predicado va en la BD, donde están los
  dos llamadores.
- **Confiar en los logs de Vercel para detectar esto.** Se probó: 665 respuestas
  y cero 4xx con la página rota. Una excepción servida como 200 no aparece en un
  tablero de status.

## Verificación

`supabase/tests/expediente_usuario.mjs` (7 casos; `pnpm hard-test expediente`,
necesita `supabase` + la app viva). Crea un superadmin efímero, entra por HTTP
con su cookie y lo borra verificando.

- **Frontera cliente/servidor:** `'todos los expedientes abren por URL directa'`
  y `'todos los expedientes abren por clic desde la lista (RSC)'` piden **cada**
  expediente que la lista enlaza y exigen que el HTML traiga las tres marcas que
  la página pinta (`Expediente completo`, `Qué ha hecho`, `Cuenta de acceso`).
- **b093:** `'la cuenta efímera NO sale en la lista (b093)'` mira **sólo** los
  enlaces `/usuarios/<uuid>` — buscar el correo en todo el HTML da rojo falso
  porque el menú de cuenta del shell lo pinta.
- **404 mudo:** `'un id inexistente explica en vez de dar 404 mudo'`.
- **Diseño:** `'la lista trae su tira de resumen'`.

**Probado por mutación** (2026-09-03): devolver el import viejo
(`import { fmtFecha } from '../usuarios-list'`) pone en rojo los dos casos de
expediente — **con status 200 en los 8 ids**. Ese detalle es la razón de ser de
la decisión 2: una verificación anterior que sólo miraba el status dio verde con
el bug puesto.
