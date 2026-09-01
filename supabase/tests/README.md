# Hard-tests

Pruebas contra lo real: la BD real, la API real, la app real. **Lint, typecheck y
`pnpm test` son el piso, no la evidencia** — un invariante de dinero o de RLS no
lo prueba una función pura.

```bash
pnpm hard-test                              # todo lo que se pueda correr
pnpm hard-test embajador                    # solo los que casen con el texto
APP=http://localhost:3100 pnpm hard-test    # incluye los que necesitan la app
```

## La regla del corredor: nunca saltarse algo en silencio

Un harness que **no se puede** correr no sale en verde: sale como `NO CORRIÓ`
con su motivo, y el proceso termina en rojo igual que si hubiera fallado.

No es purismo. Es el modo de falla que ya mordió tres veces (ADR-0023):
`policy_services_posiciones.mjs` murió con la limpieza del 2026-08-23,
`encuestas_rls.mjs` con la del 2026-08-30, y `concurrencia.mjs` lleva desde
agosto con la contraseña de unas cuentas borradas. Ninguno avisó. Un tablero que
miente en verde es peor que no tener tablero.

Por eso `NO CORRIÓ` y `FALLÓ` son estados **distintos**: si un problema de
conexión se reporta como fallo, mañana alguien "arregla" el harness en vez de
arreglar la conexión.

## Qué necesita cada cosa

| Requisito | Cómo se cumple |
|---|---|
| `supabase` | `.env.local` con `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` |
| `app` | `pnpm build && pnpm start -p 3100`, y correr con `APP=http://localhost:3100` |
| `build` | `pnpm build` (los ids de server action salen de `.next/`) |
| `db` | `DATABASE_URL` en `.env.local`: la cadena de conexión de Postgres |

## Contrato: cómo se señala el resultado

- **`.mjs`** → código de salida. `0` = pasó. Imprime `✔`/`✘` por aserción.
- **`.sql`** → dos formas válidas, ambas las lee el corredor:
  - **estilo rollback** (preferido): todo dentro de un `DO $$ … $$` que **termina
    a propósito** en `raise exception '… % pasaron, % fallaron …'`, para que
    Postgres revierta la transacción completa. Pasa si el mensaje dice
    `0 fallaron` (o `0 fail`). Es la única forma de probar sobre tablas
    append-only: no se pueden borrar, pero sí revertir.
  - **estilo notice**: no lanza nada si todo va bien, `raise exception` si algo
    falla. Sirve para pruebas read-only.

Los datos de prueba se crean y se borran **verificando** que quedaron limpios
(fixtures efímeras, `_fixtures.mjs`, ADR-0023). Ninguna contraseña se imprime.

## Alta de un harness nuevo

Declararlo en la tabla `HARNESS` de `correr.mjs` con **qué necesita**, **qué ADR
defiende** y **qué afirma**. No es burocracia: un archivo suelto en esta carpeta
sale como `NO CORRIÓ — sin declarar`, precisamente para que no se vuelva
invisible.

Y al revés (ADR-0034): un ADR que afirma un invariante de runtime tiene que
nombrar, en su sección **Verificación**, el archivo y la aserción que lo prueban.
