import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { LinkReferido } from './link-referido'

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

const ESTADO: Record<string, string> = {
  reserved: 'Reservada',
  confirmed: 'Confirmada',
  paid: 'Pagada',
}

type Venta = {
  servicio: string | null
  fecha: string | null
  status: string
  comision: number
}
type Earnings = {
  referral_code: string | null
  devengado: number
  pagado: number
  saldo: number
  num_ventas: number
  ventas: Venta[]
}

export default async function EmbajadorPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('my_ambassador_earnings' as never)
  const e = (data ?? {
    referral_code: null,
    devengado: 0,
    pagado: 0,
    saldo: 0,
    num_ventas: 0,
    ventas: [],
  }) as unknown as Earnings

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tu panel de embajador</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Comparte tu link, trae viajeros y gana por cada venta.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          No se pudieron cargar tus datos: {error.message}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tu link de referido</CardTitle>
          <CardDescription>
            Cualquiera que compre entrando por tu link te cuenta como venta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {e.referral_code ? (
            <LinkReferido code={e.referral_code} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Aún no tienes código de referido. Pídeselo a Ketzal.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Ganado</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {mxn.format(Number(e.devengado ?? 0))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {e.num_ventas === 1 ? '1 venta' : `${e.num_ventas ?? 0} ventas`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Pagado</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {mxn.format(Number(e.pagado ?? 0))}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card className={Number(e.saldo ?? 0) > 0 ? 'border-emerald-500/40' : undefined}>
          <CardHeader>
            <CardDescription>Por cobrar</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {mxn.format(Number(e.saldo ?? 0))}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tus ventas</CardTitle>
          <CardDescription>Viajes vendidos con tu código.</CardDescription>
        </CardHeader>
        <CardContent>
          {e.ventas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no tienes ventas. Comparte tu link para empezar.
            </p>
          ) : (
            <ul className="divide-y">
              {e.ventas.map((v, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {v.servicio ?? 'Viaje'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {ESTADO[v.status] ?? v.status}
                      {v.fecha ? ` · ${v.fecha}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {mxn.format(Number(v.comision ?? 0))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
