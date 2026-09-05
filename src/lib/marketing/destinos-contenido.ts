// ADR-0051 — Contenido editorial por destino: dónde está, por qué se visita y
// qué ver. Lo escribe QUIEN HA ESTADO (el fundador o la agencia que opera), no
// un generador de texto: una descripción genérica es lo que ya tienen todos los
// sitios de viajes, un buscador la trata como relleno y un asistente no gana
// nada citándola. La ventaja de Ketzal es que sus agencias operan esos viajes.
//
// Mientras un destino no tenga texto aquí, su página simplemente no muestra la
// sección. Nunca se rellena con prosa inventada (misma regla que el resto de la
// página: si el dato no existe, no se afirma).
//
// ponytail: vive en un archivo del repo y no en la BD porque hoy son 4 destinos
// que cambian poco, y una tabla pediría además su pantalla de edición. El día
// que sean muchos, o que Meny necesite editarlos sin pasar por un deploy, ese
// es el disparador para moverlo a una tabla `destinos` con su UI.

export type ContenidoDestino = {
  /** Dónde queda, en palabras de quien ha ido. Una o dos frases. */
  ubicacion?: string
  /** Cuánto se hace desde el origen (la pregunta que más se busca). */
  comoLlegar?: string
  /** Por qué vale la pena. Dos o tres frases, sin adjetivos de folleto. */
  porQue?: string
  /** Lugares concretos que se pueden visitar. */
  queVisitar?: string[]
  /** Mejor temporada, si el destino la tiene. */
  cuandoIr?: string
}

/** Clave = slug del destino (`slugDestino`), p. ej. `creel`, `ciudad-valles`. */
export const CONTENIDO_DESTINOS: Record<string, ContenidoDestino> = {
  // Pendiente del fundador: creel, ciudad-valles, mazatlan, medellin.
  // Formato de ejemplo (NO usar como texto real):
  //   creel: {
  //     ubicacion: '...',
  //     comoLlegar: '...',
  //     porQue: '...',
  //     queVisitar: ['...', '...'],
  //     cuandoIr: '...',
  //   },
}

export function contenidoDe(slug: string): ContenidoDestino | null {
  const c = CONTENIDO_DESTINOS[slug]
  if (!c) return null
  const tieneAlgo =
    c.ubicacion || c.comoLlegar || c.porQue || c.cuandoIr || (c.queVisitar?.length ?? 0) > 0
  return tieneAlgo ? c : null
}
