// Teléfono con LADA por país. Módulo puro (sin 'use client'): lo importan el
// componente de captura y sus tests.

export type Pais = { iso: string; nombre: string; lada: string }

/**
 * Lista CURADA, no las ~250 del mundo: México primero porque ahí está el
 * negocio, y después los países de donde de verdad puede venir un viajero
 * (frontera, LATAM, España). Agregar uno es una línea; cargar el mundo entero
 * en cada render, no.
 */
export const PAISES: Pais[] = [
  { iso: 'MX', nombre: 'México', lada: '52' },
  { iso: 'US', nombre: 'Estados Unidos', lada: '1' },
  { iso: 'CA', nombre: 'Canadá', lada: '1' },
  { iso: 'ES', nombre: 'España', lada: '34' },
  { iso: 'GT', nombre: 'Guatemala', lada: '502' },
  { iso: 'BZ', nombre: 'Belice', lada: '501' },
  { iso: 'SV', nombre: 'El Salvador', lada: '503' },
  { iso: 'HN', nombre: 'Honduras', lada: '504' },
  { iso: 'NI', nombre: 'Nicaragua', lada: '505' },
  { iso: 'CR', nombre: 'Costa Rica', lada: '506' },
  { iso: 'PA', nombre: 'Panamá', lada: '507' },
  { iso: 'CO', nombre: 'Colombia', lada: '57' },
  { iso: 'VE', nombre: 'Venezuela', lada: '58' },
  { iso: 'EC', nombre: 'Ecuador', lada: '593' },
  { iso: 'PE', nombre: 'Perú', lada: '51' },
  { iso: 'BO', nombre: 'Bolivia', lada: '591' },
  { iso: 'CL', nombre: 'Chile', lada: '56' },
  { iso: 'AR', nombre: 'Argentina', lada: '54' },
  { iso: 'UY', nombre: 'Uruguay', lada: '598' },
  { iso: 'PY', nombre: 'Paraguay', lada: '595' },
  { iso: 'BR', nombre: 'Brasil', lada: '55' },
  { iso: 'CU', nombre: 'Cuba', lada: '53' },
  { iso: 'DO', nombre: 'Rep. Dominicana', lada: '1' },
  { iso: 'GB', nombre: 'Reino Unido', lada: '44' },
  { iso: 'FR', nombre: 'Francia', lada: '33' },
  { iso: 'DE', nombre: 'Alemania', lada: '49' },
  { iso: 'IT', nombre: 'Italia', lada: '39' },
]

export const PAIS_DEFAULT = 'MX'

/**
 * Bandera como emoji, sin assets ni dependencia: las letras del ISO se mapean a
 * los indicadores regionales Unicode ('A' → 🇦, desplazamiento 0x1F1A5).
 */
export function banderaEmoji(iso: string): string {
  return iso
    .toUpperCase()
    .replace(/[A-Z]/g, (c) => String.fromCodePoint(0x1f1a5 + c.charCodeAt(0)))
}

/**
 * "+52 656 123 4567" → { iso: 'MX', local: '656 123 4567' }.
 *
 * Un valor sin lada conocida (los teléfonos guardados antes del selector)
 * regresa `iso: null` y se muestra íntegro; sólo se le antepone lada cuando la
 * persona lo edita.
 *
 * Prueba la lada MÁS LARGA primero, que es lo que impide que `+1` (EEUU) se
 * coma un `+591` (Bolivia) — con 3 países en la lista no pasaba; con 27 sí.
 */
export function partirTelefono(valor: string): { iso: string | null; local: string } {
  const porLargo = [...PAISES].sort((a, b) => b.lada.length - a.lada.length)
  for (const pais of porLargo) {
    const dial = `+${pais.lada}`
    if (valor.startsWith(dial)) {
      return { iso: pais.iso, local: valor.slice(dial.length).trimStart() }
    }
  }
  return { iso: null, local: valor }
}

/** Lada del país (con `+`). Cae en México si la clave es desconocida. */
export function ladaDe(iso: string): string {
  const pais = PAISES.find((p) => p.iso === iso)
  return `+${pais?.lada ?? '52'}`
}

/** Teléfono vacío queda vacío: la lada sola no es un dato. */
export function componerTelefono(iso: string, local: string): string {
  return local.trim() ? `${ladaDe(iso)} ${local}` : ''
}

/**
 * Link de WhatsApp a un número, o null si no hay número usable (vacío, un
 * correo, o menos de 10 dígitos). Vivía en `domain/encuesta.ts` porque ahí
 * nació —los leads de la encuesta—, pero lo usan también los accesos y el
 * portal de proveedores: su casa es el módulo del teléfono.
 */
export function linkWhatsapp(contacto: string | null): string | null {
  if (!contacto || contacto.includes('@')) return null
  const digitos = contacto.replace(/\D/g, '')
  if (digitos.length < 10) return null
  // 10 dígitos = número mexicano sin lada país.
  return `https://wa.me/${digitos.length === 10 ? `52${digitos}` : digitos}`
}
