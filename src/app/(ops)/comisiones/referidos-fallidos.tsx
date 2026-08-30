import { AlertTriangleIcon, CheckCircle2Icon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { DataList, type DataColumn } from '@/components/data/data-list'
import { mxn } from '@/components/data/format'
import { explicarMiss } from '@/lib/domain/embajador'

// Referidos que NO generaron comisión (m008). Existe porque
// `attribute_booking_by_ref` fallaba en silencio: el embajador traía la venta,
// no cobraba, y no había cómo saber por qué — ni para responderle cuando
// reclamara, ni para darse cuenta de que faltaba configurar una tarifa.
//
// Se muestra el CÓDIGO de referido y no el nombre del embajador a propósito:
// con el modelo sin límite (ADR-0021) puede traer la venta un embajador de otra
// agencia, y `profiles` solo expone los propios. El código basta para
// identificarlo y no obliga a abrir permisos sobre datos de terceros.

export type ReferidoFallido = {
  id: string
  ref_code: string
  reason: string
  created_at: string
  folio: string | null
  total: number | null
}

export function ReferidosFallidos({ filas }: { filas: ReferidoFallido[] }) {
  // Lo primero que hay que saber: ¿cuántos son por algo que YO puedo arreglar?
  const sinTarifa = filas.filter((f) => f.reason === 'sin_tarifa_de_la_agencia').length

  const columns: DataColumn<ReferidoFallido>[] = [
    {
      header: 'Código',
      primary: true,
      cell: (f) => <code className="text-sm">{f.ref_code}</code>,
    },
    {
      header: 'Qué pasó',
      fullWidthOnCard: true,
      cell: (f) => {
        const m = explicarMiss(f.reason)
        return (
          <div className="space-y-0.5">
            <p className="font-medium">{m.titulo}</p>
            <p className="text-xs text-muted-foreground">{m.queHacer}</p>
          </div>
        )
      },
    },
    { header: 'Venta', cell: (f) => f.folio ?? '—' },
    {
      header: 'Monto',
      align: 'right',
      cell: (f) => (f.total != null ? mxn.format(f.total) : '—'),
      sortValue: (f) => f.total ?? 0,
    },
    {
      header: 'Fecha',
      align: 'right',
      cell: (f) => f.created_at.slice(0, 10),
      sortValue: (f) => f.created_at,
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Referidos que no generaron comisión
          {filas.length > 0 && <Badge variant="warning">{filas.length}</Badge>}
        </CardTitle>
        <CardDescription>
          Ventas que llegaron con un código de embajador pero no le pagaron nada. Antes
          esto fallaba en silencio: sirve para responderle a quien reclame y para
          detectar tarifas sin configurar.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {sinTarifa > 0 && (
          <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong>
                {sinTarifa} {sinTarifa === 1 ? 'venta se quedó' : 'ventas se quedaron'} sin
                comisión por falta de tarifa.
              </strong>{' '}
              Configúrala arriba: mientras no exista, tus embajadores siguen trayendo
              ventas por las que no cobran.
            </span>
          </p>
        )}

        <DataList
          columns={columns}
          rows={filas}
          getRowKey={(f) => f.id}
          empty={
            <p className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
              <CheckCircle2Icon className="size-4 text-[var(--success)]" />
              Ningún referido se quedó sin comisión. Aquí aparecerán las ventas que
              lleguen con un código y no puedan pagarse.
            </p>
          }
        />
      </CardContent>
    </Card>
  )
}
