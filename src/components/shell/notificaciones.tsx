'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BellIcon, BellRingIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // La tabla reusa el scaffold B2C: columnas reales message/action_url,
    // aliaseadas aquí a body/url para el shape del componente.
    const { data } = await (supabase as any)
      .from('notifications')
      .select('id, title, body:message, url:action_url, read_at, created_at')
      .order('created_at', { ascending: false })
      .limit(15)
    const rows = (data ?? []) as Noti[]
    setItems(rows)
    setNoLeidas(rows.filter((n) => !n.read_at).length)
  }, [])

  // SW + estado inicial. El registro es idempotente (el navegador reusa).
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
                onClick={() => n.url && router.push(n.url)}
                className="flex-col items-start gap-0.5 py-2"
              >
                <span className={n.read_at ? 'text-sm' : 'text-sm font-semibold'}>
                  {n.title}
                </span>
                {n.body && (
                  <span className="text-xs text-muted-foreground">{n.body}</span>
                )}
                <span className="text-[11px] text-muted-foreground/70">
                  {tiempoRelativo(n.created_at)}
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
