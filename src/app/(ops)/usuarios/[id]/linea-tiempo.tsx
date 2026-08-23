import Link from 'next/link'
import {
  BanknoteIcon,
  BellIcon,
  FileTextIcon,
  KeyRoundIcon,
  LogInIcon,
  ShieldIcon,
  ShoppingBagIcon,
  UserRoundIcon,
  UsersRoundIcon,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export type Evento = {
  ts: string
  kind: string
  fuente: 'bitacora' | 'auth' | 'perfil' | 'ventas' | 'marketplace' | 'dinero' | 'clientes' | 'equipo' | 'sistema'
  detalle: Record<string, unknown> | null
  href: string | null
}

// Qué se le dice a una persona por cada `kind`. Lo que no esté aquí se muestra
// con su nombre crudo: mejor un evento feo que un evento invisible.
const TITULO: Record<string, string> = {
  cuenta_creada: 'Nació la cuenta',
  perfil_creado: 'Se creó su perfil en Ketzal',
  signup: 'Se registró',
  login: 'Inició sesión',
  logout: 'Cerró sesión',
  sesion_activa: 'Sesión abierta',
  password_reset_request: 'Pidió recuperar contraseña',
  password_changed: 'Cambió su contraseña',
  role_change: 'Cambió de rol',
  agency_change: 'Cambió de agencia',
  activated: 'Cuenta activada',
  deactivated: 'Cuenta desactivada',
  invited: 'Fue invitado',
  invitation_accepted: 'Aceptó la invitación',
  invitacion: 'Invitación a una agencia',
  join_request: 'Pidió entrar a una agencia',
  join_resolved: 'Se resolvió su solicitud',
  solicitud_agencia: 'Solicitud para entrar a una agencia',
  profile_updated: 'Actualizó su perfil',
  nota: 'Nota',
  deleted: 'Cuenta eliminada',
  venta_creada: 'Cerró una venta',
  compra: 'Compró un viaje',
  pago: 'Pago registrado',
  devolucion: 'Devolución',
  recibo_emitido: 'Emitió un recibo',
  cliente_alta: 'Dio de alta un cliente',
  comision: 'Ganó comisión',
  comision_revertida: 'Comisión revertida',
  asiento_ledger: 'Movimiento en su cuenta',
  notificacion: 'Notificación',
}

const ICONO: Record<Evento['fuente'], LucideIcon> = {
  bitacora: ShieldIcon,
  auth: LogInIcon,
  perfil: UserRoundIcon,
  ventas: FileTextIcon,
  marketplace: ShoppingBagIcon,
  dinero: BanknoteIcon,
  clientes: UsersRoundIcon,
  equipo: KeyRoundIcon,
  sistema: BellIcon,
}

const fechaHora = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function cuando(ts: string): string {
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? ts : fechaHora.format(d)
}

/** Los valores del jsonb se pintan como pares etiqueta: valor, sin adivinar tipos. */
function chips(detalle: Record<string, unknown> | null): [string, string][] {
  if (!detalle) return []
  return Object.entries(detalle)
    .filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => [
      k.replaceAll('_', ' '),
      Array.isArray(v) ? v.join(', ') : String(v),
    ])
}

export function LineaTiempo({ eventos }: { eventos: Evento[] }) {
  if (eventos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin actividad registrada todavía.
      </p>
    )
  }

  return (
    <ol className="relative space-y-5 border-l pl-6">
      {eventos.map((e, i) => {
        const Icono = ICONO[e.fuente] ?? ShieldIcon
        const pares = chips(e.detalle)
        return (
          <li key={`${e.ts}-${e.kind}-${i}`} className="relative">
            <span className="absolute -left-[33px] flex size-6 items-center justify-center rounded-full border bg-background">
              <Icono className="size-3 text-muted-foreground" />
            </span>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{TITULO[e.kind] ?? e.kind}</span>
              <span className="text-xs text-muted-foreground">{cuando(e.ts)}</span>
              {e.href && (
                <Link
                  href={e.href}
                  className="text-xs text-primary hover:underline"
                >
                  Ver
                </Link>
              )}
            </div>
            {pares.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {pares.map(([k, v]) => (
                  <Badge key={k} variant="outline" className="font-normal">
                    <span className="text-muted-foreground">{k}:</span>&nbsp;{v}
                  </Badge>
                ))}
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
