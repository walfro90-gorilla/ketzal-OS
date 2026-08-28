# ADR-0002 — Estrategia en dos tiempos: Ketzal OS primero, marketplace después

- Estado: aceptada · Fecha: 2026-07-08 · Sustituye: —
- Alcance: roadmap completo; qué se construye y qué se pospone

## Contexto
La visión de largo plazo es "uberizar" servicios turísticos (red social +
marketplace B2C con planners, wallet, monedas Axo, influencers). Los
marketplaces mueren por arranque en frío: sin oferta no hay demanda y
viceversa. El fundador opera 3 agencias reales (Wanderlust, Border, Snapshot)
con ventas reales hoy.

## Decisión
- Construir primero **Ketzal OS** (🅱️): back-office interno de ventas para
  las agencias del fundador — venta + abonos + recibo, multi-agencia.
- El **marketplace** (🅰️) se enciende por rebanadas SOLO sobre lo que el OS
  ya siembra (oferta real, proveedores, datos), detrás de flags.
- Fuera de v1 a propósito: factura fiscal CFDI, auto-registro masivo,
  cualquier cosa social/gamificada (wallets/planners/wishlists duermen en el
  schema sin usarse).
- El alcance v1 NO se expande sin acuerdo explícito del fundador.

## Consecuencias
- Cada fase se sostiene sola (el OS es útil aunque el marketplace nunca
  llegue).
- Las tablas B2C del scaffold original quedan dormidas, no se borran ni se
  usan hasta su fase.
- Presión constante de YAGNI: features del sueño 🅰️ se rechazan por default.

## Verificación
`docs/ROADMAP.md` y el alcance v1 en CLAUDE.md siguen declarando el orden;
features sociales/gamificadas no aparecen en `src/` fuera de flags.

## Fuentes
CLAUDE.md (visión, alcance v1), `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`.
