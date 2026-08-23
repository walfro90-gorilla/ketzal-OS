/**
 * Freno de mano de las escrituras de dinero.
 *
 * El ledger de Ketzal es append-only: un abono mal registrado no se borra, se
 * contra-asienta. Un agente en bucle puede hacer mucho daño barato, así que las
 * herramientas que mueven dinero pasan por aquí.
 *
 * Esto NO sustituye el prompt de permisos del cliente MCP: lo complementa para los
 * clientes que auto-aprueban herramientas.
 */
import { MAX_DATA_WRITES, MAX_WRITES } from './config.js'
import { KetzalError } from './errors.js'

/** Dos cupos: el dinero es append-only, los datos se corrigen editando. */
export type TipoEscritura = 'dinero' | 'datos'

const gastadas: Record<TipoEscritura, number> = { dinero: 0, datos: 0 }
const TOPES: Record<TipoEscritura, number> = { dinero: MAX_WRITES, datos: MAX_DATA_WRITES }

export function writesLeft(kind: TipoEscritura = 'dinero'): number {
  return Math.max(0, TOPES[kind] - gastadas[kind])
}

/** Solo para tests. */
export function resetWrites(): void {
  gastadas.dinero = 0
  gastadas.datos = 0
}

/**
 * Consume un cupo de escritura. Se llama ANTES de mandar la petición.
 * El default es `dinero`: si una herramienta nueva olvida declararse, cae en el
 * cupo estricto, no en el ancho.
 */
export function spendWrite(kind: TipoEscritura = 'dinero'): void {
  if (gastadas[kind] >= TOPES[kind]) {
    const que = kind === 'dinero' ? 'escrituras de dinero' : 'ediciones'
    throw new KetzalError(
      `Tope de ${TOPES[kind]} ${que} por sesión alcanzado. Es un freno anti-bucle: ` +
        'revisa lo que ya se registró y reinicia el servidor MCP para seguir.',
    )
  }
  gastadas[kind]++
}

/** Toda herramienta de dinero exige que el agente pase `confirmar: true` explícito. */
export function requireConfirm(confirmar: unknown): void {
  if (confirmar !== true) {
    throw new KetzalError(
      'Falta `confirmar: true`. Esta operación mueve dinero y el ledger es ' +
        'append-only (corregir es un contra-asiento, no un borrado): confírmala con ' +
        'la persona antes de repetir la llamada.',
    )
  }
}

/**
 * Eco del monto: la cancelación exige repetir la pena que devolvió el preview.
 * Mata el caso de cancelar con un preview viejo (la pena sube por tramos de fecha,
 * así que un preview de ayer puede estar en otro tramo hoy).
 */
export function assertMontoEsperado(esperado: number, real: number, que = 'la penalización'): void {
  if (!Number.isFinite(esperado) || Math.abs(esperado - real) > 0.01) {
    throw new KetzalError(
      `No coincide ${que}: esperabas $${esperado.toFixed(2)} y el sistema calcula ` +
        `$${real.toFixed(2)}. Vuelve a correr el preview y confirma con la persona.`,
    )
  }
}
