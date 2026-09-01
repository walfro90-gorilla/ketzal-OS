'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BanknoteIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { mxn } from '@/components/data/format'
import { registrarPagoCorte } from './corte-actions'

// El corte quincenal: a quién hay que pagarle hoy y cuánto.
//
// El corte es DERIVADO (devengado hasta la fecha − pagado hasta la fecha), así
// que es auto-corregible: si se salta una quincena, la siguiente incluye lo
// pendiente sin que nadie tenga que acordarse.
//
// Solo aparece lo que tiene DINERO COBRADO: una venta reembolsada sin cancelar
// sigue devengando comisión (hueco documentado en ADR-0029) y aquí no se paga,
// porque la agencia no tiene de dónde.

export type FilaCorte = {
  embajador_id: string
  embajador: string | null
  agencia_id: string | null
  agencia: string | null
  concepto: 'comision' | 'bono'
  num_ventas: number
  devengado: number
  pagado: number
  a_pagar: number
}

export function CorteEmbajadores({
  filas,
  hasta,
  totalAPagar,
}: {
  filas: FilaCorte[]
  /** Fecha de corte en curso (`YYYY-MM-DD`). */
  hasta: string
  totalAPagar: number
}) {
  const router = useRouter()
  const [fecha, setFecha] = useState(hasta)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="corte-fecha">Corte al</Label>
          <Input
            id="corte-fecha"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            onBlur={() => {
              // El corte se recalcula en el servidor: se navega con la fecha.
              if (fecha && fecha !== hasta) router.push(`/comisiones?corte=${fecha}`)
            }}
            className="w-44"
          />
        </div>
        {totalAPagar > 0 && (
          <p className="text-sm">
            A pagar en este corte:{' '}
            <strong className="tabular-nums">{mxn.format(totalAPagar)}</strong>
          </p>
        )}
      </div>

      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nada por pagar a esta fecha. Aquí aparece lo devengado de ventas con
          dinero ya cobrado, menos lo que ya pagaste.
        </p>
      ) : (
        <ul className="divide-y">
          {filas.map((f) => (
            <Fila key={`${f.embajador_id}-${f.agencia_id ?? 'bono'}`} fila={f} fecha={fecha} />
          ))}
        </ul>
      )}
    </div>
  )
}

function Fila({ fila, fecha }: { fila: FilaCorte; fecha: string }) {
  const router = useRouter()
  const [isPending, start] = useTransition()
  const [monto, setMonto] = useState(String(fila.a_pagar))

  function pagar() {
    const n = Number(monto)
    if (!Number.isFinite(n) || n <= 0) return void toast.error('Pon un monto válido.')
    if (
      !window.confirm(
        `¿Registrar ${mxn.format(n)} pagados a ${fila.embajador ?? 'esta persona'}? ` +
          'Queda como gasto y baja su saldo.',
      )
    )
      return
    start(async () => {
      const res = await registrarPagoCorte({
        embajadorId: fila.embajador_id,
        agenciaId: fila.agencia_id,
        monto: n,
        fecha,
      })
      if ('error' in res) return void toast.error(res.error)
      toast.success('Pago registrado')
      router.refresh()
    })
  }

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{fila.embajador ?? 'Sin nombre'}</p>
        <p className="text-xs text-muted-foreground">
          {fila.concepto === 'bono'
            ? 'Bono por reclutar · lo paga Ketzal'
            : `${fila.agencia ?? 'Su agencia'} · ${
                fila.num_ventas === 1 ? '1 venta' : `${fila.num_ventas} ventas`
              }`}
          {fila.pagado !== 0 ? ` · ya pagado ${mxn.format(fila.pagado)}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="relative">
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step="1"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            aria-label={`Monto a pagar a ${fila.embajador ?? 'esta persona'}`}
            className="w-32 pr-7 text-right tabular-nums"
          />
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">
            $
          </span>
        </div>
        <Button type="button" size="sm" disabled={isPending} onClick={pagar}>
          <BanknoteIcon className="size-4" />
          {isPending ? 'Guardando…' : 'Pagar'}
        </Button>
      </div>
    </li>
  )
}
