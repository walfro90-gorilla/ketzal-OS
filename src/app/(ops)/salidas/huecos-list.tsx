'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { CalendarPlusIcon, SparklesIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Oportunidad } from '@/lib/domain/oportunidades'
import { descartarHueco, queOfrezco, reactivarHueco } from './huecos-actions'
import { fmtFechaSalida } from './tipos'

/** Lo que la página ya resolvió del lado del servidor. */
export type HuecoVista = Oportunidad & {
  cubiertaNombres: string[]
  textoIa: string | null
}

function rango(inicio: string, fin: string): string {
  return inicio === fin ? fmtFechaSalida(inicio) : `${fmtFechaSalida(inicio)} – ${fmtFechaSalida(fin)}`
}

function cuando(dias: number): string {
  if (dias < 0) return 'en curso'
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'mañana'
  return `en ${dias} días`
}

/**
 * Lista plana de temporadas próximas (ADR-0058 §5): sin grid mensual, botones
 * grandes, todo alcanzable con teclado o dictado. La decisión que toma la
 * persona es "sacar salida", "descartar" o "pedir una idea", nada más.
 */
export function HuecosList({ items }: { items: HuecoVista[] }) {
  if (!items.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay temporadas en los próximos meses para los alcances de tu agencia.
      </p>
    )
  }
  return (
    <ul className="divide-y">
      {items.map((o) => (
        <Hueco key={o.id} o={o} />
      ))}
    </ul>
  )
}

function Hueco({ o }: { o: HuecoVista }) {
  const [texto, setTexto] = useState<string | null>(o.textoIa)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const esHueco = o.estado === 'hueco'

  function correr(fn: () => Promise<{ error: string } | { ok: true } | { texto: string }>) {
    setError(null)
    start(async () => {
      const r = await fn()
      if ('error' in r) setError(r.error)
      else if ('texto' in r) setTexto(r.texto)
    })
  }

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{o.temporada.nombre}</span>
          <Badge variant="outline" className="capitalize">
            {o.temporada.tipo}
          </Badge>
          {o.estado === 'cubierta' && <Badge>Cubierta</Badge>}
          {o.estado === 'descartada' && <Badge variant="secondary">Descartada</Badge>}
          {esHueco && <Badge variant="destructive">Sin salida</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {rango(o.temporada.inicio, o.temporada.fin)} · {cuando(o.diasPara)}
        </p>
        <p className="text-sm">{o.temporada.porque}</p>
        {o.estado === 'cubierta' && (
          <p className="text-sm text-muted-foreground">
            Cubierta por: {o.cubiertaNombres.join(', ')}
          </p>
        )}
        {esHueco && o.sugeridos.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {o.sugeridos.map((s) => (
              <Button key={s.id} size="sm" variant="outline" render={<Link href={`/servicios/${s.id}?salida=${o.temporada.inicio}&hueco=${o.id}#salidas`} />}>
                <CalendarPlusIcon />
                Sacar {s.name}
              </Button>
            ))}
          </div>
        )}
        {esHueco && o.sugeridos.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ningún servicio tiene estos meses entre sus ideales.
          </p>
        )}
        {texto && (
          <div className="mt-2 whitespace-pre-line rounded-md border bg-muted/40 p-3 text-sm">
            {texto}
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
        {esHueco && (
          <>
            <Button size="sm" variant="secondary" disabled={pending} onClick={() => correr(() => queOfrezco(o.id))}>
              <SparklesIcon />
              {texto ? 'Ver idea' : '¿Qué ofrezco?'}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => correr(() => descartarHueco(o.id))}>
              Descartar
            </Button>
          </>
        )}
        {o.estado === 'descartada' && (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => correr(() => reactivarHueco(o.id))}>
            Reactivar
          </Button>
        )}
      </div>
    </li>
  )
}
