'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { actualizarVencimiento } from './actions'

/**
 * Editor inline de la fecha límite de pago de la venta.
 * Guardar con el campo vacío borra el vencimiento.
 */
export function VencimientoForm({
  bookingId,
  dueDate,
}: {
  bookingId: string
  dueDate: string | null
}) {
  const [isPending, startTransition] = useTransition()
  const [value, setValue] = useState(dueDate?.slice(0, 10) ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await actualizarVencimiento(bookingId, value || null)
      if ('error' in result) {
        setError(result.error)
        return
      }
      setSaved(true)
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          aria-label="Fecha límite de pago"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setSaved(false)
          }}
          className="w-fit"
        />
        <Button type="submit" variant="outline" size="sm" disabled={isPending}>
          {isPending ? 'Guardando…' : 'Guardar'}
        </Button>
        {saved && !isPending && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400">
            Guardado ✓
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  )
}
