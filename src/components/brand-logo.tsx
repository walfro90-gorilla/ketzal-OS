'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BrandMark } from '@/components/brand-mark'
import { cn } from '@/lib/utils'

/**
 * Logo oficial para contextos CLIENTE/anónimos (login, etc.): lee la URL con el
 * RPC público `get_brand_logo` y muestra el `<img>`; mientras tanto (o si no hay
 * logo) cae a la marca SVG. En contextos server pásale la URL a mano (ver el
 * header en app-shell) para evitar el swap.
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
        className={cn('size-6 object-contain', className)}
      />
    )
  }
  return <BrandMark className={cn('size-6 text-primary', className)} />
}
