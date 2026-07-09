'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { eliminarProveedor } from '../actions'

/**
 * Botón de borrado con confirmación en dos pasos dentro de la página
 * (sin confirm() del navegador).
 */
export function EliminarProveedor({ proveedorId }: { proveedorId: string }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      // En éxito la acción redirige a /proveedores; solo llega aquí con error.
      const result = await eliminarProveedor(proveedorId)
      if (result?.error) {
        setError(result.error)
        setConfirming(false)
      }
    })
  }

  return (
    <div className="space-y-3">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">¿Seguro?</span>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isPending}
          >
            {isPending ? 'Eliminando…' : 'Sí, eliminar'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirming(false)}
            disabled={isPending}
          >
            Cancelar
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => setConfirming(true)}
        >
          Eliminar proveedor
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
