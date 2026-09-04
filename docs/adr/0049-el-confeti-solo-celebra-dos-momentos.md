# ADR-0049 — El confeti celebra dos momentos y no más; `canvas-confetti` entra porque no viaja en el bundle inicial

- **Estado:** aceptada
- **Fecha:** 2026-09-04
- **Migración:** ninguna (no toca la BD)
- **Sustituye a:** ninguno
- **Toca:** `src/lib/confeti.ts` (nuevo) · `src/app/(ops)/dashboard/celebracion-arranque.tsx`
  (nuevo) + su montaje en `dashboard/page.tsx` · `components/shell/tour/`
  (`product-tour.tsx`, `tour-steps.ts`) · `app-shell.tsx` · `(ops)/layout.tsx` ·
  `package.json` (`canvas-confetti`) · `vitest.config.ts` (alias `@/`)
- **Relacionadas:** [ADR-0003](0003-monolito-sin-sobreingenieria.md) (dependencia
  nueva = decisión), [ADR-0043](0043-la-frontera-cliente-servidor-no-se-cruza-con-un-helper.md)
  y la regla de oro 11 (módulo hoja)

## Contexto

El fundador pidió mejorar el onboarding de agencias nuevas y poner confeti en la
bienvenida. Al revisar, casi todo existía: hay un tour con foco de 13 pasos que
se auto-abre la primera vez ([b064] y m005) y un checklist de arranque en el
Panel derivado del RPC `onboarding_agencia()`. Lo que faltaba era más fino.

Y una dependencia nueva por un adorno es justo el tipo de decisión que
[ADR-0003](0003-monolito-sin-sobreingenieria.md) manda documentar.

## Decisión

**1. El confeti celebra DOS momentos, y ninguno más.**

- **Estrenar el OS**: la apertura AUTOMÁTICA del tour, solo para `role='admin'`
  con `supplier_id`. Al reabrir con el botón "?" no dispara: si sale cada vez que
  alguien toca el botón deja de ser celebración y es ruido. Al agente invitado
  tampoco — su momento no es entrar, es su primera venta. Al superadmin tampoco:
  no estrena agencia.
- **Quedar listo para vender**: cuando "Primeros pasos" pasa de tener pendientes
  a cero. Es el momento que de verdad vale —la agencia pasó de no poder vender a
  poder hacerlo— y hasta ahora no se marcaba de ninguna forma: la tarjeta
  simplemente desaparecía del Panel.

**2. La celebración del checklist vive FUERA del checklist.** `ChecklistArranque`
solo se monta con `pendientes > 0`, así que al llegar a cero se desmonta y no
puede celebrar su propio final. Por eso `CelebracionArranque` es un componente
aparte que no pinta nada.

**3. Se celebra la TRANSICIÓN, no el estado.** Guardar solo "ya se celebró" no
basta: quien se une a una agencia ya lista vería confeti por un trabajo que no
hizo. Se compara contra los pendientes que este navegador vio la última vez, así
que solo festeja quien estaba viendo pendientes y ahora no. Un paso que se
deshace y se rehace vuelve a celebrar, que es el mismo criterio derivado del
checklist (si borras tu único servicio, el paso reaparece).

**4. `canvas-confetti` entra, con import dinámico.** No viaja en el bundle
inicial: se baja en el instante en que dispara, que ocurre dos veces en la vida
de una agencia. Medido en el build: quedó en su propio chunk de 11 KB y no
aparece ni en `main-app` ni en el layout de `(ops)`. Quien nunca vea confeti no
paga nada. El criterio general que deja: **una dependencia de adorno se acepta
si puede cargarse bajo demanda y su ausencia no rompe nada.**

**5. Respeta `prefers-reduced-motion` y nunca tumba la pantalla.** Quien pidió
menos animación no recibe partículas, y ahí ni siquiera se carga el módulo. Si el
import falla, se traga el error: la bienvenida y el Panel funcionan igual.

**6. El paso "Primeros pasos" deja de hablar en condicional.** Decía "si tu
agencia es nueva…" porque `adminOnly` también alcanza al superadmin, que no tiene
agencia y no ve la tarjeta. Ahora el paso se gatea con `conAgencia`, que sale de
`profiles.supplier_id` —ya leído por el layout, sin consulta extra— y habla en
directo. Un tour que duda de lo que muestra enseña menos.

## Alternativas descartadas

- **Escribir el confeti a mano** (~40 líneas de canvas): ahorra la dependencia
  pero hay que resolver DPI, limpieza del canvas y física, con riesgo de que se
  vea a tirones. Con carga bajo demanda la dependencia no le cuesta nada a quien
  no la ve, así que el ahorro era teórico.
- **Marcar la celebración en la BD** (columna en `suppliers`): migración sobre BD
  compartida para un adorno. El techo de hacerlo por navegador queda anotado con
  un comentario `ponytail:` en el componente.
- **Confeti también para el agente invitado**: diluye el momento. Se deja
  anotado que su celebración natural es la primera venta, no el primer login.
- **Reescribir el tour entero para agencias nuevas**: es otro trabajo, con otro
  alcance. Este ADR no lo cierra ni lo descarta.

## Consecuencias

- La marca de la celebración del checklist es **por navegador**: quien lo termine
  en la computadora y abra el Panel en el celular no ve confeti allá (correcto),
  pero tampoco lo ve si lo termina justo en un navegador nuevo (aceptable para un
  adorno).
- `vitest.config.ts` gana el alias `@/`. Hasta hoy **ningún test cruzaba un import
  con alias**, así que el hueco estaba tapado por casualidad: el primero que lo
  intentó murió con `Cannot find package '@/lib/confeti'`. Es aditivo y no cambia
  cómo resuelve lo demás.

## Verificación

- `src/lib/confeti.test.ts`: *"sin window (SSR) dice que sí"*, *"lee la
  preferencia del sistema"*, *"si matchMedia revienta, no bloquea"*, *"no anima
  —ni carga el módulo— si se pidió menos movimiento"*, *"es adorno: si el módulo
  falla, devuelve false y NO lanza"*.
- `src/app/(ops)/dashboard/celebracion-arranque.test.ts`: *"celebra la
  transición"*, *"NO celebra a quien llega a una agencia ya lista"*, *"NO celebra
  dos veces"*, *"NO celebra mientras siga faltando algo"*.
- **Medido en el navegador** (2026-09-04) con una agencia efímera y dos cuentas,
  limpieza verificada en cero: el admin de la agencia nueva **pide el chunk del
  confeti y ve 14 pasos**; el superadmin **no lo pide y ve 13**. Esa diferencia
  de exactamente un paso es `primeros-pasos` gateado por `conAgencia`.
  `CelebracionArranque` quedó montado y anotó los 7 pendientes de la agencia.
- Build: el chunk del confeti no aparece en `main-app` ni en el layout de `(ops)`.
