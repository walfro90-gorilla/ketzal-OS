'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { ALCANCES, ETIQUETA_ALCANCE, type Alcance } from '@/lib/domain/temporadas-mx'
import { setAlcances } from './actions'

/** Dos casillas y un botón (ADR-0058 §1): qué calendarios ve la agencia. */
export function AlcancesConfig({ inicial }: { inicial: string[] }) {
  const [marcados, setMarcados] = useState<Alcance[]>(
    ALCANCES.filter((a) => inicial.includes(a))
  )
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function toggle(a: Alcance) {
    setMsg(null)
    setMarcados((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]))
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
        {ALCANCES.map((a) => (
          <label key={a} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-primary"
              checked={marcados.includes(a)}
              onChange={() => toggle(a)}
            />
            {ETIQUETA_ALCANCE[a]}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={pending || marcados.length === 0}
          onClick={() =>
            start(async () => {
              const r = await setAlcances(marcados)
              setMsg('error' in r ? r.error : 'Guardado.')
            })
          }
        >
          Guardar
        </Button>
        {marcados.length === 0 && (
          <span className="text-sm text-destructive">Elige al menos uno.</span>
        )}
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </div>
  )
}
