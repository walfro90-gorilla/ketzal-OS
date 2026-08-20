'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BuildingIcon, ClockIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { solicitarUnirse, retirarSolicitud } from './unirse-actions'

// b065 — Tarjeta del Panel para el agente SIN agencia.
//
// Ser agente libre es una posición legítima (vende todo el catálogo de Ketzal
// con comisión de plataforma), así que esto NO es un error que haya que
// corregir: es una puerta, y el texto lo dice.
//
// Sólo "unirse". Crear agencia propia queda fuera a propósito: quien crea una
// queda admin de ella y podría publicar en /explora, que lleva la marca Ketzal.

export type AgenciaParaUnirse = {
  id: string
  nombre: string
  logo: string | null
  ciudad: string | null
  acerca: string | null
  /** Estado de la última solicitud de este agente a esta agencia. */
  solicitud: 'pending' | 'accepted' | 'rejected' | 'cancelled' | null
  /** Sólo cuando `solicitud` es 'pending': permite retirarla. */
  solicitud_id: string | null
}

export function UnirseAgencia({ agencias }: { agencias: AgenciaParaUnirse[] }) {
  const router = useRouter()
  const [pendiente, startTransition] = useTransition()
  const [abierta, setAbierta] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState('')

  const enviar = (id: string) => {
    startTransition(async () => {
      const r = await solicitarUnirse(id, mensaje)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success('Solicitud enviada. El admin de la agencia la revisará.')
      setAbierta(null)
      setMensaje('')
      router.refresh()
    })
  }

  const retirar = (solicitudId: string) => {
    startTransition(async () => {
      const r = await retirarSolicitud(solicitudId)
      if ('error' in r) {
        toast.error(r.error)
        return
      }
      toast.success('Solicitud retirada.')
      router.refresh()
    })
  }

  return (
    <section
      aria-label="Unirte a una agencia"
      className="rounded-2xl bg-primary/5 p-5 ring-1 ring-primary/25"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <BuildingIcon className="size-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">
            Vendes como agente libre
          </h2>
          <p className="text-sm text-muted-foreground">
            Puedes vender todo el catálogo de Ketzal por tu cuenta. Si prefieres
            trabajar dentro de una agencia, pídeles entrar: su admin decide.
          </p>
        </div>
      </div>

      {agencias.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Todavía no hay agencias a las que puedas unirte.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {agencias.map((a) => {
            const solicitudId = a.solicitud_id
            const enviada = a.solicitud === 'pending'
            return (
              <li key={a.id} className="rounded-xl bg-background/60 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{a.nombre}</p>
                    {(a.ciudad || a.acerca) && (
                      <p className="line-clamp-1 text-xs text-muted-foreground">
                        {a.ciudad ?? a.acerca}
                      </p>
                    )}
                  </div>

                  {enviada ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary" className="gap-1">
                        <ClockIcon className="size-3" />
                        Enviada
                      </Badge>
                      {solicitudId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={pendiente}
                          onClick={() => retirar(solicitudId)}
                        >
                          Retirar
                        </Button>
                      )}
                    </div>
                  ) : abierta === a.id ? null : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      disabled={pendiente}
                      onClick={() => {
                        setAbierta(a.id)
                        setMensaje('')
                      }}
                    >
                      Solicitar entrar
                    </Button>
                  )}
                </div>

                {/* Confirmación en línea, sin diálogo nativo (convención del repo). */}
                {abierta === a.id && !enviada && (
                  <div className="mt-3 space-y-2">
                    <Textarea
                      value={mensaje}
                      onChange={(e) => setMensaje(e.target.value)}
                      rows={2}
                      placeholder="Preséntate en una línea: qué vendes, cuánta experiencia tienes… (opcional)"
                      aria-label={`Mensaje para ${a.nombre}`}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={pendiente} onClick={() => enviar(a.id)}>
                        Enviar solicitud
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pendiente}
                        onClick={() => setAbierta(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
