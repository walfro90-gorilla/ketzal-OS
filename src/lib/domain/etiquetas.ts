/**
 * Etiquetas de texto (incluye / no incluye, especialidades): lo que la persona
 * teclea o pega se parte en conceptos por coma o salto de línea. Módulo hoja,
 * puro: lo usan el input de etiquetas (cliente) y quien quiera normalizar
 * listas del lado del servidor.
 */

/** "Transporte, desayuno\nGuía" → ['Transporte', 'desayuno', 'Guía']. */
export function partirEtiquetas(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Agrega lo tecleado a la lista sin repetir (sin distinguir mayúsculas ni
 * acentos: "Desayuno" y "desayuno" son la misma etiqueta; gana la primera).
 */
export function agregarEtiquetas(actuales: string[], raw: string): string[] {
  const vistos = new Set(actuales.map(clave))
  const out = [...actuales]
  for (const e of partirEtiquetas(raw)) {
    const k = clave(e)
    if (vistos.has(k)) continue
    vistos.add(k)
    out.push(e)
  }
  return out
}

function clave(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()
}
