import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase/service'
import type { EventoNoti } from '@/lib/notificaciones'

// Envío de notificaciones (b036): inserta la fila del feed in-app y manda el
// Web Push a cada dispositivo suscrito del usuario. Server-only (service role:
// notifications no tiene INSERT para authenticated). Best-effort en el push:
// si un endpoint murió (404/410) se borra la suscripción; si faltan las llaves
// VAPID solo queda el feed in-app (no truena).

export type Notificacion = {
  title: string
  body?: string
  url?: string
  /** Qué acción la produjo: la campana elige el ícono con esto. */
  evento?: EventoNoti
}

function vapidListo(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  )
}

export async function notificar(
  userIds: string[],
  n: Notificacion
): Promise<void> {
  const ids = [...new Set(userIds)].filter(Boolean)
  if (!ids.length) return
  const svc = createServiceClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = svc as any

  // La tabla es del scaffold B2C (reusada): message NOT NULL y action_url;
  // type/priority/is_read salen por default ('INFO'/'NORMAL'/false). El evento
  // va en `metadata` y no en `type`: ese enum es del scaffold y ampliarlo sería
  // migración sobre una BD compartida (ver src/lib/notificaciones.ts).
  await db.from('notifications').insert(
    ids.map((user_id: string) => ({
      user_id,
      title: n.title,
      message: n.body ?? n.title,
      action_url: n.url ?? null,
      metadata: n.evento ? { evento: n.evento } : null,
    }))
  )

  if (!vapidListo()) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:soporte@ketzal.app',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )

  const { data: subs } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', ids)

  const payload = JSON.stringify(n)
  await Promise.allSettled(
    ((subs ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[]).map(
      async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload
          )
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode
          // Endpoint muerto (usuario revocó permiso / reinstaló): limpiar.
          if (code === 404 || code === 410) {
            await db.from('push_subscriptions').delete().eq('id', s.id)
          }
        }
      }
    )
  )
}

/** Superadmins activos (eventos de plataforma: viajero/embajador nuevo). */
export async function superadmins(): Promise<string[]> {
  const svc = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (svc as any)
    .from('profiles')
    .select('id')
    .eq('active', true)
    .eq('role', 'superadmin')
  return ((data ?? []) as { id: string }[]).map((p) => p.id)
}

/** Admins activos de una agencia + superadmins activos (los que operan dinero). */
export async function adminsDeAgencia(supplierId: string): Promise<string[]> {
  const svc = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (svc as any)
    .from('profiles')
    .select('id, role, supplier_id, active')
    .eq('active', true)
    .in('role', ['admin', 'superadmin'])
  const rows = (data ?? []) as {
    id: string
    role: string
    supplier_id: string | null
  }[]
  return rows
    .filter((p) => p.role === 'superadmin' || p.supplier_id === supplierId)
    .map((p) => p.id)
}
