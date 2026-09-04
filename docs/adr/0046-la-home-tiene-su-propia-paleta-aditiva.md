# ADR-0046 — La home tiene su propia paleta (jade sobre canvas oscuro), aditiva; el OS conserva La Estela

- **Estado:** aceptada
- **Fecha:** 2026-09-03
- **Migración:** ninguna (solo vista)
- **Sustituye a:** ninguno
- **Toca:** `src/app/globals.css` (bloque `@theme inline` nuevo) ·
  `src/components/marketing/fonts.ts` (Inter) · `src/app/styleguide/page.tsx` ·
  `src/lib/contraste.ts` (+ test)
- **Relacionadas:** [ADR-0043](0043-la-frontera-cliente-servidor-no-se-cruza-con-un-helper.md)
  (`contraste.ts` es un módulo hoja puro), [ADR-0034](0034-la-verificacion-nombra-su-prueba.md)
  (los ratios se miden en un test, no se declaran)

## Contexto

La home de `ketzal.tours` se rediseña por la spec del fundador
`KETZAL_HOME_REDESIGN.md` (septiembre 2026). La spec fija una paleta medida del
logo (67 % jade `#009F7D`, 30 % verde `#05AE51`, 2 % rojo `#DC0419`), un canvas
oscuro `#081512`, Inter como cuerpo y una tabla de contraste "medida, no
estimada". El comprador es el dueño de una agencia chica que abre el sitio desde
el celular; la audiencia secundaria inmediata es un censo de startups.

El OS ya tiene un sistema de tokens: **La Estela** (`globals.css`, `:root` +
`.dark` + `@theme inline`), claro por defecto, con `--primary` `#00805F`,
Bricolage como display y Geist como cuerpo. Lo usan todas las pantallas de
dinero en producción. La spec dice explícitamente: la app autenticada no se
toca, y si un cambio de tokens la afecta, avisar antes de propagar.

Dos hechos técnicos acotan la solución:

1. Tailwind 4 es CSS-first: no hay `tailwind.config`; los tokens viven en
   `@theme`. Un token nuevo genera utilidades nuevas y no toca ninguna regla
   existente. Redefinir `--background` o `--primary` sí toca todo.
2. `next/font` inyecta el `@font-face` solo en las páginas que montan un
   componente que lo importa. Cargar Inter en el layout raíz la descargaría en
   cada pantalla del OS; cargarla en un módulo hoja de marketing, no.

## Decisión

1. **Tokens aditivos, nombres nuevos.** Un segundo bloque `@theme inline` en
   `globals.css` define `--color-jade-50…950`, `--color-canvas`,
   `--color-surface-1/2`, `--color-hairline(-strong)`, `--color-hi/mid/low`,
   `--color-signal`, `--color-alert`, la escala `--text-display-xl … caption`
   (con line-height, tracking y peso), `--radius-card/panel/pill`,
   `--spacing-section(-lg)` y `--font-body`. **Ningún token de La Estela se
   redefine.** El OS renderiza byte a byte igual.
2. **Frontera de uso.** La paleta jade la consumen solo
   `src/components/marketing/*` y `/styleguide`. El OS no la importa; la home
   no importa componentes del OS que carguen tokens semánticos (`bg-primary`,
   `buttonVariants`): sus CTAs se escriben con `bg-jade-600 text-canvas`.
   `BrandMark` (hereda `currentColor`) y el footer público sí cruzan.
3. **Inter en módulo hoja.** `components/marketing/fonts.ts` exporta `inter`
   con `variable: '--font-inter'`; el wrapper de cada página de marketing lleva
   `inter.variable` y `font-body`. El `@theme` es `inline` para que
   `font-body` resuelva la variable donde el wrapper la define, no en `:root`.
   Bricolage se queda con 500/600/700: la escala solo usa 600 y 700.
4. **Los ratios se miden.** `src/lib/contraste.ts` (WCAG 2.1, puro) calcula
   cada par; `contraste.test.ts` fija los nueve pares de la spec y
   `/styleguide` los pinta en el render. La medición corrigió un número de la
   spec: jade-600 sobre canvas es **8.66:1**, no 8.57 (AAA en ambos casos).
   Dato nuevo: canvas sobre `signal` da 6.37:1 (AA); negro sobre `signal`,
   7.18:1 (AAA). El fill `signal` lleva texto negro cuando se quiera AAA.
5. **`/styleguide` es interna.** No entra en `isPublic` del proxy (sin sesión
   redirige a `/login`), lleva `robots: noindex`, cero componentes cliente. Es
   la referencia viva de la paleta, no una página de marketing.

## Alternativas descartadas

- **Repintar toda la app con la paleta nueva.** Fuera del alcance de la spec
  (§2), y cambia pantallas de dinero en producción sin que nadie lo haya
  pedido. Si algún día se unifica, será su propio ADR con capturas antes y
  después.
- **Reusar los tokens semánticos de La Estela en la home** (`bg-background`,
  `text-foreground`) sobreescribiéndolos por página. La spec es oscura y la app
  clara: habría que redefinir `--background`, `--foreground`, `--primary` en el
  wrapper, y cualquier componente del OS que se cuele hereda el tema
  equivocado sin avisar. Nombres propios hacen el error visible en el código.
- **Cargar Inter en el layout raíz.** Un archivo de fuente más en cada pantalla
  del OS para tipografía que solo usa la home.
- **Tabla de contraste copiada de la spec.** Ya salió un número distinto al
  medir. Copiar es lo que ADR-0034 prohíbe.

## Consecuencias

- Conviven dos paletas en un solo `globals.css`. La frontera es por directorio
  (`components/marketing/*`) y por nombre de token; un `bg-primary` dentro de
  la home es un olor que la revisión debe cazar.
- Utilidades nuevas disponibles: `bg-jade-700`, `text-hi`, `text-mid`,
  `text-low`, `border-hairline`, `text-display-xl`, `rounded-pill`,
  `py-section`, `font-body`, entre otras.
- `theme-color` dark ya era `#081512`; la home oscura no lo cambia.
- Pendiente para los PRs siguientes: `images.formats` con AVIF en
  `next.config.ts` (superficie compartida, una línea) cuando entren las
  capturas; la regla de host de [ADR-0047](0047-el-apex-es-la-puerta-del-saas-hoy.md).

## Verificación

- `src/lib/contraste.test.ts` — 9 pares de la spec ±0.05, simetría, umbrales
  exactos de veredicto, rechazo de `#RRGGBBAA` (la spec traía `#12292322`;
  el token quedó `#122923`). Corre en `pnpm test` y en CI.
- `src/app/styleguide/page.tsx` — se prerenderiza en `next build`;
  `.next/server/app/styleguide.html` contiene `Contraste (medido)` y los
  ratios `15.68:1`, `8.66:1`, `3.36:1`. Sin sesión, `GET /styleguide` → 307 a
  `/login` (regla existente del proxy, no nueva).
- `git diff main -- src/app/globals.css` es solo líneas `+`: ningún token
  existente cambia de valor.
