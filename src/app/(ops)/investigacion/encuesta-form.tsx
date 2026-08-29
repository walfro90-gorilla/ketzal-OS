'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { crearEncuesta, editarEncuesta } from './actions'
import type { AgenciaOpcion, Poll } from './tipos'

// Form de encuesta. Los meses usan <input type="month"> nativo: en móvil abre
// el selector del sistema y no arrastramos una librería de fechas.
// Con la encuesta ya publicada, destinos y meses quedan bloqueados: cambiarlos
// invalidaría los votos ya emitidos (la action lo vuelve a verificar).

export function EncuestaForm({
  poll,
  agencias,
}: {
  poll?: Poll
  /** Solo llega con contenido para el superadmin, que no tiene agencia propia. */
  agencias?: AgenciaOpcion[]
}) {
  const router = useRouter()
  const editando = Boolean(poll)
  const bloqueado = Boolean(poll && poll.status !== 'draft')
  const eligeAgencia = Boolean(agencias?.length) && !editando

  const [supplierId, setSupplierId] = useState(agencias?.[0]?.id ?? '')
  const [question, setQuestion] = useState(poll?.question ?? '')
  const [options, setOptions] = useState<string[]>(
    poll?.options.map((o) => o.label) ?? ['', '', '', ''],
  )
  const [desde, setDesde] = useState(poll?.month_from?.slice(0, 7) ?? '')
  const [hasta, setHasta] = useState(poll?.month_to?.slice(0, 7) ?? '')
  const [cierre, setCierre] = useState(poll?.closes_at ?? '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, startTransition] = useTransition()

  function guardar() {
    setError(null)
    startTransition(async () => {
      const input = {
        question,
        options,
        month_from: desde,
        month_to: hasta,
        closes_at: cierre || null,
        ...(eligeAgencia ? { supplier_id: supplierId } : {}),
      }
      if (poll) {
        const res = await editarEncuesta(poll.id, input)
        if ('error' in res) return setError(res.error)
        router.push(`/investigacion/${poll.id}`)
        return
      }
      const res = await crearEncuesta(input)
      if ('error' in res) return setError(res.error)
      router.push(`/investigacion/${res.id}`)
    })
  }

  return (
    <div className="max-w-xl space-y-6">
      {eligeAgencia && (
        <div className="space-y-2">
          <Label htmlFor="agencia">¿De qué agencia?</Label>
          <NativeSelect
            id="agencia"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          >
            {agencias?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="question">La pregunta</Label>
        <Input
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={200}
          placeholder="¿A dónde armamos el siguiente viaje desde Juárez?"
        />
      </div>

      <div className="space-y-2">
        <Label>Destinos candidatos {bloqueado && '(fijos: la encuesta ya se publicó)'}</Label>
        <div className="space-y-2">
          {options.map((o, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={o}
                disabled={bloqueado}
                onChange={(e) =>
                  setOptions(options.map((v, j) => (j === i ? e.target.value : v)))
                }
                maxLength={60}
                placeholder={`Destino ${i + 1}`}
              />
              {!bloqueado && options.length > 2 && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Quitar destino ${i + 1}`}
                  onClick={() => setOptions(options.filter((_, j) => j !== i))}
                >
                  <XIcon className="size-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
        {!bloqueado && options.length < 8 && (
          <Button variant="outline" size="sm" onClick={() => setOptions([...options, ''])}>
            <PlusIcon className="size-4" /> Agregar destino
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="desde">Desde el mes</Label>
          <Input
            id="desde"
            type="month"
            value={desde}
            disabled={bloqueado}
            onChange={(e) => setDesde(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hasta">Hasta el mes</Label>
          <Input
            id="hasta"
            type="month"
            value={hasta}
            disabled={bloqueado}
            onChange={(e) => setHasta(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cierre">Cerrar automáticamente el (opcional)</Label>
        <Input
          id="cierre"
          type="date"
          value={cierre ?? ''}
          onChange={(e) => setCierre(e.target.value)}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear encuesta'}
        </Button>
        <Button variant="ghost" onClick={() => router.back()} disabled={guardando}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
