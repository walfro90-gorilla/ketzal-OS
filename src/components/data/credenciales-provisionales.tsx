'use client'

import { useState } from 'react'
import { SITE_URL } from '@/lib/site-url'
import { toast } from 'sonner'
import { CheckIcon, CopyIcon, MailIcon, MessageCircleIcon } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { linkWhatsapp } from '@/lib/domain/phone'

// Entrega de credenciales provisionales, una sola pantalla para las cuatro
// personas que no se registran solas (admin de agencia nuevo, miembro que
// perdió su acceso, embajador reclutado, proveedor con portal). Antes el bloque
// estaba copiado en dos lugares y el embajador ni siquiera lo tenía: mandaba un
// magic-link que nunca funcionó.
//
// La contraseña se ve UNA vez y no se persiste: `auth.users` la guarda hasheada
// y no se escribe en bitácora. Si se pierde, se emite otra.
//
// ponytail: el envío es manual (wa.me / mailto abren la app del operador). No hay
// correo transaccional en el repo y la caja de WhatsApp está pausada (ADR-0017);
// el día que haya un emisor de verdad, el mensaje ya está armado aquí.

export type CredencialesProvisionalesProps = {
  credenciales: { email: string; password: string }
  /** Teléfono de la persona: si lo hay, WhatsApp abre SU chat, no el selector. */
  telefono?: string | null
  /** Encabeza el recuadro. Distingue "cuenta creada" de "acceso regenerado". */
  titulo: string
}

export function CredencialesProvisionales({
  credenciales,
  telefono,
  titulo,
}: CredencialesProvisionalesProps) {
  const [copiado, setCopiado] = useState(false)

  // El origin se lee en el render, sin efecto ni estado: este componente solo se
  // monta DESPUÉS de que la acción devolvió credenciales, o sea siempre en el
  // cliente. Así el mensaje sirve igual en localhost que en producción sin
  // hardcodear el dominio (que ya cambió una vez). El guard de `window` es la red
  // por si algún día lo renderiza el servidor.
  const origin = typeof window === 'undefined' ? SITE_URL : window.location.origin
  const loginUrl = `${origin}/login`
  const mensaje = [
    'Ketzal — tu acceso',
    `Entra en: ${loginUrl}`,
    `Correo: ${credenciales.email}`,
    `Contraseña: ${credenciales.password}`,
    'Al entrar te va a pedir crear tu propia contraseña.',
  ].join('\n')

  const wa = linkWhatsapp(telefono ?? null)
  const enc = encodeURIComponent
  const hrefWa = `${wa ?? 'https://wa.me/'}?text=${enc(mensaje)}`
  const hrefMail = `mailto:${enc(credenciales.email)}?subject=${enc('Tu acceso a Ketzal')}&body=${enc(mensaje)}`

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje)
      setCopiado(true)
      toast.success('Mensaje copiado')
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('No se pudo copiar; selecciona el texto a mano.')
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
      <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{titulo}</p>
      <div className="space-y-1 rounded-md border bg-background px-3 py-2 text-sm">
        <p>
          <span className="text-muted-foreground">Entra en:</span>{' '}
          <span className="font-medium break-all">{loginUrl}</span>
        </p>
        <p>
          <span className="text-muted-foreground">Correo:</span>{' '}
          <span className="font-medium break-all">{credenciales.email}</span>
        </p>
        <p>
          <span className="text-muted-foreground">Contraseña:</span>{' '}
          <span className="font-mono font-medium">{credenciales.password}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* Enlaces, no botones: `Button` de base-nova exige un <button> nativo
            (`nativeButton`), y meterle un <a> por `render` le quita la semántica
            —lo grita en consola—. El patrón del repo para un enlace con pinta de
            botón es `buttonVariants` sobre el <a>. */}
        <a
          href={hrefWa}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ size: 'sm' })}
        >
          <MessageCircleIcon className="size-4" />
          {wa ? 'Mandar por WhatsApp' : 'WhatsApp'}
        </a>
        <a href={hrefMail} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
          <MailIcon className="size-4" />
          Mandar por correo
        </a>
        <Button type="button" size="sm" variant="outline" onClick={copiar}>
          {copiado ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          {copiado ? 'Copiado' : 'Copiar'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Esta contraseña se ve una sola vez. Al entrar se le pedirá crear la suya; si
        se pierde, genera otra.
      </p>
    </div>
  )
}
