'use client'

import { DownloadIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Reporte } from './tipos'
import type { Conversion, GoalsProgress } from './conversion-meta'

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

/** Avance meta = vendido/meta en % con 1 decimal; '' si no hay meta fijada. */
function avancePct(goal: number, vendido: number): number | string {
  return goal > 0 ? Math.round((vendido / goal) * 1000) / 10 : ''
}

function construirCsv(
  r: Reporte,
  conv: Conversion,
  goals: GoalsProgress,
  from: string,
  to: string,
): string {
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

  // F5 \u2014 Conversi\u00F3n (cotizaci\u00F3n \u2192 venta): global + por agente.
  lineas.push('', fila('Conversi\u00F3n (cotizaci\u00F3n \u2192 venta)'))
  lineas.push(fila('Concepto', 'Valor'))
  lineas.push(fila('Cotizadas', Number(conv.cotizadas ?? 0)))
  lineas.push(fila('Convertidas', Number(conv.convertidas ?? 0)))
  lineas.push(fila('Tasa (%)', Number(conv.tasa ?? 0)))
  lineas.push('', fila('Conversi\u00F3n por agente'))
  lineas.push(fila('Agente', 'Cotizadas', 'Convertidas', 'Tasa (%)'))
  for (const a of conv.por_agente ?? []) {
    lineas.push(
      fila(
        a.agente ?? '',
        Number(a.cotizadas ?? 0),
        Number(a.convertidas ?? 0),
        Number(a.tasa ?? 0),
      ),
    )
  }

  // F5 \u2014 Meta del mes: agencia + por agente (meta vs vendido, avance %).
  lineas.push('', fila('Meta del mes', goals.month ?? ''))
  lineas.push(fila('\u00C1mbito', 'Meta (MXN)', 'Vendido (MXN)', 'Avance (%)'))
  const agGoal = Number(goals.agencia?.goal ?? 0)
  const agVendido = Number(goals.agencia?.vendido ?? 0)
  lineas.push(
    fila('Agencia', monto(agGoal), monto(agVendido), avancePct(agGoal, agVendido)),
  )
  for (const a of goals.agentes ?? []) {
    const g = Number(a.goal ?? 0)
    const v = Number(a.vendido ?? 0)
    lineas.push(fila(a.agente ?? '', monto(g), monto(v), a.avance ?? avancePct(g, v)))
  }

  // BOM UTF-8 para que Excel abra bien los acentos; CRLF por compatibilidad.
  return '\uFEFF' + lineas.join('\r\n') + '\r\n'
}

/** Botón "Exportar CSV": genera el archivo en el navegador y lo descarga. */
export function ExportarCsv({
  reporte,
  conv,
  goals,
  from,
  to,
}: {
  reporte: Reporte
  conv: Conversion
  goals: GoalsProgress
  from: string
  to: string
}) {
  function handleClick() {
    const csv = construirCsv(reporte, conv, goals, from, to)
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
