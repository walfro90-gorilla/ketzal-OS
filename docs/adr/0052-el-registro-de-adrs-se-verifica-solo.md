# ADR-0052 — El registro de ADRs se verifica solo, y solo mira enlaces

- **Estado:** aceptada
- **Fecha:** 2026-09-05
- **Migración:** ninguna (no toca la BD)
- **Sustituye a:** ninguno
- **Toca:** `supabase/tests/correr.mjs` (guard nuevo al final)
- **Relacionadas:** [ADR-0001](0001-registro-de-decisiones.md) (el índice es la
  puerta de entrada), [ADR-0023](0023-fixtures-efimeras-en-los-hard-tests.md)
  y [ADR-0034](0034-la-verificacion-nombra-su-prueba.md) (nada pasa en verde sin
  poder correrse)

## Contexto

El número de ADR se **elige** al abrir el carril y se **usa** al mergear. Entre
esos dos momentos cabe otro agente. El 2026-09-04 dos carriles tomaron el 0049 a
la vez; al renumerar uno con un reemplazo ciego quedó `[ADR-0050](adr/0049-…)`:
el enlace resuelve y la etiqueta miente. Nada falla, nada se ve, el documento
renderiza igual. Se cazó porque el agente que lo hizo lo confesó.

Es el mismo modo de falla que ya ataja el guard del conteo de hard-tests (PR
#135, sin ADR propio): dos carriles editando un contador compartido sin verse.
La diferencia es que aquí el contador es el nombre del archivo.

## Decisión

**El corredor de hard-tests verifica el registro de ADRs al final de cada
corrida, y sale en rojo si el mapa miente sobre sí mismo.** Cuatro casos, cada
uno nacido de un error real:

1. **Números duplicados** entre archivos de `docs/adr/`.
2. **Enlace a un ADR que no existe.**
3. **ADR que existe y no tiene fila en `docs/adr/README.md`.** Este es el que
   nadie ve, porque todos los enlaces funcionan: el ADR simplemente es invisible
   para quien lee el índice, que es la puerta de entrada del proyecto.
4. **Etiqueta que no coincide con su destino** (`[ADR-0050](adr/0049-…)`). Ningún
   verificador de enlaces lo detecta, porque el enlace resuelve.

**Solo se verifican ENLACES markdown, nunca menciones en prosa.** Esta es la
decisión que importa, y viene de que el primer diseño de este guard nació con un
falso positivo del tipo peligroso.

`docs/MARKETING_STACK_HUELLA.md` es un documento de transferencia escrito por el
agente de **otro repo** (`estampida`), y cita entre backticks
`docs/adr/0017-medicion-server-first.md`. Ese archivo existe — allá. Un barrido
por forma-de-ruta lo marcaba roto, y el "arreglo" obvio (renumerar a 0025, que es
el ADR de medición de ESTE repo) metía una mentira en un dato correcto.

La distinción es semántica y no una lista de excepciones, que se pudre y hay que
mantenerla: **un enlace es una promesa de navegar dentro de este repo; una
mención entre backticks es texto, y puede hablar de cualquier máquina del
mundo.** Los enlaces se resuelven desde la carpeta del archivo que enlaza (así
funcionan igual `adr/NNNN` desde BITACORA, `docs/adr/NNNN` desde CLAUDE.md y
`NNNN` desde el propio índice), y se descartan destinos absolutos o con `~`.

**Cada hallazgo dice POR QUÉ considera propia esa referencia** ("es un enlace
markdown relativo, resuelto desde X"). El peligro de un guard no es que falle:
es que acierte con autoridad sobre algo que no entendió. Quien lea el error tiene
que poder discutirlo, no solo obedecerlo.

**Si no puede leer lo que barre, avisa y no falla.** Un chequeo de inventario
documental jamás debe impedir que corran las pruebas de dinero.

## Alternativas descartadas

- **Lista de excepciones** para las citas a otros repos: se pudre, y la mantiene
  quien no sabe que existe.
- **Verificar también menciones en prosa**: es justo lo que produjo el falso
  positivo. Una mención no promete nada.
- **Un harness `.mjs` aparte**: sumaría al conteo de hard-tests y necesitaría su
  propia entrada; el guard no toca la BD ni la app, así que vive donde ya está el
  del inventario de `CLAUDE.md`.

## Consecuencias

- Un ADR nuevo que se olvide de su fila en el índice sale en rojo en la siguiente
  corrida, no meses después.
- **Techo aceptado: una referencia PROPIA escrita en backticks no se verifica.**
  Es el precio de la regla anterior, y se paga a sabiendas. Medido el 2026-09-05:
  en todo el repo hay exactamente dos referencias a ADR en backticks —
  `docs/MARKETING_STACK_HUELLA.md:10` (la de `estampida`, que el guard hace bien
  en ignorar) y `docs/WORKTREES.md:43` → `docs/adr/0014-migraciones-bd-fuente.md`,
  que **sí es de este repo y existe**. Hoy el punto ciego no muerde, pero esa
  segunda línea es la forma exacta del fallo futuro: si alguien renumera el 0014,
  se pudre en silencio. Cubrirlo devolvería el falso positivo de `estampida`, así
  que se prefiere el punto ciego. **Si una referencia importa, se escribe como
  enlace.**
- El guard no puede detectar un ADR **mal escrito** o que contradiga a otro. Solo
  verifica que el mapa no mienta sobre sí mismo; el contenido sigue siendo
  trabajo de quien lee.
- Los agentes acordaron además **avisar en el canal antes de tomar un número**.
  El guard cubre el caso en que ese acuerdo falle.

## Verificación

`supabase/tests/correr.mjs`, probado por mutación (2026-09-05), midiendo el
código de salida real y dejando el árbol limpio después de cada una:

| mutación | resultado |
|---|---|
| dos archivos con el número 0049 | rojo, nombra los dos archivos |
| enlace a `adr/0049-archivo-que-no-existe.md` | rojo, con archivo y línea |
| se borra la fila del 0051 del índice | rojo, "invisible para quien lee el índice" |
| `[ADR-0050](adr/0049-el-confeti…)` | rojo, "el enlace resuelve, el texto miente" |
| `docs/adr/README.md` ausente | ⚠ y código de salida **0** |
| `docs/adr/` ausente | ⚠ y código de salida **0** |

Sobre el repo sano el guard calla, y **no menciona la cita a estampida ni una
vez** — que es el falso positivo que este ADR existe para evitar.
