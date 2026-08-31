import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { createServiceClient } from '@/lib/supabase/service'
import { mxn } from '@/components/data/format'

// ADR-0025: atribución del marketplace — fuente → pedidos → con pago → $.
// Solo superadmin (la vista es de plataforma, cruza agencias ⇒ service role).
// El $ es la suma de `total` de las ventas con pago (reserved/paid): mide qué
// fuente vende, no caja cobrada (eso ya lo dice el ledger).

type Fila = {
  fuente: string
  pedidos: number
  pagados: number
  vendido: number
}

export async function AtribucionCard() {
  const svc = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (svc as any)
    .from('bookings')
    .select('status, total, attribution')
    .not('marketplace_customer_id', 'is', null)

  const filas = new Map<string, Fila>()
  for (const b of (data ?? []) as {
    status: string
    total: number
    attribution: { source?: string } | null
  }[]) {
    const fuente = b.attribution?.source ?? 'directo'
    const f = filas.get(fuente) ?? { fuente, pedidos: 0, pagados: 0, vendido: 0 }
    f.pedidos += 1
    if (b.status === 'reserved' || b.status === 'paid') {
      f.pagados += 1
      f.vendido += Number(b.total)
    }
    filas.set(fuente, f)
  }
  const orden = [...filas.values()].sort((a, b) => b.vendido - a.vendido)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Atribución del marketplace</CardTitle>
        <CardDescription>
          De dónde vienen los pedidos del portal (first-touch, ADR-0025).
          &ldquo;directo&rdquo; = sin parámetros de campaña.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {orden.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay pedidos del marketplace.
          </p>
        ) : (
          <ul className="divide-y">
            {orden.map((f) => (
              <li key={f.fuente} className="flex items-center gap-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{f.fuente}</span>
                  <span className="block text-xs text-muted-foreground">
                    {f.pedidos} {f.pedidos === 1 ? 'pedido' : 'pedidos'} ·{' '}
                    {f.pagados} con pago
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {mxn.format(f.vendido)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
