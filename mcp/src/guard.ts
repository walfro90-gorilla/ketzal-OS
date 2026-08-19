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
import { MAX_WRITES } from './config.js'
import { KetzalError } from './errors.js'

let gastadas = 0

export function writesLeft(): number {
  return Math.max(0, MAX_WRITES - gastadas)
}

/** Solo para tests. */
export function resetWrites(): void {
  gastadas = 0
}

/** Consume un cupo de escritura. Se llama ANTES de mandar la petición. */
export function spendWrite(): void {
  if (gastadas >= MAX_WRITES) {
    throw new KetzalError(
      `Tope de ${MAX_WRITES} escrituras por sesión alcanzado. Es un freno anti-bucle: ` +
        'revisa lo que ya se registró y reinicia el servidor MCP para seguir.',
    )
  }
  gastadas++
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
