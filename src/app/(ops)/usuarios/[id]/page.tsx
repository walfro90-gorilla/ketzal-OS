import Link from 'next/link'
import { UserXIcon } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { PageHeader } from '@/components/data/page-header'
import { StatTile } from '@/components/data/stat-tile'
import { assertAdmin } from '../guard'
import { fmtFecha } from '@/components/data/format'
import { LineaTiempo, type Evento } from './linea-tiempo'

type Ficha = {
  id: string
  nombre: string | null
  email: string | null
  telefono: string | null
  rol: string | null
  tipo: string | null
  activo: boolean | null
  agencia: string | null
  perfil_creado: string | null
  perfil_actualizado: string | null
  auth: {
    creada: string
    correo_confirmado: string | null
    ultimo_acceso: string | null
    proveedores: string[]
    tiene_password: boolean
    baneada_hasta: string | null
    recuperacion_enviada: string | null
    invitada: string | null
  } | null
  sesiones: {
    creada: string
    refrescada: string | null
    ip: string | null
    navegador: string | null
  }[]
  resumen: {
    ventas_hechas: number
    compras: number
    clientes_dados_de_alta: number
    recibos_emitidos: number
    eventos: number
  }
}

const TIPO_LABEL: Record<string, string> = {
  agente: 'Agente',
  viajero: 'Viajero',
  embajador: 'Embajador',
  proveedor: 'Proveedor',
}
const ROL_LABEL: Record<string, string> = {
  user: 'Agente',
  admin: 'Admin',
  superadmin: 'God admin',
}

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

/** Cómo entra: proveedores de Auth + contraseña, en una frase. */
function comoEntra(auth: NonNullable<Ficha['auth']>): string {
  const vias = [...auth.proveedores]
  if (auth.tiene_password) vias.push('contraseña')
  return vias.length ? vias.join(' · ') : '—'
}

export default async function UsuarioDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  // La puerta de la sección sigue dando 404 a quien no es admin: no revelamos
  // que /usuarios existe.
  const { supabase } = await assertAdmin()

  // Ambos RPCs traen su propio guard (`can_view_user`).
  const [fichaRes, timelineRes] = await Promise.all([
    supabase.rpc('user_account_detail' as never, { p_id: id } as never),
    supabase.rpc('user_timeline' as never, { p_id: id } as never),
  ])

  const ficha = fichaRes.data as unknown as Ficha | null

  // b093: antes esto era `notFound()`, y el 404 mudo se leía como "la página no
  // existe / no está ruteada" — fue justo lo que se reportó. La cuenta puede
  // haber desaparecido entre que se pintó la lista y el clic (pasaba con las
  // fixtures de los hard-tests). Ahora se explica.
  //
  // No se distingue "no existe" de "no es de tu alcance" a propósito: el RPC
  // devuelve null en los dos casos y saber cuál es delataría de quién hay
  // cuenta en otra agencia.
  if (fichaRes.error || !ficha?.id) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          title="Cuenta no encontrada"
          description="No hay expediente que mostrar para este identificador."
          backHref="/usuarios"
          backLabel="Volver a usuarios"
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <UserXIcon className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Esta cuenta ya no existe o no es de tu alcance. Si llegaste desde
              la lista, pudo borrarse mientras la tenías abierta.
            </p>
            <Link href="/usuarios" className={buttonVariants({ variant: 'outline' })}>
              Volver a la lista
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  const eventos = (timelineRes.data ?? []) as unknown as Evento[]
  const { auth, resumen } = ficha
  const iniciales =
    (ficha.nombre ?? ficha.email ?? '?')
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0] ?? '')
      .join('')
      .toUpperCase() || '?'

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={ficha.nombre || ficha.email || 'Cuenta'}
        description="Expediente completo: desde que nació la cuenta hasta hoy."
        backHref="/usuarios"
        backLabel="Volver a usuarios"
      />

      {/* Quién es, de un vistazo. */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 pt-6">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">
            {iniciales}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate text-base font-semibold">
              {ficha.nombre || 'Sin nombre'}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {ficha.email ?? 'Sin correo'}
              {ficha.telefono ? ` · ${ficha.telefono}` : ''}
            </p>
            <p className="text-xs text-muted-foreground">
              {ficha.agencia ?? 'Sin agencia'}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">
              {TIPO_LABEL[ficha.tipo ?? ''] ?? ficha.tipo ?? 'Sin tipo'}
            </Badge>
            {ficha.rol && ficha.rol !== 'user' && (
              <Badge variant="outline">{ROL_LABEL[ficha.rol] ?? ficha.rol}</Badge>
            )}
            {!auth ? (
              <Badge variant="destructive">Sin cuenta</Badge>
            ) : ficha.activo ? (
              <Badge variant="secondary">Activa</Badge>
            ) : (
              <Badge variant="warning">Pendiente de aprobación</Badge>
            )}
            {auth?.baneada_hasta && <Badge variant="destructive">Bloqueada</Badge>}
          </div>
        </CardContent>
      </Card>

      {/* Las cuatro señales que se miran primero al abrir un expediente. */}
      {auth && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label="Último acceso"
            value={
              <span className="text-base">{fmtFecha(auth.ultimo_acceso, true)}</span>
            }
          />
          <StatTile
            label="Sesiones abiertas"
            value={ficha.sesiones.length}
            tone={ficha.sesiones.length ? 'good' : 'neutral'}
          />
          <StatTile
            label="Entra con"
            value={<span className="text-base">{comoEntra(auth)}</span>}
          />
          <StatTile
            label="Cuenta creada"
            value={<span className="text-base">{fmtFecha(auth.creada)}</span>}
            hint={auth.invitada ? `Invitada ${fmtFecha(auth.invitada)}` : undefined}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Perfil en Ketzal</CardTitle>
            <CardDescription>Lo que la operación sabe de esta persona.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <Dato label="Tipo">{TIPO_LABEL[ficha.tipo ?? ''] ?? '—'}</Dato>
              <Dato label="Rol">{ROL_LABEL[ficha.rol ?? ''] ?? ficha.rol ?? '—'}</Dato>
              <Dato label="Agencia">{ficha.agencia ?? '—'}</Dato>
              <Dato label="Teléfono">{ficha.telefono ?? '—'}</Dato>
              <Dato label="Perfil creado">{fmtFecha(ficha.perfil_creado, true)}</Dato>
              <Dato label="Perfil actualizado">
                {fmtFecha(ficha.perfil_actualizado, true)}
              </Dato>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cuenta de acceso</CardTitle>
            <CardDescription>
              Lo que guarda Supabase Auth: cómo entra y desde cuándo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {auth ? (
              <dl className="grid grid-cols-2 gap-4">
                <Dato label="Correo confirmado">
                  {fmtFecha(auth.correo_confirmado, true)}
                </Dato>
                <Dato label="Bloqueada">
                  {auth.baneada_hasta ? fmtFecha(auth.baneada_hasta, true) : 'No'}
                </Dato>
                {/* Un correo de recuperación pegado al alta es señal de sondeo
                    automático: fue lo que delató la cuenta del 2026-07-19. */}
                <Dato label="Último correo de recuperación">
                  {fmtFecha(auth.recuperacion_enviada, true)}
                </Dato>
                <Dato label="Invitada el">{fmtFecha(auth.invitada, true)}</Dato>
              </dl>
            ) : (
              <p className="text-sm text-destructive">
                Esta persona tiene perfil en Ketzal pero ya no existe en Auth: no
                puede entrar. Suele pasar si se borró la cuenta y quedó el perfil.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Qué ha hecho</CardTitle>
          <CardDescription>
            Su huella en la operación, en números.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Ventas cerradas" value={resumen.ventas_hechas} />
            <StatTile label="Compras" value={resumen.compras} />
            <StatTile label="Clientes de alta" value={resumen.clientes_dados_de_alta} />
            <StatTile label="Recibos emitidos" value={resumen.recibos_emitidos} />
            <StatTile label="Eventos" value={resumen.eventos} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sesiones abiertas</CardTitle>
          <CardDescription>
            De dónde está conectada ahora mismo. Supabase sólo guarda las vivas:
            al cerrar sesión desaparecen, y por eso la bitácora registra cada
            inicio de sesión aparte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ficha.sesiones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna sesión abierta.</p>
          ) : (
            <ul className="divide-y">
              {ficha.sesiones.map((s) => (
                <li key={s.creada} className="py-3 first:pt-0 last:pb-0 text-sm">
                  <div className="font-medium">{s.ip ?? 'IP desconocida'}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtFecha(s.creada, true)}
                    {s.refrescada
                      ? ` · última actividad ${fmtFecha(s.refrescada, true)}`
                      : ''}
                  </div>
                  {s.navegador && (
                    <div className="text-xs break-words text-muted-foreground">
                      {s.navegador}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
          <CardDescription>
            Todo lo que se sabe de esta cuenta, del evento más reciente al
            nacimiento. Une la bitácora con sus ventas, pagos, recibos,
            comisiones e invitaciones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LineaTiempo eventos={eventos} />
        </CardContent>
      </Card>
    </div>
  )
}
