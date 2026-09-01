'use client'

import { useEffect, useState } from 'react'
import { DownloadIcon, ShareIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

// "Instala la app". Tres cosas que no son obvias y por las que esto no es un
// botón y ya:
//
// 1. iOS NO soporta `beforeinstallprompt`. En iPhone no existe forma de que la
//    página lance la instalación: solo se puede INSTRUIR (Compartir → Añadir a
//    inicio). Y el equipo vende desde iPhone, así que ese camino no es el
//    "extra", es la mitad de los casos.
// 2. Si ya está instalada, no hay nada que ofrecer. Se detecta con
//    `display-mode: standalone` (y `navigator.standalone` en iOS, que es previo
//    al estándar).
// 3. NO se muestra en cada visita. Un modal que reaparece siempre es la forma
//    más rápida de que lo cierren sin leer y de que la palabra "instalar" se
//    vuelva ruido. Se muestra una vez; el "ahora no" se recuerda.

const POSPUESTO = 'kz_instalar_pospuesto'
/** Cuánto se respeta un "ahora no" antes de volver a ofrecer. */
const DIAS_ESPERA = 14

type PromptInstalacion = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function yaInstalada(): boolean {
  if (typeof window === 'undefined') return true
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS previo al estándar; no está en los tipos de TS.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  return Boolean(standalone)
}

function esIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function pospuestoReciente(): boolean {
  try {
    const t = Number(localStorage.getItem(POSPUESTO) ?? 0)
    return Boolean(t) && Date.now() - t < DIAS_ESPERA * 24 * 60 * 60 * 1000
  } catch {
    // Sin storage no se puede recordar el "ahora no": mejor no insistir.
    return true
  }
}

export function InstalarApp() {
  const [prompt, setPrompt] = useState<PromptInstalacion | null>(null)
  const [instruirIOS, setInstruirIOS] = useState(false)

  useEffect(() => {
    if (yaInstalada() || pospuestoReciente()) return

    // iOS: no hay evento, solo instrucciones.
    if (esIOS()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInstruirIOS(true)
      return
    }

    const onPrompt = (e: Event) => {
      // Sin esto Chrome muestra su propia barra; se guarda para lanzarlo
      // cuando el usuario lo pida, no de golpe al cargar.
      e.preventDefault()
      setPrompt(e as PromptInstalacion)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  function posponer() {
    try {
      localStorage.setItem(POSPUESTO, String(Date.now()))
    } catch {
      /* sin storage volverá a aparecer; no es grave */
    }
    setPrompt(null)
    setInstruirIOS(false)
  }

  async function instalar() {
    if (!prompt) return
    await prompt.prompt()
    await prompt.userChoice.catch(() => null)
    setPrompt(null)
  }

  if (!prompt && !instruirIOS) return null

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Ten Ketzal a un toque</p>
          {instruirIOS ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Toca{' '}
              <ShareIcon className="inline size-3.5 align-[-2px]" aria-label="Compartir" />{' '}
              abajo y luego <strong>Añadir a inicio</strong>. Queda como una app,
              sin buscar el link cada vez.
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Instálala y ábrela como cualquier app, sin buscar el link.
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={posponer}
          aria-label="Ahora no"
          className="shrink-0"
        >
          <XIcon className="size-4" />
        </Button>
      </div>

      {!instruirIOS && (
        <Button type="button" size="sm" className="mt-3" onClick={instalar}>
          <DownloadIcon className="size-4" />
          Instalar
        </Button>
      )}
    </div>
  )
}
