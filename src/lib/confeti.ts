/**
 * Confeti para los dos momentos que sí valen: estrenar el OS y quedar listo
 * para vender. Nada más — si sale seguido deja de ser celebración y es ruido.
 *
 * Tres decisiones:
 *
 * 1. **Import dinámico.** `canvas-confetti` no viaja en el bundle inicial: se
 *    baja en el instante en que se dispara, que ocurre una vez en la vida de
 *    una agencia. Quien nunca lo vea no paga nada.
 * 2. **Respeta `prefers-reduced-motion`.** Quien pidió menos animación no
 *    quiere una lluvia de partículas: se salta en silencio. No es un extra de
 *    accesibilidad, es la preferencia declarada del sistema.
 * 3. **Nunca revienta la pantalla.** Es adorno. Si el módulo no carga o el
 *    canvas falla, se traga el error: la bienvenida y el checklist tienen que
 *    funcionar igual.
 */

/** ¿La persona pidió menos animación? (y SSR, donde no hay nada que animar) */
export function prefiereMenosMovimiento(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** Los tres de la marca (teal, verde hoja, rojo) — ver docs/BRAND.md. */
const COLORES = ['#009E7E', '#3DDE1C', '#DF001A']

export async function lanzarConfeti(): Promise<boolean> {
  if (prefiereMenosMovimiento()) return false
  try {
    const { default: confetti } = await import('canvas-confetti')
    // Dos ráfagas desde las esquinas bajas: llena el ancho sin tapar el centro,
    // que es justo donde está el texto que la persona tiene que leer.
    const base = { particleCount: 60, spread: 70, startVelocity: 45, colors: COLORES, disableForReducedMotion: true }
    confetti({ ...base, origin: { x: 0.1, y: 0.9 }, angle: 60 })
    confetti({ ...base, origin: { x: 0.9, y: 0.9 }, angle: 120 })
    return true
  } catch {
    // Adorno: que no cargue no puede tumbar la bienvenida.
    return false
  }
}
