'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandMark } from '@/components/brand-mark'

// Carrusel ligero de fotos de la ficha (banner + galería). Sin dependencias.
// Móvil: pista con scroll-snap → swipe nativo que funciona antes de hidratar;
// el JS sólo sigue el índice (puntos, miniatura activa) y mueve la pista desde
// flechas/miniaturas. Flechas sólo en md+ (en el teléfono las sustituye el
// gesto). Con una sola foto se comporta como la imagen fija de antes.
//
// Avanza solo cada 5 s, y se detiene cuando la persona podría estar leyendo o
// interactuando: puntero encima, foco dentro, pestaña en segundo plano, o un
// clic en flechas/miniaturas (ahí gana su intención y ya no se reanuda). Con
// `prefers-reduced-motion` nunca arranca — movimiento automático es justo lo
// que esa preferencia pide evitar. Y siempre hay botón de pausa: contenido que
// se mueve solo tiene que poder pararse.
const AUTO_MS = 5000

export function Carrusel({ images, alt }: { images: string[]; alt: string }) {
  const [i, setI] = useState(0)
  const [auto, setAuto] = useState(true)
  const [enPausa, setEnPausa] = useState(false)
  const pista = useRef<HTMLDivElement>(null)
  const n = images.length

  // Un tick por render de índice: equivale a un setTimeout por foto, sin
  // arrastrar el intervalo cuando la persona navega a mano.
  useEffect(() => {
    if (!auto || enPausa || n < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = setTimeout(() => {
      const el = pista.current
      if (!el) return
      const siguiente = (i + 1) % n
      el.scrollTo({ left: siguiente * el.clientWidth, behavior: 'smooth' })
      setI(siguiente)
    }, AUTO_MS)
    return () => clearTimeout(t)
  }, [auto, enPausa, i, n])

  // Pestaña en segundo plano: no tiene sentido gastar el ciclo (ni la foto que
  // nadie ve) mientras la persona está en otra parte.
  useEffect(() => {
    const alCambiar = () => setEnPausa(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', alCambiar)
    alCambiar()
    return () => document.removeEventListener('visibilitychange', alCambiar)
  }, [])

  if (n === 0) {
    return (
      <div className="mt-4 flex aspect-[2/1] w-full items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary/60">
        <BrandMark className="size-14" />
      </div>
    )
  }

  const idx = Math.min(i, n - 1)
  const irA = (j: number) => {
    const el = pista.current
    if (!el) return
    const k = (j + n) % n
    el.scrollTo({ left: k * el.clientWidth, behavior: 'smooth' })
    setI(k)
  }
  /** Navegación explícita: gana la intención del usuario y el auto se apaga. */
  const irAManual = (j: number) => {
    setAuto(false)
    irA(j)
  }
  const onScroll = () => {
    const el = pista.current
    if (el) setI(Math.round(el.scrollLeft / el.clientWidth))
  }

  return (
    <div className="mt-4">
      <div
        className="relative aspect-[2/1] w-full overflow-hidden rounded-xl bg-muted"
        onPointerEnter={() => setEnPausa(true)}
        onPointerLeave={() => setEnPausa(false)}
        onFocusCapture={() => setEnPausa(true)}
        onBlurCapture={() => setEnPausa(false)}
      >
        <div
          ref={pista}
          onScroll={onScroll}
          className="flex h-full w-full snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {images.map((url, j) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={j}
              src={url}
              alt={j === 0 ? alt : `${alt} — foto ${j + 1}`}
              className="h-full w-full shrink-0 snap-center object-cover"
              // La primera foto es el LCP de la ficha; el resto puede esperar.
              fetchPriority={j === 0 ? 'high' : undefined}
              loading={j === 0 ? undefined : 'lazy'}
              decoding="async"
            />
          ))}
        </div>
        {n > 1 && (
          <>
            <button
              type="button"
              onClick={() => irAManual(idx - 1)}
              aria-label="Foto anterior"
              className="absolute left-2 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm transition-colors hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:flex"
            >
              <ChevronLeftIcon className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => irAManual(idx + 1)}
              aria-label="Foto siguiente"
              className="absolute right-2 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm transition-colors hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:flex"
            >
              <ChevronRightIcon className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => setAuto((v) => !v)}
              aria-label={auto ? 'Pausar el paso de fotos' : 'Reanudar el paso de fotos'}
              className="absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm transition-colors hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {auto ? <PauseIcon className="size-3.5" /> : <PlayIcon className="size-3.5" />}
            </button>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
              {images.map((_, j) => (
                <span
                  key={j}
                  className={cn('size-1.5 rounded-full transition-colors', j === idx ? 'bg-white' : 'bg-white/50')}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {n > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {images.map((url, j) => (
            <button
              key={j}
              type="button"
              onClick={() => irAManual(j)}
              aria-label={`Ver foto ${j + 1}`}
              aria-current={j === idx}
              className={cn(
                'h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 transition-opacity',
                j === idx ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
