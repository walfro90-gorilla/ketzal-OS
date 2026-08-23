'use client'

import { useRef, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BrandMark } from '@/components/brand-mark'

// Carrusel ligero de fotos de la ficha (banner + galería). Sin dependencias.
// Móvil: pista con scroll-snap → swipe nativo que funciona antes de hidratar;
// el JS sólo sigue el índice (puntos, miniatura activa) y mueve la pista desde
// flechas/miniaturas. Flechas sólo en md+ (en el teléfono las sustituye el
// gesto). Con una sola foto se comporta como la imagen fija de antes.
export function Carrusel({ images, alt }: { images: string[]; alt: string }) {
  const [i, setI] = useState(0)
  const pista = useRef<HTMLDivElement>(null)
  const n = images.length
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
  const onScroll = () => {
    const el = pista.current
    if (el) setI(Math.round(el.scrollLeft / el.clientWidth))
  }

  return (
    <div className="mt-4">
      <div className="relative aspect-[2/1] w-full overflow-hidden rounded-xl bg-muted">
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
              onClick={() => irA(idx - 1)}
              aria-label="Foto anterior"
              className="absolute left-2 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm transition-colors hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:flex"
            >
              <ChevronLeftIcon className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => irA(idx + 1)}
              aria-label="Foto siguiente"
              className="absolute right-2 top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm transition-colors hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:flex"
            >
              <ChevronRightIcon className="size-5" />
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
              onClick={() => irA(j)}
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
