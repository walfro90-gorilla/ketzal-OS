// Saldo derivado (regla de oro): total - pagos + reembolsos, solo abonos COMPLETED.
export type LedgerEntry = { type: 'payment' | 'refund'; amount: number; status: string }
export function balance(total: number, entries: LedgerEntry[]) {
  const net = entries
    .filter(e => e.status === 'COMPLETED')
    .reduce((s, e) => s + (e.type === 'payment' ? e.amount : -e.amount), 0)
  return total - net
}
