// F6 follow-up: nota para documentos públicos cuando la operación se pactó en
// USD. Los importes se almacenan y se muestran en MXN (moneda autoritativa); el
// USD es solo referencia derivada (usd = mxn / TC). Presentacional, sin estado.

const rateFmt = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})
const usdFmt = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'USD',
})

export function NotaDivisa({
  rate,
  totalMxn,
  className,
}: {
  /** Tipo de cambio MXN por USD (bookings.exchange_rate). */
  rate: number
  /** Total del documento en MXN, para derivar el equivalente en USD. */
  totalMxn: number
  /** Clases del contenedor; cada documento ajusta color/espaciado. */
  className?: string
}) {
  if (!(rate > 0)) return null
  const usd = totalMxn / rate
  return (
    <p className={className ?? 'text-xs text-muted-foreground'}>
      Operación pactada en USD al tipo de cambio de ${rateFmt.format(rate)} MXN/USD
      {Number.isFinite(usd) ? ` (total ≈ ${usdFmt.format(usd)})` : ''}. Los importes
      de este documento se expresan en MXN, la moneda autoritativa.
    </p>
  )
}
