# Ketzal — Identidad de marca (grounding)

> Fuente: logo oficial provisto por el fundador (2026-07-09). Asset: `public/ketzal-logo.jpg`.
> Colores muestreados del pixel real del logo; OKLCH calculado para los tokens de `globals.css`.

## Símbolo
- **Quetzal en vuelo** + **estela ondulante** con franjas **verde** (arriba) y **roja** (abajo).
- Lectura: naturaleza / ecoturismo + guiño a México (verde-blanco-rojo) y al pecho rojo del quetzal.
- Encaja con Wanderlust (ecoturismo). Personalidad: **natural, cálida, mexicana, con energía**.

## Wordmark / tipografía
- "Ketzal" en **script tipo brush/manuscrito, redondeado y grueso** (terminaciones suaves, orgánico, amistoso).
- El wordmark va con **degradado teal → verde hoja** (izquierda→derecha).
- **Solo para el lockup del logo**, no para la UI. El cuerpo de la app sigue en **Geist** (legibilidad).
- Para uso en la app necesitamos idealmente un **SVG/PNG transparente** del logo (el JPEG actual trae fondo blanco → no sirve en dark mode). Pedir el vector al diseñador.

## Paleta (muestreada del logo)

| Rol | Hex | OKLCH | Uso |
|---|---|---|---|
| **Teal-esmeralda (primario)** | `#009E7E` | `oklch(0.623 0.121 171.6)` | Color de marca; base del wordmark |
| **Teal para interacción** | `#00805F` | `oklch(0.532 0.109 167.1)` | Botón primario / hover / links (más contraste con blanco) |
| **Verde hoja (acento vivo)** | `#3DDE1C` | `oklch(0.787 0.252 141.2)` | Ave, estela, highlights, éxito ("pagado/activo") |
| **Verde hoja suave** | `#4CC63A` | `oklch(0.731 0.208 141.3)` | Verde usable en fills sin quemar |
| **Rojo (acento)** | `#DF001A` | `oklch(0.568 0.232 26.8)` | Franja / destructive / alertas |
| Blanco | `#FFFFFF` | — | Fondo del logo y de la app (light) |

### Nota de accesibilidad
Blanco sobre el teal puro `#009E7E` da ~3.2:1 (bien para texto grande/UI, **corto para texto normal AA 4.5**).
Para **botón primario con texto**, usar el teal de interacción `#00805F` (~4.4:1) o un poco más oscuro. El teal puro queda genial para acentos, nav activa e íconos.

## Aplicación propuesta a Ketzal OS
1. **`--primary` → teal** (light + dark) en `globals.css`: botones, nav activa, links, focus rings.
2. **Estados**: éxito/"pagado/activo" → verde hoja; destructive → rojo de marca.
3. **Ícono PWA / favicon**: degradado exacto teal→verde hoja (y, con el vector, la silueta del quetzal).
4. **Header**: wordmark real (cuando haya versión transparente); mientras, "Ketzal OS" con el teal.
