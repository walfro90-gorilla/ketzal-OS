'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { aplicarCredito } from './cancelacion-actions'

// C5 — El cliente de esta venta tiene crédito vigente (de cancelaciones
// anteriores, en CUALQUIER agencia de Ketzal): aplicarlo como abono método
// 'credito'. El RPC valida persona, vigencia y ambos saldos.

export type CreditoCliente = {
  id: string
  agencia: string
  saldo_mxn: number
  expira: string
}

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })
const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })

export function AplicarCredito({
  bookingId,
  creditos,
  saldoVenta,
}: {
  bookingId: string
  creditos: CreditoCliente[]
  saldoVenta: number
}) {
  const [pending, start] = useTransition()
  const conSaldo = creditos.filter((c) => Number(c.saldo_mxn) > 0)
  if (conSaldo.length === 0 || saldoVenta <= 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crédito del cliente</CardTitle>
        <CardDescription>
          Saldo a favor por cancelaciones — se aplica como abono de esta venta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {conSaldo.map((c) => {
          const max = Math.min(Number(c.saldo_mxn), saldoVenta)
          return (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
            >
              <div>
                <p className="font-medium tabular-nums">{mxn.format(Number(c.saldo_mxn))}</p>
                <p className="text-xs text-muted-foreground">
                  {c.agencia} · vence {fecha.format(new Date(`${c.expira}T00:00:00`))}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => {
                  const raw = window.prompt(
                    `Monto a aplicar (máximo ${mxn.format(max)}):`,
                    String(max)
                  )
                  if (raw == null) return
                  const m = Number(raw)
                  if (!Number.isFinite(m) || m <= 0) {
                    toast.error('Escribe un monto mayor que 0.')
                    return
                  }
                  if (m > max) {
                    toast.error(`Máximo aplicable: ${mxn.format(max)}.`)
                    return
                  }
                  start(async () => {
                    const res = await aplicarCredito(bookingId, c.id, m)
                    if ('error' in res) return void toast.error(res.error)
                    toast.success(
                      `Crédito aplicado: ${mxn.format(m)}. Saldo del crédito: ${mxn.format(res.saldoCredito)}.`
                    )
                  })
                }}
              >
                {pending ? 'Aplicando…' : 'Aplicar'}
              </Button>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
