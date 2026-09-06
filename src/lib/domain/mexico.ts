// Catálogo de lugares para capturar ubicaciones agrupables (ADR-0057).
//
// El problema que resuelve: `services.state_to` era texto libre y terminó
// guardando ESTADOS de México ("Jalisco", "Sinaloa") junto a PAÍSES
// ("Colombia", "Brasil", "Perú", "Costa Rica"), porque no había dónde poner el
// país. Agrupar por estado mezclaba las dos cosas.
//
// Criterio: cerrado donde el conjunto es cerrado, sugerido donde es abierto.
//   · País  → lista cerrada (cambian cada década; si falta uno, se agrega aquí).
//   · Estado → lista cerrada de las 32 entidades, SOLO cuando el país es México.
//   · Ciudad → texto libre con sugerencias de las ya capturadas; son infinitas.
//
// La agrupación NO depende de que el usuario teclee igual: se normaliza con
// `claveLugar()`, el mismo criterio de `slugDestino()`.

export const MEXICO = 'México'

/** Las 32 entidades federativas, como las escribe la gente. */
export const ESTADOS_MX = [
  'Aguascalientes',
  'Baja California',
  'Baja California Sur',
  'Campeche',
  'Chiapas',
  'Chihuahua',
  'Ciudad de México',
  'Coahuila',
  'Colima',
  'Durango',
  'Estado de México',
  'Guanajuato',
  'Guerrero',
  'Hidalgo',
  'Jalisco',
  'Michoacán',
  'Morelos',
  'Nayarit',
  'Nuevo León',
  'Oaxaca',
  'Puebla',
  'Querétaro',
  'Quintana Roo',
  'San Luis Potosí',
  'Sinaloa',
  'Sonora',
  'Tabasco',
  'Tamaulipas',
  'Tlaxcala',
  'Veracruz',
  'Yucatán',
  'Zacatecas',
] as const

/** Países a los que hoy se vende o se puede vender. México siempre primero. */
export const PAISES = [
  MEXICO,
  'Estados Unidos',
  'Canadá',
  'Colombia',
  'Costa Rica',
  'Perú',
  'Brasil',
  'Argentina',
  'Chile',
  'Cuba',
  'República Dominicana',
  'Panamá',
  'Guatemala',
  'España',
  'Italia',
  'Francia',
] as const

export type EstadoMx = (typeof ESTADOS_MX)[number]

/** Clave estable para agrupar y comparar: sin acentos, minúsculas, guiones. */
export function claveLugar(valor: string | null | undefined): string {
  return (valor ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** ¿Este texto nombra a México? Tolera "Mexico" sin acento y mayúsculas. */
export function esMexico(pais: string | null | undefined): boolean {
  return claveLugar(pais) === claveLugar(MEXICO)
}

/**
 * ¿El texto es una de las 32 entidades? Compara por clave, así que "NUEVO LEON"
 * y "Nuevo León" son la misma. Devuelve el nombre canónico o `null`.
 */
export function estadoCanonico(valor: string | null | undefined): EstadoMx | null {
  const k = claveLugar(valor)
  if (!k) return null
  return ESTADOS_MX.find((e) => claveLugar(e) === k) ?? null
}

/** Igual para país: devuelve el nombre canónico de la lista, o `null`. */
export function paisCanonico(valor: string | null | undefined): string | null {
  const k = claveLugar(valor)
  if (!k) return null
  return PAISES.find((p) => claveLugar(p) === k) ?? null
}

/**
 * Cómo se escribe un lugar en pantalla. Fuera de México el estado casi nunca
 * aporta (nadie dice "Medellín, Antioquia" en un anuncio), así que manda el país.
 */
export function etiquetaLugar(
  ciudad: string | null | undefined,
  estado: string | null | undefined,
  pais: string | null | undefined
): string {
  const c = (ciudad ?? '').trim()
  const e = (estado ?? '').trim()
  const p = (pais ?? '').trim()
  if (!c && !e && !p) return ''
  const segundo = esMexico(p) || !p ? e : p
  if (!c) return segundo || p
  if (!segundo || claveLugar(segundo) === claveLugar(c)) return c
  return `${c}, ${segundo}`
}
