/**
 * Qué ACCIÓN produjo una notificación.
 *
 * La tabla `notifications` viene del scaffold B2C: su columna `type` es un enum
 * cuyos valores (SUPPLIER_APPROVAL, WELCOME_BONUS…) no corresponden a nada que
 * pase en Ketzal, y todo se insertaba con el default 'INFO'. Ampliar ese enum
 * es migración sobre una BD compartida; el evento cabe en `metadata` (jsonb, ya
 * existe y estaba sin usar), así que no hace falta tocar el esquema.
 *
 * Se guarda un IDENTIFICADOR, no el título: el copy cambia ("Nueva cotización
 * del marketplace" vs "Nueva cotización · cliente nuevo") y un ícono elegido
 * por texto se rompe en silencio la próxima vez que alguien reescriba una
 * frase.
 *
 * Módulo hoja (regla de oro 11): solo tipos y una función pura, para que lo
 * pueda importar tanto el emisor (servidor) como la campana (cliente).
 */

export const EVENTOS = [
  'cotizacion',
  'pago',
  'spei',
  'viajero',
  'embajador',
  'pasajeros',
] as const

export type EventoNoti = (typeof EVENTOS)[number]

/**
 * Lee el evento de la columna `metadata`. Es `jsonb`: puede traer null, un
 * escalar, un arreglo o un `evento` que no conocemos (fila vieja, o escrita por
 * una versión posterior). Todo eso cae en `null` y la campana pinta el ícono
 * genérico, que es la degradación correcta.
 */
export function eventoDe(metadata: unknown): EventoNoti | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const v = (metadata as Record<string, unknown>).evento
  return typeof v === 'string' && (EVENTOS as readonly string[]).includes(v)
    ? (v as EventoNoti)
    : null
}
