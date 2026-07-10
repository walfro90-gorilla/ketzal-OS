import { createClient } from '@/lib/supabase/server'
import { ImprimirBoton } from '@/components/imprimir-boton'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// Página PÚBLICA (sin sesión): el cliente final la abre desde WhatsApp.
// El acceso a los datos pasa por el RPC get_statement_by_token (callable por
// anon); el token uuid es la única llave. Misma receta que /cotizacion/[token].

// El RPC devuelve jsonb: tipamos el resultado localmente y casteamos.
type StatementAbono = {
  fecha: string
  monto: number
  metodo: string | null
  tipo: 'payment' | 'refund'
}

type Statement = {
  agencia: string
  logo: string | null
  folio: string
  cliente: string | null
  servicio: string | null
  fecha_viaje: string | null // ISO date "2026-07-30"
  pasajeros: number
  estado: 'draft' | 'reserved' | 'paid' | 'cancelled' | string
  moneda: string // "MXN"
  total: number
  pagado: number
  saldo: number
  due_date: string | null // ISO date
  emitido: string // ISO timestamp
  abonos: StatementAbono[]
}

// Formatters locales (duplicados a propósito: los de (ops)/ventas/ui.tsx
// viven en el grupo privado; esta página es pública y autocontenida).
const dateFmt = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' })
const emitidoFmt = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'long',
  timeStyle: 'short',
})

function formatDate(date: string | null, fallback = '—'): string {
  if (!date) return fallback
  // Fechas "puras" (YYYY-MM-DD) se anclan a medianoche local para no correrse un día.
  const parsed = new Date(date.includes('T') ? date : `${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return dateFmt.format(parsed)
}

const METHOD_LABELS: Record<string, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
}

function EstadoBadge({ estado }: { estado: string }) {
  if (estado === 'paid')
    return <Badge className="bg-emerald-600 text-white">Pagada</Badge>
  if (estado === 'cancelled') return <Badge variant="destructive">Cancelada</Badge>
  if (estado === 'reserved') return <Badge variant="secondary">Reservada</Badge>
  if (estado === 'draft') return <Badge variant="outline">Borrador</Badge>
  return <Badge variant="outline">{estado}</Badge>
}

function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Estado de cuenta no disponible</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          El enlace no es válido o el estado de cuenta ya no está disponible.
          Pide a tu agencia que te comparta un enlace nuevo.
        </p>
      </div>
    </main>
  )
}

export default async function EstadoCuentaPublicoPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  // Sin sesión, el cliente server usa la anon key: el RPC es callable por anon.
  // Un token malformado (no-uuid) hace fallar el RPC → misma pantalla de no encontrada.
  const { data, error } = await supabase.rpc('get_statement_by_token', {
    p_token: token,
  })

  if (error || data == null) return <NotFound />
  const statement = data as unknown as Statement

  const money = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: statement.moneda || 'MXN',
  })

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-8 sm:py-12">
      <header className="space-y-1 text-center">
        {statement.logo && (
          // Logo externo (URL fuera del dominio): <img> plano a propósito.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={statement.logo}
            alt={`Logo de ${statement.agencia}`}
            className="mx-auto mb-2 h-16 w-auto object-contain"
          />
        )}
        <p className="text-2xl font-bold">{statement.agencia}</p>
        <h1 className="text-sm font-medium tracking-widest text-muted-foreground uppercase">
          Estado de cuenta
        </h1>
        <p className="text-sm text-muted-foreground">Folio {statement.folio}</p>
      </header>

      <div className="flex justify-center print:hidden">
        <ImprimirBoton label="Descargar PDF / Imprimir" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {statement.cliente ? `Para ${statement.cliente}` : 'Datos del viaje'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Servicio</dt>
              <dd className="mt-1 font-medium">
                {statement.servicio ?? 'Venta de viaje'}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Fecha de viaje</dt>
              <dd className="mt-1 font-medium">
                {formatDate(statement.fecha_viaje, 'Por definir')}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Pasajeros</dt>
              <dd className="mt-1 font-medium tabular-nums">
                {statement.pasajeros}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Estado</dt>
              <dd className="mt-1">
                <EstadoBadge estado={statement.estado} />
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Resumen: total / pagado / saldo (derivado en el RPC, regla de oro) */}
      <Card>
        <CardContent className="space-y-4">
          <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="mt-1 text-lg font-medium tabular-nums">
                {money.format(Number(statement.total))}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pagado</p>
              <p className="mt-1 text-lg font-medium tabular-nums">
                {money.format(Number(statement.pagado))}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Saldo</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {money.format(Number(statement.saldo))}
              </p>
            </div>
          </div>
          {statement.due_date && Number(statement.saldo) > 0 && (
            <p className="text-sm font-medium">
              Fecha límite de pago:{' '}
              <span className="tabular-nums">{formatDate(statement.due_date)}</span>
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Abonos</CardTitle>
        </CardHeader>
        <CardContent>
          {statement.abonos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin abonos registrados aún.
            </p>
          ) : (
            <>
              {/* Móvil: lista apilada (campo-primero) */}
              <ul className="space-y-3 sm:hidden print:hidden">
                {statement.abonos.map((abono, i) => {
                  const isRefund = abono.tipo === 'refund'
                  return (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-medium">
                          {formatDate(abono.fecha)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {abono.metodo
                            ? METHOD_LABELS[abono.metodo] ?? abono.metodo
                            : '—'}
                          {' · '}
                          {isRefund ? 'Reembolso' : 'Abono'}
                        </p>
                      </div>
                      <p
                        className={`text-sm font-medium tabular-nums ${
                          isRefund ? 'text-destructive' : ''
                        }`}
                      >
                        {isRefund ? '−' : ''}
                        {money.format(Number(abono.monto))}
                      </p>
                    </li>
                  )
                })}
              </ul>

              {/* Pantallas amplias e impresión: tabla */}
              <div className="hidden overflow-x-auto sm:block print:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {statement.abonos.map((abono, i) => {
                      const isRefund = abono.tipo === 'refund'
                      return (
                        <TableRow key={i}>
                          <TableCell>{formatDate(abono.fecha)}</TableCell>
                          <TableCell>
                            {abono.metodo
                              ? METHOD_LABELS[abono.metodo] ?? abono.metodo
                              : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={isRefund ? 'destructive' : 'secondary'}
                            >
                              {isRefund ? 'Reembolso' : 'Abono'}
                            </Badge>
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${
                              isRefund ? 'text-destructive' : ''
                            }`}
                          >
                            {isRefund ? '−' : ''}
                            {money.format(Number(abono.monto))}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <footer className="space-y-1 pb-8 text-center text-xs text-muted-foreground">
        <p>Documento generado el {emitidoFmt.format(new Date(statement.emitido))}</p>
        <p>Powered by Ketzal</p>
      </footer>
    </main>
  )
}
