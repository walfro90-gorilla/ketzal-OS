'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  BellIcon,
  BellRingIcon,
  ClockIcon,
  FileTextIcon,
  HandCoinsIcon,
  MegaphoneIcon,
  UserRoundIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { eventoDe, type EventoNoti } from '@/lib/notificaciones'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// Campana de notificaciones (b036): feed in-app (tabla notifications, RLS
// propia) + alta de Web Push del dispositivo (PWA instalada ⇒ notifica con la
// app cerrada). También registra el service worker /sw.js al montar.

type Noti = {
  id: string
  title: string
  body: string | null
  url: string | null
  read_at: string | null
  created_at: string
  metadata: unknown
}

// Un ícono por acción. Se reusan los del nav (`nav-items.ts`) para que el
// símbolo signifique lo mismo en los dos lados: una cotización se ve igual en
// la campana y en el menú. El evento sale de `metadata`, nunca del título: el
// copy cambia y un ícono elegido por texto se rompe en silencio.
const ICONOS: Record<EventoNoti, LucideIcon> = {
  cotizacion: FileTextIcon,
  pago: HandCoinsIcon,
  spei: ClockIcon,
  viajero: UserRoundIcon,
  embajador: MegaphoneIcon,
  pasajeros: UsersIcon,
}

/** Las filas anteriores a esto no traen evento: campana genérica. */
function iconoDe(metadata: unknown): LucideIcon {
  const e = eventoDe(metadata)
  return e ? ICONOS[e] : BellIcon
}

function tiempoRelativo(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' }).format(
    new Date(iso)
  )
}

function base64ToUint8(base64: string): Uint8Array {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const b = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export function Notificaciones() {
  const router = useRouter()
  const [items, setItems] = useState<Noti[]>([])
  const [noLeidas, setNoLeidas] = useState(0)
  const [pushActivo, setPushActivo] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  const cargar = useCallback(async () => {
    const supabase = createClient()
    // La tabla reusa el scaffold B2C: columnas reales message/action_url,
    // aliaseadas aquí a body/url para el shape del componente.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('notifications')
      .select('id, title, body:message, url:action_url, read_at, created_at, metadata')
      .order('created_at', { ascending: false })
      .limit(15)
    const rows = (data ?? []) as Noti[]
    setItems(rows)
    setNoLeidas(rows.filter((n) => !n.read_at).length)
  }, [])

  // SW + estado inicial. El registro es idempotente (el navegador reusa).
  // "Tiempo real" sin infra extra: (1) el SW manda postMessage al llegar un
  // push ⇒ refresco instantáneo; (2) refresco al recuperar el foco de la
  // pestaña; (3) polling de respaldo cada 60s.
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(async (reg) => {
          const sub = await reg.pushManager.getSubscription()
          setPushActivo(Boolean(sub))
        })
        .catch(() => setPushActivo(false))
    } else {
      setPushActivo(false)
    }
    cargar()

    const onSwMsg = (e: MessageEvent) => {
      if ((e.data as { type?: string } | null)?.type === 'ketzal:noti') cargar()
    }
    navigator.serviceWorker?.addEventListener('message', onSwMsg)
    const onFocus = () => cargar()
    window.addEventListener('focus', onFocus)
    const iv = setInterval(cargar, 60_000)
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onSwMsg)
      window.removeEventListener('focus', onFocus)
      clearInterval(iv)
    }
  }, [cargar])

  async function activarPush() {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!publicKey || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      toast.error('Este navegador no soporta notificaciones push.')
      return
    }
    setBusy(true)
    try {
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') {
        toast.error('Permiso de notificaciones denegado.')
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8(publicKey) as BufferSource,
      })
      const j = sub.toJSON()
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('push_subscriptions').upsert(
        {
          user_id: user.id,
          endpoint: sub.endpoint,
          p256dh: j.keys?.p256dh ?? '',
          auth: j.keys?.auth ?? '',
        },
        { onConflict: 'endpoint' }
      )
      if (error) {
        toast.error('No se pudo guardar la suscripción.')
        return
      }
      setPushActivo(true)
      toast.success('Notificaciones activadas en este dispositivo.')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Abrir una notificación la marca leída. Optimista a propósito: si el UPDATE
   * falla, lo peor es que reaparezca en el siguiente refresco — bloquear la
   * navegación por eso sería peor. La RLS ya acota a las filas propias
   * (`notifications_upd_own`), así que el `.eq('id')` es precisión, no permiso.
   */
  async function abrir(n: Noti) {
    if (!n.read_at) {
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read_at: 'ya' } : x)))
      setNoLeidas((k) => Math.max(0, k - 1))
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('notifications')
        .update({ read_at: new Date().toISOString(), is_read: true })
        .eq('id', n.id)
    }
    if (n.url) router.push(n.url)
  }

  async function marcarLeidas() {
    if (!noLeidas) return
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('notifications')
      .update({ read_at: new Date().toISOString(), is_read: true })
      .is('read_at', null)
    setItems((xs) => xs.map((n) => ({ ...n, read_at: n.read_at ?? 'ya' })))
    setNoLeidas(0)
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && cargar()}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              noLeidas > 0 ? `Notificaciones (${noLeidas} sin leer)` : 'Notificaciones'
            }
            className="relative size-11 md:size-9"
          />
        }
      >
        <BellIcon />
        {noLeidas > 0 && (
          <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[90vw]">
        <div className="flex items-center justify-between px-1.5 py-1.5">
          <span className="text-sm font-medium">Notificaciones</span>
          {noLeidas > 0 && (
            <button
              type="button"
              onClick={marcarLeidas}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Marcar leídas
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-1.5 py-3 text-center text-sm text-muted-foreground">
            Sin notificaciones.
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {items.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onClick={() => abrir(n)}
                className={cn(
                  'items-start gap-2 py-2',
                  // Sin leer = fondo un punto más oscuro que el del menú, en
                  // los dos temas. Es un matiz, no un bloque de color: la
                  // jerarquía la sigue cargando el título en negritas.
                  !n.read_at && 'bg-black/[0.045] dark:bg-black/25'
                )}
              >
                {(() => {
                  const Icono = iconoDe(n.metadata)
                  return (
                    <Icono
                      aria-hidden
                      className={cn(
                        'mt-0.5 size-4 shrink-0',
                        n.read_at ? 'text-muted-foreground' : 'text-primary'
                      )}
                    />
                  )
                })()}
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={n.read_at ? 'text-sm' : 'text-sm font-semibold'}>
                    {n.title}
                  </span>
                  {n.body && (
                    <span className="text-xs text-muted-foreground">{n.body}</span>
                  )}
                  <span className="text-[11px] text-muted-foreground/70">
                    {tiempoRelativo(n.created_at)}
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
        {pushActivo === false && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              closeOnClick={false}
              onClick={activarPush}
              disabled={busy}
            >
              <BellRingIcon />
              {busy ? 'Activando…' : 'Activar avisos en este dispositivo'}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
