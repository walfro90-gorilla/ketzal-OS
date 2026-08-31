'use client'

import { useState, useTransition } from 'react'
import { KeyRoundIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CredencialesProvisionales } from '@/components/data/credenciales-provisionales'
import { regenerarAccesoEmbajador } from './acceso-embajador-actions'
import type { Embajador } from './reglas-servicio'

/** Lista de embajadores con un botón para reemitir su acceso: contraseña
 *  provisional que se manda por WhatsApp o correo. Antes esto generaba un
 *  magic-link que nunca funcionó (ver `lib/auth/credenciales.ts`). */
export function EmbajadoresAccesos({ embajadores }: { embajadores: Embajador[] }) {
  if (embajadores.length === 0) return null
  return (
    <div className="mt-6 space-y-1">
      <p className="text-sm font-medium">Accesos</p>
      <p className="mb-2 text-xs text-muted-foreground">
        Genera la contraseña de cada embajador y mándasela por WhatsApp o correo.
        Al entrar se le pide crear la suya.
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
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null)
  const [telefono, setTelefono] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Invalida la contraseña anterior: si la persona ya entró y fijó la suya, esto
  // se la tumba. Por eso se confirma en vez de dispararse al primer clic.
  function generar() {
    const quien = embajador.nombre || 'este embajador'
    if (
      !window.confirm(
        `¿Generar una contraseña nueva para ${quien}? La anterior deja de servir.`,
      )
    )
      return
    setError(null)
    setCreds(null)
    startTransition(async () => {
      const res = await regenerarAccesoEmbajador(embajador.id)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setCreds(res.credentials)
      setTelefono(res.telefono)
    })
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
          {isPending ? 'Generando…' : 'Generar contraseña'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {creds && (
        <CredencialesProvisionales
          credenciales={creds}
          telefono={telefono}
          titulo="Acceso listo. Mándale estos datos:"
        />
      )}
    </li>
  )
}
