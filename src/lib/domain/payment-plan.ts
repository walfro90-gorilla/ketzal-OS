// Plan de pagos: enganche + N abonos. La aritmética que arma el calendario vive
// en el RPC (cubierta por los hard-tests SQL). Lo que corre en TS —y aquí se
// testea— es el saldo corrido del calendario y el invariante suma = total.

/** Solo necesita el monto; acepta number o string (llega como jsonb del RPC). */
export type PlanMonto = { amount: number | string }

/** Suma de los montos del calendario (enganche + abonos). */
export const sumaMontos = (items: PlanMonto[]): number =>
  items.reduce((s, it) => s + Number(it.amount), 0)

/** Saldo tras cada fila = total − suma acumulada de montos hasta esa fila. */
export function saldosCorridos(items: PlanMonto[], total: number): number[] {
  return items.map((_, i) => total - sumaMontos(items.slice(0, i + 1)))
}

/** Agrega el saldo corrido a cada fila (lo que consume la tabla del plan). */
export function conSaldoCorrido<T extends PlanMonto>(
  items: T[],
  total: number
): (T & { saldo: number })[] {
  const saldos = saldosCorridos(items, total)
  return items.map((it, i) => ({ ...it, saldo: saldos[i] }))
}

/** Invariante del plan: los montos suman EXACTAMENTE el total (a 2 decimales). */
export function planCuadra(items: PlanMonto[], total: number): boolean {
  return Math.round(sumaMontos(items) * 100) === Math.round(total * 100)
}
