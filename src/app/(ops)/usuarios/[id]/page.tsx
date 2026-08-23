import { notFound } from 'next/navigation'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/data/page-header'
import { assertAdmin } from '../guard'
import { fmtFecha } from '../usuarios-list'
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

function Dato({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  )
}

export default async function UsuarioDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { supabase } = await assertAdmin()

  // Ambos RPCs traen su propio guard (`can_view_user`): si esta sesión no tiene
  // acceso a esa cuenta, devuelven error y aquí se ve como 404.
  const [fichaRes, timelineRes] = await Promise.all([
    supabase.rpc('user_account_detail' as never, { p_id: id } as never),
    supabase.rpc('user_timeline' as never, { p_id: id } as never),
  ])

  const ficha = fichaRes.data as unknown as Ficha | null
  if (fichaRes.error || !ficha?.id) notFound()
  const eventos = (timelineRes.data ?? []) as unknown as Evento[]

  const { auth, resumen } = ficha

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={ficha.nombre || ficha.email || 'Cuenta'}
        description="Expediente completo: desde que nació la cuenta hasta hoy."
        backHref="/usuarios"
        backLabel="Volver a usuarios"
      />

      <Card>
        <CardHeader>
          <CardTitle>Identidad</CardTitle>
          <CardDescription>
            {ficha.email ?? 'Sin correo'}
            {ficha.agencia ? ` · ${ficha.agencia}` : ' · Sin agencia'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Dato label="Tipo">{ficha.tipo ?? '—'}</Dato>
            <Dato label="Rol">{ficha.rol ?? '—'}</Dato>
            <Dato label="Estado">
              {ficha.activo ? (
                <Badge variant="secondary">Activa</Badge>
              ) : (
                <Badge variant="warning">Pendiente de aprobación</Badge>
              )}
            </Dato>
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
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Dato label="Cuenta creada">{fmtFecha(auth.creada, true)}</Dato>
              <Dato label="Correo confirmado">
                {fmtFecha(auth.correo_confirmado, true)}
              </Dato>
              <Dato label="Último acceso">
                {fmtFecha(auth.ultimo_acceso, true)}
              </Dato>
              <Dato label="Entra con">
                {auth.proveedores.length ? auth.proveedores.join(', ') : '—'}
                {auth.tiene_password ? ' · contraseña' : ''}
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
            <ul className="space-y-3">
              {ficha.sesiones.map((s) => (
                <li key={s.creada} className="text-sm">
                  <div className="font-medium">{s.ip ?? 'IP desconocida'}</div>
                  <div className="text-xs text-muted-foreground">
                    {fmtFecha(s.creada, true)}
                    {s.refrescada ? ` · última actividad ${fmtFecha(s.refrescada, true)}` : ''}
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
          <CardTitle>Qué ha hecho</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Dato label="Ventas cerradas">{resumen.ventas_hechas}</Dato>
            <Dato label="Compras">{resumen.compras}</Dato>
            <Dato label="Clientes dados de alta">
              {resumen.clientes_dados_de_alta}
            </Dato>
            <Dato label="Recibos emitidos">{resumen.recibos_emitidos}</Dato>
            <Dato label="Eventos en bitácora">{resumen.eventos}</Dato>
          </dl>
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
