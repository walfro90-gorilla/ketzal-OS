// Validación pura del monto de un cobro en línea contra el saldo: un guard de
// dinero antes de cobrar. La UI mapea el resultado a un mensaje; aquí solo la
// regla. (El registro real y el saldo autoritativo viven en el ledger/RPC.)

/** Resultado de validar el monto de cobro. */
export type CobroCheck = 'ok' | 'no_positivo' | 'excede_saldo'

/**
 * Valida el monto (string del input) contra el saldo:
 *  - vacío / no numérico / ≤ 0 → 'no_positivo'
 *  - mayor que el saldo        → 'excede_saldo'
 *  - en (0, saldo]             → 'ok'
 */
export function validarCobro(montoStr: string, saldo: number): CobroCheck {
  const num = Number(montoStr)
  if (montoStr.trim() === '' || !Number.isFinite(num) || num <= 0) return 'no_positivo'
  if (num > saldo) return 'excede_saldo'
  return 'ok'
}
