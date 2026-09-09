'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FlagIcon, MapPinIcon, SparklesIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { reportarCoPasajero } from './co-pasajeros-actions'

export type CoPasajero = {
  id: string
  apodo: string | null
  ciudad: string | null
  viajeSonado: string | null
  bio: string | null
  /** URL firmada (bucket privado), o null. */
  fotoUrl: string | null
}

// "Quiénes van en este viaje" (ADR-0063): sólo co-pasajeros de la misma salida
// que prendieron su perfil. Lo que se pinta es EXACTAMENTE lo que devuelve la
// proyección: apodo, ciudad, viaje soñado, bio, foto. Nada de contacto.
export function CoPasajerosSection({
  bookingId,
  initial,
}: {
  bookingId: string
  initial: CoPasajero[]
}) {
  const [gente, setGente] = useState(initial)
  const [reportando, setReportando] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function reportar(id: string) {
    setEnviando(true)
    const res = await reportarCoPasajero(bookingId, id, motivo)
    setEnviando(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    // Reportar también oculta a esa persona para ti: sale de la lista ya.
    setGente((prev) => prev.filter((p) => p.id !== id))
    setReportando(null)
    setMotivo('')
    toast.success('Reporte enviado. Ya no verás ese perfil.')
  }

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Quiénes van en este viaje
      </h2>
      {gente.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Nadie ha compartido su perfil todavía. Puedes prender el tuyo en{' '}
          <Link href="/perfil" className="underline underline-offset-2">
            tu perfil
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {gente.map((p) => (
            <li key={p.id} className="rounded-xl border p-3">
              <div className="flex items-start gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-lg">
                  {p.fotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.fotoUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <span aria-hidden>{(p.apodo ?? 'V').slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.apodo ?? 'Viajero'}</p>
                  {p.ciudad && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPinIcon className="size-3" /> {p.ciudad}
                    </p>
                  )}
                  {p.viajeSonado && (
                    <p className="mt-1 flex items-start gap-1 text-sm">
                      <SparklesIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <span>{p.viajeSonado}</span>
                    </p>
                  )}
                  {p.bio && <p className="mt-1 text-sm text-muted-foreground">{p.bio}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setReportando(reportando === p.id ? null : p.id)}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                  aria-label="Reportar este perfil"
                  title="Reportar"
                >
                  <FlagIcon className="size-4" />
                </button>
              </div>
              {reportando === p.id && (
                <div className="mt-3 space-y-2 rounded-lg border border-dashed p-2">
                  <p className="text-xs text-muted-foreground">
                    ¿Qué pasa con este perfil? Lo revisa Ketzal y dejarás de verlo.
                  </p>
                  <Input
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    maxLength={300}
                    placeholder="Motivo (opcional)"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={enviando}
                      onClick={() => reportar(p.id)}
                    >
                      {enviando ? 'Enviando…' : 'Reportar y ocultar'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setReportando(null)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
