# ADR-0035 — Un hard-test nunca commitea, y nunca borra por predicado

- **Fecha:** 2026-09-01
- **Estado:** aceptada
- **Amplía:** [ADR-0023](0023-fixtures-efimeras-en-los-hard-tests.md) ·
  [ADR-0034](0034-la-verificacion-nombra-su-prueba.md)
- **Contexto de código:** `supabase/tests/correr.mjs` ·
  `supabase/tests/embajadores_rls.sql`
- **Verificación:** `pnpm hard-test embajadores_rls` (14/14) y **dos** guards en
  el corredor: rechaza con `NO CORRIÓ` cualquier `.sql` que traiga `commit`, y
  —el que de verdad protege— **abre y revierte él mismo la transacción** de cada
  `.sql`, así que no depende de que el harness lance. Probado con un harness
  hostil a propósito (escribe y se traga su error): 0 filas escaparon.
  *(Nota de 2026-09-01, mismo día: la decisión no cambió; se le añadió el
  segundo guard tras el segundo escape, cuando quedó claro que un
  `exception when others` que se traga el error deja COMMITEAR. Se actualiza el
  puntero de Verificación, no la decisión — que un ADR nombre una prueba
  incompleta es justo la deriva que ADR-0034 vino a cerrar.)*

## Contexto

**Incidente, 2026-09-01: se perdieron datos de producción corriendo la suite.**

Al encender el lado SQL de `pnpm hard-test` (ADR-0034), `embajadores_rls.sql`
borró las **dos tarifas reales de embajador** del fundador — $250/pax de
Wanderlust y de Border, capturadas ese mismo día. Se restauraron en cuanto se
detectó; nada más se perdió (encuestas, votos, ventas, asientos y pagos quedaron
intactos, verificado).

Tres decisiones del harness se combinaron para lograrlo:

1. **Hardcodeaba los ids REALES** de Wanderlust y Border, y les insertaba
   tarifas de prueba.
2. **Limpiaba por predicado**: `delete from commission_rules where
   payee_type='embajador' and scope_supplier_id in (v_wl, v_bo)` — que no
   distingue entre lo que el harness creó y lo que ya estaba ahí.
3. **Terminaba en `commit`.**

Cualquiera de las tres sola es recuperable. Las tres juntas son pérdida de datos
silenciosa: la corrida se reportó **verde**.

Y se reportó verde por un cuarto motivo, del corredor: el harness declara sus
fallas como filas `'ROTO: …'`, `'HUECO: …'`, `'SUCIO: …'`, `'INVALIDO: …'`, y el
detector solo miraba `'FALLA:'`.

## Decisión

**Un hard-test `.sql` termina en `rollback`. Nunca en `commit`.**

Lo hace el corredor, no la buena voluntad: **se niega a ejecutar** cualquier
`.sql` que contenga una sentencia `commit` y lo reporta como `NO CORRIÓ` con el
motivo. Preferimos no correr un harness a dejarlo escribir en producción.

Con `rollback`, la limpieza deja de existir como problema: no hay nada que
limpiar, así que no hay borrado por predicado que pueda equivocarse de fila.

**Corolarios:**

- **Un harness crea sus propias agencias, servicios y personas.** Nunca opera
  sobre filas reales, ni siquiera para leerlas como escenario. `embajadores_rls`
  ahora levanta tres agencias QA — incluida una **sin tarifa a propósito**,
  porque el caso «agencia sin tarifa no devenga» antes tomaba «cualquier otra
  agencia del catálogo» y daba un hueco falso el día que esa otra sí tenía
  tarifa. Misma enfermedad que clavar cifras del catálogo (ADR-0023).
- **El vocabulario de fracaso es una lista, no una palabra.** Vive en
  `VEREDICTO_MALO` dentro del corredor: `FALLA`, `ROTO`, `HUECO`, `SUCIO`,
  `INVALIDO`. `INVALIDO` cuenta como fracaso a propósito — significa que el caso
  no llegó a probar el guard, y un guard sin probar no es un guard verificado.

## Consecuencias

- Los harness que necesitan escribir de verdad y no pueden revertir
  (`hard_testing_dinero.sql`, `volumen_y_clawbot.sql`) quedan como `NO CORRIÓ`
  hasta que se porten. Es el resultado honesto: hoy nadie verifica eso.
- Verificar «sin residuo» **no es suficiente**. Tras la corrida se contó lo que
  había de más y todo cuadró; nadie contó lo que faltaba. Una comprobación de
  limpieza detecta lo que el test **agregó**, nunca lo que **borró**. Con
  `rollback` la pregunta desaparece.
- Este ADR no arregla los `.mjs`, que usan la Admin API y no pueden transaccionar
  — ahí el contrato sigue siendo el de ADR-0023: fixtures efímeras que se borran
  solas y **verifican** que quedaron limpias.

## Alternativas descartadas

- **Arreglar solo el `delete` para que borre por id.** Corrige este harness y
  deja viva la clase de bug: el siguiente que commitee vuelve a poder tocar datos
  reales. La prohibición es la que compra algo.
- **Correr los hard-tests contra una copia de producción.** Es la solución de
  fondo y sigue pendiente (un proyecto Supabase de staging). Mientras no exista,
  `rollback` es lo que hace seguro correrlos donde hay datos reales.
- **Confiar en el `.gitignore` mental de «no corras ese».** Es exactamente cómo
  la suite se pudrió: dependiendo de que alguien se acuerde.
