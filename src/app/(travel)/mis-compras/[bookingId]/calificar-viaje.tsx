'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { StarIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { calificar } from '@/app/comprar/actions'

/** Lo que `get_my_trip` devuelve en `rating` (b102). */
export type RatingViaje = {
  can_rate: boolean
  rated_provider: boolean
  rated_app: boolean
  provider_rating: number | null
  provider_comment: string | null
  app_rating: number | null
}

/** Selector de estrellas 1-5. readOnly ⇒ muestra la calificación sin editar. */
function StarPicker({
  value,
  onChange,
  readOnly = false,
}: {
  value: number
  onChange?: (n: number) => void
  readOnly?: boolean
}) {
  const [hover, setHover] = useState(0)
  const shown = readOnly ? value : hover || value
  return (
    <div
      className="flex gap-1"
      role={readOnly ? 'img' : 'radiogroup'}
      aria-label={readOnly ? `${value} de 5 estrellas` : 'Calificación'}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(n)}
          onMouseEnter={() => !readOnly && setHover(n)}
          onMouseLeave={() => !readOnly && setHover(0)}
          aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
          aria-pressed={!readOnly ? n <= value : undefined}
          className={cn('p-0.5', readOnly ? 'cursor-default' : 'cursor-pointer')}
        >
          <StarIcon
            className={cn(
              readOnly ? 'size-5' : 'size-7',
              n <= shown ? 'fill-primary text-primary' : 'text-muted-foreground/40'
            )}
          />
        </button>
      ))}
    </div>
  )
}

/**
 * Calificación post-viaje (viajero → agencia y viajero → app). Vive en el
 * detalle del viaje, no en la lista: la lista es el estado de la compra; el
 * viaje se califica desde su propia pantalla, y solo cuando ya ocurrió
 * (`can_rate` lo decide la BD, b102). `submit_rating` hace upsert: lo ya
 * calificado se muestra en solo lectura con opción de editar.
 */
export function CalificarViaje({ bookingId, rating }: { bookingId: string; rating: RatingViaje }) {
  const [busy, setBusy] = useState(false)
  const [prov, setProv] = useState(rating.provider_rating ?? 0)
  const [comentario, setComentario] = useState(rating.provider_comment ?? '')
  const [app, setApp] = useState(rating.app_rating ?? 0)
  const [provListo, setProvListo] = useState(rating.rated_provider)
  const [appListo, setAppListo] = useState(rating.rated_app)
  const [editProv, setEditProv] = useState(false)
  const [editApp, setEditApp] = useState(false)
  const [savedProv, setSavedProv] = useState(rating.provider_rating ?? 0)
  const [savedComentario, setSavedComentario] = useState(rating.provider_comment ?? '')
  const [savedApp, setSavedApp] = useState(rating.app_rating ?? 0)

  async function enviarProveedor() {
    if (prov < 1) {
      toast.error('Elige de 1 a 5 estrellas.')
      return
    }
    setBusy(true)
    const res = await calificar(bookingId, 'traveler_to_provider', prov, comentario)
    setBusy(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    setProvListo(true)
    setEditProv(false)
    setSavedProv(prov)
    setSavedComentario(comentario)
    toast.success('¡Gracias por tu reseña!')
  }

  async function enviarApp() {
    if (app < 1) {
      toast.error('Elige de 1 a 5 estrellas.')
      return
    }
    setBusy(true)
    const res = await calificar(bookingId, 'traveler_to_app', app)
    setBusy(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    setAppListo(true)
    setEditApp(false)
    setSavedApp(app)
    toast.success('¡Gracias!')
  }

  return (
    <section className="mt-6 rounded-xl border p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Califica tu viaje
      </h2>
      <div className="mt-3 space-y-4">
        {provListo && !editProv ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">Tu reseña</p>
            <StarPicker value={savedProv} readOnly />
            {savedComentario && <p className="text-sm text-muted-foreground">“{savedComentario}”</p>}
            <button
              type="button"
              onClick={() => setEditProv(true)}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Editar
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">¿Cómo estuvo el viaje?</p>
            <StarPicker value={prov} onChange={setProv} />
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Cuéntanos (opcional)"
              rows={2}
              className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"
            />
            <div className="flex gap-2">
              <Button type="button" loading={busy} onClick={enviarProveedor}>
                {provListo ? 'Guardar' : 'Enviar reseña'}
              </Button>
              {editProv && (
                <Button
                  type="button"
                  variant="ghost"
                  loading={busy}
                  onClick={() => {
                    setEditProv(false)
                    setProv(savedProv)
                    setComentario(savedComentario)
                  }}
                >
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        )}

        {appListo && !editApp ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">Calificaste la app Ketzal</p>
            <div className="flex items-center gap-3">
              <StarPicker value={savedApp} readOnly />
              <button
                type="button"
                onClick={() => setEditApp(true)}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Editar
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">¿Y la app Ketzal?</p>
            <StarPicker value={app} onChange={setApp} />
            <div className="flex gap-2">
              <Button type="button" variant="outline" loading={busy} onClick={enviarApp}>
                {appListo ? 'Guardar' : 'Enviar'}
              </Button>
              {editApp && (
                <Button
                  type="button"
                  variant="ghost"
                  loading={busy}
                  onClick={() => {
                    setEditApp(false)
                    setApp(savedApp)
                  }}
                >
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
