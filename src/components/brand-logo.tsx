'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BrandMark } from '@/components/brand-mark'
import { cn } from '@/lib/utils'

/**
 * Marca completa para contextos CLIENTE/anónimos (login, recuperación…): lee la
 * URL con el RPC público `get_brand_logo`. Si hay logo oficial, lo muestra solo
 * (es el wordmark completo → más grande, sin el texto "Ketzal OS"). Si no, cae
 * al símbolo SVG + "Ketzal OS". En contextos server pásale la URL a mano (ver
 * el header en app-shell) para evitar el swap.
 */
export function BrandLogo({ className }: { className?: string }) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    createClient()
      .rpc('get_brand_logo' as never)
      .then(({ data }) => {
        if (alive && typeof data === 'string' && data) setUrl(data)
      })
    return () => {
      alive = false
    }
  }, [])

  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={url}
        alt="Ketzal"
        className={cn('h-9 w-auto max-w-[180px] object-contain', className)}
      />
    )
  }
  return (
    <span className="inline-flex items-center gap-2">
      <BrandMark className="size-6 text-primary" />
      <span>
        <span className="text-primary">Ketzal</span>{' '}
        <span className="text-foreground">OS</span>
      </span>
    </span>
  )
}
