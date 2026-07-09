'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Selector del rango de fechas del reporte: navega a /reportes?from=...&to=... */
export function RangoFechas({ from, to }: { from: string; to: string }) {
  const router = useRouter()
  const [desde, setDesde] = useState(from)
  const [hasta, setHasta] = useState(to)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!desde || !hasta) return
    router.push(`/reportes?from=${desde}&to=${hasta}`)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3"
      aria-label="Rango de fechas del reporte"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="reportes-desde">Desde</Label>
        <Input
          id="reportes-desde"
          type="date"
          value={desde}
          max={hasta || undefined}
          onChange={(e) => setDesde(e.target.value)}
          className="w-40"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="reportes-hasta">Hasta</Label>
        <Input
          id="reportes-hasta"
          type="date"
          value={hasta}
          min={desde || undefined}
          onChange={(e) => setHasta(e.target.value)}
          className="w-40"
        />
      </div>
      <Button type="submit">Aplicar</Button>
    </form>
  )
}
