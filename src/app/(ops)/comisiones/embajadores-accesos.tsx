'use client'

import { useState, useTransition } from 'react'
import { CheckIcon, CopyIcon, KeyRoundIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { generarAccesoEmbajador } from './acceso-embajador-actions'
import type { Embajador } from './reglas-servicio'

/** Lista de embajadores con un botón para generar su link de acceso (magic-link).
 *  El superadmin lo copia y lo manda por WhatsApp; el embajador entra a su portal. */
export function EmbajadoresAccesos({ embajadores }: { embajadores: Embajador[] }) {
  if (embajadores.length === 0) return null
  return (
    <div className="mt-6 space-y-1">
      <p className="text-sm font-medium">Accesos</p>
      <p className="mb-2 text-xs text-muted-foreground">
        Genera el link de acceso de cada embajador y compártelo por WhatsApp.
      </p>
      <ul className="divide-y">
        {embajadores.map((e) => (
          <FilaAcceso key={e.id} embajador={e} />
        ))}
      </ul>
    </div>
  )
}

function FilaAcceso({ embajador }: { embajador: Embajador }) {
  const [isPending, startTransition] = useTransition()
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function generar() {
    setError(null)
    setLink(null)
    startTransition(async () => {
      const res = await generarAccesoEmbajador(embajador.id)
      if ('error' in res) setError(res.error)
      else setLink(res.link)
    })
  }

  async function copiar() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard bloqueado: seleccionar a mano.
    }
  }

  return (
    <li className="space-y-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {embajador.nombre}
          {embajador.codigo ? (
            <span className="ml-1 font-normal text-muted-foreground">
              ({embajador.codigo})
            </span>
          ) : null}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={generar}
          disabled={isPending}
        >
          <KeyRoundIcon className="size-4" />
          {isPending ? 'Generando…' : 'Generar acceso'}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {link && (
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border bg-muted/40 px-3 py-2 text-xs">
            {link}
          </code>
          <Button type="button" size="sm" variant="outline" onClick={copiar}>
            {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          </Button>
        </div>
      )}
    </li>
  )
}
