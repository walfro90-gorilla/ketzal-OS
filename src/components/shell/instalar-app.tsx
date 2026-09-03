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
// 3. NO se muestra en cada visita ni encima del tour de bienvenida. Un modal
//    que reaparece siempre es la forma más rápida de que lo cierren sin leer.
//    Se muestra una vez; el "ahora no" (o cerrar) se respeta 14 días.
// 4. `beforeinstallprompt` puede dispararse ANTES de que React monte este
//    efecto. Por eso el root layout lo captura en `window.__kzInstallPrompt`
//    (script beforeInteractive) y aquí se lee primero.

const POSPUESTO = 'kz_instalar_pospuesto'
const YA_LA_TENGO = 'kz_instalar_lista'
/** Cuánto se respeta un "ahora no" antes de volver a ofrecer. */
const DIAS_ESPERA = 14

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
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS previo al estándar; no está en los tipos de TS.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  if (standalone) return true
  try {
    return localStorage.getItem(YA_LA_TENGO) === '1'
  } catch {
    return false
  }
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

function pospuestoReciente(): boolean {
  try {
    const t = Number(localStorage.getItem(POSPUESTO) ?? 0)
    return Boolean(t) && Date.now() - t < DIAS_ESPERA * 24 * 60 * 60 * 1000
  } catch {
    // Sin storage no se puede recordar el "ahora no": mejor no insistir.
    return true
  }
}

function recordar(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor)
  } catch {
    /* sin storage volverá a aparecer; no es grave */
  }
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
    if (esperar || !esCelular() || yaInstalada() || pospuestoReciente()) return

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
      recordar(YA_LA_TENGO, '1')
      setPrompt(null)
    }
    window.addEventListener('appinstalled', onInstalada)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalada)
    }
  }, [esperar])

  function posponer() {
    recordar(POSPUESTO, String(Date.now()))
    setPrompt(null)
    setInstruirIOS(false)
  }

  function yaLaTengo() {
    recordar(YA_LA_TENGO, '1')
    setInstruirIOS(false)
  }

  async function instalar() {
    if (!prompt) return
    await prompt.prompt()
    const eleccion = await prompt.userChoice.catch(() => null)
    if (eleccion?.outcome === 'accepted') recordar(YA_LA_TENGO, '1')
    else recordar(POSPUESTO, String(Date.now()))
    window.__kzInstallPrompt = undefined
    setPrompt(null)
  }

  const abierto = Boolean(prompt) || instruirIOS

  return (
    <Sheet
      open={abierto}
      onOpenChange={(open) => {
        if (!open) posponer() // cerrar con la X o el fondo = "ahora no"
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
            <Button type="button" size="touch" onClick={yaLaTengo}>
              Ya la tengo
            </Button>
          ) : (
            <Button type="button" size="touch" onClick={instalar}>
              <DownloadIcon className="size-4" />
              Instalar
            </Button>
          )}
          <Button type="button" variant="ghost" size="touch" onClick={posponer}>
            Ahora no
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
