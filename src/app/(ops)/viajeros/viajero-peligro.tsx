'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { eliminarViajero } from './actions'

// Botón de borrado del detalle: confirma, bloquea si tiene compras y, en éxito,
// regresa a la lista. El borrado real (auth + cascada) lo hace la server action.
export function ViajeroPeligro({
  id,
  nombre,
  numCompras,
}: {
  id: string
  nombre: string
  numCompras: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onClick() {
    if (numCompras > 0) {
      toast.error(
        `No se puede eliminar: ${nombre} tiene ${numCompras} compra(s) registrada(s).`
      )
      return
    }
    if (
      !window.confirm(
        `¿Eliminar a ${nombre}? Se borra su cuenta de comprador. Esta acción no se puede deshacer.`
      )
    )
      return
    startTransition(async () => {
      const res = await eliminarViajero(id)
      if ('error' in res) {
        toast.error(res.error)
      } else {
        toast.success('Viajero eliminado')
        router.push('/viajeros')
        router.refresh()
      }
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      disabled={isPending || numCompras > 0}
      className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2Icon className="size-4" />
      {isPending ? 'Eliminando…' : 'Eliminar viajero'}
    </Button>
  )
}
