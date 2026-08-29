'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckIcon, SparklesIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { etiquetaMes } from '@/lib/domain/encuesta'
import { votarEncuesta } from './actions'
import type { PollOption } from '@/lib/public/encuesta'

// El formulario que ve el tráfico de Meta Ads. Mobile-first: destinos y meses
// son botones grandes, no selects. Todo opcional salvo destino y mes.

export function VotarForm({
  pollId,
  options,
  meses,
  utm,
}: {
  pollId: string
  options: PollOption[]
  meses: string[]
  utm: Record<string, string>
}) {
  const router = useRouter()
  const [destino, setDestino] = useState<number | null>(null)
  const [mes, setMes] = useState<string | null>(null)
  const [sugerencia, setSugerencia] = useState('')
  const [contacto, setContacto] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, startTransition] = useTransition()

  function enviar() {
    if (destino == null) return setError('Elige a dónde te late ir.')
    if (!mes) return setError('Elige en qué mes.')
    setError(null)
    startTransition(async () => {
      const res = await votarEncuesta({
        pollId,
        optionId: destino,
        month: mes,
        suggestion: sugerencia.trim() || undefined,
        contact: contacto.trim() || undefined,
        utm,
      })
      if ('error' in res) return setError(res.error)
      // La cookie recién puesta hace que la página se re-renderice en resultados.
      router.refresh()
    })
  }

  return (
    <div className="space-y-8">
      <fieldset className="space-y-3">
        <legend className="mb-3 font-display text-lg">1 · ¿A dónde?</legend>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setDestino(o.id)}
              aria-pressed={destino === o.id}
              className={cn(
                'flex min-h-14 items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 text-left text-base transition-colors',
                destino === o.id
                  ? 'border-primary bg-primary/10 font-medium'
                  : 'border-border hover:border-primary/40 hover:bg-muted/50',
              )}
            >
              {o.label}
              {destino === o.id && <CheckIcon className="size-5 shrink-0 text-primary" />}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-3 font-display text-lg">2 · ¿Cuándo?</legend>
        <div className="flex flex-wrap gap-2">
          {meses.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMes(m)}
              aria-pressed={mes === m}
              className={cn(
                'min-h-11 rounded-full border-2 px-4 text-sm capitalize transition-colors',
                mes === m
                  ? 'border-primary bg-primary/10 font-medium'
                  : 'border-border hover:border-primary/40 hover:bg-muted/50',
              )}
            >
              {etiquetaMes(m)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="sugerencia" className="font-display text-lg">
          3 · ¿Algo que te gustaría? <span className="text-muted-foreground">(opcional)</span>
        </Label>
        <Textarea
          id="sugerencia"
          value={sugerencia}
          onChange={(e) => setSugerencia(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder="Otro destino, salida nocturna, presupuesto, con quién viajarías…"
        />
      </div>

      <div className="space-y-2 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-4">
        <Label htmlFor="contacto" className="flex items-center gap-2 font-display text-lg">
          <SparklesIcon className="size-5 text-primary" />
          ¿Te avisamos si se arma?
        </Label>
        <p className="text-sm text-muted-foreground">
          Si tu idea empata con la de otros viajeros, se hace realidad — y tú serías de los
          primeros en apartar con el mínimo. Déjanos tu WhatsApp o correo (opcional).
        </p>
        <Input
          id="contacto"
          value={contacto}
          onChange={(e) => setContacto(e.target.value)}
          maxLength={120}
          inputMode="text"
          autoComplete="tel"
          placeholder="656 123 4567 o tu@correo.com"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button size="lg" className="w-full" onClick={enviar} disabled={enviando}>
        {enviando ? 'Enviando…' : 'Enviar mi voto'}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Sin registro. Un voto por persona.
      </p>
    </div>
  )
}
