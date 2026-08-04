'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArmchairIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SeatMap } from '@/components/seat-map'
import { asignarAsiento } from '@/lib/actions/asientos'
import type { TransportType } from '@/lib/domain/seats'

// Selector de asiento por pasajero (b041), compartido viajero/staff. Tocar un
// asiento disponible lo asigna al instante (estilo aerolínea); si otro lo ganó
// en la carrera, la BD responde "ya está ocupado" y el mapa se refresca.

export function SeatPicker({
  bookingId,
  passengerId,
  passengerName,
  seat,
  tipo,
  total,
  occupiedOthers,
}: {
  bookingId: string
  passengerId: string
  passengerName: string
  /** Asiento actual del pasajero (null = sin asiento). */
  seat: number | null
  tipo: TransportType
  total: number
  /** Ocupados por TODOS menos este pasajero. */
  occupiedOthers: number[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, startTransition] = useTransition()

  function pick(n: number) {
    if (n === seat) {
      setOpen(false)
      return
    }
    startTransition(async () => {
      const res = await asignarAsiento(bookingId, passengerId, n)
      if ('error' in res) {
        toast.error(res.error)
        router.refresh() // el mapa pudo quedar viejo (carrera)
        return
      }
      toast.success(`Asiento ${n} para ${passengerName}`)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="w-full">
      <Button
        type="button"
        variant={seat != null ? 'ghost' : 'outline'}
        size="sm"
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
      >
        <ArmchairIcon />
        {seat != null ? `Asiento ${seat}` : 'Elegir asiento'}
      </Button>
      {open && (
        <div className="mt-2">
          <SeatMap
            tipo={tipo}
            total={total}
            occupied={occupiedOthers}
            selected={seat}
            onPick={pick}
            disabled={busy}
          />
        </div>
      )}
    </div>
  )
}
