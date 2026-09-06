'use client'

import { useEffect, useState } from 'react'
import { DownloadIcon, ShareIcon, SmartphoneIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

// "Instala la app": modal (hoja inferior) SOLO en celular, montado en los tres
// shells con sesión (ops, viajero, embajador). Cuatro cosas que no son obvias:
//
// 1. iOS NO soporta `beforeinstallprompt`. En iPhone no existe forma de que la
//    página lance la instalación: solo se puede INSTRUIR (Compartir → Añadir a
//    inicio). Y el equipo vende desde iPhone, así que ese camino no es el
//    "extra", es la mitad de los casos. Como Safari tampoco dice si ya está
//    instalada, "Ya la tengo" se recuerda para siempre.
// 2. Si ya está instalada, no hay nada que ofrecer. Se detecta con
//    `display-mode: standalone` (y `navigator.standalone` en iOS, previo al
//    estándar). Chrome además deja de disparar el evento una vez instalada.
// 3. Se muestra en CADA carga mientras la detección diga que NO está instalada
//    (pedido explícito: insistir hasta que la instalen). No se apila encima del
//    tour de bienvenida. Cerrarla solo la calla en ESTA carga; vuelve a la
//    siguiente visita. Sin memoria de "ahora no": la única señal es si está
//    instalada o no.
// 4. `beforeinstallprompt` puede dispararse ANTES de que React monte este
//    efecto. Por eso el root layout lo captura en `window.__kzInstallPrompt`
//    (script beforeInteractive) y aquí se lee primero.

type PromptInstalacion = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    __kzInstallPrompt?: PromptInstalacion
  }
}

function yaInstalada(): boolean {
  if (typeof window === 'undefined') return true
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS previo al estándar; no está en los tipos de TS. Solo es true DENTRO
    // de la PWA instalada; en la pestaña de Safari no hay forma de saberlo, así
    // que ahí el aviso sale en cada visita aunque ya la tengan.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function esIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

/** Solo celular: en escritorio Chrome también dispara el evento y no es el caso. */
function esCelular(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(max-width: 767px)').matches ?? false
}

export function InstalarApp({
  esperar = false,
}: {
  /** `true` mientras el tour de bienvenida esté pendiente: no se apilan dos modales. */
  esperar?: boolean
}) {
  const [prompt, setPrompt] = useState<PromptInstalacion | null>(null)
  const [instruirIOS, setInstruirIOS] = useState(false)

  useEffect(() => {
    if (esperar || !esCelular() || yaInstalada()) return

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
    // Si el evento ya pasó antes de montar, el root layout lo guardó.
    if (window.__kzInstallPrompt) onPrompt(window.__kzInstallPrompt)
    window.addEventListener('beforeinstallprompt', onPrompt)
    // Se instaló (por nuestro botón o por la barra de Chrome): nada que ofrecer.
    const onInstalada = () => {
      // display-mode pasa a standalone; yaInstalada() la ataja en la próxima carga.
      setPrompt(null)
    }
    window.addEventListener('appinstalled', onInstalada)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalada)
    }
  }, [esperar])

  // Cerrar (X, fondo, "ahora no"): calla el aviso solo en esta carga; vuelve
  // a la siguiente visita mientras siga sin estar instalada.
  function cerrar() {
    setPrompt(null)
    setInstruirIOS(false)
  }

  async function instalar() {
    if (!prompt) return
    await prompt.prompt()
    await prompt.userChoice.catch(() => null)
    // Aceptada: appinstalled + display-mode standalone la atajan luego.
    // Rechazada: sin memoria, vuelve a ofrecerse en la próxima carga.
    window.__kzInstallPrompt = undefined
    setPrompt(null)
  }

  const abierto = Boolean(prompt) || instruirIOS

  return (
    <Sheet
      open={abierto}
      onOpenChange={(open) => {
        if (!open) cerrar() // cerrar con la X o el fondo: reaparece la próxima visita
      }}
    >
      <SheetContent side="bottom" className="rounded-t-2xl pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <SheetHeader className="items-center text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <SmartphoneIcon className="size-6" />
          </span>
          <SheetTitle className="text-lg">Lleva Ketzal en tu celular</SheetTitle>
          <SheetDescription>
            {instruirIOS ? (
              <>
                Toca{' '}
                <ShareIcon
                  className="inline size-4 align-[-3px]"
                  aria-label="Compartir"
                />{' '}
                abajo en Safari y luego <strong>Añadir a pantalla de inicio</strong>.
                Queda como una app, sin buscar el link cada vez.
              </>
            ) : (
              <>Instálala y ábrela como cualquier app, sin buscar el link cada vez.</>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-2 px-4">
          {instruirIOS ? (
            <Button type="button" size="touch" onClick={cerrar}>
              Ya la tengo
            </Button>
          ) : (
            <Button type="button" size="touch" onClick={instalar}>
              <DownloadIcon className="size-4" />
              Instalar
            </Button>
          )}
          <Button type="button" variant="ghost" size="touch" onClick={cerrar}>
            Ahora no
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
