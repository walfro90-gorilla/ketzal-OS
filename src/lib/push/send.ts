import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase/service'

// Envío de notificaciones (b036): inserta la fila del feed in-app y manda el
// Web Push a cada dispositivo suscrito del usuario. Server-only (service role:
// notifications no tiene INSERT para authenticated). Best-effort en el push:
// si un endpoint murió (404/410) se borra la suscripción; si faltan las llaves
// VAPID solo queda el feed in-app (no truena).

export type Notificacion = { title: string; body?: string; url?: string }

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

  await db.from('notifications').insert(
    ids.map((user_id: string) => ({
      user_id,
      title: n.title,
      body: n.body ?? null,
      url: n.url ?? null,
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
