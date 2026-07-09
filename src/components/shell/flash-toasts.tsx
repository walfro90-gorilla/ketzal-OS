'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

// Toasts de éxito tras un redirect de server-action: la acción redirige con
// `?ok=<código>` y aquí lo mostramos y limpiamos el param para que no se repita.
// Contrato para el backend: al redirigir tras crear/actualizar, añadir `?ok=<código>`.
const MESSAGES: Record<string, string> = {
  'venta-creada': 'Venta guardada',
  'cotizacion-creada': 'Cotización guardada',
  'cliente-creado': 'Cliente guardado',
  'servicio-creado': 'Servicio guardado',
  'servicio-eliminado': 'Servicio eliminado',
  'proveedor-creado': 'Proveedor guardado',
  'proveedor-eliminado': 'Proveedor eliminado',
  'abono-registrado': 'Abono registrado',
  'venta-cancelada': 'Venta cancelada',
  guardado: 'Cambios guardados',
}

export function FlashToasts() {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const ok = params.get('ok')
    if (!ok) return
    toast.success(MESSAGES[ok] ?? 'Listo')
    const next = new URLSearchParams(params)
    next.delete('ok')
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [params, pathname, router])

  return null
}
