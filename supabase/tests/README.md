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
- **`.sql`** → tres formas, las tres las lee el corredor:
  - **estilo rollback** (preferido): todo dentro de un `DO $$ … $$` que **termina
    a propósito** en `raise exception '… % pasaron, % fallaron …'`, para que
    Postgres revierta la transacción completa. Es la única forma de probar sobre
    tablas append-only: no se pueden borrar, pero sí revertir.
    **La excepción no es el fallo** — el fallo es el conteo que trae dentro, y
    cada harness lo redacta a su manera. Los "cero" que el corredor reconoce
    viven en `EXITO_EN_EXCEPCION` (`0 fallaron` / `0 fail` / `VIOLACIONES (0)`).
    Un redactado nuevo que no case sale **en rojo**: es el default correcto.
  - **estilo notice**: no lanza nada si todo va bien, `raise exception` si algo
    falla. Sirve para pruebas read-only.
  - **estilo veredicto**: `begin; … rollback;` y devuelve una tabla con
    `'OK: …'` / `'FALLA: …'` por caso. No lanza nada al fallar, así que el
    corredor **lee las filas**. El vocabulario de fracaso es una lista, no una
    palabra (`VEREDICTO_MALO`): `FALLA`, `ROTO`, `HUECO`, `SUCIO`, `INVALIDO`.
    El último cuenta como fracaso a propósito — significa que el caso no llegó a
    probar el guard, y un guard sin probar no es un guard verificado.

**Un `.sql` NUNCA commitea (ADR-0035).** El corredor **se niega a ejecutar** uno
que traiga una sentencia `commit` y lo reporta como `NO CORRIÓ`. Corren contra
producción: si commitean, lo que hagan se queda. `embajadores_rls.sql` commiteaba
y limpiaba por predicado — el 2026-09-01 se llevó las dos tarifas reales de
embajador del fundador, y la corrida salió **verde**. Con `rollback` no hay nada
que limpiar, así que no hay predicado que pueda equivocarse de fila.

Corolario: **un harness crea sus propias agencias, servicios y personas.** Nunca
opera sobre filas reales, ni de escenario. Y verificar "sin residuo" no basta:
detecta lo que el test **agregó**, nunca lo que **borró**.

**Higiene de sesión**: la conexión se reusa entre harness, así que antes de cada
uno el corredor manda `rollback` y `discard all`. Sin lo primero, un harness que
aborta su transacción envenena la sesión y **los siguientes fallan en cascada**
con *"current transaction is aborted"* (seis falsos rojos por culpa del primero).
Sin lo segundo se arrastran las tablas temp — dos harness crean `temp table qa` —
y, peor, un `set role authenticated` colgado de un harness que murió a media: el
siguiente correría suplantando a alguien.

## Harness que hoy NO corren, y por qué

| Harness | Estado |
|---|---|
| `concurrencia.mjs` | Contraseña QA borrada, hardcodeada. Portar a `_fixtures.mjs` |
| `carreras_dinero.mjs` | Depende de una sesión de `ketzal-mcp` y de fixtures a mano |
| `comisiones_motor.sql` | Usa `marketplace_customers`, tabla **eliminada** en el refactor de identidad (b025) |
| `hard_testing_dinero.sql` · `volumen_y_clawbot.sql` | Dependen de `qa_setup.sql` **y no revierten**. Correrlos sembraría agencias QA en producción, que es justo lo que ADR-0023 vino a terminar ⇒ el requisito `qa-setup` **nunca** está disponible, a propósito |

Los datos de prueba se crean y se borran **verificando** que quedaron limpios
(fixtures efímeras, `_fixtures.mjs`, ADR-0023). Ninguna contraseña se imprime.

## Alta de un harness nuevo

Declararlo en la tabla `HARNESS` de `correr.mjs` con **qué necesita**, **qué ADR
defiende** y **qué afirma**. No es burocracia: un archivo suelto en esta carpeta
sale como `NO CORRIÓ — sin declarar`, precisamente para que no se vuelva
invisible.

Y al revés (ADR-0034): un ADR que afirma un invariante de runtime tiene que
nombrar, en su sección **Verificación**, el archivo y la aserción que lo prueban.
