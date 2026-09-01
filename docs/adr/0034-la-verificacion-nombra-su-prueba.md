# ADR-0034 — La verificación de un ADR nombra su prueba, y todo harness corre con un comando

- **Fecha:** 2026-09-01
- **Estado:** aceptada
- **Amplía:** [ADR-0001](0001-registro-de-decisiones.md) (proceso ADR) ·
  [ADR-0023](0023-fixtures-efimeras-en-los-hard-tests.md) (fixtures efímeras)
- **Contexto de código:** `supabase/tests/correr.mjs` · `pnpm hard-test` ·
  `supabase/tests/README.md`
- **Verificación:** `pnpm hard-test` — su propia corrida es la prueba: reporta
  `PASÓ / FALLÓ / NO CORRIÓ` por harness y termina en rojo si algo no corrió.

## Contexto

Construyendo el programa de embajadores nos apoyamos en una garantía que un ADR
afirmaba y **el código no cumplía**: ADR-0022 dice que el auto-referido está
bloqueado, pero el guard vivo solo comparaba `sold_by`, que en el portal
**siempre es null**. La afirmación llevaba meses siendo falsa y nadie lo supo,
porque nada la ejecutaba.

Al medirlo, el mecanismo quedó claro:

- **CI no corría ni uno de los 22 hard-tests.** Solo `tsc`, `pnpm test` (vitest
  sobre funciones puras) y `build`. Todo `supabase/tests/` se corría de memoria,
  archivo por archivo, cuando alguien se acordaba.
- **9 de 33 ADRs nombraban un harness.** La sección "Verificación" de la
  plantilla acepta prosa: *"probado contra la BD real"* cuenta como verificación
  y no ejecuta nada.
- La primera corrida del corredor destapó **2 harness podridos en silencio**:
  `concurrencia.mjs` (ADR-0008, cupos) traía hardcodeada la contraseña de unas
  cuentas QA borradas en agosto, y `carreras_dinero.mjs` (ADR-0006, ledger)
  depende de una sesión de MCP y de fixtures sembradas a mano.

El problema de fondo no es que los ADRs se desfasen. **Un ADR siempre va a poder
mentir**: es registro de decisión, no especificación, y nada lo ata al código.
Pedir "revisemos que concuerden" arregla el día de hoy y en tres meses volvemos
al mismo lugar.

## Decisión

**Los invariantes se vuelven ejecutables, para que el desfase truene solo en vez
de esperar a que alguien lea.** Dos reglas:

1. **`pnpm hard-test` corre todos los harness.** Un comando, no 22 recordados.
   El corredor declara, por harness, qué necesita para correr, qué ADR defiende
   y qué afirma.
2. **Un ADR que afirma un invariante de runtime nombra, en su sección
   "Verificación", el archivo y la aserción que lo prueban.** Prosa como
   "probado contra la BD real" deja de contar. Un ADR que afirma un invariante y
   no puede nombrar quién lo prueba está declarando que nadie lo prueba — y eso
   es lo que hay que ver antes de mergear, no seis meses después.

No aplica a los ADRs que solo eligen un camino ("monolito sobre microservicios",
"MXN autoritativo", "estrategia en dos tiempos"): esos no afirman nada que el
código pueda dejar de cumplir. Aplica a los que dicen **"esto está bloqueado"**,
**"esto es imposible"**, **"siempre pasa Z"**.

**Corolario que cambia el default: `NO CORRIÓ` es rojo.** Un invariante que nadie
verificó no es un invariante verificado, y se reporta aparte de `FALLÓ` — si un
problema de conexión se reporta como fallo, mañana alguien "arregla" el harness
en vez de arreglar la conexión.

## Consecuencias

- La corrida del corredor **es** el mapa de cobertura: qué invariante defiende
  cada harness, con su ADR. No hay un segundo documento que mantener al día.
- Un archivo nuevo en `supabase/tests/` que nadie declaró sale como
  `NO CORRIÓ — sin declarar`. No puede volverse invisible.
- **Hoy el tablero está en rojo, y eso es el resultado correcto**: 9 pasan, 2
  están podridos y 10 no pueden correr por falta de `DATABASE_URL`. Antes de
  este ADR el mismo estado se veía como "no hay nada que reportar".
- Escribir un ADR cuesta un poco más: hay que tener la prueba antes de declarar
  la decisión. Es el punto.

## Lo que este ADR NO decide

- **Meter los hard-tests en CI.** Requiere `SUPABASE_SERVICE_ROLE_KEY` — la
  llave que salta toda la RLS — como secreto de GitHub Actions, donde cualquiera
  con permiso de escritura puede exfiltrarla desde un workflow en un PR. Y no hay
  staging: correrían contra producción. Queda para cuando exista un proyecto
  Supabase de pruebas, o como `workflow_dispatch` manual. Decisión del fundador,
  no de un carril.
- **Rescatar los 2 harness podridos.** Ambos verifican invariantes que valen
  (cupos y concurrencia del ledger) y hay que portarlos a fixtures efímeras;
  es trabajo aparte. Lo que este ADR garantiza es que ya **se ven**.

## Alternativas descartadas

- **Auditar los 33 ADRs contra el código.** Caro, y arregla el día de hoy nada
  más: no deja nada que impida el próximo desfase. Si se hace, que sea sobre los
  ~7 que afirman invariantes de runtime y no tienen prueba, y **después** de que
  el corredor exista.
- **Un documento de cobertura** (`VERIFICACION.md`) con la tabla
  invariante → ADR → harness. Es un mapa que se desfasa igual que los ADRs, por
  la misma razón: nada lo ejecuta. La tabla vive en el corredor, que sí corre.
- **Que el corredor salte lo que no puede correr y salga en verde.** Es
  literalmente el bug que estamos arreglando, con mejor presentación.
