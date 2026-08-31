import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { PageHeader } from '@/components/data/page-header'
import { EmptyState } from '@/components/data/empty-state'
import { ScaleIcon } from 'lucide-react'
import { mxn } from '@/components/data/format'
import { LiquidarBoton } from './liquidar-boton'
import { AtribucionCard } from './atribucion-card'

// b052 — Estado de cuenta BALANCE-0 por actor (F1 de finanzas de plataforma).
// Superadmin ve todas las cuentas (y liquida); el admin de agencia ve la suya.
// Saldo + = se le debe a la cuenta; saldo − = la cuenta debe (p.ej. el fee de
// Ketzal cuando el dinero llegó directo por SPEI).

type Cuenta = {
  account_type: string
  nombre: string | null
  account_supplier_id: string | null
  account_profile_id: string | null
  saldo: number
  movimientos: number
  ultimo: string
}

type Movimiento = {
  id: string
  kind: string
  amount_mxn: number
  note: string | null
  booking_id: string | null
  available_at: string | null
  created_at: string
}

const TIPO_LABEL: Record<string, string> = {
  plataforma: 'Ketzal (plataforma)',
  agencia: 'Agencia',
  embajador: 'Embajador',
  viajero: 'Viajero',
  agente: 'Agente',
}

const KIND_LABEL: Record<string, string> = {
  devengo: 'Comisión devengada',
  reverso: 'Reverso de comisión',
  fee_cobrado_split: 'Fee cobrado (split MP)',
  cobro_por_cuenta: 'Cobro por cuenta (payout 7 días)',
  payout: 'Payout',
  liquidacion: 'Liquidación',
  ajuste: 'Ajuste',
  credito_emitido: 'Crédito emitido al viajero',
  credito_canjeado: 'Crédito aplicado a una compra',
}

const fecha = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
})

export default async function CuentasPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; sup?: string; prof?: string }>
}) {
  const { tipo, sup, prof } = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: perfil } = await (supabase as any)
    .from('profiles')
    .select('role')
    .eq('id', user?.id ?? '')
    .maybeSingle()
  const esSuper = perfil?.role === 'superadmin'

  const { data } = await supabase.rpc('ledger_summary' as never)
  const cuentas = ((data as unknown as Cuenta[]) ?? []).map((c) => ({
    ...c,
    saldo: Number(c.saldo),
  }))

  // Detalle de la cuenta seleccionada (querystring).
  let movimientos: Movimiento[] = []
  let cuentaSel: Cuenta | undefined
  if (tipo) {
    cuentaSel = cuentas.find(
      (c) =>
        c.account_type === tipo &&
        (c.account_supplier_id ?? '') === (sup ?? '') &&
        (c.account_profile_id ?? '') === (prof ?? '')
    )
    const { data: mov } = await supabase.rpc('ledger_statement' as never, {
      p_account_type: tipo,
      p_supplier: sup ?? null,
      p_profile: prof ?? null,
    } as never)
    movimientos = ((mov as unknown as Movimiento[]) ?? []).map((m) => ({
      ...m,
      amount_mxn: Number(m.amount_mxn),
    }))
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cuentas"
        description="Estado de cuenta por actor (balance 0): comisiones, cobros por cuenta, payouts y liquidaciones. Saldo positivo = se le debe; negativo = debe."
      />

      {cuentas.length === 0 ? (
        <EmptyState
          icon={ScaleIcon}
          title="Sin movimientos"
          description="Cuando haya comisiones o cobros, aquí aparece el estado de cuenta de cada actor."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cuentas.map((c) => {
            const href = `/cuentas?tipo=${c.account_type}${c.account_supplier_id ? `&sup=${c.account_supplier_id}` : ''}${c.account_profile_id ? `&prof=${c.account_profile_id}` : ''}`
            return (
              <Card
                key={`${c.account_type}-${c.account_supplier_id ?? ''}-${c.account_profile_id ?? ''}`}
                className={
                  c.account_type === 'plataforma' ? 'border-primary/40 bg-primary/5' : undefined
                }
              >
                <CardHeader>
                  <CardDescription>
                    {TIPO_LABEL[c.account_type] ?? c.account_type}
                  </CardDescription>
                  <CardTitle className="text-lg">{c.nombre ?? '—'}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p
                    className={`text-2xl font-semibold tabular-nums ${
                      c.saldo > 0
                        ? 'text-emerald-600 dark:text-emerald-500'
                        : c.saldo < 0
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                    }`}
                  >
                    {mxn.format(c.saldo)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.movimientos} movimientos · último {fecha.format(new Date(c.ultimo))}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <Link
                      href={href}
                      className="text-sm text-primary underline-offset-2 hover:underline"
                    >
                      Ver movimientos →
                    </Link>
                    {/* b056: el saldo de un viajero es crédito redimible en Ketzal,
                        no retirable — `settle_ledger` lo rechaza, así que ni se ofrece. */}
                    {esSuper &&
                      c.account_type !== 'plataforma' &&
                      c.account_type !== 'viajero' &&
                      c.saldo !== 0 && (
                      <LiquidarBoton
                        accountType={c.account_type}
                        supplierId={c.account_supplier_id}
                        profileId={c.account_profile_id}
                        nombre={c.nombre ?? 'la cuenta'}
                        saldo={c.saldo}
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* ADR-0025: atribución de marketing (solo superadmin — vista de plataforma). */}
      {esSuper && <AtribucionCard />}

      {tipo && (
        <Card>
          <CardHeader>
            <CardTitle>
              Movimientos — {cuentaSel?.nombre ?? TIPO_LABEL[tipo] ?? tipo}
            </CardTitle>
            <CardDescription>
              Del más reciente al más antiguo. Los cobros por cuenta se pueden
              liquidar a partir de su fecha disponible (7 días).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {movimientos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin movimientos.</p>
            ) : (
              <ul className="divide-y">
                {movimientos.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">
                        {KIND_LABEL[m.kind] ?? m.kind}
                      </span>
                      {m.note && (
                        <span className="text-muted-foreground"> · {m.note}</span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {fecha.format(new Date(m.created_at))}
                        {m.available_at
                          ? ` · disponible ${fecha.format(new Date(m.available_at))}`
                          : ''}
                        {m.booking_id ? ' · ' : ''}
                        {m.booking_id && (
                          <Link
                            href={`/ventas/${m.booking_id}`}
                            className="text-primary underline-offset-2 hover:underline"
                          >
                            ver venta
                          </Link>
                        )}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 font-semibold tabular-nums ${
                        m.amount_mxn > 0
                          ? 'text-emerald-600 dark:text-emerald-500'
                          : 'text-destructive'
                      }`}
                    >
                      {m.amount_mxn > 0 ? '+' : ''}
                      {mxn.format(m.amount_mxn)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
