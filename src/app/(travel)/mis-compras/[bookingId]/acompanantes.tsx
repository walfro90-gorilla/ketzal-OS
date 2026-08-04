'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CircleCheckIcon, UserPlusIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { agregarAcompanante, quitarAcompanante } from './acompanantes-actions'
import { SeatPicker } from '@/components/seat-picker'
import type { SeatMapData } from '@/lib/actions/asientos'

// b040: captura de acompañantes por el comprador (tras el primer pago), con
// tope = viajeros comprados. Mismos tipos que usa el agente en /ventas.

export type Acompanante = {
  id: string
  full_name: string
  passenger_type: string | null
  doc_id: string | null
}

const TIPOS = ['adulto', 'niño', 'infante', 'adulto mayor']

export function AcompanantesSection({
  bookingId,
  numPax,
  initial,
  seatMap = null,
}: {
  bookingId: string
  numPax: number
  initial: Acompanante[]
  /** Mapa de asientos de la salida (b041); null/disabled = servicio sin mapa. */
  seatMap?: SeatMapData | null
}) {
  const [isPending, startTransition] = useTransition()
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState('adulto')
  const [doc, setDoc] = useState('')

  const completos = initial.length >= numPax

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!nombre.trim()) {
      toast.error('Escribe el nombre completo.')
      return
    }
    startTransition(async () => {
      const res = await agregarAcompanante({ bookingId, nombre, tipo, doc })
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      toast.success('Viajero agregado')
      setNombre('')
      setDoc('')
    })
  }

  function onRemove(id: string, name: string) {
    if (!window.confirm(`¿Quitar a ${name} de la lista de viajeros?`)) return
    startTransition(async () => {
      const res = await quitarAcompanante(bookingId, id)
      if ('error' in res) toast.error(res.error)
    })
  }

  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Viajeros ({initial.length}/{numPax})
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Registra a las personas que viajan (como aparecen en su identificación).
        La agencia los usa para la lista de abordaje.
      </p>

      {initial.length > 0 && (
        <ul className="mt-3 space-y-2">
          {initial.map((p) => {
            // b041: asiento propio + ocupados por los demás (el suyo no se
            // pinta rojo para poder conservarlo/cambiarlo).
            const miAsiento =
              seatMap?.mine?.find((m) => m.passenger_id === p.id)?.seat ?? null
            const deOtros = (seatMap?.occupied ?? []).filter(
              (n) => n !== miAsiento
            )
            return (
              <li key={p.id} className="rounded-xl border p-3 text-sm">
                <div className="flex items-center gap-2">
                  <CircleCheckIcon className="size-4 shrink-0 text-emerald-600 dark:text-emerald-500" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{p.full_name}</span>
                    <span className="text-muted-foreground">
                      {p.passenger_type ? ` · ${p.passenger_type}` : ''}
                      {p.doc_id ? ` · ${p.doc_id}` : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(p.id, p.full_name)}
                    disabled={isPending}
                    aria-label={`Quitar a ${p.full_name}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <XIcon className="size-4" />
                  </button>
                </div>
                {seatMap?.enabled && seatMap.transport_type && (
                  <div className="mt-2">
                    <SeatPicker
                      bookingId={bookingId}
                      passengerId={p.id}
                      passengerName={p.full_name}
                      seat={miAsiento}
                      tipo={seatMap.transport_type}
                      total={seatMap.total ?? 0}
                      occupiedOthers={deOtros}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {completos ? (
        <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-500">
          ¡Listo! Ya registraste a tus {numPax}{' '}
          {numPax === 1 ? 'viajero' : 'viajeros'}.
        </p>
      ) : (
        <form onSubmit={onAdd} className="mt-3 space-y-2 rounded-xl border p-3">
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre completo *"
            aria-label="Nombre completo"
          />
          <div className="flex gap-2">
            <NativeSelect
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              aria-label="Tipo de viajero"
              className="w-40"
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </NativeSelect>
            <Input
              value={doc}
              onChange={(e) => setDoc(e.target.value)}
              placeholder="INE / pasaporte (opcional)"
              aria-label="Documento de identidad"
            />
          </div>
          <Button type="submit" size="sm" loading={isPending}>
            <UserPlusIcon /> Agregar viajero
          </Button>
        </form>
      )}
    </section>
  )
}
