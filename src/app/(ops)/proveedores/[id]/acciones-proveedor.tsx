'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  EyeIcon,
  EyeOffIcon,
  CopyIcon,
  CheckIcon,
  MessageCircleIcon,
  MailIcon,
  GlobeIcon,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'

// Botones inteligentes por proveedor: cada acción aparece solo si hay dato para
// ella, y el perfil público se desactiva si la agencia aún no tiene un servicio
// publicado (la ruta /agencia/[id] es fail-closed). El link se arma en el
// cliente para poder copiarlo al portapapeles (compartir por WhatsApp al cliente).

/** Normaliza un teléfono MX a wa.me (10 dígitos → +52). */
function waHref(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  return `https://wa.me/${digits.length === 10 ? `52${digits}` : digits}`
}

function webHref(url: string | null | undefined): string | null {
  const v = url?.trim()
  if (!v) return null
  return /^https?:\/\//i.test(v) ? v : `https://${v}`
}

export function AccionesProveedor({
  proveedorId,
  tienePerfilPublico,
  phone,
  email,
  website,
}: {
  proveedorId: string
  tienePerfilPublico: boolean
  phone?: string | null
  email?: string | null
  website?: string | null
}) {
  const [copiado, setCopiado] = useState(false)
  const perfilPath = `/agencia/${proveedorId}`
  const wa = waHref(phone)
  const web = webHref(website)

  async function copiarLink() {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}${perfilPath}`
        : perfilPath
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      toast.success('Link del perfil copiado')
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('No se pudo copiar. Copia el link manualmente.')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {tienePerfilPublico ? (
          <>
            <Link
              href={perfilPath}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'default', size: 'sm' })}
            >
              <EyeIcon className="size-4" />
              Ver perfil público
            </Link>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copiarLink}
            >
              {copiado ? (
                <CheckIcon className="size-4" />
              ) : (
                <CopyIcon className="size-4" />
              )}
              Copiar link
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" size="sm" disabled>
            <EyeOffIcon className="size-4" />
            Perfil público
          </Button>
        )}

        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <MessageCircleIcon className="size-4" />
            WhatsApp
          </a>
        )}
        {email && (
          <a
            href={`mailto:${email}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <MailIcon className="size-4" />
            Correo
          </a>
        )}
        {web && (
          <a
            href={web}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <GlobeIcon className="size-4" />
            Sitio web
          </a>
        )}
      </div>

      {!tienePerfilPublico && (
        <p className="text-xs text-muted-foreground">
          El perfil público se activa cuando esta agencia tiene al menos un
          servicio publicado.
        </p>
      )}
    </div>
  )
}
