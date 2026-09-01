'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CameraIcon } from 'lucide-react'
import { mxn } from '@/components/data/format'
import { nivelDe } from '@/lib/domain/embajador'
import { guardarMiPerfil } from './perfil-actions'
import { subirFotoPerfil } from './subir-foto'

// Tarjeta que encabeza el portal: quién es, qué nivel lleva y sus números.
// Va arriba de todo a propósito — el embajador entra a ver cuánto lleva ganado,
// no a leer instrucciones.
//
// El NIVEL sale de lo devengado (`nivelDe`), no de un contador de experiencia:
// así no puede subir sin haber traído dinero, y si una venta se cancela baja
// solo. Ver el comentario de `NIVELES` en `lib/domain/embajador.ts`.

export type KpisEmbajador = {
  devengado: number
  /** Solo comisiones por ventas propias. */
  comisiones: number
  /** Ganado por invitar a otros embajadores (b085). */
  bonos: number
  pagado: number
  saldo: number
  numVentas: number
}

export function TarjetaPerfil({
  profileId,
  nombre,
  imagen,
  codigo,
  kpis,
}: {
  profileId: string
  nombre: string | null
  imagen: string | null
  codigo: string | null
  kpis: KpisEmbajador
}) {
  const router = useRouter()
  const inputFile = useRef<HTMLInputElement>(null)
  const [subiendo, startSubida] = useTransition()
  const [foto, setFoto] = useState(imagen)
  const nivel = nivelDe(kpis.devengado)

  function elegirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir la misma foto tras un error
    if (!file) return
    startSubida(async () => {
      const subida = await subirFotoPerfil(profileId, file)
      if ('error' in subida) return void toast.error(subida.error)
      const res = await guardarMiPerfil({ imagen: subida.url })
      if ('error' in res) return void toast.error(res.error)
      setFoto(subida.url)
      toast.success('Listo, esa es tu foto')
      router.refresh()
    })
  }

  const iniciales = (nombre ?? '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase()

  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => inputFile.current?.click()}
          disabled={subiendo}
          aria-label={foto ? 'Cambiar tu foto' : 'Subir tu foto'}
          className="group relative size-16 shrink-0 overflow-hidden rounded-full border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-lg font-semibold text-muted-foreground">
              {iniciales || '?'}
            </span>
          )}
          <span className="absolute inset-x-0 bottom-0 flex h-5 items-center justify-center bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <CameraIcon className="size-3.5" />
          </span>
        </button>
        <input
          ref={inputFile}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={elegirFoto}
          className="sr-only"
        />

        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold">{nombre ?? 'Embajador'}</p>
          <p className="text-sm text-muted-foreground">
            Nivel {nivel.numero} · {nivel.nombre}
            {codigo ? <span className="ml-1 font-mono text-xs">({codigo})</span> : null}
          </p>
        </div>
      </div>

      {/* Barra de nivel: avanza con lo GANADO, no con la actividad. */}
      <div className="mt-4">
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(nivel.progreso * 100)}
          aria-label={`Avance al siguiente nivel: ${Math.round(nivel.progreso * 100)}%`}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${Math.max(2, nivel.progreso * 100)}%` }}
          />
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          {nivel.siguienteEn != null
            ? `Te faltan ${mxn.format(nivel.siguienteEn)} para el siguiente nivel.`
            : 'Llegaste al nivel máximo. 🎉'}
        </p>
      </div>

      {/* 2×2 en móvil: cuatro columnas dejan los números ilegibles en un teléfono. */}
      <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          etiqueta="Ganado"
          valor={mxn.format(kpis.devengado)}
          {...(kpis.bonos > 0
            ? {
                // Un número que aparece sin explicación se lee como error: si
                // hay bono, se dice de dónde salió.
                nota: `${mxn.format(kpis.comisiones)} de ventas + ${mxn.format(kpis.bonos)} de bonos`,
              }
            : {})}
        />
        <Kpi etiqueta="Pagado" valor={mxn.format(kpis.pagado)} />
        <Kpi
          etiqueta="Por cobrar"
          valor={mxn.format(kpis.saldo)}
          destacado={kpis.saldo > 0}
        />
        <Kpi
          etiqueta="Ventas"
          valor={String(kpis.numVentas)}
        />
      </dl>
    </section>
  )
}

function Kpi({
  etiqueta,
  valor,
  destacado,
  nota,
}: {
  etiqueta: string
  valor: string
  destacado?: boolean
  /** Desglose corto, cuando el número tiene más de una fuente. */
  nota?: string
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${destacado ? 'border-emerald-500/40 bg-emerald-500/5' : 'bg-background'}`}
    >
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{valor}</dd>
      {nota && <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{nota}</p>}
    </div>
  )
}
