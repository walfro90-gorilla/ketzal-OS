import type { PublicServiceCard } from '@/app/explora/data'

// ADR-0051: páginas por destino. Agrupa el catálogo público por ciudad de
// destino para responder la pregunta que la gente escribe de verdad ("tours a
// Creel desde Ciudad Juárez precio"), con datos del catálogo y nada inventado.
//
// Todo aquí es PURO: recibe el catálogo y devuelve la agrupación. Sin red, sin
// BD, testeable.

export type Destino = {
  /** Segmento de URL, estable y sin acentos: `creel`, `ciudad-valles`. */
  slug: string
  ciudad: string
  estado: string | null
  /** Ciudades desde las que sale al menos un viaje a este destino. */
  origenes: string[]
  servicios: PublicServiceCard[]
  /** Precio más bajo (> 0). `null` si ninguno tiene precio. */
  precioDesde: number | null
  /** Salida futura más próxima entre sus viajes, o `null` si no hay ninguna. */
  proximaSalida: string | null
  /** Suma de salidas futuras de todos sus viajes. */
  salidasFuturas: number
}

/** Slug estable: minúsculas, sin acentos, guiones. Mismo criterio que `addons`. */
export function slugDestino(ciudad: string): string {
  return ciudad
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Agrupa el catálogo por destino. Descarta los servicios sin ciudad de destino:
 * una página cuyo título no puede nombrar el lugar no sirve para nada.
 * Ordena los destinos por salida más próxima (los que no tienen, al final).
 */
export function agruparPorDestino(servicios: PublicServiceCard[]): Destino[] {
  const porSlug = new Map<string, Destino>()

  for (const s of servicios) {
    const ciudad = s.city_to?.trim()
    if (!ciudad) continue
    const slug = slugDestino(ciudad)
    if (!slug) continue

    let d = porSlug.get(slug)
    if (!d) {
      d = {
        slug,
        ciudad,
        estado: s.state_to?.trim() || null,
        origenes: [],
        servicios: [],
        precioDesde: null,
        proximaSalida: null,
        salidasFuturas: 0,
      }
      porSlug.set(slug, d)
    }

    d.servicios.push(s)
    d.salidasFuturas += Number(s.departures_count ?? 0)

    const origen = s.city_from?.trim()
    if (origen && !d.origenes.includes(origen)) d.origenes.push(origen)

    const precio = Number(s.price ?? 0)
    if (precio > 0 && (d.precioDesde == null || precio < d.precioDesde)) {
      d.precioDesde = precio
    }

    const salida = s.next_departure ?? null
    if (salida && (d.proximaSalida == null || salida < d.proximaSalida)) {
      d.proximaSalida = salida
    }
  }

  return [...porSlug.values()].sort((a, b) => {
    if (a.proximaSalida && b.proximaSalida) {
      return a.proximaSalida.localeCompare(b.proximaSalida)
    }
    if (a.proximaSalida) return -1
    if (b.proximaSalida) return 1
    return a.ciudad.localeCompare(b.ciudad)
  })
}

/**
 * Título de la página. Nombra el origen SOLO si todos los viajes salen del
 * mismo lugar: con dos orígenes distintos, "desde X" sería falso, y el título
 * es justo lo que un buscador cita.
 */
export function tituloDestino(d: Destino): string {
  const lugar = d.estado && d.estado !== d.ciudad ? `${d.ciudad}, ${d.estado}` : d.ciudad
  return d.origenes.length === 1
    ? `Viajes a ${lugar} desde ${d.origenes[0]}`
    : `Viajes a ${lugar}`
}
