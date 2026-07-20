'use client'

import { useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

// Carrusel ligero de fotos de la ficha (banner + galería). Sin dependencias:
// una imagen a la vez + flechas, puntos y tira de miniaturas cuando hay más de
// una. Con una sola foto se comporta como la imagen fija de antes.
export function Carrusel({ images, alt }: { images: string[]; alt: string }) {
  const [i, setI] = useState(0)
  const n = images.length
  if (n === 0) return null

  const idx = Math.min(i, n - 1)
  const go = (d: number) => setI((prev) => (prev + d + n) % n)

  return (
    <div className="mt-4">
      <div className="relative aspect-[2/1] w-full overflow-hidden rounded-xl bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[idx]}
          alt={alt}
          className="h-full w-full object-cover"
        />
        {n > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Foto anterior"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 text-foreground shadow-sm transition-colors hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ChevronLeftIcon className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Foto siguiente"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 text-foreground shadow-sm transition-colors hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ChevronRightIcon className="size-5" />
            </button>
            <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
              {images.map((_, j) => (
                <span
                  key={j}
                  className={cn(
                    'size-1.5 rounded-full',
                    j === idx ? 'bg-white' : 'bg-white/50'
                  )}
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
              onClick={() => setI(j)}
              aria-label={`Ver foto ${j + 1}`}
              aria-current={j === idx}
              className={cn(
                'h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 transition-opacity',
                j === idx
                  ? 'border-primary'
                  : 'border-transparent opacity-70 hover:opacity-100'
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
