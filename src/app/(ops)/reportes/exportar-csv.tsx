'use client'

import { DownloadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Reporte } from './tipos'

/** Campo CSV seguro: siempre entre comillas, comillas internas dobladas. */
function campo(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`
}

function fila(...valores: Array<string | number>): string {
  return valores.map(campo).join(',')
}

/** Monto con 2 decimales y punto decimal (número plano, sumable en Excel). */
function monto(v: unknown): string {
  return Number(v ?? 0).toFixed(2)
}

function construirCsv(r: Reporte, from: string, to: string): string {
  const lineas: string[] = [
    fila('Reporte Ketzal', `${from} a ${to}`),
    '',
    fila('Resumen'),
    fila('Concepto', 'Valor'),
    fila('Vendido (MXN)', monto(r.total_vendido)),
    fila('Cobrado (MXN)', monto(r.total_cobrado)),
    fila('Por cobrar (MXN)', monto(r.saldo_por_cobrar)),
    fila('Comisión (MXN)', monto(r.total_comision)),
    fila('Gastos (MXN)', monto(r.total_gastos)),
    fila('Utilidad (MXN)', monto(r.utilidad)),
    fila('Ventas', Number(r.num_ventas ?? 0)),
    fila('Ticket promedio (MXN)', monto(r.ticket_promedio)),
    '',
    fila('Ventas por agente'),
    fila('Agente', '# Ventas', 'Vendido (MXN)', 'Comisión (MXN)'),
  ]
  for (const a of r.por_agente ?? []) {
    lineas.push(
      fila(a.agente ?? '', Number(a.num ?? 0), monto(a.vendido), monto(a.comision)),
    )
  }
  lineas.push('', fila('Ventas por servicio'))
  lineas.push(fila('Servicio', '# Ventas', 'Vendido (MXN)'))
  for (const s of r.por_servicio ?? []) {
    lineas.push(fila(s.servicio ?? '', Number(s.num ?? 0), monto(s.vendido)))
  }
  lineas.push('', fila('Ventas por mes'))
  lineas.push(fila('Mes', '# Ventas', 'Vendido (MXN)'))
  for (const m of r.por_mes ?? []) {
    lineas.push(fila(m.mes ?? '', Number(m.num ?? 0), monto(m.vendido)))
  }
  // BOM UTF-8 para que Excel abra bien los acentos; CRLF por compatibilidad.
  return '\uFEFF' + lineas.join('\r\n') + '\r\n'
}

/** Botón "Exportar CSV": genera el archivo en el navegador y lo descarga. */
export function ExportarCsv({
  reporte,
  from,
  to,
}: {
  reporte: Reporte
  from: string
  to: string
}) {
  function handleClick() {
    const csv = construirCsv(reporte, from, to)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte-ketzal-${from}-a-${to}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <Button type="button" variant="outline" onClick={handleClick}>
      <DownloadIcon aria-hidden="true" />
      Exportar CSV
    </Button>
  )
}
