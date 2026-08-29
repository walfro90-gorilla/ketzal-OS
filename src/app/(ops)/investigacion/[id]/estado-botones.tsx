'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cambiarEstadoEncuesta } from '../actions'
import type { PollStatus } from '../tipos'

// Abrir / cerrar / reabrir. "Pausar" y "cerrar" son la misma operación: reabrir
// la despausa, así que no hay un cuarto estado que mantener.

export function EstadoBotones({ id, status }: { id: string; status: PollStatus }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [cambiando, startTransition] = useTransition()

  function cambiar(nuevo: PollStatus) {
    setError(null)
    startTransition(async () => {
      const res = await cambiarEstadoEncuesta(id, nuevo)
      if ('error' in res) return setError(res.error)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'draft' && (
        <Button onClick={() => cambiar('open')} disabled={cambiando}>
          Abrir al público
        </Button>
      )}
      {status === 'open' && (
        <Button variant="outline" onClick={() => cambiar('closed')} disabled={cambiando}>
          Cerrar encuesta
        </Button>
      )}
      {status === 'closed' && (
        <Button variant="outline" onClick={() => cambiar('open')} disabled={cambiando}>
          Reabrir
        </Button>
      )}
      {error && (
        <span role="alert" className="text-sm text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}
