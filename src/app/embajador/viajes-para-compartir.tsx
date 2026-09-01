'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { CheckIcon, CopyIcon, MessageCircleIcon } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { mxn } from '@/components/data/format'
import { mensajeParaCompartir, waCompartir } from '@/lib/domain/embajador'

// El catálogo, pero desde adentro del portal y con SU código ya puesto en cada
// link. La infraestructura ya existía —`?ref` se propaga por /explora → ficha →
// checkout y cada servicio tiene su OG con foto real—; lo que faltaba era el
// botón. Antes el embajador solo tenía UN link a la vitrina completa: si quería
// compartir un viaje concreto tenía que navegar hasta él y editar la URL a mano.

export type ViajeCompartible = {
  id: string
  nombre: string
  destino: string | null
  desde: number | null
  agencia: string | null
}

export function ViajesParaCompartir({
  viajes,
  codigo,
  origin,
}: {
  viajes: ViajeCompartible[]
  codigo: string | null
  /**
   * Origen absoluto, resuelto EN EL SERVIDOR con los headers del request.
   *
   * No se lee `window.location` aquí: el servidor no lo tiene, así que el HTML
   * saldría con un `href` distinto al que el cliente pinta al hidratar — un
   * hydration mismatch de verdad, no un warning. (`Compartir` de la ficha
   * pública sí usa `window`, pero ahí el link se arma tras montar; aquí el
   * `<a>` existe desde el primer render.)
   */
  origin: string
}) {

  if (!codigo) {
    return (
      <p className="text-sm text-muted-foreground">
        Aún no tienes código de referido, así que tus links no podrían pagarte.
        Pídeselo a quien te dio de alta.
      </p>
    )
  }
  if (viajes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ahorita no hay viajes publicados para compartir. Vuelve pronto.
      </p>
    )
  }

  return (
    <ul className="divide-y">
      {viajes.map((v) => (
        <Fila key={v.id} viaje={v} codigo={codigo} origin={origin} />
      ))}
    </ul>
  )
}

function Fila({
  viaje,
  codigo,
  origin,
}: {
  viaje: ViajeCompartible
  codigo: string
  origin: string
}) {
  const [copiado, setCopiado] = useState(false)
  // El link lleva SU código: quien compre entrando por aquí le cuenta como venta.
  const url = `${origin}/servicio/${viaje.id}?ref=${encodeURIComponent(codigo)}`

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      toast.success('Link copiado')
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('No se pudo copiar; mantén presionado el link para copiarlo.')
    }
  }

  const mensaje = mensajeParaCompartir(url)

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{viaje.nombre}</p>
        <p className="text-xs text-muted-foreground">
          {[viaje.destino, viaje.agencia].filter(Boolean).join(' · ')}
          {viaje.desde ? ` · desde ${mxn.format(viaje.desde)}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* Enlace con pinta de botón: `Button` de base-nova exige <button> nativo. */}
        <a
          href={waCompartir(mensaje)}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ size: 'sm' })}
        >
          <MessageCircleIcon className="size-4" />
          Compartir
        </a>
        <Button type="button" size="sm" variant="outline" onClick={copiar}>
          {copiado ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
          <span className="sr-only">Copiar el link de {viaje.nombre}</span>
        </Button>
      </div>
    </li>
  )
}
