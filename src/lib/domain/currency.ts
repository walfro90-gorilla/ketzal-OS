// Divisas (F6): el motor es 100% MXN autoritativo. Al vender en USD el form
// convierte a MXN con el TC; el USD se deriva solo para mostrar. Helpers puros,
// centralizados aquí para testear la conversión que corre en el form/detalle.

/** Redondeo a 2 decimales (centavos). */
export const round2 = (n: number) => Math.round(n * 100) / 100

/** USD → MXN al tipo de cambio (autoritativo, redondeado a centavos). */
export const toMxn = (amount: number, rate: number) => round2(amount * rate)

/** MXN → USD derivado para mostrar (sin redondear: el formateo lo hace la UI). */
export const toUsd = (mxnAmount: number, rate: number) => mxnAmount / rate
